import { useGameStore } from '../store/gameStore.ts'
import { formatNumber } from '../utils/format.ts'

// T4.3 오프라인 수익 환영 팝업. 표시값은 스토어의 offlineGain(UI 상태, 세이브 비포함).
// offlineGain이 null이면 렌더하지 않는다.

// 경과 ms → "N시간 M분" (초 단위는 팝업 최소 기준이 60초라 분까지만 표시).
function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours}시간 ${minutes}분`
  return `${minutes}분`
}

export default function OfflineModal() {
  const gain = useGameStore((s) => s.offlineGain)
  const dismiss = useGameStore((s) => s.dismissOffline)

  if (!gain) return null

  return (
    <div className="modal-backdrop" onClick={dismiss}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">돌아온 걸 환영해요! 🧪</h2>
        <p className="modal-body">
          자리 비운 동안 <strong className="offline-amount">+{formatNumber(Math.floor(gain.amount))}</strong> 마나를
          벌었어요.
        </p>
        <p className="modal-sub">({formatDuration(gain.elapsedMs)} 자리 비움 · 효율 50%)</p>
        <div className="modal-actions">
          <button type="button" className="modal-button modal-button--primary" onClick={dismiss}>
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
