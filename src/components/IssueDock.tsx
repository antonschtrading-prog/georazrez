import { useState } from 'react'
import { AlertCircle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, History, Layers3, ListChecks } from 'lucide-react'
import type { ActivityItem, CodeSummaryItem, GeoIssue, IssueKind } from '@/types/geology'

interface Props {
  issues: GeoIssue[]
  activity: ActivityItem[]
  codeSummary: CodeSummaryItem[]
  activeIssueId: string | null
  activeCodeKey: string | null
  onSelect: (issue: GeoIssue) => void
  onSelectCode: (item: CodeSummaryItem) => void
  onStep: (direction: -1 | 1) => void
}

const formatDepth = (value: number) => value.toFixed(2).replace('.', ',')

export function IssueDock({ issues, activity, codeSummary, activeIssueId, activeCodeKey, onSelect, onSelectCode, onStep }: Props) {
  const [tab, setTab] = useState<'issues' | 'codes' | 'activity'>('issues')
  const [collapsed, setCollapsed] = useState(false)
  const [kind, setKind] = useState<'all' | IssueKind>('all')
  const filtered = issues.filter(issue => kind === 'all' || issue.kind === kind)
  const activeIndex = issues.findIndex(issue => issue.id === activeIssueId)

  return (
    <section className={`issue-dock ${collapsed ? 'collapsed' : ''}`} aria-label="Проверка проекта">
      <div className="issue-dock-header">
        <div className="dock-tabs" role="tablist" aria-label="Проверка, сводка ИГЭ и журнал">
          <button type="button" role="tab" aria-selected={tab === 'issues'} className={tab === 'issues' ? 'active' : ''} onClick={() => { setTab('issues'); setCollapsed(false) }}><ListChecks size={15} /> Проверка <span>{issues.length}</span></button>
          <button type="button" role="tab" aria-selected={tab === 'codes'} className={tab === 'codes' ? 'active' : ''} onClick={() => { setTab('codes'); setCollapsed(false) }}><Layers3 size={15} /> ИГЭ <span>{codeSummary.length}</span></button>
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
            <select id="issue-kind" value={kind} onChange={event => setKind(event.target.value as 'all' | IssueKind)}>
              <option value="all">Все проблемы</option>
              <option value="ambiguous-code">Неоднозначные ИГЭ</option>
              <option value="missing-code">ИГЭ не найден</option>
              <option value="invalid-depth">Некорректная глубина</option>
              <option value="depth-order">Порядок подошв</option>
              <option value="missing-name">Без имени</option>
            </select>
          </div>
        </>}
        <button type="button" className="dock-collapse" onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? 'Развернуть панель' : 'Свернуть панель'}>
          {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {!collapsed && <div className="issue-dock-body">
        {tab === 'issues' && <div className="issue-table" role="list">
          {filtered.map(issue => <button type="button" role="listitem" className={`issue-row ${issue.id === activeIssueId ? 'active' : ''}`} key={issue.id} onClick={() => onSelect(issue)}>
            <span className={`issue-icon ${issue.kind}`}><AlertCircle size={15} /></span>
            <span className="issue-copy"><strong>{issue.title}</strong><span>{issue.detail}</span></span>
            <span className="issue-action">Показать</span>
          </button>)}
          {!filtered.length && <div className="issue-empty">В этой категории проблем нет.</div>}
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
              <th>Испытания</th>
              <th>Лаб. контроль</th>
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
              <td>{item.labTestCount}</td>
              <td className={item.labIssueCount ? 'has-issues' : ''} title="Замечания полноты и целостности лабораторных данных">{item.labIssueCount}</td>
            </tr>)}</tbody>
          </table>
          {!codeSummary.length && <div className="issue-empty">В активных скважинах нет слоёв.</div>}
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
