import type { DesignDocument } from '../../domain/designDocument'

export type EditorLayerType = 'Texto' | 'Imagen' | 'Forma' | 'Grupo' | 'Elemento'

export type EditorLayer = {
  id: string
  name: string
  type: EditorLayerType
  visible: boolean
  locked: boolean
  selected: boolean
}

export type SelectedElement = {
  id: string
  name: string
  type: EditorLayerType
  count: number
  x: number
  y: number
  width: number
  height: number
  angle: number
  opacity: number
  fill: string
  stroke: string
  strokeWidth: number
  fontFamily: string
  fontSize: number
  fontWeight: number
  fontStyle: string
  textAlign: string
  lineHeight: number
  letterSpacing: number
  underline: boolean
  cropX: number
  cropY: number
  sourceWidth: number
  sourceHeight: number
}

export type EditorState = {
  layers: EditorLayer[]
  selection: SelectedElement | null
  width: number
  height: number
  background: string
  zoom: number
  grid: boolean
  snapping: boolean
  canUndo: boolean
  canRedo: boolean
  canPaste: boolean
}

export type EditableProperty =
  | 'left'
  | 'top'
  | 'width'
  | 'height'
  | 'angle'
  | 'opacity'
  | 'fill'
  | 'stroke'
  | 'strokeWidth'
  | 'fontFamily'
  | 'fontSize'
  | 'fontWeight'
  | 'fontStyle'
  | 'textAlign'
  | 'lineHeight'
  | 'letterSpacing'
  | 'underline'

export interface EditorEngine {
  addText(): void
  addRectangle(): void
  addImage(file: File): Promise<void>
  deleteSelected(): void
  duplicateSelected(): Promise<void>
  copySelected(): Promise<void>
  paste(): Promise<void>
  groupSelected(): void
  ungroupSelected(): void
  undo(): Promise<void>
  redo(): Promise<void>
  exportPng(): string | undefined
  exportRaster(format: 'png' | 'jpeg', quality?: number): string | undefined
  exportSvg(): Promise<string | undefined>
  exportPdf(): Promise<Blob | undefined>
  exportThumbnail(): string | undefined
  getDesignDocument(): DesignDocument
  setSelectedProperty(property: EditableProperty, value: string | number | boolean): void
  setSelectedCrop(axis: 'x' | 'y', value: number): void
  setDocumentBackground(color: string): void
  resizeDocument(width: number, height: number): void
  setZoom(zoom: number): void
  fitToScreen(): void
  toggleGrid(): void
  toggleSnapping(): void
  selectLayer(id: string): void
  renameLayer(id: string, name: string): void
  reorderLayer(id: string, direction: -1 | 1): void
  toggleLayerVisibility(id: string): void
  toggleLayerLock(id: string): void
  deleteLayer(id: string): void
  alignSelection(alignment: string): void
  toggleSelectedLock(): void
}

export type EditorStateListener = (state: EditorState) => void
export type DesignDocumentListener = (document: DesignDocument, thumbnail: string) => void
export type EditorResource = {
  id: string
  name: string
  mediaType: string
  blob: Blob
}
export type ResourceImportListener = (resource: EditorResource) => void
