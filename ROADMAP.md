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
- [ ] Validacao do usuario e troca do modo demo por PostgreSQL/Supabase.

## Fases seguintes, bloqueadas ate validacao

1. Tecnicos, supervisores e relacionamento entre equipes. (concluida para validacao)
2. Chamados, fila operacional, detalhe e atribuicao. (concluida para validacao)
3. Observacoes e auditoria persistente. (concluida para validacao)
4. Finalizacao, cancelamento e regras configuraveis.
5. WuzAPI, acionamentos, IA e mesarios.
6. Importacao de bases.
7. Dashboards e indicadores.
8. Performance, seguranca, testes e refinamento responsivo.

## Dados ainda necessarios

O arquivo `Rede Externa Forms V2.xlsx` foi localizado em Downloads, junto com outras bases. Antes da Fase 3, confirmar qual arquivo e a fonte operacional oficial e fornecer os cabecalhos das abas relevantes. O modelo de `calls` deve ser fechado somente depois desse mapeamento:

`coluna da planilha -> campo do banco -> tipo -> obrigatorio -> editavel -> dashboard`

## Decisoes

- PostgreSQL e a fonte principal; Google Sheets fica como integracao de migracao.
- O backend e o unico lugar que valida senha, sessao, permissao e operacoes sensiveis.
- O modo demo usa dados em memoria somente para permitir validacao visual local sem credenciais ou banco configurados.
- Status e campos de chamados permanecem extensives; nao foram inventados campos definitivos.

## Como continuar em outra conta

Leia este arquivo primeiro. Execute `npm install`, depois `npm run build`. A proxima acao deve ser validar observacoes, auditoria e detalhe dos chamados antes de iniciar a Fase 5.