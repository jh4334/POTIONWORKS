// 게임 수식 — 순수 함수만. 규칙(CLAUDE.md): 스토어/React import 금지, 단위 테스트 유지.
// 비용 곡선 버그는 세이브를 오염시키므로 formulas.test.ts로 경계값을 고정한다.
import { COST_GROWTH, type GeneratorDef } from '../data/generators.ts'
import type { UpgradeDef } from '../data/upgrades.ts'
import type { PotionDef } from '../data/potions.ts'
import type { AchievementDef } from '../data/achievements.ts'
import {
  ACHIEVEMENT_MULT_PER,
  PRESTIGE_THRESHOLD,
  STARDUST_MULT_PER,
  FIRST_PRESTIGE_BONUS,
  OFFLINE_EFFICIENCY,
  OFFLINE_CAP_MS,
} from '../data/config.ts'
import {
  STARDUST_UPGRADES,
  STARDUST_COST_GROWTH,
  type StardustUpgradeDef,
} from '../data/stardustShop.ts'
import type { ChallengeDef } from '../data/challenges.ts'

// ceil 정책: 비용은 항상 정수로 올림한다(표시·구매 동일 값).
// 단건 구매 가격 = baseCost × 1.15^보유수.
export function generatorCost(baseCost: number, owned: number): number {
  return Math.ceil(baseCost * COST_GROWTH ** owned)
}

// count개 일괄 구매 총액. 등비수열 합 공식으로 계산한 뒤 한 번만 ceil.
//   Σ_{i=0}^{count-1} baseCost·r^(owned+i) = baseCost·r^owned·(r^count − 1)/(r − 1)
// (개별 가격을 각각 ceil해 더한 값과는 최대 count-1만큼 차이날 수 있으나,
//  "raw 합을 한 번 ceil"을 기준으로 삼아 구매·표시·검산을 모두 일관되게 맞춘다.)
// count===1은 generatorCost로 단락 — 등비합의 부동소수 오차로 표시·구매가 1 어긋나는 경계(~2e15+)를 없앤다.
export function bulkCost(baseCost: number, owned: number, count: number): number {
  if (count <= 0) return 0
  if (count === 1) return generatorCost(baseCost, owned)
  const r = COST_GROWTH
  const raw = (baseCost * r ** owned * (r ** count - 1)) / (r - 1)
  return Math.ceil(raw)
}

// maxAffordable n 상한: 비용이 Number.MAX_VALUE를 넘어서는 지점(log_r(MAX) ≈ 5079).
// 그 이상은 어차피 bulkCost가 Infinity라 살 수 없으므로, 검산 루프의 무한 반복을 막는 안전 상한이다.
const MAX_AFFORDABLE_N = Math.floor(Math.log(Number.MAX_VALUE) / Math.log(COST_GROWTH))

// 현재 마나로 살 수 있는 최대 개수. 로그 공식으로 근사한 뒤 검산으로 ±오차 보정.
//   mana ≥ baseCost·r^owned·(r^n − 1)/(r − 1)  를 n에 대해 풀면
//   n ≤ log_r( 1 + mana·(r−1)/(baseCost·r^owned) )
export function maxAffordable(baseCost: number, owned: number, mana: number): number {
  const r = COST_GROWTH
  // 비유한 마나(Infinity/NaN)는 0 — 검산 루프 무한 반복(UI 프리즈) 차단.
  if (!Number.isFinite(mana)) return 0
  // 1개도 못 사면 즉시 0. bulkCost 기준으로 통일(1개-구매 가드가 실제 구매값과 어긋나지 않게).
  if (mana < bulkCost(baseCost, owned, 1)) return 0

  const ratio = (mana * (r - 1)) / (baseCost * r ** owned) + 1
  let n = Math.floor(Math.log(ratio) / Math.log(r))
  if (n < 0) n = 0
  if (n > MAX_AFFORDABLE_N) n = MAX_AFFORDABLE_N

  // 검산 보정: ceil로 인한 오차를 실제 bulkCost로 정확히 맞춘다(상한 안에서만).
  while (n < MAX_AFFORDABLE_N && bulkCost(baseCost, owned, n + 1) <= mana) n += 1
  while (n > 0 && bulkCost(baseCost, owned, n) > mana) n -= 1
  return n
}

