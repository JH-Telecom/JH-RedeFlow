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
- Apenas arquivos CSV da pasta configurada sao lidos.
- Registros repetidos em varios arquivos nao geram duplicidade: a sincronizacao compara o identificador operacional e o payload relevante antes de atualizar.
- Sao processados os tipos `Manutencao Corretiva de Rede`, `Manutencao de Rede Field` e `Reparo Corretivo`.
- Linhas com status `pendente` e motivo contendo `nao cumprimento` sao ignoradas.
- Identificadores operacionais sao avaliados em ordem de preferencia: ordem de servico, BDESK, Office Track, OS Casa Cliente, contrato e demais chaves existentes.
- `Data` e `Fim` formam `executed_at`, preservando a data real da conclusao.
- Nos filtros historicos de chamados e indicadores, registros finalizados/cancelados usam `executed_at`; chamados ainda ativos usam `opened_at`. Quando o encerramento nao tem data de execucao, o sistema usa a abertura como fallback.
- O motivo de encerramento vira o resultado e tambem fica registrado nas observacoes quando houver valor.
- Cada alteracao efetiva gera auditoria no chamado e nenhuma exclusao automatica e feita por ausencia temporaria do registro na base.

## Limite atual

A sincronizacao ainda atualiza somente linhas que encontram um chamado existente por identificador operacional. Linhas sem correspondencia sao contabilizadas como ignoradas; `newRecords` permanece zero. Portanto, o armazenamento e a exibicao de novos registros historicos do Drive ainda precisam de uma etapa própria antes de a base do Drive se tornar fonte completa para consultas.