// 개발/검증용 치트 도구(T8.1 지원). window.cheats로 노출한다.
// 로드 경로: main.tsx에서 dev(import.meta.env.DEV)이거나 URL에 ?cheats가 있을 때만 동적 import.
//   → 일반 프로덕션 빌드에는 실행되지 않고(트리에 포함돼도 호출되지 않음), 리뷰어는
//     `vite preview` + `?cheats`로 이 도구를 켜서 밸런싱 목표표(DESIGN §2.8)를 검증한다.
//
// 규칙(CLAUDE.md): 상태 변형은 스토어 액션에서만. 여기선 기존 액션을 조합하기만 하고
//   새로운 상태 변형 로직을 두지 않는다. addMana만 전용 액션(debugAddMana)을 사용한다.
import { useGameStore } from '../store/gameStore.ts'
import { hardResetAndReload } from '../engine/autosave.ts'

interface Cheats {
  // 마나 +n (누적 마나 통계도 함께). 각성 도달 등 상태 진행에 사용.
  addMana: (n: number) => void
  // 현재 마나 ×1000 (현재 마나의 999배를 추가 = 총 1000배). 누적 통계도 함께 증가.
  x1000: () => void
  // 시간 시뮬: lastTick 기준 hours시간 뒤 시각으로 tick 호출.
  //   탭 방치와 동일 경로(경과시간 × MPS 적립) — 마나가 대략 MPS × hours × 3600 만큼 늘어난다.
  simulate: (hours: number) => void
  // 유성 버프 즉시 발동(D-4.6 검증용) — 실제 유성 클릭과 동일 경로(activateMeteorBuff).
  meteor: () => void
  // 하드리셋(세이브 삭제 + 초기 상태).
  reset: () => void
}

const cheats: Cheats = {
  addMana(n) {
    useGameStore.getState().debugAddMana(n)
  },
  x1000() {
    const { mana, debugAddMana } = useGameStore.getState()
    debugAddMana(mana * 999) // 현재값 + 999배 = ×1000
  },
  simulate(hours) {
    const s = useGameStore.getState()
    // 진실은 타임스탬프: lastTick 대비 경과시간만큼만 적립되므로 미래 시각을 넘긴다.
    s.tick(s.lastTick + hours * 3600_000)
  },
  meteor() {
    // 유성 클릭과 동일: 버프 발동 + 토스트 + 버스트. 만료는 tick이 판정한다.
    useGameStore.getState().activateMeteorBuff(Date.now())
  },
  reset() {
    // 하드리셋 표준 경로(자동저장 정지 → clearSave → reload). 경합으로 세이브가 되살아나지 않게 한다.
    hardResetAndReload()
  },
}

declare global {
  interface Window {
    cheats: Cheats
  }
}

window.cheats = cheats
console.info(
  '[cheats] window.cheats 활성화 — addMana(n) · x1000() · simulate(hours) · meteor() · reset()',
)
