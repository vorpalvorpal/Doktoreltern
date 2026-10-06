# Red Team / pre-mortem: review of SCOPING-DRAFT.md

Detail, counts and one small spike: `red-team-appendix.md` (A1 to A6). What I checked is at the end.

## Verdict

It is January. Leitstand was not dropped because the reset failed; it was still being built, and its one pipeline came with a spec Robin no longer recognised.
The reset is the best-tested part. The untested bets are larger: that a model follows the flow where no guard looks, that one unread ruling per group is safe when most real finds end in a spec or plan edit, and that the tool reaches an outside job at all.
I would build it only smallest-loop-first, with the abandon line written before S1.

## The failure stories, most likely first

**1. It never reached the second half (§7).** S1 took five weeks, not one: `lst` had 9 commands in the draft and 23 after two reviewers (A2), the
parts are in four languages, and the panel had added 20 MUSTs before mine. S2 ("itself, watched") then built `lst` commands with `lst`, found faults
in its own gates, and each fault held the build for Robin by the draft's own rule (§5.3). The DuckDB pipeline started in week nine.
- Evidence: v3.0 to v3.2 "were built but never run end-to-end" (CHANGELOG:4225); phases 8 to 10 and package H have never run; 194 h of run 3's 360 h
  was Robin patching werkbank; since July the record holds phases 5 to 7 of one package of outside work. "By itself" can cover only `lst` (Architect
  M5c), the least typical part.
- Kills it, cheap: put the outside job first (story 6); drop "builds itself" as a stage goal and replace it with "second outside job"; write a date
  and a line now (below, MUST 1). Nothing dear is needed.

**2. "The spec I signed is not what was built" (§5.3, §5.6, §10).** In run 3, 14 of the 24 test-able real finds ended in a spec or plan edit and five
cited no clause that required the behaviour (`spike-exec-findings.md`). Under the draft each is either a question that parks a package (so "no stops
after the spec" fails) or, under the Green Hat's M4, an amendment the orchestrator makes alone. On a 12-unit build that is a dozen or more amendments,
each decided by a ruling nobody re-reads, each then pinned by a test that "stays in the suite" (§8).
- The record on such rulings: werkbank's second opinion changed the outcome in 9 of 100 cycles, 8 of them among the 71 that edited spec or plans
  (V8.3-SCOPING §4.1; my subtraction). Find 297 was red for the wrong reason and the first opus ruling accepted it; find 340 cited one criterion while
  another required the opposite, and its fix "turns five tests red". M-9: the orchestrator ruled from plan text without opening the code, and the
  false premise, written into a test docstring, "read as settled fact through two further audit rounds".
- Intake cannot see a bad test: 2 of 4 first versions written in the spike were flawed in a way that showed only on the fixed tree. "Fix once,
  everywhere" (§5.3) then applies one wrong ruling at every site.
- Kills it, cheap: MUST 2. Not cheap: an oracle outside the build's own tests. For a pipeline it happens to be cheap (the same transform as SQL in
  DuckDB; Green Hat SHOULD 2); for a numerical kernel it is not.

**3. The orchestrator left the flow and nothing noticed (§4.3, §10).** Four guards cover four actions. The rest of the flow is text, and after a reset
the orchestrator knows only what a slot holds.
- It does the work itself. A worker fails twice; the orchestrator reads the code and debugs in its own turns (no guard stops reading or running
  things). Context grows inside the step, the size guard forces a reset mid-step, and its reasoning has no slot. werkbank: at least 80% of
  orchestrator turns were plumbing; 3 of 12 canary finds came from "the orchestrator's own fix lane, which has no brief".
- It forgets what it ruled. A rejected finding is filed again by the next auditor; the fresh orchestrator rules again, perhaps the other way. werkbank
  needed four releases for this loop (8.2.12 to 15, "$3.50 a lap").
- It forgets what Robin said. A typed message is kept "until the orchestrator has filed it" (§4.2); the filing is a paraphrase, and the original is
  then dropped.
