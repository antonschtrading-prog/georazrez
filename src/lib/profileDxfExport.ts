import { getCoreProfileSourceGeometry } from './profileDocument'
import type {
  CoreProfileDocument,
  ProfileBand,
  ProfileBorehole,
  ProfileLine,
  ProfilePoint
} from './profileDocument'

export interface CoreProfileDxfExport {
  content: string
  fileName: string
  stats: {
    boreholes: number
    bands: number
    unresolvedBands: number
    lines: number
    fictitiousBoreholes: number
    pinchoutBands: number
    entities: number
  }
}

type DxfPair = [number, string | number]

const pair = (code: number, value: string | number): DxfPair => [code, value]
const number = (value: number) => Number(value.toFixed(6)).toString()

function dxfText(value: string): string {
  return Array.from(value.replace(/[\r\n]+/g, ' ')).map(char => {
    const code = char.codePointAt(0)!
    if (char === '\\') return '\\\\'
    return code > 126 ? `\\U+${code.toString(16).toUpperCase().padStart(4, '0')}` : char
  }).join('')
}

function hexColor(value: string): number {
  return Number.parseInt(value.replace('#', ''), 16)
}

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'ГеоРазрез'
}

function centroid(points: ProfilePoint[]): ProfilePoint {
  return {
    x: points.reduce((sum, item) => sum + item.x, 0) / points.length,
    y: points.reduce((sum, item) => sum + item.y, 0) / points.length
  }
}

function inside(point: ProfilePoint, polygon: ProfilePoint[]): boolean {
  let result = false
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]
    const b = polygon[(index + 1) % polygon.length]
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result
  }
  return result
}

/** Отсекает бесконечную прямую до отрезков внутри выпуклого участка. */
function clipInfiniteLine(
  origin: ProfilePoint,
  direction: ProfilePoint,
  polygon: ProfilePoint[]
): [ProfilePoint, ProfilePoint][] {
  const parameters: number[] = []
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]
    const b = polygon[(index + 1) % polygon.length]
    const edge = { x: b.x - a.x, y: b.y - a.y }
    const denominator = direction.x * edge.y - direction.y * edge.x
    if (Math.abs(denominator) < 1e-9) continue
    const delta = { x: a.x - origin.x, y: a.y - origin.y }
    parameters.push((delta.x * edge.y - delta.y * edge.x) / denominator)
  }
  parameters.sort((a, b) => a - b)
  const unique = parameters.filter((value, index) => index === 0 || Math.abs(value - parameters[index - 1]) > 1e-7)
  const segments: [ProfilePoint, ProfilePoint][] = []
  for (let index = 0; index + 1 < unique.length; index += 2) {
    const start = unique[index]
    const end = unique[index + 1]
    if (end - start < 1e-7) continue
    segments.push([
      { x: origin.x + direction.x * start, y: origin.y + direction.y * start },
      { x: origin.x + direction.x * end, y: origin.y + direction.y * end }
    ])
  }
  return segments
}

