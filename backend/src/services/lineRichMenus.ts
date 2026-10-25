import { isPhaseOneFeatureAvailable } from '../../../shared/featureAvailability.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { systemRole } from '../repositories/roles.js';

// The menu under the LINE chat (owner, 2026-10-24: "ปุ่มแนบเอกสารใน Line ให้เห็นแค่ของบัญชีแอดมิน นอกนั้นไม่สามารถ
// เห็นได้"). Everyone gets the 5-tile menu without แนบเอกสาร as LINE's default. A LINE chat linked to a system admin
// gets the 6-tile menu attached to it, because แนบเอกสาร opens the document vault, which only admins have on the
// website. Once the vault opens to everyone (shared/featureAvailability.ts), the 6-tile menu becomes the default.
//
// The server publishes both menus itself, once per version and launch state: a claim through
// cashflow_claim_webhook keeps two Workers from publishing at the same time, and later runs find the menus again
// by name. It runs on the first LINE message after a release and every day at 09:00 Bangkok.

export const MENU_VERSION = '2026-10-24';
export type MenuKind = 'everyone' | 'admin';
const NAME: Record<MenuKind, string> = { everyone: `กระรอกตุนเงิน ทุกบัญชี ${MENU_VERSION}`, admin: `กระรอกตุนเงิน แอดมิน ${MENU_VERSION}` };
const IMAGE: Record<MenuKind, string> = { everyone: '/line/richmenu-everyone-2026-10-24.jpg', admin: '/line/secretary-richmenu.jpg' };
const BULK = 500;

const vaultOpenToAll = () => isPhaseOneFeatureAvailable('vault', false);

/** The menu LINE shows: the same tiles and actions as the image (2500x1686). */
export function menuPayload(kind: MenuKind, liffId: string) {
  const liff = (path: string) => `https://liff.line.me/${liffId}?openPath=${encodeURIComponent(path)}`;
  const top = [
    { bounds: { x: 0, y: 0, width: 1450, height: 1120 }, action: { type: 'uri', label: 'เพิ่มงาน', uri: liff('/jobs?openAddJob=1') } },
    { bounds: { x: 1450, y: 0, width: 1050, height: 560 }, action: { type: 'message', label: 'รอรับเงิน', text: 'รอรับเงิน' } },
    { bounds: { x: 1450, y: 560, width: 1050, height: 560 }, action: { type: 'message', label: 'สรุปเดือนนี้', text: 'สรุปเดือนนี้' } },
  ];
  const bottom = kind === 'admin' ? [
    { bounds: { x: 0, y: 1120, width: 833, height: 566 }, action: { type: 'uri', label: 'แนบเอกสาร', uri: liff('/line-documents') } },
    { bounds: { x: 833, y: 1120, width: 834, height: 566 }, action: { type: 'message', label: 'กำลังดำเนินงาน', text: 'กำลังดำเนินการ' } },
    { bounds: { x: 1667, y: 1120, width: 833, height: 566 }, action: { type: 'uri', label: 'เปิดแอป', uri: liff('/app') } },
  ] : [
    { bounds: { x: 0, y: 1120, width: 1250, height: 566 }, action: { type: 'message', label: 'กำลังดำเนินงาน', text: 'กำลังดำเนินการ' } },
    { bounds: { x: 1250, y: 1120, width: 1250, height: 566 }, action: { type: 'uri', label: 'เปิดแอป', uri: liff('/app') } },
  ];
  return { size: { width: 2500, height: 1686 }, selected: true, name: NAME[kind], chatBarText: 'เลขาการเงิน', areas: [...top, ...bottom] };
}

export type LineApi = (path: string, init?: RequestInit, dataHost?: boolean) => Promise<Response>;
export interface MenuStore {
  claim(key: string): Promise<string>;
  done(key: string): Promise<void>;
  linkedAccounts(): Promise<{ lineUserId: string; userId: string }[]>;
  adminIds(): Promise<Set<string>>;
  userIdForLine(lineUserId: string): Promise<string | null>;
  isAdmin(userId: string): Promise<boolean>;
}
export interface MenuDeps { api: LineApi; store: MenuStore; image: (path: string) => Promise<ArrayBuffer>; liffId: string }

async function ok(response: Response, what: string): Promise<Response> {
  if (!response.ok) throw new Error(`LINE ${what} failed (${response.status})`);
  return response;
}

