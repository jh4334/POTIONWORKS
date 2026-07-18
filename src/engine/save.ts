// 세이브 직렬화·마이그레이션·export/import. 규칙(CLAUDE.md): 세이브에 version 필드 필수,
// 스키마 변경 시 migrate 갱신. 수치·키는 data/config.ts.
//
// 저장 대상은 "진실"만 담는다 — 파생값(manaPerSecond, clickPower)은 저장하지 않고
// 로드 시 recalcDerived로 재계산한다(스토어 loadSave). 이렇게 해야 수식이 바뀌어도
// 세이브가 낡은 파생값으로 오염되지 않는다.
import {
  SAVE_KEY,
  SAVE_CORRUPT_KEY,
  GENERATOR_MAX,
  INITIAL_CLICK_POWER,
  DEVICE_KEY,
  DEFAULT_VOLUME,
  FONT_SCALE_OPTIONS,
  SLOT_KEY_PREFIX,
  ACTIVE_SLOT_KEY,
  SAVE_SLOT_COUNT,
} from '../data/config.ts'
import { GENERATORS } from '../data/generators.ts'
import { UPGRADES } from '../data/upgrades.ts'
import { KNOWN_ACHIEVEMENT_IDS } from '../data/achievements.ts'
import { STARDUST_UPGRADES, stardustUpgradeById } from '../data/stardustShop.ts'
import { potionById } from '../data/potions.ts'
import { challengeById, KNOWN_CHALLENGE_IDS } from '../data/challenges.ts'
import { STRINGS } from '../data/strings.ts'
import type {
  BuyAmount,
  Brewing,
  ActiveChallenge,
  NumberNotation,
  EffectsMode,
} from '../store/gameStore.ts'

// 세이브 스키마 버전. 필드 구조를 바꾸면 올리고 migrate에 단계 추가.
// v2(T5.1): 각성 필드(lifetimeMana/stardust/totalPrestiges) 추가.
// v3(T6.1/T6.2): 업적/통계(achievements/totalClicks/totalLifetimeMana) + 음소거(muted) 추가.
// v4(D-2.3): 플레이 시간(playtimeMs) 추가 — 통계 패널용 실제 경과 누적(캡 무관).
// v5(D-3): 스타더스트 상점 레벨(stardustUpgrades) 추가 — 각성해도 유지되는 영구 강화 트랙.
// v6(D-5.3): M9 충돌 해소 메타(deviceId·saveCount) 추가 — 클라이언트 시계 대신 기기·단조 카운터로 판정.
// v7(E-1.3): 통계 카운터 4종 추가 — meteorsClicked(골든 이벤트 클릭), prestigeCancels(각성 취소),
//   mutedPlaytimeMs(음소거 플레이), dragonVisits(드래곤 방문). 신규 업적(숨김 포함) 조건의 진실.
// v8(E-1.2): 포션 조제 상태 추가 — brewing(조제 중, 타임스탬프 진실 → 오프라인에도 진행), readyPotion(수확 대기),
//   potionsBrewed(수확 누적 통계). 버프(activeBuffs)는 여전히 세이브 비포함(파생 소멸).
// v9(E-2.2): 챌린지 런 추가 — activeChallenge(진행 중 챌린지 {id, startedAt} 또는 null),
//   completedChallenges(완료 id 목록 → 영구 생산 배율의 진실). 각성해도 유지되는 값이라 세이브 포함.
// v10(E-3.3): 설정 확장 — muted(불리언) → volume(0~1)로 대체 + 표시 설정 3종(numberNotation/effects/fontScale) 추가.
//   전부 세이브 대상(슬롯별로 유지). v9→v10 이전 시 muted true→volume 0, false→기본(0.7).
// v11(E-4.4): 배경음 토글(ambientOn: boolean) 추가 — 효과음 볼륨과 독립적으로 앰비언트 루프를 켜고 끈다.
//   세이브 대상. v10→v11 이전 시 기본값 true(기존 유저도 배경음이 켜진 상태로 시작).
export const SAVE_VERSION = 11

