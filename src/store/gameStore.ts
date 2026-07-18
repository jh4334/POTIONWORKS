import { create } from 'zustand'
import {
  INITIAL_CLICK_POWER,
  PRESTIGE_THRESHOLD,
  ACHIEVEMENT_CHECK_INTERVAL_MS,
  MAX_TICK_CATCHUP_MS,
  TICK_REANCHOR_TOLERANCE_MS,
} from '../data/config.ts'
import { offlineEarnings } from '../engine/offline.ts'
import { GENERATORS } from '../data/generators.ts'
import { UPGRADES, resolveUpgrades } from '../data/upgrades.ts'
import { ACHIEVEMENTS } from '../data/achievements.ts'
import {
  bulkCost,
  totalMps,
  clickPower as computeClickPower,
  isUpgradeUnlocked,
  isAchievementUnlocked,
  stardustFor,
  stardustMultiplier,
  achievementMultiplier,
} from '../engine/formulas.ts'
import { clearSave, type SaveData } from '../engine/save.ts'

// 규칙(CLAUDE.md): 상태 변형은 이 스토어의 액션에서만, 컴포넌트는 selector로 부분 구독.

// 구매 수량 토글 — 모든 시설 행이 공유하므로 UI 상태지만 스토어에 둔다.
export type BuyAmount = 1 | 10 | 'max'

// 오프라인 수익 팝업용 UI 상태(T4.3). 세이브에는 포함하지 않는다 — 로드 시 계산되는 표시값.
export interface OfflineGain {
  amount: number // 지급된 마나
  elapsedMs: number // 실제 자리 비운 시간(캡 적용 전, 표시용)
  cappedMs: number // 실제 정산에 인정된 시간(min(elapsedMs, 캡)). 캡 적용 여부 표기용(D-2.6).
}

// 업적 달성 토스트(T6.1). 세이브 비포함 UI 상태. id는 렌더 key + 개별 소멸용.
export interface AchievementToast {
  id: number
  name: string
}

