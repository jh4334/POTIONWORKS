export default function ClickerPanel() {
  return (
    <div className="clicker-panel">
      {/* T1.1에서 클릭 → 마나 증가 연결 */}
      <button type="button" className="cauldron-button" aria-label="솥 클릭">
        <span className="cauldron-emoji">🫧</span>
        <span className="cauldron-label">솥을 저어라</span>
      </button>
    </div>
  )
}
