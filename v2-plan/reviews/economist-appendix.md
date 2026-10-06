# Economist appendix: the cost model's working

Everything here is an estimate unless marked [M] (measured, with source). Dollars are the werkbank ledger's
own dollars (what Robin's tooling displayed), not list prices, so that measured fork costs can be reused.
Where I had to price the orchestrator's own turns I used list-price ratios; that is the least certain input.
Not verified: current model list prices; the count of units in werkbank's package F (not found in the
files I read); how the subscription meter weights cache reads.

## A. Anchors taken from the record

| Anchor | Value | Source |
|---|---|---|
| Sonnet implement fork (CODE/SEAM/DOG) | $2.18 mean (13 forks, $28.32) [M] | econ.md §1 |
| Sonnet FIX writer task | $0.46 mean (82 forks) [M] | econ.md §0, §4 |
| Sonnet audit sweep, one round (anchor + 5 probes) | $6.7 to $12.4; per probe about $1.5 to $2.3 [M] | econ.md §2 |
| Opus audit sweep, one round | $13 to $15 [M] | econ.md §2 |
| Opus ruling fork / self-check / cold check | $2.08 / $2.54 / $1.95 [M] | spike-policy.md |
| Adjudication per amended chain / per rejected chain | $6.55 / $1.29 [M] | econ.md §3 |
| Mutation classify (haiku) | $0.16 a fork ($22.74 / 140) [M] | econ.md §1 |
| $ per real phase-7 find: sonnet / opus / phase-5 criteria sweep | $17 / $18 / $10.9 [M] | econ.md §2 |
| Phase-4 property or differential test (proxy) | $0.46 to $1.50 [E, unmeasured] | spike-policy.md |
| Seven-lens panel on one document | about 893k sub-agent tokens, 539k opus, 28 min [M] | DECISION-LOG D-047 |
| Hand-built 8.3 units | 150k to 320k tokens, 15 to 60 min each [M] | werkbank-evidence.md:57 |
| 8.3's own build, estimated | 38 items, 70 to 90 dispatches, 16 to 25M tokens, $400 to $800 [E] | V8.3-SCOPING §9.5 |
| Reset spike cost per step, haiku, 36k filler state | A $0.068, B $0.074, E $0.032, C $0.026 [M] | spike-live §5 |
| Route F first request after reset | read 78.7k, write 0.2k (prefix 78.7k incl. filler) [M] | spike-f1 §3 |

Price of one panel in dollars: not in the record. 8 agents of about 110k tokens each, 60% opus. At the
ledger's opus fork costs ($2 to $4 for a ruling-sized fork) I put a full panel at $15 to $30 and a
two-lens-plus-synthesis review at $6 to $12. [E]

## B. Orchestrator turn cost (the least certain input)

A turn on route F reads the cached prefix, adds a few thousand new tokens and emits a few hundred.
Prefix at unit start: about 30k (Claude Code system, tools, skills listing, the mod's tool; spike-live
measured 30.5k) + spec about 8k + package plan about 6k + unit text and state about 3k = about 47k. By
the end of a unit, hand-backs and tool results add 30 to 50k, so the average over a unit is about 70k.
Per turn: 70k cache read + 2k newly written + 0.6k output.
- Opus at list ratios of $5/$25 per M in/out (cache read 0.1x, write 1.25x): $0.035 + $0.016 + $0.015 = about $0.07.
- Opus at $15/$75: $0.105 + $0.047 + $0.045 = about $0.20.
- Sonnet orchestrator: 0.2x to 0.6x of those.
I use $0.07 / $0.12 / $0.22 for low / likely / high. Spike-live's haiku step at $0.068 is consistent with
a haiku-to-opus ratio of 5x to 15x, so the range is real. Turns per unit: 20 / 35 / 70 (assumed; see C).

## C. Per-unit model (one unit = one file or tight group with its tests)

Orchestrator turns per unit, likely 35: dispatch writer and read hand-back (3), gate T1 (2), dispatch test
audit and read (3), rule on test-audit findings (3), dispatch implementer (3), T0/T1 gates (3), mutation and
survivor answers (4), dispatch code audit and read (3), intake and grouping (3), rulings, fixes and fix
re-review for about 1.2 groups (5), `lst` bookkeeping calls (6 to 8), step_done and reset (2). I did not find
a measured turn count for a current model orchestrator ("no direct measurement exists", werkbank-evidence §2);
the old v2 figure was 837 turns, at least 80% plumbing.

