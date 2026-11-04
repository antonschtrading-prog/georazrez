import {
  getCoreBoreholeBoundaryIssues,
  getCoreBoundaryModel,
  getCoreIssues,
  type CoreBorehole,
  type CoreLayer,
  type CoreModel
} from './geologyCore'
import { getIgeKey, SOIL_CHARACTERISTICS, type ActivityItem, type CodeStatus, type SoilCharacteristicField, type SoilCharacteristicKey } from '@/types/geology'

function withActivity(
  model: CoreModel,
  boreholes: CoreBorehole[],
  text: string,
  now: Date,
  type: ActivityItem['type'] = 'manual'
): CoreModel {
  return {
    ...model,
    boreholes,
    project: {
      ...model.project,
      activity: [
        { id: `event-${now.getTime()}-${Math.random()}`, type, text, at: now.toLocaleString('ru-RU') },
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
  if (name === borehole.name) return model
  const next = resetReview({ ...borehole, name, sourceNamed: name.trim().length > 0 })
  return withActivity(
    model,
    replaceBorehole(model, next),
    `Скважина №${borehole.index}: наименование изменено с «${borehole.name}» на «${name.trim() || 'без имени'}»`,
    now
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
    now
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
    now
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
    depthSource: 'manual'
  }
  const layers = [...borehole.layers]
  layers.splice(insertionIndex, 0, layer)
  const nextBorehole = resetReview({ ...borehole, layers: renumberLayers(layers) })
  return {
    model: withActivity(
      model,
      replaceBorehole(model, nextBorehole),
      `${borehole.name}: добавлена подошва ${String(depth).replace('.', ',')} м${code ? `, ИГЭ ${code}` : ', код ИГЭ требует проверки'}`,
      now
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
  const nextBorehole = resetReview({
    ...borehole,
    layers: renumberLayers(borehole.layers.filter(item => item.id !== layerId))
  })
  return withActivity(
    model,
    replaceBorehole(model, nextBorehole),
    `${borehole.name}: удалена подошва ${String(layer.bottomDepth).replace('.', ',')} м${layer.igeCode ? `, ИГЭ ${layer.igeCode}` : ''}`,
    now
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
    now
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
  if (borehole.review.reviewed === reviewed) return model
  const next: CoreBorehole = {
    ...borehole,
    review: { reviewed, reviewedAt: reviewed ? now.toLocaleString('ru-RU') : '' }
  }
  return withActivity(
    model,
    replaceBorehole(model, next),
    reviewed ? `${borehole.name}: проверка подтверждена инженером` : `${borehole.name}: подтверждение проверки снято`,
    now
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
    now
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
    now
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
    now
  )
  return { ...next, manualCorrelations: [...model.manualCorrelations, correlation] }
}

export function updateCoreManualCorrelationNote(
  model: CoreModel,
  correlationId: string,
  note: string,
  now = new Date()
): CoreModel {
  const normalizedNote = note.trim()
  if (!normalizedNote) throw new Error('Укажите инженерное обоснование корреляции')
  const correlation = model.manualCorrelations.find(item => item.id === correlationId)
  if (!correlation || correlation.note === normalizedNote) return model
  const left = findLayerOwner(model, correlation.leftLayerId)
  const right = findLayerOwner(model, correlation.rightLayerId)
  if (!left || !right) throw new Error('Нельзя изменить обоснование: подошва корреляции не найдена')
  const leftLayer = requireLayer(left, correlation.leftLayerId)
  const rightLayer = requireLayer(right, correlation.rightLayerId)
  const next = withActivity(
    model,
    model.boreholes.map(borehole => borehole.id === left.id || borehole.id === right.id ? resetReview(borehole) : borehole),
    `${left.name}, подошва ${leftLayer.ordinal} ↔ ${right.name}, подошва ${rightLayer.ordinal}: изменено обоснование ручной корреляции. Новое обоснование: ${normalizedNote}`,
    now
  )
  return {
    ...next,
    manualCorrelations: model.manualCorrelations.map(item => item.id === correlationId
      ? { ...item, note: normalizedNote }
      : item)
  }
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
    now
  )
  return { ...next, manualCorrelations: model.manualCorrelations.filter(item => item.id !== correlationId) }
}
