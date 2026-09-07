# M0–M2 실행·관리 안내

## 로컬 화면 (외부 계정 없이)
Node 22+, Python 3.12+ 기준. 저장소 루트에서:

```bash
npm ci
npm run dev
```

`/login`, `/apr`, `/apr/amazon?market=GB&category=skincare`, `/apr/products`를 사용한다. 실제 Supabase 설정이 없으면 빈 화면만 확인할 수 있다. 로그인 성공·데이터 저장을 흉내내는 demo 계정은 없다.

## 테스트
```bash
python -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.lock
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
.venv/bin/ruff check jobs
.venv/bin/mypy jobs
.venv/bin/python -m pytest -q
```
Windows에서는 `.venv/bin/python` 대신 `.venv\Scripts\python.exe`를 사용한다. PGlite 테스트는 PostgreSQL SQL·RLS를 실제 실행하며 Supabase Auth/HTTP를 대신 검증하지 않는다.

브라우저 자동 테스트는 본인 로컬/CI에서:
```bash
npx playwright install chromium
npm run test:e2e
```
1440×900, 1920×1080 설정. 이번 Work 실행에서 이 두 고정 viewport suite는 실행하지 않았다. 브라우저 스킬로 현재 환경의 개요/Amazon DOM과 화면만 확인했고 이후 상호작용 검수는 환경 timeout으로 중단됐다.

## Supabase / Google 연결 (소유자 승인 후)
1. 소유자의 무료 프로젝트와 Google OAuth client를 준비하고 운영 origin과 `/login` redirect를 정확히 allowlist에 등록한다. 이번 작업에서는 계정을 만들거나 활성화하지 않았다.
2. `supabase/migrations/001_core.sql`부터 `005_status.sql`까지 순서대로 적용한 뒤 `supabase/seed.sql`을 한 번 실행한다. SQL은 Supabase의 `auth.users`, `auth.uid()`, `authenticated`, `anon`, `service_role`을 전제로 한다.
3. Auth에서 소유자의 UUID와 검증된 이메일을 직접 확인한다. `scripts/bootstrap-admin.sql` 안내대로 trusted SQL에서 첫 Admin을 생성한다. 실제 이메일·UUID를 repo에 적지 않는다.
4. `.env.example`을 `.env`로 복사하고 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`에 공개 설정만 기입한다. 로컬 `npm run dev`를 재실행한다. 웹은 hosted `https://<project>.supabase.co` 주소를 지원하며 다른/custom domain은 별도 검증 후 allowlist를 변경한다.
5. `SUPABASE_URL`과 `SUPABASE_SECRET_KEY`는 배치 환경에만 주입한다. 브라우저에는 넣지 않는다. Google 로그인 실계정 왕복, 실제 PostgREST grants, OAuth redirect와 Supabase SQL version 호환을 연결 환경에서 재검증한다.
6. Admin → 초대·차단에서 Viewer 이메일을 등록한다. 초대 메일을 자동으로 보내지 않는다. 사용자에게 사이트 주소를 직접 전달한 후 그 Google 계정으로 로그인한다. 이미 차단한 사용자는 재초대로 자동 복구되지 않는다.

## 승인 자료 한 개를 입력하기
1. 소유자가 실제 공급원, 12개 중 해당 노드·목록 URL, 수집·보관·공유 근거를 확인한다. Admin → 소스·카테고리에 각 용도의 권한·근거·만료일·정확 호스트를 등록한다. 모든 checkbox는 false로 시작한다. 원문 임시보관과 파생자료 저장은 독립 권한이다.
2. 제품군과 Listing 매핑을 검수한다. 아직 Listing이 없으면 파일 적재 후 제품 매핑 화면에서 등록된 국가·ASIN을 선택하여 승인한다. 매핑 전 제목으로 APR을 자동 확정하지 않는다. 후속 승인은 `recorded_at` 이후 시점 조회에만 반영된다.
3. Admin → 파일 입력에서 CSV/JSON을 선택하고 인코딩과 미리보기를 확인한다. 검증 오류가 있으면 실패 행 목록을 내려받는다. partial 경고는 숨기지 않는다.
4. ‘서버 검증 요청’은 큐 등록이다. 다음 명령으로 실제 배치를 실행한다.
```bash
.venv/bin/python -m jobs.imports.worker --max-jobs 10
```
5. 화면에서 ‘상태 새로고침’ → `needs_review` → 검수 완료·적재 요청 → 배치 재실행 순서다. 서버가 다시 검증하고 모든 스냅샷을 하나의 트랜잭션으로 저장한다.
6. Amazon에서 국가·카테고리·관측일·slot을 선택한다. 날짜만 있으면 `date_only`; 시각 자료는 UTC 시각 `HH:MM:SS` slot을 사용한다. 다른 관측 슬롯은 합치지 않는다.
7. 최초 검증 자료가 canonical이다. 변경된 파일은 새 revision으로 저장되지만 자동 기준 변경은 없다. 출처 패널의 정정 자료 선택에서 사유를 기입한다. 같은 내용은 snapshot_ref가 달라도 중복 저장하지 않는다.

