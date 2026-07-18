import { useShallow } from 'zustand/react/shallow'
import { useGameStore } from '../store/gameStore.ts'
import { STARDUST_UPGRADES, type StardustUpgradeDef } from '../data/stardustShop.ts'
import { stardustUpgradeCost } from '../engine/formulas.ts'
import { OFFLINE_EFFICIENCY, OFFLINE_CAP_MS } from '../data/config.ts'
import { formatNumber } from '../utils/format.ts'
import { playDing } from '../engine/sound.ts'
import Modal from './Modal.tsx'

// D-3.1 스타더스트 상점. 각성 화폐(스타더스트)의 소비처 — 각성해도 유지되는 영구 강화 트랙.
// 열림 상태는 부모(Header·PrestigeModal)의 로컬 상태. 표시 전용이라 열린 동안만 구독한다.
// 스타더스트·상점 레벨은 tick에서 불변(구매/각성 시에만 변함)이라 단순 구독으로 충분하다.
interface Props {
  onClose: () => void
}

// 레벨 N에서 다음 레벨(N+1)의 실효 효과를 사람이 읽는 문구로 표시한다.
// 기본값(config)에 누적 반영해 "구매 후 어떤 상태가 되는지"를 보여준다.
function nextEffectLabel(def: StardustUpgradeDef, level: number): string {
  const next = level + 1
  const e = def.effect
  switch (e.kind) {
    case 'startingApprentices':
      return `각성 시 견습생 ${e.perLevel * next}명 보유 시작`
    case 'clickMpsPercent':
      return `클릭 = MPS의 +${e.perLevel * next}%p`
    case 'offlineEfficiency':
      return `오프라인 효율 ${Math.round((OFFLINE_EFFICIENCY + e.perLevel * next) * 100)}%`
    case 'offlineCap':
      return `오프라인 캡 ${Math.round((OFFLINE_CAP_MS + e.perLevelMs * next) / 3_600_000)}시간`
  }
}

export default function StardustShopModal({ onClose }: Props) {
  const { stardust, levels, buy } = useGameStore(
    useShallow((s) => ({
      stardust: s.stardust,
      levels: s.stardustUpgrades,
      buy: s.buyStardustUpgrade,
    })),
  )

  return (
    <Modal title="스타더스트 상점 ✨" onClose={onClose} wide>
      <p className="modal-sub">
        보유 스타더스트 <strong className="offline-amount">✨ {formatNumber(stardust)}</strong> · 각성해도
        유지되는 영구 강화예요.
      </p>
      <div className="stardust-cards">
        {STARDUST_UPGRADES.map((def) => {
          const level = levels[def.id] ?? 0
          const maxed = def.maxLevel !== null && level >= def.maxLevel
          const cost = stardustUpgradeCost(def, level)
          const canAfford = !maxed && stardust >= cost
          const levelText = def.maxLevel === null ? `Lv.${level}` : `Lv.${level}/${def.maxLevel}`
          return (
            <button
              type="button"
              key={def.id}
              className={`stardust-card${canAfford ? ' can-afford' : ''}`}
              onClick={() => {
                if (!canAfford) return
                buy(def.id)
                playDing() // 구매 성공음. muted면 sound가 무시.
              }}
              disabled={!canAfford}
            >
              <span className="stardust-card-head">
                <span className="stardust-card-icon">{def.icon}</span>
                <span className="stardust-card-name">{def.name}</span>
                <span className="stardust-card-level">{levelText}</span>
              </span>
              <span className="stardust-card-desc">{def.desc}</span>
              {maxed ? (
                <span className="stardust-card-next">최대 레벨 달성</span>
              ) : (
                <span className="stardust-card-next">다음: {nextEffectLabel(def, level)}</span>
              )}
              <span className="stardust-card-cost">
                {maxed ? '—' : `✨ ${formatNumber(cost)}`}
              </span>
            </button>
          )
        })}
      </div>
      <div className="modal-actions">
        <button type="button" className="modal-button modal-button--primary" onClick={onClose}>
          닫기
        </button>
      </div>
    </Modal>
  )
}
