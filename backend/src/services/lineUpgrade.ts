import { PLAN_LIMITS } from '../../../shared/plans.js';
import { PLUS_PRICE, proPriceDetails } from '../../../shared/proPricing.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { patchPrivate } from '../repositories/accounts.js';
import { freeMonthlyTokens } from './lineFirst.js';
import type { LineMessage } from './line.js';
import { LINE_CARD_COLORS as C, lineAppLink } from './lineCards.js';

// Plus and Pro in LINE (owner, 2026-11-16: "เอาโฆษณาแบบพวกการเติมโปรเนี่ยลงในไลน์ด้วยนะ ... กดปุ่มแบบสมัครสมาชิกโปร ... ให้มัน
// สมัครง่ายมากขึ้น"; chose "ตอนโทเคนหมด + ในเมนู"). One card with both plans and a button each that opens the plans page in
// LINE with that plan chosen. It comes when an account without a paid plan runs out of เลขา's tokens, when they run low
// (at most once a week), when someone types แพ็กเกจ / สมัคร Pro / อัปเกรด or presses it in เมนูเพิ่มเติม, and at most once a
// week under an answer. Only ever in a reply to the person's own message: never pushed (no LINE quota).

export type UpgradeReason = 'out' | 'low' | 'menu' | 'weekly';
/** The card under an answer (low tokens or the weekly one) comes at most this often per account. */
export const UPGRADE_EVERY_MS = 7 * 86_400_000;

const ALT: Record<UpgradeReason, string> = {
  out: 'โทเคนเลขาเดือนนี้หมดแล้ว',
  low: 'โทเคนเลขาใกล้หมดแล้ว',
  menu: 'แพ็กเกจ Free Plus และ Pro',
  weekly: 'ใช้เลขาได้มากขึ้นกับ Plus และ Pro',
};

const baht = (value: number) => `฿${value.toLocaleString('en-US')}`;
const asset = (path: string) => lineAppLink(path)?.uri;

// One card per plan, swiped side by side (owner, 2026-11-16, showing another LINE assistant's plan cards: "มีกราฟฟิกสวยมาก
// และมี UI ที่น่าสนใจมาก"). Our own look: the warm CI family only, flat colours, the official mascot poses (never redrawn),
// every button CI orange. Pro leads on espresso with gold, Plus on peach, Free on cream.
type Look = { bg: string; ink: string; soft: string; line: string; box: string; boxInk: string; accent: string; pose: string };
const LOOKS: Record<'pro' | 'plus' | 'free', Look> = {
  pro: { bg: '#4E2A1C', ink: '#FFFFFF', soft: '#E8D9CF', line: '#6B4535', box: '#5E3727', boxInk: '#FFD166', accent: '#FFD166', pose: 'guide' },
  plus: { bg: '#FFF1E8', ink: '#1C1917', soft: '#6B6560', line: '#F3D3BF', box: '#FFFFFF', boxInk: '#C24A16', accent: '#C24A16', pose: 'working' },
  free: { bg: '#FBF7F2', ink: '#1C1917', soft: '#6B6560', line: '#ECE3DB', box: '#FFFFFF', boxInk: '#8A3315', accent: '#8A3315', pose: 'review' },
};

function planBubble(opts: {
  look: Look; kicker: string; name: string; badge?: string; highlight: string; detail: string;
  rows: [string, string][]; price: string; was?: string; per?: string; note: string; button: { label: string; path: string };
}) {
  const { look } = opts;
  const mascot = asset(`/line/mascot-v6-${look.pose}.png`);
  const link = lineAppLink(opts.button.path, opts.button.label);
  return {
    type: 'bubble', size: 'kilo',
    body: {
      type: 'box', layout: 'vertical', backgroundColor: look.bg, paddingAll: '18px', spacing: 'none',
      contents: [
        { type: 'box', layout: 'horizontal', alignItems: 'center', contents: [
          { type: 'box', layout: 'vertical', flex: 1, spacing: 'xs', contents: [
            ...(opts.badge ? [{ type: 'box', layout: 'horizontal', contents: [
              { type: 'box', layout: 'vertical', flex: 0, cornerRadius: '999px', backgroundColor: look.accent, paddingStart: '9px', paddingEnd: '9px', paddingTop: '2px', paddingBottom: '2px',
                contents: [{ type: 'text', text: opts.badge, size: 'xxs', weight: 'bold', color: look === LOOKS.pro ? '#4E2A1C' : '#FFFFFF', wrap: false }] },
            ] }] : []),
            { type: 'text', text: opts.kicker, size: 'xxs', weight: 'bold', color: look.accent, wrap: true },
            { type: 'text', text: opts.name, size: '3xl', weight: 'bold', color: look.ink, wrap: false },
          ] },
          ...(mascot ? [{ type: 'image', url: mascot, size: '88px', aspectRatio: '1:1', aspectMode: 'fit', flex: 0 }] : []),
        ] },
        { type: 'box', layout: 'vertical', margin: 'md', paddingAll: '10px', cornerRadius: '12px', backgroundColor: look.box, spacing: 'xs', contents: [
          { type: 'text', text: opts.highlight, size: 'sm', weight: 'bold', color: look.boxInk, wrap: true },
          { type: 'text', text: opts.detail, size: 'xxs', color: look === LOOKS.pro ? '#E8D9CF' : C.muted, wrap: true },
        ] },
        { type: 'box', layout: 'vertical', margin: 'md', contents: opts.rows.flatMap(([label, value], index) => [
          ...(index ? [{ type: 'separator', color: look.line }] : []),
          { type: 'box', layout: 'horizontal', paddingTop: '7px', paddingBottom: '7px', contents: [
            { type: 'text', text: label, size: 'xs', color: look.soft, flex: 5, wrap: true },
            { type: 'text', text: value, size: 'xs', weight: 'bold', color: look.ink, flex: 4, align: 'end', wrap: true },
          ] },
        ]) },
        { type: 'box', layout: 'baseline', margin: 'lg', spacing: 'sm', contents: [
          ...(opts.was ? [{ type: 'text', text: opts.was, size: 'sm', color: look.soft, decoration: 'line-through', flex: 0 }] : []),
          { type: 'text', text: opts.price, size: '3xl', weight: 'bold', color: look.ink, flex: 0 },
          ...(opts.per ? [{ type: 'text', text: opts.per, size: 'sm', color: look.soft, flex: 0 }] : []),
        ] },
        { type: 'text', text: opts.note, size: 'xxs', color: look.soft, wrap: true, margin: 'xs' },
        ...(link ? [{ type: 'button', style: 'primary', height: 'sm', margin: 'lg', color: C.accent, action: { type: 'uri', ...link } }] : []),
      ],
    },
  };
}

