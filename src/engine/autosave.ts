// 자동저장 루프 + 앱 시작 로드/오프라인 수익 오케스트레이션.
// 순수 계산은 offline.ts, 직렬화는 save.ts, 상태 변형은 스토어 액션 — 여기선 그걸 엮기만 한다.
import { useGameStore } from '../store/gameStore.ts'
import { saveToLocal, loadFromLocalResult } from './save.ts'
import { offlineEarnings } from './offline.ts'
import { effectiveOfflineEfficiency, effectiveOfflineCapMs } from './formulas.ts'
import { AUTOSAVE_INTERVAL_MS, OFFLINE_MIN_MS, SAVE_DEBOUNCE_MS } from '../data/config.ts'

// 앱 시작 시 세이브가 있었는지(=재방문인지) 기록. 타이틀 오버레이는 최초 방문에서만 띄운다(T8.2).
// loadGame이 렌더 전에 1회 실행되므로, App 최초 마운트 시점에 이 값이 확정돼 있다.
let hadSave = false
export function hadSaveOnLoad(): boolean {
  return hadSave
}

// 하드리셋 경합 방지 플래그(D-1.3). suspend 이후의 save() 호출은 전부 무시된다 —
// hardReset→reload 사이 beforeunload/인터벌 자동저장이 방금 지운 세이브를 되살리는 것을 막는다.
let autosaveSuspended = false
export function suspendAutosave(): void {
  autosaveSuspended = true
}

// 하드리셋 표준 경로(D-1.3): 자동저장 정지 → hardReset(clearSave 포함) → reload.
// SettingsModal·cheats가 공통으로 이 경로를 쓴다. 리셋 후 재방문 시 타이틀 화면이 나온다.
export function hardResetAndReload(): void {
  suspendAutosave()
  useGameStore.getState().hardReset()
  window.location.reload()
}

// 저장 + 결과에 따른 UI 상태 갱신(D-2.5). 성공하면 "저장됨" 시각 갱신, 실패하면 경고 배너.
// 수동 저장(Header)·각성 직후·복원 직후가 공통으로 이 경로를 쓴다. true=성공.
export function saveNow(now: number = Date.now()): boolean {
  // 저장마다 단조 카운터 +1(D-5.3) — 직렬화 직전에 올려 세이브에 이번 저장의 saveCount가 담기게 한다.
  useGameStore.getState().bumpSaveCount()
  const ok = saveToLocal(useGameStore.getState(), now)
  const store = useGameStore.getState()
  if (ok) store.markSaved(now)
  else store.markSaveFailed()
  return ok
}

// 앱 시작 시 1회: 세이브 로드 → 오프라인 수익 지급.
// StrictMode 밖(main.tsx 모듈 로드 시점)에서 호출해 이중 실행을 피한다.
export function loadGame(): void {
  const result = loadFromLocalResult()

  // 로드 실패(deserialize/migrate 실패): 원본은 save.ts에서 손상 백업 키에 이미 보존됨.
  // 초기화하지 않고 안내 상태만 세우며, 재방문으로 간주해 타이틀 대신 본편+배너를 노출한다(D-1.1).
  if (result.status === 'corrupt') {
    hadSave = true
    useGameStore.getState().markLoadFailed()
    return
  }
  if (result.status === 'empty') return // 첫 플레이 — 초기 상태 유지, 팝업 없음.

  const save = result.save
  hadSave = true
  useGameStore.getState().loadSave(save)

  // 오프라인 경과의 진실은 타임스탬프: now - savedAt (lastTick이 아니라 저장 시각 기준).
  const now = Date.now()
  const elapsedMs = now - save.savedAt
  const store = useGameStore.getState()
  const mps = store.manaPerSecond // loadSave에서 재계산된 값
  // 오프라인 효율·캡은 스타더스트 상점 강화(꿈꾸는 솥·시간의 모래)를 반영한 실효값을 쓴다(D-3.1).
  const efficiency = effectiveOfflineEfficiency(store.stardustUpgrades)
  const capMs = effectiveOfflineCapMs(store.stardustUpgrades)

  if (elapsedMs >= OFFLINE_MIN_MS) {
    // 60초 이상 부재: 오프라인 정책(효율/캡) 적용 + 팝업.
    // cappedMs=실제 정산에 인정된 시간(min(경과, 실효 캡)) — 팝업에서 캡 적용 여부를 정확히 표기한다(D-2.6).
    const amount = offlineEarnings(elapsedMs, mps, efficiency, capMs)
    const cappedMs = Math.min(elapsedMs, capMs)
    if (amount > 0) useGameStore.getState().applyOfflineEarnings(amount, now, elapsedMs, cappedMs)
  } else if (elapsedMs > 0 && mps > 0) {
    // 60초 미만 부재(D-1.5): 팝업 없이 100%를 조용히 지급. lastTick=now로 이중 지급 없음.
    useGameStore.getState().applySilentEarnings(mps * (elapsedMs / 1000), now)
  }
}

// 자동저장 루프: 10초 인터벌 + 종료성 저장 트리거(D-5.4).
// 종료 저장은 pagehide + visibilitychange(hidden)를 주 트리거로, beforeunload는 보조로 둔다 —
// 모바일/bfcache 환경에서 beforeunload가 발화하지 않는 경우까지 마지막 상태를 확실히 남기기 위해서다.
// 이 세 이벤트는 탭 닫힘 시 연달아 발화하므로 종료 저장끼리 1초 디바운스로 중복을 억제한다(중복 자체는 무해).
// cleanup을 반환하므로 StrictMode 이중 mount에도 인터벌이 중복 생성되지 않는다(tick 루프와 동일 패턴).
export function startAutosave(): () => void {
  // 주기 저장(10초). 종료 저장과 주기가 크게 달라(10s ≫ 1s) 디바운스 대상에서 제외 — 인터벌 저장 직후의
  // 종료 저장이 억제돼 마지막 조작을 잃는 일을 막는다.
  const intervalSave = () => {
    if (autosaveSuspended) return // 하드리셋 진행 중이면 저장 금지(경합 방지)
    saveNow()
  }

  // 종료성 저장: pagehide/visibilitychange(hidden)/beforeunload가 연달아 발화해도 1초 내 1회만 저장한다.
  let lastTerminalSaveAt = 0
  const terminalSave = () => {
    if (autosaveSuspended) return
    const now = Date.now()
    if (now - lastTerminalSaveAt < SAVE_DEBOUNCE_MS) return
    lastTerminalSaveAt = now
    saveNow(now)
  }
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') terminalSave()
  }

  const intervalId = setInterval(intervalSave, AUTOSAVE_INTERVAL_MS)
  window.addEventListener('pagehide', terminalSave)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('beforeunload', terminalSave)

  return () => {
    clearInterval(intervalId)
    window.removeEventListener('pagehide', terminalSave)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('beforeunload', terminalSave)
  }
}
