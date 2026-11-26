import type {
  DesignDocument,
  DesignElement,
  DesignElementBase,
} from './designDocument'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`El proyecto contiene un ${label} no válido.`)
  }
}

function requireFinite(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`El proyecto contiene un valor no válido para ${label}.`)
  }
}

function validateBase(element: Record<string, unknown>, ids: Set<string>) {
  requireString(element.id, 'identificador de elemento')
  requireString(element.name, 'nombre de elemento')
  if (ids.has(element.id as string)) {
    throw new Error('El proyecto contiene identificadores de elemento duplicados.')
  }
  ids.add(element.id as string)
  if (!Number.isInteger(element.order) || (element.order as number) < 0) {
    throw new Error('El proyecto contiene un orden de capa no válido.')
  }
  if (typeof element.visible !== 'boolean' || typeof element.locked !== 'boolean') {
    throw new Error('El proyecto contiene propiedades de capa no válidas.')
  }
  requireFinite(element.opacity, 'opacidad')
  if ((element.opacity as number) < 0 || (element.opacity as number) > 1) {
    throw new Error('El proyecto contiene una opacidad fuera de rango.')
  }
  if (!isRecord(element.transform)) {
    throw new Error('El proyecto contiene una transformación no válida.')
  }
  for (const key of ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'skewX', 'skewY']) {
    requireFinite(element.transform[key], `transformación ${key}`)
  }
  if (typeof element.transform.flipX !== 'boolean' || typeof element.transform.flipY !== 'boolean') {
    throw new Error('El proyecto contiene una inversión de objeto no válida.')
  }
}

function validateElement(value: unknown, ids: Set<string>, resourceIds: Set<string>): value is DesignElement {
  if (!isRecord(value)) throw new Error('El proyecto contiene un elemento mal formado.')
  validateBase(value as Record<string, unknown>, ids)
  switch (value.type) {
    case 'text':
      requireString(value.text, 'texto')
      requireFinite(value.width, 'ancho del texto')
      if (!isRecord(value.style)) throw new Error('El proyecto contiene estilos de texto no válidos.')
      requireString(value.style.fontFamily, 'familia tipográfica')
      requireFinite(value.style.fontSize, 'tamaño tipográfico')
      requireFinite(value.style.lineHeight, 'interlineado')
      requireFinite(value.style.letterSpacing, 'espaciado entre letras')
      if (value.style.fontStyle !== 'normal' && value.style.fontStyle !== 'italic') {
        throw new Error('El estilo tipográfico no es válido.')
      }
      if (
        typeof value.style.textAlign !== 'string' ||
        !['left', 'center', 'right', 'justify'].includes(value.style.textAlign)
      ) {
        throw new Error('La alineación tipográfica no es válida.')
      }
      if (typeof value.style.underline !== 'boolean') throw new Error('El subrayado no es válido.')
      return true
    case 'shape':
    case 'vector':
      requireString(value.geometry ?? value.pathData, 'geometría')
      requireFinite(value.width, 'ancho de forma')
      requireFinite(value.height, 'alto de forma')
      if (!isRecord(value.style)) throw new Error('El proyecto contiene estilos de forma no válidos.')
      return true
    case 'image':
      requireString(value.resourceId, 'recurso de imagen')
      if (!resourceIds.has(value.resourceId)) {
        throw new Error(`Falta el recurso de imagen "${value.resourceId}".`)
      }
      requireFinite(value.width, 'ancho de imagen')
      requireFinite(value.height, 'alto de imagen')
      if (!isRecord(value.crop)) throw new Error('El recorte de imagen no es válido.')
      requireFinite(value.crop.x, 'recorte horizontal')
      requireFinite(value.crop.y, 'recorte vertical')
      return true
    case 'group':
      if (!Array.isArray(value.children)) throw new Error('El grupo contiene elementos no válidos.')
      value.children.forEach((child) => validateElement(child, ids, resourceIds))
      return true
    case 'mask':
      requireString(value.targetId, 'destino de máscara')
      if (value.mode !== 'alpha' && value.mode !== 'clip') {
        throw new Error('El modo de máscara no es válido.')
      }
      if (!isRecord(value.data)) throw new Error('Los datos de máscara no son válidos.')
      return true
    case 'adjustment':
      requireString(value.adjustment, 'tipo de ajuste')
      if (!isRecord(value.parameters)) throw new Error('Los parámetros de ajuste no son válidos.')
      return true
    case 'effect':
      requireString(value.effect, 'tipo de efecto')
      if (!isRecord(value.parameters)) throw new Error('Los parámetros de efecto no son válidos.')
      return true
    default:
      throw new Error('El proyecto contiene un tipo de elemento no compatible.')
  }
}

