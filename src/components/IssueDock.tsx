import { useState } from 'react'
import { AlertCircle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, History, Layers3, ListChecks, Spline } from 'lucide-react'
import type { ActivityItem, CodeSummaryItem, GapDecision } from '@/types/geology'
import type { CoreBoundaryItem, CoreBoundaryModel, CoreReviewItem, CoreReviewKind } from '@/lib/geologyCore'

interface Props {
  issues: CoreReviewItem[]
  activity: ActivityItem[]
  codeSummary: CodeSummaryItem[]
  boundaries: CoreBoundaryModel
  activeIssueId: string | null
  activeCodeKey: string | null
  activeLayerId: string | null
  onSelect: (issue: CoreReviewItem) => void
  onSelectCode: (item: CodeSummaryItem) => void
  onSelectBoundary: (item: CoreBoundaryItem) => void
  onCorrelateBoundary: (item: CoreBoundaryItem) => void
  onEditCorrelation: (item: CoreBoundaryItem) => void
  onRemoveCorrelation: (correlationId: string) => void
  onDecideGap: (item: CoreBoundaryItem) => void
  onEditInactiveGapDecision: (decision: GapDecision) => void
  onRemoveGapDecision: (decisionId: string) => void
  onStep: (direction: -1 | 1) => void
}

const formatDepth = (value: number) => value.toFixed(2).replace('.', ',')

const boundaryStatus = (item: CoreBoundaryItem) => {
  if (item.status === 'invalid') {
    const crossing = item.issues.some(issue => issue.kind === 'crossing')
    return `${item.manualCorrelation ? 'Ручная связь · ' : ''}${crossing ? 'Пересечение границ' : 'Некорректная граница'}`
  }
  if (item.manualCorrelation) return 'Соединена вручную'
  if (item.status === 'connected') return 'Соединена'
  if (item.gapDecisionKind === 'accepted') return 'Разрыв принят'
  if (item.gapDecisionKind === 'pinchout') return `Выклинивание · ${((item.pinchoutFraction || 0) * 100).toFixed(1).replace('.', ',')}%`
  return item.status === 'left-only' ? 'Нет подошвы справа' : 'Нет подошвы слева'
}

