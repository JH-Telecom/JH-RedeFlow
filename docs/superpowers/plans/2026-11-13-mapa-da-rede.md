# Mapa da rede (massivas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página "Mapa da rede" que mostra POPs, CTOs, CEOs e cabos dos KMZ e os clientes de uma PON lidos do AutoISP pela extensão Rede, com o botão "Ver no mapa" nas massivas.

**Architecture:** KMZ/KML são lidos no navegador por um parser puro (sem DOM) e enviados em lotes ao backend Express, que grava no Supabase (com fallback em memória para o modo demonstração, igual a `store/pop-keys.ts`). A extensão Rede consulta uma fila de PONs no backend, lê o AutoISP com a aba logada (só GET) e devolve os clientes sem nome nem endereço. O frontend React desenha com Leaflet e pede só a área visível.

**Tech Stack:** Express 5 + zod + Supabase (backend), React 19 + Vite + Leaflet 1.9.4 (frontend), extensão Chrome MV3 (`extensao-rede`), testes `node:test` via `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-11-13-mapa-da-rede-design.md`

## Global Constraints

- Sem nome, endereço, CPF/CNPJ do assinante no banco, no payload da extensão ou na tela (só contrato, serial, int6, OLT, ponlink, sinal, status, último contato, lat/lng).
- AutoISP: só GET, no máximo 3 consultas ao mesmo tempo, com a aba `https://auto.alloha.com/*` já aberta e logada. Sem "Atualizar sinal" (refresh_status) nesta versão.
- Situação: problema (`#ef4444`) = critical, power_fail, loss_signal, down, massive*; atenção (`#f59e0b`) = warning; ok (`#22c55e`) = ok; sem leitura (`#94a3b8`) = status vazio ou desconhecido. Cinza nunca é "desconectado".
- Coordenada repetida em 10 ou mais clientes = "sem localização precisa" (fica só na lista).
- Cliente × CTO só como "estimativa por proximidade", nunca somado como dado oficial. CTOs destacadas numa massiva: até 150 m de um cliente afetado.
- Cor do cabo = cor original do KMZ, nunca status.
- Leitura recente = menos de 30 minutos; "Ver no mapa" só enfileira a PON se não houver leitura recente.
- Listas com no máximo 100 itens por página (`components/Pager.tsx`).
- Contraste ≥ 4,5:1 nos temas claro e escuro; rodar `node scripts/contrast-audit.js` depois de mudar UI (se o script não existir, conferir no preview).
- Corpo das requisições ≤ 15 MB (limite do `express.json`): lotes de até 2.000 itens.
- Permissões novas: `network.view` ("Ver o mapa da rede") e `network.manage` ("Importar a rede e editar POP → OLT"), dadas a Administrador e Operador.
- Antes de commit/push: `npm run build` na raiz e conferência no preview local (`npm run preview`, localhost:8000). Não fazer push sem o usuário aprovar.

## Review Focus

- OLT do card do NOC escrita diferente do hostname do AutoISP (`vip-gru-2-spo-onk-01 `, sufixo `-0`) → deve casar depois de normalizar (maiúsculas, sem espaços); se não casar, a fila mostra o nome tentado. Teste em Task 4.
- Slot/PON do card com zeros e formatos diferentes (`04/10`, `4/10`, `0/4/10`) → todos viram o mesmo ponlink `0/4/10`; massiva com `04/10, 09/11` gera 2 pedidos, sem duplicar. Teste em Task 4.
- Mesma CTO em dois KMZ (Penha e Penha 01) → um registro só, do arquivo importado por último; reimportar um arquivo não apaga o que veio de outro. Teste em Task 3.
- Cliente com lat/lng 0,0, nulo ou fora da caixa de SP (lat −25 a −22, lng −48 a −44) → tratado como sem localização, não desenhado no oceano. Teste em Task 4.
- KML de 22 MB com 22 mil placemarks e arquivos zerados/inválidos → importação em lotes sem estourar 15 MB, e arquivo ruim aparece como "não lido" com motivo, sem parar os outros. Teste em Task 2.

---

