import { useState } from 'react'
import { listSlots, switchSlot, deleteSlot, activeSlot, type SlotInfo } from '../engine/slots.ts'
import { formatNumber } from '../utils/format.ts'
import { STRINGS } from '../data/strings.ts'

// E-3.2 슬롯 선택 화면. 타이틀에서 진입. 3개 카드 — 빈 슬롯은 "새 게임", 있는 슬롯은 요약 + 이어하기/삭제.
// 선택(switchSlot)은 현재 진행 저장 후 활성 슬롯을 바꾸고 리로드한다(리로드가 새 슬롯을 읽는다).
interface Props {
  onBack: () => void
}

// 저장 시각: 로컬 날짜+시간 간단 표기.
function formatSavedAt(ms: number): string {
  return new Date(ms).toLocaleString()
}

// 플레이 시간(ms) → "3시간 12분"(간단). 통계 패널과 동일한 duration 조각을 쓴다(i18n 일관).
function formatPlaytime(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const parts: string[] = []
  if (days > 0) parts.push(STRINGS.duration.days(days))
  if (hours > 0) parts.push(STRINGS.duration.hours(hours))
  if (minutes > 0 || parts.length === 0) parts.push(STRINGS.duration.minutes(minutes))
  return parts.join(' ')
}

function SlotCard({
  info,
  active,
  onRefresh,
}: {
  info: SlotInfo
  active: boolean
  onRefresh: () => void
}) {
  // 삭제 2단계 확인(인라인, window.confirm 대체 — 프로젝트 공통 패턴).
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    deleteSlot(info.slot)
    setConfirmDelete(false)
    onRefresh()
  }

  return (
    <div className={`slot-card${active ? ' slot-card--active' : ''}`}>
      <div className="slot-card-head">
        <span className="slot-card-name">{STRINGS.slotSelect.slotName(info.slot)}</span>
        {active && <span className="slot-card-active">{STRINGS.slotSelect.active}</span>}
      </div>

      {info.exists ? (
        <div className="slot-card-body">
          {info.savedAt !== null ? (
            <>
              <span className="slot-card-line">{STRINGS.slotSelect.savedAt(formatSavedAt(info.savedAt))}</span>
              <span className="slot-card-line">
                {STRINGS.slotSelect.lifetime(formatNumber(info.totalLifetimeMana))}
              </span>
              <span className="slot-card-line">{STRINGS.slotSelect.playtime(formatPlaytime(info.playtimeMs))}</span>
            </>
          ) : (
            <span className="slot-card-line">{STRINGS.slotSelect.empty}</span>
          )}
        </div>
      ) : (
        <div className="slot-card-body slot-card-body--empty">
          <span className="slot-card-line">{STRINGS.slotSelect.empty}</span>
        </div>
      )}

      <div className="slot-card-actions">
        <button
          type="button"
          className="modal-button modal-button--primary"
          onClick={() => switchSlot(info.slot)}
        >
          {info.exists ? STRINGS.slotSelect.continue : STRINGS.slotSelect.newGame}
        </button>
        {info.exists && (
          <button
            type="button"
            className={`modal-button${confirmDelete ? ' modal-button--danger' : ''}`}
            onClick={handleDelete}
          >
            {confirmDelete ? STRINGS.slotSelect.deleteConfirm : STRINGS.slotSelect.delete}
          </button>
        )}
      </div>
    </div>
  )
}

export default function SlotSelect({ onBack }: Props) {
  // 삭제 시 목록을 갱신하기 위해 상태로 보관(리로드 없이 즉시 반영).
  const [slots, setSlots] = useState<SlotInfo[]>(() => listSlots())
  const current = activeSlot()

  return (
    <div className="title-overlay">
      <div className="title-card slot-select-card">
        <h1 className="title-logo">{STRINGS.slotSelect.title}</h1>
        <div className="slot-list">
          {slots.map((info) => (
            <SlotCard
              key={info.slot}
              info={info}
              active={info.slot === current}
              onRefresh={() => setSlots(listSlots())}
            />
          ))}
        </div>
        <button type="button" className="title-secondary" onClick={onBack}>
          {STRINGS.slotSelect.back}
        </button>
      </div>
    </div>
  )
}
