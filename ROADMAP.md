Última implementação: exclusão lógica de supervisores sem equipe, com proteção contra remoção quando há técnicos vinculados.
- [x] Administradores podem excluir supervisores vazios; equipes ocupadas retornam bloqueio explícito.
# ROADMAP DO PROJETO

## 1. VISÃO GERAL

O projeto JH RedeFlow é uma plataforma operacional para gestão de chamados, técnicos, supervisores, dashboards e integrações do time de operação. O objetivo principal é centralizar a visão de produção, o controle de filas e a operação de campo em um ambiente com autenticação, permissões e métricas executivas.

Principais usuários: operadores, supervisores, administradores, mesários e usuários de visualização. As principais tecnologias do projeto são TypeScript, Express, Vite, PostgreSQL/Supabase e integrações com WuzAPI, Google Drive e importações CSV/XLSX. A arquitetura é separada em frontend, backend e banco, com backend responsável por todas as regras de negócio, autenticação, permissões, validação e integrações.

---

## 2. ESTADO ATUAL

Status geral: EM DESENVOLVIMENTO

Última atualização: 2026-10-02

Última implementação: API autoriza o preflight CORS da origem Vercel `https://jh-rede.vercel.app` para login.
Agente responsável pela última alteração: GitHub Copilot

Próxima ação: sincronizar o deploy Render com o `render.yaml` atualizado e confirmar login pelo domínio Vercel.

---

## 3. ARQUITETURA ATUAL

- Frontend: aplicação em React + Vite, em [frontend/src](frontend/src).
- Backend: API Express em [backend/src/server.ts](backend/src/server.ts) com regras de negócio em [backend/src/store.ts](backend/src/store.ts).
- Banco de dados: PostgreSQL com migrations em [database/migrations](database/migrations) e [supabase/migrations](supabase/migrations).
- Detalhe de chamado: busca por ID no PostgreSQL/Supabase, em vez de paginar todas as chamadas; aplica escopo de supervisor e intervalo de datas na consulta.
- Base D-0: snapshot da última planilha armazenado em `d0_base_records`; o campo `calls.ofs_status` mantém o estado nativo OFS sem substituir `calls.status`.
- Sincronização D-0: matching em memória após carregar chamados uma vez; mutações por lotes limitados a 10 e logs Supabase em inserção agrupada por chamado.
- Painel diário: exportação OFS detalhada é preservada no JSON existente e conciliada com Região dos chamados por Ordem de Serviço; Guarulhos fica separado e demais ordens são exibidas em SP.
- Google Drive: a sincronização histórica aceita os tipos de atividade documentados, incluindo `ACIONAMENTO FIELD`; extrai endereço e bairro inferido ou fornecido em coluna própria.
- Regiões por OLT: mapa padrão no código com overrides persistidos em `olt_region_overrides`, carregados no boot e editáveis por usuários com `settings.manage`.
- Técnicos: `employment_status` registra Trabalhando/Demitido independentemente de `active` e `current_status`; `active` continua representando disponibilidade pela escala/sobrescrita operacional.
- Supervisores: exclusão lógica disponível para equipes vazias; a API impede excluir supervisor com técnicos ativos no cadastro.
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
- [x] Vínculo empregatício dos técnicos Trabalhando/Demitido, com filtro padrão para Trabalhando e bloqueio de atribuição a demitidos.
- [x] Exclusão lógica de supervisores sem técnicos vinculados, com ação na tela e bloqueio HTTP para equipes ocupadas.
- [x] Chamados, fila operacional, detalhe e atribuição.
- [x] Listagem de chamados Supabase paginada em blocos para superar o limite padrão de 1.000 linhas.
- [x] Tela de chamados finalizados e cancelados com busca, filtros e tabela operacional reutilizada.
- [x] Observações e auditoria de chamados.
- [x] Finalização, cancelamento e regras de status.
- [x] WuzAPI, acionamentos e análise de mensagens operacionais.
- [x] Importação de bases CSV/XLSX.
- [x] Prévia e importação idempotente de acionamentos históricos XLSX como chamados Finalizado, com deduplicação e bloqueio de gravação em modo demo.
- [x] Prévia e importação de XLSX de chamados atuais, preservando Aberto/Finalizado/Baixar, vinculando técnicos reconhecidos, deduplicando ordens e bloqueando gravação em demo.
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
- [x] Painel diário com tabelas equilibradas, busca de técnicos, contraste reforçado, exportação PNG individual por card e segmentação regional Guarulhos/SP por ordem.
- [x] Exportações PNG apresentáveis da tabela de chamados com dimensões de relatório, texto legível e estilos para compartilhamento.
- [x] Validação do salvamento normaliza campos nulos/escalares e informa o campo inválido.
- [~] Integração completa com Supabase Auth e dados persistentes em produção. A parte de autenticação e seed RBAC foi preparada, mas ainda precisa ser validada com execução real do SQL e login oficial.

---

## 5. IMPLEMENTAÇÃO EM ANDAMENTO

### CORS do login no domínio Vercel — implementado em 2026-10-02

- a API inclui `https://jh-rede.vercel.app` na allowlist CORS mesmo quando `CORS_ORIGINS` não está configurado; origens adicionais continuam aceitas pela variável de ambiente;
- `render.yaml` define o domínio Vercel como `CORS_ORIGINS` e o README documenta como adicionar domínios alternativos;
- teste HTTP cobre o preflight `OPTIONS` de `/api/auth/login` e valida `Access-Control-Allow-Origin` e o método `POST`.

Arquivos alterados: [backend/src/server.ts](backend/src/server.ts), [backend/test/http.test.ts](backend/test/http.test.ts), [render.yaml](render.yaml), [README.md](README.md) e [ROADMAP.md](ROADMAP.md).

Validação: suíte HTTP reportou 30/30 testes aprovados e os diagnósticos dos arquivos alterados não apontam erros; o shell misturou a saída do typecheck com comandos anteriores, então o typecheck não foi confirmado isoladamente. Deploy Render ainda precisa receber esta alteração.

### Correção de sincronização Drive para chamados FIELD — implementada em 2026-10-02

- cabeçalhos de arquivos Drive agora são comparados sem sensibilidade a caixa, acentos e pontuação, para reconhecer campos como Tipo de Atividade, Ordem de Serviço e Endereço nas variantes do export;
- tipos de atividade reconhecidos explicitamente continuam aceitos, e variantes descritivas contendo `FIELD` também passam; status pendente e motivo de não cumprimento continuam ignorados;
- regressão coberta com cabeçalhos em caixa alta e tipo `MANUTENÇÃO DE REDE FIELD`, confirmando que a linha é elegível e que ordem, endereço e status são lidos;
- sincronizações anteriores não são refeitas automaticamente; depois de publicar/reiniciar esta versão, executar novamente Sincronizar Drive. Linhas sem identificador reconhecível ainda não podem ser cruzadas com chamados existentes.

Arquivos alterados: [backend/src/integrations/google-drive.ts](backend/src/integrations/google-drive.ts), [backend/test/supervisor-scoping.test.ts](backend/test/supervisor-scoping.test.ts) e [ROADMAP.md](ROADMAP.md).

Validação: suíte `npx tsx --test test/supervisor-scoping.test.ts` passou (17/17) e `npm run typecheck` passou. O próximo passo operacional é publicar/reiniciar o backend e sincronizar novamente.

### Relatórios de ordens repetidas e quartil — implementados em 2026-10-02

- nova página Repetidos com abas Ordens repetidas e Quartil, acessível a usuários com `calls.view`; supervisores consultam apenas chamados da própria equipe;
- identifica repetição quando endereço + OLT + slot/PON coincidem e o evento anterior ocorreu nos 30 dias anteriores; ignora endereços sem número, dados incompletos e eventos sem data válida;
- a aba de ordens lista o chamado atual, o chamado anterior mais próximo e os respectivos técnicos; a aba Quartil contabiliza `SERV` pelo técnico do chamado atual e atribui `# REP` ao técnico do chamado original (`TECNICO REP`);
- técnicos com `# REP` mas sem `SERV` no intervalo permanecem visíveis e exibem IRE/quartil como `-`; repetições sem técnico original também ficam identificadas, sem divisão por zero;
- `% IRE` é `# REP / SERV`; os limites são até 2%, até 2,5%, até 3% e acima de 3%; o período pode ser filtrado sem remover do cálculo de repetição os chamados anteriores ao início selecionado;
- os chamados são carregados pela API em páginas de até 100 registros, em lotes de cinco páginas.

Arquivos alterados: [frontend/src/App.tsx](frontend/src/App.tsx), [frontend/src/main.tsx](frontend/src/main.tsx), [frontend/src/repeated-calls.tsx](frontend/src/repeated-calls.tsx), [frontend/src/repeated-calls.css](frontend/src/repeated-calls.css) e [ROADMAP.md](ROADMAP.md).

Validação: `npm --prefix ../frontend run build` passou após os ajustes; Vite reportou apenas o aviso de bundle principal acima de 500 kB. A conferência dos dados operacionais reais permanece pendente.

### Vínculo Atrelado de acionamentos FIELD — implementado em 2026-10-02

- ao receber acionamento, procura o chamado OFS Pendente mais antigo com mesma OLT e par placa/PON, anterior à data do evento, excluindo a própria ordem;
- a ordem relacionada aparece no resumo do acionamento, é persistida no chamado aceito e fica disponível na coluna Atrelada das filas Chamados abertos e Em atendimento;
- o selo roxo Atrelado é complementar ao status operacional existente (Aberto/Atribuído etc.) e não o substitui;
- aplicar `database/migrations/019_call_atrelada_order.sql` no PostgreSQL local ou `supabase/migrations/202610020004_call_atrelada_order.sql` no Supabase antes de publicar o backend.

