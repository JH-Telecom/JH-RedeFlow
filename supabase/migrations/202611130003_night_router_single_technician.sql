-- Roteirizador da madrugada (13/11/2026): "Tecnico unico da madrugada". Quando preenchido (e o tecnico existe, e
-- Tecnico e nao foi demitido), todos os chamados acionados das 22h as 06h vao para ele, de qualquer regiao e tipo,
-- ignorando a escala por regiao. Vazio: vale a escala. Sem FK de proposito (tecnico removido -> volta para a escala).
ALTER TABLE public.night_router_settings ADD COLUMN IF NOT EXISTS single_technician_id uuid;
