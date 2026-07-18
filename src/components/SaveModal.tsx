import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore.ts'
import { exportSave, importSave } from '../engine/save.ts'
import { saveNow } from '../engine/autosave.ts'
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
      setError('클립보드 복사에 실패했어요. 직접 선택해 복사해 주세요.')
    }
  }

  const handleImport = () => {
    const save = importSave(importStr)
    if (!save) {
      setError('잘못된 백업 문자열이에요. 다시 확인해 주세요.')
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
    <Modal title="세이브 백업" onClose={onClose}>
      <label className="modal-label">내보내기 (이 문자열을 보관하세요)</label>
      <textarea className="modal-textarea" readOnly value={exportStr} rows={3} />
      <div className="modal-actions modal-actions--left">
        <button type="button" className="modal-button" onClick={handleCopy}>
          {copied ? '복사됨!' : '복사'}
        </button>
      </div>

      <label className="modal-label">불러오기 (백업 문자열을 붙여넣으세요)</label>
      <textarea
        className="modal-textarea"
        value={importStr}
        rows={3}
        placeholder="여기에 붙여넣기…"
        onChange={(e) => {
          setImportStr(e.target.value)
          setError(null)
          setConfirmImport(false)
        }}
      />
      {error && <p className="modal-error">{error}</p>}
      {restored && <p className="modal-restored">복원 완료! ✨</p>}
      {confirmImport && !restored && (
        <p className="modal-sub modal-confirm-warn">
          현재 진행 상황을 덮어씁니다. 한 번 더 누르면 복원돼요.{' '}
          <button type="button" className="settings-link" onClick={() => setConfirmImport(false)}>
            취소
          </button>
        </p>
      )}

      <div className="modal-actions">
        <button type="button" className="modal-button" onClick={onClose}>
          닫기
        </button>
        <button
          type="button"
          className={`modal-button modal-button--primary${confirmImport ? ' modal-button--danger' : ''}`}
          onClick={handleImport}
          disabled={importStr.trim().length === 0 || restored}
        >
          {confirmImport ? '정말 덮어쓸까요?' : '불러오기'}
        </button>
      </div>
    </Modal>
  )
}
