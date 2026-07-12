# Stage 2 — read path & entrypoints

Repoint the three live read-path consumers from a GitHub `repo` string to a
**store path**. Depends on Stage 1 (`ctx_store.read_nodes`). No new behaviour —
this is rewiring.

Read CONTRACT.md first.

---

### R1 — `ctx_source.RepoSource` reads the local store

Current: `RepoSource.__init__(self, repo, *, fetch=None, collate=None)` calls
`(fetch or ctx_fetch.fetch_repo)(repo)`.

Change: default `fetch` to `ctx_store.read_nodes`; rename the positional param
`repo` → `store` (it is now a path). Everything downstream of `nodes = fetch(store)`
is unchanged (collate + the dict-shape build already work off `Node` objects).

**Criteria**
- `RepoSource(store)` over a store built by `ctx_store.create_node` produces the
  **same `self.nodes` / `self.registry` / `self.dead_ends` dict shapes** the
  existing `test_ctx_source.py` asserts. Update that test's *setup* (build a store
  instead of a fake repo) but **not** its shape assertions.
- The `fetch`/`collate` injection seams still work (the tests inject fakes) — keep
  them.
- `test_server.py` passes **unchanged** (it uses a fake source; this proves the
  serving contract is untouched).
- Docstring updated: drop "GitHub issue" language; `title` now comes from
  `Node.title` (frontmatter), still falling back to a `# heading` then `#<number>`.

### R2 — `ctx_lint.main(argv)` takes a store path

Current: `repo = argv[0]`, then `ctx_fetch.fetch_repo(repo)` +
`_platform_from(repo, nodes)`.

Change:
- `store = argv[0]` (usage string → `usage: ctx_lint <store-path>`).
- `nodes = ctx_store.read_nodes(store)`.
- `_platform_from` is handled in Stage 3 (it becomes trivial); for Stage 2 leave a
  call that Stage 3 will simplify — or, to keep Stage 2 self-contained and green,
  replace the body of `_platform_from` now with `return ctx_core.Platform(set(),
  {}, False)` and delete its `gh` calls. **Recommended: do the `_platform_from`
  gutting here** so Stage 2 leaves `ctx_lint.py` free of `gh`, and Stage 3 only
  touches `ctx_core.py`. (Adjudicate: this moves the `_platform_from` edit from
  Stage 3 to Stage 2 — log it in the drift log if you take it.)
- Error handling: `ctx_store.StoreError` replaces `ctx_fetch.FetchError` in the
  `except`; exit code `2` on store errors (unchanged semantics).

**Criteria**
- `ctx_lint.main([store])` returns `0` on a clean store, `1` when a check finds a
  real inconsistency (construct a store that violates e.g. I13), `2` on a
  nonexistent/uninitialised store path.
- No `gh`/REST call remains in `ctx_lint.py` (grep-clean).
- `test_ctx_lint.py` updated to build a store fixture instead of a fake repo;
  assertions on findings/exit codes preserved.

### R3 — `ctx_mcp/server.py` `serve()` takes a store path

Current: `serve(repo=None)` → `target = repo or _detect_repo()` (gh/git probe) →
`RepoSource(target)`.

Change:
- `serve(store=None)`: `target = store or os.environ.get("CTX_STORE")`; if still
  `None`, `raise SystemExit("no store: pass a path or set CTX_STORE")`.
- **Delete `_detect_repo`** entirely (it is gh/git-remote specific).
- `__main__`: `serve(sys.argv[1] if len(sys.argv) > 1 else None)` (unchanged shape).
- The per-call freshness model is preserved: `build_live_server(lambda:
  ctx_source.RepoSource(target))` still rebuilds per tool call, so a store edited
  between calls is reflected.

**Criteria**
- `serve` with neither arg nor `CTX_STORE` raises `SystemExit` with a clear message.
- `serve(store)` builds a live server whose tools read the store (exercise via the
  existing server-tool tests with a store-backed source, or a thin unit test that
  `serve` resolves `target` correctly without running stdio).
- No `_detect_repo`, no `gh` reference in `server.py`.

### R4 — conftest import shim

`conftest.py` documents an assumed `ctx_fetch` API. Update that shim block:
- Replace the `ctx_fetch` section with a `ctx_store` section listing
  `read_nodes(store)`, `create_node`, `add_comment`, `update_comment`,
  `set_state`, `StoreError`, `ValidationError`.
- Any fixture that fabricated GitHub-issue dicts should instead build a store (or
  build `Node` objects directly for pure-core tests, which need no store).

**Criteria**
- The full suite collects without import errors after the shim update.

---

## Notes for the worker

- This stage renames a positional param (`repo`→`store`) in `RepoSource`. Grep for
  keyword-arg callers (`RepoSource(repo=…)`) before renaming — there are none in
  the repo, but tests may use it; update them.
- Do not touch the MCP server's pure read functions (`get_context` etc.) — they
  are contract-frozen.
