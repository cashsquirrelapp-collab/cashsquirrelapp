import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { CARD_CONSENT_VERSION } from '../shared/cardConsent.js';
import { PRO_MONTH_REGULAR_FROM, PRO_PERIODS, PRO_SOLD_AT, proPricing } from '../shared/proPricing.js';
// The 25 Oct fix was written for the promotion's prices; those tests read them at a moment of the promotion.
const PRO_PRICING = proPricing(PRO_MONTH_REGULAR_FROM - 1);
const DECEMBER = 'supabase/migrations/20261025210000_pro_month_regular_price.sql';

// Package 69 (2026-10-25) charges the prices with the payment fee, but the database still reserved orders at the old
// amounts, so checkout refused every new order. 20261025170000_pro_amounts_with_fee.sql moves the database; this runs it
// on a real Postgres (PGlite) after every earlier billing migration, the way the live database got them.
const uid = '11111111-1111-4111-8111-111111111111';
const fix = 'supabase/migrations/20261025170000_pro_amounts_with_fee.sql';

async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('${uid}');
    create table cashflow_user_roles(user_id uuid primary key,role text); insert into cashflow_user_roles values('${uid}','user');
    create table subscriptions(user_id uuid primary key,stripe_customer_id text,stripe_subscription_id text,status text,plan text,current_period_end timestamptz,updated_at timestamptz default now());
    create table cashflow_account_pauses(user_id uuid primary key);
    create table cashflow_payment_events(event_id text primary key,created_at timestamptz);
    create table cashflow_payments(payment_id text primary key,user_id uuid,amount bigint,currency text,paid_at timestamptz,refunded boolean);`);
  for (const name of ['020_stripe_subscriptions.sql', '021_secure_stripe_billing_upgrade.sql', '022_fix_stripe_checkout_null_legacy.sql', '023_preserve_manual_subscription_entitlements.sql', '024_promptpay_qr_billing.sql'])
    await db.exec(await readFile(`database/migrations/${name}`, 'utf8'));
  for (const name of ['20261020144448_krarok_prepaid_plans.sql', '20261020155537_admin_pro_controls.sql', '20261020165518_direct_promptpay.sql',
    '20261020172734_custom_card_renewals.sql', '20261022040000_card_consent_v2.sql', '20261024090000_card_consent_v3.sql'])
    await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'));
  await db.exec('grant usage on schema public to service_role; grant select on cashflow_user_roles,cashflow_account_pauses to service_role; grant select,insert,update on subscriptions to service_role;');
  return db;
}
const reserve = (db: PGlite, period: string, order = 'order') =>
  db.query<{ r: { result: string } }>(`select cashflow_reserve_prepaid_checkout($1,$2,$3,'card','price1',false) r`, [uid, order, period]);
const orderRow = async (db: PGlite, id = 'order') => (await db.query<any>('select * from cashflow_prepaid_orders where id=$1', [id])).rows[0];

test('before the fix: the database reserves the old amounts (what refused every checkout since package 69)', async () => {
  const db = await database();
  try {
    await reserve(db, 'month');
    assert.equal(Number((await orderRow(db)).amount), 15900);
    assert.notEqual(15900, PRO_PRICING.month.total * 100);
  } finally { await db.close(); }
});

test('the fix: new orders at ฿177 / ฿895 / ฿1,562; orders bought earlier stay valid; nothing else is accepted', async () => {
  const db = await database();
  try {
    // An order paid at ฿159 before the change, still on the table.
    await db.exec(`insert into cashflow_prepaid_orders(id,user_id,period,months,amount,method,price_id,livemode,expires_at,status,payment_id,paid_at,entitled_until)
      values('earlier','${uid}','month',1,15900,'card','price0',false,now()-interval '3 days','paid','pi_old',now()-interval '3 days',now()+interval '27 days')`);
    await db.exec(await readFile(fix, 'utf8'));
    await db.exec(await readFile(fix, 'utf8')); // running it twice changes nothing
    const earlier = await orderRow(db, 'earlier');
    assert.deepEqual([Number(earlier.amount), earlier.status], [15900, 'paid'], 'earlier orders are not changed');
    for (const period of PRO_PERIODS) {
      assert.equal((await reserve(db, period, `order_${period}`)).rows[0].r.result, 'reserved');
      const row = await orderRow(db, `order_${period}`);
      assert.deepEqual([Number(row.amount), row.months], [PRO_PRICING[period].total * 100, PRO_PRICING[period].months], period);
      await db.query('select cashflow_release_billing_checkout($1,$2)', [uid, `order_${period}`]);
    }
    // The rule lists exactly the amounts each period had been sold at by then.
    const soldBy25Oct = { month: [159, 177], halfYear: [849, 895], year: [1490, 1562] } as const;
    for (const period of PRO_PERIODS) for (const baht of soldBy25Oct[period]) {
      await db.exec(`insert into cashflow_prepaid_orders(id,user_id,period,months,amount,method,price_id,livemode,expires_at)
        values('check_${period}_${baht}','${uid}','${period}',${PRO_PRICING[period].months},${baht * 100},'card','p',false,now())`);
    }
    for (const [period, months, amount] of [['month', 1, 20000], ['month', 6, 17700], ['year', 12, 89500], ['halfYear', 6, 0]] as const) {
      await assert.rejects(db.exec(`insert into cashflow_prepaid_orders(id,user_id,period,months,amount,method,price_id,livemode,expires_at)
        values('bad_${period}_${amount}','${uid}','${period}',${months},${amount},'card','p',false,now())`), `${period} ${months} ${amount}`);
    }
  } finally { await db.close(); }
});

test('the fix: a card checkout at ฿177 goes from reservation to paid', async () => {
  const db = await database();
  try {
    await db.exec(await readFile(fix, 'utf8'));
    await reserve(db, 'month');
    await db.query(`select cashflow_bind_stripe_customer($1,'order','cus1',false)`, [uid]);
    const metadata = { period: 'month', months: '1', checkout_reservation_id: 'order', auto_renew: 'false', save_card: 'false', consent_version: CARD_CONSENT_VERSION, payment_flow: 'custom_card' };
    await db.query(`select cashflow_prepare_prepaid_checkout('order',$1,'cus1',$2)`, [uid, JSON.stringify({ mode: 'payment', customer: 'cus1', client_reference_id: uid, metadata, line_items: [{ price: 'price1', quantity: 1 }] })]);
    const pay = (amount: number) => db.query<any>(`select cashflow_fulfill_prepaid('order',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) r`,
      [uid, 'cs1', 'cus1', 'pi1', false, amount, 'thb', 'month', 1, new Date().toISOString(), false]);
    await assert.rejects(pay(15900), 'the old amount does not pay a new order');
    await pay(17700);
    const row = await orderRow(db);
    assert.deepEqual([row.status, Number(row.amount)], ['paid', 17700]);
  } finally { await db.close(); }
});

test('the newest SQL that reserves orders matches the prices the app charges on both dates (catches the next price change)', async () => {
  const files = (await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
  const texts = await Promise.all(files.map(name => readFile(`supabase/migrations/${name}`, 'utf8')));
  const reserving = texts.filter(text => /function public\.cashflow_reserve_prepaid_checkout/.test(text)).at(-1)!;
  assert.match(reserving, /\('month',1,public\.cashflow_pro_month_amount\(now\(\)\)\)/, 'a month is reserved at the price of the moment');
  const fixed = [...reserving.matchAll(/\('(halfYear|year)',(\d+),(\d+)\)/g)].map(m => [m[1], Number(m[2]), Number(m[3])]);
  for (const at of [PRO_MONTH_REGULAR_FROM - 1, PRO_MONTH_REGULAR_FROM]) {
    assert.deepEqual(fixed, (['halfYear', 'year'] as const).map(period => [period, proPricing(at)[period].months, proPricing(at)[period].total * 100]));
  }
  const db = await database();
  try {
    await db.exec(await readFile(fix, 'utf8'));
    await db.exec(await readFile(DECEMBER, 'utf8'));
    for (const at of [PRO_MONTH_REGULAR_FROM - 1000, PRO_MONTH_REGULAR_FROM, PRO_MONTH_REGULAR_FROM + 86_400_000]) {
      const amount = (await db.query<{ a: string }>('select public.cashflow_pro_month_amount($1)::text a', [new Date(at).toISOString()])).rows[0].a;
      assert.equal(Number(amount), proPricing(at).month.total * 100, new Date(at).toISOString());
    }
  } finally { await db.close(); }
  const rule = texts.filter(text => /cashflow_prepaid_orders_amount_check/.test(text)).at(-1)!;
  for (const period of PRO_PERIODS) {
    const listed = new RegExp(`period = '${period}' and months = ${PRO_PRICING[period].months} and amount in \\(([^)]*)\\)`).exec(rule)?.[1];
    assert.deepEqual(listed?.split(',').map(value => Number(value.trim())), PRO_SOLD_AT[period].map(baht => baht * 100), period);
  }
});

// ---------- 1 Dec 2569: the regular monthly price (owner, 2026-10-25) ----------
async function december() {
  const db = await database();
  await db.exec(await readFile(fix, 'utf8'));
  await db.exec(await readFile(DECEMBER, 'utf8'));
  await db.exec(await readFile(DECEMBER, 'utf8')); // safe to run twice
  return db;
}
const v4 = 'krarok-card-20261025-v4';
async function prepareCard(db: PGlite, metadata: Record<string, string>, order = 'order') {
  await db.query(`select cashflow_bind_stripe_customer($1,$2,'cus1',false)`, [uid, order]);
  const full = { period: 'month', months: '1', checkout_reservation_id: order, auto_renew: 'true', save_card: 'true', consent_version: v4, payment_flow: 'custom_card',
    consent_text: 'ยินยอมต่ออายุ Pro อัตโนมัติ ฿177/เดือน ถึงวันที่ 30 พ.ย. 2569 จากนั้น ฿271/เดือน', ...metadata };
  return db.query(`select cashflow_prepare_prepaid_checkout($1,$2,'cus1',$3)`, [order, uid,
    JSON.stringify({ mode: 'subscription', customer: 'cus1', client_reference_id: uid, metadata: full, subscription_data: { metadata: full }, line_items: [{ price: 'price1', quantity: 1 }] })]);
}

test('1 Dec SQL: new monthly orders at the price of the moment; ฿271 allowed on orders; consent v4 with the step accepted only as agreed', async () => {
  const db = await december();
  try {
    await reserve(db, 'month');
    assert.equal(Number((await orderRow(db)).amount), proPricing().month.total * 100, 'today\'s monthly price');
    await db.exec(`insert into cashflow_prepaid_orders(id,user_id,period,months,amount,method,price_id,livemode,expires_at)
      values('regular','${uid}','month',1,27100,'card','p',false,now())`);
    if (proPricing().month.total === 177) {
      // During the promotion: a monthly renewal may record the step to ฿271 from 1 Dec, exactly.
      await assert.rejects(prepareCard(db, { renewal_step_amount: '30000', renewal_step_from: '2026-12-01' }), 'only the regular amount');
      await assert.rejects(prepareCard(db, { renewal_step_amount: '27100', renewal_step_from: '2026-11-15' }), 'only from 1 Dec');
      await prepareCard(db, { renewal_step_amount: '27100', renewal_step_from: '2026-12-01' });
      const request = (await orderRow(db)).request;
      assert.deepEqual([request.metadata.consent_version, request.metadata.renewal_step_amount], [v4, '27100']);
    }
  } finally { await db.close(); }
});

test('1 Dec SQL: a renewal is recorded at ฿271 only for a promotion month that agreed to it, for a period from 1 Dec on', async () => {
  const db = await december();
  try {
    // The ledger checks a renewal is not in the future, so this runs the same function with the clock at 15 Dec 2569.
    const source = (await readFile(DECEMBER, 'utf8'));
    const body = source.slice(source.indexOf('create or replace function public.cashflow_record_card_cycle'), source.indexOf('commit;'));
    await db.exec(body.replace(/now\(\)/g, "timestamptz '2026-12-15 03:00:00+00'"));
    const second = '33333333-3333-4333-8333-333333333333';
    await db.exec(`insert into auth.users values('${second}')`);
    const owners: Record<string, string> = { stepped: uid, plain: second };
    const order = async (id: string, metadata: Record<string, string>) => {
      await db.exec(`insert into cashflow_prepaid_orders(id,user_id,period,months,amount,method,price_id,livemode,expires_at,status,request,created_at)
        values('${id}','${owners[id]}','month',1,17700,'card','price1',false,now()+interval '1 hour','subscribed',
        '${JSON.stringify({ metadata: { auto_renew: 'true', consent_version: v4, ...metadata } })}'::jsonb,'2026-11-10T03:00:00Z')`);
      await db.exec(`insert into cashflow_card_subscriptions(subscription_id,order_id,user_id,status) values('sub_${id}','${id}','${owners[id]}','active')`);
    };
    await order('stepped', { renewal_step_amount: '27100', renewal_step_from: '2026-12-01' });
    await order('plain', {});
    const cycle = (id: string, invoice: string, amount: number, start: string, end: string) => db.query(`select cashflow_record_card_cycle($1,$2,$3,$4,$5,$6,'thb',false,$7,$8,false)`,
      [id, owners[id], `sub_${id}`, invoice, `pi_${invoice}`, amount, start, end]);
    await cycle('stepped', 'in_nov', 17_700, '2026-11-10T03:00:00Z', '2026-12-10T03:00:00Z');
    await assert.rejects(cycle('stepped', 'in_early', 27_100, '2026-11-10T03:00:00Z', '2026-12-10T03:00:00Z'), 'not before 1 Dec');
    await cycle('stepped', 'in_dec', 27_100, '2026-12-10T03:00:00Z', '2027-01-10T03:00:00Z');
    await cycle('stepped', 'in_dec_old', 17_700, '2026-12-10T03:00:00Z', '2027-01-10T03:00:00Z');
    await assert.rejects(cycle('plain', 'in_plain', 27_100, '2026-12-10T03:00:00Z', '2027-01-10T03:00:00Z'), 'never without the agreement');
    await assert.rejects(cycle('stepped', 'in_more', 30_000, '2026-12-10T03:00:00Z', '2027-01-10T03:00:00Z'), 'never another amount');
    const recorded = (await db.query<{ invoice_id: string }>('select invoice_id from cashflow_card_cycles order by invoice_id')).rows.map(row => row.invoice_id);
    assert.deepEqual(recorded, ['in_dec', 'in_dec_old', 'in_nov']);
  } finally { await db.close(); }
});
