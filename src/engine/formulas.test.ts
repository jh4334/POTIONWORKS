import { describe, it, expect } from 'vitest'
import { generatorCost, bulkCost, maxAffordable, totalMps } from './formulas.ts'
import { COST_GROWTH, type GeneratorDef } from '../data/generators.ts'

// 테스트 기준(raw 합을 한 번 ceil) — bulkCost의 정답 계산을 루프로 독립 검증.
function rawSumCeil(baseCost: number, owned: number, count: number): number {
  let sum = 0
  for (let i = 0; i < count; i += 1) sum += baseCost * COST_GROWTH ** (owned + i)
  return Math.ceil(sum)
}

describe('generatorCost', () => {
  it('보유 0개면 기본 비용 그대로(ceil)', () => {
    expect(generatorCost(15, 0)).toBe(15)
    expect(generatorCost(100, 0)).toBe(100)
  })

  it('보유 1개면 ×1.15 후 ceil', () => {
    expect(generatorCost(15, 1)).toBe(Math.ceil(15 * 1.15)) // 17.25 → 18
    expect(generatorCost(15, 1)).toBe(18)
  })

  it('보유 10개면 ×1.15^10 후 ceil', () => {
    expect(generatorCost(15, 10)).toBe(Math.ceil(15 * COST_GROWTH ** 10))
    expect(generatorCost(15, 10)).toBe(61)
  })
})

describe('bulkCost', () => {
  it('count=1이면 generatorCost와 정확히 일치', () => {
    expect(bulkCost(15, 0, 1)).toBe(generatorCost(15, 0))
    expect(bulkCost(15, 7, 1)).toBe(generatorCost(15, 7))
    expect(bulkCost(100, 3, 1)).toBe(generatorCost(100, 3))
  })

  it('개별 합(raw 합을 한 번 ceil)과 일치', () => {
    expect(bulkCost(15, 0, 2)).toBe(rawSumCeil(15, 0, 2))
    expect(bulkCost(15, 0, 10)).toBe(rawSumCeil(15, 0, 10))
    expect(bulkCost(15, 5, 10)).toBe(rawSumCeil(15, 5, 10))
    expect(bulkCost(100, 12, 25)).toBe(rawSumCeil(100, 12, 25))
    expect(bulkCost(1_400_000, 0, 50)).toBe(rawSumCeil(1_400_000, 0, 50))
  })

  it('count<=0이면 0', () => {
    expect(bulkCost(15, 0, 0)).toBe(0)
    expect(bulkCost(15, 0, -3)).toBe(0)
  })
})

describe('maxAffordable', () => {
  it('딱 맞는 마나면 그 개수, 1 모자라면 하나 적게', () => {
    // bulkCost(15,0,1)=15, bulkCost(15,0,2)=33
    expect(bulkCost(15, 0, 1)).toBe(15)
    expect(bulkCost(15, 0, 2)).toBe(33)

    expect(maxAffordable(15, 0, 15)).toBe(1) // 1개 딱
    expect(maxAffordable(15, 0, 14)).toBe(0) // 1 모자람
    expect(maxAffordable(15, 0, 33)).toBe(2) // 2개 딱
    expect(maxAffordable(15, 0, 32)).toBe(1) // 1 모자람
  })

  it('많은 개수도 검산과 일치 (경계 정확)', () => {
    for (const mana of [0, 15, 100, 1_000, 1e6, 1e9]) {
      const n = maxAffordable(15, 0, mana)
      // n개는 사도 되고, n+1개는 못 산다.
      if (n > 0) expect(bulkCost(15, 0, n)).toBeLessThanOrEqual(mana)
      expect(bulkCost(15, 0, n + 1)).toBeGreaterThan(mana)
    }
  })

  it('보유수가 있어도 경계가 정확', () => {
    const owned = 20
    const cost1 = generatorCost(15, owned)
    expect(maxAffordable(15, owned, cost1 - 1)).toBe(0)
    expect(maxAffordable(15, owned, cost1)).toBe(1)
  })
})

describe('totalMps', () => {
  const gens: GeneratorDef[] = [
    { id: 'a', tier: 1, name: 'A', icon: '', baseCost: 15, baseMps: 0.1 },
    { id: 'b', tier: 2, name: 'B', icon: '', baseCost: 100, baseMps: 1 },
  ]

  it('보유 없으면 0', () => {
    expect(totalMps({}, gens)).toBe(0)
    expect(totalMps({ a: 0, b: 0 }, gens)).toBe(0)
  })

  it('보유수 × 개당 MPS 합', () => {
    expect(totalMps({ a: 10, b: 3 }, gens)).toBeCloseTo(10 * 0.1 + 3 * 1)
  })

  it('data에 없는 id는 무시', () => {
    expect(totalMps({ a: 5, ghost: 999 }, gens)).toBeCloseTo(0.5)
  })
})
