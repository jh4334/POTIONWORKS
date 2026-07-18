// 골든 이벤트 카탈로그 (E-1.4). 규칙(CLAUDE.md): 게임 수치는 전부 data/*, 표시 문자열 최소화(i18n).
// 기존 유성(생산 버프) 단일에서 3종(생산 버프 / 클릭 버프 / 드래곤 즉시 지급)으로 확장 —
// 이벤트가 여러 종이 됐으므로 종류·아이콘·가중치를 데이터로 모은다(코드 분기 최소화).
//
// 버프 배율·지속시간·드래곤 지급 초는 config(수치 단일 위치)에, 종류/아이콘/가중치 구조는 여기에 둔다.
// 발동 로직(버프 공존·즉시 지급)은 store 액션 activateGoldenEvent가, 출현 연출은 GoldenEvent 컴포넌트가 담당한다.
import { GOLDEN_EVENT_WEIGHTS } from './config.ts'

// 이벤트 종류: 생산 버프(MPS ×) / 클릭 버프(클릭 파워 ×) / 드래곤(즉시 마나 지급, 버프 아님).
export type GoldenEventKind = 'production' | 'click' | 'dragon'

export interface GoldenEventDef {
  kind: GoldenEventKind
  icon: string // 표시용 이모지(출현 글리프)
  weight: number // 가중치(합 대비 비율로 선택). 수치는 config.
}

// 이벤트 정의 — 종류/아이콘은 여기, 가중치 수치는 config에서 파생. 이 배열이 종류의 단일 진실.
export const GOLDEN_EVENTS = [
  { kind: 'production', icon: '☄️', weight: GOLDEN_EVENT_WEIGHTS.production },
  { kind: 'click', icon: '🌩️', weight: GOLDEN_EVENT_WEIGHTS.click },
  { kind: 'dragon', icon: '🐲', weight: GOLDEN_EVENT_WEIGHTS.dragon },
] as const satisfies readonly GoldenEventDef[]

// 가중치 합에서 하나를 뽑는 순수 함수. roll ∈ [0,1)를 받아 결정적으로 종류를 고른다(테스트 가능).
// 비유한/범위 밖 roll은 0으로 클램프 — 항상 유효한 정의를 돌려준다.
export function pickGoldenEvent(roll: number): GoldenEventDef {
  const total = GOLDEN_EVENTS.reduce((sum, e) => sum + e.weight, 0)
  const r = Number.isFinite(roll) ? Math.min(Math.max(roll, 0), 1 - 1e-12) : 0
  let acc = r * total
  for (const e of GOLDEN_EVENTS) {
    acc -= e.weight
    if (acc < 0) return e
  }
  return GOLDEN_EVENTS[GOLDEN_EVENTS.length - 1]
}

// 종류로 정의 조회(치트 event(kind)·컴포넌트 아이콘 선택용). 미지 종류는 첫 정의로 폴백.
export function goldenEventByKind(kind: GoldenEventKind): GoldenEventDef {
  return GOLDEN_EVENTS.find((e) => e.kind === kind) ?? GOLDEN_EVENTS[0]
}
