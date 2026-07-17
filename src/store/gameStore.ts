import { create } from 'zustand'

// T0.1: 상태 골격만. 클릭/구매/각성 액션은 이후 태스크에서 추가된다.
// 규칙(CLAUDE.md): 상태 변형은 이 스토어의 액션에서만, 컴포넌트는 selector로 부분 구독.
export interface GameState {
  mana: number
  manaPerSecond: number
}

export const useGameStore = create<GameState>()(() => ({
  mana: 0,
  manaPerSecond: 0,
}))
