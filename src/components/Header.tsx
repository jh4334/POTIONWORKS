import { useState } from 'react'
import { useGameStore } from '../store/gameStore.ts'
import { formatNumber } from '../utils/format.ts'
import { saveNow } from '../engine/autosave.ts'
import { PRESTIGE_THRESHOLD, STARDUST_MULT_PER } from '../data/config.ts'
import { ACHIEVEMENTS } from '../data/achievements.ts'
import SaveModal from './SaveModal.tsx'
import AchievementsModal from './AchievementsModal.tsx'
import SettingsModal from './SettingsModal.tsx'
import StatsModal from './StatsModal.tsx'

// 마지막 저장 시각 표시용 포맷(HH:MM:SS).
function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString()
}

export default function Header() {
  // 표시 문자열을 구독한다 — mana는 100ms마다 소수점이 변하지만 정수 내림 후 포맷한 문자열은
  // 훨씬 드물게 바뀌므로, 문자열이 같으면 리렌더가 발생하지 않는다.
  const manaText = useGameStore((s) => formatNumber(Math.floor(s.mana)))
  // mps는 구매 시에만 변하지만 일관성을 위해 동일하게 표시 문자열을 구독한다.
  const mpsText = useGameStore((s) => formatNumber(s.manaPerSecond))
  const stardust = useGameStore((s) => s.stardust)
  // 각성 가능 여부(누적 마나 임계 도달). 스타더스트 표시 노출 조건에 사용.
  const canPrestige = useGameStore((s) => s.lifetimeMana >= PRESTIGE_THRESHOLD)
  // 스타더스트가 있거나 각성 가능할 때만 노출(초반 화면 오염 방지).
  const showStardust = stardust > 0 || canPrestige
  const bonusPercent = Math.round(stardust * STARDUST_MULT_PER * 100)

  // 업적 진행도는 스토어 구독. 업적수는 배열 길이만 파생 구독(달성 시에만 변함).
  const achievementCount = useGameStore((s) => s.achievements.length)
  // 저장 성공 시각(스토어 UI 상태) — 수동/자동 저장·각성·복원이 성공하면 갱신된다(D-2.5).
  const lastSavedAt = useGameStore((s) => s.lastSavedAt)

  // 백업/업적/설정/통계 모달 열림은 순수 UI 상태 → 컴포넌트 로컬로 관리(스토어 비오염).
  const [showBackup, setShowBackup] = useState(false)
  const [showAchievements, setShowAchievements] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showStats, setShowStats] = useState(false)

  return (
    <header className="header">
      <h1 className="header-title">🧪 POTIONWORKS</h1>
      <div className="header-stats">
        {/* 마나는 100ms마다 갱신되므로 표시는 정수 내림(소수점 깜빡임 방지) — 셀렉터에서 이미 포맷됨. */}
        <span className="header-mana">{manaText} 마나</span>
        <span className="header-mps">초당 {mpsText}</span>
        {showStardust && (
          <span className="header-stardust" title={`전체 생산 +${bonusPercent}%`}>
            ✨ {formatNumber(stardust)}
          </span>
        )}
      </div>
      <div className="header-actions">
        {lastSavedAt !== null && (
          <span className="header-saved-at">{formatClock(lastSavedAt)} 저장됨</span>
        )}
        <button
          type="button"
          className="header-button"
          onClick={() => setShowStats(true)}
          aria-label="통계"
          title="통계"
        >
          📊
        </button>
        <button
          type="button"
          className="header-button"
          onClick={() => setShowAchievements(true)}
          title="업적 목록"
        >
          🏆 {achievementCount}/{ACHIEVEMENTS.length}
        </button>
        <button type="button" className="header-button" onClick={() => saveNow()}>
          저장
        </button>
        <button
          type="button"
          className="header-button"
          onClick={() => setShowSettings(true)}
          aria-label="설정"
          title="설정"
        >
          ⚙️
        </button>
      </div>
      {showBackup && <SaveModal onClose={() => setShowBackup(false)} />}
      {showAchievements && <AchievementsModal onClose={() => setShowAchievements(false)} />}
      {showStats && <StatsModal onClose={() => setShowStats(false)} />}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onOpenBackup={() => {
            setShowSettings(false)
            setShowBackup(true)
          }}
        />
      )}
    </header>
  )
}
