# Green Hat, round 2: appendix

Marks on outside sources: **FETCHED** (a sub-agent opened the page; its fetch tool returns a model
summary, so numbers are as reported), **SNIPPET** (search-result text only), **KNOWLEDGE** (from
training, not checked). I did not re-open any source myself. The two sub-agent files are in
`reviews/scratch/round-2-green-hat/` (`scheduler-prior-art.md`, `pipeline-and-context-prior-art.md`)
and hold the URLs; rows below cite them as S-n and P-n.

## Part A. Three spikes on the scheduler

All files are in `reviews/scratch/round-2-green-hat/`. Nothing outside that folder was written.

### A1. Version 1's scheduler replayed on version 1's own store

`sched_spike.py` loads `store/` through `ctx_store.read_nodes` and `ctx_core.collate`, then calls
`ctx_schedule.next_node` in a loop in memory. A floor pick is stamped `interface`; a deepen pick is
stamped `correct`, set to `high` confidence and closed. No file is written. This is the only real
graph version 1 has (its design store; the mixtox toy was retired), and it is a design tree with
few cross-links, so it is a weak stand-in for a build.

| Measure | Value |
|---|---|
| Nodes; open and not dormant | 54; 31 |
| Edges: tree; nodes with a boundary edge; nodes with a blocked-by edge | 28; 1; 2 |
| Confidence on the 31: low, tentative, high | 16, 7, 8 |
| Confidence taken from the resolved-question ratio (not a marker) | 23 of 31 |
| Distinct priority values across the 31 | 6 (0, 1, 1.5, 2, 12, 15) |
| Nodes with priority 0 before any work | 21 of 31 |
| Deepen steps simulated | 31 |
| Steps where the formula alone picked among two or more ready nodes | **3** |
| Steps where the top priority was tied and the lower node id won | 23 |
| Steps where the top priority was zero | 20 |
| Steps where the readiness gate left one candidate | 1 |
| Mean ready nodes per step; mean tied at the top | 10.7; 6.8 |

Reading: on this graph the formula made about one choice in ten. The rest was node number. The two
nodes with a real priority (16 at 15.0, 24 at 12.0) were picked 28th and 29th, because readiness
holds a parent until its children are correct. The round-2 evidence auditor describes the same
mechanism from the code; this puts a number on it. Limits: my "done" rule is crude, and a build
tree with more cross-links would give centrality more to say.

### A2. What centrality would rank first in sampleTidy

A read-only script over `/Users/rjs/dev/sampleTidy/R/*.R` (no tests run): map each top-level
function to its file, then count which files call into which. Regex matching, so approximate.

| File | Lines | Direct dependents | Transitive dependents |
|---|---|---|---|
| text-normalise.R | 135 | 6 | 13 |
| config.R | 188 | 8 | 12 |
| dates.R | 135 | 4 | 12 |
| values.R | 180 | 4 | 12 |
| db-connect.R | 95 | 5 | 9 |
| hash.R | 38 | 2 | 9 |
| units.R | 210 | 2 | 8 |
| db-schema.R | 1101 | 5 | 7 |
| reconcile.R | 2926 | 4 | 7 |
| feature-alias.R | 1998 | 1 | 7 |
| ir.R | 204 | 4 | 6 |
| commit.R | 2173 | 2 | 2 |
| adapter-acirl-field.R (legacy `.xls`) | 1297 | 1 | 2 |
| adapter-esdat.R | 386 | 1 | 2 |
| ingest.R | 1322 | 0 | 0 |

(15 of 28 files shown.) At the start of a port every item sits on the lowest rung, so
`centrality x (1 - confidence)` is centrality alone. It ranks four small helpers first and the
legacy `.xls` adapter 20th of 28. Units comes 8th. The synthesis says (§4) "for a port, the risky
parts (legacy `.xls`, units) would surface first, as spikes". By the formula they would not: the
riskiest known item is a leaf that nothing depends on. The formula measures how far a mistake
spreads. It has no term for how likely the mistake is before any evidence exists, and that is the
thing a port most needs. Version 1's prose has such terms (differentiation, reversibility, a
difficulty rating as a stand-in for missing structure, node 16/32); none reached the code.

