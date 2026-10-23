import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { cleanVaultFileName, sniffVaultMime } from '../shared/vault';

const db = new PGlite();
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222', g = '33333333-3333-4333-8333-333333333333';
const file = (id: string) => `aaaaaaaa-aaaa-4aaa-8aaa-${id.padStart(12, '0')}`;
const insert = (values: string) => db.exec(`insert into cashflow_vault_files(id,user_id,group_id,kind,file_name,mime_type,size_bytes,storage_path) values ${values}`);

before(async () => {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create table public.cashflow_groups(id uuid primary key);
    insert into auth.users values('${a}'),('${b}');insert into public.cashflow_groups values('${g}');`);
  await db.exec(await readFile('database/migrations/018_document_vault.sql', 'utf8'));
  await db.exec(await readFile('database/migrations/019_vault_expense_slips.sql', 'utf8'));
});
after(() => db.close());

test('a vault file belongs to exactly one account or group and only to known file types', async () => {
  await insert(`('${file('1')}','${a}',null,'wht50','50Tawi.pdf','application/pdf',1000,'user/${a}/${file('1')}.pdf')`);
  await insert(`('${file('2')}',null,'${g}','contract','PO.jpg','image/jpeg',2000,'group/${g}/${file('2')}.jpg')`);
  await assert.rejects(insert(`('${file('3')}','${a}','${g}','other','x.pdf','application/pdf',1,'user/${a}/${file('3')}.pdf')`), /one_owner/);
  await assert.rejects(insert(`('${file('4')}',null,null,'other','x.pdf','application/pdf',1,'user/${a}/${file('4')}.pdf')`), /one_owner/);
  await assert.rejects(insert(`('${file('5')}','${a}',null,'other','x.exe','application/x-msdownload',1,'user/${a}/${file('5')}.pdf')`), /check constraint/);
  await assert.rejects(insert(`('${file('6')}','${a}',null,'other','x.pdf','application/pdf',10485761,'user/${a}/${file('6')}.pdf')`), /check constraint/);
  await assert.rejects(insert(`('${file('7')}','${a}',null,'other','x.pdf','application/pdf',1,'user/../etc/passwd')`), /check constraint/);
  await insert(`('${file('10')}','${a}',null,'expense','slip.jpg','image/jpeg',500,'user/${a}/${file('10')}.jpg')`); // expense slips (019)
  await assert.rejects(insert(`('${file('8')}','${a}',null,'receipt','x.pdf','application/pdf',1,'user/${a}/${file('8')}.pdf')`), /check constraint/);
});

test('browsers cannot read or write the vault table directly', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(db.query('select * from cashflow_vault_files'), /permission denied/);
      await assert.rejects(insert(`('${file('9')}','${b}',null,'other','x.pdf','application/pdf',1,'user/${b}/${file('9')}.pdf')`), /permission denied/);
    } finally { await db.exec('reset role'); }
  }
});

test('vault rows go with the account or group they belong to', async () => {
  await db.exec(`delete from auth.users where id='${a}'`);
  await db.exec(`delete from public.cashflow_groups where id='${g}'`);
  assert.equal((await db.query<{ n: number }>('select count(*)::int n from cashflow_vault_files')).rows[0].n, 0);
});

test('file type comes from the bytes, not the name', () => {
  const bytes = (...values: number[]) => new Uint8Array(values);
  assert.equal(sniffVaultMime(new TextEncoder().encode('%PDF-1.7\n')), 'application/pdf');
  assert.equal(sniffVaultMime(bytes(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg');
  assert.equal(sniffVaultMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), 'image/png');
  assert.equal(sniffVaultMime(new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ')), 'image/webp');
  assert.equal(sniffVaultMime(new TextEncoder().encode('<html><script>')), null);
  assert.equal(sniffVaultMime(new TextEncoder().encode('MZ\u0090\u0000')), null);
  assert.equal(sniffVaultMime(bytes()), null);
});

test('file names are cleaned and always carry the real extension', () => {
  assert.equal(cleanVaultFileName('../../etc/50Tawi_BrandA.pdf', 'application/pdf'), '50Tawi_BrandA.pdf');
  assert.equal(cleanVaultFileName('scan "final".exe', 'image/jpeg'), 'scan final.jpg');
  assert.equal(cleanVaultFileName('C:\\Users\\me\\ใบ 50 ทวิ.PNG', 'image/png'), 'ใบ 50 ทวิ.png');
  assert.equal(cleanVaultFileName('', 'application/pdf'), 'document.pdf');
  assert.ok(cleanVaultFileName('x'.repeat(500) + '.pdf', 'application/pdf').length <= 165);
});

test('the ZIP bundle is a valid archive that unzip tools can read', async () => {
  const { buildZip, crc32 } = await import('../frontend/src/features/vault/zip');
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const blob = buildZip([
    { name: 'Brand A - 50Tawi.pdf', data: new TextEncoder().encode('%PDF-1.7 a') },
    { name: 'Brand A - 50Tawi.pdf', data: new TextEncoder().encode('%PDF-1.7 b') },
    { name: 'ใบ 50 ทวิ.jpg', data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) },
  ]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  const end = bytes.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 10, true), 3);
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes('Brand A - 50Tawi (2).pdf')); // same name kept apart
  assert.ok(text.includes('ใบ 50 ทวิ.jpg'));
});

test('the ZIP sorts files into a folder per job, expense slips by month, and unlinked files apart', async () => {
  const { buildZip, vaultZipPaths } = await import('../frontend/src/features/vault/zip');
  const at = '2026-10-05T03:00:00Z';
  const file = (id: string, kind: string, fileName: string, link: { jobId?: string; jobName?: string; client?: string } = {}) =>
    ({ id, kind: kind as 'wht50', fileName, createdAt: at, jobId: link.jobId || null, jobName: link.jobName || null, client: link.client || null });
  const paths = vaultZipPaths([
    file('1', 'wht50', '50Tawi.pdf', { jobId: 'j1', jobName: 'โปรเจคครีมกันแดดสีจันทร์', client: 'Brand A' }),
    file('2', 'contract', 'PO.pdf', { jobId: 'j1', jobName: 'โปรเจคครีมกันแดดสีจันทร์', client: 'Brand A' }),
    file('3', 'wht50', '50Tawi.pdf', { jobId: 'j2', jobName: 'Sponsored Post', client: 'Brand A' }),
    file('4', 'wht50', '50Tawi.pdf', { jobId: 'j3', jobName: 'Sponsored Post', client: 'Brand B' }),
    file('5', 'expense', 'slip.jpg', { jobId: 'e1', jobName: 'ค่าเช่าสตูดิโอ' }),
    file('6', 'other', 'note.pdf'),
    file('7', 'contract', 'x.pdf', { jobId: 'j4', jobName: '../../etc/passwd' }),
  ], [{ id: 'e1', date: '2026-09-28' }]);
  assert.deepEqual(paths, [
    'โปรเจคครีมกันแดดสีจันทร์/50Tawi.pdf',
    'โปรเจคครีมกันแดดสีจันทร์/PO.pdf',
    'Sponsored Post/50Tawi.pdf',
    'Sponsored Post - Brand B/50Tawi.pdf',
    'รายจ่าย/2569-09 กันยายน/ค่าเช่าสตูดิโอ - slip.jpg',
    'ไม่ได้ผูกกับงาน/note.pdf',
    '..-..-etc-passwd/x.pdf',
  ]);
  // folder names stay inside the archive: no ".." part survives
  const bytes = new Uint8Array(await buildZip(paths.map(name => ({ name, data: new Uint8Array([1]) }))).arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes('-..-etc-passwd/x.pdf'));
  assert.ok(!/(^|\/)\.\.\//.test(text.replace(/[^\x20-\x7e/]/g, '\n')));
});
