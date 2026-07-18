import { useGameStore } from '../store/gameStore.ts'
import { TICK_INTERVAL_MS } from '../data/config.ts'

// 게임 루프: setInterval 100ms로 tick(Date.now()) 호출.
// + visibilitychange 복귀 시 즉시 tick — 백그라운드 스로틀로 밀린 시간을
//   타임스탬프 계산(tick 내부)이 한 번에 catch-up 한다.
// + pageshow(persisted) 즉시 tick(D-5.4) — bfcache에서 페이지가 복원되면 그 사이의 경과를 한 번에 정산한다.
//   (catch-up 캡 로직이 이미 오프라인 정책으로 초과분을 라우팅하므로 과지급 없이 안전하다.)
// cleanup 함수를 반환하므로 StrictMode 이중 mount에도 인터벌이 중복 생성되지 않는다.
export function startTickLoop(): () => void {
  const tick = () => useGameStore.getState().tick(Date.now())

  const intervalId = setInterval(tick, TICK_INTERVAL_MS)

  const onVisibility = () => {
    if (document.visibilityState === 'visible') tick()
  }
  document.addEventListener('visibilitychange', onVisibility)

  const onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted) tick() // bfcache 복원 — 즉시 catch-up.
  }
  window.addEventListener('pageshow', onPageShow)

  return () => {
    clearInterval(intervalId)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pageshow', onPageShow)
  }
}
