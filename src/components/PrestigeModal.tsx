import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGameStore } from '../store/gameStore.ts'
import { nextStardustAt, prestigeGain } from '../engine/formulas.ts'
import {
  PRESTIGE_THRESHOLD,
  PRESTIGE_HINT_THRESHOLD,
  STARDUST_MULT_PER,
  FIRST_PRESTIGE_BONUS,
} from '../data/config.ts'
import { CHALLENGES, challengeById } from '../data/challenges.ts'
import { formatNumber } from '../utils/format.ts'
import { saveNow } from '../engine/autosave.ts'
import { STRINGS } from '../data/strings.ts'
import Modal from './Modal.tsx'
import StardustShopModal from './StardustShopModal.tsx'

// T5.1 각성(프레스티지) + D-3 리워크 + E-2.2 챌린지. 좌측 클릭 패널 하단에 배치.
// - 누적 마나가 힌트 임계(1e6) 미만이면 게이지 자체를 숨긴다(D-2.7 온보딩 — 조기 노출 혼란 방지).
// - 힌트 임계~각성 임계 사이면 진행 게이지 + 툴팁 + "다음 ✨+1까지" 목표.
// - 각성 가능하면 버튼 → 확인 모달(Modal, 전후 합계 + 챌린지 선택) → 실행. 실행 직후 즉시 저장.
// - 진행 중 챌린지는 배지(아이콘·이름·타이머·포기)로 표시한다(E-2.2).
// lifetimeMana 원시값은 매 tick(100ms) 소수점 단위로 변하므로 직접 구독하지 않는다.
// 대신 파생 문자열·정수만 구독한다(리렌더 규율).

// 스타더스트 N개가 주는 생산 보너스 퍼센트(+N0%). 수치는 config(STARDUST_MULT_PER)에서.
function bonusPercent(stardust: number): number {
  return Math.round(stardust * STARDUST_MULT_PER * 100)
}

