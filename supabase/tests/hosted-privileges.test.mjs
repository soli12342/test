import test from 'node:test';
import assert from 'node:assert/strict';
import { database, identity, users, VIEWER } from './harness.mjs';
test('hosted defaults cannot grant anonymous RPC access or authenticated TRUNCATE', async () => {
  const db=await database();
  try {
    await users(db);
    const result=await db.query(`select has_table_privilege('authenticated','public.companies','TRUNCATE') as truncate_allowed, has_function_privilege('anon','public.get_membership_v1()','EXECUTE') as anon_rpc, has_function_privilege('authenticated','public.claim_import_job_v1()','EXECUTE') as viewer_worker, has_function_privilege('service_role','public.claim_import_job_v1()','EXECUTE') as worker`);
    assert.deepEqual(result.rows[0],{truncate_allowed:false,anon_rpc:false,viewer_worker:false,worker:true});
    await identity(db, VIEWER);
    await assert.rejects(db.exec('truncate public.companies cascade'), /permission denied/);
    assert.equal((await db.query('select * from public.companies')).rows.length,2);
  } finally { await db.close(); }
});
