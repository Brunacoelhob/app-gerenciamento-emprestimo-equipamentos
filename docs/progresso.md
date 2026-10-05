# Progresso do projeto

Checklist do que já foi feito e do que falta. Atualize ao concluir cada item.
Legenda: `[x]` feito e verificado · `[~]` feito, mas com parte **não verificada** (veja a nota) · `[ ]` a fazer.

## Como está hoje

| Parte | Situação |
|---|---|
| API (NestJS + PostgreSQL) | 60 testes unitários e 81 de integração passando; lint e tipos limpos |
| Interface (Angular) | 19 testes passando; build de produção sem erros |
| Docker | `docker compose` sobe banco, migrações, API e interface (nginx); o CI constrói e confere a saúde |
| CI (GitHub Actions) | Backend, frontend e Docker |

---

## O que foi feito

### Base da API
- [x] Cadastro, login, **refresh token rotativo** com detecção de reuso, troca e saída de sessão
- [x] Dois papéis (`USER`, `ADMIN`); papel e situação da conta lidos do banco a cada requisição
- [x] Equipamentos (cadastro, edição, desativação, busca) e empréstimos (retirada, devolução, prazo, atraso)
- [x] **Integridade sob concorrência:** nunca dois empréstimos ativos do mesmo equipamento (índice único parcial no banco)
- [x] Listagens paginadas com metadados e filtros validados
- [x] Swagger em `/docs` (desligado em produção), rota de saúde `/saude`
- [x] Limite de requisições por IP, cabeçalhos de segurança (Helmet), CORS por lista
- [x] Auditoria de segurança documentada em [`seguranca.md`](seguranca.md)

### Organização e operação
- [x] Repositório separado em `backend/` e `frontend/`
- [x] Docker Compose com banco (sem porta exposta), migrações, API e **interface web servida por nginx**
- [x] `TRUST_PROXY`: o limite de login vale por pessoa mesmo atrás do nginx
- [x] CI: lint, tipos, testes unitários e de integração, build, e a stack inteira no Docker
- [x] Guia de publicação em servidor ([`deploy.md`](deploy.md))

### Interface
- [x] Login e sessão (renovação automática do token, uma única chamada compartilhada)
- [x] **Menu lateral** com o perfil, e botão **Voltar** nas páginas internas
- [x] **Dashboard** com 8 indicadores, gráfico de linhas, rosca, rankings e atrasos, e seletor de período (7 a 90 dias)
- [x] **Janela informativa** em cada card e em cada gráfico (o que significa, como é calculado, o que fazer)
- [x] Equipamentos (busca, filtros, pegar emprestado; administrador cadastra, edita, desativa)
- [x] Empréstimos (meus e todos, devolver)
- [x] **Perfil:** avatar do acervo de bichinhos ou foto enviada, dados pessoais (CPF, telefone, endereço com preenchimento pelo CEP) e troca de senha
- [x] **Usuários (administrador):** criar contas e perfis, tornar admin, desativar, reativar
- [x] Novo favicon
- [x] Dados de demonstração (`npm run seed:demo`, ~85 dias de histórico, com atrasos)

### Acessibilidade
- [x] Barra no topo de todas as telas, com os botões lado a lado: tamanho do texto, alto contraste, modo escuro/claro, fonte para dislexia, cores para daltonismo, reduzir animações
- [~] **VLibras** (tradução para Libras) acionado pela barra. *O painel do plugin abre e fecha, mas o avatar 3D traduzindo não foi visto (o teste automatizado não tem aceleração gráfica).*
- [x] Gráficos que não dependem só da cor (linha tracejada, legenda com números, tabela alternativa)
- [x] Preferências salvas no navegador

### Avisos por e-mail (vencimento e atraso)
- [x] Rotina diária (cron configurável, fuso de São Paulo): lembrete 24h antes do prazo, cobrança de atraso a cada 3 dias e resumo para os administradores
- [x] Cada aviso sai uma vez só, mesmo com várias instâncias da API (a gravação condicional decide quem envia)
- [x] Conta desativada não recebe; falha de SMTP não derruba a rotina
- [x] `POST /v1/notificacoes/executar` (administrador) roda na hora
- [~] *Verificado com os dados de demonstração e o Mailpit; o agendador no horário real (8h) só foi conferido pelo log, não esperei o relógio.*

### Privacidade (LGPD)
- [x] CPF e telefone **mascarados** para administradores; endereço de rua não é enviado a eles
- [x] **Baixar meus dados** (JSON: perfil, empréstimos, ações) no perfil
- [x] **Excluir minha conta** (anonimização com confirmação por senha): apaga os dados pessoais, derruba as sessões, limpa o nome da trilha e **preserva o histórico** de empréstimos
- [~] *Falta o que depende de decisão jurídica: política de privacidade, registro de consentimento e prazos de retenção. O CPF continua guardado em texto puro (sem criptografia em repouso).*

