import Header from './components/Header.tsx'
import ClickerPanel from './components/ClickerPanel.tsx'
import GeneratorList from './components/GeneratorList.tsx'

export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="layout">
        <section className="layout-left">
          <ClickerPanel />
        </section>
        <section className="layout-right">
          <GeneratorList />
        </section>
      </main>
    </div>
  )
}
