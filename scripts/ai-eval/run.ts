// เลขากระรอก model comparison: runs the Thai test set (artifacts/ai-secretary/04-test-dataset.jsonl) through the
// AI Gateway on each model against an example account (no real customer data), applies automatic checks, and
// writes results and a report outside the repository. Spends real API money: stops at --max-usd (default $2).
//
//   node --import tsx scripts/ai-eval/run.ts --smoke          one tiny call per provider (field names, usage)
//   node --import tsx scripts/ai-eval/run.ts                  the full comparison
//   node --import tsx scripts/ai-eval/run.ts --list           no API calls: what would run or be skipped
//   options: --channel line (answers for LINE)  --only thai-01,thai-02  --arms gemini,gpt  --max-usd 2  --dataset <path>  --out <dir>
//
// Keys come from .env.local (GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY), or the file AI_EVAL_ENV points to, and
// are never printed: only "present" or "missing". AI_ACCOUNTING=all turns the Accounting Brain on for the example account.

import dotenv from 'dotenv';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { aiConfig } from '../../backend/src/ai/config';
import { costUsd } from '../../backend/src/ai/cost';
import { memoryStores, runAssistant, type AssistantReply } from '../../backend/src/ai/gateway';
import { geminiProvider } from '../../backend/src/ai/providers/gemini';
import { openaiProvider } from '../../backend/src/ai/providers/openai';
import { routeMessage } from '../../backend/src/ai/router';
import { knowledgeSnippets, lookupKnowledge } from '../../backend/src/ai/knowledge';
import { accountContext } from '../../backend/src/ai/tools';
import { selectMemories } from '../../backend/src/ai/memory';
import { decideRoute } from '../../backend/src/ai/routingPolicy';
import type { ChatTurn, ToolCall, ToolOutcome } from '../../backend/src/ai/types';
import type { UserRow } from '../../backend/src/services/lineAssistant';
import { ACCOUNTING_KNOWLEDGE } from '../../backend/src/ai/accounting/knowledge';
import { ACCOUNTING_GUIDE } from '../../backend/src/ai/accounting/reference';
import { TAX_RULES } from '../../backend/src/ai/accounting/taxRules';
// Figures the Accounting Brain may cite from its reference (knowledge entries, the guide, the tax rules).
const ACCOUNTING_FIGURES = [ACCOUNTING_GUIDE, ...ACCOUNTING_KNOWLEDGE.map(entry => entry.text), JSON.stringify(TAX_RULES)].join(' ');

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '../..');
dotenv.config({ path: [...(process.env.AI_EVAL_ENV ? [resolve(process.env.AI_EVAL_ENV)] : []), resolve(appRoot, '.env.local'), resolve(appRoot, '.env')], quiet: true });

const args = process.argv.slice(2);
const option = (name: string, fallback?: string) => { const at = args.indexOf(`--${name}`); return at >= 0 ? args[at + 1] : fallback; };
const flag = (name: string) => args.includes(`--${name}`);

// mixed = what production runs with AI_SMART_MODEL: Gemini 3.5 Flash-Lite, Sonnet 5.5 for hard requests (difficulty.ts).
const MODELS = { gemini: 'gemini-3.1-flash-lite', gemini35: 'gemini-3.5-flash-lite', gpt: 'gpt-5.4-mini', sonnet55: 'claude-sonnet-5-5', mixed: 'gemini-3.5-flash-lite + claude-sonnet-5-5' } as const;
const keyFor = (arm: string) => (arm.startsWith('gemini') ? base.geminiKey : arm === 'mixed' ? base.geminiKey && base.anthropicKey : arm.startsWith('sonnet') ? base.anthropicKey : base.openaiKey);
type Arm = keyof typeof MODELS;
const BUILT_TOOLS = new Set(['search_documents', 'feature_lookup', 'money_summary', 'receivables', 'search_jobs', 'get_job', 'remember', 'route_to_action', 'propose_add_job', 'propose_record_payment', 'propose_edit_job', 'propose_delete_job',
  // Learning (2026-10-25, packages A–D) and the tools since the first set.
  'financial_summary', 'recall_memories', 'forget_memory', 'past_work', 'ask_user', 'note_from_file', 'propose_add_expense', 'propose_add_document', 'navigate_to_feature',
  // Accounting Brain (2026-10-26).
  'tax_estimate', 'business_calc', 'cash_forecast', 'accounting_check', 'official_link', 'cash_position', 'search_receipts', 'search_expenses']);

