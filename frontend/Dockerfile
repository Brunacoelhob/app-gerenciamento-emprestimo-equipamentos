# syntax=docker/dockerfile:1
#
# Imagem em dois estágios:
#   construcao -> instala as dependências e gera os arquivos estáticos do Angular
#   producao   -> nginx (sem privilégios de root) serve os arquivos e encaminha /api para a API

FROM node:25-bookworm-slim AS construcao
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:1.27-alpine AS producao
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY cabecalhos.conf /etc/nginx/cabecalhos.conf
COPY --from=construcao /app/dist/frontend/browser /usr/share/nginx/html
EXPOSE 8080
