# APR Research Dashboard

APR Research Dashboard Master Specification v1.0의 **M0–M2 개발 구현**입니다. 기준 문서는 [docs/MASTER_SPEC.md](docs/MASTER_SPEC.md)입니다.

**실제 데이터 연결 0/12. 운영 배포·Google 실계정 로그인은 아직 연결하지 않았습니다.** 화면은 미수집 상태로 시작하며 합성 데이터는 테스트에서만 사용합니다.

## 시작
```bash
npm ci
npm run dev
```
`/apr`에서 개요, `/apr/amazon?market=US&category=beauty`에서 Amazon, `/apr/products`에서 제품을 확인합니다. 키가 없을 때는 빈 화면만 동작하며 `/login`에서 미연결을 표시합니다. 계정·DB 연결 후 Admin 화면에서 소스 검토, CSV 검증·적재, 회원 초대·차단이 가능합니다.

## 구현 구조
- `apps/web`: React/TypeScript/Vite, ECharts, Google OAuth 연결 및 초대 gate, 12개 Amazon 화면, 제품/관리/근거.
- `packages/contracts`: Python과 TypeScript가 공유하는 JSON Schema v1.0.
- `supabase`: 5개 migration, 기준정보 seed, PostgreSQL/RLS/원자적 적재 테스트.
- `jobs`: 승인 CSV/JSON 검증·재검증·배치, 순위 지표 계산, 미연결 collector 결과.
- `config`: 12개 pending category, 기능·비용 기본값, 미연결 소스.
- `fixtures/synthetic`: 실제 상품이 아닌 테스트 데이터. 운영 번들/seed에 포함되지 않음.

## 확인할 문서
- [요구사항·구현 계획](docs/IMPLEMENTATION_PLAN.md)
- [실제 소스 준비 상태](docs/SOURCE_READINESS.md)
- [구현·테스트·미연결 항목](docs/IMPLEMENTATION_STATUS.md)
- [실행·관리·연결 안내](docs/RUNBOOK.md)
- [설계 결정과 범위](docs/DECISIONS.md)

## 검증
```bash
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
python -m pip install -r requirements-dev.lock
python -m pytest -q
ruff check jobs
mypy jobs
```
별도 로컬/CI 브라우저 테스트: `npx playwright install chromium` 후 `npm run test:e2e`.

기존 `hello.py`와 `.github/workflows/run-python.yml`은 변경하지 않았습니다. 새 CI와 파일 배치는 별도 workflow입니다. 파일 배치는 수동 실행·명시적 활성화 변수 없이는 동작하지 않습니다. 원격 저장소 반영·배포·유료 서비스는 이번 작업에서 실행하지 않았습니다.
