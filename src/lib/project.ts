import type ExcelJS from 'exceljs'
import { audit } from './geologyEngine'
import { CORE_ACTIVITY_CATEGORY_LABELS, createCoreModel, createCoreModelFromExtraction, createProjectFromCore, getCoreBoreholeBoundaryIssues, getCoreBoundaryModel, getCoreCodeSummary, getCoreJournalEntries, getCoreLayerDepthIssue, getCoreLayerThickness, getCoreInterpolationReviewItems, getCoreSectionReport, getCoreSoilLibrary, validateCoreModel, type CoreModel } from './geologyCore'
import { formatPk, getIgeKey, SOIL_CHARACTERISTICS, SOIL_HATCH_LABELS, SOIL_HATCHES, type ActivityCategory, type ActivityItem, type CodeStatus, type GeoProject, type SoilHatch } from '@/types/geology'

const exportStatus: Record<CodeStatus, string> = {
  topology: 'По границам DXF',
  'vertical-only': 'По положению кружка',
  ambiguous: 'Требует ручного выбора',
  'not-found': 'ИГЭ не найден',
  manual: 'Подтверждено вручную',
  interpolated: 'Линейная интерполяция'
}

const exportDepthSource = {
  dxf: 'Исходный DXF',
  manual: 'Изменена или добавлена вручную',
  interpolated: 'Линейная интерполяция по сохранённому правилу'
} as const

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || typeof value === 'number' && Number.isFinite(value)
}

function isValidInterpolation(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const rule = value as Record<string, unknown>
  return rule.method === 'linear' && typeof rule.leftBoreholeId === 'string' && typeof rule.rightBoreholeId === 'string' &&
    typeof rule.fraction === 'number' && Number.isFinite(rule.fraction) && typeof rule.note === 'string' && typeof rule.createdAt === 'string' &&
    (rule.sourceFingerprint === undefined || typeof rule.sourceFingerprint === 'string')
}

function isValidSoilAppearance(value: unknown): boolean {
  if (value === undefined) return true
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const appearance = value as Record<string, unknown>
  return typeof appearance.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(appearance.color) &&
    typeof appearance.hatch === 'string' && SOIL_HATCHES.includes(appearance.hatch as SoilHatch)
}

const ACTIVITY_CATEGORIES: ActivityCategory[] = ['system', 'geology', 'correlation', 'gap', 'fictitious', 'passport', 'review']

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || Array.isArray(value) && value.every(item => typeof item === 'string')
}

