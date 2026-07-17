import { useEffect, useState } from 'react'
import Header from './components/Header.tsx'
import ClickerPanel from './components/ClickerPanel.tsx'
import PrestigeModal from './components/PrestigeModal.tsx'
import UpgradePanel from './components/UpgradePanel.tsx'
import GeneratorList from './components/GeneratorList.tsx'
import OfflineModal from './components/OfflineModal.tsx'
import AchievementToast from './components/AchievementToast.tsx'
import BurstEffect from './components/BurstEffect.tsx'
import TitleScreen from './components/TitleScreen.tsx'
import { startTickLoop } from './engine/tick.ts'
import { startAutosave, hadSaveOnLoad } from './engine/autosave.ts'
import { useGameStore } from './store/gameStore.ts'
import { setMuted } from './engine/sound.ts'

export default function App() {
  // 게임 루프 + 자동저장 시작. cleanup으로 StrictMode 이중 mount에도 인터벌이 중복 생성되지 않는다.
  useEffect(() => startTickLoop(), [])
  useEffect(() => startAutosave(), [])

  // 음소거(스토어 진실) → 사운드 엔진에 반영. 세이브 로드로 muted가 복원돼도 여기서 동기화된다.
  const muted = useGameStore((s) => s.muted)
  useEffect(() => setMuted(muted), [muted])

  // 타이틀 오버레이: 최초 방문(세이브 없음)에서만 노출. 초기값을 마운트 시 1회 고정한다.
  const [showTitle, setShowTitle] = useState(() => !hadSaveOnLoad())

  if (showTitle) return <TitleScreen onStart={() => setShowTitle(false)} />

  return (
    <div className="app">
      <Header />
      <main className="layout">
        <section className="layout-left">
          <ClickerPanel />
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
    </div>
  )
}
