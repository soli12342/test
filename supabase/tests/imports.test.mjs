import test from "node:test";
import assert from "node:assert/strict";
import {
  database,
  users,
  approved,
  identity,
  ingest,
  rows,
  ADMIN,
  VIEWER,
  OUTSIDER,
} from "./harness.mjs";

test("upload → worker validation → Admin review → worker commit, atomic and idempotent", async () => {
  const db = await database();
  try {
    await users(db);
    await approved(db);
    const source = (
      await db.query("select id from sources where ref='amazon_primary'")
    ).rows[0].id;
    await identity(db, VIEWER);
    await assert.rejects(
      db.query("select stage_import_v1($1,'test.json',$2)", [
        source,
        JSON.stringify(rows()),
      ]),
      /FORBIDDEN/,
    );
    await identity(db, ADMIN);
    const content = JSON.stringify(rows());
    const batch = (
      await db.query("select stage_import_v1($1,'test.json',$2) b", [
        source,
        content,
      ])
    ).rows[0].b;
    assert.equal(
      (
        await db.query("select stage_import_v1($1,'test.json',$2) b", [
          source,
          content,
        ])
      ).rows[0].b,
      batch,
    );
    await assert.rejects(
      db.query("select approve_import_v1($1)", [batch]),
      /VALIDATION_FAILED/,
    );
    await identity(db, null, "service_role");
    const job = (await db.query("select claim_import_job_v1() j")).rows[0].j;
    assert.equal(job.content, content);
    await db.query(
      "select finish_validation_v1($1,'[]','[]','[{\"actual_count\":100,\"completeness\":\"complete\"}]')",
      [job.id],
    );
    await identity(db, ADMIN);
    assert.equal(
      (await db.query("select state from import_batches where id=$1", [batch]))
        .rows[0].state,
      "needs_review",
    );
    await db.query("select approve_import_v1($1)", [batch]);
    await identity(db, null, "service_role");
    assert.equal(
      (await db.query("select claim_import_job_v1() j")).rows[0].j.kind,
      "commit_import",
    );
    await db.query("select commit_amazon_v1($1,$2)", [content, batch]);
    assert.equal(
      (await db.query("select count(*)::int n from private.import_payloads"))
        .rows[0].n,
      0,
    );
    assert.equal(
      (await db.query("select state from import_batches where id=$1", [batch]))
        .rows[0].state,
      "committed",
    );
    assert.equal(
      (await db.query("select commit_amazon_v1($1,$2) r", [content, batch]))
        .rows[0].r.status,
      "already_committed",
    );
  } finally {
    await db.close();
  }
});
test("database independently rejects malformed/unapproved files and rolls back all groups", async () => {
  const db = await database();
  try {
    await users(db);
    await assert.rejects(ingest(db, rows()), /SOURCE_NOT_CONFIGURED/);
    await db.exec("reset role");
    await approved(db);
    for (const mutation of [
      (r) => (r[0].schema_version = null),
      (r) => (r[0].rank = 101),
      (r) => (r[0].source_url = "http://127.0.0.1/"),
      (r) => (r[0].marketplace = "UK"),
      (r) => (r[0].observed_at = "2026-09-01T00:00:00Z"),
      (r) => (r[0].extra = "unexpected"),
    ]) {
      const r = rows();
      mutation(r);
      await assert.rejects(ingest(db, r));
      await db.exec("reset role");
    }
    const mixed = [...rows(), ...rows("GB")];
    mixed[101].rank = 1;
    await assert.rejects(ingest(db, mixed), /DUPLICATE/);
    await db.exec("reset role");
    assert.equal(
      (await db.query("select count(*)::int n from amazon_snapshots")).rows[0]
        .n,
      0,
    );
    await db.exec(
      "update source_permissions set expires_at=now()-interval '1 hour'",
    );
    await assert.rejects(ingest(db, rows()), /SOURCE_BLOCKED/);
  } finally {
    await db.close();
  }
});
test("revisions preserve canonical/as-of and cross-market identities", async () => {
  const db = await database();
  try {
    await users(db);
    await approved(db);
    const a = (await ingest(db, rows())).snapshots[0].snapshot_id;
    const revision = rows();
    [revision[0].rank, revision[1].rank] = [revision[1].rank, revision[0].rank];
    const b = (await ingest(db, revision)).snapshots[0].snapshot_id;
    assert.notEqual(a, b);
    assert.equal(
      (await db.query("select count(*)::int n from snapshot_selections"))
        .rows[0].n,
      1,
    );
    const prior = (await db.query("select now()::text t")).rows[0].t;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await identity(db, ADMIN);
    await db.query(
      "select select_snapshot_v1($1,'SYNTHETIC correction reason')",
      [b],
    );
    const older = (
      await db.query(
        "select get_amazon_series_v1(date_from=>'2026-09-01',date_to=>'2026-09-01',as_of=>$1) r",
        [prior],
      )
    ).rows[0].r;
    assert.equal(older.data.find((x) => x.marketplace === "US").snapshot_id, a);
    const newer = (
      await db.query(
        "select get_amazon_series_v1(date_from=>'2026-09-01',date_to=>'2026-09-01') r",
      )
    ).rows[0].r;
    assert.equal(newer.data.find((x) => x.marketplace === "US").snapshot_id, b);
    await db.exec("reset role");
    await ingest(db, rows("GB"));
    await ingest(db, rows("US", "skincare"));
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from listings where asin='TEST000001'",
        )
      ).rows[0].n,
      2,
    );
    assert.equal(
      (await db.query("select count(*)::int n from listings")).rows[0].n,
      200,
    );
  } finally {
    await db.close();
  }
});
test("invite uses verified Auth email, ignores user_metadata and rejects expiry", async () => {
  const db = await database();
  try {
    await users(db);
    await db.exec(
      `update auth.users set raw_user_meta_data='{"role":"admin","email":"viewer@example.invalid"}' where id='${OUTSIDER}'`,
    );
    await identity(db, OUTSIDER);
    await assert.rejects(db.query("select redeem_invite_v1()"), /NOT_INVITED/);
    await identity(db, ADMIN);
    await db.query("select invite_viewer_v1('outsider@example.invalid')");
    await db.exec("reset role");
    await db.exec(
      `update auth.users set email_confirmed_at=null where id='${OUTSIDER}'`,
    );
    await identity(db, OUTSIDER);
    await assert.rejects(db.query("select redeem_invite_v1()"), /NOT_INVITED/);
    await db.exec("reset role");
    await db.exec(
      `update auth.users set email_confirmed_at=now() where id='${OUTSIDER}'`,
    );
    await identity(db, OUTSIDER);
    assert.equal(
      (await db.query("select redeem_invite_v1() r")).rows[0].r.role,
      "viewer",
    );
    await identity(db, ADMIN);
    await db.query("select block_member_v1($1)", [OUTSIDER]);
    await db.query("select invite_viewer_v1('outsider@example.invalid')");
    await identity(db, OUTSIDER);
    await assert.rejects(db.query("select redeem_invite_v1()"), /NOT_INVITED/);
  } finally {
    await db.close();
  }
});

