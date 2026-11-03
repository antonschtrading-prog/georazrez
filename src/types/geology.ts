export type CodeStatus = 'topology' | 'vertical-only' | 'ambiguous' | 'not-found' | 'manual'

export interface CodeCandidate {
  code: string
  x: number
  y: number
  reason: string
}

export interface Layer {
  id: string
  depth: number
  y: number
  ige: string
  status: CodeStatus
  candidates: CodeCandidate[]
  source: string
  depthSource?: 'dxf' | 'manual'
}

export interface ExcludedLabel {
  text: string
  handle: string
  reason: string
}

export interface Borehole {
  id: string
  index: number
  name: string
  sourceNamed: boolean
  x: number
  top: number
  bottom: number
  levels: number[]
  pk: number
  coordX: number | null
  coordY: number | null
  layers: Layer[]
  excluded: ExcludedLabel[]
  isExcluded?: boolean
  exclusionReason?: string
  isReviewed?: boolean
  reviewedAt?: string
}

export interface GeoSegment {
  x1: number
  y1: number
  x2: number
  y2: number
  layer?: string
  handle?: string
}

export interface GeoText {
  text: string
  x: number
  y: number
  handle?: string
  layer?: string
}

export interface GeoCircle {
  x: number
  y: number
  r: number
  handle?: string
}

export interface ActivityItem {
  id: string
  type: 'system' | 'manual'
  text: string
  at: string
}

export const SOIL_CHARACTERISTICS = [
  { key: 'density', group: 'Физические', label: 'Плотность грунта ρ', unit: 'г/см³' },
  { key: 'particleDensity', group: 'Физические', label: 'Плотность частиц грунта ρs', unit: 'г/см³' },
  { key: 'dryDensity', group: 'Физические', label: 'Плотность сухого грунта ρd', unit: 'г/см³' },
  { key: 'moisture', group: 'Физические', label: 'Влажность w', unit: '%' },
  { key: 'voidRatio', group: 'Физические', label: 'Коэффициент пористости e', unit: '—' },
  { key: 'plasticityIndex', group: 'Физические', label: 'Число пластичности Ip', unit: '%' },
  { key: 'liquidityIndex', group: 'Физические', label: 'Показатель текучести IL', unit: '—' },
  { key: 'cohesion', group: 'Прочностные', label: 'Удельное сцепление c', unit: 'кПа' },
  { key: 'frictionAngle', group: 'Прочностные', label: 'Угол внутреннего трения φ', unit: '°' },
  { key: 'deformationModulus', group: 'Деформационные', label: 'Модуль деформации E', unit: 'МПа' }
] as const

export type SoilCharacteristicKey = typeof SOIL_CHARACTERISTICS[number]['key']
export type SoilCharacteristicField = 'standard' | 'design' | 'source'

export interface SoilCharacteristicRecord {
  standard: number | null
  design: number | null
  source: string
}

export type LabTestField = 'sample' | 'boreholeId' | 'depth' | 'source'

export interface LabTest {
  id: string
  sample: string
  boreholeId: string
  depth: number | null
  source: string
  values: Partial<Record<SoilCharacteristicKey, number>>
}

export interface IgePassport {
  name: string
  description: string
  notes: string
  characteristics?: Partial<Record<SoilCharacteristicKey, SoilCharacteristicRecord>>
  labTests?: LabTest[]
}

export interface GeoProject {
  schemaVersion: 1
  id: string
  title: string
  sourceFile: string
  axisFile: string
  horizontalScale: number
  verticalScale: number
  startPk: number
  axis: number[][]
  columns: Borehole[]
  geometry: {
    segments: GeoSegment[]
    circles: GeoCircle[]
    texts: GeoText[]
  }
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
  igePassports?: Record<string, IgePassport>
  activity: ActivityItem[]
}

export type LabIssueKind =
  | 'missing-sample'
  | 'duplicate-sample'
  | 'missing-borehole'
  | 'unknown-borehole'
  | 'missing-depth'
  | 'invalid-depth'
  | 'depth-out-of-range'
  | 'missing-source'
  | 'empty-values'

export interface LabDataIssue {
  id: string
  kind: LabIssueKind
  code: string
  testId: string
  sample: string
  title: string
  detail: string
}