// 특정 티어의 생산 배율. 구매된 업그레이드에서:
//   - generatorMult(×2 마일스톤): 곱으로 누적
//   - synergy: (1 + sourceCount × percentPerSource/100) 곱
// 다른 티어를 대상으로 한 효과는 무시한다.
// (E-2.1) stardustLevels가 있으면 생산 트리(별의 축복)의 티어별 배율(×mult^레벨)도 곱한다 —
//   업그레이드 배율과 동일 경로라 헤더 MPS·개당 실효값·구매 델타가 모두 일관되게 반영된다.
export function generatorMultiplier(
  generatorId: string,
  purchasedUpgrades: UpgradeDef[],
  counts: Record<string, number>,
  stardustLevels: Record<string, number> = {},
): number {
  let mult = 1
  for (const u of purchasedUpgrades) {
    const e = u.effect
    // exhaustive switch(D-5.1): 새 UpgradeEffect kind 추가 시 default의 never 대입이 컴파일 에러를 낸다.
    switch (e.kind) {
      case 'generatorMult':
        if (e.generatorId === generatorId) mult *= e.mult
        break
      case 'synergy':
        if (e.targetId === generatorId) {
          const sourceCount = counts[e.sourceId] ?? 0
          mult *= 1 + (sourceCount * e.percentPerSource) / 100
        }
        break
      case 'clickMpsPercent':
        break // 클릭 전용 효과 — 티어 배율과 무관.
      default: {
        const _exhaustive: never = e
        void _exhaustive
      }
    }
  }
  return mult * stardustGeneratorMult(generatorId, stardustLevels)
}

// 생산 트리(별의 축복, E-2.1)의 특정 티어 배율 = Π(mult^레벨). 상점 레벨 맵을 받는 순수 함수.
// 시설 참조는 데이터(effect.generatorId)로 하고 clampLevel로 손상 세이브를 방어한다.
export function stardustGeneratorMult(
  generatorId: string,
  levels: Record<string, number>,
): number {
  let mult = 1
  for (const def of STARDUST_UPGRADES) {
    const e = def.effect
    if (e.kind === 'generatorMult' && e.generatorId === generatorId) {
      mult *= e.mult ** clampLevel(def, levels[def.id] ?? 0)
    }
  }
  return mult
}

// 자동화(공방 관리인, E-2.1) 레벨(0~maxLevel). 오프라인 자동 구매 단계 판정에 쓴다.
export function automationLevel(levels: Record<string, number>): number {
  for (const def of STARDUST_UPGRADES) {
    if (def.effect.kind === 'automation') return clampLevel(def, levels[def.id] ?? 0)
  }
  return 0
}

// 전체 MPS = Σ (보유수 × 개당 baseMps × 티어 배율) × 전체 배율.
// purchasedUpgrades 미지정(기본 [])이면 배율 1 — 업그레이드 없을 때 기존 값과 동일.
// globalMult 미지정(기본 1)이면 전체 배율 없음 — 스타더스트·업적 배율을 곱한 값(recalcDerived에서 합성)을
//   전체에 한 번만 곱한다. 개별 시설이 아니라 합산 후 곱해야 배율 의미가 일관된다.
export function totalMps(
  counts: Record<string, number>,
  generators: readonly GeneratorDef[],
  purchasedUpgrades: UpgradeDef[] = [],
  globalMult: number = 1,
  stardustLevels: Record<string, number> = {},
): number {
  let total = 0
  for (const g of generators) {
    total +=
      (counts[g.id] ?? 0) * g.baseMps * generatorMultiplier(g.id, purchasedUpgrades, counts, stardustLevels)
  }
  return total * globalMult
}

// 개당 실효 생산 = baseMps × 티어 배율 × 전체 배율(스타더스트×업적).
// GeneratorRow의 "개당 X/s" 실효값 표시에 쓴다. 순수 함수라 generators/upgrades/stardust/업적에만
// 의존하고 tick(마나)에는 불변 — 셀렉터에서 호출해도 tick마다 리렌더를 유발하지 않는다.
export function effectiveGeneratorMps(
  def: GeneratorDef,
  purchasedUpgrades: UpgradeDef[],
  counts: Record<string, number>,
  globalMult: number = 1,
  stardustLevels: Record<string, number> = {},
): number {
  return (
    def.baseMps * generatorMultiplier(def.id, purchasedUpgrades, counts, stardustLevels) * globalMult
  )
}

