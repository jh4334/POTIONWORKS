// D-4.1 배경 기포 — clicker-panel 뒤에서 아래→위로 은은히 떠오르는 CSS 무한 루프.
// 랜덤성은 JS 타이머가 아니라 index.css의 nth-child별 duration/delay/left/크기 변주로만 준다.
// MPS와 무관하게 항상 은은하게 유지(단순). 순수 연출이라 상태 구독 없음(리렌더 무관).
export default function AmbientBubbles() {
  return (
    <div className="ambient-bubbles" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className="ambient-bubble" />
      ))}
    </div>
  )
}
