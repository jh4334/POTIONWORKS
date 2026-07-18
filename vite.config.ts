import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

// BASE_PATH 환경변수 읽기용 최소 선언(@types/node 미설치 환경에서도 tsc 통과).
declare const process: { env: Record<string, string | undefined> }

// package.json의 version을 빌드 타임 상수(__APP_VERSION__)로 주입한다(설정 모달 표시용).

// GitHub Pages 프로젝트 페이지(https://<user>.github.io/POTIONWORKS/) 경로 대응.
// base는 build/dev/preview 모두 동일하게 적용해야 한다 — preview(command==='serve')와 빌드 산출물의
// asset 경로가 어긋나면 청크가 SPA fallback(HTML)으로 떨어지기 때문. dev도 /POTIONWORKS/ 하위로 열린다.
// 배포 경로가 다른 포크/환경을 위해 BASE_PATH 환경변수로 덮어쓸 수 있게 한다(D-2.9).
const config = defineConfig({
  base: process.env.BASE_PATH ?? '/POTIONWORKS/',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})

// vitest 설정 명시(D-2.9) — 기본 include 패턴을 고정한다. 최상위 vite(6)와 vitest 번들 vite(5)의
// 타입이 달라 test 필드가 defineConfig 타입에 닿지 않으므로, 런타임 필드로만 부착한다(vitest가 읽음).
;(config as { test?: { include: string[] } }).test = {
  include: ['src/**/*.{test,spec}.{ts,tsx}'],
}

export default config
