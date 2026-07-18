import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  serialize,
  deserialize,
  migrate,
  toSaveData,
  exportSave,
  importSave,
  loadFromLocalResult,
  saveToLocal,
  SAVE_VERSION,
  type SaveState,
} from './save.ts'
import { GENERATORS } from '../data/generators.ts'
import { UPGRADES } from '../data/upgrades.ts'
import { ACHIEVEMENTS } from '../data/achievements.ts'
import { STARDUST_UPGRADES } from '../data/stardustShop.ts'
import { POTIONS } from '../data/potions.ts'
import { CHALLENGES } from '../data/challenges.ts'
import { useGameStore } from '../store/gameStore.ts'
import {
  SAVE_KEY,
  SAVE_CORRUPT_KEY,
  GENERATOR_MAX,
  INITIAL_CLICK_POWER,
} from '../data/config.ts'

const KNOWN_GEN = GENERATORS[0].id // 'apprentice'
const KNOWN_UP = UPGRADES[0].id // 'apprentice-x2-10'
const KNOWN_ACH = ACHIEVEMENTS[0].id // 'clicks-100'
const KNOWN_STARDUST = STARDUST_UPGRADES[0].id // 'starting-apprentices'
const KNOWN_POTION = POTIONS[0].id // 'vitality'
const KNOWN_CHALLENGE = CHALLENGES[0].id // 'silent-hands'

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
    playtimeMs: 123_456,
    stardustUpgrades: { [KNOWN_STARDUST]: 3 },
    deviceId: 'device-fixture-abc',
    saveCount: 17,
    meteorsClicked: 9,
    prestigeCancels: 2,
    mutedPlaytimeMs: 654_321,
    dragonVisits: 4,
    brewing: { potionId: KNOWN_POTION, readyAt: 1_800_000 },
    readyPotion: null,
    potionsBrewed: 6,
    activeChallenge: { id: KNOWN_CHALLENGE, startedAt: 1_650_000 },
    completedChallenges: [CHALLENGES[1].id],
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
  })

  it('빈 state는 거부하지 않고 안전 기본값으로 정규화(D-1.1: 필드 손상으로 세이브를 파괴하지 않음)', () => {
    // 이전엔 필수 수치가 없으면 null이었으나, 이제 수치는 거부 대신 정규화한다.
    const out = migrate({ version: 1, savedAt: 1, state: {} })
    expect(out).not.toBeNull()
    expect(out!.state.mana).toBe(0)
    expect(out!.state.basePower).toBe(INITIAL_CLICK_POWER)
    expect(out!.state.lastTick).toBe(1) // savedAt로 폴백
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

  it('v3→v4: playtimeMs 필드가 없으면 0으로 초기화', () => {
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
        lifetimeMana: 777,
        stardust: 2,
        totalPrestiges: 1,
        achievements: [],
        totalClicks: 10,
        totalLifetimeMana: 777,
        muted: false,
      },
    }
    const out = migrate(v3)
    expect(out).not.toBeNull()
    expect(out!.version).toBe(SAVE_VERSION) // 4로 승격
    expect(out!.state.playtimeMs).toBe(0)
  })

  it('v4→v5: stardustUpgrades 필드가 없으면 빈 객체로 초기화', () => {
    const v4 = {
      version: 4,
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
        achievements: [],
        totalClicks: 10,
        totalLifetimeMana: 777,
        muted: false,
        playtimeMs: 123,
      },
    }
    const out = migrate(v4)
    expect(out).not.toBeNull()
    expect(out!.version).toBe(SAVE_VERSION) // 6으로 승격
    expect(out!.state.stardustUpgrades).toEqual({})
  })

  it('v5→v6: deviceId는 현재 기기값(문자열), saveCount=0으로 초기화', () => {
    const v5 = {
      version: 5,
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
        achievements: [],
        totalClicks: 10,
        totalLifetimeMana: 777,
        muted: false,
        playtimeMs: 123,
        stardustUpgrades: {},
      },
    }
    const out = migrate(v5)
    expect(out).not.toBeNull()
    expect(out!.version).toBe(SAVE_VERSION) // 6으로 승격
    expect(typeof out!.state.deviceId).toBe('string')
    expect(out!.state.deviceId.length).toBeGreaterThan(0)
    expect(out!.state.saveCount).toBe(0)
  })

  it('v6 세이브는 deviceId를 보존하고 saveCount를 채택(손상 saveCount는 0)', () => {
    const out = migrate({
      version: 6,
      savedAt: FIXED_NOW,
      state: { ...validState(), deviceId: 'other-device-xyz', saveCount: 42 },
    })
    expect(out!.state.deviceId).toBe('other-device-xyz') // 다른 기기 저장 — 마이그레이션이 덮어쓰지 않는다
    expect(out!.state.saveCount).toBe(42)
    const bad = migrate({
      version: 6,
      savedAt: 1,
      state: { ...validState(), deviceId: '', saveCount: -3 },
    })
    expect(typeof bad!.state.deviceId).toBe('string')
    expect(bad!.state.deviceId.length).toBeGreaterThan(0) // 빈 deviceId → 현재 기기값
    expect(bad!.state.saveCount).toBe(0) // 음수 → 0
  })

  it('v6→v7: 통계 카운터가 없으면 모두 0으로 초기화', () => {
    const v6 = {
      version: 6,
      savedAt: FIXED_NOW,
      state: { ...validState(), deviceId: 'dev-x', saveCount: 3 },
    }
    const out = migrate(v6)
    expect(out).not.toBeNull()
    expect(out!.version).toBe(SAVE_VERSION) // 7로 승격
    expect(out!.state.meteorsClicked).toBe(0)
    expect(out!.state.prestigeCancels).toBe(0)
    expect(out!.state.mutedPlaytimeMs).toBe(0)
    expect(out!.state.dragonVisits).toBe(0)
  })

  it('v7 세이브는 통계 카운터를 채택(손상·음수·NaN은 0, 정수 카운터는 내림)', () => {
    const ok = migrate({
      version: 7,
      savedAt: FIXED_NOW,
      state: {
        ...validState(),
        deviceId: 'dev-x',
        saveCount: 3,
        meteorsClicked: 12.9,
        prestigeCancels: 5,
        mutedPlaytimeMs: 777_777,
        dragonVisits: 3,
      },
    })
    expect(ok!.state.meteorsClicked).toBe(12) // 내림
    expect(ok!.state.prestigeCancels).toBe(5)
    expect(ok!.state.mutedPlaytimeMs).toBe(777_777)
    expect(ok!.state.dragonVisits).toBe(3)
    const bad = migrate({
      version: 7,
      savedAt: 1,
      state: {
        ...validState(),
        deviceId: 'dev-x',
        saveCount: 3,
        meteorsClicked: -1,
        prestigeCancels: NaN,
        mutedPlaytimeMs: -5,
        dragonVisits: 'x',
      },
    })
    expect(bad!.state.meteorsClicked).toBe(0)
    expect(bad!.state.prestigeCancels).toBe(0)
    expect(bad!.state.mutedPlaytimeMs).toBe(0)
    expect(bad!.state.dragonVisits).toBe(0)
  })

  it('v7→v8: 포션 조제 상태가 없으면 brewing=null, readyPotion=null, potionsBrewed=0', () => {
    const v7 = {
      version: 7,
      savedAt: FIXED_NOW,
      state: {
        ...validState(),
        deviceId: 'dev-x',
        saveCount: 3,
        meteorsClicked: 1,
        prestigeCancels: 0,
        mutedPlaytimeMs: 0,
        dragonVisits: 0,
      },
    }
    const out = migrate(v7)
    expect(out).not.toBeNull()
    expect(out!.version).toBe(SAVE_VERSION) // 8로 승격
    expect(out!.state.brewing).toBeNull()
    expect(out!.state.readyPotion).toBeNull()
    expect(out!.state.potionsBrewed).toBe(0)
  })

  it('v8 세이브는 포션 조제 상태를 채택(미지 포션 id·손상 readyAt은 null로 떨군다)', () => {
    const ok = migrate({
      version: 8,
      savedAt: FIXED_NOW,
      state: {
        ...validState(),
        deviceId: 'dev-x',
        saveCount: 3,
        brewing: { potionId: KNOWN_POTION, readyAt: 1_700_000_500_000 },
        readyPotion: KNOWN_POTION,
        potionsBrewed: 11.7,
      },
    })
    expect(ok!.state.brewing).toEqual({ potionId: KNOWN_POTION, readyAt: 1_700_000_500_000 })
    expect(ok!.state.readyPotion).toBe(KNOWN_POTION)
    expect(ok!.state.potionsBrewed).toBe(11) // 내림
    const bad = migrate({
      version: 8,
      savedAt: 1,
      state: {
        ...validState(),
        deviceId: 'dev-x',
        saveCount: 3,
        brewing: { potionId: 'no-such-potion', readyAt: 5 }, // 미지 포션 → null
        readyPotion: 'no-such-potion', // 미지 포션 → null
        potionsBrewed: -3,
      },
    })
    expect(bad!.state.brewing).toBeNull()
    expect(bad!.state.readyPotion).toBeNull()
    expect(bad!.state.potionsBrewed).toBe(0)
    // brewing.readyAt이 비유한이면 전체 brewing을 null로(오염 방지).
    const nanReady = migrate({
      version: 8,
      savedAt: 1,
      state: { ...validState(), deviceId: 'dev-x', saveCount: 3, brewing: { potionId: KNOWN_POTION, readyAt: NaN } },
    })
    expect(nanReady!.state.brewing).toBeNull()
  })

  it('v8→v9: 챌린지 상태가 없으면 activeChallenge=null, completedChallenges=[]', () => {
    const v8 = {
      version: 8,
      savedAt: FIXED_NOW,
      state: {
        ...validState(),
        deviceId: 'dev-x',
        saveCount: 3,
        brewing: null,
        readyPotion: null,
        potionsBrewed: 0,
      },
    }
    const out = migrate(v8)
    expect(out).not.toBeNull()
    expect(out!.version).toBe(SAVE_VERSION) // 9로 승격
    expect(out!.state.activeChallenge).toBeNull()
    expect(out!.state.completedChallenges).toEqual([])
  })

  it('v9 세이브는 챌린지 상태를 채택(미지 id·손상 startedAt은 떨군다)', () => {
    const ok = migrate({
      version: 9,
      savedAt: FIXED_NOW,
      state: {
        ...validState(),
        deviceId: 'dev-x',
        saveCount: 3,
        activeChallenge: { id: KNOWN_CHALLENGE, startedAt: 1_650_000 },
        completedChallenges: [CHALLENGES[1].id, 'no-such-challenge'],
      },
    })
    expect(ok!.state.activeChallenge).toEqual({ id: KNOWN_CHALLENGE, startedAt: 1_650_000 })
    expect(ok!.state.completedChallenges).toEqual([CHALLENGES[1].id]) // 미지 id 제거
    const bad = migrate({
      version: 9,
      savedAt: 1,
      state: {
        ...validState(),
        deviceId: 'dev-x',
        saveCount: 3,
        activeChallenge: { id: 'no-such-challenge', startedAt: 5 }, // 미지 id → null
        completedChallenges: 'nope',
      },
    })
    expect(bad!.state.activeChallenge).toBeNull()
    expect(bad!.state.completedChallenges).toEqual([])
    // startedAt이 비유한이면 activeChallenge를 null로(오염 방지).
    const nanStart = migrate({
      version: 9,
      savedAt: 1,
      state: {
        ...validState(),
        deviceId: 'dev-x',
        saveCount: 3,
        activeChallenge: { id: KNOWN_CHALLENGE, startedAt: NaN },
      },
    })
    expect(nanStart!.state.activeChallenge).toBeNull()
  })

  it('v5 세이브는 stardustUpgrades를 채택(미지 id 제거·손상값 제거·maxLevel 클램프)', () => {
    // dreaming-cauldron maxLevel 5 → 99는 5로 클램프. starting-apprentices는 소수 내림.
    const out = migrate({
      version: 5,
      savedAt: FIXED_NOW,
      state: {
        ...validState(),
        stardustUpgrades: {
          [KNOWN_STARDUST]: 3.9,
          'dreaming-cauldron': 99,
          'no-such-upgrade': 5,
          'click-resonance': 0, // 레벨 0/음수는 버린다
        },
      },
    })
    expect(out!.state.stardustUpgrades[KNOWN_STARDUST]).toBe(3) // 소수 내림
    expect(out!.state.stardustUpgrades['dreaming-cauldron']).toBe(5) // maxLevel 클램프
    expect(out!.state.stardustUpgrades['no-such-upgrade']).toBeUndefined() // 미지 제거
    expect(out!.state.stardustUpgrades['click-resonance']).toBeUndefined() // 레벨 0 제거
  })

  it('v4 세이브는 playtimeMs를 그대로 채택(손상·음수·NaN은 0)', () => {
    const ok = migrate({
      version: 4,
      savedAt: FIXED_NOW,
      state: { ...validState(), playtimeMs: 99_999 },
    })
    expect(ok!.state.playtimeMs).toBe(99_999)
    const bad = migrate({
      version: 4,
      savedAt: 1,
      state: { ...validState(), playtimeMs: -5 },
    })
    expect(bad!.state.playtimeMs).toBe(0)
    const nan = migrate({
      version: 4,
      savedAt: 1,
      state: { ...validState(), playtimeMs: NaN },
    })
    expect(nan!.state.playtimeMs).toBe(0)
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

describe('migrate 검증 강화(D-1.1)', () => {
  it('음수/NaN mana는 0으로, 음수/NaN basePower는 INITIAL_CLICK_POWER로 정규화(거부하지 않음)', () => {
    const out = migrate({
      version: 3,
      savedAt: FIXED_NOW,
      state: { ...validState(), mana: -100, basePower: -5 },
    })
    expect(out).not.toBeNull() // 필드 손상으로 세이브 전체를 버리지 않는다
    expect(out!.state.mana).toBe(0)
    expect(out!.state.basePower).toBe(INITIAL_CLICK_POWER)
  })

  it('mana가 NaN이면 0, lifetimeMana fallback도 0(v1)', () => {
    const out = migrate({
      version: 1,
      savedAt: FIXED_NOW,
      state: { mana: NaN, basePower: 1, lastTick: 5, buyAmount: 1, generators: {}, upgrades: [] },
    })
    expect(out!.state.mana).toBe(0)
    expect(out!.state.lifetimeMana).toBe(0)
  })

  it('generators: 소수는 내림, 1e308은 상한(GENERATOR_MAX) 클램프, Infinity는 제외', () => {
    const out = migrate({
      version: 3,
      savedAt: FIXED_NOW,
      state: {
        ...validState(),
        generators: { [KNOWN_GEN]: 5.7, [GENERATORS[1].id]: 1e308, [GENERATORS[2].id]: Infinity },
      },
    })
    expect(out!.state.generators[KNOWN_GEN]).toBe(5) // 소수 내림
    expect(out!.state.generators[GENERATORS[1].id]).toBe(GENERATOR_MAX) // 상한 클램프
    expect(out!.state.generators[GENERATORS[2].id]).toBeUndefined() // Infinity 제외
  })

  it('stardust/totalPrestiges/totalClicks는 정수화(내림)', () => {
    const out = migrate({
      version: 3,
      savedAt: FIXED_NOW,
      state: {
        ...validState(),
        lifetimeMana: 10,
        stardust: 4.9,
        totalPrestiges: 2.9,
        totalClicks: 7.9,
        totalLifetimeMana: 10,
        muted: false,
      },
    })
    expect(out!.state.stardust).toBe(4)
    expect(out!.state.totalPrestiges).toBe(2)
    expect(out!.state.totalClicks).toBe(7)
  })
})

// 인메모리 localStorage 스텁(node 환경엔 localStorage가 없다).
function installLocalStorage(): void {
  const map = new Map<string, string>()
  const stub = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true, writable: true })
}

