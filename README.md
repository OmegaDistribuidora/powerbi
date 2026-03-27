# Power BI Hub

Sistema interno para gerenciar acesso a paineis do Power BI por usuario, com:

- login local
- admin inicial
- cadastro de usuarios
- cadastro de paineis
- vinculo usuario -> paineis
- regras de filtro dinamicas por usuario
- cards customizaveis na pagina inicial

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

## Usuario administrador

O usuario administrador inicial e criado automaticamente pelo backend usando as variaveis:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_DISPLAY_NAME`

Defina esses valores no ambiente local e no Railway. Evite registrar credenciais reais no repositorio.

## Protecao extra para admin via SSO

Para reforcar o login administrativo vindo do Ecossistema Omega, voce pode definir:

- `ECOSYSTEM_SSO_ADMIN_USERS`: lista separada por virgula com os logins do Ecossistema autorizados a abrir contas `ADMIN` no Power BI

Exemplo:

```bash
ECOSYSTEM_SSO_ADMIN_USERS=admin,william
```

Se o usuario local alvo for `ADMIN`, o backend exigira:

- `ecosystemIsAdmin = true` no token SSO
- e que o login do Ecossistema esteja nessa allowlist ou seja igual ao `targetLogin`

## Variaveis do frontend para Power BI Pro

Para embutir relatorios usando a conta Microsoft do usuario:

- `VITE_MICROSOFT_CLIENT_ID`: Application (client) ID do app registrado no Microsoft Entra
- `VITE_MICROSOFT_TENANT_ID`: Directory (tenant) ID do tenant
- `VITE_MICROSOFT_REDIRECT_URI`: por exemplo `http://localhost:5173`
- `VITE_POWERBI_SCOPE`: por padrao `https://analysis.windows.net/powerbi/api/Report.Read.All`

O usuario final precisa ter conta Microsoft no tenant e permissao/licenca para abrir o relatorio no Power BI.

## Upload de previews

Os previews dos cards da home podem ser enviados pelo admin.

- Em producao, defina `PREVIEWS_DIR` apontando para o volume persistente montado no Railway
- Exemplo de uso com volume: `PREVIEWS_DIR=/previews`
- Os arquivos enviados passam a ser servidos pelo backend em `/previews/...`

## Proximos passos

Esta base agora inclui login local, cadastro de paineis/filtros e embed do Power BI no modo compativel com `Power BI Pro`, usando a sessao Microsoft do proprio usuario.
