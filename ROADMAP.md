Última implementação: exclusão lógica de supervisores sem equipe, com proteção contra remoção quando há técnicos vinculados.
- [x] Administradores podem excluir supervisores vazios; equipes ocupadas retornam bloqueio explícito.
# ROADMAP DO PROJETO

## 1. VISÃO GERAL

O projeto JH RedeFlow é uma plataforma operacional para gestão de chamados, técnicos, supervisores, dashboards e integrações do time de operação. O objetivo principal é centralizar a visão de produção, o controle de filas e a operação de campo em um ambiente com autenticação, permissões e métricas executivas.

Principais usuários: operadores, supervisores, administradores, mesários e usuários de visualização. As principais tecnologias do projeto são TypeScript, Express, Vite, PostgreSQL/Supabase e integrações com WuzAPI, Google Drive e importações CSV/XLSX. A arquitetura é separada em frontend, backend e banco, com backend responsável por todas as regras de negócio, autenticação, permissões, validação e integrações.

---

## 2. ESTADO ATUAL

Status geral: EM DESENVOLVIMENTO

Última atualização: 2026-11-03

Última implementação: P0/P1 da auditoria — "Apagar todos os chamados" movido para Configurações (zona de perigo), datas no fuso America/Sao_Paulo, consultas mais leves em finalizar/cancelar/reabrir, dashboard e notificações, correção do escopo de supervisor no Supabase e guardas de rota no frontend. Ver "2026-11-03 — P0/P1 da auditoria" no fim do arquivo.
Agente responsável pela última alteração: Claude Code (Opus 5.5)

Próxima ação: acionamentos (2026-11-03) — cards fora do padrão normalizados, diagnóstico de grupos (`GET /api/integrations/wuzapi/grupos`) e N+1 removido. Próximo: corrigir `WUZAPI_ACTIVATION_GROUP_ID` com o ID atual do grupo e conferir a sessão/webhook da WuzAPI; depois, extensão da Rede na máquina coletora.

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
- Sincronização Drive: execução manual/agendada roda como job no backend; `POST` retorna 202 e status/resultado é consultado por ID; apenas um job pode rodar por instância.
- Regiões por OLT: mapa padrão no código com overrides persistidos em `olt_region_overrides`, carregados no boot e editáveis por usuários com `settings.manage`.
- Técnicos: `employment_status` registra Trabalhando/Demitido independentemente de `active` e `current_status`; `active` continua representando disponibilidade pela escala/sobrescrita operacional.
- Supervisores: exclusão lógica disponível para equipes vazias; a API impede excluir supervisor com técnicos ativos no cadastro.
- Fotos de perfil: armazenadas por usuário em tabela dedicada; não são incluídas na listagem administrativa de contas.
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

### Sincronização Google Drive assíncrona — implementada em 2026-10-02

- a rota manual responde `202 Accepted` com ID em vez de manter a conexão HTTP aberta durante a leitura dos arquivos;
- `GET /api/integrations/google-drive/sync/:jobId` expõe `running`, `completed` ou `failed`, resultado agregado e mensagem de erro; jobs recentes ficam em memória, limitados a 20;
- botão Importações inicia o job e consulta o estado a cada 2 segundos; ao terminar, mostra o resumo e invalida cache dos chamados;
- botão manual e agenda diária usam o mesmo runner; a instância evita sincronizações simultâneas;
- matching trocou buscas lineares para cada linha por índices em `Map` de identificadores e posições, evitando varrer todo o histórico para cada linha importada.

Arquivos alterados: [backend/src/server.ts](backend/src/server.ts), [backend/src/integrations/google-drive.ts](backend/src/integrations/google-drive.ts), [backend/test/http.test.ts](backend/test/http.test.ts), [frontend/src/api.ts](frontend/src/api.ts), [frontend/src/App.tsx](frontend/src/App.tsx) e [ROADMAP.md](ROADMAP.md).

Validação: teste HTTP do job passou; suíte de integração Drive passou (17/17); build frontend e typecheck backend passaram. Healthcheck Render estava 200 antes da alteração; a sincronização real não foi iniciada durante o diagnóstico.

### Foto de perfil por usuário — implementada em 2026-10-02

- usuário seleciona imagem ao clicar no avatar da sidebar ou do topo; navegador reduz a imagem para até 256×256 JPEG antes do envio;
- API autenticada permite ler, salvar, substituir e remover somente a foto da sessão atual; aceita JPEG/PNG/WebP compactado com limite de 350 KB;
- dados são persistidos em `user_avatars`, isolados da listagem de usuários, no modo demo, PostgreSQL local e Supabase;
- migrations criadas: `database/migrations/020_user_avatars.sql` e `supabase/migrations/202610020005_user_avatars.sql`; ainda precisam ser aplicadas ao banco antes de publicar o backend.

Arquivos alterados: [backend/src/store.ts](backend/src/store.ts), [backend/src/server.ts](backend/src/server.ts), [backend/src/integrations/supabase/client.ts](backend/src/integrations/supabase/client.ts), [backend/test/http.test.ts](backend/test/http.test.ts), [database/migrations/020_user_avatars.sql](database/migrations/020_user_avatars.sql), [supabase/migrations/202610020005_user_avatars.sql](supabase/migrations/202610020005_user_avatars.sql), [frontend/src/api.ts](frontend/src/api.ts), [frontend/src/App.tsx](frontend/src/App.tsx), [frontend/src/main.tsx](frontend/src/main.tsx) e [frontend/src/profile-photo.css](frontend/src/profile-photo.css).

Validação: teste HTTP de persistência/autorização/validação passou; build frontend e typecheck backend passaram. Migrations ainda não executadas.

### CORS do login no domínio Vercel — implementado em 2026-10-02

- a API inclui `https://jh-rede.vercel.app` na allowlist CORS mesmo quando `CORS_ORIGINS` não está configurado; origens adicionais continuam aceitas pela variável de ambiente;
- `render.yaml` define o domínio Vercel como `CORS_ORIGINS` e o README documenta como adicionar domínios alternativos;
- teste HTTP cobre o preflight `OPTIONS` de `/api/auth/login` e valida `Access-Control-Allow-Origin` e o método `POST`.
- no build de produção hospedado em `*.vercel.app`, o frontend agora usa URLs relativas e passa pela rewrite `/api/*` já configurada nos arquivos Vercel; isso remove CORS do browser mesmo quando a API está em outro host;
- respostas `502` da API continuam sendo indisponibilidade/upstream do Render e exigem verificar o healthcheck/logs do serviço após publicar.

Arquivos alterados: [backend/src/server.ts](backend/src/server.ts), [backend/test/http.test.ts](backend/test/http.test.ts), [render.yaml](render.yaml), [README.md](README.md), [frontend/src/api.ts](frontend/src/api.ts) e [ROADMAP.md](ROADMAP.md).

Validação: build frontend passou; suíte HTTP reportou 30/30 testes aprovados e os diagnósticos dos arquivos alterados não apontam erros; o shell misturou a saída do typecheck com comandos anteriores, então o typecheck não foi confirmado isoladamente. Deploy Vercel/Render ainda precisa receber esta alteração.

### Diagnóstico da falha POST de sincronização Drive — implementado em 2026-10-02

- o healthcheck público do Render respondeu 200 e o preflight OPTIONS da rota de sincronização através do proxy Vercel respondeu 204 com `Access-Control-Allow-Origin`; o erro atual não é CORS nem indisponibilidade geral;
- a API agora escreve exceções da sincronização manual nos logs do Render e devolve mensagens de erro não-Error quando disponíveis; o frontend exibe status HTTP em respostas sem mensagem;
- nenhum POST de sincronização foi executado nesta verificação para evitar atualizações de dados operacionais sem confirmação;
- após publicar esta instrumentação, executar a sincronização e usar a mensagem detalhada ou os logs do Render para identificar falha de credencial/permissão/Drive.

Arquivos alterados: [frontend/src/api.ts](frontend/src/api.ts), [backend/src/server.ts](backend/src/server.ts) e [ROADMAP.md](ROADMAP.md).

Validação: build frontend e typecheck backend passaram; healthcheck 200 e preflight do proxy 204.

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

## FASE 2 — HOMOLOGAÇÃO DE LEITURA E NAVEGAÇÃO EM PRODUÇÃO — 2026-11-03

Status: APROVADA.

Foi realizada uma homologação controlada do ambiente público de produção, sem executar operações destrutivas ou mutations sobre dados reais.

### Resultados confirmados

- Frontend público operacional.
- Backend público operacional.
- Supabase respondendo corretamente.
- CORS/proxy funcionando.
- Login com usuário real concluído.
- Sessão autenticada funcional.
- Navegação entre módulos funcionando.
- Interface carregando sem erros críticos de renderização ou requisições.
- Módulos acessíveis: Visão geral, Importações, Supervisores, Configurações, Usuários, Cargos e permissões, Técnicos, Repetidos, Acionamentos, Painel diário, IGP e Chamados abertos.

### Segurança

- Nenhum dado real foi alterado.
- Nenhuma mutation em produção foi executada.
- Nenhuma falha crítica foi observada.
- Indicadores vazios ou zerados foram observados em um ambiente praticamente sem registros operacionais, não sendo considerados evidência de erro.

### Pendências

- Ambiente isolado para testes com mutations e dados sintéticos.
- Validação aprofundada das regras de negócio.
- Validação de indicadores com massa de dados conhecida.
- Homologação de fluxos de escrita, edição, finalização, cancelamento e importação.
- Verificação de schema e dados internos do Supabase, caso autorizada.

### Próxima etapa

FASE 2.1 — HOMOLOGAÇÃO FUNCIONAL COM MUTATIONS CONTROLADAS.

Não foi declarada a aplicação integralmente homologada. A aprovação atual é restrita à infraestrutura, autenticação, navegação e verificações de leitura em produção.

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

## FASE 1 — AUDITORIA E HOMOLOGAÇÃO DO AMBIENTE DE PRODUÇÃO — 2026-11-03

### 1. Data da auditoria
2026-11-03.

### 2. Ambientes identificados
- Frontend local: Vite/React em [frontend](frontend).
- Backend local: Express/TypeScript em [backend](backend).
- Deploy de produção: identificados os serviços esperados em [render.yaml](render.yaml) e [vercel.json](vercel.json), mas não houve acesso autorizado aos ambientes públicos nem às credenciais do provedor.
- Banco: Supabase/PostgreSQL configurado de forma opcional; o backend usa `REDEFLOW_RUNTIME`, `SUPABASE_*` e `DATABASE_URL` conforme pontos de decisão no código e no README.

### 3. Estado do frontend
- Status: VALIDADO localmente para build; NÃO VALIDADO em produção.
- Evidências: `npm run build` no repositório executou com sucesso, gerando assets do Vite; o frontend usa proxy `/api/*` em [vercel.json](vercel.json) e lógica de API em [frontend/src/api.ts](frontend/src/api.ts).
- Conclusão: a configuração do frontend para build e roteamento está coerente com o uso em Vercel + Render; não foi possível confirmar a instância pública real de produção sem acesso autorizado.

### 4. Estado do backend
- Status: VALIDADO localmente para build e para fluxo crítico de autenticação; NÃO VALIDADO em produção.
- Evidências: build do backend passou, health/login/avatar/CORS foram validados em testes HTTP locais em [backend/test/http.test.ts](backend/test/http.test.ts); a API usa JWT e proteção por RBAC em [backend/src/server.ts](backend/src/server.ts).
- Limitação: o endpoint de produção não foi acessado porque não há URL pública/credenciais autorizadas disponíveis no ambiente atual.

### 5. Estado do Supabase
- Status: NÃO VALIDADO em produção.
- Evidências: o projeto integra Supabase de forma condicional em [backend/src/integrations/supabase/client.ts](backend/src/integrations/supabase/client.ts), com fallback local e variável de ambiente obrigatória quando o runtime usa Supabase; as migrations de schema aparecem em [supabase/migrations](supabase/migrations).
- Risco: existe possibilidade de fallback local/acidental em produção se a configuração do ambiente não for controlada com precisão; isso precisa ser confirmado no provedor real.

### 6. Situação das migrations
- Status: PARCIAL / NÃO VALIDADO em produção.
- Evidências: os scripts de schema em [database/migrations](database/migrations) e [supabase/migrations](supabase/migrations) estão presentes; o ROADMAP registra que algumas migrações precisam ser aplicadas antes de certos recursos (ex.: emprego/OLT/D-0/anexos).
- Regra cumprida: não foi executada nenhuma migration, conforme exigência desta etapa.

### 7. Estado de autenticação
- Status: VALIDADO localmente para fluxo principal.
- Evidências: login, JWT, senha inicial obrigatória e sessão autenticada foram exercitados em testes em [backend/test/http.test.ts](backend/test/http.test.ts), e a validação de token e middlewares aparecem em [backend/src/server.ts](backend/src/server.ts).
- Limitação: não houve confirmação de login em produção com usuários reais.

### 8. Estado de permissões
- Status: VALIDADO localmente para regras de acesso relevantes.
- Evidências: permissões e proteção por `requirePermission` em [backend/src/server.ts](backend/src/server.ts); testes de supervisor/role e acesso em [backend/test/http.test.ts](backend/test/http.test.ts) e [backend/test/supervisor-scoping.test.ts](backend/test/supervisor-scoping.test.ts).
- Limitação: a produção real ainda precisa ser conferida com perfis e usuários do ambiente end-to-end.

### 9. Estado do deploy
- Status: NÃO VALIDADO em produção.
- Evidências: [render.yaml](render.yaml) e [vercel.json](vercel.json) configuram os serviços; [README.md](README.md) documenta a arquitetura esperada. Não houve acesso autorizado ao provedor para verificar a instância realmente publicada.

### 10. Resultado dos testes
- `npm run build` no repositório: ✅ aprovado.
- `npm run test --workspace backend` executou em ambiente local com validações focadas relevantes, e a suíte de HTTP/segurança passou quando executada em subset específico do arquivo de teste principal.
- Observação: a validação de produção não foi possível porque não há URL/credenciais autorizadas para o ambiente publicado.

### 11. Problemas identificados
- Crítico: ausência de evidência de ambiente de produção acessível e validado.
- Alto: risco de fallback local/ambiente incorreto caso as variáveis do provedor não estejam alinhadas com a configuração do runtime.
- Médio: necessidade de ausência de verificação real do Supabase em produção e das migrations aplicadas no schema remoto.
- Baixo: bundle do frontend maior que 500 kB, com warning de chunk size, apesar do build continuar funcionando.

### 12. Riscos
- produção usando backend errado ou Supabase não correspondente ao ambiente esperado;
- login/RBAC funcionando localmente, mas não em produção;
- CORS prod/incorreto ou origem não autorizada;
- healthcheck sem confirmação real de dependências críticas em produção;
- divergência de schema entre código e banco remoto.

### 13. Itens validados
- [x] build local de frontend e backend;
- [x] autenticação JWT e password-change local;
- [x] CORS / preflight local em testes HTTP;
- [x] healthcheck local em testes HTTP;
- [x] proteção básica de rotas e RBAC em código/testes locais;
- [x] estrutura de provider/ambiente e fallback configurado.

### 14. Itens não validados
- [ ] frontend publicado em produção;
- [ ] backend publicado em produção;
- [ ] comunicação frontend/backend em produção;
- [ ] Supabase de produção conectado e schema real validado;
- [ ] migrations aplicadas no ambiente remoto;
- [ ] login com usuário real em produção;
- [ ] CORS em produção;
- [ ] healthcheck remoto e logs reais;
- [ ] homologação funcional com dados reais.

### 15. Dependências de acesso externo
- acesso ao provedor de hospedagem (Render/Vercel);
- acesso ao projeto do Supabase/ Postgres;
- credenciais de autenticação e variáveis de ambiente do ambiente publicado;
- acesso ao domínio/rota pública do frontend e do backend.

### 16. Próximas ações
1. confirmar as URLs reais de frontend/backend em produção;
2. validar `GET /health` e `GET /health/supabase` no ambiente publicado;
3. confirmar `CORS_ORIGINS` e `VITE_API_URL` no provedor correto;
4. comparar o schema real do Supabase com as migrations disponíveis;
5. validar login e RBAC com usuários reais, sem tocar em permissões ou senhas;
6. só então iniciar a homologação funcional com dados reais.

### Checklist de homologação
- [x] Frontend de produção identificado e acessível no código: NÃO VALIDADO em produção.
- [x] Backend de produção identificado e acessível no código: NÃO VALIDADO em produção.
- [x] Comunicação frontend/backend validada no código: SIM no ambiente local, NÃO CONFIRMADA em produção.
- [x] CORS validado no código/testes: SIM localmente; NÃO CONFIRMADO em produção.
- [x] Healthcheck validado localmente: SIM.
- [x] Build de produção aprovado: SIM.
- [x] Testes críticos aprovados: SIM em subset relevante local.
- [ ] Conexão com Supabase confirmada: NÃO VALIDADA.
- [ ] Ambiente de banco identificado: PARCIAL, sem acesso ao ambiente real.
- [ ] Histórico de migrations conferido: PARCIAL, sem acesso ao ambiente real.
- [ ] Schema de produção comparado com o esperado: NÃO VALIDADO.
- [x] Autenticação validada localmente: SIM.
- [x] RBAC validado localmente: SIM.
- [ ] Variáveis obrigatórias conferidas sem exposição de segredos: PARCIAL, sem acesso ao provedor real.
- [ ] Fallbacks de desenvolvimento investigados em produção: NÃO VALIDADO.
- [ ] Ausência de erros críticos de inicialização em produção: NÃO VALIDADA.
- [ ] Pendências documentadas: SIM.

Conclusão desta etapa: o projeto está tecnicamente coerente em código, compila e possui validações de segurança e autenticação no ambiente local; porém ainda NÃO está preparado para iniciar homologação funcional com dados reais sem confirmar a infraestrutura e o banco de produção.

## FASE 2 — VALIDAÇÃO FUNCIONAL DO AMBIENTE PUBLICADO — 2026-11-03

### 1. Objetivo
Confirmar, com evidências públicas e sem manipulação de dados sensíveis, que o frontend e o backend publicados estão online, se comunicam e respondem corretamente aos endpoints essenciais.

### 2. Verificações executadas
- `https://jh-rede.vercel.app` retornou `HTTP/1.1 200 OK` e o HTML do app com o título `JH Telecom - Rede`.
- `https://jh-redeflow-api.onrender.com/health` retornou `HTTP/1.1 200 OK` com JSON `{"status":"ok","service":"jh-redeflow-api"}`.
- `https://jh-redeflow-api.onrender.com/health/supabase` retornou `HTTP/1.1 200 OK` com JSON `{"configured":true,"connected":true}`.
- O `OPTIONS` para o endpoint de backend retornou `HTTP/1.1 204 No Content` com `access-control-allow-origin: https://jh-rede.vercel.app` e `access-control-allow-methods: GET,HEAD,PUT,PATCH,POST,DELETE`.
- A rota pública `POST /api/auth/login` respondeu `HTTP/1.1 400 Bad Request` com a mensagem `Informe e-mail e senha validos.` quando recebeu payload vazio, comprovando que a rota existe e está exposta sem fornecer acesso privilegiado.

### 3. Estado do frontend publicado
- Status: VALIDADO.
- Evidência: o Vercel respondeu com 200 e carregou o HTML do app.
- Observação: não foi testado login real nem operações autenticadas, por exigência de não usar credenciais sem autorização.

### 4. Estado do backend publicado
- Status: VALIDADO.
- Evidência: `GET /health` respondeu com 200 e `GET /health/supabase` confirmou conexão ativa.
- Observação: a checagem de login com conta real ainda precisa ser executada pela pessoa autorizada, mas a rota pública existe e responde corretamente aos erros de validação.

### 5. Estado da comunicação frontend/backend
- Status: VALIDADO.
- Evidência: o frontend em Vercel respondeu com 200; o backend expôs CORS apropriado para a origem do frontend; o `OPTIONS` do backend confirmou a origem autorizada.

### 6. Estado do Supabase
- Status: VALIDADO no sentido de infraestrutura pública.
- Evidência: `health/supabase` retornou `configured: true` e `connected: true`.
- Limitação: não foi possível verificar schema interno, migrações aplicadas nem usuários reais sem acesso administrativo autorizado ao console do provedor.

### 7. Estado da autenticação em produção
- Status: PARCIALMENTE VALIDADO.
- Evidência: a rota de autenticação pública existe e rejeita payload inválido com `400`.
- Falta: validação com usuário real, token JWT e RBAC em ambiente publicado.

### 8. Conclusão da Fase 2
A infraestrutura pública do JH RedeFlow está online e coerente: frontend no Vercel, backend no Render e conexão ativa com o Supabase. A comunicação entre frontend/backend e o CORS estão funcionando conforme o esperado em produção pública.

O que ainda não pode ser afirmado como concluído sem autorização de acesso real é a autenticação com contas do ambiente de produção, RBAC com usuários reais e a verificação do schema interno do banco em produção. Em termos de readiness técnico para homologação funcional, o sistema está em condição adequada para a próxima etapa de testes com usuários autorizados e dados reais.

### 9. Próxima ação recomendada
Executar a homologação funcional com usuários reais autorizados, cobrindo:
1. login com conta válida;
2. troca de senha inicial;
3. carregamento de dashboard e rotas protegidas;
4. verificação de permissões por perfil;
5. validação de chamadas, supervisores e técnicos em produção real;
6. comparação final do schema e migrations do Supabase remoto.

### Checklist final da Fase 2
- [x] Frontend público acessível e retornando HTML válido.
- [x] Backend público acessível no endpoint de saúde.
- [x] Supabase publicamente reportando conexão ativa.
- [x] CORS do backend validado para a origem do frontend.
- [x] Rotas de autenticação expostas e respondendo corretamente.
- [ ] Login com usuário real em produção realizado por conta autorizada.
- [ ] RBAC real em produção validado com usuários autorizados.
- [ ] Schema e migrations do banco de produção conferidos no console Supabase.

---

## ETAPA 1 — IMERSÃO E AUDITORIA TÉCNICA/VISUAL — 2026-11-03

Agente: Claude Code (Opus 5.5). Escopo: somente leitura. Nenhum código, migration, tabela, política RLS, dado do Supabase, variável de ambiente ou deploy foi alterado. A única alteração foi esta seção. O app foi executado apenas localmente em modo demo em memória (sem `.env`, Supabase ou banco) para a inspeção visual; os servidores foram encerrados ao final.

### Estado do Git na auditoria

- Branch ativa `main`, sincronizada com `origin/main`, árvore limpa (sem alterações locais). Branch adicional: `atts` (local e remota).
- Último commit: `bf610b9 Fix loading`.

### Arquitetura identificada

- Monorepo npm workspaces: `frontend` (React 19 + Vite 6 + React Router 7, TypeScript estrito) e `backend` (Express 5 + TypeScript via `tsx`/`tsc`, Zod, JWT, bcryptjs, pg, `@supabase/supabase-js`, googleapis, xlsx).
- Deploy: frontend no Vercel (`/api` reescrito para o Render via `vercel.json`); backend no Render (`render.yaml`); banco PostgreSQL no Supabase.
- Três runtimes de dados implementados lado a lado em cada função de `backend/src/store.ts` (2.040 linhas): Supabase (service role), PostgreSQL local (`pg`, `REDEFLOW_RUNTIME=local`) e memória/demo (`REDEFLOW_DEMO_DATA=true`).
- O frontend nunca acessa o Supabase diretamente; tudo passa pela API (`frontend/src/api.ts`, `fetch` + Bearer JWT em `localStorage`).
- Autenticação: login no Supabase Auth (ou bcrypt local) → backend emite JWT próprio (8h). Cada requisição revalida o perfil (`profiles` + cargo + permissões) no banco.
- Autorização: RBAC por código de permissão (`requirePermission`) com 27 permissões e 5 cargos (Administrador, Operador, Supervisor, Mesário, Visualização). Escopo de supervisor por `supervisor_id` do técnico, aplicado quando `teamScope=true` e sempre no IGP.
- RLS habilitado em todas as tabelas; o backend usa service role (bypass de RLS). Policies `select using (true)` para `authenticated` em calls/técnicos/supervisores/observações/logs.
- Paginação de chamados no servidor via RPC `list_calls_page_with_atrelada` (Supabase e PG local); cache de páginas no cliente por 30s.
- Integrações: WuzAPI (webhook com token + filtro de grupo + Gemini opcional para classificação), Google Drive (sync D-1 como job assíncrono em memória, agendável), importações CSV/XLSX (D-0, chamados atuais, acionamentos históricos, painel diário).
- Estado de jobs, prévias de importação, deduplicação de webhook e rate limit de login ficam em memória do processo (perdidos em restart; não escalam para múltiplas instâncias).

### Módulos analisados

Visão geral, Chamados abertos, Em atendimento, Finalizados e cancelados, Detalhe do chamado (observações com anexos, auditoria, finalizar/cancelar/reabrir), Repetidos, Ordens da equipe (supervisor), Acionamentos, Painel diário, IGP, Importações, Técnicos, Supervisores, Usuários, Cargos e permissões, Configurações (OLT→Região, solicitações de OLT, regiões).

### Regras de negócio relevantes confirmadas no código

- Status de chamado: Aberto, Atribuído, Deslocamento, Em campo, Finalizado, Cancelado, Baixar. Terminais: Finalizado, Cancelado, Baixar.
- Finalizar exige técnico, motivo, resultado, data de execução e observação. Cancelar exige motivo (≥3 caracteres). Reabrir só a partir de status terminal.
- Atribuição só para técnicos `Tecnico` (não Auxiliar), ativos e não Demitidos. "Ativo" considera turno do técnico e sobrescrita manual.
- Supervisor só pode ser excluído (lógico) sem técnicos vinculados (409).
- Região do chamado é derivada da OLT (mapa padrão + overrides); OLT desconhecida gera solicitação em Configurações.
- **Divergência de SLA (não alterada, requer decisão do responsável):** o código usa **até 8h = No prazo, >8h até 10h = Fora do prazo, >10h = Outlier** (frontend `SlaCell`/`SlaDurationCell`/`TimerCell` em `App.tsx` e backend `igp.ts`; rótulo "Limite 08:00"). A regra informada pelo responsável e documentada no legado (`docs/appscript-integration-map.md`, indicador JH4) é **até 6h = PRAZO, >6h até 9h = FORA DO PRAZO, >9h = OUTLIER**. O registro de 2026-09-24 neste roadmap documenta 8h/10h. É preciso confirmar se são indicadores diferentes (ex.: GIGA × JH) ou se o código está incorreto.
- **Decisão do responsável (2026-11-03): a regra correta é 6h/9h** — até 6h = PRAZO; acima de 6h até 9h = FORA DO PRAZO; acima de 9h = OUTLIER. A regra 8h/10h do código (e do registro de 2026-09-24) está incorreta. Correção implementada em 2026-11-03 (ver "Correção da regra de SLA 6h/9h" abaixo). Pontos que foram corrigidos: `SlaCell`, `SlaDurationCell` e `TimerCell` em `frontend/src/App.tsx` (limites 480/600 min e rótulo "Limite 08:00"), texto da metodologia do IGP em `App.tsx` ("Outlier: reparo acima de 10h · Prazo: reparo até 8h"), `calculateIgpMetrics` em `backend/src/igp.ts` (`> 10` / `<= 8`) e os testes de IGP que fixam esses limites. `slaAlertHours: 8` em Configurações é um alerta operacional separado e não foi incluído na decisão.

### Problemas identificados (por gravidade)

🔴 Crítico / alto
1. Regra de SLA divergente (acima).
2. `finishSupabaseCall`, `cancelSupabaseCall` e `reopenSupabaseCall` chamam `listSupabaseCalls()` sem filtro duas vezes por ação: carregam a tabela inteira de chamados (com observações) para alterar um registro. Degrada com o volume histórico.
3. Dashboard (`getDashboardMetrics`) e notificações (`listNotifications`) carregam todos os chamados; notificações são consultadas a cada 15s por usuário logado (intervalo reiniciado a cada troca de rota).
4. Fuso horário: filtros de período no Supabase usam meia-noite UTC (`T00:00:00Z`) e "Recebidos hoje"/data padrão do painel diário usam `toISOString()` (UTC). Chamados abertos entre 21h e 23h59 (BRT) caem no dia seguinte.
5. Dependência `xlsx@0.18.5` (npm) com vulnerabilidades conhecidas (prototype pollution / ReDoS), usada para processar planilhas enviadas por usuários no backend.
6. Ação "Apagar todos os chamados" exibida no cabeçalho das telas operacionais de chamados (e como primeiro botão no mobile), para quem tem `calls.delete` (Administrador). Risco operacional alto de clique acidental.

🟠 Médio
7. `store.ts` triplica cada regra (Supabase/PG/memória) com divergências: `reopenCall` não tem caminho PG local (cai no mapa em memória); a lógica de `assigned_at` difere entre runtimes (Supabase redefine `assigned_at` a cada reatribuição); `listCalls` no Supabase filtra supervisor também usando os mapas de memória (vazios em produção).
8. `PATCH /api/chamados/:id` e `GET /api/chamados/:id/logs` não aplicam escopo de supervisor (baixo impacto hoje porque Supervisor não tem `calls.edit`/`calls.view_logs` por padrão, mas um cargo customizado abriria a brecha).
9. Rotas do frontend sem guarda de permissão (a navegação direta por URL renderiza a tela e só falha na API).
10. JWT em `localStorage` sem CSP; anexos e avatares armazenados em base64 no Postgres (crescimento do banco e payloads grandes).
11. Estado em memória (jobs Drive, prévias, dedupe WuzAPI, rate limit) é perdido em restart do Render.
12. Teste HTTP `healthcheck exposes security headers` falhou de forma intermitente na 1ª execução e passou na 2ª (95/95). Provável sensibilidade ao tempo de boot do servidor de teste.
13. Repetidos baixa todas as páginas de chamados no cliente para calcular o relatório.
14. `GEMINI_API_KEY`/`GEMINI_MODEL`, `GOOGLE_DRIVE_*` e variáveis auxiliares `WUZAPI_*` não estão listadas na seção 11 deste roadmap.

🟡 Qualidade / UX
15. `frontend/src/App.tsx` com 4.005 linhas, ~180 `useState`, todas as telas, parsers de planilha e exportação PNG no mesmo arquivo; bundle único >500 kB (xlsx + html2canvas carregados na entrada).
16. 27 arquivos CSS globais importados em cascata, vários com sufixo `-overrides`, CSS minificado à mão em linha única, 34 `!important`, cores hard-coded fora dos tokens (`--blue`, `--ink` etc.), sem escala de espaçamento/tipografia.
17. Textos sem acentuação em boa parte da UI ("Visao geral", "Tecnicos", "Distribuicao", "Regioes", "Configuracoes"), misturados com textos acentuados.
18. Ícones repetidos e pouco semânticos: o mesmo ícone de prancheta em todos os KPIs e em Chamados/Acionamentos/Importações; o mesmo ícone de barras para Painel diário e IGP.
19. Hierarquia de botões inconsistente (CTA primário grande em Técnicos; "Aceitar todos" pequeno e pálido em Acionamentos; ação destrutiva com mais destaque que "Atualizar").
20. Elementos decorativos sem função: "Central de ajuda" e seletor "Operacao Rede" na sidebar.
21. Tabelas operacionais dependem de rolagem horizontal no mobile, sem layout em cartões; títulos quebram em duas linhas em larguras médias.
22. Acessibilidade: poucos atributos ARIA (26 no App), botões só-ícone dependem de `title`, cor de status como principal sinal, uso de `window.confirm` (8) em vez de modais acessíveis.
23. Estados de carregamento/vazio/erro implementados de forma ad hoc por tela, com textos e estilos diferentes.
24. ROADMAP com duas linhas soltas antes do título (linhas 1–2) e seções numeradas fora de ordem (FASE 1/FASE 2 após a seção 15).

### Melhorias recomendadas e prioridades sugeridas

P0 — decisões e riscos (antes de qualquer refatoração)
- Confirmar a regra de SLA (6h/9h × 8h/10h) e onde cada uma se aplica; depois centralizar os limites em um único módulo compartilhado e coberto por testes.
- Retirar "Apagar todos os chamados" das telas operacionais (mover para Configurações/zona de perigo com confirmação digitada).
- Corrigir fuso horário (America/Sao_Paulo) nos filtros, em "Recebidos hoje" e na data do painel diário.

P1 — desempenho e segurança
- Trocar `listSupabaseCalls()` sem filtro por consulta por ID em finalizar/cancelar/reabrir.
- Dashboard e notificações por agregação SQL/RPC (contagens) em vez de carregar todos os chamados; reduzir o polling.
- Substituir `xlsx@0.18.5` pela distribuição oficial atualizada do SheetJS ou alternativa; limitar tamanho/linhas.
- Aplicar escopo de supervisor em todas as rotas de chamado; guardas de rota no frontend.

P2 — organização do código
- Separar `store.ts` em repositórios por entidade com uma interface única por runtime (ou aposentar o runtime PG local, se não for mais usado).
- Quebrar `App.tsx` em `pages/`, `components/`, `hooks/`, `lib/` sem alterar comportamento; lazy-load de xlsx/html2canvas.

P3 — modernização visual (identidade própria)
- Design system em tokens (cor, tipografia, espaçamento, raio, sombra, estados de SLA) num único arquivo, com componentes base (Button, Card, KPI, Table, Badge de status/SLA, Modal, Empty/Loading/Error, Filtros).
- Revisão de textos com acentuação, ícones semânticos por módulo, hierarquia de ações, tabelas responsivas e acessibilidade (foco, ARIA, contraste).

### Próximas etapas

1. Aguardar validação desta auditoria e autorização do responsável.
2. Obter decisão sobre a regra de SLA.
3. Executar P0 → P1 → P2 → P3, cada etapa registrada neste roadmap com testes (`npm run typecheck`, `npm test --workspace backend`, build do frontend).

### Testes executados nesta auditoria

- `npm run typecheck` (frontend + backend): ✅ sem erros.
- `npm test --workspace backend` (em memória): 1ª execução 94/95 (falha intermitente no healthcheck); 2ª execução ✅ 95/95.

---

## 2026-11-03 — Correção da regra de SLA 6h/9h (P0)

### Objetivo
Aplicar a regra operacional confirmada pelo responsável: até 6h = PRAZO; acima de 6h até 9h = FORA DO PRAZO; acima de 9h = OUTLIER. Substitui a regra 8h/10h registrada em 2026-09-24, que estava incorreta.

### Alterações realizadas
- `backend/src/igp.ts`: novas constantes exportadas `SLA_ON_TIME_MAX_HOURS = 6` e `SLA_OUTLIER_AFTER_HOURS = 9`; `calculateIgpMetrics` passou a usá-las (antes `<= 8` e `> 10`).
- `frontend/src/App.tsx`: constantes `SLA_ON_TIME_MAX_MINUTES` (360), `SLA_OUTLIER_AFTER_MINUTES` (540), `SLA_LIMIT_LABEL` ("Limite 06:00") e função `getSlaState`, usada por `SlaCell`, `SlaDurationCell` e `TimerCell` (antes 480/600 min repetidos três vezes). O texto de metodologia do IGP agora descreve 6h/9h. A cópia TSV/PNG herda o novo rótulo via `data-prazo`.
- `backend/test/supervisor-scoping.test.ts`: fixture "access-on-time" ajustada de 8h para 6h (MTTR esperado 8,5h no acesso e 26/3 no total) e novo teste de fronteira (6h = PRAZO, 6h01 = FORA DO PRAZO, 9h = FORA DO PRAZO, 9h01 = OUTLIER).

### Não alterado
- `slaAlertHours: 8` (alerta operacional de Configurações) — fora do escopo da decisão.
- Metas exibidas no IGP (Prazo 89% / mínimo 85%; Outlier 4,90% / limite 5,20%).
- Banco, migrations, APIs e permissões.

### Impacto esperado
O IGP é recalculado a cada consulta: os percentuais de Prazo e Outlier de todos os meses, inclusive os já fechados, ficam mais rigorosos após o deploy. As badges das filas mudam de cor mais cedo.

### Testes
- `npm run typecheck` (frontend + backend): ✅.
- `npm test --workspace backend`: ✅ 96/96.
- `vite build` do frontend: ✅ (mantém o aviso existente de bundle > 500 kB).
- Validação visual no ambiente publicado: pendente (requer deploy).

### Próxima ação
Revisar e commitar; após deploy, conferir badges das filas e um mês do IGP. Depois seguir para os demais itens P0 da auditoria (retirar "Apagar todos os chamados" das telas operacionais; corrigir fuso horário America/Sao_Paulo), mediante autorização.

---

## 2026-11-03 — P0/P1 da auditoria

Autorizado pelo responsável ("pode prosseguir com o seu plano de alterações"). Regras de negócio preservadas; nenhuma migration foi aplicada e nenhum dado de produção foi tocado.

### 1. "Apagar todos os chamados" fora das telas operacionais (P0)
- Removido o botão do cabeçalho de Chamados abertos / Em atendimento / Finalizados (e o `window.prompt`).
- Nova seção "Zona de perigo" no fim de Configurações, visível só com `calls.delete`: campo de confirmação que exige digitar `APAGAR TODOS`, botão desabilitado até a frase bater, mensagens com `role="status"`/`role="alert"`.
- API `DELETE /api/chamados` e permissão inalteradas.

### 2. Fuso horário America/Sao_Paulo (P0)
- Novo `backend/src/timezone.ts` (`toOperationalDate`, `operationalDayStartIso`, `addDays`) e `frontend/src/dates.ts` (`toOperationalDate`).
- Backend: limites de período no Supabase (`listSupabaseCalls`) passam a ser meia-noite de São Paulo; data de referência dos filtros em memória, "Recebidos hoje", data padrão do Painel diário e mês do IGP usam a data de São Paulo; consulta PG local usa `AT TIME ZONE 'America/Sao_Paulo'`.
- Frontend: mês padrão do IGP, gráfico diário da Visão geral e filtro de período de Repetidos usam a data de São Paulo.
- **Migration nova, NÃO aplicada:** `supabase/migrations/202611030001_calls_page_sao_paulo_dates.sql` e `database/migrations/021_calls_page_sao_paulo_dates.sql` recriam `list_calls_page_with_assignment` (usada por `list_calls_page_with_atrelada`) com a mesma lógica, trocando apenas a conversão de data para o fuso de São Paulo. Até ser aplicada, a listagem paginada continua usando a data UTC nos filtros de período.

### 3. Finalizar/cancelar/reabrir no Supabase (P1)
- `finishSupabaseCall`, `cancelSupabaseCall`, `reopenSupabaseCall` e `updateSupabaseCall` buscam apenas o chamado pelo ID (antes carregavam a tabela inteira duas vezes por ação).

### 4. Dashboard e notificações (P1)
- Notificações usam contagens (`count: exact, head: true` no Supabase; `COUNT(*)` no PG local) para chamados sem técnico e acionamentos pendentes, em vez de carregar todos os chamados e todos os acionamentos.
- `listSupabaseActivations` era N+1 (uma consulta extra por acionamento do histórico inteiro); dashboard e notificações deixaram de chamá-lo.
- Dashboard no Supabase usa `listSupabaseCalls(..., { summary: true })`, que seleciona só as colunas dos indicadores (sem observações nem textos longos). Regras dos indicadores inalteradas.

### 5. Escopo de supervisor e guardas de rota (P1)
- **Bug corrigido:** no Supabase e no PG local, `listCalls` refiltrava o escopo de supervisor com os mapas em memória do modo demo (vazios em produção), descartando todos os chamados. Afetava IGP de supervisores e detalhe de chamado com `teamScope=true`. O filtro já é feito no banco (join `technicians.supervisor_id`); o filtro redundante foi removido. Sem teste automatizado (os testes rodam em memória); validar em produção com um supervisor.
- Revisão do item 8 da auditoria: supervisores enxergarem todos os chamados fora de "Ordens da equipe" é decisão registrada em 2026-09-24, então o escopo das rotas de API não foi alterado.
- Frontend: rotas protegidas pela mesma permissão do menu; sem permissão, tela "Acesso não permitido". `/` redireciona para a primeira tela permitida quando o cargo não tem `dashboard.view` (ex.: Mesário). "Ordens da equipe" só para Supervisor.

### Arquivos
- Criados: `backend/src/timezone.ts`, `backend/test/timezone.test.ts`, `frontend/src/dates.ts`, `supabase/migrations/202611030001_calls_page_sao_paulo_dates.sql`, `database/migrations/021_calls_page_sao_paulo_dates.sql`.
- Alterados: `backend/src/store.ts`, `backend/src/igp.ts`, `backend/src/integrations/supabase/client.ts`, `backend/test/supervisor-scoping.test.ts` (fixture "other-month" movida para o meio de outubro: o horário antigo era 23h de 30/09 em São Paulo), `frontend/src/App.tsx`, `frontend/src/repeated-calls.tsx`, `frontend/src/filters.css`.

### Testes
- `npm run typecheck` (frontend + backend): ✅.
- `npm test --workspace backend`: ✅ 99/99 (3 novos testes de fuso horário).
- `vite build`: ✅ (aviso existente de bundle > 500 kB).
- Verificação manual em demo local (memória): fila sem o botão, zona de perigo apagando os chamados demo, supervisor recebendo "Acesso não permitido" em `/usuarios`.

### Aplicação da migration no Supabase — 2026-11-03
- Autorizada pelo responsável e aplicada no projeto Supabase `JH-RedeFlow` (`sxpoxgwxcloumpttcowt`) via `apply_migration` com o nome `calls_page_sao_paulo_dates` (agora registrada em `supabase_migrations.schema_migrations`; as migrations anteriores foram aplicadas manualmente e não aparecem nessa tabela).
- Antes de aplicar: o corpo em produção de `list_calls_page_with_assignment` era idêntico a `202610020003_calls_assignment_filter.sql`; `TimeZone` do banco = `UTC`; tabela `calls` com 0 registros.
- Depois de aplicar: a função contém `AT TIME ZONE 'America/Sao_Paulo'`; `list_calls_page_with_atrelada` responde normalmente com filtro de período; `'2026-10-01T01:30Z'` resulta em `2026-09-30` (São Paulo) em vez de `2026-10-01` (UTC).
- Rollback: reexecutar `supabase/migrations/202610020003_calls_assignment_filter.sql`.
- O PG local (`database/migrations/021_calls_page_sao_paulo_dates.sql`) não foi aplicado (não há banco local configurado nesta máquina).

### Validação em produção — 2026-11-03
- Deploys: Vercel produção `READY` e Render `live` no commit `34ca29e`.
- Bundle publicado contém "Limite 06:00", "ZONA DE PERIGO", "Acesso não permitido" e `America/Sao_Paulo`; não contém "Limite 08:00" nem "acima de 10h".
- Sessão real de Administrador (login feito pelo responsável): Visão geral, Em atendimento, IGP e Configurações carregaram; todas as chamadas `/api/*` (dashboard, chamados paginados, notificações, acionamentos, IGP, configurações) responderam 200.
- Em atendimento não exibe mais "Apagar todos os chamados"; Configurações exibe a "Zona de perigo" (não acionada).
- IGP mostra a metodologia 6h/9h. Gráfico diário da Visão geral exibe 28/10 a 03/11 (data de São Paulo).
- Limitações: a tabela `calls` de produção está vazia, então os selos de prazo nas filas e os percentuais do IGP não puderam ser vistos com dados reais; o escopo de supervisor não foi validado (requer login de um supervisor).

### Pendências
- Validar com um usuário Supervisor: IGP e detalhe de chamado em "Ordens da equipe".
- Conferir os selos de prazo 6h/9h assim que houver chamados em produção.
- Aplicar `database/migrations/021_calls_page_sao_paulo_dates.sql` em qualquer PostgreSQL local em uso.
- Validar em produção: escopo de supervisor (IGP e detalhe da equipe), contadores de notificações, filtros de período perto da meia-noite.
- Fora deste escopo, para P2: `reopenCall` sem caminho PG local; `assigned_at` divergente entre runtimes; Repetidos baixa todas as páginas no cliente; dependência `xlsx@0.18.5`.

---

## 2026-11-03 — P2 da auditoria: dependências, runtimes e organização do frontend

Autorizado pelo responsável ("pode prosseguir"). Sem mudança de regra de negócio, banco ou API.

### 1. Dependências
- `xlsx` trocado de `0.18.5` (npm, sem correções, vulnerável a prototype pollution/ReDoS) para `0.20.3` da distribuição oficial do SheetJS (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) em `backend` e `frontend`. O build do Render (`npm install`) baixa desse endereço.
- `npm audit fix` (sem `--force`): atualizações dentro das faixas já declaradas (body-parser, qs, source-map-js, launch-editor e transitivas) — só `package-lock.json`.
- Restante do audit: `zod < 4.6.6` exige major (`--force`); não aplicado — avaliar migração para zod 4 separadamente.
- Ajuste: o SheetJS 0.20 devolve datas de célula com 1 ms de erro; `parseWorkbookDate` em `backend/src/imports/historical-activations.ts` arredonda para o segundo (as planilhas têm precisão de segundos).

### 2. Divergências entre runtimes
- `reopenCall` ganhou o caminho PostgreSQL local (antes caía no mapa em memória), com log de auditoria "Chamado reaberto".
- Supabase: `assigned_at` deixou de ser sobrescrito a cada salvamento que envia o técnico; agora preserva a primeira atribuição e limpa ao remover o técnico, como o PG local e o modo demo. O campo não aparece em telas nem indicadores.

### 3. Bundle do frontend
- `xlsx` e `html2canvas` passaram a ser carregados sob demanda (`import()` no momento do upload/exportação PNG). Bundle principal: 430 kB (antes ~1,1 MB num único arquivo); `xlsx` (500 kB) e `html2canvas` (202 kB) viraram chunks separados.

### 4. Divisão de `frontend/src/App.tsx` (4.025 → 76 linhas)
- Feita por script com o compilador TypeScript: cada declaração foi movida sem alteração e os imports/exports foram gerados. Verificado que o código das 91 declarações é idêntico byte a byte ao original.
- Nova estrutura:
  - `lib/`: `constants.ts` (regiões operacionais, tamanho de página), `manual-production.ts` (tipos e parsers do Painel diário), `image-export.ts`.
  - `components/`: `Shell.tsx` (layout, menu, rotas e guardas), `ui.tsx` (Metric, AdminModal, DetailItem, AccessDenied, DateRangeFilter…), `call-cells.tsx` (regra SLA 6h/9h, células Prazo/SLA/Timer e formatações de tempo).
  - `pages/`: uma tela por arquivo (Login, Dashboard, IGP, ManualProduction, Imports, Activations, Users, Calls, CallDetail, Technicians, Supervisors, Roles, Settings).
  - `App.tsx`: apenas sessão/login.
- Código morto identificado e mantido (aguarda decisão): `Dashboard` em `pages/DashboardPage.tsx` não é usado em nenhuma rota e exibe números fixos ("42", "67"); `CallDetailBase` é usado por `AuditedCallDetailPage`.

### Testes
- `npm run typecheck` (frontend + backend): ✅.
- `npm test --workspace backend`: ✅ 99/99.
- `vite build`: ✅.
- Demo local (memória): as 14 rotas renderizam, detalhe do chamado abre, selos "Limite 06:00" presentes, zona de perigo presente, nenhum erro no console.

### Pendências / próximos passos
- ~~P2 restante: dividir `backend/src/store.ts`~~ — feito; ver seção seguinte.
- Remover `Dashboard` sem uso (requer autorização).
- Avaliar zod 4.
- P3: design system e modernização visual.

---

## 2026-11-03 — Runtime PostgreSQL local aposentado e `store.ts` dividido

Decisão do responsável: o modo PostgreSQL local (`REDEFLOW_RUNTIME=local` + `DATABASE_URL`) não é mais usado e foi removido. O backend passa a ter dois modos: **Supabase** (produção) e **memória** (desenvolvimento e testes; `REDEFLOW_DEMO_DATA=true` carrega dados fictícios).

### Removido
- Todos os ramos `shouldUseLocalDatabase()` de `store.ts` e `server.ts` (61 removidos por script com o compilador TypeScript + ajustes manuais), `findLocalUserByEmail`, `findLocalUserById` e a consulta de cargo no PG local.
- `backend/src/db.ts`, `backend/test/db.test.ts`, dependências `pg` e `@types/pg`.
- Pasta `database/migrations/` (001–021), usada só pelo PG local; continua no histórico do Git. As migrations oficiais seguem em `supabase/migrations/`.
- `DATABASE_URL` de `backend/.env.example`; README e docs (`wuzapi-webhook.md`, `google-drive-d1-sync.md`) atualizados. `backend/scripts/create-technician-roster.mjs` agora exige Supabase (ou `--remote`).
- `REDEFLOW_RUNTIME=supabase` continua válido (Render); outros valores apenas resultam no modo memória.

### `backend/src/store.ts` dividido (2.040 → barrel de 10 linhas)
- `store.ts` reexporta exatamente os 77 nomes públicos de antes; `server.ts`, testes e scripts não mudaram de import.
- Implementação em `backend/src/store/`: `demo-data.ts` (catálogo de permissões, cargos padrão, estado em memória e seed demo), `users.ts` (usuários, cargos, avatar, senha), `settings.ts` (configurações, regiões, OLT→Região e solicitações), `teams.ts` (técnicos e supervisores), `calls.ts` (listagem, paginação, importação, Drive, edição, finalizar/cancelar/reabrir, exclusão), `observations.ts` (observações, anexos, auditoria), `activations.ts`, `imports.ts` (importações, base D-0, painel diário), `dashboard.ts` (indicadores e notificações).
- Divisão feita por script; o código das 125 declarações é idêntico byte a byte ao `store.ts` após a remoção do PG local.

### Teste ajustado
- `backend/test/http.test.ts`: espera de boot do servidor de teste de 4 s → 10 s. Era a causa da falha intermitente em `healthcheck exposes security headers` (e ocasionalmente em outro teste HTTP) quando todos os arquivos rodam em paralelo.

### Testes
- `npm run typecheck`: ✅. `npm test --workspace backend`: ✅ 98/98 em duas execuções seguidas (o teste de `db.ts` foi removido junto com o módulo). `vite build`: ✅.

### Publicação (2026-11-03)
- Incidente: o commit `26e964d` foi enviado só com as exclusões em stage (um `git add` com caminho já removido abortou). No GitHub, `store.ts` ainda importava o `db.ts` excluído; o build do Render falhou (`build_failed`) e a produção permaneceu na versão anterior, sem indisponibilidade. O Vercel publicou `26e964d` sem impacto (frontend inalterado nesse commit).
- Corrigido em seguida com `de4ed37` (sem reescrever histórico). Checkout limpo de `de4ed37` passou no typecheck de backend e frontend; Render `live` e Vercel `READY` em `de4ed37`.
- Produção verificada com sessão de Administrador: novo bundle `index-BS-g8D5i.js` servido; IGP e Chamados abertos carregaram; chamadas `/api/*` com 200; nenhum erro no console.
- Lição: conferir `git show --stat HEAD` antes do push.

### Próximos passos
- P3: design system e modernização visual.
- Pendentes anteriores: validar supervisor em produção; decidir sobre `Dashboard` sem uso; avaliar zod 4.

---

## 2026-11-03 — Dashboards e navegação (P3, parte 1)

Pedido do responsável: navegar pelas telas, melhorar todos os dashboards (informações, disposição, cards) e a navegação. Regras de negócio inalteradas (SLA 6h/9h, metas do IGP, escopo, permissões).

### Diagnóstico (com 154 chamados fictícios em memória)
- Visão geral: barras com tamanho fixo em pixels (`valor × 28px`, `valor × 30%`) — com volume real todas ficavam iguais/estouravam (78 finalizados e 9 em campo com a mesma altura; regiões ≥4 chamados passavam de 100%). Faltavam: prazo da fila ativa, chamados mais antigos, carga por técnico, SLA/MTTR dos finalizados, abertos × finalizados por dia. Ícone igual em todos os cards e seta "↗" sem significado.
- IGP: sem tendência mensal; situação da meta só na tabela.
- Navegação: 15 itens soltos, ícones repetidos (prancheta em 3 itens, barras em 2), sem acentos, "Central de ajuda" e seletor "Operação Rede" sem função, título do cabeçalho por cadeia de ternários.

### Backend
- `GET /api/dashboards/operacao` ganhou campos (aditivos; os antigos continuam): `activeTotal`, `activeUnassigned`, `activeSla` (no prazo/fora/outlier da fila ativa agora, pela idade desde a abertura), `oldestActive` (8 mais antigos), `activeByTechnician`, `openedInPeriod`, `closedSla` (+ `mttrHours`) dos finalizados do período, `daily` (abertos e finalizados por dia em São Paulo; últimos 14 dias sem período, até 31 dias com período).
- Fila ativa e série diária são calculadas sobre todos os chamados do escopo; o período continua aplicado pela data de referência (abertura para ativos, Data Fim para encerrados) nos demais indicadores.
- `igp.ts`: `classifySlaHours` compartilhado (mesmas constantes 6h/9h).
- `/api/notificacoes`: cada item ganhou `count` numérico.
- Novo `backend/test/dashboard.test.ts` (4 testes: SLA da fila e ordenação dos mais antigos, SLA/MTTR dos finalizados, série diária em São Paulo, limite de 31 dias).

### Frontend
- Novos `components/charts.tsx` (KpiTile, Panel, RankBars, SlaStack, DailyBars) e `dashboards.css` (tokens de série e status; barras proporcionais ao maior valor; status sempre com ícone + rótulo; tooltip por hover/foco; responsivo).
- **Visão geral** reorganizada: período por atalhos (Hoje, 7 dias — padrão, 30 dias, Este mês, Tudo, Personalizado; escolha lembrada no navegador) e atualização automática a cada 60 s; bloco **Agora** (sem técnico, em atendimento, fora do prazo agora, acionamentos pendentes — cada card leva à tela correspondente); **Prazo dos chamados ativos** (barra empilhada 6h/9h) e **Chamados ativos mais antigos** (link para o detalhe); bloco **Período** (abertos, finalizados, cancelados, % finalizados no prazo vs. meta 89%, MTTR vs. meta 5,0h); **Abertos e finalizados por dia**; rankings de região, tipo, carga atual por técnico, bairros e status (top 8 + "Ver todos"); tabela "Chamados no intervalo" mantida.
- **IGP**: cards com situação da meta (ícone + rótulo + cor), "Resultado por rede" em largura total, **Dentro do prazo · últimos 6 meses** (colunas com linhas de meta 89% e mínimo 85%) e **Indicadores mês a mês**; metodologia em painel próprio.
- **Painel diário**: não alterado — depende do arquivo OFS e da exportação PNG ajustada em sessões anteriores; sem arquivo real não há como validar mudanças.
- **Navegação**: menu em seções (Operação, Indicadores, Equipes, Administração), ícone próprio por item, acentos corrigidos, contador amarelo de "sem técnico" em Chamados abertos (além do de Acionamentos), detalhe do chamado mantém "Em atendimento" ativo, cabeçalho "Seção › Página" (com link "Chamados" no detalhe), título da aba do navegador por página, `aria-label`s no menu; removidos "Central de ajuda" e o seletor "Operação Rede", que não tinham função. Menu recolhido: só ícones, divisórias entre seções e contadores sobre o ícone.

### Arquivos
- Criados: `backend/test/dashboard.test.ts`, `frontend/src/components/charts.tsx`, `frontend/src/dashboards.css`.
- Alterados: `backend/src/igp.ts`, `backend/src/store/dashboard.ts`, `backend/src/types.ts`, `frontend/src/api.ts`, `frontend/src/components/Shell.tsx`, `frontend/src/main.tsx`, `frontend/src/pages/DashboardPage.tsx` (o `Dashboard` legado sem uso foi mantido), `frontend/src/pages/IgpPage.tsx`, `frontend/src/sidebar.css`.

### Testes
- `npm run typecheck` ✅; `npm test --workspace backend` ✅ 102/102; `vite build` ✅.
- Visual (memória, 154 chamados fictícios gerados por script fora do repositório): Visão geral, IGP, menu expandido/recolhido em 1440 px; Visão geral, IGP, Chamados abertos e Configurações em 375 px sem rolagem horizontal (largura do documento 360 px). Tooltip do gráfico diário conferido.
- Não validado: dados reais de produção (tabela `calls` vazia) e o Painel diário.

### Próximos passos
- Publicar e conferir em produção quando houver chamados.
- P3 continua: aplicar os mesmos componentes às demais telas (filas, técnicos, supervisores) e consolidar o design system.

---

## 2026-11-03 — Coletor OFS automático (extensão JH Telecom → RedeFlow)

### Contexto
O responsável enviou a extensão do Chrome "JH Telecom" 2.0.12 (`extensao-jh-2.0.12-LOJA.zip`), publicada na Chrome Web Store e mantida junto com o sistema **JH Agendamentos** (Supabase próprio `nqqklnygdytwnuzxrxrp`, site `agendamentos-jh.vercel.app`). Ela tem três partes: **Coletor** (exporta sozinho o CSV de atividades do OFS — `alloha.fs.ocs.oraclecloud.com`, Ações → Exportar, data de hoje, alocação configurada — e envia para a edge function `campo-upload`; várias máquinas se revezam), **AutoISP** (`auto.alloha.com`: potência/estado das ONUs de 27 OLTs a cada 2h, quedas de clientes com reparo aberto a cada 20 min, atualização de porta sob pedido) e **Mover no OFS** (move OS para técnicos a pedido do site). Analisada só por leitura, numa pasta temporária fora do projeto; nada foi executado.

O CSV do Coletor é o mesmo "export plano" do OFS que o Painel diário já lê (colunas Recurso, Status da Atividade, Tipo de Atividade ×2, Ordem de Serviço). Decisão do responsável: **a extensão também envia o CSV ao RedeFlow**.

### RedeFlow (backend)
- Novo `POST /api/integrations/ofs/export` (`backend/src/server.ts`): autenticado por `x-redeflow-ofs-token` = variável `OFS_INGEST_TOKEN` (comparação em tempo constante; sem a variável o endpoint responde 503). Recusa CSV sem linhas de hoje na coluna "Data" (dd/mm/aa, data de São Paulo). Faz os mesmos dois passos do envio manual do Painel diário: (1) `saveManualDailyBase` para o dia de hoje, autor "Coletor OFS (máquina)"; (2) `replaceD0Base` com o mesmo arquivo (Status OFS, endereço, bairro, cidade, região, OLT e Data Fim dos chamados cruzados). Erro na D-0 não desfaz o painel e volta em `d0Error`. Um envio por vez (409 para concorrentes).
- Novo `backend/src/imports/ofs-export.ts`: leitura do export plano do OFS portada de `frontend/src/lib/manual-production.ts` (mesmas posições de coluna e o mesmo filtro dos 3 tipos de manutenção de rede).
- **Correção no leitor de CSV (`backend/src/imports/parser.ts`, afeta também envio manual da D-0 e a sincronização do Google Drive):** CSV/TXT/TSV passam a ser lidos como texto (UTF-8, com recuo para Latin-1) e sem conversão automática de tipos. Antes, o SheetJS lia UTF-8 como Latin-1 ("Ordem de Serviço" → "Ordem de ServiÃ§o", deixando de cruzar chamados) e trocava dia/mês de datas dd/mm com dia ≤ 12 ("03/11/26" → 11/03/2026, gerando Data Fim errada). Arquivos XLSX continuam no caminho anterior. Planilhas do Drive exportadas como CSV passam a manter datas e cabeçalhos exatamente como estão.
- `render.yaml` e `backend/.env.example`: `OFS_INGEST_TOKEN` documentada (segredo, sem valor no repositório).
- Testes: `parsers.test.ts` (CSV com acentos e datas brasileiras em UTF-8, UTF-8 com BOM e Latin-1) e `http.test.ts` (token ausente/errado → 401, CSV de outro dia → 422, envio válido salva o painel com 2 atividades de rede de 3 linhas, cruza a OS e grava Status OFS "Iniciado"). Suíte: ✅ 104/104.

### Extensão 2.0.13 (fora deste repositório)
- Alterações sobre a 2.0.12: `manifest.json` (versão 2.0.13 e permissão de host `https://jh-redeflow-api.onrender.com/*`), `coletor.js` (`enviarRedeFlow`: envia o mesmo CSV já validado, em paralelo e sem afetar o envio ao JH Agendamentos, só quando há token), `popup.html`/`popup.js` (campo "Token do JH RedeFlow" em Avançado e status do último envio). Mover, AutoISP e login inalterados.
- Testada em Node com a função original extraída de `coletor.js` contra o backend local: com token envia e grava status; token errado registra o erro; sem token não envia.
- Pacote gerado para o responsável publicar na Chrome Web Store (a nova permissão de host faz o Chrome pedir confirmação aos usuários na atualização).

### Pendências
- ~~Definir `OFS_INGEST_TOKEN` no Render~~ — feito em 2026-11-03 (valor entregue ao responsável fora do repositório). Falta colar o mesmo valor no popup da(s) máquina(s) coletora(s).
- Publicar a 2.0.13 na Chrome Web Store.
- Validar com um CSV real do OFS: posições das colunas (o leitor usa posições fixas 0/2/15/20/23/24, igual ao envio manual) e se a alocação configurada na extensão inclui as atividades do time de Rede.
- Próxima etapa possível: usar os dados do AutoISP (`massive_status`, clientes por OLT/PON, potência) para preencher a coluna "Afet." e o detalhe do chamado.

---

## PLANO — RedeFlow integrado ao OFS (substituir o Drive e operar o OFS pelo sistema) — 2026-11-03

### Objetivo (pedido do responsável)
Puxar os dados diretamente do OFS em vez do Google Drive: dias anteriores, Status e Data Fim; finalizar, cancelar, despachar e mover ordens pelo RedeFlow em sincronia com o OFS; conferir ordens do OFS ainda não acionadas no grupo do WhatsApp; Painel diário atualizado de hora em hora; relatórios automáticos. A única entrada externa continua sendo o acionamento do grupo do WhatsApp (WuzAPI).

### Arquitetura
- **Decisão (2026-11-03):** não há acesso à API do OFS; tudo será pela extensão. E a extensão é **própria da Rede**, separada da extensão do JH Agendamentos: **"JH RedeFlow – Coletor OFS"**, código em [extensao-rede/](extensao-rede/) (ver "Extensão própria da Rede" abaixo). A 2.0.13 da extensão JH Telecom deixa de ser o caminho.
- **Ponte:** extensão da Rede (Chrome logado no OFS). Leitura: export CSV do OFS → `POST /api/integrations/ofs/export` (em produção com `OFS_INGEST_TOKEN`). Escrita (Fases 4 e 5): RedeFlow → extensão via `chrome.runtime.sendMessage` (`externally_connectable`), reimplementando na extensão da Rede o fluxo de mover que existe na do Agendamentos.

### Pré-requisitos (bloqueiam a Fase 1)
- CSVs reais do OFS da alocação do time de Rede: um de hoje e um de dia anterior (colunas, status final, Data Fim/hora de conclusão, identificadores BDESK/Office Track/Contrato).
- ~~Confirmar acesso à API do OFS~~ — não há; decidido seguir pela extensão.
- Aval da Alloha para ações de escrita automatizadas no OFS (Fases 4 e 5).

### Fase 1 — Leitura automática (baixo risco)
1. ✅ **Painel diário de hora em hora:** extensão da Rede 1.0.0 (intervalo padrão 1 h). Falta publicar e configurar a máquina.
2. 🟡 **Dia anterior pela extensão:** ✅ exportação diária do dia anterior (padrão 07:00) enviada com `data`; o RedeFlow salva o Painel diário daquele dia e atualiza Status OFS/Data Fim dos chamados que cruzam, sem tocar na D-0 de hoje. ⏳ Falta criar/finalizar/cancelar chamados a partir do OFS (lógica de reconciliação do Google Drive, `buildDriveCall`/`buildDriveUpdate`, com origem "OFS") — depende dos CSVs reais para mapear status final e Data Fim.
3. ✅ **Retroativo:** botão no popup exporta qualquer dia dos últimos 31 (um por vez).
4. **Transição do Drive:** rodar OFS e Drive em paralelo por alguns dias, comparar contagens (criados, finalizados, cancelados, Data Fim) e só então desligar `GOOGLE_DRIVE_SYNC_ENABLED`.
- Critério de pronto: uma semana de paralelo sem divergência relevante; Painel diário com atualização ≤ 1h durante o expediente.

### Fase 2 — Conferência OFS × acionamentos
- Tela/painel "Divergências": ordens de rede no OFS sem acionamento/chamado no RedeFlow e chamados no RedeFlow sem ordem no OFS; status divergentes (ex. concluída no OFS e aberta no RedeFlow).
- Alerta no sino e contador no menu.
- Critério de pronto: lista conferida manualmente com a operação durante alguns dias.

### Fase 3 — Relatórios automáticos
- Envio programado do Painel diário (imagem já gerada hoje) e de um resumo (abertos, fora do prazo, outliers, finalizados) em horários fixos, via WuzAPI para um grupo definido ou outro canal.
- Critério de pronto: horários e destinatários definidos pela operação; envio com registro de sucesso/falha.

### Fase 4 — Despachar e mover pelo RedeFlow (escrita, risco médio)
- Liberar o RedeFlow (`jh-rede.vercel.app`) em `externally_connectable` da extensão e reaproveitar o "Mover no OFS" (contrato → OS do dia → técnico → posição).
- No RedeFlow: ação "Despachar/Mover no OFS" no detalhe do chamado, com confirmação, permissão própria (ex. `calls.assign`) e registro na auditoria; resultado da extensão exibido na tela.
- Critério de pronto: piloto com um operador, sem divergência entre RedeFlow e OFS.

### Fase 5 — Finalizar e cancelar no OFS (escrita, risco alto)
- Mapear os formulários de encerramento do OFS (campos obrigatórios, códigos de causa/encerramento) com um usuário real.
- Nova automação na extensão, sempre com confirmação por ação, registro de auditoria e "modo somente simular" para o piloto.
- Critério de pronto: aval da Alloha + piloto acompanhado.

### Riscos
- Automação de tela quebra quando a Oracle muda o layout do OFS (a extensão já avisa após 3 falhas seguidas).
- Depende de Chrome aberto e logado; o revezamento de máquinas reduz o risco.
- Ações de escrita em sistema de terceiro (Alloha) exigem autorização.
- Latência: dados do OFS chegam no intervalo da exportação (hoje até 1h), não em tempo real.

### Ordem sugerida
Pré-requisitos → Fase 1 → Fase 2 → Fase 3 → Fase 4 → Fase 5. Fases 2 e 3 podem andar em paralelo depois da Fase 1.

---

## 2026-11-03 — Extensão própria da Rede: "JH RedeFlow – Coletor OFS" 1.0.0

### Decisão
Sem acesso à API do OFS; integração pela extensão. A pedido do responsável, uma **extensão nova, só da Rede**, distinta da extensão JH Telecom (JH Agendamentos). Código versionado neste repositório em `extensao-rede/`.

### Extensão (`extensao-rede/`)
- `manifest.json` (MV3, 1.0.0): permissões `storage`, `alarms`, `scripting`, `tabs`, `downloads`, `notifications`; hosts somente OFS e a API do RedeFlow no Render. Sem login do Agendamentos, sem Mover e sem AutoISP.
- `background.js`: automação na aba do OFS (`acaoNaPagina`: navega até a data alvo pelas setas, seleciona a alocação por `data-id` ou a selecionada, atualiza a grade, Ações → Exportar); captura **apenas** o download que ela mesma disparou (janela de 90 s — exportações manuais baixam normalmente); lê o blob na aba e envia ao RedeFlow com o token; depois de um dia anterior devolve a tela do OFS para hoje; alarmes: hoje a cada N min (padrão 60) e dia anterior diário (padrão 07:00); selo do ícone, histórico dos 15 últimos envios e notificação após 3 falhas seguidas.
- `popup.html/js/css`: último envio, próximas exportações, botões Hoje / Dia anterior / data escolhida (até 31 dias), token + "Testar token", intervalo, horário do dia anterior, `data-id` da alocação, liga/desliga, envio manual de CSV com a data e histórico.
- `icons/`: ícones próprios (quadrado azul RedeFlow com "R"), gerados localmente.
- `README.md`: instalação, configuração, convivência com a extensão do Agendamentos e limitações.

### Backend
- `POST /api/integrations/ofs/export` aceita `data` (YYYY-MM-DD, hoje até 31 dias atrás; futuro → 400). Hoje: comportamento anterior (Painel diário + substitui a D-0 + atualiza chamados). Dia anterior: salva o Painel diário daquele dia e só atualiza os chamados (Status OFS, endereço, bairro, cidade, região, OLT, Data Fim), sem sobrescrever a D-0 de hoje. A checagem da coluna "Data" usa o dia informado.
- `store/imports.ts`: `applyOfsRowsToCalls` separado de `replaceD0Base` (este continua gravando o snapshot e chamando aquele); exportado no barrel `store.ts`.

### Testes
- `http.test.ts`: novo teste do dia anterior (data futura → 400; CSV de ontem sem `data` → 422; com `data` salva o painel de ontem, cruza o chamado, grava Status OFS "Concluído" e mantém a D-0 de hoje igual).
- Corrigidos dois testes frágeis: "open calls split…" dependia do horário (turno do `tech-carlos` termina 16:00; agora marca ativo manualmente antes de atribuir) e a espera de boot do servidor de teste subiu para 30 s. Suíte: ✅ 106/106.
- Extensão: `acaoNaPagina` executada numa página simulada do OFS com os mesmos seletores (ontem com 1 clique, volta para hoje sem exportar, 3 dias atrás atravessando o mês, alocação inexistente → erro claro); `background.js` carregado em Node com `chrome` simulado contra o backend local (token aceito, captura só do download do OFS, envio com 1 atividade e 1 chamado cruzado/atualizado, volta para hoje, download manual fora da janela não cancelado, sem token não exporta).

### Pendências
- Publicar a 1.0.0 na Chrome Web Store (ou carregar sem compactação para piloto) e configurar a máquina coletora com o token.
- Validar com o OFS real: texto do seletor de data, `data-id` da alocação da Rede e colunas do CSV.
- Fase 1 item 2: criar/finalizar/cancelar chamados a partir do OFS (substituir o Drive) — precisa dos CSVs reais.

## 2026-11-03 — Acionamentos: diagnóstico dos grupos e leitura de cards fora do padrão

### Diagnóstico (produção, somente leitura)
- Último acionamento gravado no Supabase: 2026-10-08 21:19 UTC (457 no total).
- Logs do Render: a WuzAPI enviou mensagens de vários grupos (120363419703117730, 120363404274690636, 120363429479875793, 120363028742968831, 120363106964250033, 120363029517717229, 120363430674238214), mas **nenhum** dos IDs configurados em `WUZAPI_ACTIVATION_GROUP_ID` (120363183251501300, 120363422003961917) aparece. Hipótese: o grupo mudou de ID (grupo novo/comunidade) ou o número saiu do grupo.
- Sem nenhum log da WuzAPI depois de 2026-11-03 10:04 UTC (07:04 em São Paulo): a WuzAPI parou de chamar o webhook (sessão/URL a verificar no painel da WuzAPI).
- 10:51 UTC: "Reached heap limit" (512 MB). A sincronização agendada do Drive rodava de novo a cada reinício (cerca de 15 hoje) e lia ~17,8 mil linhas a cada vez.
- Cards não reconhecidos eram descartados antes de gravar. Variações reais encontradas: cabeçalho "Fulano - COP Redes", "### ACIONAMENTO FIELD ###" com seções "=== INFO ===", rótulos em negrito (`*OLT*:`), bullets e emojis, "Técnico Rede: 0", TICKET do backbone com o trecho junto ("658278 » SP::…").

### Implementado
- `backend/src/integrations/wuzapi/card-normalizer.ts` (novo): antes da leitura, converte o card para o formato padrão.
  - Remove a formatação do WhatsApp, bullets, emojis e caracteres invisíveis.
  - Aceita `-`, `–` e `=` como separador, além de `:`.
  - Aceita apelidos de rótulo (Técnico de rede, B-DESK, Clientes afetados, Falha, OT, OBS, Data e hora do evento…).
  - Normaliza a grafia do tipo: NOC-ACESSO/NOC_TX, "Validar c/ o NOC", "Acionamento de campo/fild", "Evento de back-bone".
  - Linhas de endereço e trechos com hífen não são alterados.
- `splitTicket`: separa número e trecho do TICKET. O campo `bdesk` agora recebe só o número; o trecho vai para o novo campo `trecho` de `ActivationAnalysis`.
- `semantic.ts`:
  - `labelValue` não atravessa mais a quebra de linha. Antes, "Contrato(s) Exemplos:" vazio capturava a linha seguinte.
  - Usa o primeiro valor não vazio do rótulo.
  - Técnico "0"/"-" passa a ser "sem técnico".
- `client.ts`:
  - Os 48 padrões do leitor legado só leem valores na mesma linha.
  - `parseIncomingMessage` lê `Chat`/`Sender` no nível do evento (recibos).
- Webhook (`server.ts`):
  - O filtro de tipo de evento roda antes do filtro de grupo, então recibos/presença não geram mais "grupo não autorizado / chatId nenhum".
  - O aviso de grupo não autorizado sai uma vez por hora por grupo.
  - Card de acionamento vindo de grupo **não configurado** gera um aviso explícito no log.
  - Novo `GET /api/integrations/wuzapi/grupos` (permissão `settings.manage`): mostra os grupos vistos desde o último reinício, com mensagens, cards que parecem acionamento, último envio e se o grupo está autorizado. Serve para achar o ID correto.
- Recebimento (`supabase/client.ts`):
  - `createSupabaseActivation` e `listSupabaseActivations` buscam `activation_processing` em lote (`.in`, 150 por consulta). Antes era uma consulta por acionamento (N+1).
  - A deduplicação considera os últimos 14 dias.
  - A busca de atrelada lê só os chamados com OFS Pendente que têm OLT (colunas mínimas), em vez de todos os chamados.
- Drive: o agendamento consulta `google_drive_sync_runs` e não repete a sincronização do dia após um reinício (`lastDriveSyncRunDate`).

### Testes
- `backend/test/card-variants.test.ts` (novo, 8 testes com as variações reais).
- Suíte completa: 114/114 passando.

### Pendências (ação do usuário)
- Painel da WuzAPI: conferir se a sessão está conectada e se o webhook aponta para `https://jh-redeflow-api.onrender.com/api/integrations/wuzapi/webhook?token=…`.
- Depois do deploy, mandar um card no grupo de acionamentos e consultar `/api/integrations/wuzapi/grupos` (ou o log "grupo NAO configurado") para pegar o ID atual. Em seguida, atualizar `WUZAPI_ACTIVATION_GROUP_ID` no Render (aceita vários IDs separados por vírgula).
- Avaliar um plano pago no Render: o plano free dorme, tem cold start e limite de 512 MB.

## 2026-11-03 — Sincronização do Google Drive removida

### Decisão
A pedido do usuário, os dados do OFS passam a vir só pela extensão da Rede ("JH RedeFlow – Coletor OFS"). A sincronização do Drive saiu: ela lia ~18 mil linhas a cada execução e era a principal causa de estouro de memória no Render (512 MB).

### Removido
- Download dos arquivos do Drive (`syncCallsFromDrive`, cliente `googleapis`) e a dependência `googleapis` do backend.
- Agendamento diário das 09:00 (`startDriveSchedule`), os jobs em memória e os endpoints `POST /api/integrations/google-drive/sync` e `GET /api/integrations/google-drive/sync/:jobId`.
- Registro de execuções (`recordDriveSyncRun`, `lastDriveSyncRunDate`). A tabela `google_drive_sync_runs` continua no banco, intocada, com o histórico.
- Botão "Sincronizar Drive" na tela Importações (agora ela explica que os dados chegam pela extensão) e os tipos/chamadas correspondentes em `frontend/src/api.ts`.
- Variáveis `GOOGLE_DRIVE_*` e `GOOGLE_SERVICE_ACCOUNT_JSON` do `render.yaml`, e o documento `docs/google-drive-d1-sync.md`.

### Mantido
- O mapeamento de linha do OFS para chamado foi renomeado de `integrations/google-drive.ts` para `integrations/ofs-call-mapping.ts`. Funções: `buildDriveCall`, `buildDriveUpdate`, regras de elegibilidade, identificadores e fingerprint. Ele será a base da Fase 1 item 2: criar, finalizar e cancelar chamados a partir do CSV da extensão.
- `createDriveCall` e `recordDriveCallSnapshot` (store) e a tabela `google_drive_call_snapshots`, pelo mesmo motivo.
- Chamados antigos com `source = 'google-drive'` continuam como estão.

### Testes
- Suíte do backend: 113/113 (o teste do endpoint de sincronização do Drive saiu). Build do frontend OK.

### Pendência (ação do usuário)
- No painel do Render, as variáveis `GOOGLE_DRIVE_*` e `GOOGLE_SERVICE_ACCOUNT_JSON` ainda existem. O código não as lê mais, então podem ser apagadas quando quiser; não foram alteradas aqui.

## 2026-11-03 — Coletor OFS 1.1.0: login com o usuário do sistema

### Pedido
A extensão da Rede passa a entrar com o login do JH RedeFlow (e-mail e senha), em vez de um token colado.

### Backend (`server.ts`)
- **Novo `POST /api/integrations/ofs/login`.**
  - Usa as mesmas credenciais e o mesmo limite de tentativas do `/api/auth/login`. A checagem de credenciais virou a função `checkCredentials`, compartilhada pelos dois.
  - Exige a permissão `imports.create` e recusa usuário com troca de senha pendente.
  - Devolve uma sessão JWT de 30 dias com `scope: 'ofs-collector'`. São 30 dias porque a coleta roda de hora em hora, inclusive de madrugada.
- **A sessão do coletor só vale para o envio do export.** O middleware `auth` recusa tokens com esse escopo, então ela não abre o resto da API.
- **`POST /api/integrations/ofs/export` aceita duas formas de autenticação:**
  - `Authorization: Bearer <sessão>`: a cada envio confere se o usuário continua ativo e com a permissão. Desativar o usuário corta a extensão na hora.
  - O token de máquina antigo (`x-redeflow-ofs-token` = `OFS_INGEST_TOKEN`), que continua aceito.
  - O "Enviado por" do Painel diário mostra o nome do usuário: "Coletor OFS – Nome (máquina)".
- Teste novo em `http.test.ts`: login válido e inválido, perfil sem permissão (403), sessão aceita no export, sessão recusada em `/api/auth/me`. Suíte: 114/114.

### Extensão (`extensao-rede/`, versão 1.1.0)
- **Card "Conta do JH RedeFlow" no topo do popup.**
  - Deslogado: e-mail, senha e Entrar.
  - Logado: nome, e-mail, validade da sessão, Testar conexão e Sair.
- **A senha não é guardada.** Só a sessão fica em `chrome.storage.local`, nesta máquina; não sincroniza entre Chromes.
- **Sem login, a extensão para e avisa.**
  - O ícone mostra "!" e a coleta automática não envia.
  - Se o RedeFlow recusar a sessão (401/403: vencida, usuário desativado, sem permissão), a extensão sai sozinha e pede login de novo.
- O token de máquina foi para **Avançado** como alternativa opcional. Com usuário logado, o login tem prioridade.
- README atualizado; pacote `jh-redeflow-coletor-ofs-1.1.0.zip` gerado.

### Pendências
- Instalar a 1.1.0 na máquina coletora e entrar com um usuário que tenha a permissão de Importações.
- Depois que todas as máquinas estiverem usando login, avaliar remover o `OFS_INGEST_TOKEN` do Render.

## 2026-11-03 — Perfil: avatar sempre visível e troca de foto só em Configurações

### Pedido
O ícone do perfil sumia com a barra lateral recolhida, e clicar no ícone para trocar a foto era ruim.

### Implementado (frontend)
- **Barra lateral recolhida:** a regra de CSS escondia todo `button` do `.profile-mini`, inclusive o avatar. Agora só o nome e o botão Sair somem; o avatar continua visível (`sidebar.css`).
- **Avatar só exibe a foto** (novo `components/ProfileAvatar.tsx`).
  - Na barra lateral e no topo, clicar leva para Configurações → "Meu perfil" (`/configuracoes#perfil`).
  - Clicar no avatar não abre mais o seletor de arquivo.
- **Configurações → "Meu perfil"** (`SettingsPage.tsx`): mostra foto grande, nome, e-mail e perfil, com os botões "Adicionar/Trocar foto" e "Remover foto". O redimensionamento automático continua o mesmo.
- **Configurações agora aparece para todos os usuários**, para cada um trocar a própria foto.
  - Quem não tem `settings.manage` vê só "Meu perfil".
  - As configurações do sistema (SLA, OLT por Região, zona de perigo) seguem restritas como antes. O backend não mudou: as rotas continuam exigindo `settings.manage`.

### Validação
- Build do frontend OK.
- Conferido no navegador em modo demo:
  - Operador: avatar visível com a barra recolhida e Configurações só com "Meu perfil".
  - Administrador: "Meu perfil" mais as configurações do sistema.
- Não foi testado o upload de uma foto real (o fluxo de envio é o mesmo de antes).

## 2026-11-03 — Acionamento enviado pelo número conectado à WuzAPI era descartado em silêncio

### Diagnóstico
- O card de teste (grupo "teste 2", 17:29) foi enviado pelo próprio número conectado à WuzAPI ("Você").
- O webhook descartava toda mensagem com `IsFromMe` ("mensagem do próprio bot"), mas o RedeFlow não envia mensagens pela WuzAPI. Com isso, o filtro só servia para jogar fora cards digitados no celular conectado.
- Esse descarte, e todas as outras decisões sobre grupos autorizados, só aparecia no log com `WUZAPI_DEBUG=true`. Por isso não havia rastro no Render.
- Nenhum acionamento novo no banco (último: 2026-10-08).
- Entre 10:04 e 19:51 UTC não houve nenhum log da WuzAPI, nem os avisos de grupo que o código da época gerava para toda mensagem. Ou seja, nesse período a WuzAPI não chamou o webhook. Continua pendente conferir a sessão e o webhook no painel da WuzAPI.

### Implementado (`server.ts`)
- Mensagens `IsFromMe` de grupo autorizado são processadas como qualquer outra. A deduplicação por ID da mensagem continua.
- Em grupo autorizado, toda decisão vai para o log sem precisar de debug. Exemplos:
  - `[WuzAPI] grupo <id> (enviada pelo numero conectado): acionamento registrado <id> (ACESSO, BDESK 672288)`
  - `[WuzAPI] grupo <id>: ignorada, sem sinais de acionamento: "<início do texto>"`

### Testes
- Novo teste com o card real (NOC ACESSO, `IsFromMe: true`, grupo autorizado): registrado como Pendente. Suíte: 115/115.

## 2026-11-03 — Coletor OFS: leitura do export pelo nome das colunas

### Problema
O export de 03/11 vindo da extensão (com o balde/alocação configurado) foi recusado com "O arquivo nao e o export de atividades do OFS". A leitura do Painel diário (`backend/src/imports/ofs-export.ts`) usava posições fixas de coluna (Recurso = 0, Status = 2, Início = 15, Tempo = 20, Tipo = 23, OS = 24) e exigia duas colunas "Tipo de Atividade". Só que o OFS exporta as colunas da visão/alocação atual, então a ordem e a quantidade mudam.

### Implementado
- As colunas agora são localizadas pelo nome do cabeçalho, sem acento e sem diferenciar maiúsculas. São obrigatórias:
  - Status da Atividade;
  - pelo menos uma "Tipo de Atividade";
  - Ordem de Serviço.
- Recurso, Início e Tempo são opcionais.
- Com mais de uma coluna "Tipo de Atividade", vale a que tiver um tipo de manutenção de rede.
- Quando o arquivo não serve, o erro diz quais colunas faltam e mostra as primeiras colunas recebidas. Assim o histórico da extensão já indica o que veio do OFS.

### Testes
- `backend/test/ofs-export.test.ts` (novo, 3 testes): colunas em outra ordem com um único "Tipo de Atividade", escolha da coluna de tipo certa e mensagem de erro com as colunas recebidas.
- Suíte: 118/118.

### Observação
- O envio manual pela tela do Painel diário (`frontend/src/lib/manual-production.ts`) ainda usa a leitura antiga por posição. Alinhar se o mesmo arquivo também for recusado por lá.

## 2026-11-03 — "Em atendimento": filtro de status sem "Aberto"

### Problema
Na tela "Chamados em atendimento", o filtro de status voltava como "Aberto" (ele fica salvo em cookie por página) e a lista aparecia vazia. Essa tela só mostra chamados com técnico, e um chamado com técnico não fica como "Aberto". Por isso essa combinação nunca trazia resultado.

### Implementado (`frontend/src/pages/CallsPage.tsx`)
- O filtro de status de "Em atendimento" oferece Todos, Atribuido, Deslocamento e Em campo; a opção "Aberto" saiu.
- Se houver um filtro salvo fora dessas opções (por exemplo, o "Aberto" antigo), a tela abre em "Todos".
- Em "Todos", a consulta continua a mesma.

### Validação
- Build do frontend OK. Conferido no navegador em modo demo, com o cookie "Aberto" salvo: o filtro abriu em "Todos" e a lista mostrou os chamados.

## 2026-11-03 — Transição suave ao trocar de página

### Pedido
Trocar o efeito de "pisca" ao mudar de aba no menu. A tela antiga sumia de uma vez e a nova aparecia vazia ou em "Carregando…".

### Implementado (frontend)
- `Shell.tsx`: as rotas ficam dentro de `<div className="page-transition" key={location.pathname}>`, então cada troca de página monta a página nova do zero e dispara a animação.
- Efeito colateral bom: telas que usam o mesmo componente (Chamados abertos / Em atendimento / Finalizados) não reaproveitam mais o estado da tela anterior.
- `page-transition.css` (novo): a página entra com um fade de 0,22 s e um deslize de 6 px para cima. A animação fica desligada para quem usa "reduzir movimento" no sistema (`prefers-reduced-motion`).

### Validação
- Build do frontend OK.
- No navegador (modo demo), a navegação Visão geral → Em atendimento remonta a página com a animação `page-enter` (220 ms), e o estado final fica com opacidade 1, sem deslocamento e com a lista renderizada.
- O efeito não foi visto rodando na tela: o painel do navegador estava oculto, e o Chrome não avança animações de páginas ocultas. O estado final foi conferido forçando o fim da animação.

## 2026-11-03 — Importação da planilha de chamados finalizados (Finalizados.xlsx)

### Análise da planilha (somente leitura)
- Colunas: ORDEM, Tecnico, Data Abertura, Data Acionamento, Data-Fim, OLT, PL, PO, REGIAO, ACIONAMENTO. São 5.440 linhas, com Data-Fim de 11/05 a 30/09/2026.
- A ORDEM aparece no Excel em notação científica (6.0002E+14), mas o valor guardado na célula está completo. É só exibição.
- O importador de histórico existente (`/api/importacoes/acionamentos-historicos`) gera 3.764 chamados Finalizados (ACIONAMENTO FIELD, NOC ACESSO, NOC TX). Ficam de fora:
  - 594 linhas sem o card (coluna ACIONAMENTO vazia);
  - cerca de 1.080 linhas com Data Abertura e/ou Data-Fim vazias na própria planilha;
  - 2 linhas com a mesma O.S. (602156053150102) e conteúdo diferente, que vão para revisão manual.
- No banco havia apenas 2 chamados, então não há duplicidade com o que já existe.

### Correções feitas antes de importar
- **Fuso das datas** (`historical-activations.ts`): o SheetJS monta as datas no fuso do processo. Na máquina local (-03) o resultado saía certo, mas no Render (UTC) todos os horários seriam gravados 3 horas antes. Agora a data é convertida a partir do horário escrito na planilha, tratado como horário de São Paulo, qualquer que seja o fuso do servidor.
  - Os testes passaram a gravar as células como serial do Excel no horário de São Paulo, e foram conferidos com `TZ=UTC` e `TZ=America/Sao_Paulo`.
- **Técnico cadastrado em duplicidade**: Ricardo Mendes de souza, Gabriel Oliveira da Silva e Lucas Riquelme Barret de Souza têm dois cadastros cada (um ativo e um inativo). Isso deixava o nome ambíguo e bloqueava a confirmação (228 chamados). Agora vale o único cadastro ativo; com dois ativos, o nome continua ambíguo.
- **Tela**: o painel "Acionamentos finalizados" (prévia e confirmação) existia no código, mas não aparecia em nenhuma página. Voltou para Importações.

### Testes
- Suíte do backend: 119/119.
- Prévia completa rodada no servidor local (modo demo, sem gravar) com a planilha real: 3.764 importáveis, datas corretas, por exemplo 18/06 14:02 → `2026-06-18T17:02:58Z`.

### Pendências
- Fazer a importação em produção depois do deploy (Importações → Selecionar XLSX → conferir a prévia → Importar).
- Decidir o que fazer com as linhas que ficam de fora: sem card (594) ou sem datas (cerca de 1.080).

## 2026-11-04 — Telas de chamados redesenhadas (Abertos, Em atendimento, Finalizados)

### Pedido
Redesenhar as telas de listas de chamados e os filtros.

### Implementado (`frontend/src/pages/CallsPage.tsx`, novo `frontend/src/calls-queue.css`)
- **Filtros sempre visíveis e com rótulo**: Região, Bairro, OLT e Período ("Abertos de"/"Encerrados de" e "Até"). Antes ficavam escondidos atrás de "Filtros", em caixas sem nome ("Todas"/"Todos").
  - Busca com botão de limpar.
  - Status como botões, só onde faz sentido (Em atendimento: Atribuído/Deslocamento/Em campo; Finalizados: Finalizado/Cancelado/Baixar).
  - Filtro ativo fica destacado em azul; "Limpar filtros (n)" aparece quando há algum.
  - Corrigido: as listas de Região e Bairro eram montadas só com os chamados da página atual e "sumiam" ao filtrar. Agora Região usa as regiões oficiais e Bairro mantém a opção selecionada.
- **Relógio da regra 6h/9h** em cada linha:
  - tempo na fila em destaque;
  - barra até 9h com marca nas 6h;
  - classificação No prazo / Fora do prazo / Outlier;
  - faixa colorida na borda esquerda da linha.
  - Em Finalizados, o mesmo relógio mostra o tempo total (abertura até a Data Fim) e a classificação no encerramento.
- **Resumo no cabeçalho**: "X no prazo, Y fora do prazo e Z outliers" (da página atual quando há mais de uma página).
- **Colunas enxutas**:
  - Abertos tirou Técnico (sempre "Sem técnico") e Data Fim (sempre vazia).
  - Em atendimento tirou Afet. e Data Fim (sempre vazias). A OLT foi para "Local e OLT", e a observação ficou junto do timer da última observação.
  - Finalizados ganhou "Tempo total".
- Status interno em caixa colorida por estado. A ordem vem em destaque, com BDESK e o selo "Atrelada" logo abaixo.
- **Estados vazio e de erro com direção**: "Nenhum chamado com esses filtros" + "Limpar filtros"; erro com "Tentar de novo". A lista não pisca ao atualizar: fica esmaecida durante a carga.
- **Acessibilidade e celular**:
  - linhas abrem com Enter e têm foco visível;
  - no celular cada chamado vira um cartão com rótulos.
- "Copiar imagem" ajustado: as larguras acompanham as colunas novas, e a caixa de status exporta só o valor escolhido (antes trazia todas as opções).
- Textos: "1 chamado"/"N chamados", "Técnico", "OPERAÇÃO" com acento.

### Validação
- Build do frontend OK.
- Capturas em Chrome headless (modo demo) das três telas a 1440 px e do celular a 500 px.
- Testado no navegador: filtro por status, estado vazio e "Limpar filtros".

## 2026-11-04 — Importação de finalizados: técnico sem cadastro não bloqueia mais

### Contexto
Na versão nova do `Finalizados.xlsx` (4.836 chamados importáveis), 44 chamados traziam 9 nomes sem cadastro de técnico: Equipe JH, Edson Luan Parras De Oliveira, Carlos Junior, Luan Edson, Enedino Assis Costa Neto, JH TELECOM REDES, Isac Bruno Cavalcante, Sergio Luis de Souza Correa e Victor Manoel. Isso bloqueava a confirmação. Decisão do usuário: importar sem vincular.

### Implementado
- `historical-activations.ts`: "Equipe JH", "JH TELECOM REDES", "JH Telecom Rede" e variações são a própria equipe e passam a casar com o cadastro "JH Telecom".
- `server.ts`:
  - Na prévia, um nome sem cadastro não bloqueia mais. O chamado entra sem técnico vinculado, e a observação começa com "Técnico na planilha (sem cadastro): <nome>", seguida do card.
  - A confirmação não recusa mais por técnico sem cadastro.
- `ImportsPage.tsx`: o aviso virou informativo ("Esses chamados entram sem técnico vinculado e o nome fica nas observações"), e o botão Importar fica habilitado.

### Testes
- Novo teste dos apelidos da equipe.
- Suíte: 120/120. Build do frontend OK.

### Observação
- Chamados sem técnico vinculado não entram nos rankings por técnico. Se os técnicos forem cadastrados depois, o vínculo precisa ser feito chamado a chamado (ou por uma importação/ajuste específico).

## 2026-11-04 — Importação de finalizados: cadastro automático dos técnicos que divergem

### Correção do commit 71cb5a0
- A mudança "técnico sem cadastro não bloqueia" foi aplicada por engano no importador de **chamados atuais**, que tem um bloco idêntico. O importador de **finalizados** continuou bloqueando: a confirmação devolvia "Cadastre ou corrija os tecnicos…".
- O importador de chamados atuais voltou exatamente ao comportamento anterior: ele continua exigindo técnico cadastrado.
- Continua valendo o apelido da equipe ("Equipe JH", "JH TELECOM REDES" → cadastro "JH Telecom").

### Pedido
Cadastrar sozinho os técnicos que divergirem.

### Implementado
- `backend/src/imports/historical-technicians.ts` (novo), função `registerMissingHistoricalTechnicians`. Ao confirmar a importação de finalizados, cada nome da planilha sem cadastro vira um técnico:
  - perfil Técnico, **inativo** (não aparece para atribuição);
  - status Indisponível, turno "Nao informado";
  - matrícula `HIST-XXXXXXXX`.
  - Os chamados ficam vinculados a esse cadastro.
  - Nomes iguais com caixa/acentos diferentes geram um cadastro só, e uma segunda importação não cadastra de novo.
- `server.ts`: a confirmação de finalizados não bloqueia mais. A resposta traz `createdTechnicians`.
- `ImportsPage.tsx`:
  - a prévia avisa quais técnicos serão cadastrados automaticamente;
  - a mensagem final lista os que foram cadastrados.

### Testes
- `backend/test/historical-technicians.test.ts` (novo): cadastro inativo com matrícula HIST, vínculo dos chamados, sem duplicar e sem recadastrar.
- Suíte: 121/121. Build do frontend OK.

### Ação do usuário
- Depois de importar, em **Técnicos**, ativar quem ainda trabalha e ajustar supervisor/turno/matrícula se quiser.

## 2026-11-04 — Importação dos chamados em atendimento (Em campo.xlsx)

### Situação
- A importação dos finalizados foi concluída: 4.836 chamados no banco, nenhum ativo.
- A planilha "Em campo.xlsx" tem 7 linhas, com as colunas ORDEM, TÉCNICO, DATA EVENTO, DATA/HORA ACIONAMENTO, TIPO DE EVENTO, AFETAÇÃO, EQUIPAMENTO, PLACA, PON, OBS, AREA, BDESK, BAIRRO e CARD.
- O importador de chamados atuais (`current-calls.ts`) exigia a coluna STATUS e a coluna ACIONAMENTO, então recusaria o arquivo.
- Duas linhas são a mesma OT (610150284850102, BDESK 672314), com técnicos diferentes (Robson e Lucas). O importador descartava todas as linhas de ordem repetida.
- O painel "Importar chamados atuais" existia no código, mas não aparecia em nenhuma tela.

### Implementado
- `current-calls.ts`:
  - STATUS passou a ser opcional. Sem a coluna, quem tem técnico entra como **Em campo** e quem não tem, como Aberto.
  - Quando há a coluna STATUS, ela aceita também Aberto, Atribuído, Deslocamento, Em campo/Em atendimento e Cancelado.
  - A coluna do card pode se chamar ACIONAMENTO ou CARD.
  - Sem card, o chamado usa as colunas TIPO DE EVENTO, BDESK e BAIRRO. A OBS vai para as observações ("Obs. da planilha: …").
- `server.ts` (prévia de chamados atuais): ordem repetida vira **um chamado só**, com o técnico da primeira linha. Os outros técnicos vão para as observações ("Também acionado: …"), e os identificadores das linhas são somados.
- `ImportsPage.tsx`: o painel voltou para Importações como "Chamados em aberto e em atendimento", com os textos ajustados à nova regra.

### Testes
- Novo teste do layout "Em campo" (sem STATUS, com CARD, com e sem card, com e sem técnico).
- Novo teste HTTP da junção de ordem repetida.
- Suíte: 123/123. Build do frontend OK.
- Prévia com a planilha real no servidor local (modo demo, sem gravar): 7 linhas viram 6 chamados Em campo, sem linhas inválidas e com horários corretos (02/11 19:42 em São Paulo = 22:42 UTC).

## 2026-11-04 — Correção: fundo escuro dos modais e preenchimento automático em "Novo usuário"

### Problema
- O fundo escuro dos modais (ex.: "Novo usuário") cobria só a área de conteúdo, e o botão da página ficava por cima dele. A causa foi a transição entre páginas (6b277e4): a animação usava `fill-mode: both`, então o `transform` continuava aplicado depois do fim. Com isso, o wrapper `.page-transition` virava o bloco de referência de todo `position: fixed` da página.
- O Chrome preenchia e-mail e senha do formulário "Novo usuário" com o login salvo do próprio usuário.

### Implementado (frontend)
- `page-transition.css`: a animação passou para `backwards`, então o efeito só vale enquanto ela roda e não sobra transform depois.
- `UsersPage.tsx`:
  - o formulário e os campos de nome e e-mail ganharam `autoComplete="off"` e nomes próprios;
  - a senha usa `autoComplete="new-password"`, para o navegador não preencher a senha salva.
- Textos com acento: "Usuários", "Novo usuário", "Salvar usuário", "Usuário ativo", "ADMINISTRAÇÃO".

### Validação
- Build OK.
- No navegador (modo demo), com o modal "Novo usuário" aberto, o fundo escuro ocupa a tela inteira e o wrapper fica com `transform: none`.

## 2026-11-04 — Importação de finalizados: relatório da operadora (Finalizadas.xlsx)

### Situação
- Planilha nova com 57 chamados finalizados em novembro, no layout do relatório da operadora: OS, BDESK, ORIGEM (BACKBONE/BDESK/FIELD), TME, CAUSA_SIMPLES, CIDADE, DATA_ABERTURA, DATA_FECHAMENTO, ELEMENTO, CLUSTER, OS_OFS, RECURSO, REDE etc. Não tem o card.
- Nove deles já estavam no sistema; 48 são novos.
- O importador de finalizados exigia a coluna ACIONAMENTO (card) e recusaria o arquivo.
- Os nomes em RECURSO vêm escritos de outro jeito ("MARCOS ANTONIO RAMOS", "PAULO HERCULANO FIRMO", "RICARDO MENDES DE SOUSA"), e o cadastro automático criaria quase-duplicados.

### Implementado (`backend/src/imports/historical-activations.ts`)
- **Segundo formato aceito**: quando a planilha não tem o card, o importador procura OS + DATA_ABERTURA + DATA_FECHAMENTO.
  - Tipo pela ORIGEM: BACKBONE → NOC TX (Backbone no IGP); BDESK → NOC ACESSO; FIELD → ACIONAMENTO FIELD (Acesso no IGP).
  - Motivo vem de CAUSA_SIMPLES; técnico vem de RECURSO, convertido para nome com iniciais maiúsculas.
  - OLT vem de ELEMENTO quando for OLT. Se não for (trecho do backbone ou "CABO 12"), o ELEMENTO vai para as observações, junto com TME, clientes afetados e cluster.
  - Região tirada da CIDADE, conferindo com as regiões conhecidas do mapa de OLTs: "Sao Paulo/guaianases" → GUAIANASES, "Guarulhos Ii" → GUARULHOS 2, "Maua/conquista" → CONQUISTA, "Sao Paulo/itaim" → ITAIM PAULISTA.
  - Ordens repetidas seguem a mesma regra do formato com card.
- **Datas "AAAA-MM-DD HH:MM:SS"** são lidas como horário de São Paulo; antes, `new Date()` usava o fuso do servidor. O TME do relatório confere: 14:47:57 → 23:19 = 8,52 h.
- **Comparação tolerante de nomes de técnico**, usada só quando não há nome idêntico. Exige o mesmo primeiro nome (3+ letras) e que os nomes do nome mais curto apareçam, na ordem, no mais longo. Tolera:
  - sobrenome a mais ou a menos;
  - "Sousa"/"Souza" (uma letra de diferença em nomes de 5+ letras);
  - "Junio"/"Junior" (prefixo de 4+ letras).
  - Com mais de um candidato, vale o único ativo; senão, não escolhe.
  - Simulação com os 22 nomes da planilha contra os cadastros reais: 21 casaram e só "TIAGO DA SILVA" será cadastrado. "CARLOS ROBERTO OLIVEIRA JUNIO" casa com "Carlos Junior", cadastrado na importação anterior.

### Não alterado (decisão pendente)
- No IGP, "GUARULHOS" sem número conta como **SP** (regra coberta por teste: `classifyIgpArea`). Sete chamados FIELD desta planilha têm cidade "GUARULHOS" e vão contar em SP. "COTIA" (cluster Alto Tietê no relatório) também conta em SP.

### Testes
- Novos testes do layout do relatório (tipos, datas, região, técnico, observações) e da comparação tolerante de nomes (inclui casos que não devem casar).
- Suíte: 125/125 (rodada duas vezes; na primeira, o teste do coletor OFS estourou o tempo de subida do servidor, e passou sozinho e na segunda rodada completa).

## 2026-11-04 — IGP: regiões pelos clusters da operadora

### Problema
No IGP, a região SP mostrava 49 ordens em novembro, mas o relatório da operadora tem 27 no cluster "C.8 | Sao Paulo". `classifyIgpArea` mandava para SP tudo o que não fosse GRU ("GUARULHOS 1–5") ou Alto Tietê, incluindo:
- ABC: Diadema e Conquista, 3 ordens;
- "GUARULHOS" sem número, 7 ordens;
- chamados sem região, 2 ordens.

### Regra nova (`backend/src/igp.ts`, definida pelo usuário: "SP é só o cluster C.8")
- **SP (C.8)**: São Paulo, Cidade Tiradentes (1–3), Guaianases (1–2), Itaim Paulista, Iguatemi, São Mateus, São Miguel Paulista, São Rafael, Aricanduva e Penha.
- **GRU (C.12)**: "GUARULHOS", com ou sem número de 1 a 5.
- **Alto Tietê (C.11)**: o conjunto anterior + COTIA.
- **OUTRAS**: ABC, regiões desconhecidas e "Nao informada". Não entram em SP, GRU nem Alto Tietê, só em "Todas".
- O teste de `classifyIgpArea` foi atualizado para a regra nova; antes ele garantia GUARULHOS e DIADEMA como SP.

### Resultado esperado em novembro
- SP passa de 49 para 37.
- A diferença de 10 para as 27 do relatório são chamados da primeira planilha (Finalizados.xlsx) que não estão no relatório da operadora. Seis deles fecharam depois do horário de corte do relatório (último fechamento: 03/11 14:08). Pendente: decisão do usuário sobre manter ou remover esses 10.

### Testes
- Suíte: 125/125.

## 2026-11-04 — Nova página "Análise de prazo" (Indicadores)

### Pedido
Página com: técnico mais ofensor em prazo, bairros que mais perdem prazo, horário que mais perde prazo, média de entrantes e um estudo de por que mais se perde prazo das 18h às 06h. Durante o trabalho, o usuário pediu também filtro de área igual aos clusters e a média de execução por técnico.

### Regras
- Base: chamados **Finalizados** com Data Fim no período, como no IGP.
- Perde prazo quem passa de **6h** entre abertura e fim; outlier, acima de 9h.
- Noite é a **abertura entre 18h e 06h**, no horário de São Paulo.
- **Média de entrantes** usa todos os chamados abertos no período, de qualquer status, divididos pelos dias do período; no mês corrente, conta até hoje.
- **Execução média (TME)** por técnico vai da abertura à Data Fim, como o TME do relatório da operadora. As planilhas repetem a abertura como "Data Acionamento", então o tempo "após acionamento" só é usado quando o acionamento é pelo menos 1 minuto depois da abertura. Sem isso, a coluna não aparece.
- **Clusters** iguais aos do IGP: C.8 São Paulo, C.12 Guarulhos, C.11 Alto Tietê e Outras (ABC e sem cluster).

### Implementado
- Backend:
  - `backend/src/sla-analysis.ts` (novo), função `calculateSlaAnalysis`. Calcula:
    - totais;
    - ranking de técnicos e de bairros (sem bairro, entra a região) por perdas;
    - perda por hora de abertura;
    - entrantes por dia, por dia da semana e por hora;
    - estudo noturno.
  - O estudo noturno traz:
    - comparação dia × noite;
    - quantos noturnos atrasados só fecharam depois das 06h e a hora em que fecharam;
    - perda por hora de abertura noturna, por tipo, por técnico, por motivo e por dia da semana;
    - frases automáticas com as conclusões.
- Rota `GET /api/dashboards/prazo?from&to&area` (permissão `dashboard.view`, respeita o escopo de supervisor).
- Frontend:
  - Nova página `frontend/src/pages/SlaAnalysisPage.tsx` + `frontend/src/sla-analysis.css`, no menu Indicadores ("Análise de prazo", `/analise-prazo`).
  - Período: Este mês, Mês anterior, Últimos 3 meses ou Personalizado. O link aceita `?de=AAAA-MM-DD&ate=AAAA-MM-DD`.
  - Filtro por cluster.
  - Cores de status: até 11% de perda (meta de 89% no prazo), até 15% (mínimo de 85%) e acima disso.

### Validação
- `backend/test/sla-analysis.test.ts` (novo, 3 testes, conferidos em UTC e em São Paulo).
- Suíte: 128/128. Build OK.
- Conferido com dados reais das planilhas (setembro/2026), num proxy local temporário que só lia as planilhas e foi apagado:
  - 1.170 finalizados, 58,6% perderam prazo, 37,5 entrantes por dia;
  - à noite 87,8% de perda contra 55% de dia;
  - 95 de 115 noturnos atrasados só fecharam depois das 06h.
- Capturas em 1440 px e 500 px.

## 2026-11-04 — Importação de finalizados: cards com "Tarefa OFS", coluna ORDEM e coluna REGIAO

### Problema
A nova Finalizados.xlsx (10 linhas) mostrava só 7 novas e "3 campos obrigatórios ausentes". As linhas 2, 3 e 9 trazem o número como `- Tarefa OFS: 6131...`, rótulo que o leitor de cards não reconhecia. Por isso ficavam sem O.S. e eram descartadas, embora a coluna ORDEM tivesse o número. A linha 7 (OLT `br.sp.cti...`) aparecia com região "Nao informada", mesmo com REGIAO = CIDADE TIRADENTES.

### Implementado
- `card-normalizer.ts`: "Tarefa OFS" (e "Tarefa da/do OFS") passa a ser lido como Tarefa Office Track. Vale também para cards recebidos pelo WhatsApp.
- `historical-activations.ts`:
  - Se a mensagem não trouxer O.S./Office Track, usa a coluna ORDEM. O número de 15 dígitos vira texto sem notação científica, e valores como "6.13E+14" são ignorados.
  - Se a OLT e a mensagem não indicarem a região, usa a coluna REGIAO.

### Validação
- Planilha real: 10 de 10 reconhecidas, linha 7 com CIDADE TIRADENTES.
- Novo teste em `historical-activations.test.ts`. Suíte: 129/129. tsc OK.

## 2026-11-04 — Acionamentos pendentes lidos antes do "Tarefa OFS"

### Problema
O card BDESK 673092 chegou às 12:11, antes do deploy que passou a reconhecer "Tarefa OFS" (12:13), e ficou como "Sem ordem identificada". A leitura fica gravada no banco, então aceitá-lo criaria o chamado com o BDESK no lugar da O.S.

### Implementado
- `supabase/client.ts`, função `refreshStoredAnalysis`: para acionamentos **pendentes** sem O.S./Office Track gravados, relê a mensagem original com o leitor atual e completa só esses campos, sem sobrescrever nada.
- Isso vale na listagem (o card passa a mostrar a O.S.) e no Aceitar (o chamado é criado com a O.S. certa).
- Nada é gravado no banco por causa disso; aceitos e recusados não mudam.

### Validação
- Mensagem do card da captura: office_track 610151196050102, BDESK 673092.
- Suíte: 129/129. tsc OK.

## 2026-11-04 — Abertura pelo horário do card no grupo + Data/Hora do Evento

### Pedido
A abertura do chamado criado por acionamento usava o horário do clique em Aceitar (ex.: 12:18), e não o envio do card no grupo (12:11). O usuário quer a abertura = horário da mensagem no grupo e a "Data/Hora do Evento" do card (11:39) guardada, para medir o gap entre o evento e o acionamento.

### Implementado
- Migration `supabase/migrations/202611040001_calls_event_at.sql`: coluna opcional `calls.event_at timestamptz`. Aplicada em produção com autorização do usuário.
- `timezone.ts`, função `parseSaoPauloDateTime`: lê "DD/MM/AAAA HH:MM[:SS]" (aceita "*", "às", "h") como horário de São Paulo e devolve ISO em UTC. Datas inválidas viram vazio.
- Aceitar acionamento (Supabase e memória):
  - `opened_at` = `received_at` da mensagem, ou agora se não houver;
  - `event_at` = Data/Hora do Evento do card, quando existir.
- `Call.eventAt` no backend e no frontend. O detalhe do chamado mostra "Data/Hora do evento" e "Gap evento → acionamento" quando há evento.

### Validação
- Testes do parser e da abertura no Aceitar. Suíte: 130/130. tsc backend e frontend OK.
- Chamados já criados por acionamento: 3 (610151196050102, 610011417080102, 610011231680102), corrigidos com autorização do usuário: abertura = horário da mensagem e evento preenchido (11:39, 08:59, 08:59).

## 2026-11-04 — Importação "Em campo hoje": status GIGA, abertura pelo envio no grupo e data do evento

### Problema
"Em campo hoje.xlsx" (23 linhas) tinha 8 linhas com STATUS "GIGA", que eram recusadas. Seis DATA EVENTO digitadas como "4/11/26" eram lidas como 11/04. A abertura vinha da DATA EVENTO, e não do envio do card no grupo.

### Implementado (`backend/src/imports/current-calls.ts`)
- STATUS **GIGA** (em campo, monitorado pela GIGA+) entra como Pendente (Aberto), por decisão do usuário.
- Abertura = **DATA/HORA ACIONAMENTO** (envio no grupo), a mesma regra do Aceitar acionamento. A **DATA EVENTO** vai para `eventAt`. Sem acionamento, a abertura usa o evento.
- `fixSwappedEventDate`: se o evento cair fora da janela de 3 dias antes do envio no grupo, tenta com dia e mês trocados, no relógio de São Paulo.
- `store/calls.ts`: as inserções gravam `event_at`.

### Validação
- Planilha real: 23 de 23 linhas lidas (antes eram 15), com eventos de 04/11 corretos.
- Os 9 Finalizados sem Data-Fim continuam sendo importados sem data fim, como antes, e não entram no IGP até ter a data.
- Linha 4 (610150284850102) tem acionamento 08:08 antes do evento 17:38 e repete a O.S. da linha 6 (Cancelado); a prévia junta as duas.
- Novo teste em `current-calls.test.ts`. Suíte 130/130 + novo teste. tsc OK.

## 2026-11-04 — "Chamados abertos" com a mesma contagem da lateral

### Problema
A lateral mostrava 4 e a lista "Chamados abertos" só 2. A lateral conta os chamados **sem técnico em qualquer status não fechado**, e a lista só mostrava **status Aberto** sem técnico. Os chamados 12665760 e 12665731 tinham passado de Aberto para Atribuido pelo seletor de status às 12:50, sem técnico. Com isso sumiram de "Chamados abertos" e de "Em atendimento" (que exige técnico).

### Implementado
- `frontend/src/pages/CallsPage.tsx`: "Chamados abertos" lista os status Aberto, Atribuido, Deslocamento e Em campo **sem técnico**, a mesma regra da lateral. Os chamados nesse estado voltam a aparecer, com o status atual.
- `backend/src/server.ts`, `PATCH /api/chamados/:id`: recusa (422) colocar o chamado como Atribuido, Deslocamento ou Em campo sem técnico, e também tirar o técnico de um chamado nesses status. A mensagem aparece na tela: "Atribua um tecnico antes de colocar o chamado como …".

### Validação
- Banco: 3 chamados sem técnico não fechados (12665760 e 12665731 Atribuido, 610127218160102 Aberto). Agora todos aparecem na lista.
- Backend 131/131, build do frontend OK.

## 2026-11-04 — Modo escuro com botão de tema no topo

### Pedido
Criar um modo escuro e colocar no topo um ícone para trocar de tema.

### Como funciona
- **Botão no topo** (`Shell.tsx`, ao lado do sino): lua no claro e sol no escuro. A escolha fica salva no navegador (`localStorage` `jh-redeflow:theme`). Sem escolha salva, segue o tema do sistema operacional e acompanha se ele mudar (`src/theme.ts`).
- **Sem piscar ao abrir**: um script no `index.html` aplica `data-theme` antes do React carregar.
- **Cores**: os 30 CSS originais **não foram alterados**.
  - `frontend/scripts/generate-dark-theme.mjs` (PostCSS) gera `src/theme-dark.css`. Cada declaração de cor ganha uma cópia sob `:where(:root[data-theme="dark"])`, com a cor convertida em OKLCH conforme o papel:
    - fundo: cartão `#181c22`, página `#12151b`;
    - borda: `#33383f`;
    - texto: tinta `#dfe5ef`;
    - gráfico: cores de status mais claras.
  - O `:where()` não soma especificidade, e o arquivo replica todas as declarações de cor na ordem do `main.tsx`. Por isso a cascata do escuro é idêntica à do claro, inclusive `border: 0`, `transparent` etc.
  - O gerador roda no `npm run build` (e com `npm run theme:dark`), então CSS novo já ganha a versão escura sem trabalho manual.
  - Ajustes manuais ficam em `src/theme-dark-manual.css`: `color-scheme`, campos sem fundo próprio, cores do indicador de prazo.
- `call-cells.tsx`: as cores inline do indicador de prazo usam `var(--sla-*)` com o valor do claro como fallback.
- A imagem do "Copiar imagem" continua clara de propósito, porque é para compartilhar.
- `postcss` declarado como devDependency do frontend (antes vinha só pelo Vite).

### Validação
- Conferido no escuro (1366 px, dados demo): Visão geral, Chamados abertos, detalhe do chamado, IGP, Análise de prazo, Importações, Painel diário, Usuários e o modal de novo usuário.
- Troca para claro e para escuro com a escolha salva. O claro ficou igual ao anterior.
- Build OK. A tela de login no escuro não foi conferida visualmente; as regras dela são geradas igual às demais.

## 2026-11-04 — Fila do mais antigo para o mais novo + aviso de atualização obrigatória

### Pedidos
1. Ordenar os chamados "do maior para o menor em quesito do prazo", ou seja, quem está há mais tempo na fila primeiro.
2. Quando o sistema for atualizado, mostrar para cada pessoa logada um aviso de **atualização obrigatória** com o botão **Atualizar**, para ninguém ficar na versão anterior.

### Implementado
- **Ordem** (`CallsPage.tsx`): Chamados abertos, Em atendimento e as filas de equipe pedem `sort=openedAt&direction=asc`, do mais antigo (mais perto de estourar ou já estourado) para o mais novo. Finalizados e cancelados continuam do mais recente para o mais antigo. O servidor e a função SQL já aceitavam esse parâmetro; nada mudou no backend.
- **Versão do build** (`vite.config.ts`):
  - cada build ganha um identificador (commit da Vercel `VERCEL_GIT_COMMIT_SHA` ou, sem ele, o horário do build);
  - o identificador vai no bundle (`__APP_BUILD__`) e em `/version.json`.
- **Aviso** (`components/UpdateNotice.tsx` + `update-notice.css`, montado no `Shell`, só para quem está logado):
  - confere `/version.json` a cada 60 s, ao voltar para a aba e ao focar a janela, sempre sem cache;
  - se a versão publicada for outra, cobre a tela com "Atualização obrigatória — Nova versão do sistema", sem botão de fechar;
  - **Atualizar** recarrega a página com a versão nova;
  - desligado no modo dev.
- Só deploys do frontend (Vercel) disparam o aviso. Atualizações apenas do backend (Render) não exigem recarregar a tela.

### Validação
- Build de produção servido localmente (API demo):
  - com o `version.json` trocado para outra versão, o aviso apareceu em menos de 1 s ao focar a janela;
  - depois de publicar o build novo, **Atualizar** carregou o bundle novo e o aviso não voltou.
- A fila de abertos veio em ordem crescente de abertura (RF-240917 07:45 antes de RF-240918 08:12).
- O aviso também tem versão escura (gerada).
- Build OK.
- Observação: o primeiro deploy com este recurso ainda não mostra aviso para quem já está com a versão antiga aberta, porque essa versão não tem o verificador. A partir do deploy seguinte, todos recebem o aviso.

## 2026-11-04 — Status real (online/offline) em Usuários

### Pedido
O status "Ativo" em Usuários deve ser real, para saber quem está logado ou não.

### Implementado
- `backend/src/presence.ts` (novo): guarda em memória o último contato de cada usuário.
  - O middleware `auth` registra o contato em toda requisição autenticada do sistema. O app aberto consulta notificações a cada 15 s, ou 1 min em aba de fundo.
  - **Online** = último contato há até **2 min**.
  - Fica em memória porque o Render tem uma instância só, então não precisou de migration. Se o servidor reiniciar, todos voltam a aparecer no próximo contato (≤ 15 s), mas o "visto há" de quem estava offline se perde.
- `GET /api/users` devolve `online` e `lastSeenAt`. Novo `POST /api/auth/logout`: ao clicar em Sair, o usuário fica offline na hora.
- `UsersPage.tsx`:
  - coluna Status mostra **Online** (ponto verde pulsando), **Offline · visto há X min/h** ou **Conta inativa**;
  - filtro com Online agora, Offline e Contas inativas;
  - a lista recarrega a cada 30 s.
- A extensão do OFS (escopo próprio) não conta como online.

### Validação
- Teste `presence.test.ts`. Suíte 132/132. tsc OK.
- Demo local: admin Online e os outros Offline. `POST /api/auth/logout` responde 204.

## 2026-11-04 — Barra do topo fixa

### Pedido
A barra de cima (menu, caminho, tema, notificações e perfil) deve ficar fixa e não descer junto com a página.

### Implementado
- `frontend/src/sidebar.css`: `.topbar` com `position: sticky; top: 0`. A camada fica em `z-index` 8 no desktop, abaixo da lateral (10) e acima do conteúdo (1–2), e em 3 no celular, abaixo do escurecimento (4) e do menu lateral (5).
- Modais e avisos (z-index 20+) continuam por cima da barra.

### Validação
- Desktop 1366×700: com a página rolada 900 px, a barra continua em `top: 0`. Conferido no escuro.
- Celular 375 px: barra fixa; com o menu aberto, o escurecimento cobre a barra.

## 2026-11-04 — Lateral: perfil fixo, só as abas rolam

### Pedido
Na barra lateral, o perfil deve ficar fixo. Só as abas rolam quando não cabem, e o perfil não deve sumir.

### Implementado
- `frontend/src/sidebar.css`: a lateral não rola mais inteira (`overflow: hidden`). A marca (topo) e o perfil (rodapé) ficam fixos, e só o `nav` das abas rola (`flex: 1; min-height: 0; overflow-y: auto`), com barra de rolagem fina.
- `theme-dark-manual.css`: cor da barra de rolagem no escuro (o gerador a trataria como fundo e ela ficaria invisível).

### Validação
- 1280×560: as abas rolam, a marca fica no topo e o perfil fica visível no rodapé; a lateral em si não rola.
- Lateral recolhida: o avatar continua no rodapé.
- Celular 375×640 com menu aberto: as abas rolam e o perfil fica fixo embaixo.

## 2026-11-04 — Tabelas com rolagem própria (só as linhas descem)

### Pedido
Nas telas com tabela, em vez de a página inteira descer, delimitar a área para que só os chamados rolem, como no vídeo de referência (outro sistema do usuário, agendamentos-jh).

### Implementado
- `frontend/src/hooks/useFitToViewport.ts` (novo): mede onde o cartão da tabela começa e ajusta a altura dele ao que sobra da janela.
  - Acompanha redimensionamento, quebra de linha do cabeçalho e filtros abertos, e desconta o espaçamento inferior para a página não rolar alguns pixels.
  - Modo `fill` (altura fixa) e `max` (só limite). Mínimo de 420 px.
  - Só no desktop (> 900 px); no celular, onde a tabela vira cartões, nada muda.
- `CallsPage.tsx` (Chamados abertos, Em atendimento, Finalizados e cancelados e as filas da equipe): o cartão preenche a tela. Busca, filtros e paginação ficam fixos, só as linhas rolam e o cabeçalho das colunas fica preso no topo.
- `UsersPage.tsx` e `TechniciansPage.tsx` (modo `max`): lista longa rola dentro do cartão com cabeçalho preso; lista curta continua compacta.
- `calls-queue.css`: regras `.is-fit`, `.fit-table-panel` e `.fit-scroll` e barra de rolagem fina (versão escura em `theme-dark-manual.css`).

### Validação
- 1366×900:
  - Chamados abertos com lista longa (linhas clonadas no navegador): a área rola, o `<th>` fica no topo da área e a página não rola (0 px de sobra).
  - Usuários: rolagem interna com cabeçalho preso.
  - Técnicos: lista curta sem rolagem.
- 1366×600: vale o mínimo de 420 px e a página rola o restante.
- Celular 375 px: sem altura fixa.
- Build OK.

## 2026-11-04 — Preview local ao vivo (localhost:8000)

### Pedido
Ter um servidor local, como `python -m http.server 8000`, para acompanhar as mudanças em tempo real e opinar antes de elas irem para a main. A main só recebe o que o usuário autorizar.

### Implementado
- `scripts/preview-local.mjs` + `npm run preview` (raiz) + `Abrir preview.bat` (duplo clique: abre o navegador e sobe o preview).
  - **Frontend** (Vite) em `http://localhost:8000`, que recarrega sozinho a cada arquivo salvo (HMR).
  - **API** em `http://localhost:3333`, sempre com **dados de demonstração em memória**. As variáveis do Supabase são forçadas vazias, então nada lê ou grava em produção, mesmo com `backend/.env`. O backend reinicia sozinho (`tsx watch`).
  - CORS da API local liberado para a porta 8000. Login demo: `admin@jhtelecom.com` / `RedeFlow@2026`.
  - Ctrl+C encerra os dois.
- Fluxo combinado: as mudanças aparecem no preview → o usuário avalia → commit/push só com autorização.

### Validação
- `npm run preview` subiu os dois. O login demo funcionou em localhost:8000 e o HMR do Vite conectou.
- Ctrl+C liberou as portas 8000 e 3333 sem sobrar processo.

## 2026-11-04 — 9 melhorias inspiradas no vídeo de referência

### Pedido
Implementar as 9 sugestões tiradas do vídeo do outro sistema do usuário (agendamentos-jh).

### Implementado
1. **Faixa "OS vencendo"**
   - Backend: `backend/src/due-soon.ts` + `GET /api/chamados/vencendo`, com escopo de supervisor. Lista os chamados ativos que estouram as 6h nos próximos 30 min, do mais urgente ao menos, e conta os já estourados.
   - Frontend: `components/DueSoonBanner.tsx` + `due-soon.css`. Faixa vermelha fixa embaixo da barra do topo, com cada OS e o tempo que falta; clicar abre o chamado e "Ver fila" leva aos abertos.
   - Busca a lista a cada minuto e recalcula o "falta" a cada 30 s; some quando não há nada vencendo. Avisa as tabelas ajustadas à tela para recalcular a altura.
2. **Ordenar clicando no cabeçalho** (`CallsPage.tsx`): Ordem/Protocolo, Técnico, Na fila/Abertura, Local e Status alternam crescente e decrescente (ícone ▲▼ e `aria-sort`), e a escolha é lembrada por tela. O padrão das filas continua o mais antigo primeiro.
3. **Contagem nas abas de status**: cada aba (Todos, Finalizado, Cancelado, Baixar / Atribuído, Deslocamento, Em campo) mostra quantos chamados há com os filtros atuais, com uma consulta leve por aba (`pageSize=1`).
4. **Busca rápida Ctrl+K** (`components/CommandPalette.tsx`, com botão "Buscar... Ctrl K" na lateral): acha telas do menu e chamados (ordem, BDESK, técnico, região, OLT; a partir de 3 caracteres). Navega com setas, Enter e Esc.
5. **Seções da lateral recolhíveis**: clicar em Operação, Indicadores, Equipes ou Administração recolhe a seção, e a escolha fica salva no navegador. Recolhida, a seção ainda mostra a tela atual; com a lateral só de ícones, tudo fica aberto.
6. **Exportar Excel** nas filas de chamados: exporta todas as páginas (100 por vez, 4 em paralelo, com progresso no botão) com os filtros e a ordem atuais.
   - Colunas: ordem, BDESK, Office Track, tipo, motivo, região, bairro, endereço, OLT, Slot/PON, técnico, supervisor, status, status OFS, abertura, Data Fim, tempo (h) e situação do prazo.
   - A biblioteca `xlsx` só carrega ao exportar.
7. **Mapa de calor dia × horário** na Análise de prazo: o backend (`sla-analysis.ts`, campo `heatmap`) calcula a perda por dia da semana × faixa de 6h da abertura. A tela mostra a tabela com cores da meta (até 11% / até 15% / acima), o número escrito em cada célula e a coluna "Dia todo".
8. **Modo TV** (`pages/TvModePage.tsx` + `tv-mode.css`, menu Indicadores → Modo TV, `/modo-tv`): tela cheia escura com letras grandes.
   - Visões: Agora (KPIs, ativos por técnico, hoje), Mais antigos (top 10 com tempo na fila) e Prazo do mês (perda, outliers, entrantes, técnicos e bairros que mais perdem).
   - Troca de visão a cada 20 s e atualiza a cada minuto, com faixa de OS vencendo, relógio e "ao vivo". Teclas: setas trocam a visão, espaço pausa, Esc sai; tem botão de tela cheia.
9. **Ajuda "?"** ao lado do nome da tela na barra do topo (`components/HelpTip.tsx`): explica o que cada tela mostra e as regras dela (prazo 6h/9h, clusters, online etc.).

### Validação
- Backend: novo `due-soon.test.ts` e o heatmap coberto em `sla-analysis.test.ts`. Suíte 133/133. tsc OK.
- Preview local (dados demo, tema escuro):
  - Ctrl+K achou as RF-2409x e Enter abriu o chamado;
  - seção Equipes recolheu e ficou salva;
  - a ajuda abriu;
  - modo TV com as 3 visões;
  - ordenação alterna e as contagens das abas batem (Todos 2, Atribuído 1, Em campo 1);
  - o Excel gerou "Chamados em atendimento 04-11-2026.xlsx" (18 KB; download interceptado no teste).
- A faixa de vencimento e o mapa de calor foram conferidos com respostas simuladas no navegador, porque o demo não tem chamados perto das 6h nem finalizados.
- Build OK.

## 2026-11-04 — Telas de tabela: cabeçalho compacto e tabela maior

### Pedido
Nas telas com tabela, diminuir o cabeçalho (título e texto explicativo), subir os botões e usar mais a largura (mais para a esquerda), para a tabela ficar maior.

### Implementado
- `frontend/src/calls-queue.css`: regra com `.content:has(.cq-panel, .fit-table-panel)`, só no desktop (> 900 px), valendo para Chamados abertos, Em atendimento, Finalizados e cancelados, filas da equipe, Usuários e Técnicos.
  - O rótulo "OPERAÇÃO"/"ADMINISTRAÇÃO" some, porque já aparece no caminho da barra do topo.
  - Título de 29 para 22 px e texto de 13 para 12 px.
  - Botões alinhados ao centro da linha do título.
  - Margem do conteúdo de 42/48 px para 16/24 px e sem a largura máxima de 1400 px.
- O ajuste de altura da tabela (`useFitToViewport`) aproveita o espaço ganho automaticamente.

### Validação
- 1600×900 (Em atendimento): o cartão da tabela passou a começar em 149 px do topo (antes ~290) e a ocupar 1312 px de largura; a página não rola.
- Usuários e Técnicos conferidos no tema claro. Celular sem mudança.

## 2026-11-04 — Correção: trocar status de chamado encerrado (Baixar → Finalizado)

### Problema (vídeo do usuário)
Em Finalizados e cancelados, trocar o status de 610150206690102 de "Baixar" para "Finalizado" sumia com a tabela e mostrava "Não foi possível carregar os chamados — Chamado não encontrado".
- `updateSupabaseCall` bloqueava qualquer edição de chamado encerrado e devolvia vazio, que a rota transformava em 404 "não encontrado", embora a lista oferecesse a troca.
- A tela usava o mesmo estado de "erro ao carregar" para o erro ao salvar, então a lista inteira sumia.

### Implementado
- `supabase/client.ts`: chamado encerrado (Finalizado/Cancelado/Baixar) aceita **troca de status**, para outro status encerrado ou para reabrir. As demais edições continuam travadas.
- `store/calls.ts` (`prepareCallUpdate`): entre status encerrados, mantém a Data Fim original; ao **reabrir** (encerrado → ativo), limpa a Data Fim para não contar no IGP nem na Análise de prazo.
- `PATCH /api/chamados/:id`: edição de encerrado sem troca de status responde **409** "Chamado encerrado: só o status pode ser alterado…" em vez de 404.
- `CallsPage.tsx`:
  - erro ao trocar status aparece como aviso fechável acima da tabela (com a ordem), sem esconder a lista;
  - as contagens das abas recalculam depois de cada troca.

### Validação
- Novo `closed-status-change.test.ts` (Baixar → Finalizado mantém a Data Fim; reabrir limpa; ativo sem mudança). Suíte 136/136.
- Preview (demo):
  - Em campo → Baixar → Finalizado → Cancelado pela lista: PATCH 200, Data Fim mantida e abas atualizadas (Cancelado 1, Baixar 0);
  - recusa simulada (409) mostrou o aviso com a tabela visível.

## 2026-11-04 — Novo "Gerar imagem" (tabelas legíveis para WhatsApp)

### Problema
As imagens geradas (fila de chamados e Painel diário) estavam ilegíveis e diferentes do sistema de referência mostrado pelo usuário:
- cabeçalho duplicado ("JH TELECOM / REDEFLOW" + título, e o título de novo dentro do cartão);
- imagens largas demais (1200–1660 px) com letra de 10–12 px;
- escala variável.

### Implementado
- `frontend/src/lib/report-image.ts` (novo, gerador único): monta a imagem a partir dos **dados**, não do HTML da tela.
  - Um título só (rótulo + título + subtítulo + selo de contagem) e larguras de coluna de leitura.
  - Letra de 17 px (sub 14 px, cabeçalho 14 px), etiquetas coloridas por tom (azul, ciano, âmbar, verde, vermelho, cinza; zero esmaecido), linha de total destacada e rodapé com data/hora.
  - Sempre em **3×** (até 80 MP).
  - Depois de gerar: copia para a área de transferência, baixa o PNG e dispara o aviso.
- `components/ImageReadyToast.tsx` (novo, montado no Shell): aviso com miniatura, "Imagem copiada e baixada" (ou "Imagem baixada"), botões **Copiar imagem** e **Compartilhar** (menu do sistema com WhatsApp, quando o navegador permite). Some em 12 s.
- `CallsPage.tsx` (Copiar imagem das filas): Ordem/BDESK, Técnico/Supervisor, Na fila ou Tempo total (etiqueta da regra 6h/9h + "desde"), Evento/Motivo, Local (bairro, região · OLT) e Status (etiqueta + OFS). Selo com o total; subtítulo com página/filtros e data.
- `ManualProductionPage.tsx` (Painel diário): Produção por atividades, Produção por técnico (respeita a busca) e Ordens iniciadas no mesmo padrão. Subtítulo com arquivo e horário da base; total em destaque.
- Removido `lib/image-export.ts` (sem uso).

### Validação
- Preview:
  - fila "Em atendimento" gerou PNG de 4164×1419 (3×), aviso exibido e "Copiar imagem" funcionou;
  - modelo de Produção por técnico com 28 técnicos: 3504×5985, nomes e números legíveis, total destacado.
- tsc e build OK.

## 2026-11-04 — Contraste legível nos dois temas

### Problema
No modo TV, a tabela "Chamados ativos mais antigos" tinha texto azul-escuro sobre fundo escuro. O modo TV é escuro, mas herdava a cor de texto do tema claro. O usuário pediu contraste sempre: texto escuro no claro e texto claro no escuro.

### Auditoria
Ferramenta `frontend/scripts/contrast-audit.js`: mede o contraste WCAG de cada texto visível contra o fundo real, em 17 telas, nos dois temas.
- **Escuro**:
  - azul da marca usado como texto (rótulos, links, item ativo do menu, abas, avatar) a 3,8:1;
  - contador amarelo com texto claro a 1,45:1;
  - botões azuis e vermelhos com branco a 3,6–4,47:1;
  - botão de cargo com o cinza padrão do navegador (1,75:1).
- **Claro**: cinzas de texto (#9aa6b5, #8b98aa, `--muted` #6f7d93…) a 2,3–4,2:1; verde e laranja de texto a 2,97–3,35:1; botões Aceitar e Recusar a 4,0–4,3:1.

### Implementado
- `scripts/generate-dark-theme.mjs`:
  - no escuro, `var(--blue)` e `var(--blue-deep)` em propriedades de **texto** viram `var(--accent-text)` (azul claro `#86b6ff`);
  - **novo** `src/theme-light-contrast.css` (gerado): replica as declarações de cor de texto do tema claro (mesma ordem e peso) e escurece as claras demais, mantendo o matiz, até ~4,5:1. Branco em botão colorido e o modo TV ficam de fora.
- `theme-dark-manual.css`: `--blue` dos botões mais fechado (`#1a5fd6`) e contador amarelo com texto escuro.
- `src/contrast-fixes.css` (novo, vale nos dois temas e ganha versão escura gerada):
  - fundo transparente no botão de cargo;
  - contador vermelho `#c42e3b`;
  - avatar e contagem da aba selecionada em azul escuro;
  - `--muted` `#5b697e`;
  - verde de texto `#137a52` ("Online", "Ativo", setas).
- `tv-mode.css`: cores de texto próprias para tabela, cartões, listas e "sem técnico", e aba ativa `#1a5fd6`.
- `UsersPage.tsx`: botão Apagar `#c42e3b`.

### Validação
- Auditoria nas 17 telas (Visão geral, as 3 filas, Repetidos, Acionamentos, Painel diário, IGP, Análise de prazo, Técnicos, Supervisores, Importações, Usuários, Cargos, Configurações, Detalhe do chamado, Modo TV, incluindo a visão "Mais antigos"), nos temas claro e escuro: **nenhum texto abaixo do mínimo**.
- Build OK.

## 2026-11-04 — Cargos e permissões redesenhado + abas visíveis por cargo

### Pedido
Poder ocultar abas do menu por cargo, deixando só as que o usuário escolher, e reformular a tela de Cargos e permissões.

### Implementado
- Migration `supabase/migrations/202611040002_roles_hidden_tabs.sql`: `roles.hidden_tabs text[] default '{}'`. Aplicada em produção com autorização do usuário; nenhum cargo mudou.
- Backend:
  - `Role.hiddenTabs`: lido em `listSupabaseRoles`, `getSupabaseRole` e no perfil logado; gravado em `addRole` e `updateRole`.
  - `POST` e `PATCH /api/roles` aceitam `hiddenTabs` (caminhos `/...`, até 40).
  - O próprio cargo não pode ocultar "Cargos e permissões" (409).
- Frontend:
  - `lib/nav-items.ts` (novo): a lista de abas saiu do `Shell` e é usada pelo menu e pela tela de Cargos.
  - `Shell.tsx`: aba oculta some do menu e da busca Ctrl+K e **fica bloqueada pelo link** ("Acesso não permitido"). Se a Visão geral estiver oculta, o usuário vai para a primeira aba permitida.
  - `pages/RolesPage.tsx` (redesenhada, sem janela por cima): lista de cargos à esquerda (abas visíveis, permissões, "seu cargo") e editor à direita:
    - nome e descrição;
    - **Abas do menu** por seção, com interruptor (aba sem a permissão necessária aparece travada com o motivo), "Mostrar todas" e "Ocultar todas";
    - **Permissões** agrupadas (Indicadores, Chamados, Acionamentos…) com descrição e código;
    - barra fixa com "Alterações não salvas", Descartar e Salvar.
- Validação:
  - novo `role-hidden-tabs.test.ts`; suíte 137/137;
  - preview: IGP oculto no Administrador sumiu do menu e `/igp` mostrou "Acesso não permitido"; ao reativar, voltou; o interruptor de Cargos ficou travado no próprio cargo;
  - contraste OK nos dois temas.

## 2026-11-04 — Banner do perfil ao fundo das observações

### Pedido
Além da foto, colocar um banner no perfil, que aparece de fundo nas observações do usuário nos chamados.

### Implementado
- Migration `supabase/migrations/202611040003_user_banner.sql`: `user_avatars.banner_data_url text`, aplicada com autorização. Quem tem banner e não tem foto fica com `data_url = ''` (tratado como sem foto). Remover a foto não apaga o banner.
- Backend:
  - `getUserBanners` e `saveUserBanner` (Supabase e demo);
  - `GET`, `PUT` e `DELETE /api/auth/banner` (JPEG/PNG/WebP até 700 KB);
  - `GET /api/chamados/:id/observacoes` devolve `banners` (um por autor).
- Frontend:
  - Configurações → Meu perfil: o banner vira a capa do cartão, com "Adicionar/Trocar banner" e "Remover banner". `lib/banner-image.ts` recorta em 3:1 e reduz para 1500×500 JPEG.
  - Detalhe do chamado: observação de autor com banner mostra o banner ao fundo; nome e hora em branco sobre faixa escurecida e texto em caixa quase opaca, para manter o contraste nos dois temas.
  - Letra do avatar das observações em azul escuro (4,3 → acima de 4,5:1).
- Validação: no preview, banner salvo pela API, observação nova com o banner ao fundo; auditoria de contraste do detalhe e de Configurações zerada nos dois temas; build OK.

## 2026-11-04 — Faixa "OS vencendo": botão leva para a aba certa

### Problema
"Ver fila" na faixa de OS vencendo sempre abria Chamados abertos, mas a OS da captura (12664799) tinha técnico e estava em Em atendimento.

### Implementado
- `components/DueSoonBanner.tsx`: o botão vai para a aba do chamado mais urgente da faixa: **Chamados abertos** quando não tem técnico, **Em atendimento** quando tem (Atribuído/Deslocamento/Em campo). O texto diz o destino ("Ver em Chamados abertos" / "Ver em Em atendimento"). Clicar no número da OS continua abrindo o chamado.

### Validação
- Preview: com a OS simulada com técnico, o botão mostrou "Ver em Em atendimento" e abriu `/chamados/atendimento`. Build OK.

## 2026-11-04 — IGP: "Para bater a meta"

### Pedido
Na tela do IGP, mostrar o que precisamos fazer, e quanto, para chegar a cada meta.

### Implementado
- `backend/src/igp.ts`: `IGP_GOALS` (Prazo 89% / mínimo 85%; Outlier 4,9% / 5,2%; MTTR 5h / 6h) e `calculateIgpPlan(total, mês)`. Para a meta e para o mínimo, calcula:
  - **ordens seguidas** que faltam: no prazo, `(a+k)/(n+k) ≥ p`; sem outlier, `o/(n+k) ≤ q`;
  - no **mês corrente**, o **ritmo do mês**: ordens que ainda devem fechar = média diária até hoje × dias restantes. Com isso:
    - Prazo: quantas das restantes precisam ficar no prazo, ou a folga de quantas podem passar de 6h;
    - Outlier: quantos outliers ainda cabem;
    - MTTR: média máxima das próximas ordens;
  - avisa quando **não dá mais** para fechar o mês na meta.
- `GET /api/dashboards/igp` devolve também `plan`, calculado com a região escolhida.
- `IgpPage.tsx`: painel **"Para bater a meta"** abaixo dos indicadores, com 3 cartões (Dentro do prazo, Outlier, MTTR). Cada cartão tem a linha da meta e a do mínimo, em verde (batida) ou vermelho (falta), com a frase pronta, por exemplo: "Faltam **82 ordens seguidas no prazo**. No ritmo do mês, **187 das ~200** ordens restantes (93,5%) precisam ficar no prazo". Em mês passado, mostra como o mês fechou e quanto faltou.

### Validação
- Novo `igp-plan.test.ts` (seguidas, ritmo do mês, MTTR, mês passado, folga). Suíte 140/140.
- Preview com resposta simulada (100 ordens até o dia 10): textos e números conferidos.
- Contraste do painel OK nos dois temas. A auditoria acusou o número das colunas do gráfico de evolução, mas é falso positivo: o número fica acima da coluna, sobre o cartão.
- Build OK.

## 2026-11-05 — Data Fim vinda do OFS em chamados ainda abertos

### Pedido
Depois de atualizar os chamados de ontem pelo OFS, eles ficaram sem Data Fim.

### Causa
Ao cruzar com o OFS, a regra da D-0 só gravava a Data Fim se o chamado já estivesse fechado no sistema (Finalizado, Cancelado ou Baixar). Em 03–04/11, 15 chamados estavam com Status OFS "concluído", mas o status interno ainda era Atribuído (14) ou Deslocamento (1), então ficaram sem Data Fim.

### Implementado
- `backend/src/imports/d0.ts`: quando o Status OFS indica conclusão (concluído, finalizado, encerrado ou executado), a Data Fim do OFS passa a ser gravada mesmo com o status interno aberto.
- O status interno continua separado e não é alterado.
- Ao finalizar ou baixar o chamado no sistema, essa data é mantida no lugar de "agora", porque a regra que já existia preserva o `executedAt` atual.
- Chamados abertos sem conclusão no OFS continuam sem Data Fim.
- IGP, SLA e dashboard só contam chamados Finalizado, então os números não mudam.

### Validação
- `d0-import.test.ts` foi ajustado: OFS concluído com chamado aberto agora recebe Data Fim. Também há um caso novo: OFS pendente, em andamento ou vazio fica sem Data Fim.
- Suíte 141/141. Typecheck OK.
- Os 15 chamados existentes recebem a Data Fim no próximo envio do OFS daquele dia, depois do deploy. Nenhum dado foi alterado manualmente.

## 2026-11-05 — Card de backbone (NOC TX): ordem "OFS:" e data "ABERTO EM:"

### Pedido
O acionamento de evento backbone 673908 apareceu como "Sem ordem identificada" e sem datas.

### Causa
O card de backbone traz a ordem no rótulo `OFS:` e a abertura do ticket no rótulo `ABERTO EM:`. O leitor não reconhecia nenhum dos dois: só entendia "Tarefa OFS" e "Data/Hora do Evento".

### Implementado
- `card-normalizer.ts`: o rótulo `OFS` sozinho passa a ser lido como Tarefa Office Track. "Status OFS" e outros rótulos continuam como estavam.
- `semantic.ts`: quando o card não tem "Data/Hora do Evento", o `ABERTO EM` vira a data do evento. Isso preenche "Data/Hora do Evento" e o gap até o acionamento.
- A abertura continua sendo o horário em que a mensagem foi enviada no grupo.
- `supabase/client.ts`: a releitura de cards pendentes agora também completa a data do evento, além da ordem, sem sobrescrever o que já foi lido. Os cards pendentes que já estão na fila são corrigidos depois do deploy, sem alterar o banco.

### Validação
- Novo `backbone-card.test.ts`, com o card real:
  - lê a ordem 610053309290102 e o evento 05/11/2026 07:06;
  - "Data/Hora do Evento" continua tendo prioridade sobre "ABERTO EM";
  - "Status OFS" não é lido como ordem.
- Suíte 144/144. Typecheck OK.

## 2026-11-05 — Detalhe do chamado mostra a Data Fim do OFS

### Pedido
Mesmo depois do envio do Coletor OFS, o detalhe do chamado 610011231680102 continuava com "Data Fim: Não informada".

### Causa
O backend já tinha gravado a Data Fim: `executed_at` = 04/11 22:11, vinda do OFS "concluído". Só que a tela só mostrava a Data Fim quando o status interno era Finalizado, Cancelado ou Baixar.

### Implementado
- `CallDetailPage.tsx`: a Data Fim aparece sempre que existir. Se o chamado ainda estiver aberto no sistema, vem marcada com "(OFS)".
- As filas abertas não mudam: o relógio do SLA continua correndo até o status interno ser fechado.

### Validação
- Banco consultado só para leitura: 610011231680102 e 610032252280102 já têm `executed_at` preenchido. Typecheck do frontend (`tsc -b`) OK.

## 2026-11-05 — Coletor OFS lê o fechamento (Motivo, Submotivo, Tipo do Cabo)

### Pedido
A cada 10 minutos, a extensão deve olhar os chamados finalizados e trazer do formulário "Fechamento" do OFS o submotivo e o tipo do cabo, porque esses dados não vêm no relatório (CSV).

### Investigação (OFS, só leitura)
- O formulário "Fechamento" guarda tudo em propriedades da atividade:
  - **725** = Motivo de Fechamento;
  - **916** = Submotivo;
  - **1062** = Tipo do Cabo.
- Elas só ficam disponíveis na página (`$app.model().activityService()`) depois que a atividade é aberta.
- A pesquisa do OFS (`index.php?m=search&a=search`) lista as atividades da ordem com `aid` e `astatus`, na mesma ordem dos resultados na tela.
- Uma ordem pode ter mais de uma atividade. Exemplo: 610011231680102 tinha uma suspensa e uma concluída.
- Conferido com 2 chamados reais:
  - 610011231680102 → CTO SEM SINAL / ADEQUAÇÃO DE CTO/CEO/CABOS / 12;
  - 610032252280102 → CABO ROMPIDO / TROCA DE POSTES / 12.

### Implementado
- **Migration** `202611050001_calls_ofs_closing.sql`: colunas `closing_reason`, `closing_subreason` e `cable_type` em `calls`, todas opcionais.
- **Backend** (`imports/ofs-closing.ts`):
  - `pendingClosingOrders`: chamados Finalizados, Baixar ou concluídos no OFS, dos últimos 10 dias, ainda sem Motivo e sem Submotivo. Ordens numéricas, mais recentes primeiro, até 40.
  - `matchOfsClosing`: cruza pela ordem ou pelo Office Track. Ignora ordem que bate em mais de um chamado e só grava o que mudou.
  - Rotas novas, com a mesma autenticação do Coletor:
    - `GET /api/integrations/ofs/fechamentos/pendentes`;
    - `POST /api/integrations/ofs/fechamentos`.
  - A gravação usa um ator de sistema (funciona em chamado fechado) e fica no histórico do chamado.
- **Extensão v1.2.0**:
  - Alarme `rf-fechamentos` (10 min por padrão; também 30 min ou desligado).
  - Usa uma aba própria do OFS, fixada e em segundo plano, e roda no contexto da página.
  - Para cada ordem: pesquisa, escolhe a atividade concluída mais recente, abre e lê as propriedades.
  - Até 12 por ciclo; a mesma ordem só é tentada de novo depois de 1 h.
  - O popup mostra a última leitura e tem o botão "Ler fechamentos agora".
  - A exportação ignora a aba fixada.
- **Frontend**:
  - O detalhe do chamado mostra Motivo de fechamento, Submotivo e Tipo do cabo, marcados como (OFS).
  - A exportação Excel ganhou as 3 colunas.

### Validação
- A leitura foi testada no OFS real (Claude no Chrome, só leitura) com as duas ordens acima: os resultados batem com o formulário.
- Novo `ofs-closing.test.ts`. Suíte 148/148. Typecheck do backend e do frontend OK.
- Rotas testadas no servidor local (demo): pedem login, validam o envio e devolvem a ordem que não tem chamado.

## 2026-11-05 — Coletor OFS v1.2.1: mostra quais fechamentos falharam

### Pedido
No popup, mostrar quais ordens deram erro na leitura dos fechamentos, e não só a contagem ("2 com erro").

### Implementado
- `background.js`: cada leitura passa a guardar `falhas`, com a ordem, o tipo e o motivo. Os casos registrados são:
  - erro da aba ou da pesquisa do OFS;
  - atividade concluída sem Motivo, Submotivo e Tipo do cabo preenchidos (antes contava como erro sem explicação);
  - ordem sem atividade concluída ou não encontrada na pesquisa;
  - fechamento lido, mas sem chamado correspondente no RedeFlow (`semChamado` do backend).
- `popup`: abaixo do resumo dos fechamentos, lista cada ordem com o motivo, em vermelho (erro) ou amarelo (ainda sem atividade concluída). Clicar copia a ordem.

### Validação
- Sintaxe da extensão conferida (`node --check`). A lista começa a aparecer na próxima leitura, depois de recarregar a extensão.

## 2026-11-05 — Fechamento do OFS: texto da lista em vez do código (FIELD)

### Pedido
O submotivo do chamado 12667479 foi coletado errado: apareceu "13" em vez de "Realizado nova fusão na CTO/CEO", e o motivo apareceu como "CTO_SEM_SINAL_EVENTO_PRODUTIVO".

### Causa
No OFS, "Tipo de Fechamento de Redes" (725) e "Submotivos de Fechamento de Redes" (916) são listas. A atividade guarda a **chave** do item, e a tela mostra o **texto**. Nas atividades de Rede, a chave antiga já é o próprio texto (por exemplo, "ADEQUAÇÃO DE CTO/CEO/CABOS"). Nas FIELD, a chave é um código ("13", "CTO_SEM_SINAL_EVENTO_PRODUTIVO"). A lista fica em `$app.model().attributeService().getEntity(id)._description.enum`.

### Implementado
- Extensão: lê o texto pela lista do próprio OFS (`enum[valor].text`). Se o valor não estiver na lista, mantém o valor como está.
  - Conferido no OFS real: 12667479 → "CTO sem sinal" / "Realizado nova fusão na CTO/CEO" / 12.
- Backend (`ofs-closing.ts`):
  - `looksLikeOfsCode` reconhece Submotivo só com números ou Motivo no formato `MAIUSCULO_COM_UNDERLINE`. Esses chamados voltam para a fila e são relidos já com o texto, sem editar o banco à mão. São 3 hoje: 12665487, 12665731 e 12667479.
  - Vírgula ou ponto e vírgula soltos nas pontas são removidos (Tipo do Cabo ",12" passa a ser "12").

### Validação
- Teste novo de releitura dos códigos. Suíte 149/149. Typecheck OK. Sintaxe da extensão OK.

## 2026-11-05 — Finalização automática pelo fechamento do OFS

### Pedido
Finalizar o chamado sozinho toda vez que ele já tiver as informações do OFS.

### Regra (`callsReadyToFinish`, em `imports/ofs-closing.ts`)
O chamado é finalizado quando todas estas condições valem:
- ainda está ativo no sistema (Aberto, Atribuído, Deslocamento ou Em campo);
- o Status OFS é "concluído";
- já tem a Data Fim do OFS;
- tem técnico (a finalização manual também exige);
- já tem o fechamento do OFS (Motivo ou Submotivo), em texto e não em código.

O que é gravado:
- Status passa a Finalizado.
- A Data Fim é a do OFS.
- O Resultado é o que já existia, se for texto. Se não for, vira "Motivo — Submotivo" (ex.: "CTO sem sinal — Realizado nova fusão na CTO/CEO").
- A alteração entra no histórico do chamado com o ator "Coletor OFS – usuário".
- Chamados em Baixar, Finalizado ou Cancelado não mudam.

### Implementado
- Backend: `finishCallsReadyFromOfs` roda a cada ciclo do Coletor, tanto no `GET .../fechamentos/pendentes` quanto no `POST .../fechamentos`. As duas rotas devolvem `finalizados`, com as ordens finalizadas.
- Extensão v1.2.2: o popup mostra quantos chamados foram finalizados automaticamente e quais.

### Impacto no primeiro ciclo (consulta só de leitura)
- 6 chamados já se encaixam e serão finalizados: 610032252280102, 610105329510102, 610150268770102, 610111249990102, 610147222490102 e 610137180570102.
- Os 3 FIELD gravados com código (12667479, 12665731 e 12665487) só serão finalizados depois de relidos com o texto.

### Validação
- Teste novo de `callsReadyToFinish`, cobrindo cada condição.
- Suíte 150/150. O teste de subida HTTP falhou uma vez por tempo e passou ao rodar de novo.
- Typecheck OK. Sintaxe da extensão OK.

## 2026-11-05 — Detalhe do chamado: encerramento no card de Atendimento

### Pedido
Não separar o card "Encerramento". Deixar tudo no card de Atendimento e mostrar só os campos necessários conforme o status, por exemplo o motivo para cancelar e os dados de finalização. Ao finalizar, a data deve vir preenchida com a do OFS.

### Implementado (`CallDetailPage.tsx`)
- O status passou a ter todas as opções: Aberto, Atribuído, Deslocamento, Em campo, Finalizado, Baixar e Cancelado.
- **Finalizado** (chamado ainda ativo) mostra:
  - Resultado, já sugerido: o resultado existente, se for texto, ou "Motivo — Submotivo" do fechamento do OFS;
  - Data e hora de execução, **já preenchida com a Data Fim do OFS** e com a dica "Data Fim do OFS: …";
  - Observação final.
  - O botão vira "Finalizar chamado". Primeiro salva os dados (por exemplo, o técnico escolhido na hora) e depois finaliza (`/finalizar`), com a data enviada em ISO, com fuso.
- **Cancelado** mostra o motivo do cancelamento. O botão vira "Cancelar chamado" e chama `/cancelar`.
- **Chamado encerrado**: trocar para um status ativo e salvar reabre o chamado (o botão vira "Reabrir chamado"). Trocar Baixar → Finalizado continua funcionando.
- **"Apagar chamado"** virou um link discreto no fim do card. Continua exigindo a permissão `calls.delete` e a confirmação.
- O card separado "Encerramento / Finalizar ou cancelar" foi removido. Todas as funções dele (finalizar, cancelar, reabrir e apagar) estão no card de Atendimento.

### Validação
- Typecheck do frontend (`tsc -b`) OK.
- Preview em localhost:8000: com Finalizado, os campos aparecem no card.
- O tema escuro e o contraste do tema claro foram gerados para os estilos novos (`field-hint`, `delete-link`).

## 2026-11-05 — Finalizados.xlsx: datas com dia e mês trocados

### Pedido
Vários chamados finalizados estão com a data de abertura invertida, por exemplo 11/03 quando devia ser 03/11 (237 dias de atendimento). Entender a causa e corrigir todos.

### Causa
Todos os casos vêm da importação **Finalizados.xlsx** (`legacy-activation`). Na planilha, células digitadas como "03/11/26" foram gravadas pelo Excel em formato americano (11 de março), e cada célula saiu de um jeito. Por isso a mesma linha pode ter a abertura trocada e a Data Fim certa, ou o contrário. O importador lia cada célula fielmente, sem conferir as duas datas juntas.

### Implementado
- `historical-activations.ts`: `fixSwappedOpenFinish(abertura, fim)`. Entre manter ou trocar dia/mês de cada data (4 combinações), escolhe a combinação em que:
  - o fim vem depois da abertura;
  - a diferença é de no máximo 10 dias;
  - nada cai no futuro;
  - há menos trocas;
  - em caso de empate, vale a combinação mais recente. Exemplo: 11/03→11/03 e 03/11→03/11 empatam; vale 03/11, porque o histórico começa em junho.
- Linha sem combinação válida fica como veio. A próxima importação de Finalizados já entra corrigida.

### Correção dos dados já gravados (simulação só de leitura, mesma regra)
- 4.846 chamados da Finalizados com Data Fim.
- 4.312 já estão certos.
- **504 a corrigir**: 392 só na abertura e 112 só na Data Fim. Nenhum cai antes de junho, e 295 vão para outubro/novembro. Os 3 do print ficam em 03/11 (14:43→15:40, 15:04→16:04, 20:28→22:39).
- 30 ficam como estão, sem troca que explique. São fins horas antes da abertura no mesmo dia, ou intervalos longos de verdade. Um deles tem o ano 2028.

### Validação
- Teste novo com os casos reais: print, abertura no futuro, fim trocado, correto e sem solução. Suíte 151/151.

## 2026-11-05 — Acionamentos: atrelado em roxo

### Pedido
Na tela de Acionamentos, o acionamento atrelado a outra ordem deve ficar roxo, para ser identificado logo. A mudança é só nessa tela.

### Implementado
- `ActivationsPage.tsx`: quando `analysis.atrelada` está preenchido, a linha ganha a classe `is-atrelada`. Ao lado da ordem aparece o selo "Atrelada <ordem>". O texto "· Atrelado à OS …" na linha de detalhes continua lá.
- `activation.css`:
  - fundo roxo claro;
  - barra roxa à esquerda;
  - ícone roxo;
  - selo roxo (#6b21a8 sobre #f3e8ff).
- O tema escuro foi gerado com fundo #16111b e texto #cd9cff.
- As filas de chamados não mudam: lá continua o selo "Atrelada" que já existia.

### Validação
- Typecheck OK.
- Preview em localhost:8000/acionamentos: a classe foi aplicada numa linha só no navegador, porque a demo não tem acionamento atrelado. Barra, ícone e selo aparecem em roxo.

## 2026-11-05 — Ordem atrelada no detalhe e nas observações

### Pedido
Mostrar nas observações que o chamado é atrelado ("atrelada > 12666735") e ter, dentro do chamado, um campo para copiar a ordem atrelada e conferir.

### Implementado
- **Observações:** ao aceitar um acionamento atrelado, as observações do chamado passam a ser "Criado a partir de acionamento aceito." com a linha **"Atrelada > <ordem>"** logo abaixo. Isso vale no Supabase (`decideSupabaseActivation`) e no modo local (`store/activations.ts`). Os chamados criados antes desta mudança não são alterados.
- **Detalhe do chamado:** campo **"Ordem atrelada"**, em roxo, com dois botões:
  - **Copiar**: copia a ordem para a área de transferência;
  - **Abrir**: procura o chamado dessa ordem no sistema (por ordem, Office Track ou BDESK) e abre. Se não encontrar, avisa "Essa ordem não está no sistema".
- Os estilos estão em `outcome.css`, com o tema escuro gerado.

### Validação
- Typecheck do frontend e do backend OK. Suíte 151/151.
- Não deu para ver no preview, porque a demo não tem chamado atrelado.

## 2026-11-05 — Status "Atrelado"

### Pedido
Criar o status **Atrelado** para usar no lugar de Atribuído.

### Decisões do usuário
- Aparece na aba **Em atendimento**.
- Funciona **igual ao Atribuído**:
  - exige técnico;
  - o prazo continua correndo e entra no aviso "vence em 30 min";
  - conta como "em andamento" no painel;
  - pode ser finalizado automaticamente pelo fechamento do OFS.

### Implementado
- Sem migration: `calls.status` é texto livre no banco.
- Backend:
  - tipo `CallStatus`;
  - validação de status em `GET /api/chamados` e no `PATCH`;
  - exigência de técnico;
  - listas de chamados ativos (`due-soon`, `ofs-closing`, finalização automática e listagem);
  - "em andamento" do dashboard;
  - importação "Em campo hoje" (coluna STATUS "atrelado"/"atrelada").
- Frontend:
  - status no detalhe do chamado e no seletor da fila (Em atendimento);
  - roxo no seletor da fila (`.cq-status.is-atrelado`) e no selo do detalhe, que já usava `.call-badge.atrelado`.
- **Correção de um bug que já existia:** o seletor de status da fila manda só `{ status }`, e o `PATCH` transformava o técnico ausente em `null`. Com isso, trocar para Atribuído, Deslocamento ou Em campo pela fila era recusado ("Atribua um técnico"), e trocar para Aberto **removia o técnico**. Agora, técnico ausente no pedido significa "não mexer".

### Validação
- Testes novos:
  - Atrelado no aviso de vencimento;
  - Atrelado na finalização automática;
  - teste HTTP: troca só de status mantém o técnico, Atrelado aparece no filtro e continua bloqueado sem técnico.
- Suíte backend OK. Typecheck OK.
- Preview: na fila Em atendimento, o chamado de demonstração aparece em roxo com "Atrelado" e mantém o técnico (o status foi devolvido para Atribuído depois do teste).

## 2026-11-05 — IGP "sem tipo reconhecido" e o fuso do "Finalizar chamado"

### Pedido
Saber quais são os "2 sem tipo reconhecido" que aparecem no IGP.

### Achado
- As 2 ordens eram NOC ACESSO, então o tipo estava certo: 610101366720102 e 610110513150102. Elas ficaram fora do IGP porque a **Data Fim era anterior à abertura**. O texto "sem tipo reconhecido" somava os dois motivos de exclusão e confundia.
- **Causa:** o antigo botão "Finalizar chamado" mandava a data do campo datetime-local sem fuso ("2026-11-04T16:20"), e o banco gravava como UTC. O fim ficava **3 h antes** do que foi digitado (16:20 → 13:20).
- 13 finalizações passaram por esse caminho. 6 foram editadas depois. **7 continuam com o valor errado**: 610011231680102, 610139229910102, 12665487, 12665760, 12665731, 610101366720102 e 610110513150102.

### Implementado
- `timezone.ts`: `normalizeSaoPauloLocal` trata data sem fuso como horário de São Paulo. Data que já vem com fuso não é alterada.
- `POST /api/chamados/:id/finalizar` passa a usar essa função. O card novo de Atendimento já mandava em ISO; agora o servidor também se protege.
- IGP: o texto passou a ser "N fora do cálculo (tipo não reconhecido ou fim antes da abertura)".

### Validação
- Novo `timezone-local.test.ts`. Suíte 155/155. Typecheck do backend e do frontend OK.

## 2026-11-05 — IGP: "Como está o período" (MTTR)

### Pedido
Adicionar ao IGP um quadro igual ao do print: MTTR do período, Meta, Diferença, Situação, Total de ordens, Total de horas e uma linha explicando.

### Implementado (`IgpPage.tsx` + `igp.css`)
- Componente `MttrPeriod`, logo abaixo dos indicadores. Usa a região e o mês escolhidos e o total ponderado.
- Os seis cartões:
  - **MTTR do período**;
  - **Meta**: 5,0h, com "mínimo 6,0h";
  - **Diferença**: +/−, com "acima/abaixo da meta";
  - **Situação**: verde "Na meta" até 5h, amarelo "Acima da meta" até 6h, vermelho "Acima do mínimo" depois disso;
  - **Total de ordens**;
  - **Total de horas** (soma de Data Fim − Abertura).
- Linha final na cor da situação. Por exemplo: "→ O período está 0,6h acima da meta: 5,6h contra 5,0h. Para voltar à meta, o total teria Xh a menos nas mesmas N ordens."
- Responsivo: 6 colunas, 3 em telas médias e 2 no celular.
- Tema escuro gerado.
- Mês sem ordens: o quadro não aparece.

### Validação
- Typecheck OK.
- Preview em localhost:8000/igp: um chamado de demonstração foi finalizado só em memória para ter dados. O quadro apareceu com 3,3h, Meta 5,0h, −1,7h, "Na meta", 1 ordem e 3,3h, e a mensagem em verde. Depois o chamado foi reaberto.

## 2026-11-05 — Filtro "Área" do IGP nas filas de chamados

### Pedido
Colocar nas filas, começando por Finalizados e cancelados, o filtro de área do IGP: Todas, SP, GRU e Alto Tietê.

### Implementado
- **Migration** `202611050002_calls_page_area_filter.sql`:
  - cria `redeflow_region_key(texto)`, que deixa a região em maiúsculas, sem acento e com espaços simples, igual ao IGP;
  - recria `list_calls_page_with_assignment` e `list_calls_page_with_atrelada` com o parâmetro opcional `p_regions text[] DEFAULT NULL` no fim. O resto do SQL ficou idêntico, e quem chama sem o parâmetro continua com o mesmo resultado.
- **Backend:**
  - `igpAreaRegionKeys(area)` gera a lista de regiões a partir das mesmas listas de `classifyIgpArea`;
  - `GET /api/chamados?area=SP|GRU|ALTO_TIETE` (valor inválido → 400);
  - `listCallsPage` manda `p_regions` ao Supabase; no modo local, filtra com `classifyIgpArea`.
- **Frontend** (`CallsPage`):
  - campo **Área** antes de Região, em todas as filas;
  - vale também para as contagens das abas, a exportação Excel e "Limpar filtros", e fica salvo com os outros filtros;
  - a grade de filtros ganhou uma coluna.
- Regiões fora das três áreas (por exemplo, Diadema e "Não informada") aparecem só em "Todas as áreas", como no IGP.

### Validação
- Simulação só de leitura com a mesma expressão SQL: 58 finalizados em novembro = SP 32 + GRU 9 + Alto Tietê 14 + 3 fora das áreas.
- Testes novos:
  - as chaves de cada área batem com `classifyIgpArea`;
  - teste HTTP do filtro de área e da área inválida (400).
- Typecheck do backend e do frontend OK.

### Ordem para subir
Aplicar a migration **antes** do push. O backend novo manda `p_regions`, e a função antiga não conhece esse parâmetro.

## 2026-11-05 — Observações do chamado unificadas

### Pedido
Juntar o campo "Observações" do chamado com o histórico de Observações, para salvar na hora e não ter dois lugares diferentes.

### Implementado (`CallDetailPage.tsx`, `team.css`)
- O campo "Observações" de "Dados operacionais" foi removido. Ele só era gravado ao clicar em "Salvar alterações".
- O texto do chamado (`notes`: "Criado a partir de acionamento aceito.", "Atrelada > …", texto das importações) aparece fixado no topo da aba **Observações** como **"Registro do chamado"**, com a data de abertura. Ele é só de leitura e não foi apagado do banco.
- Tudo o que é novo entra pela caixa do histórico. A gravação é na hora, com autor, horário e anexos.
- **Ctrl+Enter** salva a observação.
- "Salvar alterações" continua mandando o `notes` atual sem mudança, então nada se perde. Com o texto fixado, o aviso "Nenhuma observação registrada." deixa de aparecer.
- O tema escuro foi gerado para o item fixado.

### Validação
- Typecheck OK.
- Preview: no chamado de demonstração, o campo antigo sumiu, "Registro do chamado" aparece com "Equipe acionada para diagnostico." e a caixa mostra "(Ctrl+Enter salva)".

## 2026-11-05 — Área pelo cluster do OFS (C.8 SP, C.9 ABC, C.11 Alto Tietê, C.12 GRU)

### Pedido
Separar as áreas pelos baldes de cluster do OFS, exportando de cada balde, em vez de usar só a lista de regiões. Os clusters são C.8 São Paulo, C.9 ABC, C.11 Alto Tietê e C.12 Guarulhos.

### Investigação (OFS, só leitura)
- Na árvore do Console de Alocação: JH TELECOM REDES (4899), com os baldes CLUSTER_C08 (5066), C09 (5399), C11 (5063) e C12 (5064).
- Os técnicos ficam direto em JH TELECOM REDES. O balde do cluster só guarda as ordens **ainda não distribuídas**.
- Toda atividade de rede tem **Chave Workzone** (31 de 31 no export do dia), inclusive as já atribuídas.

### Implementado
- **Migration** `202611050003_calls_cluster.sql`:
  - `calls.cluster` (com índice);
  - tabela `ofs_workzone_clusters` (Workzone → cluster, com RLS);
  - as funções de página das filas ganham `p_clusters`: chamado com cluster entra pela área do cluster, chamado sem cluster entra pela região. A lista também devolve o `cluster`.
- **Backend:**
  - `igp.ts`:
    - `CLUSTER_AREAS` e `normalizeCluster` ("CLUSTER_C08 (21)" → C08);
    - `classifyCallArea`, que usa o cluster primeiro e a região depois;
    - nova área **ABC**, com lista de regiões de reserva (Diadema, Santo André, São Bernardo, São Caetano, Mauá, Ribeirão Pires, Rio Grande da Serra).
  - IGP, análise de prazo e filtro das filas passam a usar a área pelo cluster.
  - `POST /api/integrations/ofs/cluster` (`store/clusters.ts`): o export de um balde marca o cluster das ordens que estão nele e aprende Workzone → cluster.
  - O export principal (JH TELECOM REDES) dá o cluster, pela Workzone, aos chamados ainda sem cluster.
- **Extensão v1.3.0:**
  - alarme `rf-clusters` (1 h por padrão; 2 h ou desligado);
  - exporta os 4 baldes, um por vez, na aba fixada do OFS, voltando ao Console de Alocação se ela estiver numa atividade. A tela de trabalho não muda;
  - o popup mostra o resultado de cada cluster e tem o botão "Ler clusters agora".
- **Telas:**
  - opção ABC no IGP, no filtro Área das filas e na Análise de prazo, onde "Outras" passa a ser "sem cluster";
  - "Cluster (OFS)" no detalhe do chamado.

### Validação
- Testes novos (`clusters.test.ts`):
  - nomes dos baldes viram código de cluster;
  - a área vem do cluster e, sem ele, da região;
  - o IGP por área usa o cluster;
  - o export do balde marca o cluster e ensina a Workzone para uma ordem já atribuída.
- Dois testes antigos foram ajustados, porque Diadema agora é ABC. Suíte 161/161.
- Typecheck do backend e do frontend OK. Sintaxe da extensão OK.

### Ordem para subir
1. Migration.
2. Push.
3. Recarregar a extensão (v1.3.0).

## 2026-11-05 — Status OFS não chegava em ordem repetida; OLT com "OLT " na frente

### Pedido
O chamado 610147425970102 não recebia o Status OFS.

### Causa
- O card foi enviado duas vezes ao grupo, os dois acionamentos foram aceitos e a segunda cópia foi cancelada. Ficaram **dois chamados com a mesma ordem**: um Atribuído e um Cancelado.
- O cruzamento com o OFS (D-0) não atualiza quando uma ordem bate em mais de um chamado, para não adivinhar. Por isso nenhum dos dois recebia o status. A ordem estava no export das 11:42, "em rota".
- No mesmo chamado, a OLT foi gravada como "OLT VIP-GRU-4-SPO-ONK-01", porque o card repetia o rótulo no valor. Com isso o mapa OLT → região não achava Guarulhos 4, e a região ficou "Nao informada".

### Implementado
- `d0.ts`: `pickSingleCall`. Quando a ordem bate em vários chamados e **só um não está Cancelado**, é esse que recebe. Vale para o cruzamento da D-0/OFS, o cluster e o fechamento do OFS. Dois chamados ativos continuam sem adivinhar.
- `normalizeOltCode` e o leitor do card (`semantic.ts`) tiram o "OLT " ou "OLT:" do começo do valor da OLT.

### Validação
- Testes novos:
  - cópia cancelada → atualiza o ativo;
  - dois ativos → não atualiza;
  - "OLT VIP-GRU-4-…" acha GUARULHOS 4.
- Suíte 163/163.
- Hoje há 9 chamados com a OLT gravada com o prefixo, 3 deles sem região. Os dados não foram alterados.

## Fechamento vazio no OFS finaliza o chamado (2026-11-05)

### Problema
Várias atividades são concluídas no OFS sem Motivo, Submotivo e Tipo do cabo. Esses chamados ficavam no popup como erro ("concluída, mas sem Motivo...") e nunca eram finalizados automaticamente.

### Implementado
- Extensão v1.3.1: atividade concluída e com o fechamento vazio é enviada com `semFechamento: true`. No popup, aparece como aviso.
- `matchOfsClosing`: com `semFechamento`, grava o Motivo "Não preenchido no OFS". Isso só acontece se o chamado ainda não tem fechamento em texto.
- Com o Motivo gravado, o chamado sai da fila de leitura. Ele finaliza pela regra de sempre (OFS concluído, Data Fim e técnico), com o resultado "Não preenchido no OFS".
- A rota `POST /api/integrations/ofs/fechamentos` aceita o campo `semFechamento`.

### Validação
- Teste novo: fechamento vazio → marca, sai da fila e finaliza. Um fechamento em texto que já existe não é sobrescrito. Suíte 164/164.

## Card repetido em outro grupo não cria um segundo chamado (2026-11-06)

### Problema
O mesmo card chega por 2 ou 3 grupos do WhatsApp. A checagem de repetido na chegada só olha o mesmo grupo, então cada cópia virava um acionamento. Ao aceitar, cada uma criava um chamado. Com dois chamados ativos da mesma ordem, a base do OFS não sabe qual atualizar e nenhum dos dois recebia o Status OFS. Em 06/11 às 07:20, 24 acionamentos foram aceitos de uma vez e 7 ordens ficaram duplicadas.

### Implementado
- Ao aceitar um acionamento (Supabase e modo local), se a ordem já tem um chamado não cancelado (pela ordem ou pelo Office Track), o acionamento é ligado a esse chamado e nenhum novo é criado.

### Validação
- Teste novo: segundo acionamento da mesma ordem, vindo de outro grupo, devolve o mesmo chamado.
- Suíte 164/164.

## Técnico do OFS no chamado e aba fixada mais resistente (2026-11-06)

### Problema
- Vários chamados ficaram concluídos no OFS e sem técnico no RedeFlow. Sem técnico, o encerramento automático nunca acontece.
- A aba fixada do OFS (fechamentos e clusters) parava de responder: "O OFS não carregou na aba fixada". As ordens que falhavam esperavam 1 h para uma nova tentativa.

### Implementado
- `d0.ts`:
  - `matchOfsTechnician`: o "Recurso" da linha do OFS precisa bater, ignorando acento e caixa, com UM técnico ativo, trabalhando e com função Técnico. Baldes (`CLUSTER_…`) são ignorados.
  - `technicianAssignmentsFromRows`: se a mesma ordem aparece em várias linhas, vale a concluída, depois a pendente e por último a suspensa.
- `applyOfsRowsToCalls` (exportação de hoje e do dia anterior): o chamado sem técnico recebe o técnico do OFS. Se estava "Aberto", passa para "Atribuido". Chamado encerrado ou que já tem técnico não muda.
- Extensão v1.3.2:
  - A aba fixada não pode mais ser descartada pelo Chrome (`autoDiscardable: false`). Se estiver dormindo, é acordada. Se não responder, é recarregada uma vez.
  - Quando o OFS mostra a tela de login, o popup avisa isso.
  - Falha técnica na leitura de um fechamento é tentada de novo em 15 min, e não mais em 1 h.

### Validação
- Teste novo: casamento do Recurso (acento, balde, demitido, desconhecido) e escolha da linha (pendente vence suspensa). Chamado que já tem técnico não muda. Suíte 165/165.

## Clusters: espera a barra de data do OFS (2026-11-06)

### Problema
Com a aba fixada já acordada (v1.3.2), os 4 baldes falharam com "Não achei o seletor de data do OFS". Depois de recarregar, o OFS mostra a árvore de alocação antes da barra de data, e a extensão procurava a data na hora.

### Implementado
- Extensão v1.3.3:
  - `irParaData` espera até 20 s pela barra de data.
  - Se a barra não aparecer, clica em "Console de Alocação" e espera mais 20 s.
  - Se ainda assim não aparecer, o erro avisa que a aba não está no Console.

### Validação
- `node --check`. Não foi verificado no OFS: depende do próximo ciclo de clusters.

## Aba Relatórios: finalizados fora do prazo (2026-11-06)

### Pedido
Uma aba de Relatórios. O primeiro relatório lista os chamados finalizados, de uma data a outra, que ficaram fora do prazo (acima de 6h).

### Implementado
- Backend:
  - `lateFinishedCalls` (`sla-analysis.ts`): status Finalizado, Data Fim no período e mais de 6h entre abertura e fim. É a mesma regra da Análise de prazo; acima de 9h é outlier.
  - Ordem: do mais demorado para o menos.
  - Rota `GET /api/relatorios/fora-do-prazo?from&to&area`, com a permissão `dashboard.view` e o mesmo escopo de supervisor.
- Frontend: nova aba "Relatórios" em Indicadores (`/relatorios`).
  - Seletor de tipo de relatório, preparado para os próximos.
  - Filtros De/Até (padrão: começo do mês até hoje) e Área. O período também pode vir no endereço (`?de=&ate=`).
  - Cartões: total, entre 6h e 9h, acima de 9h e tempo médio.
  - Tabela: ordem (abre o chamado), técnico, abertura, Data Fim, tempo, evento, local e fechamento.
  - Exportar Excel.

### Validação
- Teste novo `reports.test.ts`: dentro e fora do período, exatamente 6h, chamado aberto, ordem. Suíte 166/166.
- Preview local (demo) com 2 chamados finalizados: tabela, cartões e filtros conferidos. Auditoria de contraste sem problemas nos temas claro e escuro.

## Página Meu perfil e temas de cor (2026-11-06)

### Pedido
Temas de cor como na prévia (JH Azul, Ardósia, Névoa, Flor, Aurora e Neon), com o atual como Padrão, e cada um com versão clara e escura. Uma página de perfil, aberta pelo avatar ou pelo nome na lateral e no topo, para trocar foto, banner, tema e um apelido opcional. O apelido aparece no lugar do nome só para a própria pessoa.

### Implementado
- Temas:
  - O gerador `scripts/generate-dark-theme.mjs` agora também gera `src/themes/<tema>.css` para Ardósia, Névoa, Flor, Aurora e Neon.
  - Cada arquivo troca o azul da marca e os cinzas azulados pelo matiz do tema, no claro e no escuro, mantendo a luminosidade.
  - Vermelho, verde, laranja e amarelo de status não mudam.
  - Cada arquivo só é carregado quando alguém escolhe aquele tema (cerca de 20 KB compactado).
  - `src/palettes.css` (escrito à mão): lateral colorida, fundo em degradê e topo translúcido de cada tema. O Neon tem botão principal em degradê.
  - JH Azul mantém o azul atual e muda só a lateral e o fundo. Padrão é o visual de antes, sem nada novo.
  - O tema vai em `data-palette` no `<html>`. O claro/escuro continua sendo o botão do topo, e também pode ser trocado no perfil.
- Página `/perfil` (`ProfilePage.tsx`): banner, foto, apelido (até 40 caracteres) e seletor de tema com miniaturas.
  - O avatar e o nome na lateral e o avatar do topo abrem essa página.
  - O apelido substitui o nome só na lateral e no topo de quem o definiu. Chamados, relatórios e a equipe continuam vendo o nome.
  - Configurações ficou com um atalho para Meu perfil no lugar do antigo bloco de foto e banner.
- Backend:
  - `GET` e `PUT /api/auth/preferences`, com `{ nickname, palette }`. Escolher Padrão ou deixar o apelido vazio guarda nulo.
  - Os dados ficam na mesma linha de `user_avatars` (foto e banner).
  - A linha só é apagada quando foto, banner, apelido e tema estão todos vazios. Antes, remover a foto ou o banner podia apagar a linha inteira.
- Migração `202611060001_user_preferences.sql`: colunas `nickname` e `palette` em `user_avatars`.
  - Sem a migração, a leitura funciona (devolve vazio) e o salvamento avisa que a migração falta.
- O tema escolhido também fica guardado no navegador e é aplicado pelo `index.html` antes do React, para não piscar. Ao sair, volta ao Padrão.

### Validação
- Teste novo em `http.test.ts`: salvar, ler, tema inválido e limpar. Suíte 167/167.
- Auditoria de contraste em 7 temas × claro/escuro (perfil, visão geral, chamados abertos, relatórios e configurações): 0 problemas.
  - Antes disso, o Ardósia claro deu 4,35 num título pequeno. Foi corrigido com um tom mais fechado (`--blue: #4a6886`).
- Preview local: escolha de tema pelo clique e apelido aparecendo na lateral e no topo, conferidos.

### Ajuste: banner no formato do Discord (2026-11-06)
- O banner ficava em 3:1 (1500×500), mas aparecia numa faixa de altura fixa e mais larga, por isso saía cortado.
- Agora o recorte é 17:6, a proporção do banner do Discord (1360×480, `banner-image.ts`).
- A faixa do cartão usa `aspect-ratio: 17 / 6`: a imagem aparece inteira, sem corte, em qualquer largura.
- O cartão do perfil ficou no estilo Discord:
  - coluna própria de 380px, fixa ao rolar;
  - foto de 96px sobreposta ao banner, com anel da cor do cartão e botão de câmera;
  - nome ou apelido, e-mail e cargo num bloco;
  - botões do banner sobre a imagem.
  - Sem banner, a faixa usa a cor do tema.
- Banners já salvos em 3:1 continuam funcionando: são ajustados ao novo formato, com um corte pequeno nas laterais.
- O CSS antigo do cartão de perfil de Configurações (`.settings-profile*`) foi removido; ele não era mais usado.
- Validação: faixa medida em 2,833 (17:6) com um banner de teste. Contraste do `/perfil` sem problemas no Padrão, Flor e Ardósia, claro e escuro.

### Ajuste: banner largo no topo do perfil (2026-11-06)
- O cartão estreito de 380px deixava o banner pequeno demais.
- Agora o topo de Meu perfil segue o perfil do Discord:
  - o banner ocupa a largura da página em 4:1;
  - a foto tem 140px, fica sobreposta no canto com anel da cor do cartão, e tem botão de câmera;
  - nome ou apelido e cargo ficam ao lado da foto, com "Trocar foto" à direita;
  - e-mail, cargo e nome na equipe ficam numa faixa.
- Apelido e Tema ficam lado a lado abaixo; em telas menores, um embaixo do outro.
- O recorte passou para 4:1 (1600×400, `banner-image.ts`), o mesmo formato em que o banner aparece no computador.
- No celular a faixa fica em 3:1, com um corte pequeno nas laterais, para não ficar fina demais.
- Validação: banner de teste 4:1 aparece inteiro no desktop; no celular (375px) não há rolagem lateral. Contraste do `/perfil` sem problemas no JH Azul e Aurora, claro e escuro.

### Ajuste: banner em 16:9 (2026-11-06)
- Pedido: ver por completo uma foto 16:9, como um papel de parede de 2000×1125.
- O recorte passou para 16:9 (1600×900, `banner-image.ts`).
- A faixa do topo usa `aspect-ratio: 16 / 9` também no celular, e a página do perfil ficou com no máximo 1040px de largura (banner de cerca de 585px de altura).
- Uma foto 16:9 aparece inteira, sem corte. Banners salvos antes, em outros formatos, preenchem a faixa com algum corte até serem enviados de novo.
- Validação: faixa medida em 1,778 (16:9) com banner de teste 1600×900.
- Ajuste seguinte: a página do perfil passou a ter no máximo 860px de largura.
  - O banner continua 16:9, mas menor: 858×483 no desktop.
  - Apelido e Tema ficam um embaixo do outro, sem ficarem espremidos lado a lado.
- Ajuste seguinte: a altura do banner ficou grande demais.
  - A página voltou a ter no máximo 1040px de largura.
  - A faixa do banner ficou mais baixa (7:2, cerca de 1038×297).
  - A foto continua sendo recortada em 16:9 e aparece inteira no centro (`contain`). As laterais mostram a própria foto ampliada e desfocada (`::before` com `blur`).
  - A imagem vai pela variável CSS `--pf-banner`.
  - No celular a faixa continua 16:9, preenchida pela foto.
- Ajuste final do banner: a foto ocupa a faixa inteira (`cover`), sem as laterais desfocadas.
  - A faixa é 7:2 (1038×297 no desktop, o mesmo formato no celular).
  - O recorte no envio passou para 7:2 (1600×457): o que é salvo é o que aparece.
  - Imagens 16:9 perdem parte de cima e de baixo.

### Banner animado (GIF) (2026-11-06)
- Pedido: poder usar GIF para ter banner animado.
- `banner-image.ts`: GIF vai sem passar pelo canvas, que tiraria a animação. O arquivo entra como está, com até 3 MB e sem recorte.
  - A faixa mostra o centro dele (`cover`).
  - JPEG, PNG e WebP continuam recortados em 7:2 e reduzidos.
- `PUT /api/auth/banner` aceita `data:image/gif` até cerca de 4,2 MB em base64 (3 MB de arquivo). Os outros formatos continuam até 700 KB.
- O seletor de arquivo do banner aceita GIF.
- O GIF também anima ao fundo das observações nos chamados.
- O limite de 3 MB é porque o banner de cada autor é baixado ao abrir um chamado.
- Validação:
  - Teste novo em `http.test.ts`: GIF aceito, GIF grande aceito, JPEG grande recusado, GIF acima de 3 MB recusado. Suíte 168/168.
  - Um teste não relacionado teve o timeout conhecido na primeira rodada e passou na segunda.
  - Preview: GIF de 12 quadros salvo e animando na faixa.
- Foto de perfil animada (GIF):
  - `resizeProfilePhoto` (`Shell.tsx`) envia GIF como está, com até 2 MB, para não perder a animação.
  - `PUT /api/auth/avatar` aceita `data:image/gif` até cerca de 2,8 MB em base64. Os outros formatos continuam até 350 KB.
  - O seletor de foto aceita GIF. A foto redonda mostra o centro (`object-fit: cover`).
  - A foto só é carregada pela própria pessoa (lateral, topo e perfil).
  - Teste de `http.test.ts` ampliado: GIF aceito, JPEG grande recusado, GIF acima de 2 MB recusado. Suíte 168/168.
  - Preview: GIF de 10 quadros animando na foto do perfil, na lateral e no topo.

## Aba Pessoas: perfis e quem está online, só leitura (2026-11-06)

### Pedido
Uma página que todos possam ver, com os perfis das pessoas e se estão online. Ao abrir uma pessoa, ver nome, cargo, e-mail, foto e banner. Ninguém pode criar perfil nem alterar nada de ninguém.

### Implementado
- Backend: duas rotas só de leitura, liberadas para qualquer usuário logado (`auth`, sem permissão extra).
  - `GET /api/people`: pessoas ativas, com nome, e-mail, cargo, online/visto por último e data de cadastro, mais as fotos (`getUserAvatars`). Ordem: quem está online primeiro, depois por nome.
  - `GET /api/people/:id`: os mesmos dados de uma pessoa, mais foto e banner.
  - Não há rota de escrita em `/api/people`. Criar e editar contas continua só em Usuários (`/api/users`, com as permissões de antes).
  - Contas inativas ficam de fora. O apelido não aparece, porque é só para a própria pessoa.
- Frontend: aba "Pessoas" em Equipes (`/pessoas`, `PeoplePage.tsx`), visível para todos os cargos.
  - Um administrador ainda pode esconder a aba de um cargo em Cargos e permissões.
  - Cartões com foto, bolinha de status, nome, cargo e "Online agora", "Visto há X min" ou "Offline".
  - Busca por nome, cargo ou e-mail, e filtro Todos/Online. O status atualiza sozinho a cada 30 s.
  - Ao clicar, abre o perfil no estilo do Meu perfil: banner 7:2, foto sobreposta com status, nome, cargo, e-mail (link), cargo e data de entrada no sistema. Sem nenhum botão de edição. Fecha com X, Esc ou clique fora.
- A aba Usuários não mudou e continua restrita a quem tem `users.view`.

### Validação
- Teste novo em `http.test.ts`:
  - sem login → 401;
  - logado lista as pessoas, sem senha;
  - o próprio usuário aparece online;
  - o perfil abre, e uma pessoa que não existe dá 404;
  - POST, PUT, PATCH e DELETE em `/api/people/:id` não existem (404).
  - Suíte 169/169.
- Preview: lista, filtro e perfil com banner e foto conferidos. Contraste sem problemas na lista e com o perfil aberto (Padrão e Flor, claro e escuro).

## Lote 1 das ideias: Integração OFS, fila de parados e aviso antes do prazo (2026-11-06)

### Pedido
Implementar todas as ideias sugeridas, em lotes, começando pela integração. Lote 1: painel de saúde da integração (9), fila de "não finalizou sozinho" (10) e alerta antes de estourar o prazo (1), com aviso também no WhatsApp.

### Implementado
- Nova aba "Integração OFS" em Administração (`/integracao-ofs`, permissão `imports.view`, `IntegrationHealthPage.tsx`). Atualiza a cada minuto.
  - Semáforo (OK / Atenção / Parado / Sem dados) de:
    - export do OFS (certo há até 90 min = OK; até 3h = Atenção);
    - leitura de fechamentos (mesmos prazos);
    - clusters (até 3h / 12h);
    - falhas nas últimas 6h;
    - chamados parados há mais de 2h.
  - O ciclo fica em "Atenção" quando deu certo mas teve ordens com erro de leitura, ou quando a última tentativa falhou.
  - Cartão do aviso no WhatsApp (ligado/desligado), linha da base D-0 atual e histórico das últimas 72h, com as ordens que falharam em cada ciclo.
- Fila "Concluídos no OFS que ainda não finalizaram aqui" (`stuckOfsCalls`, mesmas regras de `callsReadyToFinish`).
  - Cada chamado mostra o que falta: sem técnico, sem Data Fim, fechamento não lido, fechamento em código, ordem em mais de um chamado, ou "pronto" (finaliza no próximo ciclo).
  - Filtro por motivo e link para o chamado.
- Registro da coleta: nova tabela `integration_events` (migração `202611060002_integration_events.sql`), com 14 dias de histórico.
  - O servidor registra export, cluster e fechamentos (início do ciclo e resultado).
  - Nova rota `POST /api/integrations/ofs/relato` recebe o que a extensão viu no navegador.
- Extensão v1.3.4: depois de cada ciclo manda o relato.
  - Fechamentos: sempre, com as ordens que falharam.
  - Export e clusters: só quando falham, porque o sucesso o servidor já registra.
  - O relato nunca atrapalha a coleta.
- Aviso antes do prazo:
  - No sino: "X chamado(s) vencem em menos de 2h", no escopo do supervisor (`nearDeadlineCalls`). O banner de 30 min continua.
  - No WhatsApp: a cada 5 min, os chamados que entraram na última 1h recebem um aviso, numa mensagem só, uma vez por chamado (o registro fica em `integration_events`, tipo `sla_alert`).
  - A mensagem não leva dados de cliente: ordem, tipo, região, técnico e quanto falta.
  - O envio usa o WuzAPI (`POST {url}/chat/send/text`) e fica desligado até configurar no Render `WUZAPI_API_URL`, `WUZAPI_USER_TOKEN` e `WUZAPI_ALERT_CHAT`. Não foi configurado nem testado contra o WuzAPI real.

### Validação
- Teste novo `integration-health.test.ts` (fila parada, semáforo, janela de prazo, texto do WhatsApp, envio desligado sem as variáveis).
- Teste HTTP do relato e do painel, incluindo supervisor sem acesso. Suíte 174/174.
- Preview: relatos e export de teste aparecem no painel e na fila, com motivos e filtro. Contraste sem problemas (Padrão e Aurora, claro e escuro).

## Lote 2 das ideias: relatórios (2026-11-06)

### Implementado
- Quatro tipos novos no seletor da aba Relatórios. Todos usam a mesma regra de prazo (até 6h, acima de 6h, acima de 9h), o filtro de área e o escopo do supervisor, e exportam Excel. O tipo pode vir no endereço (`?tipo=`).
  - **Produtividade por técnico e supervisor** (`GET /api/relatorios/produtividade`): finalizados no período (pela Data Fim), no prazo, fora, outliers, % no prazo (com barra) e tempo médio. Os cartões mostram quem mais finalizou e o melhor % no prazo (mínimo de 3 chamados).
  - **Motivos de fechamento** (`GET /api/relatorios/motivos`): ranking com participação, tempo médio, principais submotivos, contagem por área e evolução por mês. Mostra quantos finalizados ficaram sem motivo.
  - **Comparar com o período anterior** (`GET /api/relatorios/comparar`): abertos, finalizados, % no prazo, % outliers, outliers e tempo médio, lado a lado com o período anterior de mesmo tamanho. A variação vem com seta, em verde quando melhorou e em vermelho quando piorou.
  - **Resumo do dia** (`GET /api/relatorios/resumo-dia?date=`): abertos, finalizados, prazo, ativos agora, IGP do mês até o dia, quem mais finalizou e os principais motivos. Tem o texto pronto para copiar.
- Envio agendado do resumo: todo dia, a partir das 7h de São Paulo, vai o resumo do dia anterior no WhatsApp, uma vez por dia.
  - O registro fica em `integration_events`, tipo `daily_report`.
  - Usa as mesmas variáveis do aviso de prazo. `WUZAPI_REPORT_CHAT` (opcional) manda para outro grupo.
  - Fica desligado até configurar. O texto não leva dados de cliente.
- Regras em `backend/src/reports.ts`. A lista de chamados desses relatórios vem sem filtro de data, porque o período é aplicado pela Data Fim ou pela abertura, e o período anterior fica fora do de/até.
- O relatório "Finalizados fora do prazo" continua igual; só o botão de Excel foi para dentro do painel.

### Validação
- Teste novo `reports-batch2.test.ts`: produtividade, motivos com submotivos, área e mês, comparação com o período anterior, resumo e texto sem dados de cliente.
- Teste HTTP dos 4 relatórios (período invertido → 400). Suíte 179/179.
- Preview com 4 chamados finalizados na demo: produtividade, comparação e resumo conferidos. Contraste sem problemas nos 5 relatórios, claro e escuro.

## Lote 3 das ideias: operação (2026-11-06)

### Implementado
- **Mapa da fila** (`/mapa`, em Operação, permissão `calls.view`, `GET /api/operacao/mapa`): chamados ativos agrupados por região e bairro.
  - Cada região tem uma barra com a divisão por situação: no prazo, vence em menos de 2h, fora (6h–9h) e outlier (mais de 9h).
  - Cada bairro tem a cor do chamado mais atrasado e mostra os chamados ao clicar: ordem, tipo, OLT, técnico e tempo.
  - As regiões e bairros mais atrasados aparecem primeiro. A tela atualiza a cada minuto.
  - O mapa não é geográfico: os chamados não têm coordenadas, e não mandamos endereços de cliente para serviço de geolocalização.
- **Reincidência**: mesma regra da aba Repetidos (mesmo endereço + OLT + slot/PON, aberto até 30 dias depois do anterior), agora no servidor (`operations.ts`).
  - Na fila, o selo "Reincidente" aparece ao lado da ordem (`POST /api/chamados/reincidencia`, até 300 ids por página).
  - No detalhe do chamado, um aviso mostra quantos houve no mesmo ponto nos 30 dias anteriores, com "Ver histórico": ordem, data, status, técnico e fechamento (`GET /api/chamados/:id/reincidencia`).
  - Cancelados não contam. A aba Repetidos continua igual.
- **Carga dos técnicos** (`/carga`, em Equipes, `GET /api/operacao/carga`): para cada técnico trabalhando e ativo, mostra chamados ativos, o mais antigo, a pior situação de prazo, finalizados hoje (quantos no prazo) e o tempo médio de hoje.
  - Os livres vêm primeiro, para ajudar a atribuir. Tem o filtro "Só livres", e os chamados de cada técnico abrem na própria linha.
  - Cartões: livres, ocupados e ativos sem técnico (com link para Chamados abertos).
  - O supervisor vê só a própria equipe.

### Validação
- Teste novo `operations.test.ts`: situação do prazo, reincidência (janela de 30 dias, cancelado e ponto incompleto fora), mapa por região e bairro, e ordem e números da carga.
- Teste HTTP das 4 rotas, incluindo o escopo do supervisor na carga. Suíte 184/184; a primeira rodada teve o timeout conhecido em um teste não relacionado.
- Preview: mapa com bairro aberto, carga com chamados abertos na linha, e reincidente no detalhe e na fila (dois chamados da demo apontados para o mesmo ponto). Contraste sem problemas no claro e no escuro.

## Lote 4 das ideias: equipe (2026-11-06)

### Implementado
- **Status personalizado** (como no Discord): emoji + texto de até 60 caracteres, editado em Meu perfil (`StatusEditor.tsx`).
  - Atalhos: Em campo, Em reunião, Almoço, Focado, Home office e Ausente.
  - "Limpar depois de": 1h, 4h, fim do dia ou não limpar.
  - Aparece no cartão e no perfil da aba Pessoas e na lateral de quem definiu (no lugar do cargo). Status vencido some sozinho.
  - Rotas `GET/PUT /api/auth/status`. Fica na linha de `user_avatars` (colunas `status_text`, `status_emoji`, `status_until`), e a linha só é apagada quando foto, banner, apelido, tema e status estão todos vazios.
- **Menções**: ao digitar `@` numa observação aparece a lista de pessoas, e a escolhida entra como "@Nome Completo" (`MentionTextarea.tsx`, com setas, Enter/Tab e Esc).
  - No texto salvo, a menção aparece em destaque.
  - O servidor reconhece o nome completo (sem diferença de acento ou maiúscula; nome mais longo primeiro) e avisa no sino quem foi mencionado e pode ver chamados. Quem escreveu não é avisado.
  - O aviso fica até a pessoa clicar nele ou usar "Marcar menções como lidas".
  - Nova tabela `user_notifications` e rota `POST /api/notificacoes/lidas`.
- **Destaques do mês** (`GET /api/destaques`): técnico com mais finalizados no prazo, técnico com melhor % no prazo (mínimo 10) e supervisor com melhor % no prazo (mínimo 10).
  - Aparecem no topo da aba Pessoas, com troféu no cartão do supervisor destacado quando ele tem usuário, e numa 4ª visão do Modo TV ("Destaques").
- Migração `202611060003_team_features.sql`: três colunas de status em `user_avatars` e a tabela `user_notifications` (RLS ligado, sem políticas).
  - Sem a migração, a leitura não quebra e o salvamento do status avisa que ela falta.

### Validação
- Teste novo `team.test.ts`: status vencido, menções (acentos, nome mais longo, palavra parcial, inativo, autor) e destaques.
- Teste HTTP do status na aba Pessoas e da menção chegando ao sino só de quem foi mencionado e saindo ao marcar como lida. Suíte 188/188.
- Preview:
  - status salvo e na lateral e no cartão;
  - `@Jo` abriu a lista, "Joao da Silva" foi escolhido, a observação saiu com a menção destacada e o sino do João recebeu o aviso.
  - Contraste sem problemas no claro e no escuro.

## Finalizar chamado: Resultado e Observação final num campo só (2026-11-06)

### Pedido
Juntar "Resultado" e "Observação final" no formulário de finalizar o chamado.

### Implementado
- O formulário de finalizar (`CallDetailPage.tsx`) agora tem "Data e hora de execução" e um campo só, "Resultado e observação" (4 linhas), já preenchido com o resultado sugerido (o que havia, ou "Motivo — Submotivo" do OFS).
- Ao finalizar, `splitFinishText` manda a primeira linha não vazia como Resultado (até 255 caracteres, usado nos relatórios) e o texto inteiro como observação final.
  - O servidor não mudou: os dois campos continuam preenchidos e obrigatórios, então relatórios e auditoria seguem iguais.
- A dica embaixo do campo explica a regra da primeira linha.

### Validação
- Preview: chamado da demo finalizado com "Reparo realizado / GIGA+, fibra emendada na CTO". Ficou Resultado = "Reparo realizado" e observação final = o texto inteiro. Typecheck do frontend ok.

## Lote 5 das ideias: usabilidade (2026-11-06)

### Implementado
- **Atalhos na fila** (Chamados abertos, Em atendimento, Finalizados e cancelados):
  - `/` vai para a busca;
  - seta para baixo (na busca ou fora de campos) entra na primeira linha;
  - nas linhas, setas ou `j`/`k` sobem e descem, Home/End vão ao início/fim e Enter abre o chamado.
  - A linha em foco fica destacada.
  - As setas no seletor de status dentro da linha continuam mudando o status, não a linha.
- **Modo TV com rotação**: já existia (troca de visão a cada 20 s, com pausa e setas). Ganhou a visão "Destaques" no lote 4.
- **Histórico de alterações** (`/historico-alteracoes`, em Administração, mesma permissão da aba Auditoria do chamado, `calls.view_logs`):
  - todas as alterações de chamados no período (padrão: últimos 7 dias), com quando, pessoa, ordem (link), o que mudou, antes e depois;
  - filtros por pessoa, campo e busca por ordem ou valor, e exportação em Excel;
  - até 2.000 registros por consulta, com aviso para escolher um período menor.
  - Rota `GET /api/auditoria?from&to` (`listAllAuditLogs`; no Supabase, a ordem vem de uma segunda consulta em `calls`).

### Validação
- Teste HTTP do histórico: alteração de hoje com ordem e pessoa, período inválido → 400, supervisor → 403. Suíte 189/189; a primeira rodada teve o timeout conhecido em um teste não relacionado.
- Preview: `/` foca a busca, as setas andam entre as linhas, e o histórico mostra as alterações feitas na demo. Contraste sem problemas no claro e no escuro, inclusive com a linha em foco.

## Novas ideias, lote A: coleta parada e escalonamento (2026-11-06)

### Pedido
Implementar as 15 novas ideias. O segundo fator de login (13) ficou de fora por decisão do usuário. Lote A: aviso de integração parada no WhatsApp (15) e escalonamento automático (3).

### Implementado (`backend/src/alerts.ts` e rotinas em `server.ts`)
- **Coleta do OFS parada** (`integrationOutage`): mais de 2h sem envio certo de export ou de fechamentos.
  - Um aviso no grupo dos avisos (`WUZAPI_ALERT_CHAT`) quando para e outro quando volta.
  - O estado fica em `integration_events` (tipo `integration_alert`), então não repete a cada 5 min nem depois de reiniciar.
  - Sem nenhum registro de coleta ainda, não avisa.
- **Escalonamento** (`escalations`):
  - chamado Aberto e sem técnico há mais de 5h vai para quem atribui chamados (`calls.assign`);
  - chamado com técnico e sem observação há mais de 2h (contando da última observação, da atribuição ou da abertura) vai para o supervisor do técnico, ou para quem atribui, se o supervisor não tiver usuário.
  - O aviso vai sempre para o sino (`user_notifications`, tipo `escalation`) e também para o WhatsApp numa mensagem só, se ligado.
  - Cada chamado é escalado uma vez por regra a cada 24h (registro em `integration_events`, tipo `escalation`).
  - Na primeira conferência em produção seriam 6 chamados (sem observação há mais de 2h) de 23 ativos.
- As rotinas rodam a cada 5 min. O escalonamento roda sempre (sino); aviso de prazo, resumo das 7h e coleta parada só com o WhatsApp configurado. Nenhuma roda dentro dos testes automatizados.
- O painel Integração OFS lista os avisos de coleta parada e de resumo no histórico, e o cartão do WhatsApp descreve tudo o que ele avisa.

### Validação
- Teste novo `alerts.test.ts` (limite de 2h, sem registro, só falhas, cluster não conta; 5h sem técnico, 2h sem observação a partir da atribuição ou da observação, finalizados fora). Suíte 191/191.
- Não testado contra o WuzAPI real.

## Novas ideias, lote B: sugestão de técnico, risco e incidentes em massa (2026-11-06)

### Implementado (`backend/src/assist.ts`)
- **Sugestão de técnico** (`GET /api/chamados/:id/sugestoes`, permissão `calls.assign`): os 3 melhores técnicos trabalhando e ativos para o chamado.
  - A nota considera a carga atual (livre +3, 1 chamado +1,5, 2 chamados 0, depois negativo), os finalizados na mesma região, bairro e OLT nos últimos 90 dias e o % no prazo (com mínimo de 5 chamados).
  - No detalhe do chamado, abaixo do seletor de técnico, aparece "Sugeridos para este chamado" com os motivos. Clicar só escolhe no seletor; vale ao salvar.
  - O campo região do técnico quase sempre está vazio, por isso a sugestão usa o histórico.
- **Risco de estourar o prazo** (`POST /api/chamados/risco`): modelo simples com os finalizados dos últimos 90 dias.
  - Parte da taxa geral acima de 6h e ajusta por região, tipo, faixa de horário da abertura e técnico (com suavização para grupos pequenos). Depois soma o tempo já corrido; sem técnico há mais de 3h vira "alto".
  - Não estima com menos de 30 finalizados nem depois que o prazo já estourou.
  - Na fila, aparece o selo "Risco médio" (25% ou mais) ou "Risco alto" (50% ou mais), com os motivos ao passar o mouse.
  - O histórico fica em cache por 5 min e o modelo por 30 min.
- **Incidentes em massa** (`GET /api/operacao/incidentes`): 3 ou mais chamados ativos na mesma OLT, abertos com até 3h entre um e outro.
  - Aparecem no topo do Mapa da fila com OLT, região, janela de tempo, slot/PON e as ordens (com link).
  - Ações em lote (`POST /api/operacao/incidentes/acao`, até 50 chamados), cada uma com a permissão de sempre:
    - atribuir o mesmo técnico (Aberto vira Atribuído);
    - a mesma observação em todos;
    - finalizar todos, com data e hora e "Resultado e observação" (a primeira linha é o Resultado) e um segundo clique para confirmar.
  - O resultado volta chamado a chamado, dizendo quais não foram e por quê.

### Validação
- Teste novo `assist.test.ts`: ordem das sugestões e motivos, auxiliar e demitido fora; risco sem histórico, região propensa a atraso, tempo corrido, já estourado e sem técnico há mais de 3h; janela e mínimo de 3 dos incidentes.
- Teste HTTP: sugestões (supervisor → 403), risco, incidentes, ação em lote com técnico inválido (422), supervisor finalizando (403), observação em 2 chamados com 1 inexistente (1 ok). Suíte 195/195.
- Preview: incidente com 3 chamados da demo na mesma OLT, "Observação em todos" aplicada (3 de 3), sugestões no detalhe. Contraste sem problemas no claro e no escuro.
- O selo de risco não aparece na demo, que tem poucos finalizados. Em produção há 3.296 finalizados em 90 dias.

## Novas ideias, lote C: linha do tempo, gargalos e mapa de calor (2026-11-06)

### Implementado
- **Linha do tempo do chamado** (`CallTimeline.tsx`, no detalhe, abaixo do aviso de reincidência): uma barra com quanto tempo o chamado ficou em cada etapa, da abertura à Data Fim (ou até agora).
  - Etapas: aguardando técnico (até `assignedAt`) e depois cada status (Atribuído, Deslocamento, Em campo), a partir das trocas de status do histórico.
  - Mostra a linha pontilhada do prazo de 6h, o total e o tempo por etapa.
  - Só a parte do histórico depende da permissão de auditoria; sem ela, mostra espera e atendimento.
  - Em produção, o histórico de status começa em 04/11 e quase todo chamado vai de Aberto a Atribuído e depois a Finalizado.
- **Gargalos: espera x atendimento** (novo tipo em Relatórios, `GET /api/relatorios/gargalos`): nos finalizados do período, mostra o tempo esperando técnico (abertura → atribuição) e o tempo em atendimento (atribuição → Data Fim).
  - Mediana e p90, % do tempo total que foi espera, e quantos passaram de 6h com mais da metade do tempo esperando.
  - Por região (mais espera primeiro) e por técnico (mais atendimento primeiro), com mínimo de 3 chamados por linha, e Excel.
  - Ignora atribuição fora da janela. Em produção, 3.217 dos 3.297 finalizados de 90 dias têm atribuição coerente.
- **Mapa de calor por horário** (novo tipo em Relatórios, `GET /api/relatorios/mapa-de-calor`): grade dia da semana × hora (São Paulo), em média por dia do período, com quatro visões:
  - chamados que entram;
  - técnicos diferentes que finalizaram chamados naquela hora;
  - chamados por técnico;
  - % fora do prazo pela hora de abertura (mínimo 3).
  - Tem Excel com uma aba por visão.
- Correção: o Histórico de alterações busca em páginas de 1.000. O Supabase devolve no máximo 1.000 linhas por consulta, então antes parava em 1.000 mesmo prometendo 2.000.

### Validação
- Teste novo `reports-batchc.test.ts`: mediana e espera, atribuição incoerente fora, mínimo de 3 por grupo; grade por dia e hora, cancelado fora, técnicos por hora, % só com 3 ou mais.
- Suíte completa verde. Preview: linha do tempo num chamado da demo e mapa de calor. Contraste sem problemas no claro e no escuro.

## Novas ideias, lote D: meta do mês, relatório mensal, reincidência por técnico e exportação (2026-11-06)

### Implementado
- **Meta do mês com projeção** (`MonthGoals.tsx`):
  - na Visão geral, um cartão com % no prazo e % outliers do mês contra a meta (89% e 4,9%);
  - mostra o que ainda precisa nas ordens que devem fechar até o fim do mês no ritmo atual, com a mesma conta da aba IGP;
  - no Modo TV, as duas frases entram na visão "Prazo do mês";
  - atualiza a cada 5 min e não aparece se o mês ainda não tem ordens.
- **Relatório mensal (PDF)** (novo tipo em Relatórios): escolhe o mês e abre `/relatorio-mensal/AAAA-MM` numa aba nova, sem lateral nem topo, em formato A4, com "Imprimir / salvar em PDF". O conteúdo:
  - ordens finalizadas, % no prazo, outliers e MTTR contra as metas;
  - por área (SP, GRU, Alto Tietê, ABC), e acesso × backbone;
  - comparação com o mês anterior;
  - os 10 principais motivos de fechamento e a reincidência do mês.
  - A página força o tema claro, porque o papel é branco. É um modelo padrão; dá para ajustar quando houver o formato da operadora.
- **Reincidência por técnico** (novo tipo em Relatórios, `GET /api/relatorios/reincidencia-tecnico`): dos reparos finalizados no período com endereço, OLT e slot/PON completos, quantos tiveram outro chamado no mesmo ponto em até 30 dias depois da Data Fim.
  - Ranking por técnico a partir de 5 reparos, com as ordens que voltaram (link para as duas) e Excel.
- **Exportar tudo** (Configurações, só administrador, `GET /api/exportacao`): uma planilha com três abas.
  - Chamados abertos ou finalizados no período, com todos os campos.
  - Observações, com os anexos só pelo nome.
  - Histórico de alterações.
  - Até 366 dias por vez e 50 mil observações ou alterações; busca no banco em páginas de 1.000.

### Validação
- Testes novos: reincidência por técnico (janela de 30 dias, ponto incompleto, 47 dias não conta) e exportação (administrador 200, mais de 366 dias 400, supervisor 403). Suíte 199/199.
- Preview: relatório mensal aberto, rota de exportação respondendo. Contraste sem problemas em Configurações, Relatórios e Visão geral, claro e escuro.
- Na demo, a meta do mês não aparece (o mês não tem ordens finalizadas).

## Novas ideias, lote E: checklist ao finalizar e tela do técnico (2026-11-06)

### Implementado
- **Checklist por tipo de chamado** (Configurações, só administrador; `GET/PUT /api/checklists`):
  - cada checklist tem nome, tipos de chamado (vazio = todos) e de 1 a 20 itens; o do tipo específico ganha do geral;
  - ao finalizar, no detalhe do chamado ou no celular, todos os itens precisam ser marcados. O servidor recusa (422) dizendo o que falta, e o que foi conferido entra na observação final (`Checklist "Nome": ✔ item; …`);
  - a finalização automática pelo OFS e a finalização em lote de incidentes não passam pelo checklist.
- **Tela do técnico — Meus chamados** (`/campo`, `FieldPage.tsx`), pensada para celular:
  - mostra só os chamados do técnico ligado ao usuário (ativos e os finalizados de hoje), com o tempo colorido pelo prazo, cliente, endereço (com "Abrir no mapa"), OLT e slot/PON;
  - botões grandes: "Saí para o local" (Deslocamento), "Cheguei" (Em campo), "Observação / foto" (até 4 fotos, reduzidas no celular) e "Finalizar" (checklist + "Resultado e observação"; a primeira linha é o Resultado);
  - rotas `/api/campo/*`: só o próprio técnico e só os próprios chamados, sem depender de permissão de cargo. As fotos são conferidas pelo tamanho e pelo conteúdo;
  - o item "Meus chamados" aparece no menu só para quem está ligado a um técnico; se o cargo não tiver nenhuma outra tela, ele vira a tela inicial.
- **Vínculo técnico ↔ usuário**: no detalhe do técnico (aba Técnicos), "Usuário do sistema (Meus chamados)".
  - Um usuário fica ligado a um só técnico (`GET /api/tecnicos/vinculos`, `PUT /api/tecnicos/:id/usuario`, permissão `technicians.edit`).
  - Fluxo sugerido: criar um cargo "Técnico" sem outras permissões, criar o usuário em Usuários e ligá-lo aqui.
- Migração `202611060004_field_and_checklists.sql`: tabelas `technician_users` e `checklist_templates` (RLS ligado, sem políticas).
  - São tabelas separadas, não uma coluna em `technicians`, para o cadastro de técnicos não depender desta migração. Antes dela, as leituras devolvem vazio e os salvamentos avisam que a migração falta.

### Validação
- Teste novo `field.test.ts` (escolha do checklist, itens sem acento e maiúscula, nota).
- Teste HTTP do fluxo completo:
  - sem vínculo → 403; vínculo pelo administrador; supervisor não vincula;
  - só os próprios chamados (o de outro técnico → 404); status inválido → 400; Em campo e observação;
  - checklist só por administrador; sem marcar → 422; marcado → finaliza com o resultado e o checklist na observação.
  - Suíte 202/202.
- Preview em tamanho de celular: Saí → Cheguei → Finalizar bloqueado sem o checklist e finalizado com ele.
  - No preview apareceu um erro meu: finalizar sem foto mandava uma observação vazia antes. Corrigi: as fotos vão numa observação só quando existem.
  - Contraste sem problemas no claro e no escuro.

## Imagem da fila com a observação (2026-11-06)

### Pedido
A imagem gerada por "Copiar imagem" na fila (ex.: Chamados em atendimento) precisa mostrar a observação.

### Implementado
- Nova coluna "Observação" na imagem (`copyTableAsImage`, `CallsPage.tsx`) com o texto da última observação do chamado e, embaixo, o autor e a data e hora.
- Sem observação, mostra o campo de notas do chamado (a mesma informação da coluna "Última observação" da fila), ou "–" com "Sem observação".
- Texto longo é cortado em 180 caracteres, para a imagem continuar legível no WhatsApp.
- As observações dos chamados da página são buscadas na hora de gerar a imagem, em paralelo. Nada mudou no carregamento da fila.

### Validação
- Preview: imagem gerada em Em atendimento com a coluna "Observação" mostrando o texto e "Administrador JH · 06/11, 15:46". Typecheck do frontend ok.

## Listas com no máximo 100 por página (2026-11-09)

### Pedido
O Histórico de alterações travava para carregar (2.000 registros de uma vez). Colocar um limite de 100 em toda aba que mostra dados em lista, sempre.

### Implementado
- Paginador único (`frontend/src/components/Pager.tsx`): `usePaged` (100 por página, volta à página 1 quando os filtros mudam) e `Pager`, com o mesmo visual da paginação das filas de chamados.
- **Histórico de alterações**: agora busca no servidor só a página pedida, 100 por vez (`listAuditLogPage`, `GET /api/auditoria?page&pageSize&field&userId&q`).
  - Os filtros de pessoa, campo e busca (ordem ou valor) passam a valer no banco, e não mais sobre os 2.000 carregados no navegador.
  - O total vem do banco ("X registro(s)"), e a busca espera parar de digitar.
  - O filtro de pessoa usa a lista de usuários, e o de campo lista os campos conhecidos.
  - Técnico aparece pelo nome em vez do id, e "observations" aparece como "Observação".
  - Exportar Excel continua levando até 2.000 registros, com os filtros atuais.
- Paginação de 100 nas outras listas:
  - Relatórios: finalizados fora do prazo, produtividade (técnicos e supervisores), motivos de fechamento, reincidência por técnico;
  - Técnicos, Usuários, Pessoas, Acionamentos;
  - Integração OFS (chamados parados), Carga dos técnicos, Repetidos (repetições e quartil), Painel diário (técnicos e ordens), Configurações (mapa de OLTs).
  - As filas de chamados já eram de 100 por página.
  - Ficaram sem paginador as listas de tamanho fixo ou já limitadas: comparação (6 linhas), mapa de calor (7×24), gargalos (20), histórico da integração (60) e amostras de importação (12).
- Em Acionamentos, "Aceitar todos" continua valendo para todos os pendentes. O formulário de recusar os selecionados aparece no primeiro selecionado da página atual.
- Regra registrada na memória do projeto, para as próximas telas também saírem com o limite.

### Validação
- Teste HTTP do histórico paginado: página de 1, filtro de campo, `pageSize` acima de 2.000 → 400. Suíte 202/202.
- Preview: com 121 alterações, a página 1 mostrou 100 linhas e a página 2 mostrou 21 ("101–121 de 121 registros").
- As 11 telas com lista abriram sem erro no console. Contraste sem problemas no claro e no escuro.

## Aceite de acionamento travado por endereço "em linhas" (2026-11-09)

### Problema
- O acionamento 610032319500102 não era aceito. Erro: "value too long for type character varying(160)".
- O card veio sem CEP, com o endereço em linhas: o rótulo numa linha ("Número", "Bairro", "Cidade") e o valor na de baixo.
- O leitor juntava os 4 clientes num só registro. O bairro saía com 311 caracteres e estourava a coluna `calls.bairro` (limite de 160).

### Correção
- Card sem CEP: a lista de endereços é separada por cliente, um registro para cada "NOME:".
- Novo leitor para o endereço em linhas. Monta "RUA UM, 130 - JARDIM GUILHERMINO - GUARULHOS" e pega o bairro direto do rótulo.
- No aceite, cada texto é cortado no tamanho máximo da coluna. Assim, um card fora do padrão não trava mais o aceite. O texto completo continua na mensagem original.
- Cards com CEP continuam lidos do mesmo jeito.

### Validação
- Teste `line-labeled-address.test.ts` com uma cópia anonimizada do card. Resultado: bairro "JARDIM GUILHERMINO" e endereço "RUA UM, 130".
- Suíte 203/203 e typecheck do backend sem erros.

## Painéis sem recarregar à toa + checklist legal e de acessibilidade (2026-11-09)

### Cache dos painéis (só atualiza quando os dados mudam)
- **Servidor**
  - Visão geral, Análise de prazo, IGP, relatórios, Mapa, Carga e Incidentes guardam o resultado já calculado por pessoa e por filtro.
  - O resultado vale até qualquer gravação dar certo (chamado, acionamento, importação, webhook do WhatsApp, envio da extensão) ou por no máximo 20 s. As rotinas de fundo gravam direto no banco, por isso o limite de tempo.
  - Arquivo `backend/src/read-cache.ts`. O cabeçalho `X-Read-Cache` mostra se a resposta saiu do cache ("hit") ou foi calculada ("miss").
- **Transferência**
  - Toda leitura da API tem ETag.
  - O navegador pergunta "mudou algo?" e, se não mudou, o servidor responde 304 sem corpo.
  - O `Cache-Control: no-cache` que o navegador acrescenta sozinho nessas perguntas é ignorado, para o ETag valer.
- **Navegador**
  - Ao voltar para uma tela, os números aparecem na hora com o último resultado e são conferidos em segundo plano. Com 304, a tela nem redesenha.
  - A conferência roda a cada 1 min só com a aba visível, quando a aba volta a ficar visível e quando um chamado é alterado.
  - Arquivo `frontend/src/lib/data-cache.ts`.
  - Fica só na memória da aba (dados de clientes não ficam gravados no aparelho) e é apagado ao sair.

### Checklist da imagem: o que foi feito em cada item
1. **Política de privacidade**: página `/privacidade`, abre com ou sem login. Explica dados tratados, finalidades, bases legais, fornecedores, transferência internacional, retenção, segurança e direitos.
2. **Termos de serviço**: página `/termos` (uso autorizado, conta pessoal, sigilo, conteúdo enviado, registro de atividades, limites das informações).
3. **Aviso de cookies**: aviso único no rodapé. O sistema só usa armazenamento essencial (sessão, tema, filtros), que não depende de consentimento, e o aviso diz isso.
4. **Política de reembolso**: não se aplica. O sistema é interno e não vende nada.
5. **Formulários na LGPD**:
   - links para a Política e os Termos no login e em Meu perfil;
   - campos de login com `autocomplete` correto;
   - erro de login anunciado ao leitor de tela.
6. **Só dados necessários**:
   - revisado; o sistema guarda o necessário para atender os chamados;
   - foto, banner, apelido e status são opcionais e removíveis;
   - "Meus dados" traz das alterações só data, ordem e campo.
7. **Scripts de tracking**: nenhum (sem analytics, pixels ou cookies de terceiros). Registrado na política.
8. **Acessibilidade**:
   - link "Pular para o conteúdo";
   - região principal (`main`) marcada;
   - foco visível para teclado em todo o sistema.
9. **Alt nas imagens**: todas as `<img>` já tinham `alt`. A logo das páginas legais usa alt vazio, porque o nome vem escrito ao lado.
10. **Contraste**: auditoria sem problemas em `/privacidade`, `/termos` e `/perfil`, no claro e no escuro.
11. **Navegação por teclado**:
    - pular para o conteúdo;
    - contorno de foco;
    - "Esqueci minha senha" com `aria-expanded`.
    - Os atalhos da fila já existiam.
12. **Sem avaliações falsas**: não há.
13. **Sem promessas falsas**: "Esqueci minha senha" não fazia nada. Agora diz o caminho real (pedir a um administrador). Os Termos deixam claro que indicadores podem atrasar com importações.
14. **Copyright das imagens**:
    - a única imagem do sistema é a logo da própria JH;
    - os ícones são da biblioteca Lucide (licença ISC, uso livre);
    - os Termos proíbem enviar imagens sem direito de uso.
15. **Dados da empresa**: bloco "Quem é o responsável" nas páginas legais, com os campos em `frontend/src/lib/company.ts`. **Faltam razão social, CNPJ, endereço, nome do encarregado (DPO) e e-mail de contato.** Os campos vazios não aparecem.
16. **Conformidade LGPD**: "Baixar meus dados" em Meu perfil (art. 18, acesso). Novo endpoint `GET /api/auth/meus-dados`, só com os dados da própria pessoa.
17. **Riscos jurídicos**: listados na resposta ao usuário (dados de clientes em grupos de WhatsApp, prazo de retenção, contratos com os fornecedores, revisão jurídica dos textos).

### Validação
- Testes HTTP:
  - cache hit/miss;
  - 304 com ETag;
  - gravação invalida o cache, gravação recusada não invalida;
  - "Meus dados": 401 sem login e só os próprios dados, sem senha.
- Suíte 205/205.
- Typecheck e build do frontend sem erros.
- Preview:
  - ao voltar para Visão geral e IGP, a API respondeu 304 e os números apareceram na hora;
  - download de "Meus dados" funcionou;
  - nenhum erro no console.
- Dados do responsável preenchidos (2026-11-09):
  - responsável e encarregado: Matheus Terra Farias;
  - contato sobre dados pessoais: planilhasjh@gmail.com.
  - O sistema é de pessoa física. O CPF não é exigido pela LGPD e ficou de fora de propósito, porque a página é pública.

## Direitos autorais (2026-11-09)
- **Aviso ©**:
  - "© 2026 Matheus Terra Farias. Todos os direitos reservados." com links para Privacidade, Termos e Licenças;
  - aparece na tela de login, no rodapé do menu lateral (some com o menu recolhido) e no fim das páginas legais;
  - o ano final se atualiza sozinho (2026–2027...).
- **Termos de Uso**: nova seção "Direitos autorais e propriedade intelectual".
  - O software é de Matheus Terra Farias (Leis 9.610/1998 e 9.609/1998).
  - O acesso é só permissão de uso. É proibido copiar, modificar, distribuir ou fazer engenharia reversa sem autorização.
  - A marca JH Telecom é de seus titulares.
  - Fotos de perfil continuam de quem enviou.
  - Há um canal para avisar violação de direitos autorais.
- **Página `/licencas`**:
  - lista as bibliotecas de código aberto com versão, licença, autor e texto completo da licença: 14 no site, 8 no servidor, mais as 2 fontes do Google Fonts;
  - os dados vêm de `frontend/src/lib/third-party-licenses.json`, que só carrega nessa página;
  - para atualizar a lista depois de instalar pacotes: `node frontend/scripts/generate-licenses.mjs`.
- **Arquivo `LICENSE`** na raiz: software proprietário, todos os direitos reservados, com o contato do titular.
- **Metadados de autoria**:
  - `package.json` (raiz, frontend e backend) com `author` e `license: UNLICENSED` (o termo do npm para "não licenciado para terceiros");
  - `index.html` com as meta tags `author` e `copyright`.
- **Política de Privacidade**: o Google Fonts entrou na lista de fornecedores. Ele recebe o IP de quem abre o sistema para entregar as fontes, sem cookies.
- **Validação**: typecheck e build sem erros. Contraste OK em `/licencas`, `/termos` e `/perfil`, no claro e no escuro. O aviso no menu cabe sem rolagem.
- Ajuste (2026-11-09): o aviso © saiu do menu lateral, que ficava poluído. Agora é uma linha discreta e centralizada no fim de cada página do sistema (inclusive Meu perfil), com os links Privacidade, Termos e Licenças. No login e nas páginas legais continua como antes. Contraste OK em `/perfil`, `/` e `/relatorios`, no claro e no escuro.

## Corrigir a Data Fim do chamado (2026-11-09)

### Problema
- A Data Fim só podia ser lida na tela do chamado.
- Com o chamado encerrado (Finalizado, Baixar ou Cancelado), o sistema só deixa trocar o status. Para corrigir a data, era preciso reabrir o chamado.
- A sincronização do OFS reescrevia a Data Fim a cada coleta. Uma correção manual seria desfeita.

### Correção
- **Tela do chamado**
  - O campo Data Fim virou editável, inclusive com o chamado encerrado.
  - Ao mudar a data, aparecem "Salvar Data Fim" e "Desfazer". Essa data é salva sozinha, separada do "Salvar alterações", e o chamado não é reaberto.
- **Novo endpoint `PUT /api/chamados/:id/data-fim`**
  - Exige a permissão de editar chamados.
  - Recebe o horário de São Paulo.
  - Recusa data antes da abertura ou no futuro.
  - Fica no histórico como "Data de finalização alterado".
- **Sincronização do OFS**
  - Se uma pessoa corrigiu a Data Fim pela tela, o OFS não sobrescreve mais essa data. Os outros campos do OFS continuam atualizando normalmente.
  - Finalizar pelo sistema não trava a data: o OFS continua ajustando, como antes.
  - Funciona pelo histórico de alterações, sem mudar tabelas.

### Validação
- Teste unitário: com a Data Fim corrigida à mão, o OFS mantém a correção. Sem correção, o OFS segue atualizando.
- Teste HTTP:
  - chamado em Baixar corrigido sem reabrir;
  - o PATCH normal continua recusando (409);
  - data antes da abertura e data no futuro são recusadas (422).
- Suíte 207/207.
- Preview: correção salva com confirmação, data antes da abertura recusada com mensagem, contraste OK no tema claro e no escuro.
- Correção (2026-11-09): em produção, "Salvar Data Fim" respondia "Chamado nao encontrado".
  - **Causa**: a atualização no Supabase recusa qualquer mudança em chamado encerrado que não seja de status. A etapa anterior também acrescenta região e endereço à atualização. O modo local não tem essa trava, por isso os testes passavam.
  - **Correção**: nova função `updateCallEndDate`, que grava só `executed_at` e o log "Data de finalização alterado". Ela não passa pela trava nem altera outros campos.
  - Teste atualizado para usar o mesmo caminho. Suíte 207/207.

## Limpeza do cadastro de técnicos (2026-11-09, dados de produção, autorizada pelo usuário)
- **Pedido**: ficar só com os técnicos da planilha de 09/11 (27 técnicos), sem tirar o técnico das ordens já finalizadas.
- **Técnicos**: os 27 da planilha já existiam. Os outros 27 foram excluídos, entre eles demitidos, duplicados, o registro "JH Telecom" e um cadastro de teste.
  - A exclusão é a mesma do botão Excluir: preenche `deleted_at` e desativa.
  - As ordens mantêm o `technician_id`, então o nome continua aparecendo nos 1.389 chamados encerrados desses técnicos.
  - Nenhum deles tinha chamado em aberto. A operação conferia isso e cancelaria tudo se encontrasse algum.
- **Auxiliares**: ficaram os 20 da coluna AUXILIAR. Saíram Andre Pereira da Silva, Édson Luan Parras de Oliveira Alves, Nelson Quaitti, Ryan Robert e um "Francisco Roberto" duplicado (ficou o ligado a Paulo Herculano). Vínculos com técnicos excluídos foram limpos.
- **Reativados**: Edson Luan Parras De Oliveira e Enedino Assis Costa Neto.
- **Nomes corrigidos como na planilha**: Carlos Roberto Oliveira Junior e Ricardo Mendes de Sousa.
- **Resultado**: 27 técnicos e 20 auxiliares, todos ativos.

## Técnicos sem a coluna "Vínculo" (2026-11-09)
- A pedido do usuário, saiu da tela Técnicos tudo o que era de vínculo (Trabalhando/Demitido):
  - a coluna da tabela;
  - o filtro;
  - o campo nos formulários de criar e editar;
  - a linha nos detalhes.
- Quem sai da equipe agora é excluído pelo botão Excluir. O nome continua nas ordens antigas.
- O cartão "Trabalhando" virou "Na equipe" (técnicos e auxiliares cadastrados).
- O campo continua no banco e no backend, sem mudar tabelas. Cadastros antigos marcados como Demitido seguem fora da atribuição de chamados.
- Preview: tabela com 8 colunas e nenhum texto de vínculo na tela. O console só tinha erros antigos, de testes anteriores.
- Filtro por tipo (2026-11-09): em Filtros, na tela Técnicos, dá para escolher Todos os tipos, Técnicos ou Auxiliares. O filtro vale junto com a busca, a situação e a região. Preview: "Técnicos" mostra só técnicos; "Auxiliares" fica vazio na demonstração, que não tem auxiliares.

## README refeito (2026-11-09)
- O README novo traz:
  - visão geral e funcionalidades por área;
  - diagrama da arquitetura (Mermaid) e tabela de onde roda cada parte;
  - como rodar (preview com dados fictícios e desenvolvimento com Supabase);
  - tabelas das variáveis de ambiente da API e do site;
  - deploy (Render, Vercel e Supabase) e integrações (WuzAPI, Coletor OFS, Drive), com links para os guias em `docs/`;
  - comandos, estrutura de pastas e combinados do projeto (roadmap, 100 por página, contraste, preview antes do push);
  - licença.
- Os fatos foram conferidos no código: scripts, variáveis lidas pela API, `render.yaml`, `vercel.json`, versão da extensão e temas.

## Nova observação direto da fila (2026-11-09)
- **Onde**: em "Chamados em atendimento", clicar na coluna "Última observação" abre um popup sem sair da fila. Clicar no resto da linha continua abrindo o chamado.
- **O popup mostra**:
  - o chamado (ordem, técnico, tipo e bairro);
  - a última observação, com horário e autor (sem observação, mostra as notas do chamado);
  - o campo "Nova observação", com @ para mencionar, contador de 5.000 caracteres e Ctrl+Enter para salvar;
  - os botões Cancelar e Salvar e o link "Abrir chamado completo". Esc fecha.
- **Ao salvar**, é registrada uma observação nova pelo mesmo endpoint do detalhe do chamado. A anterior continua no histórico. A linha atualiza na hora: o texto aparece e o contador volta a zero.
- **Permissão**: a célula só é clicável para quem tem `calls.add_observation`. Observação vazia é recusada com mensagem.
- **Arquivos**: `frontend/src/components/ObservationPopup.tsx` e o estilo em `calls-queue.css`. O tema escuro foi gerado.
- **Preview**:
  - abrir, salvar vazio (recusado) e salvar texto (linha atualizada) funcionaram;
  - ao reabrir, a nova aparece como última;
  - Esc fecha, e o clique fora da célula abre o chamado;
  - contraste do popup OK no claro e no escuro.

## Limpeza diária dos técnicos nas ordens (2026-11-09)
- **Pedido**: de manhã a equipe redistribui as ordens. As ordens com o técnico de ontem devem voltar para Chamados abertos, menos as alocadas a partir das 19h (técnico da noite, que segue no dia seguinte).
- **Regra** (decidida com o usuário):
  - Roda todo dia às **06:00** (São Paulo), uma vez por dia.
  - Entram as ordens **Atribuído, Deslocamento e Em campo** com técnico. Atrelado fica como está. Finalizado, Cancelado e Baixar nunca são mexidos.
  - A ordem volta para **Aberto, sem técnico**, se o técnico atual foi alocado **antes das 19:00 do dia anterior**. Alocadas das 19:00 de ontem em diante continuam com o técnico.
  - **Horário da alocação**: vale a última troca de técnico registrada no histórico. Sem registro, vale a primeira atribuição e, por último, a abertura. Assim, uma ordem trocada para o técnico da noite às 20h fica com ele.
- **Segurança**:
  - Se o servidor estava parado às 06:00, a limpeza roda na primeira verificação até as 10:59. Depois disso fica para o dia seguinte, para não tirar técnico de ordem em andamento no meio do dia (por exemplo, logo após um deploy).
  - Subindo em 09/11 depois das 10:59, a **primeira execução é em 10/11 às 06:00**.
- **Registro**:
  - Cada ordem limpa fica no histórico como alteração do sistema ("Limpeza diaria").
  - Cada execução fica em `integration_events` (`daily_reset`), com as ordens devolvidas e as mantidas. Aparece como "Limpeza diária" na tela Integração OFS.
  - A ajuda de Chamados abertos explica a regra.
- **Arquivos**:
  - `backend/src/daily-reset.ts`: regra pura;
  - `backend/src/daily-reset-job.ts`: rotina, que roda junto com as verificações de 5 em 5 min;
  - `lastTechnicianAssignmentTimes` em `store/observations.ts`.
- **Validação**:
  - testes da regra: 18:59 limpa, 19:00 e 23:00 ficam, noite de anteontem limpa, Atrelado, Aberto e Finalizado ignorados, troca no histórico vence a primeira atribuição;
  - teste da rotina: não roda antes das 06:00 nem depois das 10:59, roda uma vez por dia e devolve ou mantém as ordens certas.
  - Suíte 211/211.
- Correção (2026-11-09): na fila, a coluna "Última observação" mostrava o campo de notas do chamado ("Criado a partir de acionamento aceito."), e não a última observação. Por isso, a observação salva pelo popup não aparecia depois de recarregar.
  - Novo endpoint `GET /api/chamados/ultimas-observacoes?ids=...` (até 100 por vez). Devolve a última observação (texto, autor e hora) de cada chamado numa consulta só e respeita o escopo do supervisor.
  - A coluna agora mostra "Autor: texto" da última observação. Sem nenhuma observação, continua mostrando as notas.
  - "Copiar imagem" da fila passou a usar o mesmo endpoint: 1 chamada em vez de até 100.
  - Teste HTTP: a última observação vence a anterior e mais de 100 ids são recusados.
  - Preview: depois de salvar e recarregar, a linha mostra "Administrador JH: matheus amassou".

## Técnicos: "Copiar imagem" (2026-11-09)
- Novo botão "Copiar imagem" na tela Técnicos, ao lado de "Novo técnico". Gera a lista como imagem, no mesmo modelo da fila, para mandar a atualização da equipe no WhatsApp. Copia para a área de transferência ou, sem permissão, baixa o PNG.
- **Conteúdo da imagem**:
  - todos os nomes da lista com os filtros atuais (busca, tipo, situação e região), até 100;
  - colunas Técnico, Tipo, Supervisor, Turno, Situação (Disponível em verde, Em campo em azul, Indisponível em vermelho) e Status;
  - embaixo do nome do técnico vão os auxiliares dele; embaixo do auxiliar, o técnico com quem trabalha;
  - título conforme o filtro de tipo e subtítulo com disponíveis, em campo e data e hora.
- Preview: a imagem "tecnicos-e-auxiliares-2026-11-09.png" foi gerada (3354×1704) sem erro.
- Cards que acompanham os filtros (2026-11-09):
  - Os quatro cards da tela Técnicos (Na equipe, Em campo, Disponíveis e Regiões) passaram a contar só quem está na lista com a busca e os filtros atuais.
  - O texto do primeiro card muda conforme o filtro: "Técnicos na lista", "Auxiliares na lista" ou "Na lista com os filtros".
  - Regiões não contam mais o valor em branco como região.
  - Preview: com o filtro "Em campo", os cards mudaram de 5/2/2 para 2/2/0, iguais às 2 linhas da tabela.

## Imagens com no máximo 20 linhas (2026-11-09)
- **Regra**: todo "Copiar imagem" (fila de chamados, Técnicos, Painel diário) gera imagens de até **20 linhas**. Lista maior vira várias imagens.
  - Cada parte traz no subtítulo "Parte 1 de 3 · linhas 1–20 de 45".
  - A linha de total, quando existe, vai só na última parte.
  - Os arquivos saem como `nome-parte-1.png`, `nome-parte-2.png` e assim por diante.
- **Uma imagem só**: continua igual (copia e baixa).
- **Várias partes**:
  - todas são baixadas;
  - o aviso mostra "N imagens baixadas" e um botão "Copiar parte X" para cada uma, para colar no WhatsApp na ordem;
  - "Compartilhar todas" no celular;
  - o aviso fica 45 s na tela.
- **Contraste**: o tom "muted" das etiquetas da imagem (ex.: "Técnico" na coluna Tipo) estava apagado demais. Passou de #a0abba para #5f6c80 sobre #f3f5f8.
- **Arquivos**: `splitReportSpec` e `shareReportImage` em `frontend/src/lib/report-image.ts`; aviso em `ImageReadyToast.tsx`.
- **Preview**: 45 linhas viraram 3 imagens (20 + 20 + 5), com o total só na última e o aviso com 3 botões de copiar.
- Fonte maior nas imagens (2026-11-09): as imagens geradas por "Copiar imagem" (fila, Técnicos, Painel diário) ficaram mais legíveis no celular.
  - Tamanhos de fonte que mudaram: texto das células 17→21 px, linha de baixo 14→17 px, etiquetas coloridas 16→19 px, cabeçalho da tabela 14→17 px, título 30→36 px, subtítulo 15→18 px, contador 15→18 px e rodapé 12→14 px.
  - As colunas ficaram 20% mais largas para acompanhar a fonte.
  - Os cinzas das linhas de baixo e do rodapé ficaram um pouco mais escuros.
  - Preview: imagem de teste com as 7 colunas da fila gerada sem erro.

## Informativo de acionamento para o Casa Cliente + consulta só de leitura (2026-11-09)
- **Origem**: porte do script da planilha (`verificarEEnviarInformativoOLT`). O setor Casa Cliente recebe no WhatsApp os eventos de rede da área dos clientes dele.
- **Quando**: assim que chega um card de uma OLT da lista, decidido com o usuário. A lista tem as 33 OLTs da planilha (`OLT_NOTICE_OLTS` em `backend/src/olt-notice.ts`).
- **Para onde**: grupo `120363422003961917@g.us`, o mesmo da planilha. Pode ser trocado pela variável `WUZAPI_INFORMATIVO_CHAT` no Render.
- **Texto**:
  - mesmo modelo da planilha: Tipo, BDESK, OfficeTrack, Evento, Afetação, OLT, todas as PLACA/PON (com os zeros) e até 15 endereços;
  - título "CRÍTICO" a partir de 30 afetados;
  - no final, o link "Acompanhar o chamado (só leitura)".
- **Correção em relação à planilha**: a busca de PLACA/PON não pega mais datas (ex.: "07/11" de "07/11/2026").
- **Uma vez por acionamento**: o envio fica registrado em `integration_events` (`olt_notice`) e aparece como "Informativo Casa Cliente" na tela Integração OFS. Os campos vazios da análise são completados com a leitura simples do card.
- **O informativo não vira card novo**: o webhook ignora mensagens que começam com "INFORMATIVO DE ACIONAMENTO", inclusive as que a planilha ainda mandar.
- **Link só de leitura** (`/consulta/<token>`):
  - token assinado com o JWT_SECRET (escopo `public-call-view`) que abre só aquele acionamento, sem login;
  - endpoint público `GET /api/public/consulta/:token`, com `Cache-Control: no-store` e `noindex`;
  - **validade**: 7 dias depois do encerramento do chamado (ou da recusa do card), e no máximo 60 dias desde o recebimento;
  - **conteúdo**, "andamento completo" como escolhido pelo usuário:
    - enquanto ninguém aceita: dados do card e "Aguardando aceite";
    - card recusado: aviso de que não foi aceito;
    - depois do aceite: status, status OFS, técnico, abertura e fim, OLT, placa/PON, endereços, linha do tempo (recebido, aberto e cada troca de status) e as observações da equipe com autor e hora;
  - a página atualiza sozinha a cada 1 minuto. Arquivo `frontend/src/pages/PublicCallPage.tsx`.
- **Política de Privacidade**: inclui a nova finalidade (aviso ao setor Casa Cliente com link só de leitura).
- **Validação**:
  - testes unitários: lista de OLTs, PLACA/PON com zeros e sem datas, endereços, texto normal e crítico, token e expiração;
  - teste HTTP: card → "aguardando" → aceite → "chamado" com linha do tempo; o eco do informativo é ignorado; token inválido ou de outro segredo dá 404;
  - suíte 218/218;
  - preview: página nos dois estados, contraste OK no claro e no escuro.
- **Atenção na virada**: desligar o envio do informativo na planilha, senão o grupo recebe dois informativos por card.
- Informativo com botão (2026-11-09):
  - O informativo do Casa Cliente agora vai com o botão **"Acompanhar chamado"**, que abre o link só de leitura. Usa o tipo `cta_url` do endpoint `POST /chat/send/buttons` da WuzAPI (conferido na especificação da própria WuzAPI do usuário).
  - O link sai do texto e vai para o botão. O rodapé diz "Somente leitura · o link vale até 7 dias depois do encerramento".
  - Se a WuzAPI recusar o botão (erro HTTP ou `success: false`), o sistema manda o texto com o link no final, como antes. O registro em Integração OFS diz se foi "com botão" ou "com link no texto".
  - `WUZAPI_INFORMATIVO_BUTTONS=false` no Render volta a mandar sempre com o link no texto.
  - Botão de teste na tela Integração OFS, só para administrador: "Enviar informativo de teste". Pede confirmação e manda um informativo marcado como TESTE no grupo do Casa Cliente.
  - **Risco**: o WhatsApp pode não mostrar botões enviados por número comum (WhatsApp Web). Confira com o envio de teste. Se o botão não aparecer, use `WUZAPI_INFORMATIVO_BUTTONS=false`.
  - Teste com uma WuzAPI de mentira: botão com o link certo e corpo sem o link; botão recusado cai para o texto; chave desligada nem tenta o botão. Suíte backend verde.
- Grupo do informativo (2026-11-09): o destino padrão passou a ser `120363216252480324@g.us`, grupo do Casa Cliente indicado pelo usuário. A variável `WUZAPI_INFORMATIVO_CHAT` no Render, se existir, continua com prioridade.
- Grupo de teste (2026-11-09):
  - O botão "Enviar informativo de teste" manda só no grupo de teste `120363422003961917@g.us` (pode ser trocado por `WUZAPI_INFORMATIVO_TEST_CHAT`).
  - Os informativos de verdade continuam indo para o grupo do Casa Cliente.
  - Esse grupo também recebe cards, mas o teste não vira acionamento: o webhook ignora mensagens de informativo.

## Extensão 1.4.0: correção dos Clusters + identificador no WhatsApp Web (2026-11-09)
- **Erro dos Clusters**:
  - Sintoma: "Não achei o seletor de data do OFS (a aba fixada não está no Console de Alocação)" nos 4 baldes.
  - Causa: a leitura de fechamentos usa a mesma aba fixada e deixa a aba aberta numa atividade. O link "Console de Alocação" era procurado pelo texto exato e a barra de data não aparecia a tempo.
  - Correção 1: antes de cada coleta de clusters, a aba fixada volta para a tela inicial do OFS (que abre o Console) e espera o OFS responder.
  - Correção 2: o link do Console é procurado sem acento e por "contém".
  - Correção 3: a espera pela barra de data ficou maior, e o erro agora diz em que tela a aba estava.
- **Extensão JH Agendamentos 2.1.1 (analisada, não instalada)**: o módulo de WhatsApp dela (painel do cliente, mensagens agendadas, respostas rápidas) é ligado ao JH Agendamentos.
  - Da extensão vieram a técnica de escrever na caixa do WhatsApp Web ("colar" para manter as quebras de linha e depois clicar em Enviar) e a função "Conversar sem salvar o contato".
- **Identificador** (`extensao-rede/whatsapp-identificador.js`, content script em `web.whatsapp.com`):
  - os mesários usam o mesmo número; no Chrome de cada um, a mensagem enviada (Enter ou botão Enviar) ganha `*Nome Sobrenome:*` + quebra de linha no começo;
  - o nome vem do login da extensão ou do campo "Nome que aparece";
  - pode valer em todas as conversas ou só em grupos;
  - cola só o identificador, sem mexer no resto (menções e formatação ficam);
  - não identifica cards de acionamento, informativos nem mensagens que já começam com o nome;
  - nada é enviado sozinho, só quando a pessoa envia.
- **Popup**: novo bloco "WhatsApp Web" (ligar/desligar, nome, onde, conversar sem salvar o contato).
- **Manifest**: versão 1.4.0 e permissão `https://web.whatsapp.com/*`. Ao atualizar, o Chrome pede a nova permissão.
- **Validação**:
  - sintaxe dos arquivos conferida;
  - teste do identificador numa página que imita a caixa do WhatsApp Web: mensagem comum saiu com o nome (Enter e botão), mensagem já identificada e card não foram alterados;
  - não testado no WhatsApp Web real nem no OFS real (depende das contas do usuário).

## Extensão 1.5.0: ferramentas de WhatsApp da extensão JH Agendamentos + nome corrigido (2026-11-09)
- **Nome duplicado** ("Matheus Terra: Matheus Terra:"):
  - Causa: o WhatsApp mostra o texto colado alguns milissegundos depois. A extensão conferia na hora, achava que a colagem tinha falhado e escrevia o nome de novo.
  - Correção: a conferência agora espera 150 ms e o envio acontece em 320 ms.
  - Pedido do usuário: o identificador usa só o primeiro nome do cadastro (`*Matheus:*`).
- **Módulo de WhatsApp da extensão JH Telecom 2.1.1** copiado para `extensao-rede/whatsapp/` (wa.js, wa-page.js, temas.js, wa.css, carregando.js) e registrado no manifest. A ponte `wa-page.js` roda no mundo da página.
  - **Fica na Rede**: temas, modo escuro, tela de carregamento, privacidade (desfocar), agendar mensagem, mensagens agendadas, respostas rápidas, corretor, conversar sem contato e o visual enxuto.
  - **Fica desligado**, porque depende do site do JH Agendamentos aberto: painel do cliente, Minha fila, nome do cliente na lista e faixa de mensagens prontas de agendamento. Essas opções saíram do menu JH e são forçadas para desligado.
  - **Preferências** (respostas rápidas e mensagens fixadas): no `background.js` da Rede ficam em `chrome.storage.local` (`waPrefs`), não no Supabase do Agendamentos.
- **Popup**: aviso sobre o botão JH. Se a extensão do Agendamentos também estiver com o WhatsApp ligado, deixar ligado em uma só.
- **Manifest**: versão 1.5.0.
- **Validação**:
  - sintaxe de todos os arquivos conferida;
  - teste numa página que imita o WhatsApp: o módulo e os temas carregaram sem erro e o identificador mandou `*Matheus:* oi` uma vez só;
  - não testado no WhatsApp Web real.

## Extensão 1.6.0: popup redesenhado (2026-11-09)
- **Pedido**: visual parecido com a extensão JH Telecom do irmão do usuário, mas melhor.
- **Novo popup** (380 px):
  - cabeçalho com a marca, o subtítulo "Coletor OFS e WhatsApp da Rede" e a versão numa etiqueta;
  - abas **Início**, **OFS**, **WhatsApp** e **Ajustes**, e o popup lembra a última aba aberta;
  - cartões arredondados com ícone e título;
  - conta com avatar de iniciais e botões Sair e Testar conexão;
  - resumo da coleta (último envio, fechamentos e clusters lado a lado);
  - interruptores no lugar das caixinhas;
  - prévia em balão verde de como a mensagem sai no WhatsApp (`*Matheus:*`), que acompanha o nome digitado;
  - escolha do CSV como botão;
  - mensagens das ações (exportar, enviar CSV) numa faixa abaixo das abas, visível em qualquer aba;
  - tema escuro automático, que segue o tema do sistema.
- Todos os campos e botões anteriores continuam, com os mesmos IDs, e o popup.js funciona igual.
- **Prévia no navegador** com dados de exemplo, no claro e no escuro: abas, conta logada, resumo da coleta e aba WhatsApp conferidos. A versão aparecia "vv1.6.0" e foi corrigida.
- Extensão 1.6.1, temas do WhatsApp (2026-11-09):
  - Os temas da extensão JH Telecom 2.1.1 já tinham vindo inteiros na 1.6.0 (`whatsapp/temas.js` idêntico ao original), com a tela de carregamento nas cores do tema. Ficam em **JH → Temas** no WhatsApp Web.
  - Temas disponíveis: WhatsApp Claro e Escuro, JH Azul, Ardósia, Neon Escuro, Névoa Roxa, Aurora, Flor, e "Criar tema"/"Personalizar" com cores e imagem de fundo.
  - Novo atalho no popup: aba WhatsApp → **Escolher tema do WhatsApp**. Traz a aba do WhatsApp para a frente e abre a janela de temas; se o WhatsApp não estiver aberto, abre.
- Extensão 1.6.2 (2026-11-09):
  - **"Sem login" no WhatsApp**: o menu JH dizia "sem login — entre pela extensão" com o usuário logado.
    - Causa: o código veio da extensão do Agendamentos, que guarda a validade da sessão em `expira` (milissegundos). O RedeFlow guarda em `expiraEm` (data ISO).
    - Correção: o menu lê os dois formatos e mostra "conectado ao JH RedeFlow".
  - **Popup**: tirada a rolagem interna (eram duas barras de rolagem) e o texto dos cartões Fechamentos e Clusters ficou limitado a 6 linhas. O detalhe completo continua na tela Integração OFS.

## Baixar a extensão pelo sistema (2026-11-09)
- **Onde**: Configurações → **Extensão do Chrome**, visível para qualquer usuário logado. Tem o botão "Baixar extensão (.zip)" e o passo a passo para instalar no computador dos mesários:
  1. extrair numa pasta fixa;
  2. `chrome://extensions` com o Modo do desenvolvedor ligado;
  3. Carregar sem compactação;
  4. fixar a extensão, entrar com o login e conferir o nome do WhatsApp;
  5. recarregar o WhatsApp Web.
  - O cartão também explica como atualizar.
- **Servidor**:
  - `GET /api/extensao` devolve a versão atual, lida do `manifest.json`;
  - `GET /api/extensao/download` monta o .zip na hora a partir da pasta `extensao-rede` do deploy, então o download é sempre a versão atual;
  - os dois exigem login;
  - zip feito no próprio código (`backend/src/extension-package.ts`, deflate + CRC32), sem dependência nova;
  - os arquivos ficam dentro da pasta `jh-redeflow-extensao`;
  - o .zip fica em cache até algum arquivo mudar;
  - a pasta pode ser apontada por `EXTENSION_DIR`, se um dia sair do repositório.
- `Content-Disposition` exposto no CORS, para o nome do arquivo chegar ao navegador.
- **Validação**:
  - teste HTTP: sem login dá 401; com login vem um zip válido, e o `manifest.json` de dentro tem a mesma versão do endpoint;
  - `unzip -t` sem erros;
  - preview: o cartão mostra "Versão atual: 1.6.2" e o download veio com 95 KB;
  - contraste OK em `/configuracoes`, no claro e no escuro.

## Extensão 1.7.0: ajustes só para Administrador + atualizar a extensão pelo sistema (2026-11-09)
- **Ajustes travados**:
  - Na extensão, o "Nome que aparece", o identificador do WhatsApp (ligado e onde) e a aba Ajustes (coleta automática) só podem ser mudados com login do cargo **Administrador**.
  - Os outros cargos, e quem não fez login, veem tudo travado com o aviso "Só o cargo Administrador altera estes ajustes".
  - Temas, conversar sem contato e as ações do OFS continuam livres.
  - O popup mostra o cargo de quem está logado.
- **Login da extensão** (`POST /api/integrations/ofs/login`):
  - qualquer usuário ativo entra, porque os mesários precisam do login para o nome no WhatsApp;
  - a resposta traz `user.role` e `canCollect`;
  - enviar dados do OFS continua exigindo a permissão de Importações a cada envio (403 sem ela);
  - quem não pode coletar não roda a coleta automática, e os botões do OFS mostram o motivo em vez de tentar.
- **Atualizar a extensão pelo sistema** (Configurações → Extensão do Chrome):
  - "Atualizar a extensão deste Chrome" usa o acesso a pastas do Chrome/Edge. Na primeira vez a pessoa escolhe a pasta `jh-redeflow-extensao` e permite editar; o sistema lembra a pasta (IndexedDB), e nas próximas só confirma.
  - O sistema baixa o .zip da versão atual, descompacta no navegador (`DecompressionStream`) e grava os arquivos por cima dos antigos.
  - Depois pede para a extensão se recarregar, pela nova ponte `sistema-ponte.js`, um content script nas páginas do sistema que responde à versão instalada e chama `chrome.runtime.reload()`.
  - O cartão mostra a "Versão atual" e a versão "Neste Chrome" (em dia ou desatualizada).
  - Também tem "Escolher outra pasta" e "Baixar .zip", com o passo a passo para computador novo.
  - A partir da 1.7 a extensão se atualiza sozinha por esse botão. A instalação que já existe (1.6.x) precisa ser atualizada à mão uma última vez.
- **Arquivos**: `frontend/src/lib/extension-updater.ts`, `frontend/src/components/ExtensionDownload.tsx`, `extensao-rede/sistema-ponte.js`.
- **Validação**:
  - teste HTTP do login: Supervisor entra, com `canCollect` falso e 403 no envio; Administrador entra com `canCollect` verdadeiro;
  - suíte backend verde;
  - preview: .zip baixado e descompactado no navegador, com os 16 arquivos gravados numa pasta do próprio navegador (o `manifest.json` gravado é o da 1.7.0);
  - popup com login de Supervisor: campos travados e avisos visíveis;
  - contraste OK em `/configuracoes`, no claro e no escuro;
  - não foi testado com uma pasta real do computador nem com o recarregar da extensão de verdade.

## Status "GIGA+" (2026-11-09)
- **Motivo**: o escritório foi dividido e este trata só os chamados de SP. Todos os acionamentos continuam chegando nos grupos, e o status **GIGA+** marca os que são tratados pelo outro escritório (GIGA+).
- **Comportamento**: funciona como encerrado.
  - Sai das filas ativas, não exige técnico e não pode ser editado sem trocar o status. Pode ser reaberto trocando o status, por exemplo para Aberto.
  - Aparece em "Finalizados e cancelados", com aba própria e cor ciano.
  - Fica **fora dos indicadores** do escritório: Visão geral (fila ativa e período), relatórios, mapa da fila, carga dos técnicos, incidentes e análise de prazo. O IGP já só contava Finalizado.
  - A limpeza das 06:00 não mexe (só Atribuído, Deslocamento e Em campo). Na importação D-0 conta como encerrado: não recebe técnico do OFS.
- **Banco**: `calls.status` é texto, sem lista fixa, então não precisou de migração.
- **Arquivos**: tipo `CallStatus` (backend e frontend), listas de encerrados, `validStatuses` e validação do PATCH, `reportCalls`, `/api/dashboards/prazo`, `getDashboardMetrics`, `imports/d0.ts`, fila e detalhe do chamado, página de consulta pública.
- **Validação**:
  - teste HTTP: Aberto → GIGA+ sem técnico, sai da fila ativa da Visão geral, aparece no filtro GIGA+, edição bloqueada (409), reaberto volta para a fila;
  - suíte 221/221;
  - preview: GIGA+ no seletor de status e aba "GIGA+" em Finalizados e cancelados;
  - contraste OK no claro e no escuro.

## Copiar o número do chamado na fila (2026-11-09)
- Nas filas (Chamados abertos, Em atendimento, Finalizados e cancelados), clicar no **número do chamado** copia o número em vez de abrir o chamado.
  - Aparece um "Copiado" verde do lado.
  - O **BDESK** embaixo também copia.
  - Clicar no resto da linha continua abrindo o chamado. Com o teclado, Enter ou espaço no número também copia.
- Ao passar o mouse, o número ganha uma borda tracejada e o cursor de copiar.
- Componente `frontend/src/components/CopyText.tsx`. Sem permissão de área de transferência, copia pelo jeito antigo do navegador.
- **Preview**: o clique copiou "RF-240916", a página não saiu da fila e o "Copiado" apareceu. Contraste OK no claro e no escuro.
- Aba GIGA+ em "Chamados em atendimento" (2026-11-09):
  - Nova aba **GIGA+** no fim das abas de status, separada por uma linha e com cor própria. Mostra os chamados do outro escritório, com ou sem técnico.
  - **Não entra no "Todos"**: ele continua somando só Atribuído, Atrelado, Deslocamento e Em campo.
  - A tela lembra a aba escolhida. Os GIGA+ continuam também em Finalizados e cancelados.
  - **Preview**: Todos 2, aba GIGA+ 1. Ao abrir a aba aparece só o GIGA+, e o Todos lista só os 2 em atendimento. Contraste OK no claro e no escuro.

## Economia de tráfego do Supabase (egress) (2026-11-10)
- **Motivo**: o plano gratuito estourou o tráfego de saída (9,2 GB de 5 GB) e o projeto foi restrito (402). Pelo `pg_stat_statements`, a maior parte vinha de ler a tabela `calls` inteira (5 mil linhas, ~14 MB) dezenas de milhares de vezes, mais a consulta paginada da fila a cada tecla da busca.
- **Cópia dos chamados em memória** (`integrations/supabase/client.ts`):
  - carga completa a cada 30 min;
  - entre uma carga e outra, busca só o que mudou (`updated_at`), quando algo foi gravado pela API ou no máximo 1x por minuto;
  - os filtros (status, período, supervisor, busca, região, área, OLT, ordenação) rodam em memória, com a mesma regra da consulta do banco;
  - um chamado só (detalhe, antes de gravar) continua sendo lido direto do banco;
  - exclusões e edição de técnico/supervisor forçam carga completa;
  - observação nova atualiza a "última observação" na cópia;
  - a importação do Drive e a troca de cluster agora gravam `updated_at`.
- **Fila paginada** (`listCallsPage`): servida da cópia em memória, sem chamar a RPC `list_calls_page_with_atrelada` (a RPC continua no banco, sem alteração).
- **Busca da fila com debounce de 400 ms** (`CallsPage.tsx`): uma consulta depois de parar de digitar, em vez de uma por tecla.
- **Outros caches em memória**:
  - perfil de quem está logado: 60 s, limpo em qualquer gravação;
  - fotos e banners: 10 min, atualizados na hora ao salvar ou remover;
  - lista de acionamentos: 30 s por status, limpa em qualquer gravação.
- **Sino de notificações**: de 15 s para 60 s, só com a aba visível, e atualiza ao voltar para a aba.
- **Sem migração, sem mudança de tabela, RLS ou variáveis de ambiente.**
- **Validação**:
  - typecheck do backend e do frontend;
  - suíte 221/221;
  - preview: digitar "silva" na busca de "Em atendimento" gerou uma única rodada de consultas, com a palavra inteira.

## Migração para um novo projeto Supabase (2026-11-10)
- **Motivo**: o projeto antigo (`sxpoxgwxcloumpttcowt`, conta antiga) ficou restrito pelo limite de tráfego do plano gratuito, que só seria liberado com upgrade ou no novo ciclo (02/12). O limite conta por organização, então o projeto novo foi criado em **outra conta**.
- **Como foi feito**:
  - script temporário com o pacote `pg`, por conexão direta aos dois bancos; o antigo foi só lido;
  - estrutura gerada a partir do banco em produção (não dos arquivos de migration, que tinham diferenças): 25 tabelas, 7 funções, 54 índices, 55 restrições, 7 políticas de RLS e as permissões de `anon`, `authenticated` e `service_role`;
  - dados de todas as tabelas de `public` e os logins (`auth.users` e `auth.identities`), mantendo as senhas; sessões antigas não foram copiadas, então todos entram de novo uma vez;
  - sequência de `d0_base_records` ajustada no mesmo ponto.
- **Conferência**: contagem igual em todas as tabelas (ex.: 5.115 chamados, 5.030 históricos, 703 acionamentos, 15 logins) e mesma quantidade de funções, índices, restrições e políticas.
- **Troca**: o usuário atualizou no Render `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. Novo deploy no ar às 11:43; os acionamentos do WhatsApp já gravam no banco novo e o login responde normalmente.
- **Limpeza**: o arquivo de senhas e os scripts temporários foram apagados. O projeto antigo ficou intacto, como cópia de segurança.
- **Atenção**: o novo projeto também é gratuito (5 GB de tráfego/mês). As economias de tráfego do commit `95e8cbe` já estão ativas nele.

## Controle do tráfego do banco novo (2026-11-10)
- **Medição** (`backend/src/db-usage.ts`):
  - toda resposta do Supabase passa por um `fetch` medido, ligado nos dois clientes (admin e login);
  - soma bytes e consultas por dia e por destino (tabela, função `rpc` ou login);
  - usa o tamanho sem compressão, então é uma estimativa para mais.
- **Salvamento** (`db-usage-job.ts`):
  - a cada 5 min grava uma linha por dia em `integration_events` (kind `db_usage`), com o histórico dos últimos 35 dias dentro;
  - ao desligar (deploy novo, SIGTERM), grava o que faltava;
  - sem migração: usa a tabela que já existia.
- **Modo economia automático** (pelo total dos últimos 30 dias, limite em `SUPABASE_EGRESS_LIMIT_GB`, padrão 5):
  - a partir de 60%, "economia": cópia dos chamados, cache das telas, perfil do login e lista de acionamentos valem **3x** mais tempo;
  - a partir de 85%, "economia forte": valem **10x** mais tempo;
  - gravações pela API continuam atualizando na hora; só o que rotinas automáticas gravam demora mais para aparecer.
- **Aviso**: ao entrar ou sair do modo economia, registra em Integração (tipo "Tráfego do banco") e manda mensagem no grupo dos avisos do WhatsApp.
- **Painel em Configurações → "Tráfego do banco (Supabase)"** (só quem tem `settings.manage`; endpoint `GET /api/configuracoes/banco`):
  - total dos 30 dias contra o limite, com marcas de 60% e 85%, e o modo atual;
  - gasto de hoje e projeção para 30 dias;
  - gráfico por dia com a linha do limite diário (limite ÷ 30) e o valor de cada dia ao passar o mouse;
  - tabela do que mais consome.
- **Validação**:
  - 3 testes novos (`test/db-usage.test.ts`); suíte 224/224 (o teste HTTP que estourou o tempo passou ao rodar de novo);
  - preview com dados simulados no navegador: painel no claro e no escuro, dica ao passar o mouse, contraste OK nos dois temas.

## Extensão 1.7.1: nome do identificador fica guardado (2026-11-10)
- **Problema**: quando o banco antigo caiu, o servidor recusou o login da extensão, a extensão apagou a sessão e o identificador do WhatsApp parou de colocar o nome, porque ele só lia o nome da sessão.
- **Correção**:
  - no login, o primeiro nome também é guardado à parte (`nomeFixo` no storage local);
  - se o login cair (banco fora, sessão vencida, erro 401/403), as mensagens continuam saindo com o nome;
  - só o botão **Sair** apaga o nome; um login de outra pessoa troca pelo dela;
  - quem já estava logado de antes da 1.7.1 tem o nome guardado sozinho na primeira vez que o WhatsApp Web abre com o login ainda válido;
  - ordem do nome: o digitado em "Nome que aparece", depois o do login atual, depois o guardado;
  - o campo "Nome que aparece" mostra o nome guardado como sugestão quando não há login.
- **Arquivos**: `extensao-rede/background.js`, `whatsapp-identificador.js`, `popup.js` e `manifest.json` (1.7.1).
- **Validação**: sintaxe dos 3 arquivos; simulação do identificador nos três casos (login caiu com nome guardado, login antigo sem nome guardado, nome digitado no ajuste).

## Aviso de acionamento no canto inferior direito, com Aceitar e Recusar (2026-11-10)
- O aviso "Novo acionamento recebido" saiu do topo, no meio da tela, e foi para o **canto inferior direito** (`frontend/src/components/ActivationToast.tsx`, `activation-toast.css`).
- **O que mostra**: ordem (ou BDESK), tipo, OLT e motivo do card.
- **Botões**:
  - **Aceitar** cria o chamado na hora;
  - **Recusar** abre o campo do motivo (mínimo 3 letras, como na tela de Acionamentos) e depois **Confirmar recusa**;
  - **Ver** abre a tela de Acionamentos;
  - **X** só esconde, e o acionamento continua pendente.
  - Aceitar e Recusar só aparecem para quem tem a permissão `activations.decide`; os outros veem só o aviso e o "Ver".
- **Comportamento**:
  - não some sozinho enquanto há acionamento esperando decisão (antes sumia em 8 s);
  - vários chegando juntos formam uma fila ("1 de 3"), e depois de decidir aparece o próximo;
  - ao decidir, mostra a confirmação por 1,2 s;
  - o sino, o contador do menu e a tela de Acionamentos atualizam na hora;
  - o que foi decidido em outra tela ou computador sai da fila na próxima atualização do sino.
- **Celular**: o aviso ocupa a largura da tela, com 16 px de margem.
- **Validação** (preview com dados de demonstração):
  - aceitar criou o chamado (Chamados abertos foi de 4 para 5);
  - recusar com motivo mostrou "Acionamento recusado" e tirou o aviso;
  - contraste OK no claro e no escuro;
  - typecheck do frontend.

## Correção do atrelado (2026-11-10)
- **Caso**: o FIELD 12687665 (VIP-SZN-SPO-OHW-01, SLOT 3 PON 11) saiu no bot da planilha como "ATRELADO AO CHAMADO 12687558", mas no sistema não apareceu atrelado.
- **Causas**:
  - o sistema só aceitava como atrelado um chamado com **status do OFS = pendente**. Esse campo quase nunca está preenchido (no banco antigo, só 2 chamados em aberto tinham). A planilha usa o STATUS do próprio chamado;
  - a data/hora do card ("10/11/2026 09:00") era lida no fuso do servidor (UTC no Render). O evento ficava 3 h antes do real, e chamados abertos nessas 3 h eram descartados como "mais novos".
- **Regra nova** (`findAtreladaCallOrder`, igual à da planilha `verificarAtreladoDiretoAcionamentosCampo`):
  - o chamado precisa estar **pendente**: com status do OFS, só OFS Pendente; sem status do OFS, chamado Aberto, Atribuído ou Atrelado (Deslocamento, Em campo e encerrados ficam de fora);
  - mesma OLT, mesmo par placa/PON, ordem diferente;
  - **data do evento do chamado** (`event_at`, como a coluna DATA EVENTO) antes do evento do card; sem ela, a data de abertura;
  - vence o mais antigo;
  - horário do card lido como **São Paulo**.
- **Tráfego**: os candidatos agora vêm da cópia dos chamados em memória (antes era uma consulta extra ao banco a cada acionamento).
- Vale para os acionamentos que chegarem daqui para frente; os que já estão na lista não são recalculados.
- **Testes**: `test/atrelada.test.ts` (caso real, chamado sem status do OFS, chamados iniciados ou encerrados fora, fuso de São Paulo, data do evento e o mais antigo); suíte 228/228.

## Selo de risco embaixo da ordem (2026-11-10)
- Nas filas (Chamados abertos, Em atendimento, Finalizados e cancelados), os selos da coluna Ordem ficam numa **linha própria embaixo do número** (e do BDESK, quando tem): "Risco alto/médio", "Atrelada" e "Reincidente".
  - Antes, sem BDESK, o risco ficava ao lado do número.
- Os selos ficam num `div.cq-order-badges` (`CallsPage.tsx`, `calls-queue.css`); sem selo, a linha não aparece.
- **Preview**: com um selo de risco colocado na primeira linha, ele ficou embaixo da ordem e do BDESK; typecheck do frontend.

## Export do OFS com HTTP 502 durante deploy (2026-11-10)
- **Caso**: export das 09:10 (12:10 UTC) de 10/11 voltou "HTTP 502". Foi o momento exato em que o Render trocava de versão (deploy do commit `68031e7`; a instância nova subiu às 12:10:13). Os envios seguintes (fechamentos às 12:11, clusters às 12:13) passaram normalmente.
- **Servidor** (`server.ts`): ao receber SIGTERM (deploy), para de aceitar conexões novas, **termina os pedidos em andamento** (até 25 s; o Render espera 30 s), grava a medição de tráfego e só então sai. Antes saía na hora.
- **Extensão 1.7.2** (`background.js`):
  - o envio do export tenta de novo **2 vezes** (10 s e 25 s depois), só quando o erro é passageiro: 502, 503, 504 ou sem conexão;
  - erros reais (login, dados inválidos) não repetem;
  - antes, a próxima tentativa era só no horário seguinte (1 h depois).
- **Validação**:
  - suíte 228/228;
  - simulação do envio: 502 e depois 200 → ok na 2ª tentativa; sem conexão 3x → falha depois de 3 tentativas; 400 → falha na 1ª, sem repetir.

## Técnico do OFS com nome diferente do cadastro (2026-11-10)
- **Caso**: chamados sem técnico ficavam em "Chamados abertos" mesmo com o OFS "concluído" (ex.: 610121237910102, aberto desde 09/11).
  - O OFS manda o técnico (Recurso) como "Paulo Herculano Firmo" e o cadastro tem "Paulo Herculano".
  - A comparação só aceitava o nome inteiro igual, então o técnico não entrava. O encerramento automático (que já existia e exige técnico) também não acontecia.
- **Regra nova** (`matchOfsTechnician`, `backend/src/imports/d0.ts`):
  - primeiro tenta o nome igual (como antes);
  - se não achar, aceita o nome mais curto contido no maior: mesmo primeiro nome e todas as palavras do menor (pelo menos 2, ignorando "da/de/do/dos/das/e") presentes no maior. Vale para os dois lados (OFS ou cadastro mais curto);
  - só técnicos (não auxiliares) ativos e trabalhando, e **só quando um único técnico bate**; se bater em dois, não adivinha.
- **Encerramento**: nada mudou na regra. Com o técnico preenchido pelo export, o próximo ciclo do Coletor lê o fechamento do OFS e finaliza o chamado com a Data Fim e o motivo do OFS (`callsReadyToFinish`).
- Se o técnico do OFS não estiver cadastrado, o chamado continua sem técnico, como antes.
- **Testes**: casos novos em `test/d0-import.test.ts` (cadastro mais curto, OFS mais curto, auxiliar não conta, dois candidatos, primeiro nome diferente); suíte 228/228.

## GIGA+ passa a ser chamado aberto até o OFS concluir (2026-11-10)
- **Pedido**: GIGA+ não deve contar como finalizado. É um chamado em aberto, só que não é tratado por nós. Precisa continuar aceitando observações (para mandar aos gestores) e só encerra quando o OFS mostrar que terminou de verdade.
- **Antes**: GIGA+ era tratado como encerrado. Ganhava Data Fim ao ser marcado, travava a edição e recusava observação ("Chamado encerrado. Reabra o chamado antes de adicionar observacoes").
- **Regra nova** (`backend/src/call-status.ts` e `isCallClosed` em `frontend/src/api.ts`):
  - encerrados de verdade: Finalizado, Cancelado e Baixar;
  - **GIGA+ só é encerrado quando o status do OFS é "concluído"**; antes disso é aberto. A regra usa o status do OFS (e não a Data Fim) porque os GIGA+ antigos ganharam Data Fim ao serem marcados; assim não precisa mexer nos dados.
- **Na prática**:
  - GIGA+ aberto: aceita observação e edição; aparece em **Em atendimento → GIGA+**; não aparece em Finalizados;
  - GIGA+ concluído no OFS: vai para **Finalizados → GIGA+**, com a Data Fim do OFS (o export grava a Data Fim quando o OFS conclui e limpa a antiga enquanto não concluir);
  - **nunca vira "Finalizado"** sozinho (o encerramento automático pelo fechamento do OFS continua só para os nossos);
  - continua **fora dos indicadores** (Visão geral, relatórios, mapa, carga, incidentes, prazo, IGP) e da limpeza das 06:00;
  - marcar GIGA+ não grava mais Data Fim;
  - o export do OFS pode preencher o técnico de um GIGA+ sem técnico, como nos outros abertos.
- **Filas**: novo filtro `gigaClosed` em `GET /api/chamados` (`false` = GIGA+ em aberto, `true` = concluído no OFS). Em atendimento pede `false`; Finalizados pede `true`.
- **Testes**:
  - `test/call-status.test.ts` (aberto até o OFS concluir, filtro das filas, nunca vira Finalizado);
  - teste HTTP do GIGA+ atualizado (editável, aceita observação, fora da Visão geral, aparece só em aberto);
  - suíte 231/231.
- **Preview**: chamado marcado como GIGA+ aceitou observação (201), contou 1 na aba GIGA+ de Em atendimento e 0 em Finalizados.

## SN da ONU em todos os chamados (AutoISP) e extensão 1.8.0 (2026-11-10)
- **Motivo**: os testes da Rede são feitos pelo SN da ONU.
  - Card FIELD: já traz "S/N".
  - Card NOC e outros: trazem contratos ("Contrato(s) Exemplo(s)" e o contrato de cada endereço afetado).
- **Onde fica o SN** (sem migração): no acionamento que criou o chamado.
  - O SN do card FIELD já era lido.
  - O achado no AutoISP vira uma linha nova em `activation_processing` (`autoispSerial`, `autoispContract`, `autoispOlt`).
- **Chamado**: novo campo **"SN da ONU"** no detalhe (`CallDetailPage`), que copia ao clicar e mostra a origem: "Do card", "AutoISP · contrato X" ou "Aguardando a extensão no AutoISP".
- **Backend**:
  - `backend/src/serial-number.ts`: normaliza o SN (16 hex ou 4 letras + 8 hex), tira os contratos do card ("5687878.3" → "5687878", até 8) e escolhe a linha do AutoISP da mesma OLT do chamado;
  - `backend/src/store/serials.ts`;
  - rotas:
    - `GET /api/chamados/:id/sn`;
    - `GET /api/integrations/autoisp/pendentes`: chamados em aberto, inclusive GIGA+, sem SN e com contrato, até 25;
    - `POST /api/integrations/autoisp/sn`: mesma identificação do Coletor OFS (perfil com Importações).
- **Extensão 1.8.0** (`background.js`, permissão `https://auto.alloha.com/*`):
  - a cada ciclo dos fechamentos, pede os chamados sem SN;
  - procura até 3 contratos de cada um em `auto.alloha.com/client_search/search?contract_id=...`, **dentro da aba do AutoISP já aberta e logada** (usa o login de quem está no computador);
  - manda ao sistema só SN, OLT e contrato, sem nome nem endereço do assinante;
  - sem aba do AutoISP aberta, não faz nada;
  - também dá para rodar pela mensagem `buscarSn`.
- **Validação**:
  - formato da resposta do AutoISP conferido numa busca real por contrato (lista com `serial_number`, `olt_hostname`, `contract_id`; funciona com e sem o filtro "Ativo");
  - `test/serial-number.test.ts` (formatos do SN, card FIELD x AutoISP, contratos do card NOC, linha da mesma OLT);
  - suíte 235/235;
  - preview: aceitar o acionamento, mandar o SN como a extensão manda e abrir o chamado mostrou "SN da ONU 48575443ABCD1234 · AutoISP · contrato 5687878".

## Temas do WhatsApp da equipe: publicar e baixar (extensão 1.9.0) (2026-11-10)
- **Pedido**: um mesário criou vários temas e quer publicar para os outros baixarem.
- **Na extensão** (janela Temas do WhatsApp, `whatsapp/temas.js`):
  - em "Meus temas", cada tema ganhou o botão **Publicar**;
  - nova aba **"Da equipe"** com a galeria: nome, autor, quantos baixaram e se tem imagem de fundo;
  - **Baixar e aplicar** guarda o tema em "Meus temas" e já aplica;
  - **✕** tira o tema da galeria; aparece só para quem publicou ou para um Administrador.
- **Quem pode**: qualquer pessoa logada na extensão publica e baixa, sem aprovação (escolha do usuário).
- **Segurança**: as cores de outra pessoa entram no CSS e no HTML do WhatsApp de quem baixa. Por isso só passam cores de verdade (#hex, rgb/rgba/hsl, gradientes e sombras), sem aspas, `url()`, `;`, `<>` ou chaves. Imagem só como data URL JPEG/PNG/WEBP. A filtragem é feita no servidor (`backend/src/wa-themes.ts`) e de novo na extensão.
- **Tráfego**: a lista vem sem imagem (coluna `has_image` calculada pelo banco); a imagem só vem ao baixar.
- **Banco**: tabela nova `wa_shared_themes` (`supabase/migrations/202611100001_wa_shared_themes.sql`), com RLS ligado e sem políticas (só o backend acessa). **Precisa rodar o SQL no SQL Editor do projeto novo.** Sem a tabela, a galeria mostra o aviso "falta rodar o SQL" e o resto do sistema segue normal.
- **Rotas** (login da extensão): `GET/POST /api/integrations/whatsapp/temas`, `GET/DELETE /api/integrations/whatsapp/temas/:id`.
- **Validação**:
  - `test/wa-themes.test.ts` (cores e gradientes dos temas reais passam; tentativas de injeção são barradas);
  - suíte 238/238;
  - teste das rotas no servidor de demonstração: sem login 401, publicação descartando a cor maliciosa, tema com `url(javascript:)` recusado (400), lista sem imagem, download com imagem e contador, remoção.
  - A janela de temas dentro do WhatsApp Web não foi testada aqui (só a sintaxe).

## Cópia dos chamados: carga completa a cada 6 h (2026-11-10)
- **Achado**: com o conector apontando para o Supabase novo, o medidor de tráfego mostrou **207,6 MB em 10/11**, sendo **169 MB da tabela `calls`** (2.537 consultas, ~68 KB cada). O ritmo do plano gratuito é ~170 MB/dia (5 GB ÷ 30).
  - A causa foi a carga completa da cópia em memória a cada 30 min (~14 MB cada; 5.134 chamados de ~1,2 KB, 63% disso no campo de observações), mais uma carga a cada deploy.
  - Nesse ritmo daria ~670 MB/dia.
- **Mudança**: carga completa a cada **6 h** (era 30 min).
  - No meio, a cópia continua buscando só o que mudou (`updated_at`), quando algo é gravado ou no máximo 1x por minuto.
  - Exclusões pela API já forçavam a recarga na hora.
- **Conferido**: todas as gravações em `calls` atualizam `updated_at`. A atualização pelo `updateSupabaseCall` monta as mudanças já com `updated_at`; a importação histórica só insere (o banco preenche `updated_at`). Então nada fica velho na cópia por mais de 1 minuto.
- **Também conferido no banco novo**: tabela `wa_shared_themes` criada certa (colunas, `has_image` calculada, RLS ligado); a extensão já achou 5 SNs no AutoISP.

## Identificador do WhatsApp com cargo e nome (extensão 1.9.1) (2026-11-10)
- As mensagens saem como **`*Cargo - Nome:*`** (ex.: `*Mesário - Matheus:*`); antes era só `*Matheus:*`.
- **Cargo**:
  - o do login no sistema (o cargo cadastrado);
  - no popup há o campo novo **"Cargo que aparece"** (em branco = cargo do login), como já existia para o nome;
  - fica guardado como o nome (`cargoFixo`): se o login cair, continua saindo; o botão Sair apaga; quem estava logado de antes ganha o cargo guardado sozinho.
  - Sem cargo nenhum, sai só o nome, como antes.
- A prévia do popup mostra o formato novo enquanto digita.
- **Validação**: sintaxe dos 3 arquivos e simulação nos casos logado, login caído, login antigo sem cargo guardado, cargo digitado e sem cargo.

## "O que há de novo" (novidades do sistema) (2026-11-10)
- **Modal "O que há de novo"** ao entrar no sistema:
  - aparece uma vez por versão para cada login (guardado no navegador);
  - cabeçalho com a data da versão e quantas novidades há;
  - cada novidade tem ícone, título, selo (Novo / Melhoria / Correção) e uma explicação curta;
  - fecha com Entendi, X, Esc ou clique fora.
  - Se a pessoa ficou várias versões sem entrar, mostra todas as que perdeu, separadas por data. No primeiro acesso, só a mais recente.
- **Meu perfil › Novidades**: seção nova com a última versão e o botão "Ver versões anteriores". O link do rodapé do modal leva direto para ela.
- **Conteúdo** em `frontend/src/releases.ts`:
  - versões de 10/11, 09/11 e 06/11, escritas para a equipe;
  - novidade de área restrita (ex.: uso do banco, só Administrador) aparece só para quem tem a permissão.
  - **Para anunciar algo novo**: acrescentar uma versão no topo da lista com id novo (data).
- **Validação**:
  - typecheck;
  - preview em claro, escuro e celular (375 px);
  - contraste de todas as cores do modal ≥ 4,5:1 nos dois temas;
  - fechar marca como visto e não reabre ao recarregar;
  - o link abre Meu perfil já na seção.

## Ordem dos cards de backbone em "OfficeTrack/OS:" (2026-11-11)
- **Problema**: card de backbone (NOC TX) com a ordem escrita como `- OfficeTrack/OS: 611150177550102` não tinha a ordem reconhecida. O chamado ficava com o número do ticket (679131) em Ordem e o Office Track vazio.
- **Correção** (`card-normalizer.ts`): os rótulos `OfficeTrack/OS`, `OS/OfficeTrack`, `Office Track / O.S.` e `OFS/OS` passam a valer como "Tarefa Office Track", igual a `OFS:`.
- Vale para os acionamentos novos. O chamado 679131 já criado não é alterado sozinho.
- Novidade registrada em `releases.ts` (versão 11/11).
- **Validação**: teste com o card real (e variações do rótulo); suíte 239/239; typecheck.

## Sem acionamento repetido pela mesma OS ou BDESK (2026-11-11)
- **Problema**: chamados repetidos com a mesma OS. Ex.: 610056119940102 / BDESK 675979 em dois chamados. Os dois foram criados no mesmo segundo: dois acionamentos aceitos ao mesmo tempo, e nenhum dos dois via o chamado do outro.
- **Regra nova** (`backend/src/activation-dedupe.ts`): se já existe chamado não cancelado com a mesma **OS** (ordem / Office Track) ou o mesmo **BDESK**, não aciona de novo.
  - **Na chegada do card** (webhook): o card é ignorado. Não vira acionamento pendente nem envia informativo, e o log do Render registra qual chamado já existe.
  - **No aceite**: os aceites rodam um de cada vez, para que dois cliques ao mesmo tempo não criem dois chamados. A busca do chamado existente também usa o BDESK, além da OS. Se achar, liga o acionamento ao chamado que já existe.
  - Chamado **Cancelado** não conta: o card pode ser acionado de novo.
- **Limpeza no banco** (autorizada pelo usuário: "só os 3 recentes"). Ficou sempre o chamado aberto primeiro, e os acionamentos dos apagados passaram a apontar para ele. Foram apagados, com logs e observações (só "GIGA+"):
  - 2º chamado da OS 12674461 (06/11 14:02);
  - 2º da OS 610056119940102 (07/11 07:37);
  - o da 2ª OS do BDESK 678676 (10/11 22:42, sem técnico).
- **Mantidos de propósito**: 10 grupos da importação da planilha (jun–out) com o mesmo BDESK e OS diferentes do OFS, todos finalizados. São ordens distintas e contam no IGP.
- **Validação**:
  - testes da regra (OS, BDESK, cancelado, "PEND-", aceites em fila);
  - teste de ponta a ponta no webhook;
  - suíte completa;
  - conferência no banco depois da limpeza.

## Menção (@) mantida com o identificador do WhatsApp (extensão 1.9.2) (2026-11-11)
- **Problema**: mensagem que começa com uma menção (`@WALLAF JH`) saía com o `*Cargo - Nome:*`, mas a pessoa não era marcada. A extensão punha o cursor no começo da caixa e colava o identificador ali. Com a menção no começo, o cursor caía dentro dela e o WhatsApp a transformava em texto comum.
- **Correção**:
  - **Mensagem com menção** (ou outro elemento que não seja texto comum): o identificador entra direto no editor do WhatsApp (Lexical) da caixa de digitar, como texto mais quebra de linha antes de tudo, sem tocar na menção. Isso é feito pela ponte que já roda na página (`whatsapp/wa-page.js`, ação `prefixar`); `whatsapp-identificador.js` pede e espera até 300 ms.
  - **Texto comum, ou se a ponte não responder**: continua o jeito atual de colar, que já funcionava.
  - Enter apertado enquanto o identificador é colocado é ignorado, para a mensagem não sair duas vezes.
- **Validação**:
  - sintaxe dos dois arquivos;
  - simulação com a mesma biblioteca de editor (Lexical 0.17, sem navegador) e um nó de menção: depois de prefixar, a menção continua menção (com o contato) e o texto fica `*Administrador - Matheus:*` + quebra + `@WALLAF JH bom dia`; texto comum não é tocado.
- **Não testado no WhatsApp Web de verdade**: falta confirmar num grupo de teste depois de atualizar a extensão.

## Acionamento repetido: só a OS conta, não o BDESK (2026-11-11)
- **Correção da regra de 11/11**: o BDESK deixou de barrar acionamento. O NOC reaproveita o mesmo BDESK para chamados diferentes. Exemplo: o 678676 foi para a OS 611052298430102 (OLT VIP-PAL-SPO-OHW-01, PON 02/14, evento 06:40, hoje GIGA+) e para a OS 611236335390102 (OLT VIP-GZ1-SPO-OHW-01, PON 07/04, evento 22:24). O usuário confirmou: "Mesmo sendo o mesmo BDESK o chamado é diferente".
- **Regra agora**: só a **mesma OS** (ordem / Office Track) de um chamado não cancelado barra o card e faz o aceite ligar ao chamado existente.
  - O BDESK saiu da checagem na chegada do card (webhook);
  - saiu da busca do chamado existente no aceite;
  - saiu da checagem que reaproveitava acionamento pendente/aceito dos últimos 14 dias (fica: mesma mensagem ou mesma OS).
- **Engano na limpeza de 11/11**: o chamado da OS 611236335390102 (BDESK 678676) não era duplicado. O acionamento dele (recebido 10/11 22:42) volta a Pendente para ser aceito de novo, depois de publicar a regra nova.
- **Validação**: testes da regra (mesma OS, mesmo BDESK com outra OS, cancelado, PEND, aceites em fila); teste de ponta a ponta no webhook (mesmo BDESK com outra OS entra como Pendente); suíte 243 testes (1 de senha estourou o tempo com a máquina carregada e passou sozinho).

## Menção (@) com o identificador, de verdade (extensão 1.9.3) (2026-11-11)
- **A 1.9.2 não resolveu**: o usuário atualizou e a menção continuava saindo como texto.
- **Causa encontrada no WhatsApp Web de verdade** (inspeção autorizada pelo usuário no grupo "teste", sem enviar nada): o editor da caixa de digitar é Lexical, mas o nó de **menção do WhatsApp não exporta JSON**. `getEditorState().toJSON()` falha com o erro Lexical #130, a ação `prefixar` dava erro e a extensão caía no jeito antigo de colar, que desfaz a menção.
- **Correção** (`whatsapp/wa-page.js`, `prefixar`): dentro de `editor.update`, cria o texto `*Cargo - Nome:*` e a quebra de linha com as classes de nó que o próprio WhatsApp registrou (`editor._nodes`: `text`, `linebreak`) e insere antes do primeiro nó da mensagem com `insertBefore`/`insertAfter`. Nada passa por JSON e a menção não é tocada.
  - Só age se houver algo além de texto comum: tipos fora de `text`, `linebreak`, `delimiter`, `tab`, `artificial`; por exemplo `mention` ou `emoji`.
  - Texto comum segue o jeito de colar.
- **Validação no WhatsApp Web real, sem enviar**:
  - "oi": não mexeu ("texto comum");
  - "@Matheus" e "oi @Matheus": ficaram `*Teste - Nome:*` + quebra + a mensagem, com o nó `mention` intacto (o WhatsApp ainda reconheceu o `*...*` como negrito);
  - a caixa foi limpa depois e a aba fechada.
- Nós registrados no WhatsApp hoje: root, text, linebreak, tab, paragraph, artificial, emoji, mention, list-bullet, numbered-symbol, quote-line, bidi-paragraph, delimiter, non-jid-mention.

## Identificador: um Enter só envia de novo (extensão 1.9.4) (2026-11-11)
- **Problema** (desde a 1.9.2): era preciso apertar Enter duas vezes para enviar. A trava `preparando` (que ignora outro Enter enquanto o identificador é colocado) também barrava o clique no botão Enviar que a própria extensão faz no fim. A mensagem ficava pronta na caixa e só saía no segundo Enter, quando o identificador já estava lá.
- **Correção** (`whatsapp-identificador.js`): o envio feito pela extensão (`liberado`) é conferido antes da trava e passa direto.
- **Validação**: sintaxe; leitura do fluxo (Enter → identificador → clique da extensão com `liberado` → WhatsApp envia). O envio de verdade não foi testado: depende de mandar mensagem num grupo.

## Backup diário do banco no Google Drive (2026-11-11)
- **Por quê**: o Supabase gratuito não guarda backup, e o projeto antigo já caiu uma vez.
- **Como funciona** (`backend/src/db-backup.ts`):
  - **Horário e tentativas**: a partir das **03:00** (São Paulo), uma vez por dia. Se falhar, tenta de novo a cada 30 min, no máximo 4 vezes. Na 4ª falha, avisa no WhatsApp dos avisos.
  - **Conteúdo**: lê as **26 tabelas** do schema public, em páginas de 1.000 linhas, mais a lista de logins (`auth.users`: id, e-mail, datas e metadados, **sem senha**).
  - **Formato**: tudo num JSON compactado com gzip, `redeflow-backup-AAAA-MM-DD-HHMM.json.gz`. Hoje dá uns 2–3 MB.
  - **Destino**: o arquivo vai para um **Apps Script na conta Google do usuário**, que grava na pasta `JH RedeFlow - Backups` do Drive e põe na lixeira os backups com mais de **90 dias**, sempre guardando os 7 mais novos e sem mexer em outros arquivos da pasta.
  - Cada resultado fica em `integration_events` (kind `db_backup`).
  - Tráfego: uns 12 MB por backup (cerca de 360 MB/mês dos 5 GB), contados no medidor do banco.
- **Configuração**: `BACKUP_DRIVE_URL` (link `/exec` do app da Web) e `BACKUP_DRIVE_SECRET` (segredo de 48 caracteres gerado na tela, o mesmo que vai no código do script), criadas pelo usuário no Render. Sem as duas, nada roda.
- **Tela** (Configurações → Backup do banco, só para quem tem `settings.manage`):
  - situação (Ativo / Não configurado / Último backup falhou) e último backup certo;
  - passo a passo com o código do Apps Script pronto para copiar (o segredo já vai no código);
  - botão "Fazer backup agora" e os últimos 10 resultados.
- **Rotas**: `GET /api/configuracoes/backup` (situação) e `POST /api/configuracoes/backup` (fazer agora).
- **Validação**:
  - testes: arquivo abre igual ao que foi gerado; config; horário e tentativas; erros de segredo e de resposta não-JSON; o código do Apps Script rodando num Google de mentira (segredo, nome, retenção de 90 dias com 7 garantidos);
  - suíte 248/248;
  - preview claro/escuro e auditoria de contraste sem nada abaixo de 4,5:1;
  - "Fazer backup agora" sem configuração responde a mensagem certa.
- **Não testado ainda**: a leitura das tabelas no Supabase de verdade e o Apps Script real. Os dois rodam no primeiro "Fazer backup agora" depois da configuração.

## Técnico de apoio no chamado (2026-11-11)
- **Pedido**: técnicos às vezes vão como apoio numa ordem. O usuário pediu um campo para o técnico de apoio e que o nome dele apareça no lugar do supervisor.
- **Banco**: coluna nova `calls.support_technician_id uuid` (migração `202611110001_call_support_technician.sql`, aplicada por mim pelo conector com autorização do usuário: "Pode rodar e subir"). **Sem chave estrangeira** de propósito: uma segunda ligação `calls → technicians` deixaria ambíguo o join `technicians(...)` do técnico principal, e o PostgREST recusaria a consulta da fila.
- **Backend**:
  - `PATCH /api/chamados/:id` aceita `supportTechnicianId` (ou `null` para tirar). Só aceita técnico ou auxiliar trabalhando e ativo, e diferente do técnico principal.
  - O histórico registra "Tecnico de apoio alterado".
  - O nome (`supportTechnicianName`) vem de um mapa id → nome dos técnicos guardado por 5 min, na fila e no detalhe.
- **Frontend**:
  - no detalhe, campo "Técnico de apoio (opcional)" logo abaixo do técnico (a lista não mostra o técnico principal; trocar o principal para o mesmo do apoio limpa o apoio);
  - na fila, a linha de baixo do técnico mostra "Apoio: Nome" no lugar do supervisor quando há apoio;
  - o export completo ganhou a coluna "Técnico de apoio".
- **Validação**:
  - teste de ponta a ponta (salva, aparece com nome no PATCH e no detalhe, recusa o mesmo técnico do chamado, remove com `null`);
  - suíte completa;
  - preview: apoio Pedro no chamado do Carlos, fila mostrando "Carlos Mendes / Apoio: Pedro Santos".

## Visão dos supervisores e supervisor vendo todos os chamados (2026-11-11)
- **Pedido** (card "Tela de Visão dos Supervisores"): como os técnicos ainda não foram divididos, o supervisor precisa ver todos os chamados, sem o bloqueio da própria equipe. E uma tela com quantidade por área, entrantes do mês e da semana, média, TME, filtros e entrantes por horário.
- **Supervisor vê tudo**: o bloqueio por equipe (`getScopedCallQuery`, cargo "Supervisor") agora só vale com `SUPERVISOR_TEAM_SCOPE=true` no Render. Sem a variável (padrão), o supervisor vê os mesmos chamados que os outros cargos, em todas as telas que usavam o bloqueio (fila, painel, relatórios, carga, Ordens da equipe). Quando dividirem as equipes, basta criar a variável.
- **Tela nova** "Visão dos supervisores" (Indicadores, `/visao-supervisores`, permissão `dashboard.view`):
  - **Cartões**: entrantes no mês e na semana (desde segunda), com a média por dia corrido; média por dia no período; TME no período.
  - **Por área**: tabela com SP, GRU, Alto Tietê, ABC e "Sem área" (entrantes, % do total, média/dia, finalizados, TME).
  - **Gráficos**: entrantes por hora de abertura (00h–23h, com o pico) e entrantes e finalizados por dia.
  - **Filtros**: período (este mês, mês anterior, últimos 3 meses, personalizado até 3 meses), área e tipo. Valem para todos os números.
- **Definições**:
  - **entrante**: chamado aberto no período, pela abertura, sem Cancelado e sem GIGA+;
  - **TME**: da abertura até a Data Fim, nos finalizados do período (pela Data Fim), igual à Análise de prazo;
  - **área**: pelo cluster do OFS ou, sem cluster, pela região (`classifyCallArea`);
  - **horas**: horário de São Paulo.
- Usa a cópia dos chamados em memória (sem consulta nova ao banco). Rota `GET /api/visao-supervisores?from&to&area&type` (`backend/src/supervisor-overview.ts`).
- **Validação**:
  - testes do cálculo (semana começando na segunda, mês/semana/período, perto da meia-noite, áreas, filtros, Cancelado e GIGA+ fora);
  - teste de ponta a ponta (supervisor com o mesmo total que o administrador; tela responde; período invertido ou maior que 3 meses recusado);
  - preview nos dois temas e auditoria de contraste sem nada abaixo de 4,5:1.

## Visão dos supervisores conta os GIGA+ (2026-11-11)
- **Pedido**: "os GIGA+ também é para contar nessa tela dos supervisores".
- **Mudança** (`backend/src/supervisor-overview.ts`):
  - **entrante** passa a ser todo chamado aberto no período, menos o Cancelado. O GIGA+ entra, diferente dos outros indicadores (IGP, painel), que continuam sem ele;
  - **finalizados e TME**: o GIGA+ entra quando o OFS concluir (mesma regra de `isCallClosed`), pela Data Fim.
- O rodapé da tela e a ajuda (?) foram atualizados com a regra nova.
- **Validação**: o teste do cálculo agora tem um GIGA+ aberto e um GIGA+ concluído (TME de 4 h) e confere entrantes, finalizados e TME; suíte completa.

## Visão dos supervisores por região, não por área (2026-11-11)
- **Pedido**: "Ao invés de area, quero que o filtro seja por região e não area, esse também" (o filtro e a tabela).
- **Filtro**: "Região" com as regiões dos chamados (sem diferença de maiúsculas e minúsculas). Substitui o filtro de área. Rota: `region` no lugar de `area`.
- **Tabela**: "Entrantes por região", com cada região (entrantes, % do total, média/dia, finalizados, TME), da que mais recebeu para a que menos recebeu. "Sem região" (vazia ou "Nao informada") vai por último. A tabela tem rolagem própria (até 380 px), com o cabeçalho fixo, e mostra no máximo 100 linhas.
- **Validação**:
  - testes (ordem das regiões, "Sem região" no fim, filtro sem diferença de caixa, lista de regiões do filtro);
  - teste de ponta a ponta;
  - preview: filtro LESTE reduz a tabela e os cartões; cabeçalho fixo com o mesmo fundo do quadro nos dois temas.

## Técnico do OFS prevalece sobre o do sistema (2026-11-11)
- **Pedido**: "se os nomes dos técnicos forem divergentes, o do OFS prevaleça e troque o do sistema". Exemplo: no OFS, a OS 611021112580102 estava com Edson Luan Parras de Oliveira Alves, e no sistema com Francinaldo Lima de Freitas.
- **Antes**: o "Recurso" do OFS só entrava no chamado **sem técnico**.
- **Agora** (`technicianAssignmentsFromRows`, `backend/src/imports/d0.ts`): a cada coleta do OFS (export e D-0), se o Recurso bate com **um** técnico trabalhando e é diferente do técnico do chamado, o técnico do chamado passa a ser o do OFS.
  - O status fica como está; só "Aberto" vira "Atribuído", como antes.
  - A troca fica no histórico do chamado ("Tecnico alterado", pela coleta).
  - Se o técnico do OFS era o **apoio** do chamado, ele vira o técnico e o apoio sai.
- **Não mexe**:
  - em chamado Finalizado, Cancelado ou Baixar;
  - quando o Recurso é balde (`CLUSTER_`, `BKI_`), nome desconhecido ou nome que bate com mais de um técnico;
  - quando já é o mesmo técnico.
  - Para o OFS reconhecer o técnico, o cadastro dele precisa ter o nome igual ou um nome mais curto contido no do OFS, como antes.
- **Validação**: teste com os seis casos (sem técnico, técnico diferente, mesmo técnico, balde, finalizado, técnico do OFS que era o apoio); suíte completa.

## Atalhos de teclado: Esc volta, Enter salva (2026-11-11)
- **Pedido** (card "Mais atalhos do teclado"): Esc para voltar à tela anterior ou ir para uma tela principal (do chamado para a lista de chamados); Enter para salvar, por exemplo ao adicionar observação.
- **Esc** (`frontend/src/lib/keyboard.ts` + `Shell.tsx`):
  - **Telas internas** (detalhe do chamado, Meu perfil etc.): volta para a tela anterior; sem histórico, vai para a fila (chamado) ou para a primeira tela do menu. Nas telas do menu e no Modo TV (que tem o próprio Esc), não faz nada.
  - **Dentro de um campo**: o 1º Esc só tira o cursor do campo, para ninguém perder o que digita.
  - **Janela aberta**: o Esc é dela. O `AdminModal` passou a fechar com Esc e a se identificar como janela (`role="dialog"`), e a janela de observação da fila usa isso.
  - **Algo não salvo** (campos do chamado ou rascunho de observação): pergunta "Sair mesmo assim?" antes de voltar (`registerUnsaved`).
- **Enter**:
  - **Caixas de observação** (detalhe do chamado e janela da fila): Enter salva, Shift+Enter quebra a linha; Ctrl+Enter continua salvando. Com a lista de @menção aberta, o Enter escolhe a pessoa, como antes.
  - **Campos de uma linha fora de formulário**: aciona o botão de salvar da área (`data-save-scope` / `data-save-button`). No detalhe do chamado, salva as alterações; no campo Data Fim, salva a Data Fim. Formulários (`<form>`) já salvavam com Enter.
  - "Resultado e observação" ao finalizar e o motivo de cancelamento continuam com Enter quebrando linha (texto de várias linhas).
- A ajuda (?) do detalhe do chamado lista os atalhos.
- **Validação no preview** (eventos de teclado):
  - Esc no detalhe volta para a fila; Esc na fila não faz nada;
  - Esc num campo só tira o cursor;
  - campo alterado + Esc pergunta, e "Cancelar" fica na tela;
  - Enter num campo dispara o PATCH do chamado;
  - Enter na observação salva e Shift+Enter não;
  - na janela da fila, Esc fecha só a janela e Enter salva a observação.
- **Correção durante o teste**: o atalho usava `navigate` antes de existir no Shell (tela em branco no preview). Agora o `navigate` fica guardado numa referência.

## Chaves dos POPs (2026-11-11)
- **Pedido** (card "Chaves – controle de chaves de POP"): tela de controle das chaves dos POPs, com o nome do técnico ou supervisor que pegou a chave e uma foto da pessoa.
- **Decisões do usuário**: foto tirada **na retirada** (comprovante); registram retirada e devolução **quem edita chamados** (`calls.edit`; os demais só consultam com `calls.view`); a tela começa com a **situação da planilha** de chaves.
- **Banco** (migração `202611110002_pop_keys.sql`, aplicada por mim pelo conector com autorização do usuário: "Pode rodar e subir"):
  - `pop_keys`: situação de cada chave (Base / Retirada / A conferir, quem está, desde quando, observação, movimento atual);
  - `pop_key_movements`: histórico de retiradas, devoluções e conferências, com a foto (`photo` em data URL, `has_photo` calculada);
  - RLS ligado e sem políticas (só o backend acessa);
  - **40 POPs** da planilha (Aricanduva a Serraria): 6 retiradas (Rogério em Ferraz 1 desde 10/09, Adriano Jose em Itaim Paulista, Everaldo em Mogi desde 18/09, Lucas em Palmeiras e em Suzano 1, Mauro GIGA na Penha desde 12/09), 5 "A conferir" (sem status na planilha: Ferraz 2, Taubaté 1 e 2, São José dos Campos, Piraporinha) e 29 na base.
- **Backend** (`backend/src/store/pop-keys.ts`, rotas em `server.ts`):
  - `GET /api/chaves` lista as chaves sem foto, para pouco tráfego;
  - `POST /api/chaves/:id/retirada` recebe pessoa, tipo, data, observação e foto (JPG/PNG/WEBP até ~450 KB). Recusa se a chave já está retirada;
  - `POST /api/chaves/:id/devolucao` registra a devolução, ou a conferência quando estava "A conferir";
  - `GET /api/chaves/:id/historico` traz até 100 movimentos;
  - `GET /api/chaves/movimentos/:id/foto` traz a foto sob demanda;
  - `POST /api/chaves` cadastra POP novo (`settings.manage`);
  - no modo demonstração, tudo roda em memória, com os mesmos 40 POPs.
- **Tela** "Chaves dos POPs" (Operação, `/chaves`):
  - filtro Todas / Retirada / Na base / A conferir (com contagem) e busca por POP ou pessoa;
  - um cartão por POP, com faixa verde (base), laranja (retirada) ou cinza (a conferir). Na retirada, mostra a foto (ou as iniciais), o nome, o tipo, desde quando e há quantos dias, em vermelho a partir de 7 dias;
  - **Registrar retirada**: a pessoa vem da lista de técnicos (inclui auxiliares) e supervisores ativos, ou é "Outra pessoa" com o nome escrito; data e hora; observação; foto pela câmera ("Usar a câmera", espelhada, no PC ou no celular) ou "Escolher foto" (no celular abre a câmera frontal). A foto é reduzida a 720 px em JPEG antes de enviar;
  - **Devolver** e **Está na base** (para os "A conferir"); **histórico** com as fotos (clique para ampliar);
  - "Novo POP" aparece para quem gerencia as configurações;
  - Enter salva e Esc fecha as janelas (atalhos de 11/11). A ajuda (?) explica a tela.
- **Validação**:
  - teste de ponta a ponta: 40 POPs; o Supervisor não registra (403); foto inválida recusada; retirada com foto; segunda retirada recusada (409); histórico e foto; devolução; POP novo só com `settings.manage`, sem repetir;
  - preview: retirada com foto escolhida, foto no cartão e no histórico, devolução, "Está na base", Esc fechando a janela;
  - auditoria de contraste sem nada abaixo de 4,5:1 nos dois temas; o campo "Quem retirou" ganhou o estilo dos outros campos.

## Chaves dos POPs: build corrigido e tela em Administração (2026-11-11)
- **Problema**: a tela não apareceu porque o **build da Vercel falhou** no commit 1091110. O `tsc -b` do build recusou `navigator.mediaDevices?.getUserMedia && ...` (TS2774: a função sempre existe nos tipos). A checagem local usada antes (`tsc --noEmit -p .`) não pegou. Os deploys anteriores estavam todos certos (READY).
- **Correção**: a condição passou a ser `typeof navigator.mediaDevices?.getUserMedia === "function"`. `npm run build` (o mesmo da Vercel) agora passa.
- **Pedido do usuário**: a tela foi para a seção **Administração** do menu (antes em Operação), e o título da tela e a novidade acompanham.
- **Daqui em diante**: a checagem do frontend antes de subir é `npm run build`, e depois de subir confiro na Vercel se o deploy ficou READY.

## Página de status do sistema (2026-11-11)
- **Pedido** (card "Página de status"): mostrar se o servidor, o banco, a coleta do OFS e o WhatsApp estão funcionando, para a equipe não ficar no escuro quando algo cai.
- **Página `/status`**:
  - **aberta sem login**, porque quando o banco cai o login cai junto. Link no rodapé (login, menu e páginas legais) e em **Administração → Status do sistema**;
  - faixa geral (Tudo funcionando / Funcionando, com pontos de atenção / Há parte do sistema fora do ar) e uma linha por parte, com Funcionando, Atenção, Fora do ar ou Sem informação e um texto curto;
  - atualiza a cada 30 s com a aba visível, e tem o botão Atualizar;
  - **se o servidor não responde**, a página mesmo assim mostra "Servidor fora do ar" (com a explicação de que costuma voltar sozinho, por exemplo durante uma atualização) e "Sem informação" no resto.
- **O que é checado** (`backend/src/system-status.ts`, rota `GET /api/status`, sem login, resultado guardado 30 s):
  - **Servidor**: no ar há quanto tempo e versão (commit do Render);
  - **Banco**: consulta leve com limite de 5 s (tempo de resposta). Atenção se passar de 2 s ou em modo economia de tráfego; fora do ar se não responder;
  - **Coleta do OFS**: último envio certo do export. Atenção depois de 90 min ou se a última tentativa falhou; fora do ar depois de 180 min. Das 22h às 7h não acusa, porque é normal ficar parada;
  - **WhatsApp**: `GET /session/status` do WuzAPI (conectado e com login). Fora do ar se desconectado ou sem login (precisa ler o QR Code). Mostra também a última mensagem recebida;
  - **Backup diário**: último backup certo em até 30 h; "Sem informação" se ainda não configurado.
- Só mostra situação e textos curtos, sem dados de chamados nem tokens (o teste confere).
- **Validação**:
  - testes do cálculo (tudo ok; banco fora, WhatsApp sem login e coleta parada; avisos de economia, falha, coleta atrasada e backup velho; madrugada sem alarme; partes não configuradas não contam);
  - teste de ponta a ponta (sem login, cinco partes, nada sensível);
  - `npm run build` (o mesmo da Vercel);
  - preview com o servidor no ar e desligado;
  - auditoria de contraste sem nada abaixo de 4,5:1 nos dois temas.

## Página de status mais leve: 1 minuto e consulta mínima (2026-11-11)
- **Pergunta do usuário**: "30 s não usa muita requisição?"
- **Antes**: a página consultava o servidor a cada 30 s, e o servidor guardava o resultado 30 s. A consulta de eventos trazia até 48 h de envios do OFS (até 500 linhas com os detalhes). Com a página aberta o dia todo, isso podia somar dezenas de MB por dia no limite de tráfego do banco.
- **Agora**:
  - a página atualiza a cada **1 min**, só com a aba visível;
  - o servidor guarda o resultado por **1 min**: com várias pessoas com a página aberta, no máximo uma rodada de checagem por minuto;
  - a checagem lê só os **10 últimos envios do OFS e os 3 últimos backups**, com 5 colunas (id, tipo, ok, data e detalhes). Mais o teste leve do banco (`head`, sem linhas), que não traz dados;
  - em uso normal, o tráfego do banco por dia com a página aberta fica na casa de poucos MB.
- **Arquivos de tema**: os gerados pelo build (`theme-dark.css`, `theme-light-contrast.css`, `themes/*.css`) foram regenerados para incluir as telas novas (chaves, status, backup, visão dos supervisores). A Vercel já os regenera a cada publicação, então isso só deixa o repositório igual ao que está no ar. Auditoria de contraste refeita nas telas de chaves, visão dos supervisores e configurações com esses arquivos: nada abaixo de 4,5:1.

## Pesquisa melhorada: fila e listas suspensas (2026-11-11)
- **Pedido** (card "Pesquisa melhorada"):
  - pesquisar "coisas mais aleatórias", como o status do OFS;
  - o campo de pesquisa dizer só "Pesquisar";
  - poder pesquisar o técnico ao trocar o técnico do chamado e em **toda** lista suspensa do sistema.
- **Pesquisa da fila** (`matchesCallSearch`, `backend/src/store/calls.ts`):
  - **antes**: 11 campos e a frase exata;
  - **agora**: quase todos os campos do chamado (ordem, Office Track, BDESK, identificadores, cliente, status, **status do OFS**, tipo, motivo, região, cidade, bairro, endereço, OLT, **PON**, cluster, atrelada, técnico, **apoio**, supervisor, resultado, fechamento do OFS, tipo do cabo, **observações do chamado**);
  - **várias palavras em qualquer ordem** (todas precisam aparecer), ex.: "pendente guarulhos". Sem diferença de maiúsculas e acentos;
  - o nome do técnico de apoio passou a ser anexado antes do filtro, para a pesquisa achar por ele.
- **Campo da fila**: o texto agora é só "Pesquisar". A dica (title) explica o que é pesquisado, e o atalho "/" continua.
- **Listas suspensas com pesquisa** (`frontend/src/components/SelectSearch.tsx`, montado uma vez em `main.tsx`):
  - ao clicar em qualquer `<select>`, ou com ele em foco apertar Enter, Espaço, Alt+↓, F4 ou **digitar uma letra** (que já entra na pesquisa), abre por cima dele uma lista com o campo **"Pesquisar"**;
  - aceita várias palavras e ignora acentos, mostra os grupos (ex.: Técnicos / Supervisores) e marca a opção atual;
  - ↑/↓ e Enter escolhem, Esc fecha só a lista (não sai da tela nem fecha a janela por trás). Clicar fora, rolar a tela ou clicar de novo na lista fecha;
  - o `<select>` original continua na tela, com o mesmo visual, e a escolha passa por ele (evento `change` de verdade). Por isso **nenhuma tela precisou mudar**: valem as 43 listas atuais (15 telas) e as futuras;
  - fica de fora: lista múltipla, com `size` > 1, desativada ou com `data-native-select`.
- **Contraste**: a opção desativada no tema claro foi para `#5b687c` (5,6:1). No escuro, o gerador de tema escurecia o texto dos grupos para 4,3:1, e `theme-dark-manual.css` deixa em `#b5b9c1` (8,7:1).
- **Validação**:
  - testes da pesquisa (status do OFS, PON, apoio, observação, várias palavras, acentos);
  - suíte completa e `npm run build`;
  - preview: lista de técnico no detalhe do chamado (abrir, pesquisar "pedr", Enter escolhe Pedro e a tela reage), abrir digitando uma letra, contraste conferido pela conta das cores. Durante o teste o usuário estava clicando na mesma aba, então parte dos testes automáticos parou para não atrapalhar.

## Histórico de acionamentos recusados (2026-11-11)
- **Pedido** (card "Histórico chamados recusados"): histórico dos acionamentos recusados, podendo aceitar um que foi recusado por engano.
- **Antes**: a tela de Acionamentos só mostrava os pendentes, e o sistema só aceitava acionamento pendente. Havia 112 recusados no banco (desde 21/09) sem nenhuma tela.
- **Tela** (Acionamentos, abas **Pendentes / Recusados**; `?aba=recusados` no endereço):
  - os **100 recusados mais recentes**, com ordem, tipo, BDESK, quando chegou, **quando foi recusado, por quem e o motivo**;
  - pesquisa por ordem, BDESK, motivo, quem recusou ou texto do card; "Ver dados" mostra a mensagem original;
  - **"Aceitar mesmo assim"** (pede confirmação; só para quem tem `activations.decide`) cria o chamado e mostra o link para abrir.
- **Backend**:
  - `GET /api/acionamentos?status=Recusado` traz no máximo 100, com `decisionByName`;
  - `POST /api/acionamentos/:id/reaceitar` volta o acionamento a Pendente (só se ainda estiver Recusado) e passa pelo **aceite normal**: mesma OS já com chamado liga ao chamado existente (regra de 11/11), e os aceites seguem em fila;
  - o chamado ganha uma **observação**: "Este acionamento tinha sido recusado em DD/MM, HH:MM por Fulano (motivo: ...). Aceito depois, pelo histórico de recusados, por Ciclano.";
  - aceitar de novo um já aceito ou um pendente responde 409, com a explicação.
- **Validação**:
  - teste de ponta a ponta: card chega; reaceitar pendente dá 409; recusa com motivo; aparece na lista com nome e motivo; aceite cria o chamado com a OS do card; observação com a recusa; reaceitar de novo dá 409; sai da lista;
  - durante o teste, apareceu e foi corrigido: no modo demonstração os dados da recusa eram lidos depois do aceite (motivo sumia, data errada). Agora há uma cópia antes;
  - `npm run build`; preview (abas, lista, aceite com confirmação e link do chamado); auditoria de contraste sem nada abaixo de 4,5:1 nos dois temas (com ajuste em `theme-dark-manual.css` para a pesquisa).

## Busca rápida (Ctrl+K): contorno estranho no campo (2026-11-11)
- **Problema** (print do usuário): na busca rápida, o campo de pesquisa aparecia com um contorno azul solto em volta do texto, desalinhado e cortado no topo da janela.
- **Causa**: a regra global de acessibilidade em `legal.css` (`:where(a, button, input, select, textarea, summary, [tabindex]):focus-visible { outline: 2px solid #1264e8; outline-offset: 2px }`) vale para todo campo focado pelo teclado. O campo da busca rápida não tem borda própria (a caixa é a janela) e não desligava esse contorno. Abrindo com Ctrl+K, o foco conta como de teclado e o contorno aparecia. O `.search-field` genérico tinha o mesmo problema. Os outros campos sem borda (`.cq-search`, `.pk-search`, `.ra-search`, `.ss-search`, `.manual-technician-search`, `.editable-detail-item`) já tinham uma regra mais específica.
- **Correção** (`sidebar.css`): `outline: none` nesses dois campos, e o foco aparece na caixa em volta: linha azul embaixo na busca rápida e borda azul com halo no `.search-field`, nos dois temas.
- **Como foi achado**: no preview o contorno não aparecia, porque o foco dado por script não conta como de teclado. A regra só foi achada no CSS publicado (`index-*.css` da Vercel).
- **Validação**: `npm run build`; no preview a regra nova está carregada e vence a global; com a busca aberta, a caixa mostra a linha azul.

## Notificações: ponto vermelho só com novidade e avisos no navegador (2026-11-11)
- **Pedido** (card "Melhorar as notificações"): notificações no navegador, não só dentro do sistema; o ponto vermelho do sino sumir quando tudo foi lido.
- **Ponto vermelho** (`Shell.tsx` + `lib/browser-notifications.ts`):
  - **antes**: aparecia sempre que havia qualquer item no sino. Como os avisos de operação ("X chamados sem técnico", "vencem em menos de 2h") ficam lá o tempo todo, nunca sumia;
  - **agora**: cada item tem uma assinatura (id + título + contagem). Ao abrir o sino, tudo o que está lá conta como **visto** (guardado por login neste navegador), e o que chega com o sino aberto também. O ponto só volta com algo **novo** (outra menção, a contagem mudou, aviso novo);
  - o botão vira **"Marcar tudo como lido"** (marca as menções como lidas no servidor e os avisos como vistos). O sino diz "Notificações: N nova(s)" para leitor de tela.
- **Avisos no navegador** (Notification API):
  - no sino, **"Ativar avisos no navegador"** pede a permissão do Chrome. Depois, "Avisos no navegador ligados · Desligar". Se o navegador bloqueou, explica como liberar (cadeado → Notificações → Permitir);
  - avisa só quando a pessoa **não está olhando o sistema** (aba em segundo plano ou outra janela na frente), só para o que é novo (no máximo 3 por vez; na primeira vez só registra, sem disparar tudo) e para **acionamentos novos** ("Novo acionamento · OS · tipo · BDESK");
  - clicar no aviso traz o sistema para frente na tela certa;
  - com os avisos ligados, o sino confere também com a aba em segundo plano, a cada 2 min (com a aba na frente continua a cada 1 min). Sem os avisos, nada muda no tráfego;
  - **limite**: com o navegador fechado não há aviso. Isso precisaria de Web Push (service worker, chaves VAPID e tabela de inscrições), que fica para depois se precisar.
- **Contraste**: o texto do aviso no sino passa de 7:1 no claro. No escuro, o gerador de tema escurecia para `#7f8082`, e `theme-dark-manual.css` deixa em `#b5b9c1` (8,1:1).
- **Validação**:
  - `npm run build`;
  - preview: com 4 itens o ponto aparece; ao abrir o sino some; depois de recarregar continua apagado; quando "3 chamados sem técnico" virou 2, voltou com "1 nova";
  - no painel de pré-visualização o navegador bloqueia avisos, então apareceu a explicação de como liberar. O aviso do Windows de verdade precisa ser conferido no Chrome.
