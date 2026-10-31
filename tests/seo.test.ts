import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SEO_PAGES, seoHead, withSeoHead } from '../shared/seo.js';

// Search results (owner, 2026-10-31: "ทำเลย"): the home page's title and description are the owner's words, each public
// page has its own title, a canonical address on krarok.com and a link preview, and the home page names the site.

const indexHtml = fs.readFileSync('frontend/index.html', 'utf8');

test('the home page carries the owner\'s title and description, word for word', () => {
  assert.equal(SEO_PAGES['/'].title, 'Krarok กระรอกตุนเงิน | ให้ทุกเรื่องงานและเงิน ง่ายขึ้นในที่เดียว');
  assert.equal(SEO_PAGES['/'].description, 'จัดการงานและการเงินอย่างชาญฉลาด พร้อมเลขากระรอก ผู้ช่วยส่วนตัวที่ช่วยทำงานแทนคุณ ติดตามเงินค้างรับ แจ้งเตือนเครดิตเทอมอัตโนมัติ และออกเอกสารได้ง่ายในที่เดียว');
  const html = withSeoHead(indexHtml, '/');
  assert.match(html, /<title>Krarok กระรอกตุนเงิน \| ให้ทุกเรื่องงานและเงิน ง่ายขึ้นในที่เดียว<\/title>/);
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.match(html, /<meta name="description" content="จัดการงานและการเงินอย่างชาญฉลาด/);
  assert.match(html, /<link rel="canonical" href="https:\/\/krarok\.com\/" \/>/);
  assert.match(html, /<meta property="og:title" content="Krarok กระรอกตุนเงิน \| ให้ทุกเรื่องงานและเงิน/);
});

test('the home page tells search engines the site\'s name and logo', () => {
  const head = seoHead('/');
  const json = head.match(/<script type="application\/ld\+json">(.*)<\/script>/)?.[1];
  assert.ok(json);
  const [site, org] = JSON.parse(json!);
  assert.equal(site['@type'], 'WebSite');
  assert.equal(site.name, 'Krarok');
  assert.ok(site.alternateName.includes('กระรอกตุนเงิน'));
  assert.equal(site.url, 'https://krarok.com/');
  assert.equal(org['@type'], 'Organization');
  assert.match(org.logo, /^https:\/\/krarok\.com\/.+\.png$/);
  assert.ok(fs.existsSync(`frontend/public${new URL(org.logo).pathname}`), 'the logo file exists');
});

test('each other public page has its own title and canonical address, and no site data', () => {
  for (const [path, title] of [['/founder', 'เรื่องราวจากผู้ก่อตั้ง | Krarok'], ['/login', 'เข้าสู่ระบบ | Krarok']] as const) {
    const html = withSeoHead(indexHtml, path);
    assert.ok(html.includes(`<title>${title}</title>`), path);
    assert.ok(html.includes(`<link rel="canonical" href="https://krarok.com${path}" />`), path);
    assert.ok(!html.includes('application/ld+json'), path);
  }
});

test('pages that are not listed keep index.html as it is', () => {
  for (const path of ['/dashboard', '/app', '/founder/', '/privacy']) assert.equal(withSeoHead(indexHtml, path), indexHtml);
});

test('every tag in the head is well formed: attribute values closed, nothing breaks out of the data block', () => {
  for (const path of Object.keys(SEO_PAGES)) {
    const head = seoHead(path);
    for (const tag of head.match(/<(meta|link)\b[^>]*>/g) || []) {
      assert.match(tag, /^<(meta|link)( [a-z:-]+="[^"<>]*")+ \/>$/, `${path}: ${tag}`);
    }
    const data = head.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] || '';
    assert.ok(!data.includes('<'), `${path}: no raw < inside the data block`);
  }
});

test('the Worker writes the head for listed pages and the founder tab uses the same title', () => {
  const worker = fs.readFileSync('cloudflare/worker.ts', 'utf8');
  assert.match(worker, /await pageAsset\(request, env, path\)/);
  assert.match(worker, /withSeoPage\(await response\.text\(\), path\)/);
  assert.match(worker, /headers\.delete\('If-None-Match'\)/);
  const founder = fs.readFileSync('frontend/src/features/marketing/v5/FounderStory.tsx', 'utf8');
  assert.match(founder, /SEO_PAGES\['\/founder'\]\.title/);
});