### A3. Does a model order by risk unaided, and do two lines change it?

Ten `claude -p --model haiku --max-turns 1` calls, run from the scratch folder, no tools. Prompt
(`order_prompt.txt`): the sampleTidy stages, file sizes with one-line roles, and the R dependencies,
with the survey's risk column removed. Question: the first eight pieces of work in order, then the
three top risks. Five runs as is; five with one added paragraph (`order_prompt_habit.txt`): "after
a thin end-to-end skeleton, work next on whatever is least proven and would hurt most if it turned
out wrong, and settle each such doubt with the cheapest check that could settle it (a thought
experiment, a literature search, a small spike) before building on it." Cost $0.16 + $0.14 = $0.30.
Outputs: `order_run_*.json`, `habit_run_*.json`.

| | Unaided (5 runs) | With the paragraph (5 runs) |
|---|---|---|
| Names legacy `.xls` among the three risks | 5 | at least 4 (one output cut off in my print) |
| Position of the `.xls` work in the eight | 8, absent, absent, 7, 7 | 3 (spike), 4, 3 (spike), absent, 4 (spike) |
| Position of units | 6, 3, 2, 6, 4 | 2, 2, 2, 2, 2 |
| Proposes a spike (a check before a build) | 0 | 4 |
| Starts with an end-to-end skeleton | 0 | 4 (the fifth scaffolds types only) |
| Explicitly says to do the risky parser late | 3 ("do last", "isolate late") | 0 |

Reading: unaided, haiku names the risk correctly and then schedules it last, in dependency and
ease order, which is also what the formula does (A2). One paragraph moved units to second place in
5 of 5 and brought `.xls` forward in 4 of 5. Limits: haiku, not the model that will orchestrate;
n = 5 per arm; a plan on paper, not a build; I scored the positions by eye; whether the habit holds
at step 40 of a real job is the untested part, and the rules card riding through every rewind is
what would carry it.

## Part B. Prior art on ordering work by risk or value (sonnet sub-agent, 107k tokens)

