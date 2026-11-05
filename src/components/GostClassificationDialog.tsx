import { useMemo, useState } from 'react'
import { BookOpen, Check, CircleAlert, ClipboardCheck, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  GOST_25100_RULES,
  GOST_INDICATOR_LABELS,
  classifyGost25100,
  getGostRule,
  type GostFamily,
  type GostIndicatorKey,
  type GostRule
} from '@/lib/gost25100'

interface GostClassificationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type FormValues = Record<GostIndicatorKey, string>

const EMPTY_FORM: FormValues = {
  particlesGt2: '',
  particlesGt05: '',
  particlesGt025: '',
  particlesGt01: '',
  voidRatio: '',
  saturationDegree: '',
  plasticityIndex: '',
  sandFraction: '',
  liquidityIndex: ''
}

const FAMILY_OPTIONS: { value: GostFamily; label: string }[] = [
  { value: 'sand', label: 'Песок' },
  { value: 'cohesive', label: 'Глинистый грунт' },
  { value: 'other', label: 'Другой класс' }
]

function MetricField({
  id,
  label,
  unit,
  hint,
  value,
  invalid,
  needed,
  onChange
}: {
  id: GostIndicatorKey
  label: string
  unit: string
  hint?: string
  value: string
  invalid: boolean
  needed: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="gost-metric-field">
      <label htmlFor={`gost-${id}`}>
        <span>{label}</span>
        {needed && <em>нужен для продолжения</em>}
      </label>
      <div className="gost-metric-input">
        <Input
          id={`gost-${id}`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          aria-invalid={invalid}
          onChange={event => onChange(event.target.value)}
        />
        <span>{unit}</span>
      </div>
      {hint && <small>{hint}</small>}
    </div>
  )
}

function RuleSource({ rule }: { rule: GostRule }) {
  return (
    <span className="gost-source">
      {rule.source.standard} · таблица {rule.source.table} · строка «{rule.source.row}» · PDF, с. {rule.source.pdfPage}
    </span>
  )
}

export function GostClassificationDialog({ open, onOpenChange }: GostClassificationDialogProps) {
  const [view, setView] = useState<'assistant' | 'reference'>('assistant')
  const [family, setFamily] = useState<GostFamily>('sand')
  const [form, setForm] = useState<FormValues>(EMPTY_FORM)
  const [referenceGroup, setReferenceGroup] = useState<'all' | GostRule['group']>('all')
  const [referenceQuery, setReferenceQuery] = useState('')
  const [acknowledgedSignature, setAcknowledgedSignature] = useState<string | null>(null)
  const [confirmedSignature, setConfirmedSignature] = useState<string | null>(null)

  const values = useMemo(() => {
    const parsed: Partial<Record<GostIndicatorKey, number>> = {}
    for (const key of Object.keys(form) as GostIndicatorKey[]) {
      const raw = form[key].trim()
      if (!raw) continue
      parsed[key] = Number(raw.replace(/\s/g, '').replace('−', '-').replace(',', '.'))
    }
    return parsed
  }, [form])

  const calculation = useMemo(() => ({ family, values }), [family, values])
  const result = useMemo(() => classifyGost25100(calculation), [calculation])
  const signature = useMemo(() => JSON.stringify(calculation), [calculation])
  const acknowledged = acknowledgedSignature === signature
  const confirmed = confirmedSignature === signature && result.status === 'classified'

  const filteredRules = useMemo(() => {
    const query = referenceQuery.trim().toLocaleLowerCase('ru-RU')
    return GOST_25100_RULES.filter(rule => {
      if (referenceGroup !== 'all' && rule.group !== referenceGroup) return false
      if (!query) return true
      return [rule.result, ...rule.indicators, ...rule.conditions, rule.source.table, rule.source.row]
        .join(' ')
        .toLocaleLowerCase('ru-RU')
        .includes(query)
    })
  }, [referenceGroup, referenceQuery])

  const updateField = (key: GostIndicatorKey, value: string) => {
    setForm(previous => ({ ...previous, [key]: value }))
  }

  const fieldProps = (key: GostIndicatorKey) => ({
    id: key,
    value: form[key],
    invalid: result.issues.some(issue => issue.indicator === key && issue.code !== 'outside-table'),
    needed: result.missing.includes(key) || result.optionalMissing.includes(key),
    onChange: (value: string) => updateField(key, value)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gost-dialog">
        <DialogHeader>
          <DialogTitle>Классификация по ГОСТ 25100-2020</DialogTitle>
          <DialogDescription>
            Ручной расчёт с обоснованием. Не изменяет скважины, разрез, паспорта ИГЭ и подтверждения проверки.
          </DialogDescription>
        </DialogHeader>

        <div className="gost-standard-meta">
          <span>С поправкой · ИУС № 7, 2023</span>
          <span>Пески и глинистые грунты · {GOST_25100_RULES.length} правил</span>
        </div>

        <div className="gost-view-switch" role="tablist" aria-label="Разделы ГОСТ-помощника">
          <button type="button" role="tab" aria-selected={view === 'assistant'} onClick={() => setView('assistant')}>
            <ClipboardCheck size={15} /> Классификация
          </button>
          <button type="button" role="tab" aria-selected={view === 'reference'} onClick={() => setView('reference')}>
            <BookOpen size={15} /> Справочник правил
          </button>
        </div>

        <div className="gost-dialog-body">
          {view === 'assistant' ? (
            <div className="gost-assistant-layout" data-testid="gost-assistant">
              <section className="gost-input-panel" aria-label="Исходные показатели">
                <div className="gost-section-heading">
                  <span>01</span>
                  <div>
                    <h3>Исходные показатели</h3>
                    <p>Выберите класс самостоятельно — по коду ИГЭ программа не догадывается.</p>
                  </div>
                </div>

                <div className="gost-family-switch" aria-label="Класс грунта">
                  {FAMILY_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={family === option.value}
                      onClick={() => setFamily(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {family === 'sand' && (
                  <>
                    <fieldset className="gost-fieldset">
                      <legend>Гранулометрический состав</legend>
                      <p className="gost-fieldset-note">Накопительное содержание частиц крупнее указанного размера. Допустимы запятые в числах.</p>
                      <MetricField {...fieldProps('particlesGt2')} label="Частицы > 2 мм" unit="%" />
                      <MetricField {...fieldProps('particlesGt05')} label="Частицы > 0,50 мм" unit="%" />
                      <MetricField {...fieldProps('particlesGt025')} label="Частицы > 0,25 мм" unit="%" />
                      <MetricField {...fieldProps('particlesGt01')} label="Частицы > 0,10 мм" unit="%" />
                    </fieldset>
                    <fieldset className="gost-fieldset">
                      <legend>Дополнительные разновидности <span>необязательно</span></legend>
                      <MetricField {...fieldProps('voidRatio')} label="Коэффициент пористости e" unit="д.е." hint="По таблице Б.10 определяется плотность." />
                      <MetricField {...fieldProps('saturationDegree')} label="Степень водонасыщения Sr" unit="д.е." hint="Диапазон таблицы Б.9: 0 < Sr ≤ 1." />
                    </fieldset>
                  </>
                )}

                {family === 'cohesive' && (
                  <>
                    <fieldset className="gost-fieldset">
                      <legend>Разновидность глинистого грунта</legend>
                      <MetricField
                        {...fieldProps('plasticityIndex')}
                        label="Число пластичности Ip"
                        unit="д.е."
                        hint="Вводите доли единицы: например, 0,12. Не проценты."
                      />
                      <MetricField
                        {...fieldProps('sandFraction')}
                        label="Песчаные частицы 2–0,05 мм"
                        unit="%"
                        hint="Уточняет разновидность по таблице Б.14. Без этого показателя останется базовое название."
                      />
                    </fieldset>
                    <fieldset className="gost-fieldset">
                      <legend>Консистенция <span>необязательно</span></legend>
                      <MetricField {...fieldProps('liquidityIndex')} label="Показатель текучести IL" unit="д.е." hint="По таблице Б.16; отрицательные значения допускаются." />
                    </fieldset>
                  </>
                )}

                {family === 'other' && (
                  <div className="gost-outside-scope">
                    <CircleAlert size={18} />
                    <div>
                      <strong>Область первой версии ограничена</strong>
                      <p>Скальные, мёрзлые, органические, техногенные и другие классы не классифицируются этим помощником. Используйте полный текст ГОСТ и ручное инженерное решение.</p>
                    </div>
                  </div>
                )}
              </section>

              <section className="gost-result-panel" aria-label="Результат и обоснование" aria-live="polite">
                <div className="gost-section-heading">
                  <span>02</span>
                  <div>
                    <h3>Результат и обоснование</h3>
                    <p>Каждое наименование можно проследить до строки ГОСТ.</p>
                  </div>
                </div>

                {result.status === 'needs-data' && (
                  <div className="gost-result-placeholder" data-testid="gost-result-status">
                    <strong>Нужны исходные показатели</strong>
                    <p>Введите {result.missing.map(key => GOST_INDICATOR_LABELS[key]).join(', ')}. Пустые необязательные поля не блокируют базовую классификацию.</p>
                  </div>
                )}

                {result.status === 'invalid' && (
                  <div className="gost-result-placeholder is-error" data-testid="gost-result-status">
                    <strong>Проверьте введённые данные</strong>
                    <ul>{result.issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>
                  </div>
                )}

                {result.status === 'out-of-scope' && (
                  <div className="gost-result-placeholder is-warning" data-testid="gost-result-status">
                    {result.name ? <h3 data-testid="gost-result-name">{result.name}</h3> : <strong>Автоматическая классификация не выполнена</strong>}
                    <ul>{result.issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>
                  </div>
                )}

                {result.status === 'classified' && result.name && (
                  <div className="gost-classified-result">
                    <span className="gost-result-kicker">Наименование по введённым показателям</span>
                    <h3 data-testid="gost-result-name">{result.name}</h3>
                  </div>
                )}

                {result.optionalMissing.length > 0 && (
                  <div className="gost-missing-note">
                    <CircleAlert size={16} />
                    <div>
                      <strong>Разновидность уточнена не полностью</strong>
                      <p>Добавьте {result.optionalMissing.map(key => GOST_INDICATOR_LABELS[key]).join(', ')}. Пока показано только базовое наименование по таблице Б.13.</p>
                    </div>
                  </div>
                )}

                {result.trace.length > 0 && (
                  <div className="gost-trace">
                    <h4>Обоснование</h4>
                    {result.trace.map((entry, index) => {
                      const matchedRule = getGostRule(entry.ruleId)
                      return (
                        <div className="gost-trace-row" key={`${entry.ruleId}-${index}`}>
                          <div className="gost-trace-title">
                            <strong>{matchedRule.result}</strong>
                            <span>{entry.actual}</span>
                          </div>
                          <div className="gost-trace-condition">{matchedRule.conditions.join(' · ')}</div>
                          <RuleSource rule={matchedRule} />
                        </div>
                      )
                    })}
                  </div>
                )}

                {result.unassessed.length > 0 && result.status === 'classified' && (
                  <details className="gost-unassessed">
                    <summary>Что не определялось ({result.unassessed.length})</summary>
                    <ul>{result.unassessed.map(item => <li key={item.indicator}>{item.message}</li>)}</ul>
                  </details>
                )}

                {result.notes.map((note, index) => <p className="gost-result-note" key={index}>{note}</p>)}

                {result.status === 'classified' && result.name && (
                  <div className="gost-confirmation">
                    <label>
                      <input
                        type="checkbox"
                        checked={acknowledged}
                        onChange={event => {
                          setAcknowledgedSignature(event.target.checked ? signature : null)
                          if (!event.target.checked) setConfirmedSignature(null)
                        }}
                      />
                      <span>Я проверил исходные показатели, единицы измерения и обоснование.</span>
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!acknowledged || confirmed}
                      onClick={() => setConfirmedSignature(signature)}
                      data-testid="gost-confirm"
                    >
                      <Check size={15} /> {confirmed ? 'Расчёт подтверждён' : 'Подтвердить расчёт'}
                    </Button>
                    <p>{confirmed
                      ? 'Подтверждение относится только к текущему расчёту. При изменении показателей его нужно повторить.'
                      : 'Подтверждение инженера обязательно. Результат остаётся справочным и не записывается в проект.'}</p>
                  </div>
                )}
              </section>
            </div>
          ) : (
            <section className="gost-reference" aria-label="Справочник правил">
              <div className="gost-reference-intro">
                <div>
                  <h3>Реализованные правила</h3>
                  <p>Структурированные условия только для текущей области помощника. Это не электронная копия и не полная замена ГОСТ.</p>
                </div>
                <span>{filteredRules.length} из {GOST_25100_RULES.length}</span>
              </div>
              <div className="gost-reference-tools">
                <label className="gost-search">
                  <Search size={15} />
                  <Input value={referenceQuery} onChange={event => setReferenceQuery(event.target.value)} placeholder="Показатель, условие или наименование" />
                </label>
                <select value={referenceGroup} onChange={event => setReferenceGroup(event.target.value as 'all' | GostRule['group'])} aria-label="Фильтр по группе грунтов">
                  <option value="all">Все группы</option>
                  <option value="Пески">Пески</option>
                  <option value="Глинистые грунты">Глинистые грунты</option>
                </select>
              </div>
              <div className="gost-reference-table-wrap">
                <table className="gost-reference-table">
                  <thead>
                    <tr><th>Результат</th><th>Исходные показатели</th><th>Условия</th><th>Источник</th></tr>
                  </thead>
                  <tbody>
                    {filteredRules.map(rule => (
                      <tr key={rule.id}>
                        <td><strong>{rule.result}</strong><span>{rule.group}</span></td>
                        <td>{rule.indicators.map(item => <span key={item}>{item}</span>)}</td>
                        <td>{rule.conditions.map(item => <span className="gost-condition" key={item}>{item}</span>)}</td>
                        <td><RuleSource rule={rule} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredRules.length === 0 && <div className="gost-reference-empty">По этому запросу правила не найдены.</div>}
              </div>
            </section>
          )}
        </div>

        <div className="gost-dialog-footer">
          Справочный инструмент · не нормативная или расчётная характеристика · не автоматический геолог
        </div>
      </DialogContent>
    </Dialog>
  )
}
