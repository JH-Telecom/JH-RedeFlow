# ROADMAP DO PROJETO

## 1. VISÃO GERAL

O projeto JH RedeFlow é uma plataforma operacional para gestão de chamados, técnicos, supervisores, dashboards e integrações do time de operação. O objetivo principal é centralizar a visão de produção, o controle de filas e a operação de campo em um ambiente com autenticação, permissões e métricas executivas.

Principais usuários: operadores, supervisores, administradores, mesários e usuários de visualização. As principais tecnologias do projeto são TypeScript, Express, Vite, PostgreSQL/Supabase e integrações com WuzAPI, Google Drive e importações CSV/XLSX. A arquitetura é separada em frontend, backend e banco, com backend responsável por todas as regras de negócio, autenticação, permissões, validação e integrações.

---

## 2. ESTADO ATUAL

Status geral: EM DESENVOLVIMENTO

Última atualização: 2026-09-30

Última implementação: tela dedicada de chamados finalizados e cancelados, com tabela e filtros reutilizados.

Agente responsável pela última alteração: GitHub Copilot

Próxima ação: aplicar a migration de anexos 012 local ou 014 Supabase e validar upload/download no runtime usado.

---

## 3. ARQUITETURA ATUAL

- Frontend: aplicação em React + Vite, em [frontend/src](frontend/src).
- Backend: API Express em [backend/src/server.ts](backend/src/server.ts) com regras de negócio em [backend/src/store.ts](backend/src/store.ts).
- Banco de dados: PostgreSQL com migrations em [database/migrations](database/migrations) e [supabase/migrations](supabase/migrations).
- Base D-0: snapshot da última planilha armazenado em `d0_base_records`; o campo `calls.ofs_status` mantém o estado nativo OFS sem substituir `calls.status`.
- Regiões por OLT: mapa padrão no código com overrides persistidos em `olt_region_overrides`, carregados no boot e editáveis por usuários com `settings.manage`.
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
- [x] Tela de chamados finalizados e cancelados com busca, filtros e tabela operacional reutilizada.
- [x] Observações e auditoria de chamados.
- [x] Finalização, cancelamento e regras de status.
- [x] WuzAPI, acionamentos e análise de mensagens operacionais.
- [x] Importação de bases CSV/XLSX.
- [x] Upload/substituição e limpeza da base D-0 na aba Importações, com atualização de localização, Status OFS e Data Fim por identificadores de chamado.
- [x] Editor pesquisável de OLT→Região em Configurações, com alteração de defaults, inclusão/remoção de OLTs personalizadas e persistência após reinício.
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
- [x] Normalização NOC de ruas com números no nome, placeholders com underscore e bairro consensual por CEP.
- [x] Remoção de prefixo CLT_ e duplicação de tipos de via, com inferência do Bairro em endereços FIELD.
- [x] Enriquecimento do nome do cliente em chamados FIELD pela coluna `Nome` nas bases D-0/D-1, sem alterar chamados não FIELD.
- [x] Remoção de letra isolada de bloco entre número do imóvel e bairro na extração NOC.
- [x] Animação do sino em balanço amortecido para novos acionamentos; rotação reservada ao refresh.
- [x] Anexos no histórico de observações de chamados, com prévia de imagens e download por clique.
- [x] Inferência do Bairro a partir do endereço completo em D-0/D-1 quando a coluna Bairro não existe, com Cidade derivada do sufixo do endereço em caso de placeholder.
- [x] Segmentação de registros NOC iniciados por contrato/nome e leitura de CEP no formato `NN.NNN-NNN`.
- [x] Salvamento de chamados com listas longas de Slot/PON e motivos extensos.
- [x] Scroll horizontal isolado na tabela de atendimento, colunas com larguras fixas e cópia TSV sem estilos visuais, incluindo o texto e limite da coluna PRAZO.
- [x] Validação do salvamento normaliza campos nulos/escalares e informa o campo inválido.
- [~] Integração completa com Supabase Auth e dados persistentes em produção. A parte de autenticação e seed RBAC foi preparada, mas ainda precisa ser validada com execução real do SQL e login oficial.

---

## 5. IMPLEMENTAÇÃO EM ANDAMENTO

### Anexos nas observações de chamados — implementado em 2026-09-29

- observações aceitam texto, anexos ou ambos; cada observação mantém relação persistente com os arquivos enviados;
- imagens recebem miniatura no histórico; outros formatos aparecem como arquivo; clicar em qualquer anexo baixa seu conteúdo;
- listagens carregam apenas metadados; conteúdo é entregue sob demanda por endpoint autenticado e condicionado ao acesso/escopo do chamado;
- limites por observação: até 8 arquivos, 5 MB por arquivo e 10 MB combinados; anexos sem texto são permitidos;
- validação Base64 usa decode/reencode por Buffer; evita stack overflow que ocorria com arquivos de imagem grandes;
- novas tabelas: `call_observation_attachments`, com remoção em cascata quando a observação é removida;
- migrations: [database/migrations/012_call_observation_attachments.sql](database/migrations/012_call_observation_attachments.sql) e [supabase/migrations/202609290014_call_observation_attachments.sql](supabase/migrations/202609290014_call_observation_attachments.sql);
- validação: teste HTTP de upload/listagem/download com imagem de 4 MiB 1/1 passou, typecheck backend e build frontend passaram. Migração ainda precisa ser aplicada no ambiente correspondente.

Arquivos alterados: [backend/src/types.ts](backend/src/types.ts), [backend/src/store.ts](backend/src/store.ts), [backend/src/server.ts](backend/src/server.ts), [backend/test/http.test.ts](backend/test/http.test.ts), [frontend/src/api.ts](frontend/src/api.ts), [frontend/src/App.tsx](frontend/src/App.tsx), [frontend/src/main.tsx](frontend/src/main.tsx), [frontend/src/observation-attachments.css](frontend/src/observation-attachments.css), migrations local 012/Supabase 014 e [ROADMAP.md](ROADMAP.md).

### Animação de ícones — implementada em 2026-09-29

