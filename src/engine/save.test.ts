import { describe, it, expect } from 'vitest'
import {
  serialize,
  deserialize,
  migrate,
  toSaveData,
  exportSave,
  importSave,
  SAVE_VERSION,
  type SaveState,
} from './save.ts'
import { GENERATORS } from '../data/generators.ts'
import { UPGRADES } from '../data/upgrades.ts'
import { ACHIEVEMENTS } from '../data/achievements.ts'

const KNOWN_GEN = GENERATORS[0].id // 'apprentice'
const KNOWN_UP = UPGRADES[0].id // 'apprentice-x2-10'
const KNOWN_ACH = ACHIEVEMENTS[0].id // 'clicks-100'

// 클린 픽스처(알려진 id만, 중복 없음) — 라운드트립이 정확히 일치하도록.
function makeState(): SaveState {
  const generators: Record<string, number> = {}
  for (const g of GENERATORS) generators[g.id] = 0
  generators[KNOWN_GEN] = 12
  return {
    mana: 1234.5,
    basePower: 3,
    generators,
    upgrades: [KNOWN_UP],
    lastTick: 999,
    buyAmount: 10,
    lifetimeMana: 5678.9,
    stardust: 4,
    totalPrestiges: 2,
    achievements: [KNOWN_ACH],
    totalClicks: 321,
    totalLifetimeMana: 98765.4,
    muted: true,
  }
}

const FIXED_NOW = 1_700_000_000_000

describe('serialize/deserialize 라운드트립', () => {
  it('serialize → deserialize가 동일한 SaveData', () => {
    const state = makeState()
    const back = deserialize(serialize(state, FIXED_NOW))
    expect(back).not.toBeNull()
    expect(back).toEqual(toSaveData(state, FIXED_NOW))
  })

  it('version 필드가 존재하고 SAVE_VERSION과 일치', () => {
    const back = deserialize(serialize(makeState(), FIXED_NOW))
    expect(back!.version).toBe(SAVE_VERSION)
  })

  it('savedAt과 lastTick은 저장 시점(now)으로 갱신된다', () => {
    const back = deserialize(serialize(makeState(), FIXED_NOW))
    expect(back!.savedAt).toBe(FIXED_NOW)
    expect(back!.state.lastTick).toBe(FIXED_NOW)
  })

  it('파생값(manaPerSecond/clickPower)은 저장하지 않는다', () => {
    const str = serialize(makeState(), FIXED_NOW)
    expect(str).not.toContain('manaPerSecond')
    expect(str).not.toContain('clickPower')
  })
})

