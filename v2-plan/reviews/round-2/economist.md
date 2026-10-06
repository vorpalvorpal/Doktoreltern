# Economist, round 2: V2-SYNTHESIS.md

Working: `economist-appendix.md`. Markers: [M] measured, with source; [E] estimated; [V] checked by me. Dollars are the ledger's, as in round
1; throttle parks never counted; nothing spiked or run. Checked [V]: spike cache figures; 837 turns / 75% / T^2 in `research/tdd-plan-dogfood-lessons.md` 2.1;
`ctx_schedule.py` 275 lines; sampleTidy line counts. Not checked: list prices, the meter's cache weighting.

## Verdict
1. The base (rewind, store, oracle gate) is cheap to build ($100 to $350 by hand [E]) and the cheap
   part is the right part. But rung 1 earns almost nothing in dollars (about $0.15 to $0.30 saved per
   compaction event [E]); its worth is attention and the rules card surviving verbatim, and it is
   worth building mainly as the instrument that answers residency.
2. The best return per unit of usage and Robin's time is the **oracle gate**, a rung-3 item, not the
   store. It costs no tokens to run and is the only check in the plan that does not rest on a model.
   I would reorder the ladder so a baseline sampleTidy slice with an oracle precedes the store.
3. The Chooser should not be built (habit, two lines). Generic modules cost 2x to 3x one purpose-built
   tool [E], which is affordable; what is not affordable is the schema-as-data machinery before a
   second pack exists. Residency is a 15% to 40% effect on the orchestrator line, which is itself
   about 16% of a build, so it is a 3% to 7% effect on cost and a bigger one on reliability [E].

## The modules: price and return
Build = by hand in sessions (an item is $20 to $40, 15 to 60 min [M, 8.3 hand-built]). Total A to G $150 to
$430 [E], 15 to 30 Robin hours, spent on file format, normaliser and rulings.

| Module | Build | Robin h | Use cost | Saves, and whom | Return |
|---|---|---|---|---|---|
| A Rewind | $20 to $60 (mod about 400 lines; spike code exists) | 2 to 4 | $0.03 to $0.10 per reset warm; $0.3 to $0.5 cold | Robin: no "checkpoint and I'll compact" ritual; rules card kept verbatim | Medium; measurement value high |
| B Store | $40 to $120 (copy `ctx` shape, about 1,000 of 3,300 lines carry) | 3 to 6 (file format) | each `put` is a turn, about $0.07; render tokens | Orchestrator and Robin: a cold reader can answer | Unproven; the 9-of-9 cold-reader failure says render quality is the product |
| C Consent | $5 to $15 (a field, a refusal) | 1 | about 0 | Robin: sees agent-filled gaps | High per dollar, tiny |
| D Gates / oracle | oracle harness $30 to $80 once for sampleTidy | 2 to 4, plus 1 to 3 h of divergence rulings | seconds to minutes, 0 tokens | Robin: output he can trust unread | **Highest** |
| E Workers | $30 to $80 (thin wrapper over Claude Code isolation) | 2 | per task: $2 to $5 | Robin: diff computed by us | Medium |
| F Pack | $10 to $30 per pack as text | 2 | each trial slice $20 to $100 | whatever the baseline loses | Unknown until baseline |
| G Watch | $15 to $40 | 1 | 0 | Robin: no staring | Medium, partly exists |
| H Chooser | advisor $40 to $70; keep-true $20 to $30 per year | 2 | one turn per gauge update | order of slices | Low for sampleTidy |


## Residency (App. B has the model)
Model [E]: turn = cache read at 0.1x list, plus 2k written, 0.6k out. Context 47k, grows 1.5k a turn (3k if
tool-heavy); a 200k window bounds the square term at about 100 turns. n = turns per step.

