import { HERO } from './founderStory.js';
import { GUIDES, GUIDES_INDEX, GUIDES_PATH, guideByPath } from './guides.js';
import { seoBody } from './seoBody.js';

// What search engines and link previews read for each public page (owner, 2026-10-31: "ทำเลย", with the home page's
// title and description in the owner's own words). The Worker writes these into the page head when it serves the page
// (cloudflare/worker.ts), so a search engine sees them without running the app. Other pages keep index.html's title.

export const SITE_URL = 'https://krarok.com';
export const SITE_NAME = 'Krarok';
// The names people type for the app (owner, 2026-11-01: "กระรอก หรือกระรอกตุนเงิน ... ภาษาคาราโอเกะ ... ภาษาอังกฤษ"): Thai,
// with a space, the romanised spellings and the short forms. The first stays the Organization's other name.
export const SITE_ALTERNATE_NAMES = ['กระรอกตุนเงิน', 'Krarok Tunngern', 'กระรอก ตุนเงิน', 'Krarok Tun Ngern', 'Kra Rok Tun Ngoen', 'แอปกระรอก'];
const LOGO = `${SITE_URL}/brand/home-v2/home-icon-512.png`;
/** The picture LINE, Facebook and others show with a shared link (1200×630, the logo, the owner's line and the mascot). */
// v2 (2026-11-12): โมจิ in place of the old squirrel, the same words and logo; a new name so LINE and Facebook fetch it again.
export const SHARE_IMAGE = { url: `${SITE_URL}/og/krarok-share-v2.png`, width: 1200, height: 630 };
type ShareImage = { url: string; width: number; height: number; alt?: string };

/** The founder, as search engines should know them (owner, 2026-11-01: "เสิร์ชให้เจอกูง่าย ๆ"). The names are the ones
 *  the story itself uses (shared/founderStory.ts: HERO.hello, SIGN), English spelling included. */
export const FOUNDER = {
  name: 'นพรัตน์ นาวะบุตร',
  givenName: 'นพรัตน์',
  familyName: 'นาวะบุตร',
  alternateNames: ['ปาร์ค', 'Park', 'Noppharat Navabut', 'Park Noppharat Navabut', 'ปาร์ค นพรัตน์'],
  jobTitle: 'ผู้ก่อตั้ง Krarok (กระรอกตุนเงิน)',
  url: `${SITE_URL}/founder`,
  image: `${SITE_URL}/landing-v5/founder/portrait.webp`,
} as const;
/** The founder's link preview: their photo, name and first words (1200×630; source in artifacts/founder-share/). */
const FOUNDER_SHARE_IMAGE: ShareImage = { url: `${SITE_URL}/og/founder-share.jpg`, width: 1200, height: 630,
  alt: 'นพรัตน์ นาวะบุตร (ปาร์ค) ผู้ก่อตั้ง Krarok กระรอกตุนเงิน' };
/** The brand's own channels (frontend/src/features/marketing/v5/brandLinks.ts), so search engines tie them to the site. */
const BRAND_PROFILES = ['https://www.instagram.com/kraroktunngern/', 'https://www.tiktok.com/@krarok.official'];

const HOME_DESCRIPTION = 'จัดการงานและการเงินอย่างชาญฉลาด พร้อมเลขากระรอก ผู้ช่วยส่วนตัวที่ช่วยทำงานแทนคุณ ติดตามเงินค้างรับ แจ้งเตือนเครดิตเทอมอัตโนมัติ และออกเอกสารได้ง่ายในที่เดียว';

export type SeoPage = { title: string; description: string; image?: ShareImage; type?: 'website' | 'profile' };
export const SEO_PAGES: Record<string, SeoPage> = {
  // Both names in the title (owner, 2026-10-31: "ได้เลย"), so the page is found by the Thai name and the English one.
  '/': { title: 'Krarok กระรอกตุนเงิน | ให้ทุกเรื่องงานและเงิน ง่ายขึ้นในที่เดียว', description: HOME_DESCRIPTION },
  // The founder's name leads, so a search for it finds this page (owner, 2026-11-01).
  '/founder': {
    title: 'นพรัตน์ นาวะบุตร (ปาร์ค) ผู้ก่อตั้ง Krarok กระรอกตุนเงิน | เรื่องราวจากผู้ก่อตั้ง',
    description: 'เรื่องราวของนพรัตน์ นาวะบุตร (ปาร์ค) ผู้ก่อตั้ง Krarok กระรอกตุนเงิน จากฟรีแลนซ์ตัดต่อวิดีโอที่ต้องทำบัญชีและเอกสารเองจนล้นมือ สู่แอปที่อยากช่วยให้เรื่องงานและเงินง่ายขึ้นสำหรับทุกคน',
    image: FOUNDER_SHARE_IMAGE, type: 'profile',
  },
  '/login': { title: 'เข้าสู่ระบบ | Krarok', description: HOME_DESCRIPTION },
  [GUIDES_PATH]: { title: GUIDES_INDEX.seoTitle, description: GUIDES_INDEX.description },
  ...Object.fromEntries(GUIDES.map(guide => [guide.path, { title: guide.seoTitle, description: guide.description }])),
};

