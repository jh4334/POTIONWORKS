import { useCallback, useRef, useState, type MouseEvent } from 'react'
import { useGameStore } from '../store/gameStore.ts'
import { formatNumber } from '../utils/format.ts'

// T1.2 클릭 숫자 팝: 순수 UI 이펙트라 게임 상태(store)가 아니라 로컬 상태로 관리한다.
interface Pop {
  id: number
  x: number
  y: number
  label: string
}

export default function ClickerPanel() {
  // 셀렉터로 부분 구독 — 액션과 clickPower만 가져온다(스토어 통째 구독 금지).
  const click = useGameStore((s) => s.click)
  const clickPower = useGameStore((s) => s.clickPower)

  const [pops, setPops] = useState<Pop[]>([])
  const nextId = useRef(0)

  const handleClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      click()
      // 클릭 좌표(버튼 기준)에서 팝이 떠오르도록.
      const rect = e.currentTarget.getBoundingClientRect()
      const pop: Pop = {
        id: nextId.current++,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        label: `+${formatNumber(clickPower)}`,
      }
      setPops((prev) => [...prev, pop])
    },
    [click, clickPower],
  )

  // 애니메이션 종료된 팝만 제거 — 연타해도 각 팝이 독립적으로 살아있다 사라진다.
  const removePop = useCallback((id: number) => {
    setPops((prev) => prev.filter((p) => p.id !== id))
  }, [])

  return (
    <div className="clicker-panel">
      <button
        type="button"
        className="cauldron-button"
        aria-label="솥 클릭"
        onClick={handleClick}
      >
        <span className="cauldron-emoji">🫧</span>
        <span className="cauldron-label">솥을 저어라</span>
        {pops.map((pop) => (
          <span
            key={pop.id}
            className="click-pop"
            style={{ left: pop.x, top: pop.y }}
            onAnimationEnd={() => removePop(pop.id)}
          >
            {pop.label}
          </span>
        ))}
      </button>
    </div>
  )
}