| Component | Low | Likely | High | Assumption behind it |
|---|---|---|---|---|
| Test writer (sonnet) | 1.0 | 2.2 | 4.0 | the implement-fork cost; high = Rust compile loops |
| Test audit before code (sonnet) | 1.2 | 3.4 | 6.0 | 0.5 / 1.5 / 2.5 sweeps at about $2.3 a sweep; sweeps are per unit, so smaller than a package round |
| Implementer (sonnet) | 1.5 | 3.0 | 5.0 | one fork plus gate retries |
| Mutation on the diff | 0.8 | 1.7 | 3.0 | haiku classify of 3 to 10 survivors plus 1 to 3 FIX-sized tests; excludes wall time |
| Code audit per unit (sonnet) | 3.0 | 6.0 | 16.0 | 1 / 1.5 / 2.5 sweeps at $2.5 to $6.5 (3 personas to 5 probes) |
| Finding groups ruled | 0.5 | 1.2 | 3.0 | per unit, after intake; the biggest unknown |
| Cost per group | 3.0 | 4.5 | 6.0 | ruling in session $1 to $2.5, fix $0.5 to $1.5, fix-diff re-review $1 to $2 (a cold-check fork is $1.95 opus, $0.78 sonnet) |
| Orchestrator turns | 1.4 | 4.2 | 15.4 | 20 / 35 / 70 turns at $0.07 / $0.12 / $0.22 |
| Resets (3 per unit, route F) | 0.09 | 0.18 | 0.36 | see section F |
| **Unit total** | **10.5** | **26.1** | **67.8** | corners compound; read as "plausible band", not an interval |

Likely split of a $26 unit: code audit 23%, findings 21% (5.4), orchestrator 16%, test audit 13%, writer
2.2 + implementer 3.0 = 20%, mutation 7%. Judging steps (test audit, code audit, findings) = 14.8 / 26.1 = 57%.

## D. Per-package and per-build

Per package (likely): plan by an opus planner $8 (low 4, high 15; one agent of 150 to 300k tokens);
package review at two to three lenses $8 (3 to 15); package gestalt audit by opus, one to two rounds
$35 (15 to 90; opus rounds in the record cost $51 to $70 with rulings, $13 to $15 sweep only); plan
lint and T2 gate $0 in tokens. Package likely $51 (22 to 120).

Reference build (the DuckDB pipeline: the plan's own first job; size is my assumption: 3 packages, 12 units,
about 2k lines of Rust):

| Line | Low | Likely | High |
|---|---|---|---|
| Units | 8 x 10.5 = 84 | 12 x 26.1 = 313 | 20 x 67.8 = 1,355 |
| Packages | 2 x 22 = 44 | 3 x 51 = 153 | 5 x 120 = 600 |
| Release audit (opus, 1 to 3 rounds incl. rulings) | 25 | 70 | 150 |
| Spec panel + interview (zero if hand-written, as at S4) | 0 | 25 | 50 |
| Run review, status, misc | 5 | 10 | 25 |
| **Build** | **~160** | **~570** | **~2,200** |

My own 80% band is about $300 to $1,200: the corners require every input to land at its extreme.
Spread of the likely case: units 55%, packages 27% (gestalt $105 of it), release audit 12%, spec 4%.
Review-type spend (every audit, ruling, panel and re-review; not mutation, not orchestrator turns):
test audit 41 + code audit 72 + findings 65 + gestalt 105 + plan review 24 + release 70 + spec 25 = 402,
70% of the likely build. werkbank's comparable share was adjudication 62% + sweeps 19% + verification 8% +
dedupe 3% = 92%. Building (writer + implementer + mutation) is 83 of 570 = 15% (werkbank: 7%).

Sensitivity of the likely build to finding-group rate per unit (12 units, $4.5 a group): 0.5 groups =
$505; 1.2 = $570; 3 = $700. To sweeps per unit (test + code audit at 1 vs 2.5 each): $480 vs $720.
To orchestrator turn price ($0.07 vs $0.22 at 35 turns): $510 vs $680. None moves the total by more than
about 25%; the count of audit layers (not their size) is what sets the level.

## E. Where the 893k panel figure sits

