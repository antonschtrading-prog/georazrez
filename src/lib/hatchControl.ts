import { getHatchSignature, getIgeKey, type GeoHatch, type GeoHatchPath, type HatchLegendEntry } from '@/types/geology'
import type { CoreLayer, CoreModel } from '@/lib/geologyCore'

export type CoreHatchCheckStatus = 'match' | 'mismatch' | 'unmapped' | 'text-unresolved'

export interface CoreHatchCheck {
  id: string
  status: CoreHatchCheckStatus
  hatchHandle: string
  signature: string
  hatchLayer: string
  pattern: string
  boreholeId: string
  boreholeName: string
  layerId: string
  layerOrdinal: number
  textCode: string
  textStatus: CoreLayer['codeStatus']
  hatchCode: string
  coverage: number
  detail: string
}

export interface CoreHatchSignatureItem {
  signature: string
  layer: string
  pattern: string
  solid: boolean
  angle: number
  scale: number
  color: string
  hatchCount: number
  handles: string[]
  associatedCount: number
  legend: HatchLegendEntry | null
  supported: boolean
}

export interface CoreHatchControl {
  available: boolean
  checks: CoreHatchCheck[]
  signatures: CoreHatchSignatureItem[]
  unsupported: Array<{ handle: string; signature: string; issues: string[] }>
  orphans: Array<{ handle: string; signature: string }>
  summary: {
    sourceHatches: number
    associatedHatches: number
    matches: number
    mismatches: number
    unmapped: number
    textUnresolved: number
    withoutHatch: number
    tasks: number
  }
}

function isCandidateHatch(hatch: GeoHatch): boolean {
  return !/ГЕОЛОГИЯ.*(?:ВЫРАБОТКИ|ПОДПИСИ)/i.test(hatch.layer || '')
}

function isUsablePath(path: GeoHatchPath): boolean {
  return path.supported && path.closed && path.issues.length === 0 && path.points.length >= 3
}

/** Пересечение замкнутой области HATCH с вертикалью скважины; ближайший текст не используется. */
function verticalOverlap(paths: GeoHatchPath[], x: number, low: number, high: number): number {
  const intersections: number[] = []
  for (const path of paths) {
    if (!isUsablePath(path)) continue
    const points = path.points
    for (let index = 0; index < points.length; index++) {
      const a = points[index]
      const b = points[(index + 1) % points.length]
      if (Math.abs(a[0] - b[0]) < 1e-9) continue
      // Полуоткрытое правило исключает двойной учёт общей вершины двух рёбер.
      const crosses = (a[0] <= x && b[0] > x) || (b[0] <= x && a[0] > x)
      if (!crosses) continue
      const fraction = (x - a[0]) / (b[0] - a[0])
      const y = a[1] + fraction * (b[1] - a[1])
      intersections.push(y)
    }
  }
  intersections.sort((a, b) => a - b)
  let overlap = 0
  // Чётно-нечётное заполнение сохраняет разделение внешних контуров и островов.
  for (let index = 0; index + 1 < intersections.length; index += 2) {
    overlap += Math.max(0, Math.min(high, intersections[index + 1]) - Math.max(low, intersections[index]))
  }
  return overlap
}

function getLayerCoverage(hatch: GeoHatch, borehole: CoreModel['boreholes'][number], layerIndex: number): number {
  const layer = borehole.layers[layerIndex]
  const upperY = layerIndex === 0 ? borehole.drawing.top : borehole.layers[layerIndex - 1].drawingY
  const lowerY = layer.drawingY
  const low = Math.min(upperY, lowerY)
  const high = Math.max(upperY, lowerY)
  const height = high - low
  if (!Number.isFinite(height) || height <= 0.005) return 0
  let best = 0
  for (const offset of [-0.6, 0, 0.6]) {
    const overlap = verticalOverlap(hatch.paths, borehole.drawing.x + offset, low, high)
    best = Math.max(best, overlap / height)
  }
  return best
}

export function getCoreHatchCodeOptions(model: CoreModel): Array<{ key: string; code: string }> {
  const codes = new Map<string, string>()
  for (const borehole of model.boreholes) for (const layer of borehole.layers) {
    for (const code of [layer.igeCode, ...layer.candidates.map(candidate => candidate.code)]) {
      if (!code.trim()) continue
      const key = getIgeKey(code)
      if (!codes.has(key)) codes.set(key, code.trim())
    }
  }
  return [...codes.entries()].map(([key, code]) => ({ key, code }))
    .sort((a, b) => a.code.localeCompare(b.code, 'ru-RU', { numeric: true }))
}

