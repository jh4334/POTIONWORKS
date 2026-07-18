import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from './gameStore.ts'
import { POTIONS } from '../data/potions.ts'
import { potionCost } from '../engine/formulas.ts'
import { PRESTIGE_THRESHOLD } from '../data/config.ts'

// E-1.2 포션 조제 스토어 액션 — 상태 변형은 액션에서만(CLAUDE.md). 각 테스트 전 초기화.
// (hardReset은 localStorage 부재 시 clearSave가 조용히 넘어가므로 node 환경에서도 안전하다.)

const vitality = POTIONS.find((p) => p.id === 'vitality')!
const timeWarp = POTIONS.find((p) => p.id === 'timeWarp')!
// 타입 안전: timeWarp 효과는 즉발형이므로 seconds를 읽는다.
const WARP_SECONDS = timeWarp.effect.kind === 'instant-mps' ? timeWarp.effect.seconds : 0

describe('포션 조제 스토어 액션 (E-1.2)', () => {
  beforeEach(() => useGameStore.getState().hardReset())

  it('startBrew: 해금·마나 충분하면 비용 차감 + brewing 세팅', () => {
    useGameStore.setState({ mana: 1_000_000, manaPerSecond: 100, totalLifetimeMana: 200_000 })
    const cost = potionCost(vitality, 100)
    const before = Date.now()
    useGameStore.getState().startBrew('vitality')
    const s = useGameStore.getState()
    expect(s.mana).toBe(1_000_000 - cost)
    expect(s.brewing?.potionId).toBe('vitality')
    expect(s.brewing!.readyAt).toBeGreaterThanOrEqual(before + vitality.brewMs)
  })

  it('startBrew: 미해금이면 무시', () => {
    useGameStore.setState({ mana: 1e12, manaPerSecond: 100, totalLifetimeMana: 0 })
    useGameStore.getState().startBrew('vitality')
    expect(useGameStore.getState().brewing).toBeNull()
    expect(useGameStore.getState().mana).toBe(1e12) // 차감 안 됨
  })

  it('startBrew: 마나 부족하면 무시', () => {
    useGameStore.setState({ mana: 10, manaPerSecond: 100, totalLifetimeMana: 200_000 })
    useGameStore.getState().startBrew('vitality')
    expect(useGameStore.getState().brewing).toBeNull()
  })

  it('startBrew: 이미 조제 중이거나 수확 대기 중이면 무시(단일 슬롯)', () => {
    useGameStore.setState({
      mana: 1e12,
      manaPerSecond: 100,
      totalLifetimeMana: 2e9,
      brewing: { potionId: 'vitality', readyAt: Date.now() + 100_000 },
    })
    useGameStore.getState().startBrew('timeWarp')
    expect(useGameStore.getState().brewing?.potionId).toBe('vitality') // 그대로

    useGameStore.setState({ brewing: null, readyPotion: 'vitality' })
    useGameStore.getState().startBrew('timeWarp')
    expect(useGameStore.getState().brewing).toBeNull() // 수확 대기 중엔 새 조제 불가
  })

  it('tick: readyAt을 지나면 brewing → readyPotion (오프라인 경과 포함)', () => {
    const now = Date.now()
    useGameStore.setState({
      manaPerSecond: 0,
      lastTick: now,
      brewing: { potionId: 'vitality', readyAt: now + 1_000 },
      readyPotion: null,
    })
    useGameStore.getState().tick(now + 2_000) // readyAt(+1s) 지남
    const s = useGameStore.getState()
    expect(s.brewing).toBeNull()
    expect(s.readyPotion).toBe('vitality')
  })

  it('tick: 아직 readyAt 전이면 brewing 유지', () => {
    const now = Date.now()
    useGameStore.setState({
      manaPerSecond: 0,
      lastTick: now,
      brewing: { potionId: 'vitality', readyAt: now + 10_000 },
      readyPotion: null,
    })
    useGameStore.getState().tick(now + 2_000)
    expect(useGameStore.getState().brewing?.potionId).toBe('vitality')
    expect(useGameStore.getState().readyPotion).toBeNull()
  })

  it('collectPotion: 생산 버프형은 activeBuffs에 potion-production로 push + potionsBrewed++', () => {
    useGameStore.setState({ readyPotion: 'vitality', activeBuffs: [], potionsBrewed: 0 })
    useGameStore.getState().collectPotion()
    const s = useGameStore.getState()
    expect(s.readyPotion).toBeNull()
    expect(s.potionsBrewed).toBe(1)
    expect(s.activeBuffs.some((b) => b.kind === 'potion-production')).toBe(true)
  })

  it('collectPotion: 즉발형(instant-mps)은 현재 MPS×seconds 즉시 지급(버프 아님)', () => {
    useGameStore.setState({
      readyPotion: 'timeWarp',
      mana: 0,
      manaPerSecond: 10,
      activeBuffs: [],
      potionsBrewed: 0,
    })
    useGameStore.getState().collectPotion()
    const s = useGameStore.getState()
    expect(s.readyPotion).toBeNull()
    expect(s.potionsBrewed).toBe(1)
    expect(s.mana).toBeCloseTo(10 * WARP_SECONDS)
    expect(s.activeBuffs.length).toBe(0) // 즉발형은 버프를 남기지 않는다
  })

  it('collectPotion: readyPotion이 없으면 아무 일도 없음', () => {
    useGameStore.setState({ readyPotion: null, potionsBrewed: 3 })
    useGameStore.getState().collectPotion()
    expect(useGameStore.getState().potionsBrewed).toBe(3)
  })

  it('포션 생산 버프는 골든 생산 버프와 공존한다(kind가 달라 둘 다 유지)', () => {
    const now = Date.now()
    useGameStore.setState({
      readyPotion: 'vitality',
      activeBuffs: [{ kind: 'production', mult: 7, startsAt: now, endsAt: now + 30_000 }],
    })
    useGameStore.getState().collectPotion()
    const buffs = useGameStore.getState().activeBuffs
    expect(buffs.some((b) => b.kind === 'production')).toBe(true)
    expect(buffs.some((b) => b.kind === 'potion-production')).toBe(true)
  })
})