export function parseDesignDocument(value: unknown): DesignDocument {
  if (!isRecord(value)) throw new Error('El archivo no contiene un documento válido.')
  if (value.schemaVersion !== 1) throw new Error('La versión del proyecto no es compatible.')
  requireString(value.id, 'identificador de proyecto')
  requireString(value.name, 'nombre de proyecto')
  if (!isRecord(value.dimensions)) throw new Error('Las dimensiones del proyecto no son válidas.')
  for (const key of ['width', 'height']) {
    requireFinite(value.dimensions[key], `dimensión ${key}`)
    if ((value.dimensions[key] as number) < 100 || (value.dimensions[key] as number) > 5000) {
      throw new Error('El proyecto contiene dimensiones fuera del rango permitido.')
    }
  }
  if (!isRecord(value.background) || typeof value.background.color !== 'string') {
    throw new Error('El fondo del proyecto no es válido.')
  }
  if (!Array.isArray(value.resources) || !Array.isArray(value.elements) || !Array.isArray(value.layers)) {
    throw new Error('El proyecto no contiene sus elementos, capas o recursos.')
  }
  const resourceIds = new Set<string>()
  for (const resource of value.resources) {
    if (!isRecord(resource)) throw new Error('El proyecto contiene un recurso mal formado.')
    requireString(resource.id, 'identificador de recurso')
    requireString(resource.name, 'nombre de recurso')
    requireString(resource.mediaType, 'tipo de recurso')
    if (resourceIds.has(resource.id as string)) {
      throw new Error('El proyecto contiene identificadores de recurso duplicados.')
    }
    resourceIds.add(resource.id as string)
  }
  const elementIds = new Set<string>()
  value.elements.forEach((element) => validateElement(element, elementIds, resourceIds))
  const layerIds = new Set<string>()
  for (const layer of value.layers) {
    if (!isRecord(layer)) throw new Error('El proyecto contiene una capa mal formada.')
    requireString(layer.id, 'identificador de capa')
    if (layerIds.has(layer.id as string)) throw new Error('El proyecto contiene capas duplicadas.')
    layerIds.add(layer.id as string)
    if (!Array.isArray(layer.elementIds) || !layer.elementIds.every((id) => elementIds.has(id))) {
      throw new Error('Una capa hace referencia a elementos inexistentes.')
    }
  }
  if (!isRecord(value.metadata)) throw new Error('Los metadatos del proyecto no son válidos.')
  requireString(value.metadata.createdAt, 'fecha de creación')
  requireString(value.metadata.modifiedAt, 'fecha de modificación')
  if (value.metadata.application !== 'Creative Lab') {
    throw new Error('El archivo no es un proyecto de Creative Lab.')
  }
  return value as unknown as DesignDocument
}

export function updateDocumentName(document: DesignDocument, name: string): DesignDocument {
  const trimmedName = name.trim()
  if (!trimmedName) throw new Error('El nombre del proyecto no puede estar vacío.')
  return {
    ...document,
    name: trimmedName,
    metadata: { ...document.metadata, modifiedAt: new Date().toISOString() },
  }
}

export function cloneProjectDocument(document: DesignDocument): DesignDocument {
  const now = new Date().toISOString()
  return {
    ...structuredClone(document),
    id: crypto.randomUUID(),
    name: `${document.name} copia`,
    metadata: {
      ...document.metadata,
      createdAt: now,
      modifiedAt: now,
    },
  }
}

export type { DesignElementBase }
