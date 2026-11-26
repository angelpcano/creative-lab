import { useCallback, useEffect, useRef, useState } from 'react'
import {
  cloneProjectDocument,
  updateDocumentName,
} from '../domain/documentValidation'
import { createDesignDocument, type DesignDocument } from '../domain/designDocument'
import { dataUrlToBlob } from '../shared/blobUtils'
import {
  projectRepository,
  type ProjectRecord,
  type ProjectSummary,
  type StoredProjectResource,
} from './projectRepository'
import { exportProjectPackage, importProjectPackage } from './projectPackage'

export type ProjectSaveStatus = 'loading' | 'idle' | 'saving' | 'saved' | 'error'

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Error desconocido de almacenamiento.'
}

function markResourcesStored(document: DesignDocument): DesignDocument {
  return {
    ...document,
    resources: document.resources.map((resource) => ({
      ...resource,
      storage: 'indexed-db',
      storageKey: resource.id,
    })),
  }
}

export function useProjectManager() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [activeProject, setActiveProject] = useState<ProjectRecord | null>(null)
  const [saveStatus, setSaveStatus] = useState<ProjectSaveStatus>('loading')
  const [error, setError] = useState('')
  const activeProjectRef = useRef<ProjectRecord | null>(null)
  const resourceMapRef = useRef(new Map<string, StoredProjectResource>())
  const pendingSaveRef = useRef<ProjectRecord | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())

  const setActive = useCallback((record: ProjectRecord | null) => {
    activeProjectRef.current = record
    setActiveProject(record)
    resourceMapRef.current = new Map(
      (record?.resources ?? []).map((resource) => [resource.id, resource]),
    )
  }, [])

  const refreshProjects = useCallback(async () => {
    const records = await projectRepository.list()
    setProjects(records)
    return records
  }, [])

  useEffect(() => {
    let active = true
    projectRepository.list().then((records) => {
      if (!active) return
      setProjects(records)
      setSaveStatus('idle')
    }).catch((loadError: unknown) => {
      if (!active) return
      setError(getErrorMessage(loadError))
      setSaveStatus('error')
    })
    return () => {
      active = false
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const flushAutosave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const record = pendingSaveRef.current
    if (!record) {
      await saveQueueRef.current
      return
    }
    pendingSaveRef.current = null
    const task = saveQueueRef.current
      .catch(() => undefined)
      .then(() => projectRepository.save(record))
    saveQueueRef.current = task.then(
      () => undefined,
      () => undefined,
    )
    try {
      await task
      if (activeProjectRef.current?.document.id === record.document.id) {
        activeProjectRef.current = record
        setActiveProject(record)
        setSaveStatus('saved')
        setError('')
      }
      await refreshProjects()
    } catch (saveError) {
      pendingSaveRef.current = record
      if (activeProjectRef.current?.document.id === record.document.id) {
        setSaveStatus('error')
        setError(getErrorMessage(saveError))
      }
      throw saveError
    }
  }, [refreshProjects])

  useEffect(() => {
    const handlePageHide = () => {
      if (pendingSaveRef.current) {
        void flushAutosave().catch(() => undefined)
      }
    }
    window.addEventListener('pagehide', handlePageHide)
    return () => window.removeEventListener('pagehide', handlePageHide)
  }, [flushAutosave])

  const scheduleAutosave = useCallback((document: DesignDocument, thumbnailDataUrl: string) => {
    const current = activeProjectRef.current
    if (!current || current.document.id !== document.id) return
    let thumbnail: Blob
    try {
      thumbnail = dataUrlToBlob(thumbnailDataUrl)
    } catch (conversionError) {
      setSaveStatus('error')
      setError(getErrorMessage(conversionError))
      return
    }
    const storedDocument = markResourcesStored(document)
    const resources = storedDocument.resources.flatMap((resource) => {
      const stored = resourceMapRef.current.get(resource.id)
      return stored ? [stored] : []
    })
    const record: ProjectRecord = {
      document: storedDocument,
      thumbnail,
      resources,
      savedAt: new Date().toISOString(),
    }
    activeProjectRef.current = record
    pendingSaveRef.current = record
    setSaveStatus('saving')
    setError('')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void flushAutosave().catch(() => undefined)
    }, 500)
  }, [flushAutosave])

  const addImportedResource = useCallback((resource: StoredProjectResource) => {
    resourceMapRef.current.set(resource.id, resource)
  }, [])

  const createProject = useCallback(async (
    width: number,
    height: number,
    name = 'Diseño sin título',
  ) => {
    const document = createDesignDocument()
    const now = new Date().toISOString()
    const trimmedName = name.trim() || 'Diseño sin título'
    const record: ProjectRecord = {
      document: {
        ...document,
        name: trimmedName,
        dimensions: { width, height },
        metadata: { ...document.metadata, modifiedAt: now },
      },
      thumbnail: null,
      resources: [],
      savedAt: now,
    }
    setError('')
    await projectRepository.save(record)
    await refreshProjects()
    setActive(record)
    setSaveStatus('saved')
    return record
  }, [refreshProjects, setActive])

  const openProject = useCallback(async (id: string) => {
    await flushAutosave()
    const record = await projectRepository.get(id)
    if (!record) throw new Error('No se encontró el proyecto solicitado.')
    setActive(record)
    setSaveStatus('saved')
    setError('')
    return record
  }, [flushAutosave, setActive])

  const closeProject = useCallback(async () => {
    await flushAutosave()
    setActive(null)
    setSaveStatus('idle')
    setError('')
  }, [flushAutosave, setActive])

  const renameProject = useCallback(async (id: string, name: string) => {
    if (activeProjectRef.current?.document.id === id) await flushAutosave()
    const record = await projectRepository.get(id)
    if (!record) throw new Error('No se encontró el proyecto solicitado.')
    const updated: ProjectRecord = {
      ...record,
      document: updateDocumentName(record.document, name),
      savedAt: new Date().toISOString(),
    }
    await projectRepository.save(updated)
    await refreshProjects()
    if (activeProjectRef.current?.document.id === id) {
      setActive(updated)
      setSaveStatus('saved')
    }
  }, [flushAutosave, refreshProjects, setActive])

  const duplicateProject = useCallback(async (id: string) => {
    const record = await projectRepository.get(id)
    if (!record) throw new Error('No se encontró el proyecto que se quiere duplicar.')
    const duplicate: ProjectRecord = {
      ...record,
      document: cloneProjectDocument(record.document),
      resources: record.resources.map((resource) => ({ ...resource })),
      savedAt: new Date().toISOString(),
    }
    await projectRepository.save(duplicate)
    await refreshProjects()
    return duplicate
  }, [refreshProjects])

  const deleteProject = useCallback(async (id: string) => {
    if (activeProjectRef.current?.document.id === id) await flushAutosave()
    await projectRepository.delete(id)
    await refreshProjects()
    if (activeProjectRef.current?.document.id === id) {
      setActive(null)
      setSaveStatus('idle')
    }
  }, [flushAutosave, refreshProjects, setActive])

  const importProject = useCallback(async (record: ProjectRecord) => {
    let imported = record
    if (await projectRepository.get(record.document.id)) {
      imported = {
        ...record,
        document: {
          ...record.document,
          id: crypto.randomUUID(),
          name: `${record.document.name} (importado)`,
        },
      }
    }
    await projectRepository.save(imported)
    await refreshProjects()
    return imported
  }, [refreshProjects])

  const exportPackage = useCallback(async (id: string) => {
    const record = activeProjectRef.current?.document.id === id
      ? activeProjectRef.current
      : await projectRepository.get(id)
    if (!record) throw new Error('No se encontró el proyecto que se quiere exportar.')
    return exportProjectPackage(record)
  }, [])

  const importPackage = useCallback(async (file: File) => {
    const record = await importProjectPackage(file)
    return importProject(record)
  }, [importProject])

  return {
    projects,
    activeProject,
    saveStatus,
    error,
    createProject,
    openProject,
    closeProject,
    renameProject,
    duplicateProject,
    deleteProject,
    importProject,
    exportPackage,
    importPackage,
    scheduleAutosave,
    addImportedResource,
    flushAutosave,
    refreshProjects,
  }
}
