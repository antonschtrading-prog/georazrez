import {
  getIgeKey,
  type ActivityItem,
  type Borehole,
  type CodeCandidate,
  type CodeStatus,
  type GeoProject,
  type IgePassport,
  type LabTest,
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
    let previousDepth = 0
    for (const layer of column.layers) {
      if (layerOwners.has(layer.id)) {
        add({ kind: 'duplicate-layer-id', boreholeId: column.id, layerId: layer.id, title: `Повтор идентификатора слоя ${layer.id}`, detail: `Слой уже встречается в скважине ${layerOwners.get(layer.id)}. Данные не объединяются автоматически.` })
      } else layerOwners.set(layer.id, column.id)
      if (!Number.isFinite(layer.bottomDepth) || layer.bottomDepth <= 0) {
        add({ kind: 'invalid-depth', boreholeId: column.id, layerId: layer.id, title: `${column.name}: некорректная подошва`, detail: `Слой ${layer.ordinal}: глубина должна быть положительным конечным числом.` })
      } else if (layer.bottomDepth <= previousDepth) {
        add({ kind: 'depth-order', boreholeId: column.id, layerId: layer.id, title: `${column.name}: нарушен порядок подошв`, detail: `Слой ${layer.ordinal}: глубина ${layer.bottomDepth} м не превышает предыдущую ${previousDepth} м.` })
      }
      previousDepth = layer.bottomDepth
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
