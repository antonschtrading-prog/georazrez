import type ExcelJS from 'exceljs'
import { audit, axisXY } from './geologyEngine'
import { formatPk, getCodeSummary, getIgeKey, getLayerDepthIssue, getLayerThickness, type ActivityItem, type CodeStatus, type GeoProject } from '@/types/geology'

const exportStatus: Record<CodeStatus, string> = {
  topology: 'По границам DXF',
  'vertical-only': 'По положению кружка',
  ambiguous: 'Требует ручного выбора',
  'not-found': 'ИГЭ не найден',
  manual: 'Подтверждено вручную'
}

function numericCell(value: ExcelJS.CellValue): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value && typeof value === 'object' && 'result' in value) {
    const result = value.result
    if (typeof result === 'number' && Number.isFinite(result)) return result
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export async function readAxisWorkbook(file: File): Promise<number[][]> {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer() as any)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error('В Excel-файле нет листов')
  const axis: number[][] = []
  sheet.eachRow(row => {
    const pk = numericCell(row.getCell(2).value)
    const x = numericCell(row.getCell(3).value)
    const y = numericCell(row.getCell(4).value)
    if (pk !== null && x !== null && y !== null) axis.push([pk, x, y])
  })
  if (axis.length < 2) throw new Error('Не удалось найти координаты: нужны столбцы B=ПК, C=X, D=Y')
  return axis
}

