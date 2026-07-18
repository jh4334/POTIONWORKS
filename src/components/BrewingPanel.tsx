import { memo, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGameStore } from '../store/gameStore.ts'
import { POTIONS, potionById, type PotionDef } from '../data/potions.ts'
import { isPotionUnlocked, potionCost, remainingBrewMs } from '../engine/formulas.ts'
import { formatNumber } from '../utils/format.ts'
import { playDing } from '../engine/sound.ts'
import { STRINGS } from '../data/strings.ts'

// E-1.2 포션 조제 패널 — 좌측(클릭 패널 하단, 각성 패널 위).
// 세 상태: 대기(포션 카드) / 조제 중(진행 바) / 완성(수확 버튼). 첫 포션 해금 전에는 패널 자체를 숨긴다(온보딩).
// 진실은 타임스탬프(store.brewing.readyAt) — 여기 1초 인터벌은 남은 시간 "표시 전용"이다(오프라인 복귀도 자동 반영).
// 리렌더 규율: 셀렉터로 파생 불리언/원시값만 구독 — manaPerSecond는 tick 불변이라 비용도 tick마다 변하지 않는다.

// ms → "M:SS"(분:초). 조제 시간(고정)·남은 시간(라이브) 공용. 최대 30분이라 시:분은 불필요.
function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// 대기 상태의 한 포션 카드. 자신의 비용(현재 MPS 기준)·구매 가능 여부만 구독 —
// mana가 매 tick 변해도 can-afford가 그대로면 리렌더되지 않는다(UpgradeCard와 동일 패턴).
function PotionCardBase({ def }: { def: PotionDef }) {
  const cost = useGameStore((s) => potionCost(def, s.manaPerSecond))
  const canAfford = useGameStore((s) => s.mana >= potionCost(def, s.manaPerSecond))
  const startBrew = useGameStore((s) => s.startBrew)

  return (
    <button
      type="button"
      className={`potion-card${canAfford ? ' can-afford' : ''}`}
      onClick={() => {
        if (!canAfford) return
        startBrew(def.id)
        playDing() // 조제 시작음. muted면 sound가 무시.
      }}
      disabled={!canAfford}
    >
      <span className="potion-card-icon">{def.icon}</span>
      <span className="potion-card-name">{def.name}</span>
      <span className="potion-card-desc">{def.desc}</span>
      <span className="potion-card-cost">{STRINGS.brewing.cost(formatNumber(cost))}</span>
      <span className="potion-card-time">{STRINGS.brewing.brewTime(formatClock(def.brewMs))}</span>
    </button>
  )
}
const PotionCard = memo(PotionCardBase)

// 조제 중: 진행 바 + "조제 중: {포션명}". 1초 인터벌로 남은 시간만 갱신(표시 전용, 진실은 store readyAt).
function BrewingProgress({ potionId, readyAt }: { potionId: string; readyAt: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const def = potionById(potionId)
  if (!def) return null
  const remaining = remainingBrewMs({ readyAt }, now)
  const pct = def.brewMs > 0 ? Math.min(100, Math.max(0, (1 - remaining / def.brewMs) * 100)) : 100

  return (
    <div className="brewing-progress">
      <div className="brewing-progress-label">
        <span className="brewing-progress-name">{STRINGS.brewing.brewingLabel(def.name)}</span>
        <span className="brewing-progress-remaining">
          {STRINGS.brewing.remaining(formatClock(remaining))}
        </span>
      </div>
      <div className="brewing-progress-bar">
        <div className="brewing-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// 완성: 반짝이는 수확 버튼. 수확은 능동 행위 — 클릭해야 효과가 적용된다(자동 수확 금지).
function CollectView({ potionId }: { potionId: string }) {
  const collectPotion = useGameStore((s) => s.collectPotion)
  const def = potionById(potionId)
  if (!def) return null
  return (
    <button type="button" className="potion-collect can-afford" onClick={() => collectPotion()}>
      {STRINGS.brewing.collectButton(def.name)}
    </button>
  )
}

export default function BrewingPanel() {
  // 해금 여부: 전생 포함 총 누적 마나가 첫 포션 임계 이상이면 노출. 파생 불리언이라 한 번만 flip(리렌더 최소).
  const anyUnlocked = useGameStore((s) =>
    POTIONS.some((p) => isPotionUnlocked(p, s.totalLifetimeMana)),
  )
  // 조제/수확 상태(원시값 구독 — brewing 객체는 tick 불변 참조라 tick마다 리렌더되지 않는다).
  const brewingPotionId = useGameStore((s) => s.brewing?.potionId ?? null)
  const readyAt = useGameStore((s) => s.brewing?.readyAt ?? null)
  const readyPotion = useGameStore((s) => s.readyPotion)
  // 해금된 포션 id 목록(누적 마나 파생 — 새 포션이 해금될 때만 바뀐다).
  const unlockedIds = useGameStore(
    useShallow((s) =>
      POTIONS.filter((p) => isPotionUnlocked(p, s.totalLifetimeMana)).map((p) => p.id),
    ),
  )

  // 첫 포션 해금 전에는 패널 자체를 숨긴다(온보딩 원칙 — 조기 노출 방지).
  if (!anyUnlocked) return null

  return (
    <div className="brewing-panel">
      <h2 className="brewing-title">{STRINGS.brewing.title}</h2>
      {readyPotion !== null ? (
        <CollectView potionId={readyPotion} />
      ) : brewingPotionId !== null && readyAt !== null ? (
        <BrewingProgress potionId={brewingPotionId} readyAt={readyAt} />
      ) : (
        <div className="potion-cards">
          {unlockedIds.map((id) => (
            <PotionCard key={id} def={potionById(id)!} />
          ))}
        </div>
      )}
    </div>
  )
}
