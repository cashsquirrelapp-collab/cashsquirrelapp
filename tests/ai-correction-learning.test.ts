import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolbox, type Proposal } from '../backend/src/ai/tools';
import { confirmProposal, reviseProposal, type AssistantDb, type StoredProposal } from '../backend/src/ai/service';
import { flipFlops, learnedPairs, mergePairs, pairFromCardEdit, pairsFromEdit, ruleText } from '../backend/src/ai/learning';
import { selectMemories, type MemoryRow } from '../backend/src/ai/memory';
import { buildSystemPrompt } from '../backend/src/ai/prompt';

// Package B (owner, 2026-10-25: "ทำชุด B ต่อ"): เลขา learns from the user's corrections. Only a confirmed card
// teaches: a field the user changed on เลขา's card, or an edit card changing an expense's category or a job's client
// or withholding. The lesson is this account's rule, shown with the memories and kept in the correction history.
// Synthetic data only.

const USER = '22222222-2222-4222-8222-222222222222';
const user = (extra: Record<string, unknown> = {}) => ({ user_id: USER, statuses: [], goals: [], settings: {}, jobs: [], expenses: [], invoices: [], ...extra } as any);

function fakeDb(account = user()) {
  const proposals: StoredProposal[] = [];
  const memories: (MemoryRow & { version?: number; source?: string; channel?: string })[] = [];
  const corrections: any[] = [];
  let ids = 0;
  const db = {
    loadAccount: async () => ({ user: account, versions: {}, absentRecords: [] }),
    saveProposal: async (proposal: StoredProposal) => { proposals.push({ ...proposal, status: 'pending' } as any); },
    getProposal: async (owner: string, id: string) => proposals.find(row => row.id === id && row.userId === owner && (row as any).status === 'pending') ?? null,
    cancelProposal: async (_owner: string, id: string) => { const row: any = proposals.find(item => item.id === id); if (row) row.status = 'cancelled'; return true; },
    claimProposal: async (owner: string, id: string) => { const row: any = proposals.find(item => item.id === id && item.userId === owner && (item as any).status === 'pending'); if (!row) return null; row.status = 'applying'; return row; },
    finishProposal: async (_owner: string, id: string, status: string) => { const row: any = proposals.find(item => item.id === id); if (row) row.status = status; },
    applyChanges: async () => true,
    memories: async () => [...memories],
    remember: async () => undefined,
    saveMemory: async (_owner: string, input: any) => {
      if (input.replace) { const row = memories.find(item => item.id === input.replace.id)!; Object.assign(row, { value: input.value, version: (row.version ?? 1) + 1, channel: input.channel }); return row.id; }
      const row = { id: `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`, kind: input.kind, value: input.value, source: input.source, channel: input.channel, version: 1 };
      memories.unshift(row); return row.id;
    },
    saveCorrection: async (_owner: string, input: any) => { corrections.unshift(input); },
    recentCorrections: async (_owner: string, domain: string, subject: string) => corrections.filter(row => row.domain === domain && row.subject === subject).map(row => row.after),
  } as unknown as AssistantDb;
  const store = { save: async (proposal: Proposal) => { await (db as any).saveProposal({ ...proposal, baseVersion: null }); } };
  return { db, proposals, memories, corrections, store };
}
const prepareExpense = async (fake: ReturnType<typeof fakeDb>, args: Record<string, unknown>) =>
  (await createToolbox({ user: user(), proposals: fake.store, memory: { remember: async () => undefined } })({ id: 'a', name: 'propose_add_expense', args })).card as any;

test('a category changed on เลขา\'s card and confirmed becomes this account\'s rule, used for the same shop next time', async () => {
  const fake = fakeDb();
  const card = await prepareExpense(fake, { name: 'ร้านสมาน', amount: 60, category: 'อื่นๆ', date: '2026-10-25' });
  const { card: revised } = await reviseProposal(fake.db, USER, card.id, { category: 'ค่าอุปกรณ์/ซอฟต์แวร์' });
  assert.deepEqual(learnedPairs(fake.proposals.at(-1)!.args).map(pair => [pair.domain, pair.subject, pair.before, pair.after]),
    [['expense_category', 'ร้านสมาน', 'อื่นๆ', 'ค่าอุปกรณ์/ซอฟต์แวร์']]);
  assert.equal(fake.memories.length, 0, 'nothing is learned before the card is confirmed');
  await confirmProposal(fake.db, USER, (revised as any).id);
  assert.deepEqual(fake.memories.map(row => [row.kind, row.value, row.source, row.channel]), [['correction', "ค่าใช้จ่าย 'ร้านสมาน' → หมวด ค่าอุปกรณ์/ซอฟต์แวร์", 'correction', 'app']]);
  assert.deepEqual(fake.corrections.map(row => [row.domain, row.subject, row.before, row.after, row.proposalId]), [['expense_category', 'ร้านสมาน', 'อื่นๆ', 'ค่าอุปกรณ์/ซอฟต์แวร์', (revised as any).id]]);
  // Next time: the rule comes with a message about the same shop, or with a slip; not with an unrelated question.
  assert.deepEqual(selectMemories(fake.memories, 'จ่ายร้านสมาน 120 บาท').memories, ["กฎจากการแก้: ค่าใช้จ่าย 'ร้านสมาน' → หมวด ค่าอุปกรณ์/ซอฟต์แวร์"]);
  assert.equal(selectMemories(fake.memories, 'ช่วยดูไฟล์นี้หน่อย', undefined, { hasAttachment: true }).memories.length, 1);
  assert.equal(selectMemories(fake.memories, 'เดือนนี้ได้เงินเท่าไหร่').memories.length, 0);
});

