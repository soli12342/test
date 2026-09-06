# APR M0–M2 인수 기록 · 2026-09-06

## 판정
**개발 구현 완료, 운영 연결 미완료.** M0 미확인 의존성을 기록했고 M1/M2를 자격증명 없이 개발·검증했다. 실제 승인 자료·Google/Supabase 실계정 연결이 없으므로 Private Beta나 운영 완료가 아니다.

기준 원문은 `docs/MASTER_SPEC.md`에 그대로 보존했다. 기존 `soli12342/test` main `ed8b693caa02f2655b8705b072fc0c1e85821715`에서 `codex/apr-m0-m2` 로컬 브랜치로 작업했다. 원격 push·PR·merge·배포는 하지 않았다.

## 구현한 것
| 단계 | 구현 | 범위·조건 |
|---|---|---|
| M0 | 12개 카테고리/두 채널 준비표, 공식 문서 확인, API 지원행렬, 비용/기능 설정 | 모든 실제 노드·채널·키·이용권한 미확인 상태 보존 |
| M1 | React/TypeScript 정적 웹, 공통 JSON Schema, lockfile, 5개 DB migration 및 seed | 실제 순위·비밀키·원문은 seed/build에 없음 |
| M1 | Google OAuth 코드, 초대 수락, Admin bootstrap 안내, Viewer 초대·차단 | 실제 Auth 왕복 미검증. 첫 가입자 Admin·user_metadata 신뢰 없음 |
| M1 | RLS, 최소 EXECUTE 권한, 회원·소스·파생자료 접근 검사 | 익명/미초대/Viewer 직접 요청, 공유 철회, 차단 후 요청 테스트 |
| M2 | CSV/JSON 미리보기·실패 행 다운로드·서버 재검증·검수 큐·원자적 저장 | 5MB/10,000행, UTF-8/선택 인코딩, 무단 URL fetch 없음 |
| M2 | 파일/내용 중복 방지, partial 분리, 날짜 정밀도, UTC/KST, append revision·canonical 사유 | 내용이 같으면 snapshot_ref 변경도 중복 저장하지 않음 |
| M2 | 회사/브랜드/제품군/국가별 ASIN, 매핑 이력·승인·철회 | 승인 매핑만 집계. 국가·카테고리를 합쳐 판매 SKU로 표시하지 않음 |
| M2 | 6개국×2개 화면, 7D/30D/90D/ALL, 반전 순위축·결측 gap, 미수집/partial/stale/failed | ALL 최대 400일. 고정 viewport E2E 전체 검수는 남음 |
| M2 | count/Top10/best/median/family/exposure, 7D/30D coverage, Europe5 | complete 전제, 5/7·24/30, Europe5 5/5일 때만 동일가중 |
| M2 | 신규·이탈·순위 변화·비교일, 출처·해시·계산·정정 패널, 제품 이력 RPC | 변경은 읽기 시 근거에서 계산. 지속 signals/briefings 발행은 M4 |
| CI | 기존 Python Actions 보존, 새 CI·수동 파일 worker | 원격 미실행. 수동 worker 기본 skip, 자동 스케줄 없음 |

## 실행한 테스트
최종 실행 결과는 `TEST_RESULTS.md`에 기록한다.

- Python pytest: **31 passed**. T01~T12, 스키마·시간대·중복·HTML/내부 URL·크기·수식 주입·OFF 어댑터·worker 재검증.
- 웹 Vitest: **12 passed**. 공유 계약 6개, 빈 화면·12개 경로·기간·로그인/관리 접근 4개, 가짜 API를 격리한 관리자 검수·partial/근거 UI 2개.
- PostgreSQL/PGlite: **8개 통합 테스트**. 실제 migrations/RLS/큐/commit/매핑/시점/공유 철회/정정/Europe5/비공개 제목·canonical 전파. Supabase 실제 Auth/Storage 통합 시험과 구분한다.
- TypeScript 타입 검사, ESLint, Python Ruff/Mypy, 프로덕션 빌드, 운영 번들 fixture·서버 키 검사.
- 기존 `hello.py` 실행 성공, 예제·기존 Actions 변경 diff 없음.
- 브라우저: 미연결 개요와 Amazon 화면 DOM/실제 화면 확인. 그 후 다중 경로 상호작용 검수는 검수 환경 timeout으로 끝까지 완료하지 못했다. 12개 경로/기간 전환은 컴포넌트 테스트로 통과했다.

## 실제 연결한 소스
**투자 데이터 공급원 없음 (Amazon 0/12).** 외부 API로 실제 순위·공시·수출·Telegram 자료를 수집하지 않았다.

GitHub 저장소는 읽기/clone만 수행했다. Supabase/Google, Amazon, DART, Telegram의 공식 문서는 설계·준비 상태 확인에만 사용했다. 관세 포털 인용 URL의 이번 조회 오류는 소스 준비표에 기록했다. 문서 열람을 데이터 연결로 계산하지 않는다.

## 미연결·미검증·후속
1. Supabase 실프로젝트·Google OAuth·Admin Auth UUID·승인 Viewer → 실제 로그인/권한/CSV 왕복 검증 필요.
2. Amazon 승인 공급원, 실제 자료, 12개 node/URL/동등성·보관/공유 근거 → M0 운영 활성화 미완료.
3. DART 키/corp_code, 관세 API/HS/기간 지원, 두 채널 URL → 미연결. 해당 자료 모듈은 M3/M4.
4. 실제 Google 로그인부터 CSV 업로드·적재·차트까지 브라우저 E2E, 1440×900/1920×1080 고정 viewport suite → 코드 준비, 이번 환경에서는 전체 실행하지 않음.
5. 실제 DB 90일 데이터 3명 동시조회 성능·월 사용량·14일 안정성 → 미실측. 성능 목표를 달성했다고 주장하지 않음.
6. Supabase private Storage byte 원본, 암호화 백업/복원, 정기 스케줄, 전체 경쟁사 행 35일 보관·만료 집행 → M5. 현재 임시 업로드는 private DB TTL과 처리 후 삭제를 사용.
7. 제품별 이력 RPC는 구현. 제품 전용 장기 이력 차트와 확장된 선택 관측 필드 입력은 후속 UI 개선 대상.
8. 원본 권한이 없는 파일은 웹 staging 불가, 서버 직접 입력은 허용된 구조화 관측값만 저장. 브라우저 파일 hash는 UTF-8 변환 텍스트 기준임을 RUNBOOK에 명시.
9. 프로덕션 JS의 ECharts/앱 chunk 용량 경고가 남는다. 차트 지연 로딩을 적용했으며 실제 네트워크 3초 목표는 미측정.

## 다음 연결 순서
소유자 승인 후 GitHub 브랜치/PR 반영 → Supabase/Google 연결 → 한 개의 이용권한 있는 Amazon 파일로 Admin/Viewer 인수 → 나머지 11개 소스 검증 → M3.

유료 서비스, AI 호출, Telegram 발송, Excel 쓰기, 컴투스, 외부 계정 생성은 활성화하지 않았다. 명세 §12.4의 외부 계정 변경 승인 규칙에 따라 원격 반영과 배포는 별도 승인 후 진행한다.
