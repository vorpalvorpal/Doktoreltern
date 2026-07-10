# dl implementation plans — overview & shared conventions

*Companion to `docloop/model-api.md` (the spec). Four work packages (A–D) below, each
with its own plan file. The TDD test suite is written against the correctness criteria
in these plans before implementation starts. Implementers: if a plan is wrong or
underspecified, do NOT silently deviate — finish what you can, and report the requested
plan change with your reasoning for adjudication.*

## Where things live

- CLI entry: `docloop/scripts/dl.ts`, dispatching subcommands. npm script:
  `"dl": "vite-node scripts/dl.ts --"`. All verbs run from the `docloop/` dir; the
  workspace is `docloop/workspace/` (its own git repo).
- Core modules: `docloop/scripts/dl/` — `blocks.ts`, `refs.ts`, `docs.ts`, `gitio.ts`,
  `canonical.ts`, `agenda.ts`, `editops.ts`, `checkcore.ts`, `commitcore.ts`,
  `verbs.ts`, `journal.ts`. Every module is pure-ish and unit-testable without argv /
  process.exit (same split as `thread.ts` / `thread-actions.ts`).
- Tests: `docloop/test/dl/*.test.ts`, vitest (existing `vitest.config.ts`). Tests that
  need a git repo create a throwaway workspace under a temp dir (see existing
  `api.test.ts` for the pattern) — never touch `docloop/workspace/`.
- Reuse, don't fork: `src/threads.ts` (`extractAnchors`, `unwrapAnchor`,
  `stripAnchors`, `nextThreadId`), `src/threads-store.ts`, `src/canonicalize.ts`,
  `src/content-check.ts`, `scripts/dom-bootstrap.ts`, `scripts/thread-actions.ts`
  (port, then leave the old CLI in place until dl replaces it — do not delete
  `scripts/thread.ts` / `lint-turn.ts` in these packages).

## Canonical engine (spike-dependent)

`scripts/dl/canonical.ts` exports `canonicalize(md: string): Promise<string>` behind
one interface. Two engines:
- **remark engine** (if the canonical-form spike verdict is YES / YES-WITH-GUARDS):
  unified + remark-parse + remark-directive + remark-gfm + remark-stringify with the
  spike's pinned options. No DOM. Guards from the spike verdict become lint rules in
  package C.
- **Milkdown engine** (fallback): lazy `bootstrapDom()` + existing
  `src/canonicalize.ts`.

The engine choice is a constant in `canonical.ts`; everything else is engine-blind.

**SPIKE VERDICT (2026-07-09, corrected 2026-07-10): YES-WITH-GUARDS — implement the
remark engine as primary.** remark is idempotent on the corpus; the guaranteed
invariant is **GUI round-trip identity** `remark(milkdown(remark(D))) ===
remark(D)` — NOT a byte-exact Milkdown fixed point (Milkdown escapes `~`/`@`
non-deterministically w.r.t. the string; see spec decision 2). Pinned options:

```ts
{ bullet: '-', rule: '-', ruleRepetition: 3, emphasis: '*', strong: '*',
  fence: '`', listItemIndent: 'one' }