test('a newer confirmed correction replaces the rule; changing back and forth makes it ask first', async () => {
  const fake = fakeDb();
  for (const category of ['ค่าอุปกรณ์/ซอฟต์แวร์', 'อาหาร/รับรองลูกค้า', 'ค่าอุปกรณ์/ซอฟต์แวร์']) {
    const card = await prepareExpense(fake, { name: 'ร้านสมาน', amount: 60, category: 'อื่นๆ', date: '2026-10-25' });
    const { card: revised } = await reviseProposal(fake.db, USER, card.id, { category });
    await confirmProposal(fake.db, USER, (revised as any).id, { channel: 'line' });
  }
  assert.equal(fake.memories.length, 1, 'one rule per shop');
  assert.equal(fake.memories[0].value, "ค่าใช้จ่าย 'ร้านสมาน' → หมวด ค่าอุปกรณ์/ซอฟต์แวร์ (เปลี่ยนบ่อย ถามผู้ใช้ก่อน)");
  assert.equal(fake.memories[0].channel, 'line');
  assert.equal(fake.corrections.length, 3, 'every confirmed correction stays in the history');
  assert.equal(flipFlops(['ก', 'ก'], 'ก'), false);
  assert.equal(flipFlops(['ข', 'ก'], 'ก'), true);
});

test('a cancelled card teaches nothing; a model\'s own "__learn" is dropped; numbers that identify people are never a rule', async () => {
  const fake = fakeDb();
  const card = await prepareExpense(fake, { name: 'ร้านสมาน', amount: 60, category: 'อื่นๆ', date: '2026-10-25' });
  await reviseProposal(fake.db, USER, card.id, { category: 'ค่าอุปกรณ์/ซอฟต์แวร์' });
  assert.equal(fake.memories.length, 0);
  const planted = await createToolbox({ user: user(), proposals: fake.store, memory: { remember: async () => undefined } })({ id: 'm', name: 'propose_add_expense',
    args: { name: 'ค่าเน็ต', amount: 300, category: 'อื่นๆ', date: '2026-10-25', __learn: [{ domain: 'expense_category', subject: 'ทุกร้าน', before: null, after: 'อื่นๆ' }] } });
  assert.equal((planted.card as any).kind, 'confirm');
  assert.equal(learnedPairs(fake.proposals.at(-1)!.args).length, 0, 'only the server writes lessons');
  const phone = await prepareExpense(fake, { name: 'โอนให้ 0812345678', amount: 60, category: 'อื่นๆ', date: '2026-10-25' });
  const { card: revised } = await reviseProposal(fake.db, USER, phone.id, { category: 'จ้างงานต่อ (Outsource)' });
  await confirmProposal(fake.db, USER, (revised as any).id);
  assert.equal(fake.memories.length, 0, 'a rule naming a phone number is not kept');
});

test('edit cards teach too: an expense\'s category, a job\'s client and withholding (not other renames)', () => {
  const account = user({ expenses: [{ id: 'e1', name: 'ร้านสมาน', category: 'อื่นๆ', amount: 60, date: '2026-10-25' }],
    jobs: [{ id: 'j1', name: 'งานของมูลนิธิ', client: 'มูลนิธิ', whtRate: 3 }] });
  assert.deepEqual(pairsFromEdit('propose_edit_expense', { expense_id: 'e1', category: 'ค่าอุปกรณ์/ซอฟต์แวร์' }, account).map(pair => [pair.domain, pair.subject, pair.after]),
    [['expense_category', 'ร้านสมาน', 'ค่าอุปกรณ์/ซอฟต์แวร์']]);
  assert.deepEqual(pairsFromEdit('propose_edit_job', { job_id: 'j1', client: 'มูลนิธิตัวอย่างเพื่อการศึกษา', wht_rate: 0, name: 'ชื่อใหม่' }, account).map(pair => ruleText(pair)),
    ["ลูกค้า 'มูลนิธิ' คือ 'มูลนิธิตัวอย่างเพื่อการศึกษา'", "หัก ณ ที่จ่ายของลูกค้า 'มูลนิธิตัวอย่างเพื่อการศึกษา' = 0%"]);
  assert.deepEqual(pairsFromEdit('propose_edit_expense', { expense_id: 'nope', category: 'x' }, account), []);
  // Cards: a quotation's client and line wording; a job's client; edits of the same field keep เลขา's first value.
  assert.equal(ruleText(pairFromCardEdit('propose_add_document', 'item_1_description', 'ตัดต่อ 5 คลิป', 'งานตัดต่อวิดีโอ', {})!), "รายการเอกสาร 'ตัดต่อ 5 คลิป' → เขียนว่า 'งานตัดต่อวิดีโอ'");
  assert.equal(pairFromCardEdit('propose_add_job', 'value', 1000, 2000, {}), null, 'amounts are never lessons');
  const first = pairFromCardEdit('propose_add_job', 'client', 'มูลนิธิ', 'มูลนิธิ ก', {})!;
  const second = pairFromCardEdit('propose_add_job', 'client', 'มูลนิธิ ก', 'มูลนิธิตัวอย่าง', {})!;
  assert.deepEqual(mergePairs([first], [second]).map(pair => [pair.subject, pair.before, pair.after]), [['มูลนิธิ', 'มูลนิธิ', 'มูลนิธิตัวอย่าง']]);
});

