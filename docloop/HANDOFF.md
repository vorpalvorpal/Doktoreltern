# docloop — handoff for a dogfooding conversation

*Last refreshed 2026-07-13.*

This orients a fresh Claude conversation that is taking **Claude's turn** in the
docloop human↔LLM review loop. Keep it in sync as docloop changes.

## What docloop is

docloop is a small GUI (a Vite app under `docloop/` in the `~/Documents/skills`
repo) for a human↔LLM document-review loop. A human edits a Markdown document and
leaves comments on it in the browser; Claude reads what changed, edits the
document and answers the comments; the human reloads and sees Claude's changes as
a diff with the replies in the margin. The documents under review are the
**tracked `*.md` files** in `docloop/workspace/` — discovered **recursively**,
each identified by its **path-qualified** workspace-relative id (`whiteboard-
restructure.md`, `nodes/16/design.md`; the path is the doc id everywhere:
refs, turn records, thread ownership). The workspace is its **own git repo**
(separate from the code repo, and gitignored from it) where **each commit is
one turn**. You don't need the dev server running to take a turn — that's the
human's GUI; you take your turn through the `dl` CLI and commit.

Two roots are **excluded from the loop**: `docloop/workspace/archive/` (the
parked/drained move docs) and `docloop/workspace/threads/` (the comment
sidecar store — data, not a doc). Dot-paths (`.hidden.md`, `.git/…`) are never
docs either. Nothing under an excluded root is listed, linted as a doc, or
staged as one. Do not resurrect archived files into the loop.

