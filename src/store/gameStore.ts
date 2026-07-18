import { create } from 'zustand'
import {
  INITIAL_CLICK_POWER,
  PRESTIGE_THRESHOLD,
  ACHIEVEMENT_CHECK_INTERVAL_MS,
  MAX_TICK_CATCHUP_MS,
  TICK_REANCHOR_TOLERANCE_MS,
  METEOR_BUFF_MULT,
  METEOR_BUFF_DURATION_MS,
  CLICK_BUFF_MULT,
  CLICK_BUFF_DURATION_MS,
  DRAGON_GRANT_SECONDS,
  CLICK_COMBO_WINDOW_MS,
  DEFAULT_VOLUME,
} from '../data/config.ts'
import { offlineEarnings } from '../engine/offline.ts'
import { GENERATORS } from '../data/generators.ts'
import { UPGRADES, resolveUpgrades, type UpgradeDef } from '../data/upgrades.ts'
import { ACHIEVEMENTS } from '../data/achievements.ts'
import { stardustUpgradeById } from '../data/stardustShop.ts'
import { goldenEventByKind, type GoldenEventKind } from '../data/events.ts'
import { potionById } from '../data/potions.ts'
import {
  CHALLENGES,
  challengeById,
  type ChallengeConstraint,
  type ChallengeDef,
} from '../data/challenges.ts'
import { STRINGS } from '../data/strings.ts'
import { formatNumber } from '../utils/format.ts'
import {
  bulkCost,
  maxAffordable,
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
  challengeMultiplier,
  automationLevel,
  potionCost,
  isPotionUnlocked,
  isBrewReady,
  productionBuffBonus,
} from '../engine/formulas.ts'
import { clearSave, getDeviceId, type SaveData } from '../engine/save.ts'

// 규칙(CLAUDE.md): 상태 변형은 이 스토어의 액션에서만, 컴포넌트는 selector로 부분 구독.

// 구매 수량 토글 — 모든 시설 행이 공유하므로 UI 상태지만 스토어에 둔다.
export type BuyAmount = 1 | 10 | 'max'

// 숫자 표기 방식(E-3.3). 'suffix'=1.23M(기본), 'comma'=1,230,000(1e15 이상은 suffix 하이브리드).
export type NumberNotation = 'suffix' | 'comma'
// 이펙트 강도(E-3.3). 'reduced'면 prefers-reduced-motion과 동일 처리(html data-effects → CSS).
export type EffectsMode = 'full' | 'reduced'

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

// 활성 버프(D-4.6 유성 · E-1.4 확장). 생산/클릭 배율에 영향을 주는 런타임 상태 — UI 상태가 아니다.
// 세이브 비포함: 로드 시 소멸(단순 유지). 만료 판정은 tick에서(now >= endsAt), 타이머 신뢰 금지 원칙.
// kind로 적용 경로가 갈린다: 'production'/'potion-production'은 MPS(globalMult)에, 'click'/'potion-click'은
// 클릭 파워 최종값에 곱해진다(E-1.2). 골든 이벤트 버프와 포션 버프는 kind가 달라 공존한다 —
// 예: 골든 'production'(×7)과 포션 'potion-production'(×2)이 동시에 걸리면 생산 ×14(중첩 허용이 재미).
// 같은 kind를 다시 받으면 시간만 갱신한다(addBuff). startsAt/endsAt로 창을 표현해 tick catch-up이
// 여러 생산 버프의 겹침을 정확히 정산한다(productionBuffBonus).
export interface Buff {
  kind: 'production' | 'click' | 'potion-production' | 'potion-click'
  mult: number
  startsAt: number // epoch ms — 버프 발동 시각(창 시작). tick catch-up 겹침 계산에 쓴다.
  endsAt: number // epoch ms — 이 시각 이후 첫 tick에서 해제된다.
}

// 포션 조제 상태(E-1.2). 진실은 readyAt 타임스탬프 — 오프라인 중에도 자동으로 진행된다(비교만 하면 됨).
// 세이브 포함(v8). 완성 판정(now >= readyAt)은 tick에서, 수확은 능동 행위(collectPotion)로만.
export interface Brewing {
  potionId: string
  readyAt: number // epoch ms — 이 시각 이후 첫 tick에서 완성(readyPotion으로 이동).
}

