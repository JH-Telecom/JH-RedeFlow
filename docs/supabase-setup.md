# Configuração Supabase

O backend já reconhece estas variáveis em `backend/.env`:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

As chaves não devem ser commitadas nem enviadas pelo chat. A `SERVICE_ROLE_KEY` fica somente no backend.

## Aplicar o schema

1. Abra o projeto Supabase.
2. Acesse **SQL Editor**.
3. Abra [202609180001_initial_schema.sql](../supabase/migrations/202609180001_initial_schema.sql).
4. Cole o conteúdo no SQL Editor e execute.
5. Execute também [202609180002_seed_rbac.sql](../supabase/migrations/202609180002_seed_rbac.sql).
6. Rode `npm run dev --workspace backend`.
7. Verifique `http://localhost:3333/health/supabase`.

Resultado esperado:

```json
{"configured":true,"connected":true}
```

Depois disso, a próxima etapa é migrar gradualmente o store demo para repositories Supabase. O fluxo atual continua usando dados em memória até essa migração ser validada.

## Primeiro usuário

O login do backend já usa Supabase Auth quando as variáveis Supabase estão configuradas. O usuário precisa existir em **Authentication > Users** e ter um registro em `public.profiles`. A segunda migration associa o e-mail administrativo informado no projeto ao cargo Administrador; revise esse e-mail no SQL antes de executar se necessário.