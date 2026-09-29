# ROADMAP DO PROJETO

## 1. VISÃO GERAL

O projeto JH RedeFlow é uma plataforma operacional para gestão de chamados, técnicos, supervisores, dashboards e integrações do time de operação. O objetivo principal é centralizar a visão de produção, o controle de filas e a operação de campo em um ambiente com autenticação, permissões e métricas executivas.

Principais usuários: operadores, supervisores, administradores, mesários e usuários de visualização. As principais tecnologias do projeto são TypeScript, Express, Vite, PostgreSQL/Supabase e integrações com WuzAPI, Google Drive e importações CSV/XLSX. A arquitetura é separada em frontend, backend e banco, com backend responsável por todas as regras de negócio, autenticação, permissões, validação e integrações.

---

## 2. ESTADO ATUAL

Status geral: EM DESENVOLVIMENTO

Última atualização: 2026-09-29

Última implementação: correção do bairro NOC quando linhas `N/A`/`NÃO INFORMADA` vêm após endereço e cidade/UF.

Agente responsável pela última alteração: GitHub Copilot

Próxima ação: aplicar a migration de localização nos bancos locais/Supabase e validar os dados persistidos em ambiente real.

---

## 3. ARQUITETURA ATUAL

- Frontend: aplicação em React + Vite, em [frontend/src](frontend/src).
- Backend: API Express em [backend/src/server.ts](backend/src/server.ts) com regras de negócio em [backend/src/store.ts](backend/src/store.ts).
- Banco de dados: PostgreSQL com migrations em [database/migrations](database/migrations) e [supabase/migrations](supabase/migrations).
- Autenticação: JWT local e integração Supabase configurável por ambiente.
- APIs: endpoints de auth, usuários, cargos, técnicos, supervisores, chamados, dashboards, importações, notificações e integrações.
- Infraestrutura: runtime local com variáveis de ambiente, fallback demo e configs de produção.

---

## 4. FUNCIONALIDADES IMPLEMENTADAS

- [x] Autenticação com JWT e RBAC.
- [x] Login corporativo demonstrável sem expor secrets no frontend.
- [x] Layout operacional com sidebar, header e permissões por tela.
- [x] Administração de usuários, cargos e permissões.
- [x] Schema PostgreSQL, índices, soft delete e seeds iniciais.
- [x] Healthcheck e validação de bootstrap da API.
- [x] Runtime local separado do Supabase oficial por ambiente.
- [x] Fluxos de técnicos, supervisores e relacionamento entre equipes.
- [x] Chamados, fila operacional, detalhe e atribuição.
- [x] Observações e auditoria de chamados.
- [x] Finalização, cancelamento e regras de status.
- [x] WuzAPI, acionamentos e análise de mensagens operacionais.
- [x] Importação de bases CSV/XLSX.
- [x] Dashboards e indicadores operacionais.
- [x] Escopo de supervisão aplicado por equipe para chamadas e dashboard.
- [x] Tela de ordens da equipe do supervisor com filtro de período.
- [x] Filtro de data na visão geral e nas listagens de ordens.
- [x] Matriz de permissões corrigida para Administrador, Operador, Supervisor, Mesário e Visualização.
- [x] Catálogo de permissões compactado em duas colunas no desktop e responsivo no mobile.
- [x] Edição de usuário com troca de cargo persistida no Supabase.
- [x] Vínculo de login e equipe do supervisor pela tela de supervisores.
- [x] Cards de supervisores reorganizados com alinhamento, hierarquia e estado vazio responsivo.
- [x] Escopo de equipe limitado à aba "Ordens da equipe" para supervisores.
- [x] Atribuição de chamados limitada a técnicos ativos, excluindo auxiliares.
- [x] Tabela de atendimento ampliada com protocolo, SLA, tipo, OLT, cidade, observação e timer.
- [x] Timer de atendimento calculado desde a última observação registrada.
- [x] Coluna SLA exibindo o tempo desde a data de acionamento.
- [x] Regiões operacionais disponíveis em seletor no detalhe do chamado.
- [x] Notificações de acionamentos com toast superior, sino persistente e contador no menu.
- [x] Gráfico de status do dashboard contido para não ultrapassar o painel.
- [x] Aceite de acionamentos com campos longos corrigido.
- [x] Consolidação determinística de endereços NOC, bairros, clientes afetados e atreladas.
- [x] Salvamento de chamados com listas longas de Slot/PON e motivos extensos.
- [x] Scroll horizontal isolado na tabela de atendimento e captura integral para clipboard/PNG.
- [x] Validação do salvamento normaliza campos nulos/escalares e informa o campo inválido.
- [~] Integração completa com Supabase Auth e dados persistentes em produção. A parte de autenticação e seed RBAC foi preparada, mas ainda precisa ser validada com execução real do SQL e login oficial.

---

## 5. IMPLEMENTAÇÃO EM ANDAMENTO

### Correção — Bairro unificado + Região automática por OLT

#### Correção adicional — Placeholder após endereço NOC

Plano registrado em 2026-09-29 antes da alteração do parser.

