-- Perfil: apelido opcional (aparece so para a propria pessoa, no lugar do nome) e tema de cor escolhido.
-- Ficam na mesma linha da foto e do banner (user_avatars); sem foto, data_url = '' como no banner.
-- palette nulo = tema Padrao.
ALTER TABLE public.user_avatars ADD COLUMN IF NOT EXISTS nickname text;
ALTER TABLE public.user_avatars ADD COLUMN IF NOT EXISTS palette text;