export async function createProjectFromFiles(dxfFile: File, axisFile: File): Promise<GeoProject> {
  const [content, axis] = await Promise.all([dxfFile.text(), readAxisWorkbook(axisFile)])
  const result = audit(content, false)
  if (!result.columns.length) throw new Error('В разделе ENTITIES не найдены геологические колонки')
  const x0 = result.columns[0].x
  const columns = result.columns.map((c: any, i: number) => {
    const pk = (c.x - x0) * 5
    const [coordX, coordY] = axisXY(axis, pk)
    const sourceNamed = result.names[i] !== `Скв. ${i + 1}`
    return {
      id: `borehole-${i + 1}`,
      index: i + 1,
      name: sourceNamed ? result.names[i] : `Без имени · №${i + 1}`,
      sourceNamed,
      x: c.x,
      top: c.sideTop,
      bottom: c.sideBottom,
      levels: c.levels,
      pk,
      coordX,
      coordY,
      layers: result.codes[i].map((layer: any, j: number) => ({
        id: `borehole-${i + 1}-layer-${j + 1}`,
        depth: layer.depth,
        y: c.sideTop - layer.depth * 10,
        ige: layer.ige,
        status: layer.status,
        candidates: layer.candidates,
        source: layer.status === 'topology' ? 'Границы слоя' : layer.status === 'vertical-only' ? 'Положение кружка' : 'Требует проверки',
        depthSource: 'dxf'
      })),
      excluded: result.depths[i].excluded.map((e: any) => ({ text: e.text, handle: e.handle, reason: e.reason }))
    }
  })
  const segments = result.geo.segments.filter((s: any) => /ГЕОЛОГИЯ/i.test(s.layer || ''))
  const xs = segments.flatMap((s: any) => [s.x1, s.x2])
  const ys = segments.flatMap((s: any) => [s.y1, s.y2])
  return {
    schemaVersion: 1,
    id: `local-${Date.now()}`,
    title: dxfFile.name.replace(/\.dxf$/i, ''),
    sourceFile: dxfFile.name,
    axisFile: axisFile.name,
    horizontalScale: 5000,
    verticalScale: 100,
    startPk: 0,
    axis,
    columns,
    geometry: { segments, circles: result.geo.circles, texts: result.geo.texts },
    bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
    activity: [{ id: `import-${Date.now()}`, type: 'system', text: 'Проект сформирован локально из DXF и Excel', at: new Date().toLocaleString('ru-RU') }]
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportWorkbook(project: GeoProject) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ГеоРазрез'
  workbook.created = new Date()
  const sheet = workbook.addWorksheet('Геология')
  sheet.columns = [
    { header: 'ПК', key: 'pk', width: 16 },
    { header: 'Наименование скважины', key: 'name', width: 28 },
    { header: 'Глубина подошвы слоя, м', key: 'depth', width: 24 },
    { header: 'Мощность слоя, м', key: 'thickness', width: 20 },
    { header: 'Источник глубины', key: 'depthSource', width: 24 },
    { header: 'Контроль глубины', key: 'depthControl', width: 28 },
    { header: 'Код ИГЭ', key: 'ige', width: 14 },
    { header: 'Наименование ИГЭ', key: 'igeName', width: 30 },
    { header: 'Описание грунта', key: 'igeDescription', width: 52 },
    { header: 'X', key: 'x', width: 18 },
    { header: 'Y', key: 'y', width: 18 },
    { header: 'Статус проверки', key: 'status', width: 26 },
    { header: 'Источник решения', key: 'source', width: 32 }
  ]
  for (const column of project.columns) {
    if (column.isExcluded) continue
    for (const [layerIndex, layer] of column.layers.entries()) {
      const passport = project.igePassports?.[getIgeKey(layer.ige)]
      const depthIssue = getLayerDepthIssue(column.layers, layerIndex)
      const row = sheet.addRow({
        pk: formatPk(column.pk), name: column.name, depth: layer.depth,
        thickness: getLayerThickness(column.layers, layerIndex),
        depthSource: layer.depthSource === 'manual' ? 'Изменена или добавлена вручную' : 'Исходный DXF',
        depthControl: depthIssue === 'invalid-depth' ? 'Некорректная глубина' : depthIssue === 'depth-order' ? 'Порядок подошв нарушен' : 'ОК',
        ige: layer.ige, igeName: passport?.name || '', igeDescription: passport?.description || '',
        x: column.coordX ?? '', y: column.coordY ?? '', status: exportStatus[layer.status], source: layer.source
      })
      row.getCell(3).numFmt = '0.00'
      row.getCell(4).numFmt = '0.00'
    }
  }
  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFF0F' } }
  sheet.autoFilter = { from: 'A1', to: 'M1' }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  const codeSummary = workbook.addWorksheet('Сводка ИГЭ')
  codeSummary.columns = [
    { header: 'Код ИГЭ', key: 'code', width: 16 },
    { header: 'Варианты написания', key: 'variants', width: 32 },
    { header: 'Наименование ИГЭ', key: 'passportName', width: 30 },
    { header: 'Описание грунта', key: 'description', width: 52 },
    { header: 'Примечание', key: 'notes', width: 42 },
    { header: 'Слоёв', key: 'layers', width: 12 },
    { header: 'Скважин', key: 'boreholes', width: 12 },
    { header: 'Мин. глубина, м', key: 'minDepth', width: 18 },
    { header: 'Макс. глубина, м', key: 'maxDepth', width: 18 },
    { header: 'Мин. мощность, м', key: 'minThickness', width: 18 },
    { header: 'Макс. мощность, м', key: 'maxThickness', width: 18 },
    { header: 'Средняя мощность, м', key: 'averageThickness', width: 21 },
    { header: 'Ручных решений', key: 'manual', width: 18 },
    { header: 'Нерешённых проблем', key: 'issues', width: 22 }
  ]
  for (const item of getCodeSummary(project)) {
    const passport = project.igePassports?.[item.key]
    const row = codeSummary.addRow({
      code: item.code,
      variants: item.variants.join(' / '),
      passportName: passport?.name || '',
      description: passport?.description || '',
      notes: passport?.notes || '',
      layers: item.layerCount,
      boreholes: item.boreholeCount,
      minDepth: item.minDepth,
      maxDepth: item.maxDepth,
      minThickness: item.minThickness,
      maxThickness: item.maxThickness,
      averageThickness: item.averageThickness,
      manual: item.manualCount,
      issues: item.issueCount
    })
    for (let columnIndex = 8; columnIndex <= 12; columnIndex += 1) row.getCell(columnIndex).numFmt = '0.00'
  }
  codeSummary.getRow(1).font = { bold: true }
  codeSummary.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFF0F' } }
  codeSummary.autoFilter = { from: 'A1', to: 'N1' }
  codeSummary.views = [{ state: 'frozen', ySplit: 1 }]

  const control = workbook.addWorksheet('Контроль колонок')
  control.columns = [
    { header: '№', key: 'index', width: 8 },
    { header: 'Скважина', key: 'name', width: 28 },
    { header: 'ПК', key: 'pk', width: 16 },
    { header: 'Слоёв', key: 'layers', width: 12 },
    { header: 'Требуют проверки', key: 'issues', width: 20 },
    { header: 'Проблемы глубин', key: 'depthIssues', width: 20 },
    { header: 'Источник имени', key: 'named', width: 22 },
    { header: 'В расчёте', key: 'included', width: 16 },
    { header: 'Проверка завершена', key: 'reviewed', width: 22 },
    { header: 'Дата подтверждения', key: 'reviewedAt', width: 24 },
    { header: 'Причина исключения', key: 'reason', width: 42 }
  ]
  for (const column of project.columns) {
    const depthIssueCount = column.layers.reduce((sum, _layer, index) => sum + (getLayerDepthIssue(column.layers, index) ? 1 : 0), 0)
    const codeIssueCount = column.layers.filter(layer => layer.status === 'ambiguous' || layer.status === 'not-found').length
    control.addRow({
      index: column.index, name: column.name, pk: formatPk(column.pk), layers: column.layers.length,
      issues: column.isExcluded ? 0 : depthIssueCount + codeIssueCount + (column.sourceNamed ? 0 : 1),
      depthIssues: column.isExcluded ? 0 : depthIssueCount,
      named: column.sourceNamed ? 'Подпись DXF' : 'Ручное поле',
      included: column.isExcluded ? 'Нет' : 'Да',
      reviewed: column.isReviewed && !column.isExcluded ? 'Да' : 'Нет',
      reviewedAt: column.reviewedAt || '',
      reason: column.exclusionReason || ''
    })
  }
  control.getRow(1).font = { bold: true }

  const journal = workbook.addWorksheet('Журнал')
  journal.columns = [{ header: 'Тип', width: 18 }, { header: 'Событие', width: 90 }, { header: 'Отметка', width: 24 }]
  project.activity.forEach(item => journal.addRow([item.type === 'manual' ? 'Ручное решение' : 'Система', item.text, item.at]))
  const buffer = await workbook.xlsx.writeBuffer()
  downloadBlob(new Blob([buffer as any], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${project.title} — ведомость.xlsx`)
}

export function exportProjectFile(project: GeoProject) {
  downloadBlob(new Blob([JSON.stringify(project)], { type: 'application/json' }), `${project.title}.geoproj.json`)
}

export async function readProjectFile(file: File): Promise<GeoProject> {
  let parsed: GeoProject
  try { parsed = JSON.parse(await file.text()) as GeoProject }
  catch { throw new Error('Файл не является корректным JSON-проектом') }
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.columns) || !parsed.geometry || !Array.isArray(parsed.geometry.segments)) {
    throw new Error('Структура проекта не поддерживается этой версией программы')
  }
  if (!parsed.columns.length || parsed.columns.some(column =>
    !column.id || !Array.isArray(column.layers) || column.layers.some(layer =>
      !layer || typeof layer.id !== 'string' || typeof layer.depth !== 'number'
    )
  )) {
    throw new Error('В проекте повреждены данные скважин')
  }
  if (parsed.igePassports !== undefined && (
    !parsed.igePassports || typeof parsed.igePassports !== 'object' || Array.isArray(parsed.igePassports) ||
    Object.values(parsed.igePassports).some(passport => !passport || typeof passport.name !== 'string' || typeof passport.description !== 'string' || typeof passport.notes !== 'string')
  )) {
    throw new Error('В проекте повреждены паспорта ИГЭ')
  }
  return parsed
}

export function addActivity(project: GeoProject, text: string, type: ActivityItem['type'] = 'manual'): GeoProject {
  return {
    ...project,
    activity: [
      { id: `event-${Date.now()}-${Math.random()}`, type, text, at: new Date().toLocaleString('ru-RU') },
      ...project.activity
    ].slice(0, 100)
  }
}
