# docloop — handoff for a dogfooding conversation

This orients a fresh Claude conversation that is taking **Claude's turn** in the
docloop human↔LLM review loop. Keep it in sync as docloop changes.

## What docloop is

docloop is a small GUI (a Vite app under `docloop/` in the `~/Documents/skills`
repo) for a human↔LLM document-review loop. A human edits a Markdown document and
leaves comments on it in the browser; Claude reads what changed, edits the
document and answers the comments; the human reloads and sees Claude's changes as
a diff with the replies in the margin. It's a deliberately rough **v0** we're
dogfooding to help co-write the rest of this repo — the "MCP" that would normally
broker the hand-off is, for now, *hand-simulated by Claude working directly in the
files*. The documents under review are the tracked top-level `*.md` files in
`docloop/workspace/` (currently `design.md`, `plan.md`, `construct.md`,
`validate.md`), which is its **own git repo** (separate from the code repo, and
gitignored from it) where **each commit is one turn**. You don't need the dev server running to take a turn —
that's the human's GUI; you just work in the files and commit.

## The pieces

Comments are stored out-of-line:

- `docloop/workspace/doc.md` — the document. It holds only **anchors**, never
  comment bodies: `:mark[highlighted span]{#t1}` inline, or `:::mark{#t1}` … `:::`
  around whole blocks.
- `docloop/workspace/threads/<id>/` — one directory per comment thread; each
  comment is `0001.md`, `0002.md`, … a tiny `author:` / `created:` frontmatter
  block followed by a free-Markdown body.
- `docloop/workspace/turn.xml` — written by the GUI when the human hands a turn
  over. **Superseded as your input by `dl agenda`** (below), which derives the
  same information — and more — from git; ignore `turn.xml` (it stays GUI-owned
  working state).

## Your turn — the `dl` CLI (2026-07-10)

The whole turn now goes through one tool, `npm run dl --` (spec:
`docloop/model-api.md`; run from `docloop/`). Never hand-author `:mark`
directive syntax, thread ids, comment frontmatter, or `git add` lists — the
CLI owns representation; you own judgement.

1. **`dl agenda`** — *the* read. Everything since your last commit, all human
   turns folded: block-level prose deltas per doc, threads awaiting you (full
   bodies when changed, one-liners when merely open), human resolutions with
   notes. If the human left an uncommitted draft, agenda commits it as its own
   `turn (rjs): recovered draft` first and folds it in. (`dl orient` for a
   quick whose-turn/what-docs overview.)
2. **`dl read <doc> [section]`** — numbered blocks + a ref
   (`design.md@a3f21c4e`). You need this before editing: edits address blocks
   by ordinal against that ref.
3. **`dl edit <doc>@<ref>`** — replace/insert/delete blocks, many ops per call
   on stdin (`@@ replace 4-5` … `@@ insert-after 9` … `@@ delete 12`), applied
   bottom-up, canonicalised on ingest, stale-ref refused. Carry any inline
   anchors in your replacement text — that's ordinary editing; a `warn:` tells
   you if an edit dropped an anchored span (resolve or re-anchor it).
4. **`dl comment "<span>"`** (body stdin; `--doc`/`--block <doc>@<ref>:<n>` to
   disambiguate) — allocates the id, anchors the span, opens the thread.
5. **`dl reply <thread>`** (body stdin) — doc inferred from the thread id.
6. **`dl resolve <thread> [--note "…"]`** — unwraps the anchor and marks the
   thread resolved **in place** (`threads/<id>/resolved.md`; nothing is
   deleted). Use `--note` to concede-and-close without losing the reasoning;
   the note reaches the human via the turn record.
7. **`dl check`** — union-aware lint across *all* workspace docs; dry-run of
   commit.
8. **`dl commit -m "<subject>"`** — the transactional turn end: validates,
   stages exactly the right files (never `turn.xml`), commits as the fixed
   model author with a machine-readable turn record in the commit message.
   Refuses if anything outside dl's own writes changed mid-turn.

