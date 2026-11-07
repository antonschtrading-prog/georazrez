import {
  getCharacteristicCoverage,
  getHatchSignature,
  getIgeKey,
  SOIL_HATCHES,
  type ActivityCategory,
  type ActivityItem,
  type Borehole,
  type BoreholeKind,
  type BoreholeSourceRefs,
  type CodeCandidate,
  type CodeStatus,
  type CodeSummaryItem,
  type GeoIssue,
  type GeoProject,
  type GeoSegment,
  type FictitiousInterpolation,
  type GapDecision,
  type HatchLegendEntry,
  type IgePassport,
  type IssueKind,
  type LayerDepthIssue,
  type LayerNeighbor,
  type LayerNeighbors,
  type LayerSourceRefs,
  type ManualCorrelation,
  type SoilAppearance,
  type SoilCharacteristicKey,
  type SoilCharacteristicRecord
} from '@/types/geology'

export const CORE_SCHEMA_VERSION = 1 as const

export interface CoreLayer {
  id: string
  boreholeId: string
  ordinal: number
  bottomDepth: number
  drawingY: number
  igeCode: string
  igeKey: string | null
  codeStatus: CodeStatus
  candidates: CodeCandidate[]
  codeSource: string
  depthSource: 'dxf' | 'manual' | 'interpolated'
  sourceRefs: LayerSourceRefs
}

export interface CoreBorehole {
  id: string
  index: number
  name: string
  sourceNamed: boolean
  kind: BoreholeKind
  interpolation: FictitiousInterpolation | null
  sourceRefs: BoreholeSourceRefs
  drawing: {
    x: number
    top: number
    bottom: number
    levels: number[]
  }
  pk: number
  coordinates: { x: number; y: number } | null
  included: boolean
  exclusionReason: string
  review: { reviewed: boolean; reviewedAt: string }
  layers: CoreLayer[]
  excludedLabels: Borehole['excluded']
}

export interface CoreIgePassport {
  key: string
  name: string
  description: string
  notes: string
  characteristics: Partial<Record<SoilCharacteristicKey, SoilCharacteristicRecord>>
  appearance?: SoilAppearance
}

export interface CoreModel {
  schemaVersion: typeof CORE_SCHEMA_VERSION
  project: {
    id: string
    title: string
    sourceFile: string
    axisFile: string
    horizontalScale: number
    verticalScale: number
    startPk: number
    axis: number[][]
    geometry: GeoProject['geometry']
    bounds: GeoProject['bounds']
    activity: ActivityItem[]
  }
  boreholes: CoreBorehole[]
  passports: Record<string, CoreIgePassport>
  manualCorrelations: ManualCorrelation[]
  gapDecisions: GapDecision[]
  hatchLegend?: HatchLegendEntry[]
}

export interface CoreInterpolationPreviewLayer {
  ordinal: number
  depth: number
  leftDepth: number
  rightDepth: number
  leftPresent: boolean
  rightPresent: boolean
  /** Сторона исходной скважины, у которой отсутствующий слой явно выклинивается. */
  pinchoutAt: 'left' | 'right' | null
  code: string
  leftCode: string
  rightCode: string
  codeAgreed: boolean
}

export interface CoreFictitiousPreview {
  leftBoreholeId: string
  rightBoreholeId: string
  leftName: string
  rightName: string
  fraction: number
  method: FictitiousInterpolation['method']
  warnings: string[]
  x: number
  top: number
  bottom: number
  pk: number
  coordinates: { x: number; y: number } | null
  layers: CoreInterpolationPreviewLayer[]
}

export type CoreBoundaryStatus = 'connected' | 'left-only' | 'right-only' | 'invalid'
export type CoreBoundaryIssueKind = 'invalid-depth' | 'invalid-scale' | 'crossing' | 'invalid-pinchout'

export interface CoreBoundaryIssue {
  kind: CoreBoundaryIssueKind
  detail: string
}

export interface CoreBoundaryItem {
  id: string
  ordinal: number
  leftOrdinal: number | null
  rightOrdinal: number | null
  leftBoreholeId: string
  rightBoreholeId: string
  leftBoreholeName: string
  rightBoreholeName: string
  leftPk: number
  rightPk: number
  leftLayerId: string | null
  rightLayerId: string | null
  leftDepth: number | null
  rightDepth: number | null
  leftCode: string
  rightCode: string
  x1: number
  y1: number | null
  x2: number
  y2: number | null
  status: CoreBoundaryStatus
  issues: CoreBoundaryIssue[]
  manual: boolean
  manualCorrelation: boolean
  correlationId: string | null
  correlationNote: string
  gapDecisionId: string | null
  gapDecisionKind: GapDecision['kind'] | null
  gapDecisionNote: string
  pinchoutFraction: number | null
  /** Верхняя и нижняя линии заменяются явной геометрией точки выклинивания. */
  pinchoutId: string | null
}

export interface CorePinchoutGeometry {
  id: string
  decisionId: string
  boundaryId: string
  upperBoundaryId: string | null
  side: 'left' | 'right'
  x: number
  y: number
  lowerX: number
  lowerY: number
  upperLeftX: number
  upperLeftY: number
  upperRightX: number
  upperRightY: number
}

export interface CoreInactiveGapDecision {
  decision: GapDecision
  description: string
}

export interface CoreBoundaryModel {
  items: CoreBoundaryItem[]
  connected: number
  gaps: number
  openGaps: number
  decidedGaps: number
  invalid: number
  crossings: number
  pinchouts: CorePinchoutGeometry[]
  inactiveGapDecisions: CoreInactiveGapDecision[]
}

export type CoreInterpolationIssueKind = 'fictitious-outdated' | 'fictitious-invalid' | 'fictitious-manual'
export type CoreReviewKind = IssueKind | 'invalid-boundary' | CoreInterpolationIssueKind

/** Одна задача проекта: исходная геология, граница или производное правило. */
export interface CoreReviewItem {
  id: string
  source: 'geology' | 'boundary' | 'interpolation'
  kind: CoreReviewKind
  boreholeId: string
  layerId?: string
  boundaryId?: string
  title: string
  detail: string
  candidates?: string[]
}

export interface CoreDxfExtraction {
  geo: GeoProject['geometry']
  columns: {
    x: number
    sideTop: number
    sideBottom: number
    levels: number[]
    verticals: GeoSegment[]
  }[]
  names: string[]
  nameHandles: string[]
  depths: {
    accepted: { depth: number; y: number; text: { handle?: string } }[]
    excluded: Borehole['excluded']
  }[]
  codes: {
    depth: number
    ige: string
    status: CodeStatus
    candidates: CodeCandidate[]
  }[][]
}

export interface CoreImportMetadata {
  title: string
  sourceFile: string
  axisFile: string
  horizontalScale?: number
  verticalScale?: number
  startPk?: number
}

export type CoreIssueKind =
  | 'invalid-scale'
  | 'invalid-axis'
  | 'invalid-bounds'
  | 'duplicate-borehole-id'
  | 'duplicate-layer-id'
  | 'invalid-depth'
  | 'depth-order'
  | 'invalid-coordinates'
  | 'invalid-passport-key'
  | 'invalid-correlation'
  | 'duplicate-correlation'
  | 'invalid-source-reference'
  | 'invalid-gap-decision'
  | 'duplicate-gap-decision'
  | 'invalid-fictitious-rule'
  | 'invalid-soil-appearance'
  | 'invalid-hatch-legend'

export interface CoreModelIssue {
  id: string
  kind: CoreIssueKind
  severity: 'error'
  title: string
  detail: string
  boreholeId?: string
  layerId?: string
  passportKey?: string
}

const clonePassport = (key: string, passport: IgePassport): CoreIgePassport => ({
  key,
  name: passport.name,
  description: passport.description,
  notes: passport.notes,
  characteristics: Object.fromEntries(
    Object.entries(passport.characteristics || {}).map(([property, record]) => [property, { ...record }])
  ),
  ...(passport.appearance ? { appearance: { ...passport.appearance } } : {})
})

/** Пикетаж вычисляется из исходной геометрии, без изменения координат DXF. */
export function getCoreDrawingPk(x: number, originX: number, horizontalScale: number): number {
  return (x - originX) * (horizontalScale / 1000)
}

