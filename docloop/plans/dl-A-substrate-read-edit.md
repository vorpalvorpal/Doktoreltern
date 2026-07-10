# Package A — substrate, `dl read`, `dl edit`

*Read `dl-00-overview.md` first; its conventions (module layout, ref format, block
model, output discipline) are part of this plan.*

## A1. `blocks.ts`

```ts
export interface Block {
  n: number;            // 1-based ordinal
  segment: string;      // exact source slice, incl. trailing separator
  headingTrail: string[]; // enclosing headings, outermost first (for section context)
}
export function splitBlocks(source: string): Block[];
export function sectionRange(blocks: Block[], heading: string): { from: number; to: number };
```

Implementation notes:
- Parser: `unified().use(remarkParse).use(remarkDirective).use(remarkGfm)`.
  **Add `remark-gfm` to package.json dependencies** (docs contain GFM tables; the
  Milkdown editor side already speaks GFM via `@milkdown/preset-gfm`).
- Use `node.position.start.offset` / `end.offset` to slice; per the overview's rules,
  extend each block's slice to the start of the next block (separator attaches to the
  preceding block); the final block's slice runs to EOF.
- Lists: iterate `list.children` (listItems) as blocks. A loose/tight list's item
  slicing must still tile (item slices from item start to next item start / list end).
- `headingTrail` updates on every heading block (a depth-3 heading pops trail to
  depth 2 then pushes itself).

### Correctness criteria (tests)
- **Tiling**: for each real-doc fixture (adjudicated: `design.md` + `plan.md`
  snapshots in `test/fixtures/dl/` — do not read `workspace/` at test time) and a
  synthetic torture doc (nested lists, tables, fences containing `# fake headings` and
  `@@ 3 @@` lines, `:::mark` containers, html blocks): `segments.join('') === source`.
- A `:::mark{#t1}` container wrapping two paragraphs is **one** block.
- A 3-item bullet list yields 3 blocks; a nested sub-list stays inside its parent
  item's block.
- A fence containing `- not a list item` and `## not a heading` is one block.
- `sectionRange('goals')` on a doc with `## Goals` returns the heading block through
  the block before the next `##`/`#` heading; unknown heading → throws listing
  available headings; duplicate heading text → throws naming both ordinals.
- Empty doc → `[]`; doc that is one paragraph → one block, segment === source.

## A2. `refs.ts`

`refOf(text): string` (sha256 hex, first 8), `parseRef('design.md@a3f21c4e')`,
`assertFresh(docPath, hash)` reads the file and compares.

### Correctness criteria
- Deterministic; differing texts (incl. whitespace-only difference) → different refs.
- `parseRef` rejects missing `@`, empty doc name, non-hex hash.
- `assertFresh` error message contains the *current* ref so the model can retry
  against it after a re-read.

## A3. `canonical.ts`

Single export `canonicalize(md): Promise<string>` — **remark engine per the spike
verdict in `dl-00-overview.md`** (pinned options + directive gate + list-spread
normaliser as specified there). No DOM. Content-preservation guard: flatten visible
text before/after (reuse the spirit of `src/content-check.ts`, but mdast-based — no
editor) and throw on any change; callers convert to exit 1, no write. Keep a
`canonicalizeMilkdown` export delegating to the existing `src/canonicalize.ts`
(lazy DOM bootstrap) for the fixed-point comparison tests only.

### Correctness criteria
- Idempotence: `canonicalize(canonicalize(doc)) === canonicalize(doc)` on the fixture
  corpus and the torture doc (fixtures are re-canonicalised once in test setup —
  they currently carry GUI escaping that remark rewrites).
- **GUI round-trip identity** (jsdom test; adjudicated 2026-07-10, replaces the
  original byte-exact fixed-point criterion): `canonicalize(canonicalizeMilkdown(
  canonicalize(doc))) === canonicalize(doc)` for the fixture corpus and the
  guard-clean torture doc.
- Preserves `:mark[...]` and `:::mark` anchors byte-for-byte on the fixtures.
- List-spread normaliser: a tight task list / a tight bullet item with a nested
  sublist canonicalises loose; a plain tight bullet list of single-paragraph items
  stays tight.

## A4. `journal.ts` (turn scratch)

Purpose: (1) let `dl commit` refuse when someone else wrote mid-turn; (2) carry
resolution notes to the turn record. Location: `<workspace>/.git/docloop/turn.json`
(inside `.git` ⇒ never tracked, survives nothing it shouldn't — it is per-turn scratch,
cleared by `dl commit`).

```ts
interface TurnScratch {
  writes: Record<string, string>;      // path (repo-relative) -> sha256 after last dl write
  threads: { opened: string[]; replied: string[]; resolved: { id: string; note?: string }[] };
}
export function recordWrite(ws: string, relPath: string, bytes: string): void; // upsert
export function recordThread(ws: string, kind, id, note?): void;
export function readScratch(ws: string): TurnScratch | null;
export function clearScratch(ws: string): void;
```