export interface GameState {
  mana: number
  manaPerSecond: number
  // 전체 생산 배율(스타더스트 배율 × 업적 배율). manaPerSecond와 함께 recalcDerived에서 캐시한다.
  // 시설 행의 "개당 실효 X/s"·구매 델타 표시가 이 값을 곱해 쓴다(tick 불변 — 리렌더 규율 유지).
  globalMult: number
  // clickPower는 basePower + 업그레이드 파생 캐시값. 표시·클릭에 이 값을 쓴다.
  // 진실은 basePower이며, generators/upgrades 변경 시 recalcDerived로 일괄 재계산한다.
  basePower: number
  clickPower: number
  generators: Record<string, number> // id → 보유수
  upgrades: string[] // 구매한 업그레이드 id 목록
  lastTick: number // epoch ms — 시간 계산의 진실
  buyAmount: BuyAmount
  // 각성(T5.1) — 이번 생 누적 획득 마나. 클릭/tick/오프라인으로 증가만, 소비(구매)로는 안 줄어든다.
  // 각성 보상 stardustFor(lifetimeMana)의 입력이자 각성 가능 판정 기준. 각성 시 0으로 리셋.
  lifetimeMana: number
  // 각성으로 누적한 스타더스트(영구). 전체 MPS에 stardustMultiplier로 반영. 각성해도 유지.
  stardust: number
  // 총 각성 횟수(통계). 각성해도 유지.
  totalPrestiges: number
  // 업적(T6.1) — 달성한 업적 id 목록. 각성해도 유지(DESIGN §2.5: 유지=스타더스트/업적/통계).
  achievements: string[]
  // 총 클릭 수(통계). 각성해도 유지. 업적 조건.
  totalClicks: number
  // 전생 포함 총 누적 마나(통계). lifetimeMana처럼 증가하되 각성해도 리셋 안 됨. 업적 조건.
  totalLifetimeMana: number
  // 음소거(T6.2). 세이브에 포함(v3). 사운드 재생 여부는 이 값을 sound.setMuted로 반영해 판단한다.
  muted: boolean
  // 플레이 시간 누적(D-2.3, ms). 세이브에 포함(v4). tick에서 실제 경과를 그대로 누적(오프라인 캡 무관).
  playtimeMs: number
  // 마지막 저장 성공 시각(세이브 비포함 UI 상태, D-2.5). null이면 아직 저장된 적 없음.
  // 수동 저장·자동 저장·각성/복원 저장이 성공하면 갱신 → 헤더 "HH:MM:SS 저장됨" 표시.
  lastSavedAt: number | null
  // 저장 실패(세이브 비포함 UI 상태, D-2.5). true면 App이 1회성 경고 배너를 띄운다.
  saveFailed: boolean
  // 오프라인 수익 팝업(세이브 비포함 UI 상태). null이면 팝업 없음.
  offlineGain: OfflineGain | null
  // 세이브 로드 실패(세이브 비포함 UI 상태). true면 App이 1회성 안내를 띄운다.
  // 원본은 손상 백업 키에 보존됐고 진행은 초기화되지 않았음을 알린다(D-1.1).
  loadFailed: boolean
  // 업적 토스트 큐(세이브 비포함 UI 상태). 여러 개 동시 달성 시 세로 스택.
  toasts: AchievementToast[]
  // 마일스톤 이펙트 트리거(세이브 비포함). 값이 바뀔 때마다 BurstEffect가 파티클 버스트를 낸다.
  burstKey: number
  // 업적 체크 스로틀용 마지막 검사 시각(세이브 비포함). tick에서 1초에 1번만 검사하기 위한 상태.
  lastAchievementCheckAt: number
  // 솥 클릭: 마나를 clickPower만큼 증가(누적 마나도 함께).
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
  // cappedMs=실제 정산 인정 시간(캡 적용 여부 표기용).
  applyOfflineEarnings: (amount: number, now: number, elapsedMs: number, cappedMs: number) => void
  // 60초 미만 부재 조용한 지급(D-1.5): 마나 적립 + lastTick=now, 팝업 없음. 이중 지급 금지.
  applySilentEarnings: (amount: number, now: number) => void
  // 오프라인 팝업 닫기.
  dismissOffline: () => void
  // 세이브 로드 실패 표시 세팅/해제(loadGame이 corrupt 감지 시 mark, App 배너 닫기 시 dismiss).
  markLoadFailed: () => void
  dismissLoadFailed: () => void
  // 저장 성공/실패 표시(D-2.5). saveNow가 저장 결과에 따라 호출한다.
  markSaved: (now: number) => void
  markSaveFailed: () => void
  dismissSaveFailed: () => void
  // 각성(T5.1): 조건(lifetimeMana >= 임계) 충족 시 stardust += stardustFor(lifetimeMana),
  //   totalPrestiges += 1, 그리고 마나/시설/업그레이드/buyAmount/lifetimeMana 초기화.
  //   유지: stardust, totalPrestiges, 업적·통계. 리셋 후 파생값(MPS·clickPower) 재계산.
  prestige: () => void
  // 업적 토스트 소멸(자동 3초 타이머가 호출).
  dismissToast: (id: number) => void
  // 음소거 토글(T6.2). 세이브 대상 값이라 액션에서 변형한다.
  toggleMuted: () => void
  // 디버그 전용(debug/cheats.ts): 마나 +n (누적 마나 통계도 함께 증가).
  // ⚠ 프로덕션 코드에서 호출 금지 — 개발/검증용 치트(window.cheats)에서만 사용한다.
  debugAddMana: (n: number) => void
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
    globalMult: 1,
    basePower: INITIAL_CLICK_POWER,
    clickPower: INITIAL_CLICK_POWER,
    generators: initialGenerators(),
    upgrades: [] as string[],
    lastTick: Date.now(),
    buyAmount: 1 as BuyAmount,
    lifetimeMana: 0,
    stardust: 0,
    totalPrestiges: 0,
    achievements: [] as string[],
    totalClicks: 0,
    totalLifetimeMana: 0,
    muted: false,
    playtimeMs: 0,
    lastSavedAt: null as number | null,
    saveFailed: false,
    offlineGain: null as OfflineGain | null,
    loadFailed: false,
    toasts: [] as AchievementToast[],
    burstKey: 0,
    lastAchievementCheckAt: 0,
  }
}

