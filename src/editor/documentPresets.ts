export type DocumentPreset = {
  name: string
  width: number
  height: number
}

export const DOCUMENT_PRESETS: DocumentPreset[] = [
  { name: 'Publicación vertical · 4:5', width: 1080, height: 1350 },
  { name: 'Publicación cuadrada · 1:1', width: 1080, height: 1080 },
  { name: 'Historia · 9:16', width: 1080, height: 1920 },
  { name: 'Horizontal · 1.91:1', width: 1200, height: 628 },
]
