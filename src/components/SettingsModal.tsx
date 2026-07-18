import { useState } from 'react'
import { useGameStore } from '../store/gameStore.ts'
import { hardResetAndReload } from '../engine/autosave.ts'
import { FONT_SCALE_OPTIONS, DEFAULT_VOLUME } from '../data/config.ts'
import { STRINGS } from '../data/strings.ts'
import Modal from './Modal.tsx'

// T8.2 설정 모달 + E-3.3 설정 확장(볼륨/숫자 표기/이펙트/글자 크기) + E-3.2 슬롯 변경.
// 열림 상태는 부모(Header)의 로컬 상태. 백업은 기존 SaveModal 재사용(onOpenBackup),
// 슬롯 변경은 App으로 위임(onChangeSlot: 현재 진행 저장 후 타이틀로).
interface Props {
  onClose: () => void
  onOpenBackup: () => void
  onChangeSlot: () => void
}

// 글자 크기 옵션 라벨(FONT_SCALE_OPTIONS와 1:1). 데이터는 수치, 표시 문자열은 strings.
const FONT_LABELS = [STRINGS.settings.fontSmall, STRINGS.settings.fontMedium, STRINGS.settings.fontLarge]

export default function SettingsModal({ onClose, onOpenBackup, onChangeSlot }: Props) {
  const volume = useGameStore((s) => s.volume)
  const setVolume = useGameStore((s) => s.setVolume)
  const numberNotation = useGameStore((s) => s.numberNotation)
  const setNumberNotation = useGameStore((s) => s.setNumberNotation)
  const effects = useGameStore((s) => s.effects)
  const setEffects = useGameStore((s) => s.setEffects)
  const fontScale = useGameStore((s) => s.fontScale)
  const setFontScale = useGameStore((s) => s.setFontScale)

  // 하드리셋 2단계 확인: 1차 클릭 → 경고 노출, 2차 클릭 → 실제 초기화 + 새로고침.
  const [confirmReset, setConfirmReset] = useState(false)

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true)
      return
    }
    // 자동저장 정지 → clearSave → reload(경합 방지, D-1.3). 리셋 후 재방문 시 타이틀 화면부터 시작.
    hardResetAndReload()
  }

  // 음소거 체크: 볼륨을 0으로(음소거) 또는 기본값으로 되돌린다(슬라이더 위치 복원).
  const muted = volume === 0

  return (
    <Modal title={STRINGS.settings.title} onClose={onClose}>
      {/* 볼륨 슬라이더 + 음소거 체크 */}
      <div className="settings-row">
        <span className="settings-row-label">{STRINGS.settings.volume}</span>
        <div className="settings-volume">
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
            aria-label={STRINGS.settings.volume}
          />
          <span className="settings-volume-value">{STRINGS.settings.volumeValue(Math.round(volume * 100))}</span>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={muted}
              onChange={(e) => setVolume(e.target.checked ? 0 : DEFAULT_VOLUME)}
            />
            {STRINGS.settings.mute}
          </label>
        </div>
      </div>

      {/* 숫자 표기 전환 */}
      <div className="settings-row">
        <span className="settings-row-label">{STRINGS.settings.notation}</span>
        <div className="settings-segment">
          <button
            type="button"
            className={`modal-button${numberNotation === 'suffix' ? ' modal-button--primary' : ''}`}
            onClick={() => setNumberNotation('suffix')}
          >
            {STRINGS.settings.notationSuffix}
          </button>
          <button
            type="button"
            className={`modal-button${numberNotation === 'comma' ? ' modal-button--primary' : ''}`}
            onClick={() => setNumberNotation('comma')}
          >
            {STRINGS.settings.notationComma}
          </button>
        </div>
      </div>

      {/* 이펙트 강도 */}
      <div className="settings-row">
        <span className="settings-row-label">{STRINGS.settings.effects}</span>
        <div className="settings-segment">
          <button
            type="button"
            className={`modal-button${effects === 'full' ? ' modal-button--primary' : ''}`}
            onClick={() => setEffects('full')}
          >
            {STRINGS.settings.effectsFull}
          </button>
          <button
            type="button"
            className={`modal-button${effects === 'reduced' ? ' modal-button--primary' : ''}`}
            onClick={() => setEffects('reduced')}
          >
            {STRINGS.settings.effectsReduced}
          </button>
        </div>
      </div>

      {/* 글자 크기 */}
      <div className="settings-row">
        <span className="settings-row-label">{STRINGS.settings.fontScale}</span>
        <div className="settings-segment">
          {FONT_SCALE_OPTIONS.map((scale, i) => (
            <button
              key={scale}
              type="button"
              className={`modal-button${fontScale === scale ? ' modal-button--primary' : ''}`}
              onClick={() => setFontScale(scale)}
            >
              {FONT_LABELS[i]}
            </button>
          ))}
        </div>
      </div>

      {/* 슬롯 변경 */}
      <div className="settings-row">
        <span className="settings-row-label">{STRINGS.settings.slot}</span>
        <button type="button" className="modal-button" onClick={onChangeSlot}>
          {STRINGS.settings.slotChange}
        </button>
      </div>

      <div className="settings-row">
        <span className="settings-row-label">{STRINGS.settings.backup}</span>
        <button type="button" className="modal-button" onClick={onOpenBackup}>
          {STRINGS.settings.backupButton}
        </button>
      </div>

      <div className="settings-row">
        <span className="settings-row-label">{STRINGS.settings.reset}</span>
        <button
          type="button"
          className={`modal-button${confirmReset ? ' modal-button--danger' : ''}`}
          onClick={handleReset}
        >
          {confirmReset ? STRINGS.settings.resetConfirm : STRINGS.settings.resetButton}
        </button>
      </div>
      {confirmReset && (
        <p className="modal-sub settings-reset-warn">
          {STRINGS.settings.resetWarn}{' '}
          <button type="button" className="settings-link" onClick={() => setConfirmReset(false)}>
            {STRINGS.common.cancel}
          </button>
        </p>
      )}

      <div className="settings-footer">
        <span className="settings-version">POTIONWORKS v{__APP_VERSION__}</span>
        <span className="settings-credit">{STRINGS.settings.credit}</span>
      </div>

      <div className="modal-actions">
        <button type="button" className="modal-button modal-button--primary" onClick={onClose}>
          {STRINGS.common.close}
        </button>
      </div>
    </Modal>
  )
}
