// 업그레이드 정의 (DESIGN.md §2.4). 규칙(CLAUDE.md): 게임 수치는 전부 data/*.
// 효과는 데이터 기술식(discriminated union) — 해석은 engine/formulas.ts 순수 함수가 담당한다.
import { GENERATORS } from './generators.ts'

// 효과: 마일스톤 배율 / 클릭 강화 / 시너지.
export type UpgradeEffect =
  // 해당 티어(generatorId) 생산 ×mult.
  | { kind: 'generatorMult'; generatorId: string; mult: number }
  // 클릭 = 기본 클릭 + MPS의 percent%. (여러 개 구매 시 percent 누적 합산.)
  | { kind: 'clickMpsPercent'; percent: number }
  // sourceId 1개당 targetId 생산 +percentPerSource%.
  | { kind: 'synergy'; sourceId: string; targetId: string; percentPerSource: number }

// 해금 조건: 특정 시설 보유수 이상 / 총 MPS 이상.
export type UnlockCondition =
  | { kind: 'ownedCount'; generatorId: string; minOwned: number }
  | { kind: 'totalMps'; minMps: number }

export interface UpgradeDef {
  id: string
  name: string
  desc: string
  cost: number
  unlock: UnlockCondition
  effect: UpgradeEffect
}

// 마일스톤 단계: 보유수 10/25/50에서 해금, 해당 티어 생산 ×2.
// 비용은 해당 시점 체감에 맞춰 "티어 baseCost × 배수"로 설계(DESIGN.md §2.4 계열).
const MILESTONE_STAGES: { minOwned: number; costMult: number }[] = [
  { minOwned: 10, costMult: 10 },
  { minOwned: 25, costMult: 50 },
  { minOwned: 50, costMult: 500 },
]

const MILESTONE_MULT = 2

// 6티어 × 3단계 = 18개 마일스톤 업그레이드를 data에서 파생 생성한다.
const MILESTONE_UPGRADES: UpgradeDef[] = GENERATORS.flatMap((g) =>
  MILESTONE_STAGES.map((stage) => ({
    id: `${g.id}-x2-${stage.minOwned}`,
    name: `${g.name} 숙련 ${stage.minOwned}`,
    desc: `${g.name} 생산 ×${MILESTONE_MULT}`,
    cost: Math.ceil(g.baseCost * stage.costMult),
    unlock: { kind: 'ownedCount', generatorId: g.id, minOwned: stage.minOwned },
    effect: { kind: 'generatorMult', generatorId: g.id, mult: MILESTONE_MULT },
  })),
)

// 클릭 강화: 후반에도 클릭이 죽지 않도록 클릭에 MPS 비율을 더한다(누적 합산).
const CLICK_UPGRADES: UpgradeDef[] = [
  {
    id: 'click-mps-1',
    name: '마나 공명',
    desc: '클릭 시 MPS의 1%를 추가 획득',
    cost: 5_000,
    unlock: { kind: 'totalMps', minMps: 10 },
    effect: { kind: 'clickMpsPercent', percent: 1 },
  },
  {
    id: 'click-mps-2',
    name: '마나 공명 II',
    desc: '클릭 시 MPS의 1%p 추가 (합계 2%)',
    cost: 500_000,
    unlock: { kind: 'totalMps', minMps: 500 },
    effect: { kind: 'clickMpsPercent', percent: 1 },
  },
]

// 시너지: 교차 배율(재미 양념). 비용은 인접 마일스톤과 비슷한 체감으로.
const SYNERGY_UPGRADES: UpgradeDef[] = [
  {
    id: 'synergy-apprentice-cauldron',
    name: '견습생의 손길',
    desc: '견습생 1명당 마법 솥 생산 +1%',
    cost: 5_000,
    unlock: { kind: 'ownedCount', generatorId: 'apprentice', minOwned: 25 },
    effect: { kind: 'synergy', sourceId: 'apprentice', targetId: 'cauldron', percentPerSource: 1 },
  },
  {
    id: 'synergy-herbGarden-runeCircle',
    name: '허브의 정수',
    desc: '허브 정원 1개당 마법진 생산 +0.5%',
    cost: 60_000,
    unlock: { kind: 'ownedCount', generatorId: 'herbGarden', minOwned: 25 },
    effect: { kind: 'synergy', sourceId: 'herbGarden', targetId: 'runeCircle', percentPerSource: 0.5 },
  },
]

export const UPGRADES: UpgradeDef[] = [
  ...MILESTONE_UPGRADES,
  ...CLICK_UPGRADES,
  ...SYNERGY_UPGRADES,
]

// id → 정의 조회용(스토어가 구매 id 목록을 정의로 해석할 때 사용).
const UPGRADE_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(
  UPGRADES.map((u) => [u.id, u]),
)

// 구매한 id 목록을 정의 배열로 해석. 알 수 없는 id는 무시(세이브 마이그레이션 안전).
export function resolveUpgrades(ids: string[]): UpgradeDef[] {
  const defs: UpgradeDef[] = []
  for (const id of ids) {
    const def = UPGRADE_BY_ID[id]
    if (def) defs.push(def)
  }
  return defs
}
