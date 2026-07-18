// 포션 조제 카탈로그 (E-1.2). 규칙(CLAUDE.md): 게임 수치는 전부 data/*, 매직넘버 금지.
// 마나를 소비해 조제(대기)하고, 완성되면 수확해 강력한 일시 버프/즉발 보상을 얻는다.
//
// 비용은 "현재 MPS 비례"(costMpsSeconds초분)라 어느 시점에도 유의미하다 — 고정가 인플레 문제 회피.
// MPS가 낮을 때(각성 직후 등) 비용이 0에 수렴하는 것을 막기 위해 하한(costFloor)을 둔다.
// 조제 시간·버프 지속·배율은 여기 데이터에, 완성 판정·비용 계산은 engine/formulas.ts 순수 함수가 담당한다.
// 발동(버프 push·즉시 지급)은 store 액션 collectPotion가, 출현/진행 표시는 BrewingPanel이 담당한다.

// 포션 효과. 버프형 2종(생산/클릭)은 activeBuffs에 push(각각 'potion-production'/'potion-click' kind로
// 골든 이벤트 버프와 공존), 즉발형(instant-mps)은 현재 MPS × seconds(N초분)를 바로 지급한다.
export type PotionEffect =
  // 생산 버프: durationMs 동안 생산(MPS) × mult. activeBuffs 'potion-production'로 골든 'production'과 공존.
  | { kind: 'buff-production'; mult: number; durationMs: number }
  // 클릭 버프: durationMs 동안 클릭 파워 × mult. activeBuffs 'potion-click'로 골든 'click'과 공존.
  | { kind: 'buff-click'; mult: number; durationMs: number }
  // 즉발: 수확 즉시 현재 MPS × seconds(초분) 마나 지급(버프 아님). 늙은 드래곤과 같은 계열.
  | { kind: 'instant-mps'; seconds: number }

export interface PotionDef {
  id: string
  name: string
  desc: string // 효과 요약(카드·토스트 표시). 데이터 파일 관례상 name/desc는 여기 인라인(generators/achievements와 동일).
  icon: string // 표시용 이모지
  // 조제 비용 = 현재 MPS × costMpsSeconds초분. 단, max(그 값, costFloor) 하한을 적용한다.
  costMpsSeconds: number
  costFloor: number // 비용 하한(MPS가 낮아도 이만큼은 든다). data 상수.
  brewMs: number // 조제(대기) 시간(ms). 완성되면 수확 대기 상태가 된다.
  unlockTotalMana: number // 해금 조건: 전생 포함 총 누적 마나(각성해도 유지되는 값)가 이 값 이상.
  effect: PotionEffect
}

// 3종 포션. 해금 조건(누적 마나)이 낮은 순으로 정렬 — 패널은 해금된 것만 노출한다(온보딩).
export const POTIONS: PotionDef[] = [
  {
    id: 'vitality',
    name: '활력 물약',
    desc: '10분간 생산 ×2',
    icon: '🧪',
    costMpsSeconds: 120, // 현재 MPS 2분치
    costFloor: 1_000,
    brewMs: 3 * 60_000, // 3분
    unlockTotalMana: 100_000, // 100K
    effect: { kind: 'buff-production', mult: 2, durationMs: 10 * 60_000 },
  },
  {
    id: 'sageTouch',
    name: '현자의 손끝',
    desc: '10분간 클릭 ×5',
    icon: '✋',
    costMpsSeconds: 300, // 현재 MPS 5분치
    costFloor: 100_000, // 100K
    brewMs: 10 * 60_000, // 10분
    unlockTotalMana: 10_000_000, // 10M
    effect: { kind: 'buff-click', mult: 5, durationMs: 10 * 60_000 },
  },
  {
    id: 'timeWarp',
    name: '시간 왜곡 물약',
    desc: '즉시 30분치 마나 지급',
    icon: '⏰',
    costMpsSeconds: 600, // 현재 MPS 10분치
    costFloor: 10_000_000, // 10M
    brewMs: 30 * 60_000, // 30분
    unlockTotalMana: 1_000_000_000, // 1B
    effect: { kind: 'instant-mps', seconds: 1_800 }, // 30분치
  },
]

// id로 포션 정의 조회(액션 검증·수확 효과 적용). 미지 id는 undefined.
export function potionById(id: string): PotionDef | undefined {
  return POTIONS.find((p) => p.id === id)
}