A seven-lens panel plus synthesis on one document: $15 to $30 [E]. The draft's package review at
"two or three lenses" is 4 of 8 agents' worth, at most half, so $6 to $12 a package, plus the editor pass
that applies rulings (not in werkbank's ledger, apply cost unmeasured). Three packages: $18 to $36 (3 to
6% of a build). That is small; the panel is not where the money is. What is unproven is its yield: the one
measured panel result (D-047) is on a phase-1 design, with 15 of 26 later defects hit; no panel has ever
reviewed a package plan, so the yield per $ at the package level is unknown.

## F. Checkpoint and reset cost

Real hydrate sizes (assumption; the spike's 36k was filler): spec 30 items x about 250 tokens = 8k;
package plan + interfaces 5 to 6k; unit plan + state + notes 3 to 6k; flow guard and role text 1k. Base
prefix 30k. Total at unit start about 47k, not the 79k of F1's cuts.

Per reset, opus-class, at cache read 0.1x and write 1.25x of $5 to $15 per M:

| Route | Read | New write | Cost | Notes |
|---|---|---|---|---|
| F, cut at plan | about 44k | about 3k to 6k (unit text) | $0.03 to $0.10 | stable levels never rewritten |
| F, stale cut rebuilt (a plan or spec item changed) | 30k | 8k to 14k (level resubmitted) | $0.08 to $0.30 | happens only on change; ~10 to 30 per build |
| A, fallback | 30k | 17k to 25k (all of it, new message) | $0.14 to $0.42 | spike: 36.4k written at every reset |
| Any route, cache cold after a long park | 0 | 47k to 55k | $0.30 to $1.00 | same on F and A |

A minus F is $0.1 to $0.35 per reset, three resets a unit, 12 units: $4 to $13 per build, 1 to 2% of the
build. The route choice is therefore a reliability decision, not a cost decision.

Notes growth: each 1k tokens of notes in the cut costs about 35 turns x 12 units x 1k = 0.42M cache reads,
$0.2 to $0.6 a build; and every promotion that edits a stable file makes the cut stale (one level resubmit,
$0.08 to $0.30). 10k tokens of notes (about 150 entries at 60 tokens) cost about $2 to $6 a build and $1 to $5 in
rebuilds. The cost is trivial in dollars; the harm is attention: 10k of 55k tokens is 18% of the working
prefix, and nothing in the draft bounds it.

TOML overhead: keys, quotes and table headers add about 15 to 25% over compact prose, so 8k of spec as raw
TOML is about 6.5k of content. Rendering for the model (a compact `hydrate` view, not the raw file) saves
about 1.5 to 3k tokens a turn; at 35 turns x 12 units that is 0.6 to 1.3M cache reads, $0.3 to $1.3 a build.

`lst` calls: 6 to 8 per unit at one orchestrator turn each ($0.12) is $0.7 to $1.0 a unit, 3 to 4%, and
about 20% of a unit's orchestrator turns, which also costs latency. Folding bookkeeping into one `lst step
done` command, or letting the mod call `lst` on `step_done`, removes about 5 turns a unit.

## G. Building Leitstand

Draft stages: S1 by hand (lst core: schema, done/issue/note/hydrate/lint/gate; the reset mod; flow.toml; G1 and
G2; Rust shims in stellwerk), S2 to S6 by itself. Analogy: 8.3's 38 items cost an estimated $400 to $800
(16 to 25M tokens, 70 to 90 dispatches, 12 to 18 Fable reviews). S1 is about 4L + 4M items, which I put at
$150 to $300; S2 to S6 as four to six packages through its own loop, one package each, at the model above
with 4 to 6 units: $200 to $350 a package, $800 to $1,500 in all, less if the early stages are rougher; S0
spikes (A1, F2, S0-b, S0-c, S0-d, haiku or no model) about $20 to $60. Total $450 (optimistic, building
by hand with sub-agents as 8.3 was) to $1,800 (self-built at the model's likely rate). The S4 pipeline is a
test job and is counted separately in D, not as build cost. Double-counting watch: S2 to S6 built "by itself"
are run-model costs, so they must not also be counted as the $400 to $800 analogue.

Direct prompting of the same pipeline in one Claude Code session: 100 to 300 turns at a 50 to 120k
context, $0.07 to $0.22 a turn: $10 to $60; with a separate-agent test pass and one fresh opus
review of the diff, $25 to $90. Time: hours, with Robin watching. [E, from section B's turn price; no
measured direct-prompt build exists in the record.]