- problema: registros NOC sem rótulo `Endereço:` incluem linhas finais `N/A`/`NÃO INFORMADA` no fallback, podendo fazer o bairro ser inferido como `SP INFORMADA`;
- hipótese: limitar o endereço fallback à linha/localização que termina em cidade/UF preserva a consolidação existente e exclui complementos soltos;
- teste discriminante: processar a amostra NOC com os cinco endereços e validar endereço principal `ESTRADA DO CAMINHO VELHO, 525` e bairro mais recorrente `JARDIM NOVA CIDADE`;
- escopo: ajustar apenas a extração fallback em `parseNocAddress`; não alterar classificação nem a lógica de consolidação NOC.

Resultado:

- o endereço fallback agora termina na linha com cidade/UF, sem incorporar linhas `N/A` ou `NÃO INFORMADA` posteriores;
- a limpeza de complementos reconhece códigos de bloco completos (`BL 2A`, `BL 3B`) e preserva o bairro após `FTTA`/condomínio;
- classificação e consolidação por recorrência do NOC foram reutilizadas, sem reimplementação;
- arquivos alterados: [backend/src/integrations/wuzapi/noc-consolidation.ts](backend/src/integrations/wuzapi/noc-consolidation.ts), [backend/test/parsers.test.ts](backend/test/parsers.test.ts), [ROADMAP.md](ROADMAP.md);
- validação: typecheck backend passou; parser NOC 20/20 passou, incluindo a amostra real.

Plano registrado antes da implementação em 2026-09-29.

#### Estruturas encontradas e reutilizadas

- `ActivationAnalysis.bairro_principal` e `endereco_principal` já recebem a saída da consolidação NOC em [backend/src/integrations/wuzapi/semantic.ts](backend/src/integrations/wuzapi/semantic.ts);
- `resolveOltRegion` já centraliza o mapa padrão e overrides manuais em [backend/src/integrations/wuzapi/noc-consolidation.ts](backend/src/integrations/wuzapi/noc-consolidation.ts);
- `calls` é a entidade consultada por listagem e dashboard; o contrato `Call` ainda não possui Bairro nem Endereço;
- a sincronização Google Drive já cria/atualiza `calls`, mas não trata endereço FIELD/bairro nem chama o resolver de OLT;
- o dashboard agrega região/tipo/status no backend, mas não possui agrupamento por bairro.

#### Escopo planejado

- adicionar somente os campos oficiais `bairro` e `address` ao chamado, com migration compatível para PostgreSQL e Supabase;
- copiar a saída NOC existente para o chamado aceito sem alterar classificação ou extração NOC;
- extrair Bairro de endereço D-1 com critérios conservadores, mantendo o endereço original no payload de origem;
- preservar Bairro/Endereço já preenchidos quando uma atualização vier vazia;
- aplicar `resolveOltRegion` na criação, edição e reprocessamento; se não houver mapeamento, manter a região já disponível;
- disponibilizar os campos na API, listagem/detalhe de chamados e agregar chamados por `bairro` no dashboard;
- testar NOC, FIELD, ausência/preservação de Bairro, mudança de OLT e indicador por bairro.

#### Arquivos previstos

- backend: `types.ts`, `store.ts`, `server.ts`, integração Google Drive e adaptador Supabase;
- banco: nova migration incremental em `database/migrations` e `supabase/migrations`;
- frontend: `api.ts` e `App.tsx`;
- testes: regressões existentes de parser e store.

### Resultado da correção (2026-09-29)

#### O que foi feito

- o campo oficial `calls.bairro` e `calls.address` agora recebem a análise NOC existente ao aceitar acionamento; a lógica de classificação e consolidação NOC não foi alterada;
- a sincronização Google Drive limpa prefixos de rua duplicados e extrai bairro somente quando o endereço contém contexto suficiente de cidade;
- atualizações vazias preservam Bairro/Endereço válidos já gravados;
- `resolveOltRegion` é usado na criação WuzAPI/Drive e em qualquer atualização; OLT sem mapeamento preserva a região atual/disponível;
- listagem, busca/filtro, detalhe e ranking do dashboard usam o mesmo campo `bairro`.

#### Arquivos alterados

- [backend/src/types.ts](backend/src/types.ts)
- [backend/src/store.ts](backend/src/store.ts)
- [backend/src/server.ts](backend/src/server.ts)
- [backend/src/integrations/google-drive.ts](backend/src/integrations/google-drive.ts)
- [backend/src/integrations/supabase/client.ts](backend/src/integrations/supabase/client.ts)
- [frontend/src/api.ts](frontend/src/api.ts)
- [frontend/src/App.tsx](frontend/src/App.tsx)
- [backend/test/supervisor-scoping.test.ts](backend/test/supervisor-scoping.test.ts)
- [database/migrations/009_call_location_fields.sql](database/migrations/009_call_location_fields.sql)
- [supabase/migrations/202609290009_call_location_fields.sql](supabase/migrations/202609290009_call_location_fields.sql)
- [ROADMAP.md](ROADMAP.md)

#### Banco e endpoints

- entidade alterada: `calls`, com `address` e `bairro`; índice composto para consultas por bairro/status/data;
- endpoints alterados: `PATCH /api/chamados/:id` aceita Endereço/Bairro; `GET /api/chamados` e `GET /api/dashboards/operacao` retornam/agrupam os campos existentes; nenhum endpoint novo.

#### Problemas encontrados e próximos passos

