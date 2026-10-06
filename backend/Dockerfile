# syntax=docker/dockerfile:1
#
# Imagem em estágios:
#   dependencias -> instala tudo (inclui as ferramentas de build)
#   construcao   -> gera o Prisma Client e compila o TypeScript
#   migracao     -> serviço de uso único: aplica as migrations (e cria o 1º admin, se configurado)
#   producao     -> a API: só dependências de execução, roda sem privilégios de root

FROM node:25-bookworm-slim AS base
WORKDIR /app
# openssl: exigido pelo motor de migrations do Prisma
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
FROM base AS dependencias
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# DATABASE_URL só precisa existir para o "prisma generate" do postinstall; nenhuma conexão é aberta no build
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm ci

# ---------------------------------------------------------------------------
FROM dependencias AS construcao
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate && npm run build

# ---------------------------------------------------------------------------
FROM base AS migracao
ENV NODE_ENV=production
COPY --from=construcao /app/node_modules ./node_modules
COPY --from=construcao /app/dist ./dist
COPY --from=construcao /app/package.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
USER node
# Aplica as migrations e cria o administrador inicial SOMENTE se ADMIN_EMAIL/ADMIN_SENHA estiverem definidos
CMD ["sh", "-c", "npx prisma migrate deploy && if [ -n \"$ADMIN_EMAIL\" ]; then node dist/prisma/seed.js; fi"]

# ---------------------------------------------------------------------------
FROM base AS producao
ENV NODE_ENV=production
COPY package.json package-lock.json ./
# --ignore-scripts: sem postinstall (o Prisma Client já vem gerado e compilado em dist/)
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=construcao /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/src/main.js"]