Arquivos alterados: [backend/src/integrations/wuzapi/noc-consolidation.ts](backend/src/integrations/wuzapi/noc-consolidation.ts), [backend/src/store.ts](backend/src/store.ts), [backend/src/integrations/supabase/client.ts](backend/src/integrations/supabase/client.ts), [backend/src/types.ts](backend/src/types.ts), [backend/test/supervisor-scoping.test.ts](backend/test/supervisor-scoping.test.ts), [frontend/src/App.tsx](frontend/src/App.tsx), [frontend/src/api.ts](frontend/src/api.ts), [frontend/src/calls-layout.css](frontend/src/calls-layout.css), [database/migrations/019_call_atrelada_order.sql](database/migrations/019_call_atrelada_order.sql), [supabase/migrations/202610020004_call_atrelada_order.sql](supabase/migrations/202610020004_call_atrelada_order.sql) e [ROADMAP.md](ROADMAP.md).

Validação: typecheck do backend, build do frontend e suíte `supervisor-scoping` 16/16 passaram. Migrations ainda não foram aplicadas em banco conectado.

### Sincronização D-0 ao carregar o painel diário — implementada em 2026-10-02

- após salvar a base do Painel diário, o frontend envia o arquivo original ao endpoint D-0 já existente, que cruza ordens, atualiza os chamados correspondentes e atualiza a base D-0;
- a tela informa linhas cruzadas, chamadas atualizadas e linhas sem correspondência; se o salvamento do painel funcionar mas a sincronização falhar, apresenta erro específico sem ocultar a base carregada;
- sem mudanças no mapeador D-0, schema ou migrations.

Arquivos alterados: [frontend/src/App.tsx](frontend/src/App.tsx) e [ROADMAP.md](ROADMAP.md).

Validação: build do frontend passou; testes D-0 7/7 passaram.

### Sincronização Drive como único fluxo de importação — implementada em 2026-10-02

- a página Importações mostra apenas a ação Sincronizar Drive e o resultado da execução; foram removidos os painéis de D-0, chamados atuais, acionamentos finalizados, seleção de arquivo genérica e histórico de uploads manuais;
- a sincronização passa a ler CSV, XLSX, XLS e planilhas Google exportadas como CSV;
- `NOC ACESSO`, `NOC ACCESS`, `NOC TX` e `NOC BACKBONE` agora passam pela elegibilidade, permitindo matching e atualização de chamados existentes inclusive para Finalizado/Cancelado;
- fingerprint igual não interrompe mais a reconciliação antes de comparar os campos persistidos; divergências de status, Data Abertura e demais dados são corrigidas, e duplicatas entre arquivos não inflacionam o contador de inalterados;
- o resultado da tela informa elegíveis, cruzados, duplicatas e motivos de ignorados/sem correspondência, além de atualizados, novos, finalizados e cancelados; usar a decomposição na próxima sincronização real para confirmar quais linhas da base atual não passam pelas regras.

Arquivos alterados: [frontend/src/App.tsx](frontend/src/App.tsx), [frontend/src/api.ts](frontend/src/api.ts), [backend/src/integrations/google-drive.ts](backend/src/integrations/google-drive.ts), [backend/test/supervisor-scoping.test.ts](backend/test/supervisor-scoping.test.ts), [docs/google-drive-d1-sync.md](docs/google-drive-d1-sync.md) e [ROADMAP.md](ROADMAP.md).

Validação: suíte de sincronização/supervisão 15/15 e typecheck do backend passaram; build do frontend passou. Sem alteração de schema; a sincronização real ainda precisa ser conferida após publicar esta instrumentação.

### Limite visual do card de regiões no dashboard — implementado em 2026-10-02

- todas as listas de ranking do dashboard (Volume por região, Chamados por Bairro, Chamados atribuídos e Chamados por tipo) ficam limitadas a aproximadamente 10 linhas visíveis e rolam internamente quando houver mais itens, sem aumentar a altura do card/página.

Arquivos alterados: [frontend/src/App.tsx](frontend/src/App.tsx), [frontend/src/dashboard-overrides.css](frontend/src/dashboard-overrides.css) e [ROADMAP.md](ROADMAP.md).

Validação: build do frontend passou.

### Edição da data de abertura do chamado — implementada em 2026-10-02

- o detalhe agora permite editar data e hora de abertura por controle local de data/hora e converte a entrada para ISO ao salvar;
- o PATCH valida a data; PostgreSQL local, Supabase e modo demo persistem `openedAt`, com registro de auditoria como Data de abertura;
- teste HTTP confirma atualização e rejeição de data inválida.

Arquivos alterados: [frontend/src/App.tsx](frontend/src/App.tsx), [frontend/src/api.ts](frontend/src/api.ts), [backend/src/types.ts](backend/src/types.ts), [backend/src/server.ts](backend/src/server.ts), [backend/src/store.ts](backend/src/store.ts), [backend/src/integrations/supabase/client.ts](backend/src/integrations/supabase/client.ts), [backend/test/http.test.ts](backend/test/http.test.ts) e [ROADMAP.md](ROADMAP.md).

Validação: teste HTTP focado passou; typecheck do backend e build do frontend passaram. Sem alteração de schema ou migration.

### Separação de chamados abertos e em atendimento — implementada em 2026-10-02

- Chamados abertos lista somente chamados com status Aberto e sem técnico atribuído;
- Em atendimento lista somente chamados com técnico atribuído e status Aberto, Atribuido, Deslocamento ou Em campo, incluindo abertos já atribuídos;
- o filtro de status da fila Em atendimento inicia em Todos; seleções feitas pelo usuário continuam persistidas;
- a filtragem por atribuição ocorre no servidor antes da paginação e da contagem; o filtro de status dos abertos fica restrito a Aberto;
- na tabela de Chamados abertos, a coluna Técnico ocupa a posição de Cliente / Técnico B2C; a antiga coluna Técnico no fim foi removida para evitar duplicidade;
- na tabela Em atendimento, a coluna Obs. foi posicionada imediatamente após OLT;
- o estilo da célula OBS mantém `display: table-cell` e as larguras fixas das demais colunas foram alinhadas com a nova ordem, corrigindo o desalinhamento visual;
- a tela dedicada a finalizados e cancelados permanece inalterada.

Arquivos alterados: [frontend/src/App.tsx](frontend/src/App.tsx), [frontend/src/api.ts](frontend/src/api.ts), [backend/src/server.ts](backend/src/server.ts), [backend/src/store.ts](backend/src/store.ts), [backend/test/http.test.ts](backend/test/http.test.ts), [database/migrations/018_calls_assignment_filter.sql](database/migrations/018_calls_assignment_filter.sql), [supabase/migrations/202610020003_calls_assignment_filter.sql](supabase/migrations/202610020003_calls_assignment_filter.sql) e [ROADMAP.md](ROADMAP.md).

Validação: teste HTTP de transferência de chamado aberto para a fila atribuída passou; typecheck do backend e build do frontend passaram após os ajustes de tabela. Para PostgreSQL/Supabase conectado, é necessário aplicar a migration correspondente.

### Troca obrigatória de senha no primeiro acesso — implementada em 2026-10-02

- perfis existentes recebem `password_change_required = true` pelas migrations locais e Supabase; novos usuários cadastrados pelo sistema também precisam trocar a senha inicial;
- o login informa a flag, a API bloqueia as demais rotas enquanto ela estiver ativa e permite somente consultar a sessão ou concluir a troca;
- a troca valida a senha atual, exige uma nova senha de pelo menos 8 caracteres e rejeita reutilização; após salvar, a flag é desativada e não volta a ser exigida nos logins seguintes;
- a interface mantém o usuário numa tela de troca até concluir. Senha e hash não são armazenados no frontend;
- as migrations precisam ser aplicadas ao banco local e ao Supabase antes de publicar o backend que lê a nova coluna.

Arquivos alterados: [backend/src/server.ts](backend/src/server.ts), [backend/src/store.ts](backend/src/store.ts), [backend/src/types.ts](backend/src/types.ts), [backend/src/integrations/supabase/client.ts](backend/src/integrations/supabase/client.ts), [backend/test/http.test.ts](backend/test/http.test.ts), [database/migrations/017_first_login_password_change.sql](database/migrations/017_first_login_password_change.sql), [supabase/migrations/202610020002_first_login_password_change.sql](supabase/migrations/202610020002_first_login_password_change.sql), [frontend/src/App.tsx](frontend/src/App.tsx), [frontend/src/api.ts](frontend/src/api.ts), [frontend/src/main.tsx](frontend/src/main.tsx), [frontend/src/password-change.css](frontend/src/password-change.css) e [ROADMAP.md](ROADMAP.md).

Validação: typecheck do backend e build do frontend passaram; o teste HTTP do fluxo de primeiro acesso passou; suíte completa passou com 35 testes. As migrations não foram executadas nesta sessão.

### Próxima ação

Aplicar as migrations `017_first_login_password_change.sql` e `202610020002_first_login_password_change.sql` nos bancos correspondentes e publicar o backend/frontend. A migration marca os perfis existentes para troca no próximo acesso.

### Ajuste visual dos cards de importação — implementado em 2026-10-02

- a disposição dos cards da página de importações foi ajustada com flex-wrap e alinhamento melhor do texto e dos botões de ação;
- títulos e ações agora compartilham melhor o espaço e o layout fica mais estável em larguras médias e pequenas;
- a mudança foi focada no visual, sem alterar regras de negócio, uploads, preview ou confirmação.

Arquivos alterados: [frontend/src/imports.css](frontend/src/imports.css) e [ROADMAP.md](ROADMAP.md).

