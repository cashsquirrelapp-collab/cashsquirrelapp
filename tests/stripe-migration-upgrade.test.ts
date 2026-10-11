import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const userId = '77777777-7777-4777-8777-777777777777';

async function old020Database(withCheckout: boolean): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users values('${userId}');
    create table public.subscriptions(
      user_id uuid primary key references auth.users(id),
      stripe_customer_id text,
      stripe_subscription_id text,
      status text,
      plan text,
      current_period_end timestamptz,
      updated_at timestamptz default now(),
      workspace_type text,
      workspace_id uuid,
      stripe_price_id text,
      stripe_livemode boolean,
      stripe_subscription_status text,
      stripe_subscription_created bigint,
      stripe_billing_period_end timestamptz,
      stripe_entitled_until timestamptz,
      legacy_current_period_end timestamptz,
      stripe_intro_redeemed_at timestamptz,
      stripe_payment_state text,
      stripe_subscription_event_created bigint,
      stripe_subscription_reconcile_token text,
      stripe_invoice_event_created bigint,
      stripe_last_invoice_id text,
      stripe_checkout_reservation_id text,
      stripe_checkout_session_id text,
      stripe_checkout_pending_until timestamptz,
      billing_closure_pending_until timestamptz,
      cancel_at_period_end boolean not null default false,
      constraint subscriptions_stripe_checkout_fields_check check (
        (stripe_checkout_reservation_id is null and stripe_checkout_session_id is null and stripe_checkout_pending_until is null)
        or (stripe_checkout_reservation_id is not null and stripe_checkout_pending_until is not null)
      )
    );
    create table public.cashflow_account_pauses(user_id uuid primary key);
    create table public.cashflow_payment_events(event_id text primary key,created_at timestamptz);
    create table public.cashflow_payments(
      payment_id text primary key,user_id uuid,amount bigint,currency text,
      paid_at timestamptz,refunded boolean
    );
    create table public.cashflow_stripe_events(
      event_id text primary key,event_type text not null,object_id text not null,
      processed_at timestamptz not null default now()
    );
    insert into public.cashflow_stripe_events(event_id,event_type,object_id)
      values('evt-old','customer.subscription.updated','sub-old');
    create function public.cashflow_reserve_subscription_checkout(uuid,text,timestamptz,boolean)
      returns jsonb language sql as $$select '{}'::jsonb$$;
    create function public.cashflow_attach_subscription_checkout(uuid,text,text,timestamptz)
      returns boolean language sql as $$select false$$;
    create function public.cashflow_apply_stripe_subscription_event(
      text,text,bigint,boolean,boolean,text,text,uuid,uuid,text,text,bigint,text,text,
      timestamptz,boolean,timestamptz,text,boolean,text
    ) returns text language sql as $$select 'old'::text$$;
    insert into public.subscriptions(
      user_id,status,workspace_type,workspace_id,stripe_livemode,
      stripe_checkout_reservation_id,stripe_checkout_session_id,stripe_checkout_pending_until
    ) values(
      '${userId}','inactive','personal','${userId}',false,
      ${withCheckout ? "'reservation-old','cs-old',now()+interval '30 minutes'" : 'null,null,null'}
    );
  `);
  return db;
}

test('021 upgrades an applied original 020 and removes obsolete callable overloads', async () => {
  const db = await old020Database(false);
  try {
    await db.exec(await readFile('database/migrations/021_secure_stripe_billing_upgrade.sql', 'utf8'));
    const result = await db.query<Record<string, unknown>>(`select
      to_regprocedure('public.cashflow_reserve_subscription_checkout(uuid,text,timestamptz,boolean)') is null old_reserve_removed,
      to_regprocedure('public.cashflow_attach_subscription_checkout(uuid,text,text,timestamptz)') is null old_attach_removed,
      to_regprocedure('public.cashflow_apply_stripe_subscription_event(text,text,bigint,boolean,boolean,text,text,uuid,uuid,text,text,bigint,text,text,timestamptz,boolean,timestamptz,text,boolean,text)') is null old_apply_removed,
      to_regprocedure('public.cashflow_reserve_subscription_checkout(uuid,text,timestamptz,timestamptz,boolean)') is not null new_reserve_present,
      to_regclass('public.cashflow_stripe_offer_windows') is not null offer_table_present`);
    assert.deepEqual(result.rows[0], {
      old_reserve_removed: true,
      old_attach_removed: true,
      old_apply_removed: true,
      new_reserve_present: true,
      offer_table_present: true,
    });
    const event = (await db.query<{ object_kind: string; event_created: bigint; livemode: boolean }>(
      "select object_kind,event_created,livemode from cashflow_stripe_events where event_id='evt-old'",
    )).rows[0];
    assert.equal(event.object_kind, 'subscription');
    assert.ok(Number(event.event_created) > 0);
    assert.equal(event.livemode, false);
  } finally {
    await db.close();
  }
});

test('021 refuses to guess the state of an old live Checkout reservation', async () => {
  const db = await old020Database(true);
  try {
    await assert.rejects(
      db.exec(await readFile('database/migrations/021_secure_stripe_billing_upgrade.sql', 'utf8')),
      /legacy_checkout_reservations_require_stripe_reconciliation/,
    );
  } finally {
    await db.close();
  }
});

test('021 attaches fresh Checkout with no legacy entitlement and rejects a late legacy payment', async () => {
  const db = await old020Database(false);
  try {
    await db.exec(await readFile('database/migrations/021_secure_stripe_billing_upgrade.sql', 'utf8'));
    const expiresAt = new Date(Date.now() + 45 * 60_000).toISOString();
    const pendingUntil = new Date(Date.now() + 50 * 60_000).toISOString();
    const reserve = async (reservationId: string) => (await db.query<{ result: { result: string } }>(
      'select cashflow_reserve_subscription_checkout($1,$2,$3,$4,false) result',
      [userId, reservationId, expiresAt, pendingUntil],
    )).rows[0].result.result;
    const prepare = (reservationId: string) => db.query(
      'select cashflow_prepare_subscription_checkout($1,$2,$3::jsonb)',
      [userId, reservationId, JSON.stringify({ mode: 'subscription', expires_at: Math.floor(Date.parse(expiresAt) / 1000) })],
    );
    const attach = async (reservationId: string, sessionId: string) => (await db.query<{ attached: boolean }>(
      'select cashflow_attach_subscription_checkout($1,$2,$3) attached',
      [userId, reservationId, sessionId],
    )).rows[0].attached;

    assert.deepEqual((await db.query<{ legacy_current_period_end: string | null; plan: string | null }>(
      'select legacy_current_period_end,plan from subscriptions where user_id=$1', [userId],
    )).rows[0], { legacy_current_period_end: null, plan: null });
    assert.equal(await reserve('reservation-fresh'), 'reserved');
    await prepare('reservation-fresh');
    assert.equal(await attach('reservation-fresh', 'cs-fresh'), true);
    assert.equal((await db.query<{ stripe_checkout_session_id: string }>(
      'select stripe_checkout_session_id from subscriptions where user_id=$1', [userId],
    )).rows[0].stripe_checkout_session_id, 'cs-fresh');

    await db.query('select cashflow_release_subscription_checkout($1,$2)', [userId, 'reservation-fresh']);
    assert.equal(await reserve('reservation-late-legacy'), 'reserved');
    await prepare('reservation-late-legacy');
    await db.query("update subscriptions set legacy_current_period_end=now()+interval '30 days' where user_id=$1", [userId]);
    assert.equal(await attach('reservation-late-legacy', 'cs-overlap'), false);
    assert.equal(await reserve('reservation-legacy-active'), 'legacy_active');
  } finally {
    await db.close();
  }
});

test('022 repairs an already-applied NULL-rejecting attachment function without changing entitlements or access', async () => {
  const db = await old020Database(false);
  try {
    const fixedPredicate = '(legacy_current_period_end is null or legacy_current_period_end <= now())';
    const originalPredicate = 'not (legacy_current_period_end > now())';
    const migration021 = await readFile('database/migrations/021_secure_stripe_billing_upgrade.sql', 'utf8');
    assert.ok(migration021.includes(fixedPredicate));
    // Reconstruct the original deployed 021 attachment function, not the
    // corrected fresh-install definition, to exercise the forward-only path.
    await db.exec(migration021.replace(fixedPredicate, originalPredicate));
    await db.exec(`
      insert into auth.users values
        ('11111111-1111-4111-8111-111111111111'),
        ('22222222-2222-4222-8222-222222222222'),
        ('33333333-3333-4333-8333-333333333333'),
        ('44444444-4444-4444-8444-444444444444'),
        ('55555555-5555-4555-8555-555555555555'),
        ('66666666-6666-4666-8666-666666666666');
      insert into subscriptions(user_id,status,plan,current_period_end,legacy_current_period_end) values
        ('11111111-1111-4111-8111-111111111111','active','admin_grant',null,null),
        ('22222222-2222-4222-8222-222222222222','canceled','admin_revoked',null,null),
        ('33333333-3333-4333-8333-333333333333','active','pro_manual','2027-09-23T00:00:00Z','2027-09-23T00:00:00Z'),
        ('44444444-4444-4444-8444-444444444444','active','admin_grant',null,null),
        ('55555555-5555-4555-8555-555555555555','active','pro_manual','2027-09-23T00:00:00Z','2027-09-23T00:00:00Z'),
        ('66666666-6666-4666-8666-666666666666','active','pro_manual','2027-09-23T00:00:00Z','2027-09-23T00:00:00Z');
    `);
    const reserved = (await db.query<{ result: { result: string } }>(
      "select cashflow_reserve_subscription_checkout($1,'reservation-upgrade',now()+interval '45 minutes',now()+interval '50 minutes',false) result",
      [userId],
    )).rows[0];
    assert.equal(reserved.result.result, 'reserved');
    await db.query("select cashflow_prepare_subscription_checkout($1,'reservation-upgrade','{}'::jsonb)", [userId]);
    const attach = async () => (await db.query<{ attached: boolean }>(
      "select cashflow_attach_subscription_checkout($1,'reservation-upgrade','cs-upgrade') attached", [userId],
    )).rows[0].attached;
    assert.equal(await attach(), false, 'original 021 rejects a fresh account because NOT(NULL) is NULL');
    const before = (await db.query('select * from subscriptions order by user_id')).rows;

    await db.exec(await readFile('database/migrations/022_fix_stripe_checkout_null_legacy.sql', 'utf8'));
    assert.deepEqual((await db.query('select * from subscriptions order by user_id')).rows, before);
    const security = (await db.query(`select
      has_function_privilege('anon','cashflow_attach_subscription_checkout(uuid,text,text)','EXECUTE') anon_execute,
      has_function_privilege('authenticated','cashflow_attach_subscription_checkout(uuid,text,text)','EXECUTE') authenticated_execute,
      has_function_privilege('service_role','cashflow_attach_subscription_checkout(uuid,text,text)','EXECUTE') service_execute,
      prosecdef security_definer,
      proconfig function_config
      from pg_proc where oid='cashflow_attach_subscription_checkout(uuid,text,text)'::regprocedure`)).rows[0];
    assert.deepEqual(security, {
      anon_execute: false, authenticated_execute: false, service_execute: true,
      security_definer: true, function_config: ['search_path=""'],
    });
    assert.equal(await attach(), true, '022 permits the same unchanged fresh-account reservation');
    await db.query('select cashflow_release_subscription_checkout($1,$2)', [userId, 'reservation-upgrade']);
    await db.query("update subscriptions set legacy_current_period_end=now()-interval '1 day' where user_id=$1", [userId]);
    await db.query(
      "select cashflow_reserve_subscription_checkout($1,'reservation-upgrade',now()+interval '45 minutes',now()+interval '50 minutes',false)",
      [userId],
    );
    await db.query("select cashflow_prepare_subscription_checkout($1,'reservation-upgrade','{}'::jsonb)", [userId]);
    assert.equal(await attach(), true, 'expired legacy entitlement also permits attachment');
    await db.query("update subscriptions set stripe_checkout_session_id=null,legacy_current_period_end=now()+interval '1 day' where user_id=$1", [userId]);
    assert.equal(await attach(), false, 'a late legacy payment still blocks overlap after 022');
  } finally {
    await db.close();
  }
});