export const LAB_ISSUE_LABELS: Record<LabIssueKind, string> = {
  'missing-sample': 'Нет номера образца',
  'duplicate-sample': 'Повтор номера образца',
  'missing-borehole': 'Не указана скважина',
  'unknown-borehole': 'Скважина не найдена',
  'missing-depth': 'Не указана глубина',
  'invalid-depth': 'Некорректная глубина',
  'depth-out-of-range': 'Глубже последней подошвы',
  'missing-source': 'Нет отчёта или протокола',
  'empty-values': 'Нет значений характеристик'
}

export function getLabTestIssues(columns: Borehole[], code: string, passport: IgePassport | null | undefined): LabDataIssue[] {
  const tests = passport?.labTests || []
  const sampleCounts = new Map<string, number>()
  for (const test of tests) {
    const sample = test.sample.trim().toLocaleUpperCase('ru-RU')
    if (sample) sampleCounts.set(sample, (sampleCounts.get(sample) || 0) + 1)
  }
  const issues: LabDataIssue[] = []
  const add = (test: LabTest, kind: LabIssueKind, detail: string) => {
    const sample = test.sample.trim() || 'Без номера'
    issues.push({
      id: `lab-${kind}-${test.id}`,
      kind,
      code,
      testId: test.id,
      sample,
      title: `${sample}: ${LAB_ISSUE_LABELS[kind]}`,
      detail
    })
  }
  for (const test of tests) {
    const normalizedSample = test.sample.trim().toLocaleUpperCase('ru-RU')
    if (!normalizedSample) add(test, 'missing-sample', 'Укажите номер или обозначение образца из лабораторного документа.')
    else if ((sampleCounts.get(normalizedSample) || 0) > 1) add(test, 'duplicate-sample', 'Такой номер уже используется для другого образца этого ИГЭ. Проверьте, не продублирована ли запись.')
    const column = test.boreholeId ? columns.find(item => item.id === test.boreholeId) : null
    if (!test.boreholeId) add(test, 'missing-borehole', 'Выберите скважину, из которой отобран образец.')
    else if (!column) add(test, 'unknown-borehole', 'Ссылка на скважину отсутствует в текущем проекте. Выберите скважину вручную.')
    if (test.depth === null) add(test, 'missing-depth', 'Укажите глубину отбора образца.')
    else if (!Number.isFinite(test.depth) || test.depth <= 0) add(test, 'invalid-depth', 'Глубина отбора должна быть положительным конечным числом.')
    else if (column?.layers.length) {
      const maximumDepth = Math.max(...column.layers.map(layer => layer.depth).filter(Number.isFinite))
      if (Number.isFinite(maximumDepth) && test.depth > maximumDepth) {
        add(test, 'depth-out-of-range', `Глубина ${test.depth.toFixed(2).replace('.', ',')} м больше последней подошвы ${maximumDepth.toFixed(2).replace('.', ',')} м. Это предупреждение для ручной проверки, а не автоматическое исправление.`)
      }
    }
    if (!test.source.trim()) add(test, 'missing-source', 'Укажите отчёт, протокол или другой источник результата.')
    if (!SOIL_CHARACTERISTICS.some(property => Number.isFinite(test.values[property.key]))) {
      add(test, 'empty-values', 'Для образца не заполнено ни одной характеристики.')
    }
  }
  return issues
}

export function getProjectLabIssues(project: GeoProject): LabDataIssue[] {
  return Object.entries(project.igePassports || {}).flatMap(([code, passport]) => getLabTestIssues(project.columns, code, passport))
}

export type IssueKind = 'missing-name' | 'ambiguous-code' | 'missing-code' | 'invalid-depth' | 'depth-order'

export interface GeoIssue {
  id: string
  kind: IssueKind
  boreholeId: string
  layerId?: string
  title: string
  detail: string
  candidates?: string[]
}

export function formatPk(value: number) {
  const sign = value < 0 ? '−' : ''
  const abs = Math.abs(value)
  const km = Math.floor(abs / 100)
  const meters = abs - km * 100
  return `${sign}${km}+${meters.toFixed(2).padStart(5, '0')}`
}

export function getIgeKey(code: string): string {
  return code.trim().toLocaleUpperCase('ru-RU') || '__unassigned__'
}

export function getCharacteristicCoverage(passport: IgePassport | null | undefined) {
  let filled = 0
  let sourced = 0
  for (const property of SOIL_CHARACTERISTICS) {
    const record = passport?.characteristics?.[property.key]
    if (record && Number.isFinite(record.standard)) filled += 1
    if (record && Number.isFinite(record.design)) filled += 1
    if (record?.source.trim()) sourced += 1
  }
  return { filled, sourced, total: SOIL_CHARACTERISTICS.length * 2 }
}

