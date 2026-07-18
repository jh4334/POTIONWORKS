// E-4.3 i18n 문자열 저장소 — UI 표시 문자열을 한 곳에 모은다(라이브러리 없이 단순 모듈).
// 한국어 단일 로케일. 이후 콘텐츠 추가(E-1)가 처음부터 키 기반으로 들어가도록 구조만 준비한다.
//
// 규칙:
//  - 정적 문자열은 그대로 값으로, 보간이 필요하면 함수 값으로 둔다(타입 안전 · 런타임 치환 라이브러리 불요).
//  - 데이터 파일(generators/upgrades/achievements/stardustShop)의 name/desc는 여기로 옮기지 않는다
//    (이미 데이터에 단일 위치로 모여 있음). 단, upgrades.ts의 파생 생성 이름·설명 같은 "템플릿 조립"만
//    여기 함수로 두고 데이터는 파라미터만 넘긴다(upgrade.milestoneName/Desc).
//  - log.* 는 개발자용 콘솔 로그(유저 비노출) — 일관성을 위해 함께 모아둔다.
export const STRINGS = {
  // 공통 버튼/액션.
  common: {
    cancel: '취소',
    confirm: '확인',
    close: '닫기',
  },

  header: {
    mana: (amount: string) => `${amount} 마나`,
    mps: (v: string) => `초당 ${v}`,
    meteorBadgeTitle: '유성 버프 — 생산 폭주 중',
    clickBuffBadgeTitle: '마나 폭풍 — 클릭 폭주 중',
    meteorBadge: (mult: number, remaining: number) => `×${mult} (남은 ${remaining}초)`,
    stardustTitle: (percent: number) => `전체 생산 +${percent}% · 클릭하면 스타더스트 상점`,
    savedAt: (clock: string) => `${clock} 저장됨`,
    statsLabel: '통계',
    achievementsTitle: '업적 목록',
    save: '저장',
    settingsLabel: '설정',
  },

  clicker: {
    cauldronAria: '솥 클릭',
    cauldronLabel: '솥을 저어라',
    perClick: (v: string) => `클릭당 +${v}`,
  },

  generator: {
    listTitle: '생산 시설',
    buyAmountAria: '구매 수량',
    unlockCost: (v: string) => `해금 비용 ${v} 💧`,
    perUnit: (v: string) => `개당 ${v}/s`,
    total: (total: string, percent: string) => `총 ${total}/s (전체의 ${percent}%)`,
    buyAria: (name: string, count: number, cost: string) => `${name} ×${count} 구매, 비용 ${cost} 마나`,
    buyDeltaTitle: (v: string) => `구매 시 +${v}/s`,
    delta: (v: string) => `+${v}/s`,
  },

  upgrade: {
    panelTitle: '업그레이드',
    // 마일스톤(파생 생성) 업그레이드의 이름·설명 템플릿 — 데이터(upgrades.ts)는 파라미터만 넘긴다.
    milestoneName: (genName: string, minOwned: number) => `${genName} 숙련 ${minOwned}`,
    milestoneDesc: (genName: string, mult: number) => `${genName} 생산 ×${mult}`,
  },

  prestige: {
    hintTooltip: (threshold: string) =>
      `누적 ${threshold} 도달 시 각성 — 초기화 대신 영구 생산 보너스를 얻어요`,
    awakenButton: (gain: string) => `✨ 각성 (+${gain} 스타더스트)`,
    nextLine: (progress: string, nextAt: string) => `누적 ${progress} · 다음 ✨+1까지 ${nextAt}`,
    progressLabel: '각성까지 누적 마나',
    nextShort: (nextAt: string) => `다음 ✨+1까지 ${nextAt}`,
    shopButton: '✨ 상점',
    infoAria: '각성이란?',
    infoBody1:
      '각성하면 마나·시설·업그레이드가 초기화되지만, 이번 생 누적 마나에 비례한 스타더스트를 영구히 얻어요.',
    infoBody2: (percent: number) =>
      `스타더스트는 전체 생산을 +${percent}%씩 올리고, 상점에서 시작 부스트·오프라인 강화에도 쓸 수 있어요.`,
    confirmTitle: '각성하시겠어요? ✨',
    confirmLead: '지금 각성하면',
    confirmGain: (gain: string) => `✨+${gain} 스타더스트`,
    firstBonus: (bonus: number) => ` (첫 각성 보너스 +${bonus} 포함)`,
    confirmDelta: (stardust: string, after: string, beforePct: number, afterPct: number) =>
      `✨ ${stardust} → ${after} (생산 +${beforePct}% → +${afterPct}%)`,
    confirmKeep: '각성 후: 마나 · 시설 · 업그레이드 초기화 / 스타더스트 · 상점 · 통계 유지',
    confirmOk: '각성',
  },

  offline: {
    title: '돌아온 걸 환영해요! 🧪',
    bodyLead: '자리 비운 동안',
    bodyTail: ' 마나를 벌었어요.',
    cappedSub: (elapsed: string, capped: string, pct: number) =>
      `${elapsed} 자리 비움 → 최대 ${capped} 정산 · 효율 ${pct}%`,
    sub: (elapsed: string, pct: number) => `${elapsed} 자리 비움 · 효율 ${pct}%`,
  },

  save: {
    title: '세이브 백업',
    copyError: '클립보드 복사에 실패했어요. 직접 선택해 복사해 주세요.',
    importError: '잘못된 백업 문자열이에요. 다시 확인해 주세요.',
    exportLabel: '내보내기 (이 문자열을 보관하세요)',
    copied: '복사됨!',
    copy: '복사',
    importLabel: '불러오기 (백업 문자열을 붙여넣으세요)',
    importPlaceholder: '여기에 붙여넣기…',
    restored: '복원 완료! ✨',
    overwriteWarn: '현재 진행 상황을 덮어씁니다. 한 번 더 누르면 복원돼요.',
    confirmOverwrite: '정말 덮어쓸까요?',
    import: '불러오기',
  },

  settings: {
    title: '설정 ⚙️',
    sound: '사운드',
    muted: '🔇 음소거됨',
    unmuted: '🔊 켜짐',
    backup: '세이브 백업',
    backupButton: '내보내기 / 불러오기',
    reset: '진행 초기화',
    resetConfirm: '정말요? 되돌릴 수 없어요',
    resetButton: '하드 리셋',
    resetWarn:
      '모든 진행(마나·시설·업그레이드·각성·업적)이 삭제됩니다. 초기화 전에 백업 내보내기를 권장해요. 한 번 더 누르면 초기화 후 새로고침돼요.',
    credit: '🧪 포션 공방 방치형 · 만든이 POTIONWORKS',
  },

  stats: {
    title: '통계 📊',
    totalLifetimeMana: '총 누적 마나',
    lifetimeMana: '이번 생 누적 마나',
    totalClicks: '총 클릭',
    totalPrestiges: '각성 횟수',
    stardust: '스타더스트',
    mps: '현재 초당 마나',
    clickPower: '클릭당 획득',
    playtime: '플레이 시간',
    bonusTitle: '생산 보너스 내역',
    bonusAchievement: (count: number) => `업적 (${count}개)`,
    bonusStardust: (count: string) => `스타더스트 (${count}개)`,
  },

  stardustShop: {
    title: '스타더스트 상점 ✨',
    subLead: '보유 스타더스트',
    subTail: ' · 각성해도 유지되는 영구 강화예요.',
    effectStartingApprentices: (n: number) => `각성 시 견습생 ${n}명 보유 시작`,
    effectClickMps: (n: number) => `클릭 = MPS의 +${n}%p`,
    effectOfflineEfficiency: (pct: number) => `오프라인 효율 ${pct}%`,
    effectOfflineCap: (hours: number) => `오프라인 캡 ${hours}시간`,
    maxed: '최대 레벨 달성',
    nextEffect: (label: string) => `다음: ${label}`,
  },

  achievements: {
    title: '업적',
    bonusLead: '업적 보너스:',
    bonusTail: ' 생산',
    lockedName: '???',
    // 숨겨진 업적(E-1.3): 달성 전에는 힌트(desc)·진행도를 숨기고 이 안내만 보여준다.
    hiddenDesc: '숨겨진 업적 — 조건은 비밀이에요',
  },

  error: {
    title: '앗, 문제가 생겼어요 😢',
    body: '화면을 그리는 중 오류가 발생했어요. 진행 데이터는 아래에 안전하게 남아 있어요 — 먼저 내보내기로 백업해 두는 걸 권장해요.',
    saveLabel: '현재 세이브(이 문자열을 보관하세요)',
    savePlaceholder: '저장된 세이브가 없어요.',
    hardReset: '하드리셋',
    reload: '새로고침',
  },

  meteor: {
    aria: '유성 — 클릭하면 마나 폭주 버프',
  },

  // E-1.4 골든 이벤트 — 종류별 접근성 라벨(출현 글리프가 종류에 따라 달라진다).
  goldenEvent: {
    productionAria: '유성 — 클릭하면 생산 폭주 버프',
    clickAria: '먹구름 — 클릭하면 클릭 폭풍 버프',
    dragonAria: '늙은 드래곤 — 클릭하면 마나 즉시 지급',
  },

  titleScreen: {
    sub: '포션 공방 방치형',
    start: '게임 시작',
  },

  toast: {
    achievement: (name: string) => `업적 달성: ${name}`,
    achievementSub: '+1% 생산',
    meteorTitle: '마나 폭주!',
    meteorSub: (seconds: number, mult: number) => `${seconds}초간 생산 ×${mult}`,
    // E-1.4 골든 이벤트 확장 — 마나 폭풍(클릭 버프)·늙은 드래곤(즉시 지급).
    clickStormTitle: '마나 폭풍!',
    clickStormSub: (seconds: number, mult: number) => `${seconds}초간 클릭 ×${mult}`,
    dragonTitle: '늙은 드래곤의 축복!',
    dragonSub: (amount: string) => `${amount} 마나를 선물받았어요`,
  },

  banner: {
    loadFailed: '저장 데이터를 읽지 못했습니다. 원본은 안전하게 백업해 두었어요(초기화되지 않음).',
    saveFailed: '저장이 되지 않고 있어요 — 브라우저 저장공간을 확인하세요.',
  },

  // 기간 표기 조각(오프라인 팝업·통계 플레이시간 공용).
  duration: {
    days: (n: number) => `${n}일`,
    hours: (n: number) => `${n}시간`,
    minutes: (n: number) => `${n}분`,
    seconds: (n: number) => `${n}초`,
  },

  // 개발자용 콘솔 로그(유저 비노출). 일관성을 위해 함께 모아둔다.
  log: {
    save: {
      jsonParseFailed: '[save] JSON 파싱 실패 — 세이브를 무시합니다.',
      notObject: '[save] 세이브가 객체가 아닙니다 — 무시합니다.',
      noVersion: '[save] version 필드가 없습니다 — 무시합니다.',
      unknownVersion: (v: number) => `[save] 알 수 없는 세이브 버전(${v}) — 무시합니다.`,
      invalidSavedAt: '[save] savedAt이 유효하지 않습니다 — 무시합니다.',
      noState: '[save] state가 없습니다 — 무시합니다.',
      nonFiniteSkip: '[save] 상태에 비유한 수치가 있어 저장을 건너뜁니다(마지막 정상 세이브 보호).',
      saveFailed: '[save] localStorage 저장 실패(용량/권한).',
      corruptBackupFailed: '[save] 손상 세이브 백업 실패(용량/권한).',
      accessFailed: '[save] localStorage 접근 실패.',
      removeFailed: '[save] localStorage 삭제 실패.',
      base64Failed: '[save] Base64 디코드 실패 — 잘못된 백업 문자열.',
    },
    cheats: {
      enabled:
        '[cheats] window.cheats 활성화 — addMana(n) · x1000() · simulate(hours) · event(kind?) · meteor() · reset()',
    },
    errorBoundary: {
      caught: '[ErrorBoundary] 렌더 예외를 잡았습니다.',
    },
  },
} as const

// 호출부 간결성을 위한 별칭(판단에 따라 STRINGS/t 어느 쪽이든 일관되게 사용).
export const t = STRINGS
