import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { answersComplete, profileFromAnswers, readBusinessProfile, templateFor, EMPTY_BUSINESS, type BusinessAnswers, type BusinessProfile } from '../shared/businessProfile';
import { filingsForMonth, filingReminders, filingNotices, readFiled, shiftToWorkingDay, toggleFiled, FILED_MAX, lastDay } from '../shared/filingCalendar';
import { buildBookTemplate, TEMPLATE_INFO } from '../shared/bookTemplates';
import { buildXlsx, columnLetter, excelDate, safeSheetName } from '../shared/xlsxWriter';
import { validateChanges } from '../shared/validation';
import { safeLineDestination } from '../shared/lineDestination';
import { createFilingReminderHandler, bangkokDate, buildFilingMessage, FILING_SEND_BUDGET, type FilingAccount, type FilingDependencies } from '../backend/src/handlers/send-filing-reminder';
import { quickKind, quickAnswer } from '../backend/src/ai/quickAnswers';

// ฟีเจอร์ทดลอง, phase 1 (owner, 2026-11-12): the six business questions, the filing calendar (dates kept as rules, moved off
// holidays, the online extension until 31 Jan 2570), the five bookkeeping workbooks, the LINE reminder and เลขา's answer.

const answers = (patch: Partial<BusinessAnswers>): BusinessAnswers => ({ ...EMPTY_BUSINESS, ...patch });
const profile = (patch: Partial<BusinessAnswers>): BusinessProfile => profileFromAnswers(answers({ vat: 'no', work: 'design', revenue: 'under_1m', paysNone: true, ...patch }), new Date('2026-11-12T03:00:00Z'))!;
const production = profile({ entity: 'company', vat: 'yes', work: 'production', pays: ['freelancers', 'employees'], paysNone: false, revenue: 'over_1_8m' });
const tutor = profile({ entity: 'individual', income: 'own_business', work: 'teacher' });
const coach = profile({ entity: 'individual', income: 'per_job', work: 'coach' });

test('business questions: the income question is asked of individuals only, and the answers pick the template', () => {
  assert.equal(answersComplete(answers({ entity: 'individual', vat: 'no', work: 'coach', paysNone: true, revenue: 'under_1m' })), false, 'income not answered');
  assert.equal(answersComplete(answers({ entity: 'company', vat: 'yes', work: 'agency', paysNone: true, revenue: 'over_1_8m' })), true, 'companies are not asked');
  assert.equal(answersComplete(answers({ entity: 'company', vat: 'yes', work: 'agency', revenue: 'over_1_8m' })), false, '"pays" needs an answer, even "no one"');
  assert.equal(production.income, 'own_business');
  assert.deepEqual(production.pays, ['freelancers', 'employees']);
  assert.equal(templateFor(coach), 'freelance');
  assert.equal(templateFor(profile({ entity: 'individual', income: 'both', vat: 'yes' })), 'freelance_vat');
  assert.equal(templateFor(profile({ entity: 'individual', income: 'both', vat: 'unsure' })), 'freelance');
  assert.equal(templateFor(profile({ entity: 'partnership', work: 'agency' })), 'agency');
  assert.equal(templateFor(production), 'production');
  assert.equal(templateFor(profile({ entity: 'accounting_office' })), 'office');
  assert.equal(readBusinessProfile({ ...production, entity: 'bank' }), null);
  assert.equal(readBusinessProfile(null), null);
  assert.deepEqual(readBusinessProfile(JSON.parse(JSON.stringify(production))), production);
});

test('settings keep the answers and the ยื่นแล้ว marks, and refuse anything else in them', () => {
  const settings = { monthlyExpense: 0, monthlyRevenueGoal: 0, savingsPercentage: 0, business: production, filed: { 'pnd3:2026-10': '2026-11-09T02:00:00.000Z' } };
  const save = (data: unknown) => validateChanges([{ table: 'cashflow_documents', id: 'settings', op: 'set', version: 3, data }]);
  assert.doesNotThrow(() => save(settings));
  assert.throws(() => save({ ...settings, filed: { 'bad key': 'x' } }));
  assert.throws(() => save({ ...settings, business: { ...production, vat: 'maybe' } }));
});

