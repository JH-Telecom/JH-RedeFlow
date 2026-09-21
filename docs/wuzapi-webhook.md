# Webhook WuzAPI

## Endpoint

```text
POST https://SEU-DOMINIO/api/integrations/wuzapi/webhook
```

O endpoint aceita uma destas formas de autenticação privada:

```text
x-wuzapi-token: mesmo-valor-de-WUZAPI_WEBHOOK_TOKEN
```

Também são aceitos `x-webhook-token`, `Authorization: Bearer mesmo-valor-de-WUZAPI_WEBHOOK_TOKEN` ou `?token=mesmo-valor-de-WUZAPI_WEBHOOK_TOKEN` caso o painel do WuzAPI não permita configurar headers personalizados. Prefira header; use query string somente se for a única opção.

O token fica somente no backend e na configuração do WuzAPI. Não coloque esse valor no frontend.

Na tela mostrada, o campo **Webhook** ainda aponta para o Google Apps Script. Substitua esse endereço por:

```text
https://SEU-DOMINIO-DO-BACKEND/api/integrations/wuzapi/webhook
```

O endereço deve ser público e HTTPS quando o WuzAPI estiver fora da sua máquina. O campo HMAC pode permanecer desativado porque a autenticação do RedeFlow usa o token privado acima.

## Variáveis do backend

No ambiente local:

```env
WUZAPI_WEBHOOK_TOKEN=um-token-local-forte
WUZAPI_ACTIVATION_GROUP_ID=120363422003961917@g.us
REDEFLOW_RUNTIME=local
# Opcional: habilita enriquecimento semantico; sem a chave usa o parser local seguro
GEMINI_API_KEY=chave-do-backend
GEMINI_MODEL=gemini-2.5-flash
```

No deploy:

```env
NODE_ENV=production
REDEFLOW_RUNTIME=supabase
WUZAPI_WEBHOOK_TOKEN=um-token-de-producao-forte
WUZAPI_ACTIVATION_GROUP_ID=120363422003961917@g.us
GEMINI_API_KEY=chave-do-backend
GEMINI_MODEL=gemini-2.5-flash
```

Use tokens diferentes entre local e produção.

## Teste local

Com o backend rodando em `http://localhost:3333`, execute no PowerShell:

```bash
$payload = @{
  type = "Message"
  event = @{
    Info = @{
      ID = "local-test-001"
      Chat = "120363422003961917@g.us"
      Sender = "551199999999@s.whatsapp.net"
      IsGroup = $true
      Timestamp = (Get-Date).ToUniversalTime().ToString("o")
    }
    Message = @{
      conversation = "VALIDAR COM NOC ACESSO`nORDEM: RF-TESTE-01`nBDESK: BD-TESTE-01`nMOTIVO: perda de sinal`nOLT: OLT-01`nSLOT/PON: 3/7"
    }
  }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod http://localhost:3333/api/integrations/wuzapi/webhook `
  -Method Post `
  -Headers @{ "x-wuzapi-token" = "SEU_TOKEN_LOCAL" } `
  -ContentType "application/json" `
  -Body $payload
```

Resposta esperada:

Resposta esperada: `activationId` preenchido e `status` igual a `Pendente`.

O grupo usado no payload precisa ser exatamente o valor de `WUZAPI_ACTIVATION_GROUP_ID`.

Sem token ou com token incorreto, a resposta deve ser `401`. Sem mensagem, deve ser `400`.

## Teste externo

O WuzAPI não consegue chamar `localhost` de outro servidor. Para testar localmente com um WuzAPI externo, use um túnel HTTPS, por exemplo:

```bash
cloudflared tunnel --url http://localhost:3333
```

Configure no WuzAPI a URL HTTPS gerada, terminando em:

```text
/api/integrations/wuzapi/webhook
```

Para produção, use o domínio HTTPS do deploy e configure o mesmo `WUZAPI_WEBHOOK_TOKEN` no backend e no WuzAPI.

## Fluxo esperado

1. WuzAPI envia a mensagem para o endpoint.
2. O backend aceita somente o grupo definido em `WUZAPI_ACTIVATION_GROUP_ID`.
3. O backend normaliza texto simples ou payload aninhado em `event.Message`.
4. A mensagem é normalizada, filtrada e classificada; mensagens do próprio bot, sem texto, fora do grupo e sem sinais operacionais são ignoradas.
5. O analisador semântico extrai os dados completos, preserva os endereços e grava a mensagem original junto com o resultado estruturado. O Gemini é opcional; se estiver indisponível, o parser local continua funcionando sem inventar valores.
6. O acionamento aparece como `Pendente` na tela de Acionamentos.
7. Um usuário com `activations.decide` aceita ou recusa.
8. Ao aceitar, o backend cria o chamado operacional; ao recusar, registra o motivo.

## Banco Supabase

Execute também a migration `202609210003_activation_triage.sql`. Ela cria `activations` e `activation_processing`, incluindo o JSON completo da análise semântica e os dados originais para auditoria.

O endpoint atual não deve receber chamadas do navegador. Toda integração deve ocorrer entre WuzAPI e backend.
