// E-3.2 세이브 슬롯 오케스트레이션. 슬롯 키 관리·직렬화는 save.ts, 상태는 스토어, 여기선 그걸 엮는다.
//  - listSlots(): 슬롯별 요약(존재 여부·저장 시각·누적 마나·플레이 시간) — 세이브 파싱은 migrate 재사용.
//  - switchSlot(n): 현재 진행을 저장한 뒤 활성 슬롯을 바꾸고 리로드(리로드가 loadGame으로 새 슬롯을 읽는다).
//  - deleteSlot(n)은 save.ts에서 그대로 재노출(확인은 UI에서).
import { useGameStore } from '../store/gameStore.ts'
import { saveNow, hadSaveOnLoad, suspendAutosave } from './autosave.ts'
import {
  deserialize,
  readSlotRaw,
  activeSlot,
  setActiveSlot,
  deleteSlot as deleteSlotKey,
} from './save.ts'
import { SAVE_SLOT_COUNT } from '../data/config.ts'

export { activeSlot, deleteSlotKey as deleteSlot }

// 리로드 후 타이틀 화면을 건너뛰고 곧장 게임으로 들어가기 위한 세션 플래그(슬롯 전환/새 게임 시작 시 세팅).
// sessionStorage는 리로드에도 유지되므로, 전환 직후 첫 렌더에서 App이 이를 소비해 타이틀을 스킵한다.
const ENTER_FLAG = 'potionworks-enter-slot'

// 슬롯 요약 정보. 빈 슬롯은 exists=false. 손상 슬롯은 exists=true이되 요약값은 null/0(안내만).
export interface SlotInfo {
  slot: number
  exists: boolean
  savedAt: number | null
  totalLifetimeMana: number
  playtimeMs: number
}

// 3개 슬롯의 요약을 만든다. 원본을 deserialize(=migrate)해 스키마 차이와 무관하게 요약값을 뽑는다.
export function listSlots(): SlotInfo[] {
  const out: SlotInfo[] = []
  for (let n = 1; n <= SAVE_SLOT_COUNT; n += 1) {
    const raw = readSlotRaw(n)
    if (raw === null) {
      out.push({ slot: n, exists: false, savedAt: null, totalLifetimeMana: 0, playtimeMs: 0 })
      continue
    }
    const save = deserialize(raw)
    if (save === null) {
      // 손상 슬롯: 존재하지만 요약 불가(빈 카드로 덮어써 데이터를 잃지 않도록 exists=true로 둔다).
      out.push({ slot: n, exists: true, savedAt: null, totalLifetimeMana: 0, playtimeMs: 0 })
      continue
    }
    out.push({
      slot: n,
      exists: true,
      savedAt: save.savedAt,
      totalLifetimeMana: save.state.totalLifetimeMana,
      playtimeMs: save.state.playtimeMs,
    })
  }
  return out
}

// 활성 슬롯을 n으로 바꾸고 리로드. save=true면 전환 전에 현재 진행을 저장한다(진행 유실 방지).
function enterSlot(n: number, save: boolean): void {
  if (save) saveNow()
  // 활성 슬롯을 바꾼 뒤에는 어떤 저장도 금지 — reload가 발화시키는 pagehide 저장이
  // 현재(이전 슬롯) 상태를 새 활성 슬롯에 흘려 넣는 것을 막는다(하드리셋과 동일한 경합 방지).
  suspendAutosave()
  setActiveSlot(n)
  try {
    sessionStorage.setItem(ENTER_FLAG, '1') // 리로드 후 타이틀 스킵(곧장 게임으로)
  } catch {
    /* 세션 저장 실패해도 전환은 진행(타이틀만 한 번 더 뜰 수 있음) */
  }
  window.location.reload()
}

// 슬롯 전환(현재 저장 후 전환+리로드). 진행이 있으면 현재 슬롯에 저장한 뒤 전환한다 —
// 빈 새 게임 화면에서 다른 슬롯을 고를 땐 유령 저장을 만들지 않도록 진행 유무로 저장을 가른다.
export function switchSlot(n: number): void {
  const s = useGameStore.getState()
  const hasProgress =
    hadSaveOnLoad() || s.totalLifetimeMana > 0 || s.totalClicks > 0 || s.stardust > 0
  enterSlot(n, hasProgress)
}

// 리로드 후 첫 렌더에서 1회 소비: 슬롯 전환/새 게임 진입이면 타이틀을 건너뛴다.
export function consumeEnterFlag(): boolean {
  try {
    const has = sessionStorage.getItem(ENTER_FLAG) !== null
    if (has) sessionStorage.removeItem(ENTER_FLAG)
    return has
  } catch {
    return false
  }
}
