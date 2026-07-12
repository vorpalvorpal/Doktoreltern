# E — GUI left nav: workspace docs + node-tree seam

*Companion to `dl-00-overview.md` (shared conventions). This package is GUI-side (like
package D), not a `dl` verb. TDD: the tests named below are written against the
correctness criteria here BEFORE implementation; where a plan is silent or looser than
a test, match the test. Implementers: report requested plan changes rather than
silently deviating.*

## Goal

A **left sidebar** in the review GUI with two sections:

1. **Docs** — the workspace's reviewable docs (same discovery rule as `dl`:
   tracked top-level `*.md`, plus any untracked top-level `*.md` sitting in the
   working tree). Clicking one **switches the editor to it** — the GUI stops being
   hard-wired to a single `DOCLOOP_DOC`.
2. **Nodes** — a **seam** for the (local, still-draft-schema) ctx node store: a
   `GET /nodes` endpoint + a read-only tree renderer, fed by a generic
   directory-walker. Hidden entirely unless the server is configured with a store
   path (`DOCLOOP_NODES`). Clicking nodes does NOT switch the editor yet (the store
   lives in a different repo root; wiring that up waits for the store schema to
   settle). Title + state only.

Out of scope: editing/committing node files; per-node gauges (seal/fidelity/
confidence); multi-doc simultaneous view; any change to the `dl` CLI.

## Server (src/api.ts + the two mounts)

`ApiConfig` gains `nodesDir?: string` (absent = no node store). Both mounts
(`vite.config.ts`, `scripts/server.ts`) read it from `process.env.DOCLOOP_NODES`
(absolute or cwd-relative path). `scripts/server.ts` adds `/docs` and `/nodes` to
`API_PATHS`.

### Doc-name validation (shared by all doc-param endpoints)

A requested doc name is **safe** iff: non-empty, no `/` or `\`, not `.` / `..`, does
not start with `.`, and ends with `.md`. Unsafe → **400** `{ ok: false, error: … }`,
nothing written. (This is the path-traversal guard; `turn.xml` is excluded by the
`.md` rule.)

### `GET /docs`

Returns `{ ok: true, docs: [{ name, state }], default: <cfg.docName> }`.

- Discovery: union of tracked top-level `*.md` (`git ls-files -- '*.md'`, filtered to
  no `/` — the `scripts/dl/docs.ts` rule) and working-tree top-level `*.md` files.
  Sorted by name. Never `turn.xml`, never nested files, never `threads/`.
- `state` per doc:
  - `untracked` — in the working tree but never committed;
  - `draft` — tracked, and the working-tree bytes differ from `HEAD:<name>`
    (includes "deleted from the working tree but still tracked");
  - `clean` — tracked and identical to `HEAD:<name>`.
- Empty/new workspace → `{ ok: true, docs: [], default: … }` (after `ensureRepo`).

### Doc parameter on the existing endpoints

`GET /doc`, `POST /commit`, `POST /save-draft` accept `?doc=<name>` (URL-encoded).
Absent → `cfg.docName` (today's behaviour, byte-for-byte). Unsafe name → 400.

- `GET /doc?doc=X` — `current` = working-tree `X` else `HEAD:X` else
  `{ present: false }`; `baseline` = `HEAD~1:X` else null; `baselineIso` unchanged
  (HEAD~1 commit time — commit == turn, whole-workspace).
- `POST /commit?doc=X` — canonicalise body, render `turn.xml` for **X** (delta vs
  `HEAD:X`), write X, `git add X threads`, commit. Other docs' working-tree drafts
  are **not** staged and **not** modified.
- `POST /save-draft?doc=X` — canonicalise + write X only.

### `GET /nodes` (the seam)

- No `nodesDir` configured → `{ ok: true, present: false, nodes: [] }`.
- `nodesDir` configured but missing on disk → same `present: false` shape (the GUI
  must degrade silently, not error).
- Configured and present → `{ ok: true, present: true, nodes: NodeEntry[] }`.

`src/nodes-fs.ts` exports `readNodeTree(root: string): Promise<NodeEntry[]>`:

```ts
interface NodeEntry {
  id: string;        // path relative to root, posix separators — stable key
  title: string;     // directory basename (schema-agnostic v1)
  state: string;     // 'unknown' in v1 — reserved for the settled store schema
  docs: string[];    // *.md filenames directly inside this directory, sorted
  children: NodeEntry[]; // subdirectories, sorted by title
}
```

Walker rules: one `NodeEntry` per directory under `root` (root itself is not an
entry — its subdirectories are the top level); skip dot-directories (`.git` etc.)
and dot-files; do not follow directory symlinks; hard depth cap 12 (deeper content
ignored, not an error). Pure fs, no git.

## Client

### Layout (index.html + style.css)

Three columns: `<nav id="nav" class="nav">` (220px, sticky) | doc | threads gutter.
`.layout` becomes `grid-template-columns: 220px minmax(0, 1fr) 320px`, `max-width`
raised to 1340px. Nav has two sections:

```html
<section id="nav-nodes" hidden>
  <h2 class="nav-heading">Nodes</h2>
  <ul id="node-tree" class="node-tree"></ul>
</section>
<section id="nav-docs">
  <h2 class="nav-heading">Docs</h2>
  <ul id="doc-list" class="doc-list"></ul>
