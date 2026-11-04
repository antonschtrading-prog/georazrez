import {
  getCoreBoreholeBoundaryIssues,
  getCoreBoundaryModel,
  getCoreIssues,
  getCoreFictitiousPreview,
  getCoreFictitiousSourceFingerprint,
  getCoreInterpolationReviewItems,
  type CoreBorehole,
  type CoreFictitiousPreview,
  type CoreLayer,
  type CoreModel
} from './geologyCore'
import { getIgeKey, SOIL_CHARACTERISTICS, type ActivityItem, type CodeStatus, type GapDecision, type GapDecisionKind, type SoilCharacteristicField, type SoilCharacteristicKey } from '@/types/geology'

function withActivity(
  model: CoreModel,
  boreholes: CoreBorehole[],
  text: string,
  now: Date,
  type: ActivityItem['type'] = 'manual',
  metadata: Partial<Pick<ActivityItem, 'category' | 'boreholeIds' | 'layerIds' | 'passportKeys'>> = {}
): CoreModel {
  return {
    ...model,
    boreholes,
    project: {
      ...model.project,
      activity: [
        { ...metadata, id: `event-${now.getTime()}-${Math.random()}`, type, text, at: now.toLocaleString('ru-RU') },
        ...model.project.activity
      ].slice(0, 100)
    }
  }
}

function requireBorehole(model: CoreModel, boreholeId: string): CoreBorehole {
  const borehole = model.boreholes.find(item => item.id === boreholeId)
  if (!borehole) throw new Error('Скважина не найдена в канонической модели')
  return borehole
}

function requireLayer(borehole: CoreBorehole, layerId: string): CoreLayer {
  const layer = borehole.layers.find(item => item.id === layerId)
  if (!layer) throw new Error('Слой не найден в канонической модели')
  return layer
}

function resetReview(borehole: CoreBorehole): CoreBorehole {
  return { ...borehole, review: { reviewed: false, reviewedAt: '' } }
}

function replaceBorehole(model: CoreModel, next: CoreBorehole): CoreBorehole[] {
  return model.boreholes.map(item => item.id === next.id ? next : item)
}

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))]
}

function renumberLayers(layers: CoreLayer[]): CoreLayer[] {
  return layers.map((layer, index) => ({ ...layer, ordinal: index + 1 }))
}

export function addCoreActivity(
  model: CoreModel,
  text: string,
  type: ActivityItem['type'] = 'manual',
  now = new Date()
): CoreModel {
  return withActivity(model, model.boreholes, text, now, type)
}

export function renameCoreBorehole(
  model: CoreModel,
  boreholeId: string,
  name: string,
  now = new Date()
): CoreModel {
  const borehole = requireBorehole(model, boreholeId)
  if (!borehole.included) throw new Error('Исключённая колонка не редактируется')
  if (borehole.kind === 'fictitious' && !name.trim()) throw new Error('Фиктивная скважина должна иметь непустое наименование')
  if (name === borehole.name) return model
  const next = resetReview({ ...borehole, name, sourceNamed: name.trim().length > 0 })
  return withActivity(
    model,
    replaceBorehole(model, next),
    `Скважина №${borehole.index}: наименование изменено с «${borehole.name}» на «${name.trim() || 'без имени'}»`,
    now,
    'manual',
    { category: 'geology', boreholeIds: [boreholeId] }
  )
}

export function changeCoreLayerDepth(
  model: CoreModel,
  boreholeId: string,
  layerId: string,
  depth: number,
  now = new Date()
): CoreModel {
  const borehole = requireBorehole(model, boreholeId)
  if (!borehole.included) throw new Error('Исключённая колонка не редактируется')
  const layer = requireLayer(borehole, layerId)
  const index = borehole.layers.findIndex(item => item.id === layerId)
  const previous = borehole.layers[index - 1]?.bottomDepth ?? 0
  const next = borehole.layers[index + 1]?.bottomDepth ?? Infinity
  if (!Number.isFinite(depth) || depth <= previous || depth >= next) {
    throw new Error('Глубина должна возрастать от предыдущего слоя к следующему')
  }
  if (depth === layer.bottomDepth) return model
  const nextBorehole = resetReview({
    ...borehole,
    layers: borehole.layers.map(item => item.id === layerId ? {
      ...item,
      bottomDepth: depth,
      drawingY: borehole.drawing.top - depth * (1000 / model.project.verticalScale),
      depthSource: 'manual'
    } : item)
  })
  return withActivity(
    model,
    replaceBorehole(model, nextBorehole),
    `${borehole.name}: глубина слоя ${index + 1} изменена с ${String(layer.bottomDepth).replace('.', ',')} на ${String(depth).replace('.', ',')} м`,
    now,
    'manual',
    { category: 'geology', boreholeIds: [boreholeId], layerIds: [layerId] }
  )
}

