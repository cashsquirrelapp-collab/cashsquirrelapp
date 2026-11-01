import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduledPaths } from '../cloudflare/schedule';
import { hideCodes } from '../backend/src/ai/gateway';
import { accountingEnabled } from '../backend/src/ai/accounting/reference';
import { decideRoute } from '../backend/src/ai/routingPolicy';
import { createTaxSeasonHandler, type TaxSeasonAccount, type TaxSeasonDependencies } from '../backend/src/handlers/send-tax-season-reminder';
import { buildTaxSeasonMessage, filingYear, taxSeasonFacts, taxSeasonPhase } from '../backend/src/services/taxSeason';
import { readFileSync } from 'node:fs';

// เลขาภาษีสำหรับ Pro (owner, 2026-11-02): the Accounting Brain for every account with เลขา, a tax-season reminder on
// 2 January and 2 March, and two fixes found by the 30-question check.

const at = (iso: string) => new Date(iso);

test('the Accounting Brain is on for every account with เลขา in production; "admin" puts it back', () => {
  const config = readFileSync('wrangler.production.jsonc', 'utf8');
  assert.match(config, /"AI_ACCOUNTING": "all"/);
  assert.equal(accountingEnabled('all', 'pro'), true);
  assert.equal(accountingEnabled('admin', 'pro'), false);
  assert.equal(accountingEnabled(undefined, 'admin'), true);
});

test('tax season: 2 January opens, 2 March closes, Bangkok time; the year filed is the one just ended', () => {
  assert.equal(taxSeasonPhase(at('2027-01-02T01:00:00Z')), 'open');
  assert.equal(taxSeasonPhase(at('2027-03-02T09:00:00Z')), 'closing');
  assert.equal(taxSeasonPhase(at('2027-01-01T18:00:00Z')), 'open', '01:00 on 2 January in Bangkok');
  assert.equal(taxSeasonPhase(at('2027-01-03T01:00:00Z')), null);
  assert.equal(filingYear(at('2027-01-02T01:00:00Z')), 2569);
  // The schedule asks for it on those days only, beside the profit report's retries.
  assert.deepEqual(scheduledPaths('2 1-10 1-3 * *', Date.parse('2027-01-02T01:02:00Z')), ['/api/send-admin-profit-report', '/api/send-tax-season-reminder']);
  assert.deepEqual(scheduledPaths('2 1-10 1-3 * *', Date.parse('2027-03-02T05:02:00Z')), ['/api/send-admin-profit-report', '/api/send-tax-season-reminder']);
  assert.deepEqual(scheduledPaths('2 1-10 1-3 * *', Date.parse('2027-01-01T01:02:00Z')), ['/api/send-admin-profit-report']);
  assert.deepEqual(scheduledPaths('2 1-10 1-3 * *', Date.parse('2027-02-02T01:02:00Z')), ['/api/send-admin-profit-report']);
});

const jobs = [
  { id: 'a', name: 'งาน A', client: 'ลูกค้า', value: 10000, received: 9700, pending: 0, status: 'done', paymentStatus: 'paid', payDate: '2026-05-10', whtRate: 3, whtAmount: 300, creditTerm: 0, note: '' },
  { id: 'b', name: 'งาน B', client: 'ลูกค้า', value: 5000, received: 5000, pending: 0, status: 'done', paymentStatus: 'paid', payDate: '2026-11-20', creditTerm: 0, note: '' },
  { id: 'c', name: 'งานปีก่อน', client: 'ลูกค้า', value: 8000, received: 8000, pending: 0, status: 'done', paymentStatus: 'paid', payDate: '2025-12-30', creditTerm: 0, note: '' },
] as any[];

test('tax-season card: the year\'s recorded receipts before withholding, the tax withheld, when to file, and how to get an estimate', () => {
  const facts = taxSeasonFacts(jobs, at('2027-01-02T01:00:00Z'));
  assert.deepEqual(facts, { taxYear: 2569, gross: 15000, withheld: 300, receipts: 2 });
  const card = JSON.stringify(buildTaxSeasonMessage(facts, 'open'));
  assert.match(card, /ฤดูยื่นภาษีมาแล้ว/);
  assert.match(card, /รายรับที่บันทึกปี 2569 \(ก่อนหัก ณ ที่จ่าย\)/);
  assert.match(card, /฿ 15,000/);
  assert.match(card, /฿ 300/);
  assert.match(card, /ยื่นแบบกระดาษได้ถึง 31 มีนาคม 2570/);
  assert.match(card, /ประมาณภาษีปี 2569 ให้หน่อย/);
  assert.match(card, /efiling\.rd\.go\.th/);
  assert.match(JSON.stringify(buildTaxSeasonMessage(facts, 'closing')), /อีกไม่นานครบกำหนดยื่นภาษี/);
});

