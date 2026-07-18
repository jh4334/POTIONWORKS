// 큰 수 표시 포맷터. DESIGN.md §2.2: 1,234 → 1.23K → 1.23M → 1.23B → 1.23T → 1.23aa …
// 순수 함수 — 단위 테스트(format.test.ts)로 경계값을 고정한다.

// tier(3자리수 그룹) 별 접미사. index = tier: tier1=K, tier2=M, tier3=B, tier4=T.
// tier5 이상은 두 글자 이상의 알파벳 조합(aa, ab, …, zz, aaa, …)으로 무한 확장.
const SHORT_SUFFIXES = ['', 'K', 'M', 'B', 'T'] as const

// letterIndex 0 → "aa", 1 → "ab", … 25 → "az", 26 → "ba", … 675 → "zz", 676 → "aaa" …
// 최소 2글자에서 시작해 26진법 블록을 넘어가면 글자 수를 늘린다(무한 확장).
function letterSuffix(letterIndex: number): string {
  let length = 2
  let idx = letterIndex
  while (idx >= 26 ** length) {
    idx -= 26 ** length
    length += 1
  }
  let result = ''
  for (let d = 0; d < length; d += 1) {
    result = String.fromCharCode(97 + (idx % 26)) + result
    idx = Math.floor(idx / 26)
  }
  return result
}

function tierSuffix(tier: number): string {
  if (tier < SHORT_SUFFIXES.length) return SHORT_SUFFIXES[tier]
  return letterSuffix(tier - SHORT_SUFFIXES.length)
}

// mantissa(∈ [1, 1000))를 유효숫자 3자리로: 1.23 / 12.3 / 123
function mantissaDecimals(mantissa: number): number {
  if (mantissa < 10) return 2
  if (mantissa < 100) return 1
  return 0
}

// 숫자 표기 방식(E-3.3). 'suffix'=1.23M(기본), 'comma'=1,230,000. 컴포넌트들이 formatNumber를
// 인자 없이 직접 호출하므로, 모듈 전역 현재 표기를 두고 App이 스토어 값으로 setNotation 동기화한다
// (스토어 구독과 분리된 표시 설정). 순수 함수 성격은 유지: notation을 명시적으로 넘기면 그 값을 쓴다.
export type NumberNotation = 'suffix' | 'comma'
let currentNotation: NumberNotation = 'suffix'
export function setNotation(n: NumberNotation): void {
  currentNotation = n
}

// comma 표기 상한. 이 이상은 자릿수가 과해 읽기 어려우므로 suffix로 폴백한다(하이브리드).
const COMMA_MAX = 1e15

// comma 표기: toLocaleString(en-US). 1000 미만 소수는 1자리, 그 이상은 정수 자리만.
function formatComma(sign: string, abs: number): string {
  const maximumFractionDigits = abs < 1000 && !Number.isInteger(abs) ? 1 : 0
  return sign + abs.toLocaleString('en-US', { maximumFractionDigits })
}

export function formatNumber(n: number, notation: NumberNotation = currentNotation): string {
  // 안전 처리: NaN / ±Infinity 는 표시용 기호로.
  if (Number.isNaN(n)) return '0'
  if (n === Infinity) return '∞'
  if (n === -Infinity) return '-∞'
  if (n === 0) return '0'

  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)

  // comma 표기(1e15 미만): 천 단위 구분. 1e15 이상은 suffix로 폴백해 자릿수 폭주를 막는다.
  if (notation === 'comma' && abs < COMMA_MAX) return formatComma(sign, abs)

  // 1000 미만: 정수는 그대로, 소수는 최대 1자리.
  if (abs < 1000) {
    if (Number.isInteger(abs)) return sign + abs.toString()
    const rounded = Math.round(abs * 10) / 10
    if (Number.isInteger(rounded)) return sign + rounded.toString()
    return sign + rounded.toFixed(1)
  }

  // 3자리수 그룹 tier. log10 부동소수 오차는 아래 보정 루프가 흡수한다.
  let tier = Math.floor(Math.log10(abs) / 3)
  if (tier < 1) tier = 1
  let mantissa = abs / 1000 ** tier
  while (mantissa >= 1000) {
    tier += 1
    mantissa = abs / 1000 ** tier
  }
  while (mantissa < 1 && tier > 1) {
    tier -= 1
    mantissa = abs / 1000 ** tier
  }

  let str = mantissa.toFixed(mantissaDecimals(mantissa))
  // 반올림 올림(예: 999.9 → "1000")으로 다음 tier로 넘어가는 경우 보정.
  if (parseFloat(str) >= 1000) {
    tier += 1
    mantissa = abs / 1000 ** tier
    str = mantissa.toFixed(mantissaDecimals(mantissa))
  }

  return sign + str + tierSuffix(tier)
}
