import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildXlsx } from '../shared/xlsxWriter';

// An Excel or CSV file sent in LINE opened as a Google Sheet in the person's Drive (owner, 2026-11-13: "ส่ง Excel ใน LINE
// แล้วแปลงเป็น Google Sheet ให้เลย"): a tap under เลขา's answer, only where the Sheets test feature is open; Google
// connected first if it is not; the connected sheet and its map are left alone.

Object.assign(process.env, { SUPABASE_URL: 'https://lineconvert.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test-admin', APP_URL: 'https://staging.krarok.com', LIFF_ID: 'LIFF-1' });
const { convertLineSheet, decodeSheetConvert, sheetConvertData, sheetConvertTap } = await import('../backend/src/services/lineSheetConvert');
const { handleLineFileMessage } = await import('../backend/src/services/lineVaultChat');
const { GoogleError } = await import('../backend/src/services/googleSheets');

const USER = '00000000-0000-4000-8000-000000000044';
const workbook = Buffer.from(buildXlsx([{ name: 'รายจ่าย', rows: [['วันที่', 'รายการ', 'ยอด'], [{ date: '2026-11-01' }, 'ค่ากาแฟ', 60]] }]));

test('the tap carries the file\'s LINE message and its name within LINE\'s limits', () => {
  const data = sheetConvertData('123456789012345678', 'รายจ่ายเดือนพฤศจิกายน ปี 2569 ของสตูดิโอตัวอย่าง จำกัด.xlsx');
  assert.ok(data.length <= 300, `${data.length} characters`);
  const back = decodeSheetConvert(data)!;
  assert.equal(back.messageId, '123456789012345678');
  assert.equal(back.name, 'รายจ่ายเดือนพฤศจิกายน ปี 2569 ของสตูดิโอตัวอย่าง จำกัด.xlsx'.slice(0, 40).trim());
  assert.equal(decodeSheetConvert('sheet:convert:abc:xx'), null);
  const tap = sheetConvertTap('1', 'a.xlsx');
  assert.ok([...tap.action.label].length <= 20, 'LINE allows 20 characters');
});

function deps(over: Record<string, unknown> = {}) {
  const calls: any[] = [];
  return {
    calls,
    deps: {
      findUser: async () => ({ user_id: USER }),
      writeAccess: async () => ({ allowed: true }),
      sheetsOpen: async () => true,
      loadGoogle: async () => ({ enc: 'sealed', file: { id: 'connected-file', name: 'บัญชีหลัก' }, map: { fileId: 'connected-file' } }),
      decrypt: () => 'refresh-token',
      token: async () => ({ token: 'access', expiresIn: 3600 }),
      create: async (token: string, name: string, bytes: Uint8Array, media?: string) => { calls.push({ token, name, size: bytes.length, media, head: Buffer.from(bytes.slice(0, 40)).toString('utf8') }); return { id: 'new-sheet', name, url: 'https://docs.google.com/spreadsheets/d/new-sheet/edit' }; },
      read: async () => workbook,
      rateLimit: async (scope: string) => { calls.push(`limit:${scope}`); },
      removeGoogle: async () => { calls.push('removed'); },
      ...over,
    } as any,
  };
}

test('a workbook becomes a Google Sheet named after the file, and the card opens it', async () => {
  const d = deps();
  const [card] = await convertLineSheet('Uline', { messageId: '9', name: 'รายจ่ายพฤศจิกายน.xlsx' }, 'line-token', d.deps) as any[];
  assert.deepEqual(d.calls[0], 'limit:google-create');
  assert.deepEqual([d.calls[1].token, d.calls[1].name, d.calls[1].media], ['access', 'รายจ่ายพฤศจิกายน', undefined]);
  assert.equal(card.type, 'flex');
  assert.match(card.altText, /รายจ่ายพฤศจิกายน เป็น Google Sheet ใน Google Drive ของคุณแล้ว/);
  assert.match(JSON.stringify(card), /https:\/\/docs\.google\.com\/spreadsheets\/d\/new-sheet\/edit/);
});