// 직렬화 대상(진실만). 파생값은 제외.
export interface SaveState {
  mana: number
  basePower: number
  generators: Record<string, number>
  upgrades: string[]
  lastTick: number
  buyAmount: BuyAmount
  // 각성(v2). lifetimeMana=이번 생 누적 획득 마나, stardust=영구 배율 재화, totalPrestiges=각성 횟수.
  lifetimeMana: number
  stardust: number
  totalPrestiges: number
  // 업적/통계(v3). achievements=달성 id, totalClicks=총 클릭, totalLifetimeMana=전생 포함 총 누적 마나.
  achievements: string[]
  totalClicks: number
  totalLifetimeMana: number
  // 볼륨(v10). 0~1. v3~v9의 muted(불리언)를 대체. 사운드 게인에 반영, volume===0이 곧 음소거.
  volume: number
  // 배경음 토글(v11). 효과음 볼륨과 독립. true면 게임 화면에서 앰비언트 보글보글 루프를 재생한다.
  ambientOn: boolean
  // 표시 설정(v10). numberNotation=숫자 표기('suffix'|'comma'), effects=이펙트 강도('full'|'reduced'),
  // fontScale=글자 크기 배율(1|1.15|1.3). 슬롯별로 유지되는 값이라 세이브에 포함한다.
  numberNotation: NumberNotation
  effects: EffectsMode
  fontScale: number
  // 플레이 시간 누적(v4, ms). tick에서 실제 경과를 그대로 누적(오프라인 캡과 무관). 통계 표시용.
  playtimeMs: number
  // 스타더스트 상점 레벨(v5). id → 레벨. 각성해도 유지(스타더스트 영역).
  stardustUpgrades: Record<string, number>
  // M9 충돌 해소 메타(v6). deviceId=저장 시점의 이 기기 식별자(localStorage 별도 키에 영속),
  // saveCount=저장마다 +1인 단조 카운터. 두 값으로 "어느 기기의 몇 번째 저장인지"를 시계 없이 판정한다.
  deviceId: string
  saveCount: number
  // 통계 카운터(v7, E-1.3). 각성해도 유지되는 누적값 — 신규/숨겨진 업적 조건의 진실.
  meteorsClicked: number // 골든 이벤트 클릭 누적
  prestigeCancels: number // 각성 확인 취소 누적(숨김 업적)
  mutedPlaytimeMs: number // 음소거 중 플레이 시간(ms, 숨김 업적)
  dragonVisits: number // 드래곤 방문 누적(숨김 업적)
  // 포션 조제(v8, E-1.2). brewing=조제 중(진실은 readyAt 타임스탬프 → 오프라인에도 진행),
  // readyPotion=완성돼 수확 대기 중인 포션 id, potionsBrewed=수확 누적(통계).
  brewing: Brewing | null
  readyPotion: string | null
  potionsBrewed: number
  // 챌린지 런(v9, E-2.2). activeChallenge=진행 중(제약 판정의 진실, startedAt은 timed 판정 기준),
  // completedChallenges=완료 id 목록(영구 생산 배율 challengeMultiplier의 진실).
  activeChallenge: ActiveChallenge | null
  completedChallenges: string[]
}

// 이 기기의 영속 식별자(D-5.3). localStorage 별도 키에서 읽고, 없으면 UUID를 생성해 저장한다.
// localStorage/crypto 부재(테스트·비브라우저) 시에도 던지지 않고 임시 UUID를 돌려준다(비영속).
export function getDeviceId(): string {
  let ls: Storage | undefined
  try {
    ls = globalThis.localStorage
  } catch {
    ls = undefined
  }
  try {
    const existing = ls?.getItem(DEVICE_KEY)
    if (typeof existing === 'string' && existing.length > 0) return existing
  } catch {
    /* 접근 실패 시 아래에서 새 id 생성 */
  }
  const id = newUuid()
  try {
    ls?.setItem(DEVICE_KEY, id)
  } catch {
    /* 저장 실패해도 이번 세션 id는 반환한다(비영속) */
  }
  return id
}

