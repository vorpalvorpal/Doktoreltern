# Package C — `dl check`, `dl commit`, verb ports (`reply` / `comment` / `resolve`)

*Read `dl-00-overview.md` first. Depends on package A (docs, refs, canonical, journal,
gitio). Independent of package B.*

## C0. Store change: resolved threads are marked, not deleted

(Spec decision 9.) `src/threads-store.ts`:
- `resolveThread(baseDir, id, opts: { author: string; note?: string })` now writes
  `threads/<id>/resolved.md` — same frontmatter shape as a comment (`author`,
  `created`), body = note (may be empty) — instead of `rm -rf`. Resolving an
  already-resolved id overwrites the marker (idempotent-ish, last resolution wins).
  A missing thread dir is created (resolve of an anchor whose store was never written
  still records the resolution).
- `Thread` gains `resolved?: { author: string; created: string; note: string }`;
  `listThreads`/`readThread` populate it (the marker filename doesn't match `NNNN.md`,
  so comment parsing is untouched).
- `src/api.ts` DELETE `/threads/<id>`: accept an optional JSON body
  `{ author?, note? }`, default author `rjs`; pass through. `src/threads-client.ts`
  `resolveThread(id)` sends `{ author: 'rjs' }`.
- `scripts/lint-turn-core.ts` (the legacy lint, still in use during transition):
  orphaned-dir ERROR becomes "no live anchor AND no `resolved.md`"; add ERROR for
  "resolved marker present but anchor still live".
- GUI rendering: **no change** — verified anchor-driven (`renderThreads` iterates doc
  anchors). Do not touch main.ts except if a type now requires it.

### Correctness criteria
- Resolve → dir still exists, `resolved.md` has author/created/note, comments intact.
- `listThreads` marks it resolved; unresolved threads have `resolved` undefined.
- Legacy lint: resolved-marker dir with no anchor → clean; marker + live anchor →
  ERROR; unmarked dir with no anchor → ERROR (unchanged behaviour).
- API round-trip: DELETE with `{note}` lands the note in the marker; DELETE with no
  body still works (defaults).
- `renderTurn` on a repo where a resolved dir survives: the thread appears as
  `status="resolved"` (anchor-based, as before) and no phantom `opened`/`updated`
  entry appears.
- Id allocation never reuses a resolved thread's id (seed resolved `t9`, expect `t10`).

## C1. `checkcore.ts` — union lint

Extends `scripts/lint-turn-core.ts`'s checks from one doc to the workspace union
(all tracked top-level `*.md` + `threads/`). Reuse its issue shape
(`{level: 'ERROR'|'WARN', message}`); add a `doc` field where applicable.

Checks (E = error, W = warn):
1. (E) anchor id present in >1 doc. (A "duplicate id within the store" clause was
   dropped at adjudication — store dirs are unique by filesystem construction.)