### Task 1: Banco e permissões

**Files:**
- Create: `supabase/migrations/202611130001_network_map.sql`
- Modify: `backend/src/types.ts` (união `PermissionCode`), `backend/src/store/demo-data.ts` (`permissionDescriptions`, `operatorRole.permissions`)

**Interfaces:**
- Produces: tabelas `network_elements`, `network_cables`, `network_sources`, `network_pop_olts`, `network_clients`, `network_pon_requests` (colunas como na seção 1 do spec, em snake_case); permissões `network.view`, `network.manage`.

- [ ] **Step 1: Escrever a migration**, no estilo de `202611110002_pop_keys.sql` (RLS ligado, sem políticas, só service_role). Colunas e chaves:
  - `network_elements`: `id uuid pk`, `kind text check in ('pop','cto','ceo','outro')`, `code text`, `name text`, `project_code text`, `pop text`, `fh text`, `lat double precision not null`, `lng double precision not null`, `source_file text not null`, `imported_at timestamptz default now()`; índice único parcial em `code` where `code is not null`; índices em `(lat, lng)` e `source_file`.
  - `network_cables`: `id uuid pk`, `name text`, `color text`, `points jsonb not null`, `min_lat/min_lng/max_lat/max_lng double precision not null`, `source_file text not null`; índices em `(min_lat, max_lat)`, `(min_lng, max_lng)`, `source_file`.
  - `network_sources`: `file_name text pk`, `sha256 text`, `elements int`, `cables int`, `imported_by text`, `imported_at timestamptz default now()`.
  - `network_pop_olts`: pk `(pop, olt)`, `active boolean default true`, `note text`, `confirmed_by text`, `updated_at timestamptz default now()`.
  - `network_clients`: `contract text pk`, `serial text`, `int6 text`, `olt text not null`, `ponlink text not null`, `signal_rx double precision`, `onu_status text`, `last_inform text`, `lat double precision`, `lng double precision`, `read_at timestamptz not null`, `read_by text`; índice em `(olt, ponlink)`.
  - `network_pon_requests`: `id uuid pk`, `olt text not null`, `ponlink text not null`, `call_id text`, `requested_by text`, `requested_at timestamptz default now()`, `done_at timestamptz`, `found int`, `read int`, `error text`; índice parcial único em `(olt, ponlink)` where `done_at is null`.
  - Permissões: insert em `public.permissions` e em `role_permissions` para 'Administrador' e 'Operador', como `202609210004_call_reopen_permission.sql`.
- [ ] **Step 2: Adicionar `'network.view' | 'network.manage'`** ao `PermissionCode`, às descrições em `demo-data.ts` (textos das Global Constraints) e ao `operatorRole`.
- [ ] **Step 3: Rodar** `npm run typecheck --workspace backend` → sem erros; `npm test --workspace backend` → tudo passa como antes.
- [ ] **Step 4: Commit** `feat: network map tables and permissions`.

### Task 2: Leitor de KMZ/KML (navegador, puro)

**Files:**
- Create: `frontend/src/lib/network-kml.ts`
- Test: `backend/test/network-kml.test.ts` (importa `../../frontend/src/lib/network-kml.ts`; o frontend não tem runner próprio)

**Interfaces:**
- Produces:
  - `type NetKind = 'pop' | 'cto' | 'ceo' | 'outro'`
  - `type NetElement = { kind: NetKind; code: string | null; name: string; projectCode: string | null; pop: string | null; fh: string | null; lat: number; lng: number }`
  - `type NetCable = { name: string; color: string | null; points: [number, number][] }` (`[lng, lat]`)
  - `type ParsedKml = { elements: NetElement[]; cables: NetCable[] }`
  - `classifyName(name: string): NetKind`
  - `projectCodeFrom(name: string, description: string): string | null`
  - `splitProjectCode(code: string | null): { pop: string | null; fh: string | null }`
  - `simplifyLine(points: [number, number][], toleranceMeters?: number): [number, number][]` (padrão 2 m)
  - `parseKml(text: string): ParsedKml`
  - `readNetworkFile(name: string, data: ArrayBuffer): Promise<{ text: string } | { skipped: string }>` (KMZ = zip, lê o 1º `.kml`; detecta BOM)
  - `toBatches<T>(items: T[], size?: number): T[][]` (padrão 2.000)

