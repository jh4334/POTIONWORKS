// T8.2 타이틀 오버레이 — 최초 방문(세이브 없음) 또는 게임 내 "슬롯 변경"으로 진입한다.
// E-3.2: 세이브가 하나라도 있으면 "이어하기(활성 슬롯)" + "슬롯 선택"을, 없으면 "게임 시작"을 노출한다.
import { useState } from 'react'
import { listSlots } from '../engine/slots.ts'
import { STRINGS } from '../data/strings.ts'
import SlotSelect from './SlotSelect.tsx'

interface Props {
  onStart: () => void
}

export default function TitleScreen({ onStart }: Props) {
  // 슬롯 선택 화면 토글. 마운트 시 1회 슬롯 존재 여부를 확인해 버튼 구성을 정한다.
  const [showingSlots, setShowingSlots] = useState(false)
  const [anyExists] = useState(() => listSlots().some((s) => s.exists))

  if (showingSlots) return <SlotSelect onBack={() => setShowingSlots(false)} />

  return (
    <div className="title-overlay">
      <div className="title-card">
        <h1 className="title-logo">🧪 POTIONWORKS</h1>
        <p className="title-sub">{STRINGS.titleScreen.sub}</p>
        {anyExists ? (
          <>
            <button type="button" className="title-start" onClick={onStart}>
              {STRINGS.titleScreen.continueActive}
            </button>
            <button type="button" className="title-secondary" onClick={() => setShowingSlots(true)}>
              {STRINGS.titleScreen.slotSelect}
            </button>
          </>
        ) : (
          <button type="button" className="title-start" onClick={onStart}>
            {STRINGS.titleScreen.start}
          </button>
        )}
      </div>
    </div>
  )
}