// count개 추가 구매 시 전체 MPS 증가분(델타). 시너지(다른 티어 배율 변화)까지 정확히 반영하기 위해
// 구매 전후 totalMps 차를 그대로 돌려준다. 순수 함수(마나 불변 — 셀렉터에서 안전).
export function mpsDelta(
  generatorId: string,
  addCount: number,
  counts: Record<string, number>,
  generators: readonly GeneratorDef[],
  purchasedUpgrades: UpgradeDef[] = [],
  globalMult: number = 1,
  stardustLevels: Record<string, number> = {},
): number {
  const before = totalMps(counts, generators, purchasedUpgrades, globalMult, stardustLevels)
  const after = totalMps(
    { ...counts, [generatorId]: (counts[generatorId] ?? 0) + addCount },
    generators,
    purchasedUpgrades,
    globalMult,
    stardustLevels,
  )
  return after - before
}

// 각성 보상: 이번 생 누적 마나로 얻는 스타더스트 = floor(sqrt(누적 마나 / 임계값)).
// 임계 미만이면 0(sqrt<1의 floor). 정확히 임계면 1, 4배면 2, 9배면 3 …
export function stardustFor(lifetimeMana: number): number {
  if (!Number.isFinite(lifetimeMana)) return 0 // NaN/Infinity 방어(NaN은 아래 비교를 통과해버림)
  if (lifetimeMana < PRESTIGE_THRESHOLD) return 0
  return Math.floor(Math.sqrt(lifetimeMana / PRESTIGE_THRESHOLD))
}

// 각성으로 다음 정수(현재 n → n+1) 스타더스트를 얻는 데 필요한 누적 마나 = (n+1)² × 임계값.
// stardustFor의 역산 — 각성 패널의 "다음 +1까지 Y" 상시 표시에 쓴다(D-3.2).
// 비유한/임계 미만이면 n=0 → 1²×임계(첫 스타더스트 도달점)를 돌려준다.
export function nextStardustAt(lifetimeMana: number): number {
  const n = stardustFor(lifetimeMana)
  return (n + 1) * (n + 1) * PRESTIGE_THRESHOLD
}

// 지금 각성 시 실제로 얻는 스타더스트 = stardustFor + (첫 각성이면 첫 각성 보너스).
// 미리보기·실행이 같은 값을 쓰도록 순수 함수로 둔다(D-3.2).
export function prestigeGain(lifetimeMana: number, totalPrestiges: number): number {
  const base = stardustFor(lifetimeMana)
  if (base <= 0) return 0
  return base + (totalPrestiges === 0 ? FIRST_PRESTIGE_BONUS : 0)
}

// 스타더스트 영구 배율 = 1 + stardust × 개당 증가분. 0개면 1.0(배율 없음).
export function stardustMultiplier(stardust: number): number {
  return 1 + stardust * STARDUST_MULT_PER
}

// 업적 배율 = 1 + 달성수 × 개당 증가분. 0개면 1.0(배율 없음).
// 전체 MPS에 스타더스트 배율과 함께 곱해진다(recalcDerived에서 합성).
export function achievementMultiplier(count: number): number {
  return 1 + count * ACHIEVEMENT_MULT_PER
}

// 전체 생산 배율의 합성(D-5.2). 스타더스트 배율 × 업적 배율 × 버프 배율을 한 곳에서 곱한다.
// 배율 소스가 늘어나면(신규 이벤트·매니저 등) 이 함수만 고치면 되도록 합성 지점을 일원화한다.
// recalcDerived(스토어)가 이 값을 globalMult로 받아 totalMps·clickPower에 반영한다.
export interface GlobalMultContext {
  stardust: number
  achievementCount: number
  buffMult?: number // 활성 버프 배율(없으면 1).
  challengeMult?: number // 완료 챌린지 영구 배율(없으면 1, E-2.2).
}

export function composeGlobalMult({
  stardust,
  achievementCount,
  buffMult = 1,
  challengeMult = 1,
}: GlobalMultContext): number {
  return (
    stardustMultiplier(stardust) * achievementMultiplier(achievementCount) * buffMult * challengeMult
  )
}

