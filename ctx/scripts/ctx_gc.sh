#!/usr/bin/env bash
# Artefact-cache GC — the backend for the /gc-artefacts command.
#
# A thin bash entrypoint over the tested, portable ctx_artefact.gc (Python), so
# the eviction logic stays unit-covered and works the same on macOS and Linux
# (raw `stat`/`find` flags differ between them; this sidesteps that).
#
# Env:
#   CTX_CACHE_DIR  cache directory (default: tmp/art)
#   CTX_CACHE_MB   size bound in MB (default: 1024)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BOUND_MB="${CTX_CACHE_MB:-1024}"

exec python3 -c "
import sys
sys.path.insert(0, '$HERE')
import ctx_artefact
bound = int('$BOUND_MB') * 1024 * 1024
before = ctx_artefact.total_bytes()
removed = ctx_artefact.gc(bound)
after = ctx_artefact.total_bytes()
print(f'artefact cache {ctx_artefact.cache_dir()}: {before} -> {after} bytes '
      f'(bound {bound}); evicted {len(removed)} file(s)')
"