브라우저 입력은 UTF-8로 변환된 텍스트의 서버 SHA-256으로 중복을 판정한다. CLI 검증 출력의 file_hash는 원래 파일 바이트 기준이다. 원본 인코딩 바이트를 감사 목적으로 영구 보관하는 기능은 M5 Storage 연결에서 완성한다.

원문 임시보관을 허용하지 않는 승인 소스는 서버 직접 파일 입력을 쓴다. 이 경로는 raw 파일을 DB/Storage에 저장하지 않는다.
```bash
.venv/bin/python -m jobs.imports.worker --file approved.csv --allowed-host verified-source-host --validate-only
.venv/bin/python -m jobs.imports.worker --file approved.csv --allowed-host verified-source-host
```
DB도 source permissions, 실제 category 검증, URL host, 중복·필수 값·날짜를 독립 검사한다. 파일 경로는 로컬이며 URL을 입력하여 임의 다운로드하는 기능은 없다.

## 정정·권한 철회·오류
- Admin 역할은 첫 bootstrap만 서버가 부여. 초대 RPC는 Viewer만 만든다.
- `system_known`: 입수·매핑 승인·기준 선택 시간이 cutoff 이전인 자료. `latest_restated`: 현재까지의 최신 선택/매핑. 미래 자료로 빈 날을 채우지 않는다.
- 날짜만 아는 자료는 시각을 만들지 않는다. stale은 해당 날짜 말일로부터 36시간이 지난 경우 보수적으로 판단한다. 시각이 있으면 실제 관측시각에서 36시간을 계산한다.
- 공유 철회·membership 차단은 다음 DB 읽기에 즉시 반영. 이미 다운로드한 내용의 회수는 보장하지 않는다.
- private 업로드 텍스트는 만료 시 접근 불가, 배치 claim 때 만료/권한철회 payload를 삭제하고 커밋 후 즉시 삭제한다. 배치 미운영 시 물리 삭제가 지연될 수 있으므로 운영 전에 M5 정기 유지관리 연결이 필요하다.
- 오류 응답은 정제 코드만 UI에 표시. 파일 전문·키·사용자 이메일을 로그에 출력하지 않는다.

## CI와 운영 활성화
기존 `run-python.yml`과 `hello.py`는 보존했다. `ci.yml`은 새 검증 작업. `import-files.yml`은 schedule 없이 수동 실행만 있고 `APR_IMPORT_WORKER_ENABLED=true` 변수가 없으면 skip한다. 본 작업에서는 원격 push, Actions 실행, 변수/Secrets 설정을 하지 않았다.

## 배포·롤백·백업의 경계
배포는 M5. 정적 output은 `dist/`이며 투자 데이터나 fixture가 없다. OAuth origin·CSP·RLS를 실제 환경에서 검증하고 승인 후 배포한다. 이 작업에서 Site/Cloudflare/Supabase 계정을 생성하지 않았다.
DB 운영 데이터가 생긴 뒤에는 migration 파일을 수정하지 말고 새 forward migration을 추가한다. 롤백은 이전 웹 commit 재배포 + 호환 가능한 새 DB migration이다. DB를 DROP하여 복구하지 않는다. 암호화 백업·Storage 파일 백업·복원 리허설·35일 경쟁사 행 보관정책 실행은 M5의 미구현 작업이며, 완성 전 운영 데이터의 장기 보관을 시작하지 않는다.
