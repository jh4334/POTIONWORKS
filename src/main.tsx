import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { loadGame } from './engine/autosave.ts'
import './index.css'

// 세이브 로드 + 오프라인 수익 지급을 렌더 전에 1회 실행 —
// StrictMode(개발) 이중 mount의 영향을 받지 않게 React 트리 밖에서 수행한다.
loadGame()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