- NOC já extraía bairro/endereço, mas a criação do chamado descartava esses valores; o modelo `Call` também não tinha os campos;
- o sincronizador D-1 não extraía endereço/bairro FIELD e não reutilizava o mapa OLT na reconciliação;
- aplicação da migration e validação com credenciais/linhas reais de Drive e Supabase continuam pendentes.

#### Testes

- regressões de parser + store: 22 passaram, 0 falharam;
- typecheck backend e build frontend passaram; o build mantém apenas o aviso existente de bundle maior que 500 kB.

---

## 6. HISTÓRICO DE IMPLEMENTAÇÕES

## 2026-09-29 — Bairro unificado e região automática por OLT

O plano foi registrado na seção 5 antes das mudanças de código. Implementada a integração da saída NOC existente e do endereço FIELD ao único campo `calls.bairro`, persistência de `calls.address`, proteção contra sobrescrita por valor vazio, resolução OLT→região na criação/edição/reprocessamento e agrupamento por bairro no dashboard. NOC ACESSO não foi reimplementado.

Migrations: [database/migrations/009_call_location_fields.sql](database/migrations/009_call_location_fields.sql) e [supabase/migrations/202609290009_call_location_fields.sql](supabase/migrations/202609290009_call_location_fields.sql).

## 2026-09-29 — Sincronização histórica incremental do Google Drive

### Objetivo
Tratar os CSVs do Drive como uma base histórica cumulativa e disponibilizar registros novos/alterados em consultas, telas e indicadores sem apagar dados por ausência.

### Alterações realizadas

- leitura paginada de todos os CSVs; versões mais recentes prevalecem quando a identidade operacional se repete;
- identidade por OS, BDESK, Office Track, OS Casa Cliente, contrato ou número de cliente;
- criação de chamados para registros elegíveis sem correspondência e atualização incremental dos existentes;
- reconciliação de status Finalizado/Cancelado, data de execução e motivo de cancelamento;
- armazenamento de origem, arquivo, payload atual, fingerprint e snapshots de alterações;
- contadores por execução persistidos em `google_drive_sync_runs`;
- filtro de período usa execução para chamados encerrados e abertura para ativos;
- ausência em arquivos posteriores não remove nem reabre registros.

### Migrations

- [database/migrations/008_google_drive_history.sql](database/migrations/008_google_drive_history.sql)
- [supabase/migrations/202609290008_google_drive_history.sql](supabase/migrations/202609290008_google_drive_history.sql)

### Resultado e validação

- regressão local cobre identidade, idempotência, reconciliação de cancelamento e contagem no dashboard;
- typecheck do backend sem erros;
- execução em banco Supabase/produção ainda depende de aplicar a migration e validar credenciais/pasta reais.

## 2026-09-29 — Referência de data nos indicadores históricos

### Objetivo
Exibir chamados encerrados no período em que foram executados, mesmo quando a abertura ocorreu em outra data.

### Alterações realizadas

- filtros de período usam `executed_at` para chamados finalizados/cancelados e `opened_at` para chamados ativos;
- quando um chamado encerrado não possui data de execução, o filtro usa a data de abertura;
- dashboard e listagem compartilham a mesma regra no runtime local, PostgreSQL e Supabase;
- teste de regressão cobre a listagem e o indicador de finalizados.

### Arquivos modificados

- [backend/src/store.ts](backend/src/store.ts)
- [backend/src/integrations/supabase/client.ts](backend/src/integrations/supabase/client.ts)
- [backend/test/supervisor-scoping.test.ts](backend/test/supervisor-scoping.test.ts)
- [docs/google-drive-d1-sync.md](docs/google-drive-d1-sync.md)
- [ROADMAP.md](ROADMAP.md)

### Resultado
Chamados históricos já existentes no banco entram no período de execução correto. O ciclo atual persiste o status em `calls.status` e registra alterações em `call_logs`; não houve mudança de schema.

### Limitação pendente
Linhas do Drive sem chamado correspondente ainda não são inseridas no banco e seguem fora das telas e indicadores. A próxima etapa deve definir sua persistência histórica e evitar sobreposição com chamados criados pelo fluxo operacional.

### Testes

- `npx.cmd tsx --test test/supervisor-scoping.test.ts`: 2 passaram, 0 falharam;
- `npx.cmd tsc -p tsconfig.json --noEmit`: passou.

## 2026-09-23 — Escopo de supervisor e continuidade do projeto

### Objetivo
Manter a continuidade do desenvolvimento e finalizar o controle de visibilidade por equipe do supervisor sem depender da memória da conversa anterior.

### Alterações realizadas

- ajuste de vínculo de usuários demo para supervisores;
- aplicação de filtro por `supervisorId` em chamadas e dashboard;
- atualização do roadmap para refletir o estado real do projeto;
- criação de teste de regressão focado na regra de supervisor.

### Arquivos criados

- [backend/test/supervisor-scoping.test.ts](backend/test/supervisor-scoping.test.ts)

### Arquivos modificados

- [backend/src/store.ts](backend/src/store.ts)
- [ROADMAP.md](ROADMAP.md)

### Arquivos removidos

- Nenhum.

### Resultado
A lógica de scoping da equipe foi centralizada no backend e documentada para continuidade por outro agente.

