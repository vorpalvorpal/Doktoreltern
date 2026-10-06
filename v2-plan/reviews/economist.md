# Economist (cost analyst): review of SCOPING-DRAFT.md

Working, assumptions and ranges are in `economist-appendix.md` (App. A to G). Every dollar figure is an estimate [E] unless marked [M] with a source. No spike, no sub-agent. Checked against econ.md, spike-policy.md, V8.3-SCOPING §9.5, spike-live §5, spike-f1 §3. Not verified: current list prices, and how the subscription meter weights cache reads.

## Verdict

1. First estimate for the reference build (DuckDB pipeline, 3 packages, 12 units): about $570 likely, $300 to $1,200 as my 80% band, $160 to $2,200 at the corners (App. D). That is 60% of werkbank run 3's $929 for one package, and 10x to 20x one direct Claude Code session for the same pipeline ($10 to $90, App. G). The extra buys trust; the evidence supports only part of that spend.
2. "Judge less" is half achieved: cost per finding group falls about 30% (about $4.5), but the flow has more judging points than werkbank, and review-type spend stays about 70% of the build (werkbank 92% on the same broad measure; 62% adjudication alone). The lever is the number of audit layers, not the price of a ruling.
3. The reset route and checkpoint layout are not cost questions: F against A is $4 to $13 a build (1 to 2%). The money is in the audits (43%) and the orchestrator's turns (16%), and the stated stop rule would not fire.

## MUST-fix (5)

**M1. §8, §10: put a cost model and a budget in the draft; measure against it from S2.** The draft leaves cost to "S0-b and S2", but the decisions that set cost (how many audit layers, which orchestrator tier) are taken before then. Add App. C/D as the working estimate, every cell marked [E]; require S2 to report cost per unit by role from `usage.jsonl`; give S4 a fixed line: tokens, wall time per unit, Robin's attention minutes. Evidence: run 3's $929 was reconstructed after the fact, and the ledger lacked the editor fork, apply cost, throttle and operator time (econ.md §7). Cost: half a day in S2.

**M2. §5.2/§5.3: one code-audit layer, not three; and a stop rule that fires.** The flow audits the same code per unit, per package (gestalt) and per release: $72 + $105 + $70 = $247, 43% of the likely build. Record: 25 of 27 real phase-7 finds were reachable earlier, 19 by phase 4 or 5 tests (econ.md §4); same-vendor rounds plateau in 1 to 2 (V8.3-SCOPING:127); the phase-6 haiku audit found 0 real in 3 rounds for $7.31. Drop the per-unit code audit; keep test audit, per-unit mutation, one opus audit per package, and a release audit over the delta. Net saving $70 to $110 (12 to 19%) after the larger package round. Replace "a round that yields nothing new after intake" (§5.2): in werkbank it never fired, since every sonnet and opus phase-7 round had at least one new real find (spike-policy.md, P3). Use a cap of 2 rounds a level plus a price rule: stop a tier when $ per new real find exceeds the next tier's running average (sonnet: $17 at round 4, then $32 a find for rounds 5 to 7, econ.md §2). The opus audits are the counter-evidence ($13 to $18 a find, falling, 0 noise, closed early at round 3): one strong audit per package, not one weak audit per unit.

**M3. §5.2: make the test writer own the cheap catches.** 10 of the 27 real phase-7 finds were unsampled-input defects and 3 disagreed with the real tool; a phase-4 property or differential test is estimated at $0.46 to $1.50 against $17 to $18 to find the same defect in phase 7 (econ.md §0, §4; phase 4 was never priced, so the $0.46 is a proxy). §5.2 requires none of this. Put into the writer contract and the test auditor's checklist: one property test per open-input spec item, one differential test per item that mirrors an external tool (DuckDB, Parquet readers), one test per named failure shape; lint the failure-shape map. Cost: wrapper text and one lint rule. Possible saving $60 to $150 a build at 50% catch. Rust yield is unmeasured (§10 admits it).

