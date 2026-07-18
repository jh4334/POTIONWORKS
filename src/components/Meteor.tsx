import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore.ts'
import {
  METEOR_MIN_INTERVAL_MS,
  METEOR_MAX_INTERVAL_MS,
  METEOR_LIFETIME_MS,
} from '../data/config.ts'

// D-4.6 골든 이벤트 유성. tick과 무관한 로컬 setTimeout으로 다음 출현을 예약(랜덤 3~8분).
// 출현하면 좌→우 포물선으로 흐르는 ☄️(12초). 클릭하면 activateMeteorBuff(버프+토스트+버스트).
// 놓치면(12초) 그냥 사라지고 다음 유성을 예약한다. reduced-motion 시엔 CSS가 이동 대신 페이드로
// 표시하되 12초 체류는 동일해 클릭 기회를 보존한다.
// (진행/보상 계산은 여전히 타임스탬프가 진실 — 버프 발동/만료는 store가 now/tick으로 처리하고,
//  여기 setTimeout은 순수 연출(출현 예약)에만 쓴다.)

function randomDelay(): number {
  return METEOR_MIN_INTERVAL_MS + Math.random() * (METEOR_MAX_INTERVAL_MS - METEOR_MIN_INTERVAL_MS)
}

// 출현 세로 위치 변주(%). 상단~중단 사이 랜덤.
function randomTop(): number {
  return 15 + Math.random() * 40
}

export default function Meteor() {
  const activateMeteorBuff = useGameStore((s) => s.activateMeteorBuff)
  const [visible, setVisible] = useState(false)
  const [top, setTop] = useState(30)
  const spawnTimer = useRef<ReturnType<typeof setTimeout>>()
  const lifeTimer = useRef<ReturnType<typeof setTimeout>>()
  // 다음 출현 예약 함수를 ref에 노출 — 클릭 시에도 재예약할 수 있게 한다.
  const scheduleRef = useRef<() => void>(() => {})

  useEffect(() => {
    const scheduleNext = () => {
      spawnTimer.current = setTimeout(() => {
        setTop(randomTop())
        setVisible(true)
        // 12초 체류 후 미클릭이면 소멸 + 다음 유성 예약.
        lifeTimer.current = setTimeout(() => {
          setVisible(false)
          scheduleNext()
        }, METEOR_LIFETIME_MS)
      }, randomDelay())
    }
    scheduleRef.current = scheduleNext
    scheduleNext()
    return () => {
      if (spawnTimer.current) clearTimeout(spawnTimer.current)
      if (lifeTimer.current) clearTimeout(lifeTimer.current)
    }
  }, [])

  const handleClick = () => {
    if (!visible) return
    if (lifeTimer.current) clearTimeout(lifeTimer.current)
    setVisible(false)
    activateMeteorBuff(Date.now()) // 버프 발동 + 획득 토스트 + 파티클 버스트(store)
    scheduleRef.current() // 다음 유성 예약
  }

  if (!visible) return null

  return (
    <button
      type="button"
      className="meteor"
      style={{ top: `${top}%` }}
      aria-label="유성 — 클릭하면 마나 폭주 버프"
      onClick={handleClick}
    >
      ☄️
    </button>
  )
}
