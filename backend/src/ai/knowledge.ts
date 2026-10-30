import { KNOWLEDGE_BASE, launched, type AppFeature } from './knowledgeBase.js';

// Finds the app-knowledge entries a question is about, so the model gets a few relevant entries instead of the
// whole knowledge base. Plain text matching on names, keywords and descriptions; no model call.

// เลขา speaks only about areas open to everyone (owner, 2026-10-24: "ขอจำกัดความไว้แค่ฟีเจอร์ที่มันมีบนเว็บไซต์ของยูสเซอร์
// ธรรมดาที่ไม่ใช่แอดมินก่อน ... ใบทวิ50 ยังไม่มีนะเว้ย ... เอาเก็บไว้ก่อน"). An area joins the knowledge the day it is added to
// the launch policy (shared/featureAvailability.ts); until then a direct question only gets "not available yet".
interface Missing { ask: string; answer: string }
export const LIVE_FEATURES: readonly AppFeature[] = KNOWLEDGE_BASE.features.filter(feature => feature.status === 'live');
const HIDDEN_FEATURES: readonly AppFeature[] = KNOWLEDGE_BASE.features.filter(feature => feature.status !== 'live');
const NOT_LAUNCHED = 'ยังไม่เปิดให้ใช้งานในตอนนี้ ตอบสั้น ๆ ว่ายังไม่มีในแอปตอนนี้ ห้ามอธิบายวิธีใช้ ห้ามเดาหรือสัญญาว่าจะมีเมื่อไร และเสนอเมนู แจ้งปัญหา ถ้าอยากให้มี';

const norm = (text: string) => text.toLowerCase()
  .replace(/[๐-๙]/g, digit => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(digit)))
  .replace(/\s+/g, ' ').trim();

// ASCII words/IDs must not match substrings (e.g. "ai" in "paid" or "pro" in "profile").
function contains(query: string, term: string): boolean {
  const value = norm(term);
  if (!value) return false;
  if (/^[a-z0-9 _-]+$/.test(value)) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^a-z0-9_])' + escaped + '($|[^a-z0-9_])').test(query);
  }
  return query.includes(value);
}

function score(feature: AppFeature, query: string): number {
  let total = 0;
  if ([feature.id, feature.navigation].some(alias => contains(query, alias))) total += 30;
  if (contains(query, feature.name_th)) total += feature.name_th.length > 3 ? 6 : 1;
  if (contains(query, feature.name_en)) total += 6;
  for (const keyword of feature.keywords) if (contains(query, keyword)) total += keyword.length >= 4 ? 3 : 1;
  const annual = /ทั้งปี|รายปี|ประจำปี|annual|yearly|(?:ปี|พ\.?ศ\.?|ค\.?ศ\.?)\s*(?:20|25)\d{2}/.test(query);
  // A full year's income: the reports page once it is open to everyone, until then the export on the jobs page.
  if (feature.id === (launched('report') ? 'report' : 'jobs') && annual && /รายรับ|รายได้|รายงาน|ส่งออก|สรุป|income|report|export/.test(query)) total += 15;
  if (feature.id === 'tax' && /ปีภาษี|ภาษี|tax/.test(query)) total += 12;
  if (feature.id === 'wht50' && /50\s*ทวิ|wht50/.test(query)) total += 15;
  // "คลังเอกสาร" holds the word เอกสาร too; the vault comes before the documents page (open to all since 2026-10-31).
  if (feature.id === 'vault' && /คลังเอกสาร|คลังไฟล์|\bvault\b/.test(query)) total += 15;
  if (feature.id === 'import' && /นำเข้า|import/.test(query)) total += 12;
  return total;
}

export interface KnowledgeHit { features: AppFeature[]; missing: Missing[]; catalog?: boolean }

const ASCII = /^[a-z0-9 _-]+$/;
const LIVE_TERMS = LIVE_FEATURES.flatMap(feature => [feature.id, feature.navigation, feature.name_th, ...feature.keywords]).map(norm).filter(Boolean);
const LIVE_ASCII = new Set(LIVE_TERMS.filter(term => ASCII.test(term)));
// The admin overview is never a customer feature, so it is not even named as "not available yet".
const NAMED_HIDDEN = HIDDEN_FEATURES.filter(feature => feature.id !== 'adminDashboard');

