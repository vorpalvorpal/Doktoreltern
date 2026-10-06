# Bar Raiser: review of SCOPING-DRAFT.md and of the panel

Read: BRIEF, the draft, and all six other reviews. `red-team.md` appeared while I was writing, its spike
line still a placeholder, so I rule on its text and not its spike. Detail: `bar-raiser-appendix.md` (A to
E). Thresholds marked [P] are my proposals; Robin should overwrite them. What I verified is at the end.

## Verdict

1. Not yet good enough to build from, and applying every panel change would not make it so: the draft
   holds no criterion that can fail, and none of its spikes has a pass mark (appendix C).
2. The reset, `lst` and the files are buildable after the Architect's M1 to M5. The flow in §5 is not:
   five lenses reject it and none has a measurement for its replacement. Decide it by experiment.
3. The draft answers two separate questions as one. Split them, test each cheaply, and cut version 1
   to what those two tests need.

## The bar: what "good enough to build from" must mean here

- **B1, decidable.** A builder can start S0 and S1 without asking Robin anything; every stage has an
  exit test with a number in it and a result that means stop. Today: fails in eleven places (appendix C).
- **B2, failable.** Each of Robin's two feared failures, and his attention, has a measure, a baseline
  and a stop line, written before the build. Today: the only bar is §8's "target set after S0-d [open]".
- **B3, one design.** No text describes a route or flow the document has left. Today: Architect M1.
- **B4, shown.** Every file kind is shown with content and has passed a cold-reader test. Today: a tree.

## MUST-fix (the tightest set; all 25 MUSTs from the other lenses are ruled on in appendix B)

**M1. §8: criteria that can fail, a baseline, and a measure that does not spend Robin.** The Green Hat
is right that the record has no plain-agent baseline (my search of V8.3-SCOPING, DECISION-LOG and the
evidence index found only gate baselines). Run one. But the draft, the Green Hat, the Economist and the
Red Team all measure trust by Robin reviewing output by hand: one run, unblinded, paid for in the
resource he ranks first. Change: before any build, a **held-out check set** for the reference
job (Robin's ten marked examples, a differential run against reference SQL in DuckDB, named failure
shapes; at least 40 checks [P]), written by a session no builder sees; every run is scored on it. Then
state, as in appendix E: held-out failures at most half the plain run's median; usage at most 5 times
the plain run, stop above 10 [P]; at most 2 stops and 30 minutes of Robin after sign-off [P] (run 3: 53
stops); 40 resets with no manual compaction and no undetected fault; a date (Red Team M1). Cost: half a
page, ten minutes of Robin, one session to write the checks.