Validação: build do frontend foi verificado após o ajuste de layout.

### Ajuste visual global dos cards e headings — implementado em 2026-10-02

- os headings de painel agora usam flex-wrap e área flexível para o texto, deixando botões e títulos alinhados de forma consistente em todos os cards do app;
- em telas menores, o layout empilha os blocos e aloca a área de ações em largura total para manter legibilidade e evitar desalinhamento;
- a correção é aplicada no padrão global de cards, sem mexer em regras de negócio ni em fluxos de dados.

Arquivos alterados: [frontend/src/styles.css](frontend/src/styles.css) e [ROADMAP.md](ROADMAP.md).

Validação: build do frontend foi verificado após a correção global de layout.

### Próxima ação

Conferir a aparência dos cards em telas 1366px e em mobile e ajustar pequenos detalhes visuais caso apareça desalinhamento residual.

### Exclusão segura de supervisores — implementada em 2026-10-02

- cards de supervisores agora têm ação de lixeira; fica desabilitada quando há técnicos vinculados e pede confirmação antes de excluir;
- `DELETE /api/supervisores/:id` exige `supervisors.edit`, retorna 409 quando existem técnicos e 404 para IDs ausentes;
- PostgreSQL e Supabase usam exclusão lógica (`active=false`, `deleted_at` preenchido), preservando o usuário associado; o modo demo remove o registro de sua lista em memória;
- nenhuma migration necessária; o schema já tem `deleted_at` e `active` em `supervisors`.

Arquivos alterados: [backend/src/store.ts](backend/src/store.ts), [backend/src/server.ts](backend/src/server.ts), [backend/test/http.test.ts](backend/test/http.test.ts), [frontend/src/api.ts](frontend/src/api.ts), [frontend/src/App.tsx](frontend/src/App.tsx) e [ROADMAP.md](ROADMAP.md).

Validação: teste HTTP direcionado 1/1 passou; smoke test na API demo confirmou 409 para supervisor com 3 técnicos e 200 para excluir supervisor vazio; typechecks backend/frontend e build frontend passaram.

### Próxima ação

Implantar e conferir a ação na tela. Para supervisores ocupados, desvincular os técnicos primeiro; o backend mantém a validação mesmo se o botão for contornado.

### Lentidão na importação D-0 — otimização implementada em 2026-10-01

- causa: o loop de D-0 atualizava cada match em sequência; no Supabase, cada update carregava todas as páginas de chamados antes e depois e inseria um log por campo;
- atualização Supabase agora lê o chamado apenas por ID, agrupa todos os logs da chamada em uma inserção e retorna o objeto atualizado sem reler o histórico;
- os matches D-0 são aplicados em lotes de 10 para evitar milhares de requisições sequenciais sem sobrecarregar o banco com concorrência irrestrita;
- a tela diferencia “Lendo arquivo...” de “Atualizando chamados...” e informa que o cruzamento está em andamento;
- sem migration ou alteração de schema. A latência e os contadores ainda precisam ser conferidos no banco real.

Arquivos alterados: [backend/src/store.ts](backend/src/store.ts), [backend/src/integrations/supabase/client.ts](backend/src/integrations/supabase/client.ts), [backend/test/d0-import.test.ts](backend/test/d0-import.test.ts), [frontend/src/App.tsx](frontend/src/App.tsx) e [ROADMAP.md](ROADMAP.md).

Validação: D-0 7/7, store/supervisor 12/12, typechecks backend/frontend e build frontend passaram. Não foi executado contra Supabase/produção.

### Próxima ação

Subir a versão e reenviar a planilha D-0 no ambiente conectado. Conferir quantidade de linhas cruzadas, alteradas e não correspondidas e validar Endereço/Bairro na OS do relato.

### Sincronização Drive da OS 12529279 — correção implementada em 2026-10-01

- a linha mostrada tinha tipo `ACIONAMENTO FIELD`, que não estava na whitelist da sincronização e era incrementada como `skipped` antes de matching e atualização;
- o tipo foi incluído de forma explícita; o parser de localização também lê colunas `Bairro`, `Bairro do Cliente`, `Bairro Cliente`, `Neighborhood` e `District`, usando o endereço como fallback;
- a mensagem de resultado da tela Importações agora informa atualizados, novos, inalterados, ignorados, sem correspondência, linhas e arquivos, facilitando diagnosticar a próxima execução;
- regressões reproduzem a OS 12529279, endereço/bairro extraídos do endereço e bairro explícito sem endereço;
- nenhuma alteração de banco ou migration. Sincronização com credenciais/dados reais não foi executada nesta sessão.

Arquivos alterados: [backend/src/integrations/google-drive.ts](backend/src/integrations/google-drive.ts), [backend/test/supervisor-scoping.test.ts](backend/test/supervisor-scoping.test.ts), [frontend/src/api.ts](frontend/src/api.ts), [frontend/src/App.tsx](frontend/src/App.tsx), [docs/google-drive-d1-sync.md](docs/google-drive-d1-sync.md) e [ROADMAP.md](ROADMAP.md).

Validação: testes Google Drive 3/3 e store/supervisor 12/12 passaram; typechecks backend e frontend passaram. A confirmação final depende de rodar a sincronização no ambiente real e conferir a OS `12529279`.

### Próxima ação

Sincronizar Drive no ambiente conectado, conferir os contadores `updated/skipped/unmatched` e abrir a OS `12529279` para validar Endereço e Bairro.

### Lentidão ao abrir detalhe de chamado — otimização implementada em 2026-10-01

- causa: `getCall(id)` carregava todas as páginas de `calls` no Supabase/PostgreSQL e só depois procurava o ID;
- a consulta por ID agora é aplicada no servidor do banco, mantendo filtros de supervisor e período; IDs que não são UUID retornam como inexistentes sem erro de cast nos bancos;
- o runtime em memória também respeita o filtro por ID; nenhuma migration ou alteração de schema.

Arquivos alterados: [backend/src/store.ts](backend/src/store.ts), [backend/src/integrations/supabase/client.ts](backend/src/integrations/supabase/client.ts), [backend/test/supervisor-scoping.test.ts](backend/test/supervisor-scoping.test.ts) e [ROADMAP.md](ROADMAP.md).

Validação: store/supervisor 10/10, teste HTTP de detalhe 1/1 e typecheck backend passaram. Latência real não foi medida porque este ambiente não está ligado ao banco implantado.

### Próxima ação

Implantar e medir o detalhe em um banco com histórico grande; verificar pelo Network que a carga do detalhe faz uma consulta por ID, sem percorrer todas as páginas.

### Vínculo empregatício dos técnicos — implementado em 2026-10-01

- a coluna `employment_status` tem os valores `Trabalhando` e `Demitido`, com default `Trabalhando` inclusive para técnicos já cadastrados;
- vínculo empregatício é independente de `active` (disponibilidade operacional/escala) e de `current_status` (Disponível, Em campo ou Indisponível);
- a tela Técnicos inclui coluna editável Vínculo, filtro padrão Trabalhando e filtros Demitido/Todos; os cards de contagem não incluem demitidos em Trabalhando/Em campo/Disponíveis;
- a edição/cadastro permite mudar vínculo; técnicos demitidos não aparecem como opção para atribuir chamado e a API rejeita atribuição direta;
- migrations criadas: local 015 e Supabase `202610010003`; nenhuma migration foi aplicada a banco real nesta sessão.

Arquivos alterados: [backend/src/types.ts](backend/src/types.ts), [backend/src/store.ts](backend/src/store.ts), [backend/src/server.ts](backend/src/server.ts), [backend/src/integrations/supabase/client.ts](backend/src/integrations/supabase/client.ts), [backend/test/http.test.ts](backend/test/http.test.ts), [frontend/src/api.ts](frontend/src/api.ts), [frontend/src/App.tsx](frontend/src/App.tsx), [database/migrations/015_technician_employment_status.sql](database/migrations/015_technician_employment_status.sql), [supabase/migrations/202610010003_technician_employment_status.sql](supabase/migrations/202610010003_technician_employment_status.sql) e [ROADMAP.md](ROADMAP.md).

Validação: regressões HTTP direcionadas 2/2 passaram; typechecks backend/frontend e build de produção do frontend passaram. A migration não foi aplicada e a validação visual em ambiente implantado continua pendente.

### Próxima ação

Aplicar a migration correspondente ao runtime e validar a coluna/filtro na lista de técnicos antes de cadastrar os vínculos reais.

### Importação de chamados atuais — fluxo implementado em 2026-10-01

- o parser criado no commit `f8b78ce` agora está conectado à aba Importações por endpoints autenticados de prévia e confirmação;
- STATUS Pendente é normalizado para Aberto; Finalizado e Baixar preservam Data Fim; Data Fim de Pendente é ignorada; linhas inválidas e encerradas sem Data Fim são contabilizadas;
- datas em texto seguem o padrão brasileiro DD/MM/AAAA; o teste identificou e corrigiu a leitura anterior de `01/10/2026` como 10 de janeiro;
- a prévia informa destino, contagens por status, registros existentes, ordens repetidas, linhas inválidas, datas faltantes e amostra; técnicos com correspondência única são vinculados, nomes sem cadastro bloqueiam confirmação;
- a confirmação revalida identificadores antes de gravar; demo em memória não permite escrita; a persistência em PostgreSQL/Supabase preserva status e metadados de origem;
- a tela “Finalizados e cancelados” consulta os três status encerrados antes de paginar. O schema não restringe `calls.status`, portanto nenhuma migration foi necessária;
- o último commit também havia substituído `formatIgpHours` por JSX solto no nível do módulo; a função foi restaurada e `Baixar` foi incluído no campo Data Fim do detalhe.