test('a CSV saved in the Thai Windows encoding goes up as UTF-8 CSV', async () => {
  const d = deps({ read: async () => Buffer.from([0xa1, 0xd2, 0xe1, 0xbf, 0x2c, 0x36, 0x30]) }); // กาแฟ,60
  await convertLineSheet('Uline', { messageId: '9', name: 'รายจ่าย.csv' }, 'line-token', d.deps);
  assert.deepEqual([d.calls[1].media, d.calls[1].head, d.calls[1].name], ['text/csv', 'กาแฟ,60', 'รายจ่าย']);
});

test('without Google connected, or with it revoked, the connect card comes first; nothing is uploaded', async () => {
  for (const over of [{ loadGoogle: async () => null }, { decrypt: () => null }]) {
    const d = deps(over);
    const reply = await convertLineSheet('Uline', { messageId: '9', name: 'a.xlsx' }, 't', d.deps) as any[];
    assert.match(reply[0].text, /เชื่อมบัญชี Google ครั้งแรก/);
    assert.match(JSON.stringify(reply[1]), /connect=sheets/);
    assert.ok(!d.calls.some(call => call.name));
  }
  const revoked = deps({ create: async () => { throw new GoogleError('reconnect'); } });
  const reply = await convertLineSheet('Uline', { messageId: '9', name: 'a.xlsx' }, 't', revoked.deps) as any[];
  assert.match(reply[0].text, /เชื่อมบัญชี Google ครั้งแรก/);
  assert.ok(revoked.calls.includes('removed'), 'a dead connection is dropped');
});

test('closed feature, unlinked chat, or an expired LINE file each say so plainly', async () => {
  const [closed] = await convertLineSheet('U', { messageId: '9', name: 'a.xlsx' }, 't', deps({ sheetsOpen: async () => false }).deps) as any[];
  assert.match(closed.text, /ยังเปิดไฟล์ใน Google Sheets จากแชทไม่ได้/);
  const [unlinked] = await convertLineSheet('U', { messageId: '9', name: 'a.xlsx' }, 't', deps({ findUser: async () => null }).deps) as any[];
  assert.match(unlinked.text, /เชื่อมบัญชีกระรอกตุนเงินกับ LINE ก่อน/);
  const [expired] = await convertLineSheet('U', { messageId: '9', name: 'a.xlsx' }, 't', deps({ read: async () => { throw new Error('gone'); } }).deps) as any[];
  assert.match(expired.text, /หมดอายุในแชทแล้ว/);
});

test('the tap is offered under the answer to a spreadsheet only where the Sheets feature is open', async () => {
  const fileDeps = (open: boolean) => ({
    owner: async () => ({ user: { user_id: USER, notif_settings: {} }, auth: { id: USER } }),
    read: async () => workbook,
    answer: async () => ({ messages: [{ type: 'text', text: 'เตรียมให้แล้วครับ' }], text: 'ok', proposalIds: [] }),
    saveHistory: async () => {}, rateLimit: async () => {},
    sheetsOpen: async () => open,
  }) as any;
  const offered = await handleLineFileMessage('U', { id: '77', type: 'file', fileName: 'รายจ่าย.xlsx' }, 't', fileDeps(true)) as any[];
  const item = offered.at(-1).quickReply.items[0];
  assert.deepEqual([item.action.label, decodeSheetConvert(item.action.data)], ['เปิดใน Google Sheets', { messageId: '77', name: 'รายจ่าย.xlsx' }]);
  const hidden = await handleLineFileMessage('U', { id: '77', type: 'file', fileName: 'รายจ่าย.xlsx' }, 't', fileDeps(false)) as any[];
  assert.equal(hidden.at(-1).quickReply, undefined);
});

test('the webhook passes the tap through to the conversion', async () => {
  const { lineEventCommand } = await import('../backend/src/handlers/line-webhook');
  const data = sheetConvertData('77', 'รายจ่าย.xlsx');
  assert.equal(lineEventCommand({ type: 'postback', source: { type: 'user', userId: 'U1' }, postback: { data } } as any), data);
  assert.equal(lineEventCommand({ type: 'postback', source: { type: 'user', userId: 'U1' }, postback: { data: 'sheet:convert:x:y' } } as any), null);
});
