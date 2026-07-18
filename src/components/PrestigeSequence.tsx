import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useGameStore } from '../store/gameStore.ts'

// D-4.4 각성 시퀀스 — totalPrestiges가 증가하면(각성 확정) ~1.5s 연출을 재생한다.
//   골드 radial 플래시(페이드인) → ✨×N 파티클이 중앙에서 헤더 ✨(우상단)로 날아감 → 전체 페이드아웃.
// UI 상태는 컴포넌트 로컬(active 플래그). 완료 후 DOM에서 제거(파티클 잔류 없음).
// 시퀀스 중 오버레이가 입력을 차단한다(CSS pointer-events). reduced-motion 시엔 CSS로 숨김.

const PARTICLE_COUNT = 8 // 최대 8개
const SEQUENCE_MS = 1500

export default function PrestigeSequence() {
  // 각성 횟수만 구독 — 각성 확정 시에만 값이 바뀐다(tick 불변).
  const totalPrestiges = useGameStore((s) => s.totalPrestiges)
  const [active, setActive] = useState(false)
  // 초기값(로드된 세이브 포함)은 재생 기준점 — 최초 마운트에서는 시퀀스를 틀지 않는다.
  const seen = useRef(totalPrestiges)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (totalPrestiges === seen.current) return
    seen.current = totalPrestiges
    setActive(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setActive(false), SEQUENCE_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [totalPrestiges])

  if (!active) return null

  return (
    <div className="prestige-sequence" aria-hidden="true">
      <div className="prestige-flash" />
      <div className="prestige-spark-origin">
        {Array.from({ length: PARTICLE_COUNT }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 고정 개수의 동일 스파크 — 재정렬 없어 인덱스 키가 적절하다.
          <span key={i} className="prestige-spark" style={{ '--i': i } as CSSProperties}>
            ✨
          </span>
        ))}
      </div>
    </div>
  )
}
