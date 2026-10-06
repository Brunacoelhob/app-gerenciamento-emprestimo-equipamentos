#!/usr/bin/env sh
# Backup do PostgreSQL da aplicação em Docker Compose: um arquivo .sql.gz por execução, com rodízio.
#
# Uso:    ./scripts/backup-banco.sh [pasta-de-destino]        (padrão: ./backups)
# Agende: 0 3 * * *  cd /caminho/do/projeto && ./scripts/backup-banco.sh /var/backups/emprestimos
# Guarde também uma cópia FORA do servidor: um backup na mesma máquina não protege contra a perda dela.
set -eu

DESTINO="${1:-./backups}"
MANTER_DIAS="${MANTER_DIAS:-14}"
SERVICO="${SERVICO_BANCO:-banco}"

mkdir -p "$DESTINO"
ARQUIVO="$DESTINO/emprestimos-$(date +%Y%m%d-%H%M%S).sql.gz"

# pg_dump roda DENTRO do container, com o usuário e o banco que o próprio container já conhece
docker compose exec -T "$SERVICO" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --clean --if-exists' \
  | gzip > "$ARQUIVO"

# Um arquivo vazio ou minúsculo quase sempre é falha: não deixa passar como backup bom
if [ "$(wc -c < "$ARQUIVO")" -lt 500 ]; then
  echo "Backup suspeito (arquivo muito pequeno): $ARQUIVO" >&2
  rm -f "$ARQUIVO"
  exit 1
fi

find "$DESTINO" -name 'emprestimos-*.sql.gz' -mtime +"$MANTER_DIAS" -delete
echo "Backup salvo em $ARQUIVO"
