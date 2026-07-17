import { useGameStore } from '../store/gameStore.ts'

export default function Header() {
  const mana = useGameStore((s) => s.mana)
  const mps = useGameStore((s) => s.manaPerSecond)

  return (
    <header className="header">
      <h1 className="header-title">🧪 POTIONWORKS</h1>
      <div className="header-stats">
        <span className="header-mana">{mana} 마나</span>
        <span className="header-mps">초당 {mps}</span>
      </div>
    </header>
  )
}