- A spike of mine (A1; haiku, a toy unit whose test and code disagree where the spec is silent, 8 runs, about $0.45) went against the worst version of
  this story: 0 of 8 edited a file they were told not to, and all 8 obeyed the refusals. But all 8 ended by parking the unit for the owner; 6 of 8
  told the implementer to change the code to match the test before reading the spec; and 2 of 8 filed a question that misstates the signed item
  ("S-004 says keep last row"; it says neither). Compliance held; the stop and the false record did not.
- Kills it, cheap: MUST 3 (count every departure, permanently; closed groups and Robin's words get slots). Not cheap: auditing rulings in general,
  which is where werkbank's 62% went.

**4. The guard list stayed short and the driver grew back somewhere else (§3 principle 5, §4.3).** The tripwire watches the mod. Growth went to `lst`
refusals, to the orchestrator's own skill (prose, "the largest owned prompt, and not in the draft": Architect M2) and to stop rules.
- Of T2's ten rule groups (52 of 55 patch releases), five have a place in the draft and five have none or half of one (A3): stop-rule accounting
  (9 stops, 39.5 h), pause and resume disposition (7 releases), "already ruled", ruling-edit delivery, and checks accusing outside their view.
- "A refusal, never a route" leaves the route to the model. In my spike a refused model stopped and asked (A1), so every refusal kind is in effect
  a stop kind; the draft already has five more (two nudges; two fix cycles; a round with nothing new; a missing mark; a wronged gate) and no table of
  them. werkbank's `fuses.py` is 1,047 lines of this. The spike mod is already 470 lines with no guard, dispatch hook, ledger or stale-cut logic.
  Kills it, cheap: MUST 3. Not cheap: nothing; it is discipline, and the record says discipline lost.

**5. Route F broke on a Tuesday (§4.2).** The mods API is weeks old (first in 2.1.287; the spikes ran on .291; its docs already disagree with its
types; "Anthropic has turned installed mods off remotely", `mods.md` §8).
- Untested and on the hot path: a sub-agent in flight; hold and kept messages across a change of session id (`$.state` is reset on resume, `mods.md`
  §9); background tasks owned by the session left behind; a cold cache.
- Not in anyone's list: **permission grants made during a session.** Both spikes passed every tool on the command line (`drive/start.sh`), so neither
  could see whether "allow for this session" survives a resume into a new id. If it does not, the commonest stall in the spike (spike-live §10.2)
  returns at every reset.
- **The stale cut is the normal case, not the exception.** If most real finds amend the spec or a plan (story 2), the "stable" prefix is rebuilt about
  once a unit, and the path F has never run is the one it runs most.
- The fallback is not a fallback: A needs a different `hydrate` (Architect M1), so it is a second implementation that nobody runs until the day it is
  needed.
- Kills it, cheap: MUST 4. Not cheap: route G, which is werkbank v3's runner again.

**6. It worked, at ten times the price of asking Claude directly (§8).** The Economist's first estimate is $570 against $10 to $90 for one session,
and no line of it is measured. Wall time is worse than dollars: the 8.3 hand build took 15 to 60 minutes a unit for one worker, the draft has seven
roles a unit, and run 3 took 360 h. While a build was parked on the throttle Robin ran the plain session to see; it finished the same evening.
- Kills it, cheap: the Green Hat's baseline (her M2), which I would make stage zero. Its weakness should be stated: one job, counted by one reader,
  cannot show a difference smaller than about two to one.

**7. The last fix was the bug (§5.3).** v3.3: "Phase-7 round 3's three sharpest findings all came from round 2's fixes." The draft's guard is a fresh
reviewer who "reads the fix diff only"; v3.3's own remedy was the opposite, a round scoped to include the remediation and its blast radius, because
the damage is outside the diff (F-17's fix covered one of two twin sites). Kills it: MUST 5.

## MUST-fix

**M1. §7, §8: stage zero is the outside job, and the abandon line is written before S1.** Order: (0) the cut-down pipeline in a plain session with
only the reset mod and one hand-kept checkpoint file, Robin counting defects; (1) the same job with `lst` and gates; then one rung at a time, each a
`flow.toml` switch that must beat the rung below. Write now: the date by which a pipeline Robin uses exists, the price and hours per unit above which
he stops, and the count of stops per build. Evidence: story 1, story 6. Cost: reordering; S1 shrinks.

**M2. §5.3, §10: a second read exactly where the record says rulings go wrong, and a mechanical check after the fix.** (a) A ruling that amends a spec
item or plan entry, or accepts a test, gets one fresh read that must quote the item and run the code (8 of 71 changed; M-9). Rulings on source and
tests alone get none (1 in 29). (b) After the fix, the finding's test must be green and every test that was green and cites another item must still be
green; if not, the finding is contested and goes to (a). This is the check that would have caught 340 and both flawed spike tests. (c) Amendments are
fields on the item with the rejected options, and Robin's closing report is a rendered diff of the spec he signed, with the count. Cost: about $2.50
an amendment [E].

**M3. §3 principle 5, §4.3: one table of what stops or parks a build, one generic outcome for repeated refusal, and one tripwire over every
deterministic part.** (a) List every stop and park kind in one place with its owner and its exit; a kind not in the table cannot stop the build
(werkbank's K1). (b) A third refusal of the same action parks the unit with an issue on Leitstand's own list and `lst next` moves on: no per-guard
rule. (c) Every guard also counts in `warn` form for good, and `step_done` records departures from the step's contract (no gate run, an edit by the
orchestrator, a dispatch outside `flow.toml`); the count per build is the evidence for path A against B that S0-c's three-unit toy cannot give. (d)
The tripwire is the sum of `lst`, mod, helper, watchdog and the orchestrator's skill, plus the number of refusal kinds. Cost: a day; mostly a table.

**M4. §4.2, §7: F2 before S1, widened, and kept as a canary; and a manual mode.** Add to F2: a session-scoped permission grant across a reset; a
sub-agent that takes 6 minutes and one that takes 65 (which cache class a resumed fork is in: `mods.md` §7 puts forks in the 5-minute class,
UNVERIFIED for a resumed one); a stale cut rebuilt at every third reset. Re-run it on each Claude Code upgrade before a build may use that version.
Reset once per unit, not per step, until F2 passes on the real mod: about a sixth of the exposure (SRE: 6 resets a unit). And the design must still
run with no mod: Robin types `/clear`, the orchestrator runs `lst hydrate`. Then a withdrawn API costs autonomy, not the tool. Cost: a day, a few
dollars of haiku.

**M5. §5.2, §5.3: a series ends on a check, never on a fix; and tests cannot quietly leave.** (a) After the last fix of any audit series: diff
mutation, the unit's property and end-to-end tests, and a reviewer given the fix's callers and sibling sites, not the diff alone. (b) A finding
records the commit it was `born_of`; the share born of fixes is reported per build. (c) `lst unit done` refuses if the set of tests citing the unit's
items shrank, or gained an `#[ignore]`, without a ruling: an attestation "for a tree" is satisfied by a tree with fewer tests. Cost: half a day; one
stellwerk field (test ids per run).

## SHOULD-fix

- **Run every spike of the orchestrator on the model that will be the orchestrator** at least once. Every figure for the reset, the nudge and
  `step_done` is haiku on a toy step.
- **Lint the linter.** v3.3: "two of the run's mechanical gates were silently measuring nothing"; the criterion lint reported 1 of 97 covered against
  a true 61. Each `lst lint` rule ships with a file that must fail it.
- **Record Robin's words verbatim** when a kept message is filed; the orchestrator adds its reading beside them.

## Attacks on the other lenses' proposals

- **Architect M3, the skeleton.** Right, with two holes. (i) With `todo!()` bodies every test fails by the same panic, so "fails for the right reason"
  cannot be shown and a test that asserts nothing passes the red check; the test audit is then the only reader of test quality until code lands (M-2's
  vacuous green, reversed). (ii) A signature change is an edit in every consumer's files, which G1 refuses, while the crate will not compile: a
  deadlock by construction, with interface changes common (14 of 24). It needs one named operation: one role, the signature and all call sites in one
  commit, T2 after. That is new machinery; say so.
- **Green Hat M1, slices.** Right for a pipeline. But G1's "8 violations, 0 false positives" was measured on units with disjoint files; a slice
  touches every crate. G1 shrinks to "writers write tests, implementers write source", which is still the line that matters (ImpossibleBench: cheating
  fell from 54-76% to under 1% with tests out of reach). Her M4 ("silent: the orchestrator decides") is story 2 unless M2 above goes with it.
- **Economist M2, drop the per-unit code audit; cap at two rounds.** "25 of 27 reachable earlier" is one reader's hindsight; the earlier checks
  existed and did not catch them. The saving rests on his M3 at an assumed 50% catch, unmeasured in Rust. Make it a rung measured on S0-d's seeded
  faults, not a decision. And a cap of two rounds ships round two's fixes unread unless M5a is the tail.
- **Architect M2, guards into `lst`.** Right for testing, but it moves growth out of sight of the draft's tripwire (story 4). **SRE M2, the
  watchdog:** the forbidden list is good; "relaunch held with a recovery prompt" is a resume path, and resume took werkbank eight releases. Notify
  only, until S4 has run once.

## The flow

Smallest loop first, and each addition earns its place: (0) plain session, reset mod, one checkpoint file; (1) spec items with examples, a compiled
skeleton, gates by hook; (2) a separate test writer; (3) diff mutation; (4) one audit handing back failing tests, with M2 and M5; (5) panels and the
package layer, if a job is large enough to need them. I side with the Architect and the Green Hat on a skeleton and behaviour-sized units for the
pipeline. What I add: reset per unit before per step; a build that ends each series on a check; and no stage whose only product is Leitstand.

## The checkpoint files

How each check can be met on paper while the build is wrong:
- **Item-to-test links.** A test tagged `S-012` that asserts little satisfies the lint. Give the link teeth: a mutant in the code a unit claims for an
  item must be killed by a test tagged with that item (where cargo-mutants can report it; UNVERIFIED), and M5c stops the set shrinking.
- **`kind`.** An item marked non-functional owes no test. The author is a model. Lint the share of items with no owed test, and put that number on the
  page Robin signs.
- **Notes.** A promoted note is a standing instruction in every later context, written by the party whose rulings are unaudited. A note may not say
  what a spec item means (that is an amendment, M2c), must cite a test or commit, and has a cap per level (Economist). Otherwise M-9's docstring
  recurs at spec level.
- **Stability.** The split into stable and changing files assumes plans are stable; the record says they are not. Measure prefix rebuilds per unit in
  rung 1 before the cut machinery is built around it.
- One item per file, TOML, `lst` as sole writer, state rewritten whole: I could not break these. Keep them.

## Questions the draft does not answer

(1) On what date, at what price and after how many stops does Robin stop? (2) What does the orchestrator do after the third refusal of the same
action? (3) Which model orchestrates, and has any reset, nudge or guard been run on it? (4) Who reads a ruling that amends the plan, and what does
Robin see of the amendments? (5) What happens to a build in flight when Claude Code updates or mods are switched off? (6) When Robin steps in and
directs by hand, is that step recorded, and by whom?

## What must survive revision

§2 and §10 as written. State as files, one writer. The `refuse`/`warn` switch per guard. Hold on anything Robin types. Findings routed by target,
harness findings never rejected. The reset behind one function. The pipeline as the first outside job, moved earlier still.

## What I checked

Read directly: `spike-exec-findings.md` §0-1; V8.3-SCOPING §4.1; CHANGELOG v3.3; `stellwerk-v3-meri-notes.md` M-2, M-9, M-35; T2-consolidation §2;
`mods.md` §7-9; the three spike reports and two `drive/start.sh`. Counted: `lst` commands; mod lines. Ran: the spike in A1 (haiku, 8 runs). Not
verified: Claude Code release dates; whether a session permission grant survives a resume; the cache class of a resumed fork; cargo-mutants' report
format; the Economist's dollar figures, used as given. The spike is a toy on haiku and says little about opus.