- varredura do frontend encontrou animação de ícone somente no spinner de atualização; keyframes de toasts/confirmações animam contêineres e foram preservados;
- o sino não gira durante polling; ao detectar novo acionamento, faz um toque lateral curto e amortecido;
- o ícone RefreshCcw mantém rotação enquanto a operação está ativa;
- `prefers-reduced-motion` desativa as duas animações;
- validação: build frontend passou; permanece o aviso existente de bundle acima de 500 kB.

Arquivos alterados: [frontend/src/App.tsx](frontend/src/App.tsx), [frontend/src/refresh.css](frontend/src/refresh.css) e [ROADMAP.md](ROADMAP.md).

### Inferência de Bairro FIELD a partir do endereço completo — implementada em 2026-09-29

- D-0 agora deriva o Bairro do endereço quando a planilha não tem coluna Bairro;
- D-1 também usa o extrator compartilhado quando o Bairro não é encontrado na parte anterior à Cidade;
- Cidade vazia ou placeholder (`Não informada`, `N/A`) passa a ser inferida do sufixo `CIDADE - UF` do endereço;
- a reconciliação D-1 considera `address` e `bairro` ao detectar alterações, garantindo que o Bairro seja salvo mesmo quando for o único campo ausente;
- Endereço permanece completo para exibição; prefixo `CLT_` e tipo de via repetido são normalizados; os campos Bairro e Cidade são preenchidos separadamente;
- nenhuma alteração de schema; sincronizar D-0/D-1 novamente atualiza os chamados existentes com valores ausentes;
- validação: 39 testes de parser, D-0, D-1 e escopo passaram; typecheck backend passou.

Arquivos alterados: [backend/src/integrations/wuzapi/noc-consolidation.ts](backend/src/integrations/wuzapi/noc-consolidation.ts), [backend/src/imports/d0.ts](backend/src/imports/d0.ts), [backend/src/integrations/google-drive.ts](backend/src/integrations/google-drive.ts), [backend/test/d0-import.test.ts](backend/test/d0-import.test.ts), [backend/test/supervisor-scoping.test.ts](backend/test/supervisor-scoping.test.ts) e [ROADMAP.md](ROADMAP.md).

### Letra de bloco contaminando o Bairro NOC — implementado em 2026-09-29

- em endereços como `..., 733 A PARQUE SAO RAFAEL`, a letra isolada após o número do imóvel é tratada como complemento/bloco e removida antes da inferência do bairro;
- o consenso do exemplo resulta em `PARQUE SAO RAFAEL`, inclusive nos bairros individuais dos três clientes;
- nenhum schema foi alterado; chamados já persistidos não são recalculados e precisam de edição/reprocessamento;
- validação: parsers 26/26 e typecheck backend passaram.

Arquivos alterados: [backend/src/integrations/wuzapi/noc-consolidation.ts](backend/src/integrations/wuzapi/noc-consolidation.ts), [backend/test/parsers.test.ts](backend/test/parsers.test.ts) e [ROADMAP.md](ROADMAP.md).

### Nome do cliente em chamados FIELD — implementado em 2026-09-29

- a coluna `Nome` das bases D-0 e D-1 atualiza `calls.client` somente quando o tipo do chamado contém `Field`;
- o importador D-1 considera novos chamados e atualiza registros existentes; `client` agora participa da detecção de mudança para sincronização;
- chamadas de outros tipos não recebem o valor da coluna genérica `Nome`; aliases históricos já usados em D-1 permanecem preservados;
- o detalhe mostra o rótulo `Cliente` para Field; a fila identifica a coluna como `Cliente / Técnico B2C`;
- nenhuma alteração de schema; atualizações ocorrem nos próximos uploads/sincronizações;
- validação: 11 testes D-0/D-1/supervisor passaram; typecheck backend e build frontend passaram.

Arquivos alterados: [backend/src/imports/d0.ts](backend/src/imports/d0.ts), [backend/src/integrations/google-drive.ts](backend/src/integrations/google-drive.ts), [backend/test/d0-import.test.ts](backend/test/d0-import.test.ts), [backend/test/supervisor-scoping.test.ts](backend/test/supervisor-scoping.test.ts), [frontend/src/App.tsx](frontend/src/App.tsx) e [ROADMAP.md](ROADMAP.md).

### Endereços FIELD com CLT_ e tipos de via duplicados — implementado em 2026-09-29

- Endereços iniciados por `CLT_` agora removem esse prefixo antes da normalização; tipos de via repetidos no início (`RUA RUA`, `AVENIDA AVENIDA`, `TRAVESSA TRAVESSA`) são reduzidos a um;
- a inferência do bairro usa a base limpa, recuperando `PARQUE CONTINENTAL II` para `CLT_RUA RUA LISBOA, 76 ... GUARULHOS - SP`;
- teste confirma Endereço `RUA LISBOA, 76`, Bairro `PARQUE CONTINENTAL II`, e variantes de três tipos de via;
- nenhuma alteração de schema; chamados já aceitos não são atualizados automaticamente e precisam de edição/reprocessamento;
- validação: parser NOC/WuzAPI 25/25 e typecheck backend passaram.

Arquivos alterados: [backend/src/integrations/wuzapi/noc-consolidation.ts](backend/src/integrations/wuzapi/noc-consolidation.ts), [backend/test/parsers.test.ts](backend/test/parsers.test.ts) e [ROADMAP.md](ROADMAP.md).

### Correção de registros NOC iniciados por contrato/nome — implementada em 2026-09-29

- causa: `parseAddresses` dividia registros somente antes de `CEP`; o contrato/nome anterior ao primeiro CEP virava um sexto registro sem CEP e podia ser selecionado como Endereço;
- `parseAddresses` agora agrupa por linhas iniciadas por contrato numérico ou `Nome:` quando encontra múltiplos registros válidos; formatos antigos continuam usando a divisão por CEP;
- reconhecimento de CEP inclui o formato pontuado `NN.NNN-NNN` (ex.: `08.343-200`) em segmentação, extração e remoção do cabeçalho;
- regressão da mensagem reportada valida cinco clientes, endereço principal `RUA LA VIOLETEIRA, 122` e bairro `JARDIM DA CONQUISTA`;
- nenhuma alteração de schema; chamados que já foram persistidos com endereço incorreto não são recalculados automaticamente e exigem reprocessamento/edição;
- validação: suíte de parser passou 23/23 e typecheck backend passou.