// crypto.randomUUID 우선, 부재 환경 폴백. 충돌 무결성보다 존재성이 목적이라 폴백도 충분하다.
function newUuid(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  } catch {
    /* 폴백으로 */
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export interface SaveData {
  version: number
  savedAt: number // 저장 시각(epoch ms). 오프라인 경과 계산의 기준.
  state: SaveState
}

// 알려진 id 집합(마이그레이션 시 미지의 generator/upgrade id를 걸러낸다).
// Set<string>으로 넓혀 외부 입력(string 키) 조회를 허용한다 — GeneratorId로 좁히면 .has(string)이 막힌다.
const KNOWN_GENERATOR_IDS = new Set<string>(GENERATORS.map((g) => g.id))
const KNOWN_UPGRADE_IDS = new Set(UPGRADES.map((u) => u.id))
const KNOWN_STARDUST_IDS = new Set(STARDUST_UPGRADES.map((u) => u.id))

// 스토어 상태(GameState)는 SaveState의 상위 집합이라 그대로 넘길 수 있다.
// now를 인자로 받아 테스트에서 결정적(deterministic) 라운드트립이 가능하게 한다.
export function toSaveData(state: SaveState, now: number = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: now,
    state: {
      mana: state.mana,
      basePower: state.basePower,
      generators: { ...state.generators },
      upgrades: [...state.upgrades],
      lastTick: now, // 저장 시점으로 갱신
      buyAmount: state.buyAmount,
      lifetimeMana: state.lifetimeMana,
      stardust: state.stardust,
      totalPrestiges: state.totalPrestiges,
      achievements: [...state.achievements],
      totalClicks: state.totalClicks,
      totalLifetimeMana: state.totalLifetimeMana,
      volume: state.volume,
      ambientOn: state.ambientOn,
      numberNotation: state.numberNotation,
      effects: state.effects,
      fontScale: state.fontScale,
      playtimeMs: state.playtimeMs,
      stardustUpgrades: { ...state.stardustUpgrades },
      // deviceId=저장 시점의 이 기기 값(진실 기록), saveCount=스토어의 단조 카운터 현재값.
      deviceId: state.deviceId,
      saveCount: state.saveCount,
      // 통계 카운터(v7).
      meteorsClicked: state.meteorsClicked,
      prestigeCancels: state.prestigeCancels,
      mutedPlaytimeMs: state.mutedPlaytimeMs,
      dragonVisits: state.dragonVisits,
      // 포션 조제(v8). brewing/readyPotion은 그대로 기록(진실), potionsBrewed는 누적 통계.
      brewing: state.brewing === null ? null : { ...state.brewing },
      readyPotion: state.readyPotion,
      potionsBrewed: state.potionsBrewed,
      // 챌린지 런(v9). activeChallenge는 얕은 복사(진실), completedChallenges는 배열 복사.
      activeChallenge: state.activeChallenge === null ? null : { ...state.activeChallenge },
      completedChallenges: [...state.completedChallenges],
    },
  }
}

export function serialize(state: SaveState, now?: number): string {
  return JSON.stringify(toSaveData(state, now))
}

// JSON 파싱 → migrate. 깨진 문자열·검증 실패는 null.
export function deserialize(str: string): SaveData | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(str)
  } catch {
    console.warn(STRINGS.log.save.jsonParseFailed)
    return null
  }
  return migrate(parsed)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

// buyAmount 정규화: 1 / 10 / 'max'만 유효, 그 외는 기본 1.
function normalizeBuyAmount(v: unknown): BuyAmount {
  return v === 10 || v === 'max' ? v : 1
}

// 유한한 0 이상 수치만 채택, 그 외(누락·NaN·음수)는 fallback.
function normalizeNonNeg(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback
}

// 유한한 0 이상 정수만 채택(내림), 그 외는 fallback. 카운터류(stardust/prestige/clicks)에 사용.
function normalizeNonNegInt(v: unknown, fallback: number): number {
  return Math.floor(normalizeNonNeg(v, fallback))
}

// generators 정규화: 알려진 id + 유한·0 이상·정수(내림)·상한(GENERATOR_MAX) 클램프.
// 소수·1e308·Infinity 등 오염값이 파생 계산(MPS)으로 전파되는 것을 막는 방어 정규화(D-1.1).
function normalizeGenerators(v: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!isRecord(v)) return out
  for (const [id, count] of Object.entries(v)) {
    if (
      KNOWN_GENERATOR_IDS.has(id) &&
      typeof count === 'number' &&
      Number.isFinite(count) &&
      count >= 0
    ) {
      out[id] = Math.min(Math.floor(count), GENERATOR_MAX)
    }
  }
  return out
}

// upgrades 정규화: 알려진 id 문자열만, 중복 제거.
function normalizeUpgrades(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const seen = new Set<string>()
  for (const id of v) {
    if (typeof id === 'string' && KNOWN_UPGRADE_IDS.has(id)) seen.add(id)
  }
  return [...seen]
}

