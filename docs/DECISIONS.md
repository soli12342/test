# 결정 기록
- 2026-09-06: MASTER_SPEC 원문을 단일 기준으로 보존. 사용자 요청은 M0–M2.
- 기존 soli12342/test main ed8b693 기반. 기존 Python 예제와 Actions 보존.
- 명세의 React/Vite, ECharts, Supabase, Python 구조 우선. 새 Sites starter로 기술 스택을 교체하지 않음. M5 배포·외부 계정 변경 보류.
- DB 검증은 자격증명 없는 PostgreSQL WASM(PGlite)으로 실제 SQL/RLS 실행. Supabase Auth/Storage 및 네트워크 통합 성공을 의미하지 않음.
- 파일 임시보관 권한이 없으면 웹 큐 업로드 차단; 서버 CLI 직접 입력 경로로 원문을 DB/Storage에 저장하지 않고 승인된 구조화 관측값만 원자적 저장.
- complete만 공식 지표를 생성. 같은 날짜 canonical은 최초 선택 유지, 이후 정정은 사유 있는 Admin 선택. source/category/version/slot이 다른 값은 비교하지 않음.

- 2026-09-06: 상품 제목은 관측 출처에 귀속시켜 snapshot별 보관. 공유된 Listing에 비공개 출처의 제목이 섞이지 않도록 기본 Listing 이름은 ASIN으로 두고 읽기 RPC가 허용된 제목만 선택한다.
- 2026-09-06: canonical을 권한 필터보다 먼저 해석한다. 최신 선택이 비공개라면 Viewer에게 이전 공유 자료로 자동 후퇴하지 않고 N/A를 표시한다.
- 2026-09-06: 읽기 시 metrics/change 계산을 사용하여 관측·매핑·선택의 시점 이력을 유지한다. 영속 metric_points/signals/briefings 발행은 M4에서 추가한다.
- 2026-09-06: 날짜 전용 stale은 시각 정밀도를 추측하지 않기 위해 관측일 말일부터 36시간을 적용. 타임스탬프가 있으면 실제 시각 기준.
# 2026-09-06 첫 화면 배포

사용자의 후속 요청으로 M5 중 화면 호스팅을 먼저 진행한다. Sites의 Cloudflare 기반 정적 호스팅에 본인 전용으로 게시한다. 기존 React/Supabase/Python 구조와 데이터 권한 모델은 유지하며 DB migration은 추가하지 않는다. 별도 Cloudflare 계정·유료 플랜·도메인은 활성화하지 않는다. 가족·지인 공유 및 Supabase/Google 실계정 연결은 독립된 인수 항목이며 `HOSTING.md`에 정확한 origin과 연결 순서를 기록한다.