export function changeCoreLayerCode(
  model: CoreModel,
  boreholeId: string,
  layerId: string,
  code: string,
  status?: CodeStatus,
  now = new Date()
): CoreModel {
  const borehole = requireBorehole(model, boreholeId)
  if (!borehole.included) throw new Error('Исключённая колонка не редактируется')
  const layer = requireLayer(borehole, layerId)
  const nextStatus = status || (code ? 'manual' : 'not-found')
  if (layer.igeCode === code && layer.codeStatus === nextStatus) return model
  const nextBorehole = resetReview({
    ...borehole,
    layers: borehole.layers.map(item => item.id === layerId ? {
      ...item,
      igeCode: code,
      igeKey: code.trim() ? getIgeKey(code) : null,
      codeStatus: nextStatus,
      codeSource: code ? 'Ручное подтверждение' : 'Требует проверки'
    } : item)
  })
  return withActivity(
    model,
    replaceBorehole(model, nextBorehole),
    `${borehole.name}, ${String(layer.bottomDepth).replace('.', ',')} м: ИГЭ ${code || 'не задан'}`,
    now,
    'manual',
    { category: 'geology', boreholeIds: [boreholeId], layerIds: [layerId] }
  )
}

export interface CoreLayerInsertion {
  model: CoreModel
  layerId: string
}

export function addCoreLayer(
  model: CoreModel,
  boreholeId: string,
  afterLayerId: string | null,
  depth: number,
  code: string,
  now = new Date()
): CoreLayerInsertion {
  const borehole = requireBorehole(model, boreholeId)
  if (!borehole.included) throw new Error('Исключённая колонка не редактируется')
  const insertionIndex = afterLayerId ? borehole.layers.findIndex(layer => layer.id === afterLayerId) + 1 : borehole.layers.length
  if (afterLayerId && insertionIndex === 0) throw new Error('Слой, после которого добавляется подошва, не найден')
  const previous = borehole.layers[insertionIndex - 1]?.bottomDepth ?? 0
  const next = borehole.layers[insertionIndex]?.bottomDepth ?? Infinity
  if (!Number.isFinite(depth) || depth <= previous || depth >= next) {
    throw new Error('Новая глубина нарушает порядок подошв')
  }
  const layerId = `${boreholeId}-manual-${now.getTime()}`
  if (model.boreholes.some(column => column.layers.some(layer => layer.id === layerId))) {
    throw new Error('Не удалось создать уникальный идентификатор слоя; повторите действие')
  }
  const layer: CoreLayer = {
    id: layerId,
    boreholeId,
    ordinal: insertionIndex + 1,
    bottomDepth: depth,
    drawingY: borehole.drawing.top - depth * (1000 / model.project.verticalScale),
    igeCode: code,
    igeKey: code.trim() ? getIgeKey(code) : null,
    codeStatus: code ? 'manual' : 'not-found',
    candidates: [],
    codeSource: code ? 'Ручное добавление' : 'Новый слой: требуется ИГЭ',
    depthSource: 'manual',
    sourceRefs: { depthText: '', codeTexts: [] }
  }
  const layers = [...borehole.layers]
  layers.splice(insertionIndex, 0, layer)
  const nextBorehole = resetReview({ ...borehole, layers: renumberLayers(layers) })
  return {
    model: withActivity(
      model,
      replaceBorehole(model, nextBorehole),
      `${borehole.name}: добавлена подошва ${String(depth).replace('.', ',')} м${code ? `, ИГЭ ${code}` : ', код ИГЭ требует проверки'}`,
      now,
      'manual',
      { category: 'geology', boreholeIds: [boreholeId], layerIds: [layerId] }
    ),
    layerId
  }
}

export function deleteCoreLayer(
  model: CoreModel,
  boreholeId: string,
  layerId: string,
  now = new Date()
): CoreModel {
  const borehole = requireBorehole(model, boreholeId)
  if (!borehole.included) throw new Error('Исключённая колонка не редактируется')
  const layer = requireLayer(borehole, layerId)
  if (model.manualCorrelations.some(correlation => correlation.leftLayerId === layerId || correlation.rightLayerId === layerId)) {
    throw new Error('Сначала снимите ручную корреляцию этой подошвы')
  }
  if (model.gapDecisions.some(decision => decision.leftLayerId === layerId || decision.rightLayerId === layerId)) {
    throw new Error('Сначала удалите решение по разрыву этой подошвы')
  }
  const nextBorehole = resetReview({
    ...borehole,
    layers: renumberLayers(borehole.layers.filter(item => item.id !== layerId))
  })
  return withActivity(
    model,
    replaceBorehole(model, nextBorehole),
    `${borehole.name}: удалена подошва ${String(layer.bottomDepth).replace('.', ',')} м${layer.igeCode ? `, ИГЭ ${layer.igeCode}` : ''}`,
    now,
    'manual',
    { category: 'geology', boreholeIds: [boreholeId], layerIds: [layerId] }
  )
}

export function setCoreBoreholeIncluded(
  model: CoreModel,
  boreholeId: string,
  included: boolean,
  reason: string,
  now = new Date()
): CoreModel {
  const borehole = requireBorehole(model, boreholeId)
  if (borehole.included === included) return model
  if (!included && !reason.trim()) throw new Error('Укажите причину исключения колонки')
  const next: CoreBorehole = {
    ...borehole,
    included,
    exclusionReason: included ? '' : reason,
    review: { reviewed: false, reviewedAt: '' }
  }
  return withActivity(
    model,
    replaceBorehole(model, next),
    included ? `${borehole.name}: возвращена в расчёт` : `${borehole.name}: исключена из расчёта. Причина: ${reason}`,
    now,
    'manual',
    { category: 'review', boreholeIds: [boreholeId] }
  )
}

