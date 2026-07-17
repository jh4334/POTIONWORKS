import { create } from 'zustand'
import { INITIAL_CLICK_POWER } from '../data/config.ts'

// 규칙(CLAUDE.md): 상태 변형은 이 스토어의 액션에서만, 컴포넌트는 selector로 부분 구독.
// 구매/각성/tick 액션은 이후 태스크에서 추가된다.
export interface GameState {
  mana: number
  manaPerSecond: number
  clickPower: number
  // 솥 클릭: 마나를 clickPower만큼 증가.
  click: () => void
}

export const useGameStore = create<GameState>()((set) => ({
  mana: 0,
  manaPerSecond: 0,
  clickPower: INITIAL_CLICK_POWER,
  click: () => set((s) => ({ mana: s.mana + s.clickPower })),
}))