const base = aiConfig(process.env);
const keyState = (value?: string) => (value ? 'present' : 'missing');
console.log(`GEMINI_API_KEY: ${keyState(base.geminiKey)}   OPENAI_API_KEY: ${keyState(base.openaiKey)}   ANTHROPIC_API_KEY: ${keyState(base.anthropicKey)}`);

// ---------- example account (all names are examples) ----------
const day = (offset: number) => new Date(Date.now() + 7 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);
const job = (id: string, name: string, client: string, value: number, extra: Record<string, unknown>) =>
  ({ id, name, client, type: 'งานออกแบบ', note: '', value, received: 0, pending: value, status: 'pending', creditTerm: 30, isPosted: true, payDate: null, ...extra });
export function exampleAccount(): UserRow {
  return {
    user_id: '33333333-3333-4333-8333-333333333333', statuses: [], settings: { monthlyExpense: 0, savingsPercentage: 10 },
    // The issuer profile a real account fills in Settings (synthetic), so document cases can reach a card.
    issuer_profile: { name: 'สตูดิโอตัวอย่าง', address: '9 ถนนตัวอย่าง เชียงใหม่ 50000', taxId: '0000000000000', phone: '000-000-0000' },
    goals: [{ id: 'goal-1', name: 'เงินสำรองฉุกเฉิน', type: 'emergency', target: 60000, current: 18000, deadline: day(200), emoji: '', bg: '', acc: '' } as any],
    expenses: [
      { name: 'ค่าโปรแกรมออกแบบ', category: 'ซอฟต์แวร์', amount: 1290, date: day(-6) },
      { name: 'ค่าอินเทอร์เน็ต', category: 'สาธารณูปโภค', amount: 690, date: day(-3) },
      { name: 'ค่าเดินทางพบลูกค้า', category: 'เดินทาง', amount: 450, date: day(-1) },
      { name: 'ค่าโปรแกรมออกแบบ', category: 'ซอฟต์แวร์', amount: 1290, date: day(-36) },
      { name: 'ค่าอุปกรณ์', category: 'อุปกรณ์', amount: 3200, date: day(-40) },
    ],
    invoices: [
      { id: 'doc-qt-7', documentType: 'quotation', documentNo: 'QT-2569-007', createdDate: day(-30), client: { name: 'บริษัท ตัวอย่าง จำกัด', address: '1 ถนนตัวอย่าง กรุงเทพฯ 10110', taxId: '0000000000000' }, items: [{ description: 'ออกแบบเว็บไซต์', unit: 'งาน', quantity: 1, price: 30000 }], vatRate: 0, whtRate: 3 },
      { id: 'doc-qt-8', documentType: 'quotation', documentNo: 'QT-2569-008', createdDate: day(-3), client: { name: 'บริษัท ตัวอย่าง จำกัด', address: '1 ถนนตัวอย่าง กรุงเทพฯ 10110', taxId: '0000000000000' }, items: [{ description: 'ออกแบบโพสต์โซเชียล', unit: 'ชิ้น', quantity: 10, price: 1200 }], vatRate: 0, whtRate: 3 },
      { id: 'doc-inv-3', documentType: 'invoice', documentNo: 'INV-2569-003', createdDate: day(-20), dueDate: day(4), client: { name: 'บริษัท ตัวอย่าง จำกัด' }, items: [{ quantity: 1, price: 30000 }], vatRate: 0, whtRate: 3 },
    ],
    jobs: [
      job('job-logo', 'ออกแบบโลโก้ ร้านกาแฟตัวอย่าง', 'ร้านกาแฟตัวอย่าง', 12000, { postDate: day(-45), payDate: day(-15) }),
      job('job-web', 'เว็บไซต์บริษัทตัวอย่าง', 'บริษัท ตัวอย่าง จำกัด', 30000, { whtRate: 3, whtAmount: 900, received: 10000, pending: 19100, status: 'partial', postDate: day(-20), payDate: day(4), depositDate: day(-20), depositAmount: 10000 }),
      job('job-banner', 'แบนเนอร์โปรโมชัน', 'ร้านกาแฟตัวอย่าง', 3500, { postDate: day(-30), payDate: day(0) }),
      job('job-video', 'ตัดต่อวิดีโอแนะนำสินค้า', 'แบรนด์ตัวอย่าง', 8000, { isPosted: false, postDate: undefined }),
      job('job-menu', 'ออกแบบเมนูร้านอาหาร', 'ร้านอาหารตัวอย่าง', 4500, { isPosted: false, postDate: undefined }),
      job('job-photo', 'ถ่ายภาพสินค้า', 'แบรนด์ตัวอย่าง', 8000, { received: 8000, pending: 0, status: 'done', paymentStatus: 'paid', postDate: day(-8), payDate: day(-2) }),
      job('job-post', 'ออกแบบโพสต์โซเชียล 10 ชิ้น', 'บริษัท ตัวอย่าง จำกัด', 6000, { whtRate: 1, whtAmount: 60, received: 5940, pending: 0, status: 'done', paymentStatus: 'paid', postDate: day(-40), payDate: day(-35) }),
    ] as any,
  } as UserRow;
}