### Testes

- verificação de erros do editor em [backend/src/store.ts](backend/src/store.ts): sem erros;
- verificação de erros do editor em [backend/test/supervisor-scoping.test.ts](backend/test/supervisor-scoping.test.ts): sem erros;
- execução do conjunto de testes do backend em ambiente atual: falha no boot do servidor HTTP em testes automatizados, indicando que há um problema de inicialização do backend que precisa ser investigado separadamente.

### Pendências

- confirmar o bootstrap do servidor em modo de teste;
- validar o fluxo de autenticação real com Supabase;
- revisar a suíte de testes HTTP do backend para estabilizar as dependências de processo.

### Próximo passo
Investigar o motivo do boot do backend em testes automatizados e então validar o escopo do supervisor end-to-end.

---

## 7. PROBLEMAS CONHECIDOS

### � Problema resolvido
Bootstrap do backend em testes automatizados falha por estado compartilhado e porta fixa reutilizada.

Status: Resolvido

Impacto: a suíte de testes HTTP ficava instável quando o processo anterior não encerrava completamente ou quando o ambiente global era alterado por testes concorrentes.

Causa conhecida: o servidor de teste reutilizava a mesma porta em execuções seguidas e não restaurava o ambiente global antes de iniciar o próximo caso.

Solução aplicada:

- uso de porta dinâmica por execução do teste;
- encerramento explícito e aguardado do processo anterior antes de iniciar um novo servidor;
- restauração das variáveis de ambiente em testes que alteram runtime e Supabase.

Arquivos envolvidos:

- [backend/test/http.test.ts](backend/test/http.test.ts)
- [backend/test/supervisor-scoping.test.ts](backend/test/supervisor-scoping.test.ts)

---

### 🟢 Problema resolvido
Negação de visibilidade de chamadas fora da equipe do supervisor.

Causa: a regra de `supervisorId` existia na API, mas a aplicação em memória/local não filtrava corretamente os chamados nem o detalhe do chamado.

Solução: ajuste do filtro na camada de dados e validação por vínculo do técnico ao supervisor.

Arquivos envolvidos:

- [backend/src/store.ts](backend/src/store.ts)
- [backend/src/server.ts](backend/src/server.ts)

---

### 🟢 Problema resolvido
Build de deploy falhava por incompatibilidade de tipos em `Technician`.

Status: Resolvido

Impacto: o Render não conseguia compilar o backend porque `leadTechnicianId` podia vir como `null` no runtime e no banco, enquanto o tipo exigia apenas `string`.

Causa conhecida: o contrato do modelo `Technician` em [backend/src/types.ts](backend/src/types.ts) não refletia o formato real dos dados e os objetos demo omitiram o campo `teamRole` obrigatório.

Solução: ajustar o tipo para aceitar `string | null`, preencher `teamRole` nos objetos demo em [backend/src/store.ts](backend/src/store.ts) e alinhar o contrato do frontend em [frontend/src/api.ts](frontend/src/api.ts).

Arquivos envolvidos:

- [backend/src/types.ts](backend/src/types.ts)
- [backend/src/store.ts](backend/src/store.ts)
- [frontend/src/api.ts](frontend/src/api.ts)

---

### 🟢 Problema resolvido
Bairros placeholders em NOC e ausência de mapeamento de OLT para região.

Status: Resolvido

Impacto: mensagens com `NÃO INFORMADO COLOMBIA`, `N/A` e outras sentenças genéricas podiam contaminar o bairro principal, e OLTs conhecidos não tinham região padrão quando a operação dependia de classificação geográfica.

Causa conhecida: a consolidação de endereços NOC não removia placeholders de bairro corretamente, enquanto o módulo de NOC não possuía tabela padrão de `OLT -> região` nem prioridade de override manual.

Solução aplicada:

- limpeza robusta do bairro para remover placeholders e manter o valor válido mais recorrente;
- preservação do prefixo `BAIRRO` quando ele faz parte do dado real (ex.: `BAIRRO A`);
- tabela de fallback de região por OLT com override manual de maior prioridade;
- bloqueio do preenchimento de bairro/endereço para fluxos `NOC TX`, que não possuem bairro aplicável.

Arquivos envolvidos:

- [backend/src/integrations/wuzapi/noc-consolidation.ts](backend/src/integrations/wuzapi/noc-consolidation.ts)
- [backend/src/integrations/wuzapi/semantic.ts](backend/src/integrations/wuzapi/semantic.ts)
- [backend/test/parsers.test.ts](backend/test/parsers.test.ts)

### Validação

- execução de regressão focada: `npx tsx --test test/parsers.test.ts`;
- resultado: 19 testes passaram, 0 falharam.

---

## 8. DECISÕES TÉCNICAS

## Decisão — 2026-09-23
**Decisão:** manter a regra de escopo do supervisor no backend, não no frontend.

**Motivo:** o backend é a fonte única de verdade para permissões, filtros de dados e checagem de acesso. Isso evita que a UI possa contornar restrições de visibilidade.

**Alternativas consideradas:**

- aplicar filtro só no frontend;
- criar um bypass de query no cliente.

**Consequência:** todos os endpoints que consultam chamadas e dashboards precisam continuar a validar o contexto de supervisor no servidor.