Arquivos alterados: [backend/src/imports/current-calls.ts](backend/src/imports/current-calls.ts), [backend/src/server.ts](backend/src/server.ts), [backend/src/store.ts](backend/src/store.ts), [backend/src/integrations/supabase/client.ts](backend/src/integrations/supabase/client.ts), [backend/test/current-calls.test.ts](backend/test/current-calls.test.ts), [backend/test/http.test.ts](backend/test/http.test.ts), [backend/test/supervisor-scoping.test.ts](backend/test/supervisor-scoping.test.ts), [frontend/src/api.ts](frontend/src/api.ts), [frontend/src/App.tsx](frontend/src/App.tsx) e [ROADMAP.md](ROADMAP.md).

Validação: parser 2/2; testes de store/supervisor 9/9; builds backend e frontend passaram; smoke test HTTP isolado em demo confirmou prévia e filtro multi-status com HTTP 200, sem confirmar escrita. Na execução da suíte backend, os testes HTTP visíveis (healthcheck, filtro de status e prévias histórica/atual) passaram; o terminal não apresentou o resumo final nem a contagem integral, portanto a suíte completa não fica certificada nesta sessão.

### Próxima ação

Usar a planilha real no ambiente de destino, conferir duplicatas e técnicos não mapeados, e confirmar somente após revisão. Nenhum dado foi gravado neste trabalho.

### Ajuste de fixtures de OLT — concluído em 2026-10-01

- a normalização exige códigos no formato OLT compatível com `VIP-...`/`OLT-...`, com letras, números e separadores em maiúsculas e sem caracteres inválidos;
- os fixtures do teste de Adicionar/Ignorar foram trocados para códigos genéricos desconhecidos, mas válidos, evitando que o fluxo fosse confundido com um mapeamento real;
- o ciclo de captura, ignorar e aceitar continua funcionando sem alterar a regra de negócio da aplicação;
- validação: teste focado de solicitações de OLT passou em demo.

Arquivos alterados: [backend/test/olt-region-requests.test.ts](backend/test/olt-region-requests.test.ts) e [ROADMAP.md](ROADMAP.md).

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

## 2026-10-02 — Exclusão lógica de supervisores vazios

### Objetivo

Permitir remover cadastros de supervisores que não possuem técnicos vinculados, sem perder a proteção de equipes existentes.

### Alterações realizadas

- ação de excluir adicionada aos cards; desabilitada para equipes com técnicos e acompanhada de confirmação;
- endpoint DELETE protegido por `supervisors.edit`; retorna `409` com contagem quando ainda há técnicos;
- PostgreSQL e Supabase marcam supervisor como inativo e `deleted_at`; login associado não é excluído.

### Arquivos modificados

- [backend/src/store.ts](backend/src/store.ts)
- [backend/src/server.ts](backend/src/server.ts)
- [backend/test/http.test.ts](backend/test/http.test.ts)
- [frontend/src/api.ts](frontend/src/api.ts)
- [frontend/src/App.tsx](frontend/src/App.tsx)
- [ROADMAP.md](ROADMAP.md)

### Banco de dados

Nenhuma alteração de banco ou migration realizada; foram reutilizados `supervisors.active` e `supervisors.deleted_at`.

### Testes

- `node_modules\\.bin\\tsx.cmd --test --test-name-pattern="delete an empty supervisor" backend/test/http.test.ts`: 1 passou, 0 falharam;
- smoke test HTTP demo confirmou `409` para supervisor com três técnicos e `200` para supervisor vazio;
- typechecks backend/frontend e build frontend passaram; permanece aviso conhecido de bundle acima de 500 kB.

### Próxima ação

Implantar, verificar a ação visualmente e validar que supervisores vazios desaparecem da lista; equipe ocupada deve continuar bloqueada.

## 2026-10-01 — Lotes e consultas pontuais para importação D-0

### Objetivo

Reduzir a demora no upload D-0 quando há milhares de chamados e impedir que a tela fique em “Processando...” sem atualizar os registros.

### Alterações realizadas

- `updateSupabaseCall` deixou de carregar todas as páginas de chamados antes/depois; agora lê somente o ID e monta a resposta atualizada sem reler a tabela;
- logs de auditoria dos campos alterados no Supabase são enviados em uma única inserção por chamado;
- `replaceD0Base` atualiza matches em lotes de 10, mantendo matching, campos e contadores atuais;
- interface mostra a fase de leitura e a fase de cruzamento/atualização.

### Arquivos modificados

- [backend/src/store.ts](backend/src/store.ts)
- [backend/src/integrations/supabase/client.ts](backend/src/integrations/supabase/client.ts)
- [backend/test/d0-import.test.ts](backend/test/d0-import.test.ts)
- [frontend/src/App.tsx](frontend/src/App.tsx)
- [ROADMAP.md](ROADMAP.md)

### Banco de dados

Nenhuma alteração de banco ou migration realizada.

### Testes

- `node_modules\\.bin\\tsx.cmd --test backend/test/d0-import.test.ts`: 7 passaram, 0 falharam;
- `node_modules\\.bin\\tsx.cmd --test backend/test/supervisor-scoping.test.ts`: 12 passaram, 0 falharam;
- typechecks backend/frontend e build frontend passaram; permanece aviso conhecido de bundle acima de 500 kB.

### Pendência e próximo passo

Sem credencial/conexão ao banco real neste workspace. Após deploy, reenviar D-0 e verificar contadores e uma chamada atualizada; comparar o tempo total com a execução anterior.

## 2026-10-01 — Drive atualiza linhas ACIONAMENTO FIELD e bairros explícitos

### Objetivo

Corrigir a sincronização que ignorava a OS `12529279` e não preenchia localização em chamados importados de planilha atual.

### Alterações realizadas

- incluído `ACIONAMENTO FIELD` na whitelist de tipos que o Drive processa; antes, essas linhas eram ignoradas antes do matching;
- parser reconhece colunas de Bairro explícito e mantém a inferência baseada no endereço como fallback;
- resumo da sincronização exibe novos/atualizados/inalterados/ignorados/sem correspondência, linhas e arquivos.

### Arquivos modificados

- [backend/src/integrations/google-drive.ts](backend/src/integrations/google-drive.ts)
- [backend/test/supervisor-scoping.test.ts](backend/test/supervisor-scoping.test.ts)
- [frontend/src/api.ts](frontend/src/api.ts)
- [frontend/src/App.tsx](frontend/src/App.tsx)
- [docs/google-drive-d1-sync.md](docs/google-drive-d1-sync.md)
- [ROADMAP.md](ROADMAP.md)

### Banco de dados

Nenhuma alteração de banco ou migration realizada.

### Testes

- testes Google Drive: 3/3 passaram, incluindo elegibilidade ACIONAMENTO FIELD, endereço/bairro derivados e Bairro explícito sem endereço;
- `node_modules\\.bin\\tsx.cmd --test backend/test/supervisor-scoping.test.ts`: 12 passaram, 0 falharam;
- typechecks backend/frontend passaram.

### Pendência e próximo passo

Não há credenciais/conexão de Drive real neste workspace. Executar sincronização no ambiente implantado e conferir que a OS `12529279` foi atualizada; nenhuma sincronização de produção foi executada nesta tarefa.

## 2026-10-01 — Consulta pontual do detalhe de chamado

### Objetivo

Reduzir a espera ao abrir chamados quando o banco contém milhares de registros.

### Alterações realizadas

- antes, `getCall(id)` chamava a listagem completa paginada e só então procurava o identificador;
- a listagem aceita filtro opcional `id`, aplicado com igualdade no Supabase e `WHERE c.id = ...` no PostgreSQL local;
- filtros de período, equipe de supervisor e regras de 404 permanecem aplicados; IDs malformados não causam erro de cast para UUID.

### Arquivos modificados

- [backend/src/store.ts](backend/src/store.ts)
- [backend/src/integrations/supabase/client.ts](backend/src/integrations/supabase/client.ts)
- [backend/test/supervisor-scoping.test.ts](backend/test/supervisor-scoping.test.ts)
- [ROADMAP.md](ROADMAP.md)

### Banco de dados

Nenhuma alteração de banco ou migration realizada.

### Testes

- `node_modules\\.bin\\tsx.cmd --test backend/test/supervisor-scoping.test.ts`: 10 passaram, 0 falharam, incluindo ID inexistente e escopo de supervisor;
- `node_modules\\.bin\\tsx.cmd --test --test-name-pattern="admin can delete a test call" backend/test/http.test.ts`: 1 passou, 0 falharam;
- `node_modules\\.bin\\tsc.cmd -p backend/tsconfig.json --noEmit`: passou.

### Pendência e próximo passo

Medir a latência em ambiente com volume de produção após implantação; esse workspace não tem conexão ao banco real.

## 2026-10-01 — Vínculo empregatício de técnicos

### Objetivo

Distinguir técnicos trabalhando de técnicos demitidos sem confundir essa situação com disponibilidade calculada por turno.

### Alterações realizadas

- criado `technicians.employment_status`, com valores Trabalhando/Demitido e default Trabalhando para registros existentes e novos;
- coluna Vínculo editável na tabela, cadastro e detalhe; filtro inicia em Trabalhando e permite Demitido/Todos;
- cards operacionais ignoram demitidos; atribuição de chamados exclui demitidos no frontend e é bloqueada no backend;
- `active` e `current_status` permanecem com seus significados atuais.

### Arquivos criados

- [database/migrations/015_technician_employment_status.sql](database/migrations/015_technician_employment_status.sql)
- [supabase/migrations/202610010003_technician_employment_status.sql](supabase/migrations/202610010003_technician_employment_status.sql)

### Arquivos modificados