// E-2.1 오프라인 자동화(공방 관리인). 상태 변형은 액션에서만. 각 테스트 전 초기화.
describe('오프라인 자동화 applyOfflineAutomation (E-2.1)', () => {
  beforeEach(() => useGameStore.getState().hardReset())

  it('레벨 0이면 무동작(마나·시설·업그레이드 불변)', () => {
    useGameStore.setState({ mana: 1e9, generators: { apprentice: 10 }, stardustUpgrades: {} })
    useGameStore.getState().applyOfflineAutomation()
    const s = useGameStore.getState()
    expect(s.mana).toBe(1e9)
    expect(s.upgrades).toEqual([])
  })

  it('Lv1: 시설 배율 업그레이드(generatorMult)만 자동 구매, 클릭 업그레이드는 건너뜀', () => {
    // herbGarden 1개(10 MPS) → click-mps-1(mps>=10) 해금. apprentice 10 → apprentice-x2-10·apprentice-zeal 해금.
    useGameStore.setState({
      mana: 1e9,
      generators: { apprentice: 10, herbGarden: 1 },
      stardustUpgrades: { 'workshop-manager': 1 },
    })
    useGameStore.getState().applyOfflineAutomation()
    const ups = useGameStore.getState().upgrades
    expect(ups).toContain('apprentice-x2-10') // generatorMult(마일스톤)
    expect(ups).toContain('apprentice-zeal') // generatorMult(초반 배율)
    expect(ups).not.toContain('click-mps-1') // clickMpsPercent — Lv1은 건너뜀
  })

  it('Lv2: 클릭·시너지 업그레이드도 자동 구매', () => {
    useGameStore.setState({
      mana: 1e9,
      generators: { apprentice: 10, herbGarden: 1 },
      stardustUpgrades: { 'workshop-manager': 2 },
    })
    useGameStore.getState().applyOfflineAutomation()
    const ups = useGameStore.getState().upgrades
    expect(ups).toContain('apprentice-x2-10')
    expect(ups).toContain('click-mps-1') // Lv2는 클릭 업그레이드도 산다
  })

  it('Lv3: 시설을 그리디로 자동 매수(마나 소진, 시설 증가)', () => {
    useGameStore.setState({
      mana: 1_000_000,
      generators: {},
      stardustUpgrades: { 'workshop-manager': 3 },
    })
    useGameStore.getState().applyOfflineAutomation()
    const s = useGameStore.getState()
    const totalGen = Object.values(s.generators).reduce((a, b) => a + b, 0)
    expect(totalGen).toBeGreaterThan(0) // 시설을 샀다
    expect(s.mana).toBeLessThan(1_000_000) // 마나가 줄었다
  })
})

