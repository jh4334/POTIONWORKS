import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

// package.json의 version을 빌드 타임 상수(__APP_VERSION__)로 주입한다(설정 모달 표시용).

// GitHub Pages 프로젝트 페이지(https://<user>.github.io/POTIONWORKS/) 경로 대응.
// base는 build/dev/preview 모두 동일하게 적용해야 한다 — preview(command==='serve')와 빌드 산출물의
// asset 경로가 어긋나면 청크가 SPA fallback(HTML)으로 떨어지기 때문. dev는 /POTIONWORKS/ 하위로
// 열리지만 상대 경로로 정상 동작하므로 그대로 둔다(DESIGN·과제 노트 기준).
export default defineConfig({
  base: '/POTIONWORKS/',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