// ---------- smoke test: one tiny call per provider ----------
async function smoke() {
  const ask = { system: 'Reply with the single Thai word: พร้อม', turns: [{ role: 'user' as const, text: 'ทดสอบ' }], tools: [], maxOutputTokens: 32, execute: async () => ({ result: null }) };
  for (const [arm, model] of Object.entries(MODELS) as [Arm, string][]) {
    const key = arm.startsWith('gemini') ? base.geminiKey : base.openaiKey;
    if (!key) { console.log(`${model}: skipped (key missing)`); continue; }
    const started = Date.now();
    try {
      const provider = arm.startsWith('gemini') ? geminiProvider : openaiProvider;
      const result = await provider.run({ ...ask, apiKey: key, model, effort: arm.startsWith('gemini') ? 'minimal' : 'low' });
      const cost = costUsd(result.provider, model, result.usage);
      console.log(`${model}: OK in ${Date.now() - started} ms, reply "${result.text.slice(0, 40)}", usage ${JSON.stringify(result.usage)}, cost $${cost.toFixed(6)}`);
    } catch (error) {
      console.log(`${model}: FAILED (${(error as { status?: number }).status ?? ''}) ${(error as Error).message.slice(0, 300)}`);
    }
  }
}

// ---------- the test set ----------
interface Case { id: string; category: string; route_expected: 'gemini' | 'gpt' | 'gateway'; input: string; expect: string; tools_expected?: string[]; must_ask?: boolean; expect_table?: boolean; expect_card?: string; must?: string[]; must_not?: string[]; tone?: string; history?: Array<{ user?: string; bot?: string }>;
  memories?: Array<{ kind: string; value: string }>; model_expected?: 'light' | 'smart' | 'direct'; tools_forbidden?: string[]; card_must?: string[]; text_must?: string[]; text_must_not?: string[]; no_table?: boolean;
  // Personality brief (2026-10-25): earlier user messages sent live first (เลขา's own answers become the history), and
  // checks for refusing everyday talk, offering app help, and preparing a card.
  turns?: string[]; no_refusal?: boolean; no_offer?: boolean; no_confirm?: boolean; max_offers?: number }
const datasetPath = resolve(appRoot, option('dataset', '../../ai-secretary/04-test-dataset.jsonl')!);
const allCases: Case[] = readFileSync(datasetPath, 'utf8').split('\n').filter(line => line.trim()).map(line => JSON.parse(line));

