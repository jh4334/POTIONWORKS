import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { migrateLegacySlot, slotKey, activeSlot, setActiveSlot } from './save.ts'
import { listSlots, deleteSlot } from './slots.ts'
import { SAVE_KEY, SAVE_CORRUPT_KEY, ACTIVE_SLOT_KEY } from '../data/config.ts'

// 인메모리 localStorage 스텁(node 환경엔 localStorage가 없다).
function installLocalStorage(): void {
  const map = new Map<string, string>()
  const stub = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: stub,
    configurable: true,
    writable: true,
  })
}

// listSlots 요약 검증용 raw 세이브 JSON(migrate가 정규화해 읽는다).
function rawSave(savedAt: number, totalLifetimeMana: number, playtimeMs: number): string {
  return JSON.stringify({
    version: 10,
    savedAt,
    state: {
      mana: 0,
      basePower: 1,
      lastTick: savedAt,
      buyAmount: 1,
      totalLifetimeMana,
      playtimeMs,
    },
  })
}

describe('세이브 슬롯 (E-3.2)', () => {
  beforeEach(() => installLocalStorage())
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage
  })

  it('활성 슬롯: 기본 1, setActiveSlot으로 바뀌고 범위 밖은 무시', () => {
    expect(activeSlot()).toBe(1)
    setActiveSlot(2)
    expect(activeSlot()).toBe(2)
    expect(localStorage.getItem(ACTIVE_SLOT_KEY)).toBe('2')
    setActiveSlot(99) // 범위 밖 → 무시(이전 값 유지)
    expect(activeSlot()).toBe(2)
  })

  it('migrateLegacySlot: 기존 단일 세이브를 슬롯 1로 무손실 이전하고 기존 키 제거', () => {
    localStorage.setItem(SAVE_KEY, 'legacy-save-blob')
    migrateLegacySlot()
    expect(localStorage.getItem(slotKey(1))).toBe('legacy-save-blob') // 슬롯 1로 복사
    expect(localStorage.getItem(SAVE_KEY)).toBeNull() // 기존 키 제거
  })

  it('migrateLegacySlot: 슬롯 1이 이미 있으면 덮어쓰지 않는다(데이터 손실 금지)', () => {
    localStorage.setItem(slotKey(1), 'existing-slot1')
    localStorage.setItem(SAVE_KEY, 'legacy-save-blob')
    migrateLegacySlot()
    expect(localStorage.getItem(slotKey(1))).toBe('existing-slot1') // 보존
    expect(localStorage.getItem(SAVE_KEY)).toBeNull() // 그래도 기존 키는 정리
  })

  it('migrateLegacySlot: 손상 백업 키도 함께 이전', () => {
    localStorage.setItem(SAVE_KEY, 'legacy')
    localStorage.setItem(SAVE_CORRUPT_KEY, 'legacy-corrupt')
    migrateLegacySlot()
    expect(localStorage.getItem(`${slotKey(1)}-corrupt`)).toBe('legacy-corrupt')
    expect(localStorage.getItem(SAVE_CORRUPT_KEY)).toBeNull()
  })

  it('migrateLegacySlot: 기존 세이브 없으면 no-op', () => {
    migrateLegacySlot()
    expect(localStorage.getItem(slotKey(1))).toBeNull()
  })

  it('listSlots: 빈 슬롯/있는 슬롯 요약(savedAt·누적 마나·플레이 시간)', () => {
    localStorage.setItem(slotKey(2), rawSave(123456, 5000, 60000))
    const slots = listSlots()
    expect(slots).toHaveLength(3)
    expect(slots[0]).toMatchObject({ slot: 1, exists: false })
    expect(slots[1]).toMatchObject({
      slot: 2,
      exists: true,
      savedAt: 123456,
      totalLifetimeMana: 5000,
      playtimeMs: 60000,
    })
    expect(slots[2]).toMatchObject({ slot: 3, exists: false })
  })

  it('listSlots: 손상 슬롯은 exists=true이되 요약은 null/0', () => {
    localStorage.setItem(slotKey(1), '{broken json')
    const slots = listSlots()
    expect(slots[0]).toMatchObject({ slot: 1, exists: true, savedAt: null })
  })

  it('deleteSlot: 세이브 + 손상 백업 키를 함께 제거', () => {
    localStorage.setItem(slotKey(3), rawSave(1, 1, 1))
    localStorage.setItem(`${slotKey(3)}-corrupt`, 'x')
    deleteSlot(3)
    expect(localStorage.getItem(slotKey(3))).toBeNull()
    expect(localStorage.getItem(`${slotKey(3)}-corrupt`)).toBeNull()
  })
})
