import { describe, it, expect } from 'vitest'
import { offlineEarnings } from './offline.ts'
import { OFFLINE_CAP_MS, OFFLINE_EFFICIENCY } from '../data/config.ts'

describe('offlineEarnings', () => {
  it('경과 × mps × 50% (캡 미만)', () => {
    // 100초 × 10 mps × 0.5 = 500
    expect(offlineEarnings(100_000, 10)).toBeCloseTo(100 * 10 * OFFLINE_EFFICIENCY)
    expect(offlineEarnings(100_000, 10)).toBeCloseTo(500)
  })

  it('8시간 초과는 8시간으로 캡', () => {
    const mps = 10
    const capped = (OFFLINE_CAP_MS / 1000) * mps * OFFLINE_EFFICIENCY
    // 24시간을 넣어도 8시간치만 지급.
    expect(offlineEarnings(24 * 60 * 60 * 1000, mps)).toBeCloseTo(capped)
    // 정확히 캡 경계도 동일.
    expect(offlineEarnings(OFFLINE_CAP_MS, mps)).toBeCloseTo(capped)
  })

  it('효율은 50% — 100% 대비 절반', () => {
    const full = 3600 * 10 // 1시간 100% 기준(초 × mps)
    expect(offlineEarnings(3600_000, 10)).toBeCloseTo(full * 0.5)
  })

  it('0 또는 음수 경과는 0 (시계 역행 안전)', () => {
    expect(offlineEarnings(0, 10)).toBe(0)
    expect(offlineEarnings(-5000, 10)).toBe(0)
  })

  it('mps가 0 또는 음수면 0', () => {
    expect(offlineEarnings(100_000, 0)).toBe(0)
    expect(offlineEarnings(100_000, -3)).toBe(0)
  })
})
