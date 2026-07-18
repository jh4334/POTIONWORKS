import { describe, it, expect } from 'vitest'
import {
  generatorCost,
  bulkCost,
  maxAffordable,
  totalMps,
  generatorMultiplier,
  clickPower,
  isUpgradeUnlocked,
  isAchievementUnlocked,
  achievementCurrent,
  stardustFor,
  stardustMultiplier,
  achievementMultiplier,
  effectiveGeneratorMps,
  mpsDelta,
  type AchievementStats,
} from './formulas.ts'
import { COST_GROWTH, type GeneratorDef } from '../data/generators.ts'
import type { UpgradeDef } from '../data/upgrades.ts'
import type { AchievementDef } from '../data/achievements.ts'

// 테스트용 업그레이드 정의(수식만 검증하므로 name/desc/cost/unlock은 의미값만 채운다).
function mult2(generatorId: string): UpgradeDef {
  return {
    id: `${generatorId}-x2`,
    name: '',
    desc: '',
    cost: 0,
    unlock: { kind: 'ownedCount', generatorId, minOwned: 10 },
    effect: { kind: 'generatorMult', generatorId, mult: 2 },
  }
}

function synergy(sourceId: string, targetId: string, percentPerSource: number): UpgradeDef {
  return {
    id: `${sourceId}-${targetId}`,
    name: '',
    desc: '',
    cost: 0,
    unlock: { kind: 'ownedCount', generatorId: sourceId, minOwned: 25 },
    effect: { kind: 'synergy', sourceId, targetId, percentPerSource },
  }
}

