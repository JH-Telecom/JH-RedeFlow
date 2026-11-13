# Mapa da rede (massivas) — desenho

Data: 13/11/2026 · Status: aguardando revisão

## Objetivo

Quando cai uma OLT ou uma PON (massiva), o supervisor abre o mapa e vê, no lugar certo, os clientes afetados daquela
PON, as CTOs mais próximas e os cabos do projeto, para mandar o técnico direto ao ponto. A referência visual é a
"Central Rede" do sistema JH TELECOM (Litoral), mas o código é novo, dentro do JH-Rede, para as regiões de SP.

Fora do escopo desta versão: painel diário de saúde de todas as OLTs, coleta da base inteira do AutoISP, edição da
rede no mapa, postes, cobertura e áreas bloqueadas.

## Fontes de dados

| Fonte | O que traz | Como entra |
|---|---|---|
| KMZ/KML da pasta PROJETOS | POPs, CTOs, CEOs, cabos (geometria, código, código de projeto, cor original) | Importação na tela "Rede (KMZ)" |
| AutoISP (auto.alloha.com) | Clientes por OLT/PON: contrato, serial, int6, OLT, ponlink, sinal Rx, status da ONU, último contato, lat/lng | Extensão Rede, com o login do próprio Chrome |
| Chamados/massivas do JH-Rede | OLT e placa/PON da massiva (já extraídos do card do NOC: `olt`, `slotPon`, `extractAllSlotPons`) | Já existe |
| Tabela POP → OLT | Quais OLTs atendem cada POP | Cadastro manual por analista |

Os arquivos não dizem qual OLT/slot/PON atende cada CTO, e o AutoISP não diz a CTO do cliente. Toda ligação
cliente × CTO é **estimativa por proximidade**, sempre marcada e nunca somada como dado oficial.

## 1. Banco (migration `network_map`)

- `network_elements`: `id`, `kind` (`pop`, `cto`, `ceo`, `outro`), `code` (ex. `CTO-GR1-0249`), `name`,
  `project_code` (ex. `GRS01-FH01-P46-L04-R02-C13`), `pop`, `fh` (extraídos do código de projeto quando houver),
  `lat`, `lng`, `source_file`, `imported_at`. Único por `code` quando houver código; sem código, o elemento é
  substituído junto com o arquivo de origem.
- `network_cables`: `id`, `name`, `color` (cor original do KMZ), `points` (lista simplificada `[[lng,lat],...]`),
  `min_lat`, `min_lng`, `max_lat`, `max_lng`, `source_file`.
- `network_sources`: `file_name`, `sha256`, `elements`, `cables`, `imported_by`, `imported_at`, `skipped_reason`.
- `network_pop_olts`: `pop`, `olt`, `active`, `note`, `confirmed_by`, `updated_at`.
- `network_clients`: `contract` (chave), `serial`, `int6`, `olt`, `ponlink`, `signal_rx`, `onu_status`,
  `last_inform`, `lat`, `lng`, `read_at`, `read_by`. **Sem nome e sem endereço do assinante.**
- `network_pon_requests`: fila de PONs para a extensão ler: `olt`, `ponlink`, `call_id` (opcional),
  `requested_at`, `requested_by`, `done_at`, `result` (achados, lidos, erro).
- Índices em (`lat`, `lng`) e nas caixas dos cabos para o filtro por área visível. Sem PostGIS.

## 2. Importação dos KMZ

- Tela "Rede (KMZ)" em Importações, permissão `network.manage`.
- O arquivo é lido **no navegador** (descompactação nativa + `DOMParser`), por isso não esbarra no limite de 15 MB
  do backend (o maior KML tem 22 MB). A prévia (contagens por arquivo e arquivos não lidos) é montada no próprio
  navegador; ao confirmar, ele manda os itens em lotes de até 2.000 para `POST /api/rede/importacao`.
- Classificação pelo nome, procurando o termo em qualquer parte (ex. `TT2-FH02-CEOSP-SP02.1`): `CTO`, `CTOI`, `CTOC`,
  `MCTOI`, `CTI` → CTO; `CEO`, `CEOSP`, `CES`, `CEL` → CEO; `POP` → POP; o resto vira `outro` (ponto neutro).
  Caracteres invisíveis (`​`) são removidos antes.
- Código de projeto: do `CMDISPLAYTEXT` da descrição; se vier vazio, do próprio nome quando ele trouxer o padrão
  `XXX-FHnn-...` (ex. `CTOI-GR1-0052​GR1-FH05-P53-...`).
- Cabo: `LineString` do KMZ, simplificado (Douglas-Peucker, ~2 m) antes de enviar.
- Duplicatas: mesmo `code` em dois arquivos → fica o do arquivo mais recente. Reimportar um arquivo substitui só o
  que veio dele.
- A prévia lista os arquivos não lidos com o motivo: zip vazio/zerado (7 arquivos), sem conteúdo (6), XML inválido
  (`KMZ EVO E WEB`).

