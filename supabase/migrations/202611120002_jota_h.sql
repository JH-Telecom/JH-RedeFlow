-- Jota H (12/11/2026): assistente que transforma uma pergunta em portugues num SELECT (Gemini) e roda aqui, so leitura.
-- A IA recebe so o prompt e a pergunta, nunca os dados. A consulta roda como o papel jota_reader, que so enxerga as
-- views do schema jota (nomes em portugues, sem a mensagem crua do card, e-mail ou fotos), com 8 s de
-- limite, transacao somente leitura e no maximo 200 linhas. So o backend (service_role) chama jota_consultar.
CREATE SCHEMA IF NOT EXISTS jota;
REVOKE ALL ON SCHEMA jota FROM PUBLIC;

CREATE OR REPLACE VIEW jota.chamados AS
SELECT c.id, c.order_number AS ordem, c.bdesk, c.office_track, c.client AS cliente, c.type AS tipo, c.reason AS motivo,
       c.region AS regiao, c.city AS cidade, c.bairro, c.address AS endereco, c.olt, c.slot_pon, c.cluster, c.status, c.ofs_status AS status_ofs,
       t.name AS tecnico, ap.name AS tecnico_apoio, s.name AS supervisor,
       c.opened_at AS abertura, c.event_at AS evento, c.assigned_at AS atribuicao, c.executed_at AS fim,
       c.result AS resultado, c.closing_reason AS motivo_fechamento, c.closing_subreason AS submotivo_fechamento,
       c.cable_type AS tipo_cabo, c.cancellation_reason AS motivo_cancelamento, c.atrelada_order AS atrelada_a
FROM public.calls c
LEFT JOIN public.technicians t ON t.id = c.technician_id
LEFT JOIN public.technicians ap ON ap.id = c.support_technician_id
LEFT JOIN public.supervisors s ON s.id = t.supervisor_id;

CREATE OR REPLACE VIEW jota.observacoes AS
SELECT o.call_id AS chamado_id, c.order_number AS ordem, coalesce(p.name, 'Sistema') AS autor, o.text AS texto, o.created_at AS criado_em
FROM public.call_observations o
JOIN public.calls c ON c.id = o.call_id
LEFT JOIN public.profiles p ON p.id = o.user_id;

CREATE OR REPLACE VIEW jota.historico AS
SELECT l.call_id AS chamado_id, c.order_number AS ordem, coalesce(p.name, 'Sistema') AS autor, l.action AS acao,
       l.field AS campo, l.previous_value AS valor_anterior, l.new_value AS valor_novo, l.created_at AS criado_em
FROM public.call_logs l
JOIN public.calls c ON c.id = l.call_id
LEFT JOIN public.profiles p ON p.id = l.user_id;

CREATE OR REPLACE VIEW jota.acionamentos AS
SELECT a.id, a.source AS origem, a.received_at AS recebido_em, a.status, a.decision_at AS decidido_em,
       p.name AS decidido_por, a.rejection_reason AS motivo_recusa, c.order_number AS ordem_criada
FROM public.activations a
LEFT JOIN public.profiles p ON p.id = a.decision_by
LEFT JOIN public.calls c ON c.id = a.created_call_id;

CREATE OR REPLACE VIEW jota.tecnicos AS
SELECT t.id, t.name AS nome, t.registration AS matricula, t.region AS regiao, t.shift AS turno, t.current_status AS status_atual,
       coalesce(t.employment_status, 'Trabalhando') AS situacao, t.team_role AS funcao, s.name AS supervisor
FROM public.technicians t
LEFT JOIN public.supervisors s ON s.id = t.supervisor_id
WHERE t.deleted_at IS NULL;

CREATE OR REPLACE VIEW jota.supervisores AS
SELECT s.id, s.name AS nome, s.region AS regiao, s.active AS ativo
FROM public.supervisors s
WHERE s.deleted_at IS NULL;

CREATE OR REPLACE VIEW jota.chaves_pop AS
SELECT k.pop, k.status, k.holder_name AS com_quem, k.holder_kind AS tipo_pessoa, k.taken_at AS desde, k.notes AS observacao
FROM public.pop_keys k;

CREATE OR REPLACE VIEW jota.chaves_pop_movimentos AS
SELECT k.pop, m.action AS acao, m.holder_name AS pessoa, m.holder_kind AS tipo_pessoa, m.happened_at AS quando, m.user_name AS registrado_por, m.notes AS observacao
FROM public.pop_key_movements m
JOIN public.pop_keys k ON k.id = m.pop_key_id;

CREATE OR REPLACE VIEW jota.roteirizador AS
SELECT r.order_number AS ordem, r.region AS regiao, r.technician_name AS tecnico, r.result AS resultado, r.message AS detalhe,
       r.test_mode AS modo_teste, r.created_at AS quando
FROM public.night_router_runs r;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jota_reader') THEN CREATE ROLE jota_reader NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA jota TO jota_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA jota TO jota_reader;
GRANT jota_reader TO service_role;

-- SECURITY INVOKER de proposito: quem chama (service_role) troca para jota_reader so dentro desta transacao.
CREATE OR REPLACE FUNCTION public.jota_consultar(consulta text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = jota, pg_catalog
AS $$
DECLARE
  resultado jsonb;
BEGIN
  IF consulta IS NULL OR consulta !~* '^\s*(select|with)\s' OR position(';' IN consulta) > 0 OR consulta ~ '(--|/\*)' THEN
    RAISE EXCEPTION 'O Jota H so roda um SELECT simples.';
  END IF;
  SET LOCAL statement_timeout = '8s';
  SET LOCAL transaction_read_only = on;
  SET LOCAL ROLE jota_reader;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(q)), ''[]''::jsonb) FROM (SELECT * FROM (%s) AS consulta LIMIT 200) AS q', consulta) INTO resultado;
  RETURN resultado;
END
$$;
REVOKE ALL ON FUNCTION public.jota_consultar(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jota_consultar(text) TO service_role;

-- Uso do Jota H (painel "Uso do Jota H - ultimos 7 dias" no proprio bot): a pergunta, quem perguntou, como terminou e
-- a avaliacao (polegar). Nao guarda o resultado da consulta. So o backend le e grava.
CREATE TABLE IF NOT EXISTS public.jota_h_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_name text,
  question text NOT NULL,
  title text,
  sql text,
  status text NOT NULL CHECK (status IN ('ok', 'vazio', 'erro', 'recusada', 'pergunta')),
  row_count integer,
  duration_ms integer,
  error text,
  feedback smallint CHECK (feedback IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jota_h_log_created_idx ON public.jota_h_log(created_at DESC);
ALTER TABLE public.jota_h_log ENABLE ROW LEVEL SECURITY;
