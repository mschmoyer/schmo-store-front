#!/usr/bin/env bash
#
# Stand the whole stack up on a bare container: Postgres, schema, demo data.
#
#   scripts/setup-local-stack.sh            # everything that is missing
#   scripts/setup-local-stack.sh --fresh    # also re-seed demo data
#
# No Docker. Ubuntu images used by Claude Code on the web already ship the
# postgresql-16 server package with a cluster created and stopped, so the
# database is one `pg_ctlcluster` away — starting it takes about two seconds,
# which is the whole reason this script exists instead of a compose file.
#
# Every step is idempotent: the script is safe to run on every session start,
# and re-running it on a warm container is a no-op that costs a few seconds.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DB_NAME="${DB_NAME:-rebelshops}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"
DB_PORT="${DB_PORT:-5432}"
FRESH=""
[ "${1:-}" = "--fresh" ] && FRESH="--fresh"

step() { printf '\033[36m▸\033[0m %s\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }

#-----------------------------------------------------------------------------
# 1. Node dependencies
#-----------------------------------------------------------------------------
step 'Node dependencies'
if [ -d node_modules ] && [ -f node_modules/.package-lock.json ]; then
  ok 'already installed'
else
  # `npm ci` on a cold container; the result is baked into the cached image so
  # later sessions skip straight past this.
  npm ci --no-audit --no-fund >/dev/null
  ok 'installed'
fi

#-----------------------------------------------------------------------------
# 2. Postgres server
#-----------------------------------------------------------------------------
step 'Postgres'
if pg_isready -h 127.0.0.1 -p "$DB_PORT" -q 2>/dev/null; then
  ok "already accepting connections on ${DB_PORT}"
else
  if ! command -v pg_ctlcluster >/dev/null 2>&1; then
    warn 'no Postgres server installed — install it with:'
    warn '  apt-get install -y postgresql'
    exit 1
  fi

  # Take whichever major version this image happens to carry rather than
  # hardcoding 16; the cluster line looks like "16 main 5432 down ...".
  cluster="$(pg_lsclusters --no-header 2>/dev/null | awk 'NR==1 {print $1, $2}')"
  if [ -z "$cluster" ]; then
    version="$(ls /usr/lib/postgresql | sort -n | tail -1)"
    pg_createcluster "$version" main >/dev/null
    cluster="$version main"
  fi
  # shellcheck disable=SC2086 # deliberate word split: "<version> <cluster>"
  pg_ctlcluster $cluster start
  ok "started cluster $cluster"
fi

# The app connects over TCP with a password, so the postgres role needs one.
# `su postgres` uses peer auth on the unix socket, which needs no credentials.
su postgres -c "psql -qtAc \"ALTER USER ${DB_USER} PASSWORD '${DB_PASSWORD}'\"" >/dev/null
if ! su postgres -c "psql -qtAc \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'\"" | grep -q 1; then
  su postgres -c "createdb ${DB_NAME}"
  ok "created database ${DB_NAME}"
fi

DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${DB_PORT}/${DB_NAME}"
export DATABASE_URL
ok "${DB_NAME} ready"

#-----------------------------------------------------------------------------
# 3. Schema, demo data and .env.local
#-----------------------------------------------------------------------------
# dev-local.js owns all three: it writes any missing .env.local values, applies
# migrations and seeds demo data, and skips whatever is already done.
step 'Schema and demo data'
# shellcheck disable=SC2086 # $FRESH is a single optional flag
node scripts/dev-local.js --setup $FRESH

#-----------------------------------------------------------------------------
# 4. Hand the connection string to the rest of the session
#-----------------------------------------------------------------------------
# Next.js reads .env.local by itself; plain `node database/migrate.js` and psql
# do not, so export it for anything run outside the dev server.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo "export DATABASE_URL=\"${DATABASE_URL}\""
    echo "export PGHOST=127.0.0.1 PGUSER=${DB_USER} PGPASSWORD=${DB_PASSWORD} PGDATABASE=${DB_NAME}"
  } >> "$CLAUDE_ENV_FILE"
fi
