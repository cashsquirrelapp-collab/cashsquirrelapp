import type { Invoice } from '../../../shared/types.js';
import type { UserRow } from '../services/lineAssistant.js';
import type { ToolOutcome, ToolSpec } from './types.js';

// Work done before for the same client (owner-approved plan, package C, 2026-10-25): the account's own saved
// documents and jobs are the history, so work done without เลขา counts too and nothing new is stored. The result is
// a starting point for a new quotation, invoice or job (the client's saved details, the usual VAT, withholding and
// credit term, the usual line wording and unit, the last unit price as an option); amounts and payment status stay
// history, never the current figures.

export const PAST_WORK_TOOLS: ToolSpec[] = [
  { name: 'past_work', description: 'What this account did before for one client: the client\'s saved details (full name, address, tax ID, branch), the usual VAT, withholding and credit term, the usual lines (wording, unit, last unit price) and the latest documents and jobs. Call it before preparing a quotation, invoice or job for a client the account may have worked with. Past amounts are examples to offer, never current figures; payment status is not included.',
    parameters: { type: 'object', properties: { client: { type: 'string', description: 'The client name as the user said it; a short or partial name is fine' } }, required: ['client'] } },
];
export const isPastWorkTool = (name: string) => PAST_WORK_TOOLS.some(tool => tool.name === name);

const LEGAL = /(?:บริษัท|บจก\.?|จำกัด|\(มหาชน\)|มหาชน|หจก\.?|ห้างหุ้นส่วนจำกัด|ห้างหุ้นส่วน|co\.?,?\s*ltd\.?|company|limited|ltd\.?|inc\.?)/gi;
/** A client name reduced to its core: no legal words, spaces or punctuation, lower case. */
export const clientCore = (name: unknown) => String(name ?? '').toLowerCase().replace(LEGAL, '').replace(/[\s.,'"’()\-_/]+/g, '').trim();
/**
 * Which saved clients the asked name means (fixed 2026-10-25: "ร้านกาแฟตัวอย่าง" took the address and withholding of
 * "บริษัท ตัวอย่าง จำกัด", because each name was allowed to contain the other). The same core first; otherwise saved
 * names that contain what was asked (a short or partial name), and only when they are all one client. A longer, more
 * specific name never takes a shorter one's records, and two different clients are never merged.
 */
export function matchClients(asked: string, names: unknown[]): { cores: Set<string>; candidates: string[] } {
  const query = clientCore(asked);
  const byCore = new Map<string, string>();
  for (const name of names) { const core = clientCore(name); if (core.length >= 2 && !byCore.has(core)) byCore.set(core, String(name).trim()); }
  if (byCore.has(query)) return { cores: new Set([query]), candidates: [] };
  const partial = query.length >= 3 ? [...byCore.keys()].filter(core => core.includes(query)) : [];
  if (partial.length === 1) return { cores: new Set(partial), candidates: [] };
  return { cores: new Set(), candidates: partial.map(core => byCore.get(core)!).slice(0, 5) };
}

type Job = { name?: string; client?: string; value?: number; whtRate?: number; creditTerm?: number; type?: string; postDate?: string; payDate?: string; createdAt?: string };
const mostCommon = <T,>(values: T[]): T | null => {
  const counts = new Map<string, { value: T; count: number }>();
  for (const value of values) { const key = JSON.stringify(value); const seen = counts.get(key); counts.set(key, { value, count: (seen?.count ?? 0) + 1 }); }
  return [...counts.values()].sort((a, b) => b.count - a.count)[0]?.value ?? null;
};

export function executePastWork(args: Record<string, unknown>, user: UserRow): ToolOutcome {
  const asked = String(args.client ?? '').trim().slice(0, 120);
  const query = clientCore(asked);
  if (query.length < 2) return { result: { ok: false, error: 'ระบุชื่อลูกค้าอย่างน้อย 2 ตัวอักษร' } };
  const allDocuments = (user as UserRow & { invoices?: Invoice[] }).invoices ?? [];
  const allJobs = (user.jobs ?? []) as Job[];
  const matched = matchClients(asked, [...allDocuments.map(doc => doc.client?.name), ...allJobs.map(job => job.client)]);
  if (matched.candidates.length > 1) {
    return { result: { ok: true, client: asked, found: false, several_clients: matched.candidates,
      note: 'Several different clients match this name: ask which one (ask_user with these names as options), and offer no past values until the user picks.' } };
  }
  const documents = allDocuments.filter(doc => matched.cores.has(clientCore(doc.client?.name)))
    .sort((a, b) => String(b.createdDate).localeCompare(String(a.createdDate)));
  const jobs = allJobs.filter(job => matched.cores.has(clientCore(job.client)))
    .sort((a, b) => String(b.postDate || b.payDate || b.createdAt || '').localeCompare(String(a.postDate || a.payDate || a.createdAt || '')));
  if (!documents.length && !jobs.length) {
    return { result: { ok: true, client: asked, found: false, note: 'No earlier work for this client in the account: ask for what is missing, and offer no past values.' } };
  }
  const names = [...new Set([...documents.map(doc => doc.client?.name), ...jobs.map(job => job.client)].filter((name): name is string => Boolean(name && name.trim())))];
  const latest = documents[0]?.client;
  // The usual lines: by wording, how often, the unit and the latest unit price (documents are newest first).
  const lines = new Map<string, { description: string; unit: string | null; last_unit_price: number; times: number }>();
  for (const doc of documents) for (const item of doc.items ?? []) {
    const key = String(item.description ?? '').trim();
    if (!key) continue;
    const seen = lines.get(key);
    if (seen) seen.times += 1;
    else lines.set(key, { description: key.slice(0, 120), unit: item.unit?.trim() || null, last_unit_price: Number(item.price) || 0, times: 1 });
  }
  return { result: {
    ok: true, client: asked, found: true,
    names_in_records: names.slice(0, 5),
    client_details: latest ? { name: latest.name, address: latest.address || null, tax_id: latest.taxId || null, branch: latest.branch || null, contact_name: latest.contactName || null, phone: latest.phone || null } : null,
    usual: {
      vat_rate: documents.length ? mostCommon(documents.map(doc => Number(doc.vatRate) || 0)) : null,
      withholding_rate: mostCommon([...documents.map(doc => Number(doc.whtRate) || 0), ...jobs.map(job => Number(job.whtRate) || 0)]),
      credit_term_days: jobs.length ? mostCommon(jobs.map(job => Number(job.creditTerm) || 0)) : null,
      payment_term: mostCommon(documents.map(doc => doc.paymentTerm?.trim()).filter((term): term is string => Boolean(term))),
      lines: [...lines.values()].sort((a, b) => b.times - a.times).slice(0, 5),
    },
    recent_documents: documents.slice(0, 3).map(doc => ({ type: doc.documentType, number: doc.documentNo, date: doc.createdDate, vat_rate: doc.vatRate, withholding_rate: doc.whtRate,
      lines: (doc.items ?? []).slice(0, 5).map(item => ({ description: item.description, quantity: item.quantity, unit: item.unit || null, unit_price: item.price })) })),
    recent_jobs: jobs.slice(0, 3).map(job => ({ name: job.name, type: job.type || null, date: job.postDate || job.payDate || null, value: job.value ?? null, withholding_rate: job.whtRate ?? 0, credit_term_days: job.creditTerm ?? 0 })),
    counts: { documents: documents.length, jobs: jobs.length },
    note: 'History, not current figures: use the client details and the usual rates and wording as the starting point and say they come from past work; offer a past unit price as an option, never as a fact. Payment status is not part of this; current amounts come from the records tools.',
  } };
}
