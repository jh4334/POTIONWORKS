// 초기 게임 상태 수치. 규칙(CLAUDE.md): 게임 수치는 코드에 매직넘버로 두지 말고 data/*에 둔다.
// clickPower는 이후 업그레이드(M3)로 성장하는 밸런스 값이라 여기서 출발값을 정의한다.
export const INITIAL_CLICK_POWER = 1

// 게임 tick 주기(ms). DESIGN.md §3: setInterval 100ms.
// 단, 진실은 항상 타임스탬프(lastTick 대비 경과시간) — 인터벌 주기는 신뢰하지 않는다.
export const TICK_INTERVAL_MS = 100
