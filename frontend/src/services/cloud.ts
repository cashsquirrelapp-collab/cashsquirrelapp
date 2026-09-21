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
const baselines = new Map<string, Baseline>();
const queues = new Map<string, Promise<unknown>>();
const reads = new Map<string, number>();
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
  const baseline: Baseline = {};
  if (reads.get(userId) !== request)
    throw Object.assign(new Error("ข้อมูลถูกโหลดใหม่แล้ว"), { status: 409 });
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
  baselines.set(userId, baseline);
  return result;
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
  const save = previous
    .catch(() => {})
    .then(async () => {
      assertFinanceWorkspace(userId, epoch);
      const baseline = baselines.get(userId);
      if (!baseline) throw new Error("กรุณารอให้ข้อมูลโหลดเสร็จก่อนบันทึก");
      if (baseline !== generation)
        throw Object.assign(
          new Error("ข้อมูลถูกโหลดใหม่ กรุณาตรวจสอบก่อนบันทึก"),
          { status: 409 },
        );
      if (immutable.notif_settings) {
        const prefs = notificationPreferences.parse(immutable.notif_settings);
        const existing =
          baseline.cashflow_documents?.notif_settings?.data || {};
        if (notificationMode === "patch")
          immutable.notif_settings = { ...existing, ...prefs };
        else if (notificationMode === "autosave") {
          const { dailyDigestEnabled, monthlyReportEnabled, ...rest } = prefs;
          immutable.notif_settings = { ...existing, ...rest };
        } else immutable.notif_settings = prefs;
      }
      const changes = diffSnapshot(baseline, immutable);
      if (!changes.length) return;
      await apiJson("/api/data", {
        method: "POST",
        headers: financeHeaders(userId),
        body: JSON.stringify({ changes }),
      });
      assertFinanceWorkspace(userId, epoch);
      if (baselines.get(userId) === baseline) commitChanges(baseline, changes);
    });
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
  if (!baseline) throw new Error("กรุณารอให้ข้อมูลบัญชีโหลดเสร็จ");
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
  return result.snapshot;
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
    if (!baseline) throw new Error("ยังไม่มีข้อมูลบัญชีให้สำรอง");
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
