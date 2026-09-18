# Mapa da automacao legada

Fonte analisada: `Codigos do Meu appscript.txt`.

## Entrada principal

`doPost(e)` recebe tres tipos de fluxo:

1. Eventos `message_created` do Chatwoot.
2. Mensagens de consulta massiva enviadas como `jsonData`.
3. Eventos de mensagem recebidos pela WuzAPI.

O novo backend deve manter esses fluxos separados. O webhook WuzAPI atual do RedeFlow esta isolado em `backend/src/integrations/wuzapi`.

## WuzAPI e grupos

- Grupo de acionamentos: recebe mensagens operacionais e inicia extracao.
- Grupo de validacao: recebe botoes/comandos `ACEITAR_`, `RECUSAR_`, `VALIDAR_` e `ACEITAR_TODOS`.
- Grupo de baixas: concentra baixas tecnicas.
- Grupo de alertas: recebe alertas de SLA.
- Grupo informativo OLT: recebe informativos quando a OLT esta na lista configurada.
- Grupo de consulta massiva: redireciona a consulta para o privado do bot.

Os tokens, IPs, chaves Gemini, IDs de Drive e identificadores de grupos nao devem ir para o frontend. As credenciais presentes no arquivo legado devem ser rotacionadas.

## Acionamento

Fluxo legado:

`WuzAPI -> normalizacao -> Gemini/extracao local -> aba Acionamentos -> validacao -> ACEITO/RECUSADO -> ACIONAMENTOS EM CAMPO`

Campos extraidos pelo legado:

- tipo_card
- bdesk / ticket
- office_track / os_ot
- olt
- slot_pon / placa_pon
- tipo_falha / motivo
- afetados
- data_hora_evento
- contrato / os_casa_cliente
- id_cto / loc_cto
- tecnico / tecnico_rede / cope_rede
- mensagem_original / observacoes

O novo sistema deve preservar sempre:

1. Mensagem original.
2. Dados extraidos pela IA ou parser.
3. Dados confirmados pelo mesario/operador.
4. Alteracoes humanas em auditoria.

## Baixa tecnica

O fluxo coleta:

- causa da falha
- tratativa
- localizacao
- cabos manuseados
- quantidade de fusao
- observacao
- materiais e quantidades
- fotos obrigatorias

A baixa atualiza o acionamento, grava `Baixas Bot`, `Materiais Bot`, pasta de fotos no Drive e envia resumo ao grupo de baixas.

## Consulta massiva

Fluxo:

`contrato -> OLT -> lista de eventos pendentes -> escolha do evento`

A sessao expira em 5 minutos. Consulta em grupo e redirecionada para o privado do bot.

## SLA e indicadores

- Alerta operacional configurado para 8 horas de pendencia.
- Indicador JH4:
  - ate 6 horas: `PRAZO`
  - acima de 6 ate 9 horas: `FORA DO PRAZO`
  - acima de 9 horas: `OUTLIER`
- O Apps Script tambem usa `INDICADOR GIGA`, `INDICADOR JH`, `TME GIGA`, `TME JH`, `TMP EX`, `IFI` e `IRR` nas bases e dashboards.

Esses indicadores devem ser calculados no backend a partir do mapeamento oficial da planilha, e nao por leitura integral no frontend.

## Importacao legada

A rotina `importarCSVIncremental` usa a base `BASE END`, filtra tipos de atividade e status, remove arquivos que deixaram de existir no Drive, ordena por data e registra linhas novas.

A tela atual de importacao do RedeFlow ja faz upload, previsualizacao e confirmacao, mas a escrita em `calls` deve aguardar a aprovacao do mapeamento oficial.
