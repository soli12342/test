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

test("migration, RLS, membership revocation, shared data, imports and point-in-time reads", async () => {
  const db = await database();
  try {
    await users(db);
    assert.equal(
      (await db.query("select count(*)::int n from categories")).rows[0].n,
      12,
    );
    await identity(db, null, "anon");
    await assert.rejects(db.query("select get_overview_v1()"));
    await identity(db, OUTSIDER);
    await assert.rejects(db.query("select get_overview_v1()"), /NOT_INVITED/);
    assert.equal((await db.query("select * from categories")).rows.length, 0);
    await identity(db, VIEWER);
    await assert.rejects(
      db.query("select invite_viewer_v1('x@example.invalid')"),
      /FORBIDDEN/,
    );
    await assert.rejects(
      db.query("select commit_amazon_v1('[]')"),
      /permission denied/,
    );
    await assert.rejects(
      db.query(
        "insert into private.memberships(user_id,role) values(gen_random_uuid(),'admin')",
      ),
    );
    await db.exec("reset role");
    await approved(db);
    let out = await ingest(db, rows());
    assert.equal(out.snapshots.length, 1);
    const sid = out.snapshots[0].snapshot_id;
    out = await ingest(db, rows());
    assert.equal(out.snapshots[0].duplicate, true);
    assert.equal(
      (await db.query("select count(*)::int n from amazon_rank_entries"))
        .rows[0].n,
      100,
    );
    const bad = rows("GB");
    bad[2].rank = 1;
    await assert.rejects(ingest(db, bad), /DUPLICATE/);
    await db.exec("reset role");
    assert.equal(
      (await db.query("select count(*)::int n from amazon_snapshots")).rows[0]
        .n,
      1,
    );
    // Approval history is not inferred from title; explicit evidence required.
    const brand = (await db.query("select id from brands")).rows[0].id;
    await identity(db, ADMIN);
    const family = (
      await db.query(
        "select create_family_v1($1,'SYNTHETIC FAMILY','cosmetics') id",
        [brand],
      )
    ).rows[0].id;
    const listing = (
      await db.query("select id from listings where asin='TEST000010'")
    ).rows[0].id;
    const cutoff = (await db.query("select now()::text t")).rows[0].t;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await db.query(
      "select assign_listing_v1($1,$2,'approved','2026-01-01','SYNTHETIC VERIFIED TEST')",
      [listing, family],
    );
    let series = (
      await db.query(
        "select get_amazon_series_v1(date_from=>'2026-09-01',date_to=>'2026-09-01') r",
      )
    ).rows[0].r;
    assert.equal(
      series.data.find((x) => x.marketplace === "US").apr_listing_count,
      1,
    );
    assert.equal(series.europe5[0].value, null);
    assert.equal(series.europe5[0].n_valid, 0);
    let historical = (
      await db.query(
        "select get_amazon_series_v1(date_from=>'2026-09-01',date_to=>'2026-09-01',as_of=>$1) r",
        [cutoff],
      )
    ).rows[0].r;
    assert.equal(
      historical.data.find((x) => x.marketplace === "US").apr_listing_count,
      0,
    );
    let snap = (await db.query("select get_amazon_snapshot_v1($1) r", [sid]))
      .rows[0].r;
    assert.equal(snap.entries.length, 100);
    await db.exec("reset role");
    await ingest(db, rows("US", "beauty", "2026-09-02", 50));
    await identity(db, ADMIN);
    series = (
      await db.query(
        "select get_amazon_series_v1(date_from=>'2026-09-02',date_to=>'2026-09-02') r",
      )
    ).rows[0].r;
    assert.equal(
      series.data.find((x) => x.marketplace === "US").apr_listing_count,
      null,
    );
    const partial = series.data.find((x) => x.marketplace === "US").snapshot_id;
    snap = (await db.query("select get_amazon_snapshot_v1($1) r", [partial]))
      .rows[0].r;
    assert.equal(snap.changes.length, 0);
    await identity(db, VIEWER);
    assert.equal(
      (await db.query("select * from amazon_snapshots")).rows.length,
      2,
    );
    assert.equal(
      (await db.query("select * from import_batches")).rows.length,
      0,
    );
    await db.exec("reset role");
    await db.exec("update source_permissions set share_allowed=false");
    await identity(db, VIEWER);
    assert.equal(
      (await db.query("select * from amazon_snapshots")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select get_evidence_v1($1)", [sid]),
      /FORBIDDEN/,
    );
    series = (
      await db.query(
        "select get_amazon_series_v1(date_from=>'2026-09-01',date_to=>'2026-09-01') r",
      )
    ).rows[0].r;
    assert.equal(
      series.data.find((x) => x.marketplace === "US").apr_listing_count,
      null,
    );
    await identity(db, ADMIN);
    await db.query("select block_member_v1($1)", [VIEWER]);
    await identity(db, VIEWER);
    await assert.rejects(
      db.query("select get_amazon_series_v1()"),
      /NOT_INVITED/,
    );
  } finally {
    await db.close();
  }
});