</section>
```

Styling follows the existing palette variables; active doc gets `--accent` treatment;
`draft`/`untracked` docs get a small dot marker with a title tooltip.

### `src/docs-client.ts`

`fetchDocs(): Promise<{ docs: DocInfo[]; default: string }>` and
`fetchNodes(): Promise<{ present: boolean; nodes: NodeEntry[] }>` — thin typed fetch
wrappers matching `threads-client.ts` in spirit (throw on non-ok / network failure;
caller decides the fallback).

### `src/nav.ts` (pure DOM renderers — unit-tested)

- `renderDocList(host, docs, activeName, onSelect)` — one `<li class="doc-item">`
  per doc: name, `active` class on the active doc, `data-state` attribute +
  `.doc-dot` marker when state ≠ clean. Click on a non-active item calls
  `onSelect(name)` (clicking the active one is a no-op). Re-render = replaceChildren.
- `renderNodeTree(host, nodes)` — nested `<details class="node">/<summary>` per
  NodeEntry (native expand/collapse, no JS state): summary = title (+ state badge
  when `state !== 'unknown'`); the node's `docs` render as muted, non-interactive
  `<li class="node-doc">` leaves; children recurse. Top-level nodes start open,
  deeper levels closed.

### main.ts wiring

- `App` gains `docName: string` (from the initial `/doc` response's `name`) and
  `docs: DocInfo[]`.
- `loadState(name?)` passes `?doc=` when given; Reload reloads `app.docName`;
  Commit / Save-draft POST with `?doc=<app.docName>` and, on success, refresh the
  doc list (states may have flipped clean↔draft).
- `switchDoc(app, name)` (no-op when already active):
  1. `sealDrafts(app)` — settle any in-flight compose;
  2. `autosaveDraft(app)` — bank the outgoing doc's unsaved edits to its
     per-doc localStorage slot (draft-store is already keyed by name);
  3. `loadState(name)`; on failure: leave the current doc in place and rerender
     the nav (no destructive half-switch);
  4. on success: update `docName`, load markdown, reset `baselineMd`/`baselineIso`,
     `app.draft = { name, base: current }`, restore that doc's localStorage draft
     if one exists (same banner flow as startup), clear `acceptedChanges`, clear
     `draftSeq`, `collapseInitialized = false`, refetch threads, rerender doc list +
     view.
- Startup: after the existing loads, `fetchDocs()`/`fetchNodes()` populate the nav.
  Offline/sample mode (either fetch throws, or `isSample`): nav shows the sample doc
  as a single inert active item; nodes section stays hidden.

## Correctness criteria → tests (written first)

`test/api-docs.test.ts` (server, temp-workspace pattern from `api.test.ts`):
1. `/docs` on an empty workspace → `{ ok: true, docs: [], default: 'doc.md' }`.
2. commit `doc.md`, save-draft `notes.md` (untracked), commit `design.md` then
   save-draft different bytes to it → `/docs` lists exactly
   `[design.md draft, doc.md clean, notes.md untracked]` (sorted).
3. `turn.xml` and nested `sub/dir.md` (committed via a manual git call) never appear.
4. `GET /doc?doc=design.md` returns design's content/name, not `doc.md`'s.
5. Per-doc baseline: commit design v1, then commit design v2 → `?doc=design.md`
   baseline = v1 (canonical); a doc untouched by the last commit has
   baseline == current.
6. `POST /commit?doc=a.md` leaves an unrelated `b.md` working-tree draft
   uncommitted and byte-identical.
7. Unsafe names 400 and write nothing: `../evil.md`, `a/b.md`, `.hidden.md`,
   `turn.xml`, `` (empty ?doc=), on all three endpoints.
8. No `?doc=` behaves exactly as before (the existing `api.test.ts` must keep
   passing untouched — that suite is a regression gate for this package).
9. `/nodes` with no `nodesDir` → `{ ok: true, present: false, nodes: [] }`;
   with a `nodesDir` pointing at a missing path → same.
10. `/nodes` with a real temp tree `a/{x.md,y.md}`, `a/b/{z.md}`, `.git/…`,
    `a/.hidden/…` → nested entries with correct ids (`a`, `a/b`), titles, sorted
    docs, dot-dirs/dot-files skipped, `state: 'unknown'`.

`test/nodes-fs.test.ts`: walker unit tests — empty root, nesting, sort order,
dot-skip, depth cap (build depth 14, expect truncation at 12), directory-symlink
not followed (skip on platforms where symlink creation fails).

`test/nav.test.ts` (jsdom): renderDocList — item per doc, active class placement,
dirty dot only for non-clean states, click fires onSelect with the name, click on
active does not fire; re-render replaces rather than appends. renderNodeTree —
nested structure matches input, docs rendered as leaves, state badge only when
state ≠ 'unknown', top level open / children closed.

Main.ts wiring is **not** unit-tested (it's the same untested-glue tier as the rest
of main.ts); it is covered by the end-to-end verification pass below.

## Verification (after implementation)

1. `npm test` — full suite green (including untouched `api.test.ts`).
2. `npm run build` — clean.
3. Live check: build + `scripts/server.ts` against a scratch workspace containing
   2–3 committed docs with different content + one draft, `DOCLOOP_NODES` pointed
   at a scratch node tree; drive with Playwright/Chromium: sidebar lists docs with
   states, clicking switches the editor content, commit goes to the right doc,
   node tree renders. Screenshot for the PR.
