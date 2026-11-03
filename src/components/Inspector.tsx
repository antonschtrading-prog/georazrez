import { AlertTriangle, Check, CircleDashed, Link2 } from 'lucide-react'
import { formatPk, type Borehole, type CodeStatus } from '@/types/geology'

interface Props {
  column: Borehole
  selectedLayerId: string | null
  onLayerSelect: (id: string) => void
  onRename: (name: string) => void
  onDepthChange: (layerId: string, depth: number) => void
  onCodeChange: (layerId: string, code: string, status?: CodeStatus) => void
}

const statusText: Record<CodeStatus, string> = {
  topology: 'По границам',
  'vertical-only': 'По положению',
  ambiguous: 'Выбор кода',
  'not-found': 'Не найден',
  manual: 'Подтверждено'
}

export function Inspector({ column, selectedLayerId, onLayerSelect, onRename, onDepthChange, onCodeChange }: Props) {
  return (
    <aside className="inspector-panel" aria-label="Свойства скважины">
      <div className="panel-heading inspector-heading">
        <div><span className="panel-kicker">СВОЙСТВА</span><h2>Скважина <span>№{column.index}</span></h2></div>
        <span className={`source-badge ${column.sourceNamed ? 'verified' : 'warning'}`}>{column.sourceNamed ? 'DXF' : 'Нет имени'}</span>
      </div>
      <div className="inspector-scroll">
        <section className="property-section">
          <label className="field-label" htmlFor="borehole-name">Наименование</label>
          <input
            id="borehole-name"
            className={`name-input ${!column.sourceNamed ? 'needs-attention' : ''}`}
            value={column.name}
            onChange={event => onRename(event.target.value)}
            aria-label="Наименование скважины"
          />
          <div className="coordinate-grid">
            <div><span>Пикетаж</span><strong>{formatPk(column.pk)}</strong></div>
            <div><span>Глубин</span><strong>{column.layers.length}</strong></div>
            <div><span>X, м</span><strong>{column.coordX?.toFixed(3) ?? '—'}</strong></div>
            <div><span>Y, м</span><strong>{column.coordY?.toFixed(3) ?? '—'}</strong></div>
          </div>
        </section>

        <section className="layers-section">
          <div className="section-title-row"><h3>Подошвы слоёв</h3><span>{column.layers.length}</span></div>
          <div className="layer-table-header"><span>Глубина, м</span><span>ИГЭ</span><span>Статус</span></div>
          <div className="layer-rows">
            {column.layers.map((layer, index) => {
              const candidates = [...new Set(layer.candidates.map(c => c.code))]
              const hasIssue = layer.status === 'ambiguous' || layer.status === 'not-found'
              return (
                <div
                  key={layer.id}
                  className={`layer-row ${selectedLayerId === layer.id ? 'active' : ''} ${hasIssue ? 'has-issue' : ''}`}
                  onClick={() => onLayerSelect(layer.id)}
                >
                  <div className="layer-main">
                    <span className="layer-number">{index + 1}</span>
                    <input
                      key={`${layer.id}-${layer.depth}`}
                      className="depth-input"
                      defaultValue={String(layer.depth).replace('.', ',')}
                      inputMode="decimal"
                      aria-label={`Глубина слоя ${index + 1}`}
                      onClick={event => event.stopPropagation()}
                      onBlur={event => {
                        const value = Number(event.target.value.replace(',', '.'))
                        if (Number.isFinite(value) && value > 0 && value !== layer.depth) onDepthChange(layer.id, value)
                        else event.target.value = String(layer.depth).replace('.', ',')
                      }}
                      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
                    />
                    <input
                      key={`${layer.id}-${layer.ige}-${layer.status}`}
                      className={`code-input ${hasIssue ? 'needs-attention' : ''}`}
                      defaultValue={layer.ige}
                      placeholder="—"
                      aria-label={`Код ИГЭ слоя ${index + 1}`}
                      onClick={event => event.stopPropagation()}
                      onBlur={event => {
                        const value = event.target.value.trim()
                        if (value !== layer.ige) onCodeChange(layer.id, value, value ? 'manual' : 'not-found')
                      }}
                      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
                    />
                    <span className={`layer-status status-${layer.status}`} title={layer.source}>
                      {layer.status === 'topology' ? <Link2 size={12} /> : layer.status === 'manual' ? <Check size={12} /> : layer.status === 'vertical-only' ? <CircleDashed size={12} /> : <AlertTriangle size={12} />}
                      {statusText[layer.status]}
                    </span>
                  </div>
                  {layer.status === 'ambiguous' && <div className="candidate-picker" onClick={event => event.stopPropagation()}>
                    <span>Выберите по границам:</span>
                    <div>{candidates.map(code => <button type="button" key={code} onClick={() => onCodeChange(layer.id, code, 'manual')}>{code}</button>)}</div>
                  </div>}
                </div>
              )
            })}
          </div>
        </section>

        {column.excluded.length > 0 && <details className="excluded-details">
          <summary>Исключённые подписи <span>{column.excluded.length}</span></summary>
          {column.excluded.map((item, index) => <div className="excluded-item" key={`${item.handle}-${index}`}>
            <strong>{item.text}</strong><span>{item.reason}</span><code>handle {item.handle || '—'}</code>
          </div>)}
        </details>}
      </div>
      <div className="inspector-footer">Изменения сохраняются только в этом браузере</div>
    </aside>
  )
}
