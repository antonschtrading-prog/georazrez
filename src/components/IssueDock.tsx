import { useState } from 'react'
import { AlertCircle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, History, ListChecks } from 'lucide-react'
import type { ActivityItem, GeoIssue, IssueKind } from '@/types/geology'

interface Props {
  issues: GeoIssue[]
  activity: ActivityItem[]
  activeIssueId: string | null
  onSelect: (issue: GeoIssue) => void
  onStep: (direction: -1 | 1) => void
}

export function IssueDock({ issues, activity, activeIssueId, onSelect, onStep }: Props) {
  const [tab, setTab] = useState<'issues' | 'activity'>('issues')
  const [collapsed, setCollapsed] = useState(false)
  const [kind, setKind] = useState<'all' | IssueKind>('all')
  const filtered = issues.filter(issue => kind === 'all' || issue.kind === kind)
  const activeIndex = issues.findIndex(issue => issue.id === activeIssueId)

  return (
    <section className={`issue-dock ${collapsed ? 'collapsed' : ''}`} aria-label="Проверка проекта">
      <div className="issue-dock-header">
        <div className="dock-tabs" role="tablist" aria-label="Проверка и журнал">
          <button type="button" role="tab" aria-selected={tab === 'issues'} className={tab === 'issues' ? 'active' : ''} onClick={() => { setTab('issues'); setCollapsed(false) }}><ListChecks size={15} /> Проверка <span>{issues.length}</span></button>
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
              <option value="missing-name">Без имени</option>
            </select>
          </div>
        </>}
        <button type="button" className="dock-collapse" onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? 'Развернуть панель' : 'Свернуть панель'}>
          {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {!collapsed && <div className="issue-dock-body">
        {tab === 'issues' ? <div className="issue-table" role="list">
          {filtered.map(issue => <button type="button" role="listitem" className={`issue-row ${issue.id === activeIssueId ? 'active' : ''}`} key={issue.id} onClick={() => onSelect(issue)}>
            <span className={`issue-icon ${issue.kind}`}><AlertCircle size={15} /></span>
            <span className="issue-copy"><strong>{issue.title}</strong><span>{issue.detail}</span></span>
            <span className="issue-action">Показать</span>
          </button>)}
          {!filtered.length && <div className="issue-empty">В этой категории проблем нет.</div>}
        </div> : <div className="activity-list">
          {activity.map(item => <div className="activity-row" key={item.id}>
            <span className={`activity-marker ${item.type}`} />
            <div><strong>{item.text}</strong><span>{item.at}</span></div>
          </div>)}
        </div>}
      </div>}
    </section>
  )
}
