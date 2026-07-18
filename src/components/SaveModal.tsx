import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useGameStore } from '../store/gameStore.ts'
import { exportSave, importSave } from '../engine/save.ts'
import { saveNow } from '../engine/autosave.ts'
import { STRINGS } from '../data/strings.ts'
import Modal from './Modal.tsx'

// T4.2 백업(export/import) 모달 + E-3.2 파일 백업(.potionsave).
// 열림 상태는 부모(Header)의 로컬 상태. 현재 세이브 문자열 생성 + 붙여넣기/파일 복원(2단계 인라인 확인).
interface Props {
  onClose: () => void
}

// File System Access API 최소 타입(미지원 브라우저에선 undefined → a[download]/input 폴백).
type SaveFilePicker = (opts: {
  suggestedName?: string
  types?: { description: string; accept: Record<string, string[]> }[]
}) => Promise<{
  createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }>
}>
type OpenFilePicker = (opts: {
  multiple?: boolean
  types?: { description: string; accept: Record<string, string[]> }[]
}) => Promise<Array<{ getFile: () => Promise<File> }>>

const FILE_EXT = '.potionsave'
const FILE_TYPES = [{ description: 'POTIONWORKS save', accept: { 'text/plain': [FILE_EXT] } }]

export default function SaveModal({ onClose }: Props) {
  const loadSave = useGameStore((s) => s.loadSave)

  // export 문자열은 모달을 여는 순간의 스냅샷으로 고정(마운트 시 1회).
  const [exportStr] = useState(() => exportSave(useGameStore.getState()))
  const [importStr, setImportStr] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // 덮어쓰기 인라인 확인(window.confirm 대체, SettingsModal 하드리셋 패턴). 1차=경고 노출, 2차=실행.
  const [confirmImport, setConfirmImport] = useState(false)
  const [restored, setRestored] = useState(false)
  // 파일에서 읽음 안내(파일 백업). error와 별개 — 읽기 성공/실패를 구분해 보여준다.
  const [fileMsg, setFileMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (closeTimer.current !== null) clearTimeout(closeTimer.current)
    },
    [],
  )

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportStr)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError(STRINGS.save.copyError)
    }
  }

  const handleImport = () => {
    const save = importSave(importStr)
    if (!save) {
      setError(STRINGS.save.importError)
      setConfirmImport(false)
      return
    }
    // 1차 클릭: 덮어쓰기 경고만 노출(window.confirm 대체).
    if (!confirmImport) {
      setConfirmImport(true)
      return
    }
    // 2차 클릭: 실제 복원 + 즉시 저장 + 성공 피드백. 잠시 뒤 자동으로 닫는다.
    loadSave(save)
    saveNow() // 복원 즉시 localStorage 반영 + "저장됨" 시각 갱신
    setRestored(true)
    setConfirmImport(false)
    closeTimer.current = setTimeout(onClose, 1200)
  }

  // E-3.2 파일로 내보내기: File System Access(showSaveFilePicker) 우선, 미지원 시 a[download] 폴백.
  //   내용은 export 문자열(base64)과 동일 — 붙여넣기 백업과 완전히 호환된다.
  const handleFileExport = async () => {
    const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker
    if (picker) {
      try {
        const handle = await picker({ suggestedName: `potionworks${FILE_EXT}`, types: FILE_TYPES })
        const writable = await handle.createWritable()
        await writable.write(exportStr)
        await writable.close()
        return
      } catch {
        return // 사용자가 취소했거나 실패 — 조용히 종료(폴백은 미지원일 때만).
      }
    }
    // 폴백: Blob URL을 만든 임시 a[download] 클릭.
    const blob = new Blob([exportStr], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `potionworks${FILE_EXT}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // 읽은 파일 텍스트를 import 입력란에 채운다 — 이후 기존 2단계 확인 경로(불러오기)로 복원한다.
  const loadFileText = (text: string) => {
    setImportStr(text.trim())
    setError(null)
    setConfirmImport(false)
    setFileMsg(STRINGS.save.fileLoaded)
  }

  // E-3.2 파일에서 불러오기: showOpenFilePicker 우선, 미지원 시 input[type=file] 폴백.
  const handleFileImport = async () => {
    const picker = (window as unknown as { showOpenFilePicker?: OpenFilePicker }).showOpenFilePicker
    if (picker) {
      try {
        const [handle] = await picker({ multiple: false, types: FILE_TYPES })
        if (!handle) return
        const file = await handle.getFile()
        loadFileText(await file.text())
      } catch {
        // 취소는 무시. 실제 읽기 실패만 안내(취소와 구분 어려워 조용히 둔다).
      }
      return
    }
    fileInputRef.current?.click()
  }

  const onFileInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일 재선택도 change가 발화하도록 초기화
    if (!file) return
    try {
      loadFileText(await file.text())
    } catch {
      setFileMsg(null)
      setError(STRINGS.save.fileError)
    }
  }

  return (
    <Modal title={STRINGS.save.title} onClose={onClose}>
      {/* biome-ignore lint/a11y/noLabelWithoutControl: 아래 textarea의 캡션 라벨 — htmlFor 연결은 마크업 변경이라 스타일 패스 범위 밖. */}
      <label className="modal-label">{STRINGS.save.exportLabel}</label>
      <textarea className="modal-textarea" readOnly value={exportStr} rows={3} />
      <div className="modal-actions modal-actions--left">
        <button type="button" className="modal-button" onClick={handleCopy}>
          {copied ? STRINGS.save.copied : STRINGS.save.copy}
        </button>
      </div>

      {/* E-3.2 파일 백업(.potionsave) */}
      <div className="modal-actions modal-actions--left">
        <button type="button" className="modal-button" onClick={handleFileExport}>
          {STRINGS.save.fileExport}
        </button>
        <button type="button" className="modal-button" onClick={handleFileImport}>
          {STRINGS.save.fileImport}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".potionsave,text/plain"
          style={{ display: 'none' }}
          onChange={onFileInputChange}
        />
      </div>

      {/* biome-ignore lint/a11y/noLabelWithoutControl: 아래 textarea의 캡션 라벨 — htmlFor 연결은 마크업 변경이라 스타일 패스 범위 밖. */}
      <label className="modal-label">{STRINGS.save.importLabel}</label>
      <textarea
        className="modal-textarea"
        value={importStr}
        rows={3}
        placeholder={STRINGS.save.importPlaceholder}
        onChange={(e) => {
          setImportStr(e.target.value)
          setError(null)
          setConfirmImport(false)
          setFileMsg(null)
        }}
      />
      {error && <p className="modal-error">{error}</p>}
      {fileMsg && !error && <p className="modal-restored">{fileMsg}</p>}
      {restored && <p className="modal-restored">{STRINGS.save.restored}</p>}
      {confirmImport && !restored && (
        <p className="modal-sub modal-confirm-warn">
          {STRINGS.save.overwriteWarn}{' '}
          <button type="button" className="settings-link" onClick={() => setConfirmImport(false)}>
            {STRINGS.common.cancel}
          </button>
        </p>
      )}

      <div className="modal-actions">
        <button type="button" className="modal-button" onClick={onClose}>
          {STRINGS.common.close}
        </button>
        <button
          type="button"
          className={`modal-button modal-button--primary${confirmImport ? ' modal-button--danger' : ''}`}
          onClick={handleImport}
          disabled={importStr.trim().length === 0 || restored}
        >
          {confirmImport ? STRINGS.save.confirmOverwrite : STRINGS.save.import}
        </button>
      </div>
    </Modal>
  )
}
