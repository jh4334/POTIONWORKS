import { useEffect, useState } from 'react'
import Header from './components/Header.tsx'
import ClickerPanel from './components/ClickerPanel.tsx'
import BrewingPanel from './components/BrewingPanel.tsx'
import PrestigeModal from './components/PrestigeModal.tsx'
import UpgradePanel from './components/UpgradePanel.tsx'
import GeneratorList from './components/GeneratorList.tsx'
import OfflineModal from './components/OfflineModal.tsx'
import AchievementToast from './components/AchievementToast.tsx'
import BurstEffect from './components/BurstEffect.tsx'
import GoldenEvent from './components/GoldenEvent.tsx'
import PrestigeSequence from './components/PrestigeSequence.tsx'
import TitleScreen from './components/TitleScreen.tsx'
import { startTickLoop } from './engine/tick.ts'
import { startAutosave, hadSaveOnLoad, saveNow } from './engine/autosave.ts'
import { consumeEnterFlag } from './engine/slots.ts'
import { useGameStore } from './store/gameStore.ts'
import { setVolume, startAmbient, stopAmbient } from './engine/sound.ts'
import { setNotation } from './utils/format.ts'
import { STRINGS } from './data/strings.ts'

export default function App() {
  // 게임 루프 + 자동저장 시작. cleanup으로 StrictMode 이중 mount에도 인터벌이 중복 생성되지 않는다.
  useEffect(() => startTickLoop(), [])
  useEffect(() => startAutosave(), [])

  // 볼륨(스토어 진실) → 사운드 엔진에 반영. 세이브 로드로 volume이 복원돼도 여기서 동기화된다(E-3.3).
  const volume = useGameStore((s) => s.volume)
  useEffect(() => setVolume(volume), [volume])

  // 숫자 표기(E-3.3) → formatNumber 모듈 전역에 동기화. App이 이 값을 구독하므로 표기 변경 시
  // App 서브트리 전체가 리렌더된다(모든 formatNumber 호출부가 새 표기로 갱신). 렌더 본문에서 동기화해
  // 첫 페인트부터 올바른 표기를 쓰게 한다(자식 렌더보다 먼저 모듈 값이 확정됨).
  const numberNotation = useGameStore((s) => s.numberNotation)
  setNotation(numberNotation)

  // 이펙트 강도(E-3.3) → html data-effects 속성. CSS가 reduced에서 애니메이션을 끈다(reduced-motion 확장).
  const effects = useGameStore((s) => s.effects)
  useEffect(() => {
    document.documentElement.dataset.effects = effects
  }, [effects])

  // 글자 크기(E-3.3) → html zoom 배율. px 기반 스타일도 함께 확대돼 UI 전체가 커진다(접근성).
  const fontScale = useGameStore((s) => s.fontScale)
  useEffect(() => {
    document.documentElement.style.zoom = String(fontScale)
  }, [fontScale])

  // 세이브 로드 실패 안내(D-1.1). loadGame이 corrupt를 감지하면 스토어에 세워둔다.
  const loadFailed = useGameStore((s) => s.loadFailed)
  const dismissLoadFailed = useGameStore((s) => s.dismissLoadFailed)

  // 저장 실패 안내(D-2.5). saveNow가 저장에 실패하면 스토어에 세워둔다(1회성 경고 배너).
  const saveFailed = useGameStore((s) => s.saveFailed)
  const dismissSaveFailed = useGameStore((s) => s.dismissSaveFailed)

  // 타이틀 오버레이: 최초 방문(세이브 없음)에서 노출. 슬롯 전환/새 게임 진입(consumeEnterFlag)이면
  // 리로드 후 곧장 게임으로 들어간다(타이틀 스킵). 초기값을 마운트 시 1회 고정한다(E-3.2).
  const [showTitle, setShowTitle] = useState(() => !hadSaveOnLoad() && !consumeEnterFlag())

  // 앰비언트 배경음(E-4.4) — 게임 화면(타이틀 제외) · volume>0 · ambientOn일 때만 재생한다.
  // 볼륨 크기 변화는 위 setVolume 동기화가 게인에 반영하므로, 여기선 "켜야 하는가" 불리언에만 의존해
  // 슬라이더를 움직일 때마다 루프가 재시작되지 않게 한다(첫 제스처 전 suspended는 sound가 resume 처리).
  const ambientOn = useGameStore((s) => s.ambientOn)
  const shouldPlayAmbient = !showTitle && ambientOn && volume > 0
  useEffect(() => {
    if (shouldPlayAmbient) startAmbient()
    else stopAmbient()
    return () => stopAmbient()
  }, [shouldPlayAmbient])

  // 게임 내 "슬롯 변경": 현재 진행을 저장한 뒤 타이틀 화면으로 되돌린다(거기서 슬롯 선택/이어하기).
  const exitToTitle = () => {
    saveNow()
    setShowTitle(true)
  }

  if (showTitle) return <TitleScreen onStart={() => setShowTitle(false)} />

  return (
    <div className="app">
      {loadFailed && (
        <div className="load-failed-banner" role="alert">
          <span className="load-failed-text">{STRINGS.banner.loadFailed}</span>
          <button
            type="button"
            className="load-failed-close"
            onClick={dismissLoadFailed}
            aria-label={STRINGS.common.close}
          >
            ✕
          </button>
        </div>
      )}
      {saveFailed && (
        <div className="load-failed-banner" role="alert">
          <span className="load-failed-text">{STRINGS.banner.saveFailed}</span>
          <button
            type="button"
            className="load-failed-close"
            onClick={dismissSaveFailed}
            aria-label={STRINGS.common.close}
          >
            ✕
          </button>
        </div>
      )}
      <Header onExitToTitle={exitToTitle} />
      <main className="layout">
        <section className="layout-left">
          <ClickerPanel />
          <BrewingPanel />
          <PrestigeModal />
        </section>
        <section className="layout-right">
          <UpgradePanel />
          <GeneratorList />
        </section>
      </main>
      <OfflineModal />
      <AchievementToast />
      <BurstEffect />
      <GoldenEvent />
      <PrestigeSequence />
    </div>
  )
}