// 완료 챌린지 영구 생산 배율 = 1 + Σ(완료 챌린지 reward) (E-2.2). 순수 함수.
// defs를 인자로 받아 데이터 결합을 호출부(store)로 넘긴다 — 순환 import 없이 데이터 변경에 함께 검증된다.
// 미지/미완료 id는 무시하고, 완료 id의 reward만 합산한다(중복 완료는 완료 목록이 중복을 막으므로 무관).
export function challengeMultiplier(completedIds: string[], defs: ChallengeDef[]): number {
  const owned = new Set(completedIds)
  let bonus = 0
  for (const def of defs) {
    if (owned.has(def.id)) bonus += def.reward
  }
  return 1 + bonus
}

// 업적 달성 판정에 필요한 통계 스냅샷(순수 함수 입력).
// E-1.3에서 조건 종류가 늘며 필드가 확장됐다 — 모든 조건 kind가 여기서 값을 읽는다(exhaustive switch로 강제).
export interface AchievementStats {
  totalClicks: number
  generators: Record<string, number>
  totalLifetimeMana: number
  totalPrestiges: number
  mps: number
  stardust: number // 현재 보유 스타더스트
  playtimeMs: number // 총 플레이 시간(ms)
  meteorsClicked: number // 골든 이벤트 클릭 누적
  prestigeCancels: number // 각성 확인 취소 누적(숨김)
  mutedPlaytimeMs: number // 음소거 중 플레이 시간(ms, 숨김)
  clickCombo: number // 현재 클릭 콤보(숨김)
  dragonVisits: number // 드래곤 방문 누적(숨김)
}

// 업적 달성 여부(순수). 조건 종류별로 통계와 비교한다.
// exhaustive switch(D-5.1): 새 AchievementCondition kind 추가 시 컴파일 에러로 누락을 잡는다.
export function isAchievementUnlocked(def: AchievementDef, stats: AchievementStats): boolean {
  return achievementCurrent(def, stats) >= def.condition.min
}

// 잠긴 업적의 현재 진행값(조건 종류별 통계 스냅샷에서 파생). 목표값은 def.condition.min.
// AchievementsModal의 "723 / 1.00K" 진행도·진행 바에 쓰는 순수 함수.
// isAchievementUnlocked도 이 값을 min과 비교하므로, 조건 kind 추가는 이 한 곳만 확장하면 된다.
export function achievementCurrent(def: AchievementDef, stats: AchievementStats): number {
  const c = def.condition
  switch (c.kind) {
    case 'clicks':
      return stats.totalClicks
    case 'generatorCount':
      return stats.generators[c.generatorId] ?? 0
    case 'lifetimeMana':
      return stats.totalLifetimeMana
    case 'prestiges':
      return stats.totalPrestiges
    case 'mps':
      return stats.mps
    case 'stardust':
      return stats.stardust
    case 'playtime':
      return stats.playtimeMs
    case 'meteorsClicked':
      return stats.meteorsClicked
    case 'prestigeCancels':
      return stats.prestigeCancels
    case 'mutedPlaytime':
      return stats.mutedPlaytimeMs
    case 'clickCombo':
      return stats.clickCombo
    case 'dragonVisits':
      return stats.dragonVisits
    default: {
      const _exhaustive: never = c
      void _exhaustive
      return 0
    }
  }
}

// 클릭당 획득량 = (기본 클릭력 + MPS × (clickMpsPercent 합 / 100)) × 클릭 버프 배율.
// 업그레이드가 없으면 basePower 그대로. extraPercent는 업그레이드 외 clickMps 퍼센트 합
// (상점 '공명 증폭' 등) — 기존 업그레이드 퍼센트와 동일 경로에 합류시킨다(D-3.1).
// buffMult(E-1.4 마나 폭풍)는 최종 클릭 파워에 곱하는 클릭 버프 배율 — 생산(MPS) 배율과 별개 경로다
//   (생산 버프는 mps에 이미 반영돼 들어오고, 클릭 버프는 여기서 최종값에 곱한다). 미지정=1(버프 없음).
export function clickPower(
  basePower: number,
  mps: number,
  purchasedUpgrades: UpgradeDef[] = [],
  extraPercent: number = 0,
  buffMult: number = 1,
): number {
  let percent = extraPercent
  for (const u of purchasedUpgrades) {
    const e = u.effect
    // exhaustive switch(D-5.1): 새 UpgradeEffect kind 추가 시 default의 never 대입이 컴파일 에러를 낸다.
    switch (e.kind) {
      case 'clickMpsPercent':
        percent += e.percent
        break
      case 'generatorMult':
      case 'synergy':
        break // 클릭과 무관 — 생산 배율 전용.
      default: {
        const _exhaustive: never = e
        void _exhaustive
      }
    }
  }
  return (basePower + (mps * percent) / 100) * buffMult
}

