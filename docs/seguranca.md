# Segurança

Este documento registra a **auditoria** feita no projeto, o que foi encontrado, como foi **comprovado**, como foi corrigido e quais riscos foram conscientemente aceitos.

## Auditoria: o que foi encontrado

As falhas críticas foram **reproduzidas rodando a API original** contra um banco descartável, não apenas lidas no código.

| # | Severidade | Falha | Prova |
|---|---|---|---|
| 1 | Crítica | **Qualquer pessoa virava ADMIN:** o cadastro público aceitava o campo `role` | Um usuário anônimo cadastrou-se com `role: "ADMIN"` e cadastrou equipamentos em seguida |
| 2 | Crítica | **O mesmo equipamento era emprestado a várias pessoas** (condição de corrida entre checar e gravar) | 30 retiradas simultâneas do mesmo item: **19 aceitas** |
| 3 | Crítica | **Devolução duplicada** | 5 devoluções simultâneas do mesmo empréstimo: **200 nas cinco** |
| 4 | Crítica | **Administrador padrão com senha fixa** (`admin123`), publicada no README | Leitura do seed e do README |
| 5 | Alta | Dependências com vulnerabilidades (`multer`, entre outras) | `npm audit`: 8 (6 altas) |
| 6 | Alta | Cadastro sem limite de requisições; e-mail sem normalização (`A@x.com` ≠ `a@x.com`); senha de 6 caracteres sem máximo | Leitura do código |
| 7 | Alta | Token de 1 dia com o papel dentro; sem conceito de conta desativada | Leitura do código |
| 8 | Alta | CORS aberto para qualquer origem; Swagger sempre ligado | Leitura do código |
| 9 | Alta | Testes de integração rodavam no mesmo banco do desenvolvimento e **documentavam a falha 1 como funcionalidade** | Leitura dos testes |
| 10 | Média | Paginação instável (sem `orderBy`), sem total; filtros inválidos ignorados em silêncio; estado `emprestado` duplicado | Leitura do código |

## O que foi corrigido

| # | Correção | Onde |
|---|---|---|
| 1 | O DTO de cadastro **não tem** `role`; com `forbidNonWhitelisted`, enviá-lo dá `400`. Administrador só é criado por outro ADMIN (`POST /v1/usuarios`) | `auth/dto/registrar-usuario.dto.ts` |
| 2, 3 | Trava de linha + **índice único parcial** no banco; devolução com `UPDATE` condicional. **30 retiradas simultâneas: 1 sucesso, 29 conflitos** | `emprestimos.repository.ts`, migration `seguranca_e_integridade` |
| 4 | O seed exige `ADMIN_EMAIL` e `ADMIN_SENHA` do ambiente (12+ caracteres) e nunca imprime a senha | `prisma/seed.ts` |
| 5 | `npm audit fix` (o alerta do `multer` foi resolvido); o restante está em *Riscos aceitos* | `package.json` |
| 6 | Limite de 10 cadastros/hora e 5 logins/min por IP; e-mail normalizado + `CHECK` no banco; senha 8 a 72 com letra e número | `auth.controller.ts`, `senha-forte.decorator.ts` |
| 7 | Access token de 15 min; **papel e situação lidos do banco a cada requisição**; refresh token rotativo | `jwt.strategy.ts`, `auth.service.ts` |
| 8 | CORS por lista (`CORS_ORIGENS`, vazio = nenhuma origem); Swagger desligado em produção | `configurar-app.ts`, `config/variaveis.ts` |
| 9 | Testes em banco exclusivo (recusa nomes sem `test`); a falha 1 virou um teste que **precisa** falhar | `test/` |
| 10 | `orderBy` fixo, metadados de paginação, filtros validados (inválido = `400`), `emprestado` derivado | `common/dto`, repositórios |

## Controles em vigor

**Identidade e sessão**
- Senhas com **bcrypt** (custo configurável, padrão 12); o hash nunca sai da camada de repositório (as consultas públicas nem selecionam o campo).
- Resposta de login **idêntica** para e-mail inexistente, senha errada e conta desativada, e comparação com um hash falso quando o e-mail não existe (tempo de resposta parecido): não revela quais e-mails existem.
- **Refresh token:** aleatório (48 bytes), guardado só como **SHA-256**; uso único (rotação); **reuso de um token já usado derruba todas as sessões** da pessoa; revogação atômica (dois pedidos simultâneos nunca vencem os dois).
- Troca de senha e desativação de conta encerram todas as sessões.
- JWT com algoritmo fixado (`HS256`) e `JWT_SECRET` obrigatório de 32+ caracteres (o valor de exemplo é recusado na partida).

**Autorização**
- **Seguro por padrão:** o guard de JWT é global; uma rota nova esquecida fica protegida. Rotas públicas precisam de `@Publica()` explícito.
- O usuário vem do token (`@CurrentUser`), nunca de um id enviado pelo cliente: não existe "retirar em nome de outra pessoa" (campo desconhecido = `400`).
- Admin não rebaixa nem desativa a própria conta; o sistema nunca fica sem administrador ativo.

**Entrada e saída**
- Validação rígida: campos desconhecidos recusados, tipos convertidos, limites de tamanho, paginação máxima de 100.
- SQL parametrizado (Prisma); o único SQL escrito à mão usa parâmetros do próprio Prisma.
- Erros inesperados devolvem mensagem genérica (o detalhe e a pilha vão só para o log). O log de requisições **nunca** registra corpo, cabeçalhos nem tokens.
- Cabeçalhos de segurança com Helmet; `x-powered-by` removido.

**Operação**
- Limite de requisições: 100/min por IP, mais rígido no login (5/min), cadastro (10/h) e troca de senha (5/min).
- Container sem root, `no-new-privileges`, banco **sem porta exposta** fora do Docker, API publicada só em `127.0.0.1`.
- Segredos só no `.env` (no `.gitignore`); nenhum valor real em `.env.example`.

## Riscos aceitos

| Risco | Por que foi aceito |
|---|---|
| `npm audit` aponta 6 vulnerabilidades (4 altas) em `prisma`/`@prisma/config`/`deepmerge-ts`/`mysql2` e 2 moderadas em `@nestjs/swagger`/`js-yaml` | As quatro primeiras estão no **CLI do Prisma**, que o `@prisma/client` 7 traz como dependência par; o CLI só roda em build e migração, **nunca no tratamento de requisições**, e `mysql2` não é usado com PostgreSQL. A "correção" automática seria rebaixar o Prisma para a versão 6 (mudança incompatível). As do Swagger não atingem produção, onde ele fica desligado. Reavaliar a cada atualização do Prisma e do `@nestjs/swagger` |
| Limite de requisições em memória (por processo) | Suficiente para uma instância. Com várias réplicas, usar armazenamento compartilhado (Redis) |
| Uma consulta ao banco por requisição autenticada | É o preço de o papel e a conta valerem na hora. Consulta por chave primária |
| Dois administradores se rebaixando exatamente ao mesmo tempo poderiam zerar os administradores | A checagem do "último administrador" não é transacional. Cenário raro e que exige dois admins agindo no mesmo instante; mitigado pelo seed (recria o admin) |

## Reportar uma vulnerabilidade

Abra uma *issue* privada no repositório (aba *Security*) ou contate a autora. Não publique detalhes antes da correção.
