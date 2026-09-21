#!/usr/bin/env bash
set -euo pipefail
if [[ ! -f package.json || ! -f server.ts || ! -d src ]]; then
  echo "ERROR: شغّل الملف من جذر مشروع schedule."
  exit 2
fi
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$HERE/apply-fixes.mjs"
node "$HERE/verify-fixes.mjs"
npm run lint
npm test
npm run build
echo "DONE — لا commit / push / deploy."
