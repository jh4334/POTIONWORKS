export default function GeneratorList() {
  return (
    <div className="generator-list">
      <h2 className="generator-list-title">생산 시설</h2>
      {/* T2.1에서 data/generators.ts 6티어 + 구매 로직 연결 */}
      <p className="generator-list-placeholder">
        아직 지을 수 있는 시설이 없습니다. (T2.1에서 추가)
      </p>
    </div>
  )
}
