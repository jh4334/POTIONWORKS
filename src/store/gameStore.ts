import { create } from 'zustand'
import { INITIAL_CLICK_POWER } from '../data/config.ts'
import { GENERATORS } from '../data/generators.ts'
import { bulkCost, totalMps } from '../engine/formulas.ts'

// 규칙(CLAUDE.md): 상태 변형은 이 스토어의 액션에서만, 컴포넌트는 selector로 부분 구독.
// 각성 액션은 이후 태스크(T5.1)에서 추가된다.

// 구매 수량 토글 — 모든 시설 행이 공유하므로 UI 상태지만 스토어에 둔다.
export type BuyAmount = 1 | 10 | 'max'

export interface GameState {
  mana: number
  manaPerSecond: number
  clickPower: number
  generators: Record<string, number> // id → 보유수
  lastTick: number // epoch ms — 시간 계산의 진실
  buyAmount: BuyAmount
  // 솥 클릭: 마나를 clickPower만큼 증가.
  click: () => void
  // 시설 구매: 비용 확인 후 마나 차감 + 보유 증가 + MPS 재계산.
  buyGenerator: (id: string, count: number) => void
  // tick: lastTick 대비 경과시간만큼 마나 적립. now는 Date.now().
  tick: (now: number) => void
  setBuyAmount: (amount: BuyAmount) => void
}

function initialGenerators(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const g of GENERATORS) counts[g.id] = 0
  return counts
}

export const useGameStore = create<GameState>()((set) => ({
  mana: 0,
  manaPerSecond: 0,
  clickPower: INITIAL_CLICK_POWER,
  generators: initialGenerators(),
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
        manaPerSecond: totalMps(generators, GENERATORS),
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
