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
5. Rode `npm run dev --workspace backend`.
6. Verifique `http://localhost:3333/health/supabase`.

Resultado esperado:

```json
{"configured":true,"connected":true}
```

Depois disso, a próxima etapa é migrar gradualmente o store demo para repositories Supabase. O fluxo atual continua usando dados em memória até essa migração ser validada.