import { create } from 'zustand'
import {
  INITIAL_CLICK_POWER,
  PRESTIGE_THRESHOLD,
  ACHIEVEMENT_CHECK_INTERVAL_MS,
  MAX_TICK_CATCHUP_MS,
  TICK_REANCHOR_TOLERANCE_MS,
  METEOR_BUFF_MULT,
  METEOR_BUFF_DURATION_MS,
} from '../data/config.ts'
import { offlineEarnings } from '../engine/offline.ts'
import { GENERATORS } from '../data/generators.ts'
import { UPGRADES, resolveUpgrades } from '../data/upgrades.ts'
import { ACHIEVEMENTS } from '../data/achievements.ts'
import { stardustUpgradeById } from '../data/stardustShop.ts'
import {
  bulkCost,
  totalMps,
  clickPower as computeClickPower,
  isUpgradeUnlocked,
  isAchievementUnlocked,
  stardustClickPercent,
  startingApprentices,
  stardustUpgradeCost,
  effectiveOfflineEfficiency,
  effectiveOfflineCapMs,
  prestigeGain,
  composeGlobalMult,
} from '../engine/formulas.ts'
import { clearSave, getDeviceId, type SaveData } from '../engine/save.ts'

// 규칙(CLAUDE.md): 상태 변형은 이 스토어의 액션에서만, 컴포넌트는 selector로 부분 구독.

// 구매 수량 토글 — 모든 시설 행이 공유하므로 UI 상태지만 스토어에 둔다.
export type BuyAmount = 1 | 10 | 'max'

// 오프라인 수익 팝업용 UI 상태(T4.3). 세이브에는 포함하지 않는다 — 로드 시 계산되는 표시값.
export interface OfflineGain {
  amount: number // 지급된 마나
  elapsedMs: number // 실제 자리 비운 시간(캡 적용 전, 표시용)
  cappedMs: number // 실제 정산에 인정된 시간(min(elapsedMs, 캡)). 캡 적용 여부 표기용(D-2.6).
}

// 알림 토스트(T6.1). 세이브 비포함 UI 상태. id는 렌더 key + 개별 소멸용.
// 기본은 업적 달성 토스트(name만 있으면 "업적 달성: name" / "+1% 생산"으로 렌더).
// icon/title/sub가 있으면 그 값으로 렌더한다 — 유성 버프 등 비업적 알림에 큐를 재사용한다(D-4.6).
export interface AchievementToast {
  id: number
  name: string
  icon?: string
  title?: string
  sub?: string
}

// 활성 버프(D-4.6 유성). MPS에 영향을 주는 런타임 상태 — UI 상태가 아니다.
// 세이브 비포함: 로드 시 소멸(단순 유지). 만료 판정은 tick에서(now >= endsAt), 타이머 신뢰 금지 원칙.
export interface ActiveBuff {
  mult: number
  endsAt: number // epoch ms — 이 시각 이후 첫 tick에서 해제된다.
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
  // 스타더스트 상점 레벨(D-3). id → 레벨. 스타더스트 소비처. 각성해도 유지(스타더스트 영역).
  stardustUpgrades: Record<string, number>
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
  // M9 충돌 해소 메타(D-5.3, 세이브 v6 포함).
  // deviceId=이 기기 식별자(localStorage 'potionworks-device'에 영속, 세이브엔 저장 시점 값 기록).
  // saveCount=저장마다 +1인 단조 카운터. 클라이언트 시계 없이 "어느 기기의 몇 번째 저장인지"로 충돌을 판정한다.
  deviceId: string
  saveCount: number
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
  // 활성 버프(D-4.6 유성). null이면 버프 없음. recalcDerived에서 manaPerSecond에 mult를 곱한다.
  // 세이브 비포함 — 파생값(MPS)은 저장하지 않으므로 버프가 세이브를 오염시키지 않는다.
  activeBuff: ActiveBuff | null
  // 솥 클릭: 마나를 clickPower만큼 증가(누적 마나도 함께).
  click: () => void
  // 시설 구매: 비용 확인 후 마나 차감 + 보유 증가 + 파생값 재계산.
  buyGenerator: (id: string, count: number) => void
  // 업그레이드 구매: 해금·비용 확인 후 마나 차감 + id 추가 + 파생값 재계산.
  buyUpgrade: (id: string) => void
  // 스타더스트 상점 구매(D-3): 스타더스트(마나 아님) 차감 + 레벨 증가 + maxLevel 검증 + 파생값 재계산.
  buyStardustUpgrade: (id: string) => void
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
  // 유성 버프 발동(D-4.6): activeBuff 설정 + recalcDerived(버프 반영) + 획득 토스트/버스트.
  //   now는 Date.now(). 만료는 tick이 판정한다(타이머 신뢰 금지).
  activateMeteorBuff: (now: number) => void
  // 업적 토스트 소멸(자동 3초 타이머가 호출).
  dismissToast: (id: number) => void
  // 음소거 토글(T6.2). 세이브 대상 값이라 액션에서 변형한다.
  toggleMuted: () => void
  // 저장 단조 카운터 증가(D-5.3). saveNow가 직렬화 직전 호출해 저장마다 +1을 보장한다(단조 증가).
  bumpSaveCount: () => void
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
    stardustUpgrades: {} as Record<string, number>,
    totalPrestiges: 0,
    achievements: [] as string[],
    totalClicks: 0,
    totalLifetimeMana: 0,
    muted: false,
    playtimeMs: 0,
    // deviceId는 이 기기의 영속 식별자(없으면 생성). hardReset해도 기기는 그대로라 동일 값을 다시 읽는다.
    deviceId: getDeviceId(),
    saveCount: 0,
    lastSavedAt: null as number | null,
    saveFailed: false,
    offlineGain: null as OfflineGain | null,
    loadFailed: false,
    toasts: [] as AchievementToast[],
    burstKey: 0,
    lastAchievementCheckAt: 0,
    activeBuff: null as ActiveBuff | null,
  }
}

