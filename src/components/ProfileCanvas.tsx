import { useEffect, useMemo, useRef, useState } from 'react'
import { Crosshair, Maximize2, Minus, Plus } from 'lucide-react'
import type { Borehole, GeoProject, Layer } from '@/types/geology'
import type { CoreBoundaryModel } from '@/lib/geologyCore'

type View = { cx: number; cy: number; w: number; h: number }
type DepthDrag = { pointerId: number; startY: number; startDepth: number; min: number; max: number; lastDepth: number }

interface Props {
  project: GeoProject
  boundaries: CoreBoundaryModel
  selectedId: string
  selectedLayer: Layer | null
  onSelect: (id: string) => void
  onDepthChange: (layerId: string, depth: number) => void
  onCandidateSelect: (code: string) => void
  showLabels: boolean
  showCodes: boolean
  fitToken: number
  focusToken: number
}

export function ProfileCanvas({ project, boundaries, selectedId, selectedLayer, onSelect, onDepthChange, onCandidateSelect, showLabels, showCodes, fitToken, focusToken }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 900, height: 500 })
  const [view, setView] = useState<View>({ cx: 0, cy: 0, w: 180, h: 100 })
  const [dragDepth, setDragDepth] = useState<number | null>(null)
  const drag = useRef<{ x: number; y: number; view: View } | null>(null)
  const depthDrag = useRef<DepthDrag | null>(null)
  const selected = project.columns.find(c => c.id === selectedId)
  const candidateKeys = new Set((selectedLayer?.candidates || []).map(candidate => `${candidate.x}|${candidate.y}`))
  const displayedDepth = dragDepth ?? selectedLayer?.depth ?? 0
  const displayedLayerY = selected && selectedLayer ? selected.top - displayedDepth * 10 : selectedLayer?.y ?? 0

  useEffect(() => {
    if (!host.current) return
    const observer = new ResizeObserver(entries => {
      const rect = entries[0].contentRect
      if (rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height })
    })
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    depthDrag.current = null
    setDragDepth(null)
  }, [project.id, selectedId, selectedLayer?.id])

  const fit = () => {
    const { minX, maxX, minY, maxY } = project.bounds
    const aspect = size.width / size.height
    let w = maxX - minX + 36
    let h = maxY - minY + 26
    if (w / h < aspect) w = h * aspect
    else h = w / aspect
    setView({ cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w, h })
  }

  const focus = (column?: Borehole) => {
    if (!column) return
    const aspect = size.width / size.height
    let w = 180
    let h = w / aspect
    if (h < 100) { h = 100; w = h * aspect }
    setView({ cx: column.x + 35, cy: column.top - 44, w, h })
  }

  useEffect(() => { if (project.id) focus(project.columns.find(c => c.id === selectedId) || project.columns[0]) }, [project.id])
  useEffect(() => { if (fitToken > 0) fit() }, [fitToken])
  useEffect(() => { if (focusToken > 0) focus(selected) }, [focusToken])

  const zoom = (factor: number, clientX?: number, clientY?: number) => {
    setView(current => {
      const nextW = Math.min(Math.max(current.w * factor, 28), 12000)
      const nextH = Math.min(Math.max(current.h * factor, 18), 2500)
      let cx = current.cx, cy = current.cy
      if (clientX !== undefined && clientY !== undefined && host.current) {
        const rect = host.current.getBoundingClientRect()
        const px = (clientX - rect.left) / rect.width
        const py = (clientY - rect.top) / rect.height
        const worldX = current.cx - current.w / 2 + px * current.w
        const worldY = current.cy + current.h / 2 - py * current.h
        cx = worldX - (px - 0.5) * nextW
        cy = worldY + (py - 0.5) * nextH
      }
      return { cx, cy, w: nextW, h: nextH }
    })
  }

  const visible = useMemo(() => {
    const left = view.cx - view.w / 2 - 10, right = view.cx + view.w / 2 + 10
    const top = view.cy + view.h / 2 + 10, bottom = view.cy - view.h / 2 - 10
    return {
      segments: project.geometry.segments.filter(s => Math.max(s.x1, s.x2) >= left && Math.min(s.x1, s.x2) <= right && Math.max(s.y1, s.y2) >= bottom && Math.min(s.y1, s.y2) <= top),
      boundaries: boundaries.items.filter(item => item.status === 'connected' && item.y1 !== null && item.y2 !== null && Math.max(item.x1, item.x2) >= left && Math.min(item.x1, item.x2) <= right && Math.max(item.y1, item.y2) >= bottom && Math.min(item.y1, item.y2) <= top),
      circles: project.geometry.circles.filter(c => c.x + c.r >= left && c.x - c.r <= right && c.y + c.r >= bottom && c.y - c.r <= top),
      texts: project.geometry.texts.filter(t => t.x >= left && t.x <= right && t.y >= bottom && t.y <= top),
      columns: project.columns.filter(c => c.x >= left && c.x <= right)
    }
  }, [project, boundaries, view])

  const layerLimits = () => {
    if (!selected || !selectedLayer) return { min: 0.01, max: 1000 }
    const index = selected.layers.findIndex(layer => layer.id === selectedLayer.id)
    return {
      min: (selected.layers[index - 1]?.depth ?? 0) + 0.01,
      max: (selected.layers[index + 1]?.depth ?? selectedLayer.depth + 100) - 0.01
    }
  }

  const detail = view.w < 850
  const zoomPercent = Math.round(180 / view.w * 100)
  const viewBox = `${view.cx - view.w / 2} ${-view.cy - view.h / 2} ${view.w} ${view.h}`

  return (
    <div className="profile-canvas" ref={host}>
      <svg
        viewBox={viewBox}
        className="profile-svg"
        role="img"
        aria-label="Интерактивный геологический разрез"
        onWheel={event => zoom(event.deltaY > 0 ? 1.16 : 0.86, event.clientX, event.clientY)}
      >
        <rect
          x={view.cx - view.w / 2} y={-view.cy - view.h / 2} width={view.w} height={view.h}
          fill="var(--canvas-bg)" className="canvas-pan-surface"
          onPointerDown={event => {
            event.currentTarget.setPointerCapture(event.pointerId)
            drag.current = { x: event.clientX, y: event.clientY, view }
          }}
          onPointerMove={event => {
            if (!drag.current || !host.current) return
            const rect = host.current.getBoundingClientRect()
            const dx = (event.clientX - drag.current.x) * drag.current.view.w / rect.width
            const dy = (event.clientY - drag.current.y) * drag.current.view.h / rect.height
            setView({ ...drag.current.view, cx: drag.current.view.cx - dx, cy: drag.current.view.cy + dy })
          }}
          onPointerUp={() => { drag.current = null }}
          onPointerCancel={() => { drag.current = null }}
        />
        <g transform="scale(1,-1)">
          <g className="geo-lines">
            {visible.segments.map((s, i) => (
              <line key={`${s.handle || 's'}-${i}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
          <g className="calculated-boundaries">
            {visible.boundaries.map(boundary => <line
              key={boundary.id}
              className={`calculated-boundary ${boundary.manual ? 'manual' : ''} ${boundary.manualCorrelation ? 'manual-correlation' : ''}`}
              data-boundary={boundary.id}
              data-correlation={boundary.correlationId || ''}
              data-left-layer={boundary.leftLayerId || ''}
              data-right-layer={boundary.rightLayerId || ''}
              x1={boundary.x1} y1={boundary.y1!} x2={boundary.x2} y2={boundary.y2!}
              vectorEffect="non-scaling-stroke"
            />)}
          </g>
          {(showCodes || selectedLayer) && detail && <g className="geo-circles">
            {visible.circles.filter(c => showCodes || candidateKeys.has(`${c.x}|${c.y}`)).map((c, i) => {
              const candidate = candidateKeys.has(`${c.x}|${c.y}`)
              return <circle className={candidate ? 'candidate-circle' : ''} key={`${c.handle || 'c'}-${i}`} cx={c.x} cy={c.y} r={c.r} vectorEffect="non-scaling-stroke" />
            })}
          </g>}
          {selected && selectedLayer && detail && <g className="candidate-links">
            {selectedLayer.candidates.map((candidate, index) => <line key={`${candidate.x}-${candidate.y}-${index}`} x1={selected.x} y1={displayedLayerY} x2={candidate.x} y2={candidate.y} vectorEffect="non-scaling-stroke" />)}
            <line className="selected-layer-boundary" x1={selected.x - 3} y1={displayedLayerY} x2={selected.x + 3} y2={displayedLayerY} vectorEffect="non-scaling-stroke" />
          </g>}
        </g>
        {detail && <g className="geo-texts">
          {visible.texts.map((t, i) => {
            const isCode = project.geometry.circles.some(c => Math.hypot(c.x - t.x, c.y - t.y) <= c.r + 0.2)
            if (isCode && !showCodes) return null
            if (!showLabels && !isCode) return null
            return <text key={`${t.handle || 't'}-${i}`} x={t.x} y={-t.y}>{t.text}</text>
          })}
        </g>}
        {visible.columns.map(column => {
          const active = column.id === selectedId
          return (
            <g key={column.id} data-borehole={column.id}>
              {active && <>
                <rect className="selected-column-fill" x={column.x - 2.8} y={-column.top - 8} width={5.6} height={column.top - column.bottom + 13} />
                <line className="selected-column-line" x1={column.x} y1={-column.bottom + 4} x2={column.x} y2={-column.top - 7} vectorEffect="non-scaling-stroke" />
              </>}
              <rect
                className="column-hit-area"
                x={column.x - 4} y={-column.top - 12} width={8} height={column.top - column.bottom + 20}
                onClick={() => onSelect(column.id)}
                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') onSelect(column.id) }}
                tabIndex={0}
                role="button"
                aria-label={`Выбрать ${column.name}`}
              />
            </g>
          )
        })}
        {selected && selectedLayer && selectedLayer.status === 'ambiguous' && detail && !selected.isExcluded && <g transform="scale(1,-1)" className="candidate-hit-targets">
          {selectedLayer.candidates.map((candidate, index) => {
            const circle = project.geometry.circles.find(item => item.x === candidate.x && item.y === candidate.y)
            return <circle
              key={`candidate-hit-${candidate.x}-${candidate.y}-${index}`}
              cx={candidate.x} cy={candidate.y} r={(circle?.r || 1.5) + 0.7}
              data-code={candidate.code}
              tabIndex={0}
              role="button"
              aria-label={`Подтвердить ИГЭ ${candidate.code}`}
              onClick={event => { event.stopPropagation(); onCandidateSelect(candidate.code) }}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onCandidateSelect(candidate.code)
                }
              }}
            >
              <title>Подтвердить ИГЭ {candidate.code} для глубины {selectedLayer.depth.toFixed(2).replace('.', ',')} м</title>
            </circle>
          })}
        </g>}
        {selected && selectedLayer && detail && !selected.isExcluded && <g transform="scale(1,-1)" className={`layer-depth-editor ${dragDepth !== null ? 'dragging' : ''}`}>
          <line className="depth-drag-visible" x1={selected.x - 3} y1={displayedLayerY} x2={selected.x + 3} y2={displayedLayerY} vectorEffect="non-scaling-stroke" />
          <circle className="depth-drag-handle" cx={selected.x + 3} cy={displayedLayerY} r={0.85} vectorEffect="non-scaling-stroke" />
          <line
            className="depth-drag-hit"
            x1={selected.x - 4} y1={displayedLayerY} x2={selected.x + 4} y2={displayedLayerY}
            vectorEffect="non-scaling-stroke"
            tabIndex={0}
            role="slider"
            aria-label={`Глубина слоя ${selectedLayer.depth.toFixed(2).replace('.', ',')} м`}
            aria-valuemin={layerLimits().min}
            aria-valuemax={layerLimits().max}
            aria-valuenow={displayedDepth}
            onKeyDown={event => {
              if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
              event.preventDefault()
              const { min, max } = layerLimits()
              const next = Math.min(max, Math.max(min, selectedLayer.depth + (event.key === 'ArrowDown' ? 0.1 : -0.1)))
              onDepthChange(selectedLayer.id, Math.round(next * 100) / 100)
            }}
            onPointerDown={event => {
              event.preventDefault()
              event.stopPropagation()
              event.currentTarget.setPointerCapture(event.pointerId)
              const { min, max } = layerLimits()
              depthDrag.current = { pointerId: event.pointerId, startY: event.clientY, startDepth: selectedLayer.depth, min, max, lastDepth: selectedLayer.depth }
              setDragDepth(selectedLayer.depth)
            }}
            onPointerMove={event => {
              const current = depthDrag.current
              if (!current || current.pointerId !== event.pointerId || !host.current) return
              const rect = host.current.getBoundingClientRect()
              const delta = (event.clientY - current.startY) * view.h / rect.height / 10
              const next = Math.round(Math.min(current.max, Math.max(current.min, current.startDepth + delta)) * 100) / 100
              current.lastDepth = next
              setDragDepth(next)
            }}
            onPointerUp={event => {
              const current = depthDrag.current
              if (!current || current.pointerId !== event.pointerId) return
              const next = current.lastDepth
              depthDrag.current = null
              setDragDepth(null)
              if (next !== selectedLayer.depth) onDepthChange(selectedLayer.id, next)
            }}
            onPointerCancel={() => { depthDrag.current = null; setDragDepth(null) }}
          />
        </g>}
        {selected && detail && <g className="selected-caption">
          <rect x={selected.x - 1} y={-selected.top - 10} width={Math.max(25, selected.name.length * 2)} height={6} />
          <text x={selected.x + 1} y={-selected.top - 6.9}>{selected.name}</text>
        </g>}
      </svg>

      <div className="canvas-scale-readout">
        <span>Горизонтально 1:{project.horizontalScale}</span>
        <span>Вертикально 1:{project.verticalScale}</span>
      </div>
      <div className="canvas-controls" aria-label="Управление масштабом">
        <button type="button" onClick={fit} title="Показать весь разрез" aria-label="Показать весь разрез"><Maximize2 size={16} /></button>
        <button type="button" onClick={() => zoom(1.25)} title="Уменьшить" aria-label="Уменьшить"><Minus size={16} /></button>
        <span>{zoomPercent}%</span>
        <button type="button" onClick={() => zoom(0.8)} title="Увеличить" aria-label="Увеличить"><Plus size={16} /></button>
        <button type="button" onClick={() => focus(selected)} title="Показать выбранную скважину" aria-label="Показать выбранную скважину"><Crosshair size={16} /></button>
      </div>
      <div className="canvas-position-readout">В поле: {visible.columns.length} · Границы: {boundaries.connected} · Разрывы: {boundaries.gaps + boundaries.invalid} · Колесо — масштаб · Перетаскивание — панорама{selectedLayer ? ` · Подошва: ${displayedDepth.toFixed(2).replace('.', ',')} м · потяните маркер` : ''}</div>
    </div>
  )
}