// 진행 중 챌린지(E-2.2). 세이브 포함(v9). id=제약 종류의 진실, startedAt=timed 판정 기준(시작 시각).
// 성공/실패 판정: no-click·no-upgrade는 prestige 시점, timed는 lifetimeMana 임계 도달 시점(withAchievements).
export interface ActiveChallenge {
  id: string
  startedAt: number // epoch ms — 챌린지 시작 시각(각성과 함께 세팅). timed 제한 시간 판정 기준.
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
  // 볼륨(E-3.3, 세이브 v10). 0~1. muted(v3~v9 불리언)를 대체 — muted true→0, false→기본(0.7)로 이전.
  // 사운드 재생 게인에 sound.setVolume으로 반영. volume===0이 곧 '음소거'(숨김 업적 '고요한 공방' 기준).
  volume: number
  // 숫자 표기(E-3.3, 세이브 v10). formatNumber 모듈 전역(setNotation)에 App이 동기화한다.
  // 스토어 값으로도 두어 셀렉터가 참조·리렌더할 수 있게 한다(표시 설정이지만 세이브 대상).
  numberNotation: NumberNotation
  // 이펙트 강도(E-3.3, 세이브 v10). 'reduced'면 html data-effects='reduced' → CSS가 애니메이션을 끈다.
  effects: EffectsMode
  // 글자 크기 배율(E-3.3, 세이브 v10). 1 / 1.15 / 1.3. App이 html zoom으로 적용한다(접근성).
  fontScale: number
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
  // 활성 버프 목록(D-4.6 · E-1.4). 종류가 다른 버프는 공존한다(production+click). 세이브 비포함 —
  // 파생값(MPS·clickPower)은 저장하지 않으므로 버프가 세이브를 오염시키지 않는다. 만료는 tick이 지운다.
  activeBuffs: Buff[]
  // 골든 이벤트 클릭 누적(E-1.3, 세이브 v7). 유성/폭풍/드래곤 등 골든 이벤트 클릭마다 +1. 업적 조건.
  meteorsClicked: number
  // 각성 확인 모달 취소 누적(E-1.3, 세이브 v7). 숨겨진 업적 '미련의 대가' 조건. cancelPrestige가 증가.
  prestigeCancels: number
  // 음소거 상태로 누적한 플레이 시간(ms, E-1.3, 세이브 v7). 숨겨진 업적 '고요한 공방' 조건. tick에서 muted 중 누적.
  mutedPlaytimeMs: number
  // 늙은 드래곤 방문 받은 누적(E-1.3, 세이브 v7). 숨겨진 업적 '용의 영접' 조건. 드래곤 이벤트 발동 시 +1.
  dragonVisits: number
  // 현재 클릭 콤보(세이브 비포함). 1초 창(CLICK_COMBO_WINDOW_MS) 안에 이어치면 누적, 끊기면 1로 초기화.
  // 숨겨진 업적 '폭풍 젓기'(100연타) 판정용 — 클릭 액션이 타임스탬프로 계산한다(UI ref 아님).
  clickCombo: number
  // 마지막 클릭 시각(epoch ms, 세이브 비포함). clickCombo 연속 판정 기준.
  lastClickAt: number
  // 포션 조제(E-1.2, 세이브 v8). brewing=조제 중(진실은 readyAt 타임스탬프 → 오프라인에도 진행),
  // readyPotion=완성돼 수확 대기 중인 포션 id(tick이 now>=readyAt에서 brewing→readyPotion 이동),
  // potionsBrewed=수확 누적(통계). 버프 적용은 collectPotion이 activeBuffs/즉시 지급으로 처리한다.
  brewing: Brewing | null
  readyPotion: string | null
  potionsBrewed: number
  // 챌린지 런(E-2.2, 세이브 v9). activeChallenge=진행 중(제약 판정·timed 기준의 진실),
  // completedChallenges=완료 id 목록(challengeMultiplier로 영구 생산 배율에 합류, 각성해도 유지).
  activeChallenge: ActiveChallenge | null
  completedChallenges: string[]
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
  // 오프라인 자동화(E-2.1 공방 관리인): 로드 시점 마나로 업그레이드·시설을 1회 그리디 자동 구매.
  //   레벨 단계로 범위가 커진다(Lv1 배율 업그레이드 · Lv2 +클릭/시너지 · Lv3 +시설). autosave loadGame이
  //   오프라인 정산 직후 호출한다. 정밀 시뮬이 아니라 로드 시점 마나 기준 1회 패스면 충분(레벨 0이면 무동작).
  applyOfflineAutomation: () => void
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
  //   (E-2.2) challengeId를 넘기면 각성 리셋과 함께 그 챌린지를 시작한다. 진행 중이던 제약 챌린지
  //   (no-click·no-upgrade)를 지키며 각성에 도달했다면 이 시점에 완료 처리한다(prestige에서 판정).
  prestige: (challengeId?: string) => void
  // 챌린지 포기(E-2.2): 보상 없이 activeChallenge 해제. UI에서 확인 후 호출한다.
  abandonChallenge: () => void
  // 각성 확인 모달 취소(E-1.3): prestigeCancels += 1. 숨겨진 업적 '미련의 대가'(3회) 판정을 위해 액션으로 센다.
  cancelPrestige: () => void
  // 포션 조제 시작(E-1.2): 비용(현재 MPS × costMpsSeconds, 하한 적용) 차감 + brewing 세팅.
  //   조제 중이거나 수확 대기 중이면 불가(단일 조제 슬롯), 미해금·마나 부족 시 불가(방어 검증).
  startBrew: (potionId: string) => void
  // 포션 수확(E-1.2): readyPotion 소비 → 효과 적용(버프형은 activeBuffs push, 즉발형은 즉시 지급).
  //   potionsBrewed += 1(통계). 토스트·파티클 버스트로 연출. 없으면(readyPotion null) 무시.
  collectPotion: () => void
  // 골든 이벤트 발동(D-4.6 · E-1.4): kind별로 생산 버프 / 클릭 버프 / 드래곤 즉시 지급.
  //   버프는 종류가 다르면 공존, 같으면 시간 갱신. 드래곤은 버프 없이 현재 MPS×N초를 즉시 지급한다.
  //   meteorsClicked += 1(모든 종류). now는 Date.now(). 버프 만료는 tick이 판정한다(타이머 신뢰 금지).
  activateGoldenEvent: (kind: GoldenEventKind, now: number) => void
  // 업적 토스트 소멸(자동 3초 타이머가 호출).
  dismissToast: (id: number) => void
  // 볼륨 설정(E-3.3). 0~1로 클램프. 세이브 대상 값이라 액션에서 변형한다(0=음소거).
  setVolume: (v: number) => void
  // 숫자 표기/이펙트/글자 크기 설정(E-3.3). 전부 세이브 대상. App이 각각을 표시 레이어에 동기화한다.
  setNumberNotation: (n: NumberNotation) => void
  setEffects: (mode: EffectsMode) => void
  setFontScale: (scale: number) => void
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
    volume: DEFAULT_VOLUME,
    numberNotation: 'suffix' as NumberNotation,
    effects: 'full' as EffectsMode,
    fontScale: 1,
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
    activeBuffs: [] as Buff[],
    meteorsClicked: 0,
    prestigeCancels: 0,
    mutedPlaytimeMs: 0,
    dragonVisits: 0,
    clickCombo: 0,
    lastClickAt: 0,
    brewing: null as Brewing | null,
    readyPotion: null as string | null,
    potionsBrewed: 0,
    activeChallenge: null as ActiveChallenge | null,
    completedChallenges: [] as string[],
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
  completedChallenges: string[] // 완료 챌린지(영구 생산 배율, E-2.2) — globalMult에 합성.
  buffMult?: number // 활성 생산 버프면 >1, 아니면 1(기본). globalMult(MPS)에 합성.
  clickBuffMult?: number // 활성 클릭 버프면 >1, 아니면 1(기본). 클릭 파워 최종값에 곱함.
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
    // 완료 챌린지 영구 배율(E-2.2). 데이터 결합은 여기(store)서 — challengeMultiplier는 순수 함수.
    challengeMult: challengeMultiplier(ctx.completedChallenges, CHALLENGES),
  })
  // 생산 트리(별의 축복, E-2.1)의 티어별 배율은 totalMps가 stardustUpgrades로 반영한다(개당 실효값·델타와 일관).
  const manaPerSecond = totalMps(ctx.generators, GENERATORS, ups, globalMult, ctx.stardustUpgrades)
  const clickPower = computeClickPower(
    ctx.basePower,
    manaPerSecond,
    ups,
    stardustClickPercent(ctx.stardustUpgrades),
    ctx.clickBuffMult ?? 1,
  )
  return { manaPerSecond, clickPower, globalMult }
}

