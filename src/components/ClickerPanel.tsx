import { useCallback, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useGameStore } from '../store/gameStore.ts'
import { formatNumber } from '../utils/format.ts'
import { playClick } from '../engine/sound.ts'

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

  // 좌표(버튼 기준)에서 클릭 처리 + 팝 생성. 마우스/키보드 공용.
  const spawnClick = useCallback(
    (x: number, y: number) => {
      click()
      playClick() // 짧은 pop(사용자 제스처라 AudioContext resume 허용). muted면 sound가 무시.
      const pop: Pop = { id: nextId.current++, x, y, label: `+${formatNumber(clickPower)}` }
      setPops((prev) => [...prev, pop])
    },
    [click, clickPower],
  )

  const handleClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      spawnClick(e.clientX - rect.left, e.clientY - rect.top)
    },
    [spawnClick],
  )

  // 접근성(D-2.8): Space/Enter 키로 클릭. Space 홀드 반복(e.repeat)도 허용하되,
  // preventDefault로 브라우저 기본 클릭(keyup 시 발생)을 억제해 중복 클릭을 막는다.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key !== ' ' && e.key !== 'Enter') return
      e.preventDefault()
      const rect = e.currentTarget.getBoundingClientRect()
      spawnClick(rect.width / 2, rect.height / 2) // 키보드는 버튼 중앙에서 팝.
    },
    [spawnClick],
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
        onKeyDown={handleKeyDown}
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
      {/* 클릭당 획득량 상시 표시(U8). clickPower는 구매/업그레이드 시에만 변함. */}
      <div className="click-power-label">클릭당 +{formatNumber(clickPower)}</div>
    </div>
  )
}
