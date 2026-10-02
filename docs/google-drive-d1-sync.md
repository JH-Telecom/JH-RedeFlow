# Sincronizacao da base historica operacional

O backend deve tratar a pasta `BASE END` no Google Drive como uma base historica atualizada diariamente, com referencia D-1, e nao como uma planilha isolada do ultimo dia. A rotina precisa processar apenas o que e novo ou alterado, preservando o historico e atualizando chamados existentes sem duplicar registros.

## Configuracao

1. Crie uma conta de servico no Google Cloud com acesso a Google Drive API.
2. Compartilhe a pasta `BASE END` com o e-mail da conta de servico como leitor.
3. No Render, configure `GOOGLE_SERVICE_ACCOUNT_JSON` com o JSON da conta de servico em uma unica linha.
4. Mantenha estas variaveis:

```text
GOOGLE_DRIVE_SYNC_ENABLED=true
GOOGLE_DRIVE_FOLDER_ID=1m9m2atkUrxwb2v9xzTLgqebOQ4GQJue-
GOOGLE_DRIVE_SYNC_HOUR=9
GOOGLE_DRIVE_TIMEZONE=America/Sao_Paulo
```

O endpoint manual e `POST /api/integrations/google-drive/sync` e exige a permissao `imports.create`.

## Regras aplicadas

- A pasta do Drive e tratada como base historica operacional, nao como base D-1 isolada.
- Arquivos CSV, XLSX, XLS e planilhas Google da pasta configurada sao lidos com paginação da API do Drive; planilhas Google sao exportadas como CSV antes do parse.
- Registros repetidos em varios arquivos nao geram duplicidade: a sincronizacao usa identidade operacional e fingerprint do payload; a versao do arquivo mais recentemente modificado prevalece.
- Uma linha elegivel sem chamado correspondente cria um chamado com origem Google Drive e passa a aparecer na listagem e nos indicadores.
- Sao processados os tipos `Manutencao Corretiva de Rede`, `Manutencao de Rede Field`, `Reparo Corretivo`, `ACIONAMENTO FIELD`, `NOC ACESSO`, `NOC ACCESS`, `NOC TX` e `NOC BACKBONE`.
- Linhas com status `pendente` e motivo contendo `nao cumprimento` sao ignoradas.
- Identificadores operacionais sao avaliados em ordem de preferencia: ordem de servico, BDESK, Office Track, OS Casa Cliente, contrato e numero do cliente.
- `Data` e `Fim` formam `executed_at`, preservando a data real da conclusao.
- Nos filtros historicos de chamados e indicadores, registros finalizados/cancelados usam `executed_at`; chamados ativos usam `opened_at`.
- Para atividades com endereço, o backend remove prefixos duplicados como `RUA RUA` e extrai `bairro` somente quando consegue separar o logradouro do trecho de cidade; endereço sem contexto suficiente não gera bairro.
- `bairro` e `address` são campos do chamado compartilhados por NOC, FIELD e demais origens; uma atualização vazia mantém um valor válido já persistido.
- `Status da Atividade` (ou `Status OFS`, `OFS Status`, `Status da Atividade OFS`) é persistido em `calls.ofs_status`; ele não substitui o status interno do chamado.
- O matching também reconhece aliases de ordem do D-0 (`Número da Ordem`, `Número OS`, `Ordem de Serviço` e variantes sem acento), e as datas reconhecem `Data Abertura`/`Data-Fim` e aliases de hora de encerramento.
- A região é recalculada pelo mapeamento OLT→Região existente, inclusive em atualizações/reprocessamentos; OLT sem correspondência mantém a região disponível.
- O motivo de encerramento vira o resultado e tambem fica registrado nas observacoes quando houver valor.
- Cada alteracao efetiva gera log e snapshot com arquivo, identificador, payload e horario; cada execucao grava contadores em `google_drive_sync_runs`.
- Status e motivo de cancelamento da base podem reconciliar chamados ja encerrados; alteracoes humanas continuam sujeitas ao bloqueio normal.
- Nenhuma exclusao automatica e feita por ausencia temporaria do registro na base.

## Banco de dados

Antes de sincronizar, aplique em ordem `database/migrations/008_google_drive_history.sql` e `database/migrations/009_call_location_fields.sql` no PostgreSQL local, ou suas equivalentes `supabase/migrations/202609290008_google_drive_history.sql` e `supabase/migrations/202609290009_call_location_fields.sql` no Supabase.

Linhas sem identificador operacional ou com tipo/status fora das regras sao contabilizadas como `unmatched` ou `skipped` e nao criam chamados.