- [backend/src/types.ts](backend/src/types.ts)
- [backend/src/store.ts](backend/src/store.ts)
- [backend/src/server.ts](backend/src/server.ts)
- [backend/src/integrations/supabase/client.ts](backend/src/integrations/supabase/client.ts)
- [backend/test/http.test.ts](backend/test/http.test.ts)
- [frontend/src/api.ts](frontend/src/api.ts)
- [frontend/src/App.tsx](frontend/src/App.tsx)
- [ROADMAP.md](ROADMAP.md)

### Banco de dados

Adicionar a coluna `employment_status varchar(20) NOT NULL DEFAULT 'Trabalhando'` com CHECK limitado a `Trabalhando`/`Demitido`. Migration não aplicada durante esta implementação.

### Testes

- `node_modules\\.bin\\tsx.cmd --test --test-name-pattern="employment status" backend/test/http.test.ts`: 1 passou, 0 falharam;
- `node_modules\\.bin\\tsx.cmd --test --test-name-pattern="admin can create technician" backend/test/http.test.ts`: 1 passou, 0 falharam;
- `node_modules\\.bin\\tsc.cmd -p backend/tsconfig.json --noEmit`: passou;
- `node_modules\\.bin\\tsc.cmd -p frontend/tsconfig.app.json --noEmit`: passou;
- `node_modules\\.bin\\vite.cmd build frontend --config frontend/vite.config.ts`: passou, com aviso existente de bundle acima de 500 kB.

### Pendências e próximo passo

Aplicar a migration local 015 ou Supabase `202610010003` no ambiente correspondente; depois conferir a tela e cadastrar os vínculos reais. Nenhuma alteração em produção foi executada.

## 2026-10-01 — Importação de chamados atuais e suporte ao status Baixar

### Objetivo

Concluir o parser de planilhas de chamados atuais iniciado no commit `f8b78ce` e garantir que o status Baixar seja tratado como encerrado na listagem e nos detalhes.

### Alterações realizadas

- adicionados endpoints autenticados de prévia e confirmação para planilhas XLSX de chamados atuais, exigindo `imports.create` e `calls.create`;
- prévia mostra amostra/contagens, resolve técnicos de forma não ambígua, exclui ordens repetidas e registros existentes; confirmação refaz a deduplicação e bloqueia gravação no modo demo;
- a gravação genérica de planilhas preserva o status de cada chamada e os metadados de origem; importação histórica mantém o comportamento de gravar como Finalizado;
- consultas aceitam múltiplos status no runtime em memória, PostgreSQL e Supabase; a tela de encerrados busca Finalizado, Cancelado e Baixar antes de paginar;
- parser textual interpreta datas no padrão brasileiro DD/MM/AAAA; linhas com ordem sem identificador normalizável são inválidas;
- corrigida a substituição acidental de `formatIgpHours` no commit retomado e Data Fim do detalhe reconhece Baixar.

### Arquivos criados

- [backend/test/current-calls.test.ts](backend/test/current-calls.test.ts)

### Arquivos modificados

- [backend/src/imports/current-calls.ts](backend/src/imports/current-calls.ts)
- [backend/src/server.ts](backend/src/server.ts)
- [backend/src/store.ts](backend/src/store.ts)
- [backend/src/integrations/supabase/client.ts](backend/src/integrations/supabase/client.ts)
- [backend/test/http.test.ts](backend/test/http.test.ts)
- [backend/test/supervisor-scoping.test.ts](backend/test/supervisor-scoping.test.ts)
- [frontend/src/api.ts](frontend/src/api.ts)
- [frontend/src/App.tsx](frontend/src/App.tsx)
- [ROADMAP.md](ROADMAP.md)

### Banco de dados

Nenhuma alteração de banco ou migration realizada. `calls.status` é `varchar` sem CHECK que limite os valores; as colunas de origem já existem desde a migration 008.

### Testes

- `npx tsx --test backend/test/current-calls.test.ts`: 2 passaram, 0 falharam;
- `npx tsx --test backend/test/supervisor-scoping.test.ts`: 9 passaram, 0 falharam;
- `npm run build --workspace backend`: passou;
- `npm run build --workspace frontend`: passou; permanece aviso conhecido de bundle acima de 500 kB;
- smoke test HTTP em servidor demo isolado: login, prévia da planilha Baixar e listagem multi-status retornaram HTTP 200; a amostra sintética não foi confirmada nem gravada;
- na execução da suíte backend, os testes HTTP visíveis, incluindo importação atual e filtro multi-status, passaram; o terminal não apresentou o resumo final/contagem integral.

### Pendências e próximo passo

Validar a prévia e a gravação com a planilha operacional no ambiente conectado ao banco de destino. Conferir contagens, ordens repetidas e técnicos sem correspondência antes de confirmar. Nenhuma importação em produção foi executada.

## 2026-10-01 — Google Drive atualiza campos OFS e aliases D-0

### Objetivo

Fazer a sincronização Drive preencher informações faltantes do chamado, mantendo a distinção entre status interno e status da fonte OFS.

### Alterações realizadas

- `Status da Atividade` e aliases são gravados em `calls.ofs_status`; a comparação de mudanças agora inclui esse campo;
- builders de criação/atualização aceitam aliases adicionais de ordem, OfficeTrack, endereço/cidade, região e datas finais do D-0;
- nenhuma migration ou alteração de schema.

### Arquivos modificados

- [backend/src/integrations/google-drive.ts](backend/src/integrations/google-drive.ts)
- [backend/test/supervisor-scoping.test.ts](backend/test/supervisor-scoping.test.ts)
- [docs/google-drive-d1-sync.md](docs/google-drive-d1-sync.md)
- [ROADMAP.md](ROADMAP.md)

### Testes

`npx.cmd tsx --test backend/test/supervisor-scoping.test.ts`: 7 passaram, 0 falharam. Teste do builder confirma que uma alteração somente em `ofsStatus` é significativa sem substituir o status interno. Validação com Drive real depende das credenciais/folder ID do ambiente implantado.

### Próximo passo

Implantar e executar a sincronização Drive; conferir campos preenchidos e contadores antes de considerar a validação operacional concluída.

## 2026-10-01 — Paginação visual das listas de chamados

### Objetivo

Evitar travamento do navegador ao renderizar milhares de chamados importados.

### Alterações realizadas

- todas as instâncias de `CallsPage` mostram no máximo 100 linhas por página;
- navegação Anterior/Próxima informa o intervalo atual e o total filtrado;
- busca, status, região, bairro e período retornam à página 1;
- a cópia PNG usa as linhas da página visível;
- a paginação Supabase no backend continua buscando o histórico completo em páginas de 500.

### Arquivos modificados

- [frontend/src/App.tsx](frontend/src/App.tsx)
- [frontend/src/calls-layout.css](frontend/src/calls-layout.css)
- [ROADMAP.md](ROADMAP.md)

### Testes

`npm.cmd run build --workspace frontend` passou; permanece o aviso conhecido de bundle acima de 500 kB. Browser com 201 chamados simulados confirmou páginas de 100, 100 e 1 linha; busca reduziu a lista a 1 e voltou para a página 1.

### Próximo passo

Implantar frontend/backend e confirmar na lista de produção os 3.722 chamados históricos.

## 2026-10-01 — Paginação completa de chamados no Supabase

### Objetivo

Corrigir a listagem que mostrava exatamente 1.000 chamados mesmo havendo mais registros no banco.

### Alterações realizadas

- `listSupabaseCalls` consulta em páginas de 500 linhas até obter uma página incompleta;
- ordenação determinística por `opened_at` descendente e `id` ascendente evita resultados instáveis entre páginas;
- status, período e escopo de supervisor são reaplicados em cada consulta;
- consumidores da função (filas, dashboards, busca e deduplicação histórica) recebem o conjunto completo;
- nenhuma alteração de banco ou migration.

### Arquivos modificados

- [backend/src/integrations/supabase/client.ts](backend/src/integrations/supabase/client.ts)
- [ROADMAP.md](ROADMAP.md)

### Testes

Build/typecheck backend passou. Não foi possível consultar o Supabase ativo neste workspace.

### Próximo passo

Implantar e confirmar que a tela retorna os 3.722 históricos, sem truncar listagens ou dashboards acima de 1.000.

## 2026-09-30 — Importação de acionamentos históricos finalizados

### Objetivo

Adicionar chamados antigos da planilha de acionamentos finalizados ao sistema atual sem duplicar ordens e sem gravar antes da conferência.

### Alterações realizadas

- parser XLSX reconhece `Tecnico`, `Data Abertura`, `Data Acionamento`, `Data-Fim` e `ACIONAMENTO`, reutilizando o parser operacional existente;
- os chamados são preparados como `Finalizado`; abertura, acionamento e fim são preservados, O.S. OT vira a chave primária e OLT é mapeada para Região quando possível;
- a tela Importações fornece prévia agregada, amostra segura, contagem de chamadas existentes, duplicatas internas/conflitos, campos faltantes e ambiente de destino;
- confirmação exige permissões de importação e criação de chamados, revalida duplicatas, usa IDs determinísticos e só grava em PostgreSQL/Supabase configurado; demo em memória bloqueia gravação;
- valores derivados de Bairro acima de `varchar(160)` e Slot/PON acima de `varchar(255)` não são enviados aos campos curtos; a mensagem operacional original permanece nas observações e as omissões aparecem na prévia;
- a planilha atualizada, aba Planilha1: 3.724 linhas; todas com Data Abertura/Data-Fim/O.S. OT; 3.722 candidatas; duas linhas da O.S. `602156053150102` divergem em abertura/acionamento e são excluídas até revisão (linhas 3332/3333); faltam 75 motivos e 211 OLTs;
- a prévia no workspace demo mostra 3.722 importáveis, zero existentes no dataset demo e as duas linhas conflitantes com suas datas; o botão de gravação fica desabilitado em demo;
- o workspace não tem conexão ao banco ativo. Nenhum chamado foi gravado em produção e nenhuma migration nova foi criada.

