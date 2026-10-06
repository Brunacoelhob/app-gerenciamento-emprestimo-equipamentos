#!/usr/bin/env sh
# Restaura um backup gerado por backup-banco.sh. APAGA os dados atuais do banco e os substitui pelos do arquivo.
#
# Uso: ./scripts/restaurar-banco.sh backups/emprestimos-20261009-030000.sql.gz
# Teste a restauração de tempos em tempos num ambiente à parte: backup que nunca foi restaurado é só uma esperança.
set -eu

ARQUIVO="${1:?Informe o arquivo de backup (.sql.gz)}"
SERVICO="${SERVICO_BANCO:-banco}"
[ -f "$ARQUIVO" ] || { echo "Arquivo não encontrado: $ARQUIVO" >&2; exit 1; }

printf 'Isto SUBSTITUI os dados atuais pelos de %s. Digite "restaurar" para continuar: ' "$ARQUIVO"
read -r RESPOSTA
[ "$RESPOSTA" = "restaurar" ] || { echo "Cancelado."; exit 1; }

gunzip -c "$ARQUIVO" | docker compose exec -T "$SERVICO" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'
echo "Restauração concluída."
