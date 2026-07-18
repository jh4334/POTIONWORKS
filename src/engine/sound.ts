// T6.2 사운드 — Web Audio API 오실레이터로 아주 짧은 신스음 2종을 생성한다(외부 파일 없음).
// 규칙: 볼륨(volume 0~1)은 스토어의 진실이고, 여기선 그 값을 setVolume으로 받아 게인에 반영한다(E-3.3).
//   volume===0이면 재생 자체를 건너뛴다(음소거). App이 스토어 volume을 이 모듈에 동기화한다.
//
// AudioContext 정책: 첫 사용자 상호작용 전에는 suspended일 수 있다. play* 함수는 모두
// 사용자 제스처(클릭/구매) 흐름에서 호출되므로, 재생 직전 resume()으로 깨운다.
import { DEFAULT_VOLUME } from '../data/config.ts'

let ctx: AudioContext | null = null
let volume = DEFAULT_VOLUME

// AudioContext는 지연 생성(첫 재생 시). SSR/미지원 환경에서도 모듈 로드가 깨지지 않게 방어.
function getContext(): AudioContext | null {
  if (volume <= 0) return null
  // 닫힌 컨텍스트(탭 정책·모바일 백그라운드로 close된 경우)는 재생성을 유도한다.
  if (ctx && ctx.state === 'closed') ctx = null
  if (ctx) return ctx
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  } catch {
    return null
  }
  return ctx
}

// 하나의 오실레이터로 짧은 톤을 낸다. gain 엔벨로프로 클릭 노이즈 없이 감쇠.
// 전체를 try/catch로 감싼다 — 사운드는 부가 기능이라 어떤 실패든 게임 흐름을 막지 않고 무음으로 넘긴다.
function tone(freq: number, durationMs: number, peak: number, type: OscillatorType): void {
  try {
    const audio = getContext()
    if (!audio) return
    // 정책상 suspended면 깨운다(사용자 제스처 흐름에서 호출되므로 허용됨). 실패는 무시.
    if (audio.state === 'suspended') audio.resume().catch(() => {})

    const now = audio.currentTime
    const dur = durationMs / 1000
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, now)
    // 빠른 어택 + 지수 감쇠(0으로 가면 exponentialRamp가 죽으므로 아주 작은 값으로).
    // 볼륨(0~1)을 피크 게인에 곱한다. 0으로 가면 exponentialRamp가 죽으므로 최소값을 보장한다.
    const peakGain = Math.max(0.0002, peak * volume)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    osc.connect(gain).connect(audio.destination)
    osc.start(now)
    osc.stop(now + dur + 0.02)
  } catch {
    // 무음 실패(미지원·닫힌 컨텍스트·정책 차단 등) — 게임은 계속된다.
  }
}

// 클릭: 짧고 낮은 pop, 낮은 볼륨(연타해도 피곤하지 않게).
export function playClick(): void {
  tone(220, 70, 0.06, 'sine')
}

// 구매/업적: 밝은 딩(살짝 높은 삼각파, 조금 더 길게).
export function playDing(): void {
  tone(880, 160, 0.12, 'triangle')
}

// 스토어의 volume(0~1)을 반영. 0이면 재생 자체를 건너뛴다(음소거). 범위를 벗어난 입력은 클램프.
export function setVolume(next: number): void {
  volume = Number.isFinite(next) ? Math.min(1, Math.max(0, next)) : DEFAULT_VOLUME
}