```

plus `remark-directive`, `remark-gfm`, and the repo's own directive-name gate
(`createDirectiveNameGate(['mark'])` from `src/directive-gate.ts`). Additionally the
canonicalizer includes a **list-spread normaliser** plugin: set `spread: true`
(loose) on any bullet list containing a task item or an item with more than one
block child — matching Milkdown's serializer so canonical text is a Milkdown fixed
point. Known Milkdown-divergent constructs are guarded by lint (package C rule 9),
not by the formatter: nested emphasis, formatting inside `:mark[...]` spans, bare
`:mark` literal outside code, raw `<br>`. The Milkdown engine remains available
behind the same interface for comparison tests only. `dl` runs DOM-free.

Consequence for the GUI side (package C4): the API canonicalises document bodies on
`/commit` and `/save-draft`, so GUI-saved docs conform (they currently differ only in
`\~`/`\@` escaping — a one-time ~3-line reformat of design.md/construct.md at
rollout).

## Git & attribution conventions

- All git ops go through `gitio.ts`: `execFile('git', ['-C', workspace, ...])`.
- Model identity: author `docloop-model <model@docloop>` on every `dl commit`
  (via `--author`, committer left alone). Human/GUI commits are unchanged.
- Agenda boundary = most recent commit with author email `model@docloop`; fallback:
  most recent commit whose subject matches `/^C turn:/`; fallback: the empty tree
  (i.e. everything since repo start).
- Recovered-draft commits: author `rjs <rjs@docloop>`, subject
  `turn (rjs): recovered draft`.

## Output discipline (all verbs)

- Success: **one line** to stdout (plus optional `warn:` lines), exit 0.
- Failure: `dl <verb>: <terse reason>` to stderr, exit 1, **no partial writes** —
  every verb either completes its filesystem effect entirely or leaves the workspace
  untouched (write to temp + rename, or validate fully before first write).
- No banners, no progress output. vite-node noise: acceptable for now.

## Resolved threads (spec decision 9)

Resolving a thread **marks** it (`threads/<id>/resolved.md`, comment-shaped
frontmatter `author`/`created`, body = optional note) rather than deleting the
directory. Ids are never reused; GUI rendering is anchor-driven and unaffected.
Plan C0 owns the store change; B and C consume the `Thread.resolved` field.

## Doc discovery

`docs.ts`: tracked top-level `*.md` files of the workspace repo
(`git ls-files -- '*.md'` filtered to no `/`), which never includes `turn.xml`.
Thread ids are workspace-global: allocation (`nextThreadId`) scans **all** docs'
anchors plus the `threads/` store.

## Ref format

`<doc>@<hash>` where `<hash>` = first 8 hex chars of SHA-256 of the doc's exact bytes
(the canonical form on disk). `refs.ts`: `refOf(bytes)`, `parseRef(str)`,
`assertFresh(docPath, hash)` → typed error `stale ref (doc is now <doc>@<h'>) — re-read`.

## Block model (shared by read/edit/agenda)

`blocks.ts` parses canonical source with remark-parse + remark-directive + remark-gfm
and enumerates **blocks** 1-based:

1. One block per top-level mdast node — heading, paragraph, code fence, table,
   blockquote, thematic break, html, leaf/container directive…
2. …except a **list**, which contributes one block per top-level `listItem` (the
   item's nested content, including nested lists, rides with it).
3. …and a **`containerDirective` (`:::mark`) is a single block**, fences included.
4. Block *segments* are slices of the original source string (use mdast `position`
   offsets). Inter-block separators (blank lines) attach to the **preceding** block's
   segment; any leading whitespace attaches to the first block.
5. **Tiling invariant: `segments.join('') === source`.** This is the load-bearing
   correctness property for edit splicing — test it hard.

Section selection (`dl read <doc> [section]`): case-insensitive exact match on heading
text; the section spans from that heading block to just before the next heading of the
same or shallower depth (or EOF). Ambiguous heading text → error listing matches.

## Pinned module APIs & adjudications (post-TDD, 2026-07-10)

The TDD suite in `test/dl/` is the **executable contract**: where a plan is silent
or looser than a test, match the test. Pinned by adjudication:
- Workspace root resolution: `DOCLOOP_WORKSPACE` env var, default `<cwd>/workspace`.
- `editops.ts`: `parseEditOps(stdin)` / `applyEditOps(...)`; shift reported as
  `{from, delta}[]`.
- `agenda.ts`: `blockDelta(old, new)` → items `{old: string[], new: string[],
  headingTrail: string[]}`.
- `checkcore.ts`: `checkWorkspace(ws)` → issues carrying a `doc` field.
- `canonical.ts` exports `assertContentPreserved(before, after)`; the guard is
  tested by fault injection (no natural corrupting construct is assumed to exist
  under the remark engine).
- `dl edit` delete-all result: the doc becomes the **empty string** (0 bytes).
- The dispatcher (`scripts/dl.ts`) routes each verb to its own
  `scripts/dl/cmd-<verb>.ts` module — packages B and C implement their verbs by
  replacing their own stub files and never edit `dl.ts` or each other's files.
- `gitio.ts` is implemented **in full by package A** (including plan B1's
  `lastModelCommit` / `docAt`), so B starts on green gitio tests.

## Work packages

- **A — substrate + read + edit** (`dl-A-substrate-read-edit.md`): blocks, refs, docs,
  canonical, journal, `dl read`, `dl edit`.
- **B — agenda + orient** (`dl-B-agenda.md`): boundary detection, draft recovery,
  block-level union delta, thread triage, `dl agenda`, `dl orient`.
- **C — check + commit + verb ports** (`dl-C-check-commit-verbs.md`): union lint,
  transactional commit + turn record, `dl reply|comment|resolve`.
- **D — GUI applyAnchor fix** (`dl-D-gui-anchor-fix.md`): word-boundary snapping, no
  fragmentation, no mid-word anchors.

Dependency order: A → (B, C) — B and C are independent of each other. D is independent
of all. The dl.ts dispatcher is created in A with stubs (`not implemented yet` exit 1)
for B/C verbs.