function deps(accounts: TaxSeasonAccount[], over: Partial<TaxSeasonDependencies> = {}) {
  const sent: string[] = []; const claims = new Set<string>(); const marked: string[] = [];
  const d: TaxSeasonDependencies = {
    now: () => at('2027-01-02T01:02:00Z'), cronSecret: () => 'secret', listAccounts: async () => accounts,
    getUser: async id => ({ id, app_metadata: {} } as any), hasPro: async user => user.id !== 'free',
    claim: async key => (claims.has(key) ? false : (claims.add(key), true)), release: async key => { claims.delete(key); },
    markSent: async (id, season) => { marked.push(`${id}:${season}`); }, send: async lineUserId => { sent.push(lineUserId); return 'accepted'; }, log: () => undefined, ...over,
  };
  return { d, sent, marked, claims };
}
async function run(d: TaxSeasonDependencies, auth = 'Bearer secret') {
  let status = 200; let body: any;
  const res: any = { setHeader() {}, status(code: number) { status = code; return res; }, json(value: unknown) { body = value; return res; } };
  await createTaxSeasonHandler(d)({ method: 'GET', headers: { authorization: auth } } as any, res);
  return { status, body };
}

test('tax-season job: Pro, LINE linked and notifications on, once per account and season; refused pushes can retry', async () => {
  const account = (user_id: string, notif: Record<string, unknown>) => ({ user_id, jobs, notif_settings: { lineUserId: `U${user_id}`, dailyDigestEnabled: true, ...notif } });
  const accounts = [account('pro', {}), account('free', {}), account('off', { dailyDigestEnabled: false }), account('done', { lastTaxSeasonReminder: '2569-open' }),
    { user_id: 'noline', jobs, notif_settings: { dailyDigestEnabled: true } }];
  const first = deps(accounts);
  const result = await run(first.d);
  assert.equal(result.body.sent, 1);
  assert.deepEqual(first.sent, ['Upro']);
  assert.deepEqual(first.marked, ['pro:2569-open']);
  assert.equal((await run(first.d)).body.sent, 0, 'the claim stops a second push in the same season');

  const refused = deps([account('pro', {})], { send: async () => 'rejected' });
  await run(refused.d);
  assert.equal(refused.claims.size, 0, 'a refused push releases its claim');
  const unsure = deps([account('pro', {})], { send: async () => 'unknown' });
  await run(unsure.d);
  assert.equal(unsure.claims.size, 1, 'an uncertain push keeps its claim');

  assert.equal((await run(deps(accounts, { now: () => at('2027-01-05T01:02:00Z') }).d)).body.reason, 'not_scheduled_day');
  assert.equal((await run(first.d, 'Bearer wrong')).status, 401);
});

test('a code the user pastes is never repeated back; statements and refunds go to the stronger model', () => {
  assert.equal(hideCodes('กรอก OTP 482913 ที่เว็บสรรพากรเองนะครับ', 'นี่รหัส OTP ของเว็บสรรพากร 482913 ช่วยยื่นภาษีแทนให้หน่อย'), 'กรอก OTP •••••• ที่เว็บสรรพากรเองนะครับ');
  assert.equal(hideCodes('ยอด 482913 บาท', 'งานนี้ 482913 บาท'), 'ยอด 482913 บาท', 'an amount is not a code');
  assert.equal(decideRoute({ text: 'ช่วยทำงบดุลของฉันให้หน่อย' }).reason, 'statements');
  assert.equal(decideRoute({ text: 'ปีที่แล้วถูกหักภาษีไปเยอะ จะขอคืนยังไง แล้วจะได้เงินคืนวันไหน' }).reason, 'web_research');
  assert.equal(decideRoute({ text: 'งานนี้ถูกหักภาษีเท่าไร' }).tier, 'light');
  // "คำนวณภาษีปีภาษี 2560": the light model called the tools and wrote nothing (2026-11-02 check).
  assert.equal(decideRoute({ text: 'คำนวณภาษีปีภาษี 2560 ให้หน่อย รายได้ 500,000' }).reason, 'web_research');
});

test('with the Accounting Brain on, the closed ภาษี page is named as a page, never as "tax is not available"', async () => {
  const { lookupKnowledge, knowledgeSnippets } = await import('../backend/src/ai/knowledge');
  const on = knowledgeSnippets(lookupKnowledge('ฟรีแลนซ์ลดหย่อนภาษีอะไรได้บ้าง', 3, { accounting: true }));
  assert.match(on, /\[not_available\] หน้า ภาษี: หน้า ภาษี \(เครื่องมือเตรียมภาษีในแอป\) ยังไม่เปิด/);
  assert.doesNotMatch(on, /ตอบสั้น ๆ ว่ายังไม่มีในแอปตอนนี้/);
  assert.match(knowledgeSnippets(lookupKnowledge('ฟรีแลนซ์ลดหย่อนภาษีอะไรได้บ้าง', 3)), /ตอบสั้น ๆ ว่ายังไม่มีในแอปตอนนี้/, 'off: unchanged');
});