- [ ] **Step 1: Escrever os testes**
  - `classifyName`: `'CTO-GR1-0249'`→cto, `'CTOI-GR1-0027'`→cto, `'MCTOI-GR1-0003'`→cto, `'​CTI-ITA01'`→cto, `'TT2-FH02-CEOSP-SP02.1'`→ceo, `'CES-ITA-0001'`→ceo, `'POP Guarulhos 1'`→pop, `'CX12_R3'`→outro.
  - `projectCodeFrom('CTO-GR1-0249', ' CMEXKEY : VIPT|... CMDISPLAYTEXT : GRS01-FH01-P46-L04-R02-C13 CMCLASSID : 3 ')` → `'GRS01-FH01-P46-L04-R02-C13'`; com `CMDISPLAYTEXT:` vazio e nome `'CTOI-GR1-0052​GR1-FH05-P53-LR5.5-R06-C01'` → `'GR1-FH05-P53-LR5.5-R06-C01'`; sem nada → `null`.
  - `splitProjectCode('GRS01-FH01-P46-L04-R02-C13')` → `{ pop: 'GRS01', fh: 'FH01' }`.
  - `parseKml` com um KML mínimo (1 Point CTO com descrição, 1 LineString com `<color>ff0000ff</color>` via `styleUrl`, 1 Point dentro de MultiGeometry, e um prefixo não declarado `<gx:drawOrder>`) → 2 elementos e 1 cabo; o cabo guarda a cor do estilo.
  - `simplifyLine` com 5 pontos colineares a menos de 2 m → 2 pontos (início e fim).
  - `readNetworkFile` com buffer de zeros → `{ skipped: 'arquivo vazio ou corrompido' }`; com zip sem `.kml` → `{ skipped: 'zip sem arquivo .kml' }`; com KML com BOM → `{ text }` começando por `<?xml`.
  - `toBatches` de 4.500 itens → tamanhos `[2000, 2000, 500]`.
- [ ] **Step 2: Rodar** `npm test --workspace backend -- --test-name-pattern=kml` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar** em `network-kml.ts` sem DOM: placemarks e estilos por expressão regular sobre o texto (assim prefixos não declarados não quebram), remover `​` dos nomes, zip lido pelo diretório central com `DecompressionStream('deflate-raw')` (existe no navegador e no Node 18+), simplificação Douglas-Peucker em metros (projeção equiretangular local).
- [ ] **Step 4: Rodar** o mesmo comando → PASS.
- [ ] **Step 5: Commit** `feat: browser KMZ/KML reader for the network map`.

### Task 3: Store da rede (elementos, cabos, área, POP → OLT)

**Files:**
- Create: `backend/src/store/network.ts`
- Test: `backend/test/network-store.test.ts` (modo memória, sem Supabase)

**Interfaces:**
- Consumes: `NetElement`, `NetCable` (Task 2; o backend redeclara os tipos, não importa do frontend).
- Produces:
  - `saveNetworkBatch(input: { fileName: string; sha256: string; first: boolean; elements: NetElement[]; cables: NetCable[] }, by: string): Promise<{ elements: number; cables: number }>` — `first: true` apaga antes tudo o que veio de `fileName`; elemento com `code` já existente é sobrescrito (vale o importado por último).
  - `listNetworkSources(): Promise<Array<{ fileName: string; elements: number; cables: number; importedBy: string; importedAt: string }>>`
  - `listNetworkArea(box: { minLat: number; minLng: number; maxLat: number; maxLng: number }, zoom: number): Promise<{ elements: NetElementRow[]; clusters: Array<{ lat: number; lng: number; count: number }>; cables: NetCableRow[] }>` — `zoom < 15`: CTOs/CEOs agrupados numa grade de 0,005° (`elements` só com POPs); `zoom ≥ 15`: elementos individuais. No máximo 5.000 elementos e 3.000 cabos por resposta.
  - `listPopOlts(): Promise<PopOlt[]>`, `savePopOlt(input: { pop: string; olt: string; active: boolean; note?: string | null }, by: string): Promise<PopOlt>`
  - `NetElementRow = NetElement & { id: string; sourceFile: string }`, `NetCableRow = NetCable & { id: string; sourceFile: string }`, `PopOlt = { pop: string; olt: string; active: boolean; note: string | null; confirmedBy: string | null; updatedAt: string }`

