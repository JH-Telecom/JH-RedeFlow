-- Fechamento da atividade no OFS (formulario "Fechamento"), lido pelo Coletor OFS: nao vem no export CSV.
-- Motivo de Fechamento (ex.: CTO SEM SINAL), Submotivo (ex.: ADEQUACAO DE CTO/CEO/CABOS) e Tipo do Cabo (ex.: 12).
-- Opcionais: ficam nulos ate a extensao ler a atividade concluida.
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS closing_reason text;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS closing_subreason text;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS cable_type text;
