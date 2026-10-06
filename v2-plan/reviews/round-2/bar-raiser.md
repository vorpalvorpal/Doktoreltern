# Bar Raiser, round 2: rulings on V2-SYNTHESIS.md and on the panel

Read: the brief, the synthesis (with §6 as amended for gate levels), MODULARITY, all six round-2 reviews and their appendices,
`research/file-formats.md`, `mods.md`, `sdk-and-frontends.md`, the F1 report. `red-team.md` is complete; its appendix is not in the
folder, so I read its scratch files. Detail, a spike and an example gate plan: `bar-raiser-appendix.md` (A to F). **[P]** = my numbers.

## Verdict
1. The base-and-pack cut is right and the Architect's version of it is the one to adopt, with four amendments. The order is wrong: no
   module comes first. A real sampleTidy job in R comes first, with four small files.
2. The synthesis cannot be built from, by intent. One more page makes the first step decidable; nothing above that step needs deciding.
3. The scheduler is not worth building above a habit. Three parts of the idea survive, and one cheap experiment would reopen it.

## 1. The split
**Adopt the Architect's split (his appendix §7), amended.** It is the only one of the three that gives every piece verbs and a "never
knows" list, and it removes the two modules (C, H) that could not be deleted alone.

| Piece | Contract | Status |
|---|---|---|
| **Carry** (new) | One file of standing rules, decisions and dead ends, under 9,000 characters, re-planted word for word at every context start by whatever route is in use. Never written by summarising | Rung 0 |
| **Session** | `handover` (write and check a state note), `mark`, `rewind --then`. The route sits behind the verbs: typed commands and a hook; a helper; a mod. Run state is machine-local | Note at rung 0; the rest at rung 1 |
| **Gates** | One command per check; exit 0 met, 1 deviation, 2 tool fault (2 always stops). Includes the scope gate and the hash check on owned paths. Knows no project | Exists; two small additions |
| **Expectations** | The project's own files: marked examples, goldens, the gate plan, any normaliser. Owned by Robin; changed only by his ruling. Not a tool | Rung 0 |
| **Work** | `begin` records the base tree; `end` computes the diff, runs scope and gates, writes one immutable record | After the baseline |
| **Store** | `put get lint ready`; `ready` prints in id order. `render` is a separate command reading `get --json` | Only when plain files fail twice |
| **Watchdog**, **Pack**, **Rank** | As the Architect has them. A pack is a skill: card, classes, a gate profile, scripts; no order, no conditions | Later; Rank not built |

**The amendments, each a ruling between lenses.**
- **Ownership is a rule over paths, checked by a gate** (Green Hat, Red Team) and not a refusal inside the store (Architect). The
  Architect concedes the store refusal is a tripwire, and the path rule works on sampleTidy's `CONTRACT.md` today with no store.
- **Handover is two carriers** (Red Team). Her chain kept 0 of 9 standing rules through two model-written notes. State goes in a note;
  rules go in Carry. My spike shows the carrier works and where it breaks (section 2).
- **`render` sits outside the store tool** (Green Hat over the Architect). Both say it is the first thing to be rewritten; his own rule
  that only the tool reads the files makes the separation free.
- **Green Hat's two kits are the packaging, not the architecture:** a long-session kit (Carry, Session, Watchdog) and a trust kit (Gates,
  Expectations, Work). Her "every module at its thinnest from day one" is rejected: eight thin modules kept alive cannot be found
  unnecessary (Red Team). Her better idea is kept: the first implementation of every contract is configuration.

**The test for modularity (appendix C).** Four checks, each of which can fail:
- **Deletion, run for real.** A script removes one piece, then runs the others' tests and one wired smoke run with a seeded defect. Each
  named fallback is used once for a real working session.
- **A second implementation before a contract is called fixed.** Session passes one acceptance script by two routes; `render` passes the
  cold-reader test from plain files and from the store.
- **Used on outside work before the next piece starts:** three sessions ending in sampleTidy commits.
- **One rethink drill:** in week three or four, swap the reset route on purpose; only that piece and the wiring file may change.

## 2. Rung 1
**Green Hat's claim, checked (appendix A, B).** I ran the hook route on the installed version: seven haiku calls, $0.20.
- A `SessionStart` settings hook fired at start, at resume and at compaction, and the file it printed reached the model word for word,
  including after the compaction.
