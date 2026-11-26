import JSZip from 'jszip'
import { parseDesignDocument } from '../domain/documentValidation'
import type { DesignDocument } from '../domain/designDocument'
import type {
  ProjectRecord,
  StoredProjectResource,
} from './projectRepository'

const PACKAGE_FORMAT = 'creative-lab-project'
const PACKAGE_VERSION = 1
const MAX_PACKAGE_SIZE = 200 * 1024 * 1024
const MAX_RESOURCE_SIZE = 80 * 1024 * 1024
const MAX_RESOURCE_COUNT = 200

type PackageManifest = {
  format: typeof PACKAGE_FORMAT
  version: typeof PACKAGE_VERSION
  document: DesignDocument
  assets: Array<{ resourceId: string; path: string }>
}

function assertSafeResourceId(id: string) {
  if (!/^[\w.-]{1,128}$/.test(id)) {
    throw new Error('El proyecto contiene un identificador de recurso no válido.')
  }
}

export async function exportProjectPackage(record: ProjectRecord): Promise<Blob> {
  const document = parseDesignDocument(record.document)
  if (record.resources.length > MAX_RESOURCE_COUNT) {
    throw new Error('El proyecto contiene demasiados recursos para exportarse.')
  }
  const resourcesById = new Map(record.resources.map((resource) => [resource.id, resource]))
  const zip = new JSZip()
  const assets: PackageManifest['assets'] = []

  for (const resource of document.resources) {
    assertSafeResourceId(resource.id)
    const stored = resourcesById.get(resource.id)
    if (!stored) throw new Error(`No se encontró el recurso "${resource.name}".`)
    if (stored.blob.size > MAX_RESOURCE_SIZE) {
      throw new Error(`El recurso "${resource.name}" supera el tamaño permitido.`)
    }
    const path = `assets/${resource.id}`
    zip.file(path, stored.blob)
    assets.push({ resourceId: resource.id, path })
  }

  const manifest: PackageManifest = {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    document,
    assets,
  }
  zip.file('manifest.json', JSON.stringify(manifest))
  if (record.thumbnail) zip.file('thumbnail.png', record.thumbnail)

  const packageBlob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.creative-lab.project+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  if (packageBlob.size > MAX_PACKAGE_SIZE) {
    throw new Error('El proyecto supera el tamaño máximo del archivo portable.')
  }
  return packageBlob
}

export async function importProjectPackage(file: File): Promise<ProjectRecord> {
  if (file.size === 0 || file.size > MAX_PACKAGE_SIZE) {
    throw new Error('El archivo está vacío o supera el tamaño máximo de 200 MB.')
  }
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(file, { checkCRC32: true })
  } catch {
    throw new Error('El archivo no es un paquete Creative Lab válido o está dañado.')
  }

  const entryNames = Object.keys(zip.files)
  if (entryNames.length > MAX_RESOURCE_COUNT + 2) {
    throw new Error('El paquete contiene demasiados archivos.')
  }
  const manifestEntry = zip.file('manifest.json')
  if (!manifestEntry) throw new Error('El paquete no contiene manifest.json.')
  const manifestText = await manifestEntry.async('string')
  if (manifestText.length > 4 * 1024 * 1024) {
    throw new Error('Los metadatos del proyecto superan el tamaño permitido.')
  }

  let manifestValue: unknown
  try {
    manifestValue = JSON.parse(manifestText)
  } catch {
    throw new Error('Los metadatos del proyecto no contienen JSON válido.')
  }
  if (
    typeof manifestValue !== 'object' ||
    manifestValue === null ||
    !('format' in manifestValue) ||
    !('version' in manifestValue) ||
    !('document' in manifestValue) ||
    !('assets' in manifestValue)
  ) {
    throw new Error('El manifiesto del proyecto está incompleto.')
  }
  const candidate = manifestValue as Record<string, unknown>
  if (candidate.format !== PACKAGE_FORMAT || candidate.version !== PACKAGE_VERSION) {
    throw new Error('El formato o la versión del paquete no son compatibles.')
  }
  const document = parseDesignDocument(candidate.document)
  if (!Array.isArray(candidate.assets)) {
    throw new Error('La lista de recursos del paquete no es válida.')
  }
  if (candidate.assets.length !== document.resources.length) {
    throw new Error('El paquete no contiene todos los recursos del documento.')
  }

  const assetsById = new Map<string, string>()
  for (const asset of candidate.assets) {
    if (
      typeof asset !== 'object' ||
      asset === null ||
      !('resourceId' in asset) ||
      !('path' in asset) ||
      typeof asset.resourceId !== 'string' ||
      typeof asset.path !== 'string'
    ) {
      throw new Error('El manifiesto contiene una referencia de recurso no válida.')
    }
    assertSafeResourceId(asset.resourceId)
    if (asset.path !== `assets/${asset.resourceId}` || assetsById.has(asset.resourceId)) {
      throw new Error('El manifiesto contiene una ruta de recurso no válida.')
    }
    assetsById.set(asset.resourceId, asset.path)
  }

  const resources: StoredProjectResource[] = []
  let totalResourceSize = 0
  for (const resource of document.resources) {
    const path = assetsById.get(resource.id)
    const entry = path ? zip.file(path) : null
    if (!entry || entry.dir) throw new Error(`Falta el recurso "${resource.name}" en el paquete.`)
    const extractedBlob = await entry.async('blob')
    const blob = new Blob([extractedBlob], { type: resource.mediaType })
    totalResourceSize += blob.size
    if (blob.size > MAX_RESOURCE_SIZE || totalResourceSize > MAX_PACKAGE_SIZE) {
      throw new Error('Los recursos descomprimidos superan el tamaño permitido.')
    }
    resources.push({
      id: resource.id,
      name: resource.name,
      mediaType: resource.mediaType,
      blob,
    })
  }

  const thumbnailEntry = zip.file('thumbnail.png')
  const thumbnailBlob = thumbnailEntry ? await thumbnailEntry.async('blob') : null
  const thumbnail = thumbnailBlob
    ? new Blob([thumbnailBlob], { type: 'image/png' })
    : null
  return {
    document: {
      ...document,
      resources: document.resources.map((resource) => ({
        ...resource,
        storage: 'indexed-db',
        storageKey: resource.id,
      })),
    },
    thumbnail,
    resources,
    savedAt: new Date().toISOString(),
  }
}
