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
import { createCoreModel, createProjectFromCore, getCoreCodeSummary, getCoreIssues, getCoreLayerNeighbors, getCoreModelStats, validateCoreModel } from '@/lib/geologyCore'
import { addCoreLayer, changeCoreLayerCode, changeCoreLayerDepth, deleteCoreLayer, renameCoreBorehole, setCoreBoreholeIncluded, setCoreBoreholeReviewed } from '@/lib/coreCommands'
import { getIgeKey, SOIL_CHARACTERISTICS, type CodeStatus, type CodeSummaryItem, type GeoIssue, type GeoProject, type IgePassport, type LayerNeighbors, type SoilCharacteristicField, type SoilCharacteristicKey } from '@/types/geology'
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

  const coreModel = useMemo(() => project ? createCoreModel(project) : null, [project])
  const issues = useMemo(() => coreModel ? getCoreIssues(coreModel) : [], [coreModel])
  const codeSummary = useMemo(() => coreModel ? getCoreCodeSummary(coreModel) : [], [coreModel])
  const coreReport = useMemo(() => coreModel ? {
    stats: getCoreModelStats(coreModel),
    issues: validateCoreModel(coreModel)
  } : null, [coreModel])
  const selected = project?.columns.find(column => column.id === selectedId) || project?.columns[0]
  const selectedCore = coreModel?.boreholes.find(column => column.id === selected?.id) || null
  const selectedLayer = selected?.layers.find(layer => layer.id === selectedLayerId) || null
  const activeIssueId = issues.find(issue => issue.boreholeId === selected?.id && (issue.layerId || null) === selectedLayerId)?.id || null
  const activeCodeKey = selectedLayer ? getIgeKey(selectedLayer.ige) : null
  const selectedPassport = activeCodeKey && activeCodeKey !== '__unassigned__' ? project?.igePassports?.[activeCodeKey] || null : null
  const selectedPassportLayerCount = project && activeCodeKey && activeCodeKey !== '__unassigned__'
    ? project.columns.reduce((sum, column) => sum + column.layers.filter(layer => getIgeKey(layer.ige) === activeCodeKey).length, 0)
    : 0
  const selectedNeighbors: LayerNeighbors = coreModel && selectedCore && selectedLayer
    ? getCoreLayerNeighbors(coreModel, selectedCore.id, selectedLayer.id)
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

  const commitCore = (updater: (current: NonNullable<typeof coreModel>) => NonNullable<typeof coreModel>): boolean => {
    if (!coreModel) return false
    try {
      const next = updater(coreModel)
      if (next === coreModel) return false
      commitProject(() => createProjectFromCore(next))
      return true
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Не удалось выполнить команду ядра')
      return false
    }
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
    if (!selected) return
    commitCore(current => renameCoreBorehole(current, selected.id, name))
  }

  const changeDepth = (layerId: string, depth: number) => {
    if (!selected) return
    if (commitCore(current => changeCoreLayerDepth(current, selected.id, layerId, depth))) {
      toast.success('Глубина обновлена')
    }
  }

  const changeCode = (layerId: string, code: string, status?: CodeStatus) => {
    if (!selected) return
    if (commitCore(current => changeCoreLayerCode(current, selected.id, layerId, code, status)) && code) {
      toast.success(`ИГЭ ${code} подтверждён вручную`)
    }
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

  const addLayer = (depth: number, code: string) => {
    if (!coreModel || !selected) return
    try {
      const result = addCoreLayer(coreModel, selected.id, selectedLayer?.id || null, depth, code)
      commitProject(() => createProjectFromCore(result.model))
      setSelectedLayerId(result.layerId)
      toast.success('Подошва добавлена в расчётный проект')
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Не удалось добавить подошву')
    }
  }

  const deleteLayer = (layerId: string) => {
    if (!selected) return
    const index = selected.layers.findIndex(layer => layer.id === layerId)
    if (index < 0) return
    const nextSelected = selected.layers[index + 1]?.id || selected.layers[index - 1]?.id || null
    if (commitCore(current => deleteCoreLayer(current, selected.id, layerId))) {
      setSelectedLayerId(nextSelected)
      toast.success('Подошва удалена; действие можно отменить')
    }
  }

  const toggleSelectedReviewed = () => {
    if (!selected) return
    const reviewing = !selected.isReviewed
    if (commitCore(current => setCoreBoreholeReviewed(current, selected.id, reviewing))) {
      toast.success(reviewing ? 'Скважина отмечена как проверенная' : 'Скважина возвращена на проверку')
    }
  }

  const toggleSelectedExcluded = (reason: string) => {
    if (!selected) return
    const excluding = !selected.isExcluded
    if (commitCore(current => setCoreBoreholeIncluded(current, selected.id, !excluding, reason))) {
      setSelectedLayerId(null)
      toast.success(excluding ? 'Колонка исключена из расчёта, исходная геометрия сохранена' : 'Колонка возвращена в расчёт')
    }
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
        <BoreholeList project={project} issues={issues} selectedId={selected?.id || ''} onSelect={id => { selectBorehole(id); setMobilePanel(null) }} />
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
        {selected && selectedCore && <Inspector column={selected} coreColumn={selectedCore} selectedLayerId={selectedLayerId} igePassport={selectedPassport} igeLayerCount={selectedPassportLayerCount} layerNeighbors={selectedNeighbors} onNeighborSelect={selectLayerLocation} onPassportChange={changePassport} onCharacteristicChange={changeCharacteristic} onLayerSelect={setSelectedLayerId} onLayerAdd={addLayer} onLayerDelete={deleteLayer} onRename={renameSelected} onDepthChange={changeDepth} onCodeChange={changeCode} onToggleExcluded={toggleSelectedExcluded} onToggleReviewed={toggleSelectedReviewed} />}
      </main>

      <footer className="app-statusbar">
        <span><span className={`status-dot ${saveState === 'error' ? 'danger' : 'success'}`} /> Локальный проект · данные только в этом браузере</span>
        <span title="Геометрия, топологические статусы, соседи и сводка ИГЭ рассчитываются из канонической модели">Ядро 0.22 · {coreReport?.stats.boreholes || 0} скважин · {coreReport?.stats.layers || 0} слоёв · структурных ошибок: {coreReport?.issues.length || 0}</span>
        <span>Прототип 0.22</span>
      </footer>
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onImport={importProject} onOpenProject={openSavedProject} />
    </div>
  )
}
