import { describe, it, expect } from 'vitest'
import { GENERATORS } from './generators.ts'
import { UPGRADES } from './upgrades.ts'
import { ACHIEVEMENTS } from './achievements.ts'
import { STARDUST_UPGRADES } from './stardustShop.ts'

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
})

describe('스타더스트 상점 무결성', () => {
  // 현재 StardustEffect는 시설 id를 데이터로 참조하지 않는다(효과가 코드로 대상 시설을 결정).
  // 따라서 상점은 id 중복만 검증한다 — 시설 참조 필드가 생기면 위 패턴대로 확장한다.
  it('상점 id에 중복이 없다', () => {
    expect(duplicates(STARDUST_UPGRADES.map((u) => u.id))).toEqual([])
  })
})
