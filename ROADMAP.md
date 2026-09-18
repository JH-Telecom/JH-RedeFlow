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
- [x] Supabase configurado, migration executada e healthcheck conectado.
- [ ] Troca da autenticacao e dos dados demo por Supabase Auth e consultas persistentes. Código pronto; falta executar `202609180002_seed_rbac.sql` e testar login real.

## Fases seguintes, bloqueadas ate validacao

1. Tecnicos, supervisores e relacionamento entre equipes. (concluida para validacao)
2. Chamados, fila operacional, detalhe e atribuicao. (concluida para validacao)
3. Observacoes e auditoria persistente. (concluida para validacao)
4. Finalizacao, cancelamento e regras configuraveis. (concluida para validacao)
5. WuzAPI, acionamentos, IA e mesarios. (concluida para validacao)
6. Importacao de bases. (concluida para validacao)
7. Dashboards e indicadores. (concluida para validacao)
8. Performance, seguranca, testes e refinamento responsivo. (em andamento)

### Fase 8 - entregas atuais

- [x] Segredos obrigatorios em producao e headers HTTP basicos de seguranca.
- [x] Limite de tentativas de login por IP e e-mail.
- [x] Testes automatizados para importacao e normalizacao WuzAPI.
- [x] Correcao da extracao de campos com alternativas (`ORDEM|OFFICE TRACK`, etc.).
- [x] Testes de fluxo HTTP, carga leve e validacao visual responsiva desktop/mobile.
- [x] Runtime local separado do Supabase oficial por configuracao de ambiente.
- [ ] Conectar o `store` ao PostgreSQL local e adicionar o driver `pg`.

## Dados oficiais

Fonte operacional oficial confirmada: `Rede Externa Forms V2.xlsx`. As abas e o primeiro mapeamento de campos foram documentados em [official-data-mapping.md](docs/official-data-mapping.md). O comportamento legado de WuzAPI, Gemini, baixas, consulta massiva, SLA e indicadores foi documentado em [appscript-integration-map.md](docs/appscript-integration-map.md). O modelo definitivo de `calls` deve ser fechado somente depois da aprovação desse mapeamento:

`coluna da planilha -> campo do banco -> tipo -> obrigatorio -> editavel -> dashboard`

## Decisoes

- PostgreSQL e a fonte principal; Google Sheets fica como integracao de migracao.
- O backend e o unico lugar que valida senha, sessao, permissao e operacoes sensiveis.
- O modo demo usa dados em memoria somente para permitir validacao visual local sem credenciais ou banco configurados.
- Status e campos de chamados permanecem extensives; nao foram inventados campos definitivos.

## Como continuar em outra conta

Leia este arquivo primeiro. Execute `npm install`, depois `npm run build`. A proxima acao e executar `supabase/migrations/202609180002_seed_rbac.sql` e testar o login Supabase com o usuario criado.