// stardustUpgrades 정규화: 알려진 상점 id만, 유한·1 이상·정수(내림)·maxLevel 클램프.
// 미지 id·손상값(0/음수/NaN)은 버린다 — 오염된 레벨이 파생 계산으로 전파되는 것을 막는다(D-3).
function normalizeStardustUpgrades(v: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!isRecord(v)) return out
  for (const [id, level] of Object.entries(v)) {
    const def = stardustUpgradeById(id)
    if (!def || !KNOWN_STARDUST_IDS.has(id)) continue
    if (typeof level !== 'number' || !Number.isFinite(level) || level < 1) continue
    const clamped =
      def.maxLevel === null ? Math.floor(level) : Math.min(Math.floor(level), def.maxLevel)
    if (clamped >= 1) out[id] = clamped
  }
  return out
}

// brewing 정규화: 알려진 포션 id + 유한 readyAt만. 그 외(미지 id·손상값)는 null(조제 안 함).
function normalizeBrewing(v: unknown): Brewing | null {
  if (!isRecord(v)) return null
  const { potionId, readyAt } = v
  if (typeof potionId !== 'string' || !potionById(potionId)) return null
  if (typeof readyAt !== 'number' || !Number.isFinite(readyAt)) return null
  return { potionId, readyAt }
}

// readyPotion 정규화: 알려진 포션 id 문자열만, 그 외는 null.
function normalizeReadyPotion(v: unknown): string | null {
  return typeof v === 'string' && potionById(v) ? v : null
}

// activeChallenge 정규화(v9): 알려진 챌린지 id + 유한 startedAt만. 그 외(미지 id·손상값)는 null(진행 안 함).
function normalizeActiveChallenge(v: unknown): ActiveChallenge | null {
  if (!isRecord(v)) return null
  const { id, startedAt } = v
  if (typeof id !== 'string' || !challengeById(id)) return null
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) return null
  return { id, startedAt }
}

// completedChallenges 정규화(v9): 알려진 챌린지 id 문자열만, 중복 제거.
function normalizeCompletedChallenges(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const seen = new Set<string>()
  for (const id of v) {
    if (typeof id === 'string' && KNOWN_CHALLENGE_IDS.has(id)) seen.add(id)
  }
  return [...seen]
}

// volume 정규화(v10): 유한한 0~1만 채택(클램프), 그 외는 fallback. muted 대체 값.
function normalizeVolume(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  return Math.min(1, Math.max(0, v))
}

// ambientOn 정규화(v11): 불리언만 채택, 그 외(누락·손상)는 기본 true(배경음 켜짐).
function normalizeAmbient(v: unknown): boolean {
  return typeof v === 'boolean' ? v : true
}

// numberNotation 정규화(v10): 'comma'만 명시적으로, 그 외(누락·오타)는 기본 'suffix'.
function normalizeNotation(v: unknown): NumberNotation {
  return v === 'comma' ? 'comma' : 'suffix'
}

// effects 정규화(v10): 'reduced'만 명시적으로, 그 외는 기본 'full'.
function normalizeEffects(v: unknown): EffectsMode {
  return v === 'reduced' ? 'reduced' : 'full'
}

// fontScale 정규화(v10): 허용 배율(FONT_SCALE_OPTIONS) 중 하나만 채택, 그 외는 기본 1.
function normalizeFontScale(v: unknown): number {
  return typeof v === 'number' && (FONT_SCALE_OPTIONS as readonly number[]).includes(v) ? v : 1
}

// achievements 정규화: 알려진 업적 id 문자열만, 중복 제거.
function normalizeAchievements(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const seen = new Set<string>()
  for (const id of v) {
    if (typeof id === 'string' && KNOWN_ACHIEVEMENT_IDS.has(id)) seen.add(id)
  }
  return [...seen]
}

