# POTIONWORKS — 포션 공방 방치형

## 명령어
npm run dev / npm run build / npm test (formulas 단위 테스트)

## 문서
- 게임 규칙·수치: DESIGN.md / 작업 목록: PLAN.md (한 세션 = 한 태스크)

## 아키텍처 규칙
- React + TypeScript + Zustand. 상태 변형은 store 액션에서만
- 컴포넌트는 useGameStore(selector)로 부분 구독. 스토어 통째 구독 금지
- 게임 수치는 전부 src/data/*. 코드에 매직넘버 금지
- 수식은 engine/formulas.ts 순수 함수 + 단위 테스트 유지
- 세이브에 version 필드 필수. 스키마 변경 시 migrate 함수 갱신
- 시간 계산의 진실은 타임스탬프. setInterval을 신뢰하지 말 것
- 신규 데이터 정의 시 표시 문자열 최소화(파생 생성 이름은 파라미터화 고려) — i18n 대비

## 작업 규칙
- PLAN.md 태스크 단위로만 작업. 범위 확장 금지
- 완료 시: 수동 테스트 방법 안내 → 사용자 확인 후 커밋
- 대규모 리팩토링은 제안만, 승인 전 실행 금지
- service_role 키는 어떤 경우에도 클라이언트 코드/환경변수(VITE_ 접두사)에 넣지 말 것
