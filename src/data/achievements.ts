// 업적 정의 (T6.1, DESIGN.md §2.7). 규칙(CLAUDE.md): 게임 수치는 전부 data/*.
// 조건은 데이터 기술식(discriminated union) — 달성 판정은 engine/formulas.ts 순수 함수가 담당한다.
// 각 업적은 달성 시 전체 생산 +1%(ACHIEVEMENT_MULT_PER, config)를 준다.

// 달성 조건 종류.
export type AchievementCondition =
  // 총 클릭 수(전생 포함 누적, 각성해도 리셋 안 됨) min 이상.
  | { kind: 'clicks'; min: number }
  // 특정 시설(generatorId) 현재 보유 수 min 이상.
  | { kind: 'generatorCount'; generatorId: string; min: number }
  // 전생 포함 총 누적 마나(totalLifetimeMana) min 이상.
  | { kind: 'lifetimeMana'; min: number }
  // 총 각성 횟수 min 이상.
  | { kind: 'prestiges'; min: number }
  // 현재 MPS min 이상.
  | { kind: 'mps'; min: number }

export interface AchievementDef {
  id: string
  name: string
  desc: string // 미달성 시 힌트로도 쓰인다.
  condition: AchievementCondition
}

// 20개 업적 (밸런스 감각 배치, DESIGN.md §2.7).
// 클릭 3 · 견습생 3 · 티어 첫 구매(T2~T6) 5 · 총 누적 마나 4 · MPS 3 · 각성 2 = 20.
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
]

// 알려진 업적 id 집합(세이브 마이그레이션 시 미지의 id를 걸러낸다).
export const KNOWN_ACHIEVEMENT_IDS: ReadonlySet<string> = new Set(ACHIEVEMENTS.map((a) => a.id))
