create extension if not exists pgcrypto;

create table if not exists public.social_ai_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sd_dialer_company_id uuid references public.companies(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.social_ai_organization_members (
  organization_id uuid not null references public.social_ai_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.social_ai_social_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.social_ai_organizations(id) on delete cascade,
  provider text not null check (provider in ('instagram','facebook')),
  external_account_id text not null,
  display_name text,
  credential_ref text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (provider, external_account_id)
);

create table if not exists public.social_ai_social_credentials (
  social_account_id uuid primary key references public.social_ai_social_accounts(id) on delete cascade,
  token_ciphertext text not null,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.social_ai_automations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.social_ai_organizations(id) on delete cascade,
  social_account_id uuid references public.social_ai_social_accounts(id) on delete cascade,
  name text not null,
  trigger_type text not null,
  trigger_config jsonb not null default '{}'::jsonb,
  action_config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.social_ai_automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.social_ai_organizations(id) on delete cascade,
  automation_id uuid not null references public.social_ai_automations(id) on delete cascade,
  social_account_id uuid not null references public.social_ai_social_accounts(id) on delete cascade,
  external_event_id text not null,
  trigger_type text not null,
  status text not null default 'processing',
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (automation_id, external_event_id)
);

create table if not exists public.social_ai_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.social_ai_organizations(id) on delete cascade,
  social_account_id uuid not null references public.social_ai_social_accounts(id) on delete cascade,
  external_thread_id text not null,
  contact_external_id text,
  contact_name text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (social_account_id, external_thread_id)
);

create table if not exists public.social_ai_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.social_ai_organizations(id) on delete cascade,
  conversation_id uuid not null references public.social_ai_conversations(id) on delete cascade,
  external_message_id text,
  direction text not null check (direction in ('inbound','outbound')),
  body text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.social_ai_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.social_ai_organizations(id) on delete cascade,
  conversation_id uuid references public.social_ai_conversations(id) on delete set null,
  name text,
  phone text,
  email text,
  source text not null default 'instagram',
  interest text,
  status text not null default 'new',
  metadata jsonb not null default '{}'::jsonb,
  sd_dialer_lead_id uuid references public.leads(id) on delete set null,
  sync_status text not null default 'not_ready' check (sync_status in ('not_ready','ready','synced','error')),
  synced_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.social_ai_organizations enable row level security;
alter table public.social_ai_organization_members enable row level security;
alter table public.social_ai_social_accounts enable row level security;
alter table public.social_ai_social_credentials enable row level security;
alter table public.social_ai_automations enable row level security;
alter table public.social_ai_automation_runs enable row level security;
alter table public.social_ai_conversations enable row level security;
alter table public.social_ai_messages enable row level security;
alter table public.social_ai_leads enable row level security;

create index if not exists social_ai_leads_sync_status_idx on public.social_ai_leads(sync_status);
create index if not exists social_ai_organizations_sd_company_idx on public.social_ai_organizations(sd_dialer_company_id);

revoke all on public.social_ai_social_credentials from anon, authenticated;

grant select on public.social_ai_organizations,
  public.social_ai_organization_members,
  public.social_ai_social_accounts,
  public.social_ai_automation_runs,
  public.social_ai_conversations,
  public.social_ai_messages to authenticated;

grant select, insert, update, delete on public.social_ai_automations,
  public.social_ai_leads to authenticated;
