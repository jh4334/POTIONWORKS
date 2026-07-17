// 게임 수식 — 순수 함수만. 규칙(CLAUDE.md): 스토어/React import 금지, 단위 테스트 유지.
// 비용 곡선 버그는 세이브를 오염시키므로 formulas.test.ts로 경계값을 고정한다.
import { COST_GROWTH, type GeneratorDef } from '../data/generators.ts'

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

// 전체 MPS. 아직 배율 없음(M3에서 마일스톤·시너지 배율로 확장).
export function totalMps(counts: Record<string, number>, generators: GeneratorDef[]): number {
  let total = 0
  for (const g of generators) {
    total += (counts[g.id] ?? 0) * g.baseMps
  }
  return total
}
