import { expect, test } from '@playwright/test'

// E-4.2 핵심 시나리오 1파일 스모크. localStorage 시드 없이 실제 UI 경로만 밟는다:
// 타이틀 → 시작 → 클릭 15회 → 견습생 구매 → MPS 표시 → 수동 저장 → 리로드 → 진행 유지
// → (?cheats) addMana(1e9) → 각성(첫 보너스로 +3) → 상점에서 1개 구매. 각 단계 expect.
//
// 표시 문자열은 src/data/strings.ts 기준(한국어 단일 로케일). 셀렉터는 접근성 역할/라벨과 클래스를 섞어 쓴다.

test('스모크: 타이틀 → 플레이 → 저장/리로드 → 각성 → 상점 구매', async ({ page }) => {
  // 각 테스트는 새 브라우저 컨텍스트(빈 localStorage)라 최초 방문 = 타이틀 노출.
  await page.goto('./')

  // 1) 타이틀 → 게임 시작.
  const startButton = page.getByRole('button', { name: '게임 시작' })
  await expect(startButton).toBeVisible()
  await startButton.click()

  // 게임 화면 진입 — 솥 버튼이 보인다.
  const cauldron = page.getByRole('button', { name: '솥 클릭' })
  await expect(cauldron).toBeVisible()

  // 2) 클릭 15회 → 마나 15(클릭당 1). 견습생 1개 가격(15)에 딱 닿는다.
  for (let i = 0; i < 15; i += 1) await cauldron.click()
  await expect(page.locator('.header-mana')).toContainText('15')

  // 3) 견습생(첫 시설) 구매. 구매 버튼은 "견습생 …구매…" aria-label.
  const buyApprentice = page.getByRole('button', { name: /견습생.*구매/ })
  await expect(buyApprentice).toBeVisible()
  await buyApprentice.click()

  // 4) MPS 표시 확인 — 견습생 0.1/s가 헤더에 반영(더 이상 "초당 0"이 아님).
  const mps = page.locator('.header-mps')
  await expect(mps).not.toHaveText('초당 0')
  await expect(mps).toContainText('0.1')

  // 5) 수동 저장 → "저장됨" 시각 표시.
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.locator('.header-saved-at')).toBeVisible()

  // 6) 리로드 → 타이틀 스킵(세이브 존재), 게임 화면 복귀.
  await page.reload()
  await expect(cauldron).toBeVisible()

  // 7) 진행 유지 — 견습생 생산이 살아 있어 MPS가 0이 아니다(세이브 복원 확인).
  await expect(page.locator('.header-mps')).toContainText('0.1')

  // 8) 치트 활성화(?cheats) 후 addMana(1e9)로 각성 임계(누적 1e9) 도달.
  await page.goto('./?cheats')
  await expect(cauldron).toBeVisible()
  await page.waitForFunction(() => typeof (window as unknown as { cheats?: unknown }).cheats === 'object')
  await page.evaluate(() => {
    ;(window as unknown as { cheats: { addMana: (n: number) => void } }).cheats.addMana(1e9)
  })

  // 9) 각성 — 첫 각성 보너스로 총 +3 스타더스트(기본 1 + 첫 보너스 2). 버튼에 "+3"이 표시된다.
  const awaken = page.locator('.prestige-button')
  await expect(awaken).toBeVisible()
  await expect(awaken).toContainText('+3')
  await awaken.click()

  // 확인 모달의 "각성"(정확히 일치)로 실행.
  await page.getByRole('button', { name: '각성', exact: true }).click()

  // 각성 결과: 스타더스트 3 보유(헤더 배지 ✨ 3).
  const stardustBadge = page.locator('.header-stardust')
  await expect(stardustBadge).toContainText('3')

  // 10) 스타더스트 상점 진입 → 가장 싼 항목(견습 마법사단, 1) 구매 → 레벨 1.
  await stardustBadge.click()
  const shopCard = page.getByRole('button', { name: /견습 마법사단/ })
  await expect(shopCard).toBeVisible()
  await shopCard.click()
  await expect(shopCard).toContainText('Lv.1')
})
