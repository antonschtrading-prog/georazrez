export type CodeStatus = 'topology' | 'vertical-only' | 'ambiguous' | 'not-found' | 'manual' | 'interpolated'

export interface CodeCandidate {
  code: string
  x: number
  y: number
  reason: string
  handle?: string
  circleHandle?: string
}

export interface BoreholeSourceRefs {
  sideLines: string[]
  nameText: string
}

export interface LayerSourceRefs {
  depthText: string
  codeTexts: string[]
}

export interface Layer {
  id: string
  depth: number
  y: number
  ige: string
  status: CodeStatus
  candidates: CodeCandidate[]
  source: string
  depthSource?: 'dxf' | 'manual' | 'interpolated'
  sourceRefs?: LayerSourceRefs
}

export interface ExcludedLabel {
  text: string
  handle: string
  reason: string
}

export type BoreholeKind = 'dxf' | 'fictitious'

/** Сохранённое правило расчётной скважины; не является исходным объектом DXF. */
export interface FictitiousInterpolation {
  method: 'linear'
  leftBoreholeId: string
  rightBoreholeId: string
  /** Доля расстояния от левой исходной скважины к правой. */
  fraction: number
  note: string
  createdAt: string
  /** Детерминированный слепок исходных данных, на которых подтверждено правило. */
  sourceFingerprint?: string
}

export interface Borehole {
  id: string
  index: number
  name: string
  sourceNamed: boolean
  kind?: BoreholeKind
  interpolation?: FictitiousInterpolation | null
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
  sourceRefs?: BoreholeSourceRefs
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

export type ActivityCategory = 'system' | 'geology' | 'correlation' | 'gap' | 'fictitious' | 'passport' | 'review'

export interface ActivityItem {
  id: string
  type: 'system' | 'manual'
  text: string
  at: string
  /** Структурированные связи добавляются новыми командами; старые записи остаются совместимыми. */
  category?: ActivityCategory
  boreholeIds?: string[]
  layerIds?: string[]
  passportKeys?: string[]
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

export const SOIL_HATCHES = ['none', 'diagonal', 'cross', 'dots', 'horizontal', 'vertical', 'grid'] as const
export type SoilHatch = typeof SOIL_HATCHES[number]

export const SOIL_HATCH_LABELS: Record<SoilHatch, string> = {
  none: 'Без штриховки',
  diagonal: 'Диагональная',
  cross: 'Встречная диагональная',
  dots: 'Точечная',
  horizontal: 'Горизонтальная',
  vertical: 'Вертикальная',
  grid: 'Сетка'
}

/** Только условное оформление профиля, не классификация и не характеристика грунта. */
export interface SoilAppearance {
  color: string
  hatch: SoilHatch
}

export interface IgePassport {
  name: string
  description: string
  notes: string
  characteristics?: Partial<Record<SoilCharacteristicKey, SoilCharacteristicRecord>>
  appearance?: SoilAppearance
}

export interface ManualCorrelation {
  id: string
  leftLayerId: string
  rightLayerId: string
  note: string
  createdAt: string
}

export type GapDecisionKind = 'accepted' | 'pinchout'

export interface GapDecision {
  id: string
  leftLayerId: string | null
  rightLayerId: string | null
  kind: GapDecisionKind
  /** Доля расстояния от левой скважины к правой; используется только для выклинивания. */
  fraction: number | null
  note: string
  createdAt: string
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
  manualCorrelations?: ManualCorrelation[]
  gapDecisions?: GapDecision[]
  activity: ActivityItem[]
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

export type LayerDepthIssue = 'invalid-depth' | 'depth-order'

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
  boreholeId: string
  layerId: string
}