- **Above 10,000 characters the file is not cut at the cap: the model gets about the first 2,000 characters and nothing reports it.**
  At 9,658 characters the whole file arrived. sampleTidy's two ruling documents are 118 KB, so Carry can only hold standing rules and
  pointers, and its size check is mandatory.
- Native `/rewind` with "Summarize from here" is documented as she says (`mods.md:48,93`). Not tried: it is an interactive menu.
- What no native part gives (`mods.md:42`): a trigger at a threshold with nobody watching, a return to a named mark by a program, and a
  check of the note before anything is discarded.

So she is right about function and wrong about attention: the missing part is the one that spares Robin. The SRE is right that it is three
parts with several unbuilt cases, the Economist that it saves cents, and the Red Team that the note, its real worth, fails as drafted.

**Ruling: the first thing built is rung 0, and it is not a module.** One real sampleTidy job in R, in a plain session: the gas readings
adapter (scoped in August, "no blockers") unless Robin prefers the corpus run. With it:
1. `CARRY.md` and the hook (nine lines; appendix A);
2. a `/handover` command that writes the state note under fixed headings, checked by a script;
3. a gate plan for that job, signed (section 4; appendix E);
4. a tally, one line per event: pauses by cause, things Robin had to re-tell, rulings asked, and **decisions the model took unaided**,
   each later marked by Robin as kept or reversed.

The fourth serves Robin's first reason for a model orchestrator. Every lens measured context or cost; none measures decisions. A plain
session is already a resident model using judgement, so rung 0 tests that reason directly. The Red Team's `run-until-decision` tool is the
right shape for Work later; do not build it now.

