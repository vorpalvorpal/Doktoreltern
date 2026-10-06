# Doktoreltern: what the design is, and how much of it exists

Read-only research on /Users/rjs/dev/Doktoreltern (first commit 2025-11-21, 243 commits, last commit 2026-08-11, both of the last two being research docs; the last code commit was 2026-07-24). Node ids below are store nodes under `store/nodes/` (directory nesting is the tree). "Inferred" marks anything I did not read directly.

## 1. The design in one page

**Pitch** (README.md): find out you are wrong early. A risk-first method for solo technical projects. Tackle the least certain, most depended-on parts first. It ships as Claude Code plugins (r-science, r-data, docloop), which are markdown skills, not a runtime.

**The node tree.** The root epic is node 16 ("a scheduler over a tree-of-hypotheses", rev-6). A project is a tree with cross-cuts. Whiteboard, plan and implement are "moves on a node", not global phases. A node is a folder; a child is a subfolder (16/60). Each node carries:
- `node.md`: a thin index with four frontmatter fields (title, state, state_reason, labels).
- Emoji-sigil markers in the text (ctx/references/markers.md): Confidence, Fidelity, Seal, Boundary, Blocked-by, Design, Cites, plus keyed tracked items: Question (q), Validation (v), Alternative (alt), Future, Refinement, Optimisation, Dead-end (de), Artefact, Pro, Con. Ids look like `#16.q4`.

**Two gauges.**
- Confidence (node 16/32): provenance, not self-report. The evidence ladder runs asserted < prior-art < spiked < mock-validated < implemented-and-tested < implemented-and-reviewed < user-tested. The declared marker is only low / tentative / high. A decision that converged in a whiteboard session still sits at "asserted". Further drafting never raises it (16/32, "Whiteboard convergence is asserted").
- Fidelity (16/33): stub < interface < mock < correct. A design node has no fidelity of its own; it folds as the minimum over its load-bearing children (16/33).

**Breadth first, then depth.** Scheduler priority is centrality x (1 - confidence) (ctx/scripts/ctx_schedule.py). Centrality is graph-derived: subtree size, Boundary and Blocked-by in-degree, aspects. The order is a floor pass first, then best-first among nodes "ready to deepen" (children already `correct`).
- The floor pass (16/32, "Floor pass revised", 2026-07-13) was revised. It is now: (1) breadth to interface only, with signatures and no mocks, for a cheap gestalt view and a review of the MVP cut; (2) one tracer path driven to real end-to-end execution ("an all-mock skeleton cannot fail for ..."); (3) mocks written just in time (rolling wave).
- MVP tiering: PLAN marks each child first-pass or deferred. Deferred children are "born dormant" and excluded from the scheduler, fold and centrality (16/32).

**Cheapest check that settles the question.** Intensity is derived from centrality, confidence, open questions, a 0-10 difficulty rating, reversibility and differentiation. It runs from a thought experiment through literature, a spike, a deep-dive and a full build. Intensity is spent before a bigger model is paid for. Difficulty triggers decomposition first; only irreducible hardness earns a bigger model (16/32).

**Workflow spine** (16/37, the moves): DESIGN, PLAN, TEST, CONSTRUCT, VALIDATE, plus WHITEBOARD (16/37/62) as a non-tree kick-off move.
- PLAN holds meaning-level behaviour, boundary firming and mocks. TEST (16/37/61) holds the encoding, plus a held-out hashed slice that CONSTRUCT never sees.
- VALIDATE is one move parameterised by layer: plan, test, artifact, fold. Everything checkable against the spec is mechanical. Only artifact-versus-intent is judgement.
- The change-routing ladder, a fault enum and the aspect DAG (16/34) sit around this.

**How they fit.** The tree decides what to work on. The gauges decide how hard to push. The moves are what a dispatch does. The substrate (node 16/24) serves context and records evidence. The ownership map (16/60/63) ties the code to leaves.

## 2. Sealed versus free nodes

The rule as Robin remembers it, "some nodes free, core ones need consent", exists in the design but changed twice. The mechanism is only partly built.

