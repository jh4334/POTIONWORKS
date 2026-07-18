// T8.2 타이틀 오버레이 — 최초 방문(세이브 없음)에서만 1회 노출. [게임 시작]으로 닫는다.
// 재방문(세이브 있음)에서는 App이 아예 렌더하지 않으므로 여기선 순수 표시만 담당한다.
import { STRINGS } from '../data/strings.ts'

interface Props {
  onStart: () => void
}

export default function TitleScreen({ onStart }: Props) {
  return (
    <div className="title-overlay">
      <div className="title-card">
        <h1 className="title-logo">🧪 POTIONWORKS</h1>
        <p className="title-sub">{STRINGS.titleScreen.sub}</p>
        <button type="button" className="title-start" onClick={onStart}>
          {STRINGS.titleScreen.start}
        </button>
      </div>
    </div>
  )
}