/**
 * Рабочая ось сортируется и очищается только от доказанных повторов.
 * Исходный массив проекта не изменяется; конфликтующие дубликаты остаются ошибкой.
 */
export function dedupeCoreAxis(points: number[][]): number[][] {
  if (points.length < 2 || points.some(point => point.length < 3 || point.slice(0, 3).some(value => !Number.isFinite(Number(value))))) {
    throw new Error('Для интерполяции нужны минимум две строки с конечными ПК, X и Y')
  }
  const sorted = points.map(point => point.map(Number)).sort((a, b) => a[0] - b[0])
  const result: number[][] = []
  for (const point of sorted) {
    const last = result[result.length - 1]
    if (last && last[0] === point[0]) {
      if (Math.abs(last[1] - point[1]) > 0.0005 || Math.abs(last[2] - point[2]) > 0.0005) {
        throw new Error(`Одинаковый ПК с разными координатами: ${point[0]}`)
      }
      continue
    }
    result.push(point)
  }
  return result
}

/** Линейная интерполяция по рабочей оси; вне диапазона координаты не выдумываются. */
export function coreAxisXY(points: number[][], pk: number): [number, number] | [null, null] {
  const axis = dedupeCoreAxis(points)
  if (!Number.isFinite(pk) || pk < axis[0][0] || pk > axis[axis.length - 1][0]) return [null, null]
  let index = 0
  while (index < axis.length - 2 && axis[index + 1][0] <= pk) index += 1
  const a = axis[index]
  const b = axis[index + 1]
  const fraction = (pk - a[0]) / (b[0] - a[0])
  return [a[1] + fraction * (b[1] - a[1]), a[2] + fraction * (b[2] - a[2])]
}

function cloneCoreGeometry(geometry: GeoProject['geometry']): GeoProject['geometry'] {
  return {
    segments: geometry.segments.map(segment => ({ ...segment })),
    circles: geometry.circles.map(circle => ({ ...circle })),
    texts: geometry.texts.map(text => ({ ...text })),
    ...(geometry.hatches ? {
      hatches: geometry.hatches.map(hatch => ({
        ...hatch,
        issues: [...hatch.issues],
        paths: hatch.paths.map(path => ({ ...path, points: path.points.map(point => [...point]), issues: [...path.issues] }))
      }))
    } : {})
  }
}

/**
 * Собирает каноническую модель сразу после извлечения DXF.
 * Ручное исключение подписей здесь не включается: решение принадлежит конкретному проекту.
 */
export function createCoreModelFromExtraction(
  extraction: CoreDxfExtraction,
  axis: number[][],
  metadata: CoreImportMetadata,
  now = new Date()
): CoreModel {
  if (!extraction.columns.length) throw new Error('В разделе ENTITIES не найдены геологические колонки')
  const horizontalScale = metadata.horizontalScale ?? 5000
  const verticalScale = metadata.verticalScale ?? 100
  const x0 = extraction.columns[0].x
  const boreholes: CoreBorehole[] = extraction.columns.map((column, index) => {
    const pk = getCoreDrawingPk(column.x, x0, horizontalScale)
    const [coordX, coordY] = coreAxisXY(axis, pk)
    const sourceNamed = extraction.names[index] !== `Скв. ${index + 1}`
    const id = `borehole-${index + 1}`
    return {
      id,
      index: index + 1,
      name: sourceNamed ? extraction.names[index] : `Без имени · №${index + 1}`,
      sourceNamed,
      kind: 'dxf',
      interpolation: null,
      sourceRefs: {
        sideLines: column.verticals.map(segment => segment.handle || '').filter(Boolean),
        nameText: extraction.nameHandles[index] || ''
      },
      drawing: {
        x: column.x,
        top: column.sideTop,
        bottom: column.sideBottom,
        levels: [...column.levels]
      },
      pk,
      coordinates: coordX === null || coordY === null ? null : { x: coordX, y: coordY },
      included: true,
      exclusionReason: '',
      review: { reviewed: false, reviewedAt: '' },
      layers: extraction.codes[index].map((layer, layerIndex) => ({
        id: `${id}-layer-${layerIndex + 1}`,
        boreholeId: id,
        ordinal: layerIndex + 1,
        bottomDepth: layer.depth,
        drawingY: column.sideTop - layer.depth * (1000 / verticalScale),
        igeCode: layer.ige,
        igeKey: layer.ige.trim() ? getIgeKey(layer.ige) : null,
        codeStatus: layer.status,
        candidates: layer.candidates.map(candidate => ({ ...candidate })),
        codeSource: layer.status === 'topology' ? 'Границы слоя' : layer.status === 'vertical-only' ? 'Положение подписи' : 'Требует проверки',
        depthSource: 'dxf',
        sourceRefs: {
          depthText: extraction.depths[index].accepted[layerIndex]?.text.handle || '',
          codeTexts: [...new Set(layer.candidates.flatMap(candidate => candidate.handle ? [candidate.handle] : []))]
        }
      })),
      excludedLabels: extraction.depths[index].excluded.map(label => ({ text: label.text, handle: label.handle, reason: label.reason }))
    }
  })
  const segments = extraction.geo.segments.filter(segment => /ГЕОЛОГИЯ/i.test(segment.layer || ''))
  const xs = segments.flatMap(segment => [segment.x1, segment.x2])
  const ys = segments.flatMap(segment => [segment.y1, segment.y2])
  return {
    schemaVersion: CORE_SCHEMA_VERSION,
    project: {
      id: `local-${now.getTime()}`,
      title: metadata.title,
      sourceFile: metadata.sourceFile,
      axisFile: metadata.axisFile,
      horizontalScale,
      verticalScale,
      startPk: metadata.startPk ?? 0,
      axis: axis.map(point => [...point]),
      geometry: cloneCoreGeometry({ segments, circles: extraction.geo.circles, texts: extraction.geo.texts, hatches: extraction.geo.hatches }),
      bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
      activity: [{ id: `import-${now.getTime()}`, type: 'system', text: 'Проект сформирован локально из DXF и Excel', at: now.toLocaleString('ru-RU') }]
    },
    boreholes,
    passports: {},
    manualCorrelations: [],
    gapDecisions: [],
    hatchLegend: []
  }
}

/**
 * Единственная точка перевода текущего проекта в каноническую модель.
 * Функция не исправляет данные и не отбрасывает исключённые колонки.
 */
export function createCoreModel(project: GeoProject): CoreModel {
  return {
    schemaVersion: CORE_SCHEMA_VERSION,
    project: {
      id: project.id,
      title: project.title,
      sourceFile: project.sourceFile,
      axisFile: project.axisFile,
      horizontalScale: project.horizontalScale,
      verticalScale: project.verticalScale,
      startPk: project.startPk,
      axis: project.axis.map(point => [...point]),
      geometry: cloneCoreGeometry(project.geometry),
      bounds: { ...project.bounds },
      activity: project.activity.map(item => ({ ...item }))
    },
    boreholes: project.columns.map(column => ({
      id: column.id,
      index: column.index,
      name: column.name,
      sourceNamed: column.sourceNamed,
      kind: column.kind || 'dxf',
      interpolation: column.interpolation ? { ...column.interpolation } : null,
      sourceRefs: {
        sideLines: [...(column.sourceRefs?.sideLines || [])],
        nameText: column.sourceRefs?.nameText || ''
      },
      drawing: {
        x: column.x,
        top: column.top,
        bottom: column.bottom,
        levels: [...column.levels]
      },
      pk: column.pk,
      coordinates: column.coordX === null || column.coordY === null
        ? null
        : { x: column.coordX, y: column.coordY },
      included: !column.isExcluded,
      exclusionReason: column.exclusionReason || '',
      review: {
        reviewed: Boolean(column.isReviewed),
        reviewedAt: column.reviewedAt || ''
      },
      layers: column.layers.map((layer, index) => ({
        id: layer.id,
        boreholeId: column.id,
        ordinal: index + 1,
        bottomDepth: layer.depth,
        drawingY: layer.y,
        igeCode: layer.ige,
        igeKey: layer.ige.trim() ? getIgeKey(layer.ige) : null,
        codeStatus: layer.status,
        candidates: layer.candidates.map(candidate => ({ ...candidate })),
        codeSource: layer.source,
        depthSource: layer.depthSource || 'dxf',
        sourceRefs: {
          depthText: layer.sourceRefs?.depthText || '',
          codeTexts: [...(layer.sourceRefs?.codeTexts || [])]
        }
      })),
      excludedLabels: column.excluded.map(label => ({ ...label }))
    })),
    passports: Object.fromEntries(
      Object.entries(project.igePassports || {}).map(([key, passport]) => [key, clonePassport(key, passport)])
    ),
    manualCorrelations: (project.manualCorrelations || []).map(correlation => ({ ...correlation })),
    gapDecisions: (project.gapDecisions || []).map(decision => ({ ...decision })),
    ...(project.hatchLegend ? { hatchLegend: project.hatchLegend.map(entry => ({ ...entry })) } : {})
  }
}

