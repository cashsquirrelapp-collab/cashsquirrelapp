import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clearLineMenuCache, ensureLineMenus, menuPayload, resetLineMenu, syncAllLineMenus, syncLineMenuFor, type MenuDeps, type MenuStore } from '../backend/src/services/lineRichMenus';
import { scheduledPaths } from '../cloudflare/schedule';
import { isPhaseOneFeatureAvailable } from '../shared/featureAvailability';

// LINE's menu (owner, 2026-10-24: an admin menu and everyone's; 2026-11-14: the same six tiles for every linked chat,
// บันทึก · รอรับเงิน · สรุปเดือนนี้ · ส่งสลิป · ออกเอกสาร · เปิดแอป). No network: a fake LINE API and database.

const live = JSON.parse(readFileSync(new URL('../scripts/line-menu.json', import.meta.url), 'utf8'));
const LIFF = /liff\.line\.me\/([^?]+)/.exec(JSON.stringify(live))![1];
const vaultOpen = isPhaseOneFeatureAvailable('vault', false);

function fakeLine(over: { claim?: string; imageFails?: boolean; menus?: { richMenuId: string; name: string }[]; perUser?: Record<string, string>; admins?: string[]; links?: { lineUserId: string; userId: string }[] } = {}) {
  const calls: string[] = [];
  const menus = [...(over.menus || [])];
  const perUser = { ...(over.perUser || {}) };
  let defaultMenu: string | null = 'old-default';
  let created = 0;
  const done: string[] = [];
  const api: MenuDeps['api'] = async (path, init = {}) => {
    const method = init.method || 'GET';
    calls.push(`${method} ${path}`);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (method === 'GET' && path === 'richmenu/list') return json({ richmenus: menus });
    if (method === 'POST' && path === 'richmenu') { const id = `menu-${++created}`; menus.push({ richMenuId: id, name: JSON.parse(String(init.body)).name }); return json({ richMenuId: id }); }
    if (method === 'POST' && /^richmenu\/[^/]+\/content$/.test(path)) return over.imageFails ? json({}, 400) : json({});
    if (method === 'DELETE' && /^richmenu\/[^/]+$/.test(path)) return json({});
    if (method === 'GET' && path === 'user/all/richmenu') return defaultMenu ? json({ richMenuId: defaultMenu }) : json({}, 404);
    if (method === 'POST' && path.startsWith('user/all/richmenu/')) { defaultMenu = path.split('/').pop()!; return json({}); }
    const user = /^user\/([^/]+)\/richmenu(?:\/(.+))?$/.exec(path);
    if (user) {
      const id = decodeURIComponent(user[1]);
      if (method === 'GET') return perUser[id] ? json({ richMenuId: perUser[id] }) : json({}, 404);
      if (method === 'POST') { perUser[id] = user[2]; return json({}); }
      if (method === 'DELETE') { delete perUser[id]; return json({}); }
    }
    if (method === 'POST' && (path === 'richmenu/bulk/link' || path === 'richmenu/bulk/unlink')) return json({}, 202);
    return json({ message: 'unexpected' }, 400);
  };
  const links = over.links || [{ lineUserId: 'U-admin', userId: 'admin-1' }, { lineUserId: 'U-member', userId: 'member-1' }];
  const admins = new Set(over.admins || ['admin-1']);
  const store: MenuStore = {
    async claim(key) { return done.includes(key) ? 'done' : over.claim || 'claimed'; },
    async done(key) { done.push(key); },
    async linkedAccounts() { return links; },
    async adminIds() { return admins; },
    async userIdForLine(lineUserId) { return links.find(link => link.lineUserId === lineUserId)?.userId ?? null; },
    async isAdmin(userId) { return admins.has(userId); },
  };
  const images: string[] = [];
  const deps: MenuDeps = { api, store, liffId: LIFF, image: async path => { images.push(path); return new Uint8Array([0xff, 0xd8, 0xff]).buffer; } };
  return { deps, calls, menus, perUser, images, done, defaultMenu: () => defaultMenu };
}

beforeEach(() => clearLineMenuCache());

