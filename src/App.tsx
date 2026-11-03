import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Download, FileJson, FileSpreadsheet, FolderInput, HardDrive, Layers3, List, MapPin, PanelRight, Redo2, Save, Tags, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { BoreholeList } from '@/components/BoreholeList'
import { Inspector } from '@/components/Inspector'
import { IssueDock } from '@/components/IssueDock'
import { ImportDialog } from '@/components/ImportDialog'
import { ProfileCanvas } from '@/components/ProfileCanvas'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { createProjectFromFiles, exportProjectFile, exportWorkbook, addActivity, readProjectFile } from '@/lib/project'
import { loadStoredProject, storeProject } from '@/lib/storage'
import { getCodeSummary, getIgeKey, getIssues, getLayerNeighbors, SOIL_CHARACTERISTICS, type CodeStatus, type CodeSummaryItem, type GeoIssue, type GeoProject, type IgePassport, type Layer, type LayerNeighbors, type LabTest, type LabTestField, type SoilCharacteristicField, type SoilCharacteristicKey } from '@/types/geology'
import './App.css'

const HISTORY_LIMIT = 50
const PASSPORT_FIELD_LABELS = {
  name: 'наименование',
  description: 'описание грунта',
  notes: 'примечание'
} as const
const CHARACTERISTIC_FIELD_LABELS: Record<SoilCharacteristicField, string> = {
  standard: 'нормативное значение',
  design: 'расчётное значение',
  source: 'источник'
}
const LAB_TEST_FIELD_LABELS: Record<LabTestField, string> = {
  sample: 'номер образца',
  boreholeId: 'скважина',
  depth: 'глубина',
  source: 'источник'
}