/** Обратный адаптер нужен для поэтапной миграции без потери существующих данных. */
export function createProjectFromCore(model: CoreModel): GeoProject {
  return {
    schemaVersion: 1,
    id: model.project.id,
    title: model.project.title,
    sourceFile: model.project.sourceFile,
    axisFile: model.project.axisFile,
    horizontalScale: model.project.horizontalScale,
    verticalScale: model.project.verticalScale,
    startPk: model.project.startPk,
    axis: model.project.axis.map(point => [...point]),
    columns: model.boreholes.map(column => ({
      id: column.id,
      index: column.index,
      name: column.name,
      sourceNamed: column.sourceNamed,
      kind: column.kind,
      interpolation: column.interpolation ? { ...column.interpolation } : null,
      x: column.drawing.x,
      top: column.drawing.top,
      bottom: column.drawing.bottom,
      levels: [...column.drawing.levels],
      pk: column.pk,
      coordX: column.coordinates?.x ?? null,
      coordY: column.coordinates?.y ?? null,
      isExcluded: !column.included,
      exclusionReason: column.exclusionReason,
      isReviewed: column.review.reviewed,
      reviewedAt: column.review.reviewedAt,
      sourceRefs: {
        sideLines: [...column.sourceRefs.sideLines],
        nameText: column.sourceRefs.nameText
      },
      layers: column.layers.map(layer => ({
        id: layer.id,
        depth: layer.bottomDepth,
        y: layer.drawingY,
        ige: layer.igeCode,
        status: layer.codeStatus,
        candidates: layer.candidates.map(candidate => ({ ...candidate })),
        source: layer.codeSource,
        depthSource: layer.depthSource,
        sourceRefs: {
          depthText: layer.sourceRefs.depthText,
          codeTexts: [...layer.sourceRefs.codeTexts]
        }
      })),
      excluded: column.excludedLabels.map(label => ({ ...label }))
    })),
    geometry: cloneCoreGeometry(model.project.geometry),
    bounds: { ...model.project.bounds },
    igePassports: Object.fromEntries(
      Object.entries(model.passports).map(([key, passport]) => [key, {
        name: passport.name,
        description: passport.description,
        notes: passport.notes,
        characteristics: Object.fromEntries(
          Object.entries(passport.characteristics).map(([property, record]) => [property, { ...record }])
        ),
        ...(passport.appearance ? { appearance: { ...passport.appearance } } : {})
      }])
    ),
    manualCorrelations: model.manualCorrelations.map(correlation => ({ ...correlation })),
    gapDecisions: model.gapDecisions.map(decision => ({ ...decision })),
    ...(model.hatchLegend ? { hatchLegend: model.hatchLegend.map(entry => ({ ...entry })) } : {}),
    activity: model.project.activity.map(item => ({ ...item }))
  }
}

/** Единое правило глубины для структурного контроля, редактора и экспорта. */
export function getCoreLayerDepthIssue(layers: CoreLayer[], index: number): LayerDepthIssue | null {
  const depth = layers[index]?.bottomDepth
  if (!Number.isFinite(depth) || depth <= 0) return 'invalid-depth'
  const previous = layers[index - 1]?.bottomDepth
  if (previous !== undefined && Number.isFinite(previous) && depth <= previous) return 'depth-order'
  return null
}

/** Мощность является производной величиной и не сохраняется в модели. */
export function getCoreLayerThickness(layers: CoreLayer[], index: number): number {
  return layers[index].bottomDepth - (layers[index - 1]?.bottomDepth ?? 0)
}

/**
 * Контрольный слепок только тех данных источников, которые участвуют в расчёте.
 * Это не вторая геометрия разреза: подписи DXF и исходные объекты сюда не копируются.
 */
export function getCoreFictitiousSourceFingerprint(
  model: CoreModel,
  leftBoreholeId: string,
  rightBoreholeId: string
): string {
  return JSON.stringify([leftBoreholeId, rightBoreholeId].map(id => {
    const column = model.boreholes.find(item => item.id === id)
    return column ? {
      id: column.id,
      included: column.included,
      x: column.drawing.x,
      top: column.drawing.top,
      bottom: column.drawing.bottom,
      pk: column.pk,
      layers: column.layers.map(layer => ({
        ordinal: layer.ordinal,
        depth: layer.bottomDepth,
        drawingY: layer.drawingY,
        code: layer.igeKey ?? getIgeKey(layer.igeCode)
      }))
    } : null
  }))
}

/**
 * Предварительный расчёт фиктивной скважины. Ничего не сохраняет и не выбирает
 * между разными кодами ИГЭ: расхождение остаётся видимым для ручного решения.
 */
export function getCoreFictitiousPreview(
  model: CoreModel,
  leftBoreholeId: string,
  rightBoreholeId: string,
  fraction: number
): CoreFictitiousPreview {
  const leftIndex = model.boreholes.findIndex(item => item.id === leftBoreholeId)
  const rightIndex = model.boreholes.findIndex(item => item.id === rightBoreholeId)
  const left = model.boreholes[leftIndex]
  const right = model.boreholes[rightIndex]
  if (!left || !right || leftIndex >= rightIndex || left.kind !== 'dxf' || right.kind !== 'dxf') {
    throw new Error('Выберите две исходные DXF-скважины в порядке слева направо')
  }
  if (!left.included || !right.included) throw new Error('Исключённую скважину нельзя использовать как источник интерполяции')
  if (model.boreholes.slice(leftIndex + 1, rightIndex).some(item => item.kind === 'dxf')) {
    throw new Error('Между источниками есть другая исходная DXF-скважина')
  }
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction >= 1) {
    throw new Error('Положение фиктивной скважины должно быть строго между источниками')
  }
  const warnings: string[] = []
  const invalidSourceDepths = left.layers.some((_, index) => getCoreLayerDepthIssue(left.layers, index)) ||
    right.layers.some((_, index) => getCoreLayerDepthIssue(right.layers, index))
  let method: FictitiousInterpolation['method'] = 'linear'
  if (!left.layers.length || !right.layers.length) {
    method = 'manual'
    warnings.push('У одной из исходных скважин нет подошв. Фиктивная будет создана без автоматических слоёв для ручного заполнения.')
  } else if (invalidSourceDepths) {
    method = 'manual'
    warnings.push('В исходных скважинах есть некорректные глубины или нарушен их порядок. Фиктивная будет создана без автоматических слоёв; сначала проверьте источники.')
  } else if (left.layers.length !== right.layers.length) {
    method = 'linear-pinchout'
    const shorter = left.layers.length < right.layers.length ? left : right
    warnings.push(`Разное число подошв: ${left.layers.length} / ${right.layers.length}. Отсутствующие слои явно выклиниваются у скважины ${shorter.name}; нулевые слои в источники не добавляются.`)
  }
  const layers: CoreInterpolationPreviewLayer[] = method === 'manual' ? [] : Array.from({ length: Math.max(left.layers.length, right.layers.length) }, (_, index) => {
    const leftLayer = left.layers[index]
    const rightLayer = right.layers[index]
    // Отсутствующая подошва сходится к последней подошве короткой колонки.
    // Строго между источниками это даёт положительные мощности без фиктивного нулевого слоя.
    const leftDepth = leftLayer?.bottomDepth ?? left.layers[left.layers.length - 1].bottomDepth
    const rightDepth = rightLayer?.bottomDepth ?? right.layers[right.layers.length - 1].bottomDepth
    const leftCode = leftLayer?.igeCode.trim() || ''
    const rightCode = rightLayer?.igeCode.trim() || ''
    const codeAgreed = Boolean(leftLayer && rightLayer && leftCode) && getIgeKey(leftCode) === getIgeKey(rightCode)
    return {
      ordinal: index + 1,
      depth: leftDepth + (rightDepth - leftDepth) * fraction,
      leftDepth,
      rightDepth,
      leftPresent: Boolean(leftLayer),
      rightPresent: Boolean(rightLayer),
      pinchoutAt: leftLayer ? rightLayer ? null : 'right' : 'left',
      code: codeAgreed ? leftCode : '',
      leftCode,
      rightCode,
      codeAgreed
    }
  })
  const x = left.drawing.x + (right.drawing.x - left.drawing.x) * fraction
  const pk = left.pk + (right.pk - left.pk) * fraction
  const [coordX, coordY] = coreAxisXY(model.project.axis, pk)
  return {
    leftBoreholeId,
    rightBoreholeId,
    leftName: left.name,
    rightName: right.name,
    fraction,
    method,
    warnings,
    x,
    top: left.drawing.top + (right.drawing.top - left.drawing.top) * fraction,
    bottom: left.drawing.bottom + (right.drawing.bottom - left.drawing.bottom) * fraction,
    pk,
    coordinates: coordX === null || coordY === null ? null : { x: coordX, y: coordY },
    layers
  }
}

