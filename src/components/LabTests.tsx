import { useState, type FocusEvent } from 'react'
import { FlaskConical, Plus, Trash2 } from 'lucide-react'
import { getLabStatistics, SOIL_CHARACTERISTICS, type IgePassport, type LabTestField, type SoilCharacteristicKey } from '@/types/geology'

interface BoreholeOption {
  id: string
  name: string
}

interface Props {
  code: string
  passport: IgePassport | null
  boreholes: BoreholeOption[]
  disabled: boolean
  onAdd: (code: string) => void
  onDelete: (code: string, testId: string) => void
  onTestChange: (code: string, testId: string, field: LabTestField, value: string | number | null) => void
  onValueChange: (code: string, testId: string, property: SoilCharacteristicKey, value: number | null) => void
}

const formatStatistic = (value: number | null) => value === null
  ? '—'
  : Number(value.toFixed(3)).toString().replace('.', ',')

export function LabTests({ code, passport, boreholes, disabled, onAdd, onDelete, onTestChange, onValueChange }: Props) {
  const [error, setError] = useState('')
  const tests = passport?.labTests || []
  const statistics = getLabStatistics(passport)

  const updateNumber = (
    event: FocusEvent<HTMLInputElement>,
    previous: number | null | undefined,
    update: (value: number | null) => void
  ) => {
    const raw = event.target.value.trim()
    const previousValue = previous ?? null
    if (!raw) {
      setError('')
      if (previousValue !== null) update(null)
      return
    }
    const parsed = Number(raw.replace(',', '.'))
    if (!Number.isFinite(parsed)) {
      setError('Числовые поля испытания должны содержать конечное число. Пустое поле означает отсутствие данных.')
      event.target.value = String(previousValue ?? '').replace('.', ',')
      return
    }
    setError('')
    if (parsed !== previousValue) update(parsed)
  }

  return <section className="lab-section" aria-label={`Лабораторные испытания ИГЭ ${code}`}>
    <div className="passport-heading">
      <div><span className="panel-kicker">ЛАБОРАТОРИЯ</span><h3>Испытания ИГЭ {code}</h3></div>
      <span>{tests.length} образцов</span>
    </div>
    <p>Каждая строка — отдельный образец. Статистика используется как справка и не меняет принятые характеристики автоматически.</p>
    <button type="button" className="button secondary lab-add-button" disabled={disabled} onClick={() => { setError(''); onAdd(code) }}>
      <Plus size={14} /> Добавить испытание
    </button>
    {error && <div className="import-error characteristic-error" role="alert">{error}</div>}

    <div className="lab-test-list">
      {tests.map((test, testIndex) => {
        const valueCount = SOIL_CHARACTERISTICS.filter(property => Number.isFinite(test.values[property.key])).length
        const testName = test.sample.trim() || `Испытание ${testIndex + 1}`
        return <article className="lab-test" key={test.id}>
          <div className="lab-test-heading">
            <strong>{testName}</strong>
            <button type="button" disabled={disabled} onClick={() => onDelete(code, test.id)} aria-label={`Удалить ${testName}`} title="Удалить испытание; действие можно отменить"><Trash2 size={13} /></button>
          </div>
          <div className="lab-test-meta">
            <label><span>Номер образца</span><input
              key={`${test.id}-sample-${test.sample}`}
              defaultValue={test.sample}
              disabled={disabled}
              aria-label={`${testName}, номер образца`}
              onBlur={event => { if (event.target.value !== test.sample) onTestChange(code, test.id, 'sample', event.target.value) }}
            /></label>
            <label><span>Скважина</span><select
              value={test.boreholeId}
              disabled={disabled}
              aria-label={`${testName}, скважина`}
              onChange={event => onTestChange(code, test.id, 'boreholeId', event.target.value)}
            >
              <option value="">Не указана</option>
              {boreholes.map(borehole => <option value={borehole.id} key={borehole.id}>{borehole.name}</option>)}
            </select></label>
            <label><span>Глубина, м</span><input
              key={`${test.id}-depth-${test.depth ?? 'empty'}`}
              defaultValue={String(test.depth ?? '').replace('.', ',')}
              inputMode="decimal"
              disabled={disabled}
              aria-label={`${testName}, глубина`}
              onBlur={event => updateNumber(event, test.depth, value => onTestChange(code, test.id, 'depth', value))}
              onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
            /></label>
          </div>
          <label className="lab-source"><span>Отчёт / протокол</span><input
            key={`${test.id}-source-${test.source}`}
            defaultValue={test.source}
            disabled={disabled}
            placeholder="Источник результата"
            aria-label={`${testName}, источник`}
            onBlur={event => { if (event.target.value !== test.source) onTestChange(code, test.id, 'source', event.target.value) }}
          /></label>
          <details className="lab-values">
            <summary>Значения характеристик <span>{valueCount} / {SOIL_CHARACTERISTICS.length}</span></summary>
            <div className="lab-value-grid">
              {SOIL_CHARACTERISTICS.map(property => <label key={property.key}>
                <span>{property.label}{property.unit !== '—' ? `, ${property.unit}` : ''}</span>
                <input
                  key={`${test.id}-${property.key}-${test.values[property.key] ?? 'empty'}`}
                  defaultValue={String(test.values[property.key] ?? '').replace('.', ',')}
                  inputMode="decimal"
                  disabled={disabled}
                  aria-label={`${testName}, ${property.label}`}
                      onBlur={event => updateNumber(event, test.values[property.key], value => onValueChange(code, test.id, property.key, value))}
                  onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
                />
              </label>)}
            </div>
          </details>
        </article>
      })}
      {!tests.length && <div className="lab-empty">Испытания не добавлены. Принятые характеристики можно заполнять независимо от этого раздела.</div>}
    </div>

    <div className="lab-statistics">
      <div className="lab-statistics-heading"><FlaskConical size={14} /><h4>Статистика по испытаниям</h4></div>
      <div className="lab-stats-header"><span>Показатель</span><span>n</span><span>min–max</span><span>Среднее</span></div>
      {statistics.map(statistic => {
        const property = SOIL_CHARACTERISTICS.find(item => item.key === statistic.key)!
        return <div className="lab-stats-row" key={statistic.key}>
          <span title={`${property.label}, ${property.unit}`}>{property.label}</span>
          <span>{statistic.count}</span>
          <span>{statistic.count ? `${formatStatistic(statistic.min)}–${formatStatistic(statistic.max)}` : '—'}</span>
          <strong>{formatStatistic(statistic.mean)}</strong>
        </div>
      })}
    </div>
  </section>
}