export function setCoreBoreholeReviewed(
  model: CoreModel,
  boreholeId: string,
  reviewed: boolean,
  now = new Date()
): CoreModel {
  const borehole = requireBorehole(model, boreholeId)
  if (!borehole.included) throw new Error('Исключённая колонка не подтверждается')
  if (reviewed && getCoreIssues(model).some(issue => issue.boreholeId === boreholeId)) {
    throw new Error('Сначала решите все проблемы этой скважины')
  }
  if (reviewed && getCoreBoreholeBoundaryIssues(getCoreBoundaryModel(model), boreholeId).length) {
    throw new Error('Сначала устраните некорректные границы корреляции этой скважины')
  }
  if (reviewed && getCoreInterpolationReviewItems(model).some(issue => issue.boreholeId === boreholeId)) {
    throw new Error('Сначала проверьте актуальность правила интерполяции и при необходимости явно подтвердите пересчёт')
  }
  if (borehole.review.reviewed === reviewed) return model
  const next: CoreBorehole = {
    ...borehole,
    review: { reviewed, reviewedAt: reviewed ? now.toLocaleString('ru-RU') : '' }
  }
  return withActivity(
    model,
    replaceBorehole(model, next),
    reviewed ? `${borehole.name}: проверка подтверждена инженером` : `${borehole.name}: подтверждение проверки снято`,
    now,
    'manual',
    { category: 'review', boreholeIds: [boreholeId] }
  )
}

export type CorePassportField = 'name' | 'description' | 'notes'

const PASSPORT_FIELD_LABELS: Record<CorePassportField, string> = {
  name: 'наименование',
  description: 'описание грунта',
  notes: 'примечание'
}

const CHARACTERISTIC_FIELD_LABELS: Record<SoilCharacteristicField, string> = {
  standard: 'нормативное значение',
  design: 'расчётное значение',
  source: 'источник'
}

function resetPassportReview(model: CoreModel, key: string): CoreBorehole[] {
  return model.boreholes.map(borehole => borehole.layers.some(layer =>
    (layer.igeKey ?? getIgeKey(layer.igeCode)) === key
  ) ? resetReview(borehole) : borehole)
}

function passportActivityMetadata(
  model: CoreModel,
  key: string
): Pick<ActivityItem, 'category' | 'boreholeIds' | 'layerIds' | 'passportKeys'> {
  const borehole = model.boreholes.find(column => column.layers.some(layer =>
    (layer.igeKey ?? getIgeKey(layer.igeCode)) === key
  ))
  const layer = borehole?.layers.find(item => (item.igeKey ?? getIgeKey(item.igeCode)) === key)
  return {
    category: 'passport',
    boreholeIds: borehole ? [borehole.id] : [],
    layerIds: layer ? [layer.id] : [],
    passportKeys: [key]
  }
}

export function changeCorePassport(
  model: CoreModel,
  code: string,
  field: CorePassportField,
  value: string,
  now = new Date()
): CoreModel {
  const key = getIgeKey(code)
  if (key === '__unassigned__') return model
  const previous = model.passports[key] || {
    key,
    name: '',
    description: '',
    notes: '',
    characteristics: {}
  }
  if (previous[field] === value) return model
  const next = withActivity(
    model,
    resetPassportReview(model, key),
    `ИГЭ ${code}: изменено поле «${PASSPORT_FIELD_LABELS[field]}» паспорта`,
    now,
    'manual',
    passportActivityMetadata(model, key)
  )
  return {
    ...next,
    passports: {
      ...model.passports,
      [key]: { ...previous, [field]: value }
    }
  }
}

export function changeCoreCharacteristic(
  model: CoreModel,
  code: string,
  property: SoilCharacteristicKey,
  field: SoilCharacteristicField,
  value: number | string | null,
  now = new Date()
): CoreModel {
  const key = getIgeKey(code)
  if (key === '__unassigned__') return model
  const characteristic = SOIL_CHARACTERISTICS.find(item => item.key === property)
  if (!characteristic) throw new Error('Характеристика грунта не найдена')
  let normalizedValue: number | string | null
  if (field === 'source') normalizedValue = String(value ?? '')
  else if (value === null) normalizedValue = null
  else if (typeof value === 'number' && Number.isFinite(value)) normalizedValue = value
  else throw new Error('Нормативное или расчётное значение должно быть конечным числом либо пустым')

  const previousPassport = model.passports[key] || {
    key,
    name: '',
    description: '',
    notes: '',
    characteristics: {}
  }
  const previousRecord = previousPassport.characteristics[property] || {
    standard: null,
    design: null,
    source: ''
  }
  if (previousRecord[field] === normalizedValue) return model
  const next = withActivity(
    model,
    resetPassportReview(model, key),
    `ИГЭ ${code}: ${characteristic.label}, изменено поле «${CHARACTERISTIC_FIELD_LABELS[field]}»`,
    now,
    'manual',
    passportActivityMetadata(model, key)
  )
  return {
    ...next,
    passports: {
      ...model.passports,
      [key]: {
        ...previousPassport,
        characteristics: {
          ...previousPassport.characteristics,
          [property]: { ...previousRecord, [field]: normalizedValue }
        }
      }
    }
  }
}

