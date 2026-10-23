import type { VercelRequest, VercelResponse } from '../http/types.js';

// One-time (re-runnable) admin setup: creates the LINE Official Account's Rich Menu -- the
// persistent 2x3 button grid shown under the chat input for every user of this OA -- uploads the
// generated image (public/line/secretary-richmenu.jpg, 2500x1686, matching the app's cream/orange theme),
// and sets it as the default for all users. Not called by any user-facing flow; hit manually with
// CRON_SECRET the same way the digest/report crons are triggered for testing. Safe to re-run: it
// always creates a fresh rich menu and re-points the "default for all users" pointer at it, so
// running it again after editing public/richmenu-large.png (or the areas below) just replaces
// what's shown -- old rich menus this created are left behind on LINE's side but unused, since
// LINE has no cheap way to enumerate/delete them from this endpoint without the richMenuId, which
// isn't persisted anywhere between runs.
//
// Areas match the 2x3 CSS grid the image was rendered from (2500x1686, 3 cols x 2 rows, tiles
// roughly 833x843 each) -- keep this in sync with public/richmenu-large.png if the image changes.
const AREAS: { bounds: { x: number; y: number; width: number; height: number }; action: { type: string; text?: string; uri?: string; label?: string } }[] = [
  {
    "bounds": {
      "x": 0,
      "y": 0,
      "width": 1450,
      "height": 1120
    },
    "action": {
      "type": "uri",
      "label": "เพิ่มงาน"
    }
  },
  {
    "bounds": {
      "x": 1450,
      "y": 0,
      "width": 1050,
      "height": 560
    },
    "action": {
      "type": "message",
      "label": "รอรับเงิน",
      "text": "รอรับเงิน"
    }
  },
  {
    "bounds": {
      "x": 1450,
      "y": 560,
      "width": 1050,
      "height": 560
    },
    "action": {
      "type": "message",
      "label": "สรุปเดือนนี้",
      "text": "สรุปเดือนนี้"
    }
  },
  {
    "bounds": {
      "x": 0,
      "y": 1120,
      "width": 833,
      "height": 566
    },
    "action": {
      "type": "uri",
      "label": "แนบเอกสาร"
    }
  },
  {
    "bounds": {
      "x": 833,
      "y": 1120,
      "width": 834,
      "height": 566
    },
    "action": {
      "type": "message",
      "label": "กำลังดำเนินงาน",
      "text": "กำลังดำเนินการ"
    }
  },
  {
    "bounds": {
      "x": 1667,
      "y": 1120,
      "width": 833,
      "height": 566
    },
    "action": {
      "type": "uri",
      "label": "เปิดแอป"
    }
  }
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const liffId = process.env.LIFF_ID;
  const appUrl = process.env.APP_URL;
  if (!accessToken) {
    res.status(500).json({ error: 'Missing LINE_CHANNEL_ACCESS_TOKEN' });
    return;
  }
  if (!liffId || !appUrl) {
    res.status(500).json({ error: 'Missing LIFF_ID or APP_URL' });
    return;
  }

  const areas = AREAS.map((a) => {
    if (a.action.type === 'uri' && a.action.label === 'เพิ่มงาน') {
      return { ...a, action: { ...a.action, uri: `https://liff.line.me/${liffId}?openPath=%2Fjobs%3FopenAddJob%3D1` } };
    }
    if (a.action.type === 'uri' && a.action.label === 'แนบเอกสาร') {
      return { ...a, action: { ...a.action, uri: `https://liff.line.me/${liffId}?openPath=%2Fline-documents` } };
    }
    if (a.action.type === 'uri' && a.action.label === 'เปิดแอป') {
      return { ...a, action: { ...a.action, uri: `https://liff.line.me/${liffId}?openPath=%2Fapp` } };
    }
    return a;
  });

  try {
    // 1. Create the rich menu object (no image yet).
    const createRes = await fetch('https://api.line.me/v2/bot/richmenu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        size: { width: 2500, height: 1686 },
        selected: true,
        name: 'กระรอกตุนเงิน เลขาการเงิน',
        chatBarText: 'เลขาการเงิน',
        areas,
      }),
    });
    const createJson = await createRes.json() as { richMenuId?: unknown } | null;
    if (!createRes.ok) {
      res.status(500).json({ error: 'Failed to create rich menu', detail: createJson });
      return;
    }
    const richMenuId = createJson?.richMenuId;
    if (typeof richMenuId !== 'string' || !richMenuId) {
      res.status(502).json({ error: 'Invalid rich menu response' });
      return;
    }

    // 2. Upload the image (fetched from this deployment's own public/ folder rather than bundled
    // directly, so editing the PNG and redeploying is enough to pick up a new design next run).
    const imageRes = await fetch(`${appUrl.replace(/\/$/, '')}/line/secretary-richmenu.jpg`);
    if (!imageRes.ok) {
      res.status(500).json({ error: 'Failed to fetch line/secretary-richmenu.jpg from public/' });
      return;
    }
    const imageBuffer = await imageRes.arrayBuffer();
    const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', Authorization: `Bearer ${accessToken}` },
      body: Buffer.from(imageBuffer),
    });
    if (!uploadRes.ok) {
      res.status(500).json({ error: 'Failed to upload rich menu image', detail: await uploadRes.text() });
      return;
    }

    // 3. Set as the default rich menu for every user of this OA.
    const setDefaultRes = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!setDefaultRes.ok) {
      res.status(500).json({ error: 'Failed to set default rich menu', detail: await setDefaultRes.text() });
      return;
    }

    res.status(200).json({ ok: true, richMenuId });
  } catch (err: any) {
    console.error('setup-line-richmenu error:', err);
    res.status(500).json({ error: err.message || 'Rich menu setup failed' });
  }
}
