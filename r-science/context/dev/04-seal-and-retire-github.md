# Stage 4 — seal off `gh`, retire GitHub, final gate

> **Historical — store migration construction record (completed 2026-07-12).** Kept for reference; API pins may drift with store schema v2 (node #64). The node tree is the source of truth.

Last stage. Repoint `ctx_seal` off its own `gh` calls, delete the GitHub
transport module, and prove the substrate is GitHub-free.

Read CONTRACT.md first. Run **after** Stages 1–3 (the grep gate is global).

---

### R1 — `ctx_seal.py` writes via `ctx_store`

Current: `ctx_seal` builds a seal-comment string (`seal_comment(state, who,
date)`) and posts it with its own `_gh(["issue","comment", …])`, deriving the repo
via `_current_repo()` (`gh repo view`).

Change:
- Keep `seal_comment(...)` **byte-identical** — the comment format is the
  contract; do not touch it.
- Replace the write with `ctx_store.add_comment(store, issue, seal_comment(...))`.
- CLI: `--repo` → `--store` (a path); drop `_current_repo()` and `_gh`.
- `store` resolution: `args.store or os.environ.get("CTX_STORE")`; if neither,
  exit non-zero with a clear message.

**Criteria**
- `seal_comment("sealed", who="@rjs", date=…)` output is unchanged (assert against
  the existing `test_ctx_seal.py` expected string, or snapshot it before editing).
- Running the seal CLI against a store appends exactly one comment whose text is
  `seal_comment(...)` and makes exactly one git commit (via `add_comment`).
- No `gh` reference remains in `ctx_seal.py`.

### R2 — delete `ctx_fetch.py` and `test_ctx_fetch.py`

Everything `ctx_fetch` provided is either replaced by `ctx_store` (read/write API,
`_validate`, `ValidationError`) or dropped (network transport, `AuthError`/
`RateLimitError`/`OperationalError`, `_link_subissue`).

- Confirm no remaining importer of `ctx_fetch` (grep across `r-science/context`,
  tests included). Expected importers were `ctx_source`, `ctx_lint` (both
  repointed in Stage 2). Fix any stragglers.
- Delete `scripts/ctx_fetch.py`.
- Delete `scripts/tests/test_ctx_fetch.py` (its behaviour is superseded by
  `test_ctx_store.py`). Salvage any still-relevant malformed-marker fixtures into
  `test_ctx_store.py` first.

**Criteria**
- `grep -rn 'ctx_fetch' r-science/context` returns nothing.
- Full suite green after deletion.

### R3 — final grep-clean gate

From `r-science/context/`, this must return **nothing** (except deliberate
negative assertions in tests, if any — there should be none):

```
grep -rn 'api.github.com\|GITHUB_TOKEN\|GH_TOKEN\|gh issue\|gh api\|gh repo\|_detect_repo\|subissue' r-science/context
```

(`git` invocations are expected and fine — the store is git-backed.)

**Criteria**
- The gate command returns no matches.
- `pytest` green from `r-science/context/`.
- Manual smoke (CONTRACT → not-code / 00-overview → final acceptance): init a tmp
  store, create a root + a child (child body carries `🧩 Part-of: #<root>`),
  `read_nodes` round-trips, `RepoSource(store)` serves the graph, `ctx_lint
  <store>` exits 0.

---

## After code lands (separate, not a code commit)

Update **design.md:140** in `docloop/workspace/` from "*Decision leaning …
not yet implemented*" to implemented, via a docloop turn (`dl edit` / `dl
commit`). Update the workflow-redesign memory note to mark #60's store migration
done. Neither belongs in the code-repo PR.
