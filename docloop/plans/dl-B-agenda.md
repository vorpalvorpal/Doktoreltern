# Package B — `dl agenda`, `dl orient`

*Read `dl-00-overview.md` first. Depends on package A (blocks, refs, docs, gitio,
journal). All git plumbing via `gitio.ts`.*

## B1. Boundary detection (`gitio.ts` additions)

```ts
export async function lastModelCommit(ws: string): Promise<string | null>;
// 1. newest commit with author email model@docloop
// 2. else newest commit whose subject matches /^C turn:/
// 3. else null  (=> agenda diffs against the empty tree)
export async function docAt(ws: string, rev: string | null, doc: string): Promise<string>; // '' if absent
```

(No `threadsAt` needed: resolved threads survive on disk with a `resolved.md` marker —
spec decision 9, plan C0 — so resolution state and notes are read from the working
tree, and "new since B" classification uses comment/marker `created` timestamps.)

### Correctness criteria
- In a scratch repo: commits authored by `model@docloop` found over newer human
  commits' heads (i.e. returns the *newest model* commit, not HEAD).
- Legacy fallback: repo whose only model-ish commit has subject `C turn: foo` and
  default author → found by rule 2.
- All-human repo → null.

## B2. Dangling-draft recovery

At the very start of `dl agenda`: if `git status --porcelain` in the workspace is
non-empty (tracked docs or `threads/` modified/untracked), commit everything
(`add -A`) as author `rjs <rjs@docloop>`, subject `turn (rjs): recovered draft`.
The agenda then proceeds against the new HEAD. Print `warn: recovered uncommitted
human draft as its own turn` on stderr.

Exception: if the journal (`.git/docloop/turn.json`) exists and its recorded hashes
match the dirty files, the dirt is the **model's own in-progress turn** (agenda re-run
mid-turn) — do *not* commit it; proceed, noting `warn: model turn in progress`.

### Correctness criteria
- Dirty human draft → agenda commits it first (assert new commit author/subject) and
  reports the draft's changes as part of the delta.
- Clean tree → no commit created.
- Mid-model-turn re-run (journal matches dirt) → no commit, warning emitted.

## B3. Block-level union delta

For each tracked doc: `old = stripAnchors(docAt(B))`, `new = stripAnchors(working
tree)` (anchor add/remove is thread business, not prose — same rule as `renderTurn`).
Diff at block granularity:

- Split both with `splitBlocks` (on the stripped text).
- Match blocks by exact segment equality using an LCS / patience-style alignment over
  block content hashes (`diff` package's `diffArrays` over the hash sequence is fine —
  it is already a dependency).
- Emit each contiguous changed run as one item: the old blocks and new blocks of the
  run, with the *new side's* `headingTrail` (fall back to old side's for pure
  deletions).

A moved block will appear as delete + insert; accepted for v0 (note it in the output
docs? no — just accepted).

### Correctness criteria
- Editing one paragraph in a fixture → exactly one change item, old/new bodies equal
  to the two paragraph versions, correct heading context.
- Inserting a section (heading + 2 paragraphs) → one item, empty old side.
- Pure anchoring change (`:mark` wrapped around a span, nothing else) → **zero** items.
- Reordering two sections → items appear (delete+insert), no crash, no misattribution
  of unrelated blocks.
- Doc absent at B (created since) → single item covering the whole doc, flagged `new
  doc`.

## B4. Thread triage

Inputs: threads in working tree (`listThreads`, now carrying `resolved` markers —
plan C0's `Thread` shape; if C0 hasn't landed when B is built, treat `resolved` as
optional and absent), anchors per doc (`extractAnchors` over each tracked doc),
boundary commit time `Bt` (`git show -s --format=%ct B`).

Classify:
- **awaiting (changed)** — anchor live now, not resolved, AND (has a comment with
  `created > Bt`, or its anchor is new since B — compare against `extractAnchors` of
  each doc at B via `docAt`). Render **full bodies** (all comments, author + body),
  plus the doc and current anchor span.
- **awaiting (unchanged-open)** — anchor live, not resolved, no change since B.
  Render one line: `t7 (design.md) "anchor span…" — last: <author>: <first 80 chars>`.
- **resolved since B** — `resolved.md` marker with `created > Bt` and author ≠ the
  model. Render id + the marker's note (or the thread's final comment if the note is
  empty).

### Correctness criteria
- New human comment on an old thread → changed, full bodies.
- Untouched open thread → one-liner only (assert full body absent from output).
- Thread resolved by a human since B (marker author `rjs`, `created > Bt`) → listed
  as resolved with the marker's note; resolved *before* B → not listed. Legacy case:
  a thread directory deleted outright between B and HEAD (pre-marker data) → listed
  as resolved with no note, no crash.
- Thread opened *and* resolved by the model itself since B (model's own past turn is
  the boundary, so this can't normally occur) — no crash if data says so; classify as
  resolved, don't list as awaiting.
- Multi-doc: threads anchored in different docs each report the right doc.

## B5. `dl agenda` output

Plain markdown to stdout, quiet-format:

```
# agenda (since <shortsha> "<subject>", 3 human turns folded)

## design.md  (now @a3f21c4e)
### prose changes
[1] under "Evidence locality":
  old: …
  new: …
### threads awaiting you
t17 (changed) "the audit lottery" — 3 comments
  rjs: …full body…
t9 (open, unchanged) "twin dispatch" — last: rjs: …
### resolved by rjs
t4 — note: agreed, folded into §3.

## plan.md  (unchanged)
```

Exact layout is the implementer's call within these rules: per-doc sections; changed
threads carry full bodies; unchanged-open are one-liners; docs with no changes and no
awaiting threads collapse to one line; the header names the boundary commit and how
many human turns are folded; current ref shown per doc (the model still runs `dl read`
before editing — the agenda ref is informational).

### Correctness criteria
- Golden-file test: scripted scratch repo (2 human turns after a model turn: one edits
  two docs + replies to one thread + opens one + resolves one, second leaves a draft)
  → agenda output matches a reviewed snapshot (vitest snapshot). Keep the snapshot
  deterministic: fixed author dates via `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE`, fixed
  ids.
- Nothing-to-do state (no human commits since B, clean tree) → single line
  `agenda: nothing new since <shortsha>` and exit 0.

## B6. `dl orient`

One screen: tracked docs with open-thread counts and whose turn it is (author of
HEAD: model ⇒ "human's turn", otherwise "your turn"), plus the last 5 commit subjects
with short shas and authors (model/human tags).

### Correctness criteria
- Scratch repo → output names all docs, counts match store, turn attribution matches
  HEAD author, exactly 5 (or fewer) history lines.
