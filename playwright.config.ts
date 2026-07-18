import { defineConfig, devices } from '@playwright/test'

// E-4.2 E2E 스모크(Playwright). 빌드 산출물(dist)을 vite preview로 띄워 실제 배포 경로(/POTIONWORKS/)에서 검증한다.
// - baseURL은 preview 기본 포트(4173) + base 경로. webServer가 preview를 자동 기동한다(빌드는 선행 스텝/CI job).
// - 브라우저는 이 환경의 PLAYWRIGHT_BROWSERS_PATH(/opt/pw-browsers)에 설치된 chromium을 자동 인식한다
//   (설치 버전이 이 리비전과 일치 — executablePath 별도 지정 불필요). CI에서는 `playwright install chromium`으로 준비한다.
const PORT = 4173
const BASE_PATH = '/POTIONWORKS/'
const baseURL = `http://localhost:${PORT}${BASE_PATH}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // preview는 dist를 서빙하므로 빌드가 선행돼야 한다(로컬: npm run build, CI: build 스텝).
    command: 'npm run preview -- --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