export default function App() {
  const [project, setProject] = useState<GeoProject | null>(null)
  const [past, setPast] = useState<GeoProject[]>([])
  const [future, setFuture] = useState<GeoProject[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedId, setSelectedId] = useState('borehole-1')
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const [reviewIndex, setReviewIndex] = useState<number | null>(null)
  const [fitToken, setFitToken] = useState(0)
  const [focusToken, setFocusToken] = useState(0)
  const [showLabels, setShowLabels] = useState(true)
  const [showCodes, setShowCodes] = useState(true)
  const [importOpen, setImportOpen] = useState(false)
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error'>('saved')
  const [mobilePanel, setMobilePanel] = useState<'list' | 'inspector' | null>(null)

  useEffect(() => {
    let active = true
    loadStoredProject()
      .catch(() => null)
      .then(async stored => {
        if (stored) return stored
        const response = await fetch(`${import.meta.env.BASE_URL}demo-project.json`)
        if (!response.ok) throw new Error('Не удалось загрузить исходный проект')
        return await response.json() as GeoProject
      })
      .then(value => {
        if (!active) return
        setProject(value)
        setSelectedId(value.columns[0]?.id || '')
      })
      .catch(reason => setLoadError(reason instanceof Error ? reason.message : 'Ошибка загрузки'))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!project) return
    setSaveState('saving')
    const timer = window.setTimeout(() => {
      storeProject(project).then(() => setSaveState('saved')).catch(() => setSaveState('error'))
    }, 700)
    return () => window.clearTimeout(timer)
  }, [project])

  const issues = useMemo(() => project ? getIssues(project) : [], [project])
  const codeSummary = useMemo(() => project ? getCodeSummary(project) : [], [project])
  const selected = project?.columns.find(column => column.id === selectedId) || project?.columns[0]
  const selectedLayer = selected?.layers.find(layer => layer.id === selectedLayerId) || null
  const activeIssueId = issues.find(issue => issue.boreholeId === selected?.id && (issue.layerId || null) === selectedLayerId)?.id || null
  const activeCodeKey = selectedLayer ? getIgeKey(selectedLayer.ige) : null
  const selectedPassport = activeCodeKey && activeCodeKey !== '__unassigned__' ? project?.igePassports?.[activeCodeKey] || null : null
  const selectedPassportLayerCount = project && activeCodeKey && activeCodeKey !== '__unassigned__'
    ? project.columns.reduce((sum, column) => sum + column.layers.filter(layer => getIgeKey(layer.ige) === activeCodeKey).length, 0)
    : 0
  const selectedNeighbors: LayerNeighbors = project && selected && selectedLayer
    ? getLayerNeighbors(project, selected.id, selectedLayer.id)
    : { previous: null, next: null }
  const activeColumns = project?.columns.filter(column => !column.isExcluded) || []
  const reviewedCount = activeColumns.filter(column => column.isReviewed).length
  const layerCount = activeColumns.reduce((sum, column) => sum + column.layers.length, 0)

  const commitProject = (updater: (current: GeoProject) => GeoProject) => {
    if (!project) return
    const next = updater(project)
    if (next === project) return
    setPast(items => [...items, project].slice(-HISTORY_LIMIT))
    setFuture([])
    setProject(next)
  }

  const undo = () => {
    if (!project || !past.length) return
    const previous = past[past.length - 1]
    setPast(items => items.slice(0, -1))
    setFuture(items => [project, ...items].slice(0, HISTORY_LIMIT))
    setProject(addActivity(previous, 'Отменено последнее ручное действие'))
    toast.success('Последнее действие отменено')
  }

  const redo = () => {
    if (!project || !future.length) return
    const next = future[0]
    setFuture(items => items.slice(1))
    setPast(items => [...items, project].slice(-HISTORY_LIMIT))
    setProject(addActivity(next, 'Повторено отменённое действие'))
    toast.success('Действие восстановлено')
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea') || target?.isContentEditable) return
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 'z' || key === 'y') {
        event.preventDefault()
        if (key === 'y' || event.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [project, past, future])

  const selectBorehole = (id: string) => {
    setSelectedId(id)
    setSelectedLayerId(null)
  }

  const selectIssue = (issue: GeoIssue) => {
    const index = issues.findIndex(item => item.id === issue.id)
    setReviewIndex(index >= 0 ? index : null)
    setSelectedId(issue.boreholeId)
    setSelectedLayerId(issue.layerId || null)
    setFocusToken(value => value + 1)
  }

  const selectLayerLocation = (boreholeId: string, layerId: string) => {
    const issueIndex = issues.findIndex(issue => issue.boreholeId === boreholeId && issue.layerId === layerId)
    setReviewIndex(issueIndex >= 0 ? issueIndex : null)
    setSelectedId(boreholeId)
    setSelectedLayerId(layerId)
    setFocusToken(value => value + 1)
  }

  const selectCodeSummary = (item: CodeSummaryItem) => selectLayerLocation(item.boreholeId, item.layerId)

  const stepIssue = (direction: -1 | 1) => {
    if (!issues.length) return
    const selectedIndex = issues.findIndex(issue => issue.id === activeIssueId)
    let nextIndex: number
    if (selectedIndex >= 0) nextIndex = (selectedIndex + direction + issues.length) % issues.length
    else if (reviewIndex !== null) nextIndex = direction > 0
      ? Math.min(Math.max(reviewIndex, 0), issues.length - 1)
      : Math.max(Math.min(reviewIndex - 1, issues.length - 1), 0)
    else nextIndex = direction > 0 ? 0 : issues.length - 1
    selectIssue(issues[nextIndex])
  }

  const renameSelected = (name: string) => {
    if (!project || !selected) return
    const previousName = selected.name
    commitProject(current => addActivity({
      ...current,
      columns: current.columns.map(column => column.id === selected.id ? { ...column, name, sourceNamed: name.trim().length > 0, isReviewed: false, reviewedAt: '' } : column)
    }, `Скважина №${selected.index}: наименование изменено с «${previousName}» на «${name.trim() || 'без имени'}»`))
  }

  const changeDepth = (layerId: string, depth: number) => {
    if (!project || !selected) return
    const index = selected.layers.findIndex(layer => layer.id === layerId)
    if (index < 0) return
    const previous = selected.layers[index - 1]?.depth ?? 0
    const next = selected.layers[index + 1]?.depth ?? Infinity
    if (depth <= previous || depth >= next) {
      toast.error('Глубина должна возрастать от предыдущего слоя к следующему')
      return
    }
    const oldDepth = selected.layers[index].depth
    if (depth === oldDepth) return
    commitProject(current => addActivity({
      ...current,
      columns: current.columns.map(column => column.id === selected.id ? {
        ...column,
        isReviewed: false,
        reviewedAt: '',
        layers: column.layers.map(layer => layer.id === layerId ? { ...layer, depth, y: column.top - depth * 10, depthSource: 'manual' } : layer)
      } : column)
    }, `${selected.name}: глубина слоя ${index + 1} изменена с ${String(oldDepth).replace('.', ',')} на ${String(depth).replace('.', ',')} м`))
    toast.success('Глубина обновлена')
  }

  const changeCode = (layerId: string, code: string, status?: CodeStatus) => {
    if (!project || !selected) return
    const layer = selected.layers.find(item => item.id === layerId)
    if (!layer) return
    commitProject(current => addActivity({
      ...current,
      columns: current.columns.map(column => column.id === selected.id ? {
        ...column,
        isReviewed: false,
        reviewedAt: '',
        layers: column.layers.map(item => item.id === layerId ? {
          ...item, ige: code, status: status || (code ? 'manual' : 'not-found'), source: code ? 'Ручное подтверждение' : 'Требует проверки'
        } : item)
      } : column)
    }, `${selected.name}, ${String(layer.depth).replace('.', ',')} м: ИГЭ ${code || 'не задан'}`))
    if (code) toast.success(`ИГЭ ${code} подтверждён вручную`)
  }

  const changePassport = (code: string, field: 'name' | 'description' | 'notes', value: string) => {
    const key = getIgeKey(code)
    if (!project || key === '__unassigned__') return
    commitProject(current => {
      const previous = current.igePassports?.[key] || { name: '', description: '', notes: '' }
      if (previous[field] === value) return current
      return addActivity({
        ...current,
        igePassports: { ...current.igePassports, [key]: { ...previous, [field]: value } },
        columns: current.columns.map(column => column.layers.some(layer => getIgeKey(layer.ige) === key)
          ? { ...column, isReviewed: false, reviewedAt: '' }
          : column)
      }, `ИГЭ ${code}: изменено поле «${PASSPORT_FIELD_LABELS[field]}» паспорта`)
    })
    toast.success(`Паспорт ИГЭ ${code} обновлён`)
  }

  const changeCharacteristic = (
    code: string,
    property: SoilCharacteristicKey,
    field: SoilCharacteristicField,
    value: number | string | null
  ) => {
    const key = getIgeKey(code)
    if (!project || key === '__unassigned__') return
    const normalizedValue = field === 'source' ? String(value ?? '') : typeof value === 'number' && Number.isFinite(value) ? value : null
    commitProject(current => {
      const previousPassport = current.igePassports?.[key] || { name: '', description: '', notes: '' }
      const previousRecord = previousPassport.characteristics?.[property] || { standard: null, design: null, source: '' }
      if (previousRecord[field] === normalizedValue) return current
      const nextPassport: IgePassport = {
        ...previousPassport,
        characteristics: {
          ...previousPassport.characteristics,
          [property]: { ...previousRecord, [field]: normalizedValue }
        }
      }
      return addActivity({
        ...current,
        igePassports: { ...current.igePassports, [key]: nextPassport },
        columns: current.columns.map(column => column.layers.some(layer => getIgeKey(layer.ige) === key)
          ? { ...column, isReviewed: false, reviewedAt: '' }
          : column)
      }, `ИГЭ ${code}: ${SOIL_CHARACTERISTICS.find(item => item.key === property)?.label}, изменено поле «${CHARACTERISTIC_FIELD_LABELS[field]}»`)
    })
    toast.success(`Характеристика ИГЭ ${code} обновлена`)
  }

  const updateLabTests = (code: string, activityText: string, updater: (tests: LabTest[]) => LabTest[]) => {
    const key = getIgeKey(code)
    if (!project || key === '__unassigned__') return
    commitProject(current => {
      const previousPassport = current.igePassports?.[key] || { name: '', description: '', notes: '' }
      const previousTests = previousPassport.labTests || []
      const nextTests = updater(previousTests)
      if (nextTests === previousTests) return current
      return addActivity({
        ...current,
        igePassports: {
          ...current.igePassports,
          [key]: { ...previousPassport, labTests: nextTests }
        },
        columns: current.columns.map(column => column.layers.some(layer => getIgeKey(layer.ige) === key)
          ? { ...column, isReviewed: false, reviewedAt: '' }
          : column)
      }, activityText)
    })
  }

  const addLabTest = (code: string) => {
    const test: LabTest = {
      id: `lab-${Date.now()}-${Math.random()}`,
      sample: '',
      boreholeId: selected?.id || '',
      depth: null,
      source: '',
      values: {}
    }
    updateLabTests(code, `ИГЭ ${code}: добавлено лабораторное испытание`, tests => [...tests, test])
    toast.success(`Испытание ИГЭ ${code} добавлено`)
  }

  const deleteLabTest = (code: string, testId: string) => {
    const test = project?.igePassports?.[getIgeKey(code)]?.labTests?.find(item => item.id === testId)
    updateLabTests(code, `ИГЭ ${code}: удалено испытание ${test?.sample.trim() || testId}`, tests => tests.filter(item => item.id !== testId))
    toast.success('Испытание удалено; действие можно отменить')
  }

  const changeLabTest = (code: string, testId: string, field: LabTestField, value: string | number | null) => {
    const normalizedValue = field === 'depth' ? typeof value === 'number' && Number.isFinite(value) ? value : null : String(value ?? '')
    updateLabTests(code, `ИГЭ ${code}: изменено поле «${LAB_TEST_FIELD_LABELS[field]}» испытания`, tests => {
      let changed = false
      const next = tests.map(test => {
        if (test.id !== testId || test[field] === normalizedValue) return test
        changed = true
        return { ...test, [field]: normalizedValue }
      })
      return changed ? next : tests
    })
  }

  const changeLabTestValue = (code: string, testId: string, property: SoilCharacteristicKey, value: number | null) => {
    updateLabTests(code, `ИГЭ ${code}: изменено значение «${SOIL_CHARACTERISTICS.find(item => item.key === property)?.label}» в испытании`, tests => {
      let changed = false
      const next = tests.map(test => {
        if (test.id !== testId || test.values[property] === value || (value === null && test.values[property] === undefined)) return test
        changed = true
        const values = { ...test.values }
        if (value === null) delete values[property]
        else values[property] = value
        return { ...test, values }
      })
      return changed ? next : tests
    })
  }

  const addLayer = (depth: number, code: string) => {
    if (!project || !selected || selected.isExcluded) return
    const insertionIndex = selectedLayer ? selected.layers.findIndex(layer => layer.id === selectedLayer.id) + 1 : selected.layers.length
    const previous = selected.layers[insertionIndex - 1]?.depth ?? 0
    const next = selected.layers[insertionIndex]?.depth ?? Infinity
    if (!Number.isFinite(depth) || depth <= previous || depth >= next) {
      toast.error('Новая глубина нарушает порядок подошв')
      return
    }
    const newId = `${selected.id}-manual-${Date.now()}`
    const layer: Layer = {
      id: newId,
      depth,
      y: selected.top - depth * 10,
      ige: code,
      status: code ? 'manual' : 'not-found',
      candidates: [],
      source: code ? 'Ручное добавление' : 'Новый слой: требуется ИГЭ',
      depthSource: 'manual'
    }
    commitProject(current => addActivity({
      ...current,
      columns: current.columns.map(column => {
        if (column.id !== selected.id) return column
        const layers = [...column.layers]
        layers.splice(insertionIndex, 0, layer)
        return { ...column, layers, isReviewed: false, reviewedAt: '' }
      })
    }, `${selected.name}: добавлена подошва ${String(depth).replace('.', ',')} м${code ? `, ИГЭ ${code}` : ', код ИГЭ требует проверки'}`))
    setSelectedLayerId(newId)
    toast.success('Подошва добавлена в расчётный проект')
  }

  const deleteLayer = (layerId: string) => {
    if (!project || !selected || selected.isExcluded) return
    const index = selected.layers.findIndex(layer => layer.id === layerId)
    if (index < 0) return
    const removed = selected.layers[index]
    const nextSelected = selected.layers[index + 1]?.id || selected.layers[index - 1]?.id || null
    commitProject(current => addActivity({
      ...current,
      columns: current.columns.map(column => column.id === selected.id ? {
        ...column,
        isReviewed: false,
        reviewedAt: '',
        layers: column.layers.filter(layer => layer.id !== layerId)
      } : column)
    }, `${selected.name}: удалена подошва ${String(removed.depth).replace('.', ',')} м${removed.ige ? `, ИГЭ ${removed.ige}` : ''}`))
    setSelectedLayerId(nextSelected)
    toast.success('Подошва удалена; действие можно отменить')
  }

  const toggleSelectedReviewed = () => {
    if (!project || !selected || selected.isExcluded) return
    const hasIssues = issues.some(issue => issue.boreholeId === selected.id)
    if (!selected.isReviewed && hasIssues) {
      toast.error('Сначала решите все проблемы этой скважины')
      return
    }
    const reviewing = !selected.isReviewed
    const reviewedAt = reviewing ? new Date().toLocaleString('ru-RU') : ''
    commitProject(current => addActivity({
      ...current,
      columns: current.columns.map(column => column.id === selected.id ? { ...column, isReviewed: reviewing, reviewedAt } : column)
    }, reviewing ? `${selected.name}: проверка подтверждена инженером` : `${selected.name}: подтверждение проверки снято`))
    toast.success(reviewing ? 'Скважина отмечена как проверенная' : 'Скважина возвращена на проверку')
  }

  const toggleSelectedExcluded = (reason: string) => {
    if (!project || !selected) return
    const excluding = !selected.isExcluded
    commitProject(current => addActivity({
      ...current,
      columns: current.columns.map(column => column.id === selected.id ? {
        ...column,
        isExcluded: excluding,
        exclusionReason: excluding ? reason : '',
        isReviewed: false,
        reviewedAt: ''
      } : column)
    }, excluding ? `${selected.name}: исключена из расчёта. Причина: ${reason}` : `${selected.name}: возвращена в расчёт`))
    setSelectedLayerId(null)
    toast.success(excluding ? 'Колонка исключена из расчёта, исходная геометрия сохранена' : 'Колонка возвращена в расчёт')
  }

  const saveNow = async () => {
    if (!project) return
    try { await storeProject(project); setSaveState('saved'); toast.success('Проект сохранён в этом браузере') }
    catch { setSaveState('error'); toast.error('Не удалось сохранить проект') }
  }

  const importProject = async (dxf: File, axis: File) => {
    const next = await createProjectFromFiles(dxf, axis)
    setProject(next)
    setPast([])
    setFuture([])
    setSelectedId(next.columns[0]?.id || '')
    setSelectedLayerId(null)
    setReviewIndex(null)
    setFitToken(value => value + 1)
    toast.success(`Проект построен: ${next.columns.length} колонок`)
  }

  const openSavedProject = async (file: File) => {
    const next = await readProjectFile(file)
    setProject(next)
    setPast([])
    setFuture([])
    setSelectedId(next.columns.find(column => !column.isExcluded)?.id || next.columns[0]?.id || '')
    setSelectedLayerId(null)
    setReviewIndex(null)
    setFitToken(value => value + 1)
    toast.success(`Проект «${next.title}» открыт`)
  }

  if (loading) return <div className="app-loading"><div className="brand-mark">ГЕО<span>/</span>РАЗРЕЗ</div><div className="loading-line"><span /></div><p>Загружаем геологический проект…</p></div>
  if (loadError || !project) return <div className="app-loading"><div className="brand-mark">ГЕО<span>/</span>РАЗРЕЗ</div><p>{loadError || 'Проект не найден'}</p><button type="button" className="button primary" onClick={() => window.location.reload()}>Повторить загрузку</button></div>

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-mark">ГЕО<span>/</span>РАЗРЕЗ</div>
        <div className="project-identity"><strong>{project.title}</strong><span>{project.sourceFile}</span></div>
        <div className="header-actions">
          <span className={`save-indicator ${saveState}`}><HardDrive size={14} />{saveState === 'saving' ? 'Сохранение…' : saveState === 'error' ? 'Не сохранено' : 'Сохранено локально'}</span>
          <div className="history-controls" aria-label="История изменений">
            <button type="button" className="icon-button" onClick={undo} disabled={!past.length} aria-label="Отменить действие" title="Отменить · Ctrl+Z"><Undo2 size={17} /></button>
            <button type="button" className="icon-button" onClick={redo} disabled={!future.length} aria-label="Повторить действие" title="Повторить · Ctrl+Shift+Z"><Redo2 size={17} /></button>
          </div>
          <button type="button" className="icon-button header-save" onClick={saveNow} aria-label="Сохранить проект" title="Сохранить проект"><Save size={17} /></button>
          <button type="button" className="button secondary import-button" onClick={() => setImportOpen(true)}><FolderInput size={16} /> Импорт</button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" className="button primary"><Download size={16} /> Экспорт <ChevronDown size={14} /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="export-menu">
              <DropdownMenuItem onSelect={() => exportWorkbook(project).then(() => toast.success('Excel-ведомость сформирована')).catch(() => toast.error('Не удалось сформировать Excel'))}><FileSpreadsheet size={16} /> Excel-ведомость</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { exportProjectFile(project); toast.success('Файл проекта сформирован') }}><FileJson size={16} /> Файл проекта JSON</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="mobile-tool-row">
        <button type="button" onClick={() => setMobilePanel('list')}><List size={16} /> Скважины</button>
        <span>{selected?.name}</span>
        <button type="button" onClick={() => setMobilePanel('inspector')}><PanelRight size={16} /> Свойства</button>
      </div>

      <main className={`workspace ${mobilePanel === 'list' ? 'show-list' : ''} ${mobilePanel === 'inspector' ? 'show-inspector' : ''}`}>
        {mobilePanel && <button type="button" className="mobile-backdrop" aria-label="Закрыть панель" onClick={() => setMobilePanel(null)} />}
        <div className="mobile-panel-close list-close"><button type="button" onClick={() => setMobilePanel(null)}>Закрыть</button></div>
        <BoreholeList project={project} selectedId={selected?.id || ''} onSelect={id => { selectBorehole(id); setMobilePanel(null) }} />
        <section className="workspace-center">
          <div className="viewer-toolbar">
            <div className="viewer-title"><span className="panel-kicker">РАБОЧАЯ ОБЛАСТЬ</span><h1>Инженерно-геологический разрез</h1></div>
            <div className="viewer-actions">
              <button type="button" className={showLabels ? 'toggle-button active' : 'toggle-button'} onClick={() => setShowLabels(value => !value)} aria-pressed={showLabels}><Tags size={15} /> Подписи</button>
              <button type="button" className={showCodes ? 'toggle-button active' : 'toggle-button'} onClick={() => setShowCodes(value => !value)} aria-pressed={showCodes}><Layers3 size={15} /> ИГЭ</button>
              <button type="button" className="toggle-button" onClick={() => setFitToken(value => value + 1)}><MapPin size={15} /> Обзор</button>
            </div>
          </div>
          <div className="project-metrics">
            <div><strong>{activeColumns.length}</strong><span>в расчёте · {project.columns.length} в DXF</span></div>
            <div><strong>{layerCount}</strong><span>подошв слоёв</span></div>
            <div className="metric-warning"><strong>{issues.filter(i => i.kind === 'ambiguous-code').length}</strong><span>неоднозначных ИГЭ</span></div>
            <div><strong>{reviewedCount}</strong><span>проверено · {project.columns.filter(c => c.sourceNamed).length} имён DXF</span></div>
            <span className="real-data-badge">Реальные исходники</span>
          </div>
          <ProfileCanvas project={project} selectedId={selected?.id || ''} selectedLayer={selectedLayer} onSelect={id => { selectBorehole(id); setFocusToken(value => value + 1) }} onDepthChange={changeDepth} onCandidateSelect={code => { if (selectedLayer) changeCode(selectedLayer.id, code, 'manual') }} showLabels={showLabels} showCodes={showCodes} fitToken={fitToken} focusToken={focusToken} />
          <IssueDock issues={issues} activity={project.activity} codeSummary={codeSummary} activeIssueId={activeIssueId} activeCodeKey={activeCodeKey} onSelect={selectIssue} onSelectCode={selectCodeSummary} onStep={stepIssue} />
        </section>
        <div className="mobile-panel-close inspector-close"><button type="button" onClick={() => setMobilePanel(null)}>Закрыть</button></div>
        {selected && <Inspector column={selected} selectedLayerId={selectedLayerId} igePassport={selectedPassport} igeLayerCount={selectedPassportLayerCount} layerNeighbors={selectedNeighbors} onNeighborSelect={selectLayerLocation} onPassportChange={changePassport} onCharacteristicChange={changeCharacteristic} boreholes={project.columns.map(column => ({ id: column.id, name: column.name }))} onLabTestAdd={addLabTest} onLabTestDelete={deleteLabTest} onLabTestChange={changeLabTest} onLabTestValueChange={changeLabTestValue} onLayerSelect={setSelectedLayerId} onLayerAdd={addLayer} onLayerDelete={deleteLayer} onRename={renameSelected} onDepthChange={changeDepth} onCodeChange={changeCode} onToggleExcluded={toggleSelectedExcluded} onToggleReviewed={toggleSelectedReviewed} />}
      </main>

      <footer className="app-statusbar">
        <span><span className={`status-dot ${saveState === 'error' ? 'danger' : 'success'}`} /> Локальный проект · данные только в этом браузере</span>
        <span>Ядро: ENTITIES · геометрия колонок · топология границ</span>
        <span>Прототип 0.11</span>
      </footer>
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onImport={importProject} onOpenProject={openSavedProject} />
    </div>
  )
}
