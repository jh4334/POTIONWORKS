import { useShallow } from 'zustand/react/shallow'
import { useGameStore } from '../store/gameStore.ts'
import { formatNumber } from '../utils/format.ts'
import { ACHIEVEMENT_MULT_PER, STARDUST_MULT_PER } from '../data/config.ts'
import { STRINGS } from '../data/strings.ts'
import Modal from './Modal.tsx'

// D-2.3 통계 패널. 누적/이번 생 마나·클릭·각성·스타더스트·현재 MPS·클릭당 획득·보너스 내역·플레이 시간.
// 열림 상태는 부모(Header)의 로컬 상태. 표시 전용이라 모달이 열린 동안만 구독한다.
interface Props {
  onClose: () => void
}

// 플레이 시간(ms) → "2일 3시간 12분" (초 단위는 분 미만일 때만 표기).
function formatPlaytime(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  const parts: string[] = []
  if (days > 0) parts.push(STRINGS.duration.days(days))
  if (hours > 0) parts.push(STRINGS.duration.hours(hours))
  if (minutes > 0) parts.push(STRINGS.duration.minutes(minutes))
  if (parts.length === 0) parts.push(STRINGS.duration.seconds(seconds))
  return parts.join(' ')
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="stats-row">
      <span className="stats-row-label">{label}</span>
      <span className="stats-row-value">{value}</span>
    </div>
  )
}

export default function StatsModal({ onClose }: Props) {
  const s = useGameStore(
    useShallow((st) => ({
      totalLifetimeMana: Math.floor(st.totalLifetimeMana),
      lifetimeMana: Math.floor(st.lifetimeMana),
      totalClicks: st.totalClicks,
      totalPrestiges: st.totalPrestiges,
      stardust: st.stardust,
      mps: st.manaPerSecond,
      clickPower: st.clickPower,
      achievementCount: st.achievements.length,
      playtimeMs: st.playtimeMs,
    })),
  )

  const achievementBonus = Math.round(s.achievementCount * ACHIEVEMENT_MULT_PER * 100)
  const stardustBonus = Math.round(s.stardust * STARDUST_MULT_PER * 100)

  return (
    <Modal title={STRINGS.stats.title} onClose={onClose}>
      <div className="stats-grid">
        <Row label={STRINGS.stats.totalLifetimeMana} value={formatNumber(s.totalLifetimeMana)} />
        <Row label={STRINGS.stats.lifetimeMana} value={formatNumber(s.lifetimeMana)} />
        <Row label={STRINGS.stats.totalClicks} value={formatNumber(s.totalClicks)} />
        <Row label={STRINGS.stats.totalPrestiges} value={formatNumber(s.totalPrestiges)} />
        <Row label={STRINGS.stats.stardust} value={`✨ ${formatNumber(s.stardust)}`} />
        <Row label={STRINGS.stats.mps} value={formatNumber(s.mps)} />
        <Row label={STRINGS.stats.clickPower} value={`+${formatNumber(s.clickPower)}`} />
        <Row label={STRINGS.stats.playtime} value={formatPlaytime(s.playtimeMs)} />
      </div>

      <p className="stats-bonus-title">{STRINGS.stats.bonusTitle}</p>
      <div className="stats-grid">
        <Row label={STRINGS.stats.bonusAchievement(s.achievementCount)} value={`+${achievementBonus}%`} />
        <Row label={STRINGS.stats.bonusStardust(formatNumber(s.stardust))} value={`+${stardustBonus}%`} />
      </div>

      <div className="modal-actions">
        <button type="button" className="modal-button modal-button--primary" onClick={onClose}>
          {STRINGS.common.close}
        </button>
      </div>
    </Modal>
  )
}
