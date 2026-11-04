import { useState, type FocusEvent } from 'react'
import { AlertTriangle, ArchiveX, Check, CheckCheck, CircleDashed, Link2, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LabTests } from '@/components/LabTests'
import { getCoreLayerDepthIssue, getCoreLayerThickness, type CoreBorehole } from '@/lib/geologyCore'
import { formatPk, getCharacteristicCoverage, SOIL_CHARACTERISTICS, type Borehole, type CodeStatus, type IgePassport, type LayerNeighbor, type LayerNeighbors, type LabDataIssue, type LabTestField, type SoilCharacteristicField, type SoilCharacteristicKey } from '@/types/geology'

interface Props {
  column: Borehole
  coreColumn: CoreBorehole
  selectedLayerId: string | null
  igePassport: IgePassport | null
  igeLayerCount: number
  layerNeighbors: LayerNeighbors
  onNeighborSelect: (boreholeId: string, layerId: string) => void
  onPassportChange: (code: string, field: 'name' | 'description' | 'notes', value: string) => void
  onCharacteristicChange: (code: string, property: SoilCharacteristicKey, field: SoilCharacteristicField, value: number | string | null) => void
  boreholes: { id: string; name: string; layers: { id: string; ige: string; depth: number }[] }[]
  labIssues: LabDataIssue[]
  focusedLabTestId: string | null
  labFocusToken: number
  onLabTestAdd: (code: string) => void
  onLabTestDelete: (code: string, testId: string) => void
  onLabTestChange: (code: string, testId: string, field: LabTestField, value: string | number | null) => void
  onLabTestValueChange: (code: string, testId: string, property: SoilCharacteristicKey, value: number | null) => void
  onLabImport: (code: string, file: File) => Promise<{ count: number; errors: string[] }>
  onLabTemplate: (code: string) => Promise<void>
  onLayerSelect: (id: string) => void
  onLayerAdd: (depth: number, code: string) => void
  onLayerDelete: (layerId: string) => void
  onRename: (name: string) => void
  onDepthChange: (layerId: string, depth: number) => void
  onCodeChange: (layerId: string, code: string, status?: CodeStatus) => void
  onToggleExcluded: (reason: string) => void
  onToggleReviewed: () => void
}

const statusText: Record<CodeStatus, string> = {
  topology: 'По границам',
  'vertical-only': 'По положению',
  ambiguous: 'Выбор кода',
  'not-found': 'Не найден',
  manual: 'Подтверждено'
}

