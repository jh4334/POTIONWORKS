import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore.ts'
import { exportSave, importSave } from '../engine/save.ts'
import { saveNow } from '../engine/autosave.ts'
import { STRINGS } from '../data/strings.ts'
import Modal from './Modal.tsx'

// T4.2 백업(export/import) 모달. 열림 상태는 부모(Header)의 로컬 상태.
// 여기선 현재 세이브 문자열 생성 + 붙여넣은 문자열 복원(2단계 인라인 확인)만 담당한다.
interface Props {
  onClose: () => void
}

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

  return (
    <Modal title={STRINGS.save.title} onClose={onClose}>
      <label className="modal-label">{STRINGS.save.exportLabel}</label>
      <textarea className="modal-textarea" readOnly value={exportStr} rows={3} />
      <div className="modal-actions modal-actions--left">
        <button type="button" className="modal-button" onClick={handleCopy}>
          {copied ? STRINGS.save.copied : STRINGS.save.copy}
        </button>
      </div>

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
        }}
      />
      {error && <p className="modal-error">{error}</p>}
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
