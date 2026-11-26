import { useEffect, useRef, useState } from 'react'
import type { ProjectSaveStatus } from './useProjectManager'
import type { ProjectSummary } from './projectRepository'
import { DOCUMENT_PRESETS } from '../editor/documentPresets'
import { Icon } from '../editor/components/Icon'
import { ThemeToggle, type AppTheme } from '../shared/ThemeToggle'
import './ProjectDashboard.css'

type ProjectDashboardProps = {
  projects: ProjectSummary[]
  saveStatus: ProjectSaveStatus
  error: string
  theme: AppTheme
  onToggleTheme: () => void
  onCreate: (name: string, width: number, height: number) => Promise<void>
  onOpen: (id: string) => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
  onDuplicate: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onExport: (id: string) => Promise<void>
  onImport: (file: File) => Promise<void>
}

function ProjectThumbnail({ image }: { image: Blob | null }) {
  const imageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (!image || !imageRef.current) return
    const element = imageRef.current
    const objectUrl = URL.createObjectURL(image)
    element.src = objectUrl
    return () => {
      URL.revokeObjectURL(objectUrl)
      element.removeAttribute('src')
    }
  }, [image])

  if (!image) return <div className="project-thumbnail-empty"><Icon name="spark" size={24} /></div>
  return <img ref={imageRef} className="project-thumbnail" alt="Miniatura del proyecto" />
}

function formatModifiedDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible'
  return new Intl.DateTimeFormat('es', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function ProjectDashboard({
  projects,
  saveStatus,
  error,
  theme,
  onToggleTheme,
  onCreate,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onExport,
  onImport,
}: ProjectDashboardProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [format, setFormat] = useState('1080x1080')
  const [width, setWidth] = useState(900)
  const [height, setHeight] = useState(1125)
  const [name, setName] = useState('Diseño sin título')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [actionError, setActionError] = useState('')
  const importInputRef = useRef<HTMLInputElement>(null)

  const runAction = async (action: () => Promise<void>) => {
    setActionError('')
    try {
      await action()
    } catch (actionFailure) {
      setActionError(
        actionFailure instanceof Error
          ? actionFailure.message
          : 'No se pudo completar la operación.',
      )
    }
  }

  const createProject = () => {
    let dimensions = { width, height }
    if (format !== 'custom') {
      const preset = DOCUMENT_PRESETS.find(
        (item) => `${item.width}x${item.height}` === format,
      )
      if (!preset) {
        setActionError('Selecciona un formato de documento válido.')
        return
      }
      dimensions = { width: preset.width, height: preset.height }
    } else if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 100 ||
      height < 100 ||
      width > 5000 ||
      height > 5000
    ) {
      setActionError('Usa dimensiones enteras entre 100 y 5000 px.')
      return
    }

    void runAction(async () => {
      await onCreate(name.trim() || 'Diseño sin título', dimensions.width, dimensions.height)
      setShowCreate(false)
      setName('Diseño sin título')
    })
  }

  const beginRename = (project: ProjectSummary) => {
    setEditingId(project.id)
    setEditingName(project.name)
  }

  const saveRename = (id: string) => {
    void runAction(async () => {
      await onRename(id, editingName)
      setEditingId(null)
    })
  }

  const handleDelete = (project: ProjectSummary) => {
    if (!window.confirm(`¿Eliminar «${project.name}»? Esta acción no se puede deshacer.`)) return
    void runAction(() => onDelete(project.id))
  }

  return (
    <main className={`dashboard-shell${theme === 'dark' ? ' theme-dark' : ''}`}>
      <header className="dashboard-topbar">
        <div className="dashboard-brand">
          <span className="brand-mark"><Icon name="spark" size={20} /></span>
          <span className="brand-name">creative<span>lab</span></span>
          <span className="brand-credit">Ángel Pantoja Cano <span aria-label="corazón">❤️</span> 2026</span>
        </div>
        <div className="dashboard-topbar-actions">
          <div className={`dashboard-storage dashboard-storage-${saveStatus}`}>
            <span />
            {saveStatus === 'loading' ? 'Cargando proyectos' :
              saveStatus === 'error' ? 'Almacenamiento no disponible' : 'Guardado local'}
          </div>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </header>

      <section className="dashboard-content">
        <div className="dashboard-heading">
          <div>
            <span className="eyebrow">ESTUDIO PERSONAL</span>
            <h1>Tus proyectos</h1>
            <p>Todos tus diseños, guardados localmente en este dispositivo.</p>
          </div>
          <div className="dashboard-actions">
            <button
              className="dashboard-secondary-button"
              type="button"
              onClick={() => importInputRef.current?.click()}
            >
              Importar proyecto
            </button>
            <input
              ref={importInputRef}
              className="visually-hidden"
              type="file"
              accept=".clab,application/zip,application/vnd.creative-lab.project+zip"
              aria-label="Seleccionar proyecto Creative Lab para importar"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                if (file) void runAction(() => onImport(file))
                event.currentTarget.value = ''
              }}
            />
            <button
              className="dashboard-primary-button"
              type="button"
              onClick={() => setShowCreate(true)}
            >
              <span>＋</span> Nuevo diseño
            </button>
          </div>
        </div>

        {(error || actionError) && (
          <div className="dashboard-error" role="alert">{actionError || error}</div>
        )}

        {projects.length === 0 ? (
          <section className="dashboard-empty">
            <div className="dashboard-empty-mark"><Icon name="spark" size={28} /></div>
            <h2>Tu espacio creativo empieza aquí</h2>
            <p>Crea un lienzo en blanco y tus proyectos se guardarán en este dispositivo.</p>
            <button className="dashboard-primary-button" type="button" onClick={() => setShowCreate(true)}>
              Nuevo diseño
            </button>
          </section>
        ) : (
          <section className="project-grid" aria-label="Proyectos guardados">
            {projects.map((project) => (
              <article className="project-card" key={project.id}>
                <button
                  className="project-preview-button"
                  type="button"
                  aria-label={`Abrir ${project.name}`}
                  onClick={() => void runAction(() => onOpen(project.id))}
                >
                  <ProjectThumbnail image={project.thumbnail} />
                  <span className="project-preview-open">Abrir proyecto</span>
                </button>
                <div className="project-card-body">
                  {editingId === project.id ? (
                    <div className="project-rename">
                      <input
                        aria-label="Nombre del proyecto"
                        autoFocus
                        value={editingName}
                        onChange={(event) => setEditingName(event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') saveRename(project.id)
                          if (event.key === 'Escape') setEditingId(null)
                        }}
                      />
                      <button type="button" onClick={() => saveRename(project.id)}>Guardar</button>
                      <button type="button" onClick={() => setEditingId(null)}>Cancelar</button>
                    </div>
                  ) : (
                    <>
                      <h2>{project.name}</h2>
                      <p className="project-modified">
                        Modificado {formatModifiedDate(project.modifiedAt)}
                      </p>
                    </>
                  )}
                  <div className="project-card-meta">
                    <span>{project.width} × {project.height} px</span>
                    <div className="project-card-actions">
                      <button type="button" onClick={() => void runAction(() => onOpen(project.id))}>Abrir</button>
                      <button type="button" onClick={() => beginRename(project)}>Renombrar</button>
                      <button type="button" onClick={() => void runAction(() => onDuplicate(project.id))}>Duplicar</button>
                      <button type="button" onClick={() => void runAction(() => onExport(project.id))}>Exportar</button>
                      <button
                        className="project-delete-action"
                        type="button"
                        onClick={() => handleDelete(project)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </section>

      {showCreate && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowCreate(false)
        }}>
          <section className="create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-title">
            <div className="create-dialog-heading">
              <div>
                <span className="eyebrow">NUEVO PROYECTO</span>
                <h2 id="create-title">Crear un diseño en blanco</h2>
              </div>
              <button type="button" aria-label="Cerrar" onClick={() => setShowCreate(false)}>×</button>
            </div>
            <label>
              Nombre del proyecto
              <input value={name} onChange={(event) => setName(event.currentTarget.value)} />
            </label>
            <label>
              Formato
              <select value={format} onChange={(event) => setFormat(event.currentTarget.value)}>
                {DOCUMENT_PRESETS.map((item) => (
                  <option key={item.name} value={`${item.width}x${item.height}`}>{item.name}</option>
                ))}
                <option value="custom">Dimensiones personalizadas</option>
              </select>
            </label>
            {format === 'custom' && (
              <div className="create-size-fields">
                <label>Ancho (px)<input type="number" min={100} max={5000} value={width} onChange={(event) => setWidth(Number(event.currentTarget.value))} /></label>
                <label>Alto (px)<input type="number" min={100} max={5000} value={height} onChange={(event) => setHeight(Number(event.currentTarget.value))} /></label>
              </div>
            )}
            {actionError && <p className="create-dialog-error" role="alert">{actionError}</p>}
            <div className="create-dialog-actions">
              <button className="dashboard-secondary-button" type="button" onClick={() => setShowCreate(false)}>
                Cancelar
              </button>
              <button className="dashboard-primary-button" type="button" onClick={createProject}>
                Crear diseño
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
