import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const manual = '11111111-1111-4111-8111-111111111111';
const refundFirst = '22222222-2222-4222-8222-222222222222';
const paidOnly = '33333333-3333-4333-8333-333333333333';
const grant = '44444444-4444-4444-8444-444444444444';
const revoked = '55555555-5555-4555-8555-555555555555';
const fresh = '66666666-6666-4666-8666-666666666666';
const manualDeadline = '2027-09-23T00:00:00.000Z';

async function databaseThrough022(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table subscriptions(
      user_id uuid primary key,stripe_customer_id text,stripe_subscription_id text,
      status text,plan text,current_period_end timestamptz,updated_at timestamptz default now()
    );
    create table cashflow_account_pauses(user_id uuid primary key);
    create table cashflow_payment_events(event_id text primary key,created_at timestamptz);
    create table cashflow_payments(
      payment_id text primary key,user_id uuid,amount bigint,currency text,
      paid_at timestamptz,refunded boolean
    );
    insert into subscriptions(user_id,status,plan,current_period_end) values
      ('${manual}','active','pro_manual','${manualDeadline}'),
      ('${refundFirst}','active','pro_manual','${manualDeadline}'),
      ('${paidOnly}','inactive','pro_monthly',null),
      ('${grant}','active','admin_grant',null),
      ('${revoked}','canceled','admin_revoked',null);
  `);
  for (const file of ['020_stripe_subscriptions.sql', '021_secure_stripe_billing_upgrade.sql', '022_fix_stripe_checkout_null_legacy.sql']) {
    await db.exec(await readFile(`database/migrations/${file}`, 'utf8'));
  }
  return db;
}

async function apply023(db: PGlite): Promise<void> {
  await db.exec(await readFile('database/migrations/023_preserve_manual_subscription_entitlements.sql', 'utf8'));
}

async function row(db: PGlite, userId: string): Promise<Record<string, any>> {
  return (await db.query<Record<string, any>>('select * from subscriptions where user_id=$1', [userId])).rows[0];
}

async function payment(db: PGlite, userId: string, paymentId: string, refund = false, paidAt = '2026-09-01T00:00:00Z'): Promise<void> {
  await db.query("select cashflow_process_payment($1,$2,$3,14900,'thb',$4,$5)", [
    `evt-${paymentId}-${refund ? 'refund' : 'paid'}`, paymentId, userId, paidAt, refund,
  ]);
}

test('pre-023 reproducer: delayed 149 payment or refund erases a separately manual paid deadline', async () => {
  const db = await databaseThrough022();
  try {
    assert.equal(new Date((await row(db, manual)).current_period_end).toISOString(), manualDeadline);
    await payment(db, manual, 'pi-before-success');
    const afterSuccess = await row(db, manual);
    assert.equal(afterSuccess.plan, 'pro_monthly');
    assert.equal(new Date(afterSuccess.current_period_end).toISOString(), '2026-10-01T00:00:00.000Z');
    await payment(db, refundFirst, 'pi-before-refund', true);
    assert.equal((await row(db, refundFirst)).current_period_end, null);
  } finally {
    await db.close();
  }
});

test('023 preserves manual and administrator entitlements through delayed payment, refund and replay', async () => {
  const db = await databaseThrough022();
  try {
    const adminBefore = [await row(db, grant), await row(db, revoked)];
    await apply023(db);
    assert.deepEqual([await row(db, grant), await row(db, revoked)],
      adminBefore.map(before => ({ ...before, manual_current_period_end: null })));
    for (const userId of [manual, refundFirst]) {
      const migrated = await row(db, userId);
      assert.equal(migrated.plan, 'pro_manual');
      assert.equal(new Date(migrated.manual_current_period_end).toISOString(), manualDeadline);
      assert.equal(migrated.legacy_current_period_end, null, 'do not retain a duplicate, nonrefundable legacy baseline');
    }
    await db.query('select cashflow_refresh_effective_subscription($1)', [manual]);
    await payment(db, manual, 'pi-manual');
    await payment(db, manual, 'pi-manual', true);
    await payment(db, manual, 'pi-manual');
    await payment(db, refundFirst, 'pi-refund-first', true);
    await payment(db, refundFirst, 'pi-refund-first');
    for (const userId of [manual, refundFirst]) {
      const after = await row(db, userId);
      assert.equal(after.plan, 'pro_manual');
      assert.equal(after.status, 'active');
      assert.equal(new Date(after.current_period_end).toISOString(), manualDeadline);
      assert.equal(new Date(after.manual_current_period_end).toISOString(), manualDeadline);
      assert.equal(after.legacy_current_period_end, null);
    }
    for (const userId of [grant, revoked]) {
      await payment(db, userId, `pi-admin-${userId}`);
      await payment(db, userId, `pi-admin-${userId}`, true);
    }
    assert.equal((await row(db, grant)).plan, 'admin_grant');
    assert.equal((await row(db, grant)).status, 'active');
    assert.equal((await row(db, revoked)).plan, 'admin_revoked');
    assert.equal((await row(db, revoked)).status, 'canceled');
  } finally {
    await db.close();
  }
});

test('023 keeps a later administrator revocation effective despite a retained future manual deadline and webhook replays', async () => {
  const db = await databaseThrough022();
  try {
    await apply023(db);
    assert.equal(new Date((await row(db, manual)).manual_current_period_end).toISOString(), manualDeadline);
    // Match the admin override's persisted state: the manual source remains
    // recorded, but the explicit revoked marker takes precedence over it.
    await db.query("update subscriptions set plan='admin_revoked',status='canceled' where user_id=$1", [manual]);
    const assertRevoked = async () => {
      const current = await row(db, manual);
      assert.equal(current.plan, 'admin_revoked');
      assert.equal(current.status, 'canceled');
      assert.equal(new Date(current.manual_current_period_end).toISOString(), manualDeadline);
    };
    await db.query('select cashflow_refresh_effective_subscription($1)', [manual]);
    await assertRevoked();
    for (const refund of [false, true, false, true]) {
      await payment(db, manual, 'pi-revoked-manual', refund);
      await assertRevoked();
    }
    const reservation = (await db.query<{ result: { result: string } }>(
      "select cashflow_reserve_subscription_checkout($1,'revoked-manual',now()+interval '45 minutes',now()+interval '50 minutes',false) result",
      [manual],
    )).rows[0].result;
    assert.equal(reservation.result, 'admin_revoked');
  } finally {
    await db.close();
  }
});

test('023 keeps real 149 payment-only access refundable and does not infer unknown manual provenance', async () => {
  const db = await databaseThrough022();
  try {
    const paidAt = new Date(Date.now() - 86_400_000).toISOString();
    await payment(db, paidOnly, 'pi-paid-only', false, paidAt);
    await apply023(db);
    const paid = await row(db, paidOnly);
    assert.equal(paid.manual_current_period_end, null);
    assert.equal(paid.status, 'active');
    await payment(db, paidOnly, 'pi-paid-only', true, paidAt);
    const refunded = await row(db, paidOnly);
    assert.equal(refunded.manual_current_period_end, null);
    assert.equal(refunded.legacy_current_period_end, null);
    assert.equal(refunded.current_period_end, null);
    assert.equal(refunded.status, 'canceled');
  } finally {
    await db.close();
  }
});

test('023 separates an existing refundable receipt from the manual deadline during migration', async () => {
  const db = await databaseThrough022();
  try {
    const paidAt = new Date(Date.now() - 86_400_000).toISOString();
    // Seed historical receipts directly because the old processor is the bug
    // being fixed and would already erase this separately granted deadline.
    await db.query("insert into cashflow_payments values('pi-existing',$1,14900,'thb',$2,false)", [manual, paidAt]);
    await apply023(db);
    const migrated = await row(db, manual);
    assert.equal(new Date(migrated.manual_current_period_end).toISOString(), manualDeadline);
    assert.equal(new Date(migrated.legacy_current_period_end).getTime(), Date.parse(paidAt) + 30 * 86_400_000);
    await payment(db, manual, 'pi-existing', true, paidAt);
    assert.equal((await row(db, manual)).legacy_current_period_end, null);
    assert.equal(new Date((await row(db, manual)).current_period_end).toISOString(), manualDeadline);
    await db.query("update subscriptions set manual_current_period_end=now()-interval '1 day' where user_id=$1", [manual]);
    await db.query('select cashflow_refresh_effective_subscription($1)', [manual]);
    assert.equal((await row(db, manual)).status, 'canceled', 'expired manual access is not kept alive by its old duplicate legacy baseline');
  } finally {
    await db.close();
  }
});

test('023 blocks manual overlap while permitting NULL or expired entitlements and preserving privileged RPC access', async () => {
  const db = await databaseThrough022();
  try {
    await apply023(db);
    const reserve = async (userId: string, reservationId: string) => (await db.query<{ result: { result: string } }>(
      "select cashflow_reserve_subscription_checkout($1,$2,now()+interval '45 minutes',now()+interval '50 minutes',false) result", [userId, reservationId],
    )).rows[0].result.result;
    assert.equal(await reserve(manual, 'manual-blocked'), 'legacy_active');
    assert.equal(await reserve(grant, 'grant-blocked'), 'admin_grant');
    assert.equal(await reserve(revoked, 'revoke-blocked'), 'admin_revoked');
    assert.equal(await reserve(fresh, 'fresh'), 'reserved');
    await db.query("select cashflow_prepare_subscription_checkout($1,'fresh','{}'::jsonb)", [fresh]);
    const attach = async () => (await db.query<{ ok: boolean }>(
      "select cashflow_attach_subscription_checkout($1,'fresh','cs-fresh') ok", [fresh],
    )).rows[0].ok;
    assert.equal(await attach(), true);
    await db.query("update subscriptions set stripe_checkout_session_id=null,manual_current_period_end=$2 where user_id=$1", [fresh, manualDeadline]);
    assert.equal(await attach(), false, 'manual grant arriving after reservation blocks attachment');
    await db.query("update subscriptions set manual_current_period_end=now()-interval '1 day' where user_id=$1", [fresh]);
    assert.equal(await attach(), true);
    for (const signature of [
      'cashflow_refresh_effective_subscription(uuid)',
      'cashflow_reserve_subscription_checkout(uuid,text,timestamptz,timestamptz,boolean)',
      'cashflow_attach_subscription_checkout(uuid,text,text)',
    ]) {
      const security = (await db.query(`select
        has_function_privilege('anon',$1,'EXECUTE') anon_execute,
        has_function_privilege('authenticated',$1,'EXECUTE') authenticated_execute,
        has_function_privilege('service_role',$1,'EXECUTE') service_execute,
        prosecdef security_definer,proconfig function_config from pg_proc where oid=$1::regprocedure`, [signature])).rows[0];
      assert.deepEqual(security, {
        anon_execute: false, authenticated_execute: false, service_execute: true,
        security_definer: true, function_config: ['search_path=""'],
      });
    }
  } finally {
    await db.close();
  }
});