| # | Source | What it says; what was measured | For the chooser | Mark |
|---|---|---|---|---|
| S-1 | Boehm, spiral model, 1986/88 | Rank risks, buy information on the top ones; "risk exposure = probability x loss"; a top-ten risk list reviewed each cycle. No controlled study found | The idea is forty years old in its list form. The list, not a score on every item, is what practice kept | SNIPPET + KNOWLEDGE |
| S-2 | Higham, "riskiest assumption test", 2016 | Smallest experiment on the biggest assumption. Nothing measured | The habit strength, in one sentence | SNIPPET |
| S-5 | Fairbanks, "Just Enough Software Architecture", 2010 | Prioritise risks, pick a technique per risk, validate. Explicitly unquantified | Nearest textual twin of v1's rule; it has no formula | FETCHED |
| S-4 | Walking skeleton, tracer bullets | No comparison with bottom-up found | Skeleton-first is unmeasured folklore; cheap, so keep it as advice | SNIPPET |
| S-7 | Letier, Stefan, Barr, ICSE 2014 | Expected value of perfect information over architecture options, by simulation; one case study | The nearest software precedent for "investigate by value". Needs probabilities and a decision model; works on options, not a graph. PDF not read | SNIPPET |
| S-8 | Hubbard, "How to Measure Anything" | Most variables have near-zero information value; effort goes to the low-value ones ("measurement inversion"). From a consulting portfolio | The useful question is "what decision changes if I learn this?", which v1's prose calls differentiation and its code omits | SNIPPET |
| S-9 | Active-learning re-benchmarks (arXiv 2306.08954; Mussmann 2022) | "Pick the most uncertain" is a strong baseline; more than half of some twenty strategies were not better than random in one study; a little randomness helps | Fancy acquisition rules add little over the simple one | SNIPPET |
| S-11 | Cox, "What's wrong with risk matrices?", 2008 | Products of ordinal ratings compress ranges and can reverse ranks; can be worse than random | `centrality x (1 - confidence)` over a ladder is a risk matrix. If a ranking is kept: lexicographic (lowest rung, then dependents), ties shown, not a product | SNIPPET |
| S-12 | Reinertsen, cost of delay over duration | No controlled study found | The formula has no cost term; "cheapest check" is that term, left in prose | SNIPPET |
| S-14, 15 | Rothermel et al. 2001; Elbaum et al. 2014 (Google data) | Greedy "additional gain, re-ranked each step" and "recently failed first" are hard to beat; search methods did not beat greedy | The best-measured analogue of "order work to find failure soonest" favours a cheap rule on observed outcomes | KNOWLEDGE + SNIPPET |
| S-16 | Machalica et al., predictive test selection, 2019 | Halves test cost, keeps over 95% of failures; needs a large outcome history | Not transferable to one builder | FETCHED (abstract) |
| S-17 | NASA readiness levels and critiques (Sauser; Kujawski) | Ordinal; steps unequal; silent on integration | The evidence ladder is a readiness level for ideas and shares both flaws | SNIPPET |
| S-18 | GRADE | Four levels, with named reasons to move down or up | Seven rungs invite false precision; four with named downgrade reasons is closer to practice | SNIPPET |
| S-19 | Bloomfield, Netkachova, Rushby, Assurance 2.0, 2024 | Confidence as the set of open "defeaters" (reasons the claim could be false), sought on purpose. No quantitative evaluation | A representation that needs no arithmetic: doubt is a list of named open questions on the item | SNIPPET |
| S-21, 23 | beads `bd ready`; Claude Code tasks; Task Master | Unblocked frontier plus a hand-set priority | The baseline everyone ships | FETCHED / SNIPPET |
| S-22 | `bv` (beads_viewer) | PageRank, betweenness, critical path over the task graph, with `--robot-next` for agents. Formula and any validation not retrieved | A tool does rank work by a value over a graph. No doubt term seen | SNIPPET |
| S-24 | Aider repo map | Personalised PageRank over the symbol graph, on every turn; ranks context, not work. No benchmark in the docs | Centrality is cheap and in production; nobody shows it helps | FETCHED |
| S-25 | Kaddour et al., arXiv 2602.06948, 2026 | Agents succeeding 22% of the time predicted 77%; an adversarial "find the bug" framing calibrated best | Confirms "never self-report"; the baseline experiment must score outcomes, not stated confidence | FETCHED (abstract) |
| S-10, 27 | Bayesian control for coding agents (arXiv 2606.24453); UA-ChatDev (arXiv 2607.02186) | Spend checks where uncertainty is high, inside one task. UA-ChatDev: quality 0.395 to 0.649 on its benchmark | Uncertainty used to decide how much to verify, not what to do next. That matches v1's "intensity", the part never built | FETCHED |

**Searched for and not found:** any controlled comparison of risk-first against another order, for
people or agents; any measurement that skeleton-first beats bottom-up; any ablation that shuffles
sub-task order for a coding agent; any measurement of a model's own task order against a
prescribed one.

## Part C. Four other ways to cut the modules

The synthesis cuts by layer: what sits below, what sits above. Each alternative below cuts by
something else. "Easy" and "hard" mean easy or hard to rethink later.

### C1. By artefact and owner (the cut I would adopt alongside the layers)

Four classes of file, each with one writer rule, and tools that are only readers and checkers.

| Class | Examples | Who writes | Changed by |
|---|---|---|---|
| Robin's | Signed spec items, his rulings, examples he marked, expected values and goldens, the normaliser | Robin, or the agent after a recorded ruling | A ruling |
| Agent's working state | Plan, notes, tasks, questions, handover note | The agent, freely | Any write |
| Product | Code and tests | Workers, inside a write scope | A diff we compute |
| Evidence | Gate results, dispatch records, oracle comparisons | Tools only; never edited | Never; a new record supersedes |

- What it removes: module C as a separate thing. Consent (C), protected expected values (§6.6)
  and a pack's write scopes (F) are one mechanism stated three times: a path-scoped refusal that
  only a ruling lifts. In Claude Code that is a `deny` permission rule or a `PreToolUse` hook on
  paths, with no store involved (KNOWLEDGE of the hook and permission surface; not re-checked
  this round).
- What it adds: the gauges become views. Confidence of an item is computed from the evidence
  records that cite it. It is never a stored field, so it cannot become self-report (question 18).
  Version 1 already ruled this way for fidelity ("computed on read", node 16/33).