Arquivos alterados: [backend/src/integrations/wuzapi/semantic.ts](backend/src/integrations/wuzapi/semantic.ts), [backend/src/integrations/wuzapi/noc-consolidation.ts](backend/src/integrations/wuzapi/noc-consolidation.ts), [backend/test/parsers.test.ts](backend/test/parsers.test.ts) e [ROADMAP.md](ROADMAP.md).

### Correção de endereço e bairro NOC — implementada em 2026-09-29

- `normalizeAddressBase` agora prioriza o número do imóvel após a vírgula, preservando o número que faz parte do nome da rua (ex.: `RUA 3 IRMAOS, 47`);
- placeholders com underscore são normalizados antes da limpeza; `CASA:34` e o token complementar `FU` deixam de contaminar o bairro;
- quando o bairro individual termina com o bairro mais recorrente e compartilha o CEP principal, a consolidação remove o prefixo de complemento e normaliza os registros de clientes;
- a mensagem de exemplo agora resulta em endereço principal `RUA 3 IRMAOS, 47` e bairro `VILA IOLANDA II` nos cinco registros;
- nenhum schema ou dado de banco foi alterado; registros já existentes não são recalculados automaticamente e precisam ser reprocessados/atualizados;
- validação: suíte `backend/test/parsers.test.ts` passou 22/22 e typecheck backend passou.

Arquivos alterados: [backend/src/integrations/wuzapi/noc-consolidation.ts](backend/src/integrations/wuzapi/noc-consolidation.ts), [backend/test/parsers.test.ts](backend/test/parsers.test.ts) e [ROADMAP.md](ROADMAP.md).

### Editor de OLT por Região — implementado em 2026-09-29

- a aba Configurações lista defaults e OLTs personalizadas; permite buscar, alterar Região, adicionar OLT e remover entradas personalizadas;
- `GET/PUT /api/configuracoes/olt-regioes` exigem `settings.manage`; duplicatas normalizadas são rejeitadas;
- overrides são persistidos em `olt_region_overrides` no PostgreSQL/Supabase e carregados no início do backend; a tabela padrão continua no código e serve de fallback;
- salvar novamente a Região padrão de uma OLT remove seu override; adicionar OLT personalizada cria override persistente;
- migrations: [database/migrations/011_olt_region_overrides.sql](database/migrations/011_olt_region_overrides.sql) e [supabase/migrations/202609290013_olt_region_overrides.sql](supabase/migrations/202609290013_olt_region_overrides.sql);
- testes: 21 testes de parser/resolução passaram incluindo override e OLT customizada; teste HTTP focado 1/1 passou para leitura/salvamento e permissão; build frontend e typecheck backend passaram.

Arquivos alterados: `backend/src/integrations/wuzapi/noc-consolidation.ts`, `backend/src/store.ts`, `backend/src/server.ts`, `backend/test/parsers.test.ts`, `backend/test/http.test.ts`, `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/main.tsx`, `frontend/src/settings-olt.css`, migrations 011/013 e `ROADMAP.md`.

### Base operacional D-0 e Status OFS — implementado em 2026-09-29

- a aba Importações permite enviar/substituir a planilha D-0 e limpar somente o snapshot armazenado; a limpeza não remove dados já sincronizados nos chamados;
- o backend cruza OS, BDESK, Office Track, OS Casa Cliente e Contrato com chamados existentes; correspondências ambíguas são ignoradas e contabilizadas como não correspondentes;
- Endereço, Bairro, Cidade, Região e OLT são atualizados somente quando a planilha traz valor; `Data` + `Fim` são convertidos para timestamp com fuso `-03:00` somente para chamados `Finalizado` ou `Cancelado`;
- em estados ativos, a próxima sincronização limpa `executedAt` antigo e a interface oculta Data Fim mesmo antes de uma nova sincronização;
- Status OFS é persistido em `calls.ofs_status` e exibido separado de Status interno nas tabelas e no detalhe; a sincronização não altera `calls.status`;
- a leitura XLSX preserva datas seriais e horas como fração do dia para evitar deslocamento de data pelo fuso do processo;
- migrations incrementais: PostgreSQL local [database/migrations/010_d0_base_and_ofs_status.sql](database/migrations/010_d0_base_and_ofs_status.sql) e Supabase [supabase/migrations/202609290012_d0_base_and_ofs_status.sql](supabase/migrations/202609290012_d0_base_and_ofs_status.sql);
- validação focada: 29 testes D-0/parser/supervisor passaram, incluindo matching ambíguo, XLSX, limpeza e regra de Data Fim por status; typecheck backend e build frontend passaram. A suíte completa não retornou resumo conclusivo na implementação inicial;
- pendente: aplicar a migration no runtime utilizado e confirmar cabeçalhos/semântica de horário com uma planilha D-0 oficial.

Arquivos alterados: `backend/src/imports/d0.ts`, `backend/src/imports/parser.ts`, `backend/src/store.ts`, `backend/src/server.ts`, `backend/src/integrations/supabase/client.ts`, `backend/src/types.ts`, `backend/test/d0-import.test.ts`, `frontend/src/api.ts`, `frontend/src/App.tsx`, `database/migrations/010_d0_base_and_ofs_status.sql`, `supabase/migrations/202609290012_d0_base_and_ofs_status.sql` e `ROADMAP.md`.

### Correção — Data Fim somente para chamados fechados

- `Finalizado` e `Cancelado` continuam recebendo `Data` + `Fim`;
- `Aberto`, `Atribuído`, `Deslocamento` e `Em campo` não recebem Data Fim; a sincronização limpa valor anterior armazenado e as listas/detalhe não exibem valores antigos;
- validação atualizada: 29 testes focados passaram, typecheck backend e build frontend passaram.

### Exclusão em lote de chamados — plano pré-implementação

Registrado em 2026-09-29 antes das alterações de código.

