import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGameStore } from '../store/gameStore.ts'
import { formatNumber } from '../utils/format.ts'
import { saveNow } from '../engine/autosave.ts'
import { PRESTIGE_THRESHOLD, STARDUST_MULT_PER } from '../data/config.ts'
import { ACHIEVEMENTS } from '../data/achievements.ts'
import { STRINGS } from '../data/strings.ts'
import SaveModal from './SaveModal.tsx'
import AchievementsModal from './AchievementsModal.tsx'
import SettingsModal from './SettingsModal.tsx'
import StatsModal from './StatsModal.tsx'
import StardustShopModal from './StardustShopModal.tsx'

// 마지막 저장 시각 표시용 포맷(HH:MM:SS).
function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString()
}

// D-4.3 마나 표시 — 구매 등으로 값이 줄면 짧은 빨간 틴트(0.2s)로 위화감을 완화한다.
// 감소 판정을 위해 정수 마나(number)를 구독하므로 이 span만 tick마다 갱신된다(헤더 전체 아님).
function HeaderMana() {
  const mana = useGameStore((s) => Math.floor(s.mana))
  const prev = useRef(mana)
  const [dropping, setDropping] = useState(false)
  useEffect(() => {
    if (mana < prev.current) setDropping(true)
    prev.current = mana
  }, [mana])
  return (
    <span
      className={`header-mana${dropping ? ' mana-drop' : ''}`}
      onAnimationEnd={() => setDropping(false)}
    >
      {STRINGS.header.mana(formatNumber(mana))}
    </span>
  )
}

// D-4.6 · E-1.4 골든 이벤트 버프 배지 — 버프 중 MPS 옆에 종류별 "×N (남은 M초)" 표시.
// 생산·클릭 버프가 공존할 수 있으므로 활성 버프마다 하나씩 렌더한다. 남은 시간은 tick 구독이 아니라
// 1s 로컬 인터벌로 갱신(표시 전용). activeBuffs는 발동/만료 시에만 참조가 바뀌므로 구독이 가볍다.
function BuffBadges() {
  const activeBuffs = useGameStore(useShallow((s) => s.activeBuffs))
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (activeBuffs.length === 0) return
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [activeBuffs.length])
  return (
    <>
      {activeBuffs.map((buff) => {
        const remaining = Math.max(0, Math.ceil((buff.endsAt - now) / 1000))
        if (remaining <= 0) return null
        const title =
          buff.kind === 'production'
            ? STRINGS.header.meteorBadgeTitle
            : STRINGS.header.clickBuffBadgeTitle
        return (
          <span key={buff.kind} className="meteor-badge" title={title}>
            {STRINGS.header.meteorBadge(buff.mult, remaining)}
          </span>
        )
      })}
    </>
  )
}

// onExitToTitle: 설정 모달의 "슬롯 변경"이 현재 진행을 저장한 뒤 타이틀로 돌아가기 위해 App에서 내려받는다.
interface Props {
  onExitToTitle: () => void
}

export default function Header({ onExitToTitle }: Props) {
  // 마나 표시는 HeaderMana 서브컴포넌트가 담당한다(감소 틴트를 위해 숫자 구독 — 헤더 전체 리렌더 회피).
  // mps는 구매·버프 시에만 변하지만 일관성을 위해 표시 문자열을 구독한다(버프 중엔 ×N 값이 반영됨).
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
  const [showShop, setShowShop] = useState(false)

  return (
    <header className="header">
      <h1 className="header-title">🧪 POTIONWORKS</h1>
      <div className="header-stats">
        <HeaderMana />
        <span className="header-mps">{STRINGS.header.mps(mpsText)}</span>
        <BuffBadges />
        {showStardust && (
          <button
            type="button"
            className="header-stardust"
            title={STRINGS.header.stardustTitle(bonusPercent)}
            onClick={() => setShowShop(true)}
          >
            ✨ {formatNumber(stardust)}
          </button>
        )}
      </div>
      <div className="header-actions">
        {lastSavedAt !== null && (
          <span className="header-saved-at">
            {STRINGS.header.savedAt(formatClock(lastSavedAt))}
          </span>
        )}
        <button
          type="button"
          className="header-button"
          onClick={() => setShowStats(true)}
          aria-label={STRINGS.header.statsLabel}
          title={STRINGS.header.statsLabel}
        >
          📊
        </button>
        <button
          type="button"
          className="header-button"
          onClick={() => setShowAchievements(true)}
          title={STRINGS.header.achievementsTitle}
        >
          🏆 {achievementCount}/{ACHIEVEMENTS.length}
        </button>
        <button type="button" className="header-button" onClick={() => saveNow()}>
          {STRINGS.header.save}
        </button>
        <button
          type="button"
          className="header-button"
          onClick={() => setShowSettings(true)}
          aria-label={STRINGS.header.settingsLabel}
          title={STRINGS.header.settingsLabel}
        >
          ⚙️
        </button>
      </div>
      {showBackup && <SaveModal onClose={() => setShowBackup(false)} />}
      {showAchievements && <AchievementsModal onClose={() => setShowAchievements(false)} />}
      {showStats && <StatsModal onClose={() => setShowStats(false)} />}
      {showShop && <StardustShopModal onClose={() => setShowShop(false)} />}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onOpenBackup={() => {
            setShowSettings(false)
            setShowBackup(true)
          }}
          onChangeSlot={() => {
            setShowSettings(false)
            onExitToTitle()
          }}
        />
      )}
    </header>
  )
}
