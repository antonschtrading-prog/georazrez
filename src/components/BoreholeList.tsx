import { useMemo, useState } from 'react'
import { CheckCheck, Search, X } from 'lucide-react'
import { formatPk, type GeoIssue, type GeoProject } from '@/types/geology'
import type { CoreBoundaryModel } from '@/lib/geologyCore'

interface Props {
  project: GeoProject
  issues: GeoIssue[]
  boundaries: CoreBoundaryModel
  selectedId: string
  onSelect: (id: string) => void
  onReviewAll: () => void
}

type Filter = 'all' | 'issues' | 'controls' | 'reviewed'

export function BoreholeList({ project, issues, boundaries, selectedId, onSelect, onReviewAll }: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const boundaryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of boundaries.items) {
      if (item.status !== 'invalid') continue
      counts.set(item.leftBoreholeId, (counts.get(item.leftBoreholeId) || 0) + 1)
      counts.set(item.rightBoreholeId, (counts.get(item.rightBoreholeId) || 0) + 1)
    }
    return counts
  }, [boundaries])
  const problemIds = useMemo(() => new Set([
    ...issues.map(issue => issue.boreholeId),
    ...boundaryCounts.keys()
  ]), [issues, boundaryCounts])
  const reviewedCount = project.columns.filter(column => column.isReviewed && !column.isExcluded).length
  const activeCount = project.columns.filter(column => !column.isExcluded).length
  const filtered = project.columns.filter(column => {
    const matchesQuery = column.name.toLowerCase().includes(query.trim().toLowerCase()) || formatPk(column.pk).includes(query.trim())
    const matchesFilter = filter === 'all' || (filter === 'issues' && problemIds.has(column.id)) ||
      (filter === 'controls' && /км145|л-58|л-61/i.test(column.name)) ||
      (filter === 'reviewed' && column.isReviewed && !column.isExcluded)
    return matchesQuery && matchesFilter
  })

  return (
    <aside className="borehole-panel" aria-label="Список скважин">
      <div className="panel-heading">
        <div><span className="panel-kicker">ОБЪЕКТЫ</span><h2>Скважины <span>{project.columns.length}</span></h2></div>
      </div>
      <div className="search-field">
        <Search size={15} aria-hidden="true" />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Имя или ПК" aria-label="Поиск скважины" />
        {query && <button type="button" onClick={() => setQuery('')} aria-label="Очистить поиск"><X size={14} /></button>}
      </div>
      <div className="filter-tabs" role="tablist" aria-label="Фильтр скважин">
        <button type="button" role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Все</button>
        <button type="button" role="tab" aria-selected={filter === 'issues'} className={filter === 'issues' ? 'active' : ''} onClick={() => setFilter('issues')}>Проверка <span>{problemIds.size}</span></button>
        <button type="button" role="tab" aria-selected={filter === 'controls'} className={filter === 'controls' ? 'active' : ''} onClick={() => setFilter('controls')}>Контроль</button>
        <button type="button" role="tab" aria-selected={filter === 'reviewed'} className={filter === 'reviewed' ? 'active' : ''} onClick={() => setFilter('reviewed')}>Готово <span>{reviewedCount}</span></button>
      </div>
      <button
        type="button"
        className="button secondary bulk-review-button"
        onClick={onReviewAll}
        disabled={!activeCount || reviewedCount === activeCount}
        title="Подтвердить все активные скважины без нерешённых проблем. Проблемные будут пропущены; действие можно отменить."
      >
        <CheckCheck size={15} /> Подтвердить все скважины
      </button>
      <div className="borehole-list" role="list">
        {filtered.map(column => {
          const geologicalCount = issues.filter(issue => issue.boreholeId === column.id).length
          const boundaryCount = boundaryCounts.get(column.id) || 0
          const count = geologicalCount + boundaryCount
          return (
            <button
              type="button"
              role="listitem"
              key={column.id}
              className={`borehole-item ${selectedId === column.id ? 'selected' : ''} ${column.isExcluded ? 'excluded' : ''} ${column.isReviewed ? 'reviewed' : ''} ${column.kind === 'fictitious' ? 'fictitious' : ''}`}
              onClick={() => onSelect(column.id)}
              title={boundaryCount ? `${column.name}: некорректных границ корреляции — ${boundaryCount}` : undefined}
            >
              <span className={`borehole-status ${column.isExcluded ? 'excluded' : column.isReviewed ? 'reviewed' : count ? 'has-issues' : 'clear'}`} aria-hidden="true" />
              <span className="borehole-copy">
                <strong>{column.kind === 'fictitious' ? 'Ф · ' : ''}{column.name}</strong>
                <span>ПК {formatPk(column.pk)} · {column.layers.length} слоёв{column.kind === 'fictitious' ? ' · интерполяция' : ''}{boundaryCount ? ` · ошибок границ: ${boundaryCount}` : ''}</span>
              </span>
              <span className="borehole-index">{String(column.index).padStart(2, '0')}</span>
            </button>
          )
        })}
        {!filtered.length && <div className="empty-list">Ничего не найдено.<br />Измените запрос или фильтр.</div>}
      </div>
      <div className="panel-footnote"><span className="status-dot success" /> {reviewedCount} проверено <span className="footnote-divider">·</span> <span className="status-dot warning" /> {issues.length + boundaries.invalid} требуют решения</div>
    </aside>
  )
}