test('members\' menu (2026-11-14m): บันทึก · รอรับเงิน · สรุปเดือนนี้ · ส่งสลิป · ออกเอกสาร · เปิดแอป, the same for every linked chat', () => {
  // Owner, 2026-11-14 ("ทำข้อ 2 เมนู LINE ต่อเลย"): LINE as the main way in, so the tiles start the work in the chat.
  const liff = (path: string) => `https://liff.line.me/${LIFF}?openPath=${encodeURIComponent(path)}`;
  const admin = menuPayload('admin', LIFF);
  const everyone = menuPayload('everyone', LIFF);
  assert.deepEqual(everyone.areas, admin.areas, 'one set of tiles for every linked chat');
  assert.deepEqual(everyone.areas.map(area => area.action), [
    { type: 'message', label: 'บันทึก', text: 'บันทึก' },
    { type: 'message', label: 'รอรับเงิน', text: 'รอรับเงิน' },
    { type: 'message', label: 'สรุปเดือนนี้', text: 'สรุปเดือนนี้' },
    { type: 'message', label: 'ส่งสลิป / ใบเสร็จ', text: 'ส่งสลิป' },
    { type: 'message', label: 'ออกเอกสาร', text: 'ออกเอกสาร' },
    { type: 'uri', label: 'เปิดแอป', uri: liff('/app') },
  ]);
  // The tiles cover the picture exactly, where the picture draws them (the 2026-11-03 layout).
  assert.deepEqual(everyone.areas.map(area => [area.bounds.x, area.bounds.y, area.bounds.width, area.bounds.height]), [
    [0, 0, 1450, 1120], [1450, 0, 1050, 560], [1450, 560, 1050, 560], [0, 1120, 833, 566], [833, 1120, 834, 566], [1667, 1120, 833, 566],
  ]);
  assert.equal(everyone.areas.reduce((sum, area) => sum + area.bounds.width * area.bounds.height, 0), 2500 * 1686);
  assert.ok(everyone.areas.every(area => area.action.label.length <= 20), 'LINE allows 20 characters per label');
  assert.ok(everyone.chatBarText.length <= 14 && everyone.name.length <= 300 && everyone.name !== admin.name);
});

test('the members\' picture (scripts/line-menu/render-members.mjs) is a 2500x1686 JPEG under LINE\'s 1 MB limit', () => {
  for (const name of ['richmenu-members-2026-11-14.jpg']) {
    const image = readFileSync(new URL(`../frontend/public/line/${name}`, import.meta.url));
    assert.deepEqual([...image.subarray(0, 3)], [0xff, 0xd8, 0xff]);
    assert.ok(image.length < 1_000_000);
    // Size from the JPEG frame header (SOF0/SOF2).
    let at = 2;
    while (at < image.length && !(image[at] === 0xff && [0xc0, 0xc2].includes(image[at + 1]))) at += 2 + image.readUInt16BE(at + 2);
    assert.deepEqual([image.readUInt16BE(at + 7), image.readUInt16BE(at + 5)], [2500, 1686], name);
  }
});

test('publishing: both menus once, the 5-tile one becomes the default, then nothing is published again', async () => {
  const line = fakeLine();
  const ids = await ensureLineMenus(line.deps);
  assert.ok(ids);
  assert.deepEqual(line.calls.filter(call => call === 'POST richmenu').length, 2);
  assert.deepEqual(line.images, ['/line/richmenu-members-2026-11-14.jpg', '/line/richmenu-members-2026-11-14.jpg']);
  assert.equal(line.defaultMenu(), vaultOpen ? ids!.admin : ids!.everyone);
  assert.equal(line.done.length, 1);
  line.calls.length = 0;
  assert.deepEqual(await ensureLineMenus(line.deps), ids);
  assert.deepEqual(line.calls, [], 'cached in this Worker');
  clearLineMenuCache();
  await ensureLineMenus(line.deps);
  assert.deepEqual(line.calls, ['GET richmenu/list'], 'another Worker finds them by name and does not publish again');
});

test('publishing: another Worker busy publishing means wait; a failed picture removes the half-made menu', async () => {
  const busy = fakeLine({ claim: 'busy' });
  assert.equal(await ensureLineMenus(busy.deps), null);
  assert.deepEqual(busy.calls, []);
  const broken = fakeLine({ imageFails: true });
  await assert.rejects(ensureLineMenus(broken.deps), /menu image/);
  assert.ok(broken.calls.includes('DELETE richmenu/menu-1'));
  assert.equal(broken.defaultMenu(), 'old-default', 'the default is not touched');
  assert.equal(broken.done.length, 0, 'the next run tries again');
});

test('one chat: an admin gets the admin menu, a member loses an old one, each chat is checked once per Worker', async () => {
  const line = fakeLine({ perUser: { 'U-member': 'menu-old' } });
  await syncLineMenuFor('U-admin', line.deps);
  await syncLineMenuFor('U-member', line.deps);
  if (vaultOpen) return;
  const ids = await ensureLineMenus(line.deps);
  assert.equal(line.perUser['U-admin'], ids!.admin);
  assert.equal(line.perUser['U-member'], undefined);
  line.calls.length = 0;
  await syncLineMenuFor('U-admin', line.deps);
  assert.deepEqual(line.calls, []);
});

