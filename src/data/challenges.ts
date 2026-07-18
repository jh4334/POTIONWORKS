// 챌린지 런 정의 (E-2.2). 규칙(CLAUDE.md): 게임 수치는 전부 data/*, 상태 변형은 store 액션에서만.
// 각성과 함께 제약을 걸고 시작 → 제약을 지키며 목표(그 생에 각성 조건 달성)를 이루면 영구 생산 배율을 얻는다.
// 완료 보상은 challengeMultiplier(engine/formulas.ts)로 합성돼 composeGlobalMult에 합류한다(각성해도 유지).
//
// 제약 종류(constraint):
//  - no-click  : 솥 클릭 무효(마나 0). 그 생을 클릭 없이 각성하면 성공(prestige에서 판정).
//  - no-upgrade: 업그레이드 구매 불가. 그 생을 업그레이드 없이 각성하면 성공(prestige에서 판정).
//  - timed     : 각성 조건(누적 마나 임계, PRESTIGE_THRESHOLD)을 timeLimitMs 안에 달성하면 성공.
//                시작(startedAt)부터 실플레이+오프라인 경과 합산으로 판정(도달 시점에 성공/실패 확정).
export type ChallengeConstraint = 'no-click' | 'no-upgrade' | 'timed'

export interface ChallengeDef {
  id: string
  name: string
  desc: string
  icon: string // 표시용 이모지
  constraint: ChallengeConstraint
  // 완료 시 얻는 영구 생산 배율 보너스(0.25 = +25%). challengeMultiplier가 (1 + 합)로 합성한다.
  reward: number
  // timed 전용: 각성 조건 달성 제한 시간(ms). 다른 종류에는 없다(undefined).
  timeLimitMs?: number
}

// 2시간(timed 챌린지 제한 시간). 코드 매직넘버 금지 규칙에 따라 데이터에 상수로 둔다.
const TWO_HOURS_MS = 2 * 60 * 60 * 1000

// 3종 챌린지. 보상은 영구 생산 배율 — 완료 후 각성해도 유지된다(completedChallenges).
export const CHALLENGES: ChallengeDef[] = [
  {
    id: 'silent-hands',
    name: '침묵의 손',
    desc: '이번 생 솥 클릭이 무효가 됩니다. 클릭 없이 각성하면 성공 — 영구 생산 +25%',
    icon: '🙅',
    constraint: 'no-click',
    reward: 0.25,
  },
  {
    id: 'ascetic',
    name: '금욕의 공방',
    desc: '이번 생 업그레이드 구매가 막힙니다. 업그레이드 없이 각성하면 성공 — 영구 생산 +25%',
    icon: '🚫',
    constraint: 'no-upgrade',
    reward: 0.25,
  },
  {
    id: 'time-trial',
    name: '시간의 시험',
    desc: '2시간 안에 각성 조건을 달성하면 성공 — 영구 생산 +50%',
    icon: '⏱️',
    constraint: 'timed',
    reward: 0.5,
    timeLimitMs: TWO_HOURS_MS,
  },
]

// id → 정의 조회(store 판정·save 정규화·UI 표시 공용). 미지 id는 undefined.
const CHALLENGE_BY_ID: Record<string, ChallengeDef> = Object.fromEntries(
  CHALLENGES.map((c) => [c.id, c]),
)

export function challengeById(id: string): ChallengeDef | undefined {
  return CHALLENGE_BY_ID[id]
}

// 알려진 챌린지 id 집합(세이브 마이그레이션 시 미지의 id를 걸러낸다).
export const KNOWN_CHALLENGE_IDS: ReadonlySet<string> = new Set(CHALLENGES.map((c) => c.id))
