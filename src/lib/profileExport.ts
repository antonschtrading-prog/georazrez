import { PROFILE_SHEET_HEIGHT, PROFILE_SHEET_WIDTH, type CoreProfileDocument } from '@/lib/profileDocument'

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'геологический_профиль'
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function getSheetSvgs(host: HTMLElement): SVGSVGElement[] {
  return Array.from(host.querySelectorAll<SVGSVGElement>('svg[data-profile-sheet]'))
    .sort((a, b) => Number(a.dataset.profileSheet) - Number(b.dataset.profileSheet))
}

export function exportProfileSvg(host: HTMLElement, profile: CoreProfileDocument) {
  const sheets = getSheetSvgs(host)
  if (!sheets.length) throw new Error('Нет листов профиля для экспорта')
  const content = sheets.map((sheet, index) => `<svg x="0" y="${index * PROFILE_SHEET_HEIGHT}" width="${PROFILE_SHEET_WIDTH}" height="${PROFILE_SHEET_HEIGHT}" viewBox="0 0 ${PROFILE_SHEET_WIDTH} ${PROFILE_SHEET_HEIGHT}">${sheet.innerHTML}</svg>`).join('')
  const source = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${PROFILE_SHEET_WIDTH}" height="${PROFILE_SHEET_HEIGHT * sheets.length}" viewBox="0 0 ${PROFILE_SHEET_WIDTH} ${PROFILE_SHEET_HEIGHT * sheets.length}">${content}</svg>`
  downloadBlob(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }), `${safeFileName(profile.title)}_профиль.svg`)
}

async function rasterizeSheet(sheet: SVGSVGElement): Promise<Uint8Array> {
  const clone = sheet.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(PROFILE_SHEET_WIDTH))
  clone.setAttribute('height', String(PROFILE_SHEET_HEIGHT))
  const source = new XMLSerializer().serializeToString(clone)
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Браузер не смог подготовить лист SVG для PDF'))
      image.src = url
    })
    const scale = 1.5
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(PROFILE_SHEET_WIDTH * scale)
    canvas.height = Math.round(PROFILE_SHEET_HEIGHT * scale)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas недоступен для локального PDF-экспорта')
    context.fillStyle = '#FFFFFF'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Не удалось сформировать изображение листа')), 'image/png'))
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** PDF формируется только на устройстве: один векторный SVG-лист преобразуется в одну страницу A3. */
export async function exportProfilePdf(host: HTMLElement, profile: CoreProfileDocument) {
  const sheets = getSheetSvgs(host)
  if (!sheets.length) throw new Error('Нет листов профиля для экспорта')
  const { PDFDocument, PageSizes } = await import('pdf-lib')
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${profile.title} · инженерно-геологический разрез`)
  pdf.setCreator('ГеоРазрез 0.40')
  pdf.setProducer('Локальный экспорт ГеоРазрез')
  const [portraitWidth, portraitHeight] = PageSizes.A3
  for (const sheet of sheets) {
    const image = await pdf.embedPng(await rasterizeSheet(sheet))
    const page = pdf.addPage([portraitHeight, portraitWidth])
    page.drawImage(image, { x: 0, y: 0, width: portraitHeight, height: portraitWidth })
  }
  const bytes = await pdf.save()
  downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${safeFileName(profile.title)}_профиль.pdf`)
}
