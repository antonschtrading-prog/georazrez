import { useMemo, useState } from 'react'
import { MapPin, Search, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SoilSwatch } from '@/components/SoilSwatch'
import type { CoreSoilLibraryItem } from '@/lib/geologyCore'
import type { CoreSoilAppearanceField } from '@/lib/coreCommands'
import { SOIL_HATCHES, SOIL_HATCH_LABELS } from '@/types/geology'

interface Props {
  open: boolean
  items: CoreSoilLibraryItem[]
  onOpenChange: (open: boolean) => void
  onAppearanceChange: (code: string, field: CoreSoilAppearanceField, value: string) => void
  onSelect: (item: CoreSoilLibraryItem) => void
}

export function SoilLibraryDialog({ open, items, onOpenChange, onAppearanceChange, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU')
  const filtered = useMemo(() => items.filter(item => !normalizedQuery || [
    item.code,
    item.key,
    item.passportName,
    item.variants.join(' '),
    SOIL_HATCH_LABELS[item.appearance.hatch]
  ].join(' ').toLocaleLowerCase('ru-RU').includes(normalizedQuery)), [items, normalizedQuery])
  const customized = items.filter(item => item.appearanceCustomized).length

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="soil-library-dialog">
      <DialogHeader>
        <DialogTitle>Библиотека грунтов</DialogTitle>
        <DialogDescription>Все непустые коды ИГЭ активного разреза. Цвет и штриховка выбираются вручную и применяются ко всем слоям с нормализованным кодом.</DialogDescription>
      </DialogHeader>
      <div className="soil-library-toolbar">
        <label className="soil-library-search" htmlFor="soil-library-search">
          <Search size={15} />
          <input id="soil-library-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Код, наименование или вариант ИГЭ" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Очистить поиск грунтов"><X size={14} /></button>}
        </label>
        <span>{filtered.length} / {items.length} кодов · оформлено вручную: {customized}</span>
      </div>
      <div className="soil-library-head" aria-hidden="true">
        <span>Образец</span><span>ИГЭ и состав</span><span>Цвет</span><span>Штриховка</span><span>Слой</span>
      </div>
      <div className="soil-library-list" role="list" aria-label="Грунты текущего разреза">
        {filtered.map(item => <div className="soil-library-row" role="listitem" data-soil-code={item.key} key={item.key}>
          <div className="soil-library-preview">
            <SoilSwatch appearance={item.appearance} />
            <small>{item.appearanceCustomized ? 'Выбрано инженером' : 'Нейтральный начальный вид'}</small>
          </div>
          <div className="soil-library-name">
            <strong>{item.code}</strong>
            <span>{item.passportName || 'Наименование не заполнено'}</span>
            <small>{item.layerCount} слоёв · {item.boreholeCount} скважин · проблем: {item.issueCount}</small>
            {item.variants.length > 1 && <small>Варианты: {item.variants.join(' / ')}</small>}
          </div>
          <label className="soil-color-control">
            <span className="sr-only">Цвет ИГЭ {item.code}</span>
            <input type="color" value={item.appearance.color} onChange={event => onAppearanceChange(item.key, 'color', event.target.value)} aria-label={`Цвет ИГЭ ${item.code}`} />
            <code>{item.appearance.color}</code>
          </label>
          <select className="soil-hatch-control" value={item.appearance.hatch} onChange={event => onAppearanceChange(item.key, 'hatch', event.target.value)} aria-label={`Штриховка ИГЭ ${item.code}`}>
            {SOIL_HATCHES.map(hatch => <option value={hatch} key={hatch}>{SOIL_HATCH_LABELS[hatch]}</option>)}
          </select>
          <button type="button" className="soil-layer-link" onClick={() => onSelect(item)} aria-label={`Показать слой ИГЭ ${item.code}`}><MapPin size={14} /> Показать</button>
        </div>)}
        {!filtered.length && <div className="issue-empty">По этому запросу грунтов нет.</div>}
      </div>
      <p className="soil-library-note">Оформление не изменяет глубины, коды, характеристики и исходный DXF. Начальный вид не является автоматическим обозначением по ГОСТ.</p>
    </DialogContent>
  </Dialog>
}
