import { useRef, useState, type FocusEvent } from 'react'
import { AlertTriangle, FileDown, FlaskConical, LoaderCircle, Plus, Trash2, Upload } from 'lucide-react'
import { getLabStatistics, SOIL_CHARACTERISTICS, type IgePassport, type LabDataIssue, type LabTestField, type SoilCharacteristicKey } from '@/types/geology'

interface BoreholeOption {
  id: string
  name: string
  layers: { id: string; ige: string; depth: number }[]
}

interface Props {
  code: string
  passport: IgePassport | null
  boreholes: BoreholeOption[]
  issues: LabDataIssue[]
  disabled: boolean
  onAdd: (code: string) => void
  onDelete: (code: string, testId: string) => void
  onTestChange: (code: string, testId: string, field: LabTestField, value: string | number | null) => void
  onValueChange: (code: string, testId: string, property: SoilCharacteristicKey, value: number | null) => void
  onImport: (code: string, file: File) => Promise<{ count: number; errors: string[] }>
  onTemplate: (code: string) => Promise<void>
}

const formatStatistic = (value: number | null) => value === null
  ? '—'
  : Number(value.toFixed(3)).toString().replace('.', ',')

export function LabTests({ code, passport, boreholes, issues, disabled, onAdd, onDelete, onTestChange, onValueChange, onImport, onTemplate }: Props) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [importMessage, setImportMessage] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const tests = passport?.labTests || []
  const statistics = getLabStatistics(passport)
  const affectedTestIds = new Set(issues.map(issue => issue.testId))
  const filledValues = tests.reduce((sum, test) => sum + SOIL_CHARACTERISTICS.filter(property => Number.isFinite(test.values[property.key])).length, 0)

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

  const importWorkbook = async (file: File) => {
    setBusy(true)
    setError('')
    setImportErrors([])
    setImportMessage('')
    try {
      const result = await onImport(code, file)
      if (result.errors.length) setImportErrors(result.errors)
      else setImportMessage(`Импортировано испытаний: ${result.count}. Принятые характеристики не изменены.`)
    } catch (reason) {
      setImportErrors([reason instanceof Error ? `Не удалось прочитать XLSX: ${reason.message}` : 'Не удалось прочитать XLSX-файл.'])
    } finally {
      setBusy(false)
    }
  }

  const createTemplate = async () => {
    setBusy(true)
    setImportErrors([])
    setImportMessage('')
    try { await onTemplate(code) }
    catch (reason) { setImportErrors([reason instanceof Error ? `Не удалось создать шаблон: ${reason.message}` : 'Не удалось создать шаблон XLSX.']) }
    finally { setBusy(false) }
  }

  return <section className="lab-section" aria-label={`Лабораторные испытания ИГЭ ${code}`}>
    <div className="passport-heading">
      <div><span className="panel-kicker">ЛАБОРАТОРИЯ</span><h3>Испытания ИГЭ {code}</h3></div>
      <span>{tests.length} образцов</span>
    </div>
    <p>Каждая строка — отдельный образец. Статистика используется как справка и не меняет принятые характеристики автоматически.</p>
    <div className={`lab-quality ${issues.length ? 'has-issues' : 'clear'}`}>
      <div><strong>{tests.length - affectedTestIds.size} / {tests.length}</strong><span>образцов без замечаний</span></div>
      <div><strong>{filledValues} / {tests.length * SOIL_CHARACTERISTICS.length}</strong><span>значений заполнено</span></div>
      <div><strong>{issues.length}</strong><span>замечаний контроля</span></div>
    </div>
    <p className="lab-quality-note">Контроль проверяет полноту, ссылки и диапазон глубины. Достоверность физических значений оценивает инженер.</p>
    <button type="button" className="button secondary lab-add-button" disabled={disabled || busy} onClick={() => { setError(''); setImportErrors([]); setImportMessage(''); onAdd(code) }}>
      <Plus size={14} /> Добавить испытание
    </button>
    <div className="lab-file-actions">
      <button type="button" className="button secondary" disabled={disabled || busy} onClick={createTemplate}><FileDown size={13} /> Шаблон XLSX</button>
      <button type="button" className="button secondary" disabled={disabled || busy} onClick={() => fileInput.current?.click()}>{busy ? <LoaderCircle size={13} className="spin" /> : <Upload size={13} />} Импорт XLSX</button>
    </div>
    <input ref={fileInput} type="file" accept=".xlsx" hidden onChange={event => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (file) void importWorkbook(file)
    }} />
    <p className="lab-import-note">Импорт добавляет образцы только к ИГЭ {code}. Файл принимается целиком: при ошибках новые строки не записываются.</p>
    {error && <div className="import-error characteristic-error" role="alert">{error}</div>}
    {importErrors.length > 0 && <div className="lab-import-report" role="alert"><strong>Импорт не выполнен</strong><ol>{importErrors.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ol></div>}
    {importMessage && <div className="lab-import-success" role="status">{importMessage}</div>}

    <div className="lab-test-list">
      {tests.map((test, testIndex) => {
        const valueCount = SOIL_CHARACTERISTICS.filter(property => Number.isFinite(test.values[property.key])).length
        const testName = test.sample.trim() || `Испытание ${testIndex + 1}`
        const testIssues = issues.filter(issue => issue.testId === test.id)
        const linkedBorehole = boreholes.find(borehole => borehole.id === test.boreholeId)
        const linkedLayerExists = linkedBorehole?.layers.some(layer => layer.id === test.layerId)
        return <article className={`lab-test ${testIssues.length ? 'has-issues' : ''}`} key={test.id}>
          <div className="lab-test-heading">
            <strong>{testName}</strong>
            <button type="button" disabled={disabled} onClick={() => onDelete(code, test.id)} aria-label={`Удалить ${testName}`} title="Удалить испытание; действие можно отменить"><Trash2 size={13} /></button>
          </div>
          {testIssues.length > 0 && <div className="lab-test-issues" aria-label={`Замечания: ${testName}`}>
            {testIssues.map(issue => <div className="lab-test-issue" key={issue.id} title={issue.detail}><AlertTriangle size={12} /><span>{issue.title}</span></div>)}
          </div>}
          <div className="lab-test-meta">
            <label><span>Номер образца</span><input
              key={`${test.id}-sample-${test.sample}`}
              defaultValue={test.sample}
              disabled={disabled}
              aria-label={`${testName}, номер образца`}
              onBlur={event => { if (event.target.value !== test.sample) onTestChange(code, test.id, 'sample', event.target.value) }}
            /></label>
            <label><span>Глубина, м</span><input
              key={`${test.id}-depth-${test.depth ?? 'empty'}`}
              defaultValue={String(test.depth ?? '').replace('.', ',')}
              inputMode="decimal"
              disabled={disabled}
              aria-label={`${testName}, глубина`}
              onBlur={event => updateNumber(event, test.depth, value => onTestChange(code, test.id, 'depth', value))}
              onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
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
            <label><span>Конкретный слой</span><select
              value={test.layerId || ''}
              disabled={disabled || !test.boreholeId}
              aria-label={`${testName}, слой`}
              title="Привязка выбирается вручную и не вычисляется по глубине"
              onChange={event => onTestChange(code, test.id, 'layerId', event.target.value)}
            >
              <option value="">Не привязан к слою</option>
              {test.layerId && !linkedLayerExists && <option value={test.layerId}>Слой не найден — требуется выбор</option>}
              {linkedBorehole?.layers.map((layer, layerIndex) => <option value={layer.id} key={layer.id}>
                Слой {layerIndex + 1} · {layer.ige || '—'} · подошва {layer.depth.toFixed(2).replace('.', ',')} м
              </option>)}
            </select></label>
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