/**
 * Порядковая корреляция применяется только к подошвам, не занятым ручной связью.
 * Ручная связь взаимно однозначна внутри пары скважин: высвобожденная ordinal-подошва
 * остаётся отдельным разрывом. Ни одна исходная геометрия DXF при этом не изменяется.
 */
export function getCoreBoundaryModel(model: CoreModel): CoreBoundaryModel {
  const items: CoreBoundaryItem[] = []
  const active = model.boreholes.filter(borehole => borehole.included)
  const drawingY = (borehole: CoreBorehole, depth: number) =>
    borehole.drawing.top - depth * (1000 / model.project.verticalScale)

  for (let pairIndex = 0; pairIndex < active.length - 1; pairIndex += 1) {
    const left = active[pairIndex]
    const right = active[pairIndex + 1]
    const correlations = model.manualCorrelations.filter(correlation =>
      left.layers.some(layer => layer.id === correlation.leftLayerId) &&
      right.layers.some(layer => layer.id === correlation.rightLayerId)
    )
    const manualLeft = new Map(correlations.map(correlation => [correlation.leftLayerId, correlation]))
    const manualRight = new Map(correlations.map(correlation => [correlation.rightLayerId, correlation]))

    const addItem = (
      leftLayer: CoreLayer | null,
      rightLayer: CoreLayer | null,
      correlation: ManualCorrelation | null = null
    ) => {
      const leftIndex = leftLayer ? left.layers.findIndex(layer => layer.id === leftLayer.id) : -1
      const rightIndex = rightLayer ? right.layers.findIndex(layer => layer.id === rightLayer.id) : -1
      const leftDepthIssue = leftLayer ? getCoreLayerDepthIssue(left.layers, leftIndex) : null
      const rightDepthIssue = rightLayer ? getCoreLayerDepthIssue(right.layers, rightIndex) : null
      const scaleInvalid = !Number.isFinite(model.project.verticalScale) || model.project.verticalScale <= 0
      const issues: CoreBoundaryIssue[] = []
      if (leftLayer && rightLayer && (leftDepthIssue || rightDepthIssue)) {
        issues.push({ kind: 'invalid-depth', detail: 'Некорректная глубина или нарушен порядок подошв' })
      }
      if (leftLayer && rightLayer && scaleInvalid) {
        issues.push({ kind: 'invalid-scale', detail: 'Вертикальный масштаб должен быть положительным конечным числом' })
      }
      const status: CoreBoundaryStatus = !leftLayer ? 'right-only'
        : !rightLayer ? 'left-only'
          : issues.length ? 'invalid' : 'connected'
      const ordinal = leftLayer?.ordinal ?? rightLayer?.ordinal ?? 0
      items.push({
        id: correlation
          ? `boundary-${left.id}-${right.id}-manual-${correlation.id}`
          : `boundary-${left.id}-${right.id}-${leftLayer?.id || rightLayer?.id || ordinal}`,
        ordinal,
        leftOrdinal: leftLayer?.ordinal ?? null,
        rightOrdinal: rightLayer?.ordinal ?? null,
        leftBoreholeId: left.id,
        rightBoreholeId: right.id,
        leftBoreholeName: left.name,
        rightBoreholeName: right.name,
        leftPk: left.pk,
        rightPk: right.pk,
        leftLayerId: leftLayer?.id || null,
        rightLayerId: rightLayer?.id || null,
        leftDepth: leftLayer?.bottomDepth ?? null,
        rightDepth: rightLayer?.bottomDepth ?? null,
        leftCode: leftLayer?.igeCode || '',
        rightCode: rightLayer?.igeCode || '',
        x1: left.drawing.x,
        y1: leftLayer && (status === 'connected' || status === 'left-only') ? drawingY(left, leftLayer.bottomDepth) : null,
        x2: right.drawing.x,
        y2: rightLayer && (status === 'connected' || status === 'right-only') ? drawingY(right, rightLayer.bottomDepth) : null,
        status,
        issues,
        manual: leftLayer?.depthSource === 'manual' || rightLayer?.depthSource === 'manual',
        manualCorrelation: Boolean(correlation),
        correlationId: correlation?.id || null,
        correlationNote: correlation?.note || '',
        gapDecisionId: null,
        gapDecisionKind: null,
        gapDecisionNote: '',
        pinchoutFraction: null,
        pinchoutId: null
      })
    }

    const pairStart = items.length
    for (const correlation of correlations) {
      addItem(
        left.layers.find(layer => layer.id === correlation.leftLayerId) || null,
        right.layers.find(layer => layer.id === correlation.rightLayerId) || null,
        correlation
      )
    }

    const boundaryCount = Math.max(left.layers.length, right.layers.length)
    for (let layerIndex = 0; layerIndex < boundaryCount; layerIndex += 1) {
      const leftLayer = left.layers[layerIndex] || null
      const rightLayer = right.layers[layerIndex] || null
      const leftManual = Boolean(leftLayer && manualLeft.has(leftLayer.id))
      const rightManual = Boolean(rightLayer && manualRight.has(rightLayer.id))
      if (leftManual && rightManual) continue
      if (leftManual) {
        if (rightLayer) addItem(null, rightLayer)
        continue
      }
      if (rightManual) {
        if (leftLayer) addItem(leftLayer, null)
        continue
      }
      addItem(leftLayer, rightLayer)
    }

    const crossingDetails = new Map<number, CoreBoundaryIssue[]>()
    const candidates = items.slice(pairStart).filter(item => item.status === 'connected')
    for (let firstIndex = 0; firstIndex < candidates.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < candidates.length; secondIndex += 1) {
        const first = candidates[firstIndex]
        const second = candidates[secondIndex]
        const orderProduct = (first.leftOrdinal! - second.leftOrdinal!) * (first.rightOrdinal! - second.rightOrdinal!)
        if (orderProduct >= 0) continue
        for (const [item, other] of [[first, second], [second, first]] as const) {
          const itemIndex = items.findIndex(candidate => candidate.id === item.id)
          const details = crossingDetails.get(itemIndex) || []
          details.push({ kind: 'crossing', detail: `Пересечение с границей ${other.leftOrdinal}↔${other.rightOrdinal}` })
          crossingDetails.set(itemIndex, details)
        }
      }
    }
    for (const [itemIndex, details] of crossingDetails) {
      const item = items[itemIndex]
      items[itemIndex] = { ...item, status: 'invalid', issues: [...item.issues, ...details] }
    }
  }

  const pinchouts: CorePinchoutGeometry[] = []
  const inactiveGapDecisions: CoreInactiveGapDecision[] = []
  const describeDecision = (decision: GapDecision) => {
    const leftLayer = model.boreholes.flatMap(column => column.layers).find(layer => layer.id === decision.leftLayerId)
    const rightLayer = model.boreholes.flatMap(column => column.layers).find(layer => layer.id === decision.rightLayerId)
    const left = model.boreholes.find(column => column.id === leftLayer?.boreholeId)
    const right = model.boreholes.find(column => column.id === rightLayer?.boreholeId)
    return `${left?.name || '—'} ${leftLayer?.ordinal ?? '—'} ↔ ${right?.name || '—'} ${rightLayer?.ordinal ?? '—'} · ${decision.note}`
  }

  for (const decision of model.gapDecisions) {
    const itemIndex = items.findIndex(item =>
      (item.status === 'left-only' || item.status === 'right-only') &&
      item.leftLayerId === decision.leftLayerId &&
      item.rightLayerId === decision.rightLayerId &&
      !item.gapDecisionId
    )
    if (itemIndex < 0) {
      inactiveGapDecisions.push({ decision: { ...decision }, description: describeDecision(decision) })
      continue
    }
    const item = items[itemIndex]
    items[itemIndex] = {
      ...item,
      gapDecisionId: decision.id,
      gapDecisionKind: decision.kind,
      gapDecisionNote: decision.note,
      pinchoutFraction: decision.kind === 'pinchout' ? decision.fraction : null
    }
    if (decision.kind === 'accepted') continue

    const existingSide = item.status === 'left-only' ? 'left' : 'right'
    const existingColumn = existingSide === 'left'
      ? model.boreholes.find(column => column.id === item.leftBoreholeId)
      : model.boreholes.find(column => column.id === item.rightBoreholeId)
    const existingLayerId = item.leftLayerId || item.rightLayerId
    const existingLayer = existingColumn?.layers.find(layer => layer.id === existingLayerId)
    const previousLayer = existingLayer && existingLayer.ordinal > 1
      ? existingColumn?.layers[existingLayer.ordinal - 2]
      : null
    const upperIndex = previousLayer
      ? items.findIndex(candidate => candidate.status === 'connected' &&
        candidate.leftBoreholeId === item.leftBoreholeId &&
        candidate.rightBoreholeId === item.rightBoreholeId &&
        (existingSide === 'left' ? candidate.leftLayerId : candidate.rightLayerId) === previousLayer.id)
      : -1
    const lowerY = existingSide === 'left' ? item.y1 : item.y2
    const upper = upperIndex >= 0 ? items[upperIndex] : null
    const firstLayer = existingLayer?.ordinal === 1
    const upperAlreadyUsed = Boolean(upper && pinchouts.some(pinchout => pinchout.upperBoundaryId === upper.id))
    const valid = Boolean(
      existingColumn && existingLayer && Number.isFinite(lowerY) &&
      decision.fraction !== null && decision.fraction > 0 && decision.fraction < 1 &&
      (firstLayer || upper && upper.y1 !== null && upper.y2 !== null && !upperAlreadyUsed)
    )
    if (!valid || !existingColumn || !existingLayer || lowerY === null || decision.fraction === null) {
      items[itemIndex] = {
        ...items[itemIndex],
        status: 'invalid',
        issues: [...item.issues, {
          kind: 'invalid-pinchout',
          detail: upperAlreadyUsed
            ? 'Эта верхняя граница уже использована другим выклиниванием; автоматическое совмещение нескольких точек не выполняется'
            : 'Для выклинивания нужна конечная глубина, положение строго между скважинами и однозначно соединённая верхняя граница'
        }]
      }
      continue
    }
    const left = model.boreholes.find(column => column.id === item.leftBoreholeId)!
    const right = model.boreholes.find(column => column.id === item.rightBoreholeId)!
    const pinchoutId = `pinchout-${decision.id}`
    pinchouts.push({
      id: pinchoutId,
      decisionId: decision.id,
      boundaryId: item.id,
      upperBoundaryId: upper?.id || null,
      side: existingSide,
      x: item.x1 + (item.x2 - item.x1) * decision.fraction,
      y: lowerY,
      lowerX: existingSide === 'left' ? item.x1 : item.x2,
      lowerY,
      upperLeftX: item.x1,
      upperLeftY: firstLayer ? left.drawing.top : upper!.y1!,
      upperRightX: item.x2,
      upperRightY: firstLayer ? right.drawing.top : upper!.y2!
    })
    items[itemIndex] = { ...items[itemIndex], pinchoutId }
    if (upperIndex >= 0) items[upperIndex] = { ...items[upperIndex], pinchoutId }
  }

  return {
    items,
    connected: items.filter(item => item.status === 'connected').length,
    gaps: items.filter(item => item.status === 'left-only' || item.status === 'right-only').length,
    openGaps: items.filter(item => (item.status === 'left-only' || item.status === 'right-only') && !item.gapDecisionId).length,
    decidedGaps: items.filter(item => item.gapDecisionId).length,
    invalid: items.filter(item => item.status === 'invalid').length,
    crossings: items.filter(item => item.issues.some(issue => issue.kind === 'crossing')).length,
    pinchouts,
    inactiveGapDecisions
  }
}

