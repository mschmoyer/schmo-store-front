#!/bin/bash
#
# SessionStart hook — leaves every Claude Code on the web session with a
# running Postgres, a migrated and seeded database, and node_modules present,
# so `npm run dev` and `npm run test:e2e` work without any manual setup.
#
# Runs synchronously: the e2e suite needs the database, and a session that
# starts before the seed lands would just fail its first test run.
set -euo pipefail

# Local machines have their own Postgres and their own opinions about it.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

exec "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}/scripts/setup-local-stack.sh"
