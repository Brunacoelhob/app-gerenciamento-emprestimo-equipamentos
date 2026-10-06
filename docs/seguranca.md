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
- **Sessão em cookie `HttpOnly`:** o refresh token vai num cookie `HttpOnly` (o JavaScript da página **não** o enxerga: um XSS não o rouba), `SameSite=Strict`, `Secure` em produção e com `Path` restrito às rotas de autenticação (não viaja com cada chamada). Ele não aparece no corpo da resposta nem no `localStorage` (lá só há um indicador). Renovar e sair pelo cookie exigem o cabeçalho `X-Requested-With: emprestimos` (segunda barreira contra CSRF, além do `SameSite`). Clientes que não são navegadores pedem o token no corpo com `X-Tipo-Cliente: api`.
- **Refresh token:** aleatório (48 bytes), guardado só como **SHA-256**; uso único (rotação); **reuso de um token já usado derruba todas as sessões** da pessoa; revogação atômica (dois pedidos simultâneos nunca vencem os dois).
- Troca de senha e desativação de conta encerram todas as sessões.
- **Recuperação de senha por e-mail:** o link carrega um token aleatório (32 bytes) guardado só como **SHA-256**; vale **30 minutos**, é de **uso único** (consumo atômico: dois cliques simultâneos nunca vencem os dois) e um pedido novo invalida o anterior. A resposta de "esqueci minha senha" é **idêntica** exista a conta ou não, e o envio roda em segundo plano (o tempo não revela nada). No máximo 3 pedidos por hora por conta e 5 por IP. Redefinir **encerra todas as sessões** e avisa a pessoa por e-mail. Em produção, sem SMTP o e-mail não é enviado e o conteúdo (que equivale a uma credencial) **nunca vai para o log**. O front-end remove o token do endereço assim que a página abre.
- JWT com algoritmo fixado (`HS256`) e `JWT_SECRET` obrigatório de 32+ caracteres (o valor de exemplo é recusado na partida).

**Autorização**
- **Seguro por padrão:** o guard de JWT é global; uma rota nova esquecida fica protegida. Rotas públicas precisam de `@Publica()` explícito.
- O usuário vem do token (`@CurrentUser`), nunca de um id enviado pelo cliente: não existe "retirar em nome de outra pessoa" (campo desconhecido = `400`).
- Admin não rebaixa nem desativa a própria conta; o sistema nunca fica sem administrador ativo.

