import {
  useEffect,
  useState,
  createContext,
  useContext,
  type ReactNode,
  lazy,
  Suspense,
} from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Navigate,
  useSearchParams,
  Link,
} from "react-router-dom";
import { client, configured, googleAuthEnabled, login, membership, rpc } from "./api";
import { kstDate, allowedURL } from "./contracts";
import marketConfig from "../../../config/amazon_markets.json";
import type { Role, Series, Snapshot } from "./types";
const Chart = lazy(() => import("./Chart").then((m) => ({ default: m.Chart })));
import { Admin, Products } from "./Admin";
const Auth = createContext<{ role: Role | null; offline: boolean }>({
  role: null,
  offline: !configured,
});
export const useAuth = () => useContext(Auth);
export const statusLabel: Record<string, string> = {
  normal: "정상 수집",
  not_collected: "미수집",
  configuration_pending: "소스 설정 미완료",
  permission_pending: "이용권한 확인 중",
  partial: "일부만 확인됨",
  stale: "최신 수집 지연 · 현재 아님",
  failed: "수집 또는 검증 실패",
  source_blocked: "소스 접근 제한",
};
export const number = (v: number | null | undefined) =>
  v == null
    ? "N/A"
    : new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(v);
export function Empty({
  children = "아직 수집되지 않았습니다",
}: {
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-mark">—</span>
      <strong>{children}</strong>
      <p>검증된 자료가 입력되면 이곳에서 확인할 수 있습니다.</p>
    </div>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="notice">
      {children}
    </div>
  );
}
function Login({ message }: { message: string }) {
  const [error, setError] = useState("");
  return (
    <main className="login">
      <div className="login-logo">
        APR<span>RESEARCH</span>
      </div>
      <div className="login-card">
        <span className="eyebrow">초대 기반 리서치</span>
        <h1>
          자료의 출처부터,
          <br />
          변화의 이유까지.
        </h1>
        <p>승인된 가족·지인 계정으로 로그인하세요.</p>
        <button
          className="primary"
          disabled={!googleAuthEnabled}
          onClick={() => login().catch((e) => setError(e.message))}
        >
          Google로 로그인
        </button>
        {configured && !googleAuthEnabled && (
          <Notice>데이터베이스 연결 완료 · Google 로그인 설정을 준비 중입니다.</Notice>
        )}
        {!configured && (
          <>
            <Notice>
              로그인 미연결 · Supabase와 Google OAuth 설정이 필요합니다.
            </Notice>
            <Link to="/apr">미연결 화면 보기 →</Link>
          </>
        )}
        {message && <p role="alert">{message}</p>}
        {error && <p role="alert">{error}</p>}
      </div>
      <small>APR Research Dashboard · Asia/Seoul</small>
    </main>
  );
}
function Shell() {
  const { role, offline } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/apr" className="brand">
          APR<span>RESEARCH DASHBOARD</span>
        </Link>
        <div className="company-tag">
          에이피알 <span>APR</span>
        </div>
        <nav>
          <NavLink to="/apr" end>
            개요 <span>01</span>
          </NavLink>
          <NavLink to="/apr/amazon">
            Amazon <span>02</span>
          </NavLink>
          <NavLink to="/apr/products">
            제품 매핑 <span>03</span>
          </NavLink>
          {role === "admin" && (
            <NavLink to="/admin">
              관리 <span>04</span>
            </NavLink>
          )}
        </nav>
        <div className="sidebar-footer">
          <span>미국 · Europe5</span>
          <p>Beauty / Skin Care</p>
          <small>M0–M2 · 개발 검증 단계</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>에이피알 리서치</span>
          <div>
            <span className="timezone">Asia/Seoul · KST</span>
            <span className="role">
              {offline ? "미연결 화면" : role === "admin" ? "Admin" : "Viewer"}
            </span>
            {configured && (
              <button
                onClick={() =>
                  client?.auth.signOut().then(() => {
                    sessionStorage.clear();
                    window.location.assign("/login");
                  })
                }
              >
                로그아웃
              </button>
            )}
          </div>
        </header>
        <main className="content">
          {offline && (
            <Notice>
              미연결 · 실제 자료 없음. 로그인·데이터 저장은 계정 연결 후 사용할
              수 있습니다.
            </Notice>
          )}
          <Routes>
            <Route path="/apr" element={<Overview />} />
            <Route path="/apr/amazon" element={<Amazon />} />
            <Route path="/apr/products" element={<Products />} />
            <Route
              path="/admin"
              element={
                role === "admin" ? (
                  <Admin />
                ) : (
                  <Notice>FORBIDDEN · 관리자만 접근할 수 있습니다.</Notice>
                )
              }
            />
            <Route path="*" element={<Navigate to="/apr" replace />} />
          </Routes>
          <footer>
            Amazon 순위는 상대적인 판매순위이며, APR의 매출액을 의미하지
            않습니다.
          </footer>
        </main>
      </div>
    </div>
  );
}
function Overview() {
  const [overview, setOverview] = useState<{
    beauty: Series;
    skincare: Series;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    if (configured)
      rpc<{ beauty: Series; skincare: Series }>("get_overview_v1", {
        as_of_date: kstDate(),
      })
        .then((v) => {
          if (alive) setOverview(v);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, []);
  const all = [
    ...(overview?.beauty.data ?? []),
    ...(overview?.skincare.data ?? []),
  ];
  const valid = all.filter(
    (p) => p.status === "normal" && p.apr_listing_count !== null,
  ).length;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">OVERVIEW</span>
          <h1>오늘의 리서치</h1>
          <p>관측된 변화와 아직 확인하지 못한 자료를 함께 봅니다.</p>
        </div>
        <span className="date-label">{kstDate()}</span>
      </div>
      {error && <Notice>{error}</Notice>}
      <div className="overview-status">
        <div>
          <small>Amazon 유효 시계열</small>
          <strong>
            {valid}
            <span> / 12</span>
          </strong>
        </div>
        <div>
          <small>실제 데이터 연결</small>
          <strong>
            {all.some((p) => p.snapshot_id) ? "승인 파일 입력" : "미연결"}
          </strong>
        </div>
        <div>
          <small>입력 방식</small>
          <strong>승인된 CSV·JSON</strong>
        </div>
        <div>
          <small>다음 모듈</small>
          <strong>M3 · 수출입 / DART</strong>
        </div>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>6개국 Amazon</h2>
          <span>Beauty와 Skin Care는 각각 계산합니다.</span>
        </div>
        <div className="country-grid">
          {marketConfig.markets.map((m) => (
            <article key={m.code} className="country-card">
              <div>
                <span className="country-code">{m.code}</span>
                <h3>{m.name}</h3>
                <small>{m.currency}</small>
              </div>
              {(["beauty", "skincare"] as const).map((c) => {
                const p = overview?.[c].data.find(
                  (x) => x.marketplace === m.code,
                );
                return (
                  <Link
                    key={c}
                    to={"/apr/amazon?market=" + m.code + "&category=" + c}
                  >
                    <span>{c === "beauty" ? "Beauty" : "Skin Care"}</span>
                    <strong>
                      {p?.apr_listing_count == null
                        ? "미수집"
                        : number(p.apr_listing_count) + "개"}
                    </strong>
                    <span>↗</span>
                  </Link>
                );
              })}
            </article>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>확인된 변화</h2>
          <Link to="/apr/amazon">국가별 비교 →</Link>
        </div>
        {all.some((p) => p.snapshot_id) ? (
          <p>국가별 관측 목록에서 비교일과 진입·이탈 근거를 확인하세요.</p>
        ) : (
          <Empty>비교할 자료가 아직 없습니다</Empty>
        )}
      </section>
    </>
  );
}
function Amazon() {
  const [params, setParams] = useSearchParams();
  const market = marketConfig.markets.some(
    (m) => m.code === params.get("market"),
  )
    ? params.get("market")!
    : "US";
  const category =
    params.get("category") === "skincare" ? "skincare" : "beauty";
  const [period, setPeriod] = useState(30);
  const [end, setEnd] = useState(kstDate());
  const [mode, setMode] = useState("system_known");
  const [cutoff, setCutoff] = useState("");
  const [slot, setSlot] = useState("date_only");
  const [metric, setMetric] = useState<
    "exposure_index" | "apr_best_rank" | "apr_listing_count"
  >("exposure_index");
  const [data, setData] = useState<Series | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [panel, setPanel] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { role } = useAuth();
  useEffect(() => {
    let alive = true;
    setData(null);
    setSnapshot(null);
    setError("");
    if (!configured) return;
    setLoading(true);
    const start = new Date(end + "T12:00:00Z");
    start.setUTCDate(start.getUTCDate() - period + 1);
    rpc<Series>("get_amazon_series_v1", {
      category,
      date_from: start.toISOString().slice(0, 10),
      date_to: end,
      as_of_mode: mode,
      observation_slot: slot,
      ...(cutoff ? { as_of: new Date(cutoff).toISOString() } : {}),
    })
      .then((v) => {
        if (alive) {
          setData(v);
          setSelectedId("");
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [category, period, end, mode, cutoff, slot]);
  const points = data?.data.filter((p) => p.marketplace === market) ?? [];
  const latest = points.filter((p) => p.snapshot_id).at(-1);
  const selected = points.find((p) => p.snapshot_id === selectedId) ?? latest;
  const selectedSnapshotId = selected?.snapshot_id;
  useEffect(() => {
    let alive = true;
    setSnapshot(null);
    if (selectedSnapshotId)
      rpc<Snapshot>("get_amazon_snapshot_v1", {
        snapshot_id: selectedSnapshotId,
        as_of_mode: mode,
        ...(cutoff ? { as_of: new Date(cutoff).toISOString() } : {}),
      })
        .then((v) => {
          if (alive) setSnapshot(v);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [selectedSnapshotId, mode, cutoff]);
  const country = marketConfig.markets.find((m) => m.code === market)!;
  const last = points.at(-1);
  const coverage = points.filter((p) => p.exposure_index != null).length;
  const eu = data?.europe5.at(-1);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">AMAZON · 12 SERIES</span>
          <h1>글로벌 순위 관측</h1>
          <p>미국과 Europe5의 Top100 내 APR 제품 노출을 추적합니다.</p>
        </div>
        <label>
          조회 기준일
          <input
            aria-label="조회 기준일"
            type="date"
            value={end}
            max={kstDate()}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
      </div>
      <div className="market-tabs" role="tablist" aria-label="국가">
        {marketConfig.markets.map((m) => (
          <button
            key={m.code}
            role="tab"
            aria-selected={m.code === market}
            onClick={() => {
              setParams({ market: m.code, category });
              setSelectedId("");
            }}
          >
            <b>{m.code}</b>
            {m.name}
          </button>
        ))}
      </div>
      <div className="filterbar">
        <div className="segmented" role="tablist" aria-label="카테고리">
          {["beauty", "skincare"].map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={category === c}
              onClick={() => setParams({ market, category: c })}
            >
              {c === "beauty" ? "Beauty Top100" : "Skin Care Top100"}
            </button>
          ))}
        </div>
        <span className={"badge " + (last?.status ?? "configuration_pending")}>
          {statusLabel[last?.status ?? "configuration_pending"]}
        </span>
        <span>
          {country.currency} · {country.timezone}
        </span>
      </div>
      {error && <Notice>{error}</Notice>}
      {loading && <Notice>자료를 불러오는 중입니다.</Notice>}
      {latest && latest.day !== end && (
        <Notice>
          조회일 자료는 미수집입니다. 아래 마지막 관측값은 {latest.day} 기준이며
          현재 값이 아닙니다.
        </Notice>
      )}
      {last?.status === "partial" && (
        <Notice>
          일부만 확인됨 · {last.actual_count}/100행. 등장 수와 진입·이탈은
          N/A입니다.
        </Notice>
      )}
      <div className="metric-grid">
        {(
          [
            ["APR 등장 ASIN 수", selected?.apr_listing_count, "개"],
            ["Top10 등장 수", selected?.apr_top10_count, "개"],
            ["최고 순위", selected?.apr_best_rank, "위"],
            ["순위 기반 노출지수", selected?.exposure_index, ""],
          ] as const
        ).map(([label, value, unit]) => (
          <button
            className="metric-card"
            key={label}
            disabled={!snapshot}
            onClick={() => setPanel(true)}
          >
            <small>{label}</small>
            <strong>
              {number(value)}
              <span>{value != null ? unit : ""}</span>
            </strong>
            <span>
              {selected?.day ?? "아직 수집되지 않았습니다"}{" "}
              {snapshot ? "· 근거 보기 ↗" : ""}
            </span>
          </button>
        ))}
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>노출과 순위의 흐름</h2>
          <div className="segmented periods">
            {[7, 30, 90, 400].map((n) => (
              <button
                key={n}
                aria-pressed={period === n}
                onClick={() => setPeriod(n)}
              >
                {n === 400 ? "ALL" : n + "D"}
              </button>
            ))}
          </div>
        </div>
        <div className="chart-controls">
          <label>
            지표
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as typeof metric)}
            >
              <option value="exposure_index">순위 기반 노출지수</option>
              <option value="apr_listing_count">APR 등장 ASIN 수</option>
              <option value="apr_best_rank">최고 순위</option>
            </select>
          </label>
          <span>
            유효 관측 {coverage}/{period}일 ·{" "}
            {period === 400 ? "ALL은 최근 최대 400일" : "결측값 보간 없음"}
          </span>
          <label>
            기준
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="system_known">당시 입수 기준</option>
              <option value="latest_restated">최신 정정 기준</option>
            </select>
          </label>
          <label>
            입수 기준시점
            <input
              aria-label="입수 기준시점"
              type="datetime-local"
              value={cutoff}
              onChange={(e) => setCutoff(e.target.value)}
            />
          </label>
          <label>
            관측 슬롯
            <input
              aria-label="관측 슬롯"
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
            />
          </label>
        </div>
        {coverage ? (
          <Suspense fallback={<Notice>차트를 불러오는 중입니다.</Notice>}>
            <Chart points={points} metric={metric} />
          </Suspense>
        ) : (
          <Empty />
        )}
        <div className="chart-foot">
          <span>
            7D 평균 <b>{number(last?.avg_7d)}</b>{" "}
            <small>{last?.n_valid_7d ?? 0}/7일 · 최소 5일</small>
          </span>
          <span>
            30D 평균 <b>{number(last?.avg_30d)}</b>{" "}
            <small>{last?.n_valid_30d ?? 0}/30일 · 최소 24일</small>
          </span>
          <span>
            Europe5 <b>{number(eu?.value)}</b>{" "}
            <small>{eu?.n_valid ?? 0}/5개국 · 동일가중</small>
          </span>
        </div>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>관측 목록과 변화</h2>
          <label>
            관측일
            <select
              aria-label="관측일"
              value={selectedSnapshotId ?? ""}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">마지막 관측</option>
              {points
                .filter((p) => p.snapshot_id)
                .map((p) => (
                  <option key={p.snapshot_id} value={p.snapshot_id!}>
                    {p.day} · {p.actual_count}/100
                  </option>
                ))}
            </select>
          </label>
        </div>
        {snapshot ? (
          <>
            <p className="muted">
              {snapshot.comparison_label} {snapshot.comparison_date ?? ""} ·
              중앙값 {number(selected?.apr_median_rank)}위 (등장 표본) · 제품군{" "}
              {number(selected?.apr_product_family_count)}개 · 미매핑{" "}
              {selected?.unassigned_listing_count}개
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>순위</th>
                    <th>제품 / ASIN</th>
                    <th>매핑</th>
                    <th>변화</th>
                    <th>근거</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.entries.map((e) => {
                    const change = snapshot.changes.find(
                      (x) => x.listing_id === e.listing_id,
                    );
                    return (
                      <tr key={e.listing_id}>
                        <td className="numeric">{e.position}</td>
                        <td>
                          {e.title}
                          <small>{e.asin}</small>
                        </td>
                        <td>{e.family ? "APR 승인" : "검수 대기"}</td>
                        <td>
                          {change?.new_entry
                            ? "신규 진입"
                            : change?.rank_change != null
                              ? (change.rank_change > 0 ? "+" : "") +
                                change.rank_change
                              : "N/A"}
                        </td>
                        <td>
                          <button onClick={() => setPanel(true)}>
                            출처 보기
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {snapshot.changes
              .filter((x) => x.exit)
              .map((x) => (
                <p key={x.listing_id}>
                  Top100 이탈 · {x.asin ?? x.listing_id} · 순위 미확인 (101위로
                  대체하지 않음)
                </p>
              ))}
          </>
        ) : (
          <Empty>표시할 순위 자료가 없습니다</Empty>
        )}
      </section>
      {panel && snapshot && (
        <Evidence
          snapshot={snapshot}
          role={role}
          close={() => setPanel(false)}
        />
      )}
    </>
  );
}
function Evidence({
  snapshot,
  role,
  close,
}: {
  snapshot: Snapshot;
  role: Role | null;
  close: () => void;
}) {
  const [reason, setReason] = useState("");
  const [revisionTarget, setRevisionTarget] = useState(snapshot.snapshot.id);
  const [message, setMessage] = useState("");
  return (
    <div className="overlay" onClick={close}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="출처와 계산 근거"
        className="evidence"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
      >
        <div className="section-heading">
          <h2>출처와 계산 근거</h2>
          <button autoFocus onClick={close}>
            닫기
          </button>
        </div>
        <dl>
          <dt>출처</dt>
          <dd>
            {snapshot.evidence.source.display_name} ·{" "}
            {snapshot.evidence.source.mode}
          </dd>
          <dt>관측일 / 시각</dt>
          <dd>
            {snapshot.snapshot.kst_date} /{" "}
            {snapshot.snapshot.observed_at ?? "시각 미상 · 날짜 정밀도"}
          </dd>
          <dt>시스템 입수</dt>
          <dd>{snapshot.snapshot.first_seen_at}</dd>
          <dt>완전성</dt>
          <dd>
            {snapshot.snapshot.completeness} · {snapshot.snapshot.actual_count}
            /100
          </dd>
          <dt>정정</dt>
          <dd>
            revision {snapshot.snapshot.revision}{" "}
            {snapshot.snapshot.backfill ? "· 과거 보충 자료" : ""}
          </dd>
          <dt>카테고리</dt>
          <dd>
            {snapshot.evidence.category.path} · v
            {snapshot.evidence.category.version}
          </dd>
          <dt>계산</dt>
          <dd>
            {snapshot.evidence.formula}
            <small>{snapshot.evidence.metric_version}</small>
          </dd>
          <dt>자료 해시</dt>
          <dd className="hash">{snapshot.snapshot.content_hash}</dd>
        </dl>
        {snapshot.entries[0] && allowedURL(snapshot.entries[0].source_url) && (
          <a
            href={snapshot.entries[0].source_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            원출처 열기 ↗
          </a>
        )}
        <h3>기준 선택 이력</h3>
        {snapshot.evidence.selection_history.map((h, i) => (
          <p key={i}>
            {h.selected_at}
            <br />
            {h.reason}
          </p>
        ))}
        {role === "admin" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              rpc("select_snapshot_v1", {
                snapshot: revisionTarget,
                reason,
              })
                .then(() =>
                  setMessage(
                    "기준 선택 이력을 저장했습니다. 다시 조회하면 반영됩니다.",
                  ),
                )
                .catch((e) => setMessage(e.message));
            }}
          >
            <label>
              정정 자료 선택
              <select
                value={revisionTarget}
                onChange={(e) => setRevisionTarget(e.target.value)}
              >
                {snapshot.evidence.revisions?.map((r) => (
                  <option key={r.id} value={r.id}>
                    revision {r.revision} · {r.first_seen_at}
                  </option>
                ))}
              </select>
            </label>
            <label>
              기준 선택 사유
              <input
                minLength={5}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button>이 스냅샷을 기준으로 선택</button>
            <p role="status">{message}</p>
          </form>
        )}
      </section>
    </div>
  );
}
export function App() {
  const [role, setRole] = useState<Role | null>(null);
  const [ready, setReady] = useState(!configured);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!client) return;
    let alive = true;
    let generation = 0;
    async function refresh() {
      const token = ++generation;
      setRole(null);
      setReady(false);
      const { data } = await client!.auth.getSession();
      if (data.session) {
        try {
          const r = await membership();
          if (alive && token === generation) {
            setRole(r);
            setMessage("");
          }
        } catch (e) {
          if (alive && token === generation) setMessage((e as Error).message);
        }
      }
      if (alive && token === generation) setReady(true);
    }
    void refresh();
    const { data } = client.auth.onAuthStateChange(() => {
      window.setTimeout(() => void refresh(), 0);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return (
    <Auth.Provider value={{ role, offline: !configured }}>
      <BrowserRouter>
        {!ready ? (
          <Notice>로그인 상태를 확인하고 있습니다.</Notice>
        ) : (
          <Routes>
            <Route
              path="/login"
              element={
                role ? (
                  <Navigate to="/apr" replace />
                ) : (
                  <Login message={message} />
                )
              }
            />
            <Route
              path="*"
              element={
                configured && !role ? (
                  <Navigate to="/login" replace />
                ) : (
                  <Shell />
                )
              }
            />
          </Routes>
        )}
      </BrowserRouter>
    </Auth.Provider>
  );
}
