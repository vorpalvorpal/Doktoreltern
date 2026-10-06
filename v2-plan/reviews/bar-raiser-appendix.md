# Bar Raiser appendix

Cited from `bar-raiser.md` as A to E. Proposed numbers are marked [P]: they are mine, chosen to be
failable, and Robin should replace any he disagrees with. Estimates are marked [E].

## A. The cold-reader spike (what I ran)

**Question.** Can a reader with nothing but the checkpoint files resume a build? The draft shows no
file content, so I used the fullest schema on the table, the Architect's (`architect-appendix.md` §B).

**Set-up.** `scratch/bar-raiser/askability/`: 16 mock files in that schema (a lookup `flow.toml`, 2
spec items, 1 question, 1 package, 1 interface, 3 unit plans, 3 unit states, 1 finding, 1 group, 1
note), frozen at a point where the session has died: U-2-01 done, U-2-03 in `write-code` with an
intent record showing an implementer dispatched, U-2-04 reopened by group G-0012, package P-3 parked
by Q-003. Twelve questions (`questions.txt`), told to answer from the files only and to write NOT IN
FILES where the files do not decide. Three runs of `claude -p --model haiku --tools ""`, 5.1 kB
prompt. Cost $0.17 in all ($0.056 to $0.060 a run). Nothing left running.

**Result** (answers in `run1.json` to `run3.json`):

| Q | Asked | Do the files decide it? | 3 runs |
|---|---|---|---|
| 1 | current unit and step | yes | 3 right |
| 2 | was a sub-agent dispatched; did it finish | dispatched yes; finished no record | 3 asserted "did not finish" from the absence of a field |
| 3 | files the implementer may edit; may it edit the unit's test file | files yes; test file no record | 3 right on files; 3 asserted "no" on the test file (role scope is not in the files) |
| 4 | which tests are expected red now, which must be green | no record | 3 different answers, none said NOT IN FILES |
| 5 | why U-2-04 is reopened and what closes it | yes, loosely | 3 right, none named the attestation |
| 6 | test form owed by S-012; does the test exist | form yes; existence no | form 3 right; existence: 1 NOT IN FILES, 2 inferred "exists" |
| 7 | may P-3 start | yes | 3 right |
| 8 | why row content, not row order | yes | 3 right |
| 9 | the single next action | no rule in the files | 3 said wait for or check agent a7f3, which died with the session |
| 10 | fix cycles left on G-0012 | no (the two-cycle rule is only in draft §5.3) | 3 NOT IN FILES (right) |
| 11 | is U-2-01's attestation valid for the tree now | no | 2 NOT IN FILES, 1 guessed "no" |
| 12 | what U-2-04's spec item requires | file absent on purpose | 2 NOT IN FILES, 1 rebuilt it from the group's reason |

