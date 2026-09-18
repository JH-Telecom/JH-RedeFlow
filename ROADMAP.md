# JH RedeFlow

## Fase 1 - fundacao e acesso

Status: concluida para validacao do usuario

- [x] Estrutura separada em `frontend`, `backend` e `database`.
- [x] Contrato inicial de autenticacao e RBAC.
- [x] Login corporativo demonstravel sem colocar secrets no frontend.
- [x] Layout operacional com sidebar, header e controle de acesso por permissao.
- [x] Administracao inicial de usuarios, cargos e permissoes.
- [x] Schema PostgreSQL, indices, soft delete e seeds iniciais.
- [x] Build do frontend e typecheck do backend validados.
- [x] Healthcheck e login demo validados contra a API em execucao.
- [ ] Validacao do usuario e troca do modo demo por PostgreSQL/Supabase. Cliente configurado; falta executar a migration `supabase/migrations/202609180001_initial_schema.sql` no projeto Supabase.

## Fases seguintes, bloqueadas ate validacao

1. Tecnicos, supervisores e relacionamento entre equipes. (concluida para validacao)
2. Chamados, fila operacional, detalhe e atribuicao. (concluida para validacao)
3. Observacoes e auditoria persistente. (concluida para validacao)
4. Finalizacao, cancelamento e regras configuraveis. (concluida para validacao)
5. WuzAPI, acionamentos, IA e mesarios. (concluida para validacao)
6. Importacao de bases. (concluida para validacao)
7. Dashboards e indicadores. (concluida para validacao)
8. Performance, seguranca, testes e refinamento responsivo.

## Dados oficiais

Fonte operacional oficial confirmada: `Rede Externa Forms V2.xlsx`. As abas e o primeiro mapeamento de campos foram documentados em [official-data-mapping.md](docs/official-data-mapping.md). O comportamento legado de WuzAPI, Gemini, baixas, consulta massiva, SLA e indicadores foi documentado em [appscript-integration-map.md](docs/appscript-integration-map.md). O modelo definitivo de `calls` deve ser fechado somente depois da aprovação desse mapeamento:

`coluna da planilha -> campo do banco -> tipo -> obrigatorio -> editavel -> dashboard`

## Decisoes

- PostgreSQL e a fonte principal; Google Sheets fica como integracao de migracao.
- O backend e o unico lugar que valida senha, sessao, permissao e operacoes sensiveis.
- O modo demo usa dados em memoria somente para permitir validacao visual local sem credenciais ou banco configurados.
- Status e campos de chamados permanecem extensives; nao foram inventados campos definitivos.

## Como continuar em outra conta

Leia este arquivo primeiro. Execute `npm install`, depois `npm run build`. A proxima acao e executar a migration no Supabase SQL Editor, validar `/health/supabase` com `200` e iniciar a troca gradual do store em memoria por consultas Supabase.