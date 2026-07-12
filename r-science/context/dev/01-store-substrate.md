# Stage 1 — `ctx_store` substrate

The new imperative shell. Replaces every GitHub call in `ctx_fetch` with local
directory I/O + git. This is the foundation; build it first, in one worker (it is
one cohesive module — do not split).

Read CONTRACT.md first. This plan expands each API function into requirements
with explicit correctness criteria. Tests are written first against these
criteria (`scripts/tests/test_ctx_store.py`), expected initial state red
(module absent).

## Module: `scripts/ctx_store.py`

Imports `ctx_core` for `Node`, `Comment`, `parse`. Uses `subprocess` for git,
`pathlib`, and a YAML library **only if already available**; otherwise a tiny
hand-rolled frontmatter parser (the frontmatter is a fixed 4-key shape — see R2).
Confirm availability before choosing: `python -c "import yaml"` in the project
env. If absent, hand-roll (do not add a dependency for the MVP).

---

### R1 — Store discovery & layout helpers

`_nodes_dir(store)`, `_node_dir(store, id)`, `_next_path(store)`,
`_comments_dir(store, id)` return the paths in CONTRACT → layout.

**Criteria**
- Paths are computed with `pathlib`, `store` may be relative or absolute.
- No path helper creates directories as a side effect (creation is explicit in
  the write functions).

### R2 — `node.md` (de)serialization

`_read_node_file(path) -> (frontmatter: dict, body: str)` and
`_write_node_file(path, *, title, state, state_reason, labels, body)`.

**Frontmatter keys (exactly these four):** `title` (str), `state` (`"open"`|
`"closed"`), `state_reason` (`"completed"`|`"not_planned"`|`None`), `labels`
(`list[str]`).

**Criteria**
- Round-trip: `_write_node_file` then `_read_node_file` returns the same four
  field values and a **byte-identical body** (modulo a single normalising newline
  between the closing `---` and the body, and a single trailing newline at EOF).
  Confirm "identical" with an unfiltered `diff` per [MEASURE TWICE].
- `state_reason: None` serialises as an empty value (`state_reason:` with nothing
  after it) and parses back to `None`.
- `labels: []` serialises as `labels: []` and parses back to `[]`.
- A body containing `---` lines of its own (e.g. a Markdown thematic break) does
  **not** confuse the parser: only the **first** `---`…`---` block at the very top
  of the file is frontmatter. A file whose body starts with a thematic break
  still round-trips.
- A malformed file (no opening `---`) raises `StoreError` with the path in the
  message.

### R3 — `read_comments(store, node_id) -> list[Comment]`

**Criteria**
- Returns `Comment(seq=N, text=<contents of NNNN.md>)` for every `comments/NNNN.md`,
  sorted ascending by `N`.
- `seq` equals the integer parsed from the filename (1-based), not the list index.
- Missing `comments/` dir ⇒ returns `[]` (a body-only node is valid).
- Comment text is the raw file contents, trailing newline stripped once.

### R4 — `read_nodes(store) -> list[ctx_core.Node]`

**Criteria**
- One `Node` per `nodes/<id>/node.md`. `Node.number` = the integer dir name.
- `Node.title/state/state_reason` from frontmatter; `Node.labels` = `set(labels)`.
- `Node.comments` = `read_comments(store, id)` (attached, seq 1..N).
- `Node.body` = the body from `node.md`.
- Order: ascending by id (deterministic).
- An empty store (no `nodes/`) ⇒ returns `[]` (does not raise).
- The returned list fed straight into `ctx_core.collate` produces a `Model` whose
  `tree_edges` match the `Part-of` markers in the bodies (integration criterion —
  proves the store output is collate-compatible).

### R4b — `init_store(store) -> None` (bootstrap)

The one function allowed to create a repo. Every other write assumes `.git`
exists (R9). Without this there is no way to make a fresh live store.

**Criteria**
- Creates `<store>/` if absent, runs `git init`, writes `_next` = `"1"`, and makes
  an initial commit. If no git identity is configured, sets a throwaway
  `user.email`/`user.name` on the repo (`git -C … config`, local scope) so the
  commit succeeds in CI.
- **Idempotent**: if `<store>/.git` already exists, it is a no-op and does **not**
  raise or reset `_next`.
- After `init_store`, `read_nodes(store)` returns `[]` and `create_node` allocates
  id `1`.

### R5 — id allocation via `_next`

`_alloc_id(store) -> int`: read `_next` (default `1` if absent), return it, write
back `value+1`. Called inside `create_node` **before** the git commit so the
counter bump is part of the same commit.

**Criteria**
- First `create_node` on a fresh store returns `1`; the next returns `2`; ids are
  gap-free and monotonic.
