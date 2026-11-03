import { useEffect, useRef, useState } from 'react'
import { FileSpreadsheet, FileUp, LoaderCircle, ShieldCheck, Upload } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (dxf: File, axis: File) => Promise<void>
}

export function ImportDialog({ open, onOpenChange, onImport }: Props) {
  const [dxf, setDxf] = useState<File | null>(null)
  const [axis, setAxis] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dxfInput = useRef<HTMLInputElement>(null)
  const axisInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) { setError(''); setBusy(false) }
  }, [open])

  const submit = async () => {
    if (!dxf || !axis) return
    setBusy(true)
    setError('')
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      await onImport(dxf, axis)
      setDxf(null)
      setAxis(null)
      onOpenChange(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось обработать файлы')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value) }}>
      <DialogContent className="import-dialog" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Новый проект из исходников</DialogTitle>
          <DialogDescription>Файлы обрабатываются локально. Текущий проект останется доступен до успешного завершения импорта.</DialogDescription>
        </DialogHeader>
        <div className="import-files">
          <input ref={dxfInput} type="file" accept=".dxf" hidden onChange={event => setDxf(event.target.files?.[0] || null)} />
          <input ref={axisInput} type="file" accept=".xlsx" hidden onChange={event => setAxis(event.target.files?.[0] || null)} />
          <button type="button" className={`file-drop ${dxf ? 'has-file' : ''}`} onClick={() => dxfInput.current?.click()} disabled={busy}>
            <FileUp size={22} />
            <span><strong>{dxf ? dxf.name : 'Выберите геологический DXF'}</strong><small>{dxf ? `${(dxf.size / 1024 / 1024).toFixed(2)} МБ` : 'Раздел ENTITIES · слой ГЕОЛОГИЯ'}</small></span>
            <span className="file-action">{dxf ? 'Заменить' : 'Выбрать'}</span>
          </button>
          <button type="button" className={`file-drop ${axis ? 'has-file' : ''}`} onClick={() => axisInput.current?.click()} disabled={busy}>
            <FileSpreadsheet size={22} />
            <span><strong>{axis ? axis.name : 'Выберите ведомость оси XLSX'}</strong><small>{axis ? `${(axis.size / 1024).toFixed(0)} КБ` : 'Столбцы B=ПК, C=X, D=Y'}</small></span>
            <span className="file-action">{axis ? 'Заменить' : 'Выбрать'}</span>
          </button>
        </div>
        <div className="privacy-note"><ShieldCheck size={17} /><span>Без AutoCAD, Excel, облака и платных сервисов. Импортированный проект сохраняется в этом браузере.</span></div>
        {error && <div className="import-error" role="alert">{error}</div>}
        <div className="import-actions">
          <button type="button" className="button secondary" onClick={() => onOpenChange(false)} disabled={busy}>Отмена</button>
          <button type="button" className="button primary" onClick={submit} disabled={!dxf || !axis || busy}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <Upload size={16} />}
            {busy ? 'Строим разрез…' : 'Сформировать проект'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
