-- Tecnico de apoio no chamado (11/11/2026). Opcional; na fila aparece no lugar do supervisor.
-- Sem chave estrangeira de proposito: uma segunda ligacao calls -> technicians deixaria ambiguo o join
-- "technicians(...)" que o sistema usa para o tecnico principal (o PostgREST passa a recusar a consulta).
-- O sistema confere na gravacao que o id e de um tecnico trabalhando e ativo.
alter table public.calls add column if not exists support_technician_id uuid;
comment on column public.calls.support_technician_id is 'Tecnico de apoio na ordem (opcional). Sem FK para nao deixar ambiguo o join calls -> technicians.';
