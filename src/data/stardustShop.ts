// 스타더스트 상점 정의 (D-3 각성 리워크). 규칙(CLAUDE.md): 게임 수치는 전부 data/*.
// 각성 화폐(스타더스트)의 소비처 — 각성해도 유지되는 영구 강화 트랙.
// 효과는 데이터 기술식(discriminated union) — 해석은 engine/formulas.ts 순수 함수가 담당한다.

// 레벨별 비용 성장 상수. 비용 = baseCost × STARDUST_COST_GROWTH^level (level=현재 보유 레벨).
// 코드 매직넘버 금지 규칙에 따라 기울기 상수를 데이터에 둔다.
export const STARDUST_COST_GROWTH = 2

// 상점 강화 효과.
export type StardustEffect =
  // 각성 시 견습생 (perLevel × 레벨)명 보유로 시작 — 리빌드 지루함 해소(U7).
  | { kind: 'startingApprentices'; perLevel: number }
  // 클릭 = 기존 clickMps 합에 (perLevel × 레벨)%p 추가 — 클릭 사망 해소(U10·U2).
  | { kind: 'clickMpsPercent'; perLevel: number }
  // 오프라인 효율 +(perLevel × 레벨) — 기본 50%에서 최대 75%까지(방치 성장축, U3).
  | { kind: 'offlineEfficiency'; perLevel: number }
  // 오프라인 캡 +(perLevelMs × 레벨) — 기본 8h에서 최대 12h까지(방치 성장축, U3).
  | { kind: 'offlineCap'; perLevelMs: number }

export interface StardustUpgradeDef {
  id: string
  name: string
  desc: string
  icon: string // 표시용 이모지
  baseCost: number // 레벨 0→1 비용(정수). 레벨별 비용은 baseCost × 2^level.
  maxLevel: number | null // null이면 무한 레벨. 숫자면 그 레벨에서 구매 종료.
  effect: StardustEffect
}

export const STARDUST_UPGRADES: StardustUpgradeDef[] = [
  {
    id: 'starting-apprentices',
    name: '견습 마법사단',
    desc: '각성 시 견습생 5명/Lv을 보유한 채로 시작',
    icon: '🧙',
    baseCost: 1,
    maxLevel: null,
    effect: { kind: 'startingApprentices', perLevel: 5 },
  },
  {
    id: 'click-resonance',
    name: '공명 증폭',
    desc: '클릭 획득 = MPS의 +1%p/Lv (업그레이드와 합산)',
    icon: '💥',
    baseCost: 2,
    maxLevel: null,
    effect: { kind: 'clickMpsPercent', perLevel: 1 },
  },
  {
    id: 'dreaming-cauldron',
    name: '꿈꾸는 솥',
    desc: '오프라인 효율 +5%p/Lv (50% → 최대 75%)',
    icon: '🌙',
    baseCost: 3,
    maxLevel: 5,
    effect: { kind: 'offlineEfficiency', perLevel: 0.05 },
  },
  {
    id: 'sands-of-time',
    name: '시간의 모래',
    desc: '오프라인 캡 +1시간/Lv (8h → 최대 12h)',
    icon: '⏳',
    baseCost: 5,
    maxLevel: 4,
    effect: { kind: 'offlineCap', perLevelMs: 60 * 60 * 1000 },
  },
]

// id → 정의 조회용(스토어·세이브가 레벨 맵을 정의로 해석할 때 사용).
const STARDUST_BY_ID: Record<string, StardustUpgradeDef> = Object.fromEntries(
  STARDUST_UPGRADES.map((u) => [u.id, u]),
)

export function stardustUpgradeById(id: string): StardustUpgradeDef | undefined {
  return STARDUST_BY_ID[id]
}

// 알려진 상점 id 집합(세이브 마이그레이션 시 미지의 id를 걸러낸다).
export const KNOWN_STARDUST_IDS: ReadonlySet<string> = new Set(STARDUST_UPGRADES.map((u) => u.id))