// E-2.2 챌린지 런. 상태 변형은 액션에서만. 각 테스트 전 초기화.
describe('챌린지 런 (E-2.2)', () => {
  beforeEach(() => useGameStore.getState().hardReset())

  it('침묵의 손: 진행 중이면 클릭이 무효(마나·클릭수 불변)', () => {
    useGameStore.setState({
      mana: 0,
      clickPower: 5,
      totalClicks: 0,
      activeChallenge: { id: 'silent-hands', startedAt: Date.now() },
    })
    useGameStore.getState().click()
    const s = useGameStore.getState()
    expect(s.mana).toBe(0)
    expect(s.totalClicks).toBe(0)
  })

  it('금욕의 공방: 진행 중이면 업그레이드 구매가 무효', () => {
    useGameStore.setState({
      mana: 1e9,
      manaPerSecond: 100,
      generators: { apprentice: 10 },
      activeChallenge: { id: 'ascetic', startedAt: Date.now() },
    })
    useGameStore.getState().buyUpgrade('apprentice-x2-10')
    expect(useGameStore.getState().upgrades).toEqual([])
  })

  it('prestige: 제약 챌린지를 지키며 각성하면 완료 처리 + 활성 해제', () => {
    useGameStore.setState({
      lifetimeMana: PRESTIGE_THRESHOLD,
      totalPrestiges: 1, // 첫 각성 보너스 배제(순수 판정)
      activeChallenge: { id: 'silent-hands', startedAt: Date.now() },
      completedChallenges: [],
    })
    useGameStore.getState().prestige()
    const s = useGameStore.getState()
    expect(s.completedChallenges).toContain('silent-hands')
    expect(s.activeChallenge).toBeNull()
  })

  it('prestige(challengeId): 각성 리셋과 함께 새 챌린지를 시작', () => {
    useGameStore.setState({
      lifetimeMana: PRESTIGE_THRESHOLD,
      totalPrestiges: 1,
      activeChallenge: null,
      completedChallenges: [],
    })
    useGameStore.getState().prestige('ascetic')
    const s = useGameStore.getState()
    expect(s.activeChallenge?.id).toBe('ascetic')
    expect(s.lifetimeMana).toBe(0) // 각성 리셋됨
  })

  it('완료한 챌린지는 다시 시작할 수 없다(각성해도 활성 안 됨)', () => {
    useGameStore.setState({
      lifetimeMana: PRESTIGE_THRESHOLD,
      totalPrestiges: 1,
      completedChallenges: ['ascetic'],
    })
    useGameStore.getState().prestige('ascetic')
    expect(useGameStore.getState().activeChallenge).toBeNull()
  })

  it('abandonChallenge: 보상 없이 활성 해제(완료 목록 불변)', () => {
    useGameStore.setState({
      activeChallenge: { id: 'silent-hands', startedAt: Date.now() },
      completedChallenges: [],
    })
    useGameStore.getState().abandonChallenge()
    const s = useGameStore.getState()
    expect(s.activeChallenge).toBeNull()
    expect(s.completedChallenges).toEqual([])
  })

  it('시간의 시험: 제한 시간 안에 임계 도달하면 완료(도달 시점 판정)', () => {
    useGameStore.setState({
      lifetimeMana: 0,
      totalLifetimeMana: 0,
      activeChallenge: { id: 'time-trial', startedAt: Date.now() }, // 방금 시작 → 여유
      completedChallenges: [],
    })
    // debugAddMana로 임계(1e9)를 넘긴다 → withAchievements가 timed 챌린지를 판정한다.
    useGameStore.getState().debugAddMana(PRESTIGE_THRESHOLD)
    const s = useGameStore.getState()
    expect(s.completedChallenges).toContain('time-trial')
    expect(s.activeChallenge).toBeNull()
  })

  it('시간의 시험: 제한 시간을 넘겨 도달하면 실패(완료 안 됨, 활성 해제)', () => {
    useGameStore.setState({
      lifetimeMana: 0,
      totalLifetimeMana: 0,
      activeChallenge: { id: 'time-trial', startedAt: Date.now() - 3 * 60 * 60 * 1000 }, // 3시간 전(2h 초과)
      completedChallenges: [],
    })
    useGameStore.getState().debugAddMana(PRESTIGE_THRESHOLD)
    const s = useGameStore.getState()
    expect(s.completedChallenges).not.toContain('time-trial')
    expect(s.activeChallenge).toBeNull()
  })

  it('완료 챌린지 보상은 생산 배율(globalMult)에 반영된다', () => {
    // 업적·스타더스트 배율을 배제하고 챌린지 배율만 남겨 순수 검증한다(silent-hands 완료 → ×1.25).
    // buyStardustUpgrade는 recalcDerived만 돌리고 업적 검사는 하지 않아(스타더스트 소비는 업적과 무관)
    // 구매로 업적이 새로 달성돼 배율이 오염되는 일이 없다. 비용 1로 스타더스트가 0이 되어 배율 1(중립).
    useGameStore.setState({
      stardust: 1,
      achievements: [],
      stardustUpgrades: {},
      completedChallenges: ['silent-hands'],
    })
    useGameStore.getState().buyStardustUpgrade('starting-apprentices') // 비용 1 → stardust 0
    const s = useGameStore.getState()
    expect(s.stardust).toBe(0)
    expect(s.globalMult).toBeCloseTo(1.25)
  })
})