async function findMenus(api: LineApi): Promise<Partial<Record<MenuKind, string>>> {
  const list = await (await ok(await api('richmenu/list'), 'menu list')).json() as { richmenus?: { richMenuId?: string; name?: string }[] };
  const found: Partial<Record<MenuKind, string>> = {};
  for (const kind of ['everyone', 'admin'] as const) found[kind] = list.richmenus?.find(menu => menu.name === NAME[kind])?.richMenuId;
  return found;
}

async function createMenu(deps: MenuDeps, kind: MenuKind): Promise<string> {
  const created = await (await ok(await deps.api('richmenu', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(menuPayload(kind, deps.liffId)),
  }), 'menu create')).json() as { richMenuId?: string };
  const id = created.richMenuId;
  if (!id) throw new Error('LINE menu create returned no id');
  try {
    const image = await deps.image(IMAGE[kind]);
    await ok(await deps.api(`richmenu/${id}/content`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: image }, true), 'menu image');
  } catch (error) {
    // A menu without its picture cannot be shown; remove it so the next run creates it again.
    await deps.api(`richmenu/${id}`, { method: 'DELETE' }).catch(() => undefined);
    throw error;
  }
  return id;
}

let known: { key: string; ids: Record<MenuKind, string> } | null = null;

/** Both menus, published if needed, with the right one as LINE's default. null while another Worker is publishing. */
export async function ensureLineMenus(deps: MenuDeps): Promise<Record<MenuKind, string> | null> {
  const key = `line-menu:${MENU_VERSION}:${vaultOpenToAll() ? 'all' : 'admins'}`;
  if (known?.key === key) return known.ids;
  const claim = await deps.store.claim(key);
  if (claim !== 'claimed' && claim !== 'done') return null;
  const found = await findMenus(deps.api);
  if (claim === 'done' && found.everyone && found.admin) {
    known = { key, ids: found as Record<MenuKind, string> };
    return known.ids;
  }
  for (const kind of ['everyone', 'admin'] as const) found[kind] ??= await createMenu(deps, kind);
  const ids = found as Record<MenuKind, string>;
  const wanted = ids[vaultOpenToAll() ? 'admin' : 'everyone'];
  const current = await deps.api('user/all/richmenu');
  const currentId = current.ok ? (await current.json() as { richMenuId?: string }).richMenuId : null;
  if (currentId !== wanted) await ok(await deps.api(`user/all/richmenu/${wanted}`, { method: 'POST' }), 'default menu');
  await deps.store.done(key);
  known = { key, ids };
  return ids;
}

const checked = new Set<string>();
/** Tests start from a fresh Worker. */
export function clearLineMenuCache(): void { known = null; checked.clear(); }
/** Forget what this Worker knows about a chat (it was just linked or disconnected). */
export const forgetLineMenu = (lineUserId: string) => { checked.delete(lineUserId); };

/** One chat: the admin menu when it is linked to a system admin, LINE's default otherwise. Once per Worker per chat. */
export async function syncLineMenuFor(lineUserId: string, deps: MenuDeps): Promise<void> {
  if (checked.has(lineUserId)) return;
  const ids = await ensureLineMenus(deps);
  if (!ids) return;
  if (!vaultOpenToAll()) {
    const userId = await deps.store.userIdForLine(lineUserId);
    const admin = userId ? await deps.store.isAdmin(userId) : false;
    const current = await deps.api(`user/${encodeURIComponent(lineUserId)}/richmenu`);
    const currentId = current.ok ? (await current.json() as { richMenuId?: string }).richMenuId : null;
    if (admin && currentId !== ids.admin) await ok(await deps.api(`user/${encodeURIComponent(lineUserId)}/richmenu/${ids.admin}`, { method: 'POST' }), 'admin menu link');
    if (!admin && currentId) await ok(await deps.api(`user/${encodeURIComponent(lineUserId)}/richmenu`, { method: 'DELETE' }), 'menu unlink');
  } else {
    await deps.api(`user/${encodeURIComponent(lineUserId)}/richmenu`, { method: 'DELETE' });
  }
  checked.add(lineUserId);
}

