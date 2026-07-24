---
name: gc-artefacts
description: Garbage-collect the local artefact cache (size-bounded LRU eviction).
disable-model-invocation: true
allowed-tools: Bash(bash:*)
---
Run the artefact-cache GC and report what was evicted. The cache is disposable —
anything dropped can be recreated from its `🗄️ Artefact:` recipe. Size bound is
`$CTX_CACHE_MB` MB (default 1024).

!`bash ${CLAUDE_SKILL_DIR}/../../scripts/ctx_gc.sh`
