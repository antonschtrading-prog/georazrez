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

export interface IgePassport {
  name: string
  description: string
  notes: string
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
  for (const column of project.columns) {
    if (column.isExcluded) continue
    for (const [layerIndex, layer] of column.layers.entries()) {
      const rawCode = layer.ige.trim()
      const key = getIgeKey(rawCode)
      const hasIssue = Boolean(getLayerDepthIssue(column.layers, layerIndex)) || layer.status === 'ambiguous' || layer.status === 'not-found'
      const thickness = getLayerThickness(column.layers, layerIndex)
      let group = groups.get(key)
      if (!group) {
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
    boreholeId: group.boreholeId,
    layerId: group.layerId
  })).sort((a, b) => {
    if (a.key === '__unassigned__') return 1
    if (b.key === '__unassigned__') return -1
    return a.code.localeCompare(b.code, 'ru', { numeric: true })
  })
}
