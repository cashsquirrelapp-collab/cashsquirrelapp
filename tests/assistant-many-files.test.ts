import test from 'node:test';
import assert from 'node:assert/strict';
import { aiConfig } from '../backend/src/ai/config';
import { memoryStores, runAssistant } from '../backend/src/ai/gateway';
import { buildSystemPrompt } from '../backend/src/ai/prompt';
import { executeVaultTool } from '../backend/src/ai/vaultQueries';
import { checkAttachments, storedAttachment, MAX_FILES } from '../backend/src/ai/attachment';
import { turnText } from '../backend/src/ai/crossChannel';
import type { UserRow } from '../backend/src/services/lineAssistant';

// Several files in one message to เลขากระรอก (owner, 2026-10-31: "เอาเลยไม่เกิน 5 ภาพ ละไฟล์ล่ะ"): pictures and PDFs, at most
// 5, 8 MB together; each named before it for the model, one attach card per file naming which, and the history keeping
// every name. Fake providers: no network, no cost. Synthetic account only.

const A = '77777777-7777-4777-8777-777777777777';
const job = { id: 'job-1', name: 'รีวิวสินค้า', client: 'บริษัท ตัวอย่าง จำกัด', value: 10_000, whtRate: 3, whtAmount: 300, received: 0, pending: 9_700,
  status: 'pending', paymentStatus: 'unpaid', payDate: '2026-10-30', postDate: '2026-10-01' };
const user = (): UserRow => ({ user_id: A, statuses: [], goals: [], settings: {}, jobs: [job], expenses: [] } as unknown as UserRow);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9]).toString('base64');
const pdf = Buffer.from('%PDF-1.4 synthetic').toString('base64');
const file = (name: string, mimeType = 'image/jpeg', data = jpeg) => ({ name, mimeType, data });

test('up to 5 files, 8 MB together; the same name twice is told apart', () => {
  const checked = checkAttachments([file('image.jpg'), file('image.jpg'), file('ใบเสร็จ.pdf', 'application/pdf', pdf)]);
  assert.deepEqual(checked.map(f => f.name), ['image.jpg', 'image (2).jpg', 'ใบเสร็จ.pdf']);
  assert.equal(MAX_FILES, 5);
  assert.throws(() => checkAttachments(Array.from({ length: 6 }, (_, i) => file(`s${i}.jpg`))), (error: { status?: number }) => error.status === 413);
  // Each within 4 MB, but 9 MB together is refused.
  const big = Buffer.alloc(3 * 1024 * 1024, 1); big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff;
  assert.throws(() => checkAttachments([0, 1, 2].map(i => file(`big${i}.jpg`, 'image/jpeg', big.toString('base64')))), (error: { status?: number; code?: string }) => error.status === 413 && error.code === 'ai_files_too_large');
  // Every file is still checked by its real first bytes.
  assert.throws(() => checkAttachments([file('a.jpg'), file('fake.jpg', 'image/jpeg', Buffer.from('not a picture').toString('base64'))]));
});

test('the history keeps every name, short enough for its column; one file is kept as before', () => {
  const one = storedAttachment(checkAttachments([file('slip.jpg')]));
  assert.deepEqual(one, { name: 'slip.jpg', kind: 'image' });
  const names = Array.from({ length: 5 }, (_, i) => `สลิปโอนเงินจากลูกค้ารายที่-${i + 1}-ชื่อยาวมากเพื่อทดสอบความยาว.jpg`);
  const many = storedAttachment(checkAttachments(names.map(name => file(name))))!;
  assert.equal(many.files!.length, 5);
  assert.ok(JSON.stringify(many).length <= 500, String(JSON.stringify(many).length));
  assert.equal(storedAttachment([]), undefined);
  // What a later message reads of it: every file by its name.
  const line = turnText({ role: 'user', text: 'สลิปสามใบ', attachment: { name: 'a.jpg', files: [{ name: 'a.jpg' }, { name: 'b.jpg' }, { name: 'c.pdf' }] } } as never);
  assert.equal((line.match(/\[แนบไฟล์: /g) || []).length, 3);
});

function fakeProviders(text: string) {
  const bodies: any[] = [];
  const tools: string[][] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'));
    const claude = String(input).includes('anthropic');
    bodies.push({ claude, body });
    tools.push(claude ? (body.tools || []).map((tool: { name: string }) => tool.name) : (body.tools?.[0]?.functionDeclarations || []).map((tool: { name: string }) => tool.name));
    const reply = claude
      ? { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null,
        usage: { input_tokens: 60, output_tokens: 8, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
      : { candidates: [{ content: { role: 'model', parts: [{ text }] } }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 5 } };
    return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } });
  }) as unknown as typeof fetch;
  return { bodies, tools, fetchImpl };
}

