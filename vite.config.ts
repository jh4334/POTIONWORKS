import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json'

// BASE_PATH 환경변수 읽기용 최소 선언(@types/node 미설치 환경에서도 tsc 통과).
declare const process: { env: Record<string, string | undefined> }

// package.json의 version을 빌드 타임 상수(__APP_VERSION__)로 주입한다(설정 모달 표시용).

// GitHub Pages 프로젝트 페이지(https://<user>.github.io/POTIONWORKS/) 경로 대응.
// base는 build/dev/preview 모두 동일하게 적용해야 한다 — preview(command==='serve')와 빌드 산출물의
// asset 경로가 어긋나면 청크가 SPA fallback(HTML)으로 떨어지기 때문. dev도 /POTIONWORKS/ 하위로 열린다.
// 배포 경로가 다른 포크/환경을 위해 BASE_PATH 환경변수로 덮어쓸 수 있게 한다(D-2.9).
const base = process.env.BASE_PATH ?? '/POTIONWORKS/'

const config = defineConfig({
  base,
  plugins: [
    react(),
    // E-3.1 PWA — 설치 + 오프라인 실행. registerType 'autoUpdate'로 새 배포 시 SW가 자동 갱신된다.
    // scope/start_url은 base와 정합해야 한다(플러그인이 base를 기본값으로 쓰지만 명시해 어긋남을 막는다).
    // 아이콘은 png 변환 불가 환경이라 svg 1장을 any/maskable로 등록한다(public/icon.svg → 빌드 시 그대로 복사).
    // 외부 요청이 없는 순수 로컬 게임이라 기본 precache(빌드 산출물)만으로 완전 오프라인 실행이 된다.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'POTIONWORKS — 포션 공방 방치형',
        short_name: 'POTIONWORKS',
        description: '마나를 모아 포션 공방을 키우는 방치형 게임. 오프라인에서도 즐기세요.',
        lang: 'ko',
        theme_color: '#1a1425',
        background_color: '#1a1425',
        display: 'standalone',
        scope: base,
        start_url: base,
        icons: [
          {
            src: 'icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // 빌드 산출물 전부를 precache — 외부 CDN·API가 없어 이것만으로 완전 오프라인 동작.
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2}'],
      },
    }),
  ],
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
