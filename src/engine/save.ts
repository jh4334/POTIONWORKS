// 세이브 직렬화·마이그레이션·export/import. 규칙(CLAUDE.md): 세이브에 version 필드 필수,
// 스키마 변경 시 migrate 갱신. 수치·키는 data/config.ts.
//
// 저장 대상은 "진실"만 담는다 — 파생값(manaPerSecond, clickPower)은 저장하지 않고
// 로드 시 recalcDerived로 재계산한다(스토어 loadSave). 이렇게 해야 수식이 바뀌어도
// 세이브가 낡은 파생값으로 오염되지 않는다.
import { SAVE_KEY } from '../data/config.ts'
import { GENERATORS } from '../data/generators.ts'
import { UPGRADES } from '../data/upgrades.ts'
import type { BuyAmount } from '../store/gameStore.ts'

// 세이브 스키마 버전. 필드 구조를 바꾸면 올리고 migrate에 단계 추가.
// v2(T5.1): 각성 필드(lifetimeMana/stardust/totalPrestiges) 추가.
export const SAVE_VERSION = 2

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
}

export interface SaveData {
  version: number
  savedAt: number // 저장 시각(epoch ms). 오프라인 경과 계산의 기준.
  state: SaveState
}

// 알려진 id 집합(마이그레이션 시 미지의 generator/upgrade id를 걸러낸다).
const KNOWN_GENERATOR_IDS = new Set(GENERATORS.map((g) => g.id))
const KNOWN_UPGRADE_IDS = new Set(UPGRADES.map((u) => u.id))

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
    console.warn('[save] JSON 파싱 실패 — 세이브를 무시합니다.')
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

// generators 정규화: 알려진 id + 유한한 0 이상 수치만 채택.
function normalizeGenerators(v: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!isRecord(v)) return out
  for (const [id, count] of Object.entries(v)) {
    if (KNOWN_GENERATOR_IDS.has(id) && typeof count === 'number' && Number.isFinite(count) && count >= 0) {
      out[id] = count
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

// 버전별 마이그레이션. 필수 필드 존재/타입 체크 후 최신(v2) 형태로 끌어올린다.
// 실패 시 null(콘솔 경고). 알 수 없는 generator/upgrade id는 무시하고 로드한다.
// v1→v2: 각성 필드가 없으므로 lifetimeMana=mana(보수적: 현재 마나까지는 벌었다고 간주),
//   stardust=0, totalPrestiges=0으로 초기화한다.
export function migrate(raw: unknown): SaveData | null {
  if (!isRecord(raw)) {
    console.warn('[save] 세이브가 객체가 아닙니다 — 무시합니다.')
    return null
  }
  if (typeof raw.version !== 'number') {
    console.warn('[save] version 필드가 없습니다 — 무시합니다.')
    return null
  }
  if (raw.version > SAVE_VERSION) {
    console.warn(`[save] 알 수 없는 세이브 버전(${raw.version}) — 무시합니다.`)
    return null
  }
  if (typeof raw.savedAt !== 'number' || !Number.isFinite(raw.savedAt)) {
    console.warn('[save] savedAt이 유효하지 않습니다 — 무시합니다.')
    return null
  }
  if (!isRecord(raw.state)) {
    console.warn('[save] state가 없습니다 — 무시합니다.')
    return null
  }
  const s = raw.state
  if (
    typeof s.mana !== 'number' ||
    !Number.isFinite(s.mana) ||
    typeof s.basePower !== 'number' ||
    !Number.isFinite(s.basePower) ||
    typeof s.lastTick !== 'number' ||
    !Number.isFinite(s.lastTick)
  ) {
    console.warn('[save] state 필수 수치 필드가 유효하지 않습니다 — 무시합니다.')
    return null
  }

  // v1엔 각성 필드가 없다 → lifetimeMana는 mana로 보수적 초기화, stardust/totalPrestiges는 0.
  // v2 이상은 저장된 값을 검증해 채택(누락·손상 시 동일 fallback).
  const isV2Plus = raw.version >= 2
  const lifetimeMana = isV2Plus ? normalizeNonNeg(s.lifetimeMana, s.mana) : s.mana
  const stardust = isV2Plus ? normalizeNonNeg(s.stardust, 0) : 0
  const totalPrestiges = isV2Plus ? normalizeNonNeg(s.totalPrestiges, 0) : 0

  return {
    version: SAVE_VERSION,
    savedAt: raw.savedAt,
    state: {
      mana: s.mana,
      basePower: s.basePower,
      generators: normalizeGenerators(s.generators),
      upgrades: normalizeUpgrades(s.upgrades),
      lastTick: s.lastTick,
      buyAmount: normalizeBuyAmount(s.buyAmount),
      lifetimeMana,
      stardust,
      totalPrestiges,
    },
  }
}

// --- localStorage ---
export function saveToLocal(state: SaveState, now?: number): void {
  try {
    localStorage.setItem(SAVE_KEY, serialize(state, now))
  } catch {
    console.warn('[save] localStorage 저장 실패(용량/권한).')
  }
}

export function loadFromLocal(): SaveData | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(SAVE_KEY)
  } catch {
    console.warn('[save] localStorage 접근 실패.')
    return null
  }
  if (raw === null) return null
  return deserialize(raw)
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    console.warn('[save] localStorage 삭제 실패.')
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
    console.warn('[save] Base64 디코드 실패 — 잘못된 백업 문자열.')
    return null
  }
  return deserialize(json)
}