// 버프 kind 분류(E-1.2): 생산 계열(골든 'production' + 포션 'potion-production')은 MPS에,
// 클릭 계열(골든 'click' + 포션 'potion-click')은 클릭 파워에 곱해진다. 계열이 다르면 공존한다.
function isProductionKind(kind: Buff['kind']): boolean {
  return kind === 'production' || kind === 'potion-production'
}
function isClickKind(kind: Buff['kind']): boolean {
  return kind === 'click' || kind === 'potion-click'
}

// 활성 버프 목록에서 계열별 배율 곱(없으면 1). recalcDerived의 buffMult/clickBuffMult 인자로 넘긴다(E-1.4·E-1.2).
// 만료는 tick이 activeBuffs에서 지워 처리하므로 여기선 시각 비교를 하지 않는다(목록에 있음=적용).
// 골든·포션 버프가 공존하면 곱으로 합성한다(생산 ×7 × ×2 = ×14 등 — 중첩 허용이 재미).
function productionBuffMult(buffs: Buff[]): number {
  return buffs.reduce((m, b) => (isProductionKind(b.kind) ? m * b.mult : m), 1)
}
function clickBuffMult(buffs: Buff[]): number {
  return buffs.reduce((m, b) => (isClickKind(b.kind) ? m * b.mult : m), 1)
}

// 버프 추가/갱신: 같은 종류는 대체(시간 갱신), 다른 종류는 공존(E-1.4). 새 배열을 돌려준다(불변).
function addBuff(buffs: Buff[], buff: Buff): Buff[] {
  return [...buffs.filter((b) => b.kind !== buff.kind), buff]
}

// 토스트 id 카운터(UI 전용, 세이브 비포함). 모듈 스코프면 충분하다.
let nextToastId = 0

// --- 챌린지(E-2.2) 헬퍼 ---
// 진행 중 챌린지가 특정 제약(no-click·no-upgrade)인지. click/buyUpgrade 액션의 무효화 판정에 쓴다.
function isChallengeConstraint(
  active: ActiveChallenge | null,
  constraint: ChallengeConstraint,
): boolean {
  if (!active) return false
  return challengeById(active.id)?.constraint === constraint
}

function challengeDoneToast(def: ChallengeDef): AchievementToast {
  return {
    id: nextToastId++,
    name: '',
    icon: def.icon,
    title: STRINGS.toast.challengeDoneTitle(def.name),
    sub: STRINGS.toast.challengeDoneSub(Math.round(def.reward * 100)),
  }
}
function challengeFailToast(def: ChallengeDef): AchievementToast {
  return {
    id: nextToastId++,
    name: '',
    icon: def.icon,
    title: STRINGS.toast.challengeFailTitle(def.name),
    sub: STRINGS.toast.challengeFailSub,
  }
}

