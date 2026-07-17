import { memo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGameStore } from '../store/gameStore.ts'
import { UPGRADES, type UpgradeDef } from '../data/upgrades.ts'
import { isUpgradeUnlocked } from '../engine/formulas.ts'
import { formatNumber } from '../utils/format.ts'

// 노출 정책(T3.1): 해금됐고 아직 안 산 업그레이드만 카드로 노출.
// 조건 미달은 숨김, 구매하면 목록에서 사라진다.
// 이 셀렉터는 generators/upgrades/manaPerSecond에만 의존한다(모두 tick에서 불변) —
// useShallow로 id 배열만 구독하므로 mana가 매 tick 변해도 리렌더되지 않는다.
function visibleUpgradeIds(counts: Record<string, number>, mps: number, owned: string[]): string[] {
  const ownedSet = new Set(owned)
  return UPGRADES.filter((u) => !ownedSet.has(u.id) && isUpgradeUnlocked(u, counts, mps)).map(
    (u) => u.id,
  )
}

export default function UpgradePanel() {
  const visibleIds = useGameStore(
    useShallow((s) => visibleUpgradeIds(s.generators, s.manaPerSecond, s.upgrades)),
  )

  // 노출할 업그레이드가 없으면 섹션 자체를 숨긴다(빈 헤더 방지).
  if (visibleIds.length === 0) return null

  return (
    <div className="upgrade-panel">
      <h2 className="upgrade-panel-title">업그레이드</h2>
      <div className="upgrade-cards">
        {visibleIds.map((id) => (
          <UpgradeCard key={id} def={UPGRADES.find((u) => u.id === id)!} />
        ))}
      </div>
    </div>
  )
}

interface CardProps {
  def: UpgradeDef
}

// 개별 카드는 자신의 구매 가능 여부(불리언)만 구독 — mana가 매 tick 변해도
// can-afford가 그대로면 리렌더되지 않는다(GeneratorRow와 동일 패턴).
function UpgradeCardBase({ def }: CardProps) {
  const canAfford = useGameStore((s) => s.mana >= def.cost)
  const buyUpgrade = useGameStore((s) => s.buyUpgrade)

  return (
    <button
      type="button"
      className={`upgrade-card${canAfford ? ' can-afford' : ''}`}
      onClick={() => {
        if (canAfford) buyUpgrade(def.id)
      }}
      disabled={!canAfford}
    >
      <span className="upgrade-card-name">{def.name}</span>
      <span className="upgrade-card-desc">{def.desc}</span>
      <span className="upgrade-card-cost">{formatNumber(def.cost)}</span>
    </button>
  )
}

const UpgradeCard = memo(UpgradeCardBase)
