import { useId } from 'react'
import { SoilPatternDefinition } from '@/components/SoilPattern'
import { formatPk } from '@/types/geology'
import {
  getProfileSheetTitle,
  PROFILE_SHEET_HEIGHT,
  PROFILE_SHEET_WIDTH,
  type CoreProfileDocument,
  type CoreProfileSheet
} from '@/lib/profileDocument'

interface Props {
  profile: CoreProfileDocument
  sheet: CoreProfileSheet
  className?: string
}

function getProfileLegendNameLines(value: string): string[] {
  const text = value.trim() || 'Наименование не заполнено'
  if (text.length <= 26) return [text]
  const wordBreak = text.lastIndexOf(' ', 26)
  const firstBreak = wordBreak >= 12 ? wordBreak : 26
  const first = text.slice(0, firstBreak).trim()
  const rest = text.slice(firstBreak).trim()
  return [first, rest.length > 26 ? `${rest.slice(0, 25).trimEnd()}…` : rest]
}

/** Один лист A3 landscape в условных единицах SVG; вся геометрия уже вычислена Core-проекцией. */
export function ProfileSheetSvg({ profile, sheet, className = '' }: Props) {
  const baseId = `profile-${useId().replace(/:/g, '')}`
  const title = getProfileSheetTitle(profile, sheet)
  return <svg
    className={`profile-sheet-svg ${className}`}
    data-profile-sheet={sheet.index}
    xmlns="http://www.w3.org/2000/svg"
    width={PROFILE_SHEET_WIDTH}
    height={PROFILE_SHEET_HEIGHT}
    viewBox={`0 0 ${PROFILE_SHEET_WIDTH} ${PROFILE_SHEET_HEIGHT}`}
    role="img"
    aria-label={title}
    fontFamily="Arial, sans-serif"
  >
    <rect width={PROFILE_SHEET_WIDTH} height={PROFILE_SHEET_HEIGHT} fill="#FFFFFF" />
    <defs>
      {sheet.bands.map((band, index) => band.appearance.hatch !== 'none' && <SoilPatternDefinition key={band.id} id={`${baseId}-band-${index}`} hatch={band.appearance.hatch} />)}
      {sheet.legend.map((item, index) => item.appearance.hatch !== 'none' && <SoilPatternDefinition key={item.key} id={`${baseId}-legend-${index}`} hatch={item.appearance.hatch} />)}
    </defs>

    <g fill="#24261F">
      <text x="60" y="58" fontSize="28" fontWeight="600">{profile.title} · инженерно-геологический разрез</text>
      <text x="60" y="91" fontSize="15" fill="#62665B">Источник: {profile.sourceFile} · Горизонтальный 1:{profile.horizontalScale} · Вертикальный 1:{profile.verticalScale}</text>
      <text x="1620" y="58" textAnchor="end" fontSize="20" fontWeight="600">Лист {sheet.index} / {profile.sheets.length}</text>
      <text x="1620" y="89" textAnchor="end" fontSize="14" fill="#62665B">Активных скважин на листе: {sheet.boreholes.length}</text>
    </g>

    <rect x="60" y="165" width="1560" height="700" fill="none" stroke="#777B70" strokeWidth="1" />
    <g data-profile-bands>
      {sheet.bands.map((band, index) => {
        const points = band.points.map(item => `${item.x},${item.y}`).join(' ')
        const patternId = `${baseId}-band-${index}`
        return <g key={band.id} data-profile-band={band.id} data-code-key={band.codeKey || ''} data-pinchout={band.pinchout ? 'true' : 'false'}>
          <polygon points={points} fill={band.appearance.color} stroke="none" />
          {band.appearance.hatch !== 'none' && <polygon points={points} fill={`url(#${patternId})`} stroke="none" />}
          {!band.codeKey && <polygon points={points} fill="none" stroke="#B56B38" strokeWidth="0.8" strokeDasharray="4 3" />}
          {band.codeKey && <text x={band.label.x} y={band.label.y + 4} textAnchor="middle" fontSize="13" fontWeight="600" fill="#34372F">{band.code}</text>}
        </g>
      })}
    </g>

    <g fill="none" data-profile-lines>
      {sheet.lines.map(line => <polyline
        key={line.id}
        data-profile-line={line.id}
        points={line.points.map(item => `${item.x},${item.y}`).join(' ')}
        stroke={line.kind === 'invalid' ? '#B63832' : line.kind === 'pinchout' ? '#356D8C' : line.kind === 'surface' ? '#30332B' : '#50544A'}
        strokeWidth={line.kind === 'surface' ? 1.8 : line.kind === 'invalid' ? 2 : 1.25}
        strokeDasharray={line.kind === 'invalid' ? '6 4' : line.manual ? '8 4' : line.kind === 'pinchout' ? '5 3' : undefined}
      />)}
    </g>

    <g data-profile-boreholes>
      {sheet.boreholes.map(borehole => <g key={borehole.id} data-profile-borehole={borehole.id} data-kind={borehole.kind}>
        <line x1={borehole.x} y1={borehole.topY} x2={borehole.x} y2={borehole.bottomY} stroke={borehole.kind === 'fictitious' ? '#356D8C' : '#30332B'} strokeWidth={borehole.kind === 'fictitious' ? 1.8 : 1.4} strokeDasharray={borehole.kind === 'fictitious' ? '7 4' : undefined} />
        {borehole.ticks.map(tick => <g key={tick.id} data-profile-tick={tick.id}>
          <line x1={borehole.x - 9} y1={tick.y} x2={borehole.x + 9} y2={tick.y} stroke="#30332B" strokeWidth="1" />
          <text x={borehole.x + 13} y={tick.y + 4} fontSize="11" fill="#42463C">{tick.depth.toFixed(2).replace('.', ',')}</text>
          {tick.code && <text x={borehole.x - 13} y={tick.y + 4} textAnchor="end" fontSize="11" fill={tick.status === 'ambiguous' || tick.status === 'not-found' ? '#A25B2E' : '#42463C'}>{tick.code}</text>}
        </g>)}
        <text x={borehole.x} y="132" textAnchor="middle" fontSize="14" fontWeight="600" fill="#24261F">{borehole.name}</text>
        <text x={borehole.x} y="153" textAnchor="middle" fontSize="12" fill="#62665B">{formatPk(borehole.pk)}{borehole.kind === 'fictitious' ? ' · фиктивная' : ''}</text>
      </g>)}
    </g>

    <g data-profile-legend>
      <text x="60" y="920" fontSize="17" fontWeight="600" fill="#24261F">Условные обозначения ИГЭ</text>
      <text x="1620" y="920" textAnchor="end" fontSize="12" fill="#62665B">Цвет и штриховка выбраны инженером · не автоматическая классификация по ГОСТ</text>
      {sheet.legend.map((item, index) => {
        const column = index % 7
        const row = Math.floor(index / 7)
        const x = 60 + column * 225
        const y = 946 + row * 78
        const patternId = `${baseId}-legend-${index}`
        const nameLines = getProfileLegendNameLines(item.name)
        return <g key={item.key} data-legend-code={item.key}>
          <title>{item.name || 'Наименование не заполнено'}</title>
          <rect x={x} y={y} width="64" height="42" fill={item.appearance.color} stroke="#777B70" strokeWidth="0.8" />
          {item.appearance.hatch !== 'none' && <rect x={x} y={y} width="64" height="42" fill={`url(#${patternId})`} stroke="#777B70" strokeWidth="0.8" />}
          <text x={x + 74} y={y + 17} fontSize="14" fontWeight="600" fill="#24261F">ИГЭ {item.code}</text>
          <text x={x + 74} y={y + (nameLines.length > 1 ? 30 : 35)} fontSize="10" fill="#62665B">
            {nameLines.map((line, lineIndex) => <tspan key={lineIndex} x={x + 74} dy={lineIndex ? 12 : 0}>{line}</tspan>)}
          </text>
        </g>
      })}
    </g>

    <g fill="#62665B" fontSize="11">
      <text x="60" y="1138">Геология: {sheet.unfilledIntervals} интервалов без полной геометрии заливки · {sheet.unresolvedBands} участков без согласованного ИГЭ. Открытые разрывы не дорисовываются.</text>
      <text x="1620" y="1138" textAnchor="end">ГеоРазрез 0.47 · производный профиль, исходный DXF не изменён</text>
      <text x="60" y="1162">Глубины подошв указаны в метрах. ПК — по сохранённой оси проекта. Фиктивные скважины показаны синим пунктиром.</text>
    </g>
  </svg>
}
