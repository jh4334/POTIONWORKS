import { useEffect } from 'react'
import Header from './components/Header.tsx'
import ClickerPanel from './components/ClickerPanel.tsx'
import UpgradePanel from './components/UpgradePanel.tsx'
import GeneratorList from './components/GeneratorList.tsx'
import { startTickLoop } from './engine/tick.ts'

export default function App() {
  // 게임 루프 시작. cleanup으로 StrictMode 이중 mount에도 인터벌이 중복 생성되지 않는다.
  useEffect(() => startTickLoop(), [])

  return (
    <div className="app">
      <Header />
      <main className="layout">
        <section className="layout-left">
          <ClickerPanel />
        </section>
        <section className="layout-right">
          <UpgradePanel />
          <GeneratorList />
        </section>
      </main>
    </div>
  )
}