export interface LabCharacteristicStatistic {
  key: SoilCharacteristicKey
  count: number
  min: number | null
  max: number | null
  mean: number | null
}

export function getLabStatistics(passport: IgePassport | null | undefined): LabCharacteristicStatistic[] {
  return SOIL_CHARACTERISTICS.map(property => {
    const values = (passport?.labTests || [])
      .map(test => test.values[property.key])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    return {
      key: property.key,
      count: values.length,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
    }
  })
}

export interface LayerNeighborMatch {
  layerId: string
  depth: number
}

export interface LayerNeighbor {
  boreholeId: string
  name: string
  pk: number
  matches: LayerNeighborMatch[]
}

export interface LayerNeighbors {
  previous: LayerNeighbor | null
  next: LayerNeighbor | null
}

export function getLayerNeighbors(project: GeoProject, boreholeId: string, layerId: string): LayerNeighbors {
  const column = project.columns.find(item => item.id === boreholeId)
  const layer = column?.layers.find(item => item.id === layerId)
  if (!column || !layer || column.isExcluded || getIgeKey(layer.ige) === '__unassigned__') return { previous: null, next: null }
  const key = getIgeKey(layer.ige)
  const activeColumns = project.columns.filter(item => !item.isExcluded)
  const index = activeColumns.findIndex(item => item.id === boreholeId)
  const neighbor = (item: Borehole | undefined): LayerNeighbor | null => item ? {
    boreholeId: item.id,
    name: item.name,
    pk: item.pk,
    matches: item.layers.filter(candidate => getIgeKey(candidate.ige) === key).map(candidate => ({ layerId: candidate.id, depth: candidate.depth }))
  } : null
  return { previous: neighbor(activeColumns[index - 1]), next: neighbor(activeColumns[index + 1]) }
}

export type LayerDepthIssue = 'invalid-depth' | 'depth-order'

export function getLayerDepthIssue(layers: Layer[], index: number): LayerDepthIssue | null {
  const depth = layers[index]?.depth
  if (!Number.isFinite(depth) || depth <= 0) return 'invalid-depth'
  const previous = layers[index - 1]?.depth
  if (previous !== undefined && Number.isFinite(previous) && depth <= previous) return 'depth-order'
  return null
}

export interface CodeSummaryItem {
  key: string
  code: string
  variants: string[]
  passportName: string
  layerCount: number
  boreholeCount: number
  minDepth: number
  maxDepth: number
  minThickness: number
  maxThickness: number
  averageThickness: number
  manualCount: number
  issueCount: number
  characteristicFilled: number
  characteristicTotal: number
  labTestCount: number
  labIssueCount: number
  boreholeId: string
  layerId: string
}

export function getIssues(project: GeoProject): GeoIssue[] {
  const issues: GeoIssue[] = []
  for (const column of project.columns) {
    if (column.isExcluded) continue
    if (!column.sourceNamed) {
      issues.push({
        id: `name-${column.id}`,
        kind: 'missing-name',
        boreholeId: column.id,
        title: `${column.name}: нет подписи в DXF`,
        detail: 'Геометрия подтверждена. Назначьте имя вручную или оставьте объект на проверке.'
      })
    }
    for (const [layerIndex, layer] of column.layers.entries()) {
      const depthIssue = getLayerDepthIssue(column.layers, layerIndex)
      if (depthIssue) {
        const depth = Number.isFinite(layer.depth) ? layer.depth.toFixed(2).replace('.', ',') : '—'
        const previous = column.layers[layerIndex - 1]?.depth
        issues.push({
          id: `${depthIssue}-${layer.id}`,
          kind: depthIssue,
          boreholeId: column.id,
          layerId: layer.id,
          title: `${column.name} · ${depth} м`,
          detail: depthIssue === 'invalid-depth'
            ? 'Глубина подошвы должна быть положительным конечным числом'
            : `Порядок подошв нарушен: предыдущая глубина ${(previous ?? 0).toFixed(2).replace('.', ',')} м`
        })
      }
      if (layer.status === 'ambiguous') {
        const candidates = [...new Set(layer.candidates.map(c => c.code))]
        issues.push({
          id: `ambiguous-${layer.id}`,
          kind: 'ambiguous-code',
          boreholeId: column.id,
          layerId: layer.id,
          title: `${column.name} · ${layer.depth.toFixed(2).replace('.', ',')} м`,
          detail: `Конкурирующие коды ИГЭ: ${candidates.join(' / ')}`,
          candidates
        })
      } else if (layer.status === 'not-found') {
        issues.push({
          id: `missing-${layer.id}`,
          kind: 'missing-code',
          boreholeId: column.id,
          layerId: layer.id,
          title: `${column.name} · ${layer.depth.toFixed(2).replace('.', ',')} м`,
          detail: 'Код ИГЭ не найден по надёжной топологической связи'
        })
      }
    }
  }
  return issues
}

