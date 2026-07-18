import { describe, it, expect } from 'vitest'
import { GENERATORS } from './generators.ts'
import { UPGRADES } from './upgrades.ts'
import { ACHIEVEMENTS } from './achievements.ts'
import { STARDUST_UPGRADES } from './stardustShop.ts'
import { GOLDEN_EVENTS, pickGoldenEvent, goldenEventByKind } from './events.ts'
import { POTIONS, potionById } from './potions.ts'

// 데이터 참조 무결성(D-5.1). GeneratorId 타입화가 컴파일 단계에서 오타를 막지만,
// 런타임 데이터(파생 생성·수동 정의)가 실제 GENERATORS와 일치하는지·id 중복이 없는지 테스트로 고정한다.
// (신규 시설/업그레이드/업적 추가 시 이 테스트가 참조 깨짐·id 충돌을 즉시 잡는다.)

const GENERATOR_IDS = new Set(GENERATORS.map((g) => g.id))

// 한 id 배열에 중복이 있으면 실패시키는 헬퍼(중복 id 목록을 함께 노출).
function duplicates(ids: string[]): string[] {
  const seen = new Set<string>()
  const dups = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) dups.add(id)
    seen.add(id)
  }
  return [...dups]
}

describe('GENERATORS 자체 무결성', () => {
  it('시설 id에 중복이 없다', () => {
    expect(duplicates(GENERATORS.map((g) => g.id))).toEqual([])
  })
})

describe('업그레이드 참조 무결성', () => {
  it('모든 UpgradeEffect·UnlockCondition의 시설 참조가 GENERATORS에 존재한다', () => {
    for (const u of UPGRADES) {
      const e = u.effect
      if (e.kind === 'generatorMult') expect(GENERATOR_IDS.has(e.generatorId)).toBe(true)
      if (e.kind === 'synergy') {
        expect(GENERATOR_IDS.has(e.sourceId)).toBe(true)
        expect(GENERATOR_IDS.has(e.targetId)).toBe(true)
      }
      if (u.unlock.kind === 'ownedCount') expect(GENERATOR_IDS.has(u.unlock.generatorId)).toBe(true)
    }
  })

  it('업그레이드 id에 중복이 없다', () => {
    expect(duplicates(UPGRADES.map((u) => u.id))).toEqual([])
  })
})

describe('업적 참조 무결성', () => {
  it('모든 generatorCount 조건의 시설 참조가 GENERATORS에 존재한다', () => {
    for (const a of ACHIEVEMENTS) {
      if (a.condition.kind === 'generatorCount') {
        expect(GENERATOR_IDS.has(a.condition.generatorId)).toBe(true)
      }
    }
  })

  it('업적 id에 중복이 없다', () => {
    expect(duplicates(ACHIEVEMENTS.map((a) => a.id))).toEqual([])
  })

  it('업적은 40개, 그중 숨겨진 업적은 4개(E-1.3)', () => {
    expect(ACHIEVEMENTS.length).toBe(40)
    expect(ACHIEVEMENTS.filter((a) => a.hidden === true).length).toBe(4)
  })
})

describe('골든 이벤트 데이터 무결성(E-1.4)', () => {
  it('이벤트 kind에 중복이 없고, 가중치는 모두 양수', () => {
    expect(duplicates(GOLDEN_EVENTS.map((e) => e.kind))).toEqual([])
    for (const e of GOLDEN_EVENTS) expect(e.weight).toBeGreaterThan(0)
  })

  it('goldenEventByKind가 각 종류를 찾는다', () => {
    for (const e of GOLDEN_EVENTS) expect(goldenEventByKind(e.kind).kind).toBe(e.kind)
  })

  it('pickGoldenEvent: roll 0은 첫 정의, roll≈1은 마지막 정의', () => {
    expect(pickGoldenEvent(0).kind).toBe(GOLDEN_EVENTS[0].kind)
    expect(pickGoldenEvent(0.999999).kind).toBe(GOLDEN_EVENTS[GOLDEN_EVENTS.length - 1].kind)
  })

  it('pickGoldenEvent: 가중치 경계에서 정확히 갈린다(생산 60/클릭 25/드래곤 15)', () => {
    const total = GOLDEN_EVENTS.reduce((s, e) => s + e.weight, 0)
    // production 구간(0 ~ 60/total) 직전/직후, click 구간 직후.
    expect(pickGoldenEvent((GOLDEN_EVENTS[0].weight - 1) / total).kind).toBe('production')
    expect(pickGoldenEvent((GOLDEN_EVENTS[0].weight + 1) / total).kind).toBe('click')
    const upToClick = GOLDEN_EVENTS[0].weight + GOLDEN_EVENTS[1].weight
    expect(pickGoldenEvent((upToClick + 1) / total).kind).toBe('dragon')
  })

  it('pickGoldenEvent: 비유한 roll도 유효한 정의를 돌려준다', () => {
    expect(pickGoldenEvent(NaN).kind).toBe(GOLDEN_EVENTS[0].kind)
    expect(pickGoldenEvent(2).kind).toBe(GOLDEN_EVENTS[GOLDEN_EVENTS.length - 1].kind)
    expect(pickGoldenEvent(-1).kind).toBe(GOLDEN_EVENTS[0].kind)
  })
})

describe('포션 데이터 무결성(E-1.2)', () => {
  it('포션 id에 중복이 없다', () => {
    expect(duplicates(POTIONS.map((p) => p.id))).toEqual([])
  })

  it('potionById가 각 포션을 찾고, 미지 id는 undefined', () => {
    for (const p of POTIONS) expect(potionById(p.id)?.id).toBe(p.id)
    expect(potionById('no-such-potion')).toBeUndefined()
  })

  it('비용·하한·조제 시간·해금 임계는 모두 양수', () => {
    for (const p of POTIONS) {
      expect(p.costMpsSeconds).toBeGreaterThan(0)
      expect(p.costFloor).toBeGreaterThan(0)
      expect(p.brewMs).toBeGreaterThan(0)
      expect(p.unlockTotalMana).toBeGreaterThan(0)
    }
  })

  it('해금 임계는 오름차순(온보딩 — 낮은 순 노출)', () => {
    for (let i = 1; i < POTIONS.length; i += 1) {
      expect(POTIONS[i].unlockTotalMana).toBeGreaterThan(POTIONS[i - 1].unlockTotalMana)
    }
  })

  it('효과 파라미터가 유효(버프는 배율>1·지속>0, 즉발은 초>0)', () => {
    for (const p of POTIONS) {
      const e = p.effect
      if (e.kind === 'instant-mps') {
        expect(e.seconds).toBeGreaterThan(0)
      } else {
        expect(e.mult).toBeGreaterThan(1)
        expect(e.durationMs).toBeGreaterThan(0)
      }
    }
  })
})

describe('스타더스트 상점 무결성', () => {
  // 현재 StardustEffect는 시설 id를 데이터로 참조하지 않는다(효과가 코드로 대상 시설을 결정).
  // 따라서 상점은 id 중복만 검증한다 — 시설 참조 필드가 생기면 위 패턴대로 확장한다.
  it('상점 id에 중복이 없다', () => {
    expect(duplicates(STARDUST_UPGRADES.map((u) => u.id))).toEqual([])
  })
})
