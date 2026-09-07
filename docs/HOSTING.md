# 첫 화면 배포와 실제 계정 연결

2026-09-06 사용자가 화면 배포와 Supabase·Google 연결 진행을 승인했다.

## 배포 대상

- 화면 주소: https://apr-research-dashboard.by4pmmzkqs.chatgpt.site
- 2026-09-06 09:00 UTC Sites 배포 성공을 확인했다. 위 주소는 성공 응답의 실제 운영 origin이다. 등록 단계의 예상 주소와 달라 실제 주소로 교정했다.
- 첫 배포는 Sites의 본인 전용 접근 정책을 사용한다. 가족·지인에게 공개된 상태가 아니다.
- React 정적 빌드를 배포하며 Supabase·Google 인증 구현은 보존한다.
- 실제 Amazon 자료 0/12, 테스트 자료는 배포 번들에서 제외한다.
- 이번 배포는 M5 중 화면 호스팅만 앞당긴 것이다. 운영 인수·백업·수집 안정성 완료가 아니다.

## Supabase 연결 후 적용할 설정

연결된 프로젝트: `minjae's Project` (`jxqukbwnsnfzlnqocuju`), 장민재 조직의 Free 요금제. 공개 API URL은 `https://jxqukbwnsnfzlnqocuju.supabase.co`이다. 2026-09-06 001~006 migration과 seed를 단일 원자적 migration으로 적용했다. 실제 사용자 0명, 실제 Amazon 관측값 0건이다.

1. 기존 프로젝트의 용도·요금제를 확인하고 전용 무료 개발 프로젝트에 연결한다.
2. `supabase/migrations/001_core.sql`부터 `006_hosted_privileges.sql`까지 순서대로 적용하고 `supabase/seed.sql`을 실행한다.
3. Auth Site URL을 위 origin으로 설정한다. 허용 redirect는 정확히 `https://apr-research-dashboard.by4pmmzkqs.chatgpt.site/login`으로 설정한다.
4. Google Cloud OAuth 웹 클라이언트의 승인된 JavaScript origin에는 위 origin을 설정한다. 승인된 redirect URI는 해당 Supabase 프로젝트가 실제로 제공하는 callback URL을 사용한다. 프로젝트 reference를 추정해 만들지 않는다.
5. Google Client ID와 Client Secret은 Supabase Google provider 설정에만 저장한다. Chat·Git·웹 빌드에 비밀키를 넣지 않는다.
6. 웹에는 검증된 Supabase URL과 publishable key만 주입하여 다시 빌드·배포한다. 정적 빌드이므로 배포 후 runtime 환경변수만 바꿔서는 적용되지 않는다.
7. 실제 Google 로그인으로 Auth UUID와 검증된 이메일을 확인한 뒤 첫 Admin을 서버에서 부트스트랩한다. 첫 가입자 자동 Admin은 허용하지 않는다.
8. Admin/Viewer 로그인·차단·CSV 검증/적재와 새로고침을 실계정으로 검증한다. 회원과 실제 자료 공유 범위를 확인한 후 별도 Sites 접근 정책도 맞춘다.

Sites 본인 접근 인증과 앱의 Google 로그인은 별개다. 첫 화면 배포 성공을 Google 로그인 연결 성공으로 기록하지 않는다.

유료 플랜·도메인 구매·자동 수집·자동 발송은 활성화하지 않는다.


## 2026-09-07 Google OAuth 연결 검증

- Supabase Auth `/auth/v1/settings`에서 Google provider가 `true`로 활성화된 것을 확인했다.
- Google Client Secret은 Supabase provider에만 저장했고 Chat·Git·웹 빌드에는 포함하지 않았다.
- 웹 빌드 플래그를 `VITE_GOOGLE_AUTH_ENABLED=true`로 전환해 Google 로그인 버튼을 활성화한다.
- 실제 Google 계정 로그인과 첫 Admin 부트스트랩은 새 배포 후 진행한다.

## 2026-09-06 실제 연결 검증

- 21개 앱 테이블, RLS 미적용 0개, 카테고리 12개, 관측값 0건.
- hosted Supabase의 기본 권한을 확인하고 anon 테이블/RPC 접근, authenticated TRUNCATE 및 직접 쓰기를 명시적으로 철회했다. worker 함수는 service_role 전용이다.
- 실제 공개 키 HTTP 요청에서 비회원 테이블 조회와 membership RPC 거부를 확인했다.
- 당시 Auth `/auth/v1/settings`에서 Google provider가 false였으며, 2026-09-07 사용자 설정 후 true로 전환된 것을 재확인했다.
- Google의 승인된 redirect URI: `https://jxqukbwnsnfzlnqocuju.supabase.co/auth/v1/callback`.
- 웹 공개 URL/키를 Sites 설정에 보관하고 정적 빌드에 주입한다. Google provider 활성화 확인 후 `VITE_GOOGLE_AUTH_ENABLED=true`로 변경해 다시 빌드·배포한다.
- Supabase 연결 도구는 Auth 설정 수정이나 Google OAuth 클라이언트 발급 기능을 제공하지 않는다. Google 비밀키는 Supabase provider 설정에 직접 입력하며 Chat/Git에 보내지 않는다.
- 보안 Advisor의 12개 SECURITY DEFINER 경고는 회원/관리자 검사 후 private 테이블을 다루는 의도된 RPC다. 4개 RLS 정책 없음 안내는 private 테이블 직접 접근을 전면 차단한 설계다. 무조건 허용 정책으로 경고를 없애지 않는다.
- Advisor 설명: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable 와 https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Google 설정 공식 안내: https://supabase.com/docs/guides/auth/social-login/auth-google
- CSV worker 비밀키/실제 사용자 로그인·적재 왕복은 미연결·미검증이다.
