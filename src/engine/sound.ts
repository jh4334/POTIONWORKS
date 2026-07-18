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
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
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
// 앰비언트가 실행 중이면 마스터 게인도 함께 갱신한다 — 볼륨 슬라이더가 배경음 크기에 즉시 반영된다(E-4.4).
export function setVolume(next: number): void {
  volume = Number.isFinite(next) ? Math.min(1, Math.max(0, next)) : DEFAULT_VOLUME
  if (ambient) {
    try {
      const audio = getContext()
      if (audio) ambient.gain.gain.setValueAtTime(ambientGainValue(), audio.currentTime)
    } catch {
      // 게인 갱신 실패는 무시(다음 start에서 정상값으로 재생성).
    }
  }
}

// --- 앰비언트 배경음(E-4.4) ---
// Web Audio 합성만으로 은은한 "보글보글" 루프를 만든다: 브라운 노이즈 루프 + lowpass 필터(200~400Hz LFO 스윕)
// + 매우 낮은 마스터 게인(volume × 0.15) + 랜덤 간격(2~5s)의 짧은 버블 팝(사인 80→300Hz, 0.1s).
// 노이즈 버퍼는 한 번만 생성해 캐시하고, 실행 중엔 그래프를 유지·재사용한다(탭 백그라운드 과부하 방지).
// 재생 정책은 App이 결정한다(게임 화면 · volume>0 · ambientOn). 여기선 start/stop만 제공한다.
const AMBIENT_MASTER_SCALE = 0.15 // 마스터 게인 = volume × 이 값(아주 낮게 — 배경에 은은히).
const AMBIENT_FILTER_CENTER = 300 // lowpass 컷오프 중심(Hz). LFO가 ±DEPTH로 스윕한다.
const AMBIENT_FILTER_DEPTH = 100 // 컷오프 스윕 폭(Hz) → 200~400Hz 사이 일렁임.
const AMBIENT_LFO_HZ = 0.13 // 컷오프 스윕 속도(약 8초 주기) — 느린 물결.
const BUBBLE_MIN_MS = 2000 // 버블 팝 최소 간격.
const BUBBLE_MAX_MS = 5000 // 버블 팝 최대 간격.
const BUBBLE_FROM_HZ = 80 // 버블 팝 시작 주파수.
const BUBBLE_TO_HZ = 300 // 버블 팝 종료 주파수(짧게 위로 스윕).
const BUBBLE_DURATION = 0.1 // 버블 팝 길이(초).
const BUBBLE_PEAK_SCALE = 0.08 // 버블 팝 피크 게인 = volume × 이 값.

interface AmbientNodes {
  source: AudioBufferSourceNode
  filter: BiquadFilterNode
  gain: GainNode
  lfo: OscillatorNode
  lfoGain: GainNode
}

let ambient: AmbientNodes | null = null
let bubbleTimer: ReturnType<typeof setTimeout> | null = null
let noiseBuffer: AudioBuffer | null = null

// 앰비언트 마스터 게인값(volume × 스케일). volume===0이면 0(무음) — 정책상 그 전에 stop되지만 방어적으로.
function ambientGainValue(): number {
  return volume * AMBIENT_MASTER_SCALE
}

// 브라운 노이즈 버퍼(2초 루프). 백색 노이즈를 적분(누적)해 저역을 강조 — 물 흐르는 듯한 베이스.
// 샘플레이트별로 한 번만 만들어 캐시한다(재생성 비용·GC 방지).
function makeNoiseBuffer(audio: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === audio.sampleRate) return noiseBuffer
  const seconds = 2
  const len = Math.floor(audio.sampleRate * seconds)
  const buf = audio.createBuffer(1, len, audio.sampleRate)
  const data = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i += 1) {
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) / 1.02 // 1차 적분(저역 통과) → 브라운 노이즈 근사.
    data[i] = last * 3.5 // 진폭 보정(적분으로 작아진 신호를 원복).
  }
  noiseBuffer = buf
  return buf
}

