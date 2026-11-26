export const DESIGN_DOCUMENT_VERSION = 1 as const

export type DesignTransform = {
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
  skewX: number
  skewY: number
  flipX: boolean
  flipY: boolean
}

export type ElementStyle = {
  fill: string | null
  stroke: string | null
  strokeWidth: number
}

export type DesignElementBase = {
  id: string
  name: string
  order: number
  visible: boolean
  locked: boolean
  opacity: number
  transform: DesignTransform
}

export type TextDesignElement = DesignElementBase & {
  type: 'text'
  text: string
  width: number
  style: ElementStyle & {
    fontFamily: string
    fontSize: number
    fontWeight: number | string
    fontStyle: 'normal' | 'italic'
    textAlign: 'left' | 'center' | 'right' | 'justify'
    lineHeight: number
    letterSpacing: number
    underline: boolean
  }
}

export type ShapeDesignElement = DesignElementBase & {
  type: 'shape'
  geometry: string
  width: number
  height: number
  style: ElementStyle
}

export type ImageDesignElement = DesignElementBase & {
  type: 'image'
  resourceId: string
  width: number
  height: number
  crop: { x: number; y: number }
}

export type GroupDesignElement = DesignElementBase & {
  type: 'group'
  children: DesignElement[]
}

export type VectorDesignElement = DesignElementBase & {
  type: 'vector'
  width: number
  height: number
  pathData: string
  style: ElementStyle
}

export type MaskDesignElement = DesignElementBase & {
  type: 'mask'
  targetId: string
  mode: 'alpha' | 'clip'
  data: Record<string, string | number | boolean | null>
}

export type AdjustmentDesignElement = DesignElementBase & {
  type: 'adjustment'
  adjustment: string
  parameters: Record<string, number>
}

export type EffectDesignElement = DesignElementBase & {
  type: 'effect'
  effect: string
  parameters: Record<string, string | number | boolean>
}

export type DesignElement =
  | TextDesignElement
  | ShapeDesignElement
  | ImageDesignElement
  | GroupDesignElement
  | VectorDesignElement
  | MaskDesignElement
  | AdjustmentDesignElement
  | EffectDesignElement

export type DesignResource = {
  id: string
  name: string
  mediaType: string
  storage: 'session-only' | 'indexed-db'
  storageKey?: string
}

export type DesignLayer = {
  id: string
  name: string
  elementIds: string[]
  order: number
  visible: boolean
  locked: boolean
}

export type DesignDocument = {
  schemaVersion: typeof DESIGN_DOCUMENT_VERSION
  id: string
  name: string
  dimensions: { width: number; height: number }
  background: { color: string }
  elements: DesignElement[]
  layers: DesignLayer[]
  resources: DesignResource[]
  metadata: {
    createdAt: string
    modifiedAt: string
    application: 'Creative Lab'
  }
}

export function createDesignDocument(): DesignDocument {
  const now = new Date().toISOString()
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `document-${Date.now()}-${Math.random().toString(36).slice(2)}`

  return {
    schemaVersion: DESIGN_DOCUMENT_VERSION,
    id,
    name: 'Diseño sin título',
    dimensions: { width: 900, height: 1125 },
    background: { color: '#fffefa' },
    elements: [],
    layers: [],
    resources: [],
    metadata: {
      createdAt: now,
      modifiedAt: now,
      application: 'Creative Lab',
    },
  }
}
