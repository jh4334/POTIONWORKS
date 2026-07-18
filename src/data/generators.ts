// 생산 시설 6티어 출발 수치 (DESIGN.md §2.3).
// 규칙(CLAUDE.md): 게임 수치는 전부 data/*. 코드에 매직넘버 금지.
// baseMps에 아직 배율은 없다 — 마일스톤/시너지 배율은 M3(T3.1)에서 확장된다.

export interface GeneratorDef {
  id: string
  tier: number // 1~6 (노출 정책·정렬용)
  name: string
  icon: string // 표시용 이모지
  baseCost: number // 0개 보유 시 1개 가격
  baseMps: number // 1개당 초당 마나
}

// 구매 비용 성장 상수 (장르 표준). 비용 = baseCost × COST_GROWTH^보유수.
export const COST_GROWTH = 1.15

// 시설 정의(D-5.1): `as const satisfies`로 리터럴 id를 보존하면서 GeneratorDef 구조를 컴파일 검증한다.
// 이 배열이 시설 id의 단일 진실 — GeneratorId 유니언을 여기서 도출한다(아래).
export const GENERATORS = [
  { id: 'apprentice', tier: 1, name: '견습생', icon: '🧙', baseCost: 15, baseMps: 0.1 },
  { id: 'cauldron', tier: 2, name: '마법 솥', icon: '⚗️', baseCost: 100, baseMps: 1 },
  // T8.1 밸런싱: 상위 티어 회수기간이 150s→1000s로 가팔라 후반 성장이 정체됨(시뮬 검증).
  // 업그레이드 밀도가 낮은 6티어 구성에 맞춰 T3~T6을 상향해 §2.8 목표표(±30%)에 맞춤.
  { id: 'herbGarden', tier: 3, name: '허브 정원', icon: '🌿', baseCost: 1_100, baseMps: 10 },
  { id: 'runeCircle', tier: 4, name: '마법진', icon: '🔮', baseCost: 10_000, baseMps: 75 },
  { id: 'spiritPact', tier: 5, name: '정령 계약', icon: '🧚', baseCost: 130_000, baseMps: 640 },
  {
    id: 'dragonNest',
    tier: 6,
    name: '드래곤 둥지',
    icon: '🐉',
    baseCost: 1_400_000,
    baseMps: 8_500,
  },
  // T7~T8(E-1.1): 첫 각성(스타더스트 영구 배율) 이후에나 회수 가능한 가격대로 설계했다.
  // baseCost가 첫 각성 임계(1e9 누적) 규모를 넘어서, 각성 없이 맨손으로는 사실상 닿지 않는다 —
  // 각성 배율로 생산이 도약한 뒤 후반 성장을 이어 줄 시설이다(§2.8 이후 구간).
  {
    id: 'sageTower',
    tier: 7,
    name: '현자의 탑',
    icon: '🗼',
    baseCost: 12_000_000,
    baseMps: 55_000,
  },
  {
    id: 'riftGate',
    tier: 8,
    name: '시공 균열',
    icon: '🌀',
    baseCost: 150_000_000,
    baseMps: 400_000,
  },
] as const satisfies readonly GeneratorDef[]

// 시설 id 리터럴 유니언(D-5.1). GENERATORS에서 자동 도출 — 데이터가 진실이라 배열만 바꾸면 타입이 따라온다.
// 업그레이드/업적/상점의 시설 참조 필드를 이 타입으로 좁혀 오타(존재하지 않는 id)를 컴파일 단계에서 잡는다.
// (세이브의 Record<string, number>는 외부 입력이라 string 유지 — 정규화에서 미지 id를 필터한다.)
export type GeneratorId = (typeof GENERATORS)[number]['id']
