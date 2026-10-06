# Red Team / pre-mortem, round 2: V2-SYNTHESIS.md

Detail, the scheduler hand-run and one haiku spike: `red-team-appendix.md` (B1 to B7). What I checked is at the end. Green Hat's round-2
review landed as I finished; where we agree I say so and do not repeat her, and I attack three of her proposals under the modules.

## Verdict

It is April. Rungs 1 and 2 work and are used daily, on sessions about Doktoreltern. sampleTidy's last commit is still 9 August 2026.
The module cut is sound and small; the failure is the order. "Used before the next is built" lets rungs 1 and 2 be used on the tool's own
planning, so real work first appears at rung 3, behind two modules, a file format and a mod on an early-access API.
Put sampleTidy at rung 0, in R, this week, and let each module be pulled out of that session by a pain that occurred twice.

## Failure stories, most likely first

**1. The third substrate.** The record [checked, B1]: Doktoreltern v1, 251 commits from November to August, 361 tests, one seven-node toy.
werkbank, 722 commits since 9 August. sampleTidy, built in 26 days (14 July to 9 August, 230 commits) with werkbank 3.3 and earlier, and no commit in
the 58 days since. Its `STATE.md` lists what is next: gas readings (scoped, "no blockers"), the corpus run, six dust rulings. None needs a new tool.
- The ladder repeats v1's order in smaller pieces: rung 2 is "used first... on scoping work such as this", the tool's own planning.
- The plan grew in one afternoon the way round 1's did: 7 verbs in the synthesis; 15 tool verbs, 4 mod commands and 3 operator commands after
  the Architect and the SRE (B2). Rung 1 went from "a mod" to a mod, a Node helper on a 274 MB SDK, a run-state file, a nine-heading checker,
  an undo, a version table, a launch check and a watcher. Each is reasonable. None was asked for by a session doing outside work.
  Kills it, cheap: MUST 1, and a count kept in the open: tool commits against sampleTidy commits, per week.