**M2. §7 and throughout: make S0 and S1 decidable.** Fill the eleven gaps in appendix C. A builder hits
these first: no model is named for any role (verified: the only tier in the draft is haiku, for the
spikes); the orchestrator's own instructions are in no stage; "unit" has no size; nobody owns the Rust
signatures or the one operation that may change them (Red Team's deadlock with G1); S0-b, S0-c, S0-d,
A1 and F2 say what to count and not what count means go. Name the stops in one table (Red Team M3a): I
count four classes that halt for Robin, against principle 6's two and §8's none. `cargo` and `rustc`
are not installed on this machine (verified), so S0-b begins with an install. Cost: a day of redrafting.

**M3. §5: do not redraft the flow from argument.** Fix what the lenses agree on and put the rest to
experiment E1 (under "The flow"). Cost: $95 to $300 [E] and a few days of throttle, against $950 to
$1,800 [E, Economist] for the stages the flow would occupy.

**M4. §4.1: show the files and pass a cold-reader test** (under "The checkpoint files"). Cost: two
pages in the redraft; the test costs cents a run.

**M5. §7, §9: a version 1 sized to the two tests, and a budget for the panel's asks.** The Red Team
counts 23 `lst` commands after two reviews against the draft's 9, and the panel has filed 25 MUSTs.
Each is defensible; together they are how 10.8k lines became 49.3k. Change: every accepted MUST gets a
stage (appendix B); what the go or no-go does not need is deferred; deterministic code of every kind
is capped at 5k lines at S4 [P]. Cut list under "Scope".

## SHOULD-fix

- **Test the orchestrator's rulings before trusting them (§10).** werkbank's ledgers hold findings
  with final rulings (27 real, 19 noise in phase 7 alone). Replay 30 to the orchestrator prompt at each
  candidate tier and score agreement; that also settles sonnet or opus. Not verified: that the rows
  replay without their tree. And give a sample size wherever a figure decides: S0-d is 20 faults, once.
- **Canonical serialiser, not `toml_edit`** (Architect against SRE): under route F stable bytes are
  the cache. **`leitstand/` stays in the product repository for version 1** (Architect against SRE
  M5): serial units merge nothing, and two repositories make "done" and its commit non-atomic.
- **Drop the Remote Control test and phone replies** (SRE M1a): neither is in the brief or the draft
  (verified by search). **Add a manual mode** (Red Team M4): Robin types `/clear`, the orchestrator
  runs `lst hydrate`; a withdrawn mods API then costs autonomy and not the tool.

## The flow

**Settled, because the lenses reach it separately** (Architect M3, Green Hat M1, SRE, Economist M3, Red
Team): a compiled skeleton before any unit, with one red end-to-end test into a real DuckDB file; units
built one at a time; the test writer owes a property test per open input and a differential test per
mirrored tool; real producer into real consumer in every seam test; plans written just before use. One
hole (Red Team): over `todo!()` every test fails by one panic; "the right reason" needs its own check.

**Rulings where the lenses disagree:**

| Question | Positions | Ruling |
|---|---|---|
| Unit of work | file (draft, Architect); behaviour slice (Green Hat, Red Team) | The smallest change that turns named red-planned tests green, with a declared scope by role. The Architect's objection (slices break disjoint scopes) falls to his own M4: serial units need a declared scope, not a disjoint one. Size by E1. |
| The model check per unit | test audit only (Economist); code reviewer only (Green Hat); both (draft, Architect) | One per unit in version 1; its place is the first `flow.toml` switch tried on the fixture. The Red Team is right that the Economist's cut rests on an assumed 50% catch. |
| When rounds stop | "nothing new" (draft); cap of 2 (Economist); end on a check (Red Team M5a) | Cap of 2, ending on a check. The draft's rule never fired in run 3 (verified, `spike-policy.md:47`). |
| Audit levels | unit, package, release (draft); fewer (Economist, Green Hat) | One at the unit, one over the whole at the end. No package level in version 1. |
| Second read of rulings | none (draft); for spec and plan amendments (Red Team M2, Economist) | Red Team's: 8 of the 71 such rulings changed on a second read, 1 of 29 otherwise. |
| Baseline | plain session (Green Hat); plain session with the reset mod, Robin counting (Red Team M1) | Plain, no mod, scored on the held-out set. The Red Team's version tests H1 and H2 at once. |
| Sign-off | prose (draft); plus ten marked examples, silence decided for Robin (Green Hat M4) | Green Hat's with Red Team M2c: Robin's closing report is a rendered diff of what he signed. |

**The flow I would hold the redraft to:** spec items with classes and examples, ten marked by Robin;
skeleton and its review; per unit: tests, code against T0 and T1 (end-to-end test included), diff
mutation, one model check, a closing check, reset; one whole-tree review at the end. The unit's shape
is E1's question. Later steps earn their place by two fixture comparisons, not a ladder of five or six
rungs (fifteen runs or more); reset once per unit until F2 passes (Red Team M4).

**E1, the one experiment (appendix D).** One spec of about ten items, one shared skeleton, one held-out
set; three loops hand-run in plain Claude Code with sonnet workers and neither `lst` nor the mod: P, a
plain session; U, file units with a separate test writer; S, behaviour slices with one worker and a
reviewer. Seven runs. If neither U nor S halves P's held-out failures, the flow has not earned its cost
at this size, and version 1 is the reset plus a small mode. Between U and S, fewer failures wins, then
fewer tokens. Its limit: two or three runs an arm show a twofold difference and nothing finer.

**What the panel has still missed:**
1. **Two hypotheses are tested as one.** H1: a deterministic reset keeps a model orchestrator running
   unattended for days; this is the problem the brief opens with, and worth having with no flow at all.
   H2: this flow yields output Robin trusts at a price he accepts. H1 needs F2 and one real hand-run
   job on the mod; H2 needs E1 and no mod. Neither waits for the other.
2. **Every trust measure proposed spends Robin and is unblinded** (M1). 3. **The orchestrator has
   no model, no prompt in any stage and no test of its rulings** (SHOULD 1).
4. **Nobody has seen what the model receives after a reset.** Six lenses discuss the files; none shows
   the rendered text of one level with a token count.

## The checkpoint files

**What the redraft must show**, with content (the Architect's and Green Hat's sketches disagree on
the spec item, `kind` and `check.form` against `class`, `inputs`, `mirrors`: pick one):
- a spec item of each kind in use: class, test owed, two examples as data rows, a `silent_on` entry,
  a decision with a rejected option;
- an interface item pointing at Rust code; a unit plan (the tests it turns green, write scope by role);
- a unit state file caught mid-step, with the intent record and the outcome of each dispatch;
- a finding, its group and ruling; a note with what retires it; a question for Robin; the run records
  (cut, hold, kept messages verbatim, reset pending); the rule card, with the flow's limits as data;
- **the exact text of `stable(level)` and `delta(unit)` as the model receives them**, with a token
  count against a stated budget.

**The test that a fresh reader can work from them** (werkbank's askability invariant, V3-SCOPING D2,
lines 37 and 223, verified; the Green Hat names it too). Freeze a mock build at five points [P]: a
dispatch in flight; a group ruled and not fixed; a unit parked by a question; a stale cut; between
`unit done` and its commit. For each, twelve questions with a key, a third of them keyed "not in the
files". A cold reader (haiku, user and project settings off, no tools) answers five times. Pass [P]:
95% of keyed answers right; no confident answer where the key says "not in the files"; the same next
action five times in five. A "not in the files" that a resume needs is a missing slot: add it and
rerun. This is S1a's exit test and then a standing regression test of `lst`.

**What my run of it found** (appendix A; three runs, $0.17, my own fixture and questions: an
illustration, not a rate). Static questions were right every time. "Did the sub-agent finish", "which
tests should be red now" and "what is the next action" drew confident answers in 9 of 9 cases, the
second three different ways. Missing slots: dispatch outcome; the expected-red set (the Architect's M3
needs it, his schema lacks it); write scope by role; the flow's limits; the rule after a crash.

**On the design questions:** one item per file, the stable and changing split, state rewritten whole
and TOML are right, and six lenses say so. Notes promoted through three levels are unbounded judgement
by the unaudited party (Red Team): one level, capped at 20 [P], in version 1. No lint finds a missing
slot (auditor §5); only the test above and the random-kill test do.

## Scope

**Cut from version 1 outright:** parallel units and worktrees; more than one package (so cross-package
seams, the gestalt audit and a second level of cuts all go; the Red Team's point that a stale cut is
the normal case argues for one level); automated planning (S5), scoping and run review (S6);
self-building as a stage (Red Team story 1; 194 of run 3's 360 h was werkbank patched under the run,
verified); G3 and G4 as refusals (`warn` until Leitstand has its own recorded miss, the draft's own
rule); T3 on idle and `a.b.c`; the watchdog's relaunch; route G and a built route A; R interop.

**The smallest thing that tells Robin whether to go on** is two results, neither needing the flow built:
**H1:** F2 on the spike mod with the Architect's, SRE's and Red Team's additions, then one real
hand-run job of 40 resets or more [P] with no manual compaction and no undetected reset fault. **H2:** E1.
Both pass: build S1 to S4 on the chosen loop. H1 only: ship the reset, `lst` state and a small mode,
which already ends "checkpoint and I'll compact". H2 only: the flow becomes a skill for plain sessions.
Neither: stop, having spent about two weeks [E]. Kept in version 1 as a field with no code: the runner.

## Questions the draft does not answer

1. What multiple of a plain session's usage would Robin pay for half the defects? (Mine: 5; stop at 10.)
2. Which model orchestrates and which runs each role? 3. Will Robin sign marked examples, and have
   silence decided for him? 4. How large is the reference pipeline, and by what date must it exist?

## What must survive revision

Principles 1, 2, 5 and 7. `lst` as sole writer. Route F behind one function. Findings as failing tests
through mechanical intake, routed by target. Direct edges only. The per-guard `warn` switch and the rule
that a guard needs a recorded miss. §2 and §10 as written: add numbers to them, do not soften them.

**Verified:** no model tier in the draft; no phone in brief or draft; `cargo` and `rustc` absent; the
stop rule that never fired; 194 of 360 h; the askability invariant; no plain-agent baseline (an absence
found by search). Spike: three haiku runs, $0.17, nothing left running. **Not verified:** any dollar
figure; Rust compile behaviour; others' prior art; the Red Team's 8 of 71 and command count.
