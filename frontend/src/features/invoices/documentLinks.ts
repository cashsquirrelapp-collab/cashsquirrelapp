import type { DocumentType, Invoice } from '../../../../shared/types';

// Linked documents (owner, 2026-10-20): a quotation, invoice and receipt for the same work are
// filled once. "ออกต่อเป็น…" copies a document into a new one of another type; the user chooses
// whether the new one stays linked (its `linkedFromId` points at the source and the source's number
// becomes its reference) or is only a copy. Saved client details can be reused on any new document.

type Client = Invoice['client'];

/** The documents linked to `id`, oldest ancestor first, then every document issued from them. */
export function documentChain(invoices: readonly Invoice[], id: string): Invoice[] {
  const byId = new Map(invoices.map(inv => [inv.id, inv]));
  let root = byId.get(id);
  if (!root) return [];
  const seen = new Set<string>([root.id]);
  while (root.linkedFromId && byId.has(root.linkedFromId) && !seen.has(root.linkedFromId)) {
    root = byId.get(root.linkedFromId)!;
    seen.add(root.id);
  }
  const chain: Invoice[] = [];
  const visited = new Set<string>();
  const walk = (doc: Invoice) => {
    if (visited.has(doc.id)) return;
    visited.add(doc.id);
    chain.push(doc);
    invoices
      .filter(child => child.linkedFromId === doc.id)
      .sort((a, b) => (a.createdDate || '').localeCompare(b.createdDate || ''))
      .forEach(walk);
  };
  walk(root);
  return chain.length > 1 ? chain : [];
}

/** What a new document of `targetType` starts with when it is issued from `source`. */
export function draftFromSource(source: Invoice, targetType: DocumentType, today: string) {
  return {
    documentType: targetType,
    client: { ...source.client },
    items: source.items.map((item, index) => ({ ...item, id: `${Date.now()}-${index}` })),
    vatRate: source.vatRate,
    whtRate: source.whtRate,
    note: source.note || '',
    paymentTerm: source.paymentTerm || '',
    deliveryTerm: source.deliveryTerm || '',
    createdDate: today,
    refNo: source.documentNo,
    linkedFromId: source.id,
  };
}

/** Clients from earlier documents, newest details per name, for filling a new document. */
export function savedClients(invoices: readonly Invoice[]): Client[] {
  const latest = new Map<string, { client: Client; date: string }>();
  for (const inv of invoices) {
    // Older imported documents may lack fields; they are skipped, never allowed to break the page.
    const name = (inv.client?.name || '').trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    const known = latest.get(key);
    const date = inv.createdDate || '';
    if (!known || date > known.date) latest.set(key, { client: { ...inv.client, name }, date });
  }
  return [...latest.values()].sort((a, b) => b.date.localeCompare(a.date)).map(entry => entry.client);
}

export function findSavedClient(clients: readonly Client[], name: string): Client | null {
  const key = name.trim().toLocaleLowerCase();
  return key ? clients.find(client => (client.name || '').toLocaleLowerCase() === key) ?? null : null;
}

/** True when the saved client has details the form does not show yet. */
export function clientHasMoreDetails(saved: Client, current: Client): boolean {
  return (['address', 'phone', 'email', 'taxId', 'contactName', 'code', 'branch'] as const)
    .some(field => Boolean(saved[field]) && (saved[field] || '') !== (current[field] || ''));
}