// --- 스타더스트 상점 (D-3.1) ---
// 상점 레벨은 maxLevel까지만 유효 — 순수 함수가 손상 세이브(초과 레벨)에도 정직하도록 방어 클램프.
function clampLevel(def: StardustUpgradeDef, level: number): number {
  const lv = typeof level === 'number' && Number.isFinite(level) && level > 0 ? Math.floor(level) : 0
  return def.maxLevel === null ? lv : Math.min(lv, def.maxLevel)
}

// 레벨 N에서 다음(N→N+1) 구매 비용 = baseCost × 2^N (정수). 레벨이 오를수록 두 배씩.
export function stardustUpgradeCost(def: StardustUpgradeDef, level: number): number {
  const lv = Number.isFinite(level) && level > 0 ? Math.floor(level) : 0
  return Math.ceil(def.baseCost * STARDUST_COST_GROWTH ** lv)
}

// 상점 '공명 증폭' 등 clickMpsPercent 효과의 레벨 합 퍼센트. clickPower의 extraPercent로 넘긴다.
export function stardustClickPercent(levels: Record<string, number>): number {
  let percent = 0
  for (const def of STARDUST_UPGRADES) {
    const e = def.effect
    // exhaustive switch(D-5.1): 새 StardustEffect kind 추가 시 default의 never 대입이 컴파일 에러를 낸다.
    switch (e.kind) {
      case 'clickMpsPercent':
        percent += clampLevel(def, levels[def.id] ?? 0) * e.perLevel
        break
      case 'startingApprentices':
      case 'offlineEfficiency':
      case 'offlineCap':
      case 'generatorMult':
      case 'automation':
        break // 이 함수와 무관.
      default: {
        const _exhaustive: never = e
        void _exhaustive
      }
    }
  }
  return percent
}

// 각성 시 보유하고 시작할 견습생 수 = Σ(레벨 × perLevel). 상점 '견습 마법사단' 반영.
export function startingApprentices(levels: Record<string, number>): number {
  let total = 0
  for (const def of STARDUST_UPGRADES) {
    const e = def.effect
    // exhaustive switch(D-5.1): 새 StardustEffect kind 추가 시 default의 never 대입이 컴파일 에러를 낸다.
    switch (e.kind) {
      case 'startingApprentices':
        total += clampLevel(def, levels[def.id] ?? 0) * e.perLevel
        break
      case 'clickMpsPercent':
      case 'offlineEfficiency':
      case 'offlineCap':
      case 'generatorMult':
      case 'automation':
        break // 이 함수와 무관.
      default: {
        const _exhaustive: never = e
        void _exhaustive
      }
    }
  }
  return total
}

// 실효 오프라인 효율 = 기본(config) + Σ(레벨 × perLevel). 상점 '꿈꾸는 솥' 반영.
// base는 호출부/테스트에서 주입 가능하되 기본은 config 상수(formulas의 config import 패턴).
export function effectiveOfflineEfficiency(
  levels: Record<string, number>,
  base: number = OFFLINE_EFFICIENCY,
): number {
  let eff = base
  for (const def of STARDUST_UPGRADES) {
    const e = def.effect
    // exhaustive switch(D-5.1): 새 StardustEffect kind 추가 시 default의 never 대입이 컴파일 에러를 낸다.
    switch (e.kind) {
      case 'offlineEfficiency':
        eff += clampLevel(def, levels[def.id] ?? 0) * e.perLevel
        break
      case 'startingApprentices':
      case 'clickMpsPercent':
      case 'offlineCap':
      case 'generatorMult':
      case 'automation':
        break // 이 함수와 무관.
      default: {
        const _exhaustive: never = e
        void _exhaustive
      }
    }
  }
  return eff
}

