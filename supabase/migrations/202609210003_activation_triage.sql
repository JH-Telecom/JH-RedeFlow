create table if not exists public.activations (
  id uuid primary key default gen_random_uuid(),
  source varchar(160) not null,
  original_message text not null,
  received_at timestamptz not null default now(),
  status varchar(40) not null default 'Pendente',
  decision_by uuid references public.profiles(id),
  decision_at timestamptz,
  created_call_id uuid references public.calls(id) on delete set null,
  rejection_reason text
);

create table if not exists public.activation_processing (
  id uuid primary key default gen_random_uuid(),
  activation_id uuid not null references public.activations(id) on delete cascade,
  extracted_data jsonb not null default '{}'::jsonb,
  confirmed_data jsonb,
  processor varchar(80) not null default 'local-semantic',
  created_at timestamptz not null default now()
);

create index if not exists activations_status_received_idx on public.activations(status, received_at desc);
create index if not exists activation_processing_activation_idx on public.activation_processing(activation_id, created_at desc);

alter table public.activations enable row level security;
alter table public.activation_processing enable row level security;
