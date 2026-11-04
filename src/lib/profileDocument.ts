import { formatPk, getIgeKey, type SoilAppearance } from '@/types/geology'
import {
  getCoreBoundaryModel,
  getCoreSoilAppearance,
  getCoreSoilLibrary,
  type CoreBoundaryModel,
  type CoreModel
} from '@/lib/geologyCore'

export const PROFILE_SHEET_WIDTH = 1680
export const PROFILE_SHEET_HEIGHT = 1188
export const PROFILE_BOREHOLES_PER_SHEET = 8

const CHART = { left: 100, right: 1580, top: 190, bottom: 840 }
const UNRESOLVED_APPEARANCE: SoilAppearance = { color: '#FFFFFF', hatch: 'none' }

export interface ProfilePoint {
  x: number
  y: number
}

export interface ProfileBand {
  id: string
  points: ProfilePoint[]
  codeKey: string | null
  code: string
  name: string
  appearance: SoilAppearance
  label: ProfilePoint
  pinchout: boolean
}

export interface ProfileLine {
  id: string
  points: ProfilePoint[]
  kind: 'surface' | 'boundary' | 'pinchout' | 'invalid'
  manual: boolean
}

export interface ProfileDepthTick {
  id: string
  depth: number
  y: number
  code: string
  status: string
}

export interface ProfileBorehole {
  id: string
  name: string
  kind: 'dxf' | 'fictitious'
  pk: number
  x: number
  topY: number
  bottomY: number
  reviewed: boolean
  ticks: ProfileDepthTick[]
}

export interface ProfileLegendItem {
  key: string
  code: string
  name: string
  appearance: SoilAppearance
}

export interface CoreProfileSheet {
  index: number
  boreholeIds: string[]
  boreholes: ProfileBorehole[]
  bands: ProfileBand[]
  lines: ProfileLine[]
  legend: ProfileLegendItem[]
  unfilledIntervals: number
  unresolvedBands: number
}

export interface CoreProfileDocument {
  title: string
  sourceFile: string
  horizontalScale: number
  verticalScale: number
  sheets: CoreProfileSheet[]
  boreholeCount: number
  bandCount: number
  unfilledIntervals: number
  unresolvedBands: number
}

function centroid(points: ProfilePoint[]): ProfilePoint {
  return points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 })
}

/**
 * Производная печатная модель. Не сохраняется в проект и не заменяет геометрию DXF.
 * Заливка строится только между доказанными границами; открытые разрывы не дорисовываются.
 */