**M4. §3 principle 3, §5.5: give "judge less" a number and read it from the ledger.** Add a target (judging at most 45% of build spend; at most 2 judging points between a unit's code existing and its package closing) and tag every dispatch in `usage.jsonl` with its role, so the share is read, not inferred. Without it S6's run review has nothing to read. Cost: one field per row.

**M5. §4.2, §10: label the spike costs and price the cold cache.** "$0.068 a step" and "reads 78.7k" are haiku with 36k of filler state; real hydrates are 17k to 25k (App. F). They say nothing about an opus orchestrator. The real bill is 20 to 70 turns a unit reading a 47k to 100k prefix ($1.4 to $15 a unit, 16% likely, App. B). F1 left the expired-cache case UNTESTED; a cold start after a long park rewrites the prefix ($0.30 to $1.00). Mark the columns "haiku, filler", add the cold line, measure turns per unit in S2.

## SHOULD-fix

- **§5.1 per-package review.** Two or three lenses plus synthesis is half a panel: $6 to $12 a package, 3 to 6% of a build (App. E; a full panel is 893k tokens, $15 to $30 [E], no dollar figure is recorded). Cheap, but unproven: the one measured panel is on a phase-1 design (15 of 26 later defects hit, 7 directly) and none has reviewed a package plan. Use lint plus two lenses (interfaces, failure) until S5 measures yield.
- **§4.1 `lst` bookkeeping.** 6 to 8 calls a unit are about 20% of the orchestrator's turns ($0.7 to $1.0 a unit and latency). Let the mod run `lst` on `step_done`, or fold them into one command; it also removes forgotten calls.
- **Orchestrator tier.** Trial a sonnet orchestrator forking an opus ruling only for spec or plan edits; saves about $30 (5%). v3's D4 rejected this, but on a conversation that was at least 80% plumbing (V3-SCOPING:23-27). Measure the plumbing share first, as §2 promises.
- **Fix re-review.** In-session ruling plus a fresh reviewer of the fix diff costs about $2 to $3, against $5.3 for werkbank's ruling, self-check, compare and third fork (App. A). Keep it for plan and spec edits (9 flips in 71 cycles); skip it for test-only edits already covered by diff mutation (1 flip in 29, not material; econ.md §3).
- **§5.4 T3 on idle.** Its findings need the same intake and grouping; price a T3 run in minutes on S0-b before promising idle running. The suite measured 85 minutes; "3.5 h" is a projection.
- **§8 "usage first, wall time second".** Under the throttle usage is time, so the order is empty. Mutation, Rust compile and T1 cost wall time no token counter shows (cargo-mutants at 10 to 60 s a mutant is 10 to 50 minutes a unit [E]); set targets in minutes of Robin's wait.

## The flow: what the cost evidence favours

1. **Test audit before code: keep and strengthen.** Phase 5's criteria sweep was werkbank's best round: $10.86 a real find, flat for six rounds, then clean (econ.md §2, §6). Per unit it is about $3.4 likely.
2. **Mutation per unit: keep.** 86 real test gaps under $1 each, a different class from audits (9 of 27 audit finds; 2 directly) [M, Python]. Keep haiku classify out of rich models; use branch coverage for unused-path labels (econ.md §6).
3. **Per-unit code audit: drop** (M2). A unit is too small to show seams and too late to beat the writer's property tests (M3).
4. **Package gestalt audit: keep, cap, show its price.** At $35 likely it is the largest single line ($105 of $570). Round 2 only if round 1 had a blocking or seam finding. Skip it for packages of two units or fewer; the release audit stands.
5. **Per-package panel versus lint plus two lenses**: see SHOULD-fix; keep the full seven-lens panel for the spec, where yield was measured.
6. **Small-job omission:** see the cutoff below.

Where werkbank's rounds never paid: the self-check on worker-only edits ($80, one immaterial flip); sonnet phase-7 rounds 5 to 7 ($95.81, 3 new real finds); the phase-6 haiku audit ($7.31, 0 real); the archetype probes ($41.60, findings not in the ledger); the static text-scan probes ($23.43 for 2 real); full adjudication of re-finds ($39.54) (econ.md §6). The draft answers the first and last; it has no answer to the second (no stop rule that fires) or the fifth.

## Is "judge less" achieved?

- **Cost per group: yes, about 30% lower.** Intake plus in-session ruling gives about $4.5 a group (ruling $1 to $2.5, fix $0.5 to $1.5, fix-diff review $1 to $2) against $6.55 an amended chain plus $0.6 FIX and $0.9 verification. But 8.3 already removed much of that (the replay put run 3 at about $630, with confounds), so the saving against 8.3 is smaller than against run 3.
- **Judging points: no, more.** Spec panel, plan review, test audit, code audit, survivor answers, fix re-review, gestalt, release audit, run review: nine kinds, against werkbank's phases 5, 7, 8a and 8b.
- **Intake is overstated.** "17 of 19 noise removed" is a replay (auditor correction 8); 10 of the 17 are harness findings that §5.3 now routes rather than rejects, so they still reach a ruling. The mechanical saving is nearer 7 of 19.
- **Grouping is unmeasured.** Only 8 to 10 of 81 re-finds rhymed by Jaccard (auditor §4); grouping may remove less than hoped. Group rate moves a build only about 25% (0.5 to 3 a unit, App. D), but it decides whether rulings are a minor or a main cost.

## Building Leitstand against what it saves, and against prompting directly

- **Build:** S1 by hand $150 to $300; S2 to S6 built by itself $800 to $1,500 at the model's likely rate, or about $450 all in if built as 8.3 was ($400 to $800 for 38 items [E], V8.3-SCOPING §9.5); spikes $20 to $60 (App. G). Do not add the self-built stages to the 8.3 analogue. 8.3 took 8 days; S1 by hand is where Robin's attention goes.
- **Savings against werkbank:** not demonstrable in dollars. §9.5's "$300 a run" and the replay's $630 are different bases, and $570 for a three-package pipeline is comparable to neither (package sizes differ; phases 8 to 10 never ran). If Leitstand saves 30% of a $630 package-sized run ($190), the build pays back after 2.5 to 10 runs. The case rests on the stops (53 in run 3, 46 h halted [M]), a 49k-line driver not carried, and attention, not tokens.
- **Against a direct session** for the pipeline: $10 to $60, or $25 to $90 with a separate test pass and one fresh opus review [E]. Leitstand's $570 is about 10x. What the 10x buys that a session does not: tests written by another agent before code, diff mutation, spec-linked tests, a record. Those have evidence (AgentCoder 61% to 88%; 86 mutation gaps). The extra audit layers do not.
- **Minimum job size.** Fixed cost per run is about $115 to $145 before a unit is built (package plan, review, gestalt about $50 a package; release audit $40 to $70; spec $25). Below about 4 units, 1,000 to 1,500 lines, or one crate, that exceeds the cost of a direct session. Add a cutoff to §0 and a "small mode": a session writes tests first with a sonnet test agent, runs `cargo mutants --in-diff`, then one fresh opus review of the diff, about $10 to $30. Let S4 settle it: build one pipeline unit both ways and count defects Robin finds. That is the cheapest evidence on whether the design is worth its price.

## The checkpoint files (§4.1): cost and a cheaper layout

Real sizes at pipeline scale (App. F): spec about 8k tokens (30 items), package plan 5 to 6k, unit plan, state and notes 3 to 6k, base prefix 30k; about 47k at unit start, not the spike's 79k.

| Reset | Route F | Route A (fallback) |
|---|---|---|
| to unit | $0.03 to $0.10 (read 44k, write 3 to 6k) | $0.14 to $0.42 (write 17 to 25k) |
| stale cut rebuilt (plan or spec changed) | $0.08 to $0.30, on change only | same as unit |
| cold cache after a long park | $0.30 to $1.00 | same |
| whole build (about 40 resets) | $1 to $4, plus rebuilds $1 to $5 | $6 to $17 |

- Route F against A is $4 to $13 a build. Choose on reliability.
- **Notes growth** is a dollar non-problem ($2 to $6 for 10k tokens over a build) and an attention one: 10k of 55k tokens is 18% of the prefix. "Promote upward" has no cap, and the hand-built 8.3 checkpoint bloated until a rule stopped it (§1.5). Cap each level (say 20 entries) with a retire-or-promote decision at the cap.
- **TOML overhead** is 15 to 25% of tokens over compact prose. Have `hydrate` render a compact view for the model, not the raw file (saves $0.3 to $1.3 a build, and reads better).
- **Lazy loading of spec items** saves at most $0.5 a unit and removes the guard against ignoring the spec. Keep the whole spec in the prefix until it passes about 40k tokens.
- **`lst` calls** are the largest checkpoint-related cost ($0.7 to $1.0 a unit); see SHOULD-fix.
- "State is current state, history in git" is right: the stable prefix is untouched at steady state, so the cost is only how often a plan or spec item changes. Keep it.

## Estimates presented as measurements, and confounds

- §4.2 "$0.068 a step" and cache tables: haiku, filler state; not an opus cost, not a real hydrate.
- §1.1 "62%": adjudication only; with sweeps and verification the judging-type share was 92%.
- §1.1 "$929" includes $284 of self-check and $42 of retired probes that 8.3 already removed, and excludes phase 4 and phases 8 to 10: a poor baseline for Leitstand's saving.
- §5.1 "893k tokens" has no dollar figure in the record; mine ($15 to $30) is [E].
- §1.3 "mutation under $1": a haiku classify cost with the hand path off-ledger (econ.md §7), on Python. Rust cost is mostly wall time.
- All my dollars are [E]. Orchestrator turn price spans 3x; group rate and sweeps per unit are guesses; 12 units is an assumption.
- Double counting guard: M2's saving is netted about 30% for the larger package audit. The review-type share of 70% puts orchestrator rulings turns in the turns line, so it is understated by up to 5 points. The S2 to S6 build and the 8.3 analogue are alternatives, not additive.

## Questions the draft does not answer

1. How big is the DuckDB pipeline expected to be (units, lines)? Everything above scales with it.
2. How does the subscription meter weight cache reads? If lightly, the orchestrator prefix is cheap and sub-agents dominate; if not, the 47k to 100k prefix is the largest recurring cost. A short haiku test at S0 would show it.
3. Does the cache rewrite after a throttle park happen, and how often? The park is pacing, not a cost; the rewrite after it is tokens. F1 did not test it.
4. Who pays for Rust compile loops? Extra turns on borrow-checker errors are unmeasured (App. C "high").
5. Does `usage.jsonl` capture sub-agent tokens by role, or only the main session's? §5.5 needs the former.
6. Is there a stop price (a build budget, a per-finding cutoff)? werkbank had both (fuses; "$/real above next tier").

## What must survive revision

- Tests before code by a separate writer, audited before the code exists: the strongest record, about $5 a unit.
- Diff mutation per unit and mechanical intake before any ruling: cheaper than model judging by two orders of magnitude.
- One ruling per group; no self-check on code or test edits; a reviewed fix diff for plan and spec edits.
- Quiet gate output and attestation per tree (a skipped gate cost werkbank four releases a day).
- The reset behind one function, F first: reliability first is right when the route is worth 1 to 2%.
- State as current state, not a log. Add the cap on notes.
- Robin's attention first: every cut above moves a decision off him; none adds one.
