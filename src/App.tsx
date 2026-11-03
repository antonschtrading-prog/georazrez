import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Download, FileJson, FileSpreadsheet, FolderInput, HardDrive, Layers3, List, MapPin, PanelRight, Save, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { BoreholeList } from '@/components/BoreholeList'
import { Inspector } from '@/components/Inspector'
import { IssueDock } from '@/components/IssueDock'
import { ImportDialog } from '@/components/ImportDialog'
import { ProfileCanvas } from '@/components/ProfileCanvas'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { createProjectFromFiles, exportProjectFile, exportWorkbook, addActivity, readProjectFile } from '@/lib/project'
import { loadStoredProject, storeProject } from '@/lib/storage'
import { getIssues, type CodeStatus, type GeoIssue, type GeoProject } from '@/types/geology'
import './App.css'

export default function App() {
  const [project, setProject] = useState<GeoProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedId, setSelectedId] = useState('borehole-1')
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
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
  const selected = project?.columns.find(column => column.id === selectedId) || project?.columns[0]
  const selectedLayer = selected?.layers.find(layer => layer.id === selectedLayerId) || null
  const activeColumns = project?.columns.filter(column => !column.isExcluded) || []
  const layerCount = activeColumns.reduce((sum, column) => sum + column.layers.length, 0)

  const selectBorehole = (id: string) => {
    setSelectedId(id)
    setSelectedLayerId(null)
  }

  const selectIssue = (issue: GeoIssue) => {
    setSelectedId(issue.boreholeId)
    setSelectedLayerId(issue.layerId || null)
    setFocusToken(value => value + 1)
  }

  const renameSelected = (name: string) => {
    if (!project || !selected) return
    const wasUnnamed = !selected.sourceNamed
    setProject(current => {
      if (!current) return current
      let next: GeoProject = {
        ...current,
        columns: current.columns.map(column => column.id === selected.id ? { ...column, name, sourceNamed: name.trim().length > 0 } : column)
      }
      if (wasUnnamed && name.trim()) next = addActivity(next, `Назначено имя скважины №${selected.index}: ${name.trim()}`)
      return next
    })
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
    setProject(current => {
      if (!current) return current
      const nextProject: GeoProject = {
        ...current,
        columns: current.columns.map(column => column.id === selected.id ? {
          ...column,
          layers: column.layers.map(layer => layer.id === layerId ? { ...layer, depth, y: column.top - depth * 10 } : layer)
        } : column)
      }
      return addActivity(nextProject, `${selected.name}: глубина слоя ${index + 1} изменена на ${String(depth).replace('.', ',')} м`)
    })
    toast.success('Глубина обновлена')
  }

  const changeCode = (layerId: string, code: string, status?: CodeStatus) => {
    if (!project || !selected) return
    const layer = selected.layers.find(item => item.id === layerId)
    if (!layer) return
    setProject(current => {
      if (!current) return current
      const nextProject: GeoProject = {
        ...current,
        columns: current.columns.map(column => column.id === selected.id ? {
          ...column,
          layers: column.layers.map(item => item.id === layerId ? {
            ...item, ige: code, status: status || (code ? 'manual' : 'not-found'), source: code ? 'Ручное подтверждение' : 'Требует проверки'
          } : item)
        } : column)
      }
      return addActivity(nextProject, `${selected.name}, ${String(layer.depth).replace('.', ',')} м: ИГЭ ${code || 'не задан'}`)
    })
    if (code) toast.success(`ИГЭ ${code} подтверждён вручную`)
  }

  const toggleSelectedExcluded = (reason: string) => {
    if (!project || !selected) return
    const excluding = !selected.isExcluded
    setProject(current => {
      if (!current) return current
      const nextProject: GeoProject = {
        ...current,
        columns: current.columns.map(column => column.id === selected.id ? {
          ...column,
          isExcluded: excluding,
          exclusionReason: excluding ? reason : ''
        } : column)
      }
      return addActivity(nextProject, excluding ? `${selected.name}: исключена из расчёта. Причина: ${reason}` : `${selected.name}: возвращена в расчёт`)
    })
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
    setSelectedId(next.columns[0]?.id || '')
    setSelectedLayerId(null)
    setFitToken(value => value + 1)
    toast.success(`Проект построен: ${next.columns.length} колонок`)
  }

  const openSavedProject = async (file: File) => {
    const next = await readProjectFile(file)
    setProject(next)
    setSelectedId(next.columns.find(column => !column.isExcluded)?.id || next.columns[0]?.id || '')
    setSelectedLayerId(null)
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
            <div><strong>{project.columns.filter(c => c.sourceNamed).length}</strong><span>имён из DXF</span></div>
            <span className="real-data-badge">Реальные исходники</span>
          </div>
          <ProfileCanvas project={project} selectedId={selected?.id || ''} selectedLayer={selectedLayer} onSelect={id => { selectBorehole(id); setFocusToken(value => value + 1) }} showLabels={showLabels} showCodes={showCodes} fitToken={fitToken} focusToken={focusToken} />
          <IssueDock issues={issues} activity={project.activity} onSelect={selectIssue} />
        </section>
        <div className="mobile-panel-close inspector-close"><button type="button" onClick={() => setMobilePanel(null)}>Закрыть</button></div>
        {selected && <Inspector column={selected} selectedLayerId={selectedLayerId} onLayerSelect={setSelectedLayerId} onRename={renameSelected} onDepthChange={changeDepth} onCodeChange={changeCode} onToggleExcluded={toggleSelectedExcluded} />}
      </main>

      <footer className="app-statusbar">
        <span><span className={`status-dot ${saveState === 'error' ? 'danger' : 'success'}`} /> Локальный проект · данные только в этом браузере</span>
        <span>Ядро: ENTITIES · геометрия колонок · топология границ</span>
        <span>Прототип 0.2</span>
      </footer>
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onImport={importProject} onOpenProject={openSavedProject} />
    </div>
  )
}
