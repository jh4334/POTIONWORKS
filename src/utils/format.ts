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

export function formatNumber(n: number): string {
  // 안전 처리: NaN / ±Infinity 는 표시용 기호로.
  if (Number.isNaN(n)) return '0'
  if (n === Infinity) return '∞'
  if (n === -Infinity) return '-∞'
  if (n === 0) return '0'

  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)

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