// ms → "H:MM:SS"(1시간 이상) / "M:SS". timed 챌린지 남은 시간(최대 2시간) 표시용.
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = s.toString().padStart(2, '0')
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${ss}`
  return `${m}:${ss}`
}

// 게이지 툴팁(사전 설명, U7·U1). 각성 임계값은 config에서 파생 포맷.
const HINT_TOOLTIP = STRINGS.prestige.hintTooltip(formatNumber(PRESTIGE_THRESHOLD))

// 진행 중 챌린지 배지: 아이콘·이름·(timed면 남은 시간) + 포기 버튼(2단계 확인). 남은 시간은 1초 인터벌 표시.
function ChallengeBadge({ id, startedAt }: { id: string; startedAt: number }) {
  const abandonChallenge = useGameStore((s) => s.abandonChallenge)
  const [confirmAbandon, setConfirmAbandon] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const def = challengeById(id)
  const timed = def?.constraint === 'timed'
  useEffect(() => {
    if (!timed) return
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [timed])
  if (!def) return null
  const remaining = timed ? (def.timeLimitMs ?? 0) - (now - startedAt) : 0
  return (
    <div className="challenge-badge">
      <span className="challenge-badge-main">
        <span className="challenge-badge-icon">{def.icon}</span>
        <span className="challenge-badge-name">{STRINGS.challenge.activeBadge(def.name)}</span>
        {timed && (
          <span className="challenge-badge-timer">
            {STRINGS.challenge.timedRemaining(formatDuration(remaining))}
          </span>
        )}
      </span>
      <button
        type="button"
        className={`challenge-abandon${confirmAbandon ? ' confirm' : ''}`}
        onClick={() => {
          if (!confirmAbandon) {
            setConfirmAbandon(true)
            return
          }
          abandonChallenge()
          setConfirmAbandon(false)
        }}
      >
        {confirmAbandon ? STRINGS.challenge.abandonConfirm : STRINGS.challenge.abandon}
      </button>
    </div>
  )
}

export default function PrestigeModal() {
  // 진행도 표시용: 정수 내림 후 포맷한 문자열만 구독(소수점 변화로 리렌더되지 않도록).
  const progressText = useGameStore((s) => formatNumber(Math.floor(s.lifetimeMana)))
  // 진행 게이지 채움 정수 퍼센트(0~100). 1%p 단위로만 바뀌므로 tick마다 리렌더되지 않는다.
  const pct = useGameStore((s) => Math.min(100, Math.floor((s.lifetimeMana / PRESTIGE_THRESHOLD) * 100)))
  // 게이지 노출 여부(힌트 임계 도달). 임계 전에는 게이지 자체를 숨긴다.
  const showHint = useGameStore((s) => s.lifetimeMana >= PRESTIGE_HINT_THRESHOLD)
  // 임계 도달 불리언: 임계 전후로만 값이 바뀜.
  const reachedThreshold = useGameStore((s) => s.lifetimeMana >= PRESTIGE_THRESHOLD)
  // 미리보기 N = 지금 각성 시 얻는 스타더스트(첫 각성 보너스 포함, 정수). 드물게 변함.
  const gain = useGameStore((s) => prestigeGain(s.lifetimeMana, s.totalPrestiges))
  // 다음 정수 스타더스트를 얻는 데 필요한 누적 마나(문자열). 정수 경계에서만 바뀐다.
  const nextAtText = useGameStore((s) => formatNumber(nextStardustAt(s.lifetimeMana)))
  // 현재 보유 스타더스트 + 각성 횟수: 확인 모달 전후 합계·상점 진입 조건·첫 각성 보너스 표기.
  const stardust = useGameStore((s) => s.stardust)
  const totalPrestiges = useGameStore((s) => s.totalPrestiges)
  const prestige = useGameStore((s) => s.prestige)
  const cancelPrestige = useGameStore((s) => s.cancelPrestige)
  // 챌린지 상태(E-2.2): 진행 중(객체 참조 — 챌린지 변경 시에만 바뀜)·완료 목록(shallow).
  const activeChallenge = useGameStore((s) => s.activeChallenge)
  const completedChallenges = useGameStore(useShallow((s) => s.completedChallenges))

  const [showConfirm, setShowConfirm] = useState(false)
  const [showShop, setShowShop] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  // 확인 모달에서 선택한 시작 챌린지 id(없으면 일반 각성).
  const [selectedChallenge, setSelectedChallenge] = useState<string | null>(null)

  // N=0이면 버튼 비활성(모달까지 안 감).
  const canPrestige = reachedThreshold && gain > 0
  // 상점 진입: 스타더스트 보유>0 또는 각성 1회 이상일 때 노출.
  const showShopEntry = stardust > 0 || totalPrestiges > 0
  // 첫 각성이면 확인 모달에 보너스 포함 문구를 덧붙인다.
  const isFirstPrestige = totalPrestiges === 0
  const after = stardust + gain
  const completedSet = new Set(completedChallenges)

  const handlePrestige = () => {
    prestige(selectedChallenge ?? undefined)
    saveNow() // 각성 직후 즉시 저장 — 새로고침으로 되돌리기 방지 + "저장됨" 시각 갱신.
    setShowConfirm(false)
    setSelectedChallenge(null)
  }

  // 확인 모달을 각성하지 않고 닫으면 취소로 집계한다(취소 버튼·배경/X 공용). 숨겨진 업적 '미련의 대가'(3회).
  const handleCancel = () => {
    cancelPrestige()
    setShowConfirm(false)
    setSelectedChallenge(null)
  }

  // 힌트 임계 미만이면 각성 UI를 아예 숨긴다(초반 화면 정리). 단 상점/진행 중 챌린지는 노출.
  if (!canPrestige && !showHint && !showShopEntry && activeChallenge === null) return null

  return (
    <div className="prestige-panel">
      {activeChallenge !== null && (
        <ChallengeBadge id={activeChallenge.id} startedAt={activeChallenge.startedAt} />
      )}
      {canPrestige ? (
        <>
          <button type="button" className="prestige-button" onClick={() => setShowConfirm(true)}>
            {STRINGS.prestige.awakenButton(formatNumber(gain))}
          </button>
          <div className="prestige-next">
            {STRINGS.prestige.nextLine(progressText, nextAtText)}
          </div>
        </>
      ) : (
        showHint && (
          <div className="prestige-progress" title={HINT_TOOLTIP}>
            <span className="prestige-progress-label">{STRINGS.prestige.progressLabel}</span>
            <div className="prestige-progress-bar">
              <div className="prestige-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="prestige-progress-value">
              {progressText} / {formatNumber(PRESTIGE_THRESHOLD)}
            </span>
            <span className="prestige-next">{STRINGS.prestige.nextShort(nextAtText)}</span>
          </div>
        )
      )}

      <div className="prestige-tools">
        {showShopEntry && (
          <button type="button" className="prestige-shop-button" onClick={() => setShowShop(true)}>
            {STRINGS.prestige.shopButton}
          </button>
        )}
        <button
          type="button"
          className="prestige-info"
          aria-label={STRINGS.prestige.infoAria}
          aria-expanded={showInfo}
          onClick={() => setShowInfo((v) => !v)}
        >
          ⓘ
        </button>
      </div>
      {showInfo && (
        <div className="prestige-info-pop" role="note">
          <p>{STRINGS.prestige.infoBody1}</p>
          <p>{STRINGS.prestige.infoBody2(bonusPercent(1))}</p>
        </div>
      )}

      {showConfirm && canPrestige && (
        <Modal title={STRINGS.prestige.confirmTitle} onClose={handleCancel}>
          <p className="modal-body">
            {STRINGS.prestige.confirmLead}{' '}
            <strong className="offline-amount">{STRINGS.prestige.confirmGain(formatNumber(gain))}</strong>
            {isFirstPrestige && STRINGS.prestige.firstBonus(FIRST_PRESTIGE_BONUS)}
          </p>
          <p className="modal-body">
            {STRINGS.prestige.confirmDelta(
              formatNumber(stardust),
              formatNumber(after),
              bonusPercent(stardust),
              bonusPercent(after),
            )}
          </p>
          <p className="modal-sub">
            {STRINGS.prestige.confirmKeep}
          </p>

          {/* E-2.2 챌린지와 함께 각성: 미완료 챌린지 선택(선택 안 함=일반 각성), 완료는 ✅ 재선택 불가. */}
          <div className="challenge-picker">
            <h3 className="challenge-picker-title">{STRINGS.challenge.startSectionTitle}</h3>
            <p className="modal-sub">{STRINGS.challenge.startSectionHint}</p>
            <div className="challenge-options">
              <button
                type="button"
                className={`challenge-option${selectedChallenge === null ? ' selected' : ''}`}
                onClick={() => setSelectedChallenge(null)}
              >
                {STRINGS.challenge.none}
              </button>
              {CHALLENGES.map((c) => {
                const done = completedSet.has(c.id)
                const selected = selectedChallenge === c.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`challenge-option${selected ? ' selected' : ''}${done ? ' done' : ''}`}
                    onClick={() => !done && setSelectedChallenge(c.id)}
                    disabled={done}
                    title={c.desc}
                  >
                    <span className="challenge-option-name">
                      {c.icon} {c.name}
                    </span>
                    <span className="challenge-option-tag">
                      {done ? STRINGS.challenge.completed : `+${Math.round(c.reward * 100)}%`}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="modal-button" onClick={handleCancel}>
              {STRINGS.common.cancel}
            </button>
            <button
              type="button"
              className="modal-button modal-button--primary"
              onClick={handlePrestige}
            >
              {STRINGS.prestige.confirmOk}
            </button>
          </div>
        </Modal>
      )}

      {showShop && <StardustShopModal onClose={() => setShowShop(false)} />}
    </div>
  )
}