function hatchSegments(band: ProfileBand): [ProfilePoint, ProfilePoint][] {
  const polygon = band.sourcePoints
  const xs = polygon.map(item => item.x)
  const ys = polygon.map(item => item.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const step = 3
  const result: [ProfilePoint, ProfilePoint][] = []
  const hatch = band.appearance.hatch
  if (hatch === 'none' || hatch === 'dots') return result
  if (hatch === 'diagonal' || hatch === 'cross') {
    for (let value = minY - maxX; value <= maxY - minX; value += step * 2) {
      result.push(...clipInfiniteLine({ x: 0, y: value }, { x: 1, y: 1 }, polygon))
    }
  }
  if (hatch === 'cross') {
    for (let value = minY + minX; value <= maxY + maxX; value += step * 2) {
      result.push(...clipInfiniteLine({ x: 0, y: value }, { x: 1, y: -1 }, polygon))
    }
  }
  if (hatch === 'horizontal' || hatch === 'grid') {
    for (let y = minY; y <= maxY; y += step) {
      result.push(...clipInfiniteLine({ x: 0, y }, { x: 1, y: 0 }, polygon))
    }
  }
  if (hatch === 'vertical' || hatch === 'grid') {
    for (let x = minX; x <= maxX; x += step) {
      result.push(...clipInfiniteLine({ x, y: 0 }, { x: 0, y: 1 }, polygon))
    }
  }
  return result
}

class DxfWriter {
  private pairs: DxfPair[] = []
  entities = 0

  add(...values: DxfPair[]) {
    this.pairs.push(...values)
  }

  entity(type: string, layer: string, color?: number) {
    this.entities += 1
    this.add(pair(0, type), pair(8, dxfText(layer)))
    if (color !== undefined) this.add(pair(420, color))
  }

  line(layer: string, start: ProfilePoint, end: ProfilePoint, color?: number) {
    this.entity('LINE', layer, color)
    this.add(pair(10, number(start.x)), pair(20, number(start.y)), pair(30, 0),
      pair(11, number(end.x)), pair(21, number(end.y)), pair(31, 0))
  }

  text(layer: string, value: string, at: ProfilePoint, height: number, color?: number) {
    this.entity('TEXT', layer, color)
    this.add(pair(10, number(at.x)), pair(20, number(at.y)), pair(30, 0),
      pair(40, number(height)), pair(1, dxfText(value)), pair(50, 0))
  }

  point(layer: string, at: ProfilePoint, color: number) {
    this.entity('POINT', layer, color)
    this.add(pair(10, number(at.x)), pair(20, number(at.y)), pair(30, 0))
  }

  solid(layer: string, triangle: ProfilePoint[], color: number) {
    this.entity('SOLID', layer, color)
    const points = [triangle[0], triangle[1], triangle[2], triangle[2]]
    points.forEach((point, index) => {
      this.add(pair(10 + index, number(point.x)), pair(20 + index, number(point.y)), pair(30 + index, 0))
    })
  }

  toString(): string {
    return `${this.pairs.map(([code, value]) => `${code}\r\n${value}`).join('\r\n')}\r\n`
  }
}

function addBand(writer: DxfWriter, band: ProfileBand, layerNames: Map<string, string>) {
  if (!band.codeKey) return
  const layer = layerNames.get(band.codeKey)!
  const color = hexColor(band.appearance.color)
  const polygon = band.sourcePoints
  for (let index = 1; index + 1 < polygon.length; index += 1) {
    writer.solid(layer, [polygon[0], polygon[index], polygon[index + 1]], color)
  }
  for (const [start, end] of hatchSegments(band)) writer.line(layer, start, end, 0x4B4A43)
  if (band.appearance.hatch === 'dots') {
    const xs = polygon.map(item => item.x)
    const ys = polygon.map(item => item.y)
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 6) {
      for (let y = Math.min(...ys); y <= Math.max(...ys); y += 6) {
        const point = { x, y }
        if (inside(point, polygon)) writer.point(layer, point, 0x4B4A43)
      }
    }
  }
  const at = centroid(polygon)
  writer.text('GEO_IGE_LABELS', band.code, at, 1.8, 0x2F312B)
}

function addLine(writer: DxfWriter, line: ProfileLine) {
  const layer = line.kind === 'surface' ? 'GEO_SURFACE'
    : line.kind === 'invalid' ? 'GEO_INVALID'
      : line.kind === 'pinchout' ? 'GEO_PINCHOUT'
        : line.manual ? 'GEO_MANUAL_BOUNDARY' : 'GEO_BOUNDARY'
  const color = line.kind === 'invalid' ? 0xC94C4C : line.kind === 'pinchout' ? 0x2878B5 : undefined
  for (let index = 0; index + 1 < line.sourcePoints.length; index += 1) {
    writer.line(layer, line.sourcePoints[index], line.sourcePoints[index + 1], color)
  }
}