export function buildCoreProfileDocument(
  model: CoreModel,
  boundaryModel: CoreBoundaryModel = getCoreBoundaryModel(model)
): CoreProfileDocument {
  const active = model.boreholes.filter(item => item.included)
  const sheets: CoreProfileSheet[] = []

  // Соседние листы повторяют одну краевую скважину: интервал между листами не теряется.
  for (let start = 0; start === 0 || start < active.length - 1; start += PROFILE_BOREHOLES_PER_SHEET - 1) {
    const columns = active.slice(start, start + PROFILE_BOREHOLES_PER_SHEET)
    const minX = Math.min(...columns.map(item => item.drawing.x))
    const maxX = Math.max(...columns.map(item => item.drawing.x))
    const maxY = Math.max(...columns.map(item => item.drawing.top))
    const minY = Math.min(...columns.map(item => item.drawing.bottom))
    const spanX = Math.max(maxX - minX, 1)
    const spanY = Math.max(maxY - minY, 1)
    const point = (x: number, y: number): ProfilePoint => ({
      x: columns.length === 1 ? (CHART.left + CHART.right) / 2 : CHART.left + (x - minX) / spanX * (CHART.right - CHART.left),
      y: CHART.top + (maxY - y) / spanY * (CHART.bottom - CHART.top)
    })
    const bands: ProfileBand[] = []
    const lines: ProfileLine[] = []
    let unfilledIntervals = 0
    let unresolvedBands = 0

    for (let pairIndex = 0; pairIndex < columns.length - 1; pairIndex += 1) {
      const left = columns[pairIndex]
      const right = columns[pairIndex + 1]
      const pairItems = boundaryModel.items.filter(item => item.leftBoreholeId === left.id && item.rightBoreholeId === right.id)
      const connected = pairItems.filter(item => item.status === 'connected' && !item.pinchoutId && item.y1 !== null && item.y2 !== null)
      unfilledIntervals += Math.max(left.layers.length, right.layers.length)

      lines.push({
        id: `surface-${left.id}-${right.id}`,
        points: [point(left.drawing.x, left.drawing.top), point(right.drawing.x, right.drawing.top)],
        kind: 'surface',
        manual: false
      })

      for (const item of pairItems) {
        if (item.pinchoutId || item.y1 === null || item.y2 === null) continue
        if (item.status !== 'connected' && !item.issues.some(issue => issue.kind === 'crossing')) continue
        lines.push({
          id: item.id,
          points: [point(item.x1, item.y1), point(item.x2, item.y2)],
          kind: item.status === 'invalid' ? 'invalid' : 'boundary',
          manual: item.manualCorrelation
        })
      }

      for (const lower of connected) {
        const leftLayer = left.layers.find(item => item.id === lower.leftLayerId)
        const rightLayer = right.layers.find(item => item.id === lower.rightLayerId)
        if (!leftLayer || !rightLayer) continue
        let upperPoints: ProfilePoint[]
        if (lower.leftOrdinal === 1 && lower.rightOrdinal === 1) {
          upperPoints = [point(left.drawing.x, left.drawing.top), point(right.drawing.x, right.drawing.top)]
        } else {
          const upper = connected.find(item => item.leftOrdinal === lower.leftOrdinal! - 1 && item.rightOrdinal === lower.rightOrdinal! - 1)
          if (!upper) continue
          upperPoints = [point(upper.x1, upper.y1!), point(upper.x2, upper.y2!)]
        }
        const keyLeft = getIgeKey(leftLayer.igeCode)
        const keyRight = getIgeKey(rightLayer.igeCode)
        const key = keyLeft !== '__unassigned__' && keyLeft === keyRight ? keyLeft : null
        const appearance = key ? getCoreSoilAppearance(model, key) : UNRESOLVED_APPEARANCE
        if (!key) unresolvedBands += 1
        unfilledIntervals -= 1
        const points = [upperPoints[0], upperPoints[1], point(lower.x2, lower.y2!), point(lower.x1, lower.y1!)]
        bands.push({
          id: `band-${lower.id}`,
          points,
          codeKey: key,
          code: key ? leftLayer.igeCode : '',
          name: key ? model.passports[key]?.name || '' : '',
          appearance,
          label: centroid(points),
          pinchout: false
        })
      }

      for (const pinchout of boundaryModel.pinchouts.filter(item => {
        const boundary = pairItems.find(candidate => candidate.id === item.boundaryId)
        return Boolean(boundary)
      })) {
        const boundary = pairItems.find(item => item.id === pinchout.boundaryId)!
        const existingColumn = pinchout.side === 'left' ? left : right
        const existingLayerId = pinchout.side === 'left' ? boundary.leftLayerId : boundary.rightLayerId
        const existingLayer = existingColumn.layers.find(item => item.id === existingLayerId)
        if (!existingLayer) continue
        const key = getIgeKey(existingLayer.igeCode)
        const resolvedKey = key === '__unassigned__' ? null : key
        const upper = pinchout.side === 'left'
          ? point(pinchout.upperLeftX, pinchout.upperLeftY)
          : point(pinchout.upperRightX, pinchout.upperRightY)
        const lower = point(pinchout.lowerX, pinchout.lowerY)
        const tip = point(pinchout.x, pinchout.y)
        const points = [upper, tip, lower]
        bands.push({
          id: `band-${pinchout.id}`,
          points,
          codeKey: resolvedKey,
          code: resolvedKey ? existingLayer.igeCode : '',
          name: resolvedKey ? model.passports[resolvedKey]?.name || '' : '',
          appearance: resolvedKey ? getCoreSoilAppearance(model, resolvedKey) : UNRESOLVED_APPEARANCE,
          label: centroid(points),
          pinchout: true
        })
        if (!resolvedKey) unresolvedBands += 1
        unfilledIntervals -= 1
        lines.push({
          id: `${pinchout.id}-lower`,
          points: [lower, tip],
          kind: 'pinchout',
          manual: false
        })
        lines.push({
          id: `${pinchout.id}-upper`,
          points: [point(pinchout.upperLeftX, pinchout.upperLeftY), tip, point(pinchout.upperRightX, pinchout.upperRightY)],
          kind: 'pinchout',
          manual: false
        })
      }
    }

    const profileBoreholes: ProfileBorehole[] = columns.map(column => ({
      id: column.id,
      name: column.name,
      kind: column.kind,
      pk: column.pk,
      x: point(column.drawing.x, column.drawing.top).x,
      topY: point(column.drawing.x, column.drawing.top).y,
      bottomY: point(column.drawing.x, column.drawing.bottom).y,
      reviewed: column.review.reviewed,
      ticks: column.layers.map(layer => ({
        id: layer.id,
        depth: layer.bottomDepth,
        y: point(column.drawing.x, layer.drawingY).y,
        code: layer.igeCode,
        status: layer.codeStatus
      }))
    }))
    const sheetCodes = new Set(columns.flatMap(column => column.layers.map(layer => getIgeKey(layer.igeCode))))
    const legend = getCoreSoilLibrary(model).filter(item => sheetCodes.has(item.key)).map(item => ({
      key: item.key,
      code: item.code,
      name: item.passportName,
      appearance: item.appearance
    }))

    sheets.push({
      index: sheets.length + 1,
      boreholeIds: columns.map(item => item.id),
      boreholes: profileBoreholes,
      bands,
      lines,
      legend,
      unfilledIntervals: Math.max(0, unfilledIntervals),
      unresolvedBands
    })
  }

  return {
    title: model.project.title,
    sourceFile: model.project.sourceFile,
    horizontalScale: model.project.horizontalScale,
    verticalScale: model.project.verticalScale,
    sheets,
    boreholeCount: active.length,
    bandCount: sheets.reduce((sum, sheet) => sum + sheet.bands.length, 0),
    unfilledIntervals: sheets.reduce((sum, sheet) => sum + sheet.unfilledIntervals, 0),
    unresolvedBands: sheets.reduce((sum, sheet) => sum + sheet.unresolvedBands, 0)
  }
}

export function getProfileSheetTitle(document: CoreProfileDocument, sheet: CoreProfileSheet): string {
  const first = sheet.boreholes[0]
  const last = sheet.boreholes[sheet.boreholes.length - 1]
  const range = first && last ? `${formatPk(first.pk)} — ${formatPk(last.pk)}` : 'Нет активных скважин'
  return `${document.title} · лист ${sheet.index}/${document.sheets.length} · ${range}`
}