function findLayerOwner(model: CoreModel, layerId: string): CoreBorehole | undefined {
  return model.boreholes.find(borehole => borehole.layers.some(layer => layer.id === layerId))
}

export function addCoreManualCorrelation(
  model: CoreModel,
  sourceLayerId: string,
  targetLayerId: string,
  note: string,
  now = new Date()
): CoreModel {
  if (!note.trim()) throw new Error('Укажите инженерное обоснование корреляции')
  if (sourceLayerId === targetLayerId) throw new Error('Подошва не может коррелироваться сама с собой')
  const source = findLayerOwner(model, sourceLayerId)
  const target = findLayerOwner(model, targetLayerId)
  if (!source || !target) throw new Error('Одна из подошв не найдена в канонической модели')
  const active = model.boreholes.filter(borehole => borehole.included)
  const sourceIndex = active.findIndex(borehole => borehole.id === source.id)
  const targetIndex = active.findIndex(borehole => borehole.id === target.id)
  if (sourceIndex < 0 || targetIndex < 0 || Math.abs(sourceIndex - targetIndex) !== 1) {
    throw new Error('Ручная корреляция допускается только между соседними активными скважинами')
  }
  const left = sourceIndex < targetIndex ? source : target
  const right = sourceIndex < targetIndex ? target : source
  const leftLayerId = sourceIndex < targetIndex ? sourceLayerId : targetLayerId
  const rightLayerId = sourceIndex < targetIndex ? targetLayerId : sourceLayerId
  const exact = model.manualCorrelations.find(correlation =>
    correlation.leftLayerId === leftLayerId && correlation.rightLayerId === rightLayerId
  )
  if (exact) return model
  const conflict = model.manualCorrelations.find(correlation => {
    const existingLeft = findLayerOwner(model, correlation.leftLayerId)
    const existingRight = findLayerOwner(model, correlation.rightLayerId)
    return existingLeft?.id === left.id && existingRight?.id === right.id &&
      (correlation.leftLayerId === leftLayerId || correlation.rightLayerId === rightLayerId)
  })
  if (conflict) throw new Error('Одна из подошв уже имеет ручную корреляцию в этой паре скважин')
  const decidedGap = getCoreBoundaryModel(model).items.some(item => item.gapDecisionId &&
    item.leftBoreholeId === left.id && item.rightBoreholeId === right.id &&
    (item.leftLayerId === leftLayerId || item.rightLayerId === rightLayerId))
  if (decidedGap) throw new Error('Сначала удалите решение по разрыву между этими подошвами')

  const leftLayer = requireLayer(left, leftLayerId)
  const rightLayer = requireLayer(right, rightLayerId)
  const correlation = {
    id: `correlation-${leftLayerId}-${rightLayerId}`,
    leftLayerId,
    rightLayerId,
    note: note.trim(),
    createdAt: now.toISOString()
  }
  const next = withActivity(
    model,
    model.boreholes.map(borehole => borehole.id === left.id || borehole.id === right.id ? resetReview(borehole) : borehole),
    `${left.name}, подошва ${leftLayer.ordinal} ↔ ${right.name}, подошва ${rightLayer.ordinal}: добавлена ручная корреляция. Обоснование: ${correlation.note}`,
    now,
    'manual',
    { category: 'correlation', boreholeIds: [left.id, right.id], layerIds: [leftLayerId, rightLayerId] }
  )
  return { ...next, manualCorrelations: [...model.manualCorrelations, correlation] }
}