function addBorehole(writer: DxfWriter, borehole: ProfileBorehole) {
  const fictitious = borehole.kind === 'fictitious'
  const layer = fictitious ? 'GEO_FICTITIOUS' : 'GEO_BOREHOLES'
  const color = fictitious ? 0x2878B5 : undefined
  const x = borehole.sourceX
  writer.line(layer, { x, y: borehole.sourceTop }, { x, y: borehole.sourceBottom }, color)
  for (const tick of borehole.ticks) {
    writer.line(layer, { x: x - 1.5, y: tick.sourceY }, { x: x + 1.5, y: tick.sourceY }, color)
    writer.text('GEO_DEPTHS', tick.depth.toFixed(2).replace('.', ','), { x: x + 2, y: tick.sourceY + 0.4 }, 1.8)
  }
  writer.text('GEO_BOREHOLE_NAMES', borehole.name, { x, y: borehole.sourceTop + 5 }, 2.2, color)
  writer.text('GEO_PK', `ПК ${borehole.pk.toFixed(2).replace('.', ',')}`, { x, y: borehole.sourceTop + 2 }, 1.8, color)
}

export function createCoreProfileDxf(profile: CoreProfileDocument): CoreProfileDxfExport {
  const { bands, lines, boreholes } = getCoreProfileSourceGeometry(profile)
  const soilKeys = [...new Set(bands.flatMap(band => band.codeKey ? [band.codeKey] : []))].sort()
  const layerNames = new Map(soilKeys.map((key, index) => [key, `GEO_SOIL_${String(index + 1).padStart(2, '0')}`]))
  const layers = [
    'GEO_SURFACE', 'GEO_BOUNDARY', 'GEO_MANUAL_BOUNDARY', 'GEO_PINCHOUT', 'GEO_INVALID',
    'GEO_BOREHOLES', 'GEO_FICTITIOUS', 'GEO_DEPTHS', 'GEO_BOREHOLE_NAMES', 'GEO_PK',
    'GEO_IGE_LABELS', ...layerNames.values()
  ]
  const writer = new DxfWriter()
  writer.add(pair(999, 'Derived engineering-geological profile. Source DXF is not modified.'))
  writer.add(pair(0, 'SECTION'), pair(2, 'HEADER'),
    pair(9, '$ACADVER'), pair(1, 'AC1021'), pair(0, 'ENDSEC'),
    pair(0, 'SECTION'), pair(2, 'TABLES'),
    pair(0, 'TABLE'), pair(2, 'LTYPE'), pair(70, 1),
    pair(0, 'LTYPE'), pair(2, 'CONTINUOUS'), pair(70, 0), pair(3, 'Solid line'), pair(72, 65), pair(73, 0), pair(40, 0),
    pair(0, 'ENDTAB'),
    pair(0, 'TABLE'), pair(2, 'LAYER'), pair(70, layers.length))
  for (const layer of layers) {
    writer.add(pair(0, 'LAYER'), pair(2, dxfText(layer)), pair(70, 0), pair(62, 7), pair(6, 'CONTINUOUS'))
  }
  writer.add(pair(0, 'ENDTAB'), pair(0, 'ENDSEC'), pair(0, 'SECTION'), pair(2, 'ENTITIES'))
  for (const band of bands) addBand(writer, band, layerNames)
  for (const line of lines) addLine(writer, line)
  for (const borehole of boreholes) addBorehole(writer, borehole)
  writer.add(pair(0, 'ENDSEC'), pair(0, 'EOF'))
  return {
    content: writer.toString(),
    fileName: `${safeFileName(profile.title)}_производный_профиль.dxf`,
    stats: {
      boreholes: boreholes.length,
      bands: bands.filter(item => item.codeKey).length,
      unresolvedBands: bands.filter(item => !item.codeKey).length,
      lines: lines.length,
      fictitiousBoreholes: boreholes.filter(item => item.kind === 'fictitious').length,
      pinchoutBands: bands.filter(item => item.pinchout && item.codeKey).length,
      entities: writer.entities
    }
  }
}

export function exportCoreProfileDxf(profile: CoreProfileDocument): CoreProfileDxfExport['stats'] {
  const result = createCoreProfileDxf(profile)
  const blob = new Blob([result.content], { type: 'application/dxf;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = result.fileName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return result.stats
}
