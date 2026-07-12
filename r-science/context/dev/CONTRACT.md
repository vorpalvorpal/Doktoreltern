# CONTRACT digest — store migration

The single source of truth for pinned APIs, layout, conventions, gates, and
adjudicated decisions. Workers read this + their own plan section. When a plan
and the tests disagree, **this file wins** pending orchestrator adjudication.

---

## File layout (after migration)

```
r-science/context/
  scripts/
    ctx_store.py        NEW — imperative shell: local store I/O + git (replaces ctx_fetch)
    ctx_core.py         UNCHANGED except: delete _check_i1, _check_i2 + their CHECKS entries
    ctx_source.py       EDIT  — RepoSource reads the local store
    ctx_lint.py         EDIT  — argv[0] = store path; _platform_from returns empty Platform
    ctx_seal.py         EDIT  — writes via ctx_store.add_comment, not gh
    ctx_schedule.py     UNCHANGED
    ctx_artefact.py     UNCHANGED
    ctx_fetch.py        DELETE
    tests/
      test_ctx_store.py NEW  (replaces test_ctx_fetch.py, which is DELETED)
      conftest.py       EDIT  — update the ctx_fetch import shim → ctx_store
  ctx_mcp/server.py     EDIT  — serve(store) / drop _detect_repo gh probe
```

## The store on disk

A **store** is a directory that is **its own git repository** (like
`docloop/workspace/`). Its path is always passed in or read from the `CTX_STORE`
env var — **never hardcoded**. Tests use a pytest `tmp_path` initialised with
`git init`.

The node **tree is the directory nesting**: any non-dotted subdir is a CHILD
node; a dot-prefixed subdir (`.comments`) is a COMPONENT of the enclosing node. A
node's parent is its nearest non-dotted ancestor dir (`None` for a root sitting
directly under `nodes/`). There is no `Part-of` marker — the nesting is the tree.
Node dir names carry no requirement beyond the dot rule (ids are still positive
integers, allocated by `_next`); the dot-prefix, not the name shape, is what
distinguishes a component from a node.

```
<store>/
  _next                     # plain text: the next id to allocate, e.g. "17\n"
  nodes/
    <id>/                   # a ROOT node. <id> is a positive integer, zero-padding NOT used
      node.md               # YAML frontmatter + Markdown body
      .comments/            # a COMPONENT (dot-prefixed), not a child node
        0001.md             # one comment per file, seq in filename (zero-padded 4)
        0002.md
      <child-id>/           # a CHILD node nests inside its parent's dir
        node.md
        <grandchild-id>/    # …and so on, arbitrarily deep
          node.md
```

### `node.md` format

```
---
title: Combiner for stacked exposures
state: open              # "open" | "closed"
state_reason:            # "completed" | "not_planned" | null (empty ⇒ null)
labels: [dormant]        # YAML list of strings; [] when none
---
<Markdown body, marker grammar unchanged — e.g. 🧱 Boundary: #3>
```

- Frontmatter carries **exactly** the four fields GitHub used to supply:
  `title`, `state`, `state_reason`, `labels`. Nothing else.
- The body is byte-preserved on round-trip (only the leading/trailing newline
  around the `---` fence is normalised).
- `labels` holds only non-derivable labels (currently just `dormant`). Aspect
  labels are **not** stored — they were only ever a projection of `🅰️ Aspect:`
  markers, and I2 (which checked them) is deleted.

### `comments/NNNN.md` format

Raw Markdown comment body, no frontmatter. Filename `NNNN.md` (1-based,
zero-padded to 4) maps to `ctx_core.Comment(seq=N, text=<file contents>)`.
`ctx_core.Comment(seq=0, ...)` is the body itself (lives in `node.md`), never a
file. First real comment is `0001.md` ⇒ `seq=1`.

## `ctx_store` public API (pin these signatures)