| Case, per 100 turns, opus-class | $ per turn | Note |
|---|---|---|
| (a) resident, no rewinds, auto-compaction | 0.094 (0.098 at 3k growth) | context averages 120k |
| (b) resident, rewind each step of n = 35 | 0.069 (0.083) | saves 26% (15%) |
| (b') rewind each step, n = 100 | 0.094 | no gain: no rewind needed |
| (c) zero-token driver, cold segment per step, 7 judged turns | about 0.10 per turn but 7 turns a step: $0.69 a step against $2.43 | saves about 70% of the line |

- **Where each wins.** Rewind beats no rewind when n is below about 60 turns and growth is above 1k a turn;
  it never loses. Over a 12-unit, 36-step build the saving is $9 to $25 [E], 2% to 4% of the build. The
  driver saves about $60 [E] (11%) but only by removing plumbing turns, and costs a driver. Cold cache
  makes (b) and (c) cost the same per step: a cold start rewrites 47k to 79k at $0.30 to $0.50 on either
  route, and worker steps average 7 minutes against a 5-minute cache.
- **State size.** Cold write = 1.25 x S x price: S = 47k $0.29, 100k $0.60. A driver pays it every step; a
  rewind only when cold. Large state favours a warm rewind; small makes the choice irrelevant.
- **If the meter counts cache reads at full weight** [U, the most important unknown]: tokens per turn fall
  from 120k to 73k average, a 40% cut for rewind against none, and the resident case looks much worse.
  A short haiku test settles it ($2 to $5).
- v1's 837 turns (75% of spend, at least 80% plumbing [M]) say the cheap lever is fewer judged turns per
  step (a mod doing bookkeeping, not a driver), not the reset route. Rewinds bound plumbing, not cure it.

## Rung 1 against what Robin does now
Now, per event [E]: note plus compaction summary output ($0.13 to $0.25) plus the summary's cache write:
$0.25 to $0.45, 1 to 2 minutes, 1 of Robin's. Rewind with a handover note: $0.08 to $0.15, 20 to 40 s, no
attention if triggered at a threshold. Saving $0.15 to $0.30 an event; at 3 a day, under $1. **Not a reason
to build it.** Reasons that are: (1) rules survive verbatim (30% to 38% broken after compaction [from the prior-art
survey, not verified]); (2) it is the measuring instrument for residency; (3) cost is $20 to $60.
Unmeasured: cold cache after a long park (F1 left it UNTESTED), real state sizes (spike used 36k filler
on haiku), an opus-class turn cost, tier behaviour, and whether a handover note beats the automatic
summary for a cold reader (nothing measured; the 9-of-9 failure suggests not unless rendered carefully).

## The modularity premium
- A purpose-built sampleTidy harness (oracle, notes file, rewind): $60 to $150 [E]. Generic A to G: $150 to
  $430. Premium 2x to 3x, $100 to $300.
- It pays back when rung 1 is used outside sampleTidy (it will be), a second pack exists, or a wrong module
  is deleted at its own cost: 8.3 cost 8 days and about $450 [E] to rebuild a wrong core; a module is $40 to $120.
- **Cheaper route to "find the bits that need a rethink".** Do not generalise first. (1) Give each rung a
  kill criterion written before use (a number: e.g. "resets cost more than $X or a cold reader fails Y of
  10"). (2) Keep one directory and one test file per module and apply the removal test once, in week 4.
  (3) Rule of two: ship fixed kinds (item, task, note) and extract the schema file only when a second pack
  needs different kinds. That saves a loader and validator, about 300 to 500 lines [E], now.

## The scheduler
| Strength | Build | Keep true | Pays back if |
|---|---|---|---|
| Habit | 2 lines | 0 | untestable, never worse than nothing |
| Advisor | $40 to $70 (275 lines of Python exist; v1 is Python, a port is the cost) | confidence is derivable from gate results (a hook, 100 lines, $15); **fidelity is not** (needs a declaration or a ruling per item, one turn each, about 3 to 5 updates per item over its life: 100 items = 400 turns = $28 plus drift) | it prevents 2 to 4 slice reworks ($10 to $50 each) a project |
| Driver | werkbank's road: 10.8k to 49.3k lines [M] | rules accrete | not considered |

- **Cost of wrong order from the record.** Measured on checks, not on units: 13 of 27 real finds came "too
  late" and cost $17 to $18 against a $0.46 fix writer [M, econ.md via evidence 75], about $210 over a $929
  run (23%) [E from M]. Seam: 6 of 6 real seam finds came from one phase-5 probe, none from phase 7, and
  F-220 to F-223 cost 3 attempts and 2 escalations [M]. No record prices a wrong order of units. Skeleton first
  prevents most of it for free.
- sampleTidy's order is nearly fixed by dependencies (10 slices), so an Advisor has little to choose
  between. **Adopt Habit**; derive confidence for a report only if free; no chooser until a misorder is priced.

## Tests and gates (section 6)
| Proposal | Build | Run | Trust per usage and time | Will it grow |
|---|---|---|---|---|
| Oracle gate (+ protected expected values, $5) | $30 to $80 | 0 tokens; seconds to minutes | **best**; rests on no model | normaliser rules, one per divergence class; rulings 10 to 40 for a port [E] |
| One end-to-end on real files | $10 to $30 | minutes | high | slowly |
| Owed test kinds, linted | $10 to $25 | $0.5 to $1.5 per owed test [E, proxy] | high where the kind fits (open inputs, a mirrored tool) | yes: each new kind is a rule and a lint |
| Diff-scoped mutation | $20 to $60 | $1 to $2 tokens; wall 10 to 50 min a unit in Rust [E]; R tooling unverified | medium; 9 of 27 audit finds pointed at, 2 directly [M, R. d032] | wall time, with changed lines |
| Seeded-defect calibration | $5 to $10 per gate, again on change | seconds | high once; werkbank canaries caught 0 of 13 [M], but those tested the driver | one set per gate |
| Rationed model review | $0 | $2 to $6 per slice, 2 rounds cap | lowest: judging was 62% to 92% of werkbank spend [M] | yes, always; the cap is a rule that must fire |

Build order as the table. Make each growth item a time budget in minutes of Robin's wait. **Theatre risk:**
owed kinds counted without a check the test can fail; a normaliser loose enough to hide divergence.

**Reference slice, re-estimated [E].** One sampleTidy slice (ESdat to IR: 386 R lines, about 600 lines
target plus tests):
- Baseline rung (plain session, rewind, store, oracle): 100 to 250 turns, **$8 to $30**, 2 to 4 h session,
  20 to 40 min of Robin; harness slice 0 extra $15 to $40.
- Under the full flow: **$80 to $300** (fixed costs $115 to $145 do not shrink; a slice is under my minimum
  job size, so packs must run in small mode). The $570 reference build stands; $26 a unit.

## Port economics (sampletidy-port.md; [E], uncertainty about 3x either way)
| Path | Usage | Session time | Robin h | Main risk |
|---|---|---|---|---|
| Full port (15.8k R lines, 10 slices, any language) | baseline rung $300 to $1,200; under a flow pack $1,500 to $5,000 | 40 to 100 h | 30 to 60 | the 86 rulings in code; units; .xls; live-DB compatibility |
| Bounded typed core (IR, adapters, commit: about 6.8k R lines) | $120 to $500 | 15 to 40 h | 10 to 25 | two toolchains; R still reads DuckDB |
| Stay in R, build features (PDF adapters, trigger, gas readings, corpus run) | $100 to $400 | 10 to 30 h | 5 to 15 | R test suite speed unmeasured |
| Spikes first (calamine on real `.xls`; units over the corpus) | $2 to $10 on haiku | 3 to 6 h | 1 to 2 | none |

Features in R first wins on cost per outcome and Robin's ability to read it; the spikes are the cheapest
evidence in the plan.

## Open questions
**1** rewinds cost 2% to 4% of a build less than none, and a thin driver about 11% less again [E]; cheapest
run: one real 3-hour session on rung 1 with the reset log. **4** per step (about 35 turns), threshold backstop
at 150k. **17** Habit. **20** two slices run both ways, $60 to $100. **26** oracle comparison, a failure-shape
test per reader, an open-input property per parser; mocks and snapshots are theatre. **27** natural-key uuid
map, timestamp mask, decimal rule, order independence; ruled once per class. **30** a time budget per tier,
enforced by a test that fails when a gate exceeds it. **33** $8 to $30 [E]; up to 3x acceptable if the extra
buys a mechanical check, none for model review. **34** a rung's kill number. **36** features first, then a
bounded core if a benefit is named.

Add: (a) how the meter weights cache reads; (b) Robin's attention budget in minutes per slice, for each
rung; (c) who pays R and compile test wall time in the loop; (d) what a divergence ruling costs Robin and how
many an oracle yields.

**The three that matter most:** (1) the meter's weighting of cache reads and the cold-cache rewind; (2) is a
plain baseline with an oracle already enough (rung 3 before the store); (3) Robin minutes per slice.
## Rung 1
`mark`, `rewind --then`, threshold trigger, handover note, plus a **per-reset log** (cache read/write, turns
since last reset, wall seconds, cold or warm). The log answers residency and cold cache; the $0.2 saved does
not. Use it a week; test once whether a cold reader answers 10 resume questions from the note. $20 to $60 [E].
## MUST-fix (4)
1. **Ladder order.** Put baseline (plain session, notes file, oracle gate) before the store; build the store
   only if baseline shows notes failing. Save $50 to $150 and 3 to 6 Robin hours if it is not needed.
2. **Three cheap measurements before anything above rung 1** ($5 to $15 in all): cache-read weighting on the
   meter; cold-cache rewind after a 1-hour park; turns per step and real state size on a real session.
3. **Do not build the Chooser; adopt Habit.** Delete rung 5 until a misorder is on record with a price.
4. **A kill number per rung and per module, written before use, with a time budget on every gate in minutes of
   Robin's wait**; defer schema-as-data until pack two.

**Must survive:** the oracle gate; protected expected values; the lower-never-names-higher rule; consent as
derived from Robin's decisions; rewind behind two verbs so route F can be replaced; gate output on disk;
"git is the log"; no language in the tool.