// 실효 오프라인 캡(ms) = 기본(config) + Σ(레벨 × perLevelMs). 상점 '시간의 모래' 반영.
export function effectiveOfflineCapMs(
  levels: Record<string, number>,
  base: number = OFFLINE_CAP_MS,
): number {
  let cap = base
  for (const def of STARDUST_UPGRADES) {
    const e = def.effect
    // exhaustive switch(D-5.1): 새 StardustEffect kind 추가 시 default의 never 대입이 컴파일 에러를 낸다.
    switch (e.kind) {
      case 'offlineCap':
        cap += clampLevel(def, levels[def.id] ?? 0) * e.perLevelMs
        break
      case 'startingApprentices':
      case 'clickMpsPercent':
      case 'offlineEfficiency':
      case 'generatorMult':
      case 'automation':
        break // 이 함수와 무관.
      default: {
        const _exhaustive: never = e
        void _exhaustive
      }
    }
  }
  return cap
}

// --- 포션 조제 (E-1.2) ---
// 조제 비용 = max(현재 MPS × costMpsSeconds, costFloor). ceil로 정수화.
// MPS가 0/음수/비유한이면 MPS분은 0으로 보고 하한만 든다(각성 직후 등 MPS≈0에서도 유의미하게).
export function potionCost(def: PotionDef, mps: number): number {
  const perMps = Number.isFinite(mps) && mps > 0 ? mps * def.costMpsSeconds : 0
  return Math.max(Math.ceil(perMps), def.costFloor)
}

// 해금 판정(순수): 전생 포함 총 누적 마나가 해금 임계 이상. 각성해도 유지되는 값이라 한 번 해금되면 유지된다.
export function isPotionUnlocked(def: PotionDef, totalLifetimeMana: number): boolean {
  return totalLifetimeMana >= def.unlockTotalMana
}

// 조제 완료 판정(순수). readyAt 시각을 지났으면 완성. 진실은 타임스탬프 — 오프라인 경과도 이 비교로 처리된다.
export function isBrewReady(brewing: { readyAt: number } | null, now: number): boolean {
  return brewing !== null && now >= brewing.readyAt
}

// 조제 남은 시간(ms, 표시용 순수 함수). 완성됐거나 조제 중 아니면 0.
export function remainingBrewMs(brewing: { readyAt: number } | null, now: number): number {
  if (brewing === null) return 0
  return Math.max(0, brewing.readyAt - now)
}

// 생산 버프 창(active/potion 공통). startsAt~endsAt 사이 mult가 곱해진다.
export interface ProductionBuffWindow {
  startsAt: number
  endsAt: number
  mult: number
}

// 생산 버프들이 [start, end] 구간에 더해 주는 추가 마나(순수, tick catch-up용).
// 여러 생산 버프(골든 'production' + 포션 'potion-production')가 공존할 때 배율은 곱으로 쌓인다 —
// 버프 창 경계마다 구간을 쪼개 각 구간의 배율 곱 M을 구하고, baseMps × (M−1) × 구간초를 100%로 더한다.
// (baseMps = 생산 버프를 모두 뺀 순수 생산율. 단일 버프면 기존 baseMps×(mult−1)×겹침초와 동일하다.)
// 버프 창은 짧아(≤ 지속시간) 겹침만큼만 더하므로, 큰 elapsed(백그라운드 복귀)에도 과지급되지 않는다.
export function productionBuffBonus(
  baseMps: number,
  start: number,
  end: number,
  buffs: ProductionBuffWindow[],
): number {
  if (!(end > start) || !(baseMps > 0) || buffs.length === 0) return 0
  // 구간 경계점: [start, end] + 각 버프의 창 경계(구간 내부에 드는 것만).
  const points = new Set<number>([start, end])
  for (const b of buffs) {
    if (b.startsAt > start && b.startsAt < end) points.add(b.startsAt)
    if (b.endsAt > start && b.endsAt < end) points.add(b.endsAt)
  }
  const sorted = [...points].sort((a, b) => a - b)
  let bonus = 0
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const segStart = sorted[i]
    const segEnd = sorted[i + 1]
    const mid = (segStart + segEnd) / 2
    let m = 1
    for (const b of buffs) if (b.startsAt <= mid && mid < b.endsAt) m *= b.mult
    if (m > 1) bonus += baseMps * (m - 1) * ((segEnd - segStart) / 1000)
  }
  return bonus
}

// 해금 조건 판정(순수). 시설 보유수 또는 총 MPS 기준.
export function isUpgradeUnlocked(
  def: UpgradeDef,
  counts: Record<string, number>,
  mps: number,
): boolean {
  const c = def.unlock
  if (c.kind === 'ownedCount') return (counts[c.generatorId] ?? 0) >= c.minOwned
  return mps >= c.minMps
}
