#!/usr/bin/env sh
# Verifica /saude e AVISA quando a aplicação cai (e quando volta). Pensado para rodar a cada minuto no cron do
# servidor, ou em qualquer máquina que enxergue a aplicação.
#
# Uso:    URL=https://emprestimos.exemplo.com ALERTA_WEBHOOK=https://hooks.slack.com/... ./scripts/monitorar-saude.sh
# Cron:   * * * * *  URL=... ALERTA_WEBHOOK=... /caminho/scripts/monitorar-saude.sh
#
# ALERTA_WEBHOOK aceita Slack, Discord (acrescente /slack ao endereço do webhook) e Teams (workflows): é um POST JSON
# com {"text": "..."}. Sem ALERTA_WEBHOOK, o script só escreve na saída (e sai com erro, para o cron avisar por e-mail).
set -u

URL="${URL:?Informe a URL da aplicação, ex.: URL=https://emprestimos.exemplo.com}"
ESTADO="${ESTADO:-/tmp/monitor-emprestimos.estado}"   # lembra se já avisou, para não repetir o alerta a cada minuto
TENTATIVAS="${TENTATIVAS:-3}"                          # falha de rede de uma vez só não vira alarme falso

avisar() {
  echo "$1"
  [ -n "${ALERTA_WEBHOOK:-}" ] || return 0
  curl -fsS -m 10 -X POST -H 'Content-Type: application/json' -d "{\"text\": \"$1\"}" "$ALERTA_WEBHOOK" >/dev/null || true
}

ok=0
i=1
while [ "$i" -le "$TENTATIVAS" ]; do
  if curl -fsS -m 10 "$URL/api/saude" | grep -q '"status":"ok"'; then ok=1; break; fi
  i=$((i + 1)); sleep 5
done

if [ "$ok" = 1 ]; then
  if [ -f "$ESTADO" ]; then rm -f "$ESTADO"; avisar "✅ Equipment loan voltou ao ar ($URL)."; fi
  exit 0
fi

if [ ! -f "$ESTADO" ]; then date +%s > "$ESTADO"; avisar "🚨 Equipment loan FORA DO AR: $URL/api/saude não respondeu ok depois de $TENTATIVAS tentativas."; fi
exit 1