describe('migrate', () => {
  it('깨진 입력에는 null을 반환', () => {
    expect(migrate(null)).toBeNull()
    expect(migrate(undefined)).toBeNull()
    expect(migrate(42)).toBeNull()
    expect(migrate('nope')).toBeNull()
    expect(migrate({})).toBeNull() // version 없음
    expect(migrate({ version: 1 })).toBeNull() // savedAt/state 없음
    expect(migrate({ version: 1, savedAt: 1 })).toBeNull() // state 없음
    expect(migrate({ version: 1, savedAt: 1, state: {} })).toBeNull() // 필수 수치 없음
  })

  it('알 수 없는 미래 버전은 null', () => {
    expect(migrate({ version: SAVE_VERSION + 1, savedAt: 1, state: validState() })).toBeNull()
  })

  it('알 수 없는 generator/upgrade id는 무시하고 로드', () => {
    const raw = {
      version: 1,
      savedAt: FIXED_NOW,
      state: {
        mana: 10,
        basePower: 1,
        lastTick: 5,
        buyAmount: 1,
        generators: { [KNOWN_GEN]: 7, ghostGenerator: 999 },
        upgrades: [KNOWN_UP, 'no-such-upgrade'],
      },
    }
    const out = migrate(raw)
    expect(out).not.toBeNull()
    expect(out!.state.generators).toEqual({ [KNOWN_GEN]: 7 }) // ghost 제거
    expect(out!.state.upgrades).toEqual([KNOWN_UP]) // 미지 업그레이드 제거
  })

  it('잘못된 buyAmount는 기본 1로 정규화', () => {
    const out = migrate({ version: 1, savedAt: 1, state: { ...validState(), buyAmount: 99 } })
    expect(out!.state.buyAmount).toBe(1)
  })

  it('v1→v2: 각성 필드가 없으면 lifetimeMana=mana, stardust=0, totalPrestiges=0', () => {
    // 각성 필드가 전혀 없는 v1 세이브.
    const v1 = {
      version: 1,
      savedAt: FIXED_NOW,
      state: { mana: 4200, basePower: 1, lastTick: 5, buyAmount: 1, generators: {}, upgrades: [] },
    }
    const out = migrate(v1)
    expect(out).not.toBeNull()
    expect(out!.version).toBe(SAVE_VERSION) // 2로 승격
    expect(out!.state.lifetimeMana).toBe(4200) // 보수적: 현재 마나까지는 벌었다고 간주
    expect(out!.state.stardust).toBe(0)
    expect(out!.state.totalPrestiges).toBe(0)
  })

  it('v2 세이브는 각성 필드를 그대로 채택', () => {
    const v2 = {
      version: 2,
      savedAt: FIXED_NOW,
      state: {
        mana: 100,
        basePower: 1,
        lastTick: 5,
        buyAmount: 1,
        generators: {},
        upgrades: [],
        lifetimeMana: 999_999,
        stardust: 7,
        totalPrestiges: 3,
      },
    }
    const out = migrate(v2)
    expect(out!.state.lifetimeMana).toBe(999_999)
    expect(out!.state.stardust).toBe(7)
    expect(out!.state.totalPrestiges).toBe(3)
  })

  it('v2에서 각성 필드가 손상되면 안전한 fallback(lifetimeMana=mana, 나머지 0)', () => {
    const out = migrate({
      version: 2,
      savedAt: 1,
      state: { ...validState(), mana: 50, lifetimeMana: -1, stardust: NaN, totalPrestiges: 'x' },
    })
    expect(out!.state.lifetimeMana).toBe(50)
    expect(out!.state.stardust).toBe(0)
    expect(out!.state.totalPrestiges).toBe(0)
  })

  it('v2→v3: 업적/통계·음소거 필드가 없으면 achievements=[], totalClicks=0, totalLifetimeMana=lifetimeMana, muted=false', () => {
    const v2 = {
      version: 2,
      savedAt: FIXED_NOW,
      state: {
        mana: 100,
        basePower: 1,
        lastTick: 5,
        buyAmount: 1,
        generators: {},
        upgrades: [],
        lifetimeMana: 777,
        stardust: 2,
        totalPrestiges: 1,
      },
    }
    const out = migrate(v2)
    expect(out).not.toBeNull()
    expect(out!.version).toBe(SAVE_VERSION) // 3으로 승격
    expect(out!.state.achievements).toEqual([])
    expect(out!.state.totalClicks).toBe(0)
    expect(out!.state.totalLifetimeMana).toBe(777) // 이번 생 누적을 총 누적 출발값으로
    expect(out!.state.muted).toBe(false)
  })

  it('v1→v3: totalLifetimeMana는 마이그레이션된 lifetimeMana(=mana)로', () => {
    const v1 = {
      version: 1,
      savedAt: FIXED_NOW,
      state: { mana: 4200, basePower: 1, lastTick: 5, buyAmount: 1, generators: {}, upgrades: [] },
    }
    const out = migrate(v1)
    expect(out!.state.totalLifetimeMana).toBe(4200)
    expect(out!.state.achievements).toEqual([])
    expect(out!.state.muted).toBe(false)
  })

  it('v3 세이브는 업적/통계·음소거 필드를 그대로 채택(미지 업적 id는 제거)', () => {
    const v3 = {
      version: 3,
      savedAt: FIXED_NOW,
      state: {
        mana: 100,
        basePower: 1,
        lastTick: 5,
        buyAmount: 1,
        generators: {},
        upgrades: [],
        lifetimeMana: 999,
        stardust: 0,
        totalPrestiges: 0,
        achievements: [KNOWN_ACH, 'no-such-achievement'],
        totalClicks: 42,
        totalLifetimeMana: 123456,
        muted: true,
      },
    }
    const out = migrate(v3)
    expect(out!.state.achievements).toEqual([KNOWN_ACH]) // 미지 업적 제거
    expect(out!.state.totalClicks).toBe(42)
    expect(out!.state.totalLifetimeMana).toBe(123456)
    expect(out!.state.muted).toBe(true)
  })

  it('v3에서 통계 필드가 손상되면 안전한 fallback(totalLifetimeMana=lifetimeMana, 나머지 0/false)', () => {
    const out = migrate({
      version: 3,
      savedAt: 1,
      state: {
        ...validState(),
        mana: 50,
        lifetimeMana: 300,
        achievements: 'nope',
        totalClicks: -5,
        totalLifetimeMana: NaN,
        muted: 'yes',
      },
    })
    expect(out!.state.achievements).toEqual([])
    expect(out!.state.totalClicks).toBe(0)
    expect(out!.state.totalLifetimeMana).toBe(300) // lifetimeMana fallback
    expect(out!.state.muted).toBe(false) // 'yes'는 boolean true가 아님
  })
})

describe('deserialize 방어', () => {
  it('JSON이 아니면 null', () => {
    expect(deserialize('{not json')).toBeNull()
  })
})

describe('exportSave/importSave 라운드트립 (T4.2)', () => {
  it('export → import가 동일한 SaveData', () => {
    const state = makeState()
    const back = importSave(exportSave(state, FIXED_NOW))
    expect(back).toEqual(toSaveData(state, FIXED_NOW))
  })

  it('유니코드도 안전(내용에 한글 id는 없지만 인코딩 경로 검증)', () => {
    const str = exportSave(makeState(), FIXED_NOW)
    // Base64는 ASCII만 — 디코드 후 다시 SaveData로 복원되어야 한다.
    expect(importSave(str)).not.toBeNull()
  })

  it('잘못된 문자열이면 null', () => {
    expect(importSave('###not-base64###')).toBeNull()
    expect(importSave('')).toBeNull()
  })
})

// 검증 통과용 최소 유효 state.
function validState() {
  return { mana: 0, basePower: 1, lastTick: 0, buyAmount: 1, generators: {}, upgrades: [] }
}
