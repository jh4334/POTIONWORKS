import { useState } from 'react'
import { useGameStore } from '../store/gameStore.ts'
import { exportSave, importSave, saveToLocal } from '../engine/save.ts'

// T4.2 백업(export/import) 모달. 열림 상태는 부모(Header)의 로컬 상태로 관리하고,
// 여기선 현재 세이브 문자열 생성 + 붙여넣은 문자열 복원만 담당한다.
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
      return
    }
    if (!window.confirm('현재 진행 상황을 덮어씁니다. 계속할까요?')) return
    loadSave(save)
    saveToLocal(useGameStore.getState()) // 복원 즉시 localStorage에도 반영
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">세이브 백업</h2>

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
          }}
        />
        {error && <p className="modal-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="modal-button" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="modal-button modal-button--primary"
            onClick={handleImport}
            disabled={importStr.trim().length === 0}
          >
            불러오기
          </button>
        </div>
      </div>
    </div>
  )
}