/** Некорректные границы относятся к обеим скважинам; обычные разрывы сюда не входят. */
export function getCoreBoreholeBoundaryIssues(
  boundaries: CoreBoundaryModel,
  boreholeId: string
): CoreBoundaryItem[] {
  return boundaries.items.filter(item => item.status === 'invalid' &&
    (item.leftBoreholeId === boreholeId || item.rightBoreholeId === boreholeId))
}

/**
 * Геологическая очередь читает уже доказанные статусы и кандидатов.
 * Она не запускает распознавание заново и не заменяет ручные решения.
 */
export function getCoreIssues(model: CoreModel): GeoIssue[] {
  const issues: GeoIssue[] = []
  for (const column of model.boreholes) {
    if (!column.included) continue
    if (column.kind === 'dxf' && !column.sourceNamed) {
      issues.push({
        id: `name-${column.id}`,
        kind: 'missing-name',
        boreholeId: column.id,
        title: `${column.name}: нет подписи в DXF`,
        detail: 'Геометрия подтверждена. Назначьте имя вручную или оставьте объект на проверке.'
      })
    }
    for (const [layerIndex, layer] of column.layers.entries()) {
      const depthIssue = getCoreLayerDepthIssue(column.layers, layerIndex)
      if (depthIssue) {
        const depth = Number.isFinite(layer.bottomDepth) ? layer.bottomDepth.toFixed(2).replace('.', ',') : '—'
        const previous = column.layers[layerIndex - 1]?.bottomDepth
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
      if (layer.codeStatus === 'ambiguous') {
        const candidates = [...new Set(layer.candidates.map(candidate => candidate.code))]
        issues.push({
          id: `ambiguous-${layer.id}`,
          kind: 'ambiguous-code',
          boreholeId: column.id,
          layerId: layer.id,
          title: `${column.name} · ${layer.bottomDepth.toFixed(2).replace('.', ',')} м`,
          detail: `Конкурирующие коды ИГЭ: ${candidates.join(' / ')}`,
          candidates
        })
      } else if (layer.codeStatus === 'not-found') {
        issues.push({
          id: `missing-${layer.id}`,
          kind: 'missing-code',
          boreholeId: column.id,
          layerId: layer.id,
          title: `${column.name} · ${layer.bottomDepth.toFixed(2).replace('.', ',')} м`,
          detail: 'Код ИГЭ не найден по надёжной топологической связи'
        })
      }
    }
  }
  return issues
}

/**
 * Проверка правил не меняет производные слои. Ручные глубины и коды фиктивной
 * скважины не считаются устаревшими: задача возникает только при смене источников.
 */
export function getCoreInterpolationReviewItems(model: CoreModel): CoreReviewItem[] {
  const items: CoreReviewItem[] = []
  for (const column of model.boreholes) {
    if (!column.included || column.kind !== 'fictitious' || !column.interpolation) continue
    const rule = column.interpolation
    let preview: CoreFictitiousPreview
    try {
      preview = getCoreFictitiousPreview(model, rule.leftBoreholeId, rule.rightBoreholeId, rule.fraction)
    } catch (reason) {
      items.push({
        id: `interpolation-invalid-${column.id}`,
        source: 'interpolation',
        kind: 'fictitious-invalid',
        boreholeId: column.id,
        title: `${column.name}: правило интерполяции недействительно`,
        detail: `${reason instanceof Error ? reason.message : 'Не удалось выполнить preview'}. Модель не изменена; проверьте источники или удалите фиктивную явной командой.`
      })
      continue
    }
    if (preview.method === 'manual' && column.layers.length === 0) {
      items.push({
        id: `interpolation-manual-${column.id}`,
        source: 'interpolation',
        kind: 'fictitious-manual',
        boreholeId: column.id,
        title: `${column.name}: требуется ручное заполнение`,
        detail: 'Фиктивная создана без автоматических подошв, потому что интерполяция невозможна. Добавьте слои вручную или проверьте источники и явно подтвердите пересчёт.'
      })
    }
    const currentFingerprint = getCoreFictitiousSourceFingerprint(model, rule.leftBoreholeId, rule.rightBoreholeId)
    // Проекты 0.36 без слепка проверяются консервативно по ещё интерполированным полям.
    const legacyOutdated = rule.sourceFingerprint === undefined && (
      column.drawing.x !== preview.x || column.drawing.top !== preview.top ||
      column.drawing.bottom !== preview.bottom || column.pk !== preview.pk ||
      preview.layers.some(expected => {
        const saved = column.layers.find(layer => layer.id === `${column.id}-layer-${expected.ordinal}`)
        if (!saved || saved.depthSource !== 'interpolated') return false
        const expectedStatus = expected.codeAgreed ? 'interpolated' : expected.leftCode && expected.rightCode ? 'ambiguous' : 'not-found'
        return saved.bottomDepth !== expected.depth ||
          (saved.codeStatus !== 'manual' && (saved.igeCode !== expected.code || saved.codeStatus !== expectedStatus))
      })
    )
    if (rule.sourceFingerprint !== undefined && rule.sourceFingerprint !== currentFingerprint || legacyOutdated) {
      items.push({
        id: `interpolation-outdated-${column.id}`,
        source: 'interpolation',
        kind: 'fictitious-outdated',
        boreholeId: column.id,
        title: `${column.name}: источники интерполяции изменились`,
        detail: 'Сохранённые положение, глубины или коды могут не соответствовать текущим исходным скважинам. Автоматический пересчёт не выполнен: откройте правило, проверьте preview и подтвердите пересчёт.'
      })
    }
  }
  return items
}

/**
 * Общая очередь не дублирует общую границу для каждой скважины.
 * Обычные разрывы не являются ошибками и сюда не включаются.
 */
export function getCoreReviewItems(
  model: CoreModel,
  boundaries = getCoreBoundaryModel(model)
): CoreReviewItem[] {
  const geological = getCoreIssues(model).map(issue => ({
    ...issue,
    id: `geology-${issue.id}`,
    source: 'geology' as const
  }))
  const invalidBoundaries = boundaries.items
    .filter(item => item.status === 'invalid')
    .map(item => ({
      id: `boundary-${item.id}`,
      source: 'boundary' as const,
      kind: 'invalid-boundary' as const,
      boreholeId: item.leftBoreholeId,
      layerId: item.leftLayerId ?? item.rightLayerId ?? undefined,
      boundaryId: item.id,
      title: item.issues.some(issue => issue.kind === 'crossing')
        ? `${item.leftBoreholeName} → ${item.rightBoreholeName}: пересечение границ`
        : `${item.leftBoreholeName} → ${item.rightBoreholeName}: некорректная граница`,
      detail: `Подошвы ${item.leftOrdinal ?? '—'} ↔ ${item.rightOrdinal ?? '—'}: ${item.issues.map(issue => issue.detail).join('; ')}`
    }))
  return [...geological, ...invalidBoundaries, ...getCoreInterpolationReviewItems(model)]
}

export interface CoreSectionReport {
  items: CoreReviewItem[]
  geological: number
  boundaries: number
  interpolation: number
  openGaps: number
  decidedGaps: number
  consistent: boolean
}

/** Единый производный отчёт сечения; открытые разрывы показаны отдельно от ошибок. */
export function getCoreSectionReport(
  model: CoreModel,
  boundaries = getCoreBoundaryModel(model)
): CoreSectionReport {
  const items = getCoreReviewItems(model, boundaries)
  return {
    items,
    geological: items.filter(item => item.source === 'geology').length,
    boundaries: items.filter(item => item.source === 'boundary').length,
    interpolation: items.filter(item => item.source === 'interpolation').length,
    openGaps: boundaries.openGaps,
    decidedGaps: boundaries.decidedGaps,
    consistent: items.length === 0
  }
}

export const CORE_ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  system: 'Система и история',
  geology: 'Скважины и слои',
  correlation: 'Ручная корреляция',
  gap: 'Разрывы и выклинивания',
  fictitious: 'Фиктивные скважины',
  passport: 'Паспорта и характеристики ИГЭ',
  review: 'Проверка и исключение',
  hatch: 'Контроль исходных HATCH'
}

