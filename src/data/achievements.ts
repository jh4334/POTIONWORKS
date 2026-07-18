// 업적 정의 (T6.1 · E-1.3, DESIGN.md §2.7). 규칙(CLAUDE.md): 게임 수치는 전부 data/*.
// 조건은 데이터 기술식(discriminated union) — 달성 판정은 engine/formulas.ts 순수 함수가 담당한다.
// 각 업적은 달성 시 전체 생산 +1%(ACHIEVEMENT_MULT_PER, config)를 준다.

import type { GeneratorId } from './generators.ts'

// 달성 조건 종류. 시설 참조(generatorId)는 GeneratorId로 좁혀 오타를 컴파일 단계에서 잡는다(D-5.1).
// 모든 조건은 min(임계값)을 가진다 — 미달성 진행도(achievementCurrent)와 목표(condition.min)에 공용으로 쓴다.
export type AchievementCondition =
  // 총 클릭 수(전생 포함 누적, 각성해도 리셋 안 됨) min 이상.
  | { kind: 'clicks'; min: number }
  // 특정 시설(generatorId) 현재 보유 수 min 이상.
  | { kind: 'generatorCount'; generatorId: GeneratorId; min: number }
  // 전생 포함 총 누적 마나(totalLifetimeMana) min 이상.
  | { kind: 'lifetimeMana'; min: number }
  // 총 각성 횟수 min 이상.
  | { kind: 'prestiges'; min: number }
  // 현재 MPS min 이상.
  | { kind: 'mps'; min: number }
  // 현재 보유 스타더스트 min 이상(E-1.3).
  | { kind: 'stardust'; min: number }
  // 총 플레이 시간(ms) min 이상(E-1.3).
  | { kind: 'playtime'; min: number }
  // 골든 이벤트(유성 등) 클릭 누적 횟수 min 이상(E-1.3).
  | { kind: 'meteorsClicked'; min: number }
  // --- 숨겨진 업적 전용 조건(E-1.3) ---
  // 각성 확인 모달 취소 누적 횟수 min 이상.
  | { kind: 'prestigeCancels'; min: number }
  // 음소거 상태로 누적한 플레이 시간(ms) min 이상.
  | { kind: 'mutedPlaytime'; min: number }
  // 1초 콤보 창 안에서 이어친 솥 클릭 콤보 min 이상.
  | { kind: 'clickCombo'; min: number }
  // 늙은 드래곤 방문(골든 이벤트) 받은 누적 횟수 min 이상.
  | { kind: 'dragonVisits'; min: number }

export interface AchievementDef {
  id: string
  name: string
  desc: string // 미달성 시 힌트로도 쓰인다(숨겨진 업적은 예외 — 아래 hidden 참고).
  condition: AchievementCondition
  // 숨겨진 업적(E-1.3): 달성 전에는 목록에서 이름/힌트/진행도를 숨긴다("???"). 달성하면 일반 업적처럼 노출.
  // 조건이 행동 기반(취소·음소거·콤보·드래곤)이라 힌트를 주면 재미가 반감되므로 비표시한다.
  hidden?: boolean
}