test("Admin source/category review, product history, changed filename deduplication and source failure status", async () => {
  const db = await database();
  try {
    await users(db);
    const source = (
      await db.query("select id from sources where ref='amazon_primary'")
    ).rows[0].id;
    const cat = (
      await db.query("select id from categories where ref='US_beauty'")
    ).rows[0].id;
    await identity(db, ADMIN);
    await db.query(
      "select review_source_v1($1,true,true,true,false,false,'SYNTHETIC EVIDENCE',now()+interval '1 year',array['data.example.invalid'])",
      [source],
    );
    await db.query(
      "select review_category_v1($1,'SYNTHETIC','SYNTHETIC PATH','https://data.example.invalid/beauty','SYNTHETIC EVIDENCE')",
      [cat],
    );
    const first = await ingest(db, rows());
    const renamed = rows().map((r) => ({
      ...r,
      snapshot_ref: "different-upload-name",
    }));
    const again = await ingest(db, renamed);
    assert.equal(
      first.snapshots[0].snapshot_id,
      again.snapshots[0].snapshot_id,
    );
    assert.equal(again.snapshots[0].duplicate, true);
    const lid = (await db.query("select id from listings limit 1")).rows[0].id;
    await identity(db, ADMIN);
    const history = (
      await db.query(
        "select get_product_history_v1($1,'2026-09-01','2026-09-02') r",
        [lid],
      )
    ).rows[0].r;
    assert.equal(history.length, 1);
    await db.exec("reset role");
    await db.exec(
      "update sources set status='failed' where ref='amazon_primary'",
    );
    await identity(db, ADMIN);
    const series = (
      await db.query(
        "select get_amazon_series_v1(date_from=>'2026-09-01',date_to=>'2026-09-01') r",
      )
    ).rows[0].r;
    assert.equal(
      series.data.find((p) => p.marketplace === "US").status,
      "failed",
    );
  } finally {
    await db.close();
  }
});