- `_next` after allocating id `k` contains `k+1`.
- Allocation and the node write land in **one** commit (see R9): `git log`
  shows a single commit, and `git status` is clean afterward.

### R6 — `create_node(store, title, body, *, parent=None, labels=None) -> int`

**Criteria**
- Lints `body` first (R8); on findings, raises `ValidationError` and writes
  **nothing** (no dir, no `_next` bump, no commit) — verify the store is
  byte-unchanged after a rejected create.
- Writes `nodes/<id>/node.md` with `state="open"`, `state_reason=None`,
  `labels=labels or []`, and the given `title`/`body`.
- `parent` is a **redundant assertion**, verified by parsing (not substring): let
  `ids = [p for m in ctx_core.parse(body).markers if m.kind==ctx_core.PART_OF
  for p in m.value]` (a `Part-of` marker's `.value` is a `list[int]`); if `parent
  not in ids`, raise `ValidationError` with a synthetic finding explaining the
  mismatch. `create_node` never injects the marker — the body is the source of
  truth.
- Returns the new id.
- Commits with message `node #<id>: create` (R9).

### R7 — `add_comment` / `update_comment` / `set_state`

`add_comment(store, node_id, body) -> int`
- Lints `body` (R8) before writing; on findings raises `ValidationError`, writes
  nothing.
- Writes `comments/<next-seq>.md` (next-seq = max existing seq + 1, or 1).
  Creates `comments/` if absent.
- Returns the new seq. Commit msg `node #<id>: comment <seq>`.
- Raises `StoreError` if `node_id` does not exist.

`update_comment(store, node_id, seq, body) -> None`
- Lints `body`; overwrites the existing `comments/<seq>.md` in place.
- Raises `StoreError` if that comment file does not exist (no create-on-update).
- Commit msg `node #<id>: update comment <seq>`.

`set_state(store, node_id, state, *, state_reason=None, labels=None) -> None`
- Rewrites `node.md` frontmatter: sets `state` and `state_reason`; sets `labels`
  only when `labels is not None` (None ⇒ leave the existing list untouched).
- `state` must be `"open"` or `"closed"`; else `StoreError`.
- Body is preserved byte-identical.
- Commit msg `node #<id>: state <state>`.
- Raises `StoreError` if `node_id` does not exist.

### R8 — lint-before-write

`_validate(body)`: `findings = ctx_core.parse(body).findings; if findings: raise
ValidationError(findings)`. Ports `ctx_fetch._validate` verbatim in behaviour.

**Criteria**
- A body with a malformed marker (reuse an existing `test_ctx_fetch` malformed
  fixture) is rejected by every write function with `ValidationError`, and
  `.findings` is a non-empty `list[ctx_core.Finding]`.

### R9 — git-per-write

`_commit(store, msg)`: `subprocess.run(["git","-C",store,"add","-A"], check=True)`
then `commit` with `--author "ctx-store <ctx-store@local>"` and `-m msg`.

**Criteria**
- Every successful mutating call produces exactly one new commit whose subject is
  the pinned message; `git status --porcelain` is empty afterward.
- A store is assumed already `git init`-ed. If `.git` is absent, raise `StoreError`
  with a clear message (do **not** auto-init — the caller owns store creation).
- Commits use `-C <store>`, never `os.chdir` (no global cwd mutation — keeps the
  function reentrant and test-parallel-safe).
- A `commit` that would be empty (no changes staged — should not happen given the
  writes precede it) is treated as a `StoreError`, surfacing the bug rather than
  silently passing.

### R10 — errors

Define `StoreError(Exception)` and `ValidationError(StoreError)` with
`__init__(self, findings)` setting `self.findings` and a `"; ".join(str(f) …)`
message (port from `ctx_fetch.ValidationError`). The network error classes
(`AuthError`/`RateLimitError`/`OperationalError`) are **not** carried over.

---

## Test file: `scripts/tests/test_ctx_store.py`

- A `store` fixture: a `tmp_path` subdir passed through `ctx_store.init_store`
  (which does the `git init`, `_next`, initial commit, and throwaway git identity).
  This exercises `init_store` on every test as a side benefit.
- One recognisably-named test per criterion above (e.g.
  `test_create_node_allocates_gapfree_ids`, `test_rejected_body_writes_nothing`,
  `test_node_md_roundtrip_byte_identical`, `test_read_nodes_feeds_collate`).
- Reuse malformed-marker fixtures from the existing suite where possible.
- **Do not** mock git — run real git against the tmp store (it is cheap and the
  commit behaviour is a correctness criterion).

## Deliverable: a criterion→test coverage map

Emit a short map (criterion id → test name) in your completion report so the
Stage-1 audit can spot-check it.
