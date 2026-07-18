import { useShallow } from 'zustand/react/shallow'
import { useGameStore, type BuyAmount } from '../store/gameStore.ts'
import { GENERATORS } from '../data/generators.ts'
import { STRINGS } from '../data/strings.ts'
import GeneratorRow from './GeneratorRow.tsx'

const BUY_OPTIONS: BuyAmount[] = [1, 10, 'max']

// 티어 노출 정책(T2.3): 아직 못 산 다음 티어까지 완전 노출, 그 다음 1개는 ??? 실루엣,
// 그 아래는 숨김. (쿠키클리커 표준 — 처음부터 6개 다 보이면 압박감)
// generators 참조는 tick 때 안 바뀌므로 이 셀렉터는 tick마다 리렌더를 유발하지 않는다.
function firstUnownedIndex(counts: Record<string, number>): number {
  const idx = GENERATORS.findIndex((g) => (counts[g.id] ?? 0) === 0)
  return idx === -1 ? GENERATORS.length : idx // 전부 보유 시 모두 노출
}

export default function GeneratorList() {
  const buyAmount = useGameStore((s) => s.buyAmount)
  const setBuyAmount = useGameStore((s) => s.setBuyAmount)
  // 노출 경계만 뽑아온다(원시값) — generators 객체 통째 구독 대신 파생값 구독.
  const boundary = useGameStore(useShallow((s) => firstUnownedIndex(s.generators)))
  // 구매 수량 토글은 두 번째 시설(마법 솥) 보유 전에는 숨긴다(D-2.7 온보딩 — 조기 노출 방지).
  const showBuyToggle = useGameStore((s) => (s.generators[GENERATORS[1].id] ?? 0) > 0)

  return (
    <div className="generator-list">
      <div className="generator-list-head">
        <h2 className="generator-list-title">{STRINGS.generator.listTitle}</h2>
        {showBuyToggle && (
          <div className="buy-amount-toggle" role="group" aria-label={STRINGS.generator.buyAmountAria}>
            {BUY_OPTIONS.map((opt) => (
              <button
                key={String(opt)}
                type="button"
                className={`buy-amount-option${buyAmount === opt ? ' active' : ''}`}
                onClick={() => setBuyAmount(opt)}
              >
                {opt === 'max' ? '×MAX' : `×${opt}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {GENERATORS.map((def, i) => {
        // i <= boundary: 완전 노출 / i === boundary+1: 실루엣 / 그 외: 숨김
        if (i > boundary + 1) return null
        return <GeneratorRow key={def.id} def={def} revealed={i <= boundary} />
      })}
    </div>
  )
}
