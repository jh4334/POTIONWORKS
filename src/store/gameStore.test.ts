import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from './gameStore.ts'
import { POTIONS } from '../data/potions.ts'
import { potionCost } from '../engine/formulas.ts'

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
