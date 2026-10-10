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