// 파생값(MPS·clickPower) 일괄 재계산. buyGenerator/buyUpgrade/prestige/loadSave 공통.
// clickPower는 MPS에 의존하므로 항상 함께 계산해 캐시를 일관되게 유지한다.
// (MPS·clickPower 모두 generators/upgrades/stardust/업적수 변경 시에만 바뀌고 tick에서는 불변.)
// MPS에는 스타더스트 배율 × 업적 배율을 합성해 한 번만 곱한다(합산 후 전체 배율).
function recalcDerived(
  generators: Record<string, number>,
  upgradeIds: string[],
  basePower: number,
  stardust: number,
  achievementCount: number,
): { manaPerSecond: number; clickPower: number; globalMult: number } {
  const ups = resolveUpgrades(upgradeIds)
  const globalMult = stardustMultiplier(stardust) * achievementMultiplier(achievementCount)
  const manaPerSecond = totalMps(generators, GENERATORS, ups, globalMult)
  return { manaPerSecond, clickPower: computeClickPower(basePower, manaPerSecond, ups), globalMult }
}

// 토스트 id 카운터(UI 전용, 세이브 비포함). 모듈 스코프면 충분하다.
let nextToastId = 0

// 값이 변하는 액션 끝에서 호출: 병합된 상태(prev + partial)로 미달성 업적을 검사하고,
// 새로 달성된 게 있으면 achievements 추가 + 토스트 push + burstKey 증가 + 파생값 재계산을
// partial에 얹어 돌려준다(없으면 partial 그대로). 순수하게 유지해 액션에서만 상태를 만든다.
function withAchievements<T extends Partial<GameState>>(
  prev: GameState,
  partial: T,
): T | (T & Partial<GameState>) {
  const next = { ...prev, ...partial }
  const stats = {
    totalClicks: next.totalClicks,
    generators: next.generators,
    totalLifetimeMana: next.totalLifetimeMana,
    totalPrestiges: next.totalPrestiges,
    mps: next.manaPerSecond,
  }
  const owned = new Set(next.achievements)
  const unlocked: typeof ACHIEVEMENTS = []
  for (const def of ACHIEVEMENTS) {
    if (!owned.has(def.id) && isAchievementUnlocked(def, stats)) unlocked.push(def)
  }
  if (unlocked.length === 0) return partial

  const achievements = [...next.achievements, ...unlocked.map((d) => d.id)]
  const toasts = [...next.toasts, ...unlocked.map((d) => ({ id: nextToastId++, name: d.name }))]
  return {
    ...partial,
    achievements,
    toasts,
    burstKey: next.burstKey + 1, // 마일스톤 파티클 버스트 트리거(T6.2)
    // 업적수가 늘었으므로 생산 배율 재계산 — 늘어난 mps로 다음 tick/액션에서 연쇄 달성이 이어질 수 있다.
    ...recalcDerived(next.generators, next.upgrades, next.basePower, next.stardust, achievements.length),
  }
}

