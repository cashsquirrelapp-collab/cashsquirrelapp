import { apiJson } from "./api";
import { privateCache } from "./privateCache";
import {
  diffSnapshot,
  commitChanges,
  type Baseline,
  fieldTables,
} from "../../../shared/changes";
import { notificationPreferences } from "../../../shared/validation";
import {
  assertFinanceWorkspace,
  financeHeaders,
  workspaceEpoch,
} from "./financeWorkspace";
import { tr } from '../i18n/tr';
/** A Free account's new documents this month (null for Pro and trial accounts). */
export interface DocumentQuota { used: number; limit: number; month: string }
const baselines = new Map<string, Baseline>();
const queues = new Map<string, Promise<unknown>>();
const reads = new Map<string, number>();
// Saves asked for, and saves still on their way, per account: a refresh never lands over either.
const saveCalls = new Map<string, number>();
const saving = new Map<string, number>();
function activeAccount(userId: string) {
  assertFinanceWorkspace(userId);
}
export async function readCloud(userId: string) {
  const epoch = workspaceEpoch();
  activeAccount(userId);
  const request = (reads.get(userId) || 0) + 1;
  reads.set(userId, request);
  const result = await apiJson<any>("/api/data?includeInvoices=0", {
    headers: financeHeaders(userId),
  });
  assertFinanceWorkspace(userId, epoch);
  if (reads.get(userId) !== request)
    throw Object.assign(new Error(tr("ข้อมูลถูกโหลดใหม่แล้ว")), { status: 409 });
  baselines.set(userId, baselineOf(result));
  return result;
}
/** What the server holds, with each record's version, as the next save compares against it. */
function baselineOf(result: any): Baseline {
  const baseline: Baseline = {};
  for (const [field, table] of Object.entries(fieldTables))
    baseline[table] = Object.fromEntries(
      (result.snapshot[field] || []).map((row: any) => [
        row.id,
        { data: row, version: result.versions[table][row.id] },
      ]),
    );
  baseline.cashflow_documents = {};
  for (const [id, version] of Object.entries(
    result.versions.cashflow_documents,
  ))
    baseline.cashflow_documents[id] = {
      data:
        id === "notif_settings"
          ? notificationPreferences.parse(result.snapshot[id])
          : result.snapshot[id],
      version: version as number,
    };
  return baseline;
}
const sameVersions = (a: Baseline, b: Baseline) => {
  const tables = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const table of tables) {
    const left = a[table as keyof Baseline] || {}, right = b[table as keyof Baseline] || {};
    const ids = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const id of ids) if (left[id]?.version !== right[id]?.version) return false;
  }
  return true;
};
/** The app's own records as a save sends them (the notification settings keep their own rules and are left out). */
export type CloudState = { jobs: unknown[]; expenses: unknown[]; goals: unknown[]; settings: unknown; statuses: unknown; job_types: unknown };
/**
 * The account's data as it is now on the server, when another device changed it (owner, 2026-11-16: "กูลบในคอมไปแล้ว
 * ใน iPad ไม่หาย ... ให้มันขึ้นแบบเรียลไทม์"). 'same' when nothing changed; 'busy' when this device has something of its own
 * not yet saved or on its way: its own save goes first and the caller tries again shortly. `current` reads this device's
 * records at the moment, so an edit made while the request was out is never overwritten.
 */