Every dl verb that writes a workspace file calls `recordWrite` for each file it wrote.

### Correctness criteria
- Round-trip: record → read returns what was recorded; clear → read returns null.
- `recordWrite` twice for one path keeps the latest hash only.
- Files land under `.git/docloop/` (assert path), auto-creating the dir.

## A5. `dl read <doc> [section]`

Output format (stdout):

```
design.md@a3f21c4e blocks 1-42
@@ 1 @@
# DESIGN
@@ 2 @@
First paragraph…
```

- Header line: `<ref> blocks <from>-<to>` (section reads show the sub-range; ref is
  always the ref of the **whole doc**).
- Each block preceded by a marker line `@@ <n> @@`; block segment printed verbatim
  **without** its trailing blank-line separator (the marker line provides separation).
- Reads the working-tree file as-is (it is canonical by invariant; `dl read` does not
  canonicalise, that's write-side work).
- Unknown doc → error listing tracked docs.

### Correctness criteria
- On a fixture doc: header ref equals `refOf(file bytes)`; marker count equals
  `splitBlocks` length; stripping markers and re-inserting the separators reconstructs
  the doc exactly.
- Section read of `## Goals` prints only that range, with the full-doc ref and the
  true global ordinals (not renumbered from 1).
- Errors (unknown doc / unknown or ambiguous section) exit 1, write nothing to stdout.

## A6. `dl edit <doc>@<ref>` (ops on stdin)

Stdin grammar (one or more ops):

```
@@ replace 4-5
replacement markdown (any number of lines)

@@ insert-after 9
new block(s)

@@ delete 12
```

- Op header: `^@@ (replace|insert-after|delete) <n>(-<m>)?$`. `insert-after 0` means
  insert at top. `delete` takes no body; `replace`/`insert-after` bodies are the lines
  up to the next op header / EOF, with trailing blank lines trimmed.
- A body line itself matching the op-header grammar → hard error (`ambiguous body`)
  before any work.
- Validation order (all before any write): parse ops → ranges within 1..N,
  `n<=m` → pairwise non-overlapping targets (two inserts at the same point: error) →
  `assertFresh(doc, ref)`.
- Apply bottom-up on the `splitBlocks` segments (replace = splice segment(s) with body
  + separator; delete = remove segments; insert-after n = insert body + separator after
  segment n). Then `canonicalize()` the whole result; then run package C's
  `checkcore` **anchor-consistency scan in warn mode if available, else skip —
  A must not depend on C**; write file; `recordWrite`.
- Stdout on success, one line:
  `design.md@<newref> shift: 4:-1` — the shift list has one entry per op,
  cumulative, meaning "old ordinals ≥ k map to +d". Nothing shifted → `shift: none`.
  (Format `k:+d` pinned by the tests; this example was aligned to them at the
  post-audit adjudication.)
- Stale ref → exit 1, message includes current ref. Any error → file untouched.

### Correctness criteria
- Single replace of a middle paragraph: file content equals hand-spliced expectation
  (canonicalised); returned ref equals `refOf(new bytes)`; shift `none` for
  equal-block-count replace, correct signed shift otherwise.
- Multi-op call (replace 2, delete 7, insert-after 10, given in *ascending* order)
  applies as if bottom-up: each op's target ordinals refer to the **original** ref's
  numbering.
- Overlapping ops (replace 3-5 + delete 4) → error, file byte-identical to before.
- Stale ref (file modified after read) → error naming the current ref, no write.
- Replacement body carrying an existing inline anchor `:mark[x]{#t3}` survives
  canonicalisation and lands in the file.
- Editing with body that canonicalises differently (e.g. `*  sloppy   list` spacing)
  lands in canonical form and the file remains canonical (`canonicalize(file) === file`).
- Shift-map property test: for a random op set, every untouched old ordinal + reported
  shift = its ordinal in `splitBlocks(new)`.
- `insert-after 0` prepends; `delete 1-N` empties the doc to zero blocks (adjudicated:
  the file becomes the empty string, 0 bytes).

## A7. `scripts/dl.ts` dispatcher

Verbs: `read`, `edit` (real); `agenda`, `orient`, `check`, `commit`, `reply`,
`comment`, `resolve` (stubs exiting 1 with `dl <verb>: not implemented yet`). `--help`
prints one line per verb. Add npm script `"dl"`. Adjudicated structure (see
overview "Pinned module APIs"): each verb lives in `scripts/dl/cmd-<verb>.ts`;
the dispatcher only routes — later packages replace stub files, never `dl.ts`.
Workspace root: `DOCLOOP_WORKSPACE` env var, default `<cwd>/workspace`. Package A
also implements `gitio.ts` **in full**, including plan B1's `lastModelCommit`/`docAt`
signatures (make `test/dl/gitio.test.ts` green).

### Correctness criteria
- `npm run dl -- read <fixture>` round-trips as in A5 (integration test via execFile,
  pattern as in `test/thread-cli.test.ts`).
- Unknown verb → exit 1, terse usage on stderr.
