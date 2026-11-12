-- Status do dia do tecnico (12/11/2026): os status da planilha de escala (Ativo, Folga, Falta, Ativar as 13:00,
-- Interjornada, Atestado, Vindo na base, Ativar as 22:00, Saiu de rota, Frota, Ferias) e uma observacao livre.
-- Colunas novas e opcionais: nenhum dado existente e alterado.
ALTER TABLE public.technicians ADD COLUMN IF NOT EXISTS duty_status text
  CHECK (duty_status IS NULL OR duty_status IN ('Ativo', 'Folga', 'Falta', 'Ativar às 13:00', 'Interjornada', 'Atestado', 'Vindo na base', 'Ativar às 22:00', 'Saiu de rota', 'Frota', 'Férias'));
ALTER TABLE public.technicians ADD COLUMN IF NOT EXISTS status_note text CHECK (status_note IS NULL OR char_length(status_note) <= 300);
ALTER TABLE public.technicians ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;

-- Jota H passa a enxergar o status do dia e a observacao (colunas novas no fim da view).
CREATE OR REPLACE VIEW jota.tecnicos AS
SELECT t.id, t.name AS nome, t.registration AS matricula, t.region AS regiao, t.shift AS turno, t.current_status AS status_atual,
       coalesce(t.employment_status, 'Trabalhando') AS situacao, t.team_role AS funcao, s.name AS supervisor,
       t.duty_status AS status_dia, t.status_note AS obs_status, t.status_updated_at AS status_atualizado_em
FROM public.technicians t
LEFT JOIN public.supervisors s ON s.id = t.supervisor_id
WHERE t.deleted_at IS NULL;
GRANT SELECT ON jota.tecnicos TO jota_reader;
