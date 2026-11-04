import {
  getCharacteristicCoverage,
  getIgeKey,
  getProjectLabIssues,
  type ActivityItem,
  type Borehole,
  type CodeCandidate,
  type CodeStatus,
  type CodeSummaryItem,
  type GeoIssue,
  type GeoProject,
  type IgePassport,
  type LabTest,
  type LayerDepthIssue,
  type LayerNeighbor,
  type LayerNeighbors,
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
  depthSource: 'dxf' | 'manual'
}

export interface CoreBorehole {
  id: string
  index: number
  name: string
  sourceNamed: boolean
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
  labTests: LabTest[]
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
}

export interface CoreDxfExtraction {
  geo: GeoProject['geometry']
  columns: {
    x: number
    sideTop: number
    sideBottom: number
    levels: number[]
  }[]
  names: string[]
  depths: { excluded: Borehole['excluded'] }[]
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
  | 'duplicate-test-id'
  | 'unknown-test-borehole'
  | 'unknown-test-layer'

export interface CoreModelIssue {
  id: string
  kind: CoreIssueKind
  severity: 'error'
  title: string
  detail: string
  boreholeId?: string
  layerId?: string
  passportKey?: string
  testId?: string
}

const cloneTest = (test: LabTest): LabTest => ({
  ...test,
  values: { ...test.values }
})

const clonePassport = (key: string, passport: IgePassport): CoreIgePassport => ({
  key,
  name: passport.name,
  description: passport.description,
  notes: passport.notes,
  characteristics: Object.fromEntries(
    Object.entries(passport.characteristics || {}).map(([property, record]) => [property, { ...record }])
  ),
  labTests: (passport.labTests || []).map(cloneTest)
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
        codeSource: layer.status === 'topology' ? 'Границы слоя' : layer.status === 'vertical-only' ? 'Положение кружка' : 'Требует проверки',
        depthSource: 'dxf'
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
      geometry: {
        segments: segments.map(segment => ({ ...segment })),
        circles: extraction.geo.circles.map(circle => ({ ...circle })),
        texts: extraction.geo.texts.map(text => ({ ...text }))
      },
      bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
      activity: [{ id: `import-${now.getTime()}`, type: 'system', text: 'Проект сформирован локально из DXF и Excel', at: now.toLocaleString('ru-RU') }]
    },
    boreholes,
    passports: {}
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
      geometry: {
        segments: project.geometry.segments.map(segment => ({ ...segment })),
        circles: project.geometry.circles.map(circle => ({ ...circle })),
        texts: project.geometry.texts.map(text => ({ ...text }))
      },
      bounds: { ...project.bounds },
      activity: project.activity.map(item => ({ ...item }))
    },
    boreholes: project.columns.map(column => ({
      id: column.id,
      index: column.index,
      name: column.name,
      sourceNamed: column.sourceNamed,
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
        depthSource: layer.depthSource || 'dxf'
      })),
      excludedLabels: column.excluded.map(label => ({ ...label }))
    })),
    passports: Object.fromEntries(
      Object.entries(project.igePassports || {}).map(([key, passport]) => [key, clonePassport(key, passport)])
    )
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
      layers: column.layers.map(layer => ({
        id: layer.id,
        depth: layer.bottomDepth,
        y: layer.drawingY,
        ige: layer.igeCode,
        status: layer.codeStatus,
        candidates: layer.candidates.map(candidate => ({ ...candidate })),
        source: layer.codeSource,
        depthSource: layer.depthSource
      })),
      excluded: column.excludedLabels.map(label => ({ ...label }))
    })),
    geometry: {
      segments: model.project.geometry.segments.map(segment => ({ ...segment })),
      circles: model.project.geometry.circles.map(circle => ({ ...circle })),
      texts: model.project.geometry.texts.map(text => ({ ...text }))
    },
    bounds: { ...model.project.bounds },
    igePassports: Object.fromEntries(
      Object.entries(model.passports).map(([key, passport]) => [key, {
        name: passport.name,
        description: passport.description,
        notes: passport.notes,
        characteristics: Object.fromEntries(
          Object.entries(passport.characteristics).map(([property, record]) => [property, { ...record }])
        ),
        labTests: passport.labTests.map(cloneTest)
      }])
    ),
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
 * Геологическая очередь читает уже доказанные статусы и кандидатов.
 * Она не запускает распознавание заново и не заменяет ручные решения.
 */
