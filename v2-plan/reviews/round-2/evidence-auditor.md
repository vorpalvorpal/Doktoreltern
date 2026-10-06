# Round 2: Evidence Auditor

Checked against sources on 2026-10-06. I ran `pytest` from `ctx/` (361 passed, 1 skipped, 17 s). I read
the code and nodes named below. I did not run sampleTidy's tests, did not open the cited arXiv papers,
and did not re-audit figures the first auditor already corrected beyond confirming they were carried
over. Verdicts: correct / wrong / overstated / unsupported.

## Verdict (three lines)

1. The carried-over werkbank figures are right, with one changed meaning (canaries). Most new figures
   are right. The wrong ones cluster in two places: what v1's store and scheduler code actually is, and
   "nothing exists" claims in the prior-art section.
2. The scheduler in §4 is described from the design nodes, not the code. The code is simpler and has an
   ordering rule (leaves first) that the text omits; the "evidence ladder" is not implemented.
3. Two numbers in the synthesis are plainly wrong: "45% reconcile logic" (58% by its own table) and the
   "~1,000 lines carry over" (they call the 1,172-line parser they are meant to leave behind).

## The table

### Doktoreltern version 1

| # | Claim | Where | Source checked | Verdict | Correction |
|---|---|---|---|---|---|
| 1 | "Its store works: about 3,300 lines, 361 tests passing" | S §2 | `wc -l ctx`; pytest | overstated | 3,303 is all of `ctx` incl. scheduler, driver, run, MCP. Store-side (core 1,172 + store 542 + lint 189 + MCP 244) is about 2,150. 361 passed, 1 skipped: correct. |
| 2 | "marker language (17 kinds, 1,172 lines)" | S §2; M §2B | `ctx_core.py`; lean doc §5 table | overstated | 1,172 is the whole `ctx_core.py`: grammar, `collate`, and invariant checks I3 to I14. The lean doc's own table says "marker grammar + CHECKS". Code has 19 kind constants; the source says "~17". |
| 3 | "About 1,000 of its 3,300 lines would carry (store, lint, serving)" | M §2B | `ctx_store.py:29,401-404`; `ctx_lint.py:22` | wrong in effect | 542 + 189 + 244 = 975 is arithmetically right, but `_validate` (the "validated write") calls `ctx_core.parse`, and lint imports `ctx_core`. The carry-over is the parser it is meant to leave behind. Real reuse is the shape: directory layout, `_commit`, `append_record`, the ancestor-path serving. |
| 4 | "Its own measurement: 837 turns, about 75% of spend, cost grows with the square of turns" | S §2; M §4 | `store/nodes/16/32/66`; `research/tdd-plan-dogfood-lessons.md:91`; design.md:98 | overstated | The 837 turns are werkbank's stellwerk v2 orchestrator, written up in v1's lessons doc. v1 itself never ran a resident orchestrator at that scale. Say "werkbank v2's measurement, which v1's driver (#66) was designed against". v1's own cost constants (#66.q1) are listed as unmeasured. |
| 5 | "Its flow was exercised only on a retired seven-node toy" | S §2, §4 | nodes 16/32 (F3, fd1 to fd4), 16/60/64 | correct, with detail | The 7-node tree (mixtox #1 to #7) ran under `ctx_run` with real `claude` dispatch (13 to 14 July). Every real deepening was a leaf and a happy path; fission, the fault ladder and a stuck implementer are listed as never exercised (fd1 to fd3). |
| 6 | "weights were never tuned" | S §4 | `ctx_schedule.py` docstring | correct | "numeric mappings and the plain-sum centrality are deliberately simple defaults; #32 flags them as tune-empirically". |
| 7 | "Its own record calls the inner loop open" (offered as a risk) | S §4 | lean doc:7, §L4 | overstated as a risk | "Open" is Robin's instruction of 8 Aug that the plan/execute/verify loop stay pluggable ("keep the contract open"). It is a design choice, not an unresolved defect. The record's real open items are fd1 to fd3 and #66.q1. |
| 8 | "Confidence is provenance, never self-report: asserted < prior art < spiked < ... < user-tested" described as what the file does; "an evidence ladder that gates can raise mechanically" | S §4 | `ctx_schedule.confidence_label`; `ctx_core.py:133`; node 16/32 | wrong for the code; unsupported for the claim | The ladder is design (node 16/32). The code has three levels (low/tentative/high): from the ratio of resolved questions/validation items (>=0.999 high, >=0.5 tentative), else the declared `🧭` marker, else low. The declared marker is exactly self-report. Requiring a cited evidence reference is `#32.fut2`, a future item. |
| 9 | "Intensity" listed in "what it is (`ctx_schedule.py`, 275 lines)" | S §4 | grep `intensity` in `ctx/` | unsupported | Appears only in the design node. No code. |
| 10 | "So the next thing worked on is the least certain, most depended-on thing" | S §4 | `next_node`, `deepen_ready` | wrong | After the floor, best-first applies only among nodes "ready to deepen": all tree children and `Blocked-by` targets already `correct`. That is leaves first. The most central node (the root) is last. The formula ranks only among simultaneously ready nodes. |
| 11 | "a floor pass first (interfaces across the breadth, one tracer path to real)" | S §4 | `floor_met`, `next_node` | overstated | The code's floor is "every frontier node at least `interface`". The tracer path is in the design node (revised 13 July), not in the scheduler. |
| 12 | Formula `centrality x (1 - confidence)`; fidelity = min over non-dormant children; centrality from the graph | S §4 | `priority`, `effective_fidelity`, `centrality` | correct | Centrality = subtree size + Boundary in-degree + Blocked-by in-degree + aspect count (plain sum). Confidence values are 0 / 0.5 / 1.0, so many nodes tie; ties go to the lower issue number. |
| 13 | "The prior art found no tool that selects work by a value over a graph" | S §4 | prior-art.md:109; tracker survey lines 48, 167, 208 | overstated | The summary says "value-based selection has no prior art". The tracker survey found beads' layered ready queue and beads_viewer's PageRank and critical path, "close to your riskiest central nodes heuristic". True form: none ranks by risk (doubt x dependence); graph-ranked selection exists. |
| 14 | "Its 8 August review was never acted on" | S §2 | `git log` on `ctx/`, `store/` | correct | No commit to `ctx/` or `store/` after 24 July. `ctx_core.py` is still 1,172 lines. (That review said "keep the store and the scheduler".) |
| 15 | Consent: Doktoreltern "ended with" consent derived from what the human decided; store refuses; parks only dependents | M §2C | node 16/40, 16/32 "parks, never blocks", design.md:84 | overstated | Derived watch list: yes (11.3). But 16/40 is open, confidence low; q3 settled enforcement as a judgement check ("not a mechanical check"); design.md lists the watch mechanism as designed only. The mechanical refusal was a sketch; it is v2's proposal. |
| 16 | Askability rule; validated write with a commit; immutable per-dispatch records; ancestor-path serving | S §7; M §2B | node 16/32/66; `ctx_store._commit`, `append_record`; `ctx_mcp/server.py` | correct | Also: records are "no lint" appends (ctx_store.py:281). |

### Prior-art claims

| # | Claim | Where | Source checked | Verdict | Correction |
|---|---|---|---|---|---|
| 17 | "rules dropped at compaction were then broken 30 to 38% of the time" | S §7; M §2A | `third-party-review/rationale-capture-prior-art.md:47`; prior-art.md:125 | overstated | "0% to 30-38% (up to 59% for some models)"; 0% when the constraint survives. The summary itself calls it a single-author preprint. The warning stands; the number needs the hedge. Paper not opened. |
| 18 | "No tool rewinds a live session" / "Taken from others: nothing exists" | S §7; M §2A | prior-art.md:27; `research/mods.md:42,93`; `sdk-and-frontends.md:46` | wrong as stated | The survey's text says only that the fork-and-resume reset "is not covered anywhere in these files". Claude Code has `/rewind` (a human menu that truncates the conversation to an earlier turn, cache-friendly) and the SDK has `forkSession`. True form: no tool lets a program return a live session to a named mark and submit text. Also a naming collision: the module "Rewind" is not `/rewind`. |
| 19 | doorstop: one file per item; suspect links store the parent's fingerprint | S §7 | verification-gates:297 | correct | LGPL-3, about 653 stars. |
| 20 | OpenFastTrace: grammar tying spec to tests; "about 200 lines" | S §7; M §2B | verification-gates:288-301 | correct, with caveat | The 200 lines is the surveyor's estimate of a reimplementation; the tool is Java, GPL-3. Neither is stated in the synthesis. |
| 21 | beads edge names: `blocks`, `parent`, `discovered-from`, `supersedes` | S §7; M §2B | tracker survey:45-46 | minor error | The name is `parent-child`. `discovered-from` and `supersedes` are non-blocking annotations. |
| 22 | "Rejected by the surveys: durable-execution engines, tracker as source of truth, coverage thresholds, debate, parallel agents on dependent work" | S §7 | prior-art.md:135-142, 150-165 | overstated for one | Durable engines: "Spike, not adopt: DBOS; fall back to Burr". The others match (beads rejected as source of truth; coverage thresholds "theatre"; debate "net-negative"; parallel subagents "advised against"). |
| 23 | Seeded-defect calibration; protected baselines; dbt result shape; diff-scoped mutation | S §7 | prior-art.md:54,73; verification-gates:62,119 | correct | Protected baselines: ImpossibleBench cheating 54% to 9% (not quoted). |

### Spikes and carried-over figures

| # | Claim | Where | Source checked | Verdict | Correction |
|---|---|---|---|---|---|
| 24 | "8 resets, nothing leaked, 78.7k read from cache and 0.2k written per reset" | S §2; M §4 | `spike-f1/REPORT.md` §3; `runs/root/mod.jsonl` | overstated | 78,749 read / 207 to 231 written is the first request after a reset at [plan]; at [spec] 73,018 / 117. The run log shows reads of 73.0k to 79.7k (plus two zero-read requests I did not trace). Say "73k to 80k read, 0.1k to 0.2k written, first request after reset". Eight resets (six root, two sub-folder): correct. |
| 25 | Phone view followed; four things untested | S §2 | REPORT.md "Owner's observation" | correct | |
| 26 | "a cold haiku reader gave confident wrong answers to resume questions 9 times of 9" | S §2; Q12 | `reviews/bar-raiser-appendix.md:16,36` | overstated | Three haiku runs x the three questions a resume turns on (2, 4, 9) = 9 answers unsupported by the files. The static questions (1, 5, 7, 8) were right every time. "Wrong" is the appendix's "not supported by the files". |
| 27 | "8 of 8 haiku orchestrators stopped for the owner when a test and the spec disagreed" | S §2; Q25 | `red-team-appendix.md:29`; reviews/SYNTHESIS D4 | correct, caveat omitted | Same spike: 2 of 8 misstated the signed item to Robin. |
| 28 | "about $1 a defect caught this way against about $17 caught by a late audit" | S §6 item 1 | economist.md:17 | overstated | $17 to $18 per phase-7 find is measured. The $0.46 to $1.50 is a proxy: phase 4 was never priced, and $0.46 is one FIX-writer task. Treat as [E], not a comparison of measured costs. |
| 29 | "Canaries caught 0 of 13"; "canaries meant to prove the gates caught nothing" | S §2, §6 | werkbank-evidence.md:67; auditor row 19 | wrong wording | Source: 0 passes by the original rule in 13 reports; the automatic `defects.driver` counter read 0 in 13 of 13, while humans found about 17 driver defects over 14 runs. Canaries did find things; the detector did not. |
| 30 | 62% judging / 7% building; $10 to $45 vs $0.4 to $3.7; 53 stops, 46 h; 10.7 to 85 min; 10.8k to 49.3k; 25 of 27; 14 of 24; "$570, $300 to $1,200, 10x" | S §2 | evidence-auditor.md rows 1 to 19; werkbank-evidence.md:53,54,63,75 | correct (carried over) | 46 h is the merged figure; 101.7 h is summed. $570 assumes 3 packages, 12 units, an opus orchestrator (SYNTHESIS:209); labelled [P]. |

### sampleTidy

| # | Claim | Where | Source checked | Verdict | Correction |
|---|---|---|---|---|---|
| 31 | 15.8k lines of R | S §2 | `wc -l R/*.R` = 15,838 | correct | Tests 44,448 lines total (survey said 36.9k in testthat plus helpers). |
| 32 | 1,286 tests; no property or snapshot tests | S §2 | `dev/STATE.md:26`; grep `expect_snapshot`, `hedgehog`, `forall` | correct | 1,290 `test_that` blocks in 52 files; 6,077 passes. |
| 33 | PDF parsing and email trigger not built | S §2 | DESCRIPTION; grep `ellmer` in `R/` | correct | `ellmer` in DESCRIPTION, used in no R file. |
| 34 | "86 rulings live in the code" | S §2 | CONTRACT.md (A1 to A72), OPERATING-RULES.md (A73 to A86); sampletidy-port.md:96 | overstated | 86 is right (A1 to A86). They are written in documents and encoded in code; the survey says "encoded in code, not only in specs". |
| 35 | "a pipeline that is 45% reconcile logic" | S Q22 | survey table; `wc -l` | wrong | The survey's five files (reconcile 2,926, commit 2,173, feature-alias 1,998, mutate 1,018, db-schema 1,101) sum to 9,216 = 58% of 15,838. Reconcile alone is 18%. The point (not parsing; adapters 2,365 = 15%) stands. |
| 36 | (Missing) state of the oracle | S §5, §6 | `dev/STATE.md:19,51,119` | omission | At 2026-08-09 the first batch was ingested but "the corpus run has not happened" (~265 files, 213 ACIRL workbooks). The R version is the oracle, and its behaviour on the whole corpus is itself not yet established. |

## The scheduler (§4): what the record says

- **Formula and axes:** as in rows 8, 10 to 12. What runs is: floor to `interface`, then leaves-first
  readiness, then `centrality x {1, 0.5, 0}` among whatever is ready.
- **Tuning:** the docstring and node 16/32 both say the mappings and the plain-sum centrality are
  defaults to tune empirically. Nothing was tuned. The router and intensity thresholds are "deferred
  until the usage log can fit them" (#66.q1 open).
- **Inner loop and the record's own tests:** #32 "Test backlog" lists what the loop never exercised:
  fission, the fault ladder on a real failing verdict, a stuck implementer, semantic marker mislabel.
- **The record's own caution about confidence:** `agent-orchestration-prior-art.md:22` says verbalised
  confidence is systematically overconfident and that, since priority = centrality x (1 - confidence),
  miscalibration "directly misallocates the schedule". The code's declared-marker fallback is that risk.
- **What the evidence supports at each strength.**
  - *Habit:* unsupported either way, and cheap. Note the habit that matters is the ordering rule
    (finish what a thing rests on before deepening it), not the formula.
  - *Advisor:* the readiness rule is the load-bearing part, it is mechanical, and it is what `bd ready`
    already does. The risk formula adds only a tie-break among ready items. On a roughly ten-slice
    port the order will be close to the dependency order whatever the weights are. I would adopt this
    strength only as `ready` plus a risk tie-break, and only after rung 3.
  - *Driver:* no evidence for it, and v1's own record has none either.
- **Cheap test now (no model):** write the ten sampleTidy slices from `sampletidy-port.md` as nodes with
  `Blocked-by` edges; run `next_node` by hand (it is pure; `ctx_schedule.py` imports only `ctx_core`);
  compare its order with the order in the survey and with what a plain session proposes. If they agree,
  the formula buys nothing at this size.

## The modules (evidence only)

- **B (store)** is the module the evidence most says will need a rethink. v1's "validated write" is its
  marker parser (row 3). A schema-as-data store is a new design, not a carry-over; the "1,000 lines" is
  a shape, not code. The one-writer rule has no lock in v1 (design.md:78, inferred).
- **C (consent)** has less support than the note says (row 15): v1 designed it and settled on a judgement
  check. The mechanical refusal is untested anywhere. It is one field and a refusal, but the *reason*
  v1 backed off ("a judgement check can miss" cuts the other way: a refusal over-blocks) is not recorded.
- **A (rewind)** has real measurement (row 24), thin on stability: 8 resets, one Claude Code build
  (2.1.291), haiku, a few minutes. Route F rests on early-access mods (`mods.md`).
- **D (gates)** and **E (workers)** are supported by the prior art and by werkbank's record; no new
  figure depends on them.

## Tests and gates (§6)

Items 5 and 6 (seeded defects, protected expectations) have prior-art support (rows 23, 29). Item 1's
cost ratio is a proxy (row 28). Item 4 (mutation on changed lines) has a measured result only from
werkbank on Python (9 of 27 finds pointed at, 2 directly; mutation-first experiment, auditor row 17);
none on R or Rust. For sampleTidy the R mutation packages (`mutator`, `muttest`) were flagged "very
recent, verify" (prior-art.md:187). Nothing in the record shows that gates avoid werkbank's growth;
that is design intent only.

## Open questions

- **Answered by evidence now:** Q9 (reuse `ctx`: copy the shape, not the code, row 3). Q17 and Q19
  (the formula's effect is a tie-break, rows 10, 12). Q18 (in v1's code, confidence is already
  self-report, row 8). Q43 (kept as ideas: layout, askability, records, ancestor serving, readiness
  rule; archive the marker parser). Q22 (the pipeline is mostly DB logic, row 35).
- **Cheap to answer:** Q12 (rerun the cold-reader spike on the rendered state, haiku, a few cents);
  Q37 (the units string and `.xls` spikes, each under a day); Q20 (the hand-run in the scheduler
  section).
- **Add:** (a) How good is the oracle on the whole corpus (row 36)? Port work should not start before the
  R corpus run does. (b) Does a rewound session hold across an expired cache, a sub-agent in flight and
  30 resets (REPORT: untested)? (c) Where does the store's validation come from if not a marker parser?
- **The three that matter most:** Q1 (does a rewound resident session stay cheap over a real job; it is
  the only cost claim the whole design rests on, and v1's warning does not apply to it unamended, row 4),
  Q12/Q32 (will a cold reader act correctly from the render; 9 of 9 failed on the three resume
  questions), Q41 (the store is the first to need a rethink, row 3).

## Rung 1

The evidence supports A with a handover note: the measurement exists, the substitute exists
(`/compact`), and nothing else is needed. It will not answer Q1 alone. To make it useful in a week, add
to rung 1 a measured record of the first real sessions: tokens per reset, and one cold-reader check of
the note, so that rung 3's baseline has a number to compare with. Do not claim "nothing exists" for
rung 1; the comparison is with `/rewind` and `/compact` by hand.

## MUST-fix (at most 4)

1. Rewrite §4's "what it is" to match the code: three-level confidence, leaves-first readiness, no
   intensity, floor to `interface` only (rows 8 to 11).
2. Correct M §2B's reuse claim (row 3) and S §2's "3,300 lines" and "1,172-line marker language"
   (rows 1, 2).
3. Replace "no tool rewinds a live session" and "prior art found no tool that selects work" with the true
   forms (rows 13, 18); fix "canaries caught 0 of 13" (row 29); fix "45%" (row 35).
4. Attribute the 837-turn figure to werkbank v2, not v1 (row 4), and hedge the 30 to 38% figure (row 17).

## What must survive

The module rule (a lower module never names a higher one); the evidence-marker discipline ([M], [P],
[U]) that made this audit possible; the askability rule; the cheap spike evidence for route F; the
refusal to rank by anything but recorded evidence. The synthesis is honest about what is unknown;
nearly all the errors above are in how v1 and the prior art are summarised, not in the unknowns.
