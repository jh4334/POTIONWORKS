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
} from '../data/config.ts'
import { GENERATORS } from '../data/generators.ts'
import { UPGRADES } from '../data/upgrades.ts'
import { KNOWN_ACHIEVEMENT_IDS } from '../data/achievements.ts'
import { STARDUST_UPGRADES, stardustUpgradeById } from '../data/stardustShop.ts'
import { potionById } from '../data/potions.ts'
import { STRINGS } from '../data/strings.ts'
import type { BuyAmount, Brewing } from '../store/gameStore.ts'

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
export const SAVE_VERSION = 8

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
  // 음소거(v3).
  muted: boolean
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
      muted: state.muted,
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
    if (KNOWN_GENERATOR_IDS.has(id) && typeof count === 'number' && Number.isFinite(count) && count >= 0) {
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
    const clamped = def.maxLevel === null ? Math.floor(level) : Math.min(Math.floor(level), def.maxLevel)
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
  const totalLifetimeMana = isV3Plus ? normalizeNonNeg(s.totalLifetimeMana, lifetimeMana) : lifetimeMana
  const muted = isV3Plus ? s.muted === true : false

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
    isV6Plus && typeof s.deviceId === 'string' && s.deviceId.length > 0
      ? s.deviceId
      : getDeviceId()
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
      muted,
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
    },
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
  ]
  for (const n of scalars) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return false
  }
  // 조제 중이면 readyAt도 유한해야 한다(비유한 타임스탬프가 세이브를 오염시키는 것을 막는다).
  if (state.brewing !== null && !Number.isFinite(state.brewing.readyAt)) return false
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
    localStorage.setItem(SAVE_KEY, serialize(state, now))
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

// 원본 raw를 손상 백업 키로 보존(최신 1개만). 실패해도 조용히 넘어간다.
function preserveCorrupt(raw: string): void {
  try {
    localStorage.setItem(SAVE_CORRUPT_KEY, raw)
  } catch {
    console.warn(STRINGS.log.save.corruptBackupFailed)
  }
}

export function loadFromLocalResult(): LoadResult {
  let raw: string | null
  try {
    raw = localStorage.getItem(SAVE_KEY)
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
    localStorage.removeItem(SAVE_KEY)
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
