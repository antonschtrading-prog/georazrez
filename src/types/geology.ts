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

export interface CodeSummaryItem {
  key: string
  code: string
  variants: string[]
  layerCount: number
  boreholeCount: number
  minDepth: number
  maxDepth: number
  manualCount: number
  issueCount: number
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

export function getCodeSummary(project: GeoProject): CodeSummaryItem[] {
  type Group = CodeSummaryItem & { boreholeIds: Set<string>; variantSet: Set<string>; targetHasIssue: boolean }
  const groups = new Map<string, Group>()
  for (const column of project.columns) {
    if (column.isExcluded) continue
    for (const layer of column.layers) {
      const rawCode = layer.ige.trim()
      const normalized = rawCode.toLocaleUpperCase('ru-RU')
      const key = normalized || '__unassigned__'
      const hasIssue = layer.status === 'ambiguous' || layer.status === 'not-found'
      let group = groups.get(key)
      if (!group) {
        group = {
          key,
          code: rawCode || '—',
          variants: [],
          layerCount: 0,
          boreholeCount: 0,
          minDepth: layer.depth,
          maxDepth: layer.depth,
          manualCount: 0,
          issueCount: 0,
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
    layerCount: group.layerCount,
    boreholeCount: group.boreholeIds.size,
    minDepth: group.minDepth,
    maxDepth: group.maxDepth,
    manualCount: group.manualCount,
    issueCount: group.issueCount,
    boreholeId: group.boreholeId,
    layerId: group.layerId
  })).sort((a, b) => {
    if (a.key === '__unassigned__') return 1
    if (b.key === '__unassigned__') return -1
    return a.code.localeCompare(b.code, 'ru', { numeric: true })
  })
}
