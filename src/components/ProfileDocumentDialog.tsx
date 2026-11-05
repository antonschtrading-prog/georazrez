import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, FileImage, FileOutput, FileText, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ProfileSheetSvg } from '@/components/ProfileSheetSvg'
import type { CoreProfileDocument } from '@/lib/profileDocument'
import { exportProfilePdf, exportProfileSvg } from '@/lib/profileExport'
import { exportCoreProfileDxf } from '@/lib/profileDxfExport'

interface Props {
  open: boolean
  profile: CoreProfileDocument
  verified: boolean
  onOpenChange: (open: boolean) => void
}

export function ProfileDocumentDialog({ open, profile, verified, onOpenChange }: Props) {
  const [requestedIndex, setRequestedIndex] = useState(0)
  const [busy, setBusy] = useState<'svg' | 'pdf' | null>(null)
  const [exportError, setExportError] = useState('')
  const exportHost = useRef<HTMLDivElement>(null)
  const sheetIndex = Math.min(requestedIndex, Math.max(profile.sheets.length - 1, 0))
  const sheet = profile.sheets[sheetIndex] || null

  const exportSvg = () => {
    if (!exportHost.current || busy) return
    setExportError('')
    try {
      exportProfileSvg(exportHost.current, profile)
      toast.success(`SVG сформирован: ${profile.sheets.length} листов`)
    } catch (reason) {
      setExportError(reason instanceof Error ? reason.message : 'Не удалось сформировать SVG')
    }
  }

  const exportPdf = async () => {
    if (!exportHost.current || busy) return
    setBusy('pdf')
    setExportError('')
    try {
      await exportProfilePdf(exportHost.current, profile)
      toast.success(`PDF сформирован: ${profile.sheets.length} страниц A3`)
    } catch (reason) {
      setExportError(reason instanceof Error ? reason.message : 'Не удалось сформировать PDF')
    } finally {
      setBusy(null)
    }
  }

  const exportDxf = () => {
    if (busy) return
    setExportError('')
    try {
      const stats = exportCoreProfileDxf(profile)
      toast.success(`Производный DXF сформирован: ${stats.boreholes} скважин, ${stats.bands} оформленных участков`)
    } catch (reason) {
      setExportError(reason instanceof Error ? reason.message : 'Не удалось сформировать DXF')
    }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="profile-document-dialog">
      <DialogHeader>
        <DialogTitle>Оформленный профиль</DialogTitle>
        <DialogDescription>{verified ? 'Проверенная производная геометрия совпадает с рабочим экраном. ' : 'Предварительная производная геометрия: активные скважины подтверждены ещё не все. '}Производные листы A3 с выбранными цветами, штриховками и легендой. Исходный DXF, глубины и коды ИГЭ не изменяются.</DialogDescription>
      </DialogHeader>
      {sheet ? <>
        <div className="profile-document-toolbar">
          <div className="profile-sheet-nav">
            <button type="button" className="icon-button" onClick={() => setRequestedIndex(index => Math.max(0, index - 1))} disabled={sheetIndex === 0} aria-label="Предыдущий лист профиля"><ChevronLeft size={18} /></button>
            <select id="profile-sheet" aria-label="Лист профиля" value={sheetIndex} onChange={event => setRequestedIndex(Number(event.target.value))}>
              {profile.sheets.map(item => <option value={item.index - 1} key={item.index}>Лист {item.index} / {profile.sheets.length}</option>)}
            </select>
            <button type="button" className="icon-button" onClick={() => setRequestedIndex(index => Math.min(profile.sheets.length - 1, index + 1))} disabled={sheetIndex === profile.sheets.length - 1} aria-label="Следующий лист профиля"><ChevronRight size={18} /></button>
          </div>
          <span>{profile.boreholeCount} скважин · {profile.bandCount} участков заливки · {profile.unfilledIntervals} без полной геометрии</span>
          <div className="profile-export-actions">
            <button type="button" className="button secondary" onClick={exportDxf} disabled={Boolean(busy)}><FileOutput size={16} /> DXF · производный</button>
            <button type="button" className="button secondary" onClick={exportSvg} disabled={Boolean(busy)}><FileImage size={16} /> SVG · все листы</button>
            <button type="button" className="button primary" onClick={exportPdf} disabled={Boolean(busy)}>{busy === 'pdf' ? <LoaderCircle className="spin" size={16} /> : <FileText size={16} />} PDF · все листы</button>
          </div>
        </div>
        <div className="profile-document-preview" data-profile-preview={sheet.index}>
          <ProfileSheetSvg profile={profile} sheet={sheet} />
        </div>
        <div className="profile-document-footnote">
          <span>Незакрашенные интервалы показывают отсутствие полной пары границ или согласованного ИГЭ; программа не дорисовывает их автоматически.</span>
          <span>PDF содержит локально растрированные листы; SVG сохраняет векторную геометрию. DXF сохраняется новым производным файлом из той же геометрии, что и проверенный экран, и не перезаписывает источник.</span>
        </div>
        {exportError && <div className="import-error" role="alert">{exportError}</div>}
      </> : <div className="issue-empty">В активном разрезе нет скважин для формирования профиля.</div>}
      <div className="profile-export-sheets" ref={exportHost} aria-hidden="true">
        {profile.sheets.map(item => <ProfileSheetSvg profile={profile} sheet={item} key={item.index} />)}
      </div>
    </DialogContent>
  </Dialog>
}