---

## 2026-09-24 — Visão de ordens do supervisor e filtros de período

### Objetivo
Dar ao usuário com cargo Supervisor uma função dedicada para consultar todas as ordens dos técnicos vinculados à sua equipe, com filtro de data também disponível na visão geral e nas listagens de ordens.

### Alterações realizadas

- criação da rota e item de menu `Ordens da equipe`, visíveis apenas para o cargo Supervisor;
- criação da tela de ordens dos técnicos do supervisor reutilizando o endpoint protegido `/api/chamados`;
- aplicação dos campos `from` e `to` na consulta server-side de ordens;
- adição do filtro de período na visão geral e nas telas de ordens;
- registro da mudança no roadmap.

### Arquivos modificados

- [frontend/src/App.tsx](frontend/src/App.tsx)
- [frontend/src/filters.css](frontend/src/filters.css)
- [ROADMAP.md](ROADMAP.md)

### Segurança e escopo

A tela do supervisor não recebe um identificador de equipe pelo frontend. O backend identifica o supervisor pelo usuário autenticado e aplica `supervisorId` na consulta, mantendo a regra de visibilidade no servidor.

### Validação

- build do frontend concluído com sucesso usando `npm run build --workspace frontend`;
- build do backend já validado anteriormente com sucesso;
- permanece pendente a validação manual do login de supervisor em ambiente publicado.

## 2026-09-24 — Correção da matriz de permissões

### Problema
Os cargos Supervisor e Visualização apareciam sem permissões, enquanto Operador e Mesário tinham vínculos incorretos no banco oficial.

### Solução
Criadas migrations idempotentes para PostgreSQL local e Supabase, com a matriz abaixo:

| Cargo | Permissões principais |
| --- | --- |
| Administrador | Todas as permissões disponíveis |
| Operador | Dashboard, chamados operacionais, acionamentos, importações e consulta de técnicos/supervisores |
| Supervisor | Dashboard, consulta de chamados, técnicos e supervisores |
| Mesário | Visualização e decisão de acionamentos |
| Visualização | Dashboard e consultas de chamados, técnicos e supervisores |

### Arquivos criados

- [database/migrations/006_assign_rbac_permissions.sql](database/migrations/006_assign_rbac_permissions.sql)
- [supabase/migrations/202609240006_assign_rbac_permissions.sql](supabase/migrations/202609240006_assign_rbac_permissions.sql)

As migrations precisam ser executadas no banco correspondente para atualizar os vínculos já existentes.

## 2026-09-24 — Correção da edição de usuários no Supabase

### Problema
Ao trocar o cargo de um perfil pela tela de usuários, a API validava o novo cargo, mas o store não tinha um caminho de atualização para o runtime Supabase. A operação caía no mapa local em memória e o usuário real não era encontrado.

### Solução
Adicionado `updateSupabaseUser`, que atualiza `profiles.role_id` e demais campos do perfil. Alterações de e-mail e senha também são sincronizadas no Supabase Auth quando informadas.

### Arquivos modificados

- [backend/src/integrations/supabase/client.ts](backend/src/integrations/supabase/client.ts)
- [backend/src/store.ts](backend/src/store.ts)
- [ROADMAP.md](ROADMAP.md)

### Validação

- build do backend concluído com sucesso usando `npm run build --workspace backend`.

## 2026-09-24 — Melhoria visual dos cards de supervisores

### Alteração
Os cards de supervisores foram reorganizados para manter cabeçalho, lista de técnicos e ação de equipe alinhados entre si. A contagem da equipe ganhou destaque, os membros passaram a ter altura consistente e equipes sem técnicos agora exibem uma mensagem orientativa.

### Arquivos modificados

- [frontend/src/App.tsx](frontend/src/App.tsx)
- [frontend/src/main.tsx](frontend/src/main.tsx)
- [frontend/src/supervisor-overrides.css](frontend/src/supervisor-overrides.css)
- [ROADMAP.md](ROADMAP.md)

### Validação

- build do frontend concluído com sucesso usando `npm run build --workspace frontend`.

## 2026-09-24 — Tabela operacional de atendimento e SLA

### Alteração
A aba `Em atendimento` passou a usar uma tabela operacional inspirada na referência recebida, com as colunas Protocolo, Técnico, Prazo, Afet., Tipo de evento, OLT, Cidade, Observação e Timer. A coluna `Afet.` permanece com `-` até existir uma origem oficial para esse dado no modelo de chamados.

### Regra de prazo

- até 8 horas desde `openedAt`: `No prazo`, verde;
- acima de 8 horas e até 10 horas: `Fora do prazo`, amarelo;
- acima de 10 horas: `Outlier`, vermelho.

O timer exibe o tempo decorrido desde a abertura no formato `HH:MM:SS`.

### Coluna SLA
A tabela também exibe o tempo desde `openedAt`, que representa a data de acionamento. A coluna `Prazo` permanece responsável apenas pela classificação em no prazo, fora do prazo ou outlier.

## 2026-09-24 — Seletor de regiões no detalhe do chamado

