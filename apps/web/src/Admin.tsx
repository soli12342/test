import { useEffect, useState, type FormEvent } from "react";
import { configured, rpc, table } from "./api";
import marketConfig from "../../../config/amazon_markets.json";
import { parseFile, downloadErrors } from "./contracts";
import { useAuth, Notice, Empty } from "./App";
import type { Source, Batch, Category, Family, Listing } from "./types";
function data(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  return new FormData(e.currentTarget);
}
function text(d: FormData, k: string) {
  return String(d.get(k) ?? "");
}
export function Admin() {
  const [sources, setSources] = useState<Source[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [members, setMembers] = useState<
    { user_id: string; role: string; active: boolean }[]
  >([]);
  const [source, setSource] = useState("");
  const [content, setContent] = useState("");
  const [filename, setFilename] = useState("");
  const [encoding, setEncoding] = useState("utf-8");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("imports");
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    const [s, b, c, m] = await Promise.all([
      table<Source>("sources"),
      table<Batch>("import_batches"),
      table<Category>("categories"),
      rpc<typeof members>("list_members_v1"),
    ]);
    setSources(s);
    setBatches(b);
    setCategories(c);
    setMembers(m);
    setSource(
      (prev) => prev || s.find((x) => x.kind === "amazon_rank")?.id || "",
    );
  };
  useEffect(() => {
    refresh().catch((e) => setMessage(e.message));
  }, []);
  const selected = sources.find((s) => s.id === source);
  const preview = content
    ? parseFile(content, filename, selected?.allowed_hosts ?? [])
    : null;
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      setMessage("저장했습니다.");
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRATION</span>
          <h1>자료와 접근 관리</h1>
          <p>승인된 자료를 검수하고, 누가 볼 수 있는지 관리합니다.</p>
        </div>
        <button onClick={() => refresh().catch((e) => setMessage(e.message))}>
          상태 새로고침
        </button>
      </div>
      <div className="segmented admin-tabs">
        {[
          ["imports", "파일 입력"],
          ["sources", "소스·카테고리"],
          ["access", "초대·차단"],
        ].map(([id, label]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {message && <Notice>{message}</Notice>}
      {tab === "imports" && (
        <>
          <section className="panel">
            <h2>CSV·JSON 검증과 입력</h2>
            <p>
              최대 5MB / 10,000행. 원문 임시보관 권한이 없는 소스는 서버 직접
              입력 경로를 사용하세요.
            </p>
            <div className="form-grid">
              <label>
                자료 소스
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  {sources
                    .filter((s) => s.kind === "amazon_rank")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.display_name} · {s.enabled ? "승인 입력" : "미연결"}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                파일 인코딩
                <select
                  value={encoding}
                  onChange={(e) => {
                    setEncoding(e.target.value);
                    setContent("");
                    setFilename("");
                  }}
                >
                  <option value="utf-8">UTF-8</option>
                  <option value="euc-kr">CP949 / 한국어</option>
                </select>
              </label>
              <label>
                자료 파일
                <input
                  aria-label="자료 파일"
                  type="file"
                  accept=".csv,.json"
                  onChange={async (e) => {
                    setMessage("");
                    const f = e.target.files?.[0];
                    setContent("");
                    if (!f) return;
                    setFilename(f.name);
                    if (f.size > 5242880) {
                      setMessage("5MB 이하 파일만 입력할 수 있습니다.");
                      return;
                    }
                    if (
                      f.type &&
                      ![
                        "text/csv",
                        "application/json",
                        "text/plain",
                        "application/vnd.ms-excel",
                      ].includes(f.type)
                    ) {
                      setMessage("지원하지 않는 MIME 형식입니다.");
                      return;
                    }
                    try {
                      setContent(
                        new TextDecoder(encoding, { fatal: true }).decode(
                          await f.arrayBuffer(),
                        ),
                      );
                    } catch {
                      setMessage("인코딩을 확인해 주세요.");
                    }
                  }}
                />
              </label>
            </div>
            {preview && (
              <div className="preview">
                <h3>브라우저 미리보기</h3>
                <p>
                  {preview.rows.length}행 · 오류 {preview.errors.length}건
                </p>
                {preview.warnings.map((w, i) => (
                  <Notice key={i}>{w}</Notice>
                ))}
                {preview.errors.length > 0 && (
                  <>
                    <ul>
                      {preview.errors.slice(0, 10).map((e, i) => (
                        <li key={i}>
                          {e.row}행 · {e.code}
                        </li>
                      ))}
                    </ul>
                    <button onClick={() => downloadErrors(preview.errors)}>
                      실패 행 목록 다운로드
                    </button>
                  </>
                )}
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>국가</th>
                        <th>분류</th>
                        <th>관측일</th>
                        <th>순위</th>
                        <th>ASIN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 5).map((r, i) => (
                        <tr key={i}>
                          <td>{r.marketplace}</td>
                          <td>{r.category_ref}</td>
                          <td>{r.observation_date}</td>
                          <td>{r.rank}</td>
                          <td>{r.asin}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  className="primary"
                  disabled={
                    busy ||
                    !selected?.enabled ||
                    !!preview.errors.length ||
                    !preview.rows.length
                  }
                  onClick={() =>
                    act(() =>
                      rpc("stage_import_v1", { source, filename, content }),
                    )
                  }
                >
                  서버 검증 요청
                </button>
                <p>
                  서버 검증이 끝나면 아래 목록에서 결과를 확인하고 적재를
                  승인합니다.
                </p>
              </div>
            )}
          </section>
          <section className="panel">
            <h2>검증·적재 결과</h2>
            {batches.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>파일</th>
                      <th>상태</th>
                      <th>검증 결과</th>
                      <th>작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b) => (
                      <tr key={b.id}>
                        <td>
                          {b.filename}
                          <small>{b.id}</small>
                        </td>
                        <td>{b.state}</td>
                        <td>
                          {b.summary.map((s, i) => (
                            <p key={i}>
                              {s.actual_count}/100 · {s.completeness}
                            </p>
                          ))}
                          {b.warnings.map((w, i) => (
                            <p key={i}>{w}</p>
                          ))}
                          {b.errors.map((e, i) => (
                            <p key={i}>
                              {e.row} · {e.code}
                            </p>
                          ))}
                        </td>
                        <td>
                          {b.state === "needs_review" && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                act(() =>
                                  rpc("approve_import_v1", { batch: b.id }),
                                )
                              }
                            >
                              검수 완료 · 적재 요청
                            </button>
                          )}
                          {b.errors.length > 0 && (
                            <button onClick={() => downloadErrors(b.errors)}>
                              실패 행 다운로드
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>입력한 파일이 없습니다</Empty>
            )}
            <p>
              요청은 작업 큐에 저장됩니다. 배치 실행 후 상태를 새로고침하세요.
              즉시 자동 수집을 뜻하지 않습니다.
            </p>
          </section>
        </>
      )}
      {tab === "sources" && (
        <>
          <section className="panel">
            <h2>소스 이용권한 검토</h2>
            <form
              onSubmit={(e) => {
                const d = data(e);
                void act(() =>
                  rpc("review_source_v1", {
                    source: text(d, "source"),
                    collect: d.has("collect"),
                    store_raw: d.has("raw"),
                    store_derived: d.has("derived"),
                    share: d.has("share"),
                    export_data: d.has("export"),
                    evidence: text(d, "evidence"),
                    expiry: new Date(text(d, "expiry")).toISOString(),
                    hosts: text(d, "hosts")
                      .split(",")
                      .map((h) => h.trim())
                      .filter(Boolean),
                  }),
                );
              }}
            >
              <label>
                소스
                <select name="source">
                  {sources
                    .filter((s) => s.kind === "amazon_rank")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.display_name}
                      </option>
                    ))}
                </select>
              </label>
              <div className="checks">
                {[
                  ["collect", "수집 허용"],
                  ["raw", "원문 임시보관 허용"],
                  ["derived", "관측·파생자료 저장 허용"],
                  ["share", "Viewer 공유 허용"],
                  ["export", "내보내기 허용"],
                ].map(([id, label]) => (
                  <label key={id}>
                    <input type="checkbox" name={id} />
                    {label}
                  </label>
                ))}
              </div>
              <label>
                권한 근거
                <input name="evidence" required minLength={5} />
              </label>
              <label>
                허용 호스트 (콤마 구분)
                <input
                  name="hosts"
                  required
                  placeholder="승인 문서에 명시된 호스트"
                />
              </label>
              <label>
                승인 만료
                <input name="expiry" type="datetime-local" required />
              </label>
              <button disabled={busy}>검토 결과 저장</button>
            </form>
            <Notice>
              권한은 각 용도별로 독립 적용됩니다. AI 이용은 비활성 상태입니다.
            </Notice>
          </section>
          <section className="panel">
            <h2>12개 카테고리 검토</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>대상</th>
                    <th>노드</th>
                    <th>검증 상태</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => (
                    <tr key={c.id}>
                      <td>{c.ref}</td>
                      <td>{c.source_node_id ?? "미확인"}</td>
                      <td>{c.verification_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form
              onSubmit={(e) => {
                const d = data(e);
                void act(() =>
                  rpc("review_category_v1", {
                    category: text(d, "category"),
                    node: text(d, "node"),
                    path: text(d, "path"),
                    url: text(d, "url"),
                    evidence: text(d, "evidence"),
                  }),
                );
              }}
            >
              <label>
                카테고리
                <select name="category">
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.ref}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                확인한 노드 ID
                <input required name="node" />
              </label>
              <label>
                실제 상위 경로
                <input required name="path" />
              </label>
              <label>
                실제 목록 URL
                <input required type="url" name="url" />
              </label>
              <label>
                확인 근거
                <input required minLength={5} name="evidence" />
              </label>
              <button disabled={busy}>카테고리 확인 기록</button>
            </form>
          </section>
        </>
      )}
      {tab === "access" && (
        <section className="panel">
          <h2>Viewer 초대</h2>
          <form
            onSubmit={(e) => {
              const d = data(e);
              void act(() =>
                rpc("invite_viewer_v1", { email: text(d, "email") }),
              );
            }}
          >
            <label>
              Google 계정 이메일
              <input name="email" type="email" required />
            </label>
            <button disabled={busy}>7일간 유효한 초대 등록</button>
          </form>
          <p>
            초대는 이메일 전송 없이 등록됩니다. 검증된 로그인 이메일과 일치해야
            조회 권한이 부여됩니다.
          </p>
          <table>
            <thead>
              <tr>
                <th>회원 ID</th>
                <th>역할</th>
                <th>상태</th>
                <th>접근</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id}>
                  <td className="hash">{m.user_id}</td>
                  <td>{m.role}</td>
                  <td>{m.active ? "활성" : "차단"}</td>
                  <td>
                    {m.role === "viewer" && m.active && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          act(() =>
                            rpc("block_member_v1", { target_user: m.user_id }),
                          )
                        }
                      >
                        차단
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
export function Products() {
  const [market, setMarket] = useState("US");
  const [offset, setOffset] = useState(0);
  const { role } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [brand, setBrand] = useState("");
  const [message, setMessage] = useState("");
  const refresh = async () => {
    const [l, f, b] = await Promise.all([
      rpc<Listing[]>("get_listings_v1", { market, offset_rows: offset }),
      table<Family>("product_families"),
      table<{ id: string }>("brands", "id"),
    ]);
    setListings(l);
    setFamilies(f);
    setBrand(b[0]?.id ?? "");
  };
  useEffect(() => {
    if (configured) refresh().catch((e) => setMessage(e.message));
  }, [market, offset]);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PRODUCTS</span>
          <h1>제품과 마켓 매핑</h1>
          <p>
            회사 → 브랜드 → 제품군 → 국가별 Listing. 제목만으로 소속을 확정하지
            않습니다.
          </p>
        </div>
      </div>
      {message && <Notice>{message}</Notice>}
      <section className="panel">
        <div className="section-heading">
          <h2>등록 Listing</h2>
          <label>
            국가
            <select
              value={market}
              onChange={(e) => {
                setMarket(e.target.value);
                setOffset(0);
              }}
            >
              {marketConfig.markets.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <div>
            <button disabled={!offset} onClick={() => setOffset(offset - 100)}>
              이전 100개
            </button>
            <button
              disabled={listings.length < 100}
              onClick={() => setOffset(offset + 100)}
            >
              다음 100개
            </button>
          </div>
        </div>
        {listings.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>국가</th>
                  <th>ASIN</th>
                  <th>제품</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => (
                  <tr key={l.id}>
                    <td>{l.marketplace}</td>
                    <td>{l.asin}</td>
                    <td>{l.title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>등록된 Listing이 없습니다</Empty>
        )}
      </section>
      {role === "admin" && (
        <section className="panel">
          <h2>제품군과 매핑 승인</h2>
          <form
            onSubmit={(e) => {
              const d = data(e);
              rpc("create_family_v1", {
                brand,
                name: text(d, "name"),
                product_type: text(d, "type"),
              })
                .then(refresh)
                .catch((e) => setMessage(e.message));
            }}
          >
            <label>
              제품군 이름
              <input required name="name" />
            </label>
            <label>
              유형
              <select name="type">
                <option value="cosmetics">화장품</option>
                <option value="device">뷰티 디바이스</option>
                <option value="bundle">세트</option>
                <option value="other">기타</option>
              </select>
            </label>
            <button>제품군 추가</button>
          </form>
          <form
            onSubmit={(e) => {
              const d = data(e);
              rpc("assign_listing_v1", {
                listing: text(d, "listing"),
                family: text(d, "family"),
                approval: text(d, "approval"),
                valid_from: text(d, "date"),
                evidence: text(d, "evidence"),
              })
                .then(() => setMessage("새 매핑 이력을 저장했습니다."))
                .catch((e) => setMessage(e.message));
            }}
          >
            <label>
              Listing
              <select name="listing" required>
                {listings.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.marketplace} · {l.asin}
                  </option>
                ))}
              </select>
            </label>
            <label>
              제품군
              <select name="family" required>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              판정
              <select name="approval">
                <option value="candidate">검수 대기</option>
                <option value="approved">APR 승인</option>
                <option value="rejected">승인 철회</option>
              </select>
            </label>
            <label>
              적용일
              <input name="date" type="date" required />
            </label>
            <label>
              공식 제품·ASIN 확인 근거
              <input name="evidence" minLength={5} required />
            </label>
            <button disabled={!listings.length || !families.length}>
              새 매핑 이력 저장
            </button>
          </form>
        </section>
      )}
    </>
  );
}