test('daily: admins\' chats get the admin menu in bulk, every other linked chat the default; disconnect resets the chat', async () => {
  const line = fakeLine();
  const result = await syncAllLineMenus(line.deps);
  assert.deepEqual(result, { processed: 2, sent: vaultOpen ? 0 : 1, skipped: 0, failed: 0 });
  if (!vaultOpen) assert.ok(line.calls.includes('POST richmenu/bulk/link'));
  assert.ok(line.calls.includes('POST richmenu/bulk/unlink'));
  line.calls.length = 0;
  await resetLineMenu('U-admin', line.deps.api);
  assert.deepEqual(line.calls, ['DELETE user/U-admin/richmenu']);
  assert.deepEqual(scheduledPaths('0 2 * * *', Date.parse('2026-11-02T02:00:00Z')), ['/api/close-expired-accounts', '/api/setup-line-richmenu', '/api/advance-card-renewals']);
});

// Sign-up in LINE on (owner, 2026-11-13): a chat without an account gets its own small menu as LINE's default
// (เริ่มใช้งาน, คุยกับเลขา, รู้จักกระรอก); every linked chat wears the members' menu, whose pictures stay as they are.
process.env.APP_URL ??= 'https://staging.krarok.com';
async function withSignup<T>(run: () => Promise<T> | T): Promise<T> {
  const before = process.env.LINE_SIGNUP;
  process.env.LINE_SIGNUP = 'enabled';
  try { return await run(); } finally { if (before === undefined) delete process.env.LINE_SIGNUP; else process.env.LINE_SIGNUP = before; }
}

test('guest menu: three tiles on a 2500x843 picture under 1 MB — start in LIFF, the chat tile, the site', async () => {
  const payload = menuPayload('guest', 'LIFF-1') as unknown as { size: { width: number; height: number }; chatBarText: string; areas: { bounds: { x: number; y: number; width: number; height: number }; action: Record<string, string> }[] };
  assert.deepEqual(payload.size, { width: 2500, height: 843 });
  assert.equal(payload.chatBarText, 'เริ่มใช้งาน');
  assert.deepEqual(payload.areas.map(area => area.action.label), ['เริ่มใช้งาน', 'คุยกับเลขา', 'รู้จักกระรอก']);
  assert.equal(payload.areas[0].action.uri, 'https://liff.line.me/LIFF-1?start=1');
  assert.deepEqual(payload.areas[1].action, { type: 'message', label: 'คุยกับเลขา', text: 'คุยกับเลขา' });
  assert.match(payload.areas[2].action.uri, /^https:\/\//);
  // The tiles cover the picture exactly, with no gaps or overlaps.
  assert.equal(payload.areas.reduce((sum, area) => sum + area.bounds.width * area.bounds.height, 0), 2500 * 843);
  const image = readFileSync(new URL('../frontend/public/line/richmenu-guest-2026-11-13.jpg', import.meta.url));
  assert.deepEqual([...image.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  assert.ok(image.length < 1_000_000);
  let at = 2;
  while (at < image.length && !(image[at] === 0xff && [0xc0, 0xc2].includes(image[at + 1]))) at += 2 + image.readUInt16BE(at + 2);
  assert.deepEqual([image.readUInt16BE(at + 7), image.readUInt16BE(at + 5)], [2500, 843]);
});

test('sign-up on: the guest menu is LINE\'s default; linked chats get the members\' menu, one by one and daily', async () => {
  await withSignup(async () => {
    const line = fakeLine({ links: [{ lineUserId: 'U-admin', userId: 'admin-1' }, { lineUserId: 'U-member', userId: 'member-1' }], perUser: { 'U-guest': 'menu-old' } });
    const ids = await ensureLineMenus(line.deps);
    assert.ok(ids?.guest);
    assert.equal(line.defaultMenu(), ids!.guest);
    assert.ok(line.images.includes('/line/richmenu-guest-2026-11-13.jpg'));
    await syncLineMenuFor('U-member', line.deps);
    await syncLineMenuFor('U-guest', line.deps);
    assert.equal(line.perUser['U-member'], vaultOpen ? ids!.admin : ids!.everyone, 'a member wears the members\' menu');
    assert.equal(line.perUser['U-guest'], undefined, 'no account: back to the guest default');
    line.calls.length = 0;
    const daily = await syncAllLineMenus(line.deps);
    assert.deepEqual(daily, { processed: 2, sent: 2, skipped: 0, failed: 0 });
    assert.ok(line.calls.includes('POST richmenu/bulk/link'));
    assert.ok(!line.calls.includes('POST richmenu/bulk/unlink'));
  });
  // Sign-up off (the real site today): no guest menu, the same as before.
  clearLineMenuCache();
  const off = fakeLine();
  const ids = await ensureLineMenus(off.deps);
  assert.equal(ids?.guest, undefined);
  assert.ok(!off.images.includes('/line/richmenu-guest-2026-11-13.jpg'));
});
