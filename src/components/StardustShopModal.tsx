import { useShallow } from 'zustand/react/shallow'
import { useGameStore } from '../store/gameStore.ts'
import {
  STARDUST_UPGRADES,
  type StardustUpgradeDef,
  type StardustGroup,
} from '../data/stardustShop.ts'
import { stardustUpgradeCost } from '../engine/formulas.ts'
import { OFFLINE_EFFICIENCY, OFFLINE_CAP_MS } from '../data/config.ts'
import { formatNumber } from '../utils/format.ts'
import { playDing } from '../engine/sound.ts'
import { STRINGS } from '../data/strings.ts'
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
      return STRINGS.stardustShop.effectStartingApprentices(e.perLevel * next)
    case 'clickMpsPercent':
      return STRINGS.stardustShop.effectClickMps(e.perLevel * next)
    case 'offlineEfficiency':
      return STRINGS.stardustShop.effectOfflineEfficiency(
        Math.round((OFFLINE_EFFICIENCY + e.perLevel * next) * 100),
      )
    case 'offlineCap':
      return STRINGS.stardustShop.effectOfflineCap(
        Math.round((OFFLINE_CAP_MS + e.perLevelMs * next) / 3_600_000),
      )
    case 'generatorMult':
      // 다음 레벨 누적 배율(×mult^next)을 소수 1자리로 표시.
      return STRINGS.stardustShop.effectGeneratorMult((e.mult ** next).toFixed(1))
    case 'automation':
      // 다음 레벨의 자동 구매 단계.
      return STRINGS.stardustShop.effectAutomation(next)
    default: {
      // exhaustive 가드(D-5.1): 새 StardustEffect kind 추가 시 여기서 컴파일 에러가 난다.
      const _exhaustive: never = e
      return _exhaustive
    }
  }
}

// 섹션(그룹) 순서·헤더 라벨. 데이터의 group으로 카드를 나눠 렌더한다(기본/생산/자동화).
const SECTIONS: { group: StardustGroup; title: string }[] = [
  { group: 'basic', title: STRINGS.stardustShop.sectionBasic },
  { group: 'production', title: STRINGS.stardustShop.sectionProduction },
  { group: 'automation', title: STRINGS.stardustShop.sectionAutomation },
]

export default function StardustShopModal({ onClose }: Props) {
  const { stardust, levels, buy } = useGameStore(
    useShallow((s) => ({
      stardust: s.stardust,
      levels: s.stardustUpgrades,
      buy: s.buyStardustUpgrade,
    })),
  )

  return (
    <Modal title={STRINGS.stardustShop.title} onClose={onClose} wide>
      <p className="modal-sub">
        {STRINGS.stardustShop.subLead}{' '}
        <strong className="offline-amount">✨ {formatNumber(stardust)}</strong>
        {STRINGS.stardustShop.subTail}
      </p>
      {SECTIONS.map((section) => {
        const defs = STARDUST_UPGRADES.filter((d) => d.group === section.group)
        if (defs.length === 0) return null
        return (
          <section key={section.group} className="stardust-section">
            <h3 className="stardust-section-title">{section.title}</h3>
            <div className="stardust-cards">
              {defs.map((def) => {
                const level = levels[def.id] ?? 0
                const maxed = def.maxLevel !== null && level >= def.maxLevel
                const cost = stardustUpgradeCost(def, level)
                const canAfford = !maxed && stardust >= cost
                const levelText =
                  def.maxLevel === null ? `Lv.${level}` : `Lv.${level}/${def.maxLevel}`
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
                      <span className="stardust-card-next">{STRINGS.stardustShop.maxed}</span>
                    ) : (
                      <span className="stardust-card-next">
                        {STRINGS.stardustShop.nextEffect(nextEffectLabel(def, level))}
                      </span>
                    )}
                    <span className="stardust-card-cost">
                      {maxed ? '—' : `✨ ${formatNumber(cost)}`}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
      <div className="modal-actions">
        <button type="button" className="modal-button modal-button--primary" onClick={onClose}>
          {STRINGS.common.close}
        </button>
      </div>
    </Modal>
  )
}
