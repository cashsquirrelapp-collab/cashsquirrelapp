import { HERO } from './founderStory.js';

// What search engines and link previews read for each public page (owner, 2026-10-31: "ทำเลย", with the home page's
// title and description in the owner's own words). The Worker writes these into the page head when it serves the page
// (cloudflare/worker.ts), so a search engine sees them without running the app. Other pages keep index.html's title.

export const SITE_URL = 'https://krarok.com';
export const SITE_NAME = 'Krarok';
export const SITE_ALTERNATE_NAMES = ['กระรอกตุนเงิน', 'Krarok Tunngern'];
const LOGO = `${SITE_URL}/brand/home-v2/home-icon-512.png`;

const HOME_DESCRIPTION = 'จัดการงานและการเงินอย่างชาญฉลาด พร้อมเลขากระรอก ผู้ช่วยส่วนตัวที่ช่วยทำงานแทนคุณ ติดตามเงินค้างรับ แจ้งเตือนเครดิตเทอมอัตโนมัติ และออกเอกสารได้ง่ายในที่เดียว';

export type SeoPage = { title: string; description: string };
export const SEO_PAGES: Record<string, SeoPage> = {
  // Both names in the title (owner, 2026-10-31: "ได้เลย"), so the page is found by the Thai name and the English one.
  '/': { title: 'Krarok กระรอกตุนเงิน | ให้ทุกเรื่องงานและเงิน ง่ายขึ้นในที่เดียว', description: HOME_DESCRIPTION },
  '/founder': { title: 'เรื่องราวจากผู้ก่อตั้ง | Krarok', description: HERO.lead.th },
  '/login': { title: 'เข้าสู่ระบบ | Krarok', description: HOME_DESCRIPTION },
};

export const seoPage = (path: string): SeoPage | undefined => Object.prototype.hasOwnProperty.call(SEO_PAGES, path) ? SEO_PAGES[path] : undefined;

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The head tags for one public page: title, description, canonical address, link preview, and on the home page the
 *  site's name and logo as structured data. */
export function seoHead(path: string): string {
  const page = seoPage(path);
  if (!page) return '';
  const url = `${SITE_URL}${path}`;
  const tags = [
    `<title>${escape(page.title)}</title>`,
    `<meta name="description" content="${escape(page.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${escape(page.title)}" />`,
    `<meta property="og:description" content="${escape(page.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    '<meta property="og:locale" content="th_TH" />',
  ];
  if (path === '/') {
    const data = [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, alternateName: SITE_ALTERNATE_NAMES, url: `${SITE_URL}/` },
      { '@context': 'https://schema.org', '@type': 'Organization', name: SITE_NAME, alternateName: SITE_ALTERNATE_NAMES[0], url: `${SITE_URL}/`, logo: LOGO },
    ];
    tags.push(`<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`);
  }
  return tags.join('\n    ');
}

/** The served page with its own head in place of index.html's title. Pages not listed come back unchanged. */
export function withSeoHead(html: string, path: string): string {
  const head = seoHead(path);
  if (!head || !/<title>[^<]*<\/title>/.test(html)) return html;
  return html.replace(/<title>[^<]*<\/title>/, () => head);
}