### Arquivos modificados/criados

- [backend/src/imports/historical-activations.ts](backend/src/imports/historical-activations.ts)
- [backend/src/server.ts](backend/src/server.ts)
- [backend/src/store.ts](backend/src/store.ts)
- [backend/src/types.ts](backend/src/types.ts)
- [backend/test/historical-activations.test.ts](backend/test/historical-activations.test.ts)
- [frontend/src/App.tsx](frontend/src/App.tsx)
- [frontend/src/api.ts](frontend/src/api.ts)
- [frontend/src/imports.css](frontend/src/imports.css)
- [ROADMAP.md](ROADMAP.md)

### Testes

- `npx.cmd tsx --test backend/test/historical-activations.test.ts`: 4 passaram, 0 falharam;
- build backend e frontend passaram; build mantém aviso conhecido de bundle > 500 kB;
- teste browser da planilha atualizada mostrou destino `Demo em memória`, 3.722 novas, 0 existentes no conjunto demo e botão de gravação desabilitado;
- inspeção dos 3.724 candidatos encontrou 7 bairros >160 e 14 Slot/PON >255; a proteção foi adicionada para impedir falhas de insert sem truncar silenciosamente o texto original;
- conflito das linhas 3332/3333 agora é exibido na prévia com O.S. e datas, sem mostrar mensagem, telefone ou outros dados pessoais;
- importação em produção ainda não foi executada: é necessário publicar/conectar o backend ao banco ativo.

### Próximo passo

Implantar esta versão conectada ao banco ativo; revisar/excluir as linhas 3332/3333 em conflito, conferir a contagem de já existentes em produção e só então confirmar.

## 2026-09-30 — Segmentação regional do Painel diário pelo OFS

### Objetivo

Separar atividades, técnicos e ordens em Guarulhos ou SP conciliando a Ordem de Serviço da exportação OFS com a Ordem dos chamados e usando a Região do chamado.

### Alterações realizadas

- parser flat OFS reconhece cabeçalho duplicado numerado `Tipo de Atividade2` e preserva cada linha detalhada junto aos totais;
- a API aceita opcionalmente os registros detalhados no JSON do painel existente; nenhuma tabela ou migration foi criada;
- a Região de cada ordem é consultada em `/api/chamados`; Região contendo Guarulhos vai ao segmento Guarulhos; as outras e ordens sem match vão a SP;
- ordens duplicadas com regiões conflitantes são tratadas como sem correspondência e não recebem Região arbitrária;
- a interface troca todos os cards entre as abas Guarulhos/SP e informa quantas ordens sem match foram atribuídas a SP;
- bases antigas que guardam somente totais agregados precisam ser reimportadas com o OFS detalhado.

### Arquivos modificados

- [frontend/src/App.tsx](frontend/src/App.tsx)
- [frontend/src/api.ts](frontend/src/api.ts)
- [backend/src/types.ts](backend/src/types.ts)
- [backend/src/server.ts](backend/src/server.ts)
- [frontend/src/manual-dashboard.css](frontend/src/manual-dashboard.css)
- [ROADMAP.md](ROADMAP.md)

### Testes

Build backend e frontend passaram. Upload browser de CSV com `Tipo de Atividade2` passou; a ordem RF-240918 foi conciliada em Guarulhos, enquanto RF-240917 (duas regiões conflitantes) e BDESK-UNKNOWN foram para SP (2 sem match). Base e alteração de região usadas no teste foram descartadas reiniciando o backend demo.

### Próximo passo

Reimportar uma base OFS real e validar a correspondência de ordens/regiões antes de compartilhar os relatórios.

## 2026-09-30 — Alinhamento dos números nos PNGs dos cards

### Objetivo

Corrigir os valores numéricos que apareciam deslocados nas imagens individuais do Painel diário.

### Alterações realizadas

- cabeçalhos e células que não são a primeira coluna agora ficam centralizados nos PNGs de atividades e técnicos;
- em Ordens, Ordem e Técnico permanecem à esquerda, enquanto Início e Tempo ficam centralizados;
- nenhuma alteração no alinhamento da interface da tela.

### Arquivos modificados

- [frontend/src/App.tsx](frontend/src/App.tsx)
- [ROADMAP.md](ROADMAP.md)

### Testes

`npm.cmd run build --workspace frontend` passou (TypeScript e Vite). Teste browser temporário copiou os três PNGs; os estilos calculados ficaram centralizados em todos os cabeçalhos/valores numéricos de Atividades e Técnicos. Em Ordens, Ordem e Técnico ficaram à esquerda e Início/Tempo centralizados. A base sintética foi apagada após o teste; nenhuma alteração de banco.

### Próximo passo

Validar visualmente com uma base operacional real após atualização do ambiente.

## 2026-09-30 — Cópia PNG individual por card do Painel diário

### Objetivo

Evitar uma imagem única muito alta e pequena para leitura, oferecendo um arquivo separado para cada tabela.

### Alterações realizadas

- removida a ação global `Copiar painel`;
- adicionada uma ação de copiar imagem nos cards Produção por atividades, Produção por técnico e Ordens iniciadas;
- cada ação captura somente o card correspondente, com cabeçalho, origem e horário; nomes dos arquivos são específicos por seção;
- estados de cópia/download/erro são independentes por card e a busca por técnico permanece refletida na imagem copiada.

### Arquivos modificados

- [frontend/src/App.tsx](frontend/src/App.tsx)
- [frontend/src/manual-dashboard.css](frontend/src/manual-dashboard.css)
- [ROADMAP.md](ROADMAP.md)

### Testes

`npm.cmd run build --workspace frontend` passou (TypeScript e Vite). Teste browser confirmou os três botões, cópia de PNG e conteúdo isolado por card com base demo temporária: atividades 3600 × 1404 px, técnicos 3600 × 4101 px, ordens 3000 × 1257 px. A base foi removida após o teste; permanece o aviso de bundle acima de 500 kB.

### Próximo passo

Validar o fallback de download em navegador sem suporte/permissão para clipboard de imagens.

## 2026-09-30 — Cards em largura total e prévia PNG legível

### Objetivo

Resolver a disposição desequilibrada e o tamanho reduzido do texto nos cards e nas imagens compartilhadas do Painel diário.

### Alterações realizadas

- atividades, técnicos e ordens passaram a ocupar linhas separadas em largura total; atividades/ordens usam altura de conteúdo, enquanto técnicos mantêm scroll interno;
- tipografia, espaçamento de células e badges foram ampliados no painel; o técnico deixa de dividir metade da largura com outra tabela de oito colunas;
- o PNG passou de duas colunas para uma, reduziu a largura base para 1200 px e elevou as tabelas para 15 px, preservando resolução dinâmica até 3×;
- nenhuma regra de SLA foi presumida a partir do campo Tempo.

### Arquivos modificados

- [frontend/src/App.tsx](frontend/src/App.tsx)
- [frontend/src/manual-dashboard.css](frontend/src/manual-dashboard.css)
- [ROADMAP.md](ROADMAP.md)

### Testes

`npm.cmd run build --workspace frontend` passou (TypeScript e Vite). Teste browser com 18 técnicos confirmou os três cards em largura total: atividades 370 px, técnicos 558 px com scroll interno e ordens 333 px; fonte da tabela 13 px. Em viewport 390 px, a página não excedeu a largura disponível. PNG ficou em coluna única, fonte 15 px, gerado em 3600 × 6885 px (~1,36 MB). Base demo e clone de inspeção foram removidos. Permanece o aviso de bundle acima de 500 kB.

### Próximo passo

Validar com a base operacional real e usuários finais se o card técnico deve manter o limite atual de 420 px de scroll.

## 2026-09-30 — Redesign do Painel diário para operação e compartilhamento

### Objetivo

Melhorar leitura do painel em monitores operacionais e a nitidez das imagens copiadas para compartilhamento.

### Alterações realizadas

- cabeçalho reúne título, estado da base, nome do arquivo, horário de atualização e ação Atualizar;
- atividades e técnicos ficam em cards de altura equivalente com rolagem interna; busca rápida filtra técnicos e seus totais;
- tabelas usam contraste alto, totais em negrito e pílulas coloridas por estado; ordens têm colunas proporcionais e Tempo em badge;
- alertas de tempo só recebem destaque quando a origem fornece explicitamente texto de atraso, sem inferir SLA;
- captura PNG usa fator de até 3× com orçamento de 40 milhões de pixels, evitando crescimento de memória em bases longas.

### Arquivos modificados

- [frontend/src/App.tsx](frontend/src/App.tsx)
- [frontend/src/main.tsx](frontend/src/main.tsx)
- [frontend/src/manual-dashboard.css](frontend/src/manual-dashboard.css)
- [ROADMAP.md](ROADMAP.md)

### Testes

`npm.cmd run build --workspace frontend` passou (TypeScript e Vite). Teste browser com 18 técnicos: busca reduziu a lista ao resultado esperado; tabela rolou internamente (721 px de conteúdo/282 px visíveis); cards laterais mediram 440 px cada e Ordens 289 px no desktop. Em viewport mobile 390 px, a grade empilhou os cards e a página não excedeu a largura disponível. Export PNG confirmou clipboard e gerou 5520 × 4800 px (~1,26 MB). A base demo de teste foi removida após a validação. Permanece o aviso de bundle acima de 500 kB.

### Próximo passo

Validar o fallback de download em navegador sem suporte/permissão para clipboard de imagens.

## 2026-09-30 — Legibilidade dos relatórios em imagem

