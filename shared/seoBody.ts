import { HERO, SECTIONS, SIGN } from './founderStory.js';
import { GUIDES, GUIDES_INDEX, GUIDES_PATH, guideByPath, type Guide, type GuideBlock } from './guides.js';

// The page's words as plain HTML, sent inside the page (owner, 2026-10-31: "ทำให้เสร็จ"). The site was not found on
// Google because every page arrived empty until its scripts ran; now a search engine reads the words on its first
// visit. They are the same words the page shows: the guides and the founder's story from their own data, and for the
// home page its heading, the owner's description and what the landing says the app does.
// The app replaces this block the moment it starts (React clears #root on its first render), so people see the page as
// before. The block stays invisible for its first 2 seconds and shows only when the app does not start (no scripts).

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** **bold** words in <strong>. */
const rich = (text: string) => esc(text).split('**').map((part, at) => (at % 2 ? `<strong>${part}</strong>` : part)).join('');

const STYLE = '<style>#ssr{max-width:760px;margin:0 auto;padding:40px 20px 64px;color:#1C1917;font:17px/1.75 \'IBM Plex Sans Thai\',system-ui,sans-serif;'
  + 'opacity:0;animation:ssr-show 0s linear 2s forwards}#ssr h1{margin:12px 0;font-size:30px;line-height:1.45}#ssr h2{margin:32px 0 8px;font-size:22px;line-height:1.5}'
  + '#ssr p,#ssr li{line-height:1.75}#ssr a{color:#C24A16}#ssr table{border-collapse:collapse}#ssr td,#ssr th{padding:6px 12px;border-bottom:1px solid #EEE4DD;text-align:left}'
  + '@keyframes ssr-show{to{opacity:1}}</style>';

const nav = '<nav><a href="/">กระรอกตุนเงิน</a> · <a href="/guides">ความรู้เรื่องงานและเงิน</a> · <a href="/founder">เรื่องราวจากผู้ก่อตั้ง</a> · <a href="/login">เริ่มใช้ฟรี</a></nav>';
const foot = '<footer><p><a href="/privacy">นโยบายความเป็นส่วนตัว</a> · <a href="/terms">ข้อกำหนดการใช้งาน</a> · © 2026 Krarok กระรอกตุนเงิน</p></footer>';
const guideLinks = (guides: Guide[]) => `<ul>${guides.map(guide => `<li><a href="${guide.path}">${esc(guide.title)}</a> ${esc(guide.summary)}</li>`).join('')}</ul>`;

function block(item: GuideBlock): string {
  switch (item.kind) {
    case 'p': return `<p>${rich(item.text)}</p>`;
    case 'list': { const tag = item.ordered ? 'ol' : 'ul'; return `<${tag}>${item.items.map(text => `<li>${rich(text)}</li>`).join('')}</${tag}>`; }
    case 'table': return `<table><thead><tr><th>${esc(item.head[0])}</th><th>${esc(item.head[1])}</th></tr></thead><tbody>`
      + `${item.rows.map(([name, value]) => `<tr><td>${esc(name)}</td><td>${esc(value)}</td></tr>`).join('')}</tbody></table>${item.note ? `<p>${esc(item.note)}</p>` : ''}`;
    case 'example': return `<figure><figcaption>${esc(item.title)}</figcaption>${item.lines.map(line => `<p>${esc(line)}</p>`).join('')}</figure>`;
    case 'krarok': return `<aside><p><strong>ทำได้ในกระรอกตุนเงิน</strong></p><ul>${item.items.map(text => `<li>${rich(text)}</li>`).join('')}</ul></aside>`;
    case 'note': return `<p>${esc(item.text)}</p>`;
  }
}

function guidePage(guide: Guide): string {
  return `<article><p><a href="${GUIDES_PATH}">ความรู้เรื่องงานและเงิน</a> › ${esc(guide.title)}</p><h1>${esc(guide.title)}</h1><p>${esc(guide.lead)}</p>`
    + `<p>อัปเดตล่าสุด ${esc(guide.updated)}</p>`
    + guide.sections.map(section => `<section><h2>${esc(section.title)}</h2>${section.blocks.map(block).join('')}</section>`).join('')
    + `</article><section><h2>อ่านต่อ</h2>${guideLinks(GUIDES.filter(other => other.slug !== guide.slug))}</section>`;
}

const guideList = () => `<h1>${esc(GUIDES_INDEX.title)}</h1><p>${esc(GUIDES_INDEX.lead)}</p>${guideLinks(GUIDES)}`;

function founderPage(): string {
  return `<article><p>${esc(HERO.eyebrow)}</p><h1>${esc(HERO.title.th)}</h1><blockquote><p>${esc(HERO.lead.th)}</p></blockquote><p>${esc(HERO.hello.th)}</p>`
    + SECTIONS.map(section => `<section><h2>${esc(section.title.th)}</h2>${section.blocks.map(item => (item.kind === 'photo' ? ''
      : item.kind === 'quote' ? `<blockquote><p>${rich(item.text.th)}</p></blockquote>` : `<p>${rich(item.text.th)}</p>`)).join('')}</section>`).join('')
    + `<p>${esc(SIGN.with.th)} ${esc(SIGN.name.th)} · ${esc(SIGN.role)}</p></article>`;
}

/** What the landing says the app does (its feature sections and its questions), in its own words. */
const HOME_FEATURES = [
  'ออกใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ และใบกำกับภาษี ดาวน์โหลดเป็น PDF ได้ทั้งแพ็กเกจฟรีและ Pro',
  'เห็นเงินทั้งเดือน ว่าเงินก้อนไหนเข้าแล้ว ก้อนไหนยังรอ',
  'ติดตามเงินค้างรับและเครดิตเทอมของลูกค้าทุกราย',
  'เก็บเอกสารทั้งปีไว้ที่เดียว ผูกกับงานอัตโนมัติ ค้นหาง่าย ดาวน์โหลดพร้อมใช้',
  'สมาชิก Pro ใช้เลขากระรอก ผู้ช่วยใน LINE และรับแจ้งเตือนทาง LINE หรืออีเมล',
];

function homePage(description: string): string {
  return '<h1>ตั้งแต่รับงาน จนถึงรับเงิน ให้เลขากระรอกดูแล</h1><p><strong>Krarok กระรอกตุนเงิน</strong> สำหรับฟรีแลนซ์ ครีเอเตอร์ ติวเตอร์ และคนที่รับงานจากหลายลูกค้า</p>'
    + `<p>${esc(description)}</p><h2>กระรอกตุนเงินช่วยอะไรได้บ้าง</h2><ul>${HOME_FEATURES.map(text => `<li>${esc(text)}</li>`).join('')}</ul>`
    + '<p><a href="/login">เริ่มใช้ฟรี</a> สมัครด้วย Google, Facebook หรืออีเมล ไม่ต้องใช้บัตร</p>'
    + `<h2>ความรู้เรื่องงานและเงิน</h2>${guideLinks(GUIDES)}<h2>เรื่องราวจากผู้ก่อตั้ง</h2><p>${esc(HERO.lead.th)} <a href="/founder">อ่านเรื่องราวจากผู้ก่อตั้ง</a></p>`;
}

/** The words of one public page as HTML for inside #root, or '' for pages without a body of their own. */
export function seoBody(path: string, description = ''): string {
  const guide = guideByPath(path);
  const main = guide ? guidePage(guide) : path === GUIDES_PATH ? guideList() : path === '/founder' ? founderPage() : path === '/' ? homePage(description) : '';
  return main ? `${STYLE}<div id="ssr" lang="th">${nav}<main>${main}</main>${foot}</div>` : '';
}