export interface CoreJournalEntry extends ActivityItem {
  category: ActivityCategory
  boreholeIds: string[]
  layerIds: string[]
  passportKeys: string[]
  objectLabel: string
  targetBoreholeId: string | null
  targetLayerId: string | null
}

/** Старые сообщения классифицируются только для отображения; исходный текст не переписывается. */
function getLegacyActivityCategory(item: ActivityItem): ActivityCategory {
  if (item.type === 'system' || /Отменено|Повторено/.test(item.text)) return 'system'
  if (/фиктивн|интерполяц/i.test(item.text)) return 'fictitious'
  if (/разрыв|выклинив/i.test(item.text)) return 'gap'
  if (/корреляц/i.test(item.text)) return 'correlation'
  if (/паспорт|характеристик/i.test(item.text)) return 'passport'
  if (/проверк|исключен|возвращена в расчёт/i.test(item.text)) return 'review'
  return 'geology'
}

/**
 * Журнал остаётся сохранённой историей команд. Связи с текущими объектами лишь
 * разрешаются для навигации; удалённый объект не приводит к удалению записи.
 */
export function getCoreJournalEntries(model: CoreModel): CoreJournalEntry[] {
  const layerOwners = new Map<string, CoreBorehole>()
  const layerById = new Map<string, CoreLayer>()
  for (const column of model.boreholes) for (const layer of column.layers) {
    layerOwners.set(layer.id, column)
    layerById.set(layer.id, layer)
  }
  return model.project.activity.map(item => {
    const layerIds = [...new Set(item.layerIds || [])]
    const boreholeIds = [...new Set([
      ...(item.boreholeIds || []),
      ...layerIds.map(id => layerOwners.get(id)?.id).filter((id): id is string => Boolean(id))
    ])]
    const existingLayerId = layerIds.find(id => layerById.has(id)) || null
    const targetBoreholeId = existingLayerId ? layerOwners.get(existingLayerId)!.id
      : boreholeIds.find(id => model.boreholes.some(column => column.id === id)) || null
    const objectParts = boreholeIds.map(id => model.boreholes.find(column => column.id === id)?.name || id)
    const layerParts = layerIds.map(id => {
      const layer = layerById.get(id)
      return layer ? `подошва ${layer.ordinal}` : id
    })
    const passportParts = (item.passportKeys || []).map(key => `ИГЭ ${key}`)
    return {
      ...item,
      category: item.category || getLegacyActivityCategory(item),
      boreholeIds,
      layerIds,
      passportKeys: [...new Set(item.passportKeys || [])],
      objectLabel: [...objectParts, ...layerParts, ...passportParts].join(' · '),
      targetBoreholeId,
      targetLayerId: existingLayerId
    }
  })
}

