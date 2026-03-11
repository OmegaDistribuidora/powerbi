# Power BI Hub

Sistema interno para gerenciar acesso a paineis do Power BI por usuario, com:

- login local
- admin inicial
- cadastro de usuarios
- cadastro de paineis
- vinculo usuario -> paineis
- regras de filtro dinamicas por usuario

## Stack

- Backend: Fastify + TypeScript + Prisma
- Frontend: React + Vite
- Banco: PostgreSQL

## Rodar localmente

1. Crie um banco PostgreSQL local.
2. Copie `.env.example` de `backend` para `backend/.env` e ajuste `DATABASE_URL`.
3. Copie `.env.example` de `frontend` para `frontend/.env` se quiser ligar o embed real do Power BI.
4. Instale as dependencias:

```bash
npm install
```

5. Gere o client Prisma e aplique o schema:

```bash
npm run prisma:generate
npm run prisma:push
```

6. Suba o ambiente:

```bash
npm run dev
```

- Backend: `http://localhost:3000`
- Frontend: `http://localhost:5173`

## Login inicial

- Usuario: `admin`
- Senha: `Omega@123`

## Variaveis do frontend para Power BI Pro

Para embutir relatorios usando a conta Microsoft do usuario:

- `VITE_MICROSOFT_CLIENT_ID`: Application (client) ID do app registrado no Microsoft Entra
- `VITE_MICROSOFT_TENANT_ID`: Directory (tenant) ID do tenant
- `VITE_MICROSOFT_REDIRECT_URI`: por exemplo `http://localhost:5173`
- `VITE_POWERBI_SCOPE`: por padrao `https://analysis.windows.net/powerbi/api/Report.Read.All`

O usuario final precisa ter conta Microsoft no tenant e permissao/licenca para abrir o relatorio no Power BI.

## Proximos passos

Esta base agora inclui login local, cadastro de paineis/filtros e embed do Power BI no modo compativel com `Power BI Pro`, usando a sessao Microsoft do proprio usuario.