export function updateCoreManualCorrelation(
  model: CoreModel,
  correlationId: string,
  leftLayerId: string,
  rightLayerId: string,
  note: string,
  now = new Date()
): CoreModel {
  const normalizedNote = note.trim()
  if (!normalizedNote) throw new Error('Укажите инженерное обоснование корреляции')
  const correlation = model.manualCorrelations.find(item => item.id === correlationId)
  if (!correlation) return model
  if (correlation.leftLayerId === leftLayerId && correlation.rightLayerId === rightLayerId && correlation.note === normalizedNote) return model
  if (leftLayerId === rightLayerId) throw new Error('Подошва не может коррелироваться сама с собой')
  const left = findLayerOwner(model, leftLayerId)
  const right = findLayerOwner(model, rightLayerId)
  if (!left || !right) throw new Error('Нельзя изменить корреляцию: подошва не найдена')
  const active = model.boreholes.filter(borehole => borehole.included)
  const leftIndex = active.findIndex(borehole => borehole.id === left.id)
  const rightIndex = active.findIndex(borehole => borehole.id === right.id)
  if (leftIndex < 0 || rightIndex < 0 || Math.abs(leftIndex - rightIndex) !== 1) {
    throw new Error('Ручная корреляция допускается только между соседними активными скважинами')
  }
  if (leftIndex > rightIndex) throw new Error('При изменении связи сохраняйте порядок скважин слева направо')
  const conflict = model.manualCorrelations.find(item => {
    if (item.id === correlationId) return false
    const existingLeft = findLayerOwner(model, item.leftLayerId)
    const existingRight = findLayerOwner(model, item.rightLayerId)
    return existingLeft?.id === left.id && existingRight?.id === right.id &&
      (item.leftLayerId === leftLayerId || item.rightLayerId === rightLayerId)
  })
  if (conflict) throw new Error('Одна из подошв уже имеет ручную корреляцию в этой паре скважин')
  const decidedGap = getCoreBoundaryModel(model).items.some(item => item.gapDecisionId &&
    item.leftBoreholeId === left.id && item.rightBoreholeId === right.id &&
    (item.leftLayerId === leftLayerId || item.rightLayerId === rightLayerId))
  if (decidedGap) throw new Error('Сначала удалите решение по разрыву между этими подошвами')
  const leftLayer = requireLayer(left, leftLayerId)
  const rightLayer = requireLayer(right, rightLayerId)
  const previousLeft = findLayerOwner(model, correlation.leftLayerId)
  const previousRight = findLayerOwner(model, correlation.rightLayerId)
  const previousLeftLayer = previousLeft?.layers.find(layer => layer.id === correlation.leftLayerId)
  const previousRightLayer = previousRight?.layers.find(layer => layer.id === correlation.rightLayerId)
  const linkChanged = correlation.leftLayerId !== leftLayerId || correlation.rightLayerId !== rightLayerId
  const activityText = linkChanged
    ? `${left.name}, подошва ${previousLeftLayer?.ordinal ?? '—'} ↔ ${right.name}, подошва ${previousRightLayer?.ordinal ?? '—'}: ручная корреляция изменена на ${leftLayer.ordinal} ↔ ${rightLayer.ordinal}. Обоснование: ${normalizedNote}`
    : `${left.name}, подошва ${leftLayer.ordinal} ↔ ${right.name}, подошва ${rightLayer.ordinal}: изменено обоснование ручной корреляции. Новое обоснование: ${normalizedNote}`
  const next = withActivity(
    model,
    model.boreholes.map(borehole => borehole.id === left.id || borehole.id === right.id ? resetReview(borehole) : borehole),
    activityText,
    now,
    'manual',
    {
      category: 'correlation',
      boreholeIds: uniqueIds([left.id, right.id, previousLeft?.id, previousRight?.id]),
      layerIds: uniqueIds([leftLayerId, rightLayerId, correlation.leftLayerId, correlation.rightLayerId])
    }
  )
  return {
    ...next,
    manualCorrelations: model.manualCorrelations.map(item => item.id === correlationId
      ? { ...item, leftLayerId, rightLayerId, note: normalizedNote }
      : item)
  }
}

export function updateCoreManualCorrelationNote(
  model: CoreModel,
  correlationId: string,
  note: string,
  now = new Date()
): CoreModel {
  const correlation = model.manualCorrelations.find(item => item.id === correlationId)
  if (!correlation) return model
  return updateCoreManualCorrelation(model, correlationId, correlation.leftLayerId, correlation.rightLayerId, note, now)
}

export function removeCoreManualCorrelation(
  model: CoreModel,
  correlationId: string,
  now = new Date()
): CoreModel {
  const correlation = model.manualCorrelations.find(item => item.id === correlationId)
  if (!correlation) return model
  const left = findLayerOwner(model, correlation.leftLayerId)
  const right = findLayerOwner(model, correlation.rightLayerId)
  const leftLayer = left?.layers.find(layer => layer.id === correlation.leftLayerId)
  const rightLayer = right?.layers.find(layer => layer.id === correlation.rightLayerId)
  const next = withActivity(
    model,
    model.boreholes.map(borehole => borehole.id === left?.id || borehole.id === right?.id ? resetReview(borehole) : borehole),
    `Ручная корреляция снята: ${left?.name || correlation.leftLayerId}, подошва ${leftLayer?.ordinal ?? '—'} ↔ ${right?.name || correlation.rightLayerId}, подошва ${rightLayer?.ordinal ?? '—'}`,
    now,
    'manual',
    {
      category: 'correlation',
      boreholeIds: uniqueIds([left?.id, right?.id]),
      layerIds: [correlation.leftLayerId, correlation.rightLayerId]
    }
  )
  return { ...next, manualCorrelations: model.manualCorrelations.filter(item => item.id !== correlationId) }
}

function validateGapDecisionInput(
  leftLayerId: string | null,
  rightLayerId: string | null,
  kind: GapDecisionKind,
  fraction: number | null,
  note: string
): string {
  const normalizedNote = note.trim()
  if (Boolean(leftLayerId) === Boolean(rightLayerId)) {
    throw new Error('Решение относится ровно к одной существующей подошве разрыва')
  }
  if (!normalizedNote) throw new Error('Укажите инженерное обоснование решения по разрыву')
  if (kind === 'accepted' && fraction !== null) {
    throw new Error('Для принятого разрыва точка выклинивания не задаётся')
  }
  if (kind === 'pinchout' && (fraction === null || !Number.isFinite(fraction) || fraction <= 0 || fraction >= 1)) {
    throw new Error('Точка выклинивания должна находиться строго между скважинами')
  }
  return normalizedNote
}