export function getCoreIssues(model: CoreModel): GeoIssue[] {
  const issues: GeoIssue[] = []
  for (const column of model.boreholes) {
    if (!column.included) continue
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
  const projectLabIssues = getProjectLabIssues(createProjectFromCore(model))
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
          labTestCount: passport?.labTests.length || 0,
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

  const boreholeIds = new Set<string>()
  const layerOwners = new Map<string, string>()
  for (const column of model.boreholes) {
    if (boreholeIds.has(column.id)) {
      add({ kind: 'duplicate-borehole-id', boreholeId: column.id, title: `Повтор идентификатора скважины ${column.id}`, detail: 'Идентификаторы должны быть уникальны, иначе ссылки образцов и ручные решения нельзя считать однозначными.' })
    }
    boreholeIds.add(column.id)
    if (column.coordinates && (!Number.isFinite(column.coordinates.x) || !Number.isFinite(column.coordinates.y))) {
      add({ kind: 'invalid-coordinates', boreholeId: column.id, title: `${column.name}: некорректные координаты`, detail: 'Координаты X и Y должны быть конечными числами либо отсутствовать.' })
    }
    for (const [layerIndex, layer] of column.layers.entries()) {
      if (layerOwners.has(layer.id)) {
        add({ kind: 'duplicate-layer-id', boreholeId: column.id, layerId: layer.id, title: `Повтор идентификатора слоя ${layer.id}`, detail: `Слой уже встречается в скважине ${layerOwners.get(layer.id)}. Данные не объединяются автоматически.` })
      } else layerOwners.set(layer.id, column.id)
      const depthIssue = getCoreLayerDepthIssue(column.layers, layerIndex)
      if (depthIssue === 'invalid-depth') {
        add({ kind: 'invalid-depth', boreholeId: column.id, layerId: layer.id, title: `${column.name}: некорректная подошва`, detail: `Слой ${layer.ordinal}: глубина должна быть положительным конечным числом.` })
      } else if (depthIssue === 'depth-order') {
        const previousDepth = column.layers[layerIndex - 1]?.bottomDepth ?? 0
        add({ kind: 'depth-order', boreholeId: column.id, layerId: layer.id, title: `${column.name}: нарушен порядок подошв`, detail: `Слой ${layer.ordinal}: глубина ${layer.bottomDepth} м не превышает предыдущую ${previousDepth} м.` })
      }
    }
  }

  const testIds = new Set<string>()
  for (const [key, passport] of Object.entries(model.passports)) {
    if (key === '__unassigned__' || getIgeKey(key) !== key || passport.key !== key) {
      add({ kind: 'invalid-passport-key', passportKey: key, title: `Некорректный ключ паспорта ${key}`, detail: 'Ключ паспорта должен быть нормализованным непустым кодом ИГЭ и совпадать с ключом записи.' })
    }
    for (const test of passport.labTests) {
      if (testIds.has(test.id)) {
        add({ kind: 'duplicate-test-id', passportKey: key, testId: test.id, title: `Повтор идентификатора испытания ${test.id}`, detail: 'Идентификатор испытания должен однозначно определять запись во всём проекте.' })
      }
      testIds.add(test.id)
      if (test.boreholeId && !boreholeIds.has(test.boreholeId)) {
        add({ kind: 'unknown-test-borehole', passportKey: key, testId: test.id, title: `${test.sample || 'Без номера'}: ссылка на скважину не найдена`, detail: `Идентификатор ${test.boreholeId} отсутствует в модели. Ссылка сохранена для ручной проверки.` })
      }
      if (test.layerId && layerOwners.get(test.layerId) !== test.boreholeId) {
        add({ kind: 'unknown-test-layer', passportKey: key, testId: test.id, boreholeId: test.boreholeId, layerId: test.layerId, title: `${test.sample || 'Без номера'}: ссылка на слой не найдена`, detail: `Слой ${test.layerId} не принадлежит указанной скважине ${test.boreholeId || '—'}. Привязка не изменяется автоматически.` })
      }
    }
  }
  return issues
}

export function getCoreModelStats(model: CoreModel) {
  return {
    boreholes: model.boreholes.length,
    layers: model.boreholes.reduce((sum, column) => sum + column.layers.length, 0),
    passports: Object.keys(model.passports).length,
    tests: Object.values(model.passports).reduce((sum, passport) => sum + passport.labTests.length, 0)
  }
}