export const seoPage = (path: string): SeoPage | undefined => Object.prototype.hasOwnProperty.call(SEO_PAGES, path) ? SEO_PAGES[path] : undefined;

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The head tags for one public page: title, description, canonical address, link preview, and on the home page the
 *  site's name and logo as structured data. */
export function seoHead(path: string): string {
  const page = seoPage(path);
  if (!page) return '';
  const url = `${SITE_URL}${path}`;
  const image: ShareImage = page.image ?? SHARE_IMAGE;
  const tags = [
    `<title>${escape(page.title)}</title>`,
    `<meta name="description" content="${escape(page.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="${page.type ?? 'website'}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${escape(page.title)}" />`,
    `<meta property="og:description" content="${escape(page.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    '<meta property="og:locale" content="th_TH" />',
    `<meta property="og:image" content="${image.url}" />`,
    `<meta property="og:image:width" content="${image.width}" />`,
    `<meta property="og:image:height" content="${image.height}" />`,
    ...(image.alt ? [`<meta property="og:image:alt" content="${escape(image.alt)}" />`] : []),
    '<meta name="twitter:card" content="summary_large_image" />',
  ];
  const json = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
  if (path === '/founder') {
    // A profile page about the founder: who they are, what they founded, their photo and the Krarok profiles.
    tags.push(`<meta property="profile:first_name" content="${FOUNDER.givenName}" />`, `<meta property="profile:last_name" content="${FOUNDER.familyName}" />`);
    tags.push(json({ '@context': 'https://schema.org', '@type': 'ProfilePage', url, name: page.title, inLanguage: 'th', dateModified: '2026-11-01',
      mainEntity: { '@type': 'Person', name: FOUNDER.name, givenName: FOUNDER.givenName, familyName: FOUNDER.familyName,
        alternateName: FOUNDER.alternateNames, jobTitle: FOUNDER.jobTitle, url: FOUNDER.url, image: FOUNDER.image, description: HERO.hello.th,
        worksFor: { '@type': 'Organization', name: SITE_NAME, alternateName: SITE_ALTERNATE_NAMES[0], url: `${SITE_URL}/`, sameAs: BRAND_PROFILES } } }));
  }
  const guide = guideByPath(path);
  if (guide) {
    // A guide is an article from the site, dated, for search engines that show articles.
    const data = { '@context': 'https://schema.org', '@type': 'Article', headline: guide.title, description: guide.description, inLanguage: 'th',
      datePublished: '2026-10-31', dateModified: '2026-10-31', image: SHARE_IMAGE.url, mainEntityOfPage: url,
      author: { '@type': 'Organization', name: SITE_NAME, url: `${SITE_URL}/` }, publisher: { '@type': 'Organization', name: SITE_NAME, logo: { '@type': 'ImageObject', url: LOGO } } };
    tags.push(`<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`);
  }
  if (path === '/') {
    const data = [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, alternateName: SITE_ALTERNATE_NAMES, url: `${SITE_URL}/` },
      { '@context': 'https://schema.org', '@type': 'Organization', name: SITE_NAME, alternateName: SITE_ALTERNATE_NAMES[0], url: `${SITE_URL}/`, logo: LOGO,
        sameAs: BRAND_PROFILES, founder: { '@type': 'Person', name: FOUNDER.name, alternateName: FOUNDER.alternateNames, url: FOUNDER.url, image: FOUNDER.image } },
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

/** The served page with its own head and, for pages that have words of their own, those words inside #root
 *  (shared/seoBody.ts), so a search engine reads the page without running the app. */
export function withSeoPage(html: string, path: string): string {
  const page = seoPage(path);
  const withHead = withSeoHead(html, path);
  const body = page ? seoBody(path, page.description) : '';
  return body && withHead.includes('<div id="root"></div>') ? withHead.replace('<div id="root"></div>', () => `<div id="root">${body}</div>`) : withHead;
}
