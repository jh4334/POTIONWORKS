# 🧪 POTIONWORKS — 포션 공방 방치형

솥을 클릭해 마나를 모으고, 견습생부터 드래곤 둥지까지 6티어 생산 시설을 사들여 초당 마나(MPS)를 키우는 방치형(incremental) 게임입니다. 숫자가 감당 안 될 만큼 커지면 **각성(프레스티지)** 으로 영구 배율(스타더스트)을 얻고 처음부터 더 빠르게 다시 굴립니다. 업적 20개, 오프라인 수익, export/import 백업까지 방치형의 정석 루프를 담았습니다.

## 스크린샷

<!-- TODO: 플레이 화면 스크린샷 추가 (docs/screenshot.png) -->

## 로컬 실행

```bash
npm install
npm run dev      # 개발 서버 (http://localhost:5173)
npm test         # 수식 단위 테스트 (vitest)
npm run build    # 프로덕션 빌드 → dist/
npm run preview  # 빌드 결과 미리보기
```

## 배포

- 공개 URL: **https://jh4334.github.io/POTIONWORKS/**
- `main` 브랜치에 push하면 `.github/workflows/deploy.yml`이 자동으로 테스트 → 빌드 → GitHub Pages 배포를 수행합니다.
- **최초 1회 설정 필요**: 저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 지정해야 워크플로 배포가 활성화됩니다.
- Pages 프로젝트 페이지 경로에 맞춰 빌드 시 `base: '/POTIONWORKS/'`가 적용됩니다(dev 서버는 루트 `/` 유지).

## 문서

- 게임 규칙·수치: [DESIGN.md](DESIGN.md)
- 작업 목록: [PLAN.md](PLAN.md)
- 아키텍처·작업 규칙: [CLAUDE.md](CLAUDE.md)