function gapDecisionBoreholeIds(model: CoreModel, decision: Pick<GapDecision, 'leftLayerId' | 'rightLayerId'>): Set<string> {
  const ids = new Set<string>()
  const boundary = getCoreBoundaryModel(model).items.find(item =>
    item.leftLayerId === decision.leftLayerId && item.rightLayerId === decision.rightLayerId
  )
  if (boundary) {
    ids.add(boundary.leftBoreholeId)
    ids.add(boundary.rightBoreholeId)
  } else {
    const owner = findLayerOwner(model, decision.leftLayerId || decision.rightLayerId || '')
    if (owner) ids.add(owner.id)
  }
  return ids
}

function describeGapDecision(model: CoreModel, decision: Pick<GapDecision, 'leftLayerId' | 'rightLayerId'>): string {
  const left = decision.leftLayerId ? findLayerOwner(model, decision.leftLayerId) : undefined
  const right = decision.rightLayerId ? findLayerOwner(model, decision.rightLayerId) : undefined
  const leftLayer = left?.layers.find(layer => layer.id === decision.leftLayerId)
  const rightLayer = right?.layers.find(layer => layer.id === decision.rightLayerId)
  return `${left?.name || '—'}, подошва ${leftLayer?.ordinal ?? '—'} ↔ ${right?.name || '—'}, подошва ${rightLayer?.ordinal ?? '—'}`
}

export function addCoreGapDecision(
  model: CoreModel,
  leftLayerId: string | null,
  rightLayerId: string | null,
  kind: GapDecisionKind,
  fraction: number | null,
  note: string,
  now = new Date()
): CoreModel {
  const normalizedNote = validateGapDecisionInput(leftLayerId, rightLayerId, kind, fraction, note)
  const existingLayerId = leftLayerId || rightLayerId!
  if (!findLayerOwner(model, existingLayerId)) throw new Error('Подошва разрыва не найдена в канонической модели')
  const gap = getCoreBoundaryModel(model).items.find(item =>
    (item.status === 'left-only' || item.status === 'right-only') &&
    item.leftLayerId === leftLayerId && item.rightLayerId === rightLayerId
  )
  if (!gap) throw new Error('Текущий разрыв не найден: решение не применено к другой геометрии')
  if (model.gapDecisions.some(decision =>
    decision.leftLayerId === leftLayerId && decision.rightLayerId === rightLayerId
  )) throw new Error('Для этого разрыва уже существует инженерное решение')
  const decision: GapDecision = {
    id: `gap-decision-${existingLayerId}`,
    leftLayerId,
    rightLayerId,
    kind,
    fraction: kind === 'pinchout' ? fraction : null,
    note: normalizedNote,
    createdAt: now.toISOString()
  }
  if (model.gapDecisions.some(item => item.id === decision.id)) {
    throw new Error('Не удалось создать уникальный идентификатор решения')
  }
  const affected = gapDecisionBoreholeIds(model, decision)
  const next = withActivity(
    model,
    model.boreholes.map(borehole => affected.has(borehole.id) ? resetReview(borehole) : borehole),
    `${describeGapDecision(model, decision)}: ${kind === 'accepted' ? 'разрыв принят инженером' : `задано выклинивание на ${(fraction! * 100).toFixed(1).replace('.', ',')}% участка`}. Обоснование: ${normalizedNote}`,
    now,
    'manual',
    {
      category: 'gap',
      boreholeIds: [...affected],
      layerIds: uniqueIds([leftLayerId, rightLayerId])
    }
  )
  return { ...next, gapDecisions: [...model.gapDecisions, decision] }
}

export function updateCoreGapDecision(
  model: CoreModel,
  decisionId: string,
  kind: GapDecisionKind,
  fraction: number | null,
  note: string,
  now = new Date()
): CoreModel {
  const decision = model.gapDecisions.find(item => item.id === decisionId)
  if (!decision) return model
  const normalizedNote = validateGapDecisionInput(decision.leftLayerId, decision.rightLayerId, kind, fraction, note)
  const normalizedFraction = kind === 'pinchout' ? fraction : null
  if (decision.kind === kind && decision.fraction === normalizedFraction && decision.note === normalizedNote) return model
  const affected = gapDecisionBoreholeIds(model, decision)
  const next = withActivity(
    model,
    model.boreholes.map(borehole => affected.has(borehole.id) ? resetReview(borehole) : borehole),
    `${describeGapDecision(model, decision)}: решение по разрыву изменено на «${kind === 'accepted' ? 'принять разрыв' : 'выклинивание'}»${kind === 'pinchout' ? `, положение ${(fraction! * 100).toFixed(1).replace('.', ',')}%` : ''}. Обоснование: ${normalizedNote}`,
    now,
    'manual',
    {
      category: 'gap',
      boreholeIds: [...affected],
      layerIds: uniqueIds([decision.leftLayerId, decision.rightLayerId])
    }
  )
  return {
    ...next,
    gapDecisions: model.gapDecisions.map(item => item.id === decisionId
      ? { ...item, kind, fraction: normalizedFraction, note: normalizedNote }
      : item)
  }
}