// 파생값(MPS·clickPower) 일괄 재계산. buyGenerator/buyUpgrade/prestige/loadSave 공통.
// clickPower는 MPS에 의존하므로 항상 함께 계산해 캐시를 일관되게 유지한다.
// (MPS·clickPower 모두 generators/upgrades/stardust/상점/업적수 변경 시에만 바뀌고 tick에서는 불변.)
// MPS에는 스타더스트 배율 × 업적 배율 × 유성 버프 배율을 합성해 한 번만 곱한다(합산 후 전체 배율).
// buffMult(D-4.6)는 활성 유성 버프면 >1, 아니면 1 — globalMult에 합성돼 MPS·개당 실효값·클릭까지
// 일관되게 반영된다(헤더 MPS·시설 행 표시가 전부 같은 배율을 쓰므로 백분율 합이 100%로 유지됨).
// clickPower에는 상점 '공명 증폭'의 clickMps 퍼센트를 업그레이드 퍼센트와 합산해 반영한다(D-3.1).
//
// (D-5.2) 위치 인자 나열 대신 단일 컨텍스트 객체를 받는다 — 호출부(7곳)가 필드명으로 명확해지고,
// 인자 추가 시 순서 실수를 없앤다. 전체 배율 합성은 formulas.composeGlobalMult로 일원화한다.
interface RecalcContext {
  generators: Record<string, number>
  upgradeIds: string[]
  basePower: number
  stardust: number
  achievementCount: number
  stardustUpgrades: Record<string, number>
  buffMult?: number // 활성 유성 버프면 >1, 아니면 1(기본).
}

function recalcDerived(ctx: RecalcContext): {
  manaPerSecond: number
  clickPower: number
  globalMult: number
} {
  const ups = resolveUpgrades(ctx.upgradeIds)
  const globalMult = composeGlobalMult({
    stardust: ctx.stardust,
    achievementCount: ctx.achievementCount,
    buffMult: ctx.buffMult ?? 1,
  })
  const manaPerSecond = totalMps(ctx.generators, GENERATORS, ups, globalMult)
  const clickPower = computeClickPower(
    ctx.basePower,
    manaPerSecond,
    ups,
    stardustClickPercent(ctx.stardustUpgrades),
  )
  return { manaPerSecond, clickPower, globalMult }
}