function prepare(test: Case): { text: string; skip?: string } {
  if (test.route_expected === 'gateway') return { text: '', skip: 'ทดสอบที่ Gateway (สิทธิ์/โทเคน) ไม่ใช่โมเดล: อยู่ในงานขั้นถัดไป' };
  const expected = test.tools_expected || [];
  if (expected.length && !expected.some(name => BUILT_TOOLS.has(name))) return { text: '', skip: `ใช้เครื่องมือที่ยังไม่สร้าง (${expected.join(', ')})` };
  const setup = /^\(([^)]*)\)\s*/.exec(test.input);
  const text = setup ? test.input.slice(setup[0].length).trim() : test.input;
  if (!text) return { text: '', skip: `ต้องจำลองสถานการณ์ที่ยังไม่รองรับ (${setup?.[1]})` };
  if (setup && !/ข้อความเดียว/.test(setup[1])) return { text, skip: `ต้องจำลองสถานการณ์ที่ยังไม่รองรับ (${setup[1]})` };
  return { text };
}

// ---------- automatic checks ----------
// Refusing a topic for not being about money, and offering help with the app (this runner's own measure, so the
// same rule judges the prompt before and after the change).
const REFUSAL = /(ไม่สามารถ(?:ตอบ|คุย|ช่วย|ให้คำแนะนำ)|นอกเหนือ(?:จาก)?(?:ขอบเขต|หน้าที่)|เกินขอบเขต|ไม่เกี่ยวกับ(?:การเงิน|แอป|งาน)|(?:ผม|ฉัน|เรา)เป็น(?:เลขา|ผู้ช่วย)(?:ด้าน|การ|ทาง)?เงิน|เลขาการเงิน|เฉพาะเรื่อง(?:การเงิน|งาน|แอป)|outside (?:my|the) scope|only (?:help|talk) (?:with|about))/i;
const OFFER_WORDS = /(ถ้า(?:อยาก|จะ|มี)|บอก(?:ได้|มา)?เลย|เดี๋ยว(?:ช่วย|จัด|ลง|บันทึก|สรุป)|ให้ช่วย|ส่ง(?:รายละเอียด)?มา(?:ได้)?|ไหม|มั้ย|want me to|shall i|i can)/i;
const APP_TASK = /(ลงงาน|ลงระบบ|ลงไว้|ลงให้|บันทึก|รายจ่าย|รับเงินแล้ว|สรุป|งานค้าง|ค้างรับ|ใบเสนอราคา|ใบแจ้งหนี้|เอกสาร|เครดิตเทอม|\brecord|\blog\b|add (?:it|a job|the job)|invoice|quotation)/i;
const offers = (text: string) => text.split(/\n+|(?<=[.!?])\s+/).filter(line => OFFER_WORDS.test(line) && APP_TASK.test(line)).length;
const EMOJI = /\p{Extended_Pictographic}/gu;
const LEAK = /\/[a-zA-Z]+\/\{workspace\}|admin_only|\bjob-[a-z]+|\bp_[0-9a-f]{8}|MODE: |HANDOVER FROM|ACCOUNT CONTEXT|APP KNOWLEDGE|proposal_id|user_id|33333333-/;
const SUCCESS = /(บันทึก|เพิ่ม|ลบ|แก้ไข|อัปเดต|เปลี่ยน|เคลียร์|ล้าง|รีเซ็ต)\S{0,6}(เรียบร้อย|สำเร็จ|ให้แล้ว|แล้วครับ|แล้วค่ะ)/;
const numbersIn = (text: string) => [...text.matchAll(/(?:฿\s?|THB\s?)(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s?บาท/g)]
  .map(match => Number((match[1] || match[2]).replace(/,/g, ''))).filter(value => value >= 100);

function check(test: Case, reply: AssistantReply, observed: { call: ToolCall; outcome: ToolOutcome }[], accountText: string) {
  // Figures may come from tools, the account totals, or the app knowledge given in the prompt (prices, quotas).
  const context = accountText + knowledgeSnippets(lookupKnowledge(test.input, 3));
  const results: Record<string, boolean | null> = {};
  const called = observed.map(item => item.call.name);
  // App questions may be answered from the knowledge already in the prompt, so feature_lookup alone is not required.
  const built = (test.tools_expected || []).filter(name => BUILT_TOOLS.has(name) && name !== 'feature_lookup');
  results.tools = built.length ? built.some(name => called.includes(name)) : null;
  const inputEmoji = (test.input.match(EMOJI) || []).length;
  const replyEmoji = (reply.text.match(EMOJI) || []).length;
  results.emoji = inputEmoji ? replyEmoji <= 1 : replyEmoji === 0;
  results.no_leak = !LEAK.test(reply.text);
  results.no_false_success = reply.cards.some(card => card.kind === 'confirm') ? !(SUCCESS.test(reply.text) && !/ยืนยัน/.test(reply.text)) : !SUCCESS.test(reply.text);
  const grounded = new Set(numbersIn(JSON.stringify(observed.map(item => item.outcome.result)) + context + test.input + ACCOUNTING_FIGURES));
  // Also accept raw numbers that appear in tool results without a baht sign.
  const raw = JSON.stringify(observed.map(item => item.outcome.result)) + context + test.input + ACCOUNTING_FIGURES;
  const unknown = numbersIn(reply.text).filter(value => !grounded.has(value) && !raw.includes(String(value)) && !raw.includes(value.toLocaleString('en-US')));
  results.numbers_grounded = numbersIn(reply.text).length ? unknown.length === 0 : null;
  const letters = reply.text.replace(/[^A-Za-z฀-๿]/g, '');
  const latin = letters.replace(/[^A-Za-z]/g, '').length / Math.max(1, letters.length);
  // Job and client names stay Thai inside an English answer, so English only needs to be a large share.
  results.language = test.tone === 'english' ? latin > 0.35 : latin < 0.5;
  const tone: Record<string, RegExp> = { friend: /กู|มึง/, sibling: /พี่/, polite: /ครับ|ค่ะ/, ceo: /ครับ|ค่ะ/, cute: /น้อง|นะ|จ้า|ค้าบ|คับ/ };
  results.tone = test.tone && tone[test.tone] ? tone[test.tone].test(reply.text) : null;
  results.not_empty = reply.text.trim().length > 0 || reply.cards.length > 0;
  // Owner, 2026-10-24: ask for missing job details instead of preparing a card; lists as tables; summary cards.
  // A questions card is asking too (ask_user, 2026-10-24).
  results.asks = test.must_ask ? !reply.cards.some(card => card.kind === 'confirm') && (reply.cards.some(card => card.kind === 'questions') || /\?|\n\s*(?:\d+[.)]|[-*•])\s/.test(reply.text)) : null;
  results.table = test.expect_table ? /^\s*\|.*\|\s*$/m.test(reply.text) && /\|\s*:?-{3,}/.test(reply.text) : null;
  results.card = test.expect_card ? reply.cards.some(card => card.kind === test.expect_card) : null;
  // Learning checks (2026-10-25).
  results.no_char_chart = !/[\u2580-\u259F\u25A0-\u25A3]{2,}/.test(reply.text);
  if ((test.memories || []).some(memory => memory.kind === 'emoji' && /ไม่ใช้|ไม่เอา|no emoji/i.test(memory.value))) results.emoji = replyEmoji === 0;
  results.tools_forbidden = test.tools_forbidden ? !test.tools_forbidden.some(name => called.includes(name)) : null;
  const cardsText = JSON.stringify(reply.cards);
  results.card_must = test.card_must ? test.card_must.every(text => cardsText.includes(text)) : null;
  results.text_must = test.text_must ? test.text_must.every(text => reply.text.includes(text)) : null;
  results.text_must_not = test.text_must_not ? !test.text_must_not.some(text => reply.text.includes(text)) : null;
  // Routing V2: the model that answered (direct = no model).
  const used = reply.routing?.tier === 'direct' ? 'direct' : reply.calls.some(call => call.provider === 'anthropic') ? 'smart' : 'light';
  results.model = test.model_expected ? used === test.model_expected : null;
  results.no_table = test.no_table ? !(/^\s*\|.*\|\s*$/m.test(reply.text) && /\|\s*:?-{3,}/.test(reply.text)) : null;
  results.no_refusal = test.no_refusal ? !REFUSAL.test(reply.text) : null;
  results.no_offer = test.no_offer ? offers(reply.text) === 0 : null;
  results.no_confirm = test.no_confirm ? !reply.cards.some(card => card.kind === 'confirm') : null;
  return { results, unknownNumbers: unknown };
}

