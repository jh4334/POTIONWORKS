import { useShallow } from 'zustand/react/shallow'
import { useGameStore } from '../store/gameStore.ts'
import { ACHIEVEMENTS } from '../data/achievements.ts'

// T6.1 업적 목록 모달 — 달성=밝게+체크, 미달성=어둡게+조건 힌트(desc).
// 열림 상태는 부모(Header)의 로컬 상태. 여기선 달성 id 집합만 구독한다.
interface Props {
  onClose: () => void
}

export default function AchievementsModal({ onClose }: Props) {
  const unlocked = useGameStore(useShallow((s) => new Set(s.achievements)))
  const count = unlocked.size

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal--wide"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">
          업적 <span className="achievement-count">{count}/{ACHIEVEMENTS.length}</span>
        </h2>
        <div className="achievement-grid">
          {ACHIEVEMENTS.map((a) => {
            const done = unlocked.has(a.id)
            return (
              <div
                key={a.id}
                className={`achievement-item${done ? ' achievement-item--done' : ''}`}
              >
                <span className="achievement-item-mark">{done ? '✅' : '🔒'}</span>
                <div className="achievement-item-body">
                  <div className="achievement-item-name">{done ? a.name : '???'}</div>
                  <div className="achievement-item-desc">{a.desc}</div>
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
      </div>
    </div>
  )
}
