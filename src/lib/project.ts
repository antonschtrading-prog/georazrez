import type ExcelJS from 'exceljs'
import { audit, axisXY } from './geologyEngine'
import { createCoreModel, validateCoreModel } from './geologyCore'
import { formatPk, getCodeSummary, getIgeKey, getLabStatistics, getLabTestStatistics, getLayerDepthIssue, getLayerThickness, getProjectLabIssues, LAB_ISSUE_LABELS, SOIL_CHARACTERISTICS, type ActivityItem, type CodeStatus, type GeoProject, type LabTest } from '@/types/geology'

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

function textCell(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toLocaleDateString('ru-RU')
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) return value.richText.map(part => part.text).join('')
    if ('text' in value && typeof value.text === 'string') return value.text
    if ('result' in value) return textCell(value.result as ExcelJS.CellValue)
  }
  return ''
}

function normalizeHeader(value: ExcelJS.CellValue): string {
  return textCell(value).trim().toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ')
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

export interface LabImportResult {
  tests: LabTest[]
  errors: string[]
}

export async function downloadLabTemplate(project: GeoProject, code: string) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ГеоРазрез'
  const sheet = workbook.addWorksheet('Испытания')
  sheet.columns = [
    { header: 'Номер образца', width: 24 },
    { header: 'Скважина', width: 28 },
    { header: 'Глубина, м', width: 16 },
    { header: 'Отчёт / протокол', width: 44 },
    ...SOIL_CHARACTERISTICS.map(property => ({ header: `${property.label}${property.unit !== '—' ? `, ${property.unit}` : ''}`, width: 25 }))
  ]
  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFF0F' } }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  const help = workbook.addWorksheet('Справка')
  help.columns = [{ width: 28 }, { width: 90 }]
  help.addRow(['ИГЭ для импорта', code])
  help.addRow(['Обязательные поля', 'Номер образца, скважина, положительная глубина, источник и хотя бы одна характеристика'])
  help.addRow(['Правило импорта', 'Файл принимается целиком. При любой ошибке в заполненных строках новые испытания не добавляются.'])
  help.addRow(['Скважина', 'Укажите точное наименование из списка ниже или технический идентификатор.'])
  help.addRow([])
  help.addRow(['Доступные скважины', 'Технический идентификатор'])
  for (const column of project.columns) help.addRow([column.name, column.id])
  help.getRow(1).font = { bold: true }
  help.getRow(6).font = { bold: true }
  const buffer = await workbook.xlsx.writeBuffer()
  downloadBlob(new Blob([buffer as any], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `ИГЭ ${code} — шаблон испытаний.xlsx`)
}

export async function readLabWorkbook(file: File, project: GeoProject, code: string): Promise<LabImportResult> {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer() as any)
  const sheet = workbook.getWorksheet('Испытания') || workbook.getWorksheet('Испытания ИГЭ') || workbook.worksheets[0]
  if (!sheet) return { tests: [], errors: ['В файле нет листов Excel.'] }
  const key = getIgeKey(code)
  const headers = new Map<string, number>()
  for (let columnIndex = 1; columnIndex <= sheet.columnCount; columnIndex += 1) {
    const header = normalizeHeader(sheet.getRow(1).getCell(columnIndex).value)
    if (header) headers.set(header, columnIndex)
  }
  const requiredHeaders = ['Номер образца', 'Скважина', 'Глубина, м', 'Отчёт / протокол']
  const errors = requiredHeaders.filter(header => !headers.has(normalizeHeader(header))).map(header => `Строка 1: не найден столбец «${header}».`)
  if (errors.length) return { tests: [], errors }
  const propertyColumns = SOIL_CHARACTERISTICS.map(property => ({
    property,
    columnIndex: headers.get(normalizeHeader(`${property.label}${property.unit !== '—' ? `, ${property.unit}` : ''}`)) || headers.get(normalizeHeader(property.label))
  }))
  const sampleColumn = headers.get(normalizeHeader('Номер образца'))!
  const boreholeColumn = headers.get(normalizeHeader('Скважина'))!
  const depthColumn = headers.get(normalizeHeader('Глубина, м'))!
  const sourceColumn = headers.get(normalizeHeader('Отчёт / протокол'))!
  const codeColumn = headers.get(normalizeHeader('Код ИГЭ'))
  const layerColumn = headers.get(normalizeHeader('Конкретный слой'))
  const existingSamples = new Set((project.igePassports?.[key]?.labTests || []).map(test => test.sample.trim().toLocaleUpperCase('ru-RU')).filter(Boolean))
  const importedSamples = new Set<string>()
  const tests: LabTest[] = []
  for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex += 1) {
    const row = sheet.getRow(rowIndex)
    const rowValues = Array.from({ length: sheet.columnCount }, (_, index) => row.getCell(index + 1).value)
    if (rowValues.every(value => !textCell(value).trim())) continue
    if (codeColumn && getIgeKey(textCell(row.getCell(codeColumn).value)) !== key) continue
    const prefix = `Строка ${rowIndex}`
    const sample = textCell(row.getCell(sampleColumn).value).trim()
    const normalizedSample = sample.toLocaleUpperCase('ru-RU')
    if (!sample) errors.push(`${prefix}: не указан номер образца.`)
    else if (existingSamples.has(normalizedSample)) errors.push(`${prefix}: образец «${sample}» уже существует для ИГЭ ${code}.`)
    else if (importedSamples.has(normalizedSample)) errors.push(`${prefix}: номер образца «${sample}» повторяется в файле.`)
    else importedSamples.add(normalizedSample)
    const boreholeText = textCell(row.getCell(boreholeColumn).value).trim()
    const normalizedBorehole = boreholeText.toLocaleUpperCase('ru-RU')
    const boreholeMatches = boreholeText ? project.columns.filter(column => column.id === boreholeText || column.name.trim().toLocaleUpperCase('ru-RU') === normalizedBorehole) : []
    const column = boreholeMatches.length === 1 ? boreholeMatches[0] : null
    if (!boreholeText) errors.push(`${prefix}: не указана скважина.`)
    else if (!boreholeMatches.length) errors.push(`${prefix}: скважина «${boreholeText}» не найдена в проекте.`)
    else if (boreholeMatches.length > 1) errors.push(`${prefix}: наименование «${boreholeText}» соответствует нескольким скважинам; используйте технический идентификатор.`)
    const depthText = textCell(row.getCell(depthColumn).value).trim()
    const depth = numericCell(row.getCell(depthColumn).value)
    if (!depthText) errors.push(`${prefix}: не указана глубина.`)
    else if (depth === null || depth <= 0) errors.push(`${prefix}: глубина должна быть положительным конечным числом.`)
    const source = textCell(row.getCell(sourceColumn).value).trim()
    if (!source) errors.push(`${prefix}: не указан отчёт или протокол.`)
    const values: LabTest['values'] = {}
    for (const { property, columnIndex } of propertyColumns) {
      if (!columnIndex) continue
      const cellValue = row.getCell(columnIndex).value
      if (!textCell(cellValue).trim()) continue
      const value = numericCell(cellValue)
      if (value === null) errors.push(`${prefix}: «${property.label}» не является конечным числом.`)
      else values[property.key] = value
    }
    if (!Object.keys(values).length) errors.push(`${prefix}: не заполнено ни одной характеристики.`)
    let layerId = ''
    const layerText = layerColumn ? textCell(row.getCell(layerColumn).value).trim() : ''
    if (layerText && column) {
      const normalizedLayer = layerText.toLocaleUpperCase('ru-RU')
      const layerIndex = column.layers.findIndex(layer => `Слой ${column.layers.indexOf(layer) + 1} · ${layer.ige || '—'} · подошва ${layer.depth.toFixed(2).replace('.', ',')} м`.toLocaleUpperCase('ru-RU') === normalizedLayer)
      if (layerIndex >= 0) layerId = column.layers[layerIndex].id
      else errors.push(`${prefix}: слой «${layerText}» не найден в скважине «${column.name}».`)
    }
    tests.push({
      id: `lab-import-${Date.now()}-${rowIndex}-${Math.random()}`,
      sample,
      boreholeId: column?.id || '',
      layerId,
      depth,
      source,
      values
    })
  }
  if (!tests.length && !errors.length) errors.push('В файле нет заполненных строк для выбранного ИГЭ.')
  return { tests: errors.length ? [] : tests, errors }
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
    { header: 'Нерешённых проблем', key: 'issues', width: 22 },
    { header: 'Заполнено характеристик', key: 'characteristics', width: 25 },
    { header: 'Лабораторных испытаний', key: 'labTests', width: 24 },
    { header: 'Замечаний лаборатории', key: 'labIssues', width: 24 }
  ]
  const summaryItems = getCodeSummary(project)
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
      characteristics: `${item.characteristicFilled} / ${item.characteristicTotal}`,
      labTests: item.labTestCount,
      labIssues: item.labIssueCount
    })
    for (let columnIndex = 8; columnIndex <= 12; columnIndex += 1) row.getCell(columnIndex).numFmt = '0.00'
  }
  codeSummary.getRow(1).font = { bold: true }
  codeSummary.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFF0F' } }
  codeSummary.autoFilter = { from: 'A1', to: 'Q1' }
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

  const labSheet = workbook.addWorksheet('Испытания ИГЭ')
  labSheet.columns = [
    { header: 'Код ИГЭ', key: 'code', width: 14 },
    { header: 'Наименование ИГЭ', key: 'igeName', width: 28 },
    { header: 'Номер образца', key: 'sample', width: 20 },
    { header: 'Скважина', key: 'borehole', width: 24 },
    { header: 'Конкретный слой', key: 'layer', width: 38 },
    { header: 'Глубина, м', key: 'depth', width: 16 },
    { header: 'Отчёт / протокол', key: 'source', width: 42 },
    ...SOIL_CHARACTERISTICS.map(property => ({
      header: `${property.label}${property.unit !== '—' ? `, ${property.unit}` : ''}`,
      key: property.key,
      width: 24
    }))
  ]
  for (const item of summaryItems) {
    if (item.key === '__unassigned__') continue
    const passport = project.igePassports?.[item.key]
    for (const test of passport?.labTests || []) {
      const testColumn = project.columns.find(column => column.id === test.boreholeId)
      const layerIndex = testColumn?.layers.findIndex(layer => layer.id === test.layerId) ?? -1
      const linkedLayer = layerIndex >= 0 ? testColumn?.layers[layerIndex] : null
      const rowData: Record<string, ExcelJS.CellValue> = {
        code: item.code,
        igeName: passport?.name || '',
        sample: test.sample,
        borehole: testColumn?.name || '',
        layer: linkedLayer ? `Слой ${layerIndex + 1} · ${linkedLayer.ige || '—'} · подошва ${linkedLayer.depth.toFixed(2).replace('.', ',')} м` : '',
        depth: test.depth,
        source: test.source
      }
      for (const property of SOIL_CHARACTERISTICS) rowData[property.key] = test.values[property.key] ?? null
      const row = labSheet.addRow(rowData)
      row.getCell(6).numFmt = '0.00'
      for (let columnIndex = 8; columnIndex <= 17; columnIndex += 1) row.getCell(columnIndex).numFmt = '0.000'
    }
  }
  labSheet.getRow(1).font = { bold: true }
  labSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFF0F' } }
  labSheet.autoFilter = { from: 'A1', to: 'Q1' }
  labSheet.views = [{ state: 'frozen', ySplit: 1 }]

  const labStats = workbook.addWorksheet('Статистика ИГЭ')
  labStats.columns = [
    { header: 'Код ИГЭ', key: 'code', width: 14 },
    { header: 'Наименование ИГЭ', key: 'name', width: 28 },
    { header: 'Группа', key: 'group', width: 20 },
    { header: 'Характеристика', key: 'property', width: 38 },
    { header: 'Единица', key: 'unit', width: 14 },
    { header: 'n', key: 'count', width: 10 },
    { header: 'Минимум', key: 'min', width: 16 },
    { header: 'Максимум', key: 'max', width: 16 },
    { header: 'Среднее арифметическое', key: 'mean', width: 26 }
  ]
  for (const item of summaryItems) {
    if (item.key === '__unassigned__') continue
    const passport = project.igePassports?.[item.key]
    for (const statistic of getLabStatistics(passport)) {
      const property = SOIL_CHARACTERISTICS.find(candidate => candidate.key === statistic.key)!
      const row = labStats.addRow({
        code: item.code,
        name: passport?.name || '',
        group: property.group,
        property: property.label,
        unit: property.unit,
        count: statistic.count,
        min: statistic.min,
        max: statistic.max,
        mean: statistic.mean
      })
      for (let columnIndex = 7; columnIndex <= 9; columnIndex += 1) row.getCell(columnIndex).numFmt = '0.000'
    }
  }
  labStats.getRow(1).font = { bold: true }
  labStats.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFF0F' } }
  labStats.autoFilter = { from: 'A1', to: 'I1' }
  labStats.views = [{ state: 'frozen', ySplit: 1 }]

  const labBoreholeStats = workbook.addWorksheet('Статистика по скважинам')
  labBoreholeStats.columns = [
    { header: 'Код ИГЭ', key: 'code', width: 14 },
    { header: 'Наименование ИГЭ', key: 'name', width: 28 },
    { header: 'Скважина', key: 'borehole', width: 26 },
    { header: 'Группа', key: 'group', width: 20 },
    { header: 'Характеристика', key: 'property', width: 38 },
    { header: 'Единица', key: 'unit', width: 14 },
    { header: 'n', key: 'count', width: 10 },
    { header: 'Минимум', key: 'min', width: 16 },
    { header: 'Максимум', key: 'max', width: 16 },
    { header: 'Среднее арифметическое', key: 'mean', width: 26 }
  ]
  for (const item of summaryItems) {
    if (item.key === '__unassigned__') continue
    const passport = project.igePassports?.[item.key]
    for (const column of project.columns) {
      const tests = (passport?.labTests || []).filter(test => test.boreholeId === column.id)
      if (!tests.length) continue
      for (const statistic of getLabTestStatistics(tests)) {
        const property = SOIL_CHARACTERISTICS.find(candidate => candidate.key === statistic.key)!
        const row = labBoreholeStats.addRow({
          code: item.code,
          name: passport?.name || '',
          borehole: column.name,
          group: property.group,
          property: property.label,
          unit: property.unit,
          count: statistic.count,
          min: statistic.min,
          max: statistic.max,
          mean: statistic.mean
        })
        for (let columnIndex = 8; columnIndex <= 10; columnIndex += 1) row.getCell(columnIndex).numFmt = '0.000'
      }
    }
  }
  labBoreholeStats.getRow(1).font = { bold: true }
  labBoreholeStats.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFF0F' } }
  labBoreholeStats.autoFilter = { from: 'A1', to: 'J1' }
  labBoreholeStats.views = [{ state: 'frozen', ySplit: 1 }]

  const labControl = workbook.addWorksheet('Контроль лаборатории')
  labControl.columns = [
    { header: 'Код ИГЭ', key: 'code', width: 14 },
    { header: 'Образец', key: 'sample', width: 22 },
    { header: 'Скважина', key: 'borehole', width: 26 },
    { header: 'Глубина, м', key: 'depth', width: 16 },
    { header: 'Тип замечания', key: 'kind', width: 28 },
    { header: 'Замечание', key: 'title', width: 46 },
    { header: 'Пояснение', key: 'detail', width: 80 },
    { header: 'Отчёт / протокол', key: 'source', width: 42 }
  ]
  const projectLabIssues = getProjectLabIssues(project)
  for (const issue of projectLabIssues) {
    const test = project.igePassports?.[issue.code]?.labTests?.find(item => item.id === issue.testId)
    const row = labControl.addRow({
      code: issue.code,
      sample: issue.sample,
      borehole: project.columns.find(column => column.id === test?.boreholeId)?.name || '',
      depth: test?.depth ?? null,
      kind: LAB_ISSUE_LABELS[issue.kind],
      title: issue.title,
      detail: issue.detail,
      source: test?.source || ''
    })
    row.getCell(4).numFmt = '0.00'
  }
  labControl.getRow(1).font = { bold: true }
  labControl.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFF0F' } }
  labControl.autoFilter = { from: 'A1', to: 'H1' }
  labControl.views = [{ state: 'frozen', ySplit: 1 }]

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

  const coreControl = workbook.addWorksheet('Контроль ядра')
  coreControl.columns = [
    { header: 'Серьёзность', key: 'severity', width: 16 },
    { header: 'Тип', key: 'kind', width: 28 },
    { header: 'Скважина', key: 'borehole', width: 26 },
    { header: 'Слой / испытание', key: 'entity', width: 32 },
    { header: 'Паспорт ИГЭ', key: 'passport', width: 20 },
    { header: 'Замечание', key: 'title', width: 48 },
    { header: 'Пояснение', key: 'detail', width: 90 }
  ]
  const coreIssues = validateCoreModel(createCoreModel(project))
  for (const issue of coreIssues) {
    coreControl.addRow({
      severity: issue.severity === 'error' ? 'Ошибка' : 'Предупреждение',
      kind: issue.kind,
      borehole: project.columns.find(column => column.id === issue.boreholeId)?.name || issue.boreholeId || '',
      entity: issue.layerId || issue.testId || '',
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
      )) ||
      (passport.labTests !== undefined && (
        !Array.isArray(passport.labTests) || passport.labTests.some(test =>
          !test || typeof test.id !== 'string' || typeof test.sample !== 'string' || typeof test.boreholeId !== 'string' ||
          (test.layerId !== undefined && typeof test.layerId !== 'string') ||
          !isNullableFiniteNumber(test.depth) || typeof test.source !== 'string' ||
          !test.values || typeof test.values !== 'object' || Array.isArray(test.values) ||
          Object.entries(test.values).some(([key, value]) =>
            !SOIL_CHARACTERISTICS.some(property => property.key === key) || typeof value !== 'number' || !Number.isFinite(value)
          )
        )
      ))
    )
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
