// 게임 수식 — 순수 함수만. 규칙(CLAUDE.md): 스토어/React import 금지, 단위 테스트 유지.
// 비용 곡선 버그는 세이브를 오염시키므로 formulas.test.ts로 경계값을 고정한다.
import { COST_GROWTH, type GeneratorDef } from '../data/generators.ts'
import type { UpgradeDef } from '../data/upgrades.ts'
import { PRESTIGE_THRESHOLD, STARDUST_MULT_PER } from '../data/config.ts'

// ceil 정책: 비용은 항상 정수로 올림한다(표시·구매 동일 값).
// 단건 구매 가격 = baseCost × 1.15^보유수.
export function generatorCost(baseCost: number, owned: number): number {
  return Math.ceil(baseCost * COST_GROWTH ** owned)
}

// count개 일괄 구매 총액. 등비수열 합 공식으로 계산한 뒤 한 번만 ceil.
//   Σ_{i=0}^{count-1} baseCost·r^(owned+i) = baseCost·r^owned·(r^count − 1)/(r − 1)
// (개별 가격을 각각 ceil해 더한 값과는 최대 count-1만큼 차이날 수 있으나,
//  "raw 합을 한 번 ceil"을 기준으로 삼아 구매·표시·검산을 모두 일관되게 맞춘다.)
export function bulkCost(baseCost: number, owned: number, count: number): number {
  if (count <= 0) return 0
  const r = COST_GROWTH
  const raw = (baseCost * r ** owned * (r ** count - 1)) / (r - 1)
  return Math.ceil(raw)
}

// 현재 마나로 살 수 있는 최대 개수. 로그 공식으로 근사한 뒤 검산으로 ±오차 보정.
//   mana ≥ baseCost·r^owned·(r^n − 1)/(r − 1)  를 n에 대해 풀면
//   n ≤ log_r( 1 + mana·(r−1)/(baseCost·r^owned) )
export function maxAffordable(baseCost: number, owned: number, mana: number): number {
  const r = COST_GROWTH
  // 1개도 못 사면 즉시 0.
  if (mana < generatorCost(baseCost, owned)) return 0

  const ratio = (mana * (r - 1)) / (baseCost * r ** owned) + 1
  let n = Math.floor(Math.log(ratio) / Math.log(r))
  if (n < 0) n = 0

  // 검산 보정: ceil로 인한 오차를 실제 bulkCost로 정확히 맞춘다.
  while (bulkCost(baseCost, owned, n + 1) <= mana) n += 1
  while (n > 0 && bulkCost(baseCost, owned, n) > mana) n -= 1
  return n
}

// 특정 티어의 생산 배율. 구매된 업그레이드에서:
//   - generatorMult(×2 마일스톤): 곱으로 누적
//   - synergy: (1 + sourceCount × percentPerSource/100) 곱
// 다른 티어를 대상으로 한 효과는 무시한다.
export function generatorMultiplier(
  generatorId: string,
  purchasedUpgrades: UpgradeDef[],
  counts: Record<string, number>,
): number {
  let mult = 1
  for (const u of purchasedUpgrades) {
    const e = u.effect
    if (e.kind === 'generatorMult' && e.generatorId === generatorId) {
      mult *= e.mult
    } else if (e.kind === 'synergy' && e.targetId === generatorId) {
      const sourceCount = counts[e.sourceId] ?? 0
      mult *= 1 + (sourceCount * e.percentPerSource) / 100
    }
  }
  return mult
}

// 전체 MPS = Σ (보유수 × 개당 baseMps × 티어 배율) × 스타더스트 배율.
// purchasedUpgrades 미지정(기본 [])이면 배율 1 — 업그레이드 없을 때 기존 값과 동일.
// stardustMult 미지정(기본 1)이면 각성 배율 없음 — 각성 전과 동일. 전체에 한 번만 곱한다.
export function totalMps(
  counts: Record<string, number>,
  generators: GeneratorDef[],
  purchasedUpgrades: UpgradeDef[] = [],
  stardustMult: number = 1,
): number {
  let total = 0
  for (const g of generators) {
    total += (counts[g.id] ?? 0) * g.baseMps * generatorMultiplier(g.id, purchasedUpgrades, counts)
  }
  return total * stardustMult
}

// 각성 보상: 이번 생 누적 마나로 얻는 스타더스트 = floor(sqrt(누적 마나 / 임계값)).
// 임계 미만이면 0(sqrt<1의 floor). 정확히 임계면 1, 4배면 2, 9배면 3 …
export function stardustFor(lifetimeMana: number): number {
  if (lifetimeMana < PRESTIGE_THRESHOLD) return 0
  return Math.floor(Math.sqrt(lifetimeMana / PRESTIGE_THRESHOLD))
}

// 스타더스트 영구 배율 = 1 + stardust × 개당 증가분. 0개면 1.0(배율 없음).
export function stardustMultiplier(stardust: number): number {
  return 1 + stardust * STARDUST_MULT_PER
}

// 클릭당 획득량 = 기본 클릭력 + MPS × (clickMpsPercent 합 / 100).
// 업그레이드가 없으면 basePower 그대로.
export function clickPower(
  basePower: number,
  mps: number,
  purchasedUpgrades: UpgradeDef[] = [],
): number {
  let percent = 0
  for (const u of purchasedUpgrades) {
    if (u.effect.kind === 'clickMpsPercent') percent += u.effect.percent
  }
  return basePower + (mps * percent) / 100
}

// 해금 조건 판정(순수). 시설 보유수 또는 총 MPS 기준.
export function isUpgradeUnlocked(
  def: UpgradeDef,
  counts: Record<string, number>,
  mps: number,
): boolean {
  const c = def.unlock
  if (c.kind === 'ownedCount') return (counts[c.generatorId] ?? 0) >= c.minOwned
  return mps >= c.minMps
}
