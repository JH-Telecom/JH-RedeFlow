-- Chamado do outro escritorio (GIGA+): a marca fica mesmo depois de virar Finalizado (Baixar/GIGA+ concluidos no OFS
-- viram Finalizado sozinhos). Nos indicadores, fica fora da area SP e conta nas outras areas.
alter table public.calls add column if not exists giga_plus boolean not null default false;
comment on column public.calls.giga_plus is 'Chamado do outro escritorio (GIGA+): fica marcado mesmo depois de virar Finalizado; fora da area SP nos indicadores.';
update public.calls set giga_plus = true where status = 'GIGA+';
