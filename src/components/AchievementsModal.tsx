import { useShallow } from 'zustand/react/shallow'
import { useGameStore } from '../store/gameStore.ts'
import { ACHIEVEMENTS } from '../data/achievements.ts'
import { ACHIEVEMENT_MULT_PER } from '../data/config.ts'
import { achievementCurrent, type AchievementStats } from '../engine/formulas.ts'
import { formatNumber } from '../utils/format.ts'
import { STRINGS } from '../data/strings.ts'
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
        stardust: s.stardust,
        playtimeMs: s.playtimeMs,
        meteorsClicked: s.meteorsClicked,
        prestigeCancels: s.prestigeCancels,
        mutedPlaytimeMs: s.mutedPlaytimeMs,
        clickCombo: s.clickCombo,
        dragonVisits: s.dragonVisits,
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
          {STRINGS.achievements.title}{' '}
          <span className="achievement-count">
            {count}/{ACHIEVEMENTS.length}
          </span>
        </>
      }
      onClose={onClose}
    >
      <p className="achievement-bonus">
        {STRINGS.achievements.bonusLead} <strong>+{bonusPercent}%</strong>
        {STRINGS.achievements.bonusTail}
      </p>
      <div className="achievement-grid">
        {ACHIEVEMENTS.map((a) => {
          const done = unlocked.has(a.id)
          const target = a.condition.min
          const current = achievementCurrent(a, stats)
          const ratio = target > 0 ? Math.min(1, current / target) : 1
          // 숨겨진 업적(E-1.3): 달성 전에는 이름 "???" + 힌트(desc)·진행도 비표시(조건 노출 방지).
          // 달성하면 일반 업적처럼 이름/설명이 드러난다.
          const isHidden = a.hidden === true && !done
          return (
            <div
              key={a.id}
              className={`achievement-item${done ? ' achievement-item--done' : ''}${isHidden ? ' achievement-item--hidden' : ''}`}
            >
              <span className="achievement-item-mark">{done ? '✅' : isHidden ? '❓' : '🔒'}</span>
              <div className="achievement-item-body">
                {/* 이름은 숨겨진 업적만 가린다 — 일반 잠금 업적은 이름·조건 힌트가 목표 리스트 역할(U1 리뷰). */}
                <div className="achievement-item-name">
                  {isHidden ? STRINGS.achievements.lockedName : a.name}
                </div>
                <div className="achievement-item-desc">
                  {isHidden ? STRINGS.achievements.hiddenDesc : a.desc}
                </div>
                {!done && !isHidden && (
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
          {STRINGS.common.close}
        </button>
      </div>
    </Modal>
  )
}