### Alteração
O campo livre de região no detalhe do chamado foi substituído por um seletor com as áreas operacionais informadas: Columbia, Sertãozinho, Turquesa, Giulia, Mauá, Ribeirão Pires, Santa Luzia, Câmbio, Caçula, Cidade Tiradentes e variações, Ferraz de Vasconcelos e variações, Guaianases e variações, Guarulhos e variações, Mogi, além das demais regiões fornecidas.

Regiões antigas que não estejam na lista continuam visíveis para não apagar dados existentes acidentalmente.

### Arquivos modificados

- [frontend/src/App.tsx](frontend/src/App.tsx)
- [frontend/src/main.tsx](frontend/src/main.tsx)
- [frontend/src/region-select.css](frontend/src/region-select.css)
- [ROADMAP.md](ROADMAP.md)

### Validação

- build do frontend concluído com sucesso usando `npm run build --workspace frontend`.

## 2026-09-24 — Notificações e contador de acionamentos

### Alterações

- removido o botão de pesquisa do topo;
- adicionada detecção de novos acionamentos por ID;
- novo acionamento exibe toast centralizado no topo por alguns segundos;
- após o toast desaparecer, o acionamento continua acessível pelo sino;
- contador de acionamentos pendentes adicionado ao item `Acionamentos` do menu;
- endpoint de notificações liberado para usuários com `activations.view`, mesmo sem `dashboard.view`;
- runtime Supabase passou a consultar acionamentos reais em vez do mapa demo.

### Arquivos modificados

- [backend/src/server.ts](backend/src/server.ts)
- [backend/src/store.ts](backend/src/store.ts)
- [frontend/src/App.tsx](frontend/src/App.tsx)
- [frontend/src/main.tsx](frontend/src/main.tsx)
- [frontend/src/notifications-overrides.css](frontend/src/notifications-overrides.css)
- [ROADMAP.md](ROADMAP.md)

### Validação

- build do backend concluído com sucesso usando `npm run build --workspace backend`;
- build do frontend concluído com sucesso usando `npm run build --workspace frontend`.

## 2026-09-24 — Correção de overflow no gráfico do dashboard

### Problema
O gráfico de distribuição multiplicava o valor bruto de chamados por 28px. Com 27 chamados, a barra chegava a 756px e atravessava verticalmente a tela.

### Solução
Adicionado limite visual de 170px para as barras do gráfico, mantendo o painel estável mesmo com volumes maiores.

### Arquivos modificados

- [frontend/src/main.tsx](frontend/src/main.tsx)
- [frontend/src/dashboard-overrides.css](frontend/src/dashboard-overrides.css)
- [ROADMAP.md](ROADMAP.md)

### Validação

- build do frontend concluído com sucesso usando `npm run build --workspace frontend`.

## 2026-09-24 — Correção de acionamento com texto longo

### Problema
Um dos 27 acionamentos falhava ao ser aceito com `value too long for type character varying(255)`. O texto extraído podia exceder o limite dos campos `reason` ou `slot_pon` da tabela `calls`.

### Solução
Os campos `reason` e `slot_pon` foram alterados para `text` nas migrations local e Supabase, preservando o conteúdo completo. A rota de aceite também passou a retornar erro JSON com contexto quando ocorrer uma falha de persistência.

### Arquivos criados

- [database/migrations/007_expand_activation_call_fields.sql](database/migrations/007_expand_activation_call_fields.sql)
- [supabase/migrations/202609240007_expand_activation_call_fields.sql](supabase/migrations/202609240007_expand_activation_call_fields.sql)

### Arquivos modificados

- [backend/src/server.ts](backend/src/server.ts)
- [ROADMAP.md](ROADMAP.md)

### Validação

- build do backend concluído com sucesso usando `npm run build --workspace backend`;
- as migrations precisam ser executadas no banco oficial antes de aceitar novamente o acionamento afetado.

## 2026-09-24 — Atreladas e consolidação de endereços NOC

### Funções reutilizadas e alteradas

- `analyzeOperationalMessage` em [backend/src/integrations/wuzapi/semantic.ts](backend/src/integrations/wuzapi/semantic.ts) continua extraindo `localizacao` e agora adiciona o resultado consolidado;
- `receiveActivation` em [backend/src/store.ts](backend/src/store.ts) e `createSupabaseActivation` em [backend/src/integrations/supabase/client.ts](backend/src/integrations/supabase/client.ts) persistem a relação de atreladas no bloco de análise;
- a mensagem original, contratos, OS, BDESK, OfficeTrack, OLT e demais dados recebidos permanecem inalterados.

### Funções novas

- `parseNocAddress`: estrutura nome, contrato, CEP, endereço, complemento, bairro e endereço-base sem descartar o texto original;
- `consolidateNocAddresses`: normaliza, agrupa e escolhe endereço-base, bairro e CEP por recorrência determinística;
- `identifyAtreladas`: relaciona acionamentos por identificadores técnicos compartilhados e, como reforço, endereço-base e bairro iguais.

### Regras implementadas

- diferenças de apartamento, bloco e complemento não quebram o agrupamento do endereço-base;
- bairro é escolhido por recorrência; em empate, prioriza o bairro do endereço-base mais recorrente e depois a primeira ocorrência;
- clientes e contratos permanecem individualizados em `clientes_afetados`;
- endereço original e campos normalizados coexistem para auditoria;
- endereço sozinho não é identificador absoluto de atrelada.