export function Inspector({ column, coreColumn, selectedLayerId, igePassport, igeLayerCount, layerNeighbors, onNeighborSelect, onPassportChange, onCharacteristicChange, boreholes, labIssues, focusedLabTestId, labFocusToken, onLabTestAdd, onLabTestDelete, onLabTestChange, onLabTestValueChange, onLabImport, onLabTemplate, onLayerSelect, onLayerAdd, onLayerDelete, onRename, onDepthChange, onCodeChange, onToggleExcluded, onToggleReviewed }: Props) {
  const [excludeOpen, setExcludeOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [addDepth, setAddDepth] = useState('1,00')
  const [addCode, setAddCode] = useState('')
  const [addError, setAddError] = useState('')
  const [characteristicError, setCharacteristicError] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const disabled = Boolean(column.isExcluded)
  const selectedLayer = column.layers.find(layer => layer.id === selectedLayerId) || null
  const passportCode = selectedLayer?.ige.trim() || ''
  const hasIssues = !coreColumn.sourceNamed || coreColumn.layers.some((layer, index) => getCoreLayerDepthIssue(coreColumn.layers, index) || layer.codeStatus === 'ambiguous' || layer.codeStatus === 'not-found')
  const characteristicCoverage = getCharacteristicCoverage(igePassport)
  const characteristicGroups = [...new Set(SOIL_CHARACTERISTICS.map(item => item.group))]

  const updateCharacteristicValue = (
    event: FocusEvent<HTMLInputElement>,
    property: SoilCharacteristicKey,
    field: 'standard' | 'design',
    previous: number | null | undefined
  ) => {
    const raw = event.target.value.trim()
    const previousValue = previous ?? null
    if (!raw) {
      setCharacteristicError('')
      if (previousValue !== null) onCharacteristicChange(passportCode, property, field, null)
      return
    }
    const parsed = Number(raw.replace(',', '.'))
    if (!Number.isFinite(parsed)) {
      setCharacteristicError('Значение характеристики должно быть конечным числом. Пустое поле очищает значение.')
      event.target.value = String(previousValue ?? '').replace('.', ',')
      return
    }
    setCharacteristicError('')
    if (parsed !== previousValue) onCharacteristicChange(passportCode, property, field, parsed)
  }

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

  const renderNeighbor = (neighbor: LayerNeighbor | null, label: string) => <div className="neighbor-row">
    <div className="neighbor-meta"><span>{label}</span><strong>{neighbor?.name || 'Нет активной скважины'}</strong>{neighbor && <small>ПК {formatPk(neighbor.pk)}</small>}</div>
    <div className="neighbor-matches">
      {neighbor?.matches.map(match => <button type="button" key={match.layerId} onClick={() => { setCharacteristicError(''); onNeighborSelect(neighbor.boreholeId, match.layerId) }} aria-label={`Перейти к соседнему слою ${neighbor.name}, ${match.depth.toFixed(2).replace('.', ',')} м`}>
        {passportCode} · {match.depth.toFixed(2).replace('.', ',')} м
      </button>)}
      {neighbor && !neighbor.matches.length && <span>Код у соседа не найден</span>}
    </div>
  </div>

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
          <div className="layer-table-header"><span>Глубина, м</span><span>ИГЭ</span><span>Мощн., м</span><span>Статус</span></div>
          <div className="layer-rows">
            {column.layers.map((layer, index) => {
              const candidates = [...new Set(layer.candidates.map(c => c.code))]
              const codeHasIssue = layer.status === 'ambiguous' || layer.status === 'not-found'
              const depthIssue = getCoreLayerDepthIssue(coreColumn.layers, index)
              const hasIssue = codeHasIssue || Boolean(depthIssue)
              const thickness = getCoreLayerThickness(coreColumn.layers, index)
              return (
                <div
                  key={layer.id}
                  className={`layer-row ${selectedLayerId === layer.id ? 'active' : ''} ${hasIssue ? 'has-issue' : ''}`}
                  onClick={() => { setCharacteristicError(''); onLayerSelect(layer.id) }}
                >
                  <div className="layer-main">
                    <span className="layer-number">{index + 1}</span>
                    <input
                      key={`${layer.id}-${layer.depth}`}
                      className={`depth-input ${layer.depthSource === 'manual' ? 'manual-depth' : ''} ${depthIssue ? 'depth-issue' : ''}`}
                      title={depthIssue === 'invalid-depth' ? 'Некорректная глубина подошвы' : depthIssue === 'depth-order' ? 'Глубина совпадает с предыдущей или нарушает порядок' : layer.depthSource === 'manual' ? 'Глубина изменена вручную' : 'Глубина из исходного DXF'}
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
                      className={`code-input ${codeHasIssue ? 'needs-attention' : ''}`}
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
                    <span className="layer-thickness" title={`Мощность от предыдущей подошвы: ${thickness.toFixed(2).replace('.', ',')} м`}>{thickness.toFixed(2).replace('.', ',')}</span>
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

        {selectedLayer && passportCode && <section className="neighbor-section" aria-label={`Сопоставление ИГЭ ${passportCode} с соседями`}>
          <div className="passport-heading"><div><span className="panel-kicker">СОПОСТАВЛЕНИЕ</span><h3>Соседние скважины</h3></div></div>
          {renderNeighbor(layerNeighbors.previous, 'Предыдущая активная')}
          {renderNeighbor(layerNeighbors.next, 'Следующая активная')}
          <p>Отсутствие кода у соседа может быть выклиниванием и не считается ошибкой автоматически.</p>
        </section>}

        {selectedLayer && passportCode && <section className="ige-passport-section" aria-label={`Паспорт ИГЭ ${passportCode}`}>
          <div className="passport-heading">
            <div><span className="panel-kicker">ПАСПОРТ ИГЭ</span><h3>{passportCode}</h3></div>
            <span>{igeLayerCount} слоёв проекта</span>
          </div>
          <p>Общие сведения применяются ко всем слоям с этим кодом. Данные заполняются вручную, а не извлекаются из DXF.</p>
          <label className="field-label" htmlFor="ige-passport-name">Наименование ИГЭ</label>
          <input
            key={`${passportCode}-name-${igePassport?.name || ''}`}
            id="ige-passport-name"
            className="name-input"
            defaultValue={igePassport?.name || ''}
            disabled={disabled}
            onBlur={event => { if (event.target.value !== (igePassport?.name || '')) onPassportChange(passportCode, 'name', event.target.value) }}
            onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
          />
          <label className="field-label" htmlFor="ige-passport-description">Описание грунта</label>
          <textarea
            key={`${passportCode}-description-${igePassport?.description || ''}`}
            id="ige-passport-description"
            className="passport-textarea"
            rows={3}
            defaultValue={igePassport?.description || ''}
            disabled={disabled}
            placeholder="Состав, состояние, включения и другие признаки"
            onBlur={event => { if (event.target.value !== (igePassport?.description || '')) onPassportChange(passportCode, 'description', event.target.value) }}
          />
          <label className="field-label" htmlFor="ige-passport-notes">Примечание</label>
          <textarea
            key={`${passportCode}-notes-${igePassport?.notes || ''}`}
            id="ige-passport-notes"
            className="passport-textarea notes"
            rows={2}
            defaultValue={igePassport?.notes || ''}
            disabled={disabled}
            placeholder="Особые условия залегания или оговорки"
            onBlur={event => { if (event.target.value !== (igePassport?.notes || '')) onPassportChange(passportCode, 'notes', event.target.value) }}
          />

          <div className="characteristics-heading">
            <div><h4>Характеристики грунта</h4><span>Нормативные и расчётные значения раздельно</span></div>
            <strong>{characteristicCoverage.filled} / {characteristicCoverage.total}</strong>
          </div>
          <p className="characteristics-note">Значения не рассчитываются из других полей и не извлекаются из DXF. Указывайте источник лабораторных или принятых данных.</p>
          {characteristicError && <div className="import-error characteristic-error" role="alert">{characteristicError}</div>}
          {characteristicGroups.map(group => <section className="characteristic-group" key={group} aria-label={`${group} характеристики`}>
            <h4>{group}</h4>
            {SOIL_CHARACTERISTICS.filter(property => property.group === group).map(property => {
              const record = igePassport?.characteristics?.[property.key]
              return <div className="characteristic-row" key={property.key}>
                <div className="characteristic-label"><strong>{property.label}</strong><span>{property.unit}</span></div>
                <div className="characteristic-value-grid">
                  <label><span>Нормативное</span><input
                    key={`${passportCode}-${property.key}-standard-${record?.standard ?? 'empty'}`}
                    defaultValue={String(record?.standard ?? '').replace('.', ',')}
                    inputMode="decimal"
                    disabled={disabled}
                    aria-label={`${property.label}, нормативное значение`}
                    onBlur={event => updateCharacteristicValue(event, property.key, 'standard', record?.standard)}
                    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
                  /></label>
                  <label><span>Расчётное</span><input
                    key={`${passportCode}-${property.key}-design-${record?.design ?? 'empty'}`}
                    defaultValue={String(record?.design ?? '').replace('.', ',')}
                    inputMode="decimal"
                    disabled={disabled}
                    aria-label={`${property.label}, расчётное значение`}
                    onBlur={event => updateCharacteristicValue(event, property.key, 'design', record?.design)}
                    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
                  /></label>
                </div>
                <input
                  key={`${passportCode}-${property.key}-source-${record?.source || ''}`}
                  className="characteristic-source"
                  defaultValue={record?.source || ''}
                  disabled={disabled}
                  placeholder="Источник: отчёт, таблица, пункт"
                  aria-label={`${property.label}, источник`}
                  onBlur={event => { if (event.target.value !== (record?.source || '')) onCharacteristicChange(passportCode, property.key, 'source', event.target.value) }}
                  onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
                />
              </div>
            })}
          </section>)}
        </section>}

        {selectedLayer && passportCode && <LabTests
          key={passportCode}
          code={passportCode}
          passport={igePassport}
          boreholes={boreholes}
          issues={labIssues}
          focusedTestId={focusedLabTestId}
          focusToken={labFocusToken}
          disabled={disabled}
          onAdd={onLabTestAdd}
          onDelete={onLabTestDelete}
          onTestChange={onLabTestChange}
          onValueChange={onLabTestValueChange}
          onImport={onLabImport}
          onTemplate={onLabTemplate}
        />}

        {column.excluded.length > 0 && <details className="excluded-details">
          <summary>Исключённые подписи <span>{column.excluded.length}</span></summary>
          {column.excluded.map((item, index) => <div className="excluded-item" key={`${item.handle}-${index}`}>
            <strong>{item.text}</strong><span>{item.reason}</span><code>handle {item.handle || '—'}</code>
          </div>)}
        </details>}

        <section className="column-review-section verification-section">
          <div className="verification-heading"><strong>Проверка скважины</strong><span className={column.isReviewed ? 'reviewed' : ''}>{column.isReviewed ? 'Подтверждена' : hasIssues ? 'Есть проблемы' : 'Готова к проверке'}</span></div>
          <p>{column.isReviewed ? `Подтверждено ${column.reviewedAt}. Любая последующая правка снимет этот статус.` : hasIssues ? 'Сначала решите все вопросы по имени, глубинам и кодам ИГЭ этой скважины.' : 'Подтвердите, что имя, глубины и коды ИГЭ проверены инженером.'}</p>
          <button type="button" className="button secondary" disabled={disabled || (hasIssues && !column.isReviewed)} onClick={onToggleReviewed}>
            {column.isReviewed ? <RotateCcw size={15} /> : <CheckCheck size={15} />}{column.isReviewed ? 'Повторить проверку' : 'Подтвердить проверку'}
          </button>
        </section>

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