- estrutura existente: endpoint individual `DELETE /api/chamados/:id`, função `deleteCall` e permissão RBAC `calls.delete`;
- reutilizar a mesma permissão e as tabelas existentes `calls`, `call_logs` e `call_observations`;
- adicionar endpoint global `DELETE /api/chamados`, transacional no PostgreSQL/Supabase e protegido pela mesma permissão;
- exibir ação em lote nas listas somente para quem tem `calls.delete`; exigir digitação de `APAGAR TODOS` e informar que a ação inclui chamados fora dos filtros visíveis;
- preservar a exclusão individual e testar endpoint sem permissão, exclusão global e limpeza dos dependentes.

#### Correção adicional — filtro SQL explícito

Plano registrado em 2026-09-29 após o erro `DELETE requires a WHERE clause`:

- causa encontrada: a RPC Supabase e o fallback PostgreSQL faziam `DELETE` sem cláusula `WHERE`;
- manter a semântica global usando predicados sobre colunas `NOT NULL` (`call_logs.call_id`, `call_observations.call_id`, `calls.id`);
- criar migration corretiva nova para ambientes que já aplicaram a migration 010 e também atualizar a 010 para instalações novas;
- a migration 011 substitui a função instalada; reexecutar a 010 não atualiza migrations já registradas pelo Supabase;
- validar typecheck e regressões da exclusão; confirmar em Supabase real após aplicar a migration corretiva não é possível neste ambiente.

#### Resultado

- `DELETE /api/chamados` reutiliza `calls.delete`; a exclusão individual continua disponível;
- PostgreSQL local remove `call_logs`, `call_observations` e `calls` em uma transação;
- Supabase chama `delete_all_calls()` em transação, com execução concedida somente ao `service_role`; logs e observações são removidos antes dos chamados;
- a lista mostra o botão global apenas a usuários com a permissão, exige digitar `APAGAR TODOS` e informa que ignora os filtros atuais;
- endpoint retorna a contagem apagada; referências de acionamentos são anuladas pela FK existente e snapshots de Drive são removidos em cascata;
- teste HTTP confirma `403` para Operador e exclusão total pelo Administrador; teste do store confirma contagem e lista vazia.
- o erro `DELETE requires a WHERE clause` foi corrigido com predicados `IS NOT NULL` sobre IDs obrigatórios; o efeito continua sendo apagar todas as linhas.

Arquivos alterados: `backend/src/store.ts`, `backend/src/server.ts`, `backend/test/http.test.ts`, `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/filters.css`, `supabase/migrations/202609290010_bulk_delete_calls.sql`, `supabase/migrations/202609290011_bulk_delete_calls_where_clause.sql` e `ROADMAP.md`.

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

## 2026-09-30 — Tela de chamados finalizados e cancelados

### Objetivo

Disponibilizar uma tela no mesmo padrão de Chamados abertos, limitada a chamados com status Finalizado ou Cancelado.

### Alterações realizadas

- adicionados o item de navegação e a rota `/chamados/finalizados`;
- a tela reutiliza `CallsPage`, busca a listagem sem restringir a um único status e filtra no frontend para manter apenas Finalizado/Cancelado;
- o filtro de status da tela oferece somente Todos, Finalizado e Cancelado; busca, região, bairro e período permanecem disponíveis;
- nenhuma alteração de backend, API ou banco.

### Arquivos modificados

- [frontend/src/App.tsx](frontend/src/App.tsx)
- [frontend/src/calls-layout.css](frontend/src/calls-layout.css)
- [ROADMAP.md](ROADMAP.md)

### Testes

`npm.cmd run build --workspace frontend` passou (TypeScript e Vite); permanece o aviso de bundle acima de 500 kB.

### Próximo passo

Revisar o diff e commitar as alterações pendentes da tabela e desta tela.

## 2026-09-30 — Texto da coluna PRAZO na cópia TSV

### Objetivo

Garantir que a exportação TSV inclua o estado textual e o limite da badge PRAZO, mesmo se a extração de texto visível da célula falhar.

### Alterações realizadas

- a badge PRAZO expõe `data-prazo` com valores como `Outlier - Limite 08:00`;
- o copiador procura esse atributo na célula e em seus elementos filhos e mantém fallback para `innerText`/`textContent`;
- o texto exportado continua normalizado, sem múltiplas quebras de linha ou espaços;
- nenhuma alteração de banco de dados.

### Arquivos modificados

- [frontend/src/App.tsx](frontend/src/App.tsx)
- [ROADMAP.md](ROADMAP.md)

### Testes

`npm.cmd run build --workspace frontend` passou (TypeScript e Vite); permanece o aviso de bundle acima de 500 kB. A cópia no clipboard ainda requer validação manual no navegador.

### Próximo passo

Conferir a saída TSV com estados No prazo, Fora do prazo e Outlier.

## 2026-09-30 — Largura compacta e cópia TSV da tabela

### Objetivo
Manter a tabela de atendimento legível quando há poucos resultados e impedir que o botão de cópia transporte o espaçamento visual do layout.

### Alterações realizadas

- as 14 colunas da tabela de atendimento receberam larguras fixas; Bairro/Endereço, tipo, técnico e observação podem quebrar texto dentro dos limites definidos;
- a tabela permanece alinhada à esquerda e usa rolagem horizontal quando sua largura excede o container;
- `Copiar tabela` agora copia cabeçalhos e linhas atualmente exibidas como texto TSV, normalizando espaços e removendo dependência dos estilos CSS;
- mantido fallback por textarea para navegadores sem `navigator.clipboard.writeText`.

### Arquivos modificados

- [frontend/src/App.tsx](frontend/src/App.tsx)
- [frontend/src/calls-layout.css](frontend/src/calls-layout.css)
- [ROADMAP.md](ROADMAP.md)

### Banco e testes

Nenhuma alteração de banco realizada nesta implementação. `npm.cmd run build --workspace frontend` passou (TypeScript e Vite); permanece o aviso de bundle acima de 500 kB. A cópia no clipboard ainda não foi validada manualmente no navegador.

### Próximo passo

Conferir a cópia TSV no navegador com um e múltiplos chamados; depois seguir a aplicação da migration de anexos registrada no estado atual.

