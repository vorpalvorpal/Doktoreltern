# Economist round 2: appendix (working)

All [E] unless marked. Prices as in round 1 appendix B: opus-class $5/M in, $25/M out, cache read 0.1x,
write 1.25x. Dollar scale is the ledger's, so relative comparisons are sturdier than absolutes.

## A. Residency model

Per turn: fixed f = 2k written ($0.0125) + 0.6k out ($0.015) = about $0.03. Read = r x context, r = $0.5/M.
Context at turn t of a segment = P0 + g t, P0 = 47k, g = 1.5k (case 2: 3k).

- (a) No rewinds. Window about 200k, so a compaction cycle runs (200k - 47k)/g = 100 turns (g=1.5k) or 50
  (g=3k). Cycle cost = 100 x 0.03 + 0.5e-6 x (47k x 100 + 1.5k x 100^2/2) = 3.0 + 6.1 = 9.1, plus a
  compaction about 0.3 = $9.4, or $0.094 a turn. g = 3k: 50 x 0.03 + 0.5e-6 x (47k x 50 + 3k x 1250) =
  1.5 + 3.05 + 0.3 = $4.85, $0.098 a turn.
- (b) Rewind per step, n = 35. Step = 35 x 0.03 + 0.5e-6 x (47k x 35 + 1.5k x 35^2/2) = 1.05 + 1.28 = 2.33,
  plus rewind $0.1 = $2.43 = $0.069 a turn. g = 3k: 1.05 + 0.5e-6 x (1.645M + 1.84M) = 2.79 + 0.1 = $0.083.
  Saving 26% (15%). At n = 100 equal to (a).
- (c) Driver, cold segment per step, 7 judged turns: 7 x 0.03 + 0.5e-6 x (47k x 7 + 1.5k x 24.5) = 0.21 +
  0.18 = 0.39; cold write of 47k at 1.25 x $5/M = 0.29; total $0.69 a step. Against (b) $2.43: 72% less.
  36 steps (12 units x 3): (c) saves about $60 against (b), $9 to $25 is (b) against (a). Build of
  $570: 11% and 2% to 4%.
- Break-even resident vs driver on dollars: a driver wins if it removes more than about 4 turns a step
  ((0.29 write) / (0.07 turn)). That is nearly always so; the question is the driver's own cost
  (werkbank: 10.8k to 49.3k lines [M]) and Robin's wish for one watchable session.
- Cold cache: worker steps average about 7 minutes (adjudicators 413 to 493 s [M]) and the cache lives 5
  minutes (1 hour if extended: unverified), so most resident steps are cold anyway, and (b) and (c) then
  both pay the 47k to 79k write ($0.30 to $0.50). The warm-rewind advantage ($0.25 a step) shows only when
  workers return quickly.
- If the meter counts reads at full weight (unknown), "tokens" per turn: (a) average context 47k + 1.5k x 50
  = 122k; (b) 47k + 1.5k x 17.5 = 73k: 40% fewer. Read share of the turn rises from 55% to above 80%.
- State size S sensitivity: cold write 1.25 x S x $5/M; S = 30k $0.19, 47k $0.29, 79k $0.49, 100k $0.63.
- What v1's quadratic means here: total = T x C0 + s T^2/2 [M, dogfood 2.1]; 46% to 90% of an agent's
  cost. With a 200k window the square term is capped by compaction, so the ratio (a)/(b) is bounded near
  1.3x for g = 1.5k and about 1.2x for 3k. This is my reading, not a measured result.

## B. Rung 1 versus compaction

Compaction today (Robin): ask for a checkpoint (model writes 2k to 4k tokens: $0.05 to $0.10), `/compact`
(model reads whole context, cached: 120k x 0.5e-6 = $0.06, writes a summary 5k to 10k: $0.13 to $0.25), then
the next request writes the summary (5k to 10k x 6.25e-6 = $0.03 to $0.06) and reads the base. $0.25 to
$0.45 total [E], mostly output tokens. Rewind: note 1.5k to 3k output ($0.04 to $0.08), then read of 44k to 79k
warm ($0.02 to $0.04), write 0.2k [M, spike-f1: read 78.7k, write 0.2k]. Cold: write 47k to 79k, $0.30 to
$0.50 [E; F1 left it UNTESTED]. Spike-live: route A wrote 36.4k at each reset [M, haiku, 36k filler];
route E read 66.5k, wrote 0.8k; route C read 72.2k, wrote 0.7k. A minus F at real sizes $0.1 to $0.35 a
reset (round 1 App. F).