- [ ] **Step 1: Escrever os testes**: reimportar `Penha.kmz` com a mesma CTO que já veio de `Penha 01.kmz` deixa 1 registro com `sourceFile: 'Penha.kmz'`; `first: true` em `A.kml` não apaga elementos de `B.kml`; `listNetworkArea` devolve só o que está dentro da caixa; com `zoom: 12` e 30 CTOs próximas devolve 1 cluster com `count: 30`; cabo que cruza a caixa sem ter ponto dentro dela (caixa do cabo intersecta) é devolvido; `savePopOlt` exige `note` ao desativar (`active: false` sem nota → erro "Para desativar, escreva o motivo.").
- [ ] **Step 2: Rodar** `npm test --workspace backend -- --test-name-pattern=network` → FAIL.
- [ ] **Step 3: Implementar** com o mesmo formato de `store/pop-keys.ts` (`isSupabaseConfigured()` → memória; senão `getSupabaseAdmin()`; erro de tabela inexistente vira "As tabelas do mapa ainda nao existem no banco (falta a migracao network_map)."). No Supabase, a área usa `gte/lte` em lat/lng e, para cabos, a interseção das caixas; o agrupamento é feito no backend.
- [ ] **Step 4: Rodar** → PASS.
- [ ] **Step 5: Commit** `feat: network store with area query and POP to OLT table`.

### Task 4: Clientes, regras de situação e fila de PON

**Files:**
- Create: `backend/src/network.ts` (regras puras), `backend/src/store/network-clients.ts`
- Test: `backend/test/network-rules.test.ts`, `backend/test/network-clients.test.ts`

**Interfaces:**
- Consumes: `extractAllSlotPons(text)` de `backend/src/olt-notice.ts`; `listNetworkArea` (Task 3) para a CTO mais próxima.
- Produces (em `network.ts`):
  - `type Situation = 'problema' | 'atencao' | 'ok' | 'sem'`; `situationOf(status: string | null | undefined): Situation`
  - `normalizeOlt(value: string): string` (maiúsculas, sem acento e espaços)
  - `normalizePonlink(value: string): string | null` → `'0/slot/pon'` sem zeros à esquerda; aceita `s/p` e `f/s/p`
  - `ponsFromCall(olt: string, slotPonText: string): Array<{ olt: string; ponlink: string }>` (sem duplicar)
  - `validLocation(lat: number | null, lng: number | null): boolean` (caixa de SP das Review Focus, e não 0,0)
  - `markImprecise<T extends { lat: number | null; lng: number | null }>(clients: T[]): Array<T & { precise: boolean }>` (repetida em 10+ ou inválida → `precise: false`)
  - `nearestCto(point: { lat: number; lng: number }, ctos: Array<{ code: string | null; lat: number; lng: number }>): { code: string | null; meters: number } | null`
  - `CTO_HIGHLIGHT_METERS = 150`, `RECENT_READING_MINUTES = 30`
- Produces (em `store/network-clients.ts`):
  - `NetClient = { contract: string; serial: string | null; int6: string | null; olt: string; ponlink: string; signalRx: number | null; onuStatus: string | null; lastInform: string | null; lat: number | null; lng: number | null; readAt: string }`
  - `enqueuePons(items: Array<{ olt: string; ponlink: string }>, by: string, callId?: string): Promise<{ queued: number; skippedRecent: number }>` (não enfileira PON com leitura de menos de 30 min nem pedido já aberto)
  - `pendingPons(): Promise<Array<{ id: string; olt: string; ponlink: string }>>`
  - `savePonReading(input: { requestId?: string; olt: string; ponlink: string; clients: NetClient[]; found: number; error?: string | null }, by: string): Promise<{ saved: number }>`
  - `ponView(olt: string, ponlink: string): Promise<{ clients: Array<NetClient & { situation: Situation; precise: boolean; nearestCto: { code: string | null; meters: number } | null }>; request: { requestedAt: string; doneAt: string | null; error: string | null } | null; summary: { total: number; problema: number; atencao: number; ok: number; sem: number } }>`

