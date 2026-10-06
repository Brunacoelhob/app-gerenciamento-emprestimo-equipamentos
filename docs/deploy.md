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
| `APP_URL` | O endereço público da interface (ex.: `https://app.exemplo.com`). **Obrigatória**: vai nos links dos e-mails de recuperação de senha |
| `LIMITE_LOGIN_POR_MINUTO`, `LIMITE_GERAL_POR_MINUTO`, `LIMITE_CADASTRO_POR_HORA`, `LIMITE_RECUPERACAO_POR_HORA`, `LIMITE_REDEFINICAO_POR_HORA` | **Deixe em branco em produção** (padrões: 5/min no login, 100/min geral, 10/h cadastro, 5/h pedido de nova senha, 10/h redefinição). Existem só para a suíte de interface, que faz dezenas de logins do mesmo IP. O limite do login é a principal defesa contra adivinhação de senhas |
| `COOKIE_SEGURO` | **Deixe em branco.** A sessão vai num cookie `HttpOnly` que, em produção, só viaja por HTTPS (`Secure`). Só use `false` para testar a stack em `http://` fora de `localhost`; em produção real o acesso precisa ser por HTTPS, senão o navegador não guarda o cookie e ninguém consegue entrar |
| `CADASTRO_PUBLICO` | `true` (padrão) deixa qualquer pessoa criar a própria conta na tela de login (sempre como usuário comum). Use `false` se só administradores devem criar contas |
| `NOTIFICACOES_ATIVAS`, `NOTIFICACOES_CRON`, `NOTIFICACOES_FUSO` | Avisos automáticos de vencimento e atraso (padrão: ligados, todo dia às 8h, fuso de São Paulo). Dependem do SMTP abaixo |
| `SMTP_HOST`, `SMTP_PORTA`, `SMTP_SEGURO`, `SMTP_USUARIO`, `SMTP_SENHA`, `EMAIL_REMETENTE` | O servidor de e-mail (qualquer provedor SMTP). `SMTP_SEGURO=true` para a porta 465. **Sem `SMTP_HOST` os e-mails não são enviados** e "esqueci minha senha" não chega a ninguém |

O `.env` está no `.gitignore`: não o envie ao repositório.

## 2. Subir

```bash
docker compose up -d --build
docker compose ps          # banco e api "healthy"; migrar "exited (0)"
curl http://127.0.0.1:3000/saude        # a API
curl http://127.0.0.1:8080/api/saude    # a mesma API, pela interface web (nginx)
```

A interface web (`web`) escuta em `127.0.0.1:8080` (`PORTA_WEB`). Ela serve o Angular e encaminha `/api/*` para a API na mesma origem, por isso **`CORS_ORIGENS` pode ficar vazio** quando o navegador só acessa pelo endereço da interface. A API sabe que há um proxy na frente (`TRUST_PROXY=1`, já definido no compose): assim o limite de tentativas de login vale **por pessoa**, e não para todos juntos. Se você colocar mais um proxy na frente (próxima seção), aumente `TRUST_PROXY` para 2 e faça esse proxy repassar o `X-Forwarded-For`.

A ordem é automática: o banco fica saudável → o serviço **migrar** aplica as migrations e cria o primeiro administrador → a **API** sobe e é considerada saudável quando `/saude` responde.

## 3. HTTPS com proxy reverso

A interface web escuta só em `127.0.0.1:8080`. Coloque um proxy com certificado na frente **dela** (ela já encaminha `/api` para a API). Exemplo com **Caddy** (certificado automático):

```
app.exemplo.com {
    reverse_proxy 127.0.0.1:8080
}
```

Com nginx e Certbot a ideia é a mesma (`proxy_pass http://127.0.0.1:8080;`, repassando `X-Forwarded-For`).

Agora há **dois** proxies entre o navegador e a API (o seu, com HTTPS, e o nginx do compose). Ajuste `TRUST_PROXY=2` na API: sem isso ela enxerga o IP do primeiro proxy e o limite de tentativas de login volta a valer para todos juntos. O nginx do compose acrescenta o IP de quem o acessou ao `X-Forwarded-For` e a API só confia nos últimos `TRUST_PROXY` itens da lista: o seu proxy informa o IP do navegador, o nginx informa o do seu proxy, e a API usa o do navegador. Confira, depois de publicar, que tentativas de login de IPs diferentes não dividem o mesmo limite.

Se a API ficar exposta diretamente, mantenha `TRUST_PROXY` em `0`: assim ninguém consegue forjar o próprio IP por cabeçalho.

## 4. Backup e restauração