test('filing calendar: dates are moved off weekends and holidays, as the Revenue Department does', () => {
  // ภ.ง.ด.50 for 2568: Sat 30 May 2569 → Tue 2 Jun on paper (Mon 1 Jun is a holiday); Sun 7 Jun → Mon 8 Jun online.
  const june = filingsForMonth(production, 2026, 6);
  const pnd50 = june.find(item => item.form === 'pnd50')!;
  assert.deepEqual([pnd50.paper, pnd50.online, pnd50.period], ['2026-06-02', '2026-06-08', 'รอบบัญชี 2568']);
  assert.equal(june.find(item => item.form === 'fs')!.paper, '2026-06-02', 'DBD accepted 2 Jun 2569');
  // 7 Nov 2569 is a Saturday.
  const pnd3 = filingsForMonth(production, 2026, 11).find(item => item.form === 'pnd3')!;
  assert.deepEqual([pnd3.key, pnd3.paper, pnd3.online, pnd3.period], ['pnd3:2026-10', '2026-11-09', '2026-11-16', 'งวด ต.ค. 2569']);
  assert.equal(shiftToWorkingDay('2026-04-13'), '2026-04-16', 'Songkran');
});

test('filing calendar: the online extension ends with returns due on paper by 31 Jan 2570', () => {
  const january = filingsForMonth(production, 2027, 1).find(item => item.form === 'pp30')!;
  assert.equal(january.online, '2027-01-25', 'งวด ธ.ค. 2569: 23 Jan 2570 is a Saturday');
  const february = filingsForMonth(production, 2027, 2).find(item => item.form === 'pnd3')!;
  assert.equal(february.online, null);
  assert.match(february.note ?? '', /ยังไม่มีประกาศขยายเวลา/);
  assert.equal(filingsForMonth(tutor, 2027, 3).find(item => item.form === 'pnd90')!.online, null, 'ปีภาษี 2569: no online date announced yet');
  assert.equal(filingsForMonth(tutor, 2026, 3).find(item => item.form === 'pnd90')!.online, '2026-04-08');
});

test('filing calendar: who files what', () => {
  const forms = (p: BusinessProfile, y: number, m: number) => filingsForMonth(p, y, m).map(item => item.form).sort();
  assert.deepEqual(forms(production, 2026, 11), ['pnd1', 'pnd3', 'pnd53', 'pp30', 'sso']);
  assert.deepEqual(forms(coach, 2026, 11), [], 'a coach paid per job, not VAT registered, paying no one');
  assert.deepEqual(forms(tutor, 2026, 9), ['pnd94'], '40(8) files the half-year return');
  assert.deepEqual(forms(coach, 2026, 9), [], '40(2) only: no ภ.ง.ด.94');
  assert.deepEqual(forms(profile({ entity: 'individual', income: 'per_job', vat: 'yes' }), 2026, 11), ['pp30']);
  assert.equal(filingsForMonth(production, 2026, 11).find(item => item.form === 'pnd3')!.when, 'ยื่นเฉพาะเดือนที่หักภาษี ณ ที่จ่ายไว้');
  assert.ok(filingsForMonth(profile({ entity: 'accounting_office' }), 2026, 11).every(item => item.forClients), 'an office sees its clients\' returns');
  assert.deepEqual(filingNotices(profile({ entity: 'individual', income: 'unsure', revenue: 'over_1_8m' })).map(n => n.id), ['register_vat', 'income_unsure']);
});

test('filing reminders: three days before the paper date and on the last day; ยื่นแล้ว stops them', () => {
  assert.deepEqual(filingReminders(production, '2026-11-06').map(r => `${r.kind}:${r.item.key}`).sort(), ['soon:pnd1:2026-10', 'soon:pnd3:2026-10', 'soon:pnd53:2026-10']);
  assert.deepEqual(filingReminders(production, '2026-11-16').map(r => `${r.kind}:${r.item.key}`).sort(), ['today:pnd1:2026-10', 'today:pnd3:2026-10', 'today:pnd53:2026-10']);
  assert.deepEqual(filingReminders(production, '2026-11-16', { 'pnd3:2026-10': 'x' }).map(r => r.item.key).sort(), ['pnd1:2026-10', 'pnd53:2026-10']);
  assert.deepEqual(filingReminders(coach, '2026-11-06'), []);
  const marks = toggleFiled({}, 'pnd3:2026-10', true, new Date('2026-11-09T02:00:00Z'));
  assert.deepEqual(readFiled(marks), { 'pnd3:2026-10': '2026-11-09T02:00:00.000Z' });
  assert.deepEqual(toggleFiled(marks, 'pnd3:2026-10', false), {});
  let many: Record<string, string> = {};
  for (let i = 0; i < FILED_MAX + 5; i += 1) many = toggleFiled(many, `pp30:${2000 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`, true, new Date(Date.UTC(2026, 0, 1, 0, i)));
  assert.equal(Object.keys(many).length, FILED_MAX, 'the oldest marks go first');
});

