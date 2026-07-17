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

export const GENERATORS: GeneratorDef[] = [
  { id: 'apprentice', tier: 1, name: '견습생', icon: '🧙', baseCost: 15, baseMps: 0.1 },
  { id: 'cauldron', tier: 2, name: '마법 솥', icon: '⚗️', baseCost: 100, baseMps: 1 },
  { id: 'herbGarden', tier: 3, name: '허브 정원', icon: '🌿', baseCost: 1_100, baseMps: 8 },
  { id: 'runeCircle', tier: 4, name: '마법진', icon: '🔮', baseCost: 12_000, baseMps: 47 },
  { id: 'spiritPact', tier: 5, name: '정령 계약', icon: '🧚', baseCost: 130_000, baseMps: 260 },
  { id: 'dragonNest', tier: 6, name: '드래곤 둥지', icon: '🐉', baseCost: 1_400_000, baseMps: 1_400 },
]