- **v1 (2026-06): the seal.** `🔒 Seal: sealed|unsealed @who date` is a marker. The root epic is sealed @rjs 2026-06-16 (16/node.md). The seal is "default sealed, inherited downward, `/unseal #N` delegates a subtree, `/seal #N` re-claims" (the design as described in 16/40; the commands are ctx/commands/seal and unseal, backed by ctx/scripts/ctx_seal.py, which appends a comment).
- **v2 (2026-07-13/14): the watch.** Node 16/40 says the seal is superseded by decision-level watches. A watch is "a commitment of the human's attention, not a freeze and not a correctness claim". It is a "consult me before changing this" flag. The watch list is derived: every decision the human adjudicated is auto-watched. The root is watched by construction.
- **Final operationalisation (16/40 #40.q3, rjs 2026-07-14).** Each node has a watch section at the bottom of its body, a few dot points. Moves work freely but check in against it. VALIDATE checks whether watched concerns were touched, "a judgement call, not a mechanical check". A move that hits a watch never engineers around it. If the watch really blocks, it parks and waits for the human. Pending adjudication parks branches and never blocks independent ones (16/32).
- 16/40 states that enforcement was softened knowingly: judgement replaced the grant-based mechanical refusal, "a judgement check can miss". The compensation is an audit lottery that oversamples changes touching watched decisions.

**Built?** Only the parse of the `🔒 Seal:` marker (ctx/scripts/ctx_core.py lines 135-160) and the append-comment seal script. I grepped ctx_store, ctx_driver, ctx_run and ctx_schedule for "seal" and found nothing. So no code refuses a write because a node is sealed or watched. The linter does not check it either. The 16 node itself says the Seal marker "is the interim mechanical implementation until #40.q3 lands". The watch sections, the pending-decisions queue (node 65, docloop) and the audit lottery are design only. (I did not check that the watch section exists in any node; inferred absent. Not verified.)

**A separate, stronger edit-rights model: ownership grants** (16/60/63). Every dispatch gets a tool grant derived from the ownership map: file-path allowlists keyed by (node, move). CONSTRUCT may touch only its leaf's units; TEST only the suite files; neither touches design.md or spec.md. Detection stays as a backstop through content-hash checks in VALIDATE. This governs who may write which file, not whether the human consented. It is designed, with no code.

**Free versus consent in the spec text itself:** the closest thing is the schema's component split (design.md and spec.md edited in place by their move; `.records/` append-only; `.tests` pinned by hash). There is no "core requirement" class versus "free spec" class in the store; consent attaches to decisions, not to a node type. (My reading.)

## 3. The ctx node store as a checkpoint format

**Layout** (16/60/64, the single authoritative schema node). `store/` is its own git repo. `nodes/<id>/` holds the node folder: `node.md`, `design.md`, `spec.md`, `log.md` (merged ledger of alternatives, dead ends, futures, optimisations and bugs, each with a `kind:` field), `.tests/`, `artefact` (view only, never a copy), `.records/` (one immutable file per dispatch, named `NNNN-<move>.md`), `.attachments/`. Component directories are dot-prefixed so they are never mistaken for child nodes. The tree is the directory nesting; there is no Part-of field.

**v1 versus v2.**
- v1: `node.md` plus `.comments/NNNN.md`, an append-only comment stream with a latest-wins fold per marker id (the original ctx/references/context-spec.md).
- v2: per-component documents, edited in place, with git history as the ledger. Append-only survives only in `.records/`. The comment fold was retired.
- Migration: ctx/dev/migrate_v2.py, with an LLM split per node judged by hand (#64.q2). The 45 existing nodes were not all converted (current nodes still show v1-style bodies; inferred from what I sampled).

**Writes** (ctx/scripts/ctx_store.py, 542 lines). Whitelisted component names only. Lint before write: a malformed body raises ValidationError and nothing is written. One git commit per write (`node #N: write design.md`). `append_record` is add-only with no lint, and there is no update API for records.

**Lint** (ctx_core.py CHECKS and ctx_lint.py). I1-I14 checks include:
- I3 one parent, no cycles
- I4 a closed parent needs closed children
- I5 Boundary names only the parent's children
- I6 depth at most 8
- I7 Design reference exists
- I8 bare keyword without its emoji
- I9 keyed-id issue number matches the carrying node
- I12 dormant means closed
- I13 a `correct` node's children are `correct`
- I14 confidence `high` requires fidelity `correct`
- a repeated single-value marker is flagged
- unknown component directories are flagged

**Readiness and dependency edges.** `deepen_ready` in ctx_schedule.py makes a node ready when its children are `correct`. Since 2026-07-14 it also honours `⛔ Blocked-by` edges (F3 / #32.q5). Fingerprint: `_fingerprint` exists only in ctx/dev/migrate_v2.py, where it checks that a migration preserved marker id, status and text (2026-07-24 fix: it now includes the text). It is not a general staleness fingerprint.

**MCP tools** (ctx/ctx_mcp/server.py, 244 lines). Six read tools: `context(issue, component=None)`, `thread`, `siblings`, `children`, `registry(key)`, `deadends(scope)`. Context is served by altitude: the root-to-node ancestor path only, bodies and state, and with `component=` only that component of each ancestor. Siblings come as titles plus one-line purposes. Detail is opt-in. Serving is per component and per ancestor path, not whole-tree.

**Size and tests.** ctx/scripts: ctx_core 1172, ctx_store 542, ctx_run 395, ctx_schedule 275, ctx_driver 249, ctx_lint 189, ctx_source 103, ctx_artefact 77, ctx_seal 57; MCP server 244. About 3,300 lines of code in total. Tests are about 3,900 lines in 17 files, and I ran them: **361 passed, 1 skipped in 16 s**. Test coverage is good for what exists. Real-world use is thin.

**Reusable as a checkpoint store?**
- The folder-of-documents layout, validated write with a commit per write, immutable per-dispatch records, ancestor-path serving and a lint pass are the right shape and have been exercised. About 1,000 lines (store, lint, MCP) would carry over.
- Change for Leitstand: (1) the store is built around a design-hypothesis tree and R-package nodes (r-science labels, "centrality", moves), so it needs a plain "project, phase, task" node vocabulary. (2) The 1,172-line marker parser is the main liability; the project's own review (research/lean-on-existing-code-synthesis.md section 5, item 1) recommends moving structured fields to YAML frontmatter and keeping only genuinely inline markers. (3) Node ids are integers allocated in the store and the marker grammar assumes `#N.q1`; a checkpoint tool needs stable string ids. (4) Writes assume one writer; there is no lock or concurrent write rule (inferred). (5) There is no "hand me a bounded resume brief" tool. `context` serves ancestors, not "what changed since the last checkpoint". (6) `ctx_run` and the driver are dispatch machinery that Leitstand would replace with its own session control.

## 4. Built, designed only, abandoned

**Built and tested:** marker grammar and parser; linter; git-backed store with v2 component writes and `.records/`; the read MCP server; the scheduler (pure functions over a collated model); a state-machine driver over in-memory state; `ctx_run` as an MVP outer shell (headless `claude -p` per dispatch, `usage.jsonl` telemetry, `run-state.json`); the migration tooling; the docloop review GUI (a TypeScript app, its own vitest suite; I did not run it). The r-science and r-data skills exist as markdown.

**Designed only:** the watch mechanism; the ownership map and tool grants (16/60/63); the defect-signature ledger (16/24/67); dispatch telemetry beyond the MVP (16/24/68); the stellwerk gate backend (16/24/69, a sibling project); the pending-decisions queue (node 65); the divergence move; the audit lottery; the router. Many nodes carry Confidence low or tentative and are stubs.

**Abandoned or retired:**
- The walking-skeleton dogfood (MAP.md, archive/dogfood/ARCHIVED.md): "RETIRED 2026-07-14 ... a hand-built, throwaway sample project used to exercise the v2 node store and the docloop loop ... real dogfooding is about to begin on an actual project, which supersedes this stand-in." It informed #64.q1 and #64.q4 (the thin node.md index, and glue leaves needing no special anatomy). It was a 7-node tree.
- The v3 tdd-plan driver: "the v3 driver as implemented does not work ... ctx_run is a from-scratch build" (research/tdd-plan-dogfood-lessons.md section 4.3). tdd-plan itself is "absorbed; the standalone plan is dead" (section 4.6).
- GitHub-issue backing: dropped for the native store (#60). The comment fold: retired.
- Part-of marker: replaced by directory nesting.
- Seals: superseded by watches.

**Why work stopped.** I found no single "we stopped because" statement. The record shows: 2026-08-08, Robin commissioned the "lean on existing code" review, whose first line is "I think we have been going about this all wrong." It concluded the project had over-built (executor, isolation, dispatch), and that only scheduling, the verdict envelope (stellwerk) and divergence are unmatched. Two research commits followed on 2026-08-11 and then nothing. That the work moved into werkbank is not stated in the Doktoreltern repo (inferred from the stellwerk ruling, the repo's cross-references and your own context). The code held a real dogfood gap too: ctx_run's open question #66.q1 (cold-start and handoff cost constants) waits on "the first real ctx_run build", which never appears in the record.

## 5. Lessons recorded

**research/tdd-plan-dogfood-lessons.md** (2026-07-22, 524 lines; evidence: two real builds, 837-turn forensics):
- Residency is the strong lever, model tier the weak one. The orchestrator cost about 75% of spend because it was Opus for 837 turns. Cost grows with the square of turn count and at least 80% of turns were plumbing. Remedy: short cold segments over durable disk state, run by a roughly 150-line zero-token driver that runs gates itself and wakes a model only for non-clean verdicts. "No published system frames residency removal via a zero-token relauncher as the primary cost lever", so nothing validates it except their own measurement. Cognition's "one long linear agent" is the counter-position; the answer is the "askability invariant": segmenting is safe iff the store provably carries the full decision-relevant record.
- Briefs: inline slices, not pointers. Review: the finder must not be the filter; a cold different-family reviewer that had to reproduce each finding found 6 real defects with 0 false positives after two same-family audits and a green suite passed. Cheap models need a mechanical oracle or should not be used. Gates need the same rigour as code ("degrade-never-vanish", seeded-defect calibration). Cut obligations rather than words in skills.
- Budget unit is tokens, not turns. Two constants stay unmeasured: cold-start cost and handoff cost.
- The flat tdd-plan plans layout is "terrible" for a human; that corroborated tree over list.

**research/lean-on-existing-code-synthesis.md** (2026-08-08, 637 lines):
- Borrow: Claude Code headless and worktrees as the executor; beads' edge vocabulary only (not its Dolt store); doit's `uptodate` pattern copied, about 50 lines; a gate toolbox; DBOS (one workflow per move) or Burr as a possible checkpointer; stellwerk as the verdict spine. Reject Temporal, Prefect and the other engines: "our state is a git repo, and each move is a commit".
- Keep: the tree, the scheduler ("not one selects work by a derived value function over a graph"), altitude-relative serving.
- Cut: ctx_run hard (isolation to `claude --worktree`, budget to `--max-budget-usd`, keep telemetry); shrink ctx_core. Build: the divergence move, which has no prior art.
- Deterministic part: the 12-Factor "stateless reducer" f(events) to next action, with a human gate met by "a node sitting unsealed until a human commits a seal", which needs no engine.

## 6. Assessment

**(a) Checkpoint/state layer: partly, and the idea more than the code.** Directly usable: the folder-per-node layout in plain markdown with a commit per validated write; immutable per-dispatch `.records/`; ancestor-path context serving with per-component fetch; the one-authoritative-schema-node rule (N2). The "askability invariant" (the store must carry the whole decision-relevant record, so a cold start loses nothing) is the strongest transferable idea, and it is exactly Leitstand's reset problem. Not usable as-is: the marker parser, the integer ids, anything tied to r-science vocabulary.

**(b) Flow: the shape matches, with caveats.** The revised floor pass (interface breadth, one tracer to real, mocks just in time) is a walking skeleton that already absorbed the objection that an all-mock skeleton cannot fail. The ladder from stub to correct, breadth then depth, and the cheapest-check rule are all there as design. But the flow in the record is a research-grade scheduler (centrality, confidence ladder, difficulty router, fault ladder), with the inner loop explicitly "open". Leitstand's build flow would take the skeleton rule and the five-move vocabulary, and skip the scheduler maths.

**(c) Consent/edit-rights: the idea fits, the implementation is absent.** Closest to what Robin described: the watch section plus "check in, never engineer around, park if blocking". That is cheap (prose plus a validate check) and was a deliberate choice over mechanical enforcement. The ownership-grant model (16/60/63) is the mechanical alternative, listed by its own author as "prevention plus detection". Neither is built. Note the inversion: the design does not mark nodes "free" versus "core". It marks decisions the human adjudicated, derived from where the human intervened.

**So is Leitstand "that design"?** No. Leitstand's headline (one Claude session reset from structured checkpoint files, with a build flow on top) overlaps only two fragments of Doktoreltern: the store-as-disk-state idea (nodes 16/24, 16/32/66) and the flow. Doktoreltern's ambition is a risk-scheduling methodology for science software; its driver deliberately has no resident model, which is the opposite of Leitstand's resident orchestrator. Its own lessons doc argues against long residency on cost grounds (quadratic turn cost). That is evidence you need to answer, not just a precedent.

**Over-built or unproven:**
- 17 marker kinds and a 1,172-line parser. The project's own review called it the biggest available reduction.
- The router, centrality weights and difficulty rating: "tune-empirically", with no data.
- A deep tree of stub nodes (54 nodes; most Confidence low or tentative) with the design far ahead of any real run. The only end-to-end exercise was a retired 7-node toy, and the planned "real dogfooding" does not appear in the record.
- Telemetry and ledgers specified in detail while the two constants they exist to measure are still unmeasured.
- The watch mechanism: chosen over mechanical enforcement, with the weakness acknowledged ("a judgement check can miss").
