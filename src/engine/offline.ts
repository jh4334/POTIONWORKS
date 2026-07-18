// 오프라인 수익 계산 — 순수 함수만. 규칙(CLAUDE.md): 수치는 data/config.ts, 로직은 engine/*.
// DESIGN.md §2.6: 경과시간(최대 8h) × MPS × 50%.
// tick과 같은 "타임스탬프가 진실" 원칙 — 경과시간은 호출부에서 now - savedAt로 넘긴다.
import { OFFLINE_CAP_MS, OFFLINE_EFFICIENCY } from '../data/config.ts'

// 자리 비운 동안 적립할 마나량.
//   min(경과, capMs) / 1000 × mps × efficiency
// 경과가 0/음수(시계 역행)거나 mps가 0/음수면 지급 없음(0).
// efficiency·capMs 기본값은 config 상수 — 스타더스트 상점 강화(꿈꾸는 솥·시간의 모래)가
// 적용될 때 호출부가 effectiveOfflineEfficiency/CapMs로 실효값을 주입한다(D-3.1).
export function offlineEarnings(
  elapsedMs: number,
  mps: number,
  efficiency: number = OFFLINE_EFFICIENCY,
  capMs: number = OFFLINE_CAP_MS,
): number {
  if (elapsedMs <= 0 || mps <= 0) return 0
  const cappedMs = Math.min(elapsedMs, capMs)
  return (cappedMs / 1000) * mps * efficiency
}
