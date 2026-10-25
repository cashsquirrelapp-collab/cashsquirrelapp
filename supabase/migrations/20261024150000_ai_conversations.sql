-- เลขากระรอก chat history, kept per account (2026-10-24, owner: "ทำให้บันทึกประวัติการคุยได้ สำหรับผู้ใช้นั้นๆ").
-- Only the server reads and writes these (service role): row level security is on with no policy, so a browser
-- key can never read another account's chats. Both tables go with the account (on delete cascade). Pictures and
-- files are not stored, only their name and kind.
begin;
create table if not exists public.cashflow_ai_conversations (
  id text primary key check (id ~ '^c_[0-9a-f-]{36}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '' check (length(title) <= 120),
  pinned boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cashflow_ai_conversations_user on public.cashflow_ai_conversations (user_id, updated_at desc);
create table if not exists public.cashflow_ai_messages (
  id bigint generated always as identity primary key,
  conversation_id text not null references public.cashflow_ai_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  text text not null check (length(text) <= 12000),
  cards jsonb check (cards is null or (jsonb_typeof(cards) = 'array' and length(cards::text) <= 60000)),
  attachment jsonb check (attachment is null or (jsonb_typeof(attachment) = 'object' and length(attachment::text) <= 500)),
  created_at timestamptz not null default now()
);
create index if not exists cashflow_ai_messages_conversation on public.cashflow_ai_messages (conversation_id, id);
create index if not exists cashflow_ai_messages_user on public.cashflow_ai_messages (user_id);
alter table public.cashflow_ai_conversations enable row level security;
alter table public.cashflow_ai_messages enable row level security;
revoke all on public.cashflow_ai_conversations from anon, authenticated;
revoke all on public.cashflow_ai_messages from anon, authenticated;
commit;
