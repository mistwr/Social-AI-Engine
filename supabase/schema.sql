create extension if not exists pgcrypto;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('instagram','facebook')),
  external_account_id text not null,
  display_name text,
  access_token_encrypted text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (provider, external_account_id)
);

create table public.automations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  social_account_id uuid references public.social_accounts(id) on delete cascade,
  name text not null,
  trigger_type text not null,
  trigger_config jsonb not null default '{}'::jsonb,
  action_config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  external_thread_id text not null,
  contact_external_id text,
  contact_name text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (social_account_id, external_thread_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  external_message_id text,
  direction text not null check (direction in ('inbound','outbound')),
  body text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  name text,
  phone text,
  email text,
  source text not null default 'instagram',
  interest text,
  status text not null default 'new',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.social_accounts enable row level security;
alter table public.automations enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.leads enable row level security;

create policy "members read organizations" on public.organizations for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = organizations.id and m.user_id = (select auth.uid())));

create policy "members read memberships" on public.organization_members for select to authenticated
using (user_id = (select auth.uid()) or exists (select 1 from public.organization_members m where m.organization_id = organization_members.organization_id and m.user_id = (select auth.uid()) and m.role in ('owner','admin')));

create policy "members read social accounts" on public.social_accounts for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = social_accounts.organization_id and m.user_id = (select auth.uid())));

create policy "members manage automations" on public.automations for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = automations.organization_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.organization_members m where m.organization_id = automations.organization_id and m.user_id = (select auth.uid())));

create policy "members read conversations" on public.conversations for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = conversations.organization_id and m.user_id = (select auth.uid())));

create policy "members read messages" on public.messages for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = messages.organization_id and m.user_id = (select auth.uid())));

create policy "members manage leads" on public.leads for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = leads.organization_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.organization_members m where m.organization_id = leads.organization_id and m.user_id = (select auth.uid())));

grant select on public.organizations, public.organization_members, public.social_accounts, public.conversations, public.messages to authenticated;
grant select, insert, update, delete on public.automations, public.leads to authenticated;