## 2026-09-29 — Anexos no histórico de observações

As observações de chamados agora aceitam múltiplos arquivos; imagens mostram miniatura e clicar no cartão do anexo baixa o arquivo original. Metadados ficam no histórico e o conteúdo é buscado sob demanda por rota autenticada, com validação de permissão e escopo de supervisor. Limites: 8 arquivos/observação, 5 MB por arquivo, 10 MB no total. Migration local 012 e Supabase 014. Teste HTTP 1/1, typecheck backend e build frontend passaram.

## 2026-09-29 — Toque animado do sino de notificações

O sino agora oscila para os dois lados com desaceleração ao detectar novo acionamento, em vez de girar durante consultas periódicas. O RefreshCcw mantém a rotação de carregamento. As animações de ícones respeitam `prefers-reduced-motion`. Build frontend passou.

## 2026-09-29 — Persistência de Bairro FIELD na sincronização D-1

Além de inferir Bairro e Cidade a partir do endereço completo, o comparador de alterações D-1 agora inclui `address` e `bairro`. Assim, uma geolocalização calculada é persistida mesmo quando nenhum outro campo do chamado mudou. 39 testes D-0/D-1/parser/supervisor passaram; typecheck backend passou. Nenhuma migration.

## 2026-09-29 — Inferência de Bairro FIELD a partir do endereço completo

As bases D-0/D-1 frequentemente não têm coluna Bairro e podem trazer Cidade como placeholder. O processamento agora usa o endereço completo para inferir Bairro e usa o sufixo `CIDADE - UF` quando a coluna Cidade não é utilizável. O endereço original continua disponível no chamado; os dados geográficos são gravados separadamente.

Validação: 39 testes D-0/D-1/parser/supervisor passaram; typecheck backend passou. Nenhuma migration. Chamados já existentes precisam receber nova sincronização para preencher dados ausentes.

## 2026-09-29 — Remoção de letra de bloco do Bairro NOC

Corrigido o bairro que recebia o token isolado `A` entre número do imóvel e nome do bairro. A inferência remove uma letra de complemento/bloco imediatamente após a base do endereço, sem alterar o endereço-base. A regressão valida `PARQUE SAO RAFAEL` no resumo e nos três clientes. Parsers 26/26; typecheck backend passou; nenhuma migration.

## 2026-09-29 — Nome do cliente a partir de D-0/D-1 para Field

Chamados Field passam a receber `client` a partir da coluna `Nome` nas bases D-0 e D-1. D-1 preenche novas chamadas e atualiza existentes; o comparador de sincronização reconhece mudança no cliente. Chamados não Field não usam a coluna `Nome`. No detalhe Field o rótulo é `Cliente`; na fila a coluna é `Cliente / Técnico B2C`.

Validação: 11 testes D-0/D-1/supervisor passaram, typecheck backend e build frontend passaram. Não houve mudança de schema.

## 2026-09-29 — Normalização de Endereço/Bairro FIELD

Prefixo `CLT_` e tipo de via repetido no início do Endereço contaminavam o endereço-base e impediam o Bairro de ser encontrado no detalhe do chamado. O normalizador agora remove `CLT_`, colapsa repetições de `RUA`, `AVENIDA`, `TRAVESSA` e demais tipos suportados, e infere o bairro da base limpa. Caso validado: `CLT_RUA RUA LISBOA, 76 PARQUE CONTINENTAL II, GUARULHOS - SP` resulta em Endereço `RUA LISBOA, 76` e Bairro `PARQUE CONTINENTAL II`.

Arquivos: [backend/src/integrations/wuzapi/noc-consolidation.ts](backend/src/integrations/wuzapi/noc-consolidation.ts), [backend/test/parsers.test.ts](backend/test/parsers.test.ts). Validação: 25 testes passaram e typecheck backend passou. Nenhuma migration.

## 2026-09-29 — Contrato antes do CEP na lista de endereços NOC

Corrigido caso em que o endereço principal era preenchido com o número do contrato. Listas no formato contrato/nome, CEP pontuado e endereço agora são separadas por registro de cliente antes da extração; quando não há cabeçalhos por cliente, o fallback anterior de segmentação por CEP é mantido.

Regressão confirma cinco registros, Endereço `RUA LA VIOLETEIRA, 122` e Bairro `JARDIM DA CONQUISTA`. Suíte de parsers 23/23; typecheck backend passou. Nenhuma migration. Registros antigos não são recalculados automaticamente.

## 2026-09-29 — Correção de endereço e bairro NOC

Amostras com `RUA 3 IRMAOS` estavam sendo truncadas para `RUA 3` porque o primeiro dígito era confundido com número do imóvel; `NAO_INFORMADO` com underscore e dados complementares também poluíam o bairro. O parser agora prioriza o número após a vírgula, limpa placeholders/complementos e usa o bairro recorrente do mesmo CEP para remover prefixos contaminantes. Regressão confirma endereço `RUA 3 IRMAOS, 47` e bairro `VILA IOLANDA II` em todos os cinco clientes.

Arquivos: [backend/src/integrations/wuzapi/noc-consolidation.ts](backend/src/integrations/wuzapi/noc-consolidation.ts), [backend/test/parsers.test.ts](backend/test/parsers.test.ts). Validação: 22 testes de parser passaram; typecheck backend passou. Nenhuma migration.

## 2026-09-29 — Editor de mapeamento OLT→Região

Adicionada à aba Configurações uma tabela com busca e edição da Região de cada OLT, cadastro/remoção de OLTs personalizadas e salvamento explícito. Os defaults existentes permanecem como referência e overrides são persistidos em PostgreSQL/Supabase, carregados no boot e aplicados pelo resolver comum. Endpoints usam `settings.manage`; migration local 011 e Supabase 013.