// 짧은 버블 팝 1회(사인 80→300Hz 스윕, 0.1s). 실행 중일 때만 다음 팝을 랜덤 간격으로 재예약한다.
// setTimeout은 백그라운드 탭에서 스로틀되므로 과부하가 없다(팝은 순수 연출 트리거).
function playBubble(): void {
  try {
    const audio = getContext()
    if (!audio || !ambient) return
    if (audio.state === 'suspended') audio.resume().catch(() => {})
    const now = audio.currentTime
    const osc = audio.createOscillator()
    const g = audio.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(BUBBLE_FROM_HZ, now)
    osc.frequency.exponentialRampToValueAtTime(BUBBLE_TO_HZ, now + BUBBLE_DURATION)
    const peak = Math.max(0.0002, volume * BUBBLE_PEAK_SCALE)
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(peak, now + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, now + BUBBLE_DURATION)
    osc.connect(g).connect(audio.destination)
    osc.start(now)
    osc.stop(now + BUBBLE_DURATION + 0.02)
  } catch {
    // 팝 실패는 무시(배경음 본체는 계속 흐른다).
  }
}

function scheduleBubble(): void {
  const delay = BUBBLE_MIN_MS + Math.random() * (BUBBLE_MAX_MS - BUBBLE_MIN_MS)
  bubbleTimer = setTimeout(() => {
    playBubble()
    if (ambient) scheduleBubble() // 실행 중일 때만 계속 예약.
  }, delay)
}

// 앰비언트 시작(멱등). 이미 실행 중이면 아무것도 하지 않는다(그래프 재사용). volume<=0이면 getContext가 null이라
// 자연히 무동작 — 재생 정책은 App이 판단해 호출한다. suspended면 resume(첫 제스처 전 정책, 기존 패턴 재사용).
export function startAmbient(): void {
  try {
    const audio = getContext()
    if (!audio) return
    if (audio.state === 'suspended') audio.resume().catch(() => {})
    if (ambient) return
    const now = audio.currentTime
    const source = audio.createBufferSource()
    source.buffer = makeNoiseBuffer(audio)
    source.loop = true
    const filter = audio.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(AMBIENT_FILTER_CENTER, now)
    // LFO로 컷오프를 200~400Hz 사이에서 느리게 스윕 → 보글보글의 일렁임.
    const lfo = audio.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.setValueAtTime(AMBIENT_LFO_HZ, now)
    const lfoGain = audio.createGain()
    lfoGain.gain.setValueAtTime(AMBIENT_FILTER_DEPTH, now)
    lfo.connect(lfoGain).connect(filter.frequency)
    const gain = audio.createGain()
    gain.gain.setValueAtTime(ambientGainValue(), now)
    source.connect(filter).connect(gain).connect(audio.destination)
    source.start()
    lfo.start()
    ambient = { source, filter, gain, lfo, lfoGain }
    scheduleBubble()
  } catch {
    // 앰비언트 실패(미지원·정책 차단 등)는 무시 — 게임은 계속된다.
  }
}

// 앰비언트 정지. 노드를 멈추고 끊어 누수를 막는다. 버블 예약 타이머도 해제한다.
export function stopAmbient(): void {
  if (bubbleTimer !== null) {
    clearTimeout(bubbleTimer)
    bubbleTimer = null
  }
  if (!ambient) return
  const nodes = ambient
  ambient = null // 먼저 비워 예약 콜백이 재예약하지 않게 한다.
  try {
    nodes.source.stop()
    nodes.lfo.stop()
    nodes.source.disconnect()
    nodes.filter.disconnect()
    nodes.gain.disconnect()
    nodes.lfo.disconnect()
    nodes.lfoGain.disconnect()
  } catch {
    // 이미 멈춘 노드 등 — 무시.
  }
}