### Objetivo

Garantir que as imagens copiadas para compartilhamento mantenham legibilidade fora do layout responsivo da aplicação.

### Alterações realizadas

- os dois fluxos de captura existentes foram mapeados: tabela de chamados e Painel diário;
- o Painel diário agora exporta em largura fixa de relatório, com título/identificação, duas tabelas de produção lado a lado e ordens em faixa completa;
- as tabelas exportadas removem limites de scroll/ellipsis, permitem quebra de texto e aplicam tamanhos e cores próprios;
- a tabela de chamados mantém seu layout PNG dedicado, sem alteração de comportamento.

### Arquivos modificados

- [frontend/src/App.tsx](frontend/src/App.tsx)
- [ROADMAP.md](ROADMAP.md)

### Testes

`npm.cmd run build --workspace frontend` passou (TypeScript e Vite). O navegador local, usando apenas runtime demo em memória, gerou a composição do Painel diário com três tabelas em 1.840 × 844 px e confirmou `Painel copiado`. A base sintética foi removida depois do teste; o fallback de download não foi exercitado. Permanece o aviso de bundle acima de 500 kB.

### Próximo passo

Validar fallback de download em navegador sem suporte/permissão para clipboard de imagens.

## 2026-09-30 — Exportação visual da tabela como PNG

### Objetivo

Atender ao uso da tabela como imagem compartilhável, com leitura confortável e apresentação consistente, em vez de colar dados como texto TSV ou capturar o layout comprimido da tela.

### Alterações realizadas

- a ação `Copiar imagem` monta uma composição própria com título da tela, quantidade de registros, data de geração e rodapé RedeFlow;
- a tabela de exportação usa larguras por tipo de coluna, quebra de texto e linhas alternadas; status, prazo e SLA recebem destaque em badges;
- a imagem PNG é copiada para o clipboard quando suportado; caso contrário, baixa `redeflow-chamados.png`;
- a exportação utiliza as linhas visíveis após busca e filtros e preserva o conteúdo `data-prazo`.

### Arquivos modificados

- [frontend/src/App.tsx](frontend/src/App.tsx)
- [ROADMAP.md](ROADMAP.md)

### Testes

`npm.cmd run build --workspace frontend` passou (TypeScript e Vite). Em navegador local com runtime demo em memória, `Copiar imagem` gerou a composição de 2 linhas (tabela com 2.303 px de largura) e o botão confirmou `Imagem copiada`. O fallback de download não foi exercitado; permanece o aviso de bundle acima de 500 kB.

### Próximo passo

Validar o fallback de download em navegador sem suporte/permissão para clipboard de imagens.

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
| [backend/src/types.ts](backend/src/types.ts) | modelos de domínio, incluindo vínculo de técnico | Ativo |
| [backend/src/imports/current-calls.ts](backend/src/imports/current-calls.ts) | parser de planilhas de chamados atuais | Ativo |
| [frontend/src/App.tsx](frontend/src/App.tsx) | interface operacional | Ativo |
| [backend/src/integrations/supabase/client.ts](backend/src/integrations/supabase/client.ts) | integração Supabase | Em manutenção |
| [backend/src/integrations/wuzapi/client.ts](backend/src/integrations/wuzapi/client.ts) | integração WuzAPI | Ativo |
| [database/migrations/015_technician_employment_status.sql](database/migrations/015_technician_employment_status.sql) | vínculo empregatício local | A aplicar |
| [supabase/migrations/202610010003_technician_employment_status.sql](supabase/migrations/202610010003_technician_employment_status.sql) | vínculo empregatício Supabase | A aplicar |
| [database/migrations](database/migrations) | schema SQL principal | Ativo |
| [supabase/migrations](supabase/migrations) | schema Supabase | Em validação |
| [docs/official-data-mapping.md](docs/official-data-mapping.md) | mapeamento de dados oficiais | Ativo |

---

## 10. BANCO DE DADOS

O histórico da integração Google Drive requer as migrations [database/migrations/008_google_drive_history.sql](database/migrations/008_google_drive_history.sql) ou [supabase/migrations/202609290008_google_drive_history.sql](supabase/migrations/202609290008_google_drive_history.sql). A localização dos chamados requer também [database/migrations/009_call_location_fields.sql](database/migrations/009_call_location_fields.sql) ou [supabase/migrations/202609290009_call_location_fields.sql](supabase/migrations/202609290009_call_location_fields.sql). A exclusão em lote no Supabase requer as migrations [010](supabase/migrations/202609290010_bulk_delete_calls.sql) e [011](supabase/migrations/202609290011_bulk_delete_calls_where_clause.sql). A importação D-0 requer [database/migrations/010_d0_base_and_ofs_status.sql](database/migrations/010_d0_base_and_ofs_status.sql) no runtime PostgreSQL local ou [supabase/migrations/202609290012_d0_base_and_ofs_status.sql](supabase/migrations/202609290012_d0_base_and_ofs_status.sql) no Supabase. O editor OLT→Região requer [database/migrations/011_olt_region_overrides.sql](database/migrations/011_olt_region_overrides.sql) ou [supabase/migrations/202609290013_olt_region_overrides.sql](supabase/migrations/202609290013_olt_region_overrides.sql). Os anexos de observação requerem [database/migrations/012_call_observation_attachments.sql](database/migrations/012_call_observation_attachments.sql) ou [supabase/migrations/202609290014_call_observation_attachments.sql](supabase/migrations/202609290014_call_observation_attachments.sql). Aplique as migrations relevantes antes de usar cada recurso no ambiente correspondente.

Vínculo empregatício requer aplicar [database/migrations/015_technician_employment_status.sql](database/migrations/015_technician_employment_status.sql) no PostgreSQL local ou [supabase/migrations/202610010003_technician_employment_status.sql](supabase/migrations/202610010003_technician_employment_status.sql) no Supabase antes de ler/editar técnicos nessa versão. Importação de chamados atuais não exige migration; ela usa colunas existentes.

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

Exclusão de supervisor vazio e proteção de equipe ocupada.

Resultado: ✅ teste HTTP direcionado 1/1, smoke test demo, typechecks backend/frontend e build frontend passaram.

### Teste

Atualização em lotes na importação D-0.

Resultado: ✅ 7 testes D-0 e 12 testes store/supervisor passaram; typechecks backend/frontend e build frontend passaram. Validação com volume de produção pendente.

### Teste

Reconciliação Google Drive para ACIONAMENTO FIELD.

Resultado: ✅ testes Google Drive 3/3; suite store/supervisor 12/12; typechecks backend/frontend passaram. Validação com Drive ativo pendente.

### Teste

Consulta pontual do detalhe por ID.

Resultado: ✅ store/supervisor 10/10; teste HTTP do detalhe 1/1; typecheck backend passou. A medição de latência no banco real depende de deploy.

### Teste

Vínculo empregatício e bloqueio de atribuição a demitidos.

Resultado: ✅ testes HTTP direcionados 2/2, typechecks backend/frontend e build de produção frontend passaram. A migration ainda precisa ser aplicada no banco do ambiente implantado.

### Teste

Prévia de planilha de chamados atuais e filtro multi-status.

Resultado: ✅ parser 2/2, store/supervisor 9/9, builds backend/frontend e smoke test HTTP isolado em demo passaram. Os testes HTTP visíveis na suíte completa também passaram; o runner não apresentou resumo/contagem total. O smoke test não confirmou escrita.

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

- implantar a paginação no backend Supabase ativo e conferir contagens acima de 1.000 chamados;
- configurar/implantar o endpoint de importação histórica no backend conectado ao banco ativo; rever as duas O.S. conflitantes na prévia antes da confirmação;
- aplicar migration de anexos 012 local ou 014 Supabase antes de usar o novo fluxo;
- aplicar a migration D-0 no banco do runtime antes do primeiro upload;
- aplicar a migration 011 local ou 013 Supabase antes de salvar overrides de OLT;
- validar autenticação do Supabase real com seed e login oficial;
- confirmar consistência entre runtime local e produção.

### 🟠 IMPORTANTE

- reenviar a planilha D-0 no backend conectado, conferir `matchedCalls`, `updatedCalls`, `unmatchedRows` e medir duração com a importação em lotes;
- executar a sincronização real do Google Drive e confirmar atualização de Endereço/Bairro da OS `12529279`; verificar contadores de ignorados e sem correspondência;
- aplicar migration 015 local ou Supabase 202610010003 antes de usar a coluna Vínculo no ambiente implantado;
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

1. implantar e validar na tela a exclusão de supervisores sem equipe;
2. confirmar que a ação fica bloqueada para supervisor com técnicos e que o DELETE retorna `409`;
3. retomar as validações pendentes de importação D-0/Drive e das migrations de vínculo de técnicos.

---

## 15. CHECKPOINT DE CONTINUIDADE

## 🔖 CHECKPOINT — 2026-10-02 — Exclusão de supervisores

Adicionada lixeira nos cards de supervisores, desabilitada quando há técnicos, com confirmação. Endpoint `DELETE /api/supervisores/:id` usa `supervisors.edit`, aplica soft delete em PostgreSQL/Supabase, preserva usuário vinculado e responde 409 para equipe ocupada. Teste HTTP 1/1, smoke test demo, typechecks e build frontend passaram. Nenhuma migration. Próximo passo: implantar e validar visualmente.

## 🔖 CHECKPOINT — 2026-10-01 — Importação D-0 em lotes

Removido o custo de ler todo o histórico duas vezes por chamado: atualização Supabase busca por ID, agrupa auditorias por chamado e retorna sem novo fetch geral; matches D-0 são atualizados em lotes de 10. A tela exibe “Lendo arquivo...” e “Atualizando chamados...”. D-0 7/7, store/supervisor 12/12, typechecks e build frontend passaram. Nenhuma alteração de schema. Próximo passo: reenviar em ambiente real, revisar matched/updated/unmatched e medir duração.