Unmeasured: cold cache after a long park; real state size; a real tier (all spikes ran haiku); the 5-minute
versus 1-hour TTL; handover note quality for a cold reader (9 of 9 cold haiku readers answered resume
questions confidently wrong [per synthesis]); a 30-reset soak; an open dialog at reset.

## C. Module build costs

Basis: 8.3 hand-built units 150k to 320k tokens, 15 to 60 min [M, evidence line 57]; S1 by hand 8 items
$150 to $300 (round 1 App. G) so $20 to $40 an item. Line counts: A about 400 lines of mod (spike mods
exist; reports under `research/spike-*/mod`); B about 1,500 (v1's 3,300 lines carry about 1,000); C 150; E
300; G 200; oracle gate: R dump script, comparator, normaliser about 400 lines. These are my guesses,
not measured. The mapping from lines to dollars is about $0.05 to $0.15 a line including tests [E].

## D. Modularity premium

Purpose-built for sampleTidy: dump script + comparator + notes file + rewind mod = about 900 lines,
$60 to $150. Generic: A to G, 3,000 to 3,500 lines, $150 to $430. Schema-as-data loader and validator 300
to 500 lines more than three fixed kinds. Pays back (rule of two) when a second pack differs. Cost of
rebuilding a wrong core: 8.3 took 8 days and about $450 [E, V8.3-SCOPING 9.5]; v1's rewrite after its
review of 8 August "never acted on".

## E. Scheduler

`ctx_schedule.py`: 275 lines [V]; confidence from resolved q/v, else a declared marker, else low; fidelity
folds min over children; centrality = subtree size + boundary in-degree + blocked-by in-degree + aspect
participation; numeric mappings flagged "tune empirically" [V, docstring]. Advisor: port to the new store
$40 to $70; confidence hook $15; fidelity keep-true 3 to 5 updates per item, 100 items, 400 turns at $0.07 =
$28, plus drift. Break-even: 2 to 4 avoided slice reworks at $10 to $50 each [E] per project. Wrong order,
measured: 13 of 27 phase-7 finds "too late" at $17 to $18 against $0.46 [M]; 13 x $16.5 = $215 against
the $929 run [E from M]: this is order of checks. No unit-order cost recorded; F-220 to F-223 (cross-unit
seam test red on an earlier unit) 3 attempts, 2 escalations [M, evidence 103]; H's edits to F's files
(D-123); 53 stops, 101.7 h idle came from the driver, not from order.

## F. Gates, trust per cost

Mutation: 86 real test gaps under $1 each [M, Python]; cargo-mutants 10 to 60 s a mutant is 10 to 50 min a
unit [E]; R mutation tooling not verified. Calibration: werkbank canaries caught 0 of 13 [M]. Rationed
review: judging 62% (adjudication) to 92% (all review-type) of run 3 spend [M]. Owed kinds: $0.46 to
$1.50 against $17 to $18 [M for the second; the first a proxy]; 10 of 27 finds unsampled inputs, 3 disagreement
with the real tool [M].

## G. Port economics

Rates [E]: direct session $5 to $45 per kloc; baseline rung with oracle $15 to $60 per kloc (compile loops
in Rust, divergence loops); full flow $285 per kloc (my $570 for 2k lines). Full port: 15.8k R lines
becomes 15k to 20k target: baseline $240 to $1,200, flow $1.5k to $5k; time 40 to 100 h of sessions, about
10 slices of 3 to 8 h; Robin 30 to 60 h (divergence rulings 10 to 40 at 5 min = 1 to 3 h, units, `.xls`
judgement, review). Bounded core: IR 204 + adapters 2,364 (386 + 681 + 1,297) + commit 2,173 + db-schema
1,101 + support about 1,000 = about 6.8k R lines, $120 to $500. Features in R: PDF adapters via an LLM,
launchd trigger, ACIRL gas readings, corpus run: 4 items at $25 to $100 each. Spike costs: calamine on the
real `.xls`, haiku, $1 to $5; units over corpus $1 to $5. Assumption: the oracle already exists (R is
the reference); golden dumps do not yet exist (survey), a slice 0 cost I included.