export function IssueDock({ issues, activity, codeSummary, boundaries, activeIssueId, activeCodeKey, activeLayerId, onSelect, onSelectCode, onSelectBoundary, onCorrelateBoundary, onEditCorrelation, onRemoveCorrelation, onDecideGap, onEditInactiveGapDecision, onRemoveGapDecision, onStep }: Props) {
  const [tab, setTab] = useState<'issues' | 'codes' | 'boundaries' | 'activity'>('issues')
  const [collapsed, setCollapsed] = useState(false)
  const [kind, setKind] = useState<'all' | CoreReviewKind>('all')
  const [boundaryFilter, setBoundaryFilter] = useState<'gaps' | 'open' | 'decided' | 'all' | 'connected' | 'invalid'>('gaps')
  const filtered = issues.filter(issue => kind === 'all' || issue.kind === kind)
  const filteredBoundaries = boundaries.items.filter(item => boundaryFilter === 'all'
    || boundaryFilter === 'gaps' && (item.status === 'left-only' || item.status === 'right-only' || Boolean(item.gapDecisionId))
    || boundaryFilter === 'open' && (item.status === 'left-only' || item.status === 'right-only') && !item.gapDecisionId
    || boundaryFilter === 'decided' && Boolean(item.gapDecisionId)
    || boundaryFilter === 'connected' && item.status === 'connected'
    || boundaryFilter === 'invalid' && item.status === 'invalid')
  const activeIndex = issues.findIndex(issue => issue.id === activeIssueId)

  return (
    <section className={`issue-dock ${collapsed ? 'collapsed' : ''}`} aria-label="Проверка проекта">
      <div className="issue-dock-header">
        <div className="dock-tabs" role="tablist" aria-label="Проверка, сводка ИГЭ, корреляция границ и журнал">
          <button type="button" role="tab" aria-selected={tab === 'issues'} className={tab === 'issues' ? 'active' : ''} onClick={() => { setTab('issues'); setCollapsed(false) }}><ListChecks size={15} /> Проверка <span>{issues.length}</span></button>
          <button type="button" role="tab" aria-selected={tab === 'codes'} className={tab === 'codes' ? 'active' : ''} onClick={() => { setTab('codes'); setCollapsed(false) }}><Layers3 size={15} /> ИГЭ <span>{codeSummary.length}</span></button>
          <button type="button" role="tab" aria-selected={tab === 'boundaries'} className={tab === 'boundaries' ? 'active' : ''} onClick={() => { setTab('boundaries'); setCollapsed(false) }}><Spline size={15} /> Границы <span>{boundaries.gaps + boundaries.invalid}</span></button>
          <button type="button" role="tab" aria-selected={tab === 'activity'} className={tab === 'activity' ? 'active' : ''} onClick={() => { setTab('activity'); setCollapsed(false) }}><History size={15} /> Журнал <span>{activity.length}</span></button>
        </div>
        {tab === 'issues' && !collapsed && <>
          <div className="issue-review-nav" aria-label="Переход между проблемами">
            <button type="button" onClick={() => onStep(-1)} disabled={!issues.length} aria-label="Предыдущая проблема" title="Предыдущая проблема"><ChevronLeft size={14} /></button>
            <span>{activeIndex >= 0 ? activeIndex + 1 : '—'} / {issues.length}</span>
            <button type="button" onClick={() => onStep(1)} disabled={!issues.length} aria-label="Следующая проблема" title="Следующая проблема"><ChevronRight size={14} /></button>
          </div>
          <div className="issue-filter">
            <label htmlFor="issue-kind">Показать</label>
            <select id="issue-kind" value={kind} onChange={event => setKind(event.target.value as typeof kind)}>
              <option value="all">Все проблемы</option>
              <option value="invalid-boundary">Некорректные границы</option>
              <option value="fictitious-outdated">Источники интерполяции изменились</option>
              <option value="fictitious-invalid">Недействительные правила интерполяции</option>
              <option value="ambiguous-code">Неоднозначные ИГЭ</option>
              <option value="missing-code">ИГЭ не найден</option>
              <option value="invalid-depth">Некорректная глубина</option>
              <option value="depth-order">Порядок подошв</option>
              <option value="missing-name">Без имени</option>
            </select>
          </div>
        </>}
        {tab === 'boundaries' && !collapsed && <div className="boundary-filter">
          <label htmlFor="boundary-kind">Показать</label>
          <select id="boundary-kind" value={boundaryFilter} onChange={event => setBoundaryFilter(event.target.value as typeof boundaryFilter)}>
            <option value="gaps">Все разрывы и решения</option>
            <option value="open">Открытые разрывы</option>
            <option value="decided">Принятые решения</option>
            <option value="all">Все границы</option>
            <option value="connected">Соединённые</option>
            <option value="invalid">Некорректные</option>
          </select>
        </div>}
        <button type="button" className="dock-collapse" onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? 'Развернуть панель' : 'Свернуть панель'}>
          {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {!collapsed && <div className="issue-dock-body">
        {tab === 'issues' && <div className="issue-review-content">
          <div className="section-review-summary" aria-label="Сводка единой проверки сечения">
            <span><strong>{issues.filter(item => item.source === 'geology').length}</strong> геология</span>
            <span><strong>{issues.filter(item => item.source === 'boundary').length}</strong> границы</span>
            <span><strong>{issues.filter(item => item.source === 'interpolation').length}</strong> интерполяция</span>
            <small>{boundaries.openGaps} открытых разрывов · не ошибки</small>
          </div>
          <div className="issue-table" role="list">
          {filtered.map(issue => <button type="button" role="listitem" className={`issue-row ${issue.id === activeIssueId ? 'active' : ''}`} key={issue.id} onClick={() => onSelect(issue)}>
            <span className={`issue-icon ${issue.kind}`}><AlertCircle size={15} /></span>
            <span className="issue-copy"><strong>{issue.title}</strong><span>{issue.detail}</span></span>
            <span className="issue-action">Показать</span>
          </button>)}
          {!filtered.length && <div className="issue-empty">В этой категории проблем нет.</div>}
          </div>
        </div>}
        {tab === 'codes' && <div className="code-summary-scroll">
          <table className="code-summary-table">
            <thead><tr>
              <th>Код ИГЭ</th>
              <th>Слоёв</th>
              <th>Скважин</th>
              <th>Глубины, м</th>
              <th>Мощность, м · min–max / Ø</th>
              <th>Вручную</th>
              <th>Проблемы</th>
              <th>Характеристики</th>
            </tr></thead>
            <tbody>{codeSummary.map(item => <tr key={item.key} className={item.key === activeCodeKey ? 'active' : ''}>
              <td>
                <button type="button" className="code-summary-link" onClick={() => onSelectCode(item)} title="Перейти к слою этой группы" aria-label={`Перейти к слою с ИГЭ ${item.code}`}>
                  <strong>{item.code}</strong>
                  {(item.passportName || item.variants.length > 1) && <span>{[item.passportName, item.variants.length > 1 ? `Варианты: ${item.variants.join(' / ')}` : ''].filter(Boolean).join(' · ')}</span>}
                </button>
              </td>
              <td>{item.layerCount}</td>
              <td>{item.boreholeCount}</td>
              <td>{formatDepth(item.minDepth)}–{formatDepth(item.maxDepth)}</td>
              <td>{formatDepth(item.minThickness)}–{formatDepth(item.maxThickness)} · Ø {formatDepth(item.averageThickness)}</td>
              <td>{item.manualCount}</td>
              <td className={item.issueCount ? 'has-issues' : ''}>{item.issueCount}</td>
              <td title="Заполнено нормативных и расчётных значений">{item.characteristicFilled} / {item.characteristicTotal}</td>
            </tr>)}</tbody>
          </table>
          {!codeSummary.length && <div className="issue-empty">В активных скважинах нет слоёв.</div>}
        </div>}
        {tab === 'boundaries' && <div className="boundary-list" role="list">
          <div className="boundary-summary">
            <span><strong>{boundaries.connected}</strong> соединено</span>
            <span><strong>{boundaries.openGaps}</strong> открытых</span>
            <span><strong>{boundaries.decidedGaps}</strong> решений</span>
            <span><strong>{boundaries.invalid}</strong> некорректных</span>
            <small>Разрыв принимается или выклинивание задаётся только явным решением</small>
          </div>
          {boundaries.inactiveGapDecisions.length > 0 && <div className="inactive-gap-decisions">
            <strong>Неактивные решения по разрывам</strong>
            <p>Текущая корреляция изменилась. Решения сохранены, но не создают геометрию и не удаляются автоматически.</p>
            {boundaries.inactiveGapDecisions.map(({ decision, description }) => <div className="inactive-gap-row" key={decision.id}>
              <span><strong>{description}</strong><small>{decision.kind === 'accepted' ? 'Принятый разрыв' : `Выклинивание · ${((decision.fraction || 0) * 100).toFixed(1).replace('.', ',')}%`} · {decision.id}</small></span>
              <div className="boundary-actions">
                <button type="button" className="boundary-action" onClick={() => onEditInactiveGapDecision(decision)}>Изменить</button>
                <button type="button" className="boundary-action" onClick={() => onRemoveGapDecision(decision.id)}>Удалить</button>
              </div>
            </div>)}
          </div>}
          {filteredBoundaries.map(item => {
            const leftValue = item.leftDepth !== null ? `${formatDepth(item.leftDepth)} м${item.leftCode ? ` · ${item.leftCode}` : ''}` : '—'
            const rightValue = item.rightDepth !== null ? `${formatDepth(item.rightDepth)} м${item.rightCode ? ` · ${item.rightCode}` : ''}` : '—'
            const active = item.leftLayerId === activeLayerId || item.rightLayerId === activeLayerId
            const isGap = item.status === 'left-only' || item.status === 'right-only'
            const issueText = item.issues.map(issue => issue.detail).join('; ')
            return <div role="listitem" key={item.id} data-boundary-row={item.id} title={[item.correlationNote, item.gapDecisionNote, issueText].filter(Boolean).join(' · ') || undefined} className={`boundary-row ${item.status} ${item.manualCorrelation ? 'manual-correlation' : ''} ${item.gapDecisionId ? 'gap-decided' : ''} ${active ? 'active' : ''}`}>
              <button type="button" className="boundary-select" onClick={() => onSelectBoundary(item)} aria-label={`Показать границу ${item.ordinal} между ${item.leftBoreholeName} и ${item.rightBoreholeName}`}>
                <span className="boundary-ordinal">{item.manualCorrelation ? `${item.leftOrdinal}↔${item.rightOrdinal}` : item.ordinal}</span>
                <span className="boundary-copy"><strong>{item.leftBoreholeName} → {item.rightBoreholeName}</strong><span>{leftValue} → {rightValue}</span>{issueText && <span className="boundary-issues">{issueText}</span>}</span>
                <span className="boundary-status">{boundaryStatus(item)}</span>
              </button>
              {item.manualCorrelation && item.correlationId
                ? <div className="boundary-actions">
                  <button type="button" className="boundary-action boundary-edit" onClick={() => onEditCorrelation(item)}>Обоснование</button>
                  <button type="button" className="boundary-action" onClick={() => onRemoveCorrelation(item.correlationId!)}>Снять связь</button>
                </div>
                : item.gapDecisionId ? <div className="boundary-actions">
                  <button type="button" className="boundary-action gap-decision-edit" onClick={() => onDecideGap(item)}>Изменить</button>
                  <button type="button" className="boundary-action" onClick={() => onRemoveGapDecision(item.gapDecisionId!)}>Удалить</button>
                </div>
                  : isGap ? <div className="boundary-actions">
                    <button type="button" className="boundary-action gap-decision-add" onClick={() => onDecideGap(item)}>Решение</button>
                    <button type="button" className="boundary-action" onClick={() => onCorrelateBoundary(item)}>Связать</button>
                  </div> : null}
            </div>
          })}
          {!filteredBoundaries.length && <div className="issue-empty">В этой категории границ нет.</div>}
        </div>}
        {tab === 'activity' && <div className="activity-list">
          {activity.map(item => <div className="activity-row" key={item.id}>
            <span className={`activity-marker ${item.type}`} />
            <div><strong>{item.text}</strong><span>{item.at}</span></div>
          </div>)}
        </div>}
      </div>}
    </section>
  )
}