2. (E) anchor with no thread directory / empty thread.
3. (E) thread directory with no live anchor in **any** doc and no `resolved.md`
   marker (orphaned — the model's edit dropped the span: resolve or re-anchor).
3b. (E) `resolved.md` marker present but the anchor is still live in some doc.
4. (E) malformed comment frontmatter (as today).
5. (W) non-`t<N>` id (as today).
6. (E) doc not in canonical form (`canonicalize(doc) !== doc`) — this is the
   commit-blocking guard that replaces the manual `npm run canonicalize --check` step.
7. (E) anchor whose span is empty, or inline anchor split mid-word (span starts/ends
   inside a `\w` run relative to its surrounding text) — the inbound-fragmentation
   guard (t21/t25 class).
8. (W) same id anchored as >3 separate `:mark` fragments (t17-in-8-pieces class).
9. Milkdown-divergent constructs (spike guards — the GUI's serializer corrupts these,
   so they must not enter canonical docs):
   9a. (E) emphasis nested inside strong or strong inside emphasis in prose.
   9b. (E) formatting (any non-text mdast node) inside a `:mark[...]` span.
   9c. (E) a bare `:mark` text directive (no id) outside code — literal ":mark" prose
       must be written in backticks.
   9d. (E) raw `<br>`/`<br />` inline HTML — use a backslash hard break.

`dl check` prints one line per issue (`ERROR <doc>: …`), summary line last
(`check: 2 errors, 1 warning` / `check: clean`), exit 1 on any ERROR.

### Correctness criteria
- Each rule has at least one positive and one negative test on scratch workspaces.
- Multi-doc: anchor in `plan.md`, thread present → clean; the same store with the
  anchor moved to `design.md` → still clean (union, not per-doc) — this is the
  2026-07-09 multi-doc-blindness regression test.
- Rule 6 fires on a non-canonical doc and names the doc.
- Rules 9a–9d: one positive case each (e.g. `**bold *em* bold**` → 9a; `<br>` → 9d);
  negative: `` `:mark` `` in backticks is clean, `*em* :mark[plain]{#t1}` (emphasis
  *adjacent to*, not inside, an anchor) is clean.
- Exit codes: clean → 0; warnings only → 0; any error → 1.

## C2. `commitcore.ts` + `dl commit -m "<subject>"`

Sequence (any failure before the `git commit` leaves the repo exactly as found):
1. Foreign-edit guard: if the journal exists, every journal-recorded hash must match
   the file on disk, AND no tracked file outside the journal's `writes` may differ
   from HEAD. Violation → error naming the files (`dl commit: workspace changed
   outside dl (design.md) — human edit mid-turn? re-run dl agenda`). If **no journal
   exists** (dl made no writes this turn) refuse: `nothing to commit — no dl writes
   this turn` unless `--allow-manual` is passed (escape hatch for hand-edits during
   the transition; it skips the guard but still checks + canonicalises). Adjudicated
   staging under `--allow-manual`: tracked docs + `threads/` + any newly created
   top-level `*.md` (they become tracked); without the flag, an untracked top-level
   `*.md` is itself a refusal.
2. `checkcore` — any ERROR aborts.
3. Stage tracked docs + `threads/` (`git add <docs...> threads`); never `turn.xml`.
4. Build the turn record and commit with `--author 'docloop-model <model@docloop>'`.
5. `clearScratch`.
6. Stdout: `committed <shortsha> (<n docs>, <k threads>)`.

Turn record = commit message body (subject is the `-m` argument), YAML:

```yaml
docloop-turn: 1
docs:
  design.md: {before: a3f21c4e, after: 9e12ab34}   # refs; omit untouched docs
threads:
  opened: [t26]
  replied: [t17, t9]
  resolved:
    - {id: t4, note: "conceded — folded into §3"}
recovered-draft: false
```

`before` = ref at HEAD, `after` = ref of the committed bytes; thread lists come from
the journal scratch. Also export `parseTurnRecord(message)` for the GUI/scheduler
(reverse direction — keep it beside the builder so the format has one home).

### Correctness criteria
- Happy path: scratch repo, edits made via A's `dl edit` + a reply via C3 → commit
  created with model author, YAML body parses back (`parseTurnRecord` round-trip),
  scratch cleared, stdout format as above.
- Foreign edit (file touched after last `recordWrite`) → refuse, nothing committed,
  message names the file.
- Untracked new tracked-pattern file created by hand → refuse (same guard, second
  clause) unless `--allow-manual`.
- `checkcore` error (e.g. orphaned thread) → refuse, no commit, index clean
  (`git status` unchanged).
- `turn.xml` modified in tree → never staged, never blocks commit.

## C3. Verb ports (`verbs.ts`)

Port `scripts/thread-actions.ts` to multi-doc + quiet output + journaling. The old
`npm run thread` CLI stays untouched until dl fully replaces it.

- **`dl reply <thread>`** (body stdin): find the doc holding the anchor by scanning
  all tracked docs (`extractAnchors`); no anchor anywhere → error. Append comment
  (author `claude`), `recordWrite` the thread file, `recordThread('replied', id)`.
  Stdout: `t17 ← reply (design.md)`.
- **`dl comment "<span>" [--doc <doc>] [--block <doc>@<ref>:<n>]`** (body stdin):
  search the span across all tracked docs. ADJUDICATED DEVIATION (2026-07-10,
  accepted): implemented by direct raw-source matching + string splice +
  canonicalise, NOT the editor-backed `newThread` machinery — `dl` runs DOM-free
  (the overview's central call), spans quote the canonical source exactly as
  `dl read` serves it, a mangling splice trips the canonicalize content guard,
  and a formatted span trips lint rule 9b. Semantics otherwise as planned: without flags the span must be
  unique across the whole workspace (0 → `not found`, >1 → `ambiguous: 2 matches in
  design.md, plan.md`); `--doc` narrows to one doc; `--block` narrows to one block of
  a ref-checked doc (stale ref → refuse). Allocates the id via union-wide
  `nextThreadId` (all docs' anchors + store). Journals the doc write + thread file +
  `recordThread('opened', id)`. Stdout: `t26 → design.md@<newref>`.
- **`dl resolve <thread> [--note "<text>"]`**: unwrap anchor in whichever doc holds
  it, write the `resolved.md` marker (author `claude`, body = note) via C0's
  `resolveThread`, journal both (`recordThread('resolved', id, note)`).
  Stdout: `t4 resolved (design.md@<newref>)`.

All three canonicalise any doc they modified before writing (anchor wrap/unwrap must
leave the doc canonical) and record the new hash.

## C4. API canonical conformance (GUI conforms to remark canonical)

Spec decision 2: the external formatter owns canonical form. In `src/api.ts`, pass
the incoming document body through package A's `canonicalize()` before writing, in
both `POST /commit` (before `renderTurn`/write/commit) and `POST /save-draft`. On a
content-preservation throw: 500 with the error, nothing written. Import the remark
canonicalizer only (no DOM needed server-side).

### Correctness criteria
- POST /commit with a body containing `\~`-unescaped `~1-hour` and sloppy list
  spacing → the committed `doc.md` is remark-canonical (`canonicalize(committed) ===
  committed`).
- POST /save-draft same property for the working-tree file.
- A body that trips the content guard → 500, working tree and HEAD untouched.
- Round-trip with the GUI's own current output form (fixture: a GUI-canonical doc)
  → commit succeeds; only escaping-class bytes change.

Known cosmetic wart (accepted at adjudication, fix later): the GUI's *live* Changes
panel diffs the Milkdown editor's serialization against the on-disk baseline, so
lines containing `\~`/`\@` may show phantom word-diffs until the next commit
normalises them (Milkdown's escaping is paragraph-context-dependent; see spec
decision 2). Out of scope for this package.

Note: existing `test/api.test.ts` /commit and /save-draft tests assert byte-equal
read-back of literal bodies (`'v1'`) — under C4 those must be updated to expect the
canonical form (e.g. trailing newline). That reconciliation belongs to this package,
as do the four delete-on-resolve assertions listed in `test/dl/COVERAGE.md` /
the TDD report (threads-store, thread-cli, lint-turn, api tests).

### Correctness criteria
- Reply to a thread anchored in `plan.md` while `design.md` also exists → lands, doc
  correctly inferred (assert output names plan.md).
- Reply to an id with no anchor in any doc → error, store untouched.
- Comment on a span appearing in two docs → ambiguous error naming both; with
  `--doc plan.md` → succeeds; id allocated does not collide with an anchor-only id
  in *another* doc (union allocation test — seed `t9` as anchor in doc A with no
  store dir, expect next id ≥ t10).
- `--block` with stale ref → refuse; with fresh ref and span appearing twice in the
  doc but once in that block → succeeds.
- Resolve with `--note` → anchor unwrapped (visible text preserved byte-for-byte),
  dir retained with `resolved.md` (author `claude`, body = note), note present in
  journal scratch and (integration with C2) in the commit's turn record.
- After each verb: modified doc is canonical; journal hashes match disk.
