import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GUIDES, GUIDES_PATH } from '../shared/guides.js';
import { SEO_PAGES, SHARE_IMAGE, seoHead } from '../shared/seo.js';
import { FREE_DOCUMENT_LIMIT } from '../backend/src/services/documentQuota.js';

// The guides on the website (owner, 2026-10-31): every figure matches the verified accounting knowledge and the app's own
// limits, features open only to Pro say so, no vendor names or free trial, and every guide is in the search data and the
// sitemap with its own title.

const words = (guide: (typeof GUIDES)[number]) => [guide.title, guide.lead, guide.description, guide.summary,
  ...guide.sections.flatMap(section => [section.title, ...section.blocks.flatMap(block => {
    switch (block.kind) {
      case 'p': case 'note': return [block.text];
      case 'list': case 'krarok': return block.items;
      case 'example': return [block.title, ...block.lines];
      case 'table': return [...block.head, ...block.rows.flat(), block.note || ''];
    }
  })])];
const all = GUIDES.flatMap(words);
const knowledge = fs.readFileSync('backend/src/ai/accounting/knowledge.ts', 'utf8');

test('every guide has its own path, title and description, in the search data and the sitemap', () => {
  const sitemap = fs.readFileSync('frontend/public/sitemap.xml', 'utf8');
  assert.ok(sitemap.includes(`<loc>https://krarok.com${GUIDES_PATH}</loc>`));
  assert.equal(new Set(GUIDES.map(guide => guide.path)).size, GUIDES.length);
  assert.equal(new Set(GUIDES.map(guide => guide.seoTitle)).size, GUIDES.length);
  for (const guide of GUIDES) {
    assert.equal(guide.path, `${GUIDES_PATH}/${guide.slug}`);
    assert.deepEqual(SEO_PAGES[guide.path], { title: guide.seoTitle, description: guide.description });
    assert.ok(sitemap.includes(`<loc>https://krarok.com${guide.path}</loc>`), guide.path);
    assert.ok(guide.description.length <= 170, `${guide.slug}: description fits a search result`);
    const head = seoHead(guide.path);
    assert.match(head, /"@type":"Article"/);
    assert.ok(head.includes(`<link rel="canonical" href="https://krarok.com${guide.path}" />`));
  }
});

test('the withholding rates in the 50 ทวิ guide are the verified ones', () => {
  const table = GUIDES.find(guide => guide.slug === 'wht-50-tawi')!.sections.flatMap(section => section.blocks).find(block => block.kind === 'table');
  assert.ok(table && table.kind === 'table');
  const inKnowledge: Record<string, string> = { 'ค่ารางวัล': 'รางวัล', 'ค่าขนส่ง (ไม่รวมขนส่งสาธารณะ)': 'ค่าขนส่ง' };
  for (const [name, rate] of table.rows) {
    const said = inKnowledge[name] || name;
    assert.ok(knowledge.includes(`${said} ${rate}`), `${name} ${rate} is in the accounting knowledge`);
  }
  assert.ok(knowledge.includes('ท.ป.4/2528') && all.some(text => text.includes('ท.ป.4/2528')));
  assert.ok(knowledge.includes('ใช้อัตราลด 1%') && all.some(text => text.includes('อัตราลดเหลือ 1%')));
  // The example: 3% of 10,000 is 300, leaving 9,700.
  assert.ok(all.some(text => text.includes('3% = 300 บาท')) && all.some(text => text.includes('9,700 บาท')));
});

test('the app\'s own limits and the pricing example are right', () => {
  assert.ok(all.some(text => text.includes(`${FREE_DOCUMENT_LIMIT} ฉบับต่อเดือน`)), 'the free document limit');
  assert.ok(all.some(text => text.includes('7,000 ÷ (1 − 0.30) = 10,000')));
  assert.equal(Math.round(7000 / (1 - 0.3)), 10000);
  assert.equal(7000 * 1.3, 9100);
});

test('features only Pro has are named as Pro; no vendor names, no free trial', () => {
  for (const text of all) {
    if (/เลขากระรอก/.test(text)) assert.match(text, /Pro/, text);
    if (/เตือน.*50 ทวิ|50 ทวิ.*เตือน/.test(text) && /LINE/.test(text)) assert.match(text, /Pro/, text);
    assert.doesNotMatch(text, /Gemini|Claude|Anthropic|OpenAI|Supabase|Cloudflare|Stripe|Vercel|ทดลองฟรี|ทดลองใช้ฟรี|\bAI\b/i, text);
  }
});

test('the share picture is a 1200×630 PNG and every public page names it', () => {
  const file = `frontend/public${new URL(SHARE_IMAGE.url).pathname}`;
  const png = fs.readFileSync(file);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
  for (const path of Object.keys(SEO_PAGES)) {
    assert.ok(seoHead(path).includes(`<meta property="og:image" content="${SHARE_IMAGE.url}" />`), path);
    assert.ok(seoHead(path).includes('<meta name="twitter:card" content="summary_large_image" />'), path);
  }
});

test('the landing footer links to the guides, and the app opens them', () => {
  assert.match(fs.readFileSync('frontend/src/features/marketing/v5/CleanLanding.tsx', 'utf8'), /<a href="\/guides">/);
  assert.match(fs.readFileSync('frontend/src/app/App.tsx', 'utf8'), /pathname === '\/guides' \|\| pathname\.startsWith\('\/guides\/'\)/);
});