// 버전별 마이그레이션. 필수 필드 존재/타입 체크 후 최신(v3) 형태로 끌어올린다.
// 실패 시 null(콘솔 경고). 알 수 없는 generator/upgrade/achievement id는 무시하고 로드한다.
// v1→v2: 각성 필드가 없으므로 lifetimeMana=mana(보수적: 현재 마나까지는 벌었다고 간주),
//   stardust=0, totalPrestiges=0으로 초기화한다.
// v2→v3: 업적/통계 필드가 없으므로 achievements=[], totalClicks=0,
//   totalLifetimeMana=lifetimeMana(이번 생 누적을 총 누적의 출발값으로), muted=false.
// v3→v4: playtimeMs가 없으므로 0으로 초기화한다.
// v4→v5: stardustUpgrades가 없으므로 빈 객체({})로 초기화한다.
// v5→v6: deviceId는 현재 기기값(getDeviceId), saveCount=0으로 초기화한다(단조 카운터 출발점).
// v6→v7: 통계 카운터(meteorsClicked/prestigeCancels/mutedPlaytimeMs/dragonVisits)가 없으므로 0으로 초기화한다.
// v7→v8: 포션 조제 상태(brewing/readyPotion/potionsBrewed)가 없으므로 null/null/0으로 초기화한다.
// v8→v9: 챌린지 런(activeChallenge/completedChallenges)이 없으므로 null/[]로 초기화한다.
// v9→v10: muted(불리언)를 volume(0~1)로 이전(true→0, false→0.7) + 표시 설정 3종(numberNotation='suffix',
//   effects='full', fontScale=1)을 기본값으로 초기화한다.
// v10→v11: ambientOn(배경음 토글)이 없으므로 true로 초기화한다(기존 유저도 배경음 켜짐으로 시작).
export function migrate(raw: unknown): SaveData | null {
  if (!isRecord(raw)) {
    console.warn(STRINGS.log.save.notObject)
    return null
  }
  if (typeof raw.version !== 'number') {
    console.warn(STRINGS.log.save.noVersion)
    return null
  }
  if (raw.version > SAVE_VERSION) {
    console.warn(STRINGS.log.save.unknownVersion(raw.version))
    return null
  }
  if (typeof raw.savedAt !== 'number' || !Number.isFinite(raw.savedAt)) {
    console.warn(STRINGS.log.save.invalidSavedAt)
    return null
  }
  if (!isRecord(raw.state)) {
    console.warn(STRINGS.log.save.noState)
    return null
  }
  const s = raw.state
  // (D-1.1) 수치 필드는 거부하지 않고 정규화한다 — 필드 1개 손상으로 세이브 전체를 버려 파괴하는 것을 막는다.
  // mana는 음수·NaN·누락 시 0, basePower는 INITIAL_CLICK_POWER, lastTick은 savedAt(검증 완료)로 폴백.
  const mana = normalizeNonNeg(s.mana, 0)
  const basePower = normalizeNonNeg(s.basePower, INITIAL_CLICK_POWER)
  const lastTick =
    typeof s.lastTick === 'number' && Number.isFinite(s.lastTick) ? s.lastTick : raw.savedAt

  // v1엔 각성 필드가 없다 → lifetimeMana는 mana로 보수적 초기화, stardust/totalPrestiges는 0.
  // v2 이상은 저장된 값을 검증해 채택(누락·손상 시 동일 fallback). stardust/totalPrestiges는 정수화.
  const isV2Plus = raw.version >= 2
  const lifetimeMana = isV2Plus ? normalizeNonNeg(s.lifetimeMana, mana) : mana
  const stardust = isV2Plus ? normalizeNonNegInt(s.stardust, 0) : 0
  const totalPrestiges = isV2Plus ? normalizeNonNegInt(s.totalPrestiges, 0) : 0

  // v2 이하엔 업적/통계·음소거 필드가 없다 → achievements=[], totalClicks=0,
  // totalLifetimeMana=lifetimeMana(이번 생 누적을 총 누적 출발값으로), muted=false.
  // v3 이상은 저장된 값을 검증해 채택(누락·손상 시 동일 fallback). totalClicks는 정수화.
  const isV3Plus = raw.version >= 3
  const achievements = isV3Plus ? normalizeAchievements(s.achievements) : []
  const totalClicks = isV3Plus ? normalizeNonNegInt(s.totalClicks, 0) : 0
  const totalLifetimeMana = isV3Plus
    ? normalizeNonNeg(s.totalLifetimeMana, lifetimeMana)
    : lifetimeMana

  // 볼륨(v10). v9 이하엔 없다 → v3~v9의 muted(불리언)를 참조해 이전한다: muted true→0(음소거), false→기본(0.7).
  //   v2 이하엔 muted도 없으므로 기본값. v10 이상은 저장된 volume을 0~1로 클램프해 채택.
  //   표시 설정(numberNotation/effects/fontScale)도 v9 이하엔 없으므로 기본값, v10 이상은 정규화해 채택.
  const isV10Plus = raw.version >= 10
  const legacyMuted = isV3Plus ? s.muted === true : false
  const volume = isV10Plus
    ? normalizeVolume(s.volume, DEFAULT_VOLUME)
    : legacyMuted
      ? 0
      : DEFAULT_VOLUME
  const numberNotation = isV10Plus ? normalizeNotation(s.numberNotation) : 'suffix'
  const effects = isV10Plus ? normalizeEffects(s.effects) : 'full'
  const fontScale = isV10Plus ? normalizeFontScale(s.fontScale) : 1

  // 배경음 토글(v11). v10 이하엔 없다 → true(켜짐). v11 이상은 저장된 불리언을 채택(손상 시 true).
  const isV11Plus = raw.version >= 11
  const ambientOn = isV11Plus ? normalizeAmbient(s.ambientOn) : true

  // v3 이하엔 playtimeMs 필드가 없다 → 0으로 시작. v4 이상은 검증해 채택(누락·손상 시 0).
  const isV4Plus = raw.version >= 4
  const playtimeMs = isV4Plus ? normalizeNonNeg(s.playtimeMs, 0) : 0

  // v4 이하엔 stardustUpgrades가 없다 → 빈 객체. v5 이상은 정규화해 채택(미지 id·손상값 제거).
  const isV5Plus = raw.version >= 5
  const stardustUpgrades = isV5Plus ? normalizeStardustUpgrades(s.stardustUpgrades) : {}

  // v5 이하엔 M9 메타가 없다 → deviceId=현재 기기값, saveCount=0. v6 이상은 저장값을 검증해 채택.
  // (v6 세이브의 deviceId는 그 저장을 만든 기기의 값 — 마이그레이션이 덮어쓰지 않고 그대로 보존한다.)
  const isV6Plus = raw.version >= 6
  const deviceId =
    isV6Plus && typeof s.deviceId === 'string' && s.deviceId.length > 0 ? s.deviceId : getDeviceId()
  const saveCount = isV6Plus ? normalizeNonNegInt(s.saveCount, 0) : 0

  // v6 이하엔 통계 카운터가 없다 → 모두 0. v7 이상은 검증해 채택(누락·손상·음수·NaN은 0).
  // meteorsClicked/prestigeCancels/dragonVisits는 정수 카운터, mutedPlaytimeMs는 ms(정수 아님 허용).
  const isV7Plus = raw.version >= 7
  const meteorsClicked = isV7Plus ? normalizeNonNegInt(s.meteorsClicked, 0) : 0
  const prestigeCancels = isV7Plus ? normalizeNonNegInt(s.prestigeCancels, 0) : 0
  const mutedPlaytimeMs = isV7Plus ? normalizeNonNeg(s.mutedPlaytimeMs, 0) : 0
  const dragonVisits = isV7Plus ? normalizeNonNegInt(s.dragonVisits, 0) : 0

  // v7 이하엔 포션 조제 상태가 없다 → brewing=null, readyPotion=null, potionsBrewed=0.
  // v8 이상은 검증해 채택(미지 포션 id·손상 readyAt은 null로 떨궈 안전하게 로드).
  const isV8Plus = raw.version >= 8
  const brewing = isV8Plus ? normalizeBrewing(s.brewing) : null
  const readyPotion = isV8Plus ? normalizeReadyPotion(s.readyPotion) : null
  const potionsBrewed = isV8Plus ? normalizeNonNegInt(s.potionsBrewed, 0) : 0

  // v8 이하엔 챌린지 상태가 없다 → activeChallenge=null, completedChallenges=[].
  // v9 이상은 검증해 채택(미지 id·손상 startedAt은 떨궈 안전하게 로드).
  const isV9Plus = raw.version >= 9
  const activeChallenge = isV9Plus ? normalizeActiveChallenge(s.activeChallenge) : null
  const completedChallenges = isV9Plus ? normalizeCompletedChallenges(s.completedChallenges) : []

  return {
    version: SAVE_VERSION,
    savedAt: raw.savedAt,
    state: {
      mana,
      basePower,
      generators: normalizeGenerators(s.generators),
      upgrades: normalizeUpgrades(s.upgrades),
      lastTick,
      buyAmount: normalizeBuyAmount(s.buyAmount),
      lifetimeMana,
      stardust,
      totalPrestiges,
      achievements,
      totalClicks,
      totalLifetimeMana,
      volume,
      ambientOn,
      numberNotation,
      effects,
      fontScale,
      playtimeMs,
      stardustUpgrades,
      deviceId,
      saveCount,
      meteorsClicked,
      prestigeCancels,
      mutedPlaytimeMs,
      dragonVisits,
      brewing,
      readyPotion,
      potionsBrewed,
      activeChallenge,
      completedChallenges,
    },
  }
}

