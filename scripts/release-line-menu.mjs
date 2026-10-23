// Explicit release-only operation, run in Vercel's trusted build environment so the
// Messaging API credential stays on the server. Normal builds perform no LINE requests.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
const mode = process.env.LINE_MENU_RELEASE;
if (mode && ['inspect-direct-2026-10-15', 'publish-direct-2026-10-15'].includes(mode)) {
  if (process.env.VERCEL_ENV !== 'production') throw new Error('LINE menu release requires production build context');
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || token === '[SENSITIVE]') throw new Error('LINE credentials unavailable');
  const api = async (path, options = {}, dataHost = false) => {
    const response = await fetch(`https://${dataHost ? 'api-data' : 'api'}.line.me/v2/bot/${path}`, {
      ...options, signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, ...options.headers },
    });
    if (!response.ok) throw new Error(`LINE menu operation failed (${response.status})`);
    return response;
  };
  const previous = await (await api('user/all/richmenu')).json();
  const current = await (await api(`richmenu/${previous.richMenuId}`)).json();
  console.log('LINE_MENU_PREVIOUS', JSON.stringify(current));
  if (mode === 'publish-direct-2026-10-15') {
    const expected = process.env.LINE_MENU_EXPECTED_DEFAULT;
    if (!expected || previous.richMenuId !== expected) throw new Error('Default menu changed; inspect it again before publishing');
    const payload = JSON.parse(fs.readFileSync(new URL('./line-menu.json', import.meta.url)));
    const image = fs.readFileSync(new URL('../frontend/public/line/secretary-richmenu.jpg', import.meta.url));
    let created, switched = false;
    try {
      created = await (await api('richmenu', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).json();
      await api(`richmenu/${created.richMenuId}/content`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: image }, true);
      const downloaded = Buffer.from(await (await api(`richmenu/${created.richMenuId}/content`, {}, true)).arrayBuffer());
      if (!createHash('sha256').update(downloaded).digest().equals(createHash('sha256').update(image).digest())) throw new Error('Uploaded image mismatch');
      const publishedMenu = await (await api(`richmenu/${created.richMenuId}`)).json();
      const { richMenuId: publishedId, ...publishedPayload } = publishedMenu;
      if (publishedId !== created.richMenuId || !isDeepStrictEqual(publishedPayload, payload)) throw new Error('Published menu actions mismatch');
      const latest = await (await api('user/all/richmenu')).json();
      if (latest.richMenuId !== expected) throw new Error('Menu changed during upload');
      await api(`user/all/richmenu/${created.richMenuId}`, { method: 'POST' }); switched = true;
      const verified = await (await api('user/all/richmenu')).json();
      if (verified.richMenuId !== created.richMenuId) throw new Error('Default verification failed');
      console.log('LINE_MENU_PUBLISHED', JSON.stringify({ previous: previous.richMenuId, current: created.richMenuId, imageSha256: createHash('sha256').update(image).digest('hex'), name: payload.name, actions: publishedPayload.areas.map(area => area.action) }));
    } catch (error) {
      if (switched) { await api(`user/all/richmenu/${previous.richMenuId}`, { method: 'POST' }); console.log('LINE_MENU_ROLLED_BACK'); }
      throw error;
    }
  }
}