/** Соседи выбираются только среди активных колонок; совпадения не ранжируются по глубине. */
export function getCoreLayerNeighbors(model: CoreModel, boreholeId: string, layerId: string): LayerNeighbors {
  const column = model.boreholes.find(item => item.id === boreholeId)
  const layer = column?.layers.find(item => item.id === layerId)
  const key = layer ? layer.igeKey ?? getIgeKey(layer.igeCode) : '__unassigned__'
  if (!column || !layer || !column.included || key === '__unassigned__') return { previous: null, next: null }
  const activeColumns = model.boreholes.filter(item => item.included)
  const index = activeColumns.findIndex(item => item.id === boreholeId)
  const neighbor = (item: CoreBorehole | undefined): LayerNeighbor | null => item ? {
    boreholeId: item.id,
    name: item.name,
    pk: item.pk,
    matches: item.layers
      .filter(candidate => (candidate.igeKey ?? getIgeKey(candidate.igeCode)) === key)
      .map(candidate => ({ layerId: candidate.id, depth: candidate.bottomDepth }))
  } : null
  return { previous: neighbor(activeColumns[index - 1]), next: neighbor(activeColumns[index + 1]) }
}

/** Сводка использует ту же геометрию и те же признаки проблем, что редактор. */
export function getCoreCodeSummary(model: CoreModel): CodeSummaryItem[] {
  type Group = CodeSummaryItem & { boreholeIds: Set<string>; variantSet: Set<string>; targetHasIssue: boolean; thicknessSum: number }
  const groups = new Map<string, Group>()
  for (const column of model.boreholes) {
    if (!column.included) continue
    for (const [layerIndex, layer] of column.layers.entries()) {
      const rawCode = layer.igeCode.trim()
      const key = layer.igeKey ?? getIgeKey(rawCode)
      const hasIssue = Boolean(getCoreLayerDepthIssue(column.layers, layerIndex)) || layer.codeStatus === 'ambiguous' || layer.codeStatus === 'not-found'
      const thickness = getCoreLayerThickness(column.layers, layerIndex)
      const passport = model.passports[key]
      let group = groups.get(key)
      if (!group) {
        const characteristicCoverage = getCharacteristicCoverage(passport)
        group = {
          key,
          code: rawCode || '—',
          variants: [],
          passportName: passport?.name.trim() || '',
          layerCount: 0,
          boreholeCount: 0,
          minDepth: layer.bottomDepth,
          maxDepth: layer.bottomDepth,
          minThickness: thickness,
          maxThickness: thickness,
          averageThickness: thickness,
          thicknessSum: 0,
          manualCount: 0,
          issueCount: 0,
          characteristicFilled: characteristicCoverage.filled,
          characteristicTotal: characteristicCoverage.total,
          boreholeId: column.id,
          layerId: layer.id,
          boreholeIds: new Set(),
          variantSet: new Set(),
          targetHasIssue: false
        }
        groups.set(key, group)
      }
      group.layerCount += 1
      group.minDepth = Math.min(group.minDepth, layer.bottomDepth)
      group.maxDepth = Math.max(group.maxDepth, layer.bottomDepth)
      group.minThickness = Math.min(group.minThickness, thickness)
      group.maxThickness = Math.max(group.maxThickness, thickness)
      group.thicknessSum += thickness
      group.boreholeIds.add(column.id)
      if (rawCode) group.variantSet.add(rawCode)
      if (layer.codeStatus === 'manual') group.manualCount += 1
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
    boreholeId: group.boreholeId,
    layerId: group.layerId
  })).sort((a, b) => {
    if (a.key === '__unassigned__') return 1
    if (b.key === '__unassigned__') return -1
    return a.code.localeCompare(b.code, 'ru', { numeric: true })
  })
}

/** Нейтральный начальный вид не является геологической классификацией или обозначением по ГОСТ. */
export const DEFAULT_SOIL_APPEARANCE: SoilAppearance = { color: '#E5E2D9', hatch: 'none' }

export function getCoreSoilAppearance(model: CoreModel, key: string): SoilAppearance {
  return model.passports[key]?.appearance || DEFAULT_SOIL_APPEARANCE
}

export interface CoreSoilLibraryItem extends CodeSummaryItem {
  appearance: SoilAppearance
  appearanceCustomized: boolean
}

/** В библиотеку попадают все непустые коды активного сечения; слои без ИГЭ остаются в общей очереди. */
export function getCoreSoilLibrary(model: CoreModel): CoreSoilLibraryItem[] {
  return getCoreCodeSummary(model)
    .filter(item => item.key !== '__unassigned__')
    .map(item => ({
      ...item,
      appearance: getCoreSoilAppearance(model, item.key),
      appearanceCustomized: Boolean(model.passports[item.key]?.appearance)
    }))
}