// ---------- run ----------
async function main() {
  if (flag('smoke')) return smoke();
  if (flag('list')) {
    // No API calls: which cases would run, which are skipped and why, and where the router sends each one.
    for (const test of allCases) {
      const prepared = prepare(test);
      const route = prepared.text ? routeMessage({ text: prepared.text }) : '-';
      const ok = prepared.text ? (test.route_expected === 'gemini' ? route === 'chat' : route === 'action') : true;
      // Routing V2 (routingPolicy.ts): the model tier and tool set the gateway now picks, with its reason.
      const history: ChatTurn[] = (test.history || []).map(turn => (turn.user !== undefined ? { role: 'user', text: turn.user } : { role: 'assistant', text: turn.bot || '' }));
      const decision = prepared.text ? decideRoute({ text: prepared.text, history }) : undefined;
      const tier = decision ? (decision.direct ? 'direct' : decision.tier) : '-';
      const tierOk = !test.model_expected || tier === test.model_expected;
      console.log(`${prepared.skip ? 'skip' : 'run '} ${test.id.padEnd(15)} router=${String(route).padEnd(6)} expected=${test.route_expected}${ok ? '' : '  <-- router differs'}`
        + ` v2=${tier}/${decision?.tools ?? '-'} (${decision?.reason ?? '-'})${tierOk ? '' : `  <-- model differs (expected ${test.model_expected})`}${prepared.skip ? `  (${prepared.skip})` : ''}`);
    }
    return;
  }
  const arms = (option('arms', 'gemini35')!.split(',') as Arm[]).filter(arm => arm in MODELS);
  const maxUsd = Number(option('max-usd', '2'));
  const only = option('only')?.split(',');
  for (const arm of arms) if (!keyFor(arm)) { console.log(`Stop: the ${arm} key is missing.`); process.exitCode = 1; return; }

  const stamp = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const out = resolve(appRoot, option('out', `../../ai-secretary/eval/${stamp}`)!);
  mkdirSync(out, { recursive: true });
  const cases = allCases.filter(test => !only || only.includes(test.id));
  const rows: any[] = [];
  let spent = 0;
  let billed = 0;

  for (const test of cases) {
    const prepared = prepare(test);
    const route = prepared.text ? routeMessage({ text: prepared.text }) : null;
    const row: any = { id: test.id, category: test.category, input: test.input, expect: test.expect, route_expected: test.route_expected, route_actual: route,
      route_ok: route ? (test.route_expected === 'gemini' ? route === 'chat' : route === 'action') : null, skip: prepared.skip, arms: {} };
    if (prepared.skip) { rows.push(row); console.log(`- ${test.id}: skipped (${prepared.skip})`); continue; }
    for (const arm of arms) {
      if (spent >= maxUsd) { row.arms[arm] = { error: `budget $${maxUsd} reached` }; continue; }
      const user = exampleAccount();
      const stores = memoryStores();
      const observed: { call: ToolCall; outcome: ToolOutcome }[] = [];
      const history: ChatTurn[] = (test.history || []).map(turn => (turn.user !== undefined ? { role: 'user', text: turn.user } : { role: 'assistant', text: turn.bot || '' }));
      const config = arm === 'mixed'
        ? { ...base, enabled: true, chatModel: MODELS.gemini35, actionModel: MODELS.gemini35, smartModel: MODELS.sonnet55 }
        : { ...base, enabled: true, chatModel: MODELS[arm], actionModel: MODELS[arm], smartModel: undefined };
      const started = Date.now();
      try {
        // Earlier messages sent live: เลขา's own answers become the history the last message is read with.
        const chain: { user: string; reply: string; costUsd: number; models: string[] }[] = [];
        for (const said of test.turns || []) {
          const earlier = await runAssistant({ user, plan: 'pro', text: said, history: [...history] }, { config, ...stores });
          spent += earlier.costUsd; billed += earlier.billableUsd;
          history.push({ role: 'user', text: said }, { role: 'assistant', text: earlier.text });
          chain.push({ user: said, reply: earlier.text, costUsd: earlier.costUsd, models: earlier.calls.map(call => call.model) });
        }
        // A case's saved memories reach the model the way the service picks them (memory.ts).
        const remembered = selectMemories((test.memories || []).map((memory, index) => ({ id: `m${index}`, ...memory })), prepared.text);
        const reply = await runAssistant({ user, plan: 'pro', text: prepared.text, history, preferredName: remembered.preferredName, communicationProfile: remembered.communicationProfile, memories: remembered.memories,
          ...(option('channel') === 'line' ? { channel: 'line' as const } : {}) }, { config, ...stores, observe: (call, outcome) => observed.push({ call, outcome }),
          // Cost comparison (cost brief, 2026-10-25): --claude-cache 1h | auto | off.
          ...(option('claude-cache') ? { claudeCache: option('claude-cache') as '1h' | 'auto' | 'off' } : {}) });
        spent += reply.costUsd;
        billed += reply.billableUsd;
        const { results, unknownNumbers } = check(test, reply, observed, accountContext(user));
        if (test.max_offers !== undefined) results.max_offers = [...chain.map(item => item.reply), reply.text].reduce((n, text) => n + offers(text), 0) <= test.max_offers;
        if (chain.length) results.no_refusal_chain = test.no_refusal ? chain.every(item => !REFUSAL.test(item.reply)) : null;
        row.arms[arm] = { ms: Date.now() - started, chain, text: reply.text, cards: reply.cards, tools: observed.map(item => item.call.name), handedOff: reply.handedOff,
          costUsd: reply.costUsd, tokens: reply.tokens, models: reply.calls.map(call => call.model), usage: reply.calls.map(call => call.usage), checks: results, unknownNumbers, remembered: stores.remembered, routing: reply.routing };
        const failed = Object.entries(results).filter(([, ok]) => ok === false).map(([name]) => name);
        console.log(`- ${test.id} [${arm}] ${Date.now() - started} ms $${reply.costUsd.toFixed(5)} (user $${reply.billableUsd.toFixed(5)}, ${reply.tokens} tokens, ${reply.calls.length} calls, ${reply.calls.reduce((n, call) => n + call.steps, 0)} rounds) ${failed.length ? `FAILED ${failed.join(',')}` : 'ok'}`);
      } catch (error) {
        row.arms[arm] = { ms: Date.now() - started, error: `${(error as { status?: number }).status ?? ''} ${(error as Error).message}`.trim().slice(0, 300) };
        console.log(`- ${test.id} [${arm}] ERROR ${row.arms[arm].error}`);
      }
    }
    rows.push(row);
  }

  writeFileSync(resolve(out, 'results.json'), JSON.stringify({ models: MODELS, dataset: datasetPath, spentUsd: spent, rows }, null, 2));
  writeFileSync(resolve(out, 'report.md'), report(rows, arms, spent));
  console.log(`\nSpent $${spent.toFixed(4)} (users would pay $${billed.toFixed(4)}). Results: ${out}`);
}

