import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
export async function database() {
  const db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated,service_role;`,
  );
  // Match hosted Supabase's explicit defaults, including TRUNCATE and anon RPCs.
  await db.exec(`alter default privileges in schema public grant all on tables to anon,authenticated,service_role; alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`);
  for (const f of (await readdir("supabase/migrations")).sort())
    await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
  await db.exec(await readFile("supabase/seed.sql", "utf8"));
  return db;
}
export const ADMIN = "10000000-0000-4000-8000-000000000001";
export const VIEWER = "10000000-0000-4000-8000-000000000002";
export const OUTSIDER = "10000000-0000-4000-8000-000000000003";
export async function identity(db, id, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id ?? "",
  ]);
  await db.exec("set role " + role);
}
export async function users(db) {
  await db.exec(
    `insert into auth.users(id,email,email_confirmed_at) values('${ADMIN}','admin@example.invalid',now()),('${VIEWER}','viewer@example.invalid',now()),('${OUTSIDER}','outsider@example.invalid',now()); insert into private.memberships(user_id,role) values('${ADMIN}','admin'),('${VIEWER}','viewer');`,
  );
}
export async function approved(db) {
  await db.exec(
    `update sources set enabled=true,allowed_hosts=array['data.example.invalid'],mode='manual_file' where ref='amazon_primary';update source_permissions set collect_allowed=true,store_raw_allowed=true,store_derived_allowed=true,share_allowed=true,evidence_ref='SYNTHETIC TEST ONLY',expires_at=now()+interval '1 year';update categories set verification_status='verified',source_node_id='SYNTHETIC',path='SYNTHETIC',listing_url='https://data.example.invalid/test';`,
  );
}
export function rows(
  market = "US",
  category = "beauty",
  day = "2026-09-01",
  count = 100,
) {
  return Array.from({ length: count }, (_, i) => ({
    schema_version: "1.0",
    source_ref: "amazon_primary",
    marketplace: market,
    category_ref: market + "_" + category,
    observation_date: day,
    observed_at: null,
    time_precision: "date",
    snapshot_ref: day,
    rank: i + 1,
    asin: "TEST" + String(i + 1).padStart(6, "0"),
    title: "SYNTHETIC TEST PRODUCT " + (i + 1),
    brand: "SYNTHETIC",
    source_url: "https://data.example.invalid/test",
  }));
}
export async function ingest(db, data) {
  await identity(db, null, "service_role");
  const r = await db.query("select commit_amazon_v1($1::jsonb) result", [
    JSON.stringify(data),
  ]);
  await db.exec("reset role");
  return r.rows[0].result;
}