export function getCoreHatchControl(model: CoreModel): CoreHatchControl {
  const source = (model.project.geometry.hatches || []).filter(isCandidateHatch)
  const legend = new Map((model.hatchLegend || []).map(entry => [entry.signature, entry]))
  const checks: CoreHatchCheck[] = []
  const associatedHandles = new Set<string>()
  const associationCounts = new Map<string, number>()
  const coveredLayers = new Set<string>()

  for (const borehole of model.boreholes) {
    if (!borehole.included || borehole.kind !== 'dxf') continue
    for (let layerIndex = 0; layerIndex < borehole.layers.length; layerIndex++) {
      const layer = borehole.layers[layerIndex]
      for (const hatch of source) {
        if (hatch.issues.length || !hatch.paths.some(isUsablePath)) continue
        const coverage = getLayerCoverage(hatch, borehole, layerIndex)
        if (coverage < 0.2) continue
        const signature = getHatchSignature(hatch)
        const entry = legend.get(signature)
        const hatchCode = entry?.igeKey || ''
        const textKey = layer.igeKey || (layer.igeCode.trim() ? getIgeKey(layer.igeCode) : '')
        const status: CoreHatchCheckStatus = !entry ? 'unmapped'
          : !textKey ? 'text-unresolved'
            : hatchCode === textKey ? 'match' : 'mismatch'
        const detail = status === 'match' ? 'Текстовый код и ручная легенда HATCH совпадают'
          : status === 'mismatch' ? 'Текстовый код не совпадает с ИГЭ, назначенным этой штриховке вручную'
            : status === 'text-unresolved' ? 'Легенда HATCH задана, но текстовый ИГЭ слоя остаётся нерешённым; автоматическая подстановка запрещена'
              : 'Для пересекающей геологический слой штриховки ещё не подтверждена легенда'
        checks.push({
          id: `${hatch.handle || 'no-handle'}:${layer.id}`,
          status, hatchHandle: hatch.handle, signature, hatchLayer: hatch.layer, pattern: hatch.pattern,
          boreholeId: borehole.id, boreholeName: borehole.name, layerId: layer.id,
          layerOrdinal: layer.ordinal, textCode: layer.igeCode, textStatus: layer.codeStatus,
          hatchCode, coverage, detail
        })
        associatedHandles.add(hatch.handle)
        coveredLayers.add(layer.id)
        associationCounts.set(signature, (associationCounts.get(signature) || 0) + 1)
      }
    }
  }

  const grouped = new Map<string, CoreHatchSignatureItem>()
  for (const hatch of source) {
    const signature = getHatchSignature(hatch)
    let item = grouped.get(signature)
    if (!item) {
      item = {
        signature, layer: hatch.layer, pattern: hatch.pattern, solid: hatch.solid,
        angle: hatch.angle, scale: hatch.scale, color: hatch.color, hatchCount: 0,
        handles: [], associatedCount: 0, legend: legend.get(signature) || null,
        supported: true
      }
      grouped.set(signature, item)
    }
    item.hatchCount++
    item.handles.push(hatch.handle)
    item.supported &&= !hatch.issues.length && hatch.paths.some(isUsablePath)
  }
  for (const item of grouped.values()) {
    item.associatedCount = associationCounts.get(item.signature) || 0
    item.handles.sort()
  }
  const signatures = [...grouped.values()].sort((a, b) => a.layer.localeCompare(b.layer, 'ru-RU', { numeric: true }) ||
    a.pattern.localeCompare(b.pattern, 'ru-RU') || a.scale - b.scale)
  const unsupported = source.filter(hatch => hatch.issues.length || !hatch.paths.some(isUsablePath))
    .map(hatch => ({ handle: hatch.handle, signature: getHatchSignature(hatch), issues: [...new Set(hatch.issues)] }))
  const orphans = source.filter(hatch => !hatch.issues.length && hatch.paths.some(isUsablePath) && !associatedHandles.has(hatch.handle))
    .map(hatch => ({ handle: hatch.handle, signature: getHatchSignature(hatch) }))
  const activeDxfLayers = model.boreholes.filter(borehole => borehole.included && borehole.kind === 'dxf')
    .reduce((sum, borehole) => sum + borehole.layers.length, 0)
  const summary = {
    sourceHatches: source.length,
    associatedHatches: associatedHandles.size,
    matches: checks.filter(check => check.status === 'match').length,
    mismatches: checks.filter(check => check.status === 'mismatch').length,
    unmapped: checks.filter(check => check.status === 'unmapped').length,
    textUnresolved: checks.filter(check => check.status === 'text-unresolved').length,
    withoutHatch: source.length ? Math.max(0, activeDxfLayers - coveredLayers.size) : 0,
    tasks: checks.filter(check => check.status !== 'match').length + unsupported.length + orphans.length
  }
  return { available: source.length > 0, checks, signatures, unsupported, orphans, summary }
}