export function validateCoreModel(model: CoreModel): CoreModelIssue[] {
  const issues: CoreModelIssue[] = []
  const add = (issue: Omit<CoreModelIssue, 'id' | 'severity'>) => {
    issues.push({ ...issue, severity: 'error', id: `core-${issue.kind}-${issues.length + 1}` })
  }

  if (!Number.isFinite(model.project.horizontalScale) || model.project.horizontalScale <= 0 ||
      !Number.isFinite(model.project.verticalScale) || model.project.verticalScale <= 0) {
    add({ kind: 'invalid-scale', title: 'Некорректный масштаб проекта', detail: 'Горизонтальный и вертикальный масштабы должны быть положительными конечными числами.' })
  }
  if (model.project.axis.length < 2 || model.project.axis.some(point => point.length < 3 || point.slice(0, 3).some(value => !Number.isFinite(value)))) {
    add({ kind: 'invalid-axis', title: 'Некорректная ось проекта', detail: 'Для интерполяции нужны минимум две строки с конечными ПК, X и Y. Исходные строки не изменяются.' })
  }
  const bounds = model.project.bounds
  if (![bounds.minX, bounds.maxX, bounds.minY, bounds.maxY].every(Number.isFinite) || bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) {
    add({ kind: 'invalid-bounds', title: 'Некорректные границы геометрии', detail: 'Границы должны быть конечными и упорядоченными по минимуму и максимуму.' })
  }

  const sourceHandles = new Set([
    ...model.project.geometry.segments,
    ...model.project.geometry.texts,
    ...model.project.geometry.circles
  ].flatMap(item => item.handle ? [item.handle] : []))
  const boreholeIds = new Set<string>()
  const fictitiousRulePairs = new Set<string>()
  const layerOwners = new Map<string, string>()
  const checkSourceReference = (
    handle: string,
    column: CoreBorehole,
    layer: CoreLayer | null,
    label: string
  ) => {
    if (handle && !sourceHandles.has(handle)) {
      add({
        kind: 'invalid-source-reference',
        boreholeId: column.id,
        layerId: layer?.id,
        title: `${column.name}: потеряна ссылка на исходный DXF`,
        detail: `${label}: объект с handle ${handle} отсутствует в сохранённой исходной геометрии. Данные не восстанавливаются автоматически.`
      })
    }
  }
  for (const column of model.boreholes) {
    if (boreholeIds.has(column.id)) {
      add({ kind: 'duplicate-borehole-id', boreholeId: column.id, title: `Повтор идентификатора скважины ${column.id}`, detail: 'Идентификаторы должны быть уникальны, иначе ссылки на слои и ручные решения нельзя считать однозначными.' })
    }
    boreholeIds.add(column.id)
    if (column.coordinates && (!Number.isFinite(column.coordinates.x) || !Number.isFinite(column.coordinates.y))) {
      add({ kind: 'invalid-coordinates', boreholeId: column.id, title: `${column.name}: некорректные координаты`, detail: 'Координаты X и Y должны быть конечными числами либо отсутствовать.' })
    }
    if (column.kind === 'fictitious') {
      const rule = column.interpolation
      const leftIndex = rule ? model.boreholes.findIndex(item => item.id === rule.leftBoreholeId) : -1
      const rightIndex = rule ? model.boreholes.findIndex(item => item.id === rule.rightBoreholeId) : -1
      const left = model.boreholes[leftIndex]
      const right = model.boreholes[rightIndex]
      const pairKey = rule ? `${rule.leftBoreholeId}|${rule.rightBoreholeId}` : ''
      const validRule = Boolean(rule && ['linear', 'linear-pinchout', 'manual'].includes(rule.method) && rule.note.trim() && rule.createdAt &&
        (rule.sourceFingerprint === undefined || Boolean(rule.sourceFingerprint.trim())) &&
        Number.isFinite(rule.fraction) && rule.fraction > 0 && rule.fraction < 1 &&
        left?.kind === 'dxf' && right?.kind === 'dxf' && leftIndex >= 0 && leftIndex < rightIndex &&
        !model.boreholes.slice(leftIndex + 1, rightIndex).some(item => item.kind === 'dxf') &&
        !fictitiousRulePairs.has(pairKey))
      if (!column.name.trim() || !validRule) {
        add({
          kind: 'invalid-fictitious-rule',
          boreholeId: column.id,
          title: `${column.name || column.id}: некорректное правило фиктивной скважины`,
          detail: 'Нужны непустое имя и обоснование, две разные исходные DXF-скважины слева направо и уникальная доля строго между 0 и 1.'
        })
      }
      if (rule) fictitiousRulePairs.add(pairKey)
    } else if (column.interpolation) {
      add({ kind: 'invalid-fictitious-rule', boreholeId: column.id, title: `${column.name}: правило присвоено исходной скважине`, detail: 'Правило интерполяции допускается только для объекта типа «фиктивная».' })
    }
    for (const handle of column.sourceRefs.sideLines) checkSourceReference(handle, column, null, 'Боковая линия колонки')
    checkSourceReference(column.sourceRefs.nameText, column, null, 'Подпись наименования')
    for (const [layerIndex, layer] of column.layers.entries()) {
      if (layerOwners.has(layer.id)) {
        add({ kind: 'duplicate-layer-id', boreholeId: column.id, layerId: layer.id, title: `Повтор идентификатора слоя ${layer.id}`, detail: `Слой уже встречается в скважине ${layerOwners.get(layer.id)}. Данные не объединяются автоматически.` })
      } else layerOwners.set(layer.id, column.id)
      checkSourceReference(layer.sourceRefs.depthText, column, layer, 'Подпись глубины подошвы')
      for (const handle of layer.sourceRefs.codeTexts) checkSourceReference(handle, column, layer, 'Подпись кандидата ИГЭ')
      const depthIssue = getCoreLayerDepthIssue(column.layers, layerIndex)
      if (depthIssue === 'invalid-depth') {
        add({ kind: 'invalid-depth', boreholeId: column.id, layerId: layer.id, title: `${column.name}: некорректная подошва`, detail: `Слой ${layer.ordinal}: глубина должна быть положительным конечным числом.` })
      } else if (depthIssue === 'depth-order') {
        const previousDepth = column.layers[layerIndex - 1]?.bottomDepth ?? 0
        add({ kind: 'depth-order', boreholeId: column.id, layerId: layer.id, title: `${column.name}: нарушен порядок подошв`, detail: `Слой ${layer.ordinal}: глубина ${layer.bottomDepth} м не превышает предыдущую ${previousDepth} м.` })
      }
    }
  }

  for (const [key, passport] of Object.entries(model.passports)) {
    if (key === '__unassigned__' || getIgeKey(key) !== key || passport.key !== key) {
      add({ kind: 'invalid-passport-key', passportKey: key, title: `Некорректный ключ паспорта ${key}`, detail: 'Ключ паспорта должен быть нормализованным непустым кодом ИГЭ и совпадать с ключом записи.' })
    }
    if (passport.appearance && (!/^#[0-9A-Fa-f]{6}$/.test(passport.appearance.color) || !SOIL_HATCHES.includes(passport.appearance.hatch))) {
      add({ kind: 'invalid-soil-appearance', passportKey: key, title: `Некорректное оформление ИГЭ ${key}`, detail: 'Цвет должен быть шестизначным HEX, а штриховка — одним из поддерживаемых условных шаблонов. Геологические данные не изменены.' })
    }
  }

  const hatchSignatures = new Set((model.project.geometry.hatches || []).map(hatch => getHatchSignature(hatch)))
  const legendSignatures = new Set<string>()
  for (const entry of model.hatchLegend || []) {
    if (legendSignatures.has(entry.signature) || !hatchSignatures.has(entry.signature) ||
      !entry.igeKey.trim() || entry.igeKey === '__unassigned__' || getIgeKey(entry.igeKey) !== entry.igeKey || !entry.updatedAt.trim()) {
      add({
        kind: 'invalid-hatch-legend', passportKey: entry.igeKey,
        title: 'Некорректная ручная легенда HATCH',
        detail: 'Связь должна однозначно ссылаться на исходное сочетание параметров HATCH и нормализованный ИГЭ; неизвестные записи не применяются.'
      })
    }
    legendSignatures.add(entry.signature)
  }

  const correlationIds = new Set<string>()
  const correlationPairs = new Set<string>()
  const correlationLayers = new Set<string>()
  for (const correlation of model.manualCorrelations) {
    const leftOwner = layerOwners.get(correlation.leftLayerId)
    const rightOwner = layerOwners.get(correlation.rightLayerId)
    const pairKey = `${correlation.leftLayerId}|${correlation.rightLayerId}`
    if (correlationIds.has(correlation.id) || correlationPairs.has(pairKey)) {
      add({ kind: 'duplicate-correlation', title: 'Повтор ручной корреляции', detail: `Связь ${correlation.id} дублирует идентификатор или пару подошв.` })
    }
    correlationIds.add(correlation.id)
    correlationPairs.add(pairKey)
    if (!leftOwner || !rightOwner || leftOwner === rightOwner || !correlation.note.trim()) {
      add({ kind: 'invalid-correlation', title: 'Некорректная ручная корреляция', detail: 'Обе подошвы должны существовать в разных скважинах, а инженерное обоснование не может быть пустым.' })
      continue
    }
    const leftIndex = model.boreholes.findIndex(item => item.id === leftOwner)
    const rightIndex = model.boreholes.findIndex(item => item.id === rightOwner)
    if (leftIndex >= rightIndex) {
      add({ kind: 'invalid-correlation', title: 'Нарушена ориентация ручной корреляции', detail: 'Левая подошва должна принадлежать скважине, расположенной левее по исходному порядку модели.' })
    }
    const ownerPair = `${leftOwner}|${rightOwner}`
    for (const layerId of [correlation.leftLayerId, correlation.rightLayerId]) {
      const useKey = `${ownerPair}|${layerId}`
      if (correlationLayers.has(useKey)) {
        add({ kind: 'duplicate-correlation', title: 'Конфликт ручных корреляций', detail: `Подошва ${layerId} уже использована в другой ручной связи этой пары скважин.` })
      }
      correlationLayers.add(useKey)
    }
  }

  const gapDecisionIds = new Set<string>()
  const gapDecisionPairs = new Set<string>()
  for (const decision of model.gapDecisions) {
    const pairKey = `${decision.leftLayerId || ''}|${decision.rightLayerId || ''}`
    if (gapDecisionIds.has(decision.id) || gapDecisionPairs.has(pairKey)) {
      add({ kind: 'duplicate-gap-decision', title: 'Повтор решения по разрыву', detail: `Решение ${decision.id} дублирует идентификатор или пару подошв.` })
    }
    gapDecisionIds.add(decision.id)
    gapDecisionPairs.add(pairKey)
    const leftOwner = decision.leftLayerId ? layerOwners.get(decision.leftLayerId) : null
    const rightOwner = decision.rightLayerId ? layerOwners.get(decision.rightLayerId) : null
    const validFraction = decision.kind === 'pinchout'
      ? decision.fraction !== null && Number.isFinite(decision.fraction) && decision.fraction > 0 && decision.fraction < 1
      : decision.fraction === null
    if ((!leftOwner && !rightOwner) || Boolean(leftOwner) === Boolean(rightOwner) || !decision.note.trim() || !validFraction) {
      add({
        kind: 'invalid-gap-decision',
        boreholeId: leftOwner || rightOwner || undefined,
        layerId: decision.leftLayerId || decision.rightLayerId || undefined,
        title: 'Некорректное решение по разрыву',
        detail: 'Нужна одна существующая подошва и обоснование; доля точки выклинивания должна быть строго между 0 и 1.'
      })
    }
  }
  return issues
}

export function getCoreModelStats(model: CoreModel) {
  return {
    boreholes: model.boreholes.length,
    sourceBoreholes: model.boreholes.filter(column => column.kind === 'dxf').length,
    fictitious: model.boreholes.filter(column => column.kind === 'fictitious').length,
    layers: model.boreholes.reduce((sum, column) => sum + column.layers.length, 0),
    passports: Object.keys(model.passports).length
  }
}