export const useGameStore = create<GameState>()((set) => ({
  ...createInitialState(),

  // 클릭 획득은 소비되지 않는 순수 획득 — lifetimeMana(각성 기준)와 통계(총 클릭/총 누적 마나)도 늘린다.
  // 값이 변하므로 끝에서 업적 검사(즉시).
  click: () =>
    set((s) =>
      withAchievements(s, {
        mana: s.mana + s.clickPower,
        lifetimeMana: s.lifetimeMana + s.clickPower,
        totalLifetimeMana: s.totalLifetimeMana + s.clickPower,
        totalClicks: s.totalClicks + 1,
      }),
    ),

  buyGenerator: (id, count) =>
    set((s) => {
      if (!Number.isInteger(count) || count <= 0) return s // 정수·양수만(비유한/소수 방어)
      const def = GENERATORS.find((g) => g.id === id)
      if (!def) return s
      const owned = s.generators[id] ?? 0
      const cost = bulkCost(def.baseCost, owned, count)
      if (s.mana < cost) return s
      const generators = { ...s.generators, [id]: owned + count }
      return withAchievements(s, {
        mana: s.mana - cost,
        generators,
        ...recalcDerived(generators, s.upgrades, s.basePower, s.stardust, s.achievements.length),
      })
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
      return withAchievements(s, {
        mana: s.mana - def.cost,
        upgrades,
        ...recalcDerived(s.generators, upgrades, s.basePower, s.stardust, s.achievements.length),
      })
    }),

  // 진실은 타임스탬프: 인터벌 주기가 아니라 경과시간(now − lastTick)만큼만 적립.
  // 백그라운드 스로틀·탭 복귀 catch-up이 이 한 줄로 자동 처리된다.
  // 업적 검사는 매 tick이 아니라 1초에 1번만(스로틀) — mps/누적 마나 기반 업적을 가볍게 잡는다.
  tick: (now) =>
    set((s) => {
      const elapsedMs = now - s.lastTick
      // 큰 역행(시계 역행·simulate 미래 앵커): 지급 없이 lastTick만 now로 재앵커해 이후 생산을 되살린다.
      if (elapsedMs < TICK_REANCHOR_TOLERANCE_MS) return { lastTick: now }
      if (elapsedMs <= 0) return s // 미세 역행(재앵커 허용 범위 내)·중복 호출은 기존대로 무시
      // catch-up 캡: 캡 이내분은 100% 지급, 초과분은 오프라인 공식(50%/8h 캡)으로 라우팅한다.
      // (순수 계산 offlineEarnings는 그대로 쓰고, 100%/오프라인 조합만 여기 액션에서 한다.)
      const mps = s.manaPerSecond
      const gained =
        elapsedMs <= MAX_TICK_CATCHUP_MS
          ? mps * (elapsedMs / 1000)
          : mps * (MAX_TICK_CATCHUP_MS / 1000) + offlineEarnings(elapsedMs - MAX_TICK_CATCHUP_MS, mps)
      const partial = {
        mana: s.mana + gained,
        lifetimeMana: s.lifetimeMana + gained, // 생산 획득도 누적 마나에 반영
        totalLifetimeMana: s.totalLifetimeMana + gained, // 전생 포함 총 누적(각성해도 유지)
        lastTick: now,
        // 플레이 시간은 실제 경과를 그대로 누적한다(오프라인 캡·효율과 무관 — 통계 표시 전용).
        playtimeMs: s.playtimeMs + elapsedMs,
      }
      if (now - s.lastAchievementCheckAt < ACHIEVEMENT_CHECK_INTERVAL_MS) return partial
      return { ...withAchievements(s, partial), lastAchievementCheckAt: now }
    }),

  setBuyAmount: (amount) => set({ buyAmount: amount }),

  loadSave: (save) =>
    set((s) => {
      const st = save.state
      const generators = mergeGenerators(st.generators)
      const upgrades = resolveUpgrades(st.upgrades).map((u) => u.id) // 알 수 없는 id 제거
      const achievements = st.achievements
      return {
        mana: st.mana,
        basePower: st.basePower,
        generators,
        upgrades,
        // lastTick은 세이브 값이 아니라 now로 — 로드 직후 tick이 과거 경과를 100% 과지급하지 않게 한다.
        // (오프라인 수익은 applyOfflineEarnings가 savedAt 기준으로 별도 지급.)
        lastTick: Date.now(),
        buyAmount: st.buyAmount,
        lifetimeMana: st.lifetimeMana,
        stardust: st.stardust,
        totalPrestiges: st.totalPrestiges,
        achievements,
        totalClicks: st.totalClicks,
        totalLifetimeMana: st.totalLifetimeMana,
        muted: st.muted,
        playtimeMs: st.playtimeMs,
        // 로드 시 토스트는 띄우지 않는다(이미 달성한 것). 스로틀 시각도 초기화.
        toasts: s.toasts,
        lastAchievementCheckAt: 0,
        ...recalcDerived(generators, upgrades, st.basePower, st.stardust, achievements.length),
      }
    }),

  hardReset: () => {
    clearSave()
    set(() => createInitialState())
  },

  applyOfflineEarnings: (amount, now, elapsedMs, cappedMs) =>
    set((s) =>
      withAchievements(s, {
        mana: s.mana + amount,
        lifetimeMana: s.lifetimeMana + amount, // 오프라인 획득도 누적 마나에 반영
        totalLifetimeMana: s.totalLifetimeMana + amount,
        lastTick: now, // 이중 지급 금지: 오프라인으로 인정한 구간을 tick이 또 세지 않게 한다.
        offlineGain: { amount, elapsedMs, cappedMs },
      }),
    ),

  // 60초 미만 부재 조용한 지급(D-1.5): 팝업 없이 마나만 100% 합산 + lastTick=now(이중 지급 금지).
  applySilentEarnings: (amount, now) =>
    set((s) =>
      withAchievements(s, {
        mana: s.mana + amount,
        lifetimeMana: s.lifetimeMana + amount,
        totalLifetimeMana: s.totalLifetimeMana + amount,
        lastTick: now,
      }),
    ),

  dismissOffline: () => set({ offlineGain: null }),

  markLoadFailed: () => set({ loadFailed: true }),
  dismissLoadFailed: () => set({ loadFailed: false }),

  // 저장 성공: 시각 갱신 + 실패 배너 해제. 저장 실패: 배너 세우기. 닫기: 배너만 해제(D-2.5).
  markSaved: (now) => set({ lastSavedAt: now, saveFailed: false }),
  markSaveFailed: () => set({ saveFailed: true }),
  dismissSaveFailed: () => set({ saveFailed: false }),

  // 각성: 이번 생 누적 마나로 스타더스트를 얻고 진행을 초기화한다.
  // 조건 미달(lifetimeMana < 임계 또는 보상 0)이면 아무것도 하지 않는다(UI에서도 막지만 방어).
  // 유지: stardust, totalPrestiges, 업적·통계(totalClicks/totalLifetimeMana). 각성 자체가 업적을 달성시킬 수 있어 검사.
  prestige: () =>
    set((s) => {
      if (s.lifetimeMana < PRESTIGE_THRESHOLD) return s
      const gained = stardustFor(s.lifetimeMana)
      if (gained <= 0) return s
      const stardust = s.stardust + gained
      // 리셋: 마나/시설/업그레이드/buyAmount/lifetimeMana/clickPower(basePower). 유지: stardust, totalPrestiges.
      const generators = initialGenerators()
      const upgrades: string[] = []
      const totalPrestiges = s.totalPrestiges + 1
      return withAchievements(s, {
        mana: 0,
        lifetimeMana: 0,
        generators,
        upgrades,
        basePower: INITIAL_CLICK_POWER,
        buyAmount: 1 as BuyAmount,
        stardust,
        totalPrestiges,
        lastTick: Date.now(),
        burstKey: s.burstKey + 1, // 각성 순간에도 마일스톤 파티클 버스트(T6.2)
        ...recalcDerived(generators, upgrades, INITIAL_CLICK_POWER, stardust, s.achievements.length),
      })
    }),

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  toggleMuted: () => set((s) => ({ muted: !s.muted })),

  // ⚠ 디버그 전용 — 프로덕션 코드에서 호출 금지(치트 도구 debug/cheats.ts에서만 사용).
  // click과 동일하게 순수 획득으로 취급: mana + 각성 기준(lifetimeMana) + 총 누적 통계도 함께 올린다.
  debugAddMana: (n) =>
    set((s) =>
      withAchievements(s, {
        mana: s.mana + n,
        lifetimeMana: s.lifetimeMana + n,
        totalLifetimeMana: s.totalLifetimeMana + n,
      }),
    ),
}))
