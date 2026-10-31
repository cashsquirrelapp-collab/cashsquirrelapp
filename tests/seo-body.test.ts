import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GUIDES } from '../shared/guides.js';
import { SECTIONS } from '../shared/founderStory.js';
import { SEO_PAGES, withSeoPage } from '../shared/seo.js';
import { seoBody } from '../shared/seoBody.js';

// The words sent inside each public page (owner, 2026-10-31: "ทำให้เสร็จ" after the site could not be found): the
// same words the page shows, inside #root where the app replaces them, hidden for their first 2 seconds.

const indexHtml = fs.readFileSync('frontend/index.html', 'utf8');
const text = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

test('the home page arrives with its heading, the owner\'s description, what the app does and the way to the guides', () => {
  const html = withSeoPage(indexHtml, '/');
  assert.equal((html.match(/id="root"/g) || []).length, 1);
  assert.match(html, /<div id="root"><style>#ssr\{/);
  const words = text(html);
  assert.ok(words.includes('ตั้งแต่รับงาน จนถึงรับเงิน ให้เลขากระรอกดูแล'));
  assert.ok(words.includes(SEO_PAGES['/'].description));
  assert.ok(words.includes('Krarok กระรอกตุนเงิน'));
  for (const guide of GUIDES) assert.ok(html.includes(`<a href="${guide.path}">`), guide.path);
  assert.ok(html.includes('<a href="/founder">'));
});

test('what the home block says the app does is what the landing says', () => {
  const landing = fs.readFileSync('frontend/src/features/marketing/v5/CleanLanding.tsx', 'utf8');
  for (const said of ['ใบกำกับภาษี', 'ไม่ต้องใช้บัตร', 'สมัครด้วย Google, Facebook หรืออีเมล', 'ฟรีแลนซ์ ครีเอเตอร์ ติวเตอร์ และคนที่รับงานจากหลายลูกค้า',
    'ใช้ผู้ช่วยใน LINE และรับแจ้งเตือนทาง LINE หรืออีเมล', 'เห็นเงิน', 'ผูกกับงานอัตโนมัติ ค้นหาง่าย ดาวน์โหลดพร้อมใช้']) {
    assert.ok(landing.includes(said), `the landing says: ${said}`);
  }
});

test('each guide arrives whole: every heading, every list item, every rate', () => {
  for (const guide of GUIDES) {
    const words = text(seoBody(guide.path));
    assert.ok(words.includes(guide.title), guide.slug);
    for (const section of guide.sections) {
      assert.ok(words.includes(section.title), `${guide.slug}: ${section.title}`);
      for (const block of section.blocks) {
        const pieces = block.kind === 'list' || block.kind === 'krarok' ? block.items : block.kind === 'table' ? block.rows.flat() : block.kind === 'example' ? block.lines : [block.text];
        for (const piece of pieces) assert.ok(words.includes(piece.replace(/\*\*/g, '')), `${guide.slug}: ${piece.slice(0, 30)}`);
      }
    }
    assert.ok(!seoBody(guide.path).includes('**'));
  }
});

test('the founder\'s story arrives with every part; the guide list with every guide', () => {
  const founder = text(seoBody('/founder'));
  for (const section of SECTIONS) assert.ok(founder.includes(section.title.th), section.title.th);
  assert.ok(!founder.includes('พื้นที่สำหรับรูป'));
  const list = text(seoBody('/guides'));
  for (const guide of GUIDES) assert.ok(list.includes(guide.title));
});

test('the block is hidden at first and only shows when the app never starts; other pages get none', () => {
  assert.match(seoBody('/'), /opacity:0;animation:ssr-show 0s linear 2s forwards/);
  for (const path of ['/login', '/dashboard', '/app']) assert.equal(seoBody(path), '');
  assert.equal(withSeoPage(indexHtml, '/dashboard'), indexHtml);
  assert.ok(!withSeoPage(indexHtml, '/login').includes('id="ssr"'));
  // The app mounts with createRoot, which clears whatever is inside #root on its first render.
  assert.match(fs.readFileSync('frontend/src/main.tsx', 'utf8'), /createRoot\(document\.getElementById\('root'\)!\)\.render\(/);
});
