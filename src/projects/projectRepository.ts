import type { DesignDocument } from '../domain/designDocument'

const DATABASE_NAME = 'creative-lab'
const DATABASE_VERSION = 1
const PROJECT_STORE = 'projects'
const DOCUMENT_STORE = 'documents'

export type StoredProjectResource = {
  id: string
  name: string
  mediaType: string
  blob: Blob
}

export type ProjectRecord = {
  document: DesignDocument
  thumbnail: Blob | null
  resources: StoredProjectResource[]
  savedAt: string
}

export type ProjectSummary = {
  id: string
  name: string
  modifiedAt: string
  width: number
  height: number
  thumbnail: Blob | null
  savedAt: string
}

function openDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in globalThis)) {
    return Promise.reject(new Error('Este navegador no permite almacenamiento local IndexedDB.'))
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(PROJECT_STORE)) {
        database.createObjectStore(PROJECT_STORE, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(DOCUMENT_STORE)) {
        database.createObjectStore(DOCUMENT_STORE, { keyPath: 'document.id' })
      }
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => database.close()
      resolve(database)
    }
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir la base de datos.'))
    request.onblocked = () => reject(new Error('La base de datos está ocupada por otra pestaña.'))
  })
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Falló la transacción de almacenamiento.'))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Se canceló la operación de almacenamiento.'))
  })
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('No se pudo leer el almacenamiento local.'))
  })
}

export class ProjectRepository {
  private databasePromise: Promise<IDBDatabase> | null = null

  private getDatabase() {
    if (!this.databasePromise) {
      this.databasePromise = openDatabase().catch((error: unknown) => {
        this.databasePromise = null
        throw error
      })
    }
    return this.databasePromise
  }

  async list(): Promise<ProjectSummary[]> {
    const database = await this.getDatabase()
    const transaction = database.transaction(PROJECT_STORE, 'readonly')
    const done = transactionComplete(transaction)
    const records = await requestResult(
      transaction.objectStore(PROJECT_STORE).getAll() as IDBRequest<ProjectSummary[]>,
    )
    await done
    return records.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt))
  }

  async get(id: string): Promise<ProjectRecord | null> {
    const database = await this.getDatabase()
    const transaction = database.transaction(DOCUMENT_STORE, 'readonly')
    const done = transactionComplete(transaction)
    const record = await requestResult(
      transaction.objectStore(DOCUMENT_STORE).get(id) as IDBRequest<ProjectRecord | undefined>,
    )
    await done
    return record ?? null
  }

  async save(record: ProjectRecord): Promise<void> {
    const database = await this.getDatabase()
    const transaction = database.transaction(
      [PROJECT_STORE, DOCUMENT_STORE],
      'readwrite',
    )
    transaction.objectStore(DOCUMENT_STORE).put(record)
    transaction.objectStore(PROJECT_STORE).put({
      id: record.document.id,
      name: record.document.name,
      modifiedAt: record.document.metadata.modifiedAt,
      width: record.document.dimensions.width,
      height: record.document.dimensions.height,
      thumbnail: record.thumbnail,
      savedAt: record.savedAt,
    } satisfies ProjectSummary)
    await transactionComplete(transaction)
  }

  async delete(id: string): Promise<void> {
    const database = await this.getDatabase()
    const transaction = database.transaction(
      [PROJECT_STORE, DOCUMENT_STORE],
      'readwrite',
    )
    transaction.objectStore(PROJECT_STORE).delete(id)
    transaction.objectStore(DOCUMENT_STORE).delete(id)
    await transactionComplete(transaction)
  }
}

export const projectRepository = new ProjectRepository()