O serviço **`backup`** do `docker-compose.yml` faz uma cópia do banco todo dia às 03:00 (`BACKUP_HORA`), mantém 14 dias (`BACKUP_MANTER_DIAS`) e grava em `BACKUP_PASTA` (padrão `./backups`, no servidor). Sobe junto com o resto (`docker compose up -d`) e foi testado: gera o `.sql.gz`, agenda o próximo e descarta arquivo vazio.

- **Cópia externa:** cada backup é copiado também para `BACKUP_PASTA_EXTERNA` (conferido byte a byte) com o mesmo rodízio. No projeto de portfólio essa pasta é local e **simula** um disco remoto; num servidor real, aponte-a para um disco de outra máquina ou uma pasta sincronizada com a nuvem (rclone mount, NFS), porque backup só na mesma máquina não protege contra a perda dela.
- **Saiba se parou:** defina `BACKUP_AVISO_OK` com o endereço de um serviço de "batimento" (ex.: healthchecks.io). Ele recebe um aviso a cada backup bem-sucedido; se deixar de receber, alerta.
- **Fora do Docker Compose** (ou para uma cópia na hora): `./scripts/backup-banco.sh /pasta/de/destino`.

```bash
# restauração: pede para digitar "restaurar" e SUBSTITUI os dados atuais pelos do arquivo
./scripts/restaurar-banco.sh backups/emprestimos-20261009-030000.sql.gz
```

Restaure num ambiente à parte de tempos em tempos: backup que nunca foi restaurado é só uma esperança.

## 5. Atualizar

```bash
git pull
docker compose up -d --build     # as migrations pendentes são aplicadas pelo serviço migrar
```

As migrations têm **pré-checagens**: se os dados antigos violarem uma regra nova (ex.: dois empréstimos ativos do mesmo equipamento), a migration para com uma mensagem explicando o que corrigir, sem alterar nada.

## 6. Monitoramento

- **`GET /saude`** (pública, sem limite de requisições): API e banco no ar. Usada no *healthcheck* do Docker.
- **Alerta de queda:** `scripts/monitorar-saude.sh` confere `/saude` e avisa por webhook (Slack, Discord, Teams) quando a aplicação cai e quando volta, sem repetir o alerta a cada minuto. Agende no cron do servidor: `* * * * *  URL=https://seu-dominio ALERTA_WEBHOOK=https://... /caminho/scripts/monitorar-saude.sh`. Como roda **de fora** do servidor, ele percebe também quando a máquina inteira cai.
- **Monitor no GitHub:** o workflow `monitor.yml` confere a aplicação a cada 15 minutos. Ligue-o criando o segredo `URL_PRODUCAO` (e, se quiser, `ALERTA_WEBHOOK`) em *Settings > Secrets and variables > Actions*; sem o segredo ele não faz nada.
- **Métricas:** defina `METRICAS_TOKEN` e leia `GET /metricas` com `Authorization: Bearer <token>` (formato Prometheus: Grafana, Datadog, Zabbix...). Traz o estado do banco, requisições por classe de status, tempo de resposta e indicadores do negócio (empréstimos ativos e atrasados, filas, equipamentos e usuários ativos). Sem o token, a rota fica desligada (404). Alerta sugerido: `emprestimo_db_up == 0` ou taxa de `status="5xx"` subindo.
- `docker compose logs -f api`: uma linha por requisição (método, rota, status, duração, id do usuário e `id=` da requisição), sem corpo nem tokens; erros inesperados com pilha.
- **ID de requisição:** toda resposta traz o cabeçalho `X-Request-Id` (o do cliente, se vier num formato seguro, ou um novo). Quando alguém reclamar de um erro, peça esse valor e procure-o no log.
- **Dependências:** o Dependabot abre um PR por semana por pasta; o CI roda `npm audit` (só dependências de produção) a cada push.

## 7. Lista de conferência antes de publicar

- [ ] `JWT_SECRET`, `DB_SENHA` e `ADMIN_SENHA` trocados e fortes.
- [ ] HTTPS ativo (**obrigatório**: o cookie da sessão é `Secure`) e `CORS_ORIGENS` com o domínio real.
- [ ] Decidiu se o **cadastro aberto** deve ficar ligado (`CADASTRO_PUBLICO`): com ele, qualquer pessoa com acesso à tela cria uma conta e pode pegar equipamentos emprestados.
- [ ] `APP_URL` com o endereço real e SMTP configurado: peça "esqueci minha senha" com uma conta de teste e confira que o e-mail chega e o link abre a tela certa.
- [ ] Banco **sem** porta publicada (o compose já não publica).
- [ ] Backup agendado e restauração testada.
- [ ] `docker compose ps` mostrando a API como *healthy*.
- [ ] `/docs` retornando 404 (Swagger desligado).