// --- 세이브 슬롯 (E-3.2) ---
// 슬롯별 localStorage 키. 기존 단일 키(SAVE_KEY)는 최초 1회 슬롯 1로 이전된다(migrateLegacySlot).
// localStorage 접근·저장 함수는 전부 "활성 슬롯 키"를 참조하도록 함수화한다 — 슬롯 전환은 활성 번호만 바꾸면 된다.
export function slotKey(n: number): string {
  return `${SLOT_KEY_PREFIX}${n}`
}

// 활성 슬롯 번호(1..SAVE_SLOT_COUNT). 없거나 손상되면 1(기본). localStorage 접근 실패도 1로.
export function activeSlot(): number {
  try {
    const raw = globalThis.localStorage?.getItem(ACTIVE_SLOT_KEY)
    const n = raw === null || raw === undefined ? NaN : parseInt(raw, 10)
    if (Number.isInteger(n) && n >= 1 && n <= SAVE_SLOT_COUNT) return n
  } catch {
    /* 접근 실패 시 기본 슬롯 */
  }
  return 1
}

// 활성 슬롯 번호 저장. 범위를 벗어나면 무시(방어).
export function setActiveSlot(n: number): void {
  if (!Number.isInteger(n) || n < 1 || n > SAVE_SLOT_COUNT) return
  try {
    globalThis.localStorage?.setItem(ACTIVE_SLOT_KEY, String(n))
  } catch {
    /* 저장 실패는 조용히 넘어간다(비영속) */
  }
}

