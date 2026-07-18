import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGameStore } from '../store/gameStore.ts'
import { ACHIEVEMENT_TOAST_MS, TOAST_MAX_VISIBLE } from '../data/config.ts'
import { STRINGS } from '../data/strings.ts'
import { playDing } from '../engine/sound.ts'

// T6.1/T6.2 알림 토스트 — 우하단 세로 스택. 각 토스트는 3초 후 자동 소멸(개별 타이머).
// 큐는 스토어 UI 상태(세이브 비포함). 마운트 시 밝은 딩 사운드 재생(muted면 sound가 무시).
// D-4.5: 동시 표시는 최대 3개 — 오래된 것부터 표시하고, 초과분은 큐에서 대기한다(스토어 큐는 불변).
//   표시된 토스트만 자기 소멸 타이머를 돌리므로, 앞의 것이 사라지면 대기분이 순서대로 올라온다.
//   스택 전체에 pointer-events:none(CSS) — 아래 구매 버튼 등의 클릭을 가로채지 않는다.

// 개별 토스트: 자기 소멸 타이머 + 등장 시 사운드. 소멸은 스토어 dismissToast로.
// icon/title/sub가 없으면 업적 달성 기본 포맷으로 렌더한다(비업적 알림은 값을 지정 — 유성 버프 등).
function ToastItem({
  id,
  name,
  icon,
  title,
  sub,
}: {
  id: number
  name: string
  icon?: string
  title?: string
  sub?: string
}) {
  const dismissToast = useGameStore((s) => s.dismissToast)

  useEffect(() => {
    playDing()
    const t = setTimeout(() => dismissToast(id), ACHIEVEMENT_TOAST_MS)
    return () => clearTimeout(t)
  }, [id, dismissToast])

  return (
    <div className="achievement-toast" role="status">
      <span className="achievement-toast-icon">{icon ?? '🏆'}</span>
      <div className="achievement-toast-body">
        <div className="achievement-toast-title">{title ?? STRINGS.toast.achievement(name)}</div>
        <div className="achievement-toast-sub">{sub ?? STRINGS.toast.achievementSub}</div>
      </div>
    </div>
  )
}

export default function AchievementToast() {
  // id 배열만 얕게 구독 — 큐 변화(추가/소멸)에만 리렌더된다.
  const toasts = useGameStore(useShallow((s) => s.toasts))
  if (toasts.length === 0) return null

  // 오래된 것부터 최대 3개만 표시. 나머지는 큐에서 대기(스토어 큐는 그대로).
  const visible = toasts.slice(0, TOAST_MAX_VISIBLE)

  return (
    <div className="achievement-toast-stack" aria-live="polite">
      {visible.map((t) => (
        <ToastItem key={t.id} id={t.id} name={t.name} icon={t.icon} title={t.title} sub={t.sub} />
      ))}
    </div>
  )
}
