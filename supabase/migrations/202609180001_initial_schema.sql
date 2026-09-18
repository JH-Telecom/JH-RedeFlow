create extension if not exists pgcrypto;

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name varchar(80) not null unique,
  description varchar(255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  code varchar(120) not null unique,
  description varchar(255) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role_id uuid references public.roles(id) on delete set null,
  name varchar(160) not null,
  email varchar(255) not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.supervisors (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  name varchar(160) not null,
  region varchar(100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.technicians (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid references public.supervisors(id) on delete set null,
  name varchar(160) not null,
  registration varchar(80) not null unique,
  region varchar(100),
  shift varchar(80),
  current_status varchar(40) not null default 'Disponivel',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  order_number varchar(100) not null,
  bdesk varchar(100),
  office_track varchar(100),
  client varchar(180),
  type varchar(100),
  reason varchar(255),
  region varchar(100),
  city varchar(100),
  olt varchar(120),
  slot_pon varchar(40),
  status varchar(40) not null default 'Aberto',
  technician_id uuid references public.technicians(id) on delete set null,
  opened_at timestamptz not null default now(),
  assigned_at timestamptz,
  executed_at timestamptz,
  result varchar(255),
  cancellation_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.call_observations (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete restrict,
  user_id uuid not null references public.profiles(id),
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete restrict,
  user_id uuid not null references public.profiles(id),
  action varchar(120) not null,
  field varchar(120) not null,
  previous_value text,
  new_value text,
  created_at timestamptz not null default now()
);

create index if not exists calls_status_opened_idx on public.calls(status, opened_at desc);
create index if not exists calls_technician_idx on public.calls(technician_id) where technician_id is not null;
create index if not exists call_logs_call_idx on public.call_logs(call_id, created_at desc);
create index if not exists call_observations_call_idx on public.call_observations(call_id, created_at desc);

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.supervisors enable row level security;
alter table public.technicians enable row level security;
alter table public.calls enable row level security;
alter table public.call_observations enable row level security;
alter table public.call_logs enable row level security;

create or replace function public.current_profile_id() returns uuid language sql stable as $$ select auth.uid(); $$;

drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select using (id = public.current_profile_id());

drop policy if exists calls_authenticated_select on public.calls;
create policy calls_authenticated_select on public.calls for select to authenticated using (true);

drop policy if exists technicians_authenticated_select on public.technicians;
create policy technicians_authenticated_select on public.technicians for select to authenticated using (true);

drop policy if exists supervisors_authenticated_select on public.supervisors;
create policy supervisors_authenticated_select on public.supervisors for select to authenticated using (true);

drop policy if exists call_observations_authenticated_select on public.call_observations;
create policy call_observations_authenticated_select on public.call_observations for select to authenticated using (true);

drop policy if exists call_logs_authenticated_select on public.call_logs;
create policy call_logs_authenticated_select on public.call_logs for select to authenticated using (true);