## 3. Leitura do AutoISP (extensão Rede)

A extensão Rede (`extensao-rede`) ganha as consultas que a extensão Monitoramento OLT já faz, **só GET**, no máximo
3 consultas ao mesmo tempo, com a aba do AutoISP aberta e logada neste Chrome:

- `GET /olts/get_all_for_select` → OLTs que a conta enxerga (cache de 30 min).
- `GET /client_search/search?olt_id=<id>&ponlink=<frame/slot/porta>` → clientes da PON (tenta `0/s/p` e `s/p`).
- `GET /gpon_clients/<int6>/detailed_info` → sinal Rx, status, último contato, lat/lng. Nome, endereço, CPF/CNPJ do
  JSON são descartados na própria extensão e nunca saem dela.

Fluxo: o backend expõe `GET /api/integrations/autoisp/pons-pendentes` (fila `network_pon_requests`) e
`POST /api/integrations/autoisp/pon` (resultado da leitura). A extensão confere a fila no mesmo alarme que já usa e
também quando o usuário clica em "Atualizar clientes desta PON" no mapa. Não há leitura da base inteira e não há o
"Atualizar sinal" (que manda a OLT consultar a ONU) nesta versão.

Uma PON entra na fila quando: (a) chega uma massiva com OLT e placa/PON, ou (b) alguém pede no mapa.

## 4. Tela "Mapa da rede"

- Página nova no menu, permissão `network.view`. Leaflet com OpenStreetMap; tema claro e escuro com contraste ≥ 4,5:1
  nos dois.
- Topo: contagem de CTOs, cabos e clientes na tela; chips Com problema / Atenção / Sem problema / Sem leitura (ligam e
  desligam o grupo).
- Filtros: região/POP, OLT, slot, PON, código da CTO. Camadas: cabos, CTOs/CEOs, POPs, clientes do AutoISP,
  massivas abertas.
- Painel à direita:
  - cliente: contrato, OLT, slot/PON, sinal e "lido há…", serial, CTO mais próxima com a distância e a etiqueta
    "estimativa por proximidade", link "Abrir no AutoISP";
  - CTO: código, código de projeto, POP/FH, arquivo de origem, clientes mais próximos.
- Desempenho: `GET /api/rede/area?bbox=...&zoom=...` devolve só o que está na área visível; com zoom afastado, CTOs vêm
  agrupadas (bolha com contagem) e cabos simplificados. Listas com no máximo 100 por página.

Cores e regras (iguais à Central Rede):

- Com problema (vermelho): crítico, LOS, sem energia, offline, massiva. Atenção (laranja): sinal em atenção.
  Sem problema (verde): OK. **Sem leitura (cinza): status vazio — não é "desconectado".**
- Cor do cabo é a original do projeto, nunca status.
- Coordenada repetida em 10+ clientes = ponto padrão do AutoISP → cliente fica "sem localização precisa" e aparece só
  na lista.

## 5. Fluxo da massiva

- No detalhe do chamado com OLT e placa/PON aparece o botão **"Ver no mapa"**, que abre o mapa filtrado naquela OLT e
  PON e, se ainda não houver leitura recente (menos de 30 min), coloca a PON na fila.
- Uma massiva com várias placas/PON (`04/10, 09/11`) entra na fila uma vez por PON.
- O mapa enquadra os clientes afetados e destaca as CTOs a até 150 m deles e os cabos que passam por essa área.
- A lista lateral mostra os afetados ordenados por situação (problema primeiro) e o resumo "X de Y clientes da PON com
  problema".

## 6. Erros

- Extensão ausente, AutoISP não logado ou conta sem acesso à OLT: a fila guarda o erro e o mapa mostra a mensagem
  ("Abra o AutoISP logado neste Chrome", "A conta do AutoISP não enxerga a OLT X").
- OLT da massiva não encontrada no AutoISP: mostra o nome que veio do card e o que foi tentado.
- PON sem cliente na busca: "nenhum cliente encontrado nesta PON" (não vira zero afetados oficial).
- Falha ao gravar: a leitura aparece na tela mesmo assim, com aviso de que não foi salva.

## 7. Testes

- Backend: parser de nome/código de projeto, deduplicação por arquivo mais recente, filtro por área, regra de
  situação (incluindo "sem leitura"), coordenada repetida, CTO mais próxima, fila de PON (massiva com várias PON).
- Extensão: função que monta a busca por OLT/PON e a que descarta nome/endereço/documento do detalhe (testada com um
  JSON de exemplo).
- Frontend: `npm run build`; conferência no preview local (localhost:8000, dados de demonstração) antes de qualquer
  commit/push, nos temas claro e escuro, e `scripts/contrast-audit.js`.

## Decisões em aberto

Nenhuma. Nome do assinante: não é guardado (decisão desta versão; o link "Abrir no AutoISP" cobre a consulta).