// timed 챌린지 판정(E-2.2): activeChallenge가 timed이고 이번 상태에서 각성 임계(누적 1e9)에 도달했으면
// startedAt~now 경과로 성공/실패를 확정하고 해제한다. 성공 시 completedChallenges에 추가(영구 배율 변화),
// 실패 시 해제만. 임계 미달·비timed·비활성이면 null(변경 없음). 시각 진실은 Date.now()(타임스탬프 원칙).
function resolveTimedChallenge(s: {
  activeChallenge: ActiveChallenge | null
  lifetimeMana: number
  completedChallenges: string[]
  toasts: AchievementToast[]
}): Partial<GameState> | null {
  const active = s.activeChallenge
  if (!active) return null
  const def = challengeById(active.id)
  if (!def || def.constraint !== 'timed') return null
  if (s.lifetimeMana < PRESTIGE_THRESHOLD) return null
  const withinTime = Date.now() - active.startedAt <= (def.timeLimitMs ?? 0)
  if (withinTime) {
    const completed = s.completedChallenges.includes(def.id)
      ? s.completedChallenges
      : [...s.completedChallenges, def.id]
    return {
      activeChallenge: null,
      completedChallenges: completed,
      toasts: [...s.toasts, challengeDoneToast(def)],
    }
  }
  return { activeChallenge: null, toasts: [...s.toasts, challengeFailToast(def)] }
}

// 값이 변하는 액션 끝에서 호출: 병합된 상태(prev + partial)로 timed 챌린지 판정 + 미달성 업적을 검사하고,
// 변한 게 있으면 관련 필드·토스트·burstKey·파생값 재계산을 partial에 얹어 돌려준다(없으면 partial 그대로).
// 순수하게 유지해 액션에서만 상태를 만든다.
function withAchievements<T extends Partial<GameState>>(
  prev: GameState,
  partial: T,
): T | (T & Partial<GameState>) {
  let next = { ...prev, ...partial }
  // (E-2.2) timed 챌린지 판정 — 임계 도달 시 성공/실패 확정·해제. 성공하면 생산 배율이 바뀌어 재계산이 필요하다.
  const timed = resolveTimedChallenge(next)
  let challengeCompleted = false
  if (timed) {
    partial = { ...partial, ...timed }
    next = { ...prev, ...partial }
    challengeCompleted = Array.isArray(timed.completedChallenges) // completedChallenges가 있으면 성공(배율 변화)
  }
  const stats = {
    totalClicks: next.totalClicks,
    generators: next.generators,
    totalLifetimeMana: next.totalLifetimeMana,
    totalPrestiges: next.totalPrestiges,
    mps: next.manaPerSecond,
    stardust: next.stardust,
    playtimeMs: next.playtimeMs,
    meteorsClicked: next.meteorsClicked,
    prestigeCancels: next.prestigeCancels,
    mutedPlaytimeMs: next.mutedPlaytimeMs,
    clickCombo: next.clickCombo,
    dragonVisits: next.dragonVisits,
  }
  const owned = new Set(next.achievements)
  const unlocked: typeof ACHIEVEMENTS = []
  for (const def of ACHIEVEMENTS) {
    if (!owned.has(def.id) && isAchievementUnlocked(def, stats)) unlocked.push(def)
  }
  // 업적도, 챌린지 성공도 없으면 partial 그대로(챌린지 실패 해제분은 partial에 이미 반영됨).
  if (unlocked.length === 0 && !challengeCompleted) return partial

  const achievements =
    unlocked.length > 0 ? [...next.achievements, ...unlocked.map((d) => d.id)] : next.achievements
  const toasts =
    unlocked.length > 0
      ? [...next.toasts, ...unlocked.map((d) => ({ id: nextToastId++, name: d.name }))]
      : next.toasts
  return {
    ...partial,
    achievements,
    toasts,
    burstKey: next.burstKey + 1, // 마일스톤·챌린지 완료 파티클 버스트 트리거(T6.2)
    // 업적수/챌린지 완료가 반영된 생산 배율 재계산 — 연쇄 달성·챌린지 보상이 즉시 MPS에 든다.
    // 활성 버프(next.activeBuffs)도 반영해 재계산 — 버프 중 달성이 버프를 지우지 않게 한다.
    ...recalcDerived({
      generators: next.generators,
      upgradeIds: next.upgrades,
      basePower: next.basePower,
      stardust: next.stardust,
      achievementCount: achievements.length,
      stardustUpgrades: next.stardustUpgrades,
      completedChallenges: next.completedChallenges,
      buffMult: productionBuffMult(next.activeBuffs),
      clickBuffMult: clickBuffMult(next.activeBuffs),
    }),
  }
}

