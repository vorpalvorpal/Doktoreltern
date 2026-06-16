---
description: Garbage-collect the local artefact cache (size-bounded LRU eviction).
allowed-tools: Bash(bash:*)
---
Run the artefact-cache GC and report what was evicted. The cache is disposable —
anything dropped can be recreated from its `🗄️ Artefact:` recipe. Size bound is
`$CTX_CACHE_MB` MB (default 1024).

!`bash r-science/context/scripts/ctx_gc.sh`