Arquivos principais: [backend/src/integrations/wuzapi/noc-consolidation.ts](backend/src/integrations/wuzapi/noc-consolidation.ts), [backend/src/store.ts](backend/src/store.ts), [backend/src/server.ts](backend/src/server.ts), [frontend/src/App.tsx](frontend/src/App.tsx), [frontend/src/settings-olt.css](frontend/src/settings-olt.css), [database/migrations/011_olt_region_overrides.sql](database/migrations/011_olt_region_overrides.sql) e [supabase/migrations/202609290013_olt_region_overrides.sql](supabase/migrations/202609290013_olt_region_overrides.sql).

Validação: teste focado do mapa 21/21 e teste HTTP de permissão/gravação 1/1 passaram; typecheck backend e build frontend passaram. Migration não aplicada em banco real neste ambiente.

## 2026-09-29 — Importação operacional D-0 e Status OFS

### Objetivo
Sincronizar a base operacional do dia com chamados existentes sem confundir o status nativo OFS com o status de controle interno.

### Alterações realizadas

- aba Importações passou a consultar, substituir e limpar o snapshot da base D-0;
- matching por OS, BDESK, Office Track, OS Casa Cliente e Contrato; chamadas ambíguas não são atualizadas;
- Endereço, Bairro, Cidade, Região, OLT, Status OFS e Data Fim são sincronizados quando a planilha contém valores;
- `Data` + `Fim` são persistidos como ISO com offset `-03:00`; telas exibem Status interno, Status OFS e Data Fim em colunas separadas;
- limpeza remove apenas os registros da base D-0 e preserva os dados já sincronizados nos chamados.

### Arquivos criados

- [backend/src/imports/d0.ts](backend/src/imports/d0.ts)
- [backend/test/d0-import.test.ts](backend/test/d0-import.test.ts)
- [database/migrations/010_d0_base_and_ofs_status.sql](database/migrations/010_d0_base_and_ofs_status.sql)
- [supabase/migrations/202609290012_d0_base_and_ofs_status.sql](supabase/migrations/202609290012_d0_base_and_ofs_status.sql)

### Arquivos modificados

- backend: `src/imports/parser.ts`, `src/integrations/supabase/client.ts`, `src/server.ts`, `src/store.ts`, `src/types.ts`;
- frontend: `src/api.ts`, `src/App.tsx`;
- documentação: `ROADMAP.md`.

### Resultado e testes

- os quatro testes D-0 e os 24 testes de parser/supervisor executados junto deles passaram (28 no total), cobrindo matching, ambiguidade, XLSX, timestamp, limpeza e regressões próximas;
- typecheck do backend passou após as rotas e persistência;
- build do frontend passou; permanece o aviso existente de bundle acima de 500 kB;
- a execução completa de `npm test` iniciou testes HTTP, mas não retornou um resumo final conclusivo neste ambiente; repetir o comando antes do próximo release.

### Pendências e próximo passo

- aplicar a migration `010` no PostgreSQL local ou `202609290012` no Supabase;
- validar os cabeçalhos reais e o fuso horário da planilha D-0 oficial, além de testar a integração no banco publicado.

## 2026-09-29 — Exclusão global de chamados em lote

## 2026-09-29 — Exclusão global de chamados em lote

Implementado `DELETE /api/chamados` com a permissão existente `calls.delete`, confirmação digitada `APAGAR TODOS` e remoção consistente de chamados, observações, logs e snapshots relacionados. O PostgreSQL local usa transação na store; Supabase usa RPC `delete_all_calls()` restrita ao `service_role`.

Validação: teste HTTP confirma negação para Operador e sucesso para Administrador; teste de store confirma contagem e lista vazia; typecheck do backend e build do frontend passaram. A regressão automatizada não executa SQL contra o Supabase real.

Migrations Supabase: [supabase/migrations/202609290010_bulk_delete_calls.sql](supabase/migrations/202609290010_bulk_delete_calls.sql) e correção [supabase/migrations/202609290011_bulk_delete_calls_where_clause.sql](supabase/migrations/202609290011_bulk_delete_calls_where_clause.sql). Aplique 011 nos ambientes que já aplicaram 010 antes de repetir a operação.

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

O histórico da integração Google Drive requer as migrations [database/migrations/008_google_drive_history.sql](database/migrations/008_google_drive_history.sql) ou [supabase/migrations/202609290008_google_drive_history.sql](supabase/migrations/202609290008_google_drive_history.sql). A localização dos chamados requer também [database/migrations/009_call_location_fields.sql](database/migrations/009_call_location_fields.sql) ou [supabase/migrations/202609290009_call_location_fields.sql](supabase/migrations/202609290009_call_location_fields.sql). A exclusão em lote no Supabase requer as migrations [010](supabase/migrations/202609290010_bulk_delete_calls.sql) e [011](supabase/migrations/202609290011_bulk_delete_calls_where_clause.sql). A importação D-0 requer [database/migrations/010_d0_base_and_ofs_status.sql](database/migrations/010_d0_base_and_ofs_status.sql) no runtime PostgreSQL local ou [supabase/migrations/202609290012_d0_base_and_ofs_status.sql](supabase/migrations/202609290012_d0_base_and_ofs_status.sql) no Supabase. O editor OLT→Região requer [database/migrations/011_olt_region_overrides.sql](database/migrations/011_olt_region_overrides.sql) ou [supabase/migrations/202609290013_olt_region_overrides.sql](supabase/migrations/202609290013_olt_region_overrides.sql). Os anexos de observação requerem [database/migrations/012_call_observation_attachments.sql](database/migrations/012_call_observation_attachments.sql) ou [supabase/migrations/202609290014_call_observation_attachments.sql](supabase/migrations/202609290014_call_observation_attachments.sql). Aplique as migrations relevantes antes de usar cada recurso no ambiente correspondente.

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
Upload, prévia e download de anexos em observações

Resultado: ✅ teste HTTP de upload/listagem/download com imagem de 4 MiB 1/1 passou; typecheck backend e build frontend passaram.

### Teste
Balanço do sino e rotação do refresh

Resultado: ✅ build frontend passou; `prefers-reduced-motion` desativa ambas as animações.

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

Resultado: ✅ testes HTTP existentes chegaram a passar em execuções recentes; nesta implementação, a suíte completa não retornou resumo final conclusivo.

Observação: repetir `npm test --workspace backend` e confirmar o resumo integral antes do próximo release.

