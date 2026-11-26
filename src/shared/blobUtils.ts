export function dataUrlToBlob(dataUrl: string) {
  const [header, encoded] = dataUrl.split(',', 2)
  if (!header || !encoded) throw new Error('No se pudo leer el contenido de imagen.')
  const mediaType = header.match(/^data:([^;]+)/)?.[1] ?? 'image/png'
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mediaType })
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('No se pudo leer un recurso de imagen.'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Falló la lectura del recurso.'))
    reader.readAsDataURL(blob)
  })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
