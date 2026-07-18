import { useShallow } from 'zustand/react/shallow'
import { useGameStore } from '../store/gameStore.ts'
import { formatNumber } from '../utils/format.ts'
import { ACHIEVEMENT_MULT_PER, STARDUST_MULT_PER } from '../data/config.ts'
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
  if (days > 0) parts.push(`${days}일`)
  if (hours > 0) parts.push(`${hours}시간`)
  if (minutes > 0) parts.push(`${minutes}분`)
  if (parts.length === 0) parts.push(`${seconds}초`)
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
    <Modal title="통계 📊" onClose={onClose}>
      <div className="stats-grid">
        <Row label="총 누적 마나" value={formatNumber(s.totalLifetimeMana)} />
        <Row label="이번 생 누적 마나" value={formatNumber(s.lifetimeMana)} />
        <Row label="총 클릭" value={formatNumber(s.totalClicks)} />
        <Row label="각성 횟수" value={formatNumber(s.totalPrestiges)} />
        <Row label="스타더스트" value={`✨ ${formatNumber(s.stardust)}`} />
        <Row label="현재 초당 마나" value={formatNumber(s.mps)} />
        <Row label="클릭당 획득" value={`+${formatNumber(s.clickPower)}`} />
        <Row label="플레이 시간" value={formatPlaytime(s.playtimeMs)} />
      </div>

      <p className="stats-bonus-title">생산 보너스 내역</p>
      <div className="stats-grid">
        <Row label={`업적 (${s.achievementCount}개)`} value={`+${achievementBonus}%`} />
        <Row label={`스타더스트 (${formatNumber(s.stardust)}개)`} value={`+${stardustBonus}%`} />
      </div>

      <div className="modal-actions">
        <button type="button" className="modal-button modal-button--primary" onClick={onClose}>
          닫기
        </button>
      </div>
    </Modal>
  )
}