export function getLayerThickness(layers: Layer[], index: number): number {
  return layers[index].depth - (layers[index - 1]?.depth ?? 0)
}

export function getCodeSummary(project: GeoProject): CodeSummaryItem[] {
  type Group = CodeSummaryItem & { boreholeIds: Set<string>; variantSet: Set<string>; targetHasIssue: boolean; thicknessSum: number }
  const groups = new Map<string, Group>()
  const projectLabIssues = getProjectLabIssues(project)
  for (const column of project.columns) {
    if (column.isExcluded) continue
    for (const [layerIndex, layer] of column.layers.entries()) {
      const rawCode = layer.ige.trim()
      const key = getIgeKey(rawCode)
      const hasIssue = Boolean(getLayerDepthIssue(column.layers, layerIndex)) || layer.status === 'ambiguous' || layer.status === 'not-found'
      const thickness = getLayerThickness(column.layers, layerIndex)
      let group = groups.get(key)
      if (!group) {
        const characteristicCoverage = getCharacteristicCoverage(project.igePassports?.[key])
        group = {
          key,
          code: rawCode || '—',
          variants: [],
          passportName: project.igePassports?.[key]?.name.trim() || '',
          layerCount: 0,
          boreholeCount: 0,
          minDepth: layer.depth,
          maxDepth: layer.depth,
          minThickness: thickness,
          maxThickness: thickness,
          averageThickness: thickness,
          thicknessSum: 0,
          manualCount: 0,
          issueCount: 0,
          characteristicFilled: characteristicCoverage.filled,
          characteristicTotal: characteristicCoverage.total,
          labTestCount: project.igePassports?.[key]?.labTests?.length || 0,
          labIssueCount: projectLabIssues.filter(issue => issue.code === key).length,
          boreholeId: column.id,
          layerId: layer.id,
          boreholeIds: new Set(),
          variantSet: new Set(),
          targetHasIssue: false
        }
        groups.set(key, group)
      }
      group.layerCount += 1
      group.minDepth = Math.min(group.minDepth, layer.depth)
      group.maxDepth = Math.max(group.maxDepth, layer.depth)
      group.minThickness = Math.min(group.minThickness, thickness)
      group.maxThickness = Math.max(group.maxThickness, thickness)
      group.thicknessSum += thickness
      group.boreholeIds.add(column.id)
      if (rawCode) group.variantSet.add(rawCode)
      if (layer.status === 'manual') group.manualCount += 1
      if (hasIssue) group.issueCount += 1
      if (hasIssue && !group.targetHasIssue) {
        group.boreholeId = column.id
        group.layerId = layer.id
        group.targetHasIssue = true
      }
    }
  }
  return [...groups.values()].map(group => ({
    key: group.key,
    code: group.variantSet.size === 1 ? [...group.variantSet][0] : group.code,
    variants: [...group.variantSet].sort((a, b) => a.localeCompare(b, 'ru')),
    passportName: group.passportName,
    layerCount: group.layerCount,
    boreholeCount: group.boreholeIds.size,
    minDepth: group.minDepth,
    maxDepth: group.maxDepth,
    minThickness: group.minThickness,
    maxThickness: group.maxThickness,
    averageThickness: group.thicknessSum / group.layerCount,
    manualCount: group.manualCount,
    issueCount: group.issueCount,
    characteristicFilled: group.characteristicFilled,
    characteristicTotal: group.characteristicTotal,
    labTestCount: group.labTestCount,
    labIssueCount: group.labIssueCount,
    boreholeId: group.boreholeId,
    layerId: group.layerId
  })).sort((a, b) => {
    if (a.key === '__unassigned__') return 1
    if (b.key === '__unassigned__') return -1
    return a.code.localeCompare(b.code, 'ru', { numeric: true })
  })
}
