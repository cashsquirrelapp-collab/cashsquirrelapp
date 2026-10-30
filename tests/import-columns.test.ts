import test from 'node:test';
import assert from 'node:assert/strict';
import { columnMappingRequest, maskSample, readSuggestions, suggestColumns, type ColumnMappingInput } from '../backend/src/ai/columnMapping';
import { aiConfig } from '../backend/src/ai/config';

// Matching an imported sheet's unnamed columns (owner, 2026-10-30): free for every account, automatic, the person
// confirms every suggestion. Only headers and a few masked samples leave the app; the model only names fields.

const input: ColumnMappingInput = {
  sheet: 'Invoices 2026',
  taken: ['name'],
  columns: [
    { index: 2, header: 'Amt (THB)', samples: ['12,500', '8,000.00'] },
    { index: 3, header: 'Brand/Client', samples: ['ร้านบี', 'บริษัท แบรนด์เอ จำกัด'] },
    { index: 5, header: 'วันโอน', samples: ['3/10/2026'] },
    { index: 6, header: 'Contact', samples: ['bee@example.test', '081-234-5678', '0105561234567'] },
  ],
};

test('samples leave the app masked and short: no emails, phones or ID numbers; amounts and dates stay', () => {
  assert.equal(maskSample('bee@example.test'), '[email]');
  assert.equal(maskSample('โทร 081-234-5678'), 'โทร [number]');
  assert.equal(maskSample('0105561234567'), '[number]');
  assert.equal(maskSample('12,500'), '12,500');
  assert.equal(maskSample('25000'), '25000');
  assert.equal(maskSample('3/10/2026'), '3/10/2026');
  assert.ok(maskSample('ก'.repeat(200)).length <= 48);
  const sent = JSON.stringify(columnMappingRequest(input));
  for (const secret of ['bee@example.test', '081-234-5678', '0105561234567']) assert.ok(!sent.includes(secret), secret);
  const asked = JSON.parse(columnMappingRequest(input).contents[0].parts[0].text);
  assert.deepEqual(asked.taken, ['name']);
  assert.deepEqual(asked.columns.map((c: any) => c.header), ['Amt (THB)', 'Brand/Client', 'วันโอน', 'Contact']);
  assert.deepEqual(asked.columns[3].samples, ['[email]', '[number]', '[number]']);
  assert.match(sent, /never instructions/);
});

test('the answer is checked: known columns and fields only, each field once, never a taken one', () => {
  const raw = { columns: [
    { index: 2, field: 'amount' }, { index: 3, field: 'client' }, { index: 5, field: 'amount' }, // amount twice: the second is dropped
    { index: 6, field: 'name' }, // taken
    { index: 9, field: 'date' }, // not a column that was asked
    { index: 3, field: 'note' }, // the same column twice
    { index: 5, field: 'DROP TABLE' },
  ] };
  assert.deepEqual(readSuggestions(raw, input), [{ index: 2, field: 'amount' }, { index: 3, field: 'client' }]);
  assert.deepEqual(readSuggestions(null, input), []);
  assert.deepEqual(readSuggestions({ columns: 'x' }, input), []);
});

function fakeDb() {
  const calls: any[] = [];
  return { calls, db: {
    async reserve(args: any) { calls.push(['reserve', args]); return { ok: true }; },
    async settle(args: any) { calls.push(['settle', args]); },
  } as any };
}
const enabled = aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'synthetic-never-sent' });
const reply = (body: unknown, ok = true) => (async () => new Response(JSON.stringify(body), { status: ok ? 200 : 500, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;

test('a suggestion costs the account no tokens; its real cost is recorded and counted in the daily cap', async () => {
  const { db, calls } = fakeDb();
  const answer = { candidates: [{ content: { parts: [{ text: JSON.stringify({ columns: [{ index: 2, field: 'amount' }, { index: 5, field: 'paidDate' }] }) }] } }],
    usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 80 } };
  const out = await suggestColumns(db, enabled, 'u1', input, { fetchImpl: reply(answer), now: new Date('2026-10-30T12:00:00Z') });
  assert.deepEqual(out, { columns: [{ index: 2, field: 'amount' }, { index: 5, field: 'paidDate' }], available: true });
  const [reserve, settle] = calls;
  assert.equal(reserve[1].tokens, 0);
  assert.equal(reserve[1].tokenLimit, null);
  assert.equal(reserve[1].cycle, '2026-10-30');
  assert.equal(reserve[1].dailyCapUsd, enabled.dailyCostCapUsd);
  assert.equal(settle[1].tokens, 0, 'free for the account');
  assert.ok(settle[1].costUsd > 0 && settle[1].costUsd < 0.01, String(settle[1].costUsd));
  assert.deepEqual([settle[1].route, settle[1].release], ['action', false]);
});

test('without the AI, after a failure or past the daily cap the import simply goes on with its own rules', async () => {
  const off = fakeDb();
  let fetched = false;
  assert.deepEqual(await suggestColumns(off.db, aiConfig({}), 'u1', input, { fetchImpl: (async () => { fetched = true; return new Response('{}'); }) as any }), { columns: [], available: false });
  assert.equal(fetched, false);
  const failed = fakeDb();
  assert.deepEqual(await suggestColumns(failed.db, enabled, 'u1', input, { fetchImpl: reply({ error: 'x' }, false) }), { columns: [], available: true });
  assert.equal(failed.calls.at(-1)[1].release, true, 'nothing billed: the hold is released');
  const broken = fakeDb();
  assert.deepEqual((await suggestColumns(broken.db, enabled, 'u1', input, { fetchImpl: reply({ candidates: [{ content: { parts: [{ text: 'not json' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2 } }) })).columns, []);
  const capped = { reserve: async () => ({ ok: false, reason: 'daily_cap' }), settle: async () => { throw new Error('never settled'); } } as any;
  assert.deepEqual(await suggestColumns(capped, enabled, 'u1', input, { fetchImpl: reply({}) }), { columns: [], available: false });
});