export function removeCoreGapDecision(
  model: CoreModel,
  decisionId: string,
  now = new Date()
): CoreModel {
  const decision = model.gapDecisions.find(item => item.id === decisionId)
  if (!decision) return model
  const affected = gapDecisionBoreholeIds(model, decision)
  const next = withActivity(
    model,
    model.boreholes.map(borehole => affected.has(borehole.id) ? resetReview(borehole) : borehole),
    `${describeGapDecision(model, decision)}: решение по разрыву удалено; разрыв снова открыт или остаётся неактивным при изменившейся корреляции`,
    now,
    'manual',
    {
      category: 'gap',
      boreholeIds: [...affected],
      layerIds: uniqueIds([decision.leftLayerId, decision.rightLayerId])
    }
  )
  return { ...next, gapDecisions: model.gapDecisions.filter(item => item.id !== decisionId) }
}

function assertNoFictitiousLinks(model: CoreModel, borehole: CoreBorehole) {
  const layerIds = new Set(borehole.layers.map(layer => layer.id))
  if (model.manualCorrelations.some(item => layerIds.has(item.leftLayerId) || layerIds.has(item.rightLayerId)) ||
      model.gapDecisions.some(item => (item.leftLayerId && layerIds.has(item.leftLayerId)) || (item.rightLayerId && layerIds.has(item.rightLayerId)))) {
    throw new Error('Сначала снимите ручные корреляции и решения по разрывам, связанные с фиктивной скважиной')
  }
}

function interpolatedLayers(model: CoreModel, boreholeId: string, preview: CoreFictitiousPreview): CoreLayer[] {
  const left = requireBorehole(model, preview.leftBoreholeId)
  const right = requireBorehole(model, preview.rightBoreholeId)
  return preview.layers.map(item => {
    const leftLayer = left.layers[item.ordinal - 1]
    const rightLayer = right.layers[item.ordinal - 1]
    const bothCodes = Boolean(item.leftCode && item.rightCode)
    const candidates = item.codeAgreed ? [] : [
      item.leftCode ? {
        code: item.leftCode,
        x: left.drawing.x,
        y: leftLayer.drawingY,
        reason: `Код левой исходной скважины ${left.name}`
      } : null,
      item.rightCode ? {
        code: item.rightCode,
        x: right.drawing.x,
        y: rightLayer.drawingY,
        reason: `Код правой исходной скважины ${right.name}`
      } : null
    ].filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    return {
      id: `${boreholeId}-layer-${item.ordinal}`,
      boreholeId,
      ordinal: item.ordinal,
      bottomDepth: item.depth,
      drawingY: preview.top - item.depth * (1000 / model.project.verticalScale),
      igeCode: item.code,
      igeKey: item.code ? getIgeKey(item.code) : null,
      codeStatus: item.codeAgreed ? 'interpolated' : bothCodes ? 'ambiguous' : 'not-found',
      candidates,
      codeSource: item.codeAgreed
        ? `Линейная интерполяция ${left.name} ↔ ${right.name}: нормализованные коды совпадают`
        : `Линейная интерполяция ${left.name} ↔ ${right.name}: коды различаются или отсутствуют, требуется ручной выбор`,
      depthSource: 'interpolated',
      sourceRefs: { depthText: '', codeTexts: [] }
    }
  })
}

export interface CoreFictitiousInsertion {
  model: CoreModel
  boreholeId: string
}

