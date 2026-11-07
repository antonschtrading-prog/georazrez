import { useMemo, useState } from 'react'
import { AlertTriangle, Check, MapPin } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { CoreHatchCheck, CoreHatchControl } from '@/lib/hatchControl'

interface Props {
  open: boolean
  control: CoreHatchControl
  codeOptions: Array<{ key: string; code: string }>
  onOpenChange: (open: boolean) => void
  onLegendChange: (signature: string, igeKey: string) => void
  onSelect: (check: CoreHatchCheck) => void
}

const STATUS_LABELS: Record<CoreHatchCheck['status'], string> = {
  match: 'Совпадение',
  mismatch: 'Несовпадение',
  unmapped: 'Нет легенды',
  'text-unresolved': 'Текстовый ИГЭ не решён'
}

export function HatchControlDialog({ open, control, codeOptions, onOpenChange, onLegendChange, onSelect }: Props) {
  const [tab, setTab] = useState<'legend' | 'checks'>('legend')
  const [filter, setFilter] = useState<'tasks' | 'all' | 'match'>('tasks')
  const checks = useMemo(() => control.checks.filter(check => filter === 'all' || filter === 'match' && check.status === 'match' || filter === 'tasks' && check.status !== 'match'), [control, filter])
  const codeByKey = useMemo(() => new Map(codeOptions.map(item => [item.key, item.code])), [codeOptions])

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="hatch-control-dialog">
      <DialogHeader>
        <DialogTitle>Двухпризнаковый контроль HATCH</DialogTitle>
        <DialogDescription>Замкнутые контуры DXF пересекаются с геологическими слоями. Инженер вручную задаёт связь параметров штриховки с ИГЭ; программа только сравнивает её с текстовым кодом.</DialogDescription>
      </DialogHeader>
      {!control.available ? <div className="hatch-empty">В исходном DXF нет HATCH для этого контроля. Прежняя проверка скважин и экспорт работают без изменений.</div> : <>
        <div className="hatch-summary" aria-label="Сводка контроля HATCH">
          <span><strong>{control.summary.sourceHatches}</strong> HATCH</span>
          <span><strong>{control.summary.associatedHatches}</strong> пересекают слои</span>
          <span className="hatch-ok"><strong>{control.summary.matches}</strong> совпадений</span>
          <span className={control.summary.mismatches ? 'hatch-bad' : ''}><strong>{control.summary.mismatches}</strong> несовпадений</span>
          <span><strong>{control.summary.tasks}</strong> задач</span>
        </div>
        <div className="hatch-tabs" role="group" aria-label="Раздел контроля HATCH">
          <button type="button" className={tab === 'legend' ? 'active' : ''} onClick={() => setTab('legend')} aria-pressed={tab === 'legend'}>Ручная легенда · {control.signatures.length}</button>
          <button type="button" className={tab === 'checks' ? 'active' : ''} onClick={() => setTab('checks')} aria-pressed={tab === 'checks'}>Результаты · {control.checks.length}</button>
        </div>
        {tab === 'legend' ? <div className="hatch-legend-list" role="list" aria-label="Легенда штриховок текущего профиля">
          <div className="hatch-legend-head" aria-hidden="true"><span>Слой DXF и параметры</span><span>ИГЭ по решению инженера</span></div>
          {control.signatures.map(item => <div className="hatch-legend-row" role="listitem" data-hatch-signature={item.signature} key={item.signature}>
            <div className="hatch-signature-name">
              <strong>{item.layer}</strong>
              <span>{item.pattern} · {item.solid ? 'сплошная заливка' : 'штриховка'} · угол {item.angle.toFixed(2).replace('.', ',')}° · масштаб {item.scale.toFixed(4).replace('.', ',')}{item.color ? ` · цвет ${item.color}` : ''}</span>
              <small>{item.hatchCount} объектов · {item.associatedCount} пересечений со слоями{!item.supported ? ' · есть неподдержанный контур' : ''}</small>
            </div>
            <select value={item.legend?.igeKey || ''} onChange={event => onLegendChange(item.signature, event.target.value)} aria-label={`ИГЭ для HATCH ${item.layer}, ${item.pattern}, масштаб ${item.scale}`}>
              <option value="">Не задано — требуется решение</option>
              {codeOptions.map(option => <option value={option.key} key={option.key}>{option.code}</option>)}
            </select>
          </div>)}
        </div> : <div className="hatch-checks-panel">
          <div className="hatch-checks-toolbar">
            <label>Показать <select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}>
              <option value="tasks">Только задачи</option><option value="match">Только совпадения</option><option value="all">Все сравнения</option>
            </select></label>
            <span>Без HATCH: {control.summary.withoutHatch} слоёв · вне слоёв: {control.orphans.length} · не разобрано: {control.unsupported.length}</span>
          </div>
          <div className="hatch-check-list" role="list" aria-label="Сравнения текстовых кодов и штриховок">
            {control.unsupported.map(item => <div className="hatch-check-row unsupported" role="listitem" key={`unsupported-${item.handle}`}>
              <span className="hatch-status"><AlertTriangle size={14} /> Контур не разобран</span>
              <div><strong>HATCH {item.handle}</strong><span>{item.issues.join('; ')}</span><small>Объект не используется как доказательство и не удаляется из DXF.</small></div>
            </div>)}
            {control.orphans.map(item => <div className="hatch-check-row orphan" role="listitem" key={`orphan-${item.handle}`}>
              <span className="hatch-status"><AlertTriangle size={14} /> Вне активных слоёв</span>
              <div><strong>HATCH {item.handle}</strong><span>{item.signature.split('|')[0]}</span><small>Замкнутый контур не пересёк активные геологические слои. Объект сохранён в исходной геометрии.</small></div>
            </div>)}
            {checks.map(check => <div className={`hatch-check-row ${check.status}`} role="listitem" data-hatch-check={check.id} key={check.id}>
              <span className="hatch-status">{check.status === 'match' ? <Check size={14} /> : <AlertTriangle size={14} />}{STATUS_LABELS[check.status]}</span>
              <div className="hatch-check-description">
                <strong>{check.boreholeName} · слой {check.layerOrdinal}</strong>
                <span>Текст: {check.textCode || `не решён (${check.textStatus})`} · HATCH: {check.hatchCode ? codeByKey.get(check.hatchCode) || check.hatchCode : 'легенда не задана'}</span>
                <small>{check.hatchLayer} · {check.pattern} · пересечение {(check.coverage * 100).toFixed(0)}% · {check.detail}</small>
              </div>
              <button type="button" className="soil-layer-link" onClick={() => onSelect(check)} aria-label={`Показать ${check.boreholeName}, слой ${check.layerOrdinal}`}><MapPin size={14} /> Показать</button>
            </div>)}
            {!checks.length && !control.unsupported.length && !control.orphans.length && <div className="issue-empty">В этом представлении задач нет.</div>}
          </div>
        </div>}
        <p className="soil-library-note">Совпадение — только подтверждающий признак. Контроль не назначает ИГЭ, не меняет глубины, исходный DXF и не подтверждает скважины автоматически.</p>
      </>}
    </DialogContent>
  </Dialog>
}