### Gestão de contas
- [x] **Busca** por nome ou e-mail na lista de usuários (combina com os filtros de perfil e situação)
- [x] **E-mail de aviso** quando um administrador cria uma conta (a senha nunca vai no e-mail)
- [x] **Tela de cadastro aberto** ("Criar conta") com um interruptor (`CADASTRO_PUBLICO`) para quem prefere que só administradores criem contas

### Auditoria
- [x] Trilha de quem fez o quê e quando: contas, papéis, acervo, devolução por administrador, senhas, e-mail e sessões suspeitas
- [x] Tela "Auditoria" (administrador), com filtro por ação e paginação
- [x] Não registra segredos nem operações que falharam
- [~] *Não é à prova de adulteração (acesso direto ao banco altera). Não registra leituras de dados pessoais.*

### Recuperação de senha por e-mail
- [x] "Esqueci minha senha" e "Redefinir senha" (telas e API)
- [x] Link de **uso único**, validade de **30 minutos**, só o **hash** do token é guardado
- [x] Resposta **idêntica** para e-mail existente ou não (não revela quem tem conta)
- [x] Limite de 3 pedidos/hora por conta e 5/hora por IP; um pedido novo invalida o anterior
- [x] Redefinir **encerra todas as sessões** e avisa a pessoa por e-mail
- [x] Envio por SMTP genérico; em desenvolvimento, caixa de entrada de teste (Mailpit) sem enviar nada de verdade
- [x] Em produção, sem SMTP o conteúdo do e-mail **nunca** vai para o log
- [~] *Testado de ponta a ponta com Mailpit (SMTP real, pela interface). **Não** foi testado com um provedor real nem o visual do e-mail em clientes de e-mail (Gmail, Outlook).*

---

## O que falta

### Prioridade alta
- [ ] **Testes de interface (Playwright):** login, pegar emprestado, devolver, recuperar senha, trocar perfil. Hoje esses fluxos só foram conferidos manualmente
- [ ] **Refresh token em cookie `HttpOnly`** (hoje fica no `localStorage`: um XSS o rouba)
- [ ] **CSP em modo bloqueio:** hoje está em "somente relatório" no nginx, porque o VLibras precisa de permissões ainda não mapeadas
- [ ] **LGPD (o que sobrou):** política de privacidade, registro de consentimento, prazos de retenção e criptografia do CPF em repouso. Dependem de revisão jurídica

### Prioridade média
- [ ] Reserva de equipamento e fila de espera; renovação de prazo
- [ ] Categorias, número de patrimônio, foto do equipamento e QR code para retirada
- [ ] Relatórios com exportação CSV
- [ ] Avatar em armazenamento de objetos (hoje vai em base64 no banco e em cada listagem)
- [ ] Gerar o cliente TypeScript do frontend a partir do OpenAPI (os tipos hoje são escritos à mão e podem divergir)
- [ ] Limite de requisições em armazenamento compartilhado (Redis), se houver mais de uma instância

### Operação
- [ ] Logs estruturados, métricas e alerta quando `/saude` falha
- [ ] Backup do PostgreSQL agendado e restauração testada
- [ ] Separar a aplicação das migrações no deploy de produção
- [ ] Dependabot e `npm audit` na pipeline; revisar periodicamente os riscos aceitos em [`seguranca.md`](seguranca.md)

---

## O que ainda não foi verificado

Coisas que existem no código, mas que eu não consegui comprovar:

- [ ] Tradução real do **VLibras** (avatar 3D) num navegador comum
- [ ] Uso com **leitor de tela** (NVDA, VoiceOver) e **navegação só por teclado** em todas as telas
- [ ] Layout em **celular de verdade**: só foi visto em tamanho reduzido no navegador de teste, sem rolagem lateral
- [ ] Envio de e-mail por um **provedor SMTP real** (Mailpit foi o único testado)
- [ ] Comportamento do tooltip do gráfico em **telas sensíveis ao toque** (testado só com mouse)
- [ ] Desempenho do dashboard com **milhares** de empréstimos (as contas rodam no banco, mas só foi medido com ~120)

## Notas para quem for continuar

- Os **dados de demonstração** têm a mesma senha para todas as contas `@demo.exemplo.com`. Nunca rode `seed:demo` em produção (ele se recusa).
- Antes de publicar, siga a lista de conferência no fim de [`deploy.md`](deploy.md): `JWT_SECRET`, `APP_URL`, SMTP, HTTPS e `TRUST_PROXY` corretos.
- O servidor de desenvolvimento do Angular só lê o `angular.json` ao iniciar e pode travar num erro de build do meio de uma edição: se uma página nova não aparece, reinicie-o.
