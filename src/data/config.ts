// 초기 게임 상태 수치. 규칙(CLAUDE.md): 게임 수치는 코드에 매직넘버로 두지 말고 data/*에 둔다.
// clickPower는 이후 업그레이드(M3)로 성장하는 밸런스 값이라 여기서 출발값을 정의한다.
export const INITIAL_CLICK_POWER = 1

// 게임 tick 주기(ms). DESIGN.md §3: setInterval 100ms.
// 단, 진실은 항상 타임스탬프(lastTick 대비 경과시간) — 인터벌 주기는 신뢰하지 않는다.
export const TICK_INTERVAL_MS = 100

// --- 저장 (T4.1/T4.2) ---
// localStorage 키. 세이브 스키마 버전과 별개로, 키를 바꾸면 기존 세이브를 못 찾는다.
export const SAVE_KEY = 'potionworks-save'
// 손상된 세이브 백업 키(D-1 세이브 파괴 방지). deserialize/migrate 실패 시 원본 raw를 여기 보존한다.
// 최신 1개만 유지 — 초기화되지 않았음을 사용자에게 보여주고 수동 복구를 가능케 한다.
export const SAVE_CORRUPT_KEY = SAVE_KEY + '-corrupt'
// 자동저장 주기(ms). DESIGN.md §3: 10초 자동저장. tick 루프와는 별도 인터벌.
export const AUTOSAVE_INTERVAL_MS = 10_000

// generators 보유수 상한(세이브 정규화용). Infinity 연쇄로 세이브가 오염되는 것을 차단하는 방어 클램프.
// 정상 플레이로는 도달 불가능한 큰 값(1e12).
export const GENERATOR_MAX = 1e12

// --- 오프라인 수익 (T4.3, DESIGN.md §2.6) ---
// 오프라인 인정 시간 상한(ms). 아무리 오래 비워도 이 시간까지만 지급한다(8시간).
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000
// 오프라인 효율. 자리 비운 동안 MPS의 이 비율만 적립(50%).
export const OFFLINE_EFFICIENCY = 0.5
// 오프라인 지급 최소 경과(ms). 이 미만이면 팝업 없이 100%를 조용히 지급한다(60초).
// (D-1.5) 이전엔 이 미만을 통째로 버렸으나, 짧은 부재의 마나 증발을 막기 위해 팝업만 생략하고 지급은 한다.
export const OFFLINE_MIN_MS = 60_000

// --- tick catch-up 캡 (D-1.4) ---
// tick 한 번의 경과가 이 값을 초과하면(탭을 오래 안 닫음·시계 조작), 초과분은 100%가 아니라
// 오프라인 정책(50%/8h 캡)으로 라우팅한다. 캡 이내분만 100% 지급 — 오프라인 우회·시계 악용 차단.
export const MAX_TICK_CATCHUP_MS = 5 * 60_000
// tick elapsed가 이 값보다 작으면(시계 역행·simulate 미래 앵커) 지급 없이 lastTick만 now로 재앵커한다.
// 이 값~0 구간은 기존대로 단순 무시(미세 역행 허용). 재앵커로 simulate 후 생산 정지 버그도 함께 해소된다.
export const TICK_REANCHOR_TOLERANCE_MS = -5000

// --- 각성/프레스티지 (T5.1, DESIGN.md §2.5) ---
// 각성 임계값: 이번 생 누적 마나가 이 값 이상이어야 각성 가능(1e9).
// 스타더스트 = floor(sqrt(누적 마나 / PRESTIGE_THRESHOLD))의 분모이기도 하다.
export const PRESTIGE_THRESHOLD = 1e9
// 각성 진행 게이지 노출 임계(D-2.7 온보딩): 이번 생 누적 마나가 이 값 미만이면 게이지를 숨긴다.
// (초반 5분 신규 유저에게 1B 게이지가 조기 노출돼 혼란을 주던 문제 해소 — U1.)
export const PRESTIGE_HINT_THRESHOLD = 1e6
// 스타더스트 1개당 전체 생산 배율 증가분(+10% → 0.1). 배율 = 1 + stardust × 이 값.
export const STARDUST_MULT_PER = 0.1

// --- 업적 (T6.1, DESIGN.md §2.7) ---
// 업적 1개당 전체 생산 배율 증가분(+1% → 0.01). 배율 = 1 + 달성수 × 이 값.
// 스타더스트 배율과 함께 전체 MPS에 곱해진다(recalcDerived에서 합성).
export const ACHIEVEMENT_MULT_PER = 0.01
// 업적 달성 체크 스로틀(ms). tick에서는 값이 매 프레임 변해도 1초에 1번만 검사한다
// (click/buy/prestige/offline 등 값이 크게 변하는 액션에서는 즉시 검사).
export const ACHIEVEMENT_CHECK_INTERVAL_MS = 1_000
// 업적 토스트 자동 소멸 시간(ms).
export const ACHIEVEMENT_TOAST_MS = 3_000