### Teste
Importação D-0, Status OFS e limpeza do snapshot

Resultado: ✅ 29 testes focados passaram; typecheck do backend e build do frontend passaram.

### Teste
Editor de mapeamento OLT→Região

Resultado: ✅ 21 testes de parser/resolução e 1 teste HTTP de salvar/permissão passaram; typecheck backend e build frontend passaram.

### Teste
Consolidação de endereço/bairro NOC

Resultado: ✅ 25 testes de parser passaram, incluindo rua numerada, placeholder underscore, contrato antes do CEP, CEP pontuado e endereço FIELD com tipos duplicados; typecheck backend passou.

### Teste
Nome do cliente em chamados Field

Resultado: ✅ 11 testes D-0/D-1/supervisor passaram; typecheck backend e build frontend passaram.

### Teste
Bairro NOC com letra de bloco

Resultado: ✅ 26 testes de parser passaram, incluindo o caso `A PARQUE SAO RAFAEL`; typecheck backend passou.

### Teste
Inferência de Bairro FIELD por endereço

Resultado: ✅ 39 testes relacionados a parsers, D-0/D-1 e supervisor passaram, incluindo persistência quando somente o Bairro muda; typecheck backend passou.

---

## 13. PENDÊNCIAS

### 🔴 CRÍTICO

- aplicar migration de anexos 012 local ou 014 Supabase antes de usar o novo fluxo;
- aplicar a migration D-0 no banco do runtime antes do primeiro upload;
- aplicar a migration 011 local ou 013 Supabase antes de salvar overrides de OLT;
- validar autenticação do Supabase real com seed e login oficial;
- confirmar consistência entre runtime local e produção.

### 🟠 IMPORTANTE

- sincronizar D-0/D-1 para preencher bairros/cidades ausentes em chamados FIELD existentes;
- editar/reprocessar chamado existente cujo bairro ainda contém letra de bloco;
- sincronizar D-0/D-1 para preencher o nome em chamados FIELD existentes;
- corrigir/reprocessar chamados antigos com Endereço contendo `CLT_` ou tipo de via duplicado;
- reprocessar/editar chamados antigos que tenham Endereço igual ao contrato;
- confirmar em acionamento real que novos chamados e registros reprocessados recebem o bairro corrigido;
- validar cabeçalhos, correspondência e fuso horário com a planilha D-0 oficial;
- revisar a interface de dashboards para filtros de supervisor e data;
- confirmar integração de exceções de acesso por papel.

### 🟡 MELHORIA

- refinamento visual responsivo de telas operacionais;
- revisar e limpar testes duplicados ou dependentes de servidor.

---

## 14. PRÓXIMA AÇÃO

1. aplicar migration local 012 ou Supabase 014 no ambiente ativo;
2. testar anexos no chamado: imagem em prévia, arquivo genérico por download e usuário sem acesso;
3. sincronizar D-0/D-1 e conferir Bairro/Cidade em chamados FIELD que estavam sem esses valores.

---

## 15. CHECKPOINT DE CONTINUIDADE

## 🔖 CHECKPOINT — 2026-09-30 — Tela de chamados encerrados

Adicionada a rota `/chamados/finalizados` e navegação **Finalizados e cancelados**. A tela reutiliza a tabela comum, mantém busca/filtros e força `Finalizado` ou `Cancelado` tanto no carregamento inicial como no refresh; o filtro de status só oferece os dois estados e Todos. Nenhuma alteração de API ou banco. Build/typecheck passaram; resta o aviso conhecido de bundle acima de 500 kB.

Arquivos: [frontend/src/App.tsx](frontend/src/App.tsx), [ROADMAP.md](ROADMAP.md), além das alterações anteriores em [frontend/src/calls-layout.css](frontend/src/calls-layout.css).

## 🔖 CHECKPOINT — 2026-09-30 — Conteúdo da coluna PRAZO

A cópia TSV prioriza `data-prazo` no elemento da célula ou em seus filhos. A badge publica textos completos como `Outlier - Limite 08:00`; `innerText` e `textContent` seguem como fallback para os demais dados. Build/typecheck passaram; falta validar manualmente o clipboard para os três estados da badge.

Arquivos modificados: [frontend/src/App.tsx](frontend/src/App.tsx), [ROADMAP.md](ROADMAP.md).

## 🔖 CHECKPOINT — 2026-09-30 — Tabela compacta e cópia TSV

### O que foi feito

Larguras fixas foram aplicadas às 14 colunas da tabela de atendimento, mantendo alinhamento à esquerda e scroll horizontal. A ação `Copiar tabela` passou a gerar TSV a partir do conteúdo textual visível, sem exportar estilos ou dimensões visuais.

### Onde paramos

Alterações implementadas no frontend; build/typecheck passaram. Falta conferir manualmente a cópia no clipboard com uma e várias linhas.

### Arquivos modificados nesta sessão

- [frontend/src/App.tsx](frontend/src/App.tsx)
- [frontend/src/calls-layout.css](frontend/src/calls-layout.css)
- [ROADMAP.md](ROADMAP.md)

### Próximo passo exato

Validar a cópia com uma e várias linhas na tabela de atendimento; em seguida, continuar a aplicação da migration de anexos conforme a próxima ação geral.

### Observações para o próximo agente

A cópia inclui a linha de cabeçalho e as linhas renderizadas após os filtros atuais. A exportação anterior como PNG foi substituída por texto TSV.

## 🔖 CHECKPOINT — 2026-09-29 — Anexos em observações

Upload/listagem/download autenticados e prévia de imagem implementados. A validação Base64 foi trocada por Buffer após um stack overflow com arquivo grande; imagem de 4 MiB passa no teste HTTP (1/1). Typecheck backend e build frontend passaram. Aplicar migration local 012 ou Supabase 014 antes de usar em runtime com banco. Limites: 8 arquivos, 5 MB por arquivo, 10 MB total por observação. Downloads respeitam `calls.view` e o escopo do chamado.

## 🔖 CHECKPOINT — 2026-09-29 — Animação do sino

