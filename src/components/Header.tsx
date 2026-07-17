import { useGameStore } from '../store/gameStore.ts'
import { formatNumber } from '../utils/format.ts'

export default function Header() {
  const mana = useGameStore((s) => s.mana)
  const mps = useGameStore((s) => s.manaPerSecond)

  return (
    <header className="header">
      <h1 className="header-title">🧪 POTIONWORKS</h1>
      <div className="header-stats">
        {/* 마나는 100ms마다 갱신되므로 표시는 정수 내림(소수점 깜빡임 방지). */}
        <span className="header-mana">{formatNumber(Math.floor(mana))} 마나</span>
        <span className="header-mps">초당 {formatNumber(mps)}</span>
      </div>
    </header>
  )
}
