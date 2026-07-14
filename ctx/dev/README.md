# Store migration — implementation plans

> **Historical — store migration construction record (completed 2026-07-12).** Kept for reference; API pins may drift with store schema v2 (node #64). The node tree is the source of truth.

Detailed, execution-ready plans for migrating the `ctx` context substrate off
GitHub issues onto a **local, git-backed node store** (design.md:140 / issue #60).

These are written for a **weaker model to execute without ambiguity** (the
tdd-plan workflow). Read them in this order:

1. **`CONTRACT.md`** — the one-page digest every worker reads: pinned module
   APIs, the on-disk format, conventions, gates, and adjudicated decisions. When
   a plan and the tests disagree, this file is the tie-breaker.
2. **`00-overview-and-sequencing.md`** — scope, the settled decisions, the build
   order, and the running **plan-drift log** (append here whenever a plan moves).
3. **`01-store-substrate.md`** — the new `ctx_store` module: on-disk format, id
   allocation, git-per-write, the read/write API. The foundation; everything
   else depends on it.
4. **`02-read-path-and-entrypoints.md`** — repoint `RepoSource`, `ctx_lint`, and
   the MCP `serve` entrypoint from a `repo` string to a store path.
5. **`03-linter.md`** — delete the two platform-derived checks (I1, I2); make the
   linter build no `Platform` from GitHub.
6. **`04-seal-and-retire-github.md`** — repoint `ctx_seal` off `gh`; delete the
   GitHub transport; final grep-clean gate.

**TDD discipline:** for each plan, the test suite is written first (against the
correctness criteria stated inline), the imports resolve to the exact paths the
CONTRACT pins, and the expected initial state is red. Do not weaken a criterion
to make a test pass — file a plan-change request in your report instead.

**Nothing here touches** `ctx_core.py` (the pure parser/collator), `ctx_schedule.py`,
`ctx_artefact.py`, or the marker grammar. The migration is confined to the
imperative shell and the entrypoints.