- Easy: the store's format (it now holds only the agent's class, the cheap one), the flow, the
  chooser. Hard: the boundary of "Robin's", which is question 14, and which this cut makes the
  first decision.

### C2. By the two questions (two kits, one small shared library)

- A **long-session kit**: rewind, handover note, watch. Tests "can a model run long without
  Robin minding its context".
- A **trust kit**: oracle comparison with a normaliser, protected expectations, seeded-defect
  proof of each gate, the debt lint from spec item to test. Usable from a plain session with no
  rewind and no store.
- Easy: either kit can fail or be dropped without the other; the trust kit can be used on
  sampleTidy this week. Hard: the shared piece (items with ids that both kits cite) has to be
  agreed early, or two id schemes appear.
- This is the Bar Raiser's two hypotheses made into packaging. In the layer table the trust kit is
  spread over B, C, D and F and has no name, which is why I think it is the part most likely to
  smear.

### C3. On Claude Code's own parts, with almost no new tooling

| Synthesis module | Built from | New code |
|---|---|---|
| A rewind | The route-F mod; or `/rewind` and `/compact` by hand; or a compaction hook that re-plants the rules card and the note | The mod (exists as a spike) |
| B store | Markdown or TOML files, one `lint` script, one `render` script | About 300 lines |
| C consent | Permission `deny` rules and a path hook | None |
| D gates | stellwerk from a `Stop` or `PostToolUse` hook | None new |
| E workers | Sub-agents with worktree isolation; a scripted workflow for a fan-out step | None |
| F flow pack | A skill: a rules card, prose steps, and the scripts it may call | None |
| G watch | Status line, a notification hook | Small |
| H chooser | Two lines in the skill | None |

- Easy: everything is configuration and can be deleted in a minute; nothing to maintain. Hard:
  the contracts live in someone else's release notes and change under you; lint and consent are as
  strong as the hooks are reliable; a second harness is out of reach.
- I would not adopt this as the architecture. I would adopt it as the **first implementation of
  every contract** in the synthesis: each module starts life as configuration, and gets code only
  where the configuration version hurt in use. See rung 1 in the review.

### C4. One event log folded into views

Every write is an appended event; state, render and gauges are folds.

- For: version 1's survey found the surviving git-native stores were all folds; evidence is
  append-shaped by nature; history comes free.
- Against: Robin has ruled that a checkpoint holds current state, rewritten whole, never a log;
  version 1 retired its own latest-wins fold (node 16/32, last line); a fold is code that must be
  right before anything is readable, which is the opposite of "useful alone in days".
- Take one piece: only the evidence class is append-only (C1). Everything else is current state.

### C5. No tools: conventions and existing commands

A `HANDOVER.md` convention, `/compact` with instructions, git, and the oracle comparison as a
script in the product repository.

- This is rung 3 of the synthesis ladder (the baseline) and I would run it before rung 1, not
  after rung 2. Its cost is a day; what it shows is which of A to H Robin misses.

### C6. Which module is two, which are one, which contract leaks

- **B is two.** Items with lint is one thing; `render` for a cold reader is another. Render's
  acceptance test is the cold-reader test (9 of 9 wrong in the first spike), it changes with the
  flow, and it reads things the store does not hold (what was in flight, which sub-agent is
  out). It will be rewritten several times. Keep it outside the store tool so the store's file
  format does not move with it.
- **D is two.** Running a check (stellwerk, exists) and owning what the check compares against
  (goldens, normaliser, divergence rulings: new, and the most valuable new thing for the port).
- **C, §6.6 and F's write scopes are one** (C1).
- **F will leak.** "A step table. No code." A table that names the gate for each step is either
  read by the model, in which case it is prose and belongs in a skill, or read by code, in which
  case that code is a driver. I would call a pack a skill and allow it scripts, openly.
- **A's contract is narrower than its job.** `rewind <name> --then <command>` says nothing about
  who decides when. "At a context threshold the mod asks for a handover note" is a trigger, and
  triggers are G's. Either A owns the trigger or G is allowed to call A; say which.