export async function refreshCloud(userId: string, current: () => CloudState): Promise<{ result: any } | 'busy' | 'same'> {
  const epoch = workspaceEpoch();
  const baseline = baselines.get(userId);
  if (!baseline) return 'busy';
  const calls = saveCalls.get(userId) || 0;
  const quiet = () => baselines.get(userId) === baseline && (saveCalls.get(userId) || 0) === calls && !(saving.get(userId) || 0)
    && !diffSnapshot(baseline, current() as unknown as Record<string, any>).length;
  if (!quiet()) return 'busy';
  const result = await apiJson<any>("/api/data?includeInvoices=0", { headers: financeHeaders(userId) });
  assertFinanceWorkspace(userId, epoch);
  if (!quiet()) return 'busy';
  const next = baselineOf(result);
  if (sameVersions(baseline, next)) return 'same';
  baselines.set(userId, next);
  reads.set(userId, (reads.get(userId) || 0) + 1);
  return { result };
}
export function clearCloud(userId?: string) {
  if (userId) baselines.delete(userId);
  else baselines.clear();
}
export function saveCloud(
  userId: string,
  payload: Record<string, any>,
  notificationMode: "replace" | "patch" | "autosave" = "replace",
) {
  const epoch = workspaceEpoch();
  const generation = baselines.get(userId);
  const immutable = structuredClone(payload);
  const previous = queues.get(userId) || Promise.resolve();
  saveCalls.set(userId, (saveCalls.get(userId) || 0) + 1);
  saving.set(userId, (saving.get(userId) || 0) + 1);
  const save = previous
    .catch(() => {})
    .then(async () => {
      assertFinanceWorkspace(userId, epoch);
      const baseline = baselines.get(userId);
      if (!baseline) throw new Error(tr("กรุณารอให้ข้อมูลโหลดเสร็จก่อนบันทึก"));
      if (baseline !== generation)
        throw Object.assign(
          new Error(tr("ข้อมูลถูกโหลดใหม่ กรุณาตรวจสอบก่อนบันทึก")),
          { status: 409 },
        );
      if (immutable.notif_settings) {
        const prefs = notificationPreferences.parse(immutable.notif_settings);
        const existing =
          baseline.cashflow_documents?.notif_settings?.data || {};
        if (notificationMode === "patch")
          immutable.notif_settings = { ...existing, ...prefs };
        else if (notificationMode === "autosave") {
          const { dailyDigestEnabled, monthlyReportEnabled, wht50ReminderEnabled, deliveryReminderEnabled, ...rest } = prefs;
          immutable.notif_settings = { ...existing, ...rest };
        } else immutable.notif_settings = prefs;
      }
      const changes = diffSnapshot(baseline, immutable);
      if (!changes.length) return undefined;
      // The reply may carry a Free account's updated document quota.
      const reply = await apiJson<{ document_quota?: DocumentQuota | null }>("/api/data", {
        method: "POST",
        headers: financeHeaders(userId),
        body: JSON.stringify({ changes }),
      });
      assertFinanceWorkspace(userId, epoch);
      if (baselines.get(userId) === baseline) commitChanges(baseline, changes);
      return reply;
    })
    .finally(() => { saving.set(userId, Math.max(0, (saving.get(userId) || 0) - 1)); });
  queues.set(userId, save);
  return save;
}
export function saveNotificationPatch(
  userId: string,
  patch: Record<string, unknown>,
) {
  return saveCloud(userId, { notif_settings: patch }, "patch");
}
export function saveAppCloud(userId: string, payload: Record<string, any>) {
  return saveCloud(
    userId,
    {
      jobs: payload.jobs,
      expenses: payload.expenses,
      goals: payload.goals,
      settings: payload.settings,
      statuses: payload.statuses,
      job_types: payload.jobTypes,
      notif_settings: payload.notifSettings,
    },
    "autosave",
  );
}
export async function readInvoices(userId: string) {
  const epoch = workspaceEpoch();
  activeAccount(userId);
  await queues.get(userId)?.catch(() => {});
  const result = await apiJson<any>("/api/data", {
    headers: financeHeaders(userId),
  });
  assertFinanceWorkspace(userId, epoch);
  const baseline = baselines.get(userId);
  if (!baseline) throw new Error(tr("กรุณารอให้ข้อมูลบัญชีโหลดเสร็จ"));
  baseline.cashflow_invoices = Object.fromEntries(
    (result.snapshot.invoices || []).map((row: any) => [
      row.id,
      { data: row, version: result.versions.cashflow_invoices[row.id] },
    ]),
  );
  const version = result.versions.cashflow_documents.issuer_profile;
  if (version)
    baseline.cashflow_documents.issuer_profile = {
      data: result.snapshot.issuer_profile,
      version,
    };
  return { ...result.snapshot, documentQuota: (result.document_quota ?? null) as DocumentQuota | null };
}
export async function exportCloud(userId: string) {
  const epoch = workspaceEpoch();
  activeAccount(userId);
  await queues.get(userId)?.catch(() => {});
  const baseline = baselines.get(userId);
  let snapshot: any;
  try {
    snapshot = (
      await apiJson<any>("/api/data", { headers: financeHeaders(userId) })
    ).snapshot;
  } catch {
    if (!baseline) throw new Error(tr("ยังไม่มีข้อมูลบัญชีให้สำรอง"));
    snapshot = {
      invoices: Object.values(baseline.cashflow_invoices || {}).map(
        (row) => row.data,
      ),
      issuer_profile: baseline.cashflow_documents?.issuer_profile?.data || null,
    };
  }
  assertFinanceWorkspace(userId, epoch);
  const localInvoices = privateCache.getItem(`cashflow_invoices_${userId}`);
  const localIssuer = privateCache.getItem(`cashflow_issuer_${userId}`);
  if (localInvoices) snapshot.invoices = JSON.parse(localInvoices);
  if (localIssuer) snapshot.issuer_profile = JSON.parse(localIssuer);
  return snapshot;
}
export async function flushCloud(key: string) {
  await queues.get(key);
  activeAccount(key);
}
