import { useState } from 'react'
import { useGameStore } from '../store/gameStore.ts'
import { formatNumber } from '../utils/format.ts'
import { saveToLocal } from '../engine/save.ts'
import SaveModal from './SaveModal.tsx'

// 마지막 저장 시각 표시용 포맷(HH:MM:SS).
function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString()
}

export default function Header() {
  const mana = useGameStore((s) => s.mana)
  const mps = useGameStore((s) => s.manaPerSecond)

  // 수동 저장 시각 + 백업 모달 열림은 순수 UI 상태 → 컴포넌트 로컬로 관리(스토어 비오염).
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [showBackup, setShowBackup] = useState(false)

  const handleSave = () => {
    const now = Date.now()
    saveToLocal(useGameStore.getState(), now)
    setSavedAt(now)
  }

  return (
    <header className="header">
      <h1 className="header-title">🧪 POTIONWORKS</h1>
      <div className="header-stats">
        {/* 마나는 100ms마다 갱신되므로 표시는 정수 내림(소수점 깜빡임 방지). */}
        <span className="header-mana">{formatNumber(Math.floor(mana))} 마나</span>
        <span className="header-mps">초당 {formatNumber(mps)}</span>
      </div>
      <div className="header-actions">
        {savedAt !== null && <span className="header-saved-at">{formatClock(savedAt)} 저장됨</span>}
        <button type="button" className="header-button" onClick={handleSave}>
          저장
        </button>
        <button type="button" className="header-button" onClick={() => setShowBackup(true)}>
          백업
        </button>
      </div>
      {showBackup && <SaveModal onClose={() => setShowBackup(false)} />}
    </header>
  )
}
