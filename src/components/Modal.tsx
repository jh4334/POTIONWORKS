import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// D-2.1 공통 모달. 접근성·포커스 관리를 한곳에 모은다(U6·D7):
//  ① ESC로 닫기 ② 열릴 때 첫 포커서블(없으면 모달 div)로 포커스 이동 ③ Tab 순환 포커스 트랩
//  ④ 닫힐 때 이전 포커스 요소로 복귀 ⑤ aria-labelledby로 제목 연결
//  ⑥ backdrop 닫기는 mousedown이 backdrop에서 시작된 경우만(textarea 드래그 선택 중 소실 방지)
//  ⑦ createPortal로 document.body에 렌더(부모 오버플로/스택 컨텍스트 영향 배제).
interface Props {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  wide?: boolean
}

// 모달 안에서 Tab 순환 대상이 되는 포커서블 요소들. disabled는 제외하되 aria-disabled는 포함(포커스 유지).
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  )
}

export default function Modal({ title, onClose, children, wide }: Props) {
  const modalRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  // mousedown이 backdrop에서 시작됐는지 — 드래그 선택 후 backdrop에서 손을 떼도 오판정으로 닫히지 않게.
  const downOnBackdrop = useRef(false)

  useEffect(() => {
    const prevFocused = document.activeElement as HTMLElement | null
    const modal = modalRef.current
    // 초기 포커스: 첫 포커서블, 없으면 모달 div 자체(tabIndex=-1).
    if (modal) {
      const focusables = focusableIn(modal)
      if (focusables.length > 0) focusables[0].focus()
      else modal.focus()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !modalRef.current) return
      // 포커스 트랩: 목록의 양 끝에서 순환. 요소가 없으면 모달 div로 가둔다.
      const focusables = focusableIn(modalRef.current)
      if (focusables.length === 0) {
        e.preventDefault()
        modalRef.current.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === modalRef.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      // 닫힐 때 이전 포커스 요소로 복귀(트리거 버튼 등).
      prevFocused?.focus?.()
    }
  }, [onClose])

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget
      }}
      onMouseUp={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose()
        downOnBackdrop.current = false
      }}
    >
      <div
        ref={modalRef}
        className={`modal${wide ? ' modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 className="modal-title" id={titleId}>
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  )
}
