import { memo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGameStore } from '../store/gameStore.ts'
import { GENERATORS, type GeneratorDef } from '../data/generators.ts'
import { resolveUpgrades } from '../data/upgrades.ts'
import {
  generatorCost,
  bulkCost,
  maxAffordable,
  effectiveGeneratorMps,
  mpsDelta,
} from '../engine/formulas.ts'
import { formatNumber } from '../utils/format.ts'
import { playDing } from '../engine/sound.ts'

interface Props {
  def: GeneratorDef
  // 노출 정책(T2.3): true면 완전 노출, false면 ??? 실루엣(비용만).
  revealed: boolean
}

// 전체의 몇 %인지 표기(10% 이상은 정수, 미만은 소수 1자리).
function formatPercent(percent: number): string {
  return percent.toFixed(percent >= 10 ? 0 : 1)
}

// 한 시설 행. React.memo + 행 단위 셀렉터로, tick마다 값이 안 변한 행은 리렌더되지 않는다.
// 실효값(개당/총/델타)은 generators/upgrades/globalMult/manaPerSecond에만 의존(모두 tick 불변)하므로
// mana가 매 tick 변해도 셀렉터가 얕게 같은 값을 돌려주면 리렌더가 발생하지 않는다.
//   (단 ×MAX는 마나에 따라 개수·가격이 바뀌므로 이때만 tick마다 갱신 — 의도된 동작.)
function GeneratorRow({ def, revealed }: Props) {
  const { owned, count, cost, canAfford, perUnit, genTotal, percent, delta } = useGameStore(
    useShallow((s) => {
      const owned = s.generators[def.id] ?? 0
      const ups = resolveUpgrades(s.upgrades)
      const gm = s.globalMult
      // 개당 실효 생산 = baseMps × 티어 배율 × 전체 배율.
      const perUnit = effectiveGeneratorMps(def, ups, s.generators, gm)
      const genTotal = owned * perUnit
      const whole = s.manaPerSecond
      const percent = whole > 0 ? (genTotal / whole) * 100 : 0

      let count: number
      let cost: number
      let canAfford: boolean
      if (s.buyAmount === 'max') {
        const n = maxAffordable(def.baseCost, owned, s.mana)
        // 0개면 1개 가격을 표시하고 버튼은 비활성.
        cost = n > 0 ? bulkCost(def.baseCost, owned, n) : generatorCost(def.baseCost, owned)
        count = n
        canAfford = n > 0
      } else {
        count = s.buyAmount
        cost = bulkCost(def.baseCost, owned, count)
        canAfford = s.mana >= cost
      }
      // 구매 델타는 실제 구매될 개수 기준(0개 살 수 없을 땐 1개 기준 미리보기).
      const delta = mpsDelta(def.id, count > 0 ? count : 1, s.generators, GENERATORS, ups, gm)
      return { owned, count, cost, canAfford, perUnit, genTotal, percent, delta }
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
          <div className="generator-sub">
            해금 비용 {formatNumber(generatorCost(def.baseCost, 0))} 💧
          </div>
        </div>
      </div>
    )
  }

  // ×MAX 0개면 "×0" 대신 "×1"을 비활성으로 표기(D-2.7).
  const displayCount = count > 0 ? count : 1

  const handleBuy = () => {
    if (!canAfford) return // aria-disabled 상태에서도 클릭이 새지 않게 방어.
    buyGenerator(def.id, count)
    playDing() // 구매 성공음. muted면 sound가 무시.
  }

  return (
    <div className={`generator-row${canAfford ? ' can-afford' : ''}`}>
      <span className="generator-icon">{def.icon}</span>
      <div className="generator-body">
        <div className="generator-name">
          {def.name}
          <span className="generator-owned">{owned}</span>
        </div>
        <div className="generator-sub">개당 {formatNumber(perUnit)}/s</div>
        {owned > 0 && (
          <div className="generator-sub generator-total">
            총 {formatNumber(genTotal)}/s (전체의 {formatPercent(percent)}%)
          </div>
        )}
      </div>
      <button
        type="button"
        className={`generator-buy${canAfford ? ' can-afford' : ''}`}
        onClick={handleBuy}
        aria-disabled={!canAfford}
        aria-label={`${def.name} ×${displayCount} 구매, 비용 ${formatNumber(cost)} 마나`}
        title={`구매 시 +${formatNumber(delta)}/s`}
      >
        <span className="generator-buy-count">×{displayCount}</span>
        <span className="generator-buy-cost">{formatNumber(cost)} 💧</span>
        <span className="generator-buy-delta">+{formatNumber(delta)}/s</span>
      </button>
    </div>
  )
}

export default memo(GeneratorRow)