// 활성 버프의 MPS 배율(없으면 1). recalcDerived의 buffMult 인자로 넘긴다(D-4.6).
// 만료는 tick이 activeBuff를 null로 지워 처리하므로 여기선 시각 비교를 하지 않는다(존재=적용).
function buffMultOf(activeBuff: ActiveBuff | null): number {
  return activeBuff ? activeBuff.mult : 1
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
    // 유성 버프(next.activeBuff)도 반영해 재계산 — 버프 중 업적 달성이 버프를 지우지 않게 한다.
    ...recalcDerived({
      generators: next.generators,
      upgradeIds: next.upgrades,
      basePower: next.basePower,
      stardust: next.stardust,
      achievementCount: achievements.length,
      stardustUpgrades: next.stardustUpgrades,
      buffMult: buffMultOf(next.activeBuff),
    }),
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
        ...recalcDerived({
          generators,
          upgradeIds: s.upgrades,
          basePower: s.basePower,
          stardust: s.stardust,
          achievementCount: s.achievements.length,
          stardustUpgrades: s.stardustUpgrades,
          buffMult: buffMultOf(s.activeBuff),
        }),
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
        ...recalcDerived({
          generators: s.generators,
          upgradeIds: upgrades,
          basePower: s.basePower,
          stardust: s.stardust,
          achievementCount: s.achievements.length,
          stardustUpgrades: s.stardustUpgrades,
          buffMult: buffMultOf(s.activeBuff),
        }),
      })
    }),

  // 스타더스트 상점 구매(D-3): 마나가 아니라 스타더스트를 차감한다.
  // maxLevel 도달 시 무시(방어). 레벨을 올린 뒤 파생값 재계산(공명 증폭=clickPower 반영).
  // 업적 검사는 불필요하지만(스타더스트 소비는 업적 조건과 무관) 파생값 일관을 위해 recalcDerived만 돌린다.
  buyStardustUpgrade: (id) =>
    set((s) => {
      const def = stardustUpgradeById(id)
      if (!def) return s
      const level = s.stardustUpgrades[id] ?? 0
      if (def.maxLevel !== null && level >= def.maxLevel) return s // 최대 레벨 도달
      const cost = stardustUpgradeCost(def, level)
      if (s.stardust < cost) return s
      const stardustUpgrades = { ...s.stardustUpgrades, [id]: level + 1 }
      const stardust = s.stardust - cost
      return {
        stardust,
        stardustUpgrades,
        ...recalcDerived({
          generators: s.generators,
          upgradeIds: s.upgrades,
          basePower: s.basePower,
          stardust,
          achievementCount: s.achievements.length,
          stardustUpgrades,
          buffMult: buffMultOf(s.activeBuff),
        }),
      }
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
      // catch-up 캡: 캡 이내분은 100% 지급, 초과분은 오프라인 공식으로 라우팅한다.
      // 오프라인 효율·캡은 스타더스트 상점 강화를 반영한 실효값을 쓴다(D-3.1).
      // (순수 계산 offlineEarnings는 그대로 쓰고, 100%/오프라인 조합만 여기 액션에서 한다.)
      //
      // 유성 버프(D-4.6): manaPerSecond는 버프 배율이 이미 곱해진 값이므로, catch-up/오프라인 공식은
      // 버프를 뺀 baseMps로 전 구간을 계산하고, 버프 보너스는 "이 tick 구간이 버프 창[start,end]과
      // 실제로 겹친 시간"만큼만 100%로 더한다. 이렇게 하면 탭을 백그라운드에 두고 복귀해도(큰 elapsed)
      // 버프가 30초 규칙을 넘겨 과지급되지 않는다(만료 판정은 아래 tick에서, 정산은 겹친 구간만).
      const mps = s.manaPerSecond
      const buff = s.activeBuff
      const buffMult = buff ? buff.mult : 1
      const baseMps = mps / buffMult
      const baseGained =
        elapsedMs <= MAX_TICK_CATCHUP_MS
          ? baseMps * (elapsedMs / 1000)
          : baseMps * (MAX_TICK_CATCHUP_MS / 1000) +
            offlineEarnings(
              elapsedMs - MAX_TICK_CATCHUP_MS,
              baseMps,
              effectiveOfflineEfficiency(s.stardustUpgrades),
              effectiveOfflineCapMs(s.stardustUpgrades),
            )
      // 버프 창과 [lastTick, now] 구간의 겹침(ms). 버프 없으면 0.
      const buffedMs = buff
        ? Math.max(
            0,
            Math.min(buff.endsAt, now) -
              Math.max(buff.endsAt - METEOR_BUFF_DURATION_MS, s.lastTick),
          )
        : 0
      // 겹친 시간만큼 (배율-1)배를 base 생산에 얹는다(버프 창은 짧아 캡 무관, 100%).
      const gained = baseGained + baseMps * (buffMult - 1) * (buffedMs / 1000)
      let partial: Partial<GameState> = {
        mana: s.mana + gained,
        lifetimeMana: s.lifetimeMana + gained, // 생산 획득도 누적 마나에 반영
        totalLifetimeMana: s.totalLifetimeMana + gained, // 전생 포함 총 누적(각성해도 유지)
        lastTick: now,
        // 플레이 시간은 실제 경과를 그대로 누적한다(오프라인 캡·효율과 무관 — 통계 표시 전용).
        playtimeMs: s.playtimeMs + elapsedMs,
      }
      // 유성 버프 만료 판정은 tick에서(now >= endsAt) — 타이머 신뢰 금지 원칙. 백그라운드 복귀 후에도
      // 첫 tick이 정확히 판정한다. 해제 시 파생값을 buffMult=1로 재계산해 이후 생산이 원복된다.
      // (이 tick의 gained는 만료 직전 버프값(s.manaPerSecond)으로 계산 — 오버슈트는 한 tick 미만, 단순 유지.)
      if (s.activeBuff && now >= s.activeBuff.endsAt) {
        partial = {
          ...partial,
          activeBuff: null,
          ...recalcDerived({
            generators: s.generators,
            upgradeIds: s.upgrades,
            basePower: s.basePower,
            stardust: s.stardust,
            achievementCount: s.achievements.length,
            stardustUpgrades: s.stardustUpgrades,
            buffMult: 1,
          }),
        }
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
      // 상점 레벨은 save.migrate에서 이미 정규화됨(미지 id·손상값 제거·maxLevel 클램프).
      const stardustUpgrades = st.stardustUpgrades
      return {
        mana: st.mana,
        basePower: st.basePower,
        generators,
        upgrades,
        stardustUpgrades,
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
        // saveCount는 단조 카운터라 세이브 값에서 이어간다(로드 후 저장이 이어서 +1). deviceId는 이 기기 값 유지.
        saveCount: st.saveCount,
        // 로드 시 토스트는 띄우지 않는다(이미 달성한 것). 스로틀 시각도 초기화.
        toasts: s.toasts,
        lastAchievementCheckAt: 0,
        ...recalcDerived({
          generators,
          upgradeIds: upgrades,
          basePower: st.basePower,
          stardust: st.stardust,
          achievementCount: achievements.length,
          stardustUpgrades,
          buffMult: buffMultOf(s.activeBuff),
        }),
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
      // 첫 각성(totalPrestiges===0)이면 첫 각성 보너스가 포함된다(D-3.2). 미리보기와 동일 순수 함수.
      const gained = prestigeGain(s.lifetimeMana, s.totalPrestiges)
      if (gained <= 0) return s
      const stardust = s.stardust + gained
      // 리셋: 마나/시설/업그레이드/buyAmount/lifetimeMana/clickPower(basePower). 유지: stardust, 상점, totalPrestiges.
      // 상점 '견습 마법사단' 레벨만큼 견습생을 보유한 채 시작한다(리빌드 지루함 해소, D-3.1).
      const generators = initialGenerators()
      const startApprentices = startingApprentices(s.stardustUpgrades)
      if (startApprentices > 0) generators.apprentice = startApprentices
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
        ...recalcDerived({
          generators,
          upgradeIds: upgrades,
          basePower: INITIAL_CLICK_POWER,
          stardust,
          achievementCount: s.achievements.length,
          stardustUpgrades: s.stardustUpgrades,
          buffMult: buffMultOf(s.activeBuff),
        }),
      })
    }),

  // 유성 버프 발동(D-4.6): activeBuff 설정 + 버프 반영 파생값 재계산 + 획득 토스트 + 파티클 버스트.
  // 만료는 tick이 판정한다(now >= endsAt). 토스트는 기존 큐 재사용(icon/title/sub 지정).
  activateMeteorBuff: (now) =>
    set((s) => {
      const activeBuff: ActiveBuff = {
        mult: METEOR_BUFF_MULT,
        endsAt: now + METEOR_BUFF_DURATION_MS,
      }
      return {
        activeBuff,
        toasts: [
          ...s.toasts,
          {
            id: nextToastId++,
            name: '',
            icon: '☄️',
            title: '마나 폭주!',
            sub: `${METEOR_BUFF_DURATION_MS / 1000}초간 생산 ×${METEOR_BUFF_MULT}`,
          },
        ],
        burstKey: s.burstKey + 1, // 화려한 획득 이펙트(파티클 버스트) 트리거
        ...recalcDerived({
          generators: s.generators,
          upgradeIds: s.upgrades,
          basePower: s.basePower,
          stardust: s.stardust,
          achievementCount: s.achievements.length,
          stardustUpgrades: s.stardustUpgrades,
          buffMult: activeBuff.mult,
        }),
      }
    }),

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  toggleMuted: () => set((s) => ({ muted: !s.muted })),

  // 저장마다 +1(단조 증가). saveNow가 직렬화 직전 호출 → 세이브에 이번 저장의 카운터가 담긴다.
  bumpSaveCount: () => set((s) => ({ saveCount: s.saveCount + 1 })),

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
