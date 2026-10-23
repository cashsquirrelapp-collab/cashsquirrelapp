// Dumps the reference design's real markup and computed styles for chosen elements,
// so the port follows what the browser actually renders rather than a reading of layered CSS.
//   npx tsx scripts/mobile/ref-inspect.ts "<design.html>" '<json: {route?, open?, selectors: string[]}>'
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';

const file = process.argv[2];
const ask = JSON.parse(process.argv[3] || '{}') as { nav?: string; click?: string[]; selectors: string[]; html?: string[]; props?: string[] };
const PROPS = ask.props || ['display', 'position', 'width', 'height', 'padding', 'margin', 'gap', 'grid-template-columns', 'flex-direction', 'align-items', 'justify-content', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color', 'background-color', 'background-image', 'border', 'border-radius', 'box-shadow', 'top', 'right', 'bottom', 'left', 'z-index', 'opacity', 'overflow', 'filter', 'text-align'];
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok' })).newPage();
await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
await page.waitForTimeout(1200);
if (ask.nav) { await page.locator(`#bottom-nav [data-nav="${ask.nav}"]`).first().click(); await page.waitForTimeout(400); }
for (const selector of ask.click || []) { await page.locator(selector).first().click(); await page.waitForTimeout(400); }
const out = await page.evaluate(({ selectors, html, PROPS }) => {
  const skip = new Set(['none', 'normal', 'auto', '0px', 'static', 'visible', 'rgba(0, 0, 0, 0)', 'start', 'row', '1', 'stretch']);
  const styles = selectors.map(sel => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return `${sel}: (not found)`;
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    const pairs = PROPS.map(p => [p, cs.getPropertyValue(p)] as const).filter(([p, v]) => v && !skip.has(v) && !(p === 'border' && v.startsWith('0px')) && !(p.includes('margin') && v === '0px'));
    return `${sel}  [${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}]\n   ` + pairs.map(([p, v]) => `${p}:${v}`).join('; ');
  });
  const markup = (html || []).map(sel => `--- ${sel}\n${(document.querySelector(sel) as HTMLElement | null)?.outerHTML ?? '(not found)'}`);
  return [...styles, ...markup].join('\n');
}, { selectors: ask.selectors, html: ask.html, PROPS });
console.log(out);
await browser.close();
