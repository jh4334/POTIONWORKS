import { useState } from 'react'
import { useGameStore } from '../store/gameStore.ts'
import { hardResetAndReload } from '../engine/autosave.ts'
import { STRINGS } from '../data/strings.ts'
import Modal from './Modal.tsx'

// T8.2 설정 모달. 음소거 토글 / 세이브 백업 열기 / 하드리셋(2단계 확인) / 버전·크레딧.
// 열림 상태는 부모(Header)의 로컬 상태. 백업은 기존 SaveModal을 재사용하므로 onOpenBackup으로 위임한다.
interface Props {
  onClose: () => void
  onOpenBackup: () => void
}

export default function SettingsModal({ onClose, onOpenBackup }: Props) {
  const muted = useGameStore((s) => s.muted)
  const toggleMuted = useGameStore((s) => s.toggleMuted)

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

  return (
    <Modal title={STRINGS.settings.title} onClose={onClose}>
      <div className="settings-row">
        <span className="settings-row-label">{STRINGS.settings.sound}</span>
        <button type="button" className="modal-button" onClick={toggleMuted}>
          {muted ? STRINGS.settings.muted : STRINGS.settings.unmuted}
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
