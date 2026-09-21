# JH RedeFlow

Fundacao da plataforma operacional da Rede JH Telecom.

## Rodar localmente

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`

API: `http://localhost:3333`

Localmente, use `REDEFLOW_RUNTIME=local` e `DATABASE_URL` para o PostgreSQL. Em deploy, use `REDEFLOW_RUNTIME=supabase` (ou `NODE_ENV=production`) com as variáveis Supabase. O backend local nunca usa o Supabase apenas porque as chaves estão presentes no `.env`. Dados demo só são carregados quando `REDEFLOW_DEMO_DATA=true`; o padrão é ambiente vazio, sem registros fictícios.

Modo demo: `admin@jhtelecom.com` / `RedeFlow@2026`

O modo demo so e usado quando `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` nao estao configurados. Com Supabase ativo, crie o usuario em **Authentication > Users**, execute as migrations em `supabase/migrations` e associe o usuario a um perfil em `public.profiles`; o backend valida esse perfil antes de liberar o acesso.

Para validar a conexao, execute `npm run dev --workspace backend` e consulte `http://localhost:3333/health/supabase`.

Testes do backend: `npm test --workspace backend`.

Configuracao do webhook WuzAPI: [docs/wuzapi-webhook.md](docs/wuzapi-webhook.md).

## Deploy do backend no Render

O arquivo `render.yaml` cria o servico web da API usando Supabase como runtime. No Render, selecione **New > Blueprint**, conecte este repositorio e confirme o blueprint. Alternativamente, crie um Web Service com:

```text
Build Command: npm install && npm run build --workspace backend
Start Command: node backend/dist/server.js
Health Check Path: /health
```

Cadastre no Render as variaveis marcadas como `sync: false` no `render.yaml`:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
WUZAPI_WEBHOOK_TOKEN
WUZAPI_ACTIVATION_GROUP_ID
CORS_ORIGINS
```

Depois do deploy, teste `https://SEU-SERVICO.onrender.com/health` e configure no WuzAPI:

```text
https://SEU-SERVICO.onrender.com/api/integrations/wuzapi/webhook
```

O Render injeta `PORT` automaticamente. Nao envie o arquivo `backend/.env` para o repositorio nem copie segredos para `render.yaml`.