# JH RedeFlow

Fundacao da plataforma operacional da Rede JH Telecom.

## Rodar localmente

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`

API: `http://localhost:3333`

Localmente, use `REDEFLOW_RUNTIME=local` e `DATABASE_URL` para o PostgreSQL. Em deploy, use `REDEFLOW_RUNTIME=supabase` (ou `NODE_ENV=production`) com as variáveis Supabase. O backend local nunca usa o Supabase apenas porque as chaves estão presentes no `.env`. O adapter PostgreSQL ainda precisa ser conectado ao `store`; até essa etapa, o runtime local usa os dados demo em memória.

Modo demo: `admin@jhtelecom.com` / `RedeFlow@2026`

O modo demo so e usado quando `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` nao estao configurados. Com Supabase ativo, crie o usuario em **Authentication > Users**, execute as migrations em `supabase/migrations` e associe o usuario a um perfil em `public.profiles`; o backend valida esse perfil antes de liberar o acesso.

Para validar a conexao, execute `npm run dev --workspace backend` e consulte `http://localhost:3333/health/supabase`.

Testes do backend: `npm test --workspace backend`.