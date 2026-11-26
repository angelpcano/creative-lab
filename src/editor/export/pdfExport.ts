import { jsPDF } from 'jspdf'

export function createDesignPdf(
  imageDataUrl: string,
  width: number,
  height: number,
): Blob {
  const pointsPerPixel = 72 / 96
  const pageWidth = width * pointsPerPixel
  const pageHeight = height * pointsPerPixel
  const pdf = new jsPDF({
    orientation: width > height ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [pageWidth, pageHeight],
    compress: true,
    precision: 16,
  })
  pdf.addImage(imageDataUrl, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST')
  return pdf.output('blob')
}
