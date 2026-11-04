-- Banner do perfil (imagem larga), mostrado ao fundo das observacoes do usuario nos chamados.
-- Quem tem banner e nao tem foto fica com data_url = '' (tratado como sem foto).
ALTER TABLE public.user_avatars ADD COLUMN IF NOT EXISTS banner_data_url text;
