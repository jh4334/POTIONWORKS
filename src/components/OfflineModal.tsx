import { useGameStore } from '../store/gameStore.ts'
import { formatNumber } from '../utils/format.ts'
import { OFFLINE_EFFICIENCY } from '../data/config.ts'
import { STRINGS } from '../data/strings.ts'
import Modal from './Modal.tsx'

// T4.3 오프라인 수익 환영 팝업. 표시값은 스토어의 offlineGain(UI 상태, 세이브 비포함).
// offlineGain이 null이면 렌더하지 않는다.

// 경과 ms → "1시간 30분 20초" 형태(분·초 병기, D-2.6). 값이 0이면 "0초".
function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  const parts: string[] = []
  if (hours > 0) parts.push(STRINGS.duration.hours(hours))
  if (minutes > 0) parts.push(STRINGS.duration.minutes(minutes))
  if (seconds > 0 || parts.length === 0) parts.push(STRINGS.duration.seconds(seconds))
  return parts.join(' ')
}

// 효율 퍼센트는 config에서 파생(하드코딩 제거, D-2.6).
const EFFICIENCY_PERCENT = Math.round(OFFLINE_EFFICIENCY * 100)

export default function OfflineModal() {
  const gain = useGameStore((s) => s.offlineGain)
  const dismiss = useGameStore((s) => s.dismissOffline)

  if (!gain) return null

  // 캡이 적용됐는지: 실제 자리 비운 시간이 정산 인정 시간보다 크면 캡이 걸린 것.
  const capped = gain.elapsedMs > gain.cappedMs

  return (
    <Modal title={STRINGS.offline.title} onClose={dismiss}>
      <p className="modal-body">
        {STRINGS.offline.bodyLead}{' '}
        <strong className="offline-amount">+{formatNumber(Math.floor(gain.amount))}</strong>
        {STRINGS.offline.bodyTail}
      </p>
      {capped ? (
        <p className="modal-sub">
          {STRINGS.offline.cappedSub(
            formatDuration(gain.elapsedMs),
            formatDuration(gain.cappedMs),
            EFFICIENCY_PERCENT,
          )}
        </p>
      ) : (
        <p className="modal-sub">
          {STRINGS.offline.sub(formatDuration(gain.elapsedMs), EFFICIENCY_PERCENT)}
        </p>
      )}
      <div className="modal-actions">
        <button type="button" className="modal-button modal-button--primary" onClick={dismiss}>
          {STRINGS.common.confirm}
        </button>
      </div>
    </Modal>
  )
}