O sino balança brevemente quando chega acionamento novo; polling não dispara animação. O refresh segue girando durante carga. Ambos respeitam `prefers-reduced-motion`. Build frontend passou.

## 🔖 CHECKPOINT — 2026-09-29 — Persistência de Bairro FIELD

D-0 e D-1 inferem Bairro de endereço completo sem depender de coluna Bairro; D-1 também considera `address`/`bairro` na detecção de alterações para gravar o novo valor mesmo isolado. Cidade usa sufixo `CIDADE - UF` quando a coluna estiver vazia ou placeholder. 39 testes passaram e typecheck backend passou. Sincronizar as bases para preencher chamados existentes; nenhuma migration.

## 🔖 CHECKPOINT — 2026-09-29 — Inferência de Bairro FIELD por endereço

D-0/D-1 agora inferem Bairro do endereço completo quando não há coluna Bairro; Cidade pode ser obtida do sufixo `CIDADE - UF` se a coluna estiver vazia/placeholder. 39 testes relacionados e typecheck backend passaram. Endereço completo é preservado no chamado; sincronizar D-0/D-1 novamente para preencher valores ausentes em registros já existentes. Nenhuma migration.

## 🔖 CHECKPOINT — 2026-09-29 — Letra de bloco no Bairro NOC

A inferência remove letra isolada de complemento/bloco imediatamente após o número do imóvel, evitando `A PARQUE SAO RAFAEL`. Parsers 26/26 e typecheck backend passaram; nenhuma alteração de schema. Chamados já salvos não são atualizados automaticamente e precisam ser reprocessados/editados manualmente.

## 🔖 CHECKPOINT — 2026-09-29 — Nome do cliente Field

O campo `calls.client` é preenchido pela coluna `Nome` nas importações D-0/D-1 somente para tipos Field; o D-1 atualiza chamadas existentes e a interface rotula o campo como Cliente. 11 testes próximos, typecheck backend e build frontend passaram. Não houve migration. Sincronizar a base para preencher registros antigos; nome ausente na planilha preserva o valor atual.

## 🔖 CHECKPOINT — 2026-09-29 — Normalização Endereço/Bairro FIELD

`normalizeAddressBase` remove `CLT_` e repetições de tipo de via antes de inferir o Bairro. Validação: caso `CLT_RUA RUA LISBOA, 76 PARQUE CONTINENTAL II, GUARULHOS - SP` retorna Endereço `RUA LISBOA, 76` e Bairro `PARQUE CONTINENTAL II`; 25 testes de parser e typecheck backend passaram. Chamados já salvos não são reprocessados automaticamente.

## 🔖 CHECKPOINT — 2026-09-29 — Parsing de endereço NOC antes do CEP

Parser ajustado para associar contrato/nome ao CEP/endereço seguinte, reconhecer CEP `NN.NNN-NNN` e manter fallback dos formatos legados. Suíte de parsers 23/23 e typecheck passaram. O chamado já persistido com endereço incorreto não é alterado por esta correção; deve ser reprocessado ou editado manualmente. Esperado no exemplo: Endereço `RUA LA VIOLETEIRA, 122`, Bairro `JARDIM DA CONQUISTA`.

## 🔖 CHECKPOINT — 2026-09-29 — Consolidação NOC

A correção de endereço/bairro está no parser compartilhado de mensagens NOC. Suíte de parsers passou 22/22 e typecheck backend passou. Não houve alteração de banco. Novas aceitações usam a regra corrigida; registros já persistidos não são recalculados e devem ser reprocessados ou atualizados manualmente. Para a amostra reportada, esperado: `RUA 3 IRMAOS, 47` e `VILA IOLANDA II`.

## 🔖 CHECKPOINT — 2026-09-29 — Configuração OLT→Região

Editor e persistência estão implementados. 21 testes focados do mapa, 1 teste HTTP de permissão/gravação, typecheck backend e build frontend passaram. Aplicar migration local 011 ou Supabase 013 antes de salvar overrides no banco. Ao retornar a uma OLT default original, o override é removido e o valor embutido volta a prevalecer; OLTs personalizadas podem ser excluídas pela interface.

## 🔖 CHECKPOINT — 2026-09-29 — Base D-0

### O que foi feito

- implementados upload/substituição/limpeza da base D-0, matching com chamados, Status OFS e Data Fim;
- atualizado o roadmap e criadas migrations incrementais local/Supabase.

### Onde paramos

A implementação está concluída no código. Falta aplicar a migration correspondente ao runtime e validar com a planilha oficial; a suíte completa do backend precisa de uma execução com resumo conclusivo.

### O que está funcionando

- 29 testes focados D-0/parser/supervisor;
- typecheck backend;
- build frontend;
- limpeza do snapshot preserva os campos já sincronizados nos chamados.

### O que não está validado

- schema D-0 aplicado em PostgreSQL/Supabase real;
- nomes de colunas e fuso horário confirmados contra a planilha oficial;
- resumo final da suíte completa nesta execução.

### Arquivos modificados nesta sessão

- [backend/src/imports/d0.ts](backend/src/imports/d0.ts), [backend/src/imports/parser.ts](backend/src/imports/parser.ts), [backend/src/store.ts](backend/src/store.ts), [backend/src/server.ts](backend/src/server.ts), [backend/src/integrations/supabase/client.ts](backend/src/integrations/supabase/client.ts), [backend/src/types.ts](backend/src/types.ts);
- [backend/test/d0-import.test.ts](backend/test/d0-import.test.ts), [frontend/src/api.ts](frontend/src/api.ts), [frontend/src/App.tsx](frontend/src/App.tsx), migrations 010/012 e [ROADMAP.md](ROADMAP.md).

### Próximo passo exato

Aplicar a migration D-0 no runtime utilizado, importar uma planilha oficial e verificar amostras abertas, finalizadas e canceladas, incluindo Data Fim.

### Observações para o próximo agente

A correspondência ambígua é ignorada. A limpeza apaga apenas `d0_base_records`, não reverte atualizações nos chamados. Status OFS nunca substitui `calls.status`. O timestamp importado usa offset fixo `-03:00`; confirmar se corresponde ao contrato da planilha.

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
