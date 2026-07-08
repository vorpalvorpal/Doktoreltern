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
files*. The document under review lives at `docloop/workspace/doc.md`, which is
its **own git repo** (separate from the code repo, and gitignored from it) where
**each commit is one turn**. You don't need the dev server running to take a turn —
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
  over. **This is what you read.** It has a `<threads>` section (only the threads
  that *changed this turn* — `status="opened|updated|resolved"`, each carrying its
  full current comments) and an `<edits>` section (a word-level diff of the prose
  as `<ins>`/`<del>`, grouped by heading).

## Your turn

Anchors, comments, and lint checks go through dedicated tools now — never
hand-author `:mark` directive syntax, thread ids, or comment frontmatter
yourself (the same principle the GUI itself follows: it wraps a live
selection rather than letting a human type the directive).

1. **Read** `docloop/workspace/turn.xml` — that's the human's delta and the
   threads waiting on you.
2. **Edit** `docloop/workspace/doc.md` directly for any requested prose changes.
3. **Comment** on the human's text by anchoring a span:
   `npm run thread -- new "<exact span>"` (reply body via stdin), e.g.:
   ```
   echo "why this phrasing?" | npm run thread -- new "the exact span to anchor"
   ```
   This allocates the next id, applies the anchor via the same function the
   GUI's own highlight-and-comment action uses, and creates the first comment —
   printing the assigned id. Errors (rather than guessing) if the span is
   missing or ambiguous in the doc.
4. **Reply** to an existing thread: `npm run thread -- reply <id>` (body via
   stdin).
5. **Resolve** a thread: `npm run thread -- resolve <id>` — unwraps the anchor
   back to plain text and deletes `threads/<id>/` in one step.
6. If you hand-edited `doc.md` prose in step 2, **normalise** it so the diff
   stays byte-clean: `npm run canonicalize -- workspace/doc.md`. This can now
   **fail loudly** (nonzero exit, no write) if it detects the normalisation
   would corrupt the text — if it does, stop and investigate; don't commit
   around it.
7. **Lint the turn**: `npm run lint-turn` — must exit 0 before committing (it
   checks anchors ↔ thread directories ↔ well-formed frontmatter are all
   consistent).
8. **Commit** the turn in the workspace repo:
   `git -C workspace add doc.md threads && git -C workspace commit -m "…"`.

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

From `docloop/`: `npm run dev`, then open the printed URL (default
`http://localhost:5173`). Not needed to take a turn, but useful for seeing the
state. "Hand to Claude" commits the human's turn and writes `turn.xml`; "Reload"
pulls the latest committed doc; "Save draft" writes `doc.md` to disk *without*
committing or touching `turn.xml` — it lets the human bank edits across several
sittings before one real "Hand to Claude" turn.

**Keep the server alive across sleep.** `npm run dev` launched as a throwaway
background job dies when the machine sleeps (or the launching session drops), and
a *restart* is what discards in-flight work. Run it as a durable, self-owned
process instead — a real Terminal window, or `nohup npm run dev >/tmp/docloop.log
2>&1 &`, or `pm2 start "npm run dev" --name docloop`. macOS then *suspends* and
resumes the same process on sleep/wake, so the browser reconnects to it with no
full reload and nothing is lost. Do **not** use `caffeinate` — that stops the
machine sleeping, which isn't the goal.

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