**Useful within a week:** sampleTidy gets its first commits since 9 August, on work Robin asked for; the baseline figures (usage, hours,
stops, Robin's minutes) exist; and the tally says which piece to build next. **Rung 1 is then the Architect's mod with the SRE's
additions**, built only if the tally asks for it.
**Results that mean stop [P].**
- Two weeks with no sampleTidy commit: stop tool work. The obstacle is not tooling.
- Context caused under a quarter of pauses, and Robin did fewer than five handovers by hand: do not build the mod.
- Carry fails ten facts through ten resets on the orchestrating model, or a cold reader scores under nine of ten on the note (appendix
  D): fix that before anything else is built.
- More than one unaided decision in five reversed: the case for a resident model is weaker than assumed; say so before building Session.

## 3. The scheduler
**Ruling: habit only. Delete rung 5.** For Robin, plainly: the scheduler he liked was never run. The code did dependency order with a
tie-break (auditor). On version 1's own store the formula decided 3 of 31 picks (Green Hat). On the ten port slices it gave the survey's
numbering at every confidence setting (Red Team). Centrality says how far a mistake spreads and has no term for how likely it is, so the
risky leaf (`.xls`) ranks last. The idea underneath is sound and forty years old; practice kept it as a list, not a formula.
**Keep:**
- **Readiness** as a plain query over `blocks` edges, printed in id order so it cannot rank.
- **A risk list:** at most ten entries, each with the doubt, what is wasted if it is wrong, the cheapest check, and the evidence that
  closed it. This is "intensity", the best part of the design and the part never coded.
- **The habit paragraph** in the card, in Green Hat's wording, which moved a haiku's plan in 5 of 5 runs.
- **Confidence shown to Robin is never self-report.** Deriving it from gate records (Architect) is right; building it waits for Work.

**The experiment that would reopen it:** Green Hat's ordering test on the model that will orchestrate, twenty runs an arm: unaided; the
paragraph; the paragraph plus a ranked list (lowest rung, then dependents, ties shown). Score how early each plan reaches what later
proved costly in sampleTidy's fix history. Reopen only if the third arm beats the second in at least 15 of 20 [P]. Under $5, an hour.
Whether the habit holds at step forty is a later question; the Architect's per-slice log answers it at no cost.

## 4. Tests and gates
**On the three levels (the owner's reply; synthesis §6 as amended; questions 45 and 46).** Yes, the spec is the right place to choose
gates. Four rulings.
1. **No profile until a second project.** Write sampleTidy's plan by hand; extract a profile when another product of its class needs one.
2. **Who proposes: the agent, while the spec is written,** from the project's risk list and the mechanisms on offer. Robin signs.
3. **How a domain expert judges a plan without reading code.** He signs claims, not checks. Each gate is one sentence in his terms, a pass
   mark, a time budget, and **one wrong output it catches, shown as rows of his own data turning the check red**. Every plan carries a
   **"not covered" list** and totals. This is §6.5 put to use: proved once at signing, again when the gate changes; no canary suite.
4. **When a signed gate is wrong or too slow.** Robin owns the claim, the pass mark, the budget and the expected values. The agent owns
   the check's code. So:
   - the code is wrong or slow and the claim stands: the agent fixes it and reruns the red demonstration; no stop;
   - a gate runs over its budget: it moves to the release tier, recorded and reported; it is never dropped;
   - the claim or an expected value is wrong: a question for Robin, shown as rows; only dependent work parks; the gate keeps running as a
     warning. At most three such rulings a slice [P]; more means the plan was signed too early.

**An example plan, for one project** (appendix E): the gas readings adapter in R. Ten readings Robin marked by hand (10 of 10, 30 s); row
accounting over the 16 workbooks (0 unaccounted, 5 min); load twice or shuffled changes nothing (0 rows, 2 min); no source column ignored
without his say; named edge cases; hashes of the files he owns; R tests for the files touched; and, if their source holds up [U], the
12,656 gas analyses already in the database. One model read per slice. Under ten minutes a slice, thirty of Robin's; budgets unmeasured.
**Left out:** lint for owed test kinds (it proves a test exists, not that it tests); a selector for "the affected slice"; coverage; second
reads; mutation in R until a tool is verified; a shadow run; every port gate (if a port comes: adapter level only, normaliser proved).

## 5. Is it decidable enough to start?
For rung 1 as the synthesis has it: no. For rung 0: yes, after one page. The next draft must contain, and no more:
1. **The job and a date:** which sampleTidy task, the start day, and the abandon line from section 2.
2. **Four real files:** `CARRY.md` filled from sampleTidy's operating rules; a handover note written at a real stopping point; the tally
   with its columns; the gate plan as it would be signed, with its red demonstrations.
3. **Three contracts in full:** Carry, the handover note, the gate exit codes with the scope and hash checks. The rest stays a sketch.
4. **Numbers that can fail:** the two acceptance scripts (appendix D); gate budgets after measurement; three rulings and thirty minutes of
   Robin a slice; one in five decisions reversed; the quarter-of-pauses line.
5. **A tripwire:** all tool code under 1,500 lines and eight verbs before any pack exists [P].

Not needed to start: the tool's language, the file format (TOML stands, and nothing reads it yet), the store, the mod, any pack.

## 6. What the panel has still missed
1. **Nothing has been measured on the model that will orchestrate.** Every spike in both rounds is haiku, including mine.
2. **Robin's main reason for a model has no measure.** Hence the decision column in the tally.
3. **The carrier has a hard size limit that fails silently** (section 2). It turns question 11 (what stops notes growing) into a script.
4. **The hook fires on resume, and route F's reset is a resume.** If that holds under a mod [U], Carry is independent of the route.
5. **Nobody said how a non-engineer judges a gate.** Section 4, ruling 3.
6. **Round 1's held-out checks are still unwritten.** A path-deny rule now makes them possible; the ten marked readings start the set.

**The three questions to answer before anything is built.**
- **36, with the Red Team's rider: what does a port buy Robin, in one sentence?** Cheapest answer: Robin writes it. If the port stays
  live, the two spikes (`.xls`, units) cost $2 to $10.
- **12: what survives ten resets, on the real model?** Appendix D's two scripts; an hour, a few dollars.
- **45: can Robin judge a gate plan in twenty minutes?** Hand him appendix E as drafted and time it.

## MUST-fix
1. **§8:** rung 0 is a sampleTidy job in R with Carry, `/handover`, a signed gate plan and the tally; rung 1 follows the tally; the
   abandon line carries dates.
2. **§3:** the amended split and the four modularity checks.
3. **§6:** claims signed, code not; a red demonstration and a "not covered" list per plan; the three cases for a wrong or slow gate; no
   profile before a second project.
4. **§4:** habit, risk list and readiness; rung 5 deleted; the reopening experiment stated.

**What must survive.** Two verbs with the route behind them. No module names another. Exit codes with output on disk. Divergences shown to
Robin as rows. The evidence markers. Leaving open what nothing yet depends on.

**Verified:** the hook route and its size cliff (spike); `mods.md` on `/rewind` and hooks; sampleTidy's last commit date, gas scoping
and ruling-file sizes; the synthesis's corrected §4 and question 22. **Not verified:** `/rewind` in use; the hook under a mod-run resume
or `/clear`; any dollar figure or timing from another lens; Green Hat's outside sources; the origin of the legacy gas rows.