**Entrada e saída**
- Validação rígida: campos desconhecidos recusados, tipos convertidos, limites de tamanho, paginação máxima de 100.
- SQL parametrizado (Prisma); o único SQL escrito à mão usa parâmetros do próprio Prisma.
- Erros inesperados devolvem mensagem genérica (o detalhe e a pilha vão só para o log). O log de requisições **nunca** registra corpo, cabeçalhos nem tokens.
- Cabeçalhos de segurança com Helmet na API; `x-powered-by` removido. Na interface (nginx): **CSP em bloqueio** (scripts só do próprio site e do VLibras, sem script inline), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` e `Permissions-Policy`.

**Privacidade (LGPD)**
- **Minimização:** nas rotas de administrador, CPF e telefone saem **mascarados** (`***.***.***-25`, `(11) *****-4321`) e o endereço de rua não é enviado (só cidade e UF). A pessoa vê tudo apenas no próprio perfil.
- **Acesso e portabilidade:** `GET /v1/auth/eu/dados` entrega um JSON com perfil, empréstimos e ações registradas (sem a senha), e a tela de perfil tem o botão "Baixar meus dados".
- **Exclusão:** `POST /v1/auth/eu/anonimizar` (exige a senha) apaga nome, e-mail, CPF, telefone, endereço e avatar, derruba todas as sessões, remove o nome da trilha de auditoria e libera o e-mail e o CPF para uso futuro. O histórico de empréstimos permanece como "Usuário removido". É recusada com equipamentos emprestados e para o último administrador ativo.
- **Política e consentimento:** a página `/privacidade` descreve o que é coletado e para quê; o cadastro aberto exige o aceite e guarda quando e qual versão (`politicaAceitaEm`/`politicaVersao`, também no "Baixar meus dados").
- **Não coberto (precisa de decisão jurídica):** o texto definitivo da política (controlador, encarregado, bases legais, provedor de e-mail), prazos de retenção e a criptografia do CPF em repouso. Os trechos pendentes aparecem destacados na própria página.

**Auditoria**
- **Trilha de auditoria** (`GET /v1/auditoria`, só ADMIN, e a tela "Auditoria"): registra quem criou conta, mudou papel, desativou ou reativou conta, cadastrou, editou ou desativou equipamento, devolveu o empréstimo de outra pessoa, trocou ou redefiniu senha, trocou e-mail e quando um refresh token já usado reapareceu (possível roubo de acesso). Guarda o nome de quem agiu junto, então o registro continua legível se a conta for anonimizada. **Senhas e tokens nunca entram na trilha**, e uma operação que falha (409, 403...) não gera registro.
- A gravação é "melhor esforço": se falhar, a ação do usuário não é desfeita (o erro vai para o log). Não é uma trilha à prova de adulteração: quem tem acesso direto ao banco consegue alterá-la.

**Operação**
- Limite de requisições: 100/min por IP, mais rígido no login (5/min), cadastro (10/h), troca de senha (5/min) e recuperação de senha (5 pedidos/h).
- **ID de requisição** (`X-Request-Id`, aceito do cliente só num formato seguro) em toda resposta e no log, para rastrear um erro relatado por quem usa.
- **Cookies e terceiros:** o aviso de cookies aparece a cada carregamento; sem a permissão, as preferências de acessibilidade não vão para o aparelho e o VLibras (serviço externo que vê o IP) não é carregado. O cookie de sessão (`HttpOnly`) é **necessário** e não depende dessa escolha.
- **Foto do equipamento:** o envio é só do ADMIN, vale só image/png, jpeg e webp, é conferido pelos bytes (SVG e HTML disfarçados são recusados) e limitado a 400 KB. A leitura é pública por escolha: o `<img>` do navegador não envia o token, o código tem 12 caracteres aleatórios e a imagem é só a foto do objeto.
- **Métricas:** `GET /metricas` só existe com `METRICAS_TOKEN` definido (senão 404); o token é comparado em tempo constante. Não expõe dados pessoais, só contagens.
- **Relatórios:** células que começam com `=`, `+`, `-` ou `@` são neutralizadas (injeção de fórmula no Excel); um relatório de auditoria exportado fica registrado na própria trilha; as rotas pesadas têm limite de 10 por minuto.
- Container sem root, `no-new-privileges`, banco **sem porta exposta** fora do Docker, API publicada só em `127.0.0.1`.
- Segredos só no `.env` (no `.gitignore`); nenhum valor real em `.env.example`.

## Riscos aceitos

| Risco | Por que foi aceito |
|---|---|
| Quem tem XSS ainda age com a sessão da vítima enquanto a página estiver aberta (usa o token de acesso em memória, que dura 15 min) | O cookie `HttpOnly` impede o **roubo** do acesso de longa duração, mas não o abuso em tempo real dentro da página. A defesa é a CSP em bloqueio (sem script inline) e o Angular escapar tudo por padrão |
| `npm audit` aponta 6 vulnerabilidades (4 altas) em `prisma`/`@prisma/config`/`deepmerge-ts`/`mysql2` e 2 moderadas em `@nestjs/swagger`/`js-yaml` | As quatro primeiras estão no **CLI do Prisma**, que o `@prisma/client` 7 traz como dependência par; o CLI só roda em build e migração, **nunca no tratamento de requisições**, e `mysql2` não é usado com PostgreSQL. A "correção" automática seria rebaixar o Prisma para a versão 6 (mudança incompatível). As do Swagger não atingem produção, onde ele fica desligado. Reavaliar a cada atualização do Prisma e do `@nestjs/swagger` |
| O e-mail de redefinição fica na caixa de entrada de quem o recebe | Quem controla a caixa de e-mail controla a conta: é a premissa de qualquer recuperação por e-mail. Mitigado pela validade curta, pelo uso único, pelo encerramento das sessões e pelo e-mail de aviso depois da troca |
| Pequena diferença de tempo entre "e-mail existe" e "não existe" no pedido de recuperação | A resposta é idêntica e o e-mail sai em segundo plano, mas só o caso "existe" grava no banco. Mitigado pelo limite por IP (5/h); para eliminar de vez, enfileirar o pedido |
| Limite de requisições em memória (por processo) | Suficiente para uma instância. Com várias réplicas, usar armazenamento compartilhado (Redis) |
| Uma consulta ao banco por requisição autenticada | É o preço de o papel e a conta valerem na hora. Consulta por chave primária |
| Dois administradores se rebaixando exatamente ao mesmo tempo poderiam zerar os administradores | A checagem do "último administrador" não é transacional. Cenário raro e que exige dois admins agindo no mesmo instante; mitigado pelo seed (recria o admin) |

## Reportar uma vulnerabilidade

Abra uma *issue* privada no repositório (aba *Security*) ou contate a autora. Não publique detalhes antes da correção.
