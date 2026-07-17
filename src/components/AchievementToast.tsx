import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGameStore } from '../store/gameStore.ts'
import { ACHIEVEMENT_TOAST_MS } from '../data/config.ts'
import { playDing } from '../engine/sound.ts'

// T6.1/T6.2 업적 달성 토스트 — 우하단 세로 스택. 각 토스트는 3초 후 자동 소멸(개별 타이머).
// 큐는 스토어 UI 상태(세이브 비포함). 마운트 시 밝은 딩 사운드 재생(muted면 sound가 무시).

// 개별 토스트: 자기 소멸 타이머 + 등장 시 사운드. 소멸은 스토어 dismissToast로.
function ToastItem({ id, name }: { id: number; name: string }) {
  const dismissToast = useGameStore((s) => s.dismissToast)

  useEffect(() => {
    playDing()
    const t = setTimeout(() => dismissToast(id), ACHIEVEMENT_TOAST_MS)
    return () => clearTimeout(t)
  }, [id, dismissToast])

  return (
    <div className="achievement-toast" role="status">
      <span className="achievement-toast-icon">🏆</span>
      <div className="achievement-toast-body">
        <div className="achievement-toast-title">업적 달성: {name}</div>
        <div className="achievement-toast-sub">+1% 생산</div>
      </div>
    </div>
  )
}

export default function AchievementToast() {
  // id 배열만 얕게 구독 — 큐 변화(추가/소멸)에만 리렌더된다.
  const toasts = useGameStore(useShallow((s) => s.toasts))
  if (toasts.length === 0) return null

  return (
    <div className="achievement-toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} id={t.id} name={t.name} />
      ))}
    </div>
  )
}
