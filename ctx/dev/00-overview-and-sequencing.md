# 00 — Overview, sequencing, and drift log

> **Historical — store migration construction record (completed 2026-07-12).** Kept for reference; API pins may drift with store schema v2 (node #64). The node tree is the source of truth.

## What we're doing and why

The `ctx` context substrate currently reads its node graph from **GitHub issues**
(one issue per node) and writes via the `gh` CLI / REST. This is bolted onto an
architecture it doesn't fit: no cheap "diff since ref", locked to GitHub, awkward
under concurrent writes (design.md:140, issue #60). We replace the backing with a
**local, git-backed node store** (a directory that is its own git repo). `git
diff <ref>` deltas then fall out for free, it's portable/offline, and it is
hand-editable (which we dogfood).

## Why this is a small change

Whoever built the substrate already did a clean **functional-core / imperative-
shell** split. GitHub coupling lives in exactly:

- `ctx_fetch.py` — all network I/O (the shell).
- `ctx_lint._platform_from` — per-issue `gh issue view` for sub-issue edges/labels.
- `ctx_seal.py` — writes seal comments via its own `gh` calls.
- `ctx_source.RepoSource` + `ctx_lint.main` + `ctx_mcp.serve` — pass a `repo`
  string into the read path.

The pure core (`ctx_core`, 1130 lines), the scheduler, the artefact map, and the
**entire MCP server** are pure over injected data and do not change. The seam we
cut is `ctx_fetch`'s ~6-function API.

Also load-bearing: the live **write** API (`create_issue`/`add_comment`/
`update_comment`) has **no callers** outside tests — the MCP server is read-only.
So the write side is effectively greenfield; only the **read** path (`fetch_repo`)
has live consumers.

## Settled decisions

See CONTRACT.md → *Adjudicated decisions* (A1–A6). In short: single-writer MVP,
GitHub dropped entirely, dir-per-node layout, integer ids kept, I1/I2 deleted,
`set_state` added.

## Build order (each stage: tests first, then implement, then gate)

1. **Stage 1 — `ctx_store` substrate** (`01-store-substrate.md`). The new module:
   on-disk format, id allocation, git-per-write, read + write API. Everything
   depends on it. **No parallelism** — this is one cohesive module; one worker.
2. **Stage 2 — read path + entrypoints** (`02-read-path-and-entrypoints.md`).
   Repoint `RepoSource`, `ctx_lint.main`, `ctx_mcp.serve` to a store path.
   Depends on Stage 1's `read_nodes`.
3. **Stage 3 — linter** (`03-linter.md`). Delete `_check_i1`/`_check_i2`; empty
   `Platform`. Independent of Stages 1–2 except that `ctx_lint.main` (Stage 2)
   and the check deletions (Stage 3) both edit `ctx_lint.py`/`ctx_core.py` — so
   **run Stage 3 after Stage 2**, not in parallel (same files).
4. **Stage 4 — seal + retire GitHub** (`04-seal-and-retire-github.md`). Repoint
   `ctx_seal`; delete `ctx_fetch.py` + `test_ctx_fetch.py`; grep-clean gate.
   **Last**, because the grep gate only passes once every other stage has landed.

Stages are **sequential** — they share files (`ctx_lint.py`, `ctx_core.py`,
conftest) and Stage 4's gate is global. Do not parallelise.

## Final acceptance (Stage 4 done)

- Full `pytest` green from `r-science/context/`.
- Grep-clean gate returns nothing (CONTRACT → Gates).
- A manual smoke: `git init` a tmp store, `create_node` a root + child, `read_nodes`
  round-trips them, `RepoSource(store)` serves the same graph the MCP tools expect,
  `ctx_lint <store>` exits 0 on a clean store.

## Deliverable that is NOT code

design.md:140 currently reads "*Decision leaning (t12) … not yet implemented*".
Once this lands, that line becomes *implemented*. That edit is a **docloop turn**
in `docloop/workspace/`, not a code-repo commit — do it there, separately.

## Deferred (explicitly out of scope — do not build now)

- Concurrent multi-fork writes; branch/merge mirroring the fork-tree.
- Batching many writes into one logical "turn" commit (MVP = one commit per call).
- Converging the store with docloop's workspace as a single HITL surface
  (design.md "build once" — a later research project).
- Any GitHub projection/export.

## Plan-drift log

Append one line whenever a plan moves during execution (adjudication, accepted
deviation, corrected assumption). This log is a deliverable — Phase 9 reports it.

- **Phase 3 sanity pass:** added `init_store()` to the API — the plans assumed a
  git-init'd store but nothing created one (bootstrap gap). Corrected the
  `create_node` `parent` check from an emoji substring match to a marker-parse
  (`Part-of` `.value` is a `list[int]`; flatten and membership-test).
- **Phase 5 test audit:** suite for Stage 1 written + audited (50 tests, clean
  TDD-red skip; full existing suite still 187 passed). Adjudications: (a) R9's
  "empty commit ⇒ StoreError" criterion left **uncovered on purpose** — a
  defensive can't-happen guard with no black-box trigger absent git-mocking
  (which the plan forbids); keep it as a defensive assertion in the impl. (b)
  Strengthened the `parent`-assertion test — the agent's version didn't
  distinguish parse-from-substring; added a case where `#<parent>` appears in
  prose but not as a `Part-of` marker (substring impl wrongly accepts).
- **Phase 6 Stage 1 landed + verified:** `ctx_store.py` (347 lines, hand-rolled
  frontmatter — no `yaml` dependency) green on all 58 tests; full suite 245
  passed / 1 skipped (no regressions); grep-clean of gh/network/chdir.
  Orchestrator spot-verified atomicity (validate-before-mutate), `_commit`
  empty-guard, and frontmatter body-preservation. **Known limitation (accepted
  for single-writer MVP):** `create_node` is not crash-atomic across the
  `_alloc_id` → `_commit` span — an OS-level fault (disk full / kill) between the
  `_next` bump and the commit would leave an uncommitted counter bump + id gap.
  Not reachable by any tested path; revisit if/when concurrency lands.
- **Stages 2+3 landed + verified:** read path/entrypoints repointed
  (`RepoSource`/`ctx_lint`/`serve` take a store path; `_detect_repo` gone;
  `_platform_from` returns an empty vestigial `Platform`); I1/I2 deleted from
  `CHECKS` (now I3–I13) and 5 I1/I2 test methods removed. Full suite 241 passed /
  1 skipped; edited files grep-clean of gh/`_detect_repo`. Two worker
  adjudications **approved**: (a) `_platform_from` gutted in Stage 2 not Stage 3
  (per the plan's own recommendation); (b) `ctx_lint.main` gained an explicit
  `.git`-existence check → exit 2 on a nonexistent store, because
  `ctx_store.read_nodes` returns `[]` (not raises) for a missing dir and R2
  requires exit 2 there. Verified the exit-2 path end-to-end.
