# Progresso do projeto

Checklist do que já foi feito e do que falta. Atualize ao concluir cada item.
Legenda: `[x]` feito e verificado · `[~]` feito, mas com parte **não verificada** (veja a nota) · `[ ]` a fazer.

## Como está hoje

| Parte | Situação |
|---|---|
| API (NestJS + PostgreSQL) | 101 testes unitários e 112 de integração passando; lint e tipos limpos |
| Interface (Angular) | 33 testes unitários + 54 testes de interface (Playwright); build de produção sem erros |
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
- [x] Barra **fixa no topo** de todas as telas (continua visível ao rolar): tamanho do texto, alto contraste, modo escuro/claro, fonte para dislexia, reduzir animações e **daltonismo** (botão compacto que abre um menu com Nenhum, Protanopia, Deuteranopia, Tritanopia e Acromatopsia; cada tipo tem a sua paleta)
- [x] **VLibras** no canto direito da tela, como nos sites do governo (sempre carregado, fora da barra). O avatar 3D aparece (visto em captura de tela). *A tradução de um texto em si não foi exercitada. O script vem de `vlibras.gov.br` em toda visita: se isso for um problema de privacidade, o VLibras precisa ser desligável.*
- [x] Gráficos que não dependem só da cor (linha tracejada, legenda com números, tabela alternativa)
- [x] Preferências salvas no navegador

### Sessão em cookie HttpOnly
- [x] O token de renovação vai num **cookie `HttpOnly`**, `SameSite=Strict`, `Secure` em produção e com caminho restrito: o JavaScript da página **não o enxerga** (antes ficava no `localStorage`)
- [x] Não aparece no corpo das respostas; renovar e sair pelo cookie exigem um cabeçalho anti-CSRF; clientes de API pedem o token com `X-Tipo-Cliente: api`
- [x] Funciona atrás do nginx (reescrita do caminho do cookie) e no servidor de desenvolvimento do Angular
- [x] Testado: 7 testes de integração, 3 unitários no front, 2 de interface (cookie `HttpOnly`, sem token no armazenamento) e a suíte inteira contra a stack de produção do Docker

### Segurança da interface
- [x] **CSP em modo bloqueio** no nginx: scripts só do próprio site e do VLibras, **nenhum script inline**. As origens do VLibras foram medidas no navegador (e ele redireciona arquivos para `cdn.jsdelivr.net`)
- [x] Build de produção sem CSS crítico inline (o Angular injetava um script inline para isso)
- [x] Validado de verdade: zero violações usando o app inteiro, e a suíte de interface passa contra a versão em bloqueio (inclusive o VLibras, com o avatar 3D renderizando)
- [~] *`style-src` ainda aceita `'unsafe-inline'`: o Angular injeta os estilos dos componentes em tempo de execução. Fechar isso exige um nonce por requisição (nginx + Angular).*

### Testes de interface (Playwright)
- [x] 41 testes em navegador de verdade: login e sessão, fluxo completo de empréstimo, recuperação de senha por e-mail, cadastro, perfil (avatar, CPF, baixar e excluir dados), barra de acessibilidade e dashboard
- [x] Job `interface` no CI: sobe a aplicação inteira no Docker (com o Mailpit) e roda a suíte
- [x] Já pegaram um defeito real: abrir `/login` com sessão salva mostrava o formulário em vez de ir ao dashboard (corrigido)
- [~] *O job do CI foi ensaiado localmente contra a stack do Docker (30 passaram, 1 pulado), mas só roda de verdade no GitHub depois do push. O teste do VLibras fica fora do CI (depende de serviço externo).*

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

### Busca por texto nas listagens
- [x] **Equipamentos:** nome ou descrição · **Usuários:** nome ou e-mail · **Empréstimos:** equipamento (e, para o administrador, também pessoa por nome ou e-mail) · **Auditoria:** quem fez ou o número do registro
- [x] A pesquisa roda **enquanto se digita** (com uma pequena pausa), combina com os outros filtros e o botão "Buscar" continua funcionando

### Gestão de contas
- [x] **Busca** por nome ou e-mail na lista de usuários (combina com os filtros de perfil e situação)
- [x] **E-mail de aviso** quando um administrador cria uma conta (a senha nunca vai no e-mail)
- [x] **Tela de cadastro aberto** ("Criar conta") com um interruptor (`CADASTRO_PUBLICO`) para quem prefere que só administradores criem contas

