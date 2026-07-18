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
  stardustUpgradeCost,
  stardustClickPercent,
  startingApprentices,
  effectiveOfflineEfficiency,
  effectiveOfflineCapMs,
  nextStardustAt,
  prestigeGain,
  composeGlobalMult,
  type AchievementStats,
} from './formulas.ts'
import { COST_GROWTH, GENERATORS, type GeneratorDef, type GeneratorId } from '../data/generators.ts'
import type { UpgradeDef } from '../data/upgrades.ts'
import type { AchievementDef } from '../data/achievements.ts'
import { STARDUST_UPGRADES } from '../data/stardustShop.ts'
import {
  OFFLINE_EFFICIENCY,
  OFFLINE_CAP_MS,
  PRESTIGE_THRESHOLD,
  FIRST_PRESTIGE_BONUS,
} from '../data/config.ts'

// 상점 정의 참조(id로 찾아 데이터 상수에 결합된 테스트가 데이터 변경에 함께 검증되게 한다).
const DEF = (id: string) => STARDUST_UPGRADES.find((u) => u.id === id)!
const HOUR_MS = 60 * 60 * 1000

// 테스트용 업그레이드 정의(수식만 검증하므로 name/desc/cost/unlock은 의미값만 채운다).
// 시설 참조 필드는 GeneratorId로 좁혀졌지만, 이 순수 함수 테스트는 합성 id('a','b')로 검증하므로 캐스팅한다.
function mult2(generatorId: string): UpgradeDef {
  const gid = generatorId as GeneratorId
  return {
    id: `${generatorId}-x2`,
    name: '',
    desc: '',
    cost: 0,
    unlock: { kind: 'ownedCount', generatorId: gid, minOwned: 10 },
    effect: { kind: 'generatorMult', generatorId: gid, mult: 2 },
  }
}