function isValidActivity(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.text === 'string' && typeof item.at === 'string' &&
    (item.type === 'system' || item.type === 'manual') &&
    (item.category === undefined || ACTIVITY_CATEGORIES.includes(item.category as ActivityCategory)) &&
    isOptionalStringArray(item.boreholeIds) && isOptionalStringArray(item.layerIds) && isOptionalStringArray(item.passportKeys)
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

/** Декодирует DXF, сохраняя корректный UTF-8 даже при ошибочном ANSI_1251 в заголовке. */
export function decodeDxfBuffer(buffer: ArrayBuffer): string {
  let utf8: string | null = null
  try {
    utf8 = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    // Ниже кодовая страница применяется только к файлу, который не является UTF-8.
  }

  const bytes = new Uint8Array(buffer)
  const header = new TextDecoder('latin1').decode(bytes.subarray(0, 65536))
  const codepage = header.match(
    /\$DWGCODEPAGE[ \t]*(?:\r\n|\n|\r)[ \t]*3[ \t]*(?:\r\n|\n|\r)[ \t]*([^\r\n]+)/i
  )?.[1].trim().toUpperCase()
  if (utf8 !== null) return utf8
  return new TextDecoder(codepage === 'ANSI_1251' ? 'windows-1251' : 'utf-8').decode(buffer)
}

export async function readDxfFile(file: File): Promise<string> {
  return decodeDxfBuffer(await file.arrayBuffer())
}

export async function createCoreFromFiles(dxfFile: File, axisFile: File): Promise<CoreModel> {
  const [content, axis] = await Promise.all([readDxfFile(dxfFile), readAxisWorkbook(axisFile)])
  const extraction = audit(content, false)
  return createCoreModelFromExtraction(extraction, axis, {
    title: dxfFile.name.replace(/\.dxf$/i, ''),
    sourceFile: dxfFile.name,
    axisFile: axisFile.name
  })
}

export async function createProjectFromFiles(dxfFile: File, axisFile: File): Promise<GeoProject> {
  return createProjectFromCore(await createCoreFromFiles(dxfFile, axisFile))
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
  const coreModel = createCoreModel(project)
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
    const coreColumn = coreModel.boreholes.find(item => item.id === column.id)!
    for (const [layerIndex, layer] of column.layers.entries()) {
      const passport = project.igePassports?.[getIgeKey(layer.ige)]
      const depthIssue = getCoreLayerDepthIssue(coreColumn.layers, layerIndex)
      const row = sheet.addRow({
        pk: formatPk(column.pk), name: column.name, depth: layer.depth,
        thickness: getCoreLayerThickness(coreColumn.layers, layerIndex),
        depthSource: exportDepthSource[layer.depthSource || 'dxf'],
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

  const sourceSheet = workbook.addWorksheet('Источники DXF')
  sourceSheet.columns = [
    { header: 'Скважина', key: 'name', width: 28 },
    { header: 'ПК', key: 'pk', width: 16 },
    { header: 'Подошва №', key: 'ordinal', width: 14 },
    { header: 'Текущая глубина, м', key: 'depth', width: 21 },
    { header: 'Текущий ИГЭ', key: 'code', width: 16 },
    { header: 'Происхождение глубины', key: 'depthSource', width: 28 },
    { header: 'Текущий статус ИГЭ', key: 'codeStatus', width: 28 },
    { header: 'DXF: боковые линии', key: 'sideLines', width: 28 },
    { header: 'DXF: подпись скважины', key: 'nameText', width: 26 },
    { header: 'DXF: подпись глубины', key: 'depthText', width: 26 },
    { header: 'DXF: кандидаты ИГЭ', key: 'codeTexts', width: 38 }
  ]
  for (const column of coreModel.boreholes) {
    for (const layer of column.layers) {
      const row = sourceSheet.addRow({
        name: column.name,
        pk: formatPk(column.pk),
        ordinal: layer.ordinal,
        depth: layer.bottomDepth,
        code: layer.igeCode,
        depthSource: exportDepthSource[layer.depthSource],
        codeStatus: exportStatus[layer.codeStatus],
        sideLines: column.sourceRefs.sideLines.join(' / '),
        nameText: column.sourceRefs.nameText,
        depthText: layer.sourceRefs.depthText,
        codeTexts: layer.sourceRefs.codeTexts.join(' / ')
      })
      row.getCell(4).numFmt = '0.00'
    }
  }
  sourceSheet.getRow(1).font = { bold: true }
  sourceSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFF0F' } }
  sourceSheet.autoFilter = { from: 'A1', to: 'K1' }
  sourceSheet.views = [{ state: 'frozen', ySplit: 1 }]

  const boundarySheet = workbook.addWorksheet('Расчётные границы')
  boundarySheet.columns = [
    { header: 'Левая скважина', key: 'leftName', width: 28 },
    { header: 'ПК слева', key: 'leftPk', width: 16 },
    { header: 'Правая скважина', key: 'rightName', width: 28 },
    { header: 'ПК справа', key: 'rightPk', width: 16 },
    { header: 'Подошва слева №', key: 'leftOrdinal', width: 18 },
    { header: 'Подошва справа №', key: 'rightOrdinal', width: 18 },
    { header: 'Глубина слева, м', key: 'leftDepth', width: 21 },
    { header: 'Глубина справа, м', key: 'rightDepth', width: 21 },
    { header: 'ИГЭ слева', key: 'leftCode', width: 16 },
    { header: 'ИГЭ справа', key: 'rightCode', width: 16 },
    { header: 'Статус корреляции', key: 'status', width: 30 },
    { header: 'Основание корреляции', key: 'basis', width: 30 },
    { header: 'Инженерное обоснование', key: 'note', width: 48 },
    { header: 'Источник глубин', key: 'source', width: 25 },
    { header: 'Контроль границы', key: 'issues', width: 60 },
    { header: 'Решение по разрыву', key: 'gapDecision', width: 28 },
    { header: 'Точка выклинивания, %', key: 'pinchoutFraction', width: 24 },
    { header: 'Обоснование решения', key: 'gapNote', width: 48 },
    { header: 'ID решения по разрыву', key: 'gapDecisionId', width: 42 }
  ]
  const boundaryModel = getCoreBoundaryModel(coreModel)
  const interpolationReviewItems = getCoreInterpolationReviewItems(coreModel)
  const interpolatedLayerIds = new Set(coreModel.boreholes.flatMap(column => column.layers.filter(layer => layer.depthSource === 'interpolated').map(layer => layer.id)))
  for (const item of boundaryModel.items) {
    const row = boundarySheet.addRow({
      leftName: item.leftBoreholeName,
      leftPk: formatPk(item.leftPk),
      rightName: item.rightBoreholeName,
      rightPk: formatPk(item.rightPk),
      leftOrdinal: item.leftOrdinal,
      rightOrdinal: item.rightOrdinal,
      leftDepth: item.leftDepth,
      rightDepth: item.rightDepth,
      leftCode: item.leftCode,
      rightCode: item.rightCode,
      status: item.status === 'connected' ? 'Соединена'
        : item.status === 'left-only' ? 'Нет парной подошвы справа'
          : item.status === 'right-only' ? 'Нет парной подошвы слева'
            : item.issues.some(issue => issue.kind === 'crossing') ? 'Пересечение границ' : 'Некорректная граница',
      basis: item.manualCorrelation ? 'Ручная корреляция' : item.gapDecisionKind === 'accepted' ? 'Разрыв принят инженером' : item.gapDecisionKind === 'pinchout' ? 'Явное выклинивание' : 'Одинаковый порядковый номер',
      note: item.correlationNote,
      source: item.manual ? 'Есть ручная глубина' : [item.leftLayerId, item.rightLayerId].some(id => id && interpolatedLayerIds.has(id)) ? 'Есть интерполированная глубина' : 'Исходный DXF',
      issues: item.issues.map(issue => issue.detail).join('; '),
      gapDecision: item.gapDecisionKind === 'accepted' ? 'Разрыв принят' : item.gapDecisionKind === 'pinchout' ? 'Выклинивание' : '',
      pinchoutFraction: item.pinchoutFraction === null ? null : item.pinchoutFraction * 100,
      gapNote: item.gapDecisionNote,
      gapDecisionId: item.gapDecisionId || ''
    })
    row.getCell(7).numFmt = '0.00'
    row.getCell(8).numFmt = '0.00'
    row.getCell(17).numFmt = '0.00'
  }
  boundarySheet.getRow(1).font = { bold: true }
  boundarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFF0F' } }
  boundarySheet.autoFilter = { from: 'A1', to: 'S1' }
  boundarySheet.views = [{ state: 'frozen', ySplit: 1 }]

  const gapDecisionSheet = workbook.addWorksheet('Решения по разрывам')
  gapDecisionSheet.columns = [
    { header: 'ID решения', key: 'id', width: 42 },
    { header: 'Состояние', key: 'state', width: 34 },
    { header: 'Левая скважина', key: 'leftName', width: 28 },
    { header: 'Правая скважина', key: 'rightName', width: 28 },
    { header: 'Подошва слева №', key: 'leftOrdinal', width: 18 },
    { header: 'Подошва справа №', key: 'rightOrdinal', width: 18 },
    { header: 'Тип решения', key: 'kind', width: 24 },
    { header: 'Точка выклинивания, %', key: 'fraction', width: 24 },
    { header: 'Инженерное обоснование', key: 'note', width: 60 },
    { header: 'Создано', key: 'createdAt', width: 26 },
    { header: 'X точки на чертеже', key: 'x', width: 24 },
    { header: 'Y точки на чертеже', key: 'y', width: 24 },
    { header: 'ID подошвы слева', key: 'leftLayerId', width: 38 },
    { header: 'ID подошвы справа', key: 'rightLayerId', width: 38 }
  ]
  for (const decision of coreModel.gapDecisions) {
    const item = boundaryModel.items.find(candidate => candidate.gapDecisionId === decision.id)
    const inactive = boundaryModel.inactiveGapDecisions.find(candidate => candidate.decision.id === decision.id)
    const pinchout = boundaryModel.pinchouts.find(candidate => candidate.decisionId === decision.id)
    const row = gapDecisionSheet.addRow({
      id: decision.id,
      state: inactive ? 'Неактивно: текущий разрыв отсутствует' : item?.status === 'invalid' ? 'Ошибка построения' : 'Активно',
      leftName: item?.leftBoreholeName || '',
      rightName: item?.rightBoreholeName || '',
      leftOrdinal: item?.leftOrdinal ?? null,
      rightOrdinal: item?.rightOrdinal ?? null,
      kind: decision.kind === 'accepted' ? 'Разрыв принят' : 'Выклинивание',
      fraction: decision.fraction === null ? null : decision.fraction * 100,
      note: decision.note,
      createdAt: decision.createdAt,
      x: pinchout?.x ?? null,
      y: pinchout?.y ?? null,
      leftLayerId: decision.leftLayerId || '',
      rightLayerId: decision.rightLayerId || ''
    })
    row.getCell(8).numFmt = '0.00'
    row.getCell(11).numFmt = '0.000'
    row.getCell(12).numFmt = '0.000'
  }
  gapDecisionSheet.getRow(1).font = { bold: true }
  gapDecisionSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFF0F' } }
  gapDecisionSheet.autoFilter = { from: 'A1', to: 'N1' }
  gapDecisionSheet.views = [{ state: 'frozen', ySplit: 1 }]

  const fictitiousSheet = workbook.addWorksheet('Фиктивные скважины')
  fictitiousSheet.columns = [
    { header: 'ID скважины', key: 'id', width: 48 },
    { header: 'Наименование', key: 'name', width: 32 },
    { header: 'ПК', key: 'pk', width: 16 },
    { header: 'Метод', key: 'method', width: 24 },
    { header: 'Источник слева', key: 'left', width: 28 },
    { header: 'Источник справа', key: 'right', width: 28 },
    { header: 'Положение, %', key: 'fraction', width: 18 },
    { header: 'Инженерное обоснование', key: 'note', width: 60 },
    { header: 'Правило создано', key: 'createdAt', width: 26 },
    { header: 'Подошва №', key: 'ordinal', width: 14 },
    { header: 'Глубина, м', key: 'depth', width: 18 },
    { header: 'ИГЭ', key: 'code', width: 16 },
    { header: 'Статус ИГЭ', key: 'status', width: 28 },
    { header: 'X', key: 'x', width: 18 },
    { header: 'Y', key: 'y', width: 18 },
    { header: 'Состояние правила', key: 'ruleState', width: 32 }
  ]
  for (const column of coreModel.boreholes.filter(item => item.kind === 'fictitious')) {
    const rule = column.interpolation
    const left = coreModel.boreholes.find(item => item.id === rule?.leftBoreholeId)
    const right = coreModel.boreholes.find(item => item.id === rule?.rightBoreholeId)
    const ruleIssue = interpolationReviewItems.find(item => item.boreholeId === column.id)
    const ruleState = ruleIssue?.kind === 'fictitious-invalid' ? 'Правило недействительно'
      : ruleIssue?.kind === 'fictitious-outdated' ? 'Источники изменены · требуется явный пересчёт'
        : 'Актуально на момент последнего подтверждения'
    for (const layer of column.layers) {
      const row = fictitiousSheet.addRow({
        id: column.id,
        name: column.name,
        pk: formatPk(column.pk),
        method: rule?.method === 'linear' ? 'Линейная, явная команда' : 'Правило отсутствует',
        left: left?.name || rule?.leftBoreholeId || '',
        right: right?.name || rule?.rightBoreholeId || '',
        fraction: rule ? rule.fraction * 100 : null,
        note: rule?.note || '',
        createdAt: rule?.createdAt || '',
        ordinal: layer.ordinal,
        depth: layer.bottomDepth,
        code: layer.igeCode,
        status: exportStatus[layer.codeStatus],
        x: column.coordinates?.x ?? null,
        y: column.coordinates?.y ?? null,
        ruleState
      })
      row.getCell(7).numFmt = '0.00'
      row.getCell(11).numFmt = '0.00'
    }
  }
  fictitiousSheet.getRow(1).font = { bold: true }
  fictitiousSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFF0F' } }
  fictitiousSheet.autoFilter = { from: 'A1', to: 'P1' }
  fictitiousSheet.views = [{ state: 'frozen', ySplit: 1 }]

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
    { header: 'Нерешённых проблем', key: 'issues', width: 22 },
    { header: 'Заполнено характеристик', key: 'characteristics', width: 25 }
  ]
  const summaryItems = getCoreCodeSummary(coreModel)
  for (const item of summaryItems) {
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
      issues: item.issueCount,
      characteristics: `${item.characteristicFilled} / ${item.characteristicTotal}`
    })
    for (let columnIndex = 8; columnIndex <= 12; columnIndex += 1) row.getCell(columnIndex).numFmt = '0.00'
  }
  codeSummary.getRow(1).font = { bold: true }
  codeSummary.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFF0F' } }
  codeSummary.autoFilter = { from: 'A1', to: 'O1' }
  codeSummary.views = [{ state: 'frozen', ySplit: 1 }]

  const soilLibrary = workbook.addWorksheet('Библиотека грунтов')
  soilLibrary.columns = [
    { header: 'Код ИГЭ', key: 'code', width: 16 },
    { header: 'Наименование ИГЭ', key: 'name', width: 32 },
    { header: 'Варианты написания', key: 'variants', width: 32 },
    { header: 'Слоёв', key: 'layers', width: 12 },
    { header: 'Скважин', key: 'boreholes', width: 12 },
    { header: 'Цвет', key: 'color', width: 16 },
    { header: 'Штриховка', key: 'hatch', width: 28 },
    { header: 'Происхождение оформления', key: 'appearanceSource', width: 32 }
  ]
  for (const item of getCoreSoilLibrary(coreModel)) {
    const row = soilLibrary.addRow({
      code: item.code,
      name: item.passportName,
      variants: item.variants.join(' / '),
      layers: item.layerCount,
      boreholes: item.boreholeCount,
      color: item.appearance.color,
      hatch: SOIL_HATCH_LABELS[item.appearance.hatch],
      appearanceSource: item.appearanceCustomized ? 'Выбрано инженером' : 'Нейтральный начальный вид'
    })
    row.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${item.appearance.color.slice(1).toUpperCase()}` } }
  }
  soilLibrary.getRow(1).font = { bold: true }
  soilLibrary.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFF0F' } }
  soilLibrary.autoFilter = { from: 'A1', to: 'H1' }
  soilLibrary.views = [{ state: 'frozen', ySplit: 1 }]

  const characteristics = workbook.addWorksheet('Характеристики ИГЭ')
  characteristics.columns = [
    { header: 'Код ИГЭ', key: 'code', width: 16 },
    { header: 'Наименование ИГЭ', key: 'name', width: 30 },
    { header: 'Группа', key: 'group', width: 20 },
    { header: 'Характеристика', key: 'property', width: 38 },
    { header: 'Единица', key: 'unit', width: 14 },
    { header: 'Нормативное значение', key: 'standard', width: 24 },
    { header: 'Расчётное значение', key: 'design', width: 22 },
    { header: 'Источник', key: 'source', width: 48 }
  ]
  for (const item of summaryItems) {
    if (item.key === '__unassigned__') continue
    const passport = project.igePassports?.[item.key]
    for (const property of SOIL_CHARACTERISTICS) {
      const record = passport?.characteristics?.[property.key]
      const row = characteristics.addRow({
        code: item.code,
        name: passport?.name || '',
        group: property.group,
        property: property.label,
        unit: property.unit,
        standard: record?.standard ?? null,
        design: record?.design ?? null,
        source: record?.source || ''
      })
      row.getCell(6).numFmt = '0.000'
      row.getCell(7).numFmt = '0.000'
    }
  }
  characteristics.getRow(1).font = { bold: true }
  characteristics.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFF0F' } }
  characteristics.autoFilter = { from: 'A1', to: 'H1' }
  characteristics.views = [{ state: 'frozen', ySplit: 1 }]

  const control = workbook.addWorksheet('Контроль колонок')
  control.columns = [
    { header: '№', key: 'index', width: 8 },
    { header: 'Скважина', key: 'name', width: 28 },
    { header: 'ПК', key: 'pk', width: 16 },
    { header: 'Слоёв', key: 'layers', width: 12 },
    { header: 'Требуют проверки', key: 'issues', width: 20 },
    { header: 'Проблемы глубин', key: 'depthIssues', width: 20 },
    { header: 'Ошибки границ', key: 'boundaryIssues', width: 18 },
    { header: 'Ошибки интерполяции', key: 'interpolationIssues', width: 24 },
    { header: 'Источник имени', key: 'named', width: 22 },
    { header: 'В расчёте', key: 'included', width: 16 },
    { header: 'Проверка завершена', key: 'reviewed', width: 22 },
    { header: 'Дата подтверждения', key: 'reviewedAt', width: 24 },
    { header: 'Причина исключения', key: 'reason', width: 42 }
  ]
  for (const column of project.columns) {
    const coreColumn = coreModel.boreholes.find(item => item.id === column.id)!
    const depthIssueCount = coreColumn.layers.reduce((sum, _layer, index) => sum + (getCoreLayerDepthIssue(coreColumn.layers, index) ? 1 : 0), 0)
    const codeIssueCount = column.layers.filter(layer => layer.status === 'ambiguous' || layer.status === 'not-found').length
    const boundaryIssueCount = column.isExcluded ? 0 : getCoreBoreholeBoundaryIssues(boundaryModel, column.id).length
    const interpolationIssueCount = column.isExcluded ? 0 : interpolationReviewItems.filter(item => item.boreholeId === column.id).length
    control.addRow({
      index: column.index, name: column.name, pk: formatPk(column.pk), layers: column.layers.length,
      issues: column.isExcluded ? 0 : depthIssueCount + codeIssueCount + (coreColumn.kind === 'dxf' && !column.sourceNamed ? 1 : 0) + boundaryIssueCount + interpolationIssueCount,
      depthIssues: column.isExcluded ? 0 : depthIssueCount,
      boundaryIssues: boundaryIssueCount,
      interpolationIssues: interpolationIssueCount,
      named: column.kind === 'fictitious' ? 'Фиктивная · сохранённое правило' : column.sourceNamed ? 'Подпись DXF' : 'Ручное поле',
      included: column.isExcluded ? 'Нет' : 'Да',
      reviewed: column.isReviewed && !column.isExcluded ? 'Да' : 'Нет',
      reviewedAt: column.reviewedAt || '',
      reason: column.exclusionReason || ''
    })
  }
  control.getRow(1).font = { bold: true }

  const reviewSheet = workbook.addWorksheet('Очередь проверки')
  reviewSheet.columns = [
    { header: 'Тип', key: 'source', width: 22 },
    { header: 'Категория', key: 'kind', width: 28 },
    { header: 'Скважина / участок', key: 'object', width: 42 },
    { header: 'ПК', key: 'pk', width: 28 },
    { header: 'Подошва №', key: 'ordinal', width: 16 },
    { header: 'Проблема', key: 'title', width: 54 },
    { header: 'Пояснение', key: 'detail', width: 90 },
    { header: 'Кандидаты ИГЭ', key: 'candidates', width: 32 },
    { header: 'Идентификатор задачи', key: 'id', width: 42 }
  ]
  const reviewKindLabels = {
    'missing-name': 'Нет подписи скважины',
    'ambiguous-code': 'Неоднозначный ИГЭ',
    'missing-code': 'ИГЭ не найден',
    'invalid-depth': 'Некорректная глубина',
    'depth-order': 'Порядок подошв',
    'invalid-boundary': 'Некорректная граница',
    'fictitious-outdated': 'Источники интерполяции изменились',
    'fictitious-invalid': 'Правило интерполяции недействительно'
  } as const
  const reviewItems = getCoreSectionReport(coreModel, boundaryModel).items
  for (const item of reviewItems) {
    const column = coreModel.boreholes.find(candidate => candidate.id === item.boreholeId)
    const boundary = item.boundaryId
      ? boundaryModel.items.find(candidate => candidate.id === item.boundaryId)
      : null
    const layer = item.layerId
      ? coreModel.boreholes.flatMap(candidate => candidate.layers).find(candidate => candidate.id === item.layerId)
      : null
    reviewSheet.addRow({
      source: item.source === 'boundary' ? 'Корреляция границ' : item.source === 'interpolation' ? 'Правило интерполяции' : 'Геологическая модель',
      kind: reviewKindLabels[item.kind],
      object: boundary ? `${boundary.leftBoreholeName} → ${boundary.rightBoreholeName}` : column?.name || item.boreholeId,
      pk: boundary ? `${formatPk(boundary.leftPk)} — ${formatPk(boundary.rightPk)}` : column ? formatPk(column.pk) : '',
      ordinal: layer?.ordinal ?? '',
      title: item.title,
      detail: item.detail,
      candidates: item.candidates?.join(' / ') || '',
      id: item.id
    })
  }
  reviewSheet.getRow(1).font = { bold: true }
  reviewSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFF0F' } }
  reviewSheet.autoFilter = { from: 'A1', to: 'I1' }
  reviewSheet.views = [{ state: 'frozen', ySplit: 1 }]

  const coreControl = workbook.addWorksheet('Контроль ядра')
  coreControl.columns = [
    { header: 'Серьёзность', key: 'severity', width: 16 },
    { header: 'Тип', key: 'kind', width: 28 },
    { header: 'Скважина', key: 'borehole', width: 26 },
    { header: 'Слой', key: 'entity', width: 32 },
    { header: 'Паспорт ИГЭ', key: 'passport', width: 20 },
    { header: 'Замечание', key: 'title', width: 48 },
    { header: 'Пояснение', key: 'detail', width: 90 }
  ]
  const coreIssues = validateCoreModel(coreModel)
  for (const issue of coreIssues) {
    coreControl.addRow({
      severity: issue.severity === 'error' ? 'Ошибка' : 'Предупреждение',
      kind: issue.kind,
      borehole: project.columns.find(column => column.id === issue.boreholeId)?.name || issue.boreholeId || '',
      entity: issue.layerId || '',
      passport: issue.passportKey || '',
      title: issue.title,
      detail: issue.detail
    })
  }
  coreControl.getRow(1).font = { bold: true }
  coreControl.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFF0F' } }
  coreControl.autoFilter = { from: 'A1', to: 'G1' }
  coreControl.views = [{ state: 'frozen', ySplit: 1 }]

  const journal = workbook.addWorksheet('Журнал')
  journal.columns = [
    { header: 'Категория', key: 'category', width: 32 },
    { header: 'Тип', key: 'type', width: 18 },
    { header: 'Событие', key: 'text', width: 90 },
    { header: 'Связанные объекты', key: 'objects', width: 70 },
    { header: 'ID скважин', key: 'boreholeIds', width: 48 },
    { header: 'ID подошв', key: 'layerIds', width: 58 },
    { header: 'Ключи ИГЭ', key: 'passportKeys', width: 28 },
    { header: 'Отметка', key: 'at', width: 24 }
  ]
  for (const item of getCoreJournalEntries(coreModel)) {
    journal.addRow({
      category: CORE_ACTIVITY_CATEGORY_LABELS[item.category],
      type: item.type === 'manual' ? 'Ручное решение' : 'Система',
      text: item.text,
      objects: item.objectLabel,
      boreholeIds: item.boreholeIds.join(' / '),
      layerIds: item.layerIds.join(' / '),
      passportKeys: item.passportKeys.join(' / '),
      at: item.at
    })
  }
  journal.getRow(1).font = { bold: true }
  journal.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFF0F' } }
  journal.autoFilter = { from: 'A1', to: 'H1' }
  journal.views = [{ state: 'frozen', ySplit: 1 }]
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
  if (!Array.isArray(parsed.activity) || parsed.activity.some(item => !isValidActivity(item))) {
    throw new Error('В проекте поврежден журнал инженерных решений')
  }
  if (!parsed.columns.length || parsed.columns.some(column =>
    !column.id || !Array.isArray(column.layers) ||
    (column.kind !== undefined && !['dxf', 'fictitious'].includes(column.kind)) ||
    (column.kind === 'fictitious' && !isValidInterpolation(column.interpolation)) ||
    (column.interpolation !== undefined && column.interpolation !== null && !isValidInterpolation(column.interpolation)) ||
    column.layers.some(layer =>
      !layer || typeof layer.id !== 'string' || typeof layer.depth !== 'number'
    )
  )) {
    throw new Error('В проекте повреждены данные скважин')
  }
  if (parsed.igePassports !== undefined && (
    !parsed.igePassports || typeof parsed.igePassports !== 'object' || Array.isArray(parsed.igePassports) ||
    Object.values(parsed.igePassports).some(passport =>
      !passport || typeof passport.name !== 'string' || typeof passport.description !== 'string' || typeof passport.notes !== 'string' ||
      !isValidSoilAppearance(passport.appearance) ||
      (passport.characteristics !== undefined && (
        !passport.characteristics || typeof passport.characteristics !== 'object' || Array.isArray(passport.characteristics) ||
        Object.entries(passport.characteristics).some(([key, record]) =>
          !SOIL_CHARACTERISTICS.some(property => property.key === key) || !record ||
          !isNullableFiniteNumber(record.standard) || !isNullableFiniteNumber(record.design) || typeof record.source !== 'string'
        )
      ))
    )
  )) {
    throw new Error('В проекте повреждены паспорта ИГЭ')
  }
  if (parsed.gapDecisions !== undefined && (!Array.isArray(parsed.gapDecisions) || parsed.gapDecisions.some(decision =>
    !decision || typeof decision.id !== 'string' || typeof decision.note !== 'string' || typeof decision.createdAt !== 'string' ||
    !['accepted', 'pinchout'].includes(decision.kind) ||
    !(decision.leftLayerId === null || typeof decision.leftLayerId === 'string') ||
    !(decision.rightLayerId === null || typeof decision.rightLayerId === 'string') ||
    !isNullableFiniteNumber(decision.fraction)
  ))) {
    throw new Error('В проекте повреждены решения по разрывам')
  }
  return parsed
}

export async function readCoreProjectFile(file: File): Promise<CoreModel> {
  return createCoreModel(await readProjectFile(file))
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
