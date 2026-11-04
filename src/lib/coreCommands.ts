import {
  getCoreIssues,
  type CoreBorehole,
  type CoreLayer,
  type CoreModel
} from './geologyCore'
import { getIgeKey, type ActivityItem, type CodeStatus } from '@/types/geology'

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