/** Создание возможно только после того же явного preview, который использует диалог. */
export function addCoreFictitiousBorehole(
  model: CoreModel,
  leftBoreholeId: string,
  rightBoreholeId: string,
  fraction: number,
  name: string,
  note: string,
  now = new Date()
): CoreFictitiousInsertion {
  if (!name.trim()) throw new Error('Укажите наименование фиктивной скважины')
  if (!note.trim()) throw new Error('Укажите инженерное обоснование интерполяции')
  if (model.boreholes.some(item => item.kind === 'fictitious' &&
    item.interpolation?.leftBoreholeId === leftBoreholeId && item.interpolation.rightBoreholeId === rightBoreholeId)) {
    throw new Error('Для этой пары исходных скважин уже существует фиктивная скважина')
  }
  const preview = getCoreFictitiousPreview(model, leftBoreholeId, rightBoreholeId, fraction)
  const id = `fictitious-${leftBoreholeId}-${rightBoreholeId}-${now.getTime()}`
  if (model.boreholes.some(item => item.id === id)) throw new Error('Не удалось создать уникальный идентификатор фиктивной скважины')
  const leftIndex = model.boreholes.findIndex(item => item.id === leftBoreholeId)
  const rightIndex = model.boreholes.findIndex(item => item.id === rightBoreholeId)
  const left = model.boreholes[leftIndex]
  const right = model.boreholes[rightIndex]
  const layers = interpolatedLayers(model, id, preview)
  const fictitious: CoreBorehole = {
    id,
    index: left.index + (right.index - left.index) * fraction,
    name: name.trim(),
    sourceNamed: true,
    kind: 'fictitious',
    interpolation: {
      method: 'linear',
      leftBoreholeId,
      rightBoreholeId,
      fraction,
      note: note.trim(),
      createdAt: now.toISOString(),
      sourceFingerprint: getCoreFictitiousSourceFingerprint(model, leftBoreholeId, rightBoreholeId)
    },
    sourceRefs: { sideLines: [], nameText: '' },
    drawing: { x: preview.x, top: preview.top, bottom: preview.bottom, levels: layers.map(layer => layer.drawingY) },
    pk: preview.pk,
    coordinates: preview.coordinates ? { ...preview.coordinates } : null,
    included: true,
    exclusionReason: '',
    review: { reviewed: false, reviewedAt: '' },
    layers,
    excludedLabels: []
  }
  const boreholes = [...model.boreholes]
  boreholes.splice(rightIndex, 0, fictitious)
  const affected = new Set([leftBoreholeId, rightBoreholeId])
  const next = withActivity(
    model,
    boreholes.map(item => affected.has(item.id) ? resetReview(item) : item),
    `${fictitious.name}: добавлена фиктивная скважина между ${left.name} и ${right.name}, положение ${(fraction * 100).toFixed(2).replace('.', ',')}% · линейная интерполяция ${layers.length} подошв. Обоснование: ${note.trim()}`,
    now,
    'manual',
    { category: 'fictitious', boreholeIds: [id, leftBoreholeId, rightBoreholeId] }
  )
  return { model: next, boreholeId: id }
}

/** Явно пересчитывает сохранённую скважину; фонового обновления после правки источников нет. */
export function updateCoreFictitiousBorehole(
  model: CoreModel,
  boreholeId: string,
  fraction: number,
  note: string,
  now = new Date()
): CoreModel {
  const borehole = requireBorehole(model, boreholeId)
  if (borehole.kind !== 'fictitious' || !borehole.interpolation) throw new Error('Эта команда доступна только для фиктивной скважины')
  if (!note.trim()) throw new Error('Укажите инженерное обоснование интерполяции')
  assertNoFictitiousLinks(model, borehole)
  const rule = borehole.interpolation
  const preview = getCoreFictitiousPreview(model, rule.leftBoreholeId, rule.rightBoreholeId, fraction)
  const layers = interpolatedLayers(model, boreholeId, preview)
  const sourceFingerprint = getCoreFictitiousSourceFingerprint(model, rule.leftBoreholeId, rule.rightBoreholeId)
  const unchanged = rule.fraction === fraction && rule.note === note.trim() && rule.sourceFingerprint === sourceFingerprint &&
    borehole.drawing.x === preview.x && borehole.drawing.top === preview.top && borehole.drawing.bottom === preview.bottom &&
    borehole.layers.length === layers.length && borehole.layers.every((layer, index) =>
      layer.bottomDepth === layers[index].bottomDepth && layer.igeCode === layers[index].igeCode &&
      layer.codeStatus === layers[index].codeStatus && layer.depthSource === layers[index].depthSource)
  if (unchanged) return model
  const nextBorehole = resetReview({
    ...borehole,
    interpolation: { ...rule, fraction, note: note.trim(), sourceFingerprint },
    drawing: { x: preview.x, top: preview.top, bottom: preview.bottom, levels: layers.map(layer => layer.drawingY) },
    pk: preview.pk,
    coordinates: preview.coordinates ? { ...preview.coordinates } : null,
    layers
  })
  const affected = new Set([rule.leftBoreholeId, rule.rightBoreholeId])
  return withActivity(
    model,
    model.boreholes.map(item => item.id === boreholeId ? nextBorehole : affected.has(item.id) ? resetReview(item) : item),
    `${borehole.name}: фиктивная скважина явно пересчитана по правилу ${preview.leftName} ↔ ${preview.rightName}, положение ${(fraction * 100).toFixed(2).replace('.', ',')}%. Обоснование: ${note.trim()}`,
    now,
    'manual',
    { category: 'fictitious', boreholeIds: [boreholeId, rule.leftBoreholeId, rule.rightBoreholeId] }
  )
}

export function removeCoreFictitiousBorehole(
  model: CoreModel,
  boreholeId: string,
  now = new Date()
): CoreModel {
  const borehole = requireBorehole(model, boreholeId)
  if (borehole.kind !== 'fictitious') throw new Error('Исходную DXF-скважину нельзя удалить этой командой; используйте обратимое исключение')
  assertNoFictitiousLinks(model, borehole)
  const affected = new Set([borehole.interpolation?.leftBoreholeId, borehole.interpolation?.rightBoreholeId])
  return withActivity(
    model,
    model.boreholes.filter(item => item.id !== boreholeId).map(item => affected.has(item.id) ? resetReview(item) : item),
    `${borehole.name}: фиктивная скважина удалена из расчётной модели; исходные DXF-скважины и геометрия сохранены`,
    now,
    'manual',
    { category: 'fictitious', boreholeIds: [boreholeId] }
  )
}