**Reading.** The static questions (1, 5, 7, 8) were answered right every time. The three a resume
turns on (2, 4, 9) drew a confident answer the files do not support in 9 of 9 cases, and question 4
drew three different ones. So the schema is good at "what is planned and decided" and not yet enough
for "what was in flight and what is the tree supposed to look like". Slots this points at: the
outcome of each dispatch (the intent record has a start and no end); the set of tests expected red,
by unit and step (the Architect's M3 asks for this but his schema has no field for it); write scope
per role, not per unit; the limits the flow relies on (fix cycles, rounds) as data in the rule card;
the rule after a crash (the SRE's "redo, not resume"); the tree key now, printed by `lst`.

**Limits.** My fixture and my questions, several written to probe gaps I expected, so this shows the
test is workable and cheap, not a rate. Haiku, not the orchestrator's tier. Run 3 answered question
9 with "no polling per checkpoint rules", which is in Robin's Claude memory and not in the prompt:
the reader was not fully cold. The real test must run with user and project settings switched off.

## B. Ruling on each MUST the panel has filed

"Now" means before S1 starts. Verified = I checked the evidence myself; otherwise I rely on the lens.

| Lens, MUST | Ruling | Why |
|---|---|---|
| Architect M1, route F as a cached pure function (`stable`, `delta`, digest) | Now | The draft is two designs until this is done. |
| Architect M2, every decision in `lst`, mod as adapter | Now | Costs nothing now; keeps guards testable and portable to route A. |
| Architect M3, compiled skeleton, expected-red record | Now | Five lenses reach it independently. My spike: no field holds the expectation. |
| Architect M4, state per unit, intent record, no parallel builds | Now | Serial also removes his own objection to slices (main file, ruling 1). |
| Architect M5, F2 into S0, S1 split in three | Now | Decides the shape of `hydrate`; SRE M1 agrees. |
| Green Hat M1, unit = behaviour slice | Experiment E1 | Argument only; no figure for Rust or this job. |
| Green Hat M2, baseline, then a ladder | Baseline now; ladder cut to two switches | No baseline in the record (verified by search). Five rungs at 3 runs each is 15 or more fixture runs. |
| Green Hat M3, item classes, examples, one real file | Now | Same ask as Economist M3. |
| Green Hat M4, "silent" decided by the orchestrator; Robin marks ten examples | Now, with Robin's yes | Changes what he signs. 14 of 24 finds ended in a spec or plan edit. |
| Green Hat M5, seam tests real to real | Now | Follows from the skeleton. |
| Economist M1, cost model and budget | Now, as [E], with a stop price | Without it "too dear" cannot fail. |
| Economist M2, one audit layer, a cap | Cap of 2 now; which layer by switch | "Nothing new" never fired (verified, `spike-policy.md:47`). |
| Economist M3, writer owns property and differential tests | Now | 13 of 27 finds. |
| Economist M4, a number for "judge less" | Role tag on every ledger row now; the 45% target after S2 | The tag is one field; the target needs a first measurement. |
| Economist M5, label the spike costs, price the cold cache | Now | Text only. |
| SRE M1, test F as it will be used | Now, without item (a) | Remote Control and "from his phone" are in neither BRIEF.md nor the draft (verified by search). |
| SRE M2, watchdog | Stage S3, notify only | Relaunch is the part that grows into a driver; v1 restarts by hand. |
| SRE M3, permission allowlist, stall detection | S1b | Dialogs were the commonest stall in the spike. |
| SRE M4, resource plan, S0-b first | Now | `cargo` and `rustc` are not installed on this machine (verified). |
| SRE M5, checkpoint in its own git repository | No for v1 | With serial units nothing merges; two repositories make "unit done" and its commit non-atomic. Keep atomic writes, locked ids, generated index. |
| Red Team M1, outside job as stage zero; abandon line written now | Now, in two parts | The abandon line is my M1. Its stage zero (plain session plus the reset mod, Robin counting) tests the reset and the flow at once: run the baseline with no mod, scored on the held-out set, and the reset on its own job. |
| Red Team M2, second read of rulings that amend spec or plan; a check after the fix; a rendered diff of the signed spec | Now | The record's figure is specific (8 of 71 against 1 of 29; not re-derived by me). It is the price of Green Hat M4. |
| Red Team M3, one table of stops, one outcome for repeated refusal, one tripwire over all deterministic code, departures counted | (a), (b), (d) now; (c) in S2 | (a) is the contradiction the auditor found in §3. (d) replaces the mod-only 1,500 lines. |
| Red Team M4, F2 widened and kept as a canary; reset per unit first; a manual mode | Now | The session permission grant across a reset is untested by anyone; manual mode needs no code. |
| Red Team M5, a series ends on a check; `born_of`; the test set may not shrink | (a), (c) now; (b) in S3 | (c) closes a real hole: an attestation for a tree is met by a tree with fewer tests. |

Red Team's review was read while still in progress (its spike result line was a placeholder), so its
spike is not weighed here. Of the panel's 25 MUSTs: 17 accepted before S1, 3 accepted in part with
the rest staged, 2 staged later, 2 sent to experiment, 1 refused.

## C. Where a builder would have to ask (decidability gaps in the draft)

1. **No model is named for any role.** The only tier in the draft is haiku, for the spikes (verified
   by search). The Economist priced an opus orchestrator the draft never chose.
2. **The orchestrator's own instructions** are not a deliverable in any stage (Architect M2 table).
3. **"Unit"** is "one file or tight group of files"; no size, no rule for cutting one.
4. **Who writes the Rust signatures** that tests-before-code needs, and who may change them.
5. **Every spike lacks a threshold.** S0-b: no time or memory limit that means "too slow". S0-c:
   "counting what each would have refused", no count that selects path A or B. S0-d: "count how many
   pass intake and how many are right", no pass mark. F2: "decides whether F is safe", no number of
   faults in 30 resets that means unsafe. A1: no result that means "drop A".
6. **Unset numbers:** T1 "a few minutes"; T2, T3 "[open: measure]"; the context guard's "set share";
   the S4 bar "set after S0-d"; "if most findings arrive as prose" (given 14 of 24, it will).
7. **Stops.** Principle 6 says only spec changes and gate faults reach Robin; §4.2 also stops on a
   reset fault and a missing `step_done`; §8 says "no stops after the spec is signed".
8. **S1** lists G1 with `lst`, while §4.3 puts G1 in the mod; S2 is built "by itself" but the mod,
   helper and shims are not Rust (Architect M5c).
9. **Where `leitstand/` lives** relative to the product repository and to a tree hash that must not
   change when a result is recorded.
10. **The reference job's size**: units, lines, spec items (Economist Q1). Every cost scales with it.
11. **Toolchain.** S0-b cannot start without installing Rust, cargo-nextest and cargo-mutants.

## D. Experiment E1: one skeleton, three loops

Tests the flow and nothing else, so it needs no `lst` and no mod. It can run while S1a is written.

- **Job.** A cut-down pipeline: one CSV format in, two DuckDB tables out, about 10 spec items [P].
- **Shared inputs, made once.** The spec items with classes and examples; a compiled skeleton
  (workspace, signatures, `todo!()` bodies, one red end-to-end test); and a **held-out check set**
  of at least 40 checks [P]: Robin's ten marked examples, a differential run against reference SQL
  in DuckDB over at least 20 generated inputs, and 10 named failure shapes. A separate session
  writes it; it is kept where no arm can read it.
- **Arms**, each hand-orchestrated in plain Claude Code as the 8.3 build was, sonnet workers:
  - **P, plain:** one session completes the skeleton from the spec, told to test as it goes.
  - **U, units:** file-sized units; a test writer who sees signatures only; an implementer; diff
    mutation; one code reviewer handing back failing tests (draft §5.2 with the Architect's changes).
  - **S, slices:** behaviour slices; one worker writes tests and code; diff mutation; one reviewer
    (Green Hat C1).
- **Runs.** P three times, U and S twice each: seven runs.
- **Recorded per run:** held-out checks failed; tokens by role; wall minutes; orchestrator rulings;
  signature changes after the skeleton; every time a person had to type.
- **Decisions.**
  1. If neither U nor S fails at most half of P's median, the flow does not earn its cost on a job
     this size: build the reset, `lst` state and the small mode only, and try once more on a larger job.
  2. Between U and S, fewer held-out failures wins; within one check of each other, fewer tokens wins.
  3. More than one signature change per slice after the third [P]: the skeleton step needs the full
     panel, or the job needs just-in-time interfaces.
  4. If P's median is 2 or fewer failures of 40, the check set is too easy: harden it once and rerun P.
- **Cost [E].** P $5 to $20 a run, U and S $20 to $60: $95 to $300 in all, a few days of throttle,
  against $950 to $1,800 [E, Economist] to build S1 to S6. None of this is measured.
- **What it cannot show.** Two or three runs an arm separate a twofold difference, not a 20% one.
  A ten-item job has few seams. werkbank's small live runs passed 0 of 13 as gates; treat E1 as
  choosing a direction, and re-score the choice on S4 with the same kind of check set.

## E. Success criteria for Leitstand, each able to fail

Measured on S4, the reference pipeline, against the plain-session baseline run on the same spec and
scored by a held-out check set built as in D. All thresholds are [P].

| Feared failure | Measure | Baseline | Pass | Stop or change |
|---|---|---|---|---|
| Output not trusted | held-out checks failed | median of 3 plain runs | at most half the baseline; 0 among Robin's marked examples | not better than the baseline's best run: stop the flow, keep the small mode |
| Output not trusted | Robin's own review, 30 minutes, after the score is known | none | no defect he calls serious that a signed item covered | any: find which check should have caught it before another build |
| Too dear | usage, in the ledger, by role | plain run's usage | at most 5 times | above 10 times: cut the dearest judging step and rerun; twice running: stop |
| Too slow | elapsed hours, split running, parked, held, waiting | plain run's elapsed | reference build inside 72 h | above 120 h, or more than 25% of it stopped for repairs to Leitstand (run 3: 194 of 360 h) |
| Attention | stops that needed Robin; his minutes after sign-off | run 3: 53 stops | at most 2 stops and 30 minutes | more than 5 stops: the build is not unattended |
| Autonomy (the brief's own problem) | resets; manual compactions; undetected reset faults; share of orchestrator turns that are plumbing | v2: 80% plumbing or more | 40 or more resets, 0 manual compactions, 0 undetected faults, plumbing at most 40% | any undetected fault |
| Regrowth | lines of deterministic code (`lst`, mod, helper, watchdog), tests excluded | werkbank 10.8k at the start, 49.3k after 5 weeks | at most 5k at S4 | above 8k: review against principle 5 before any new feature |

Two things the table needs from Robin: the multiple of a plain session he would pay for half the
defects, and whether 72 hours for the reference build is the right order.
