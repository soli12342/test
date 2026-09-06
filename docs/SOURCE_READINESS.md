# Source readiness · 2026-09-06

실제 데이터 연결 **0/12**. 아래 review는 자료·노드 미제공 확인이며 노드 검증 완료를 뜻하지 않는다. 모든 미확인 권한 false. 실제 데이터/API 요청은 수행하지 않았다.

| source_id | 국가 | 카테고리 | 기간 | 실제 URL/노드 | 예시 검증일 | 수집 | 원문 보관 | 파생 보관 | 공유 | 내보내기 | AI | 비용 | 테스트 결과·미지원 이유 | 책임자 | 다음 검토 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| amazon_primary | US | beauty | 일별 Top100 | null / null | 미실시 | false | false | false | false | false | false | 미확인 | pending: 공급원·샘플·노드 증거 없음 | 소유자·개발자 | 자료 제공 후 |
| amazon_primary | US | skincare | 일별 Top100 | null / null | 미실시 | false | false | false | false | false | false | 미확인 | pending: 공급원·샘플·노드 증거 없음 | 소유자·개발자 | 자료 제공 후 |
| amazon_primary | GB | beauty | 일별 Top100 | null / null | 미실시 | false | false | false | false | false | false | 미확인 | pending: 공급원·샘플·노드 증거 없음 | 소유자·개발자 | 자료 제공 후 |
| amazon_primary | GB | skincare | 일별 Top100 | null / null | 미실시 | false | false | false | false | false | false | 미확인 | pending: 공급원·샘플·노드 증거 없음 | 소유자·개발자 | 자료 제공 후 |
| amazon_primary | DE | beauty | 일별 Top100 | null / null | 미실시 | false | false | false | false | false | false | 미확인 | pending: 공급원·샘플·노드 증거 없음 | 소유자·개발자 | 자료 제공 후 |
| amazon_primary | DE | skincare | 일별 Top100 | null / null | 미실시 | false | false | false | false | false | false | 미확인 | pending: 공급원·샘플·노드 증거 없음 | 소유자·개발자 | 자료 제공 후 |
| amazon_primary | FR | beauty | 일별 Top100 | null / null | 미실시 | false | false | false | false | false | false | 미확인 | pending: 공급원·샘플·노드 증거 없음 | 소유자·개발자 | 자료 제공 후 |
| amazon_primary | FR | skincare | 일별 Top100 | null / null | 미실시 | false | false | false | false | false | false | 미확인 | pending: 공급원·샘플·노드 증거 없음 | 소유자·개발자 | 자료 제공 후 |
| amazon_primary | IT | beauty | 일별 Top100 | null / null | 미실시 | false | false | false | false | false | false | 미확인 | pending: 공급원·샘플·노드 증거 없음 | 소유자·개발자 | 자료 제공 후 |
| amazon_primary | IT | skincare | 일별 Top100 | null / null | 미실시 | false | false | false | false | false | false | 미확인 | pending: 공급원·샘플·노드 증거 없음 | 소유자·개발자 | 자료 제공 후 |
| amazon_primary | ES | beauty | 일별 Top100 | null / null | 미실시 | false | false | false | false | false | false | 미확인 | pending: 공급원·샘플·노드 증거 없음 | 소유자·개발자 | 자료 제공 후 |
| amazon_primary | ES | skincare | 일별 Top100 | null / null | 미실시 | false | false | false | false | false | false | 미확인 | pending: 공급원·샘플·노드 증거 없음 | 소유자·개발자 | 자료 제공 후 |
| research_kwon_woojeong | 미확인 | 권우정 | 메시지 | null / null | 미실시 | false | false | false | false | false | false | 미확인 | link_only, 정확 URL·동의 미제공 | 소유자 | URL 제공 후 |
| research_kim_myeongju | 미확인 | 김명주 | 메시지 | null / null | 미실시 | false | false | false | false | false | false | 미확인 | link_only, 정확 URL·동의 미제공 | 소유자 | URL 제공 후 |

## API 자료 지원행렬
| 소스 | 대상 | 지원 검증 | 연결 상태 |
|---|---|---|---|
| Amazon | 6개국×2개 Top100·과거·하루 슬롯 | 모두 미확인 | permission_pending |
| 관세 | 전세계+6개국 × 공식 화장품 총계/skincare proxy × month/mtd_10/mtd_20 | 모든 조합 unknown, HS 미승인 | configuration_pending |
| DART | APR 공시 검색·정정·3개 사업연도 | 문서 옵션 확인, 회사코드·실응답 미검증 | configuration_pending |
| Telegram | 지정 두 채널 | 이름만 확정 | configuration_pending |

## 공식 문서 확인 (2026-09-06)
- [Amazon Creators API 전환](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation): PA-API 대체 안내 확인. 12개 Top100·보관·공유 허용은 확인 못함.
- [Amazon BSR 설명](https://sell.amazon.com/blog/amazon-best-sellers-rank): 순위 정의 참고. 매출 환산 없음.
- [Telegram 콘텐츠 조건](https://telegram.org/tos/content-licensing): 승인 전 수집/AI OFF.
- [DART 가이드](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001): 공시검색 문서 확인, 실제 인증 요청 없음.
- 관세 포털 명세 인용 URL: 이번 재확인에서 조회 오류. 지원 조합을 검증했다고 기록하지 않음.
- [Supabase Google](https://supabase.com/docs/guides/auth/social-login/auth-google), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [요금](https://supabase.com/pricing): 인증/권한 설계 확인. 계정/플랜 설정 미실시.

## 무료 운영 계획
무료 우선, paid_services_enabled=false, AI 예산 0. 신규 서비스 활성화 없음. 계정 사용량 실측 없음. 월 1만원 미만 목표를 보장 비용으로 표시하지 않는다. 원격 스케줄은 M5 승인 후 연결한다.
