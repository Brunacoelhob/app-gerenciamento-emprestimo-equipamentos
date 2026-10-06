#!/bin/sh
# Roda DENTRO do container "backup" do docker-compose: uma cópia do banco por dia, no horário BACKUP_HORA, com rodízio.
# Os arquivos vão para /backups (no compose, a pasta BACKUP_PASTA do servidor). Para restaurar, use
# scripts/restaurar-banco.sh. Copie essa pasta para FORA do servidor (rclone, rsync, nuvem): backup só na mesma
# máquina não protege contra a perda dela.
set -eu

HORA="${BACKUP_HORA:-03:00}"               # HH:MM, no fuso do container (TZ)
MANTER_DIAS="${BACKUP_MANTER_DIAS:-14}"
DESTINO=/backups
# Opcional: um endereço que recebe um GET quando o backup dá certo (ex.: healthchecks.io). Se o aviso parar de
# chegar, é porque o backup parou.
AVISO_OK="${BACKUP_AVISO_OK:-}"

fazer_backup() {
  arquivo="$DESTINO/emprestimos-$(date +%Y%m%d-%H%M%S).sql.gz"
  # --clean --if-exists: o arquivo restaura por cima de um banco que já existe
  if pg_dump --no-owner --clean --if-exists | gzip > "$arquivo.parcial" && [ "$(wc -c < "$arquivo.parcial")" -gt 500 ]; then
    mv "$arquivo.parcial" "$arquivo"
    find "$DESTINO" -name 'emprestimos-*.sql.gz' -mtime +"$MANTER_DIAS" -delete
    echo "$(date '+%F %T') backup salvo: $arquivo ($(wc -c < "$arquivo") bytes)"
    [ -z "$AVISO_OK" ] || wget -q -O /dev/null -T 10 "$AVISO_OK" || true
  else
    rm -f "$arquivo.parcial"
    echo "$(date '+%F %T') FALHA no backup" >&2
  fi
}

segundos_ate_a_hora() {
  agora=$(date +%s)
  alvo=$(date -d "$(date +%F) $HORA" +%s 2>/dev/null || date -d "@$agora" +%s)
  [ "$alvo" -gt "$agora" ] || alvo=$((alvo + 86400))
  echo $((alvo - agora))
}

mkdir -p "$DESTINO"
[ "${BACKUP_AO_INICIAR:-false}" != "true" ] || fazer_backup
while true; do
  espera=$(segundos_ate_a_hora)
  echo "$(date '+%F %T') próximo backup às $HORA (em ${espera}s)"
  sleep "$espera"
  fazer_backup
done
