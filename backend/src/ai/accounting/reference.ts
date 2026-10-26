import { ACCOUNTING_KNOWLEDGE, type AccountingTopic, type KnowledgeEntry } from './knowledge.js';
import { turnTopics } from './intent.js';
import { sourceLine } from './sources.js';

// The ACCOUNTING REFERENCE block (brief section 6): for an accounting or tax message only, a short guide plus the one
// or two knowledge entries that fit, placed in its own slot beside FOUNDER (prompt.ts). Every other message gets
// nothing, so the existing prompt, routing and token use stay as they were.

/** Who gets it: 'off', admins only while it is checked ('admin', the default), or every account that has เลขา ('all'). */
export type AccountingMode = 'off' | 'admin' | 'all';

export function accountingEnabled(mode: AccountingMode | undefined, plan: string | undefined): boolean {
  const resolved = mode ?? 'admin';
  if (resolved === 'off') return false;
  if (resolved === 'all') return true;
  return plan === 'admin';
}

const MAX_ENTRIES = 2;
const MAX_ENTRY_CHARS = 1_400;

export const ACCOUNTING_GUIDE = [
  'HOW TO USE (accounting and Thai tax; general information, not a ruling):',
  '- Explain simply in the user\'s own tone and teach only as much as they asked. Keep money received, money owed, money expected and money to pay apart; never add them into one figure.',
  '- Every tax, price, margin, forecast or check figure comes from a tool: tax_estimate, business_calc, cash_forecast, accounting_check; account amounts from financial_summary, receivables, cash_position. Never calculate in your head and never invent an amount.',
  '- Money expected later (next week, next month) comes from cash_forecast or receivables; financial_summary only has money already received.',
  '- Steps for filing, a refund or registration: call official_link (efiling, refund_status, rd, vat_register, ...) in the same turn, so the user gets the official site.',
  '- Tax: name the tax year, say the figure is an estimate from what the user said and saved, and give its assumptions. Ask only what is missing (income type under section 40, single or married, allowances), with ask_user. Never say someone does not have to file because their income in the app is low: they may have other income. The Revenue Department (1161) or an accountant makes the final call.',
  '- Show official sites with official_link. Never ask for, accept or repeat passwords, OTPs, the laser number on an ID card or bank PINs: the user types those only on the official site. You never file, pay or send data to the Revenue Department for the user.',
  '- Name the source in the answer (e.g. "คู่มือ ภ.ง.ด.90 ปีภาษี 2568 ของกรมสรรพากร"). Never name these tools to the user; say what you checked instead.',
].join('\n');

/** Official sites the chat shows by itself on a filing or refund question when the reply did not (rules, no model). */
export function autoOfficialLinks(topics: AccountingTopic[]): string[] {
  return [...(topics.includes('filing') ? ['efiling'] : []), ...(topics.includes('refund') ? ['refund_status'] : [])];
}

export interface AccountingSelection {
  topics: AccountingTopic[];
  entryIds: string[];
  text: string;
}

function score(entry: KnowledgeEntry, topics: AccountingTopic[], text: string): number {
  const shared = entry.topics.filter(topic => topics.includes(topic)).length;
  if (!shared) return 0;
  return shared + (entry.keywords.test(text) ? 2 : 0) + (entry.topics[0] === topics[0] ? 0.5 : 0);
}

function render(entry: KnowledgeEntry): string {
  const year = entry.taxYear === 'any' ? '' : `ปีภาษี ${entry.taxYear}; `;
  const body = entry.text.length > MAX_ENTRY_CHARS ? `${entry.text.slice(0, MAX_ENTRY_CHARS)}…` : entry.text;
  return `[${entry.title}] (${year}${sourceLine(entry.sources)}; ตรวจ ${entry.verified})\n${body}${entry.exceptions ? `\nข้อยกเว้น: ${entry.exceptions}` : ''}`;
}

export function selectAccountingReference(text: string, history: { role: string; text: string }[] = []): AccountingSelection | undefined {
  const topics = turnTopics(text, history);
  if (!topics.length) return undefined;
  const ranked = ACCOUNTING_KNOWLEDGE
    .map((entry, order) => ({ entry, order, value: score(entry, topics, text) }))
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value || a.order - b.order)
    .slice(0, MAX_ENTRIES)
    .map(item => item.entry);
  return {
    topics,
    entryIds: ranked.map(entry => entry.id),
    text: [ACCOUNTING_GUIDE, 'REFERENCE:', ...ranked.map(render)].join('\n\n'),
  };
}