function clickPercent(percent: number): UpgradeDef {
  return {
    id: `click-${percent}`,
    name: '',
    desc: '',
    cost: 0,
    unlock: { kind: 'totalMps', minMps: 10 },
    effect: { kind: 'clickMpsPercent', percent },
  }
}

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

  it('count===1은 generatorCost와 완전 일치(큰 보유수 경계에서도, D-2)', () => {
    // 등비합 부동소수 오차로 ~2e15+에서 1 어긋나던 경계를 단락 처리로 없앤다.
    for (const owned of [0, 1, 7, 50, 100, 200, 260]) {
      expect(bulkCost(15, owned, 1)).toBe(generatorCost(15, owned))
      expect(bulkCost(1_400_000, owned, 1)).toBe(generatorCost(1_400_000, owned))
    }
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

  it('비유한 마나(Infinity/NaN)는 0 — 무한루프/프리즈 차단(D-2)', () => {
    expect(maxAffordable(15, 0, Infinity)).toBe(0)
    expect(maxAffordable(15, 0, NaN)).toBe(0)
    expect(maxAffordable(15, 0, -Infinity)).toBe(0)
  })

  it('1개-구매 가드는 bulkCost(…,1) 기준(=generatorCost)으로 통일', () => {
    // bulkCost(15,0,1)=15와 정확히 같은 경계에서 0↔1이 갈린다.
    expect(maxAffordable(15, 0, bulkCost(15, 0, 1) - 1)).toBe(0)
    expect(maxAffordable(15, 0, bulkCost(15, 0, 1))).toBe(1)
  })

  it('아주 큰(유한) 마나도 프리즈 없이 유한 개수를 반환', () => {
    const n = maxAffordable(15, 0, 1e300)
    expect(Number.isFinite(n)).toBe(true)
    expect(n).toBeGreaterThan(0)
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

  it('업그레이드 없으면 기존 값 불변', () => {
    // purchasedUpgrades 미지정과 [] 모두 배율 1.
    expect(totalMps({ a: 10, b: 3 }, gens, [])).toBeCloseTo(10 * 0.1 + 3 * 1)
    expect(totalMps({ a: 10, b: 3 }, gens, [])).toBe(totalMps({ a: 10, b: 3 }, gens))
  })

  it('×2 마일스톤이 해당 티어에만 반영', () => {
    // a는 ×2, b는 그대로: 10*0.1*2 + 3*1 = 2 + 3 = 5
    expect(totalMps({ a: 10, b: 3 }, gens, [mult2('a')])).toBeCloseTo(5)
  })

  it('×2 마일스톤 두 개는 곱으로 누적(×4)', () => {
    expect(totalMps({ a: 10, b: 0 }, gens, [mult2('a'), mult2('a')])).toBeCloseTo(10 * 0.1 * 4)
  })

  it('시너지: a 10개 → b 생산 +10%', () => {
    // b 배율 (1 + 10 * 1/100) = 1.1 → 3 * 1 * 1.1 = 3.3, a는 10*0.1 = 1
    expect(totalMps({ a: 10, b: 3 }, gens, [synergy('a', 'b', 1)])).toBeCloseTo(1 + 3.3)
  })

  it('스타더스트 배율은 전체에 한 번만 곱한다', () => {
    const base = 10 * 0.1 + 3 * 1 // 4
    // 미지정=1(기존과 동일), 1.1배, 2배
    expect(totalMps({ a: 10, b: 3 }, gens, [])).toBeCloseTo(base)
    expect(totalMps({ a: 10, b: 3 }, gens, [], 1)).toBeCloseTo(base)
    expect(totalMps({ a: 10, b: 3 }, gens, [], 1.1)).toBeCloseTo(base * 1.1)
    expect(totalMps({ a: 10, b: 3 }, gens, [], 2)).toBeCloseTo(base * 2)
  })
})

describe('effectiveGeneratorMps', () => {
  const genA: GeneratorDef = { id: 'a', tier: 1, name: 'A', icon: '', baseCost: 15, baseMps: 0.1 }
  const genB: GeneratorDef = { id: 'b', tier: 2, name: 'B', icon: '', baseCost: 100, baseMps: 1 }

  it('업그레이드·배율 없으면 baseMps 그대로', () => {
    expect(effectiveGeneratorMps(genA, [], {})).toBeCloseTo(0.1)
  })

  it('티어 배율(×2)과 전체 배율을 곱한다', () => {
    // b: 1 × 2(마일스톤) × 1.5(전체) = 3
    expect(effectiveGeneratorMps(genB, [mult2('b')], {}, 1.5)).toBeCloseTo(3)
  })

  it('시너지 소스 보유수를 반영', () => {
    // b 개당: 1 × (1 + 10×1/100) = 1.1
    expect(effectiveGeneratorMps(genB, [synergy('a', 'b', 1)], { a: 10 })).toBeCloseTo(1.1)
  })
})

describe('mpsDelta', () => {
  const gens: GeneratorDef[] = [
    { id: 'a', tier: 1, name: 'A', icon: '', baseCost: 15, baseMps: 0.1 },
    { id: 'b', tier: 2, name: 'B', icon: '', baseCost: 100, baseMps: 1 },
  ]

  it('추가 구매분의 전체 MPS 증가 = 개당 실효 × 개수', () => {
    // a 10개 추가: 10 × 0.1 = 1
    expect(mpsDelta('a', 10, { a: 0, b: 0 }, gens)).toBeCloseTo(1)
  })

  it('전체 배율을 반영', () => {
    expect(mpsDelta('a', 10, { a: 0, b: 0 }, gens, [], 2)).toBeCloseTo(2)
  })

  it('시너지: 소스 시설 추가는 대상 시설 생산 증가분까지 포함', () => {
    // synergy a→b +1%/개. b 3개 보유 상태에서 a 10개 추가:
    // before: a 0 → b 3×1 = 3. after: a 10 → b 3×(1+10×1/100)=3.3, a 10×0.1=1 → 4.3. 델타 = 1.3
    expect(mpsDelta('a', 10, { a: 0, b: 3 }, gens, [synergy('a', 'b', 1)])).toBeCloseTo(1.3)
  })
})

describe('achievementCurrent', () => {
  function ach(condition: AchievementDef['condition']): AchievementDef {
    return { id: 'x', name: '', desc: '', condition }
  }
  const stats: AchievementStats = {
    totalClicks: 42,
    generators: { apprentice: 7 },
    totalLifetimeMana: 12345,
    totalPrestiges: 3,
    mps: 99,
  }

  it('조건 종류별 현재값을 통계에서 파생', () => {
    expect(achievementCurrent(ach({ kind: 'clicks', min: 100 }), stats)).toBe(42)
    expect(
      achievementCurrent(ach({ kind: 'generatorCount', generatorId: 'apprentice', min: 50 }), stats),
    ).toBe(7)
    expect(achievementCurrent(ach({ kind: 'lifetimeMana', min: 1e6 }), stats)).toBe(12345)
    expect(achievementCurrent(ach({ kind: 'prestiges', min: 5 }), stats)).toBe(3)
    expect(achievementCurrent(ach({ kind: 'mps', min: 100 }), stats)).toBe(99)
  })

  it('보유하지 않은 시설은 0', () => {
    expect(
      achievementCurrent(ach({ kind: 'generatorCount', generatorId: 'cauldron', min: 1 }), stats),
    ).toBe(0)
  })
})

describe('stardustFor', () => {
  it('임계(1e9) 미만이면 0', () => {
    expect(stardustFor(0)).toBe(0)
    expect(stardustFor(5e8)).toBe(0)
    expect(stardustFor(1e9 - 1)).toBe(0)
  })

  it('정확히 1e9 → 1, 4e9 → 2, 9e9 → 3', () => {
    expect(stardustFor(1e9)).toBe(1)
    expect(stardustFor(4e9)).toBe(2)
    expect(stardustFor(9e9)).toBe(3)
  })

  it('제곱 경계 사이는 아래 정수로 내림', () => {
    // 3.9e9 → sqrt(3.9)=1.97 → 1, 8.9e9 → sqrt(8.9)=2.98 → 2
    expect(stardustFor(3.9e9)).toBe(1)
    expect(stardustFor(8.9e9)).toBe(2)
  })

  it('비유한 입력(NaN/Infinity)은 0 (NaN이 임계 비교를 통과하는 문제 방어, D-2)', () => {
    expect(stardustFor(NaN)).toBe(0)
    expect(stardustFor(Infinity)).toBe(0)
    expect(stardustFor(-Infinity)).toBe(0)
  })
})

describe('stardustMultiplier', () => {
  it('0개면 1.0, 1개면 1.1, 10개면 2.0', () => {
    expect(stardustMultiplier(0)).toBeCloseTo(1.0)
    expect(stardustMultiplier(1)).toBeCloseTo(1.1)
    expect(stardustMultiplier(10)).toBeCloseTo(2.0)
  })
})

describe('achievementMultiplier', () => {
  it('0개면 1.0, 1개면 1.01, 20개면 1.2', () => {
    expect(achievementMultiplier(0)).toBeCloseTo(1.0)
    expect(achievementMultiplier(1)).toBeCloseTo(1.01)
    expect(achievementMultiplier(20)).toBeCloseTo(1.2)
  })

  it('전체 배율은 스타더스트×업적 합성 — totalMps에 한 번만 곱한다', () => {
    const gens: GeneratorDef[] = [{ id: 'a', tier: 1, name: 'A', icon: '', baseCost: 15, baseMps: 1 }]
    const base = 10 // a 10개 × 1
    const globalMult = stardustMultiplier(5) * achievementMultiplier(10) // 1.5 × 1.1 = 1.65
    expect(totalMps({ a: 10 }, gens, [], globalMult)).toBeCloseTo(base * 1.65)
  })
})

describe('generatorMultiplier', () => {
  it('업그레이드 없으면 1', () => {
    expect(generatorMultiplier('a', [], {})).toBe(1)
  })

  it('×2와 시너지(+10%)가 곱으로 결합', () => {
    // b: ×2 * (1 + 10*1/100) = 2 * 1.1 = 2.2
    expect(generatorMultiplier('b', [mult2('b'), synergy('a', 'b', 1)], { a: 10 })).toBeCloseTo(2.2)
  })

  it('다른 티어 대상 효과는 무시', () => {
    expect(generatorMultiplier('a', [mult2('b'), synergy('a', 'b', 1)], { a: 10 })).toBe(1)
  })
})

describe('clickPower', () => {
  it('업그레이드 없으면 basePower 그대로', () => {
    expect(clickPower(1, 1000, [])).toBe(1)
    expect(clickPower(5, 1000)).toBe(5)
  })

  it('클릭 1%: base + mps × 1%', () => {
    // 1 + 1000 * 1/100 = 1 + 10 = 11
    expect(clickPower(1, 1000, [clickPercent(1)])).toBeCloseTo(11)
  })

  it('clickMpsPercent는 누적 합산(1% + 1% = 2%)', () => {
    // 1 + 1000 * 2/100 = 1 + 20 = 21
    expect(clickPower(1, 1000, [clickPercent(1), clickPercent(1)])).toBeCloseTo(21)
  })
})

describe('isUpgradeUnlocked', () => {
  it('ownedCount 조건: 보유수 도달 시 해금', () => {
    const def = mult2('a') // minOwned 10
    expect(isUpgradeUnlocked(def, { a: 9 }, 0)).toBe(false)
    expect(isUpgradeUnlocked(def, { a: 10 }, 0)).toBe(true)
  })

  it('totalMps 조건: MPS 도달 시 해금', () => {
    const def = clickPercent(1) // minMps 10
    expect(isUpgradeUnlocked(def, {}, 9.9)).toBe(false)
    expect(isUpgradeUnlocked(def, {}, 10)).toBe(true)
  })
})

describe('isAchievementUnlocked', () => {
  function ach(condition: AchievementDef['condition']): AchievementDef {
    return { id: 'x', name: '', desc: '', condition }
  }
  const base: AchievementStats = {
    totalClicks: 0,
    generators: {},
    totalLifetimeMana: 0,
    totalPrestiges: 0,
    mps: 0,
  }

  it('clicks: 총 클릭 수 경계', () => {
    const def = ach({ kind: 'clicks', min: 100 })
    expect(isAchievementUnlocked(def, { ...base, totalClicks: 99 })).toBe(false)
    expect(isAchievementUnlocked(def, { ...base, totalClicks: 100 })).toBe(true)
  })

  it('generatorCount: 특정 시설 보유수 경계', () => {
    const def = ach({ kind: 'generatorCount', generatorId: 'apprentice', min: 50 })
    expect(isAchievementUnlocked(def, { ...base, generators: { apprentice: 49 } })).toBe(false)
    expect(isAchievementUnlocked(def, { ...base, generators: { apprentice: 50 } })).toBe(true)
    // 다른 시설 보유는 무시.
    expect(isAchievementUnlocked(def, { ...base, generators: { cauldron: 999 } })).toBe(false)
  })

  it('lifetimeMana: 전생 포함 총 누적 마나 경계', () => {
    const def = ach({ kind: 'lifetimeMana', min: 1e6 })
    expect(isAchievementUnlocked(def, { ...base, totalLifetimeMana: 1e6 - 1 })).toBe(false)
    expect(isAchievementUnlocked(def, { ...base, totalLifetimeMana: 1e6 })).toBe(true)
  })

  it('prestiges: 각성 횟수 경계', () => {
    const def = ach({ kind: 'prestiges', min: 5 })
    expect(isAchievementUnlocked(def, { ...base, totalPrestiges: 4 })).toBe(false)
    expect(isAchievementUnlocked(def, { ...base, totalPrestiges: 5 })).toBe(true)
  })

  it('mps: 현재 MPS 경계', () => {
    const def = ach({ kind: 'mps', min: 100 })
    expect(isAchievementUnlocked(def, { ...base, mps: 99.9 })).toBe(false)
    expect(isAchievementUnlocked(def, { ...base, mps: 100 })).toBe(true)
  })
})
