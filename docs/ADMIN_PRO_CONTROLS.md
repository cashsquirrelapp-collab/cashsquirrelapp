# Admin Pro controls

The admin user management panel now distinguishes four actions:

- Grant Pro: unlimited admin-granted access until revoked. A banned account must first be unbanned explicitly.
- Revoke Pro: removes current access, including the initial trial for this account, but allows a new paid package immediately.
- Ban Pro: removes current access and blocks purchase until an admin unbans it. Account sign-in is not banned.
- Unban Pro: permits repurchase without restoring old access. Admins can separately grant Pro afterward.

None of these actions refunds payments. Pending checkout, unresolved Stripe outcomes, an ongoing recurring subscription, or an account closure block the mutation with a clear error. The new RPC shares the checkout advisory lock and records the authenticated admin and action in a service-only RLS audit table.

The old UI only offered revoke. The migration converts old `admin_revoked` records to `admin_removed`: they remain Free but may repurchase. New explicit bans use `admin_revoked`. `pro_access_reset_at` prevents old payments, refund replay, and old entitlement sources from restoring removed access or extending a later purchase. New purchases are recognized by server-created order time; payment timestamps may be second-granularity.

Migration: `supabase/migrations/20261020155537_admin_pro_controls.sql`. Apply once before using the new admin actions. Do not rerun this migration after explicit bans have been created: its conversion is only for the legacy state.

The global 14-day signup trial policy is unchanged; removing trials globally was not assumed from the ambiguous statement about no test account. Revoked/banned accounts cannot regain an initial trial.

Validation uses simulated accounts and local PostgreSQL execution, not production customer bans. Browser tests exercise revoke → grant → ban → unban, explanatory confirmations, and blocked purchase controls. HTTP tests cover admin role, CSRF, account binding, strict payloads and ban enforcement. SQL tests cover purchase after revoke/unban, ban enforcement, payment replay/refund behavior, payment races and service-role permissions.