// 현재 활성 슬롯의 세이브 키·손상 백업 키. localStorage 접근 함수는 전부 이 키를 쓴다.
function activeSlotKey(): string {
  return slotKey(activeSlot())
}
function corruptKeyFor(key: string): string {
  return `${key}-corrupt`
}

// 기존 단일 세이브(SAVE_KEY)를 슬롯 1로 무손실 이전(최초 1회). 데이터 손실을 절대 내지 않도록:
//   - 슬롯 1이 이미 있으면 덮어쓰지 않는다(복사 스킵).
//   - 복사가 성공한 뒤에만 기존 키를 제거한다(복사 실패 시 원본 유지).
// 앱 시작(loadGame) 최상단에서 1회 호출한다. localStorage 부재/예외에도 던지지 않는다.
export function migrateLegacySlot(): void {
  try {
    const ls = globalThis.localStorage
    if (!ls) return
    const legacy = ls.getItem(SAVE_KEY)
    if (legacy === null) return // 이전할 기존 세이브 없음
    const slot1 = slotKey(1)
    if (ls.getItem(slot1) === null) {
      ls.setItem(slot1, legacy) // 슬롯 1이 비어 있을 때만 복사
    }
    // 슬롯 1로의 복사(또는 이미 존재)가 확인된 뒤에만 기존 키 제거 — 원본을 잃지 않는다.
    if (ls.getItem(slot1) !== null) ls.removeItem(SAVE_KEY)
    // 손상 백업 키도 함께 이전(있으면).
    const legacyCorrupt = ls.getItem(SAVE_CORRUPT_KEY)
    if (legacyCorrupt !== null) {
      const slot1Corrupt = corruptKeyFor(slot1)
      if (ls.getItem(slot1Corrupt) === null) ls.setItem(slot1Corrupt, legacyCorrupt)
      if (ls.getItem(slot1Corrupt) !== null) ls.removeItem(SAVE_CORRUPT_KEY)
    }
  } catch {
    console.warn(STRINGS.log.save.accessFailed)
  }
}

// 특정 슬롯의 원본 문자열을 읽는다(파싱 전). listSlots·switchSlot 저장 판정에 쓴다. 접근 실패는 null.
export function readSlotRaw(n: number): string | null {
  try {
    return globalThis.localStorage?.getItem(slotKey(n)) ?? null
  } catch {
    return null
  }
}

// 특정 슬롯 삭제(세이브 + 손상 백업). 확인은 UI에서 한다.
export function deleteSlot(n: number): void {
  try {
    const ls = globalThis.localStorage
    if (!ls) return
    ls.removeItem(slotKey(n))
    ls.removeItem(corruptKeyFor(slotKey(n)))
  } catch {
    console.warn(STRINGS.log.save.removeFailed)
  }
}