**2. Rung 1 shipped and the note ate the rules.** Every lens now says rung 1's worth is the handover note, not the cache (Economist: under $1
a day saved). Nobody tested the note. I did, without a mod (B3: haiku, three chains of eight notes, each written from the last note plus a
short work log, the Architect's nine headings, $0.46). Twelve facts were planted in note 0.
- Of 36 fact-instances, 27 survived one rewind, 13 two, 4 eight. **Robin's three standing rules: 2 of 9 after one rewind, 0 of 9 after two.**
  The nine headings have no place for a rule, so it went first. The goal, which has a heading and says "quoted", survived every time.
- In one chain an item logged as "assumed" was under "Decisions made" one note later. That is M-9 again, produced by the format.
- The Architect's rule "every fork is cut from the session that holds the mark" makes this the normal path: the prefix is fixed, and everything
  learned since travels note to note. `CLAUDE.md` covers written rules; it does not cover what Robin said on Tuesday.
- Caveats: haiku, a synthetic log, a 400-word cap, note 0 not laid out under the headings. Kills it: MUST 2. This is the honest case
  for a small store at rung 1, and against a model-written note as the only carrier.

**3. Rung 2: a store beside the files he already keeps.** Robin's present practice is a store: `MEMORY.md` with 35 entries, a checkpoint
"rewritten whole", a decision log, a questions file; in sampleTidy, `STATE.md` ("rewritten, never appended"), `CONTRACT.md` and
`OPERATING-RULES.md` with A1 to A86. Rung 2 on sampleTidy starts by moving 86 rulings into item files in a separate repository (Architect, SRE),
away from the code they govern. A `put` is a turn; an edit to a markdown file is also a turn and he can read the result in place.
- Kills it, cheap: before B exists, hand-write the `render` for sampleTidy from those three files and rerun the cold-reader test (haiku,
  cents). If plain files pass, B is a linter over files with headers. Build verbs when a refusal is needed twice.

**4. The seams, after ten violations.** The Architect's rule (no names except in a wiring file) is testable and I would keep it. It moves the
whole behaviour of the system into the one file no module's tests cover, and into the one process that has events.
- First violation, and he wrote it himself: `rewind --then "render $(next | head -1)"`. His grep catches `next`. It does not catch
  `store ready | head -1`, and `ready` is now in B. **Whatever order `ready` prints in is the scheduler.**
- Then: the trigger must not fire mid-task, so the mod reads `work` state. An open `begin` after a rewind needs a nudge, which is resume
  (eight werkbank releases). A pack gate reads the store for its oracle case. Signing and open questions take the mod and watcher into B.
- "No code in a pack" became "may ship gates". A gate is a refusal with an exit code. werkbank's driver grew by refusal kinds; here they
  land in `pack/gates/`, outside any line count. The F1 mod is 99 lines, spike-live's 470, the budget 200.
- After ten: shell inside TOML, a mod hosting trigger, hold, kept messages, signing, status, heartbeat and deferrals, and module suites all
  green. werkbank's real seam finds came 6 of 6 from one probe, none from per-unit audits.
- Each deletion test is met on paper by a second path nobody runs ("B removed: records go to a folder"). Kills it, cheap: MUST 3.

**5. The port was chosen because the tool is good at ports.** The oracle gate is the plan's best idea, so `port-with-oracle` became the first
pack, so the port became the job. In April the Rust or Python port is at slice 5 (feature alias, 1,998 lines), R is still in production,
rulings A87 onward are applied twice, and the corpus is not ingested. The survey advises against (65%), the Economist prices features in R at
a third of a bounded port, and no document records what the port buys Robin. Kills it: MUST 4.

**6. A mods update on a Tuesday.** The SRE covers it. The Green Hat and I found the same exit separately: a settings hook on `SessionStart`
(source `clear` or `compact`, 10,000 characters; `research/mods.md:63`) is not early access. Rung 1 minus trigger and cached prefix [U].
## The modules: what I would change

Keep the Architect's rule and his split of `ready` from `rank`. Change the base and three seams.
1. **The base is a real session on sampleTidy.** A module is extracted when a pain has a second dated entry: the Economist's rule of two.
2. **Consent is a rule over paths, not a store rule** (the Green Hat's change 1; I reached it separately). The Architect concedes the store
   refusal is a tripwire. Protected paths with recorded hashes, checked by the scope gate, work on `CONTRACT.md` today.
3. **Handover is two carriers.** A model-written note for state (done, in flight, next). An append-only file for rules, decisions and dead
   ends, re-planted verbatim by the route. The route (mod, settings hook, Robin) is the replaceable part.
4. **Derived gauges fight "never parse a body".** A fingerprint over an unparsed body drops an item to "asserted" on a typo fix, and 14 of
   24 real finds edited spec or plan. The report reads "asserted" most days, or the fingerprint narrows to a field, which is parsing. Defer.
So four things, each usable in the next sampleTidy session: handover (two carriers), checks (stellwerk with oracle and protected paths),
record files with a linter, and later one loop tool (below). The mod is an optional adapter of the first.

**Against the Green Hat.** (a) Her rung 1 is a port slice (R's ESdat output as goldens). It settles question 36 by building, and it is story
5. The same kit fits the gas adapter in R, and her gates on the database are the part that needs no port. (b) "Every module at its
thinnest" keeps eight modules alive from day one, so none can be found unnecessary. Start with what the session cannot do without, and add.
(c) A shadow run of both versions on every monthly batch is two languages with no end date: her own question, "when does it stop", first.

## The scheduler
I ran v1's `next_node` over the survey's ten port slices (B4; no model). The Green Hat ran it over R files and v1's store. All agree.
- Three confidence settings (all low; units and ACIRL `.xls` low and the rest tentative; both stamped high): **the same order each time,
  the survey's own numbering,** units 8th of 11 and `.xls` 9th. A risky leaf has centrality 0, so its priority is 0 at any doubt.
- With edges making units a dependency of three slices, it moved to 2nd or 3rd: the order came from who drew the edges. `next_node`
  already takes `pins` and `skips`.

**Habit:** adopt, with the true rule as its two lines: finish what a thing rests on, and before the skeleton hardens run the cheapest
check that could kill the scariest leaf. That is "intensity", the best idea in the design and the one never coded.
**Advisor:** against. It needs records, fingerprints and a lottery for confidently wrong items (Architect, appendix §6) to feed a tie-break
that changed nothing in my run. **Driver:** no. **Worth keeping:** the Green Hat's risk list; the fidelity fold as a report per slice,
computed from gate results with no store; and the rule that a confidence shown to Robin is never self-reported.

## The resident orchestrator, and the owner's reason for it

Robin's stronger reason: a model "can make decisions so not every possibility needs to be pre specified".
- **The cost of pre-specifying is measured and large.** 10.8k to 49.3k lines; 52 of 55 patches were ten missing rule groups; 194 of 360 hours.
  A token comparison that omits this is wrong, and the Economist's 11% for a driver omits it.
- **The record does not show a model making those decisions well.** v3's segmented orchestrator: no measured win, "never actually used on a
  real build". werkbank's recorded orchestrator errors (M-2, M-9, M-35) were errors of judgement. Round 1's spike: 8 of 8 stopped instead of
  deciding, 6 of 8 made the wrong first move, 2 of 8 misstated the signed item. All haiku or old werkbank; none is opus on a real job.
- **Most of the ten missing rule groups were not judgement.** Five had no home in the first draft: stop accounting, pause and resume, "already
  ruled", delivery of ruling edits, checks accusing outside their view. Those are memory across interruptions. A resident model with rewinds
  does not remove them; it moves them into the note, where story 2 loses them.
- **There is a hybrid, and it inverts werkbank.** werkbank's unmatched case was "stop, then patch the driver". Make it "hand the state to
  the model". A rule is then added only to take a decision from the model after it went the same way three times: a saving, never a fix.
  In one terminal session this is a tool the session model calls, `run-until-decision`: it runs the worker and gates and returns on anything
  but a plain pass. Plumbing turns go (the 80%), context grows by one result a step, Robin still talks to a model. Untested; try at rung 3.
- **So:** the wish justifies a model at every decision, not a model holding the loop between decisions. And rewinds remove a limit that may
  not bind: werkbank halted 53 times for Robin. Count pauses by cause at rung 0; if context is under a quarter, A is not the first module.

## Tests and gates
**The story where the weight returns.** (1) Owed kinds: the model assigns classes, and a class dispute is a ruling. (9) "A second read only
where a ruling changes the spec, the plan or an accepted test" is not a ration: 71 of 100 werkbank cycles did. (5) A seeded defect per gate,
re-proved on change, is a second suite; werkbank's canaries passed 0 of 13 by their own rule. (7) Tiers by what changed need a map from
change to tests; 58% of sampleTidy is database logic that most tests touch, so "the affected slice" is the suite (est. 5 to 15 min). (6)
Values "changed only by a ruling": six files in operation produced A73 to A86, 14 rulings in 12 days. Re-recording is the hot path.
**The story where it is too thin.** The oracle is green and R was wrong. The pipeline has committed 48 rows; 97,105 of 97,153 analyses are
legacy loads. Adapters to IR are a strong oracle: deterministic, and the full-corpus parse sweep passed in July. Reconcile and commit, 58% of
the code, have run live on one batch and one dry run, and need (files, starting database) pairs that do not exist as golden files. The
normaliser maps new ids by natural key, and resolving natural keys is the reconcile logic under test. Each R bug the port fixes is an
allowed divergence. And the oracle says nothing about new features, which are first on sampleTidy's own list.
**What I would do.** State the oracle at two levels and claim only the first. Run the R corpus run before any port slice; it is the next
milestone anyway. Prove the normaliser as the Green Hat specifies. Show divergences to Robin as database rows in domain terms: the one
review he can do in any language. For gas readings, try the 12,656 legacy gas analyses as an independent oracle [U: their source is not in
what I read]. Budget gates in Robin's rulings per slice and minutes per tier, written first. Build proposals 2, 3, 6 and 8 (with the
Architect's exit-2 correction) and her oracle-free relations; hold 1, 4, 5 and 9 until an escape is recorded.
**Mechanism, profile, gate plan (the owner's second update; B7).** Per project is what happened already: sampleTidy grew its own lint tests
and corpus gates. Three ways it goes wrong. (a) Choosing gates at spec time becomes werkbank's phase 3: a model proposes, a model audits,
Robin signs twenty items with pass marks nobody has evidence for. (b) A signed plan under consent makes every slow or wrong gate a stop for
Robin (question 46); harness faults were werkbank's main cause of stops. (c) Four profiles are named before one project has run.
**Fix:** Robin signs outcomes in domain terms ("re-ingest changes nothing", "no row is lost between file and database"); the agent owns
mechanism, parameters and budgets. He judges a line by watching it go red once on a planted wrong row; a line with no feared outcome is
theatre. One screen. A gate joins from a recorded escape, not from the menu. No profile until two projects' plans share lines.

## Open questions
**Answers.** 1: unknown until pauses are counted by cause. 2: no, and it need not be (story 6). 3: state by note, rules by verbatim file.
12: test it on sampleTidy's existing files first. 17 to 20: habit. 21: no step table. 25: it stops; plan for it. 30: a rulings budget, and a
gate only on a recorded escape. 45, 46: above. 36: features and the corpus run in R. 42: thin where it matters. 44: so far a build tool with no build.
**To add.** What does a port buy Robin, in one sentence? What fraction of pauses is context? What survives ten notes? What order does
`ready` print in? Who tests the wiring? **The three that matter most:** 36, 12, and the pauses-by-cause count behind 1.

## Rung 1
Rung 0 first: the gas readings adapter or the corpus run, in R, in a plain session, with a `/handover` command, the settings hook, an
append-only `CARRY.md` re-planted verbatim, and a tally (pauses by cause, re-tellings, rulings asked). Rung 1 is whatever the tally asks for.

## MUST-fix
1. **§8: rung 0 is outside work, and "used" means used on it.** Write the abandon line now: a date by which sampleTidy has new commits made
   with the tool, and the stops and hours per slice above which Robin drops a rung.
2. **§8 rung 1: rules, decisions and dead ends never pass through a model-written note.** Acceptance: 10 planted facts, 10 rewinds, 9 alive,
   on the model that will run. Cost: an hour, cents.
3. **§3: guard the wiring and the mod.** A wiring string is a command and literal arguments (no pipe, `$(` or `;`, linted). `ready` prints in
   id order. One wired end-to-end test with a seeded defect per wiring row. Mod lines, handlers and pack gates are counted in one tripwire.
4. **§5, §6: no port slice before the R corpus run and a named benefit; the oracle claimed at adapter level only until reconcile has goldens.**

**What must survive.** The two-verb rewind with the route behind it. The no-names rule. Gates as exit codes with output on disk. The oracle
gate and divergences shown as rows. Rung 3, the baseline, moved to the front. Leaving questions open: none of the above needs them settled.

## What I checked
Read: synthesis, MODULARITY, five round-2 reviews (not the Green Hat's appendix), `ctx_schedule.py`, the 8 August review (head), the port
survey, sampleTidy `dev/STATE.md`, `v3-segments.md`. Counted: commits in three repositories; verbs. Ran: B4; B3 (25 haiku calls, $0.46,
nothing left running). Not verified: the settings hook in practice; the legacy gas rows' source; R timings; the Economist's dollars.
