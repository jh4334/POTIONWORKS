import { useShallow } from 'zustand/react/shallow'
import { useGameStore } from '../store/gameStore.ts'
import { ACHIEVEMENTS } from '../data/achievements.ts'
import { ACHIEVEMENT_MULT_PER } from '../data/config.ts'
import { achievementCurrent, type AchievementStats } from '../engine/formulas.ts'
import { formatNumber } from '../utils/format.ts'
import Modal from './Modal.tsx'

// T6.1 업적 목록 모달 — 달성=밝게+체크, 미달성=진행도(현재/목표)+진행 바.
// 열림 상태는 부모(Header)의 로컬 상태. 달성 id 집합 + 진행도 통계를 구독한다.
interface Props {
  onClose: () => void
}

export default function AchievementsModal({ onClose }: Props) {
  const unlocked = useGameStore(useShallow((s) => new Set(s.achievements)))
  // 진행도 통계 스냅샷 — 정수/드물게 변하는 값 위주로 얕게 구독(모달이 열린 동안만 갱신).
  const stats = useGameStore(
    useShallow(
      (s): AchievementStats => ({
        totalClicks: s.totalClicks,
        generators: s.generators,
        totalLifetimeMana: Math.floor(s.totalLifetimeMana),
        totalPrestiges: s.totalPrestiges,
        mps: Math.floor(s.manaPerSecond),
      }),
    ),
  )
  const count = unlocked.size
  // 업적 보너스 합계(+N% 생산). config에서 파생.
  const bonusPercent = Math.round(count * ACHIEVEMENT_MULT_PER * 100)

  return (
    <Modal
      wide
      title={
        <>
          업적 <span className="achievement-count">{count}/{ACHIEVEMENTS.length}</span>
        </>
      }
      onClose={onClose}
    >
      <p className="achievement-bonus">
        업적 보너스: <strong>+{bonusPercent}%</strong> 생산
      </p>
      <div className="achievement-grid">
        {ACHIEVEMENTS.map((a) => {
          const done = unlocked.has(a.id)
          const target = a.condition.min
          const current = achievementCurrent(a, stats)
          const ratio = target > 0 ? Math.min(1, current / target) : 1
          return (
            <div
              key={a.id}
              className={`achievement-item${done ? ' achievement-item--done' : ''}`}
            >
              <span className="achievement-item-mark">{done ? '✅' : '🔒'}</span>
              <div className="achievement-item-body">
                <div className="achievement-item-name">{done ? a.name : '???'}</div>
                <div className="achievement-item-desc">{a.desc}</div>
                {!done && (
                  <div className="achievement-progress">
                    <div className="achievement-progress-bar">
                      <div
                        className="achievement-progress-fill"
                        style={{ width: `${ratio * 100}%` }}
                      />
                    </div>
                    <span className="achievement-progress-text">
                      {formatNumber(Math.floor(current))} / {formatNumber(target)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="modal-actions">
        <button type="button" className="modal-button modal-button--primary" onClick={onClose}>
          닫기
        </button>
      </div>
    </Modal>
  )
}
