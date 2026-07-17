import { create } from 'zustand'
import { INITIAL_CLICK_POWER } from '../data/config.ts'
import { GENERATORS } from '../data/generators.ts'
import { UPGRADES, resolveUpgrades } from '../data/upgrades.ts'
import { bulkCost, totalMps, clickPower as computeClickPower, isUpgradeUnlocked } from '../engine/formulas.ts'

// 규칙(CLAUDE.md): 상태 변형은 이 스토어의 액션에서만, 컴포넌트는 selector로 부분 구독.
// 각성 액션은 이후 태스크(T5.1)에서 추가된다.

// 구매 수량 토글 — 모든 시설 행이 공유하므로 UI 상태지만 스토어에 둔다.
export type BuyAmount = 1 | 10 | 'max'

export interface GameState {
  mana: number
  manaPerSecond: number
  // clickPower는 basePower + 업그레이드 파생 캐시값. 표시·클릭에 이 값을 쓴다.
  // 진실은 basePower이며, generators/upgrades 변경 시 recalcDerived로 일괄 재계산한다.
  basePower: number
  clickPower: number
  generators: Record<string, number> // id → 보유수
  upgrades: string[] // 구매한 업그레이드 id 목록
  lastTick: number // epoch ms — 시간 계산의 진실
  buyAmount: BuyAmount
  // 솥 클릭: 마나를 clickPower만큼 증가.
  click: () => void
  // 시설 구매: 비용 확인 후 마나 차감 + 보유 증가 + 파생값 재계산.
  buyGenerator: (id: string, count: number) => void
  // 업그레이드 구매: 해금·비용 확인 후 마나 차감 + id 추가 + 파생값 재계산.
  buyUpgrade: (id: string) => void
  // tick: lastTick 대비 경과시간만큼 마나 적립. now는 Date.now().
  tick: (now: number) => void
  setBuyAmount: (amount: BuyAmount) => void
}

function initialGenerators(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const g of GENERATORS) counts[g.id] = 0
  return counts
}

// 파생값(MPS·clickPower) 일괄 재계산. buyGenerator/buyUpgrade 공통.
// clickPower는 MPS에 의존하므로 항상 함께 계산해 캐시를 일관되게 유지한다.
// (MPS·clickPower 모두 generators/upgrades 변경 시에만 바뀌고 tick에서는 불변.)
function recalcDerived(
  generators: Record<string, number>,
  upgradeIds: string[],
  basePower: number,
): { manaPerSecond: number; clickPower: number } {
  const ups = resolveUpgrades(upgradeIds)
  const manaPerSecond = totalMps(generators, GENERATORS, ups)
  return { manaPerSecond, clickPower: computeClickPower(basePower, manaPerSecond, ups) }
}

export const useGameStore = create<GameState>()((set) => ({
  mana: 0,
  manaPerSecond: 0,
  basePower: INITIAL_CLICK_POWER,
  clickPower: INITIAL_CLICK_POWER,
  generators: initialGenerators(),
  upgrades: [],
  lastTick: Date.now(),
  buyAmount: 1,

  click: () => set((s) => ({ mana: s.mana + s.clickPower })),

  buyGenerator: (id, count) =>
    set((s) => {
      if (count <= 0) return s
      const def = GENERATORS.find((g) => g.id === id)
      if (!def) return s
      const owned = s.generators[id] ?? 0
      const cost = bulkCost(def.baseCost, owned, count)
      if (s.mana < cost) return s
      const generators = { ...s.generators, [id]: owned + count }
      return {
        mana: s.mana - cost,
        generators,
        ...recalcDerived(generators, s.upgrades, s.basePower),
      }
    }),

  buyUpgrade: (id) =>
    set((s) => {
      if (s.upgrades.includes(id)) return s // 이미 구매됨
      const def = UPGRADES.find((u) => u.id === id)
      if (!def) return s
      // 해금 조건은 UI에서 숨기지만 액션에서도 방어적으로 검증한다.
      if (!isUpgradeUnlocked(def, s.generators, s.manaPerSecond)) return s
      if (s.mana < def.cost) return s
      const upgrades = [...s.upgrades, id]
      return {
        mana: s.mana - def.cost,
        upgrades,
        ...recalcDerived(s.generators, upgrades, s.basePower),
      }
    }),

  // 진실은 타임스탬프: 인터벌 주기가 아니라 경과시간(now − lastTick)만큼만 적립.
  // 백그라운드 스로틀·탭 복귀 catch-up이 이 한 줄로 자동 처리된다.
  tick: (now) =>
    set((s) => {
      const elapsedMs = now - s.lastTick
      if (elapsedMs <= 0) return s // 시계 역행·중복 호출 무시
      return {
        mana: s.mana + s.manaPerSecond * (elapsedMs / 1000),
        lastTick: now,
      }
    }),

  setBuyAmount: (amount) => set({ buyAmount: amount }),
}))
