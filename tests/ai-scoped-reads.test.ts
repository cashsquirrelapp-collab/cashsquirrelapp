import test from 'node:test';
import assert from 'node:assert/strict';
import { supabaseAssistantDb } from '../backend/src/ai/supabaseDb';

test('real read adapter filters snapshots and vault metadata to its bound owner (mock database)', async () => {
  const oldUrl = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://assistant-scope.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-test-only';
  const realFetch = globalThis.fetch;
  const seen: string[] = [];
  const owners = ['owner-a', 'owner-b'];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://assistant-scope.test', 'no external network is permitted');
    assert.equal(init?.method || 'GET', 'GET', 'read adapter must never mutate');
    const filter = url.searchParams.get('user_id');
    assert.ok(filter?.startsWith('eq.'));
    const owner = filter!.slice(3);
    assert.ok(owners.includes(owner));
    assert.equal(url.searchParams.get('group_id'), null);
    seen.push(`${url.pathname}:${owner}`);
    let data: unknown;
    if (url.pathname.endsWith('/cashflow_account_snapshot')) data = { user_id: owner, jobs: [{ id: 'same-job-id', name: `private-${owner}` }], versions: {} };
    else if (url.pathname.endsWith('/cashflow_vault_files')) data = [{ id: `file-${owner}`, user_id: owner, group_id: null, kind: 'other', job_id: null, job_name: null, client: null, file_name: `private-${owner}.pdf`, mime_type: 'application/pdf', size_bytes: 50, storage_path: `SECRET-${owner}`, created_at: '2026-10-24T00:00:00Z' }];
    else throw new Error('Unexpected request in scoped read test');
    return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    for (const owner of owners) {
      const account = await supabaseAssistantDb.loadAccount(owner);
      assert.equal(account.user.user_id, owner);
      assert.equal(account.user.jobs![0].name, `private-${owner}`);
      const files = await supabaseAssistantDb.listVaultFiles!(owner);
      assert.equal(files[0].fileName, `private-${owner}.pdf`);
      assert.doesNotMatch(JSON.stringify(files), /SECRET|storage_path|user_id|group_id/);
    }
    assert.equal(seen.length, 4);
  } finally {
    globalThis.fetch = realFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});
