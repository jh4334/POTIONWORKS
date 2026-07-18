import { describe, it, expect } from 'vitest'
import { STRINGS, t } from './strings.ts'

// E-4.3 스모크 테스트 — 키 접근 + 보간 함수 동작 확인. 문구 문자열 자체는 검증 대상이 아니라
// "구조가 살아있고 함수가 파라미터를 끼워 넣는지"만 본다(문구는 순수 이동이라 diff로 검증됨).
describe('STRINGS i18n 저장소', () => {
  it('정적 키에 접근할 수 있다', () => {
    expect(STRINGS.common.close).toBe('닫기')
    expect(STRINGS.settings.title).toBe('설정 ⚙️')
    expect(STRINGS.offline.bodyTail).toBe(' 마나를 벌었어요.')
  })

  it('보간 함수가 파라미터를 끼워 넣는다', () => {
    expect(STRINGS.header.mana('1.00M')).toBe('1.00M 마나')
    expect(STRINGS.header.meteorBadge(7, 12)).toBe('×7 (남은 12초)')
    expect(STRINGS.generator.total('50', '25')).toBe('총 50/s (전체의 25%)')
    expect(STRINGS.duration.hours(3)).toBe('3시간')
    expect(STRINGS.toast.achievement('첫 걸음')).toBe('업적 달성: 첫 걸음')
    expect(STRINGS.upgrade.milestoneName('견습생', 10)).toBe('견습생 숙련 10')
  })

  it('개발자 로그 보간 함수도 동작한다', () => {
    expect(STRINGS.log.save.unknownVersion(9)).toBe(
      '[save] 알 수 없는 세이브 버전(9) — 무시합니다.',
    )
  })

  it('t 별칭은 STRINGS와 동일 참조다', () => {
    expect(t).toBe(STRINGS)
  })
})