// 40개 업적 (E-1.3에서 20 → 40 확장). 기존 20개 유지 + 신규 20개(숨겨진 4 포함).
export const ACHIEVEMENTS: AchievementDef[] = [
  // 클릭 3종
  { id: 'clicks-100', name: '첫 젓기', desc: '솥을 100번 저었다', condition: { kind: 'clicks', min: 100 } },
  { id: 'clicks-1000', name: '손에 익은 국자', desc: '솥을 1,000번 저었다', condition: { kind: 'clicks', min: 1_000 } },
  { id: 'clicks-10000', name: '젓기의 달인', desc: '솥을 10,000번 저었다', condition: { kind: 'clicks', min: 10_000 } },

  // 견습생 3종
  { id: 'apprentice-1', name: '첫 제자', desc: '견습생 1명을 고용했다', condition: { kind: 'generatorCount', generatorId: 'apprentice', min: 1 } },
  { id: 'apprentice-50', name: '작은 학원', desc: '견습생 50명을 고용했다', condition: { kind: 'generatorCount', generatorId: 'apprentice', min: 50 } },
  { id: 'apprentice-100', name: '마법 학교', desc: '견습생 100명을 고용했다', condition: { kind: 'generatorCount', generatorId: 'apprentice', min: 100 } },

  // 각 티어 첫 구매 T2~T6 5종
  { id: 'cauldron-1', name: '끓기 시작', desc: '마법 솥을 처음 구매했다', condition: { kind: 'generatorCount', generatorId: 'cauldron', min: 1 } },
  { id: 'herbGarden-1', name: '약초 재배', desc: '허브 정원을 처음 구매했다', condition: { kind: 'generatorCount', generatorId: 'herbGarden', min: 1 } },
  { id: 'runeCircle-1', name: '문양을 새기다', desc: '마법진을 처음 구매했다', condition: { kind: 'generatorCount', generatorId: 'runeCircle', min: 1 } },
  { id: 'spiritPact-1', name: '정령과의 약속', desc: '정령 계약을 처음 맺었다', condition: { kind: 'generatorCount', generatorId: 'spiritPact', min: 1 } },
  { id: 'dragonNest-1', name: '용을 깨우다', desc: '드래곤 둥지를 처음 구매했다', condition: { kind: 'generatorCount', generatorId: 'dragonNest', min: 1 } },

  // 총 누적 마나 4종
  { id: 'mana-1e6', name: '백만장자', desc: '누적 마나 1M 달성', condition: { kind: 'lifetimeMana', min: 1e6 } },
  { id: 'mana-1e9', name: '억만금', desc: '누적 마나 1B 달성', condition: { kind: 'lifetimeMana', min: 1e9 } },
  { id: 'mana-1e12', name: '마나의 바다', desc: '누적 마나 1T 달성', condition: { kind: 'lifetimeMana', min: 1e12 } },
  { id: 'mana-1e15', name: '무한한 흐름', desc: '누적 마나 1000T 달성', condition: { kind: 'lifetimeMana', min: 1e15 } },

  // MPS 3종
  { id: 'mps-100', name: '자동화의 시작', desc: '초당 마나 100 돌파', condition: { kind: 'mps', min: 100 } },
  { id: 'mps-10000', name: '공장 가동', desc: '초당 마나 10,000 돌파', condition: { kind: 'mps', min: 10_000 } },
  { id: 'mps-1000000', name: '마나 대폭포', desc: '초당 마나 1,000,000 돌파', condition: { kind: 'mps', min: 1_000_000 } },

  // 각성 2종
  { id: 'prestige-1', name: '첫 각성', desc: '처음으로 각성했다', condition: { kind: 'prestiges', min: 1 } },
  { id: 'prestige-5', name: '윤회의 고리', desc: '5번 각성했다', condition: { kind: 'prestiges', min: 5 } },

  // --- E-1.3 신규 20종 ---
  // 신규 티어 T7~T8 (현자의 탑 1/25, 시공 균열 1/25) 4종
  { id: 'sageTower-1', name: '지혜의 첨탑', desc: '현자의 탑을 처음 세웠다', condition: { kind: 'generatorCount', generatorId: 'sageTower', min: 1 } },
  { id: 'sageTower-25', name: '현자들의 회랑', desc: '현자의 탑 25개를 세웠다', condition: { kind: 'generatorCount', generatorId: 'sageTower', min: 25 } },
  { id: 'riftGate-1', name: '시공을 열다', desc: '시공 균열을 처음 열었다', condition: { kind: 'generatorCount', generatorId: 'riftGate', min: 1 } },
  { id: 'riftGate-25', name: '차원의 지배자', desc: '시공 균열 25개를 열었다', condition: { kind: 'generatorCount', generatorId: 'riftGate', min: 25 } },

  // 누적 마나 상위 2종 (1.00aa = 1e18, 1e21)
  { id: 'mana-1e18', name: '마나의 신화', desc: '누적 마나 1.00aa 달성', condition: { kind: 'lifetimeMana', min: 1e18 } },
  { id: 'mana-1e21', name: '천문학적 부', desc: '누적 마나 1.00ab 달성', condition: { kind: 'lifetimeMana', min: 1e21 } },

  // MPS 상위 2종 (1e8, 1e10)
  { id: 'mps-1e8', name: '마나 범람', desc: '초당 마나 100M 돌파', condition: { kind: 'mps', min: 1e8 } },
  { id: 'mps-1e10', name: '마나 특이점', desc: '초당 마나 10B 돌파', condition: { kind: 'mps', min: 1e10 } },

  // 각성 상위 2종 (10회, 25회)
  { id: 'prestige-10', name: '거듭된 환생', desc: '10번 각성했다', condition: { kind: 'prestiges', min: 10 } },
  { id: 'prestige-25', name: '영원의 순례자', desc: '25번 각성했다', condition: { kind: 'prestiges', min: 25 } },

  // 스타더스트 보유 2종 (25, 100)
  { id: 'stardust-25', name: '별먼지 수집가', desc: '스타더스트 25개를 모았다', condition: { kind: 'stardust', min: 25 } },
  { id: 'stardust-100', name: '별의 주인', desc: '스타더스트 100개를 모았다', condition: { kind: 'stardust', min: 100 } },

  // 클릭 상위 1종 (50,000)
  { id: 'clicks-50000', name: '무쇠 손목', desc: '솥을 50,000번 저었다', condition: { kind: 'clicks', min: 50_000 } },

  // 총 플레이 시간 1종 (10시간)
  { id: 'playtime-10h', name: '헌신적인 공방장', desc: '총 10시간을 플레이했다', condition: { kind: 'playtime', min: 10 * 60 * 60 * 1000 } },

  // 골든 이벤트(유성) 클릭 2종 (5회, 25회)
  { id: 'meteors-5', name: '유성 사냥꾼', desc: '골든 이벤트를 5번 잡았다', condition: { kind: 'meteorsClicked', min: 5 } },
  { id: 'meteors-25', name: '하늘의 지배자', desc: '골든 이벤트를 25번 잡았다', condition: { kind: 'meteorsClicked', min: 25 } },

  // --- 숨겨진 업적 4종(E-1.3): 달성 전 "???" 표시, 힌트·진행도 비표시. 모두 행동 기반 이스터에그. ---
  {
    id: 'hidden-prestige-cancels',
    name: '미련의 대가',
    desc: '각성 확인 창을 세 번이나 닫았다 — 아직 놓아줄 준비가 안 됐다',
    condition: { kind: 'prestigeCancels', min: 3 },
    hidden: true,
  },
  {
    id: 'hidden-silent-workshop',
    name: '고요한 공방',
    desc: '음소거 상태로 1시간을 조용히 일했다',
    condition: { kind: 'mutedPlaytime', min: 60 * 60 * 1000 },
    hidden: true,
  },
  {
    id: 'hidden-storm-stir',
    name: '폭풍 젓기',
    desc: '한 콤보에 솥을 100번 연타했다',
    condition: { kind: 'clickCombo', min: 100 },
    hidden: true,
  },
  {
    id: 'hidden-dragon-guest',
    name: '용의 영접',
    desc: '늙은 드래곤의 방문을 받았다',
    condition: { kind: 'dragonVisits', min: 1 },
    hidden: true,
  },
]

// 알려진 업적 id 집합(세이브 마이그레이션 시 미지의 id를 걸러낸다).
export const KNOWN_ACHIEVEMENT_IDS: ReadonlySet<string> = new Set(ACHIEVEMENTS.map((a) => a.id))
