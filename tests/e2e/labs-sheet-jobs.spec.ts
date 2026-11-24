import { fakeDataServer } from './fixtures/fakeDataServer';
import { expect, test, type Page } from '@playwright/test';
import { noRadar } from './radarVisit';
import { textOverlapIssues } from './textOverlap';
import { loadLayoutFonts } from './testFonts';

// หน้างานจากชีต (ฟีเจอร์ทดลอง sheetJobs; owner, 2026-11-14: the sheet is the database, "โอเคนะ" to the mocks, "ทำเลย"): the
// Jobs page as it is with one line on top, ข้อมูลจากชีต <file> · อัปเดต 09:12 · เปิดชีต; the sheet's job rows become jobs
// (the one เลขา already saved is linked, not added twice); a job's details say its tab and row, with ดูในชีต opening that
// very row. Google and the backend are mocked.

test.use({ serviceWorkers: 'block' });

const user = { id: '66666666-6666-4666-8666-666666666666', email: 'sync@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const FILE = { id: 'file-12345678', name: 'งานลูกค้า 2569', url: 'https://docs.google.com/spreadsheets/d/file-12345678/edit' };
const col = (index: number, header: string, target: string, extra: Record<string, unknown> = {}) => ({ index, header, target, ...extra });
const MAP = { fileId: FILE.id, at: '2026-11-14T02:00:00.000Z', tabs: [{ name: 'รายรับ', gid: 812, headerRow: 0, kind: 'jobs', use: true, columns: [
  col(0, 'วันที่ส่งงาน', 'postDate'), col(1, 'ชื่อโปรเจกต์', 'name'), col(2, 'ลูกค้า', 'client'), col(3, 'ค่าจ้าง', 'value'), col(4, 'หัก ณ ที่จ่าย', 'whtAmount'),
  col(5, 'ยอดโอนจริง', 'keep', { formula: true }), col(6, 'รับแล้ว', 'received'), col(7, 'วันที่โอน', 'paidDate'), col(8, 'หมายเหตุ', 'note')] }] };
const c = (text: string, extra: Record<string, unknown> = {}) => ({ raw: /^[\d,.]+$/.test(text) ? Number(text.replace(/,/g, '')) : (text || null), text, ...extra });
const d = (text: string, iso: string) => c(text, { date: iso });
const ROWS = [
  ['วันที่ส่งงาน', 'ชื่อโปรเจกต์', 'ลูกค้า', 'ค่าจ้าง', 'หัก ณ ที่จ่าย', 'ยอดโอนจริง', 'รับแล้ว', 'วันที่โอน', 'หมายเหตุ'].map(t => c(t)),
  [d('31/10/2569', '2026-10-31'), c('ที่ปรึกษาคอนเทนต์ เดือน ต.ค.'), c('บริษัท โกลว์อัพ จำกัด'), c('20,000'), c('600'), c('19,400', { formula: true }), c('19,400'), d('2/11/2569', '2026-11-02'), c('ได้ 50 ทวิ แล้ว')],
  [d('3/11/2569', '2026-11-03'), c('ออกแบบโลโก้ร้านกาแฟ'), c('คาเฟ่ลูมิน'), c('5,000'), c('0'), c('5,000', { formula: true }), c('5,000'), d('5/11/2569', '2026-11-05'), c('')],
  [d('10/11/2569', '2026-11-10'), c('ตัดต่อคลิปรีวิวคาเฟ่ EP.3'), c('คุณยอร์ช'), c('3,000'), c('0'), c('3,000', { formula: true }), c('0'), c(''), c('')],
  [c('รวม'), c(''), c(''), c('28,000'), c('600'), c('27,400', { formula: true }), c('24,400'), c(''), c('')],
];
// Saved from เลขา's chat before the page read the sheet: linked to row 4, never added again.
const chatJob = { id: 'chat-job-1', name: 'ตัดต่อคลิปรีวิวคาเฟ่ EP.3', client: 'คุณยอร์ช', value: 3000, received: 0, pending: 3000, status: 'pending', paymentStatus: 'unpaid', type: '', creditTerm: 10, note: '', isPosted: true, postDate: '2026-11-10', payDate: '2026-11-20' };
const settings = { monthlyExpense: 0, monthlyRevenueGoal: 40000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance', onboarding: { completedAt: '2026-11-05T03:00:00.000Z' } };
const versions = { cashflow_jobs: { 'chat-job-1': 1 }, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };

async function open(page: Page, size: { width: number; height: number }, labsOn: string[], deleteReply: Record<string, unknown> = { deleted: 1, notFound: 0 }, firstRows = ROWS, appOnly: Record<string, unknown>[] = [], path = '/jobs') {
  let sheetRows = firstRows;
  let deleteExampleCalls = 0;
  const batches: { kind: string; records: Record<string, unknown>[] }[] = [];
  const deletes: unknown[] = [];
  const saves: { kind: string; record: Record<string, unknown>; before: Record<string, unknown> | null; serverHad?: unknown }[] = [];
  let reads = 0;
  await page.clock.setFixedTime(new Date('2026-11-14T09:12:00+07:00'));
  await page.addInitScript(() => { localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_theme_pref', JSON.stringify({ mode: 'light', asked: true })); });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-6666666666', displayName: 'ผู้ทดสอบ' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  const dataServer = fakeDataServer({ jobs: [chatJob, ...appOnly], expenses: [], goals: [], invoices: [], settings, statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null }, { ...versions, cashflow_jobs: { ...versions.cashflow_jobs, ...Object.fromEntries(appOnly.map(job => [String(job.id), 1])) } }, { subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } });
  await page.route('**/api/data*', route => dataServer.handle(route));
  const posts: unknown[] = dataServer.posts;
  await page.route('**/api/labs', route => route.fulfill({ json: { labs: { tester: true, on: labsOn } } }));
  await page.route('**/api/google', route => {
    const status = { google: { configured: true, connected: true, email: 'mew@example.com', file: FILE, map: MAP } };
    if (route.request().method() === 'GET') return route.fulfill({ json: status });
    const body = route.request().postDataJSON() as { action?: string };
    if (body.action === 'read') { reads += 1; return route.fulfill({ json: { ...status, tabs: [{ name: 'รายรับ', gid: 812, truncated: false, rows: sheetRows }], readAt: '2026-11-14T02:12:00.000Z' } }); }
    if (body.action === 'deleteRows') { deletes.push(body); return route.fulfill({ json: { ...status, result: deleteReply } }); }
    if (body.action === 'deleteExamples') {
      deleteExampleCalls += 1;
      const before = sheetRows.length;
      sheetRows = sheetRows.filter(row => !row.some(cell => /\(ตัวอย่าง\)\s*$/.test(String(cell.text))));
      return route.fulfill({ json: { ...status, result: { deleted: before - sheetRows.length } } });
    }
    if (body.action === 'saveRows') {
      const batch = body as unknown as { kind: string; records: Record<string, unknown>[] };
      batches.push(batch);
      return route.fulfill({ json: { ...status, result: { status: 'written', fileId: FILE.id, tab: 'รายรับ', rows: batch.records.map((_, i) => 6 + i), gid: 812 } } });
    }
    if (body.action === 'saveRow') {
      const save = body as unknown as { kind: string; record: Record<string, unknown>; before: Record<string, unknown> | null; serverHad?: unknown };
      // What the app's server held for this record when the row was written (it is written after the save lands, 2026-11-24).
      save.serverHad = (dataServer.snapshot.jobs as Record<string, unknown>[]).find(job => job.id === save.record.id)?.value;
      saves.push(save);
      return route.fulfill({ json: { ...status, result: { status: 'written', fileId: FILE.id, tab: 'รายรับ', row: save.before ? Number(save.before.row) : 6, gid: 812 } } });
    }
    return route.fulfill({ json: status });
  });
  await page.setViewportSize(size);
  await page.goto(noRadar(path));
  await loadLayoutFonts(page);
  return { posts, deletes, saves, batches, reads: () => reads, deletedExamples: () => deleteExampleCalls, setRows: (rows: typeof ROWS) => { sheetRows = rows; } };
}

for (const device of [{ name: 'computer', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`the jobs page on the ${device.name} keeps a copy of the sheet; a job says its row and ดูในชีต opens it`, async ({ page }) => {
    const { posts, reads } = await open(page, device, ['sheets', 'sheetMap', 'sheetJobs']);
    const line = page.getByTestId('sheet-jobs-line');
    await expect(line).toContainText('ข้อมูลจากชีต งานลูกค้า 2569');
    await expect(line).toContainText('อัปเดต 09:12');
    await expect(line.getByRole('link', { name: 'เปิดชีต' })).toHaveAttribute('href', `${FILE.url}#gid=812`);
    // Three rows, the total row left out, the chat's job linked: three jobs, not four.
    const titles = device.name === 'computer' ? page.locator('table tbody tr td:first-child p:first-child') : page.locator('.ksm-jobtitle');
    await expect(titles).toHaveCount(3);
    await expect(titles).toContainText(['ตัดต่อคลิปรีวิวคาเฟ่ EP.3']);
    await expect.poll(() => JSON.stringify(posts)).toContain('"sheetLink":{"fileId":"file-12345678","tab":"รายรับ","row":4,"gid":812,"sig":');
    // One reading, or two when the first came before the app's own first save had landed (App.tsx sheetFresh, 2026-11-24).
    expect(reads()).toBeLessThanOrEqual(2);
    expect(await textOverlapIssues(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/labs-sheet-jobs-${device.name}.png` });

    await titles.filter({ hasText: 'ตัดต่อคลิปรีวิวคาเฟ่ EP.3' }).first().click();
    const row = page.getByTestId('sheet-row-line');
    await expect(row).toContainText('อยู่ในชีต งานลูกค้า 2569');
    await expect(row).toContainText('แท็บ รายรับ · แถว 4');
    await expect(row.getByRole('link', { name: 'ดูในชีต' })).toHaveAttribute('href', `${FILE.url}#gid=812&range=A4:I4`);
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: `test-results/labs-sheet-jobs-detail-${device.name}.png` });
  });
}

// Owner, 2026-11-17: "ทำไมยอดเงินกูมันขึ้นมาเหมือนเดิมอีกแล้ว ... กูไม่ได้กรอกแล้วมันดันขึ้นมาเอง": a job deleted in the app
// came back from its sheet row at the next reading. What the app took from the sheet is now counted in the settings.
test('a job deleted in the app stays deleted: its sheet row is deleted too, and reading the sheet again or opening the app afresh never brings it back', async ({ page }) => {
  const { posts, deletes, reads } = await open(page, { width: 1440, height: 900 }, ['sheets', 'sheetMap', 'sheetJobs']);
  const titles = page.locator('table tbody tr td:first-child p:first-child');
  await expect(titles).toHaveCount(3);
  await expect.poll(() => JSON.stringify(posts)).toContain('"sheetSeen":{"fileId":"file-12345678"');
  const row = page.locator('table tbody tr').filter({ hasText: 'ออกแบบโลโก้ร้านกาแฟ' }).first();
  await row.hover();
  await row.getByRole('button', { name: /เมนู|ตัวเลือก|เพิ่มเติม/ }).first().click();
  await page.getByRole('menuitem', { name: 'ลบ' }).click();
  const confirm = page.getByRole('dialog', { name: 'ยืนยันการลบงาน' });
  // Owner, 2026-11-17: "ถ้ากูลบโปรเจกต์นั้นออกแล้วใน Google Sheet ก็ต้องลบออกด้วยดิ": the question says the row goes too.
  await expect(confirm).toContainText('แถวของงานนี้ในชีต (แท็บ รายรับ แถว 3) จะถูกลบด้วย');
  expect(await textOverlapIssues(page)).toEqual([]);
  await confirm.getByRole('button', { name: 'ยืนยัน' }).click();
  await expect(titles).toHaveCount(2);
  await expect.poll(() => deletes.length).toBe(1);
  expect(deletes[0]).toEqual({ action: 'deleteRows', rows: [{ kind: 'job', fileId: FILE.id, tab: 'รายรับ', row: 3, name: 'ออกแบบโลโก้ร้านกาแฟ', amount: 5000 }] });
  await expect(page.getByText('ลบแถวในชีตไม่สำเร็จ')).toHaveCount(0);
  type Change = { table: string; id: string; op: 'set' | 'delete'; data?: Record<string, unknown> };
  const changes = () => (posts as { changes?: Change[] }[]).flatMap(post => post.changes ?? []);
  await expect.poll(() => changes().some(change => change.table === 'cashflow_jobs' && change.op === 'delete')).toBe(true);

  // Back on the page a minute later: the sheet is read again, the row is still there, the job is not added back.
  await page.clock.setFixedTime(new Date('2026-11-14T09:13:30+07:00'));
  const before = reads();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(reads).toBeGreaterThan(before);
  await page.waitForTimeout(800);
  await expect(titles).toHaveCount(2);
  await expect(titles.filter({ hasText: 'ออกแบบโลโก้ร้านกาแฟ' })).toHaveCount(0);

  // Opened afresh (another device): the server has what was saved, and the job still does not come back.
  const jobs = new Map<string, Record<string, unknown>>([[chatJob.id, chatJob]]);
  let saved: Record<string, unknown> = settings;
  for (const change of changes()) {
    if (change.table === 'cashflow_jobs') { if (change.op === 'delete') jobs.delete(change.id); else jobs.set(change.id, change.data!); }
    if (change.table === 'cashflow_documents' && change.id === 'settings' && change.op === 'set') saved = change.data!;
  }
  expect(jobs.size).toBe(2);
  expect(JSON.stringify(saved)).toContain('"sheetSeen"');
  const fresh = { ...versions, cashflow_jobs: Object.fromEntries([...jobs.keys()].map(id => [id, 1])) };
  const freshPosts: unknown[] = [];
  await page.route('**/api/data*', route => {
    if (route.request().method() === 'POST') { freshPosts.push(route.request().postDataJSON()); return route.fulfill({ json: { ok: true, versions: fresh } }); }
    return route.fulfill({ json: { snapshot: { jobs: [...jobs.values()], expenses: [], goals: [], invoices: [], settings: saved, statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null }, versions: fresh, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } });
  });
  const readsBefore = reads();
  await page.reload();
  await expect.poll(reads).toBeGreaterThan(readsBefore);
  await page.waitForTimeout(800);
  await expect(titles).toHaveCount(2);
  expect(JSON.stringify(freshPosts)).not.toContain('ออกแบบโลโก้ร้านกาแฟ');
});

test('a sheet row that cannot be found is said, and the job is deleted from the app all the same', async ({ page }) => {
  const { deletes } = await open(page, { width: 1440, height: 900 }, ['sheets', 'sheetMap', 'sheetJobs'], { deleted: 0, notFound: 1 });
  const titles = page.locator('table tbody tr td:first-child p:first-child');
  await expect(titles).toHaveCount(3);
  const row = page.locator('table tbody tr').filter({ hasText: 'ออกแบบโลโก้ร้านกาแฟ' }).first();
  await row.hover();
  await row.getByRole('button', { name: /เมนู|ตัวเลือก|เพิ่มเติม/ }).first().click();
  await page.getByRole('menuitem', { name: 'ลบ' }).click();
  await page.getByRole('dialog', { name: 'ยืนยันการลบงาน' }).getByRole('button', { name: 'ยืนยัน' }).click();
  await expect(titles).toHaveCount(2);
  await expect.poll(() => deletes.length).toBe(1);
  await expect(page.getByText('ลบแถวในชีตไม่สำเร็จ').first()).toBeVisible();
  await expect(page.getByText('ไม่พบแถวที่ตรงกับรายการนี้ในชีต กรุณาตรวจและลบในชีตเอง').first()).toBeVisible();
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: 'test-results/labs-sheet-jobs-delete-not-found.png' });
});

// Owner, 2026-11-18: "ค่าใน Google Sheet กับค่าในโปรแกรมกูมันทำไมไม่เหมือนกัน ... กูอยากทำให้มันแบบเหมือนกัน".
test('a job added in the app goes into the sheet as a new row; a job from the sheet changed in the app is written over its own row', async ({ page }) => {
  const { saves, posts } = await open(page, { width: 1440, height: 900 }, ['sheets', 'sheetMap', 'sheetJobs', 'sheetWrite']);
  const titles = page.locator('table tbody tr td:first-child p:first-child');
  await expect(titles).toHaveCount(3);
  await page.getByRole('button', { name: 'เพิ่มงาน', exact: true }).first().click();
  await page.getByLabel('ชื่องาน / โปรเจกต์').fill('ถ่ายรูปเมนูใหม่');
  await page.getByLabel('มูลค่างาน').fill('2500');
  await page.getByRole('button', { name: 'บันทึกงาน' }).click();
  await expect(titles).toHaveCount(4);
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0]).toMatchObject({ kind: 'job', before: null, record: { name: 'ถ่ายรูปเมนูใหม่', value: 2500 } });
  // Linked to the row it went into, so the next reading of the sheet takes it as the same job.
  await expect.poll(() => JSON.stringify(posts)).toMatch(/"sheetLink":\{"fileId":"file-12345678","tab":"รายรับ","row":6,"gid":812,"wrote":"[a-z0-9]+"\}/);

  await titles.filter({ hasText: 'ออกแบบโลโก้ร้านกาแฟ' }).first().click();
  await expect(page.getByRole('heading', { name: 'แก้ไขงาน' })).toBeVisible();
  await page.getByLabel('มูลค่างาน').fill('5500');
  await page.getByRole('button', { name: 'บันทึกงาน' }).click();
  await expect.poll(() => saves.length).toBe(2);
  expect(saves[1]).toMatchObject({ kind: 'job', before: { kind: 'job', fileId: FILE.id, tab: 'รายรับ', row: 3, name: 'ออกแบบโลโก้ร้านกาแฟ', amount: 5000 }, record: { name: 'ออกแบบโลโก้ร้านกาแฟ', value: 5500 } });
  // Written over the row only once the app's own save had landed (owner, 2026-11-24): a computer reading the sheet in
  // between then finds 5,500 on the server too, instead of saving it over this save (บันทึกไม่สำเร็จ here).
  expect(saves[0].serverHad, 'the new job was saved before its row was written').toBe(2500);
  expect(saves[1].serverHad, 'the new amount was saved before the row was written').toBe(5500);
  await expect(page.getByText('บันทึกลงชีตไม่สำเร็จ')).toHaveCount(0);
});

