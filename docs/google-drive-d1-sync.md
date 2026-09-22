# Sincronizacao da base D-1

O backend pode ler os CSVs da pasta `BASE END` do Google Drive e sincronizar os chamados diariamente as 09:00 (horario de Sao Paulo).

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

- Apenas arquivos CSV da pasta configurada sao lidos.
- Sao processados os tipos `Manutencao Corretiva de Rede`, `Manutencao de Rede Field` e `Reparo Corretivo`.
- Linhas com status `pendente` e motivo contendo `nao cumprimento` sao ignoradas.
- A Ordem de Servico e comparada com `order_number`, `bdesk` e `office_track`, com ou sem o prefixo `BDESK-`.
- `Data` e `Fim` formam `executed_at`.
- O motivo de encerramento vira o resultado e tambem fica registrado nas observacoes quando houver valor.
- Cada alteracao efetiva gera auditoria no chamado.