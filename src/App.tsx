import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Download, FileJson, FileSpreadsheet, FolderInput, HardDrive, Layers3, List, MapPin, Palette, PanelRight, Plus, Printer, Redo2, Save, Tags, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { BoreholeList } from '@/components/BoreholeList'
import { Inspector } from '@/components/Inspector'
import { IssueDock } from '@/components/IssueDock'
import { ImportDialog } from '@/components/ImportDialog'
import { ProfileCanvas } from '@/components/ProfileCanvas'
import { ProfileDocumentDialog } from '@/components/ProfileDocumentDialog'
import { SoilLibraryDialog } from '@/components/SoilLibraryDialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { createCoreFromFiles, exportProjectFile, exportWorkbook, readCoreProjectFile } from '@/lib/project'
import { loadStoredProject, storeProject } from '@/lib/storage'
import { createCoreModel, createProjectFromCore, getCoreBoreholeBoundaryIssues, getCoreBoundaryModel, getCoreCodeSummary, getCoreFictitiousPreview, getCoreIssues, getCoreJournalEntries, getCoreLayerNeighbors, getCoreModelStats, getCoreSectionReport, getCoreSoilLibrary, validateCoreModel, type CoreBoundaryItem, type CoreJournalEntry, type CoreModel, type CoreReviewItem } from '@/lib/geologyCore'
import { buildCoreProfileDocument } from '@/lib/profileDocument'
import { addCoreActivity, addCoreFictitiousBorehole, addCoreGapDecision, addCoreLayer, addCoreManualCorrelation, changeCoreCharacteristic, changeCoreLayerCode, changeCoreLayerDepth, changeCorePassport, changeCoreSoilAppearance, deleteCoreLayer, removeCoreFictitiousBorehole, removeCoreGapDecision, removeCoreManualCorrelation, renameCoreBorehole, setCoreBoreholeIncluded, setCoreBoreholeReviewed, updateCoreFictitiousBorehole, updateCoreGapDecision, updateCoreManualCorrelation, type CoreSoilAppearanceField } from '@/lib/coreCommands'
import { getIgeKey, type CodeStatus, type CodeSummaryItem, type GapDecision, type GapDecisionKind, type GeoProject, type LayerNeighbors, type SoilCharacteristicField, type SoilCharacteristicKey } from '@/types/geology'
import './App.css'

const HISTORY_LIMIT = 50