- [ ] **Step 1: Escrever os testes de regras**: `situationOf` para `'OK'`, `'warning'`, `'critical'`, `'power_fail'`, `'loss_signal'`, `'down'`, `'massive_loss_signal'`, `''`, `null`, `'algo novo'` (os dois últimos → `'sem'`); `normalizeOlt(' vip-gru-2-spo-onk-01 ') === 'VIP-GRU-2-SPO-ONK-01'`; `normalizePonlink('04/10') === '0/4/10'`, `('0/4/10')` igual, `('1/02/03') === '1/2/3'`, `('abc') === null`; `ponsFromCall('VIP-GZ1-SPO-OHW-02', '04/10, 09/11, 4/10')` → 2 itens; `validLocation(0, 0) === false`, `(-23.45, -46.5) === true`, `(-10, -46) === false`; `markImprecise` com 10 clientes no mesmo ponto → todos `precise: false`, com 9 → `true`; `nearestCto` escolhe a CTO a 13 m em vez da de 40 m.
- [ ] **Step 2: Escrever os testes de store (memória)**: `enqueuePons` duas vezes a mesma PON → 1 pedido aberto; depois de `savePonReading` recente, `enqueuePons` devolve `skippedRecent: 1`; `savePonReading` grava e fecha o pedido; `ponView` resume `{ total, problema, ... }` certo e marca imprecisos; payload com campo `name` é ignorado (o tipo não tem nome; o teste confere que o objeto salvo não tem a chave `name`).
- [ ] **Step 3: Rodar** `npm test --workspace backend -- --test-name-pattern=network` → FAIL.
- [ ] **Step 4: Implementar** `network.ts` e `store/network-clients.ts` (padrão de memória/Supabase da Task 3).
- [ ] **Step 5: Rodar** → PASS.
- [ ] **Step 6: Commit** `feat: network clients, situation rules and PON queue`.

### Task 5: Rotas do backend

**Files:**
- Modify: `backend/src/server.ts` (perto das rotas de `/api/chaves` e das de `/api/integrations/autoisp`)
- Test: `backend/test/network-routes.test.ts` (no estilo de `test/http.test.ts`)

**Interfaces:**
- Consumes: Tasks 3 e 4; `ofsCollectorIdentity(request)` para as rotas da extensão; `getCall(id)` (ou o equivalente usado em `/api/chamados/:id`) para `callId`.
- Produces (todas com `auth` + `requirePermission`, exceto as de integração):
  - `GET /api/rede/area?minLat&minLng&maxLat&maxLng&zoom` → `listNetworkArea` (`network.view`; caixa maior que 0,5° × 0,5° → 400 "Aproxime o mapa.")
  - `GET /api/rede/pon?olt&ponlink` → `ponView` (`network.view`)
  - `POST /api/rede/pon/solicitar` body `{ olt, ponlink } | { callId }` → `enqueuePons` (`network.view`; com `callId` usa `ponsFromCall(call.olt, call.slotPon)`; chamado sem OLT ou slot/PON → 422 "Este chamado não tem OLT e slot/PON.")
  - `POST /api/rede/importacao` body `{ fileName, sha256, first, elements[≤2000], cables[≤2000] }` → `saveNetworkBatch` (`network.manage`)
  - `GET /api/rede/fontes` → `listNetworkSources` (`network.manage`)
  - `GET /api/rede/pop-olt` (`network.view`), `PUT /api/rede/pop-olt` (`network.manage`)
  - `GET /api/integrations/autoisp/pons-pendentes` → `{ itens: pendingPons() }`
  - `POST /api/integrations/autoisp/pon` body `{ requestId?, olt, ponlink, found, error?, clients[≤100] }`; o zod do cliente aceita só os campos de `NetClient` (`.strict()`), então nome/endereço são recusados com 400.

