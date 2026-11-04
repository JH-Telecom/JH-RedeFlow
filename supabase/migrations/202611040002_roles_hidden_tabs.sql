-- Abas do menu ocultas para cada cargo (caminhos como '/igp'). Vazio = o cargo ve todas as abas que suas permissoes liberam.
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS hidden_tabs text[] NOT NULL DEFAULT '{}';