// Owner, 2026-11-18: "ถ้ากูลบใน Google Sheet ออก ยอดในโปรแกรมก็ต้องออก".
test('a row deleted in the sheet takes its job out of the app; many rows gone at once wait for one tap', async ({ page }) => {
  const { reads, setRows } = await open(page, { width: 1440, height: 900 }, ['sheets', 'sheetMap', 'sheetJobs']);
  const titles = page.locator('table tbody tr td:first-child p:first-child');
  await expect(titles).toHaveCount(3);
  setRows(ROWS.filter(row => row[1]?.text !== 'ออกแบบโลโก้ร้านกาแฟ'));
  await page.clock.setFixedTime(new Date('2026-11-14T09:13:30+07:00'));
  const before = reads();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(reads).toBeGreaterThan(before);
  await expect(titles).toHaveCount(2);
  await expect(titles.filter({ hasText: 'ออกแบบโลโก้ร้านกาแฟ' })).toHaveCount(0);
  await expect(page.getByText('นำ 1 รายการที่ถูกลบในชีตออกจากแอปแล้ว').first()).toBeVisible();
});

test('many rows gone from the sheet at one reading: the jobs stay until ลบออกจากแอป is pressed', async ({ page }) => {
  const many = [ROWS[0], ...Array.from({ length: 8 }, (_, i) => [d('1/11/2569', '2026-11-01'), c(`งานรายเดือน ${i + 1}`), c('ร้านเอ'), c(String(1000 + i)), c('0'), c(String(1000 + i), { formula: true }), c('0'), c(''), c('')])];
  for (const device of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const { reads, setRows } = await open(page, device, ['sheets', 'sheetMap', 'sheetJobs'], undefined, many);
    const titles = device.width > 700 ? page.locator('table tbody tr td:first-child p:first-child') : page.locator('.ksm-jobtitle');
    await expect(titles).toHaveCount(9);
    setRows(many.slice(0, 2));
    await page.clock.setFixedTime(new Date('2026-11-14T09:14:30+07:00'));
    const before = reads();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(reads).toBeGreaterThan(before);
    const held = page.getByTestId('sheet-jobs-line-held');
    // Seven rows of the sheet, and the chat's job the app sent there by itself (its row went with the others).
    await expect(held).toContainText('ชีตไม่มี 8 รายการนี้แล้ว');
    await expect(titles).toHaveCount(9);
    expect(await textOverlapIssues(page)).toEqual([]);
    await expect(page.locator('#app-splash')).toBeHidden({ timeout: 10_000 });
    await held.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/labs-sheet-jobs-held-${device.width}.png` });
    await held.getByRole('button', { name: 'ลบออกจากแอป' }).click();
    await expect(titles).toHaveCount(1);
    await expect(held).toHaveCount(0);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
});

// Owner, 2026-11-18 ("ทำไมรายจ่ายไม่เห็นขึ้น"): records made in the app before the sheet was connected go there by themselves.
test('jobs not in the sheet yet are sent there by themselves, the oldest first, and linked to their rows', async ({ page }) => {
  const older = { ...chatJob, id: 'app-old-1', name: 'ออกแบบเมนูร้านก๋วยเตี๋ยว', client: 'ร้านเจ๊หมวย', value: 1800, postDate: '2026-09-02', payDate: '2026-09-12' };
  const newer = { ...chatJob, id: 'app-old-2', name: 'ถ่ายรูปงานบวช', client: 'คุณแป้ง', value: 4200, postDate: '2026-10-05', payDate: '2026-10-15' };
  const { batches, posts } = await open(page, { width: 1440, height: 900 }, ['sheets', 'sheetMap', 'sheetJobs', 'sheetWrite'], undefined, ROWS, [newer, older]);
  await expect.poll(() => batches.length).toBe(1);
  expect(batches[0].kind).toBe('job');
  expect(batches[0].records.map(record => record.name)).toEqual(['ออกแบบเมนูร้านก๋วยเตี๋ยว', 'ถ่ายรูปงานบวช']);
  await expect(page.getByRole('dialog', { name: 'ส่งรายการลงชีต' })).toHaveCount(0);
  await expect(page.getByText('เพิ่ม 2 รายการต่อท้ายแท็บ รายรับ').first()).toBeVisible();
  await expect.poll(() => JSON.stringify(posts)).toMatch(/"sheetLink":\{"fileId":"file-12345678","tab":"รายรับ","row":7,"gid":812,"wrote":"[a-z0-9]+"\}/);
  await expect(page.getByTestId('sheet-jobs-line-copy')).toHaveCount(0);
  // Read again: the two are in the sheet now, nothing is sent twice.
  await page.clock.setFixedTime(new Date('2026-11-14T09:14:30+07:00'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(800);
  expect(batches.length).toBe(1);
});

// Owner, 2026-11-18: "เอาตัวอย่างออกด้วยดิ ... ใน Google Sheet อ่ะเอามาทำไม".
test('a sheet made with example rows: they never become jobs, and the app takes them out of the sheet by itself', async ({ page }) => {
  const example = [d('05/02/2026', '2026-02-05'), c('รีวิวสินค้า 2 คลิป'), c('บริษัท ตัวอย่างมีเดีย จำกัด (ตัวอย่าง)'), c('12,000'), c('360'), c('11,640', { formula: true }), c('0'), c(''), c('')];
  const withExamples = [ROWS[0], example, ...ROWS.slice(1)];
  const { reads, deletedExamples } = await open(page, { width: 1440, height: 900 }, ['sheets', 'sheetMap', 'sheetJobs', 'sheetWrite'], undefined, withExamples);
  const titles = page.locator('table tbody tr td:first-child p:first-child');
  await expect(titles).toHaveCount(3);
  await expect(titles.filter({ hasText: 'รีวิวสินค้า 2 คลิป' })).toHaveCount(0);
  await expect.poll(deletedExamples).toBe(1);
  await expect.poll(reads).toBeGreaterThan(1);
  await expect(page.getByTestId('sheet-jobs-line-examples')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'ลบแถวตัวอย่างในชีต' })).toHaveCount(0);
  await expect(titles).toHaveCount(3);
});

test('without the feature the jobs page is as before and the sheet is never read', async ({ page }) => {
  const { reads } = await open(page, { width: 1440, height: 900 }, ['sheets', 'sheetMap']);
  await expect(page.locator('table tbody tr')).toHaveCount(1);
  await expect(page.getByTestId('sheet-jobs-line')).toHaveCount(0);
  await page.locator('table tbody tr').first().click();
  await expect(page.getByRole('heading', { name: 'แก้ไขงาน' })).toBeVisible();
  await expect(page.getByTestId('sheet-row-line')).toHaveCount(0);
  expect(reads()).toBe(0);
});
