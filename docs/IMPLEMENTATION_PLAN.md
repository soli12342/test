# M0–M2 구현 계획 · 2026-09-06

기준: docs/MASTER_SPEC.md v1.0 (첨부 원문 그대로 보존).

## 확정 요구사항
APR 단일 우선, US/GB/DE/FR/IT/ES × beauty/skincare, Google OAuth + 초대 membership, Admin/Viewer와 소스별 공유권한. React/TypeScript 정적 웹 + Supabase PostgreSQL/Auth/RPC + Python 배치. 실제 데이터가 없으면 미연결. fixture는 테스트 디렉터리에만 존재. 유료 서비스·외부 AI·알림·Excel 쓰기 OFF.

## 작업 순서
1. M0: 저장소·기존 workflow 읽기, 소스 준비표와 지원행렬 작성.
2. M1: 공통 JSON Schema, 기준정보/권한/관측/큐 migration, 기본값 seed, OAuth 및 초대·차단 RPC.
3. M2: CSV/JSON 검증, 서버 재검증 및 원자적 적재, canonical 선택·정정, 매핑 이력, 지표·변화·출처, 12개 화면.
4. 테스트: Python 계약/계산, PostgreSQL 호환 엔진 migration/RLS/적재, TypeScript·컴포넌트·빌드, 브라우저 E2E. 실제 계정 통합은 자격증명 준비 후 별도.

## migration 순서
001 core: private memberships/invites/audit, companies/brands/families/listings/assignments, categories/sources/permissions/capabilities, imports/jobs/runs, snapshots/entries/observations/selections.
002 API: 권한 함수·RLS·RPC, 서비스 전용 원자적 적재/큐, 계산·시점 조회.
seed: 12개 pending category, APR/medicube 기준정보, 미연결 소스만. 실제 순위 없음.

## 외부 의존성
Supabase URL/공개 키/배치 비밀, Google OAuth client/redirect, 확인된 Admin Auth ID, 승인된 Amazon 공급원·12개 노드·자료·보관/공유 근거가 없다. DART 키/corp_code, 관세 API 승인·HS 바스켓, Telegram 정확 URL도 없다. 추측해서 생성하지 않는다.

## 보존·승인
기존 hello.py와 .github/workflows/run-python.yml은 byte 단위 보존한다. 기존 저장소 main 기준 별도 로컬 브랜치에서 작업한다. M5 배포는 이번 범위 밖이다. 첨부 §12.4의 사용자 계정 외부 변경 별도 승인 규칙에 따라 원격 push·계정 생성·호스팅은 수행하지 않는다.
