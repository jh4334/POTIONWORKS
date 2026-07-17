import { create } from 'zustand'
import { INITIAL_CLICK_POWER } from '../data/config.ts'
import { GENERATORS } from '../data/generators.ts'
import { UPGRADES, resolveUpgrades } from '../data/upgrades.ts'
import { bulkCost, totalMps, clickPower as computeClickPower, isUpgradeUnlocked } from '../engine/formulas.ts'
import { clearSave, type SaveData } from '../engine/save.ts'

// 규칙(CLAUDE.md): 상태 변형은 이 스토어의 액션에서만, 컴포넌트는 selector로 부분 구독.
// 각성 액션은 이후 태스크(T5.1)에서 추가된다.

// 구매 수량 토글 — 모든 시설 행이 공유하므로 UI 상태지만 스토어에 둔다.
export type BuyAmount = 1 | 10 | 'max'

// 오프라인 수익 팝업용 UI 상태(T4.3). 세이브에는 포함하지 않는다 — 로드 시 계산되는 표시값.
export interface OfflineGain {
  amount: number // 지급된 마나
  elapsedMs: number // 실제 자리 비운 시간(캡 적용 전, 표시용)
}

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
  // 오프라인 수익 팝업(세이브 비포함 UI 상태). null이면 팝업 없음.
  offlineGain: OfflineGain | null
  // 솥 클릭: 마나를 clickPower만큼 증가.
  click: () => void
  // 시설 구매: 비용 확인 후 마나 차감 + 보유 증가 + 파생값 재계산.
  buyGenerator: (id: string, count: number) => void
  // 업그레이드 구매: 해금·비용 확인 후 마나 차감 + id 추가 + 파생값 재계산.
  buyUpgrade: (id: string) => void
  // tick: lastTick 대비 경과시간만큼 마나 적립. now는 Date.now().
  tick: (now: number) => void
  setBuyAmount: (amount: BuyAmount) => void
  // 세이브 복원: 진실 필드 복원 + 파생값 재계산. lastTick은 now로 당겨
  //   (이후 tick catch-up이 오래된 세이브를 과지급하지 않게 한다 — 오프라인 수익은 별도 액션).
  loadSave: (save: SaveData) => void
  // 하드리셋: 초기 상태로 되돌리고 localStorage 세이브 삭제(설정 UI는 M8, 지금은 액션+치트용).
  hardReset: () => void
  // 오프라인 수익 지급: 마나 적립 + lastTick=now(이중 지급 금지) + 팝업 상태 세팅.
  applyOfflineEarnings: (amount: number, now: number, elapsedMs: number) => void
  // 오프라인 팝업 닫기.
  dismissOffline: () => void
}

function initialGenerators(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const g of GENERATORS) counts[g.id] = 0
  return counts
}

// 세이브의 generators를 라이브 상태로 정규화: 모든 티어 id가 존재하도록 초기값 위에 덮어쓴다.
// (미지의 id는 이미 save.migrate에서 걸러졌고, 신규 티어는 0으로 채워진다.)
function mergeGenerators(saved: Record<string, number>): Record<string, number> {
  const counts = initialGenerators()
  for (const g of GENERATORS) {
    const v = saved[g.id]
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) counts[g.id] = v
  }
  return counts
}

// 초기 상태(데이터 필드만). create()와 hardReset()이 공유한다.
function createInitialState() {
  return {
    mana: 0,
    manaPerSecond: 0,
    basePower: INITIAL_CLICK_POWER,
    clickPower: INITIAL_CLICK_POWER,
    generators: initialGenerators(),
    upgrades: [] as string[],
    lastTick: Date.now(),
    buyAmount: 1 as BuyAmount,
    offlineGain: null as OfflineGain | null,
  }
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
  ...createInitialState(),

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

  loadSave: (save) =>
    set(() => {
      const st = save.state
      const generators = mergeGenerators(st.generators)
      const upgrades = resolveUpgrades(st.upgrades).map((u) => u.id) // 알 수 없는 id 제거
      return {
        mana: st.mana,
        basePower: st.basePower,
        generators,
        upgrades,
        // lastTick은 세이브 값이 아니라 now로 — 로드 직후 tick이 과거 경과를 100% 과지급하지 않게 한다.
        // (오프라인 수익은 applyOfflineEarnings가 savedAt 기준으로 별도 지급.)
        lastTick: Date.now(),
        buyAmount: st.buyAmount,
        ...recalcDerived(generators, upgrades, st.basePower),
      }
    }),

  hardReset: () => {
    clearSave()
    set(() => createInitialState())
  },

  applyOfflineEarnings: (amount, now, elapsedMs) =>
    set((s) => ({
      mana: s.mana + amount,
      lastTick: now, // 이중 지급 금지: 오프라인으로 인정한 구간을 tick이 또 세지 않게 한다.
      offlineGain: { amount, elapsedMs },
    })),

  dismissOffline: () => set({ offlineGain: null }),
}))