test('a client name fixed on a quotation card is learned; the rules tell both models how to use it', async () => {
  const fake = fakeDb(user({ issuer_profile: { name: 'ผู้ออกตัวอย่าง', address: '', phone: '', email: '', taxId: '' } }));
  const execute = createToolbox({ user: user({ issuer_profile: { name: 'ผู้ออกตัวอย่าง', address: '', phone: '', email: '', taxId: '' } }), proposals: fake.store, memory: { remember: async () => undefined } });
  const card = (await execute({ id: 'q', name: 'propose_add_document', args: { document_type: 'quotation', client: { name: 'มูลนิธิ' }, items: [{ description: 'ตัดต่อ 5 คลิป', quantity: 5, price: 1700 }] } })).card as any;
  const { card: revised } = await reviseProposal(fake.db, USER, card.id, { client_name: 'มูลนิธิตัวอย่างเพื่อการศึกษา', item_1_description: 'งานตัดต่อวิดีโอ' });
  await confirmProposal(fake.db, USER, (revised as any).id);
  assert.deepEqual(fake.memories.map(row => row.value).sort(), ["ลูกค้า 'มูลนิธิ' คือ 'มูลนิธิตัวอย่างเพื่อการศึกษา'", "รายการเอกสาร 'ตัดต่อ 5 คลิป' → เขียนว่า 'งานตัดต่อวิดีโอ'"].sort());
  const prompt = buildSystemPrompt({ route: 'action', plan: 'pro', nowLocal: '25 ต.ค. 2569 10:00' } as any);
  for (const rule of ['start with กฎจากการแก้ are corrections this user confirmed', 'If the user now says\n  otherwise, follow the user', 'เปลี่ยนบ่อย: ask before using it']) assert.ok(prompt.includes(rule), rule);
});

test('an expense card\'s category is picked from the app\'s list (the same as the expense form) and the account\'s own', async () => {
  const { readFile } = await import('node:fs/promises');
  const { APP_EXPENSE_CATEGORIES, categoryOptions } = await import('../backend/src/ai/tools');
  const drawer = await readFile('frontend/src/features/incomeExpense/ExpenseDrawer.tsx', 'utf8');
  const block = drawer.slice(drawer.indexOf('export const EXPENSE_CATEGORIES'), drawer.indexOf('];', drawer.indexOf('export const EXPENSE_CATEGORIES')));
  assert.deepEqual([...block.matchAll(/T\("([^"]+)"\)/g)].map(match => match[1]), APP_EXPENSE_CATEGORIES);
  const account = user({ expenses: [{ id: 'e1', name: 'x', category: 'ค่าคอร์สเรียน', amount: 1, date: '2026-10-01' }, { id: 'e2', name: 'y', category: 'อื่นๆ', amount: 1, date: '2026-10-01' }] });
  assert.deepEqual(categoryOptions('อาหาร/รับรองลูกค้า', account), [...APP_EXPENSE_CATEGORIES, 'ค่าคอร์สเรียน']);
  assert.deepEqual(categoryOptions('ค่าสมาชิกยิม', account).slice(-2), ['ค่าคอร์สเรียน', 'ค่าสมาชิกยิม'], 'a category the model wrote stays pickable');
  const fake = fakeDb(account);
  const card = (await createToolbox({ user: account, proposals: fake.store, memory: { remember: async () => undefined } })({ id: 'a', name: 'propose_add_expense',
    args: { name: 'ร้านสมาน', amount: 60, category: 'อาหาร/รับรองลูกค้า', date: '2026-10-25' } })).card as any;
  const category = card.edit.find((field: any) => field.field === 'category');
  assert.deepEqual([category.type, category.value, category.options.length], ['choice', 'อาหาร/รับรองลูกค้า', 9]);
});