- [ ] **Step 1: Escrever os testes**: sem `network.view` → 403 em `/api/rede/area`; caixa grande → 400; `POST /api/integrations/autoisp/pon` com cliente contendo `name` → 400; `POST /api/rede/pon/solicitar` com `callId` de chamado com `slotPon: '04/10, 09/11'` → `queued: 2`.
- [ ] **Step 2: Rodar** `npm test --workspace backend -- --test-name-pattern=rede` → FAIL.
- [ ] **Step 3: Implementar** as rotas com zod e mensagens em português, sem acento nas mensagens do backend (padrão atual).
- [ ] **Step 4: Rodar** → PASS; `npm run typecheck --workspace backend` → sem erros.
- [ ] **Step 5: Commit** `feat: network map API routes`.

### Task 6: Extensão Rede lê a PON no AutoISP

**Files:**
- Create: `extensao-rede/autoisp-rede.js` (script clássico; funções puras + coleta)
- Modify: `extensao-rede/background.js` (`importScripts("autoisp-rede.js")` ao lado de `roteirizador.js`; chamar `lerPonsPendentes()` no alarme `ALARME_FECH` depois de `buscarSnAutoIsp`; ação `lerPon` na mensagem do popup/página), `extensao-rede/manifest.json` (versão `1.11.0`, descrição cita "lê no AutoISP os clientes das PONs das massivas, sem nome nem endereço")
- Test: `backend/test/extension-autoisp-rede.test.ts` (carrega o arquivo com `node:vm` e testa as funções puras)

**Interfaces:**
- Consumes: `GET /api/integrations/autoisp/pons-pendentes`, `POST /api/integrations/autoisp/pon` (Task 5); `autenticacao()` e `API_BASE` de `background.js`.
- Produces (globais do script):
  - `urlBuscaPon(oltId, ponlink)` → `'/client_search/search?olt_id=<id>&ponlink=<ponlink>'`
  - `variantesPon(ponlink)` → `['0/4/10', '4/10']` para `'0/4/10'`
  - `acharOlt(lista, nome)` → `{ id, hostname } | null` (compara normalizado; aceita parte do nome só se casar 1 OLT)
  - `limparDetalhe(json, linhaBusca)` → `NetClient` (lê `gpon_client.onu_status.rx_power`, `.status`, `acs_last_inform`, `coordinates.client.lat/lng`, `erp_id`, `serial_number`, `gpon_client_id`, `olt_hostname`, `ponlink`; **descarta todo o resto**)
  - `async lerPonsPendentes()` → `{ quando, pedidos, lidos, erros }`, guardado em `chrome.storage.local.ultimaPon`

- [ ] **Step 1: Escrever os testes**: `variantesPon('0/4/10')` → `['0/4/10', '4/10']`; `acharOlt([{id:7,hostname:'VIP-GRU-2-SPO-ONK-01'}], 'vip-gru-2-spo-onk-01 ')` → id 7; com 2 OLTs casando parte do nome → `null`; `limparDetalhe` de um JSON com `subscriber.subsc_name`, `contract_install_addr_street` e `cpf_cnpj` devolve objeto cujas chaves são exatamente as de `NetClient` e `signalRx: -25.37`, `lat: -23.9`.
- [ ] **Step 2: Rodar** `npm test --workspace backend -- --test-name-pattern=autoisp-rede` → FAIL.
- [ ] **Step 3: Implementar**: lista de OLTs por `GET /olts/get_all_for_select` (cache 30 min, como `oltsDaJh` da extensão Monitoramento OLT, mas sem filtro de cidades); para cada pedido: achar a OLT (não achou → `error: 'A conta do AutoISP nao enxerga a OLT <nome>'`), buscar a PON nas variantes, abrir `/gpon_clients/<int6>/detailed_info` de até 100 clientes com fila de 3 em paralelo, mandar o resultado. Todas as consultas rodam dentro da aba do AutoISP via `chrome.scripting.executeScript` com `credentials: 'include'` (como `buscarSnAutoIsp`). Sem aba aberta: não faz nada e registra "Abra o AutoISP (auto.alloha.com) logado neste Chrome".
- [ ] **Step 4: Rodar** → PASS.
- [ ] **Step 5: Teste manual**: carregar a extensão sem compactar no Chrome, abrir o AutoISP logado, criar um pedido pela rota `POST /api/rede/pon/solicitar` com uma OLT/PON real, clicar em atualizar no popup e conferir em `/api/rede/pon` os clientes com lat/lng e sem nome.
- [ ] **Step 6: Commit** `feat(extensao): read massive PON clients from AutoISP`.

