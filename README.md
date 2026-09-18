# JH RedeFlow

Fundacao da plataforma operacional da Rede JH Telecom.

## Rodar localmente

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`

API: `http://localhost:3333`

Modo demo: `admin@jhtelecom.com` / `RedeFlow@2026`

O modo demo nao substitui a configuracao de producao. Para usar PostgreSQL, copie `backend/.env.example` para `backend/.env` e informe `DATABASE_URL` e `JWT_SECRET`.