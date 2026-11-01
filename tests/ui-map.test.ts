import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// @ts-expect-error a plain JavaScript build script
import { buildUiMap, OUT, screenWords } from '../scripts/build-ui-map.mjs';
import { lookupKnowledge, knowledgeSnippets } from '../backend/src/ai/knowledge';
import { launched } from '../backend/src/ai/knowledgeBase';
import { questionWords, uiLookup, whatsNew } from '../backend/src/ai/uiKnowledge';
import { WHATS_NEW } from '../shared/whatsNew';

// เลขากระรอก learns the app by itself (owner, 2026-11-01): the words of every page, read from the screens' own code at
// every release, and the customer-facing release notes.

test('the screen words are up to date with the screens (run `npm run ui-map` after changing what a page says)', () => {
  assert.equal(fs.readFileSync(OUT, 'utf8'), buildUiMap());
});

test('screen words: tr()/T()/trc() calls and plain Thai between tags; nothing for admins, no AI, no code', () => {
  const words = screenWords(`
    <b>{tr('ธีมและการแสดงผลของแอป')}</b> <p>{T("มืดตลอด")}</p> <h2>{trc('menu', 'ตั้งค่า')}</h2>
    <span>เริ่มโหมดมืด</span> <i>{tr('สำหรับแอดมิน: เลขา AI ยังไม่เปิด')}</i> {tr('Hello')} {tr(\`ยอด \${x}\`)}
    const a = (b) => b > 'ก' ? 1 : 2;`);
  assert.deepEqual(words, ['ธีมและการแสดงผลของแอป', 'มืดตลอด', 'ตั้งค่า', 'เริ่มโหมดมืด']);
});

test('a how/where question finds the labels of open pages only, with their address', () => {
  const [page] = uiLookup('ตั้งเวลาโหมดมืดได้ไหม');
  assert.equal(page.area, 'settings');
  assert.match(page.route, /^\/settings\//);
  assert.ok(page.texts.some(text => text.includes('โหมดมืด')));
  assert.deepEqual(uiLookup('สวัสดีครับ'), [], 'small talk matches nothing');
  for (const hit of [...uiLookup('เป้าหมายออมเงิน'), ...uiLookup('รายงานภาษีขั้นบันได')]) assert.ok(launched(hit.area), hit.area);
  assert.ok(questionWords('ตั้งเวลาโหมดมืดได้ไหม').includes('มืด'));
  const text = knowledgeSnippets(lookupKnowledge('อยากแนบสลิปรายจ่ายทำยังไง', 3, { ui: true }));
  assert.match(text, /ON SCREEN NOW/);
  assert.match(text, /\[incomeExpense\] รายจ่าย/);
  assert.doesNotMatch(knowledgeSnippets(lookupKnowledge('อยากแนบสลิปรายจ่ายทำยังไง', 3)), /ON SCREEN NOW/, 'only when asked for');
});

test('release notes: "what is new" lists the open pages\' notes newest first; a page asked about brings its recent note', () => {
  const dates = WHATS_NEW.map(entry => entry.date);
  assert.deepEqual([...dates].sort().reverse(), dates, 'newest first');
  for (const entry of WHATS_NEW) {
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.doesNotMatch(entry.th, /฿|\d+\s*บาท|Gemini|Claude|Anthropic|OpenAI|Supabase|Cloudflare|Vercel|ทดลองใช้ฟรี|\bAI\b/i, entry.th);
  }
  const news = whatsNew('มีอะไรใหม่บ้าง');
  assert.ok(news.length > 0 && news.length <= 8);
  assert.ok(news.every(entry => launched(entry.area)));
  assert.match(knowledgeSnippets(lookupKnowledge('ช่วงนี้มีฟีเจอร์ใหม่อะไรบ้าง')), /WHAT IS NEW/);
  const now = Date.parse('2026-11-05T12:00:00+07:00');
  assert.deepEqual(whatsNew('ตั้งธีมยังไง', ['settings'], now).map(entry => entry.area), ['settings']);
  assert.deepEqual(whatsNew('ตั้งธีมยังไง', ['settings'], Date.parse('2027-01-01T00:00:00+07:00')), [], 'old notes stop riding along');
});
