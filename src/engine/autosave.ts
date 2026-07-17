// 자동저장 루프 + 앱 시작 로드/오프라인 수익 오케스트레이션.
// 순수 계산은 offline.ts, 직렬화는 save.ts, 상태 변형은 스토어 액션 — 여기선 그걸 엮기만 한다.
import { useGameStore } from '../store/gameStore.ts'
import { saveToLocal, loadFromLocal } from './save.ts'
import { offlineEarnings } from './offline.ts'
import { AUTOSAVE_INTERVAL_MS, OFFLINE_MIN_MS } from '../data/config.ts'

// 앱 시작 시 세이브가 있었는지(=재방문인지) 기록. 타이틀 오버레이는 최초 방문에서만 띄운다(T8.2).
// loadGame이 렌더 전에 1회 실행되므로, App 최초 마운트 시점에 이 값이 확정돼 있다.
let hadSave = false
export function hadSaveOnLoad(): boolean {
  return hadSave
}

// 앱 시작 시 1회: 세이브 로드 → 오프라인 수익 지급.
// StrictMode 밖(main.tsx 모듈 로드 시점)에서 호출해 이중 실행을 피한다.
export function loadGame(): void {
  const save = loadFromLocal()
  if (!save) return // 첫 플레이 — 초기 상태 유지, 팝업 없음.
  hadSave = true

  useGameStore.getState().loadSave(save)

  // 오프라인 경과의 진실은 타임스탬프: now - savedAt (lastTick이 아니라 저장 시각 기준).
  const now = Date.now()
  const elapsedMs = now - save.savedAt
  const mps = useGameStore.getState().manaPerSecond // loadSave에서 재계산된 값
  const amount = offlineEarnings(elapsedMs, mps)

  // 최소 경과 미만이거나 지급액이 0이면 지급·팝업 생략(loadSave가 lastTick을 now로 당겨 catch-up 없음).
  if (elapsedMs >= OFFLINE_MIN_MS && amount > 0) {
    useGameStore.getState().applyOfflineEarnings(amount, now, elapsedMs)
  }
}

// 자동저장 루프: 10초 인터벌 + beforeunload 저장.
// cleanup을 반환하므로 StrictMode 이중 mount에도 인터벌이 중복 생성되지 않는다(tick 루프와 동일 패턴).
export function startAutosave(): () => void {
  const save = () => saveToLocal(useGameStore.getState())

  const intervalId = setInterval(save, AUTOSAVE_INTERVAL_MS)
  window.addEventListener('beforeunload', save)

  return () => {
    clearInterval(intervalId)
    window.removeEventListener('beforeunload', save)
  }
}