/** Every linked chat at once (daily): admins get the admin menu, everyone else LINE's default. Counts for the cron log. */
export async function syncAllLineMenus(deps: MenuDeps): Promise<{ processed: number; sent: number; skipped: number; failed: number }> {
  const ids = await ensureLineMenus(deps);
  if (!ids) return { processed: 0, sent: 0, skipped: 1, failed: 0 };
  const [links, admins] = await Promise.all([deps.store.linkedAccounts(), deps.store.adminIds()]);
  const adminChats = vaultOpenToAll() ? [] : links.filter(link => admins.has(link.userId)).map(link => link.lineUserId);
  const otherChats = links.map(link => link.lineUserId).filter(id => !adminChats.includes(id));
  for (let at = 0; at < adminChats.length; at += BULK) {
    await ok(await deps.api('richmenu/bulk/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ richMenuId: ids.admin, userIds: adminChats.slice(at, at + BULK) }) }), 'bulk link');
  }
  for (let at = 0; at < otherChats.length; at += BULK) {
    await ok(await deps.api('richmenu/bulk/unlink', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIds: otherChats.slice(at, at + BULK) }) }), 'bulk unlink');
  }
  return { processed: links.length, sent: adminChats.length, skipped: 0, failed: 0 };
}

/** A chat that was disconnected goes back to LINE's default menu. Never fails the disconnect. */
export async function resetLineMenu(lineUserId: string, api: LineApi | null = lineApi()): Promise<void> {
  forgetLineMenu(lineUserId);
  if (!api) return;
  try { await api(`user/${encodeURIComponent(lineUserId)}/richmenu`, { method: 'DELETE' }); }
  catch { console.error('line-menu: reset after disconnect failed'); }
}

// ---------- the real LINE API, database and image ----------

export function lineApi(token = process.env.LINE_CHANNEL_ACCESS_TOKEN): LineApi | null {
  if (!token) return null;
  return (path, init = {}, dataHost = false) => fetch(`https://${dataHost ? 'api-data' : 'api'}.line.me/v2/bot/${path}`, {
    ...init, signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> | undefined) },
  });
}

const supabaseMenuStore: MenuStore = {
  async claim(key) {
    const result = await getSupabaseAdmin().rpc('cashflow_claim_webhook', { p_key: key });
    if (result.error) throw result.error;
    return String(result.data);
  },
  async done(key) {
    const result = await getSupabaseAdmin().from('cashflow_webhook_events').update({ status: 'done' }).eq('key', key);
    if (result.error) throw result.error;
  },
  async linkedAccounts() {
    const result = await getSupabaseAdmin().from('cashflow_line_links').select('line_user_id, user_id').range(0, 9999);
    if (result.error) throw result.error;
    return (result.data || []).map(row => ({ lineUserId: String(row.line_user_id), userId: String(row.user_id) }));
  },
  async adminIds() {
    const result = await getSupabaseAdmin().from('cashflow_user_roles').select('user_id').eq('role', 'admin');
    if (result.error) throw result.error;
    return new Set((result.data || []).map(row => String(row.user_id)));
  },
  async userIdForLine(lineUserId) {
    const result = await getSupabaseAdmin().from('cashflow_line_links').select('user_id').eq('line_user_id', lineUserId).maybeSingle();
    if (result.error) throw result.error;
    return result.data?.user_id ? String(result.data.user_id) : null;
  },
  async isAdmin(userId) { return (await systemRole(userId)) === 'admin'; },
};

/** The site's own picture: from the Worker's asset store on Cloudflare (cloudflare/worker.ts), else APP_URL. */
async function siteImage(path: string): Promise<ArrayBuffer> {
  const assets = (globalThis as { __krarokAssets?: { fetch(request: Request): Promise<Response> } }).__krarokAssets;
  const response = assets
    ? await assets.fetch(new Request(`https://assets.invalid${path}`))
    : await fetch(`${(process.env.APP_URL || '').replace(/\/$/, '')}${path}`);
  // The asset store answers a missing file with the app page, so check that a picture came back.
  if (!response.ok || !(response.headers.get('content-type') || '').startsWith('image/jpeg')) throw new Error(`menu image unavailable (${response.status})`);
  return response.arrayBuffer();
}

/** Production parts, or null when LINE is not configured on this server. */
export function lineMenuDeps(): MenuDeps | null {
  const api = lineApi();
  const liffId = process.env.LIFF_ID;
  return api && liffId ? { api, store: supabaseMenuStore, image: siteImage, liffId } : null;
}
