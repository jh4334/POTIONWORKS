import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useGameStore } from '../store/gameStore.ts'

// T6.2 마일스톤 이펙트 — 업적 달성/각성(burstKey 증가) 시 화면 중앙에서 이모지 ✨가 퍼지며 사라진다.
// 라이브러리 없이 CSS 애니메이션만. 성능 우선: 파티클 개수 제한 + 애니메이션 종료 후 DOM 제거.

const PARTICLE_COUNT = 8 // 버스트당 파티클 수(과하지 않게 상한)
const BURST_LIFETIME_MS = 1000 // 애니메이션 길이(0.9s) 여유 포함 — 이후 DOM 제거
const EMOJIS = ['✨', '⭐', '🌟', '💫']

interface Burst {
  key: number
  particles: { id: number; dx: number; dy: number; emoji: string; rot: number }[]
}

// 방사형으로 균등 분포 + 약간의 랜덤 거리. 미리 계산해 렌더 중 재계산 없음.
function makeParticles() {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + Math.random() * 0.4
    const dist = 80 + Math.random() * 60
    return {
      id: i, // 버스트 내 고정 슬롯 id(재정렬 없음) — 인덱스 대신 안정 키로 사용.
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist,
      emoji: EMOJIS[i % EMOJIS.length],
      rot: (Math.random() - 0.5) * 180,
    }
  })
}

export default function BurstEffect() {
  const burstKey = useGameStore((s) => s.burstKey)
  const [bursts, setBursts] = useState<Burst[]>([])
  // burstKey===0은 초기값 — 로드 시 버스트가 터지지 않도록 첫 변화 전까지 무시한다.
  const seen = useRef(0)
  // 각 버스트의 제거 타이머를 모아둔다. effect cleanup에서 개별 취소하면(이전 구현) 연속 버스트 시
  // 직전 버스트의 제거 타이머가 취소돼 DOM이 영구 잔류했다(D-4 누수). 타이머는 unmount에서만 일괄 정리한다.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    if (burstKey === 0 || burstKey === seen.current) return
    seen.current = burstKey
    const burst: Burst = { key: burstKey, particles: makeParticles() }
    setBursts((prev) => [...prev, burst])
    const t = setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.key !== burst.key))
      timers.current = timers.current.filter((id) => id !== t)
    }, BURST_LIFETIME_MS)
    timers.current.push(t)
    // cleanup에서 이 타이머를 취소하지 않는다 — 연속 버스트가 서로의 제거를 막지 않도록.
  }, [burstKey])

  // 언마운트 시에만 남은 타이머 일괄 정리(누수 방지).
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  if (bursts.length === 0) return null

  return (
    <div className="burst-layer" aria-hidden="true">
      {bursts.map((b) => (
        <div key={b.key} className="burst-origin">
          {b.particles.map((p) => (
            <span
              key={p.id}
              className="burst-particle"
              style={
                {
                  '--dx': `${p.dx}px`,
                  '--dy': `${p.dy}px`,
                  '--rot': `${p.rot}deg`,
                } as CSSProperties
              }
            >
              {p.emoji}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}