// --- localStorage ---
// 저장 직전 유한성 검사(D-1.1): 상태에 비유한 수치가 하나라도 있으면 저장을 스킵한다.
// 오염된 상태로 localStorage를 덮어써 마지막 정상 세이브를 파괴하는 것을 막는다.
function hasFiniteNumbers(state: SaveState): boolean {
  const scalars = [
    state.mana,
    state.basePower,
    state.lastTick,
    state.lifetimeMana,
    state.stardust,
    state.totalPrestiges,
    state.totalClicks,
    state.totalLifetimeMana,
    state.playtimeMs,
    state.saveCount,
    state.meteorsClicked,
    state.prestigeCancels,
    state.mutedPlaytimeMs,
    state.dragonVisits,
    state.potionsBrewed,
    state.volume,
    state.fontScale,
  ]
  for (const n of scalars) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return false
  }
  // 조제 중이면 readyAt도 유한해야 한다(비유한 타임스탬프가 세이브를 오염시키는 것을 막는다).
  if (state.brewing !== null && !Number.isFinite(state.brewing.readyAt)) return false
  // 챌린지 진행 중이면 startedAt도 유한해야 한다(timed 판정 기준의 오염 방지).
  if (state.activeChallenge !== null && !Number.isFinite(state.activeChallenge.startedAt))
    return false
  for (const count of Object.values(state.generators)) {
    if (typeof count !== 'number' || !Number.isFinite(count)) return false
  }
  for (const level of Object.values(state.stardustUpgrades)) {
    if (typeof level !== 'number' || !Number.isFinite(level)) return false
  }
  return true
}

// 성공하면 true, 실패(비유한 수치 스킵·localStorage 예외)하면 false를 돌려준다(D-2.5).
// 호출부(autosave.saveNow)가 이 값으로 "저장됨" 시각 갱신 또는 저장 실패 배너를 띄운다.
export function saveToLocal(state: SaveState, now?: number): boolean {
  if (!hasFiniteNumbers(state)) {
    console.warn(STRINGS.log.save.nonFiniteSkip)
    return false
  }
  try {
    localStorage.setItem(activeSlotKey(), serialize(state, now))
    return true
  } catch {
    console.warn(STRINGS.log.save.saveFailed)
    return false
  }
}

// 로드 결과: 세이브 없음(empty) / 정상(ok) / 손상(corrupt, 원본은 백업됨).
// loadGame이 corrupt를 구분해 사용자에게 안내하기 위해 status를 노출한다.
export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; save: SaveData }
  | { status: 'corrupt' }

// 원본 raw를 손상 백업 키로 보존(활성 슬롯별, 최신 1개만). 실패해도 조용히 넘어간다.
function preserveCorrupt(raw: string): void {
  try {
    localStorage.setItem(corruptKeyFor(activeSlotKey()), raw)
  } catch {
    console.warn(STRINGS.log.save.corruptBackupFailed)
  }
}

export function loadFromLocalResult(): LoadResult {
  let raw: string | null
  try {
    raw = localStorage.getItem(activeSlotKey())
  } catch {
    console.warn(STRINGS.log.save.accessFailed)
    return { status: 'empty' }
  }
  if (raw === null) return { status: 'empty' }
  const save = deserialize(raw)
  if (save === null) {
    // deserialize/migrate 실패 — 원본을 파괴하지 않고 백업한 뒤에만 실패로 보고한다(D-1.1).
    preserveCorrupt(raw)
    return { status: 'corrupt' }
  }
  return { status: 'ok', save }
}

export function loadFromLocal(): SaveData | null {
  const result = loadFromLocalResult()
  return result.status === 'ok' ? result.save : null
}

export function clearSave(): void {
  try {
    localStorage.removeItem(activeSlotKey())
  } catch {
    console.warn(STRINGS.log.save.removeFailed)
  }
}

// --- export/import (T4.2) ---
// 유니코드 안전 Base64: TextEncoder로 UTF-8 바이트 → 바이너리 문자열 → btoa.
function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function fromBase64(b64: string): string {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export function exportSave(state: SaveState, now?: number): string {
  return toBase64(serialize(state, now))
}

export function importSave(str: string): SaveData | null {
  let json: string
  try {
    json = fromBase64(str.trim())
  } catch {
    console.warn(STRINGS.log.save.base64Failed)
    return null
  }
  return deserialize(json)
}