export const useGameStore = create<GameState>()((set) => ({
  ...createInitialState(),

  // 클릭 획득은 소비되지 않는 순수 획득 — lifetimeMana(각성 기준)와 통계(총 클릭/총 누적 마나)도 늘린다.
  // 값이 변하므로 끝에서 업적 검사(즉시).
  click: () =>
    set((s) => {
      // 챌린지 '침묵의 손'(no-click) 진행 중이면 클릭 무효(마나 0, E-2.2). UI는 팝을 +0으로 표시한다.
      if (isChallengeConstraint(s.activeChallenge, 'no-click')) return s
      // 콤보: 마지막 클릭 이후 창(1초) 안이면 누적, 끊겼으면 1로 리셋. 숨겨진 업적 '폭풍 젓기'(100연타) 판정.
      // 진실은 타임스탬프 — UI(ClickerPanel) ref가 아니라 스토어가 판정한다(세이브 비포함 런타임 상태).
      const now = Date.now()
      const clickCombo = now - s.lastClickAt < CLICK_COMBO_WINDOW_MS ? s.clickCombo + 1 : 1
      return withAchievements(s, {
        mana: s.mana + s.clickPower,
        lifetimeMana: s.lifetimeMana + s.clickPower,
        totalLifetimeMana: s.totalLifetimeMana + s.clickPower,
        totalClicks: s.totalClicks + 1,
        clickCombo,
        lastClickAt: now,
      })
    }),

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
          completedChallenges: s.completedChallenges,
          buffMult: productionBuffMult(s.activeBuffs),
          clickBuffMult: clickBuffMult(s.activeBuffs),
        }),
      })
    }),

  buyUpgrade: (id) =>
    set((s) => {
      if (s.upgrades.includes(id)) return s // 이미 구매됨
      // 챌린지 '금욕의 공방'(no-upgrade) 진행 중이면 구매 무효(E-2.2). UI에서도 막지만 액션에서도 방어.
      if (isChallengeConstraint(s.activeChallenge, 'no-upgrade')) return s
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
          completedChallenges: s.completedChallenges,
          buffMult: productionBuffMult(s.activeBuffs),
          clickBuffMult: clickBuffMult(s.activeBuffs),
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
          completedChallenges: s.completedChallenges,
          buffMult: productionBuffMult(s.activeBuffs),
          clickBuffMult: clickBuffMult(s.activeBuffs),
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
      // 골든 이벤트 버프(D-4.6 · E-1.4): manaPerSecond에는 생산 버프 배율만 곱해져 있으므로(클릭 버프는
      // 클릭 파워에만 반영), catch-up/오프라인 공식은 생산 버프를 뺀 baseMps로 전 구간을 계산하고,
      // 생산 버프 보너스는 "이 tick 구간이 버프 창[start,end]과 실제로 겹친 시간"만큼만 100%로 더한다.
      // 이렇게 하면 탭을 백그라운드에 두고 복귀해도(큰 elapsed) 버프가 30초 규칙을 넘겨 과지급되지 않는다.
      const mps = s.manaPerSecond
      // 생산 계열 버프(골든 'production' + 포션 'potion-production')를 모두 뺀 순수 생산율.
      // 여러 생산 버프가 공존하면 배율은 곱으로 쌓이므로 곱으로 나눠 baseMps를 얻는다(단일이면 기존과 동일).
      const prodBuffs = s.activeBuffs.filter((b) => isProductionKind(b.kind))
      const prodMult = prodBuffs.reduce((m, b) => m * b.mult, 1)
      const baseMps = mps / prodMult
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
      // 생산 버프 보너스: 각 버프 창이 [lastTick, now]와 겹친 구간만큼 (배율 곱 −1)배를 base에 얹는다(100%).
      // 창이 짧아(≤ 지속시간) 큰 elapsed(백그라운드 복귀)에도 30초/10분 규칙을 넘겨 과지급되지 않는다(순수 함수).
      const gained = baseGained + productionBuffBonus(baseMps, s.lastTick, now, prodBuffs)
      let partial: Partial<GameState> = {
        mana: s.mana + gained,
        lifetimeMana: s.lifetimeMana + gained, // 생산 획득도 누적 마나에 반영
        totalLifetimeMana: s.totalLifetimeMana + gained, // 전생 포함 총 누적(각성해도 유지)
        lastTick: now,
        // 플레이 시간은 실제 경과를 그대로 누적한다(오프라인 캡·효율과 무관 — 통계 표시 전용).
        playtimeMs: s.playtimeMs + elapsedMs,
        // 음소거 중 플레이 시간(숨겨진 업적 '고요한 공방'). volume===0(음소거) 상태의 경과만 별도 누적한다.
        mutedPlaytimeMs: s.mutedPlaytimeMs + (s.volume === 0 ? elapsedMs : 0),
      }
      // 조제 완료 판정(E-1.2): now >= readyAt이면 brewing → readyPotion로 이동. 진실은 타임스탬프라
      // 오프라인 중에도 진행되고 복귀 첫 tick이 판정한다. 수확은 능동 행위(collectPotion)라 여기선 자동 지급하지 않는다.
      if (s.brewing !== null && isBrewReady(s.brewing, now)) {
        partial = { ...partial, brewing: null, readyPotion: s.brewing.potionId }
      }
      // 버프 만료 판정은 tick에서(now >= endsAt) — 타이머 신뢰 금지 원칙. 백그라운드 복귀 후에도 첫 tick이
      // 정확히 판정한다. 만료된 버프를 목록에서 지우고 남은 버프 배율로 재계산해 생산·클릭이 원복된다.
      // (이 tick의 gained는 만료 직전 생산 버프값으로 계산 — 오버슈트는 한 tick 미만, 단순 유지.)
      const stillActive = s.activeBuffs.filter((b) => now < b.endsAt)
      if (stillActive.length !== s.activeBuffs.length) {
        partial = {
          ...partial,
          activeBuffs: stillActive,
          ...recalcDerived({
            generators: s.generators,
            upgradeIds: s.upgrades,
            basePower: s.basePower,
            stardust: s.stardust,
            achievementCount: s.achievements.length,
            stardustUpgrades: s.stardustUpgrades,
            completedChallenges: s.completedChallenges,
            buffMult: productionBuffMult(stillActive),
            clickBuffMult: clickBuffMult(stillActive),
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
        volume: st.volume,
        numberNotation: st.numberNotation,
        effects: st.effects,
        fontScale: st.fontScale,
        playtimeMs: st.playtimeMs,
        // 통계 카운터(v7): 골든 이벤트 클릭·각성 취소·음소거 플레이·드래곤 방문. 각성해도 유지되는 값이라 세이브에서 복원.
        meteorsClicked: st.meteorsClicked,
        prestigeCancels: st.prestigeCancels,
        mutedPlaytimeMs: st.mutedPlaytimeMs,
        dragonVisits: st.dragonVisits,
        // 포션 조제(v8): brewing/readyPotion은 세이브 값 그대로(readyAt는 절대 타임스탬프라 오프라인 경과가
        //   자동 반영 — 로드 후 첫 tick이 완성 판정). potionsBrewed는 누적 통계.
        brewing: st.brewing,
        readyPotion: st.readyPotion,
        potionsBrewed: st.potionsBrewed,
        // 챌린지 런(v9): activeChallenge/completedChallenges를 세이브에서 복원(제약·영구 배율의 진실).
        activeChallenge: st.activeChallenge,
        completedChallenges: st.completedChallenges,
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
          completedChallenges: st.completedChallenges,
          buffMult: productionBuffMult(s.activeBuffs),
          clickBuffMult: clickBuffMult(s.activeBuffs),
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

  // 오프라인 자동화(E-2.1 공방 관리인). 로드 시점 마나로 업그레이드·시설을 1회 그리디 자동 구매한다.
  //  - Lv1: 시설 배율 업그레이드(generatorMult — 마일스톤·초반 배율)만.
  //  - Lv2: +클릭·시너지 업그레이드.
  //  - Lv3: +시설 그리디 매수(높은 티어부터 살 수 있는 만큼), 이후 새로 해금된 배율 업그레이드도 한 번 더.
  // 정밀 시뮬이 아니라 "로드 시점 마나로 한 번" 사는 그리디 패스 — 자동저장 loadGame이 오프라인 지급 직후 호출한다.
  applyOfflineAutomation: () =>
    set((s) => {
      const level = automationLevel(s.stardustUpgrades)
      if (level <= 0) return s

      let mana = s.mana
      const generators = { ...s.generators }
      const upgrades = [...s.upgrades]
      const owned = new Set(upgrades)
      const stardustLevels = s.stardustUpgrades
      // 배율(globalMult)은 자동화 동안 불변(스타더스트·업적·챌린지·버프 고정) — 해금 판정 mps에 반영해 정확히 산다.
      const globalMult = composeGlobalMult({
        stardust: s.stardust,
        achievementCount: s.achievements.length,
        buffMult: productionBuffMult(s.activeBuffs),
        challengeMult: challengeMultiplier(s.completedChallenges, CHALLENGES),
      })
      const computeMps = () =>
        totalMps(generators, GENERATORS, resolveUpgrades(upgrades), globalMult, stardustLevels)
      let mps = computeMps()

      // 레벨별 자동 구매 대상 업그레이드 종류.
      const kindAllowed = (kind: UpgradeDef['effect']['kind']): boolean =>
        kind === 'generatorMult' ? level >= 1 : level >= 2

      // 해금·비용을 만족하는 업그레이드를 더 살 게 없을 때까지 반복 매수(배율 상승이 새 해금을 연다).
      const buyUpgrades = () => {
        let changed = true
        while (changed) {
          changed = false
          for (const u of UPGRADES) {
            if (owned.has(u.id)) continue
            if (!kindAllowed(u.effect.kind)) continue
            if (!isUpgradeUnlocked(u, generators, mps)) continue
            if (mana < u.cost) continue
            mana -= u.cost
            owned.add(u.id)
            upgrades.push(u.id)
            changed = true
          }
          if (changed) mps = computeMps()
        }
      }

      buyUpgrades()

      if (level >= 3) {
        // 시설 그리디 1회 패스: 상위 티어부터 살 수 있는 만큼 산다(큰 마나를 상위 티어에 우선 투입).
        for (let i = GENERATORS.length - 1; i >= 0; i -= 1) {
          const g = GENERATORS[i]
          const have = generators[g.id] ?? 0
          const n = maxAffordable(g.baseCost, have, mana)
          if (n > 0) {
            mana -= bulkCost(g.baseCost, have, n)
            generators[g.id] = have + n
          }
        }
        // 시설이 늘어 새로 해금된 배율 업그레이드를 한 번 더 매수.
        mps = computeMps()
        buyUpgrades()
      }

      // 구매로 파생값이 바뀌었고 시설/MPS 업적이 달성될 수 있어 withAchievements로 감싼다.
      return withAchievements(s, {
        mana,
        generators,
        upgrades,
        ...recalcDerived({
          generators,
          upgradeIds: upgrades,
          basePower: s.basePower,
          stardust: s.stardust,
          achievementCount: s.achievements.length,
          stardustUpgrades: s.stardustUpgrades,
          completedChallenges: s.completedChallenges,
          buffMult: productionBuffMult(s.activeBuffs),
          clickBuffMult: clickBuffMult(s.activeBuffs),
        }),
      })
    }),

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
  prestige: (challengeId) =>
    set((s) => {
      if (s.lifetimeMana < PRESTIGE_THRESHOLD) return s
      // 첫 각성(totalPrestiges===0)이면 첫 각성 보너스가 포함된다(D-3.2). 미리보기와 동일 순수 함수.
      const gained = prestigeGain(s.lifetimeMana, s.totalPrestiges)
      if (gained <= 0) return s
      const stardust = s.stardust + gained

      // (E-2.2) 제약 챌린지(no-click·no-upgrade) 성공 판정: 그 생을 제약 지키며 각성에 도달 = 성공.
      //   제약은 click/buyUpgrade 액션이 그 생 내내 강제하므로, 여기 도달 자체가 준수의 증거다.
      //   timed 챌린지는 임계 도달 시점(withAchievements)에서 이미 판정돼 해제됐어야 한다.
      let completedChallenges = s.completedChallenges
      let toasts = s.toasts
      const active = s.activeChallenge
      if (active) {
        const def = challengeById(active.id)
        if (
          def &&
          (def.constraint === 'no-click' || def.constraint === 'no-upgrade') &&
          !completedChallenges.includes(def.id)
        ) {
          completedChallenges = [...completedChallenges, def.id]
          toasts = [...toasts, challengeDoneToast(def)]
        }
      }
      // 새 챌린지 시작(선택 시): 미완료·유효 id면 각성 리셋과 함께 시작. 아니면 해제(null).
      const startDef = challengeId ? challengeById(challengeId) : undefined
      const activeChallenge: ActiveChallenge | null =
        startDef && !completedChallenges.includes(startDef.id)
          ? { id: startDef.id, startedAt: Date.now() }
          : null

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
        completedChallenges,
        activeChallenge,
        toasts,
        lastTick: Date.now(),
        burstKey: s.burstKey + 1, // 각성 순간에도 마일스톤 파티클 버스트(T6.2)
        ...recalcDerived({
          generators,
          upgradeIds: upgrades,
          basePower: INITIAL_CLICK_POWER,
          stardust,
          achievementCount: s.achievements.length,
          stardustUpgrades: s.stardustUpgrades,
          completedChallenges,
          buffMult: productionBuffMult(s.activeBuffs),
          clickBuffMult: clickBuffMult(s.activeBuffs),
        }),
      })
    }),

  // 챌린지 포기(E-2.2): 보상 없이 activeChallenge만 해제한다(생산 배율 불변이라 재계산 불필요).
  abandonChallenge: () => set((s) => (s.activeChallenge === null ? s : { activeChallenge: null })),

  // 각성 확인 모달 취소(E-1.3): prestigeCancels += 1. 숨겨진 업적 '미련의 대가'(3회) 판정을 위해 액션으로 센다.
  // withAchievements로 감싸 취소 3회째에 즉시 업적을 잡는다(다른 값은 건드리지 않음).
  cancelPrestige: () => set((s) => withAchievements(s, { prestigeCancels: s.prestigeCancels + 1 })),

  // 포션 조제 시작(E-1.2). 단일 조제 슬롯 — 조제 중이거나 수확 대기 중이면 시작 불가(완성분을 덮어써 잃지 않게).
  // 비용 = potionCost(현재 MPS × costMpsSeconds, 하한). 해금·마나 부족 시 무시(UI에서도 막지만 방어).
  // readyAt = now + brewMs(절대 타임스탬프 진실 → 오프라인 중에도 진행). 마나 차감은 소비라 통계/각성 기준 불변.
  startBrew: (potionId) =>
    set((s) => {
      if (s.brewing !== null || s.readyPotion !== null) return s
      const def = potionById(potionId)
      if (!def) return s
      if (!isPotionUnlocked(def, s.totalLifetimeMana)) return s
      const cost = potionCost(def, s.manaPerSecond)
      if (s.mana < cost) return s
      const now = Date.now()
      return { mana: s.mana - cost, brewing: { potionId, readyAt: now + def.brewMs } }
    }),

  // 포션 수확(E-1.2). readyPotion 소비 → 효과 적용. potionsBrewed += 1(통계). 토스트·파티클 버스트로 연출.
  //  - buff-production/buff-click: activeBuffs에 'potion-production'/'potion-click'로 push(골든 버프와 공존) → 재계산.
  //  - instant-mps: 현재 MPS × seconds를 즉시 지급(늙은 드래곤 계열, 버프 아님).
  // 즉시 지급/누적 갱신이 업적을 달성시킬 수 있어 withAchievements로 감싼다.
  collectPotion: () =>
    set((s) => {
      if (s.readyPotion === null) return s
      const def = potionById(s.readyPotion)
      if (!def) return { readyPotion: null } // 미지 포션 id(데이터 변경 등)면 조용히 소비(방어).
      const now = Date.now()
      const potionsBrewed = s.potionsBrewed + 1
      const e = def.effect

      if (e.kind === 'instant-mps') {
        const grant = s.manaPerSecond * e.seconds
        return withAchievements(s, {
          readyPotion: null,
          potionsBrewed,
          mana: s.mana + grant,
          lifetimeMana: s.lifetimeMana + grant,
          totalLifetimeMana: s.totalLifetimeMana + grant,
          burstKey: s.burstKey + 1,
          toasts: [
            ...s.toasts,
            {
              id: nextToastId++,
              name: '',
              icon: def.icon,
              title: STRINGS.toast.potionTitle(def.name),
              sub: STRINGS.toast.potionInstantSub(formatNumber(grant)),
            },
          ],
        })
      }

      // 버프형: 같은 계열의 골든 버프와 공존(kind가 다름). 같은 potion 계열을 다시 받으면 시간 갱신(addBuff).
      const kind: Buff['kind'] = e.kind === 'buff-production' ? 'potion-production' : 'potion-click'
      const buff: Buff = { kind, mult: e.mult, startsAt: now, endsAt: now + e.durationMs }
      const activeBuffs = addBuff(s.activeBuffs, buff)
      return withAchievements(s, {
        readyPotion: null,
        potionsBrewed,
        activeBuffs,
        burstKey: s.burstKey + 1,
        toasts: [
          ...s.toasts,
          {
            id: nextToastId++,
            name: '',
            icon: def.icon,
            title: STRINGS.toast.potionTitle(def.name),
            sub: def.desc,
          },
        ],
        ...recalcDerived({
          generators: s.generators,
          upgradeIds: s.upgrades,
          basePower: s.basePower,
          stardust: s.stardust,
          achievementCount: s.achievements.length,
          stardustUpgrades: s.stardustUpgrades,
          completedChallenges: s.completedChallenges,
          buffMult: productionBuffMult(activeBuffs),
          clickBuffMult: clickBuffMult(activeBuffs),
        }),
      })
    }),

  // 골든 이벤트 발동(D-4.6 · E-1.4): kind별로 분기한다. 토스트는 기존 큐 재사용(icon/title/sub 지정).
  //  - production: 생산 버프(MPS ×) 추가/갱신 → globalMult 재계산.
  //  - click: 클릭 버프(클릭 파워 ×) 추가/갱신 → clickPower 재계산. 생산 버프와 공존한다.
  //  - dragon: 버프 없이 현재 MPS × N초(10분치)를 즉시 지급 + dragonVisits += 1.
  // 모든 종류가 meteorsClicked += 1. 버프 만료는 tick이 판정한다(now >= endsAt, 타이머 신뢰 금지).
  activateGoldenEvent: (kind, now) =>
    set((s) => {
      const icon = goldenEventByKind(kind).icon
      const meteorsClicked = s.meteorsClicked + 1

      if (kind === 'dragon') {
        // 즉시 지급: 현재 MPS(생산 버프 반영값) × N초. 버프가 아니라 마나를 바로 준다.
        const grant = s.manaPerSecond * DRAGON_GRANT_SECONDS
        return withAchievements(s, {
          mana: s.mana + grant,
          lifetimeMana: s.lifetimeMana + grant,
          totalLifetimeMana: s.totalLifetimeMana + grant,
          meteorsClicked,
          dragonVisits: s.dragonVisits + 1,
          burstKey: s.burstKey + 1,
          toasts: [
            ...s.toasts,
            {
              id: nextToastId++,
              name: '',
              icon,
              title: STRINGS.toast.dragonTitle,
              sub: STRINGS.toast.dragonSub(formatNumber(grant)),
            },
          ],
        })
      }

      // 버프형(생산/클릭): 종류별 배율·지속시간으로 추가/갱신. 같은 종류면 시간 갱신, 다른 종류면 공존.
      const isProduction = kind === 'production'
      const buff: Buff = isProduction
        ? { kind: 'production', mult: METEOR_BUFF_MULT, startsAt: now, endsAt: now + METEOR_BUFF_DURATION_MS }
        : { kind: 'click', mult: CLICK_BUFF_MULT, startsAt: now, endsAt: now + CLICK_BUFF_DURATION_MS }
      const activeBuffs = addBuff(s.activeBuffs, buff)
      return withAchievements(s, {
        activeBuffs,
        meteorsClicked,
        burstKey: s.burstKey + 1, // 화려한 획득 이펙트(파티클 버스트) 트리거
        toasts: [
          ...s.toasts,
          {
            id: nextToastId++,
            name: '',
            icon,
            title: isProduction ? STRINGS.toast.meteorTitle : STRINGS.toast.clickStormTitle,
            sub: isProduction
              ? STRINGS.toast.meteorSub(METEOR_BUFF_DURATION_MS / 1000, METEOR_BUFF_MULT)
              : STRINGS.toast.clickStormSub(CLICK_BUFF_DURATION_MS / 1000, CLICK_BUFF_MULT),
          },
        ],
        ...recalcDerived({
          generators: s.generators,
          upgradeIds: s.upgrades,
          basePower: s.basePower,
          stardust: s.stardust,
          achievementCount: s.achievements.length,
          stardustUpgrades: s.stardustUpgrades,
          completedChallenges: s.completedChallenges,
          buffMult: productionBuffMult(activeBuffs),
          clickBuffMult: clickBuffMult(activeBuffs),
        }),
      })
    }),

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  // 볼륨: 0~1 클램프. 유한하지 않은 입력은 무시(방어). 0이면 음소거로 취급된다.
  setVolume: (v) =>
    set(() => ({ volume: Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME })),
  setNumberNotation: (n) => set({ numberNotation: n }),
  setEffects: (mode) => set({ effects: mode }),
  setFontScale: (scale) => set({ fontScale: scale }),

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
