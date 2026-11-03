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
  activity: ActivityItem[]
}

export type IssueKind = 'missing-name' | 'ambiguous-code' | 'missing-code'

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

export function getIssues(project: GeoProject): GeoIssue[] {
  const issues: GeoIssue[] = []
  for (const column of project.columns) {
    if (!column.sourceNamed) {
      issues.push({
        id: `name-${column.id}`,
        kind: 'missing-name',
        boreholeId: column.id,
        title: `${column.name}: нет подписи в DXF`,
        detail: 'Геометрия подтверждена. Назначьте имя вручную или оставьте объект на проверке.'
      })
    }
    for (const layer of column.layers) {
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
