import { Component, type ErrorInfo, type ReactNode } from 'react'
import { SAVE_KEY, SAVE_CORRUPT_KEY } from '../data/config.ts'
import { STRINGS } from '../data/strings.ts'

// D-1.2 최상위 에러 바운더리. 렌더 예외가 게임 전체를 백지로 만들지 않도록 폴백 UI를 보여준다.
// 폴백은 스토어가 죽었을 수 있으므로 localStorage를 직접 읽는다(세이브 내보내기).
// 버튼: 세이브 내보내기(textarea) / 하드리셋(키 삭제 후 reload) / 새로고침.
interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  saveText: string
}

// 스토어에 의존하지 않고 localStorage에서 현재 세이브 문자열을 직접 읽는다.
function readRawSave(): string {
  try {
    return localStorage.getItem(SAVE_KEY) ?? ''
  } catch {
    return ''
  }
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, saveText: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // 렌더 중에는 localStorage 접근을 피하고, 실제 읽기는 componentDidCatch에서 한다.
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(STRINGS.log.errorBoundary.caught, error, info)
    // 스토어가 죽었을 수 있으니 세이브 문자열은 localStorage에서 직접 스냅샷한다.
    this.setState({ saveText: readRawSave() })
  }

  private handleHardReset = (): void => {
    // 하드리셋: 세이브·손상 백업 키를 지우고 새로고침(깨끗한 초기 상태로 재시작).
    try {
      localStorage.removeItem(SAVE_KEY)
      localStorage.removeItem(SAVE_CORRUPT_KEY)
    } catch {
      // 삭제 실패해도 reload는 시도한다.
    }
    window.location.reload()
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.error === null) return this.props.children

    return (
      <div className="modal-backdrop error-boundary-backdrop">
        <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="error-title">
          <h2 className="modal-title" id="error-title">
            {STRINGS.error.title}
          </h2>
          <p className="modal-body">{STRINGS.error.body}</p>

          <label className="modal-label" htmlFor="error-save">
            {STRINGS.error.saveLabel}
          </label>
          <textarea
            id="error-save"
            className="modal-textarea"
            readOnly
            rows={3}
            value={this.state.saveText}
            placeholder={STRINGS.error.savePlaceholder}
          />

          <div className="modal-actions">
            <button type="button" className="modal-button" onClick={this.handleHardReset}>
              {STRINGS.error.hardReset}
            </button>
            <button
              type="button"
              className="modal-button modal-button--primary"
              onClick={this.handleReload}
            >
              {STRINGS.error.reload}
            </button>
          </div>
        </div>
      </div>
    )
  }
}
