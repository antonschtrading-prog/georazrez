import { useState } from 'react'
import { AlertTriangle, ArchiveX, Check, CircleDashed, Link2, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatPk, type Borehole, type CodeStatus } from '@/types/geology'

interface Props {
  column: Borehole
  selectedLayerId: string | null
  onLayerSelect: (id: string) => void
  onLayerAdd: (depth: number, code: string) => void
  onLayerDelete: (layerId: string) => void
  onRename: (name: string) => void
  onDepthChange: (layerId: string, depth: number) => void
  onCodeChange: (layerId: string, code: string, status?: CodeStatus) => void
  onToggleExcluded: (reason: string) => void
}

const statusText: Record<CodeStatus, string> = {
  topology: 'По границам',
  'vertical-only': 'По положению',
  ambiguous: 'Выбор кода',
  'not-found': 'Не найден',
  manual: 'Подтверждено'
}

export function Inspector({ column, selectedLayerId, onLayerSelect, onLayerAdd, onLayerDelete, onRename, onDepthChange, onCodeChange, onToggleExcluded }: Props) {
  const [excludeOpen, setExcludeOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [addDepth, setAddDepth] = useState('1,00')
  const [addCode, setAddCode] = useState('')
  const [addError, setAddError] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const disabled = Boolean(column.isExcluded)
  const selectedLayer = column.layers.find(layer => layer.id === selectedLayerId) || null

  const insertionBounds = () => {
    const index = selectedLayer ? column.layers.findIndex(layer => layer.id === selectedLayer.id) : column.layers.length - 1
    return {
      previous: column.layers[index]?.depth ?? 0,
      next: column.layers[index + 1]?.depth ?? Infinity
    }
  }

  const openAdd = () => {
    const { previous, next } = insertionBounds()
    const suggested = Number.isFinite(next) ? (previous + next) / 2 : previous + 1
    setAddDepth(suggested.toFixed(2).replace('.', ','))
    setAddCode('')
    setAddError('')
    setAddOpen(true)
  }

  const submitAdd = () => {
    const depth = Number(addDepth.replace(',', '.'))
    const { previous, next } = insertionBounds()
    if (!Number.isFinite(depth) || depth <= previous || depth >= next) {
      setAddError(Number.isFinite(next)
        ? `Глубина должна быть между ${previous.toFixed(2).replace('.', ',')} и ${next.toFixed(2).replace('.', ',')} м`
        : `Глубина должна быть больше ${previous.toFixed(2).replace('.', ',')} м`)
      return
    }
    onLayerAdd(Math.round(depth * 100) / 100, addCode.trim())
    setAddOpen(false)
  }

  return (
    <aside className="inspector-panel" aria-label="Свойства скважины">
      <div className="panel-heading inspector-heading">
        <div><span className="panel-kicker">СВОЙСТВА</span><h2>Скважина <span>№{column.index}</span></h2></div>
        <span className={`source-badge ${column.isExcluded ? 'excluded' : column.sourceNamed ? 'verified' : 'warning'}`}>{column.isExcluded ? 'Исключена' : column.sourceNamed ? 'DXF' : 'Нет имени'}</span>
      </div>
      <div className="inspector-scroll">
        {column.isExcluded && <div className="excluded-column-note">
          <strong>Не участвует в расчёте и экспорте</strong>
          <span>{column.exclusionReason}</span>
        </div>}
        <section className="property-section">
          <label className="field-label" htmlFor="borehole-name">Наименование</label>
          <input
            key={`${column.id}-${column.name}`}
            id="borehole-name"
            className={`name-input ${!column.sourceNamed ? 'needs-attention' : ''}`}
            defaultValue={column.name}
            onBlur={event => { if (event.target.value !== column.name) onRename(event.target.value) }}
            onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
            aria-label="Наименование скважины"
            disabled={disabled}
          />
          <div className="coordinate-grid">
            <div><span>Пикетаж</span><strong>{formatPk(column.pk)}</strong></div>
            <div><span>Глубин</span><strong>{column.layers.length}</strong></div>
            <div><span>X, м</span><strong>{column.coordX?.toFixed(3) ?? '—'}</strong></div>
            <div><span>Y, м</span><strong>{column.coordY?.toFixed(3) ?? '—'}</strong></div>
          </div>
        </section>

        <section className="layers-section">
          <div className="section-title-row">
            <h3>Подошвы слоёв</h3>
            <div className="layer-section-actions">
              <span>{column.layers.length}</span>
              <button type="button" onClick={openAdd} disabled={disabled} aria-label="Добавить слой" title="Добавить подошву после выбранного слоя"><Plus size={14} /></button>
              <button type="button" onClick={() => setDeleteOpen(true)} disabled={disabled || !selectedLayer} aria-label="Удалить выбранный слой" title="Удалить выбранную подошву"><Trash2 size={13} /></button>
            </div>
          </div>
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
                      disabled={disabled}
                      onClick={event => event.stopPropagation()}
                      onBlur={event => {
                        const value = Number(event.target.value.replace(',', '.'))
                        if (Number.isFinite(value) && value > 0 && value !== layer.depth) onDepthChange(layer.id, value)
                        event.target.value = String(layer.depth).replace('.', ',')
                      }}
                      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
                    />
                    <input
                      key={`${layer.id}-${layer.ige}-${layer.status}`}
                      className={`code-input ${hasIssue ? 'needs-attention' : ''}`}
                      defaultValue={layer.ige}
                      placeholder="—"
                      aria-label={`Код ИГЭ слоя ${index + 1}`}
                      disabled={disabled}
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
                    <div>{candidates.map(code => <button type="button" key={code} disabled={disabled} onClick={() => onCodeChange(layer.id, code, 'manual')}>{code}</button>)}</div>
                  </div>}
                </div>
              )
            })}
            {!column.layers.length && <div className="empty-layers">В колонке нет расчётных подошв.<br />Добавьте первый слой вручную.</div>}
          </div>
        </section>

        {column.excluded.length > 0 && <details className="excluded-details">
          <summary>Исключённые подписи <span>{column.excluded.length}</span></summary>
          {column.excluded.map((item, index) => <div className="excluded-item" key={`${item.handle}-${index}`}>
            <strong>{item.text}</strong><span>{item.reason}</span><code>handle {item.handle || '—'}</code>
          </div>)}
        </details>}

        <section className="column-review-section">
          <strong>{column.isExcluded ? 'Вернуть геометрию в проект' : 'Решение по колонке'}</strong>
          <p>{column.isExcluded ? 'Все слои и исходные подписи сохранены. Возврат восстановит проверки и экспорт.' : 'Исключение не удаляет линии из DXF и требует явной причины. Действие можно отменить.'}</p>
          {column.isExcluded ? <button type="button" className="button secondary" onClick={() => onToggleExcluded('')}><RotateCcw size={15} /> Вернуть в расчёт</button> :
            <button type="button" className="button secondary danger-button" onClick={() => setExcludeOpen(true)}><ArchiveX size={15} /> Исключить из расчёта</button>}
        </section>
      </div>
      <div className="inspector-footer">Изменения сохраняются только в этом браузере</div>

      <Dialog open={excludeOpen} onOpenChange={setExcludeOpen}>
        <DialogContent className="exclude-dialog">
          <DialogHeader><DialogTitle>Исключить скважину №{column.index}?</DialogTitle><DialogDescription>Колонка останется на исходном разрезе, но её слои не попадут в расчётный Excel. Это ручное решение, а не фильтр по количеству.</DialogDescription></DialogHeader>
          <label className="field-label" htmlFor="exclusion-reason">Причина исключения</label>
          <textarea id="exclusion-reason" className="reason-input" value={reason} onChange={event => setReason(event.target.value)} placeholder="Например: вспомогательная колонка, не является скважиной" rows={4} />
          <div className="import-actions"><button type="button" className="button secondary" onClick={() => setExcludeOpen(false)}>Отмена</button><button type="button" className="button primary" disabled={!reason.trim()} onClick={() => { onToggleExcluded(reason.trim()); setReason(''); setExcludeOpen(false) }}>Подтвердить исключение</button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="exclude-dialog layer-dialog">
          <DialogHeader><DialogTitle>Добавить подошву слоя</DialogTitle><DialogDescription>{selectedLayer ? `Новый слой будет вставлен после глубины ${selectedLayer.depth.toFixed(2).replace('.', ',')} м.` : 'Новый слой будет добавлен в конец колонки.'} Исходные подписи DXF не изменяются.</DialogDescription></DialogHeader>
          <div className="layer-form-grid">
            <div><label className="field-label" htmlFor="new-layer-depth">Глубина подошвы, м</label><input id="new-layer-depth" className="name-input" inputMode="decimal" value={addDepth} onChange={event => setAddDepth(event.target.value)} autoFocus /></div>
            <div><label className="field-label" htmlFor="new-layer-code">Код ИГЭ</label><input id="new-layer-code" className="name-input" value={addCode} onChange={event => setAddCode(event.target.value)} placeholder="Можно указать позже" /></div>
          </div>
          {addError && <div className="import-error" role="alert">{addError}</div>}
          <div className="import-actions"><button type="button" className="button secondary" onClick={() => setAddOpen(false)}>Отмена</button><button type="button" className="button primary" onClick={submitAdd}>Добавить слой</button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="exclude-dialog layer-dialog">
          <DialogHeader><DialogTitle>Удалить выбранную подошву?</DialogTitle><DialogDescription>{selectedLayer ? `Будет удалён слой ${selectedLayer.depth.toFixed(2).replace('.', ',')} м${selectedLayer.ige ? `, ИГЭ ${selectedLayer.ige}` : ''}. Геометрия исходного DXF останется в проекте.` : 'Сначала выберите слой.'} Действие можно отменить через Ctrl+Z.</DialogDescription></DialogHeader>
          <div className="import-actions"><button type="button" className="button secondary" onClick={() => setDeleteOpen(false)}>Отмена</button><button type="button" className="button primary danger-solid" disabled={!selectedLayer} onClick={() => { if (selectedLayer) onLayerDelete(selectedLayer.id); setDeleteOpen(false) }}>Удалить подошву</button></div>
        </DialogContent>
      </Dialog>
    </aside>
  )
}
