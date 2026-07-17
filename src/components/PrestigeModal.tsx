import { useState } from 'react'
import { useGameStore } from '../store/gameStore.ts'
import { stardustFor } from '../engine/formulas.ts'
import { PRESTIGE_THRESHOLD, STARDUST_MULT_PER } from '../data/config.ts'
import { formatNumber } from '../utils/format.ts'
import { saveToLocal } from '../engine/save.ts'

// T5.1 각성(프레스티지). 좌측 클릭 패널 하단에 배치.
// - 임계(1e9) 미달이면 진행도만 표시하고 각성 버튼은 비활성.
// - 각성 가능하면 버튼 → 확인 모달 → 실행. 실행 직후 즉시 저장(새로고침 되돌리기 방지).
// lifetimeMana 원시값은 매 tick(100ms) 소수점 단위로 변하므로 직접 구독하지 않는다.
// 대신 파생값만 구독한다: 진행도 표시 문자열 / 임계 도달 불리언 / 미리보기 정수(각각 드물게 변함).

// 스타더스트 N개가 주는 생산 보너스 퍼센트(+N0%). 수치는 config(STARDUST_MULT_PER)에서.
function bonusPercent(stardust: number): number {
  return Math.round(stardust * STARDUST_MULT_PER * 100)
}

export default function PrestigeModal() {
  // 진행도 표시용: 정수 내림 후 포맷한 문자열만 구독(소수점 변화로 리렌더되지 않도록).
  const progressText = useGameStore((s) => formatNumber(Math.floor(s.lifetimeMana)))
  // 임계 도달 불리언: 임계 전후로만 값이 바뀜.
  const reachedThreshold = useGameStore((s) => s.lifetimeMana >= PRESTIGE_THRESHOLD)
  // 미리보기 N = 지금 각성 시 얻는 스타더스트(정수). 임계 전 0, 이후 드물게 변함.
  const gain = useGameStore((s) => stardustFor(s.lifetimeMana))
  const prestige = useGameStore((s) => s.prestige)
  const [showConfirm, setShowConfirm] = useState(false)

  // N=0이면 버튼 비활성(모달까지 안 감).
  const canPrestige = reachedThreshold && gain > 0

  const handlePrestige = () => {
    prestige()
    saveToLocal(useGameStore.getState()) // 각성 직후 즉시 저장 — 새로고침으로 되돌리기 방지.
    setShowConfirm(false)
  }

  return (
    <div className="prestige-panel">
      {canPrestige ? (
        <button
          type="button"
          className="prestige-button"
          onClick={() => setShowConfirm(true)}
        >
          ✨ 각성 (+{formatNumber(gain)} 스타더스트)
        </button>
      ) : (
        <div className="prestige-progress">
          <span className="prestige-progress-label">각성까지 누적 마나</span>
          <span className="prestige-progress-value">
            {progressText} / {formatNumber(PRESTIGE_THRESHOLD)}
          </span>
        </div>
      )}

      {showConfirm && canPrestige && (
        <div className="modal-backdrop" onClick={() => setShowConfirm(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="modal-title">각성하시겠어요? ✨</h2>
            <p className="modal-body">
              지금 각성하면{' '}
              <strong className="offline-amount">✨+{formatNumber(gain)} 스타더스트</strong> (생산 +
              {bonusPercent(gain)}%)
            </p>
            <p className="modal-sub">
              각성 후: 마나 · 시설 · 업그레이드 초기화 / 스타더스트 · 통계 유지
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-button"
                onClick={() => setShowConfirm(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="modal-button modal-button--primary"
                onClick={handlePrestige}
              >
                각성
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