describe('loadFromLocalResult 손상 보존(D-1.1)', () => {
  beforeEach(() => installLocalStorage())
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage
  })

  it('세이브 없으면 empty', () => {
    expect(loadFromLocalResult()).toEqual({ status: 'empty' })
  })

  it('정상 세이브면 ok + save', () => {
    localStorage.setItem(SAVE_KEY, serialize(makeState(), FIXED_NOW))
    const res = loadFromLocalResult()
    expect(res.status).toBe('ok')
  })

  it('손상 세이브면 corrupt + 원본을 corrupt 키에 보존(초기화되지 않음)', () => {
    const rawCorrupt = '{broken json not valid'
    localStorage.setItem(SAVE_KEY, rawCorrupt)
    const res = loadFromLocalResult()
    expect(res.status).toBe('corrupt')
    // 원본은 파괴되지 않고 손상 백업 키에 보존된다.
    expect(localStorage.getItem(SAVE_CORRUPT_KEY)).toBe(rawCorrupt)
    // 원본 키도 여전히 그대로(덮어쓰지 않음).
    expect(localStorage.getItem(SAVE_KEY)).toBe(rawCorrupt)
  })
})

describe('saveToLocal 유한성 가드(D-1.1)', () => {
  beforeEach(() => installLocalStorage())
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage
  })

  it('비유한 수치가 있으면 저장을 스킵(마지막 정상 세이브 보호)', () => {
    // 먼저 정상 세이브를 남긴다.
    saveToLocal(makeState(), FIXED_NOW)
    const good = localStorage.getItem(SAVE_KEY)
    expect(good).not.toBeNull()

    // Infinity가 섞인 상태로 저장 시도 → 스킵되어 이전 정상 세이브가 유지된다.
    const broken: SaveState = { ...makeState(), mana: Infinity }
    saveToLocal(broken, FIXED_NOW + 1000)
    expect(localStorage.getItem(SAVE_KEY)).toBe(good)
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

describe('saveCount 단조 증가(D-5.3, 스토어 액션 경유)', () => {
  it('bumpSaveCount가 호출마다 +1하고, toSaveData가 현재 카운터를 직렬화한다', () => {
    const start = useGameStore.getState().saveCount
    useGameStore.getState().bumpSaveCount()
    useGameStore.getState().bumpSaveCount()
    useGameStore.getState().bumpSaveCount()
    const after = useGameStore.getState().saveCount
    expect(after).toBe(start + 3) // 단조 증가(연속 3회 → +3)
    // 직렬화 시 현재 saveCount가 세이브에 담긴다 — 다음 로드가 이어서 증가한다.
    const data = toSaveData(useGameStore.getState(), FIXED_NOW)
    expect(data.state.saveCount).toBe(after)
  })

  it('deviceId는 스토어 초기 상태에서 비어있지 않은 문자열', () => {
    const id = useGameStore.getState().deviceId
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })
})

// 검증 통과용 최소 유효 state.
function validState() {
  return { mana: 0, basePower: 1, lastTick: 0, buyAmount: 1, generators: {}, upgrades: [] }
}
