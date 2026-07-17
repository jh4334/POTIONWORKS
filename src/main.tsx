import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { loadGame } from './engine/autosave.ts'
import './index.css'

// 세이브 로드 + 오프라인 수익 지급을 렌더 전에 1회 실행 —
// StrictMode(개발) 이중 mount의 영향을 받지 않게 React 트리 밖에서 수행한다.
loadGame()

// 치트 도구(window.cheats)는 dev이거나 URL에 ?cheats가 있을 때만 로드한다(T8.1).
// preview/프로덕션 빌드에서도 ?cheats로 켤 수 있어 리뷰어가 밸런싱을 검증할 수 있다.
if (import.meta.env.DEV || new URLSearchParams(window.location.search).has('cheats')) {
  void import('./debug/cheats.ts')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