### Auditoria
- [x] Trilha de quem fez o quê e quando: contas, papéis, acervo, devolução por administrador, senhas, e-mail e sessões suspeitas
- [x] Tela "Auditoria" (administrador), com filtro por ação e paginação
- [x] Não registra segredos nem operações que falharam
- [~] *Não é à prova de adulteração (acesso direto ao banco altera). Não registra leituras de dados pessoais.*

### Fila de espera, renovação e QR code
- [x] **Renovação de prazo:** a pessoa (ou um administrador) soma 7 dias (1 a 14 pela API), no máximo 2 vezes e só antes de vencer. A regra está dentro do `UPDATE`, então renovações simultâneas nunca passam do limite; os avisos por e-mail do prazo antigo são zerados; entra na auditoria ("Prazo renovado")
- [x] **Fila de espera:** quem quer um equipamento emprestado entra na fila (índice único parcial: uma vez por pessoa, mesmo com cliques simultâneos). Ao devolver, o primeiro da fila recebe e-mail; quem pega o equipamento sai da fila; excluir a conta cancela as filas. A tela mostra "Minhas filas de espera" com a posição
- [x] **QR code:** o administrador gera uma etiqueta imprimível por equipamento; o QR abre a lista já filtrada pelo código (`/equipamentos?busca=CÓDIGO`)
- [~] *A fila avisa, mas **não reserva** o item: quem pegar primeiro leva. Reserva com prazo para retirar é uma decisão de regra de negócio que ainda não foi tomada.*

### Relatórios, códigos e validações
- [x] Relatório em PDF, Excel e CSV também para **empréstimos** (todos para o administrador, só os seus para as demais pessoas) e **equipamentos**, com os mesmos filtros da tela e aviso quando passa de 5000 linhas
- [x] **Código público** aleatório (12 caracteres) em empréstimos, equipamentos e usuários; as telas mostram no máximo 5 caracteres, o resto fica no tooltip. O número sequencial deixou de aparecer
- [x] Mensagens de validação **por campo** (qual regra falhou) e lista de requisitos da senha em tempo real; **SweetAlert2** para confirmações (desativar, devolver, renovar, tornar administrador, excluir conta) e avisos
- [x] Aviso de **cookies** a cada carregamento (aceitar, recusar ou configurar): sem permissão, as preferências de acessibilidade não são guardadas e o VLibras (serviço do governo) não é carregado
- [x] Acervo de avatares ampliado (29 animais)

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
- [ ] **LGPD (o que sobrou):** política de privacidade, registro de consentimento, prazos de retenção e criptografia do CPF em repouso. Dependem de revisão jurídica

### Prioridade média
- [ ] Reserva **com prazo para retirar** (hoje a fila só avisa); aprovação de renovação pelo administrador
- [ ] Categorias, número de patrimônio e foto do equipamento
- [ ] Relatórios também do dashboard
- [ ] Avatar em armazenamento de objetos (hoje vai em base64 no banco e em cada listagem)
- [ ] Gerar o cliente TypeScript do frontend a partir do OpenAPI (os tipos hoje são escritos à mão e podem divergir)
- [ ] Limite de requisições em armazenamento compartilhado (Redis), se houver mais de uma instância

### Operação
- [x] Backup e restauração do PostgreSQL em scripts testados (`scripts/`); falta **agendar** no servidor e copiar para fora dele
- [x] ID de requisição (`X-Request-Id`) no log e no cabeçalho; Dependabot semanal e `npm audit` no CI (o backend barra só o crítico: há 4 avisos "altos" em dependências indiretas da CLI do Prisma, anotados no `ci.yml`)
- [ ] Métricas e alerta quando `/saude` falha (precisa de um serviço externo de monitoramento)
- [ ] Separar a aplicação das migrações no deploy de produção
- [ ] Revisar periodicamente os riscos aceitos em [`seguranca.md`](seguranca.md)

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

- Os **dados de demonstração** têm a mesma senha para todas as contas `@equipmentloan.com`. Nunca rode `seed:demo` em produção (ele se recusa).
- Antes de publicar, siga a lista de conferência no fim de [`deploy.md`](deploy.md): `JWT_SECRET`, `APP_URL`, SMTP, HTTPS e `TRUST_PROXY` corretos.
- O servidor de desenvolvimento do Angular só lê o `angular.json` ao iniciar e pode travar num erro de build do meio de uma edição: se uma página nova não aparece, reinicie-o.
