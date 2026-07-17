import { describe, it, expect } from 'vitest'
import { formatNumber } from './format.ts'

describe('formatNumber', () => {
  it('1000 미만 정수는 그대로 표시', () => {
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(1)).toBe('1')
    expect(formatNumber(42)).toBe('42')
    expect(formatNumber(999)).toBe('999')
  })

  it('1000 미만 소수는 최대 1자리', () => {
    expect(formatNumber(0.1)).toBe('0.1')
    expect(formatNumber(12.34)).toBe('12.3')
    expect(formatNumber(12.0)).toBe('12')
  })

  it('경계값 1000 = 1.00K', () => {
    expect(formatNumber(1000)).toBe('1.00K')
  })

  it('1234 → 1.23K (DoD)', () => {
    expect(formatNumber(1234)).toBe('1.23K')
  })

  it('유효숫자 3자리 유지 (K 구간)', () => {
    expect(formatNumber(12345)).toBe('12.3K')
    expect(formatNumber(123456)).toBe('123K')
  })

  it('K/M/B/T 접미사', () => {
    expect(formatNumber(1e6)).toBe('1.00M')
    expect(formatNumber(1e9)).toBe('1.00B')
    expect(formatNumber(1e12)).toBe('1.00T')
    expect(formatNumber(2.5e6)).toBe('2.50M')
  })

  it('1e15 이상은 aa 계열로 확장', () => {
    expect(formatNumber(1e15)).toBe('1.00aa')
    expect(formatNumber(1e18)).toBe('1.00ab')
    expect(formatNumber(1e21)).toBe('1.00ac')
  })

  it('aa 계열도 유효숫자 3자리', () => {
    expect(formatNumber(1.234e15)).toBe('1.23aa')
    expect(formatNumber(1.234e16)).toBe('12.3aa')
  })

  it('반올림 올림으로 tier가 넘어가는 경계 보정', () => {
    expect(formatNumber(999999)).toBe('1.00M')
    expect(formatNumber(999999999)).toBe('1.00B')
  })

  it('음수는 부호 유지', () => {
    expect(formatNumber(-42)).toBe('-42')
    expect(formatNumber(-1234)).toBe('-1.23K')
    expect(formatNumber(-1e6)).toBe('-1.00M')
  })

  it('NaN / Infinity 안전 처리', () => {
    expect(formatNumber(NaN)).toBe('0')
    expect(formatNumber(Infinity)).toBe('∞')
    expect(formatNumber(-Infinity)).toBe('-∞')
  })

  it('알파벳 접미사가 aa 너머로 진행 (az → ba 경계)', () => {
    // tier5=aa(letterIndex 0). tier10 → letterIndex 5 → "af".
    expect(formatNumber(1e30)).toBe('1.00af')
    // letterIndex 25 → "az"(tier30, 1e90), 26 → "ba"(tier31, 1e93).
    expect(formatNumber(1e90)).toBe('1.00az')
    expect(formatNumber(1e93)).toBe('1.00ba')
  })
})
