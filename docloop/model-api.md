# docloop model-side API — high-level spec (v0)

*2026-07-09. Decided in conversation (rjs + C), not doclooped. The human/GUI side is out of
scope except where named. Design constraint throughout: this API is the prototype of the
#60 node store's write path (docloop is that store's HITL surface — build once), and of the
`ideas.md` "Hand to Claude invokes the conversation" dispatch: the agenda below is that
"MCP'd commit as the next turn", computed rather than stored.*

## Why

Measured on the 2026-07-09 CONSTRUCT/VALIDATE round-1 turn: ~12–15k tokens of irreducible
payload (reply bodies + new spec prose) cost ~60–70k — a ~1:4 payload-to-overhead ratio.
The overhead was representation leaking through the interface, in four buckets:

1. **Delta reconstruction** — `turn.xml` is lossy/stale by design (latest hand-off only,
   changed-threads only), so every turn starts with git archaeology.
2. **The byte-level editing tax** — unpredictable canonical form (Milkdown reflow,
   escaping, anchor fragmentation) forces read-exact-bytes → full old+new replacement
   scripts → `--check` cycles; each edited paragraph transits context ~3×.
3. **Orientation** — ~750 lines of HANDOVER/HANDOFF/model-feedback, much of it
   documentation of tool debt (the gotcha list exists because the tools have gotchas).
4. **Triple bookkeeping** — the mechanical turn state hand-summarised into three docs,
   all derivable from git.

Target: ~1:0.5. Non-goal: compressing judgement — reading the docs and writing considered
replies is the work; the tool's job is to stop taxing it.

## Principles

1. **Semantic verbs, not representation.** The model never runs a canonicalizer, never
   chooses what to `git add`, never parses `turn.xml`, never hand-mints thread ids.
   (Anchors are the deliberate exception — see below: visible and model-carried, because
   they are content, not representation.)
2. **All coordination state is derived from git.** The agenda is computed
   since-my-last-commit; nothing the model relies on is stored state that can go stale.
   This kills the `turn.xml` bug class structurally rather than patching it.
3. **Quiet output.** The same discipline the workflow specs demand of substrate gates:
   one line on success, terse structured failure. No build-tool banners. A single
   entrypoint (working name `dl`), not `npm run` wrappers.
4. **Workspace-scoped.** Thread ids are globally unique, so the tool infers the doc;
   `DOCLOOP_DOC` dies. Lint is union-aware across all workspace docs (fixes the
   multi-doc blindness of 2026-07-09).
5. **One function core, multiple thin frontends.** CLI for the model now; the same core
   should power the GUI's reload/diff view (one delta engine, two consumers) and later
   the #60 store's validated write path and the GUI-dispatched model turn (`ideas.md`).

## Verbs

### Reads

- **`dl orient`** — one generated screen: docs under review, open threads per doc, whose
  turn, last few turn one-liners. Replaces the mechanical half of `HANDOVER.md`.
- **`dl agenda`** — *the* read. Everything since the model's last commit, all human turns
  folded (union, not latest): per doc — prose changes at **block level** (old paragraph →
  new paragraph with section context; the word-diff is established as unusable for
  authoring), threads awaiting the model (full bodies, changed vs unchanged-open flagged),
  and human resolutions (with notes). Replaces `turn.xml` as a model-facing artifact.
  **Turn attribution is by git author**: `dl commit` commits as a fixed model identity
  (`docloop-model <model@docloop>`); the GUI's commits stay the human's. The agenda
  boundary is the last model-authored commit (fallback for the pre-`dl` history: last
  `C turn:`-prefixed message; else the repo root). **Dangling-draft recovery happens
  here, not at commit time**: if the working tree holds uncommitted human edits when the
  turn starts, `dl agenda` first commits them as their own `turn (rjs): recovered draft`
  and folds them into the delta it reports — recovery at commit time is too late, because
  by then human and model edits are inseparable in one working tree.
- **`dl read <doc> [section]`** — canonical content with **numbered blocks** and a **ref**
  (short content hash of the canonical doc bytes the numbering was computed against), e.g.
  `construct.md@a3f21c`. Block enumeration is defined over the mdast of the canonical
  source: one block per top-level node (heading, paragraph, fence, table, blockquote,
  thematic break), except a **list contributes one block per top-level item** (an item's
  nested content rides with it) and a **`:::mark` container anchor is a single block**
  (its fences are content, carried like inline anchors). Invariant: the blocks' source
  segments concatenate back to the exact canonical doc. Inline anchors appear as-is.

### Writes