### Arquivos modificados/criados

- [backend/src/types.ts](backend/src/types.ts)
- [backend/src/integrations/wuzapi/semantic.ts](backend/src/integrations/wuzapi/semantic.ts)
- [backend/src/integrations/wuzapi/noc-consolidation.ts](backend/src/integrations/wuzapi/noc-consolidation.ts)
- [backend/src/integrations/supabase/client.ts](backend/src/integrations/supabase/client.ts)
- [backend/src/store.ts](backend/src/store.ts)
- [backend/test/parsers.test.ts](backend/test/parsers.test.ts)
- [ROADMAP.md](ROADMAP.md)

### Validação

- testes isolados de parser NOC: 17 aprovados;
- build do backend concluído com sucesso usando `npm run build` dentro de `backend`.

### Correção posterior
O timer da tabela não usa mais `openedAt`: ele usa o `created_at` da observação mais recente. Chamados sem observação exibem `Sem observacao`. O SLA continua sendo calculado desde a abertura.

### Arquivos adicionais modificados

- [backend/src/types.ts](backend/src/types.ts)
- [backend/src/store.ts](backend/src/store.ts)
- [backend/src/integrations/supabase/client.ts](backend/src/integrations/supabase/client.ts)
- [frontend/src/api.ts](frontend/src/api.ts)
- [frontend/src/App.tsx](frontend/src/App.tsx)
- [frontend/src/attendance.css](frontend/src/attendance.css)
- [frontend/src/attendance-sla.css](frontend/src/attendance-sla.css)

### Arquivos modificados

- [frontend/src/App.tsx](frontend/src/App.tsx)
- [frontend/src/main.tsx](frontend/src/main.tsx)
- [frontend/src/attendance.css](frontend/src/attendance.css)
- [ROADMAP.md](ROADMAP.md)

### Validação

- build do frontend concluído com sucesso usando `npm run build --workspace frontend`.

## 2026-09-24 — Restrição de técnicos na atribuição de chamados

### Regra definida
Dentro do detalhe do chamado, o campo de atribuição deve listar somente profissionais com tipo `Tecnico` e status ativo. Auxiliares e técnicos inativos não podem ser selecionados.

### Alterações

- filtro de auxiliares e inativos no seletor do frontend;
- validação server-side para rejeitar atribuições inválidas enviadas diretamente à API.

### Arquivos modificados

- [frontend/src/App.tsx](frontend/src/App.tsx)
- [backend/src/server.ts](backend/src/server.ts)
- [ROADMAP.md](ROADMAP.md)

### Validação

- build do backend concluído com sucesso usando `npm run build --workspace backend`;
- build do frontend concluído com sucesso usando `npm run build --workspace frontend`.

## 2026-09-24 — Escopo do supervisor limitado à aba da equipe

### Regra definida
O usuário Supervisor pode consultar todos os chamados na Visão geral, Chamados abertos e Em atendimento. Apenas a aba `Ordens da equipe` envia `teamScope=true` e recebe ordens filtradas pelos técnicos vinculados ao supervisor autenticado.

### Alterações

- remoção do escopo automático de supervisor no dashboard e nas listagens gerais;
- filtro server-side explícito na aba de ordens da equipe;
- detalhe de ordem preserva o escopo quando aberto a partir da aba da equipe.

### Arquivos modificados

- [backend/src/server.ts](backend/src/server.ts)
- [frontend/src/api.ts](frontend/src/api.ts)
- [frontend/src/App.tsx](frontend/src/App.tsx)
- [ROADMAP.md](ROADMAP.md)

### Validação

- build do backend concluído com sucesso usando `npm run build --workspace backend`;
- build do frontend concluído com sucesso usando `npm run build --workspace frontend`.

## 2026-09-24 — Vínculo de login e equipe do supervisor

### Problema
O cadastro de supervisor permitia informar apenas nome e região. O login criado separadamente não era associado ao registro em `supervisors`, e por isso o supervisor autenticado aparecia sem equipe.

### Solução
O cadastro agora permite escolher um usuário com cargo Supervisor. Supervisores existentes também podem ser abertos e vinculados ou desvinculados de um login pelo campo `Login vinculado`. A atualização persiste `profile_id` no Supabase ou `user_id` no PostgreSQL local.

### Arquivos modificados

- [frontend/src/App.tsx](frontend/src/App.tsx)
- [frontend/src/api.ts](frontend/src/api.ts)
- [backend/src/server.ts](backend/src/server.ts)
- [backend/src/store.ts](backend/src/store.ts)
- [backend/src/integrations/supabase/client.ts](backend/src/integrations/supabase/client.ts)
- [ROADMAP.md](ROADMAP.md)

### Validação

- build do frontend concluído com sucesso usando `npm run build --workspace frontend`;
- build do backend concluído com sucesso usando `npm run build --workspace backend`.

## 2026-09-24 — Compactação do catálogo de permissões

### Alteração
O catálogo lateral da tela de cargos ocupava altura excessiva porque cada permissão usava uma linha inteira. As permissões agora são exibidas em duas colunas no desktop, mantendo código e descrição, e retornam para uma coluna em telas menores.

### Arquivos modificados

- [frontend/src/App.tsx](frontend/src/App.tsx)
- [frontend/src/main.tsx](frontend/src/main.tsx)
- [frontend/src/permissions.css](frontend/src/permissions.css)