/** Free, Plus and Pro as cards side by side (Pro first), the prices of the moment, a button each into the plans page. */
export function buildLineUpgradeCard(reason: UpgradeReason, now: Date = new Date()): LineMessage {
  const pro = proPriceDetails('month', now);
  const plus = PLAN_LIMITS.plus;
  const fee = 'ราคายังไม่รวมค่าธรรมเนียมชำระเงิน แสดงยอดก่อนกดจ่าย';
  const freeTokens = freeMonthlyTokens();
  const bubbles = [
    planBubble({ look: LOOKS.pro, badge: 'แนะนำ', kicker: 'สำหรับคนทำงานเต็มตัว', name: 'Pro',
      highlight: 'ใช้ได้ครบทุกอย่าง ไม่จำกัด', detail: 'สรุปรายเดือน ติดตามใบ 50 ทวิ เตือนช่วงยื่นภาษี รายงาน และหน้าภาษี',
      rows: [['โทเคนเลขาต่อเดือน', PLAN_LIMITS.pro.tokens!.toLocaleString('en-US')], ['เอกสารใหม่', 'ไม่จำกัด'], ['เก็บไฟล์', 'ไม่จำกัด'], ['แจ้งเตือน 08:00', 'ทุกแบบ']],
      price: baht(pro.price), ...(pro.saving > 0 ? { was: baht(pro.regular) } : {}), per: '/เดือน', note: fee,
      button: { label: `สมัคร Pro ${baht(pro.price)}`, path: '/plans?tier=pro' } }),
    planBubble({ look: LOOKS.plus, kicker: 'สำหรับคนที่ใช้เลขาทุกวัน', name: 'Plus',
      highlight: 'เตือนวันส่งงานและวันรับเงินทุกเช้า', detail: 'ทาง LINE และอีเมล เอกสารไม่มีข้อความเครดิตของแอป',
      rows: [['โทเคนเลขาต่อเดือน', plus.tokens!.toLocaleString('en-US')], ['เอกสารใหม่', `${plus.documentsPerMonth} ฉบับ/เดือน`], ['เก็บไฟล์', `${plus.vaultFiles} ไฟล์`], ['แจ้งเตือน 08:00', 'ส่งงานและรับเงิน']],
      price: baht(PLUS_PRICE.price), per: '/เดือน', note: fee,
      button: { label: `สมัคร Plus ${baht(PLUS_PRICE.price)}`, path: '/plans?tier=plus' } }),
    planBubble({ look: LOOKS.free, kicker: 'สำหรับเริ่มต้นใช้งาน', name: 'Free',
      highlight: 'เริ่มใช้ฟรี ไม่ต้องผูกบัตร', detail: 'คุยกับเลขาได้ทั้งในแอปและ LINE โทเคนเติมใหม่ทุกวันที่ 1',
      rows: [['โทเคนเลขาต่อเดือน', freeTokens > 0 ? freeTokens.toLocaleString('en-US') : '—'], ['เอกสารใหม่', `${PLAN_LIMITS.free.documentsPerMonth} ฉบับ/เดือน`], ['เก็บไฟล์', `${PLAN_LIMITS.free.vaultFiles} ไฟล์`], ['แจ้งเตือน 08:00', '—']],
      price: 'ฟรี', note: 'ใช้ได้เลย ไม่มีค่าใช้จ่าย',
      button: { label: 'ดูแพ็กเกจทั้งหมด', path: '/plans' } }),
  ];
  return {
    type: 'flex',
    altText: `${ALT[reason]} · สมัคร Plus ${baht(PLUS_PRICE.price)} หรือ Pro ${baht(pro.price)} ต่อเดือน`,
    contents: { type: 'carousel', contents: bubbles },
  } as LineMessage;
}

/** Whether the card under an answer may come again for this account. A read error counts as no (never every message). */
export async function upgradeCardDue(userId: string, now: Date = new Date()): Promise<boolean> {
  try {
    const { data, error } = await getSupabaseAdmin().from('cashflow_private_state').select('at:data->lineUpgradeShownAt').eq('user_id', userId).maybeSingle();
    if (error) return false;
    const at = Date.parse(String((data as { at?: unknown } | null)?.at ?? ''));
    return !Number.isFinite(at) || now.getTime() - at >= UPGRADE_EVERY_MS;
  } catch { return false; }
}

/** Keeps when the card was last shown under an answer (best effort: a failure only means it may come once more). */
export async function markUpgradeCardShown(userId: string, now: Date = new Date()): Promise<void> {
  try { await patchPrivate(userId, { lineUpgradeShownAt: now.toISOString() }); } catch { /* shown once more at worst */ }
}