test('every file reaches the model, each named before it (Claude and Gemini); one file is sent as before', async () => {
  const files = checkAttachments([file('slip1.jpg'), file('slip2.jpg'), file('ใบ50ทวิ.pdf', 'application/pdf', pdf)]);
  const smart = fakeProviders('อ่านครบ 3 ไฟล์ครับ');
  await runAssistant({ user: user(), plan: 'pro', text: 'สลิปสามใบ', attachments: files },
    { config: aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', AI_SMART_MODEL: 'claude-sonnet-5-5' }), ...memoryStores(), fetchImpl: smart.fetchImpl });
  const claude = smart.bodies.find(item => item.claude)!.body;
  const content = claude.messages.at(-1).content as any[];
  assert.deepEqual(content.filter(block => block.type === 'text').map(block => block.text).slice(0, 3), ['ไฟล์ที่ 1: slip1.jpg', 'ไฟล์ที่ 2: slip2.jpg', 'ไฟล์ที่ 3: ใบ50ทวิ.pdf']);
  assert.deepEqual(content.filter(block => block.type !== 'text').map(block => block.type), ['image', 'image', 'document']);
  assert.ok(smart.tools[0].includes('attach_file'));

  const light = fakeProviders('ได้ครับ');
  await runAssistant({ user: user(), plan: 'pro', text: 'สลิปสองใบ', attachments: files.slice(0, 2) },
    { config: aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'g' }), ...memoryStores(), fetchImpl: light.fetchImpl });
  const parts = light.bodies[0].body.contents.at(-1).parts as any[];
  assert.deepEqual(parts.map(part => (part.inlineData ? 'file' : part.text)), ['ไฟล์ที่ 1: slip1.jpg', 'file', 'ไฟล์ที่ 2: slip2.jpg', 'file', 'สลิปสองใบ']);

  const single = fakeProviders('ได้ครับ');
  await runAssistant({ user: user(), plan: 'pro', text: 'สลิปใบเดียว', attachment: file('slip.jpg') },
    { config: aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'g' }), ...memoryStores(), fetchImpl: single.fetchImpl });
  assert.deepEqual((single.bodies[0].body.contents.at(-1).parts as any[]).map(part => (part.inlineData ? 'file' : part.text)), ['file', 'สลิปใบเดียว']);
});

test('the attach card names which file: required with several, one of those sent, never another', async () => {
  const names = ['slip1.jpg', 'slip2.jpg'];
  const missing = await executeVaultTool('attach_file', { kind: 'other', job_id: 'job-1' }, user(), undefined, new Date(), names[0], names);
  assert.equal((missing.result as { ok: boolean }).ok, false);
  assert.match(String((missing.result as { error: string }).error), /slip1\.jpg, slip2\.jpg/);
  const wrong = await executeVaultTool('attach_file', { kind: 'other', job_id: 'job-1', file_name: 'other.jpg' }, user(), undefined, new Date(), names[0], names);
  assert.equal((wrong.result as { ok: boolean }).ok, false);
  const second = await executeVaultTool('attach_file', { kind: 'other', job_id: 'job-1', file_name: 'slip2.jpg' }, user(), undefined, new Date(), names[0], names);
  assert.equal((second.card as Record<string, unknown>).fileName, 'slip2.jpg');
  // One file: as before, no file_name needed.
  const one = await executeVaultTool('attach_file', { kind: 'other', job_id: 'job-1' }, user(), undefined, new Date(), 'slip.jpg', ['slip.jpg']);
  assert.equal((one.card as Record<string, unknown>).fileName, 'slip.jpg');
});

test('the prompt: several files are each their own item, never added into one card', () => {
  const withFiles = buildSystemPrompt({ route: 'action', plan: 'pro', nowLocal: 'x', knowledge: '-', accountContext: '-', files: true });
  assert.match(withFiles, /Several files in one message/);
  assert.match(withFiles, /one\s+card per slip or receipt, never one card adding them up/);
});