- **First to need a rethink: render.** Cost to the others if kept apart from the store: none.

### A4. Where the rework actually fell in sampleTidy's own history

`git log -- R` in `/Users/rjs/dev/sampleTidy` (230 commits, read-only), commits per file and those
whose subject matches fix, bug, correct, regress, repair, audit or remediat.

| File | Lines | Commits | Fix-like | Centrality rank (A2) |
|---|---|---|---|---|
| reconcile.R | 2926 | 35 | 14 | 12 |
| commit.R | 2173 | 26 | 10 | 19 |
| ingest.R | 1322 | 21 | 7 | 27 |
| mutate.R | 1018 | 17 | 9 | 11 |
| db-schema.R | 1101 | 15 | 6 | 10 |
| adapter-acirl-field.R | 1297 | 15 | 2 | 20 |
| feature-alias.R | 1998 | 10 | 5 | 13 |
| text-normalise.R (centrality rank 1) | 135 | 4 | 2 | 1 |

Reading: in the R build, rework sat in the reconcile and commit logic, which centrality ranks in
the middle or low. File size predicted it better than centrality did. This is the R history and
not a port; the message match is crude; a port has different risks (libraries). It is still the
only outcome data to hand, and it is the ground truth the experiment in the review would score
against.

## Part D. Tests and gates for a data pipeline (sonnet sub-agent, 110k tokens, about 30 web calls)

No source found measures which data-quality checks catch real bugs. Everything here is practice.

| # | Source | What it gives | For §6 | Mark |
|---|---|---|---|---|
| P1.1 | dbt-audit-helper | A ladder for comparing two tables: row counts, then an identical-hash shortcut, then which columns differ, then per-row classification. No float tolerance | The output shape of the oracle gate. Add tolerance and the normaliser | FETCHED |
| P1.2 | Datafold data-diff | Open source ended 2024-05-17, repository archived; `reladiff` is a fork | Do not depend on it. A keyed diff in DuckDB is about 30 lines of SQL | FETCHED / SNIPPET |
| P1.3 | R: `diffdf`, `arsenal::comparedf` | Keys, per-column tolerance, order-insensitive | The three knobs a normaliser needs, in one file | SNIPPET |
| P1.4 | dbt unit tests against data tests | Fixed rows in, expected rows out, tests logic; `not_null` and `unique` test state. Vendors report alert fatigue; nothing measured | Take cases from the R oracle for reconcile and commit; skip blanket state tests | SNIPPET |
| P1.5, 1.6 | pandera, Great Expectations, data contracts | Schema libraries of rising weight | DuckDB constraints and one SQL file cost less. A contract pays only if the normaliser reads its column list from it | SNIPPET / KNOWLEDGE |
| P1.7 | Approval and snapshot tests (`insta`, testthat) | Known failure: snapshots re-approved unread | A golden update is its own commit with a printed summary of what changed | SNIPPET |
| P1.9, 1.10 | MetaCDP (10 relations for ETL, not opened); SQLancer TLP (175+ database bugs) | Relations that need no oracle: partition and recombine | For this job: shuffle rows; ingest twice; split a batch and ingest in either order; same work order as ESdat, ENMRG and XTAB | SNIPPET |
| P1.12 | Control totals | Rows read = loaded + rejected + deduplicated, per file | Already in the survey; costs about 50 lines | KNOWLEDGE |

sampleTidy already owns one relation that needs no oracle: its July corpus gate "cross-format
equivalence" (`research/sampletidy-port.md` §2). After the port, when R is gone, that relation and
re-ingest idempotence are what remain of the oracle.

## Part E. How real ports used the old program as oracle

