// A spelling list for dictation (owner, 2026-10-26: "ทำให้มันแม่นยำ"): the names this account already uses, so a spoken
// client, job or document line comes out spelled the way the account writes it. Only short labels from the account's
// own records are used: its business name, client names and contacts, job names and types, document line items and
// expense names, plus common Thai bookkeeping words. The list is data for spelling, never instructions, and it is
// neither stored nor logged. The chat already sends these records to the same provider.

/** Words people say about their money and paperwork, spelled the usual way. */
export const BOOKKEEPING_TERMS = [
  'มัดจำ', 'ใบเสนอราคา', 'ใบแจ้งหนี้', 'ใบวางบิล', 'ใบเสร็จรับเงิน', 'ใบกำกับภาษี', 'หัก ณ ที่จ่าย', '50 ทวิ', 'ภ.ง.ด.3', 'ภ.ง.ด.53',
  'ภาษีมูลค่าเพิ่ม', 'VAT', 'เครดิตเทอม', 'ค้างรับ', 'ค้างชำระ', 'ผ่อนชำระ', 'งวด', 'พร้อมเพย์', 'โอนเงิน', 'ใบหัก ณ ที่จ่าย',
  'กสิกรไทย', 'ไทยพาณิชย์', 'กรุงเทพ', 'กรุงไทย', 'กรุงศรี', 'ttb', 'ออมสิน',
  'TikTok', 'Instagram', 'Facebook', 'YouTube', 'LINE', 'Shopee', 'Lazada',
];

export const VOCABULARY_MAX_TERMS = 100;
/** The account's list never grows past this many characters, so the request stays small and its cost bounded. The
 *  bookkeeping words are sent as well, always, on their own list. */
export const VOCABULARY_MAX_CHARS = 2000;
const TERM_MAX_CHARS = 48;

type AnyRecord = Record<string, unknown>;
const records = (value: unknown): AnyRecord[] => (Array.isArray(value) ? value.filter((item): item is AnyRecord => Boolean(item) && typeof item === 'object') : []);
const text = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  // Quotes, brackets, angle brackets and control characters are dropped, so a label can never close the list early.
  const clean = value.normalize('NFC').replace(/[\u0000-\u001f\u007f"'`\\<>{}[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  if (clean.length < 2 || clean.length > TERM_MAX_CHARS || !/\p{L}/u.test(clean)) return null;
  return clean;
};
const when = (job: AnyRecord) => String(job.startDate || job.postDate || job.payDate || job.dueDate || '');

/** The account's own names (clients, then jobs, documents and expenses), most used and most recent first. Words already
 *  on the bookkeeping list are left out. */
export function voiceVocabulary(account: unknown): string[] {
  const a = (account && typeof account === 'object' ? account : {}) as AnyRecord;
  const jobs = records(a.jobs).sort((x, y) => when(y).localeCompare(when(x)));
  const invoices = records(a.invoices);
  const issuer = (a.issuer_profile && typeof a.issuer_profile === 'object' ? a.issuer_profile : {}) as AnyRecord;

  // Clients by how often they appear, then by their latest job.
  const clientCount = new Map<string, number>();
  const bump = (value: unknown) => { const name = text(value); if (name) clientCount.set(name, (clientCount.get(name) ?? 0) + 1); };
  for (const job of jobs) bump(job.client);
  for (const invoice of invoices) { const client = invoice.client as AnyRecord | undefined; bump(client?.name); bump(client?.contactName); }
  const clients = [...clientCount.entries()].sort((x, y) => y[1] - x[1]).map(([name]) => name);

  const groups: unknown[][] = [
    [issuer.name],
    clients,
    jobs.map(job => job.name),
    Array.isArray(a.job_types) ? a.job_types : [],
    jobs.map(job => job.type),
    invoices.flatMap(invoice => records(invoice.items).map(item => item.description)),
    records(a.expenses).map(expense => expense.name),
  ];
  const out: string[] = [];
  const seen = new Set<string>(BOOKKEEPING_TERMS.map(term => term.toLowerCase()));
  let chars = 0;
  for (const group of groups) for (const value of group) {
    const term = text(value);
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    if (out.length >= VOCABULARY_MAX_TERMS || chars + term.length + 3 > VOCABULARY_MAX_CHARS) return out;
    seen.add(key); out.push(term); chars += term.length + 3;
  }
  return out;
}
