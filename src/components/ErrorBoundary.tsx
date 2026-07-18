import { Component, type ErrorInfo, type ReactNode } from 'react'
import { SAVE_KEY, SAVE_CORRUPT_KEY } from '../data/config.ts'

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
    console.error('[ErrorBoundary] 렌더 예외를 잡았습니다.', error, info)
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
            앗, 문제가 생겼어요 😢
          </h2>
          <p className="modal-body">
            화면을 그리는 중 오류가 발생했어요. 진행 데이터는 아래에 안전하게 남아 있어요 — 먼저
            내보내기로 백업해 두는 걸 권장해요.
          </p>

          <label className="modal-label" htmlFor="error-save">
            현재 세이브(이 문자열을 보관하세요)
          </label>
          <textarea
            id="error-save"
            className="modal-textarea"
            readOnly
            rows={3}
            value={this.state.saveText}
            placeholder="저장된 세이브가 없어요."
          />

          <div className="modal-actions">
            <button type="button" className="modal-button" onClick={this.handleHardReset}>
              하드리셋
            </button>
            <button
              type="button"
              className="modal-button modal-button--primary"
              onClick={this.handleReload}
            >
              새로고침
            </button>
          </div>
        </div>
      </div>
    )
  }
}
