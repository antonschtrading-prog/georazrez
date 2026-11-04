import type ExcelJS from 'exceljs'
import { audit } from './geologyEngine'
import { createCoreModel, createCoreModelFromExtraction, createProjectFromCore, getCoreBoreholeBoundaryIssues, getCoreBoundaryModel, getCoreCodeSummary, getCoreLayerDepthIssue, getCoreLayerThickness, validateCoreModel, type CoreModel } from './geologyCore'
import { formatPk, getIgeKey, SOIL_CHARACTERISTICS, type ActivityItem, type CodeStatus, type GeoProject } from '@/types/geology'

const exportStatus: Record<CodeStatus, string> = {
  topology: 'По границам DXF',
  'vertical-only': 'По положению кружка',
  ambiguous: 'Требует ручного выбора',
  'not-found': 'ИГЭ не найден',
  manual: 'Подтверждено вручную'
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || typeof value === 'number' && Number.isFinite(value)
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

export async function createCoreFromFiles(dxfFile: File, axisFile: File): Promise<CoreModel> {
  const [content, axis] = await Promise.all([dxfFile.text(), readAxisWorkbook(axisFile)])
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
    { header: 'Контроль границы', key: 'issues', width: 60 }
  ]
  const boundaryModel = getCoreBoundaryModel(coreModel)
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
      basis: item.manualCorrelation ? 'Ручная корреляция' : 'Одинаковый порядковый номер',
      note: item.correlationNote,
      source: item.manual ? 'Есть ручная глубина' : 'Исходный DXF',
      issues: item.issues.map(issue => issue.detail).join('; ')
    })
    row.getCell(7).numFmt = '0.00'
    row.getCell(8).numFmt = '0.00'
  }
  boundarySheet.getRow(1).font = { bold: true }
  boundarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFF0F' } }
  boundarySheet.autoFilter = { from: 'A1', to: 'O1' }
  boundarySheet.views = [{ state: 'frozen', ySplit: 1 }]

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
    control.addRow({
      index: column.index, name: column.name, pk: formatPk(column.pk), layers: column.layers.length,
      issues: column.isExcluded ? 0 : depthIssueCount + codeIssueCount + (column.sourceNamed ? 0 : 1) + boundaryIssueCount,
      depthIssues: column.isExcluded ? 0 : depthIssueCount,
      boundaryIssues: boundaryIssueCount,
      named: column.sourceNamed ? 'Подпись DXF' : 'Ручное поле',
      included: column.isExcluded ? 'Нет' : 'Да',
      reviewed: column.isReviewed && !column.isExcluded ? 'Да' : 'Нет',
      reviewedAt: column.reviewedAt || '',
      reason: column.exclusionReason || ''
    })
  }
  control.getRow(1).font = { bold: true }

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
    Object.values(parsed.igePassports).some(passport =>
      !passport || typeof passport.name !== 'string' || typeof passport.description !== 'string' || typeof passport.notes !== 'string' ||
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
