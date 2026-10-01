# Publicar em um servidor

Guia para colocar a API no ar em **uma máquina Linux com Docker** (uma VPS, por exemplo). O `docker-compose.yml` já sobe banco, migrações e API; faltam apenas **HTTPS**, **segredos de produção** e **backup**.

> Este guia descreve o que o próprio repositório faz (a stack foi construída e testada em Docker) e o que precisa ser acrescentado na frente. Confira cada passo no seu ambiente.

## 1. Segredos de produção

```bash
git clone https://github.com/Brunacoelhob/app-gerenciamento-emprestimo-equipamentos.git
cd app-gerenciamento-emprestimo-equipamentos
cp .env.example .env
```

No `.env`:

| Variável | O que fazer |
|---|---|
| `DB_SENHA` | Senha forte, só para este banco |
| `JWT_SECRET` | Novo, de 48 bytes: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. **Nunca** reutilize o de desenvolvimento |
| `ADMIN_EMAIL` / `ADMIN_SENHA` | O primeiro administrador (senha de 12+ caracteres, com letras e números) |
| `CORS_ORIGENS` | O endereço do seu front-end (ex.: `https://app.exemplo.com`). Vazio = nenhum site de navegador |
| `SWAGGER_ATIVO` | Deixe desligado em produção |

O `.env` está no `.gitignore`: não o envie ao repositório.

## 2. Subir

```bash
docker compose up -d --build
docker compose ps          # banco e api "healthy"; migrar "exited (0)"
curl http://127.0.0.1:3000/saude
```

A ordem é automática: o banco fica saudável → o serviço **migrar** aplica as migrations e cria o primeiro administrador → a **API** sobe e é considerada saudável quando `/saude` responde.

## 3. HTTPS com proxy reverso

A API escuta só em `127.0.0.1:3000`. Coloque um proxy com certificado na frente. Exemplo com **Caddy** (certificado automático):

```
api.exemplo.com {
    reverse_proxy 127.0.0.1:3000
}
```

Com nginx e Certbot a ideia é a mesma (`proxy_pass http://127.0.0.1:3000;`). Se a API ficar atrás do proxy, o limite de requisições enxergará o IP do proxy; configure o `trust proxy` do Express antes de ir a produção com tráfego real.

## 4. Backup e restauração

Os dados ficam no volume `dados_banco`.

```bash
# backup
docker compose exec -T banco pg_dump -U "$DB_USER" -d "$DB_NOME" -Fc > backup-$(date +%F).dump

# restauração (em um banco vazio)
docker compose exec -T banco pg_restore -U "$DB_USER" -d "$DB_NOME" --clean --if-exists < backup-AAAA-MM-DD.dump
```

Agende o `pg_dump` (cron) e copie os arquivos para fora do servidor.

## 5. Atualizar

```bash
git pull
docker compose up -d --build     # as migrations pendentes são aplicadas pelo serviço migrar
```

As migrations têm **pré-checagens**: se os dados antigos violarem uma regra nova (ex.: dois empréstimos ativos do mesmo equipamento), a migration para com uma mensagem explicando o que corrigir, sem alterar nada.

## 6. Monitoramento

- `GET /saude` (pública, sem limite de requisições): use em um monitor externo e no *healthcheck* do Docker.
- `docker compose logs -f api`: uma linha por requisição (método, rota, status, duração, id do usuário), sem corpo nem tokens; erros inesperados com pilha.

## 7. Lista de conferência antes de publicar

- [ ] `JWT_SECRET`, `DB_SENHA` e `ADMIN_SENHA` trocados e fortes.
- [ ] HTTPS ativo e `CORS_ORIGENS` com o domínio real.
- [ ] Banco **sem** porta publicada (o compose já não publica).
- [ ] Backup agendado e restauração testada.
- [ ] `docker compose ps` mostrando a API como *healthy*.
- [ ] `/docs` retornando 404 (Swagger desligado).
