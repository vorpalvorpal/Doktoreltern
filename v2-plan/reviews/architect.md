# Architect: review of SCOPING-DRAFT.md (coherence and boundaries)

**Verdict.** The core (files are the state, `lst` is the only writer, a model decides, deterministic code
only refuses) is one design and is sound. Around it the draft is three drafts laid over each other: route F
was written into §4.2 but §0, §3, §4.1, §4.3, §7, §10 and §12 still describe a rebuild from files. The flow in
§5 will not run as written in Rust: a test written before its code does not compile, so the crate, which is
the gate, is red for every unit in it. I would build this, after the five changes below.

**Checked:** `spike-f1/REPORT.md` and `helper.mjs`; `stellwerk-shims.md` and stellwerk's README;
`spike-exec-findings.md:13,42`, V8.3-SCOPING:71,646 and `seams/SYNTHESIS.md:9` for the flow figures. Not
verified: cargo behaviour is from my own knowledge (marked K); nothing was run. Prior art and the schema in
full are in `architect-appendix.md` (one sonnet sub-agent, web search, no model spike).

## MUST-fix

**M1. State route F as what it is: a cached copy of a pure function of the files (§0, §3, §4.1, §4.2, §10, §12).**
Under F the post-reset context is a transcript prefix (the hydrate turn, the model's reply, the engine's
listings) plus a short text: replay, not rebuild. Principle 2, the glossary's "Reset" and "Hydrate", `lst
hydrate --level` ("stable files first"), "rewind to the package is therefore `hydrate --level package`" and
the watchdog's "start the session with `lst hydrate`" still describe route A. Change:
- Two functions, both pure and byte-stable: `stable(level)` and `delta(unit)`. A cut is valid when the digest
  of `stable(level)` over today's files equals the digest planted in the turn it was cut from. The spike
  already finds its cut by a marker in the prompt (`helper.mjs`, `cutAt`), so staleness needs no registry
  beyond `{level, session id, digest}`: "`lst` knows which files each cut was built from" becomes a comparison.
- Say where a stale level is resubmitted. A new turn after the old one leaves both versions in the prefix.
  It must be rebuilt from the parent cut; a spec change invalidates every package cut; and sessions holding
  live cuts must be exempt from pruning (ids are remapped on fork, F1 §4).
- §4.1 says unit plans are stable and "stay in the session"; §4.2 sends the unit plan at every reset. Decide
  it: the prefix holds only what is stable in fact. 14 of werkbank's 24 test-able real finds ended in a spec
  or plan edit (`spike-exec-findings.md:13`), so plan detail is not stable. Package prefix: goal, crates,
  interface index, one line per unit. Delta: the current unit plan, the interfaces it touches, state, notes.
- One path for three things the draft treats separately: the step reset, the context-size guard and restart
  after a crash are all "fork at the valid cut, or rebuild it, then submit `delta`". S1's random-kill test
  then covers all three, and reset points stop being part of the flow.
- §4.3's answer on decay ("re-inserts the flow word for word at every reset") holds on A only. On F the rules
  sit once, 70k tokens back: put a short rule card in `delta`. Cost: half a day of redrafting; F2 gains the
  stale-spec cascade and a restart from cold.

**M2. Put every decision in `lst`; make the mod an adapter (§0, §4.3, §4.4, §10).** Today G2 is Rust in `lst`
and G1, G3, G4 are TypeScript in the mod; the hold flag, kept messages, nudge counts and cuts are "stored
outside the mod's variables" with no owner; attestations are in `state.toml` in one place and "recorded by
`lst gate`" in another; the write scope is said to come from `flow.toml` although the files come from the unit
plan. The half-page shows three deterministic parts; there are six. Change: each guard is `lst check <action>
--agent <id>`, a pure function of files returning allow or a refusal message; the mod relays, resets and
draws. The guards stay property-testable and survive a move to route A or G. Homes:

| Part | Home | Note |
|---|---|---|
| guards, readiness, next, intake, lint, hydrate | `lst` (Rust, pure) | the only reader and writer of the checkpoint |
| run-time state: cuts, session ids, hold, kept messages, dispatch intents, usage ledger | `leitstand/run/`, not in git, written by `lst run …` | machine-local; survives a mod reload and a crash |
| reset, relay of `lst check`, status line | the mod | no policy, no state of its own |
| fork at a message | the helper (Node, SDK) | a third runtime; name it in §0 and S1 |
| run a tool, normalise its result, affected crates, test listing with tags | stellwerk gate | everything that knows cargo; `lst` stays free of language |
| attestation | stellwerk's JSON kept whole under `run/attest/<tree key>/<tier>.json`; `lst` holds the key | define the tree key to exclude `leitstand/`, or recording a result changes the tree |
| restart and waiting out a usage limit | a watchdog script, in the half-page and in a stage | it calls the same resume path as M1 |
| the orchestrator's own instructions | a Leitstand skill, pinned in `flow.toml` | the largest owned prompt, and not in the draft |

Evidence: T2 (rules defined in several places became 52 patch releases). Cost: none now; less TypeScript later.

**M3. Tests-first in Rust needs a compiled skeleton first (§5.1, §5.2, §5.4).** A test that names a missing
function fails to compile, and takes its whole test binary with it (K). "Tests fail for the right reason"
cannot be shown, and T1 ("tests of the crate and its dependents") is red for every other unit in the crate:
werkbank's F-220..223 again, by construction. stellwerk already has the answer for Python and R: `gen`
renders stubs from a contract and `run` classifies each test as red-planned or a real deviation (README).
Change: interfaces are Rust code (signatures, types, table DDL) in the tree before any unit starts, with
`todo!()` bodies; the draft's own argument against properties in TOML applies to interfaces too, and `cargo
check` then does the "matching declaration" lint. A gate result becomes "matches the expectation", and the
expectation (which tests are red, until which unit) comes from `lst`. Also correct §5.4: cargo-nextest
selects by test binary (auditor row 31), so one test binary per unit selects finer than the crate, and "small
crates are preferred" loses its reason. Cost: an `expect` argument in the shim; a stub step in the flow.

**M4. State per unit, an intent record, and no parallel builds in version 1 (§4.1, §5.2).** `state.toml` is
one file per package, rewritten whole, while units build in parallel worktrees: two branches rewrite one
file, against the draft's own rule of one item per file. Make state one file per unit and package status a
fold. Add `lst step begin <unit> <step>`, recording dispatches before they are made, so a restart can tell a
half-finished step (auditor §5; resume cost werkbank 8 or more releases). Then cut parallel unit builds: four
in parallel gained about 6% of run 3, and the machine has 8 GB. That removes worktree merges and the shared
build cache. Read-only fan-out (panels, audits) stays. Cost: negative.

**M5. Build order (§7).** (a) F2 decides between F and A, which decides the shape of `hydrate` and the run
state, yet it is the first job of S1. Move it to S0, on the spike mod. (b) S1 is five deliverables in three
languages and two repositories, usable only when all exist. Split it: S1a `lst` schema, lint, `stable`,
`delta`, `check` (usable alone, on a hand-written spec and plan for Leitstand); S1b mod, helper, watchdog,
random-kill test; S1c stellwerk's Rust roles and `lst gate`. (c) "By itself" covers only `lst`: the mod is
TypeScript, the helper Node, the shims Python. S2's job is therefore S3's `lst` commands. (d) Seams sit in
S5, after the pipeline, which is mostly seams: interface items and their lint belong in S1a, seam tests in
S2. (e) No stage holds the watchdog (needed before "unattended" at S4), the acceptance fixture or G4 (both
needed at S2). Cost: reordering only.

## SHOULD-fix

- **`flow.toml` stays a lookup table** (step to skill, runner, contract, tiers). Lint that it has no ordering
  or condition keys. T2 advised leaving werkbank's phases-as-data interpreter alone; this is where one would
  regrow, and it is a sharper tripwire than the mod's line count.
- **Rulings belong to groups, not findings** (§4.1 against §5.3). A group is an item, and intake should match
  a new finding against closed groups: werkbank's "already ruled" loop took four releases.
- **Sign-off as a digest.** `lst` records the digest of the signed items and refuses an edit to one without
  an answered question, which makes principle 6 mechanical. Robin signs a rendered document, not TOML files.
- **Write whole with a canonical serialiser, not `toml_edit`.** Only `lst` writes, so nothing needs preserving,
  and sorted, stable bytes are what the cached prefix depends on.
- **Counters the flow relies on need fields** (fix cycles, nudges, audit rounds). **Keep `flow.toml` and the
  wrapper prompts**, which are Leitstand's own, apart from the project's checkpoint folder.

## The flow

**What the record says about §5's shape** (prior art in appendix §A; none of it measures one ordering
against another, so this is argument from reported cases and werkbank's own figures):
- 13 of werkbank's 27 real code-audit finds were unsampled inputs or disagreement with the real tool
  (V8.3-SCOPING:71, 646). Unit tests written from the spec do not reach those; a run of the whole on real
  sample data does. They were found last.
- 14 of 24 test-able finds ended in a plan or spec edit. Plans are wrong, and it shows only once code runs.
  §5.1 spends three planning passes on all N packages before any code exists.
- All 6 real seam finds came from a probe that ran before code; the per-unit pipeline loses three orderings
  the global phases gave for free (`seams/SYNTHESIS.md:9`). No cross-package seam has ever run.
- Outside: the large agent builds with a write-up worked feature by feature against a whole that already
  ran; the C compiler account names a trusted whole-system check as the deciding factor.

**The flow I would build: skeleton, then widen.** Package and unit stay; what changes is what exists first.
1. **Spec**, as drafted. Add to it the end-to-end checks: sample input and the expected tables.
2. **Architecture, once and thin.** Crates, interface items with their code, package order. Lint, `cargo
   check`, two or three lenses. This is the gestalt review, done on code that compiles, not on N prose drafts.
3. **Walking skeleton.** Every crate and interface exists with `todo!()` bodies and the pipeline runs end to
   end on its simplest path into a real DuckDB file. All seam and end-to-end tests are written now, by a
   writer who has seen no unit code, and recorded as red-planned. This also yields real gate times (S0-b).
4. **Per package, just in time:** the unit plan is written when the package's predecessors are built, against
   real code. Lint and two lenses; no second draft and no audit pass.
5. **Per unit**, as §5.2, with two changes. The gate compares against the expectation, and the seam and
   end-to-end tests whose expectation flipped must be green, so a broken seam shows at the unit that broke
   it. The test audit looks for input classes and differential checks, which is what was found too late.
6. **Package close, release, run review**, as drafted.

Not full vertical slices: a slice through every crate breaks disjoint write scopes. The cost: step 2 must be
good, since a wrong interface reopens units; but the draft finds the same wrong interface later, dearer.

## The checkpoint files

**Store per item, present per level.** One item per file is right for storage: clean diffs, edits that do not
collide, a filename that is the id. The model and Robin read one ordered document per level, from
`stable(level)` and `lst render`. SQLite is not diffable or mergeable in git; JSON Lines invites appended
versions, which werkbank miscounted threefold; state as Rust code needs a compile to mark a unit done. Rust
types as the schema, files as the data, is the right split. TOML is adequate.

**Schema I would build** (in full, with examples, in appendix §B). Nine item kinds, the filename the id:
spec item `S-`, interface `I-`, package `P-`, unit `U-`, unit state, finding `F-`, group `G-`, note `N-`,
question `Q-`. The lintable edges: a unit's `package`, `covers` (spec items), `provides` and `uses`
(interfaces), `after` (units, direct only) and `files` (its write scope); an interface's one `producer` and
its `consumers`; a finding's `cites` and `group`; a group's `members`; a note's `applies_to`; a question's
`items` and the packages it `parks`. Unit state holds step, status, an intent record, commit, and a tree key
per tier. Three additions to the draft: interfaces are items, groups are items, and state is per unit.

**What `lst lint` should check**, beyond schema, links, producers and cycles: (1) coverage both ways: every
signed checkable `S-` is covered by a unit and cited by a test, and every test tag cites a live `S-`; (2) each
`I-` has exactly one producer, and each consumer a direct `after` edge to it or a seam test; (3) unit file sets
are disjoint (G1's precondition; werkbank 8.2.7); (4) state agrees with plan and git: done means the commit
exists and its tree key is attested at the required tier, reopened means an open issue, blocked names its
cause; (5) an accepted finding has one group, a closed group a ruling, an accepted group a class test; (6) the
signed digest matches, or an answered `Q-` covers each difference; (7) a cap on notes per level, and none
whose `applies_to` is all closed (the draft's notes only grow); (8) `stable(level)` is byte-identical across
runs, and each cut is reported fresh or stale. Transitions are refusals in `lst`, not lint: done without
attestation, an edit to a signed item, a reopen without an issue.

**What the record adds to the auditor's §5.** werkbank's D41 split its manifest by lifetime after "eight
fail-fast readers", which supports stable against changing and one reader. No lint finds a missing slot; the
test is to kill at a random point, resume from files alone and compare. Outside (appendix §A): Anthropic's
harness lets agents change only the `passes` field; beads left JSONL plus SQLite over merges between many writers.

## Questions the draft does not answer

1. After a park longer than the cache lifetime each reset rewrites the whole prefix once. Does F still win?
2. Who writes the stubs and interface code, and who may change an interface once units depend on it?
3. What is the unit of work for the pipeline: a file, a stage, or a behaviour through all stages?
4. Do sub-agents call `lst` at all? (I would allow them reads only.)
5. Which of T2's ten rules have no home here? I could not place pause and resume disposition.

## What must survive revision

Principles 1, 5, 7 and 8. `lst` as sole writer, with loading as the lint. State rewritten whole, git as
history, decisions as fields. Findings routed by target, harness findings never rejected. Direct edges, never
a closure. The per-guard `refuse`/`warn` switch and the rule that a new guard needs a recorded silent miss.
S4, the pipeline, before planning and scoping are automated. §2 and §10 as written: they are the honest parts.