| # | Source | What happened | Lesson | Mark |
|---|---|---|---|---|
| P2.1 | fish shell, C++ to Rust | 57k lines became 75k, about two years, 2,604 commits. The oracle was the end-to-end suite. Structure was kept unchanged on purpose so old and new could be compared. Porting mostly surfaced old bugs | Port with R's structure; refactor only after the comparison passes | FETCHED |
| P2.2 | uutils coreutils in Ubuntu 25.10 | `date -r` was accepted by the parser and never wired up; a script computed zero and unattended upgrades silently stopped. The GNU test suite had not called it that way | The corpus covers only the calls it makes. Silent wrong values are the danger. A check should fail on an option or column the new code accepts and never reads | FETCHED |
| P2.3 | TypeScript 7 in Go | Kept the old structure; runs the old conformance baselines | Same two ideas. Primary posts not opened | SNIPPET |
| P2.4 | GitHub Scientist | Run old and new side by side on real traffic and record mismatches | A shadow run: both versions on each real monthly batch for some months | SNIPPET |
| P2.5 | ACToR, arXiv 2510.03879 | A second agent builds a differential fuzzer to find inputs where old and new differ. 63 utilities averaging 473 lines; over 90% pass; up to 25% better than without | One adversary whose score is a found divergence. Scale is far below 15.8k lines | SNIPPET |
| P2.7 | McKeeman 1998; Csmith 2011 | Disagreement is the signal; generators must avoid inputs where the oracle is undefined | Name what R leaves undefined (row order, ids, timestamps, float noise) in an explicit list | KNOWLEDGE + SNIPPET |
| P2.8 | Normalisers hiding differences | No source found | The sub-agent's suggestion: count hits per rule each run; fail on a rule that never fires or fires on a large share of cells | inference |

## Part F. Controlling context, and requirement stores

| # | Source | What it gives | For the kit | Mark |
|---|---|---|---|---|
| P3.1 | Claude Code `/rewind` (docs fetched 2026-10-06) | Restore code, conversation or both; "Summarize from here" and "Summarize up to here" with typed guidance; resume from before a `/clear`. User-triggered only. Does not restore changes made through Bash or by most sub-agents | A by-hand route for module A exists today. What is missing is the agent or a script triggering it, and state outside tracked edits (the database) | FETCHED |
| P3.2 | Hooks | `SessionStart` matches startup, resume, clear, compact and fork and can inject `additionalContext`. `PreCompact` can block a compaction | A second route with no mod: a hook re-plants the rules card and a note after every clear or compaction. Exact JSON to be checked on the installed version | FETCHED (summarised) |
| P3.3 | Weekly digest | `/fork` (week 29); a sub-agent can inherit the whole conversation (week 33); `claude plugin eval` runs a plugin on test cases against a no-plugin baseline (week 37, v2.1.263-269) | Plugin eval is a ready harness for "each step must beat the baseline", if a pack is a plugin. Not tried | FETCHED |
| P3.5 | API context editing (beta) | Clear old tool results, keep the last few; clearing breaks the cached prefix | Not usable inside Claude Code. The idea is already Robin's rule: gate output to disk, one line in context | FETCHED |
| P3.7 | Amp "handoff" | Replaced compaction with a user-reviewed prompt and file list for a new thread. No measurement | The nearest shipped thing to "rewind with a note" | SNIPPET |
| P3.8 | Gemini CLI checkpoints | Snapshot of files, conversation and the pending tool call | The pending action is what Claude Code's rewind lacks, and what `render` cannot see | SNIPPET |
| P3.9 | arXiv 2605.18854 (abstract) | 8 condensing strategies, 60 data-analysis tasks, one model: none improved quality; summaries by a model cost 24 to 94% more; masking old tool output saved 8.6% | Favours a rendered state over a model-written handover note. One benchmark | FETCHED (abstract) |
| P3.10 | arXiv 2609.00006 | Source study of eleven coding agents, 29 patterns. Body not read | Worth twenty minutes before module A is fixed | FETCHED (abstract) |
| P3.11 | Backlog.md, StrictDoc, suspect links | A link stores the hash of what it points to | The idea, in about 40 lines; no tool | SNIPPET |

**Not found:** whether native tasks survive compaction; any measurement of handoff against
compaction; anything on compaction control announced after August 2026 beyond an `--autocompact`
flag (third-party notes for 2.1.221).

## Part G. What was run and what it cost

- Two sonnet sub-agents, one at a time: 107k and 110k tokens.
- Ten haiku sessions (`claude -p`, one turn, no tools) from the scratch folder: $0.30. Nothing left
  running.
- Three read-only scripts: A1 over `store/` in memory; A2 and A4 over sampleTidy's `R/` and its
  git log. No tests were run in any repository.
