import type { Route } from '@playwright/test';

// A pretend /api/data that remembers what is saved, the way the real one does: each saved record's version goes up and the
// next read returns it. The sheet's reading checks the device is up to date with the server first (App.tsx sheetFresh,
// 2026-11-24); a pretend server that forgot every save would look like another device changing things all the time.
const FIELD_TABLE: Record<string, string> = { jobs: 'cashflow_jobs', expenses: 'cashflow_expenses', goals: 'cashflow_goals', invoices: 'cashflow_invoices' };

export function fakeDataServer(snapshot: Record<string, any>, versions: Record<string, Record<string, number>>, extra: Record<string, unknown> = {}) {
  const data: Record<string, any> = structuredClone(snapshot);
  const vers: Record<string, Record<string, number>> = structuredClone(versions);
  for (const [field, table] of Object.entries(FIELD_TABLE)) {
    vers[table] ??= {};
    for (const row of data[field] || []) vers[table][row.id] ??= 1;
  }
  vers.cashflow_documents ??= {};
  const posts: any[] = [];
  const apply = (changes: any[]) => {
    for (const change of changes) {
      const field = Object.keys(FIELD_TABLE).find(key => FIELD_TABLE[key] === change.table);
      const table = (vers[change.table] ??= {});
      if (field) {
        const rows: any[] = data[field] ?? (data[field] = []);
        const index = rows.findIndex(row => row.id === change.id);
        if (change.op === 'delete') { if (index >= 0) rows.splice(index, 1); delete table[change.id]; continue; }
        if (index >= 0) rows[index] = change.data; else rows.push(change.data);
      } else if (change.op === 'delete') { delete data[change.id]; delete table[change.id]; continue; }
      else data[change.id] = change.data;
      table[change.id] = (change.version ?? 0) + 1;
    }
  };
  return {
    posts,
    snapshot: data,
    async handle(route: Route) {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        posts.push(body);
        apply(body.changes || []);
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({ json: { snapshot: data, versions: vers, ...extra } });
    },
  };
}
