import { memo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGameStore } from '../store/gameStore.ts'
import type { GeneratorDef } from '../data/generators.ts'
import { generatorCost, bulkCost, maxAffordable } from '../engine/formulas.ts'
import { formatNumber } from '../utils/format.ts'

interface Props {
  def: GeneratorDef
  // 노출 정책(T2.3): true면 완전 노출, false면 ??? 실루엣(비용만).
  revealed: boolean
}

// 한 시설 행. React.memo + 행 단위 셀렉터로, tick마다 값이 안 변한 행은 리렌더되지 않는다.
// 핵심: 셀렉터가 원시값/얕은 객체를 돌려주므로 mana가 매 tick 변해도
//   canAfford(불리언)·cost가 그대로면 리렌더가 발생하지 않는다.
//   (단 ×MAX는 마나에 따라 개수·가격이 바뀌므로 이때만 tick마다 갱신 — 의도된 동작.)
function GeneratorRow({ def, revealed }: Props) {
  const { owned, count, cost, canAfford } = useGameStore(
    useShallow((s) => {
      const owned = s.generators[def.id] ?? 0
      if (s.buyAmount === 'max') {
        const n = maxAffordable(def.baseCost, owned, s.mana)
        // 0개면 1개 가격을 표시하고 버튼은 disabled.
        const cost = n > 0 ? bulkCost(def.baseCost, owned, n) : generatorCost(def.baseCost, owned)
        return { owned, count: n, cost, canAfford: n > 0 }
      }
      const n = s.buyAmount
      const cost = bulkCost(def.baseCost, owned, n)
      return { owned, count: n, cost, canAfford: s.mana >= cost }
    }),
  )
  const buyGenerator = useGameStore((s) => s.buyGenerator)

  // 실루엣: 다음-다음 티어 미리보기. 이름/생산 숨기고 비용만.
  if (!revealed) {
    return (
      <div className="generator-row generator-row--locked">
        <span className="generator-icon">❔</span>
        <div className="generator-body">
          <div className="generator-name">???</div>
          <div className="generator-sub">해금 비용 {formatNumber(generatorCost(def.baseCost, 0))}</div>
        </div>
      </div>
    )
  }

  const handleBuy = () => {
    if (canAfford) buyGenerator(def.id, count)
  }

  return (
    <div className={`generator-row${canAfford ? ' can-afford' : ''}`}>
      <span className="generator-icon">{def.icon}</span>
      <div className="generator-body">
        <div className="generator-name">
          {def.name}
          <span className="generator-owned">{owned}</span>
        </div>
        <div className="generator-sub">개당 {formatNumber(def.baseMps)}/s</div>
      </div>
      <button
        type="button"
        className={`generator-buy${canAfford ? ' can-afford' : ''}`}
        onClick={handleBuy}
        disabled={!canAfford}
      >
        <span className="generator-buy-count">×{count}</span>
        <span className="generator-buy-cost">{formatNumber(cost)}</span>
      </button>
    </div>
  )
}

export default memo(GeneratorRow)