/**
 * Hidden areas a question names, ignoring words that belong to an open area: ภาษี inside ใบกำกับภาษี is a
 * document, ส่งออก is the jobs page's export; คลังเอกสาร or 50 ทวิ still count.
 */
function hiddenNamed(query: string): AppFeature[] {
  const covered: [number, number][] = [];
  for (const term of LIVE_TERMS) {
    if (ASCII.test(term) || term.length < 3) continue;
    for (let at = query.indexOf(term); at >= 0; at = query.indexOf(term, at + 1)) covered.push([at, at + term.length]);
  }
  const counts = (raw: string) => {
    const term = norm(raw);
    if (!term) return false;
    if (ASCII.test(term)) return !LIVE_ASCII.has(term) && contains(query, term);
    if (term.length < 3) return false;
    for (let at = query.indexOf(term); at >= 0; at = query.indexOf(term, at + 1)) {
      if (!covered.some(([start, end]) => start <= at && at + term.length <= end)) return true;
    }
    return false;
  };
  return NAMED_HIDDEN.filter(feature => [feature.id, feature.navigation, feature.name_th, ...feature.keywords].some(counts));
}

export function lookupKnowledge(question: string, limit = 3): KnowledgeHit {
  const query = norm(question);
  const asksCapabilities = /ทำอะไรได้บ้าง|ช่วยอะไรได้บ้าง|ฟีเจอร์อะไรบ้าง|(?:แอป|เว็บ|ฟีเจอร์|ความสามารถ|เมนู).*มีอะไรบ้าง|what can (you|this app|krarok) do/.test(query);
  const focusedFeature = LIVE_FEATURES.some(entry => entry.id !== 'assistant' && (
    contains(query, entry.id) || contains(query, entry.navigation)
    || (entry.name_th.length > 2 && contains(query, entry.name_th))
  ));
  const catalog = /ทุกฟีเจอร์|ทุกฟีเจอ|ฟีเจอร์ทั้งหมด|เมนูทั้งหมด|ทุกเมนู|ความสามารถทั้งหมด|all features|all menus/.test(query)
    || (asksCapabilities && !focusedFeature);
  if (catalog) return { features: [...LIVE_FEATURES], missing: [], catalog: true };
  const features = LIVE_FEATURES
    .map(feature => ({ feature, points: score(feature, query) }))
    .filter(row => row.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, Math.max(1, Math.min(10, Number.isFinite(limit) ? Math.floor(limit) : 3)))
    .map(row => row.feature);
  const missing: Missing[] = KNOWLEDGE_BASE.not_available.filter(item =>
    item.keywords.some(keyword => contains(query, keyword)));
  for (const hidden of hiddenNamed(query)) missing.push({ ask: hidden.name_th, answer: NOT_LAUNCHED });
  return { features, missing };
}


/** Compact text for the system prompt: what the entry says, where it is, plan rights and its live status. */
export function knowledgeSnippets(hit: KnowledgeHit): string {
  const lines: string[] = hit.features.length ? [KNOWLEDGE_BASE.availability] : [];
  if (hit.catalog) lines.push('COMPLETE FEATURE CATALOG: give a compact overview of all these areas; expand steps only for the area the user asks about.');
  for (const feature of hit.features) {
    const status = 'เปิดให้ใช้งาน';
    const details = hit.catalog ? '' : [
      feature.availability ? ` เงื่อนไข: ${feature.availability}.` : '',
      ` วิธีใช้: ${feature.how_to.join(' / ')}.`,
      feature.limits?.length ? ` ข้อจำกัด: ${feature.limits.join(' / ')}.` : '',
    ].join('');
    lines.push(`- [${feature.id}] ${feature.name_th} (${feature.name_en}) | route: ${feature.route} | ${status}. ${feature.description}.${details}`);
  }
  for (const item of hit.missing) lines.push(`- [not_available] ${item.ask}: ${item.answer}`);
  if (!hit.features.length && hit.missing.length) lines.unshift(KNOWLEDGE_BASE.availability);
  if (!lines.length) lines.push('- (no entry matched; if the user asks about a feature, call feature_lookup, and never guess)');
  if (!hit.catalog && hit.features.some(feature => feature.id === 'plans')) {
    lines.push(`- Plans: ${KNOWLEDGE_BASE.plans.free} | Trial: ${KNOWLEDGE_BASE.plans.trial} | Pro: ${KNOWLEDGE_BASE.plans.pro}`);
  }
  return lines.join('\n');
}