### Task 7: Importação dos KMZ e tabela POP → OLT (frontend)

**Files:**
- Create: `frontend/src/pages/NetworkImportPage.tsx`, `frontend/src/network.css`
- Modify: `frontend/src/api.ts` (métodos `networkImportBatch`, `networkSources`, `popOlts`, `savePopOlt`), `frontend/src/components/Shell.tsx` (rota `/rede/importar` com `guard("network.manage", ...)`), `frontend/src/lib/nav-items.ts` (item "Rede (KMZ)" na seção das importações, `permission: "network.manage"`), `frontend/src/components/HelpTip.tsx`

**Interfaces:**
- Consumes: `readNetworkFile`, `parseKml`, `toBatches` (Task 2); rotas da Task 5.

- [ ] **Step 1: Implementar a tela**: escolher vários arquivos (`.kml,.kmz`, `multiple`), ler cada um com `readNetworkFile`/`parseKml` e mostrar a prévia por arquivo (CTOs, CEOs, POPs, outros, cabos, ou "não lido: <motivo>"); botão "Importar" envia `toBatches` sequencialmente com `first: true` no primeiro lote de cada arquivo e mostra o progresso; `sha256` por `crypto.subtle.digest`. Abaixo, a lista de fontes já importadas e a tabela POP → OLT (POP, OLT, ativo, observação; desativar pede observação).
- [ ] **Step 2: Verificar** `npm run build` → sem erros; no preview, importar `GUARULHOS I.kmz`, `Penha.kmz`, `Penha 01 - ATUALIZADO.kmz` e um arquivo zerado (`Mogi das Cruzes.kmz`) da pasta PROJETOS: os três primeiros entram, o zerado aparece como "não lido", e reimportar Penha não duplica CTOs.
- [ ] **Step 3: Commit** `feat: network KMZ import page and POP to OLT table`.

### Task 8: Página "Mapa da rede"

**Files:**
- Create: `frontend/src/pages/NetworkMapPage.tsx`, `frontend/src/components/network/NetworkSidePanel.tsx`, `frontend/src/components/network/network-colors.ts`
- Modify: `frontend/package.json` (`leaflet@1.9.4`, `@types/leaflet@1.9.12` em devDependencies), `frontend/src/api.ts` (`networkArea`, `networkPon`, `requestPon`), `frontend/src/components/Shell.tsx` (rota `/rede` com `guard("network.view", ...)`), `frontend/src/lib/nav-items.ts` (item "Mapa da rede", ícone `Map`, `permission: "network.view"`), `frontend/src/network.css`, `frontend/src/components/HelpTip.tsx`

**Interfaces:**
- Consumes: rotas `/api/rede/area`, `/api/rede/pon`, `/api/rede/pon/solicitar`, `/api/rede/pop-olt` (Task 5).
- Produces: a página lê os parâmetros de URL `?olt=<hostname>&ponlink=<0/s/p>&call=<id>` (usados pela Task 9); `network-colors.ts` exporta `SITUATION_COLORS` e `SITUATION_LABELS` com os valores das Global Constraints.