function synergy(sourceId: string, targetId: string, percentPerSource: number): UpgradeDef {
  return {
    id: `${sourceId}-${targetId}`,
    name: '',
    desc: '',
    cost: 0,
    unlock: { kind: 'ownedCount', generatorId: sourceId as GeneratorId, minOwned: 25 },
    effect: {
      kind: 'synergy',
      sourceId: sourceId as GeneratorId,
      targetId: targetId as GeneratorId,
      percentPerSource,
    },
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

describe('composeGlobalMult (D-5.2)', () => {
  it('스타더스트 × 업적 × 버프 배율의 곱', () => {
    // stardust 5 → 1.5, 업적 10 → 1.1, 버프 없음 → 1.
    expect(composeGlobalMult({ stardust: 5, achievementCount: 10 })).toBeCloseTo(1.5 * 1.1)
    // 버프 지정 시 함께 곱해진다.
    expect(composeGlobalMult({ stardust: 5, achievementCount: 10, buffMult: 7 })).toBeCloseTo(
      1.5 * 1.1 * 7,
    )
  })

  it('buffMult 기본값은 1(미지정 = 버프 없음)', () => {
    expect(composeGlobalMult({ stardust: 0, achievementCount: 0 })).toBeCloseTo(1)
    expect(composeGlobalMult({ stardust: 0, achievementCount: 0, buffMult: 1 })).toBeCloseTo(1)
  })

  it('개별 배율 함수(stardustMultiplier·achievementMultiplier)와 동일한 합성 결과', () => {
    for (const [s, a, b] of [
      [0, 0, 1],
      [3, 7, 1],
      [12, 20, 7],
    ] as const) {
      expect(composeGlobalMult({ stardust: s, achievementCount: a, buffMult: b })).toBeCloseTo(
        stardustMultiplier(s) * achievementMultiplier(a) * b,
      )
    }
  })
})

describe('stardustUpgradeCost', () => {
  it('비용 = baseCost × 2^level (정수)', () => {
    const apprentices = DEF('starting-apprentices') // baseCost 1
    expect(stardustUpgradeCost(apprentices, 0)).toBe(1)
    expect(stardustUpgradeCost(apprentices, 1)).toBe(2)
    expect(stardustUpgradeCost(apprentices, 3)).toBe(8)
    const resonance = DEF('click-resonance') // baseCost 2
    expect(stardustUpgradeCost(resonance, 0)).toBe(2)
    expect(stardustUpgradeCost(resonance, 2)).toBe(8)
    const sands = DEF('sands-of-time') // baseCost 5
    expect(stardustUpgradeCost(sands, 0)).toBe(5)
    expect(stardustUpgradeCost(sands, 3)).toBe(40)
  })

  it('레벨이 음수/비유한이면 0레벨 취급', () => {
    const apprentices = DEF('starting-apprentices')
    expect(stardustUpgradeCost(apprentices, -1)).toBe(1)
    expect(stardustUpgradeCost(apprentices, NaN)).toBe(1)
  })
})

describe('stardustClickPercent', () => {
  it('공명 증폭 레벨 × 1%p 합산', () => {
    expect(stardustClickPercent({})).toBe(0)
    expect(stardustClickPercent({ 'click-resonance': 3 })).toBe(3)
  })
  it('clickPower의 extraPercent로 합류 — 업그레이드 퍼센트와 합산', () => {
    // base 1 + mps 1000 × (업글 1% + 상점 3%)/100 = 1 + 40 = 41
    const pct = stardustClickPercent({ 'click-resonance': 3 })
    expect(clickPower(1, 1000, [clickPercent(1)], pct)).toBeCloseTo(41)
  })
})

describe('startingApprentices', () => {
  it('견습 마법사단 레벨 × 5', () => {
    expect(startingApprentices({})).toBe(0)
    expect(startingApprentices({ 'starting-apprentices': 4 })).toBe(20)
  })
})

describe('effectiveOfflineEfficiency', () => {
  it('기본 50% + 꿈꾸는 솥 레벨 × 5%p', () => {
    expect(effectiveOfflineEfficiency({})).toBeCloseTo(OFFLINE_EFFICIENCY)
    expect(effectiveOfflineEfficiency({ 'dreaming-cauldron': 3 })).toBeCloseTo(0.65)
    // maxLevel 5 → 최대 75%.
    expect(effectiveOfflineEfficiency({ 'dreaming-cauldron': 5 })).toBeCloseTo(0.75)
  })
  it('maxLevel 초과 레벨(손상)은 클램프', () => {
    expect(effectiveOfflineEfficiency({ 'dreaming-cauldron': 99 })).toBeCloseTo(0.75)
  })
})

describe('effectiveOfflineCapMs', () => {
  it('기본 8h + 시간의 모래 레벨 × 1h', () => {
    expect(effectiveOfflineCapMs({})).toBe(OFFLINE_CAP_MS)
    expect(effectiveOfflineCapMs({ 'sands-of-time': 2 })).toBe(OFFLINE_CAP_MS + 2 * HOUR_MS)
    // maxLevel 4 → 최대 12h.
    expect(effectiveOfflineCapMs({ 'sands-of-time': 4 })).toBe(OFFLINE_CAP_MS + 4 * HOUR_MS)
  })
  it('maxLevel 초과 레벨(손상)은 클램프', () => {
    expect(effectiveOfflineCapMs({ 'sands-of-time': 99 })).toBe(OFFLINE_CAP_MS + 4 * HOUR_MS)
  })
})

describe('nextStardustAt', () => {
  it('다음 정수 n+1 도달 누적 마나 = (n+1)² × 임계', () => {
    // n=0 → 1²×1e9, n=1 → 2²×1e9, n=2 → 3²×1e9
    expect(nextStardustAt(0)).toBe(PRESTIGE_THRESHOLD)
    expect(nextStardustAt(1e9)).toBe(4 * PRESTIGE_THRESHOLD)
    expect(nextStardustAt(4e9)).toBe(9 * PRESTIGE_THRESHOLD)
    // 경계 사이(n 유지)에서도 다음 목표는 동일.
    expect(nextStardustAt(2e9)).toBe(4 * PRESTIGE_THRESHOLD) // n=1 → 4e9
  })
  it('비유한 입력은 n=0 취급 → 임계값', () => {
    expect(nextStardustAt(NaN)).toBe(PRESTIGE_THRESHOLD)
    expect(nextStardustAt(Infinity)).toBe(PRESTIGE_THRESHOLD)
  })
})

describe('prestigeGain', () => {
  it('첫 각성(totalPrestiges=0)은 첫 각성 보너스 포함', () => {
    expect(prestigeGain(1e9, 0)).toBe(1 + FIRST_PRESTIGE_BONUS) // 1 + 2 = 3
    expect(prestigeGain(4e9, 0)).toBe(2 + FIRST_PRESTIGE_BONUS) // 2 + 2 = 4
  })
  it('두 번째 각성 이후는 보너스 없음', () => {
    expect(prestigeGain(1e9, 1)).toBe(1)
    expect(prestigeGain(9e9, 3)).toBe(3)
  })
  it('임계 미만이면 0(보너스도 없음)', () => {
    expect(prestigeGain(5e8, 0)).toBe(0)
    expect(prestigeGain(0, 0)).toBe(0)
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

// --- 비용 곡선 property fuzz (D-5.5) ---
// 시드 고정 결정적 루프(라이브러리 금지). 비용 곡선은 세이브·구매의 진실이라, 경계값 스팟 테스트에 더해
// 넓은 파라미터 공간에서 라운드트립·단조성·분할 일관성을 확률적으로 훑는다.
//
// 핵심 명제: bulkCost의 단일 진실은 closed-form
//   raw(owned, count) = baseCost · r^owned · (r^count − 1)/(r − 1)   (r = COST_GROWTH)
// 이고 bulkCost는 이 raw를 한 번만 ceil한 값이다. 따라서 항별로 나눠 더한 합(bulk(o,k)+bulk(o+k,m))은
// closed-form 전체(bulk(o,k+m))와 ceil(및 부동소수 ulp) 차이만큼만 어긋난다 — 아래 (c)에서 그 차이를 명시적으로 허용한다.

// mulberry32: 32비트 시드 결정적 PRNG(외부 라이브러리 없이 재현 가능한 fuzz 시퀀스).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// closed-form raw 비용(단일 진실). bulkCost = ceil(rawBulk).
function rawBulk(baseCost: number, owned: number, count: number): number {
  if (count <= 0) return 0
  const r = COST_GROWTH
  return (baseCost * r ** owned * (r ** count - 1)) / (r - 1)
}

const BASE_COSTS = GENERATORS.map((g) => g.baseCost) // 6개 실제 baseCost

describe('비용 곡선 property fuzz (D-5.5)', () => {
  it('(a) maxAffordable 라운드트립: bulk(n) ≤ mana < bulk(n+1), n=0이면 bulk(1) > mana', () => {
    const rng = mulberry32(0xc0ffee)
    let checks = 0
    for (const baseCost of BASE_COSTS) {
      for (let iter = 0; iter < 200; iter += 1) {
        const owned = Math.floor(rng() * 301) // 0~300
        // mana 로그 스케일 샘플: exp(u · ln(1e18)) → [1, 1e18]. 유한 bulkCost·상한 이내 보장.
        const mana = Math.exp(rng() * Math.log(1e18))
        const n = maxAffordable(baseCost, owned, mana)
        expect(Number.isFinite(n)).toBe(true)
        expect(n).toBeGreaterThanOrEqual(0)
        if (n === 0) {
          // 1개도 못 산다 → 1개 가격이 mana보다 크다.
          expect(bulkCost(baseCost, owned, 1)).toBeGreaterThan(mana)
        } else {
          // n개는 사도 되고(≤ mana), n+1개는 못 산다(> mana).
          expect(bulkCost(baseCost, owned, n)).toBeLessThanOrEqual(mana)
          expect(bulkCost(baseCost, owned, n + 1)).toBeGreaterThan(mana)
        }
        checks += 1
      }
    }
    expect(checks).toBe(BASE_COSTS.length * 200)
  })

  it('(b) bulkCost 단조성: count·owned에 대해 비감소', () => {
    const rng = mulberry32(0x1234abcd)
    for (const baseCost of BASE_COSTS) {
      for (let iter = 0; iter < 150; iter += 1) {
        const owned = Math.floor(rng() * 201) // 0~200
        const count = 1 + Math.floor(rng() * 100) // 1~100
        // count 단조: n → n+1 은 비감소(양수 항을 더함).
        expect(bulkCost(baseCost, owned, count + 1)).toBeGreaterThanOrEqual(
          bulkCost(baseCost, owned, count),
        )
        // owned 단조: 같은 count라도 보유수가 많을수록 비감소(더 비싼 항들).
        expect(bulkCost(baseCost, owned + 1, count)).toBeGreaterThanOrEqual(
          bulkCost(baseCost, owned, count),
        )
      }
    }
  })

  it('(c) 분할 일관성: bulk(o,k) + bulk(o+k,m) ≈ bulk(o,k+m)', () => {
    const rng = mulberry32(0x9e3779b9)
    for (const baseCost of BASE_COSTS) {
      for (let iter = 0; iter < 150; iter += 1) {
        const o = Math.floor(rng() * 151) // 0~150
        const k = 1 + Math.floor(rng() * 60) // 1~60
        const m = 1 + Math.floor(rng() * 60) // 1~60

        // closed-form(단일 진실)은 분할 항등식이 부동소수 ulp까지 성립 — 상대오차 1e-9 이내.
        const rawSplit = rawBulk(baseCost, o, k) + rawBulk(baseCost, o + k, m)
        const rawWhole = rawBulk(baseCost, o, k + m)
        expect(Math.abs(rawSplit - rawWhole) / rawWhole).toBeLessThan(1e-9)

        // 실제 bulkCost(정수)는 항별 ceil 2회 vs 전체 ceil 1회 차이만큼만 어긋난다. closed-form이 단일 진실이고
        // 항별 합은 ulp 차이를 허용하므로, 허용 오차는 상대(1e-9)로 잡되 작은 값에서의 정수 ceil 여유(≤2)를 더한다:
        //   큰 값 → 부동소수 ulp가 커져 상대오차 1e-9가 지배, 작은 값 → 항별 ceil 2회로 최대 2까지 어긋난다.
        // 큰 값에선 r^(o+k) ≠ r^o·r^k(부동소수)라 항별 합이 전체보다 근소히 크거나 작을 수 있어 양방향 허용한다.
        const split = bulkCost(baseCost, o, k) + bulkCost(baseCost, o + k, m)
        const whole = bulkCost(baseCost, o, k + m)
        const tolerance = Math.max(2 + 1e-6, whole * 1e-9)
        expect(Math.abs(split - whole)).toBeLessThanOrEqual(tolerance)
      }
    }
  })
})
