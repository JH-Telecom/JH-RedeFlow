alter table public.technicians
  add column if not exists active_override boolean not null default false;