export default function App() {
  const [coreModel, setCoreModel] = useState<CoreModel | null>(null)
  const [past, setPast] = useState<CoreModel[]>([])
  const [future, setFuture] = useState<CoreModel[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedId, setSelectedId] = useState('borehole-1')
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const [reviewIndex, setReviewIndex] = useState<number | null>(null)
  const [fitToken, setFitToken] = useState(0)
  const [focusToken, setFocusToken] = useState(0)
  const [showLabels, setShowLabels] = useState(true)
  const [showCodes, setShowCodes] = useState(true)
  const [geometryMode, setGeometryMode] = useState<'source' | 'verified'>('verified')
  const [importOpen, setImportOpen] = useState(false)
  const [soilLibraryOpen, setSoilLibraryOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error'>('saved')
  const [mobilePanel, setMobilePanel] = useState<'list' | 'inspector' | null>(null)
  const [correlationBoundary, setCorrelationBoundary] = useState<CoreBoundaryItem | null>(null)
  const [correlationTarget, setCorrelationTarget] = useState('')
  const [correlationNote, setCorrelationNote] = useState('')
  const [editingCorrelation, setEditingCorrelation] = useState<CoreBoundaryItem | null>(null)
  const [editingCorrelationLeft, setEditingCorrelationLeft] = useState('')
  const [editingCorrelationRight, setEditingCorrelationRight] = useState('')
  const [editingCorrelationNote, setEditingCorrelationNote] = useState('')
  const [gapBoundary, setGapBoundary] = useState<CoreBoundaryItem | null>(null)
  const [editingGapDecision, setEditingGapDecision] = useState<GapDecision | null>(null)
  const [gapKind, setGapKind] = useState<GapDecisionKind>('accepted')
  const [gapFraction, setGapFraction] = useState('50')
  const [gapNote, setGapNote] = useState('')
  const [fictitiousOpen, setFictitiousOpen] = useState(false)
  const [fictitiousPickMode, setFictitiousPickMode] = useState(false)
  const [editingFictitiousId, setEditingFictitiousId] = useState<string | null>(null)
  const [fictitiousLeft, setFictitiousLeft] = useState('')
  const [fictitiousRight, setFictitiousRight] = useState('')
  const [fictitiousFraction, setFictitiousFraction] = useState('50')
  const [fictitiousName, setFictitiousName] = useState('')
  const [fictitiousNote, setFictitiousNote] = useState('')

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
        const core = createCoreModel(value)
        setCoreModel(core)
        setSelectedId(core.boreholes[0]?.id || '')
      })
      .catch(reason => setLoadError(reason instanceof Error ? reason.message : 'Ошибка загрузки'))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const project = useMemo(() => coreModel ? createProjectFromCore(coreModel) : null, [coreModel])

  useEffect(() => {
    if (!project) return
    setSaveState('saving')
    const timer = window.setTimeout(() => {
      storeProject(project).then(() => setSaveState('saved')).catch(() => setSaveState('error'))
    }, 700)
    return () => window.clearTimeout(timer)
  }, [project])

  const issues = useMemo(() => coreModel ? getCoreIssues(coreModel) : [], [coreModel])
  const boundaries = useMemo(() => coreModel ? getCoreBoundaryModel(coreModel) : null, [coreModel])
  const sectionReport = useMemo(() => coreModel && boundaries
    ? getCoreSectionReport(coreModel, boundaries)
    : null, [coreModel, boundaries])
  const reviewItems = useMemo(() => sectionReport?.items || [], [sectionReport])
  const journalEntries = useMemo(() => coreModel ? getCoreJournalEntries(coreModel) : [], [coreModel])
  const codeSummary = useMemo(() => coreModel ? getCoreCodeSummary(coreModel) : [], [coreModel])
  const soilLibrary = useMemo(() => coreModel ? getCoreSoilLibrary(coreModel) : [], [coreModel])
  const profileDocument = useMemo(() => coreModel && boundaries ? buildCoreProfileDocument(coreModel, boundaries) : null, [coreModel, boundaries])
  const coreReport = useMemo(() => coreModel ? {
    stats: getCoreModelStats(coreModel),
    issues: validateCoreModel(coreModel)
  } : null, [coreModel])
  const selected = project?.columns.find(column => column.id === selectedId) || project?.columns[0]
  const selectedCore = coreModel?.boreholes.find(column => column.id === selected?.id) || null
  const selectedBoundaryIssues = boundaries && selectedCore
    ? getCoreBoreholeBoundaryIssues(boundaries, selectedCore.id)
    : []
  const selectedInterpolationIssues = selectedCore
    ? reviewItems.filter(item => item.source === 'interpolation' && item.boreholeId === selectedCore.id)
    : []
  const selectedLayer = selected?.layers.find(layer => layer.id === selectedLayerId) || null
  const indexedReview = reviewIndex !== null ? reviewItems[reviewIndex] : null
  const activeIssueId = indexedReview && indexedReview.boreholeId === selected?.id && (indexedReview.layerId || null) === selectedLayerId
    ? indexedReview.id
    : reviewItems.find(issue => issue.boreholeId === selected?.id && (issue.layerId || null) === selectedLayerId)?.id || null
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
  const allReviewed = activeColumns.length > 0 && reviewedCount === activeColumns.length
  const effectiveGeometryMode = allReviewed ? geometryMode : 'source'
  const layerCount = activeColumns.reduce((sum, column) => sum + column.layers.length, 0)
  const correlationSourceBoreholeId = correlationBoundary?.status === 'left-only'
    ? correlationBoundary.leftBoreholeId
    : correlationBoundary?.rightBoreholeId
  const correlationTargetBoreholeId = correlationBoundary?.status === 'left-only'
    ? correlationBoundary.rightBoreholeId
    : correlationBoundary?.leftBoreholeId
  const correlationSourceLayerId = correlationBoundary?.status === 'left-only'
    ? correlationBoundary.leftLayerId
    : correlationBoundary?.rightLayerId
  const correlationSource = coreModel?.boreholes.find(item => item.id === correlationSourceBoreholeId) || null
  const correlationTargetBorehole = coreModel?.boreholes.find(item => item.id === correlationTargetBoreholeId) || null
  const correlationSourceLayer = correlationSource?.layers.find(item => item.id === correlationSourceLayerId) || null
  const editingLeftBorehole = coreModel?.boreholes.find(item => item.id === editingCorrelation?.leftBoreholeId) || null
  const editingRightBorehole = coreModel?.boreholes.find(item => item.id === editingCorrelation?.rightBoreholeId) || null
  const gapDialogOpen = Boolean(gapBoundary || editingGapDecision)
  const gapDialogDescription = gapBoundary
    ? `${gapBoundary.leftBoreholeName}, подошва ${gapBoundary.leftOrdinal ?? '—'} ↔ ${gapBoundary.rightBoreholeName}, подошва ${gapBoundary.rightOrdinal ?? '—'}`
    : editingGapDecision
      ? boundaries?.inactiveGapDecisions.find(item => item.decision.id === editingGapDecision.id)?.description || 'Неактивное решение по разрыву'
      : ''
  const parsedGapFraction = Number(gapFraction.replace(',', '.')) / 100
  const gapFractionValid = Number.isFinite(parsedGapFraction) && parsedGapFraction > 0 && parsedGapFraction < 1
  const gapUnchanged = Boolean(editingGapDecision && editingGapDecision.kind === gapKind &&
    editingGapDecision.fraction === (gapKind === 'pinchout' ? parsedGapFraction : null) &&
    editingGapDecision.note === gapNote.trim())
  const editingFictitious = coreModel?.boreholes.find(item => item.id === editingFictitiousId && item.kind === 'fictitious') || null
  const parsedFictitiousFraction = Number(fictitiousFraction.replace(',', '.')) / 100
  const fictitiousPreview = useMemo(() => {
    if (!coreModel || !fictitiousLeft || !fictitiousRight) return { data: null, error: '' }
    try {
      return { data: getCoreFictitiousPreview(coreModel, fictitiousLeft, fictitiousRight, parsedFictitiousFraction), error: '' }
    } catch (reason) {
      return { data: null, error: reason instanceof Error ? reason.message : 'Не удалось построить предварительный расчёт' }
    }
  }, [coreModel, fictitiousLeft, fictitiousRight, parsedFictitiousFraction])
  const fictitiousUnchanged = Boolean(editingFictitious?.interpolation && fictitiousPreview.data &&
    !reviewItems.some(item => item.source === 'interpolation' && item.boreholeId === editingFictitiousId) &&
    editingFictitious.interpolation.fraction === parsedFictitiousFraction &&
    editingFictitious.interpolation.note === fictitiousNote.trim() &&
    editingFictitious.drawing.x === fictitiousPreview.data.x &&
    editingFictitious.drawing.top === fictitiousPreview.data.top &&
    editingFictitious.drawing.bottom === fictitiousPreview.data.bottom &&
    editingFictitious.layers.length === fictitiousPreview.data.layers.length &&
    editingFictitious.layers.every((layer, index) => {
      const previewLayer = fictitiousPreview.data!.layers[index]
      const expectedStatus = previewLayer.codeAgreed ? 'interpolated' : previewLayer.leftCode && previewLayer.rightCode ? 'ambiguous' : 'not-found'
      return layer.bottomDepth === previewLayer.depth && layer.igeCode === previewLayer.code &&
        layer.codeStatus === expectedStatus && layer.depthSource === 'interpolated'
    }))
  const fictitiousSources = selectedCore?.kind === 'fictitious' && selectedCore.interpolation && coreModel ? {
    left: coreModel.boreholes.find(item => item.id === selectedCore.interpolation?.leftBoreholeId)?.name || selectedCore.interpolation.leftBoreholeId,
    right: coreModel.boreholes.find(item => item.id === selectedCore.interpolation?.rightBoreholeId)?.name || selectedCore.interpolation.rightBoreholeId
  } : null

  const commitCore = (updater: (current: CoreModel) => CoreModel): boolean => {
    if (!coreModel) return false
    try {
      const next = updater(coreModel)
      if (next === coreModel) return false
      setPast(items => [...items, coreModel].slice(-HISTORY_LIMIT))
      setFuture([])
      setCoreModel(next)
      return true
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Не удалось выполнить команду ядра')
      return false
    }
  }

  const undo = () => {
    if (!coreModel || !past.length) return
    const previous = past[past.length - 1]
    setPast(items => items.slice(0, -1))
    setFuture(items => [coreModel, ...items].slice(0, HISTORY_LIMIT))
    setCoreModel(addCoreActivity(previous, 'Отменено последнее ручное действие'))
    toast.success('Последнее действие отменено')
  }

  const redo = () => {
    if (!coreModel || !future.length) return
    const next = future[0]
    setFuture(items => items.slice(1))
    setPast(items => [...items, coreModel].slice(-HISTORY_LIMIT))
    setCoreModel(addCoreActivity(next, 'Повторено отменённое действие'))
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
  }, [coreModel, past, future])

  const selectBorehole = (id: string) => {
    setSelectedId(id)
    setSelectedLayerId(null)
  }

  const selectIssue = (issue: CoreReviewItem) => {
    const index = reviewItems.findIndex(item => item.id === issue.id)
    if (issue.source === 'boundary') {
      const boundary = boundaries?.items.find(item => item.id === issue.boundaryId)
      if (boundary) selectBoundary(boundary)
      setReviewIndex(index >= 0 ? index : null)
      return
    }
    setReviewIndex(index >= 0 ? index : null)
    setSelectedId(issue.boreholeId)
    setSelectedLayerId(issue.layerId || null)
    setFocusToken(value => value + 1)
  }

  const selectLayerLocation = (boreholeId: string, layerId: string) => {
    const issueIndex = reviewItems.findIndex(issue => issue.boreholeId === boreholeId && issue.layerId === layerId)
    setReviewIndex(issueIndex >= 0 ? issueIndex : null)
    setSelectedId(boreholeId)
    setSelectedLayerId(layerId)
    setFocusToken(value => value + 1)
  }

  const selectCodeSummary = (item: CodeSummaryItem) => selectLayerLocation(item.boreholeId, item.layerId)

  const selectJournalEntry = (item: CoreJournalEntry) => {
    if (!item.targetBoreholeId) return
    if (item.targetLayerId) selectLayerLocation(item.targetBoreholeId, item.targetLayerId)
    else {
      setReviewIndex(null)
      setSelectedId(item.targetBoreholeId)
      setSelectedLayerId(null)
      setFocusToken(value => value + 1)
    }
  }

  const selectBoundary = (item: CoreBoundaryItem) => {
    const preferRight = item.status === 'right-only'
    const boreholeId = preferRight ? item.rightBoreholeId : item.leftBoreholeId
    const layerId = preferRight ? item.rightLayerId : item.leftLayerId
    if (layerId) selectLayerLocation(boreholeId, layerId)
    else if (item.rightLayerId) selectLayerLocation(item.rightBoreholeId, item.rightLayerId)
  }

  const openCorrelation = (item: CoreBoundaryItem) => {
    selectBoundary(item)
    setCorrelationTarget('')
    setCorrelationNote('')
    setCorrelationBoundary(item)
  }

  const submitCorrelation = () => {
    if (!correlationSourceLayerId || !correlationTarget) return
    if (commitCore(current => addCoreManualCorrelation(current, correlationSourceLayerId, correlationTarget, correlationNote))) {
      setCorrelationBoundary(null)
      toast.success('Ручная корреляция добавлена')
    }
  }

  const openCorrelationNote = (item: CoreBoundaryItem) => {
    if (!item.correlationId) return
    selectBoundary(item)
    setEditingCorrelationLeft(item.leftLayerId || '')
    setEditingCorrelationRight(item.rightLayerId || '')
    setEditingCorrelationNote(item.correlationNote)
    setEditingCorrelation(item)
  }

  const submitCorrelationNote = () => {
    if (!editingCorrelation?.correlationId || !editingCorrelationLeft || !editingCorrelationRight) return
    if (commitCore(current => updateCoreManualCorrelation(
      current,
      editingCorrelation.correlationId!,
      editingCorrelationLeft,
      editingCorrelationRight,
      editingCorrelationNote
    ))) {
      setEditingCorrelation(null)
      toast.success('Ручная корреляция обновлена')
    }
  }

  const removeCorrelation = (correlationId: string) => {
    if (commitCore(current => removeCoreManualCorrelation(current, correlationId))) {
      toast.success('Ручная корреляция снята')
    }
  }

  const closeGapDecision = () => {
    setGapBoundary(null)
    setEditingGapDecision(null)
  }

  const openGapDecision = (item: CoreBoundaryItem) => {
    selectBoundary(item)
    const decision = item.gapDecisionId
      ? coreModel?.gapDecisions.find(candidate => candidate.id === item.gapDecisionId) || null
      : null
    setGapBoundary(item)
    setEditingGapDecision(decision)
    setGapKind(decision?.kind || 'accepted')
    setGapFraction(decision?.fraction !== null && decision?.fraction !== undefined ? String(decision.fraction * 100) : '50')
    setGapNote(decision?.note || '')
  }

  const openInactiveGapDecision = (decision: GapDecision) => {
    setGapBoundary(null)
    setEditingGapDecision(decision)
    setGapKind(decision.kind)
    setGapFraction(decision.fraction !== null ? String(decision.fraction * 100) : '50')
    setGapNote(decision.note)
  }

  const submitGapDecision = () => {
    const fraction = gapKind === 'pinchout' ? parsedGapFraction : null
    const changed = editingGapDecision
      ? commitCore(current => updateCoreGapDecision(current, editingGapDecision.id, gapKind, fraction, gapNote))
      : gapBoundary
        ? commitCore(current => addCoreGapDecision(current, gapBoundary.leftLayerId, gapBoundary.rightLayerId, gapKind, fraction, gapNote))
        : false
    if (changed) {
      closeGapDecision()
      toast.success(editingGapDecision ? 'Решение по разрыву обновлено' : 'Решение по разрыву сохранено')
    }
  }

  const removeGapDecision = (decisionId: string) => {
    if (commitCore(current => removeCoreGapDecision(current, decisionId))) {
      if (editingGapDecision?.id === decisionId) closeGapDecision()
      toast.success('Решение по разрыву удалено')
    }
  }

  const closeFictitious = () => {
    setFictitiousOpen(false)
    setEditingFictitiousId(null)
  }

  const startFictitiousPick = () => {
    setFictitiousPickMode(true)
    toast('Укажите на разрезе место между двумя исходными DXF-скважинами')
  }

  const openFictitiousCreate = (leftId: string, rightId: string, fraction: number) => {
    if (!coreModel) return
    const left = coreModel.boreholes.find(item => item.id === leftId)
    const right = coreModel.boreholes.find(item => item.id === rightId)
    if (!left || !right) return
    setEditingFictitiousId(null)
    setFictitiousLeft(leftId)
    setFictitiousRight(rightId)
    setFictitiousFraction(String(Math.round(fraction * 10000) / 100))
    setFictitiousName(`Фиктивная ${left.name} — ${right.name}`)
    setFictitiousNote('')
    setFictitiousOpen(true)
  }

  const pickFictitiousPosition = (x: number) => {
    if (!coreModel) return
    const sources = coreModel.boreholes.filter(item => item.kind === 'dxf')
    for (let index = 0; index < sources.length - 1; index += 1) {
      const left = sources[index]
      const right = sources[index + 1]
      const fraction = (x - left.drawing.x) / (right.drawing.x - left.drawing.x)
      if (fraction > 0 && fraction < 1) {
        if (!left.included || !right.included) {
          toast.error('Между исключёнными исходными скважинами фиктивная не создаётся')
          return
        }
        setFictitiousPickMode(false)
        openFictitiousCreate(left.id, right.id, fraction)
        return
      }
    }
    toast.error('Укажите точку строго между двумя соседними исходными скважинами')
  }

  const openFictitiousEdit = (id: string, fraction?: number) => {
    const column = coreModel?.boreholes.find(item => item.id === id && item.kind === 'fictitious')
    if (!column?.interpolation) return
    setFictitiousPickMode(false)
    setEditingFictitiousId(id)
    setFictitiousLeft(column.interpolation.leftBoreholeId)
    setFictitiousRight(column.interpolation.rightBoreholeId)
    setFictitiousFraction(String(Math.round((fraction ?? column.interpolation.fraction) * 10000) / 100))
    setFictitiousName(column.name)
    setFictitiousNote(column.interpolation.note)
    setFictitiousOpen(true)
  }

  const submitFictitious = () => {
    if (!fictitiousPreview.data || !fictitiousName.trim() || !fictitiousNote.trim()) return
    if (editingFictitiousId && fictitiousUnchanged) {
      closeFictitious()
      toast('Пересчёт не потребовался: сохранённые глубины и положение уже соответствуют правилу')
      return
    }
    let selectedId = editingFictitiousId
    const changed = commitCore(current => {
      if (editingFictitiousId) return updateCoreFictitiousBorehole(current, editingFictitiousId, parsedFictitiousFraction, fictitiousNote)
      const result = addCoreFictitiousBorehole(current, fictitiousLeft, fictitiousRight, parsedFictitiousFraction, fictitiousName, fictitiousNote)
      selectedId = result.boreholeId
      return result.model
    })
    if (changed) {
      if (selectedId) {
        setSelectedId(selectedId)
        setSelectedLayerId(null)
        setFocusToken(value => value + 1)
      }
      closeFictitious()
      toast.success(editingFictitiousId ? 'Фиктивная скважина пересчитана по явной команде' : 'Фиктивная скважина добавлена')
    }
  }

  const deleteFictitious = () => {
    if (!selectedCore || selectedCore.kind !== 'fictitious' || !coreModel) return
    const index = coreModel.boreholes.findIndex(item => item.id === selectedCore.id)
    const nextId = coreModel.boreholes[index + 1]?.id || coreModel.boreholes[index - 1]?.id || ''
    if (commitCore(current => removeCoreFictitiousBorehole(current, selectedCore.id))) {
      setSelectedId(nextId)
      setSelectedLayerId(null)
      toast.success('Фиктивная скважина удалена; действие можно отменить')
    }
  }

  const stepIssue = (direction: -1 | 1) => {
    if (!reviewItems.length) return
    const selectedIndex = reviewItems.findIndex(issue => issue.id === activeIssueId)
    let nextIndex: number
    if (selectedIndex >= 0) nextIndex = (selectedIndex + direction + reviewItems.length) % reviewItems.length
    else if (reviewIndex !== null) nextIndex = direction > 0
      ? Math.min(Math.max(reviewIndex, 0), reviewItems.length - 1)
      : Math.max(Math.min(reviewIndex - 1, reviewItems.length - 1), 0)
    else nextIndex = direction > 0 ? 0 : reviewItems.length - 1
    selectIssue(reviewItems[nextIndex])
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
    if (commitCore(current => changeCorePassport(current, code, field, value))) {
      toast.success(`Паспорт ИГЭ ${code} обновлён`)
    }
  }

  const changeSoilAppearance = (code: string, field: CoreSoilAppearanceField, value: string) => {
    commitCore(current => changeCoreSoilAppearance(current, code, field, value))
  }

  const changeCharacteristic = (
    code: string,
    property: SoilCharacteristicKey,
    field: SoilCharacteristicField,
    value: number | string | null
  ) => {
    if (commitCore(current => changeCoreCharacteristic(current, code, property, field, value))) {
      toast.success(`Характеристика ИГЭ ${code} обновлена`)
    }
  }

  const addLayer = (depth: number, code: string) => {
    if (!coreModel || !selected) return
    try {
      const result = addCoreLayer(coreModel, selected.id, selectedLayer?.id || null, depth, code)
      commitCore(() => result.model)
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
    const completesReview = reviewing && activeColumns.every(column => column.id === selected.id || column.isReviewed)
    if (commitCore(current => setCoreBoreholeReviewed(current, selected.id, reviewing))) {
      if (completesReview) setGeometryMode('verified')
      toast.success(reviewing ? 'Скважина отмечена как проверенная' : 'Скважина возвращена на проверку')
      if (completesReview) toast.success('Все активные скважины подтверждены', {
        description: 'Включён проверенный разрез: исходные линии DXF скрыты, геометрия построена заново из канонической модели.'
      })
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
    const next = await createCoreFromFiles(dxf, axis)
    setCoreModel(next)
    setPast([])
    setFuture([])
    setSelectedId(next.boreholes[0]?.id || '')
    setSelectedLayerId(null)
    setReviewIndex(null)
    setFitToken(value => value + 1)
    toast.success(`Проект построен: ${next.boreholes.length} колонок`)
  }

  const openSavedProject = async (file: File) => {
    const next = await readCoreProjectFile(file)
    setCoreModel(next)
    setPast([])
    setFuture([])
    setSelectedId(next.boreholes.find(column => column.included)?.id || next.boreholes[0]?.id || '')
    setSelectedLayerId(null)
    setReviewIndex(null)
    setFitToken(value => value + 1)
    toast.success(`Проект «${next.project.title}» открыт`)
  }

  if (loading) return <div className="app-loading"><div className="brand-mark">ГЕО<span>/</span>РАЗРЕЗ</div><div className="loading-line"><span /></div><p>Загружаем геологический проект…</p></div>
  if (loadError || !coreModel || !project) return <div className="app-loading"><div className="brand-mark">ГЕО<span>/</span>РАЗРЕЗ</div><p>{loadError || 'Проект не найден'}</p><button type="button" className="button primary" onClick={() => window.location.reload()}>Повторить загрузку</button></div>

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
        <BoreholeList project={project} issues={issues} boundaries={boundaries!} selectedId={selected?.id || ''} onSelect={id => { selectBorehole(id); setMobilePanel(null) }} />
        <section className="workspace-center">
          <div className="viewer-toolbar">
            <div className="viewer-title"><span className="panel-kicker">РАБОЧАЯ ОБЛАСТЬ</span><h1>Инженерно-геологический разрез</h1></div>
            <div className="viewer-actions">
              <div className="geometry-mode-switch" role="group" aria-label="Представление геометрии разреза">
                <button type="button" data-geometry-mode-button="source" className={effectiveGeometryMode === 'source' ? 'toggle-button active' : 'toggle-button'} onClick={() => setGeometryMode('source')} aria-pressed={effectiveGeometryMode === 'source'} title="Исходные линии DXF и расчётные границы для проверки">Исходный DXF</button>
                <button type="button" data-geometry-mode-button="verified" className={effectiveGeometryMode === 'verified' ? 'toggle-button active' : 'toggle-button'} disabled={!allReviewed} onClick={() => setGeometryMode('verified')} aria-pressed={effectiveGeometryMode === 'verified'} title={allReviewed ? 'Производная геометрия без исходных линий DXF' : `Подтверждено ${reviewedCount} из ${activeColumns.length} активных скважин`}>Проверенный разрез</button>
              </div>
              <button type="button" className={showLabels ? 'toggle-button active' : 'toggle-button'} onClick={() => setShowLabels(value => !value)} aria-pressed={showLabels}><Tags size={15} /> Подписи</button>
              <button type="button" className={showCodes ? 'toggle-button active' : 'toggle-button'} onClick={() => setShowCodes(value => !value)} aria-pressed={showCodes}><Layers3 size={15} /> ИГЭ</button>
              <button type="button" className="toggle-button" onClick={() => setSoilLibraryOpen(true)}><Palette size={15} /> Грунты</button>
              <button type="button" className="toggle-button" onClick={() => setProfileOpen(true)}><Printer size={15} /> Профиль</button>
              <button type="button" className={fictitiousPickMode ? 'toggle-button active' : 'toggle-button'} onClick={fictitiousPickMode ? () => setFictitiousPickMode(false) : startFictitiousPick} aria-pressed={fictitiousPickMode}><Plus size={15} /> {fictitiousPickMode ? 'Отменить выбор' : 'Фиктивная'}</button>
              <button type="button" className="toggle-button" onClick={() => setFitToken(value => value + 1)}><MapPin size={15} /> Обзор</button>
            </div>
          </div>
          <div className="project-metrics">
            <div><strong>{activeColumns.length}</strong><span>в расчёте · {coreReport?.stats.sourceBoreholes || 0} DXF · {coreReport?.stats.fictitious || 0} фиктивных</span></div>
            <div><strong>{layerCount}</strong><span>подошв слоёв</span></div>
            <div className="metric-warning"><strong>{issues.filter(i => i.kind === 'ambiguous-code').length}</strong><span>неоднозначных ИГЭ</span></div>
            <div><strong>{reviewedCount}</strong><span>проверено · {project.columns.filter(c => c.sourceNamed).length} имён DXF</span></div>
            <span className="real-data-badge">{effectiveGeometryMode === 'verified' ? 'Производная геометрия · исходный DXF сохранён' : 'Исходный DXF сохранён'}</span>
          </div>
          <ProfileCanvas project={project} boundaries={boundaries!} profile={profileDocument} geometryMode={effectiveGeometryMode} selectedId={selected?.id || ''} selectedLayer={selectedLayer} onSelect={id => { selectBorehole(id); setFocusToken(value => value + 1) }} onDepthChange={changeDepth} onCandidateSelect={code => { if (selectedLayer) changeCode(selectedLayer.id, code, 'manual') }} showLabels={showLabels} showCodes={showCodes} fitToken={fitToken} focusToken={focusToken} fictitiousPickMode={fictitiousPickMode} onFictitiousPosition={pickFictitiousPosition} onFictitiousMove={openFictitiousEdit} />
          <IssueDock issues={reviewItems} activity={journalEntries} codeSummary={codeSummary} boundaries={boundaries!} activeIssueId={activeIssueId} activeCodeKey={activeCodeKey} activeLayerId={selectedLayerId} onSelect={selectIssue} onSelectCode={selectCodeSummary} onSelectBoundary={selectBoundary} onCorrelateBoundary={openCorrelation} onEditCorrelation={openCorrelationNote} onRemoveCorrelation={removeCorrelation} onDecideGap={openGapDecision} onEditInactiveGapDecision={openInactiveGapDecision} onRemoveGapDecision={removeGapDecision} onSelectActivity={selectJournalEntry} onStep={stepIssue} />
        </section>
        <div className="mobile-panel-close inspector-close"><button type="button" onClick={() => setMobilePanel(null)}>Закрыть</button></div>
        {selected && selectedCore && <Inspector column={selected} coreColumn={selectedCore} boundaryIssues={selectedBoundaryIssues} interpolationIssues={selectedInterpolationIssues} selectedLayerId={selectedLayerId} igePassport={selectedPassport} igeLayerCount={selectedPassportLayerCount} layerNeighbors={selectedNeighbors} fictitiousSources={fictitiousSources} onNeighborSelect={selectLayerLocation} onPassportChange={changePassport} onCharacteristicChange={changeCharacteristic} onLayerSelect={setSelectedLayerId} onLayerAdd={addLayer} onLayerDelete={deleteLayer} onRename={renameSelected} onDepthChange={changeDepth} onCodeChange={changeCode} onToggleExcluded={toggleSelectedExcluded} onToggleReviewed={toggleSelectedReviewed} onEditFictitious={() => openFictitiousEdit(selectedCore.id)} onDeleteFictitious={deleteFictitious} />}
      </main>

      <footer className="app-statusbar">
        <span><span className={`status-dot ${saveState === 'error' ? 'danger' : 'success'}`} /> Локальный проект · данные только в этом браузере</span>
        <span title="Геометрия, топологические статусы, соседи и сводка ИГЭ рассчитываются из канонической модели">Ядро 0.43.1 · {coreReport?.stats.boreholes || 0} скважин · {coreReport?.stats.layers || 0} слоёв · структурных ошибок: {coreReport?.issues.length || 0}</span>
        <span>Прототип 0.43.1</span>
      </footer>
      <Dialog open={Boolean(correlationBoundary)} onOpenChange={open => { if (!open) setCorrelationBoundary(null) }}>
        <DialogContent className="exclude-dialog">
          <DialogHeader>
            <DialogTitle>Ручная корреляция подошв</DialogTitle>
            <DialogDescription>Связываются только существующие подошвы соседних активных скважин. Глубины и исходный DXF не изменяются; освобождённая порядковая подошва останется в очереди разрывов.</DialogDescription>
          </DialogHeader>
          {correlationSource && correlationSourceLayer && correlationTargetBorehole && <form onSubmit={event => { event.preventDefault(); submitCorrelation() }}>
            <div className="correlation-source">
              <span>Исходная подошва</span>
              <strong>{correlationSource.name} · №{correlationSourceLayer.ordinal} · {String(correlationSourceLayer.bottomDepth).replace('.', ',')} м</strong>
            </div>
            <label className="field-label" htmlFor="correlation-target">Подошва в скважине {correlationTargetBorehole.name}</label>
            <select id="correlation-target" className="name-input" value={correlationTarget} onChange={event => setCorrelationTarget(event.target.value)} required>
              <option value="">Выберите подошву явно</option>
              {correlationTargetBorehole.layers.map(layer => <option key={layer.id} value={layer.id}>№{layer.ordinal} · {String(layer.bottomDepth).replace('.', ',')} м{layer.igeCode ? ` · ${layer.igeCode}` : ' · ИГЭ не задан'}</option>)}
            </select>
            <label className="field-label correlation-note-label" htmlFor="correlation-note">Инженерное обоснование</label>
            <textarea id="correlation-note" className="reason-input" value={correlationNote} onChange={event => setCorrelationNote(event.target.value)} placeholder="Например: корреляция по описанию разреза и положению подошвы" required />
            <div className="import-actions">
              <button type="button" className="button secondary" onClick={() => setCorrelationBoundary(null)}>Отмена</button>
              <button type="submit" className="button primary" disabled={!correlationTarget || !correlationNote.trim()}>Добавить связь</button>
            </div>
          </form>}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(editingCorrelation)} onOpenChange={open => { if (!open) setEditingCorrelation(null) }}>
        <DialogContent className="exclude-dialog correlation-note-dialog">
          <DialogHeader>
            <DialogTitle>Изменить ручную корреляцию</DialogTitle>
            <DialogDescription>Можно явно выбрать другие существующие подошвы и уточнить обоснование. Глубины, исходные коды ИГЭ и геометрия DXF не изменяются; конфликтующие связи не перестраиваются автоматически.</DialogDescription>
          </DialogHeader>
          {editingCorrelation && editingLeftBorehole && editingRightBorehole && <form onSubmit={event => { event.preventDefault(); submitCorrelationNote() }}>
            <div className="correlation-source">
              <span>Текущая связь</span>
              <strong>{editingCorrelation.leftBoreholeName} · №{editingCorrelation.leftOrdinal ?? '—'} ↔ {editingCorrelation.rightBoreholeName} · №{editingCorrelation.rightOrdinal ?? '—'}</strong>
            </div>
            <div className="correlation-edit-grid">
              <div>
                <label className="field-label" htmlFor="correlation-left-edit">Подошва слева · {editingLeftBorehole.name}</label>
                <select id="correlation-left-edit" className="name-input" value={editingCorrelationLeft} onChange={event => setEditingCorrelationLeft(event.target.value)} required>
                  {editingLeftBorehole.layers.map(layer => <option key={layer.id} value={layer.id}>№{layer.ordinal} · {String(layer.bottomDepth).replace('.', ',')} м{layer.igeCode ? ` · ${layer.igeCode}` : ' · ИГЭ не задан'}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="correlation-right-edit">Подошва справа · {editingRightBorehole.name}</label>
                <select id="correlation-right-edit" className="name-input" value={editingCorrelationRight} onChange={event => setEditingCorrelationRight(event.target.value)} required>
                  {editingRightBorehole.layers.map(layer => <option key={layer.id} value={layer.id}>№{layer.ordinal} · {String(layer.bottomDepth).replace('.', ',')} м{layer.igeCode ? ` · ${layer.igeCode}` : ' · ИГЭ не задан'}</option>)}
                </select>
              </div>
            </div>
            <label className="field-label correlation-note-label" htmlFor="correlation-note-edit">Инженерное обоснование</label>
            <textarea id="correlation-note-edit" className="reason-input" value={editingCorrelationNote} onChange={event => setEditingCorrelationNote(event.target.value)} required />
            <div className="import-actions">
              <button type="button" className="button secondary" onClick={() => setEditingCorrelation(null)}>Отмена</button>
              <button type="submit" className="button primary" disabled={!editingCorrelationLeft || !editingCorrelationRight || !editingCorrelationNote.trim() || editingCorrelationLeft === editingCorrelation.leftLayerId && editingCorrelationRight === editingCorrelation.rightLayerId && editingCorrelationNote.trim() === editingCorrelation.correlationNote}>Сохранить изменения</button>
            </div>
          </form>}
        </DialogContent>
      </Dialog>
      <Dialog open={gapDialogOpen} onOpenChange={open => { if (!open) closeGapDecision() }}>
        <DialogContent className="exclude-dialog gap-decision-dialog">
          <DialogHeader>
            <DialogTitle>{editingGapDecision ? 'Изменить решение по разрыву' : 'Решение по разрыву корреляции'}</DialogTitle>
            <DialogDescription>Разрыв можно принять без новой линии либо задать явную точку выклинивания. Глубины, коды ИГЭ и исходный DXF не изменяются. Для выклинивания нужна однозначно соединённая верхняя граница; для первого слоя используется поверхность.</DialogDescription>
          </DialogHeader>
          <form onSubmit={event => { event.preventDefault(); submitGapDecision() }}>
            <div className="correlation-source"><span>Участок и подошвы</span><strong>{gapDialogDescription}</strong></div>
            <div className="gap-decision-options" role="radiogroup" aria-label="Тип решения по разрыву">
              <label><input type="radio" name="gap-kind" value="accepted" checked={gapKind === 'accepted'} onChange={() => setGapKind('accepted')} /><span>Принять разрыв<small>Сохранить разрыв без построения линии</small></span></label>
              <label><input type="radio" name="gap-kind" value="pinchout" checked={gapKind === 'pinchout'} onChange={() => setGapKind('pinchout')} /><span>Задать выклинивание<small>Свести нижнюю и верхнюю границы в явной точке</small></span></label>
            </div>
            {gapKind === 'pinchout' && <div className="gap-fraction-field">
              <label className="field-label" htmlFor="gap-fraction">Точка от левой скважины к правой, % участка</label>
              <input id="gap-fraction" className="name-input" type="number" min="0.01" max="99.99" step="0.01" value={gapFraction} onChange={event => setGapFraction(event.target.value)} required />
              {!gapFractionValid && <p className="import-error">Введите значение больше 0 и меньше 100. Нулевая или отрицательная мощность не создаётся.</p>}
            </div>}
            <label className="field-label correlation-note-label" htmlFor="gap-note">Инженерное обоснование</label>
            <textarea id="gap-note" className="reason-input" value={gapNote} onChange={event => setGapNote(event.target.value)} placeholder="Укажите основание решения и источник геологической корреляции" required />
            <div className="import-actions">
              <button type="button" className="button secondary" onClick={closeGapDecision}>Отмена</button>
              <button type="submit" className="button primary" disabled={!gapNote.trim() || gapKind === 'pinchout' && !gapFractionValid || gapUnchanged}>{editingGapDecision ? 'Сохранить изменения' : 'Сохранить решение'}</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={fictitiousOpen} onOpenChange={open => { if (!open) closeFictitious() }}>
        <DialogContent className="exclude-dialog fictitious-dialog">
          <DialogHeader>
            <DialogTitle>{editingFictitious ? 'Пересчёт фиктивной скважины' : 'Новая фиктивная скважина'}</DialogTitle>
            <DialogDescription>Проверьте будущие глубины и коды до сохранения. Линейная интерполяция выполняется только по этой явной команде; исходные скважины и DXF не изменяются.</DialogDescription>
          </DialogHeader>
          <form onSubmit={event => { event.preventDefault(); submitFictitious() }}>
            <div className="fictitious-endpoints">
              <div>
                <label className="field-label" htmlFor="fictitious-left">Исходная скважина слева</label>
                <select id="fictitious-left" className="name-input" value={fictitiousLeft} onChange={event => setFictitiousLeft(event.target.value)} disabled={Boolean(editingFictitious)} required>
                  {coreModel.boreholes.filter(item => item.kind === 'dxf').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="fictitious-right">Исходная скважина справа</label>
                <select id="fictitious-right" className="name-input" value={fictitiousRight} onChange={event => setFictitiousRight(event.target.value)} disabled={Boolean(editingFictitious)} required>
                  {coreModel.boreholes.filter(item => item.kind === 'dxf').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
            </div>
            <div className="fictitious-endpoints secondary-fields">
              <div>
                <label className="field-label" htmlFor="fictitious-fraction">Положение от левой скважины, %</label>
                <input id="fictitious-fraction" className="name-input" type="number" min="0.01" max="99.99" step="0.01" value={fictitiousFraction} onChange={event => setFictitiousFraction(event.target.value)} required />
              </div>
              <div>
                <label className="field-label" htmlFor="fictitious-name">Наименование</label>
                <input id="fictitious-name" className="name-input" value={fictitiousName} onChange={event => setFictitiousName(event.target.value)} disabled={Boolean(editingFictitious)} required />
              </div>
            </div>
            {fictitiousPreview.error && <div className="import-error" role="alert">{fictitiousPreview.error}</div>}
            {fictitiousPreview.data && <div className="fictitious-preview" data-fictitious-preview>
              <div className="fictitious-preview-summary">
                <span>ПК <strong>{fictitiousPreview.data.pk.toFixed(2).replace('.', ',')}</strong></span>
                <span>Подошв <strong>{fictitiousPreview.data.layers.length}</strong></span>
                <span>Совпадающих ИГЭ <strong>{fictitiousPreview.data.layers.filter(item => item.codeAgreed).length}</strong></span>
              </div>
              {!fictitiousPreview.data.coordinates && <p className="import-error">ПК находится вне диапазона оси: координаты X и Y не экстраполируются.</p>}
              <div className="fictitious-preview-table" role="table" aria-label="Предварительный расчёт слоёв">
                <div className="fictitious-preview-head" role="row"><span>№</span><span>{fictitiousPreview.data.leftName}</span><span>Расчёт</span><span>{fictitiousPreview.data.rightName}</span></div>
                {fictitiousPreview.data.layers.map(layer => <div className={layer.codeAgreed ? '' : 'needs-code-review'} role="row" key={layer.ordinal} data-preview-layer={layer.ordinal}>
                  <span>{layer.ordinal}</span>
                  <span>{layer.leftDepth.toFixed(2).replace('.', ',')} м<small>{layer.leftCode || 'ИГЭ —'}</small></span>
                  <span><strong>{layer.depth.toFixed(3).replace('.', ',')} м</strong><small>{layer.codeAgreed ? layer.code : 'ИГЭ требует ручного выбора'}</small></span>
                  <span>{layer.rightDepth.toFixed(2).replace('.', ',')} м<small>{layer.rightCode || 'ИГЭ —'}</small></span>
                </div>)}
              </div>
              {fictitiousPreview.data.layers.some(layer => !layer.codeAgreed) && <p>Разные или отсутствующие коды не выбираются автоматически. Такие слои после сохранения попадут в очередь проверки.</p>}
            </div>}
            <label className="field-label correlation-note-label" htmlFor="fictitious-note">Инженерное обоснование</label>
            <textarea id="fictitious-note" className="reason-input" value={fictitiousNote} onChange={event => setFictitiousNote(event.target.value)} placeholder="Укажите основание для добавления расчётной скважины и применения линейной интерполяции" required />
            <div className="import-actions">
              <button type="button" className="button secondary" onClick={closeFictitious}>Отмена</button>
              <button type="submit" className="button primary" disabled={!fictitiousPreview.data || !fictitiousName.trim() || !fictitiousNote.trim()}>{editingFictitious ? 'Подтвердить пересчёт' : 'Добавить фиктивную'}</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {profileDocument && <ProfileDocumentDialog open={profileOpen} profile={profileDocument} verified={allReviewed} onOpenChange={setProfileOpen} />}
      <SoilLibraryDialog open={soilLibraryOpen} items={soilLibrary} onOpenChange={setSoilLibraryOpen} onAppearanceChange={changeSoilAppearance} onSelect={item => { selectCodeSummary(item); setSoilLibraryOpen(false) }} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onImport={importProject} onOpenProject={openSavedProject} />
    </div>
  )
}