```python
# Read
read_nodes(store: str) -> list[ctx_core.Node]
    # Every node under <store>/nodes/, as ctx_core.Node. Comments loaded and
    # attached (Node.comments = [Comment(1, ...), Comment(2, ...), ...]).
    # Node.title/state/state_reason/labels come from frontmatter.

read_comments(store: str, node_id: int) -> list[ctx_core.Comment]
    # The comment stream for one node (seq 1..N). Body (seq 0) not included.

# Bootstrap
init_store(store: str) -> None
    # Create <store>/ if absent, `git init` it, write _next="1", and make an
    # initial commit (git config a throwaway user if none is set). Idempotent:
    # a no-op (not an error) if <store>/.git already exists. The one function
    # that is allowed to create a repo — every other write assumes it exists.

# Write — each mutating call: lint body → write file(s) → git add -A + commit
create_node(store: str, title: str, body: str, *, parent: int | None = None,
            labels: list[str] | None = None) -> int
    # Allocate the next id from _next and write node.md (state="open",
    # state_reason=None, labels=labels or []). The tree is the filesystem: with
    # `parent` given, the new node dir nests inside that parent's dir
    # (<parent path>/<newid>/node.md); otherwise it is a root (nodes/<newid>/).
    # There is NO Part-of marker — the parent comes from the argument, never the
    # body. An unknown `parent` (no such node dir) raises StoreError before any
    # write. Returns new id.

add_comment(store: str, node_id: int, body: str) -> int
    # Append comments/<next-seq>.md. Returns the new seq (int, >= 1).

update_comment(store: str, node_id: int, seq: int, body: str) -> None
    # Overwrite an existing comment file in place.

set_state(store: str, node_id: int, state: str, *,
          state_reason: str | None = None,
          labels: list[str] | None = None) -> None
    # Rewrite node.md frontmatter. `labels` None ⇒ leave unchanged.
    # This replaces GitHub close/reopen/label — the store's only state mutator.

# Errors
class StoreError(Exception): ...           # base
class ValidationError(StoreError):         # body markers malformed; write refused
    def __init__(self, findings): ...      # .findings = list[ctx_core.Finding]
```

**Lint-before-write** (preserve the current `ctx_fetch._validate` behaviour):
every call that accepts a `body` runs `ctx_core.parse(body).findings`; if
non-empty, raise `ValidationError(findings)` **before** any file is written.

**Git-per-write:** after a successful write, run (via `subprocess`, `check=True`):
```
git -C <store> add -A
git -C <store> commit -m "<msg>" --author "ctx-store <ctx-store@local>"
```
Commit message convention (deterministic, greppable):
`node #<id>: create` · `node #<id>: comment <seq>` · `node #<id>: update comment <seq>` · `node #<id>: state <state>`.
No commit is made if the lint fails. One mutating call = one commit (batching
into logical turns is deferred — see 00-overview).

**Concurrency:** single-writer is assumed for the MVP. `_next` is read →
increment → written within the same commit; no locking. Multi-fork concurrent
writes are explicitly out of scope (design.md:140 "later").

## `ctx_core.Node` (unchanged — the shape the store must produce)

```python
Node(number: int, body: str, state: str, state_reason: str | None,
     labels: set[str], comments: list[Comment] = [], title: str = "",
     parent: int | None = None)   # parent = FS-derived tree parent id; None for a root
```

## Consumers that must keep working unchanged

- `ctx_core.collate(nodes) -> Model` — pure; `Model.tree_edges` from each node's
  FS-derived `Node.parent` (not a `Part-of` marker), `Model.dormant` =
  {n : node.state=="closed" and "dormant" in labels}.
- `ctx_schedule` — working set = open & not dormant; fidelity/confidence from
  **markers** (`Model.gauges`), not labels.
- `ctx_mcp/server.py` read tools — pure over the injected `source`; only the
  `serve()` entrypoint changes.

## Gates (run from `r-science/context/`)

- Per-stage: `pytest scripts/tests/<the stage's test file>` green.
- Full suite: `pytest` green from `r-science/context/` (the suite's cwd).
- Final grep-clean gate (must return nothing under `r-science/context/`, tests
  included except where a string is a deliberate negative assertion):
  `grep -rn 'api.github.com\|GITHUB_TOKEN\|GH_TOKEN\|gh issue\|gh api\|gh repo' r-science/context`
- **[MEASURE TWICE]** the disk round-trip "identical" claims must be confirmed
  with an **unfiltered** `diff` (not an rtk-filtered comparison) before being
  written into a test as the expected value.

## Adjudicated decisions (from Phase 1)

- **A1 — Scope: single-writer MVP.** Local store behind the shell seam, git per
  write. Concurrency / branch-merge / docloop-convergence deferred.
- **A2 — GitHub dropped entirely.** No projection, no export. `gh` gone.
- **A3 — Layout: dir-per-node + `comments/`.** (Not one-file-per-node.)
- **A4 — Integer identity kept.** Ids allocated locally via `_next`; the
  `#N` marker grammar is unchanged.
- **A5 — I1 and I2 deleted.** I1 (Part-of ↔ sub-issue edge) is vacuous with no
  platform; I2 (aspect marker ↔ label) is vacuous once aspect labels aren't
  stored. Remaining checks keep the `(model, platform)` signature and ignore
  `platform` (avoids churning 9 checks + their tests); `Platform` becomes
  vestigial and is passed empty. Flagged for a later cleanup, not this migration.
- **A6 — `set_state` added.** GitHub close/reopen/label had no local equivalent;
  the scheduler/fold path needs one. The pre-existing `create_issue`/`add_comment`
  write API had **no live callers** (only tests), so renaming it to store-native
  names breaks nothing.