test("SQL metrics match specification: Europe5/rolling coverage, rank delta and confirmed exit", async () => {
  const db = await database();
  try {
    await users(db);
    await approved(db);
    for (const m of ["US", "GB", "DE", "FR", "IT", "ES"])
      await ingest(db, rows(m));
    const brand = (await db.query("select id from brands")).rows[0].id;
    await identity(db, ADMIN);
    const family = (
      await db.query(
        "select create_family_v1($1,'SYNTHETIC FAMILY','cosmetics') id",
        [brand],
      )
    ).rows[0].id;
    const listings = (
      await db.query("select id from listings where asin='TEST000020'")
    ).rows;
    for (const l of listings)
      await db.query(
        "select assign_listing_v1($1,$2,'approved','2026-01-01','SYNTHETIC EVIDENCE')",
        [l.id, family],
      );
    let series = (
      await db.query(
        "select get_amazon_series_v1(date_from=>'2026-09-01',date_to=>'2026-09-01') r",
      )
    ).rows[0].r;
    const expected = (100 * 81) / 5050;
    assert.ok(Math.abs(series.europe5[0].value - expected) < 1e-10);
    assert.equal(series.europe5[0].n_valid, 5);
    assert.equal(series.data[0].avg_7d, null);
    const moved = rows("US", "beauty", "2026-09-02");
    [moved[9].rank, moved[19].rank] = [moved[19].rank, moved[9].rank];
    const sid = (await ingest(db, moved)).snapshots[0].snapshot_id;
    await identity(db, ADMIN);
    let snap = (await db.query("select get_amazon_snapshot_v1($1) r", [sid]))
      .rows[0].r;
    assert.equal(
      snap.changes.find((c) => c.asin === "TEST000020").rank_change,
      10,
    );
    const gone = rows("US", "beauty", "2026-09-03");
    gone[19].asin = "TEST999999";
    const exitid = (await ingest(db, gone)).snapshots[0].snapshot_id;
    await identity(db, ADMIN);
    snap = (await db.query("select get_amazon_snapshot_v1($1) r", [exitid]))
      .rows[0].r;
    assert.equal(snap.changes.filter((c) => c.exit).length, 1);
    assert.equal(snap.changes.find((c) => c.exit).rank, null);
    await db.exec("reset role");
    await db.exec(
      "update source_permissions set share_allowed=false where source_id=(select id from sources where ref='amazon_primary')",
    );
    await identity(db, VIEWER);
    series = (
      await db.query(
        "select get_amazon_series_v1(date_from=>'2026-09-01',date_to=>'2026-09-01') r",
      )
    ).rows[0].r;
    assert.equal(series.europe5[0].value, null);
    assert.equal(series.europe5[0].n_valid, 0);
  } finally {
    await db.close();
  }
});

test("private titles and private canonical replacement do not leak or trigger shared fallback", async () => {
  const db = await database();
  try {
    await users(db);
    await approved(db);
    const first = (await ingest(db, rows())).snapshots[0].snapshot_id;
    await db.exec(
      "insert into sources(ref,kind,display_name,enabled,mode,allowed_hosts) values('private_source','amazon_rank','Private',true,'manual_file',array['data.example.invalid']);insert into source_permissions(source_id,collect_allowed,store_derived_allowed,share_allowed,evidence_ref) select id,true,true,false,'SYNTHETIC PRIVATE' from sources where ref='private_source';",
    );
    const privateRows = rows().map((r) => ({
      ...r,
      source_ref: "private_source",
      title: "PRIVATE TITLE NEVER SHARE",
    }));
    const second = (await ingest(db, privateRows)).snapshots[0].snapshot_id;
    await identity(db, VIEWER);
    const listings = (await db.query("select get_listings_v1('US') r")).rows[0]
      .r;
    assert.equal(listings.length, 100);
    assert.ok(listings.every((l) => !l.title.includes("PRIVATE")));
    await identity(db, ADMIN);
    await db.query(
      "select select_snapshot_v1($1,'SYNTHETIC PRIVATE CANONICAL')",
      [second],
    );
    await identity(db, VIEWER);
    const series = (
      await db.query(
        "select get_amazon_series_v1(date_from=>'2026-09-01',date_to=>'2026-09-01') r",
      )
    ).rows[0].r;
    assert.equal(
      series.data.find((p) => p.marketplace === "US").snapshot_id,
      null,
    );
    assert.equal(
      series.data.find((p) => p.marketplace === "US").exposure_index,
      null,
    );
    const evidence = (await db.query("select get_evidence_v1($1) r", [first]))
      .rows[0].r;
    assert.ok(evidence.revisions.every((r) => r.id !== second));
  } finally {
    await db.close();
  }
});
