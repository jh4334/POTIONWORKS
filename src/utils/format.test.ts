import { describe, it, expect } from 'vitest'
import { formatNumber, setNotation } from './format.ts'

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

describe('formatNumber notation (E-3.3)', () => {
  it("comma 인자: 천 단위 구분(1e15 미만)", () => {
    expect(formatNumber(1234, 'comma')).toBe('1,234')
    expect(formatNumber(1_000_000, 'comma')).toBe('1,000,000')
    expect(formatNumber(999, 'comma')).toBe('999')
    expect(formatNumber(0, 'comma')).toBe('0')
  })

  it('comma: 1000 미만 소수는 1자리, 그 이상은 정수 자리만', () => {
    expect(formatNumber(12.34, 'comma')).toBe('12.3')
    expect(formatNumber(1234.5, 'comma')).toBe('1,235') // 1000 이상 → 정수(반올림)
  })

  it('comma: 1e15 이상은 suffix로 폴백(하이브리드)', () => {
    expect(formatNumber(1e15, 'comma')).toBe('1.00aa')
    expect(formatNumber(1e18, 'comma')).toBe('1.00ab')
  })

  it('comma: 음수·비유한 안전 처리', () => {
    expect(formatNumber(-1234, 'comma')).toBe('-1,234')
    expect(formatNumber(NaN, 'comma')).toBe('0')
    expect(formatNumber(Infinity, 'comma')).toBe('∞')
  })

  it('setNotation: 인자 없는 호출의 기본 표기를 바꾼다(모듈 전역)', () => {
    setNotation('comma')
    expect(formatNumber(1_234_567)).toBe('1,234,567')
    setNotation('suffix')
    expect(formatNumber(1_234_567)).toBe('1.23M')
  })

  it('명시 인자는 모듈 전역보다 우선', () => {
    setNotation('comma')
    expect(formatNumber(1234, 'suffix')).toBe('1.23K')
    setNotation('suffix') // 다른 테스트에 영향 없게 복원
  })
})