function report(rows: any[], arms: Arm[], spent: number): string {
  const ran = rows.filter(row => !row.skip);
  const lines = [`# เลขากระรอก: ผลเทียบโมเดล`, '', `ชุดทดสอบ ${rows.length} ข้อ, รันจริง ${ran.length} ข้อ, ข้าม ${rows.length - ran.length} ข้อ, ค่าใช้จ่ายรวม $${spent.toFixed(4)}`, ''];
  const checkNames = ['tools', 'asks', 'table', 'card', 'numbers_grounded', 'no_false_success', 'no_leak', 'emoji', 'language', 'tone', 'not_empty', 'model', 'tools_forbidden', 'card_must', 'text_must', 'text_must_not', 'no_table', 'no_char_chart',
    'no_refusal', 'no_refusal_chain', 'no_offer', 'max_offers', 'no_confirm'];
  lines.push(`| ตรวจ | ${arms.map(arm => MODELS[arm]).join(' | ')} |`, `|---|${arms.map(() => '---').join('|')}|`);
  for (const name of checkNames) {
    lines.push(`| ${name} | ${arms.map(arm => {
      const values = ran.map(row => row.arms[arm]?.checks?.[name]).filter(value => value !== null && value !== undefined);
      return values.length ? `${values.filter(Boolean).length}/${values.length}` : '-';
    }).join(' | ')} |`);
  }
  for (const [label, pick] of [['เวลาเฉลี่ย (ms)', (x: any) => x.ms], ['ต้นทุนเฉลี่ยต่อข้อ ($)', (x: any) => x.costUsd], ['Krarok Token เฉลี่ย', (x: any) => x.tokens]] as const) {
    lines.push(`| ${label} | ${arms.map(arm => {
      const values = ran.map(row => row.arms[arm]).filter(x => x && !x.error).map(pick as (x: any) => number);
      return values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(label.includes('$') ? 5 : 0) : '-';
    }).join(' | ')} |`);
  }
  lines.push(`| ข้อผิดพลาด | ${arms.map(arm => ran.filter(row => row.arms[arm]?.error).length).join(' | ')} |`);
  const routed = ran.filter(row => row.route_ok !== null);
  lines.push('', `ตัวเลือกโมเดล (router) ตรงกับที่คาด ${routed.filter(row => row.route_ok).length}/${routed.length} ข้อ`, '');
  for (const row of rows) {
    lines.push(`## ${row.id} (${row.category})`, '', `**ถาม:** ${row.input}`, '', `**คาดหวัง:** ${row.expect}`, '');
    if (row.skip) { lines.push(`_ข้าม: ${row.skip}_`, ''); continue; }
    lines.push(`router: ${row.route_actual}${row.route_ok ? '' : ' (ไม่ตรงที่คาด)'}`, '');
    for (const arm of arms) {
      const result = row.arms[arm];
      if (!result) continue;
      if (result.error) { lines.push(`**${MODELS[arm]}:** ERROR ${result.error}`, ''); continue; }
      const failed = Object.entries(result.checks).filter(([, ok]) => ok === false).map(([name]) => name);
      lines.push(`**${MODELS[arm]}** (${result.ms} ms, $${result.costUsd.toFixed(5)}, เครื่องมือ: ${result.tools.join(', ') || '-'}${result.cards.length ? `, การ์ด: ${result.cards.map((card: any) => card.title || card.kind).join(', ')}` : ''}${failed.length ? `, **ไม่ผ่าน: ${failed.join(', ')}**` : ''})`, '');
      for (const item of result.chain || []) lines.push(`> **ผู้ใช้:** ${item.user}`, ...item.reply.split('\n').map((line: string) => `> ${line}`), '>');
      if (result.chain?.length) lines.push(`> **ผู้ใช้:** ${row.input}`);
      lines.push(...result.text.split('\n').map((line: string) => `> ${line}`), '');
      if (result.unknownNumbers?.length) lines.push(`ตัวเลขที่หาที่มาไม่เจอ: ${result.unknownNumbers.join(', ')}`, '');
    }
  }
  return lines.join('\n');
}

// Only when run as a script: importing this file (for its example account) never calls a model or spends money.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error((error as Error).message); process.exitCode = 1; });