**One-time rollout step (first dl turn only):** the live workspace docs are
still in the *old* GUI-canonical form, and `dl check` will flag them
non-canonical (escaping differences only, ~3 lines). Before your first real
dl turn, land a dedicated reformat commit: canonicalise every tracked doc,
then `dl commit --allow-manual -m "chore: remark-canonical reformat"` — don't
mix the reformat into a content turn. Legacy commands (`npm run thread`,
`canonicalize`, `lint-turn`) still exist but are superseded; don't mix the
two protocols within one turn.

The human then clicks **Reload** in the GUI and sees your edits diffed against
their last turn, with your replies in the margin. Keep edits surgical and prose
canonical — the whole point of the loop is honest, low-noise diffs.

### Notes

- **Multi-span, same-id anchors are legal** — one thread id can anchor several
  disjoint spans in the doc.
- **Don't anchor inside inline code** — it splits the code span in two. Anchor
  the surrounding text instead.
- **`turn.xml` is GUI-owned working state.** Expect it to show as modified
  after your turn; never `git add` it.
- **Don't number headings manually.** Unnumbered headings mean inserting a
  section is a clean single-block add instead of a renumbering cascade, and it
  plays badly with `<edits>` diffing otherwise.

## Running the GUI (the human's side)

Two ways to run it, from `docloop/`:

- **`npm run serve`** — the durable, HMR-free runtime for actually *using*
  docloop day to day. Builds the SPA once (`vite build`) and serves it, plus
  the same API endpoints, off a plain `http.createServer`
  (`scripts/server.ts`) with no Vite dev server underneath. Nothing about it
  is restart-fragile: there's no HMR to force a reload and lose in-memory
  edits, and it isn't tied to the lifetime of the session that launched it.
  Prefer this unless you're editing docloop's own source.
- **`npm run dev`** — the Vite dev server, for hacking on docloop's own
  source (HMR, instant rebuilds). Not needed to take a turn or to review as a
  human; use `npm run serve` for that instead.

Either way, open the printed URL (default `http://localhost:5173`). "Hand to
Claude" commits the human's turn and writes `turn.xml`; "Reload" pulls the
latest committed doc; "Save draft" writes `doc.md` to disk *without*
committing or touching `turn.xml` — it lets the human bank edits across several
sittings before one real "Hand to Claude" turn.

**Keep the server alive across sleep.** A server launched as a throwaway
background job dies when the machine sleeps (or the launching session drops), and
a *restart* is what discards in-flight work. `npm run serve` already sidesteps
the HMR/reload half of this problem, but still run it as a durable, self-owned
process for the same reason — a real Terminal window, or `nohup npm run serve
>/tmp/docloop.log 2>&1 &`, or `pm2 start "npm run serve" --name docloop` (swap in
`npm run dev` in either command if you're hacking on docloop itself). macOS then
*suspends* and resumes the same process on sleep/wake, so the browser reconnects
to it with no full reload and nothing is lost. Do **not** use `caffeinate` — that
stops the machine sleeping, which isn't the goal.

**Unsaved-edit safety net (localStorage).** The editor autosaves the live doc to
the browser's `localStorage` on every edit and right before any reload, keyed per
doc (`src/draft-store.ts`). If the page reloads (dev-server restart, accidental
refresh, tab crash) your edits are restored on next load with a "Restored unsaved
edits" bar (Discard to revert). This covers the doc text *and* keeps comment
anchors consistent with the already-persisted thread bodies. Caveat: it does
**not** cover edits made while the server is *fully down* — the doc survives in the
browser, but new comments can't POST to a dead server, so comment only with the
server up.

**Only "Hand to Claude" is a real turn boundary.** If you're picking up a turn,
the human is expected to have clicked that, not just Save draft. A dangling
uncommitted draft left on disk gets folded silently into whatever you `git add
&& git commit` next (no data loss, but it blurs whose edits are whose) — if
`git status` in `workspace/` shows `doc.md` modified *before* you've made any
edits of your own, that's a leftover draft, not something you introduced; flag
it to the human rather than committing over it.