- **`dl edit <doc>@<ref> …`** — replace/insert/delete blocks by ordinal, valid only
  against `<ref>`. Tool verifies the on-disk doc still matches the ref (stale → refuse
  with "re-read"), splices, canonicalizes on ingest, lints, and returns the **new ref**
  in one line. **One call carries any number of operations against the same ref**
  (`replace <n[-m]>`, `insert-after <n>`, `delete <n[-m]>`, bodies on stdin in a trivial
  op-delimited format); the tool checks the ops are non-overlapping and applies them
  bottom-up, so one `dl read` funds a whole editing pass — this is the primary mode.
  Chaining across calls is still possible: the success line includes the ordinal shift
  (`blocks ≥ 12 now +2`), so a follow-up edit above or below the splice needs no
  re-read. Bodies are plain markdown and **carry any inline anchors the model keeps,
  moves, or rewords** — that is ordinary editing. Optimistic concurrency; formalises
  the `lines[i]` + `assert` recipe.
- **`dl reply <thread>`** (stdin) — as today, doc inferred from the thread id.
- **`dl comment "<span>" [--block <n>]`** (stdin) — creates thread + anchor. **Anchor
  creation is tool-only** (id allocation); placement snaps to word boundaries and must
  never fragment or split mid-word.
- **`dl resolve <thread> [--note]`** — unwraps the anchor and marks the thread
  resolved. **Resolution no longer deletes the thread directory** (decided 2026-07-09
  after checking the GUI blast radius — rendering is anchor-driven, so surviving dirs
  are invisible to it): a `threads/<id>/resolved.md` marker (same frontmatter shape as
  comments: `author`/`created`, body = the note) closes the thread in place. Reasoning
  survives as first-class data — "concede-and-close" without deleting the argument
  (2026-07-08 friction #1), and the pattern the #60 store wants for dead ends. The note
  is echoed into the turn record; GUI resolves write the same marker (author `rjs`).
- **`dl check`** — union-aware workspace lint; dry-run of commit. Union scope: **all
  tracked top-level `*.md` in the workspace repo** (never `turn.xml`) plus the
  `threads/` store — anchor↔thread consistency and id uniqueness are computed across
  that whole union, and id allocation scans it too.
- **`dl commit`** — transactional turn end: validate (check) + canonicalize + stage
  exactly the right files (never `turn.xml`) + commit as the fixed model author. The
  **machine-readable turn record is the structured commit-message body** (docs touched,
  threads opened/replied/resolved, resolution notes) — no extra file; it stays derivable
  from git forever, and the GUI/scheduler reads it from there. Refuses on inconsistency,
  and refuses if the working tree differs from the state the last `dl` write produced
  (a human edit landed mid-turn — surface it, never guess whose bytes are whose).

## Anchors 

**Fully inline and visible.** The model reads, carries, moves, and rewords
`:mark[span]{#id}` anchors as part of ordinary editing; the syntax is not the problem and
never was. The historical corruption was (a) the serializer mangling emphasis around
anchors — a canonical-form problem, see Open items — and (b) the GUI's `applyAnchor`
emitting fragmented/mid-word anchors — a placement bug to fix independently. Standoff
annotation (Hypothesis-style selectors) is rejected: quote-based selectors rot fastest
exactly when the document churns, and churn is the point of a hash-out doc; inline anchors
ride the text for free. (Lesson to carry to #60: annotations on heavily-edited text belong
inline.) Rules:

- creation is tool-mediated only (`dl comment` allocates ids);
- lint enforces: valid syntax, plain-text span (until the canonical form makes emphasis
  inside brackets safe), id ↔ thread consistency, no dangling anchors, no unresolved
  orphaned threads (a thread directory with neither a live anchor nor a `resolved.md`
  marker), no resolved thread still anchored, no duplicate ids;
- a model edit that drops an anchored span leaves the thread unanchored — `dl check`
  flags it: resolve the thread or re-anchor via `dl comment`.

## Decisions log

| # | Question | Decision |
| - | -------- | -------- |
| 1 | Anchor representation | **Fully inline, visible, model-carried** (rjs); creation tool-only; lint-enforced. Strip/reinsert and standoff both rejected. |
| 2 | Canonical form owner | **RESOLVED (spike 2026-07-09, corrected at implementation 2026-07-10): remark owns canonical form.** remark-parse + remark-directive + remark-gfm + remark-stringify (pinned: bullet/rule `-`, ruleRepetition 3, emphasis/strong `*`, fence `` ` ``, listItemIndent one) is idempotent, and the **load-bearing invariant is round-trip identity through the API boundary**: `remark(milkdown(canon)) === canon` on the real workspace docs. (A byte-exact `milkdown(canon) === canon` fixed point is unattainable: Milkdown escapes `~`/`@` non-deterministically w.r.t. the string — it depends on inline-mark structure earlier in the paragraph, same serializer-state family as Milkdown #704. Harmless, because the GUI **conforms**: the API canonicalises on `/commit`/`/save-draft`, so Milkdown quirks never reach disk.) Content-level divergences are guarded: nested emphasis (#704), formatting inside `:mark[...]` spans (fragments — already forbidden), bare `:mark` literals outside code (swallowed), raw `<br>` (dropped; use `\` breaks) are lint ERRORs; tight lists with block-content items are normalised loose by a canonicalizer plugin. `dl` runs DOM-free. Known cosmetic wart: the GUI's *live* Changes panel may show phantom word-diffs on `\~`/`\@` lines until the next commit normalises (fix later by canonicalising the diff baseline). |
| 3 | Edit addressing | **Read-ref + ordinal** (content-hash ref + block numbers; stale-ref refusal; each edit returns the new ref). No persistent block ids, no byte-exact old-string matching. |
| 4 | Transport | **Function core + CLI now**; MCP wrapper only when a second consumer exists (scheduler-driven moves). |
| 5 | Agenda scoping | Full docs served for now (fine at current sizes). **Noted, not lost:** at store scale the agenda serves scoped sections + fetch-on-demand — revisit at the #60 migration. |
| 6 | Write batching | **Incremental calls + transactional `dl commit`** as the atomicity point; no manifest format. One `dl edit` call may carry several ops against one ref (applied bottom-up) — that's arguments, not a manifest. |
| 7 | Turn attribution & turn record | **Fixed git author identity per side** (`dl commit` → `docloop-model <model@docloop>`); agenda boundary = last model-authored commit (legacy fallback: `C turn:` message prefix). **Turn record = structured commit-message body**, no extra file. |
| 8 | Dangling human drafts | **Recovered at `dl agenda`** (committed as their own human turn, folded into the reported delta), not at `dl commit` — by commit time human and model bytes are inseparable. `dl commit` instead refuses on mid-turn foreign edits. |
| 9 | Resolved threads | **Marked, not deleted** (rjs, 2026-07-09): resolve unwraps the anchor and writes `threads/<id>/resolved.md` (author/created + note body). GUI rendering is anchor-driven, so this needs no GUI rendering change; ids are never reused; reasoning and notes persist on disk, not just in git history. |

## Open items

- ~~**Canonical-form inversion spike** (decision 2)~~ — **done 2026-07-09**, see
  decision 2. Residual: anchor-adjacent emphasis *inside* spans stays lint-forbidden
  until Milkdown #704 is fixed upstream.
- **GUI `applyAnchor` fix** — snap to word boundaries, never fragment, never mid-word
  (fragmented anchors arrived *inbound* on 2026-07-09: t17 in 8 pieces, t21/t25 mid-word).
- **Agenda scoping at store scale** (decision 5) — parked, revisit at #60.
- **Reverse-direction turn record** — the GUI's view of the model's turn should come from
  the same agenda function with roles swapped; confirm the GUI's needs when wiring it.
- **`--note` surfacing in the GUI** — storage is decided (`resolved.md` marker +
  echoed in the turn record); open is only how the GUI presents it (resolved log vs
  margin tombstone).
- **MCP transport** — deferred until the scheduler drives moves with scoped tool windows.

## Suggested build order

1. **`dl agenda`** — kills the biggest *reliability* hole (turn.xml archaeology).
2. **`dl read` / `dl edit`** — kills the biggest *token* tax (byte-level editing).
3. **`dl check` / `dl commit`** — union lint + transactional turn (retires the
   choreography and the multi-doc lint bug).
4. **`dl orient`**, `dl resolve --note`, quiet-output pass over `reply`/`comment`.
5. Canonical-form spike — run it **first**, not merely in parallel: if remark can own
   canonical form, the whole tool goes DOM-free (pure remark, no jsdom/Milkdown boot per
   call) and read/edit/check get simpler and faster. Either way the canonicalizer sits
   behind one interface, with the existing Milkdown `canonicalize()` as the fallback
   engine; interim lint guards suffice if the spike says no.

## Non-goals

- Compressing judgement (reading and thinking are the work).
- Changing the human GUI, except the `applyAnchor` fix, the shared delta engine, and
  the (rendering-invisible) resolved-marker store change behind the Resolve button.
- Building the MCP transport before there is a second consumer.
- Multi-writer concurrency beyond the stale-ref guard (one model turn at a time remains
  the loop's invariant).
