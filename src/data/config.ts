// 초기 게임 상태 수치. 규칙(CLAUDE.md): 게임 수치는 코드에 매직넘버로 두지 말고 data/*에 둔다.
// clickPower는 이후 업그레이드(M3)로 성장하는 밸런스 값이라 여기서 출발값을 정의한다.
export const INITIAL_CLICK_POWER = 1

// 게임 tick 주기(ms). DESIGN.md §3: setInterval 100ms.
// 단, 진실은 항상 타임스탬프(lastTick 대비 경과시간) — 인터벌 주기는 신뢰하지 않는다.
export const TICK_INTERVAL_MS = 100

// --- 저장 (T4.1/T4.2) ---
// localStorage 키. 세이브 스키마 버전과 별개로, 키를 바꾸면 기존 세이브를 못 찾는다.
export const SAVE_KEY = 'potionworks-save'
// 자동저장 주기(ms). DESIGN.md §3: 10초 자동저장. tick 루프와는 별도 인터벌.
export const AUTOSAVE_INTERVAL_MS = 10_000

// --- 오프라인 수익 (T4.3, DESIGN.md §2.6) ---
// 오프라인 인정 시간 상한(ms). 아무리 오래 비워도 이 시간까지만 지급한다(8시간).
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000
// 오프라인 효율. 자리 비운 동안 MPS의 이 비율만 적립(50%).
export const OFFLINE_EFFICIENCY = 0.5
// 오프라인 지급 최소 경과(ms). 이 미만이면 팝업도 지급도 생략한다(60초).
// 짧은 부재는 무시(로드 시 lastTick을 now로 당기므로 별도 catch-up 없음) — 단순·안전 우선.
export const OFFLINE_MIN_MS = 60_000

// --- 각성/프레스티지 (T5.1, DESIGN.md §2.5) ---
// 각성 임계값: 이번 생 누적 마나가 이 값 이상이어야 각성 가능(1e9).
// 스타더스트 = floor(sqrt(누적 마나 / PRESTIGE_THRESHOLD))의 분모이기도 하다.
export const PRESTIGE_THRESHOLD = 1e9
// 스타더스트 1개당 전체 생산 배율 증가분(+10% → 0.1). 배율 = 1 + stardust × 이 값.
export const STARDUST_MULT_PER = 0.1
