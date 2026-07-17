import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useGameStore } from '../store/gameStore.ts'

// T6.2 마일스톤 이펙트 — 업적 달성/각성(burstKey 증가) 시 화면 중앙에서 이모지 ✨가 퍼지며 사라진다.
// 라이브러리 없이 CSS 애니메이션만. 성능 우선: 파티클 개수 제한 + 애니메이션 종료 후 DOM 제거.

const PARTICLE_COUNT = 8 // 버스트당 파티클 수(과하지 않게 상한)
const BURST_LIFETIME_MS = 1000 // 애니메이션 길이(0.9s) 여유 포함 — 이후 DOM 제거
const EMOJIS = ['✨', '⭐', '🌟', '💫']

interface Burst {
  key: number
  particles: { dx: number; dy: number; emoji: string; rot: number }[]
}

// 방사형으로 균등 분포 + 약간의 랜덤 거리. 미리 계산해 렌더 중 재계산 없음.
function makeParticles() {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + Math.random() * 0.4
    const dist = 80 + Math.random() * 60
    return {
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

  useEffect(() => {
    if (burstKey === 0 || burstKey === seen.current) return
    seen.current = burstKey
    const burst: Burst = { key: burstKey, particles: makeParticles() }
    setBursts((prev) => [...prev, burst])
    const t = setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.key !== burst.key))
    }, BURST_LIFETIME_MS)
    return () => clearTimeout(t)
  }, [burstKey])

  if (bursts.length === 0) return null

  return (
    <div className="burst-layer" aria-hidden="true">
      {bursts.map((b) => (
        <div key={b.key} className="burst-origin">
          {b.particles.map((p, i) => (
            <span
              key={i}
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
