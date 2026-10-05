# Testes de interface (Playwright)

Rodam o sistema inteiro de verdade: navegador, interface, API e banco. Cobrem login e sessão, o fluxo de empréstimo
(do cadastro ao devolver), recuperação de senha por e-mail, cadastro, perfil (avatar, CPF, baixar e excluir dados),
barra de acessibilidade e dashboard.

## Como rodar

1. Suba a aplicação (`docker compose --profile dev up -d --build`, ou a API e o front em modo de desenvolvimento) com
   **limites de requisição altos**, senão o limite de 5 logins por minuto derruba a suíte:

   ```bash
   LIMITE_LOGIN_POR_MINUTO=100000 LIMITE_GERAL_POR_MINUTO=100000 LIMITE_CADASTRO_POR_HORA=100000 \
   LIMITE_RECUPERACAO_POR_HORA=100000 LIMITE_REDEFINICAO_POR_HORA=100000 ...
   ```

2. Rode:

   ```bash
   cd e2e
   npm install
   npx playwright install chromium        # ou use o Chrome da máquina com E2E_NAVEGADOR=chrome
   E2E_URL=http://localhost:8080 E2E_ADMIN_EMAIL=... E2E_ADMIN_SENHA=... E2E_MAILPIT=http://localhost:8025 npx playwright test
   ```

| Variável | O que é |
|---|---|
| `E2E_URL` | Endereço da interface (padrão `http://localhost:4725`) |
| `E2E_ADMIN_EMAIL`, `E2E_ADMIN_SENHA` | O administrador inicial |
| `E2E_MAILPIT` | Caixa de entrada de teste. Sem ela, os testes de e-mail são pulados |
| `E2E_NAVEGADOR` | `chrome` usa o Chrome instalado; vazio usa o Chromium do Playwright |
| `E2E_SEM_INTERNET` | Pula o teste do VLibras (depende de um serviço do governo) |

> **Nunca rode contra um ambiente de produção real**: os testes criam contas e equipamentos (com nomes únicos por
> execução) e deixam esses dados no banco. Para depurar uma falha: `npx playwright show-report`.