### Validação

- build do frontend concluído com sucesso usando `npm run build --workspace frontend`.

## 9. ARQUIVOS IMPORTANTES

| Arquivo | Função | Status |
| --- | --- | --- |
| [backend/src/server.ts](backend/src/server.ts) | API, autenticação e endpoints | Ativo |
| [backend/src/store.ts](backend/src/store.ts) | regras de negócio, dados e permissões | Ativo |
| [frontend/src/App.tsx](frontend/src/App.tsx) | interface operacional | Ativo |
| [backend/src/integrations/supabase/client.ts](backend/src/integrations/supabase/client.ts) | integração Supabase | Em manutenção |
| [backend/src/integrations/wuzapi/client.ts](backend/src/integrations/wuzapi/client.ts) | integração WuzAPI | Ativo |
| [database/migrations](database/migrations) | schema SQL principal | Ativo |
| [supabase/migrations](supabase/migrations) | schema Supabase | Em validação |
| [docs/official-data-mapping.md](docs/official-data-mapping.md) | mapeamento de dados oficiais | Ativo |

---

## 10. BANCO DE DADOS

O histórico da integração Google Drive requer as migrations [database/migrations/008_google_drive_history.sql](database/migrations/008_google_drive_history.sql) ou [supabase/migrations/202609290008_google_drive_history.sql](supabase/migrations/202609290008_google_drive_history.sql). A localização dos chamados requer também [database/migrations/009_call_location_fields.sql](database/migrations/009_call_location_fields.sql) ou [supabase/migrations/202609290009_call_location_fields.sql](supabase/migrations/202609290009_call_location_fields.sql), conforme o runtime. Aplique-as na ordem antes de habilitar a integração no ambiente correspondente.

---

## 11. CONFIGURAÇÕES E AMBIENTE

Variáveis relevantes:

- JWT_SECRET
- PORT
- REDEFLOW_RUNTIME
- REDEFLOW_DEMO_DATA
- DATABASE_URL
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- WUZAPI_WEBHOOK_TOKEN
- WUZAPI_ACTIVATION_GROUP_ID
- CORS_ORIGINS

Portas e serviços:

- backend local: 3333
- frontend local: 5173
- Supabase: configurável por ambiente
- Google Drive: integração opcional, acionada somente quando habilitada

---

## 12. TESTES

### Teste
Login com usuário administrador

Resultado: ✅ funcionando no modo local demonstrativo.

### Teste
Importação de arquivos e normalização WuzAPI

Resultado: ✅ funcionando em testes unitários.

### Teste
Escopo do supervisor por equipe

Resultado: ✅ regra aplicada no backend, com teste de regressão registrado.

### Teste
Boot do backend em suíte HTTP

Resultado: ❌ falhou no ambiente atual.

Motivo: a inicialização do servidor não ficou disponível para a suíte automatizada.

---

## 13. PENDÊNCIAS

### 🔴 CRÍTICO

- estabilizar o boot do backend em testes automatizados;
- validar autenticação do Supabase real com seed e login oficial;
- confirmar consistência entre runtime local e produção.

### 🟠 IMPORTANTE

- revisar a interface de dashboards para filtros de supervisor e data;
- confirmar integração de exceções de acesso por papel.

### 🟡 MELHORIA

- refinamento visual responsivo de telas operacionais;
- revisar e limpar testes duplicados ou dependentes de servidor.

---

## 14. PRÓXIMA AÇÃO

1. aplicar migrations 008 e 009 no runtime utilizado;
2. validar a sincronização real do Drive e confirmar Bairro/Endereço/Região nos registros persistidos;
3. validar a integração real com Supabase Auth quando a seed e o ambiente estiverem prontos.

---

## 15. CHECKPOINT DE CONTINUIDADE

## 🔖 CHECKPOINT — 2026-09-23

### O que foi feito

- corrigido o filtro de equipe para supervisores;
- atualizado o roadmap para refletir o estado real do projeto;
- registrado a regressão e a correção no código.

### Onde paramos

No ponto em que o backend ainda precisa ser validado em teste HTTP completo e o fluxo de Supabase real precisa ser checado utilizando a seed RBAC.

### O que está funcionando

- regra de escopo em memória/local do backend;
- autenticação demo local;
- dashboards e chamadas em runtime local;
- UI operacional principal.

### O que não está funcionando

- testes HTTP automatizados do backend em ambiente atual;
- integração real com Supabase Auth/seed em execução oficial.

### Arquivos modificados nesta sessão

- [backend/src/store.ts](backend/src/store.ts)
- [backend/test/supervisor-scoping.test.ts](backend/test/supervisor-scoping.test.ts)
- [ROADMAP.md](ROADMAP.md)

### Próximo passo exato

Investigar a falha de bootstrap do backend em testes automáticos e validar os endpoints de supervisor em execução real.

### Observações para o próximo agente

A regra de escopo do supervisor foi implementada no backend, mas o ambiente de teste do servidor ainda precisa ser estabilizado antes da validação end-to-end. O conjunto de dados demo possui usuários de supervisor válidos para continuidade local; a integração oficial com Supabase depende da execução da migration de seed e do login real.
