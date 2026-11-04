-- Data/Hora do Evento informada no card de acionamento (horario de Sao Paulo convertido para UTC).
-- Opcional: chamados sem o campo no card ficam nulos. Serve para medir o gap evento -> acionamento no grupo.
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS event_at timestamptz;