test('workbooks: each business gets its template with the tabs the plan lists, examples or the app\'s own records', () => {
  for (const [p, id] of [[coach, 'freelance'], [profile({ entity: 'individual', income: 'both', vat: 'yes' }), 'freelance_vat'], [profile({ entity: 'partnership', work: 'agency' }), 'agency'], [production, 'production'], [profile({ entity: 'accounting_office' }), 'office']] as const) {
    const built = buildBookTemplate(p, { year: 2026, now: new Date('2026-11-12T03:00:00Z') });
    assert.equal(built.id, id);
    const names = built.sheets.map(sheet => sheet.name);
    const expected = TEMPLATE_INFO[id].tabs.filter(tab => id !== 'freelance' || tab !== 'รายงานเงินสดรับ-จ่าย');
    for (const tab of expected) assert.ok(names.includes(tab), `${id}: ${tab}`);
    assert.equal(names[0], 'วิธีใช้');
    assert.match(built.fileName, /^ชีตบัญชี_.+_2569_1112\.xlsx$/);
    const settings = built.sheets.find(sheet => sheet.name === 'ตั้งค่า')!;
    assert.equal((settings.rows[2][1] as { v: number }).v, 2569, 'the year the formulas read is B3');
  }
  assert.ok(buildBookTemplate(tutor, { year: 2026 }).sheets.some(sheet => sheet.name === 'รายงานเงินสดรับ-จ่าย'), '40(8) keeps the cash report the law requires');
  assert.ok(!buildBookTemplate(coach, { year: 2026 }).sheets.some(sheet => sheet.name === 'รายงานเงินสดรับ-จ่าย'));
  const withData = buildBookTemplate(coach, { year: 2026, data: { income: [{ date: '2026-03-01', payer: 'ลูกค้า ก', item: 'ตัดต่อ', gross: 10000, whtRate: 0.03, received: true }], expenses: [] } });
  const income = withData.sheets.find(sheet => sheet.name === 'รายรับ')!;
  assert.equal(income.rows[1][1], 'ลูกค้า ก', 'the record replaces the examples');
  assert.equal(income.rows[1][6], '3%');
  assert.match(String((income.rows[1][7] as { f: string }).f), /ROUND\(F2\*IF\(ISNUMBER\(G2\)/, 'withheld tax is a formula');
  assert.equal(income.rows.length, 201, '200 rows ready');
  assert.ok(income.validations!.some(v => v.range === 'G2:G5000' && v.list.includes('3%')), 'drop-downs reach the rows added below the 200');
});

test('xlsx: a real workbook with styles, frozen headers, drop-downs and Thai tab names', () => {
  assert.deepEqual([columnLetter(0), columnLetter(25), columnLetter(26), columnLetter(51)], ['A', 'Z', 'AA', 'AZ']);
  assert.equal(excelDate('2026-01-01'), 46023);
  assert.equal(safeSheetName('งบ/จริง: [ทดลอง]*'), 'งบ จริง   ทดลอง');
  const built = buildBookTemplate(production, { year: 2026 });
  const files = unzipSync(buildXlsx(built.sheets, { title: 'ทดลอง' }));
  for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml']) assert.ok(files[part], part);
  const workbook = strFromU8(files['xl/workbook.xml']);
  assert.match(workbook, /name="เงินทดรอง"/);
  const jobs = strFromU8(files['xl/worksheets/sheet3.xml']);
  assert.match(jobs, /state="frozen"/);
  assert.match(jobs, /<dataValidation type="list"[^>]*sqref="D2:D5000"><formula1>"TVC,ออนไลน์,ภาพนิ่ง,อีเวนต์,MV"<\/formula1>/);
  // Quotes inside a formula are written as &quot; (XML); the spreadsheet reads them back as quotes.
  assert.match(jobs, /<f>IF\(A2=&quot;&quot;,&quot;&quot;,SUMIFS\('งบโปรดักชัน'!\$G\$2:\$G\$5000/);
  assert.match(strFromU8(files['xl/styles.xml']), /FFE65F2B/, 'the brick header');
});

test('LINE: the reminder goes to test accounts with the calendar on, once a day, within its budget', async () => {
  const today = '2026-11-06';
  const account = (id: string, patch: Partial<FilingAccount> = {}): FilingAccount => ({ user_id: id, settings: { business: production }, notif_settings: { enabled: true, lineUserId: `U${id}` }, ...patch });
  const claims = new Set<string>(); const sent: string[] = []; const released: string[] = [];
  const deps = (accounts: FilingAccount[], outcome: 'accepted' | 'rejected' = 'accepted'): FilingDependencies => ({
    now: () => new Date('2026-11-06T01:05:00Z'), cronSecret: () => 'secret', listAccounts: async () => accounts,
    claim: async key => (claims.has(key) ? false : (claims.add(key), true)), release: async key => { released.push(key); claims.delete(key); },
    send: async (lineUserId, message) => { sent.push(`${lineUserId}:${(message as { altText: string }).altText}`); return outcome; }, log: () => {},
  });
  const run = async (d: FilingDependencies, auth = 'Bearer secret') => {
    let status = 200; let body: any;
    const res: any = { setHeader() {}, status(code: number) { status = code; return res; }, json(value: unknown) { body = value; return res; } };
    await createFilingReminderHandler(d)({ method: 'GET', headers: { authorization: auth } } as any, res);
    return { status, body };
  };
  assert.equal(bangkokDate(new Date('2026-11-05T18:00:00Z')), today, '01:00 in Bangkok');
  assert.equal((await run(deps([account('a')]), 'Bearer nope')).status, 401);
  const first = await run(deps([account('a'), account('b', { notif_settings: { enabled: false, lineUserId: 'Ub' } }), account('c', { settings: { business: coach } }), account('d', { settings: null })]));
  assert.deepEqual([first.body.sent, first.body.skipped], [1, 3]);
  assert.match(sent[0], /^Ua:ใกล้ถึงกำหนดยื่นแบบ: ภ.ง.ด.1 งวด ต.ค. 2569/);
  assert.equal((await run(deps([account('a')]))).body.sent, 0, 'once a day');
  const refused = await run(deps([account('e')], 'rejected'));
  assert.equal(refused.body.sent, 0);
  assert.deepEqual(released, [`filing:e:${today}`], 'a refused push can be tried again');
  const crowd = Array.from({ length: 20 }, (_, i) => account(`z${i}`));
  const limited = await run(deps(crowd));
  assert.equal(limited.body.sent, FILING_SEND_BUDGET / 2);
  assert.equal(limited.body.deferred, 20 - FILING_SEND_BUDGET / 2);
  const card = JSON.stringify(buildFilingMessage(filingReminders(production, '2026-11-16'), '2026-11-16'));
  assert.match(card, /วันนี้วันสุดท้ายยื่นแบบ/);
  assert.match(card, /ไม่ได้ยื่นแบบแทนคุณ/);
});

test('LINE links may open the calendar on its ยื่นภาษี view', () => {
  assert.equal(safeLineDestination('/calendar?view=tax'), '/calendar?view=tax&from=line');
  assert.equal(safeLineDestination('/calendar?view=other'), '/calendar?from=line');
});

test('เลขา: "เดือนนี้ต้องยื่นอะไรบ้าง" is answered from the calendar, with no model call', () => {
  for (const text of ['เดือนนี้ต้องยื่นอะไรบ้างครับ', 'ต้องยื่นภาษีอะไรบ้าง', 'ช่วงนี้ต้องยื่นแบบอะไร', 'ปฏิทินยื่นภาษี']) assert.equal(quickKind(text), 'filing', text);
  assert.equal(quickKind('ยื่นภาษียังไง'), null, 'a how-to question goes to the AI');
  const user = { user_id: 'u', settings: { business: production } } as any;
  const reply = quickAnswer('filing', user, new Date('2026-11-01T02:00:00Z'));
  assert.match(reply, /\*\*ภ\.ง\.ด\.3\*\* งวด ต\.ค\. 2569 — กระดาษ 9 พ\.ย\. · ออนไลน์ 16 พ\.ย\./);
  assert.match(reply, /\(\/calendar\?view=tax\)/);
  assert.match(quickAnswer('filing', { user_id: 'u', settings: {} } as any), /ตอบ 6 ข้อ/);
  assert.equal(lastDay(filingsForMonth(production, 2026, 11)[0]) >= '2026-11-09', true);
});