Whiteboards under review are working surfaces, not authority — the node tree at
`store/` at the repo root is the source of truth (see `MAP.md` at the repo
root, and store node #62 for the non-authority rule).

## The pieces

Comments are stored out-of-line:

- The doc holds only **anchors**, never comment bodies: `:mark[highlighted
  span]{#t1}` inline, or `:::mark{#t1}` … `:::` around whole blocks.
- `docloop/workspace/threads/<id>/` — one directory per comment thread; each
  comment is `0001.md`, `0002.md`, … a tiny `author:` / `created:` frontmatter
  block followed by a free-Markdown body. A `resolved.md` marker (same
  frontmatter shape, body = the note) closes a thread in place; nothing is
  deleted.
- `docloop/workspace/turn.xml` — GUI-owned working state. **Never your input**
  (`dl agenda` derives everything from git) and never staged.

## Your turn — the `dl` CLI

The whole turn goes through one tool: `npm run dl -- <verb>` from `docloop/`
(spec: `docloop/model-api.md`; `npm run dl -- --help` lists the verbs).
Workspace root comes from `DOCLOOP_WORKSPACE`, default `<cwd>/workspace`.
Output discipline: one line to stdout on success; on failure `dl <verb>:
<reason>` to stderr, exit 1, no partial writes (`dl check` is the exception —
it prints its issue list either way). Never hand-author `:mark` directive
syntax, thread ids, comment frontmatter, or `git add` lists — the CLI owns
representation; you own judgement.

1. **`dl agenda`** — *the* read. Everything since your last commit, all human
   turns folded: block-level prose deltas per doc, threads awaiting you,
   human resolutions with notes. If the human left an uncommitted draft,
   agenda first commits it as its own `turn (rjs): recovered draft` and folds
   it in. (`dl orient` for a quick whose-turn/what-docs overview.)
2. **`dl read <doc> [section]`** — numbered blocks + a ref
   (`whiteboard-restructure.md@a3f21c4e`). You need this before editing:
   edits address blocks by ordinal against that ref.
3. **`dl edit <doc>@<ref>`** — replace/insert/delete blocks, many ops per call
   on stdin (`@@ replace 4-5` … `@@ insert-after 9` … `@@ delete 12`), applied
   bottom-up, canonicalised on ingest, stale-ref refused. Carry any inline
   anchors in your replacement text — that's ordinary editing; if an edit
   drops an anchored span the thread goes orphaned and `dl check` flags it
   (resolve or re-anchor it).
4. **`dl comment "<span>"`** (body on stdin; `--doc <doc>` / `--block
   <doc>@<ref>:<n>` to disambiguate) — allocates the id, anchors the span,
   opens the thread.
5. **`dl reply <thread>`** (body on stdin) — doc inferred from the thread id.
6. **`dl resolve <thread> [--note "…"]`** — unwraps the anchor and marks the
   thread resolved **in place** (`threads/<id>/resolved.md`). Use `--note` to
   concede-and-close without losing the reasoning; the note reaches the human
   via the turn record.
7. **`dl check`** — union-aware lint across all tracked docs (recursive,
   path-qualified ids) plus the `threads/` store; dry-run of commit.
8. **`dl commit -m "<subject>"`** — the transactional turn end: refuses if
   anything outside dl's own writes changed mid-turn (foreign-edit guard),
   refuses on `dl check` ERRORs, stages exactly the right files (every
   present doc `*.md`, recursive — never `archive/` or `threads/`-as-docs —
   plus `threads/`, never `turn.xml`), and commits as the fixed model
   author (`docloop-model <model@docloop>`) with a machine-readable YAML turn
   record in the commit message. `--allow-manual` skips the foreign-edit
   guard and canonicalises hand-edited docs — for deliberate out-of-band
   commits only, never a normal turn.

Legacy npm scripts (`npm run thread`, `canonicalize`, `lint-turn`) still exist
but are superseded — don't mix the two protocols within one turn. The old
"one-time remark-canonical reformat" rollout step is moot: the docs it
concerned are now parked in `workspace/archive/`, and the live doc lints
canonical-clean.

**Known state (2026-07-13):** `dl check` currently reports ~24 `orphaned
thread` ERRORs — threads whose anchors live in the *archived* move docs, which
doc discovery no longer scans. `dl commit` will refuse until those threads are
resolved (or otherwise dispositioned by the human). Flag this rather than
bulk-resolving on your own initiative.

The human then clicks **Reload** in the GUI and sees your edits diffed against
their last turn, with your replies in the margin. Keep edits surgical and prose
canonical — the whole point of the loop is honest, low-noise diffs.

### Notes

- **Multi-span, same-id anchors are legal** — one thread id can anchor several
  disjoint spans in the doc.
- **Anchor spans are plain text** — no emphasis or code inside `:mark[...]`
  (lint-enforced until the Milkdown #704 escaping bug is fixed upstream).
- **Don't anchor inside inline code** — it splits the code span in two. Anchor
  the surrounding text instead.
- **`turn.xml` is GUI-owned working state.** Expect it to show as modified
  after your turn; `dl commit` never stages it, and neither should you.
- **Don't number headings manually.** Unnumbered headings mean inserting a
  section is a clean single-block add instead of a renumbering cascade.

## Running the GUI (the human's side)

Two ways to run it, from `docloop/`:

- **`npm run serve`** — the durable, HMR-free runtime for actually *using*
  docloop day to day. Builds the SPA once (`vite build`) and serves it, plus
  the same API endpoints, off a plain `http.createServer`
  (`scripts/server.ts`) with no Vite dev server underneath. Prefer this
  unless you're editing docloop's own source.
- **`npm run dev`** — the Vite dev server, for hacking on docloop's own
  source (HMR, instant rebuilds).

Either way, open the printed URL (default `http://localhost:5173`). "Hand to
Claude" commits the human's turn; "Reload" pulls the latest committed doc;
"Save draft" writes the doc to disk *without* committing — the human can bank
edits across several sittings, and `dl agenda` recovers any dangling draft as
its own human turn when you next pick up.

**Left nav (multi-doc).** The GUI lists every reviewable workspace doc (the
`dl` discovery rule: tracked ∪ working-tree `*.md`, recursive; `archive/`,
`threads/` and dot-paths are never listed) in a left sidebar with a per-doc
state (clean / draft / untracked). Nested docs are grouped into a collapsible
directory tree — labels are basenames, the full path lives in the tooltip,
and a flat workspace still renders the old flat list; clicking a doc switches
the editor to it — `DOCLOOP_DOC` only picks the *initial* doc. Reload / Save
draft / Hand to Claude target the doc the editor is on. The sidebar also has
a **Nodes** section — a read-only tree of the ctx node store, shown only when
`DOCLOOP_NODES` points at the store's root directory.

**Keep the server alive across sleep.** Run it as a durable, self-owned
process — a real Terminal window, or `nohup npm run serve >/tmp/docloop.log
2>&1 &`, or `pm2 start "npm run serve" --name docloop`. macOS then suspends
and resumes the same process on sleep/wake, so the browser reconnects with
nothing lost. Do **not** use `caffeinate` — stopping the machine sleeping
isn't the goal.

**Unsaved-edit safety net (localStorage).** The editor autosaves the live doc
to the browser's `localStorage` on every edit and right before any reload,
keyed per doc (`src/draft-store.ts`); edits are restored on next load with a
"Restored unsaved edits" bar. Caveat: new comments can't POST to a dead
server, so comment only with the server up.

**Only "Hand to Claude" is a real turn boundary.** If you're picking up a
turn, the human is expected to have clicked that, not just Save draft. A
dangling uncommitted draft is no longer a silent hazard — `dl agenda` commits
it as `turn (rjs): recovered draft` and folds it into the delta it reports —
but if the recovery surprises you, say so to the human rather than guessing
whose edits are whose.