- [ ] **Step 1: Implementar o mapa**: Leaflet com tiles `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` e atribuição do OpenStreetMap; pede `/api/rede/area` no `moveend` (com atraso de 300 ms e cancelando o pedido anterior); desenha clusters (círculo com a contagem), CTOs/CEOs/POPs (marcadores pequenos por tipo), cabos (polyline com `color` original, 2 px) e clientes da PON selecionada (círculos com `SITUATION_COLORS`). Clientes com `precise: false` não são desenhados.
- [ ] **Step 2: Implementar filtros e topo**: faixa com contagens e chips de situação que ligam/desligam; filtros POP, OLT, slot, PON, código da CTO; camadas cabos, CTOs/CEOs, POPs, clientes. Escolher OLT + PON chama `/api/rede/pon`; botão "Atualizar clientes desta PON" chama `/api/rede/pon/solicitar` e mostra "Na fila — a extensão Rede lê na próxima rodada" ou o erro da fila.
- [ ] **Step 3: Implementar `NetworkSidePanel`**: cliente → contrato, OLT, slot/PON, sinal e "lido há…", serial, CTO mais próxima com distância e a etiqueta "estimativa por proximidade", link "Abrir no AutoISP" (`https://auto.alloha.com/gpon_clients/<int6>`); CTO → código, código de projeto, POP/FH, arquivo de origem; lista lateral dos clientes da PON ordenada problema → atenção → sem leitura → ok, com `Pager` de 100 e o resumo "X de Y clientes da PON com problema"; clientes sem localização precisa aparecem só aqui, marcados.
- [ ] **Step 4: Destacar a massiva**: com OLT + PON selecionadas, enquadrar os clientes com localização, destacar CTOs a até 150 m de algum cliente e os cabos cuja caixa intersecta essa área.
- [ ] **Step 5: Verificar** `npm run build` → sem erros; no preview (localhost:8000) com os KMZ importados na Task 7 e uma leitura de PON de demonstração, conferir nos temas claro e escuro, com o painel aberto e fechado, e na largura de celular; rodar a auditoria de contraste.
- [ ] **Step 6: Commit** `feat: network map page`.

### Task 9: "Ver no mapa" na massiva e novidades

**Files:**
- Modify: `frontend/src/pages/CallDetailPage.tsx` (botão perto do campo "Slot/PON", linha ~249), `frontend/src/releases.ts` (entrada "Mapa da rede" com `permission: "network.view"`)

**Interfaces:**
- Consumes: `requestPon({ callId })` (Task 8 em `api.ts`); `normalizePonlink` não existe no frontend — o botão abre `/rede?olt=<call.olt>&call=<id>` e a página escolhe a primeira PON devolvida pelo `POST /api/rede/pon/solicitar` (a resposta passa a incluir `pons: Array<{ olt; ponlink }>`; ajustar a rota da Task 5 e o teste dela).

- [ ] **Step 1: Ajustar** `POST /api/rede/pon/solicitar` para devolver também `pons`, e atualizar o teste da Task 5 (`pons.length === 2` para `'04/10, 09/11'`).
- [ ] **Step 2: Implementar o botão**: aparece só com `olt` e `slotPon` preenchidos e com `network.view`; ao clicar, chama `requestPon({ callId })` e navega para `/rede?olt=…&ponlink=<primeira>&call=<id>`; com várias PON, a página mostra seletor das PON da massiva.
- [ ] **Step 3: Verificar** `npm test --workspace backend` → tudo passa; `npm run build` → sem erros; no preview, abrir um chamado de demonstração com `slotPon: '04/10, 09/11'` e clicar "Ver no mapa".
- [ ] **Step 4: Commit** `feat: open massive PONs on the network map`.

### Task 10: Verificação final

- [ ] **Step 1:** `npm test --workspace backend` → todos passam.
- [ ] **Step 2:** `npm run build` na raiz → sem erros.
- [ ] **Step 3:** Preview local com dados de demonstração: importar KMZ, ver mapa, pedir PON, "Ver no mapa"; temas claro e escuro; auditoria de contraste.
- [ ] **Step 4:** Mostrar ao usuário (prints) e pedir aprovação antes de qualquer push. Lembrar que a migration `202611130001_network_map.sql` precisa ser aplicada no Supabase e a extensão 1.11.0 reinstalada.