## 🔖 CHECKPOINT — 2026-10-01 — Correção do sync Drive ACIONAMENTO FIELD

A OS mostrada na evidência era do tipo `ACIONAMENTO FIELD`, ausente da whitelist do Drive; essas linhas eram descartadas antes do matching. O tipo agora é elegível, o parser aceita Bairro em coluna explícita ou infere pelo endereço, e a tela mostra contadores de updated/new/unchanged/skipped/unmatched. Testes Google Drive 3/3 e store/supervisor 12/12; typechecks backend/frontend passaram. Nenhuma migration nem sync real executada. Próximo passo: sincronizar no ambiente Drive ativo e validar OS `12529279`.

## 🔖 CHECKPOINT — 2026-10-01 — Detalhe de chamado por ID

O detalhe deixou de buscar todas as páginas de chamados: `getCall(id)` usa agora igualdade por ID no Supabase/PostgreSQL e mantém escopo/período; IDs inválidos são tratados como não encontrados. Nenhuma migration. Store/supervisor 10/10, teste HTTP de detalhe 1/1 e typecheck backend passaram. Falta implantar e medir latência no banco real.

## 🔖 CHECKPOINT — 2026-10-01 — Vínculo empregatício dos técnicos

Implementado `employment_status` separado de `active`/`current_status`, com coluna editável Trabalhando/Demitido, filtro padrão Trabalhando e exclusão de demitidos das opções de atribuição; a API também bloqueia a atribuição. Migration local 015 e Supabase `202610010003` criadas, ainda não aplicadas. Testes HTTP direcionados 2/2, typechecks backend/frontend e build frontend passaram (aviso conhecido de bundle >500 kB). Próximo passo: aplicar a migration do ambiente e validar a tela antes de preencher os vínculos reais.

## 🔖 CHECKPOINT — 2026-10-01 — Continuação do commit “Acionamentos na Tela”

O parser de chamados atuais agora tem prévia/confirmação na aba Importações, com status preservado, datas brasileiras DD/MM/AAAA, deduplicação e bloqueio de gravação em demo. O filtro de encerrados usa Finalizado/Cancelado/Baixar antes da paginação. Corrigido também o erro de build em que o commit havia substituído `formatIgpHours` por JSX solto. Parser 2/2 e store/supervisor 9/9; builds backend/frontend passaram; smoke HTTP isolado em demo retornou 200 e não confirmou gravação; os testes HTTP visíveis na suíte também passaram, mas o terminal não forneceu a contagem final completa. Nenhuma migration ou gravação real. Próxima ação: revisar uma planilha real no ambiente destino e só então confirmar.

## 🔖 CHECKPOINT — 2026-10-01 — Sincronização Drive preenche Status OFS

Drive agora mapeia `Status da Atividade`/aliases para `calls.ofs_status` e detecta mudança apenas nesse campo; também amplia aliases de ordem/endereço/datas para paridade com D-0. Não sobrescreve `calls.status` por causa do novo campo OFS. Sete testes Google Drive/supervisor passaram. Nenhuma migration; testar no Drive ativo após deploy.

## 🔖 CHECKPOINT — 2026-10-01 — Paginação visual de chamados

`CallsPage` agora renderiza 100 linhas por página com intervalo, Anterior/Próxima e reset para página 1 ao mudar busca/filtros. A cópia PNG usa somente a página atual. Build frontend e teste browser passaram com 201 registros simulados (100/100/1); a busca filtrada mostrou 1 resultado. Nenhuma alteração de banco.

## 🔖 CHECKPOINT — 2026-10-01 — Paginação Supabase acima de 1.000

`listSupabaseCalls` agora busca páginas de 500 com ordenação estável; status, período e escopo de supervisor permanecem aplicados em todas as páginas. Corrige listas, dashboards e dedupe de importações que usam a função. Build backend passou; validação contra Supabase ativo ainda depende de deploy. Próximo passo: confirmar os 3.722 chamados após publicar. Nenhuma migration.

## 🔖 CHECKPOINT — 2026-10-01 — Importação histórica de chamados

O importador está implementado em **Importações**, mas nenhum chamado foi gravado: o workspace não tem conexão de produção e o runtime demo bloqueia confirmação. A prévia do XLSX atualizado mostrou 3.724 linhas, 3.722 candidatas, 0 já existentes no dataset demo, 2 linhas conflitantes da O.S. `602156053150102` (3332/3333; abertura/acionamento diferentes), nenhuma data/O.S. obrigatória ausente, 75 sem motivo e 211 sem OLT. Sete bairros ultrapassam `varchar(160)` e 14 Slot/PON ultrapassam `varchar(255)`; esses campos ficam vazios no registro estruturado e o texto original é mantido em notes. Quatro testes do parser e builds backend/frontend passaram. Publicar/configurar produção, revisar a exceção, conferir a deduplicação no banco ativo e só então confirmar.

O teste da rota usou a sessão e o dataset demo em memória; backend foi reiniciado depois e a base de teste foi descartada. Nenhuma alteração de banco/schema.

## 🔖 CHECKPOINT — 2026-09-30 — Segmentação Guarulhos/SP do OFS

O OFS flat é preservado como `records` opcional no JSON diário, sem migration. As linhas cruzam `Ordem de Serviço` com `calls.orderNumber` após normalização; região contendo Guarulhos vai para Guarulhos, demais/sem match vão para SP. Chaves duplicadas com Regiões conflitantes são consideradas sem match. O parser aceita `Tipo de Atividade2`. Build backend/frontend e teste browser passaram; teste comprovou 1 ordem em Guarulhos e 2 em SP, ambas não conciliadas. Teste local demo foi reiniciado para restaurar dados. Bases antigas sem `records` precisam ser reimportadas.

## 🔖 CHECKPOINT — 2026-09-30 — Alinhamento numérico das imagens

A regra do export que aplicava `text-align:right` a todas as células foi sobrescrita para centralizar cabeçalhos e valores métricos. Ordem/Técnico ficam à esquerda; Início/Tempo centralizados. Build passou e os estilos calculados foram verificados no navegador com base sintética, posteriormente removida.

## 🔖 CHECKPOINT — 2026-09-30 — PNG individual por card

O botão global `Copiar painel` foi substituído por três botões independentes nos cards de Atividades, Técnicos e Ordens. Cada botão captura somente seu card e atualiza seu próprio estado, com fallback para arquivo PNG específico. Build e cópia dos três PNGs passaram em navegador local; imagens testadas: atividades 3600 × 1404 px, técnicos 3600 × 4101 px, ordens 3000 × 1257 px. A base sintética foi removida.

Arquivos: [frontend/src/App.tsx](frontend/src/App.tsx), [frontend/src/manual-dashboard.css](frontend/src/manual-dashboard.css), [ROADMAP.md](ROADMAP.md).

## 🔖 CHECKPOINT — 2026-09-30 — Cards do Painel diário em largura total

As tabelas de atividades, técnicos e ordens agora aparecem empilhadas e ocupam a largura disponível; atividades e ordens usam altura do conteúdo, técnicos têm área rolável de 420 px. Fonte na tela: 13 px; no PNG compartilhável: 15 px em coluna única, resolução 3× sujeita ao orçamento de 40 MP. Build e browser desktop/mobile passaram com dados demo; a base foi limpa após o teste.

Arquivos: [frontend/src/App.tsx](frontend/src/App.tsx), [frontend/src/manual-dashboard.css](frontend/src/manual-dashboard.css), [ROADMAP.md](ROADMAP.md).

## 🔖 CHECKPOINT — 2026-09-30 — Painel diário legível

Implementado novo cabeçalho de status/data/arquivo, Atualizar, busca por técnico, cards de atividades/técnicos com altura equivalente e scroll interno, métricas coloridas, tabela de ordens com larguras proporcionais e badge de Tempo. PNGs usam escala dinâmica de até 3× limitada a 40 MP. Build passou; testes browser desktop/mobile confirmaram busca, scroll, composição e PNG 5520 × 4800 px. Base sintética removida. Não foi criada regra de atraso sem sinal explícito no conteúdo de origem.

Arquivos: [frontend/src/App.tsx](frontend/src/App.tsx), [frontend/src/main.tsx](frontend/src/main.tsx), [frontend/src/manual-dashboard.css](frontend/src/manual-dashboard.css), [ROADMAP.md](ROADMAP.md).

## 🔖 CHECKPOINT — 2026-09-30 — Legibilidade das imagens compartilháveis

Os dois fluxos de imagem existentes são tabela de chamados e Painel diário. A tabela usa composição PNG própria; o Painel diário agora exporta com largura de relatório, atividades/técnicos em duas colunas e ordens em largura total, com quebra de texto e sem ellipsis/scroll. Build/typecheck passaram e a composição foi copiada em teste browser com base sintética local, removida após o teste. Fallback de download permanece sem validação manual.

Arquivos: [frontend/src/App.tsx](frontend/src/App.tsx), [ROADMAP.md](ROADMAP.md).

## 🔖 CHECKPOINT — 2026-09-30 — Exportação PNG apresentável

`Copiar imagem` gera um PNG independente dos estilos da tela, com título, data, contagem, larguras por conteúdo, linhas alternadas e badges de status/prazo; inclui a badge PRAZO com limite. Build/typecheck passaram e a cópia foi confirmada no navegador local demo em memória. Fallback de download ainda não foi exercitado.

Arquivos: [frontend/src/App.tsx](frontend/src/App.tsx), [ROADMAP.md](ROADMAP.md).

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
