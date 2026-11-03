import { useState } from 'react'
import { AlertCircle, ChevronDown, ChevronUp, History, ListChecks } from 'lucide-react'
import type { ActivityItem, GeoIssue, IssueKind } from '@/types/geology'

interface Props {
  issues: GeoIssue[]
  activity: ActivityItem[]
  onSelect: (issue: GeoIssue) => void
}

export function IssueDock({ issues, activity, onSelect }: Props) {
  const [tab, setTab] = useState<'issues' | 'activity'>('issues')
  const [collapsed, setCollapsed] = useState(false)
  const [kind, setKind] = useState<'all' | IssueKind>('all')
  const filtered = issues.filter(issue => kind === 'all' || issue.kind === kind)

  return (
    <section className={`issue-dock ${collapsed ? 'collapsed' : ''}`} aria-label="Проверка проекта">
      <div className="issue-dock-header">
        <div className="dock-tabs" role="tablist" aria-label="Проверка и журнал">
          <button type="button" role="tab" aria-selected={tab === 'issues'} className={tab === 'issues' ? 'active' : ''} onClick={() => { setTab('issues'); setCollapsed(false) }}><ListChecks size={15} /> Проверка <span>{issues.length}</span></button>
          <button type="button" role="tab" aria-selected={tab === 'activity'} className={tab === 'activity' ? 'active' : ''} onClick={() => { setTab('activity'); setCollapsed(false) }}><History size={15} /> Журнал <span>{activity.length}</span></button>
        </div>
        {tab === 'issues' && !collapsed && <div className="issue-filter">
          <label htmlFor="issue-kind">Показать</label>
          <select id="issue-kind" value={kind} onChange={event => setKind(event.target.value as 'all' | IssueKind)}>
            <option value="all">Все проблемы</option>
            <option value="ambiguous-code">Неоднозначные ИГЭ</option>
            <option value="missing-code">ИГЭ не найден</option>
            <option value="missing-name">Без имени</option>
          </select>
        </div>}
        <button type="button" className="dock-collapse" onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? 'Развернуть панель' : 'Свернуть панель'}>
          {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {!collapsed && <div className="issue-dock-body">
        {tab === 'issues' ? <div className="issue-table" role="list">
          {filtered.map(issue => <button type="button" role="listitem" className="issue-row" key={issue.id} onClick={() => onSelect(issue)}>
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
