import { launched } from '../backend/src/ai/knowledgeBase';
import test from 'node:test';
import assert from 'node:assert/strict';
import { executeVaultTool } from '../backend/src/ai/vaultQueries';
import { createToolbox } from '../backend/src/ai/tools';
import { memoryStores } from '../backend/src/ai/gateway';
import type { UserRow } from '../backend/src/services/lineAssistant';
import type { VaultFile } from '../shared/vault';

const now = new Date('2026-10-24T04:00:00Z');
const user: UserRow = { user_id: 'owner-a', jobs: [
  { id: 'job-a', name: 'งาน A', client: 'ลูกค้า A', value: 1000, whtRate: 3, received: 970, pending: 0, paymentStatus: 'paid', payDate: '2026-10-01' },
  { id: 'job-b', name: 'งาน B', client: 'ลูกค้า B', value: 1000, whtRate: 3, received: 970, pending: 0, paymentStatus: 'paid', payDate: '2026-09-01' },
] as any };
const files = Array.from({ length: 12 }, (_, index) => ({ id: `f${index}`, kind: 'wht50', jobId: 'job-a', jobName: 'งาน A', client: 'ลูกค้า A', fileName: `50ทวิ-${index}.pdf`, mimeType: 'application/pdf', sizeBytes: 100, createdAt: '2026-10-01T00:00:00Z', storage_path: 'SECRET-PATH', access_token: 'SECRET-TOKEN' })) as unknown as VaultFile[];
const data = async (name: string, args: Record<string, unknown>, load = async () => files) => (await executeVaultTool(name, args, user, load, now)).result as any;

test('vault metadata is paginated and excludes private storage fields and file contents', async () => {
  const first = await data('search_vault', {});
  assert.equal(first.total, 12);
  assert.equal(first.rows.length, 10);
  assert.equal(first.next_offset, 10);
  const next = await data('search_vault', { offset: 10 });
  assert.equal(next.rows.length, 2);
  assert.equal(next.next_offset, null);
  assert.equal(next.contents_read, false);
  assert.doesNotMatch(JSON.stringify(first), /SECRET|storage_path|access_token/);
});

test('vault failures remain unknown rather than being presented as no saved files', async () => {
  assert.equal((await data('search_vault', {}, async () => { throw new Error('private SQL details'); })).ok, false);
  const result = (await executeVaultTool('search_vault', {}, user, undefined, now)).result as any;
  assert.equal(result.ok, false);
  assert.equal(result.total, undefined);
  assert.equal((await data('search_vault', { user_id: 'other-user' })).ok, false);
  assert.equal((await data('wht_tracking', { year: 10 })).ok, false);
});

test('certificate tracking uses own jobs and same app status rules, with BE year support', async () => {
  const waiting = await data('wht_tracking', { year: 2569, status: 'waiting' });
  assert.equal(waiting.year, 2026);
  assert.equal(waiting.total, 1);
  assert.equal(waiting.rows[0].job_id, 'job-b');
  assert.equal(waiting.rows[0].waiting_days, 53);
  const have = await data('wht_tracking', { status: 'have' });
  assert.equal(have.total, 1);
  assert.equal(have.rows[0].file_count, 12);
});

test('toolbox loads scoped vault lazily once and rejects model ownership overrides', async () => {
  let loads = 0;
  const execute = createToolbox({ user, ...memoryStores(), now, loadVaultFiles: async () => { loads++; return files; } });
  await execute({ id: 'x', name: 'search_jobs', args: {} });
  assert.equal(loads, 0);
  const invalid = await execute({ id: 'x', name: 'search_vault', args: { user_id: 'owner-b' } });
  assert.equal((invalid.result as any).ok, false);
  assert.equal(loads, 0);
  const vault = await execute({ id: 'x', name: 'search_vault', args: {} });
  await execute({ id: 'x', name: 'wht_tracking', args: {} });
  // Off while the vault and 50 ทวิ are not open to every account (owner, 2026-10-24); the reads above stay scoped.
  if (launched('vault')) assert.equal(loads, 1);
  else { assert.equal((vault.result as any).ok, false); assert.equal(loads, 0); }
});
