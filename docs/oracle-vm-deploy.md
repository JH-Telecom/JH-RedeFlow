# Deploy na VM Oracle

Exemplo para Ubuntu na VM Oracle. Para Oracle Linux, use o usuario `opc` e adapte o gerenciador de pacotes.

## 1. Acessar a VM

```bash
ssh ubuntu@IP_PUBLICO_DA_VM
```

## 2. Instalar dependencias

```bash
sudo apt update
sudo apt install -y git nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

## 3. Baixar e preparar o projeto

```bash
git clone URL_DO_REPOSITORIO jh-redeflow
cd jh-redeflow
npm install
```

Crie `backend/.env` somente na VM:

```env
NODE_ENV=production
REDEFLOW_RUNTIME=supabase
REDEFLOW_DEMO_DATA=false
PORT=3333
JWT_SECRET=SEGREDO_JWT_FORTE
WUZAPI_WEBHOOK_TOKEN=SEGREDO_WEBHOOK_FORTE
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_ANON_KEY=SUA_CHAVE_ANON
SUPABASE_SERVICE_ROLE_KEY=SUA_CHAVE_SERVICE_ROLE
```

A `SERVICE_ROLE_KEY` nunca deve ir para o frontend ou para o Git.

## 4. Build e iniciar o backend

```bash
npm run build
cd backend
pm2 start dist/server.js --name jh-redeflow-api
pm2 save
pm2 startup
```

Execute o comando final exibido pelo `pm2 startup` com `sudo`.

Teste:

```bash
curl http://127.0.0.1:3333/health
curl http://127.0.0.1:3333/health/supabase
```

## 5. Build do frontend

Na raiz do projeto, crie `frontend/.env.production`:

```env
VITE_API_URL=https://SEU_DOMINIO
```

O valor não deve terminar em `/api`, porque o frontend já usa caminhos como `/api/auth/login`.

```bash
npm run build --workspace frontend
sudo mkdir -p /var/www/jh-redeflow
sudo cp -r frontend/dist/* /var/www/jh-redeflow/
```

## 6. Configurar Nginx

Crie `/etc/nginx/sites-available/jh-redeflow`:

```nginx
server {
    listen 80;
    server_name SEU_DOMINIO;

    root /var/www/jh-redeflow;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3333;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Ative:

```bash
sudo ln -s /etc/nginx/sites-available/jh-redeflow /etc/nginx/sites-enabled/jh-redeflow
sudo nginx -t
sudo systemctl reload nginx
```

Abra as portas `80` e `443` nas regras de entrada da VM Oracle. Não exponha a porta `3333` publicamente.

Depois configure HTTPS:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d SEU_DOMINIO
```

## 7. Configurar o WuzAPI

Use:

```text
https://SEU_DOMINIO/api/integrations/wuzapi/webhook
```

O token configurado no WuzAPI deve ser igual ao `WUZAPI_WEBHOOK_TOKEN` da VM. O backend aceita `Authorization: Bearer`, `x-wuzapi-token` ou `x-webhook-token`.

## 8. Atualizar versões

```bash
cd ~/jh-redeflow
git pull
npm install
npm run build
pm2 restart jh-redeflow-api
sudo cp -r frontend/dist/* /var/www/jh-redeflow/
```

Observação: o runtime local e o deploy Supabase já estão separados. A persistência completa do `store` em PostgreSQL ainda é uma etapa posterior; o deploy atual usa Supabase para autenticação, enquanto algumas operações ainda permanecem no store em memória.
