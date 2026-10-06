# Green Hat, round 2: alternatives and prior art for V2-SYNTHESIS.md

Detail: `green-hat-appendix.md` ("A3", "C1" are parts; "S-11", "P2.2" rows in its prior-art tables).

## Verdict

The layer cut suits the base; the things that earn trust are spread over four modules, unnamed.
Build the kit skeleton-first, every module as configuration on one sampleTidy slice, not by layer.
Scheduler: a habit plus a short risk list; the formula made 3 of 31 choices on v1's own store.

## The modules

**What the new framing changes.** With the flow demoted to a pack, the question is what must stay
stable while packs change. My answer: the files Robin owns and the expected values. The synthesis
treats both as features of other modules.

**Four other cuts** (C1 to C5 in the appendix, each with what it makes easy and hard to rethink):

| Cut | Idea | Easy to rethink | Hard to rethink | My use of it |
|---|---|---|---|---|
| By artefact and owner | Four classes of file (Robin's, the agent's working state, product, evidence), one writer rule each; tools only read and check | Store format, flow, chooser | Where "Robin's" ends | Adopt alongside the layers |
| By the two questions | A long-session kit (rewind, note, watch) and a trust kit (oracle, expectations, gate proof, debt lint), sharing only item ids | Either kit without the other | The shared ids | Adopt as the packaging |
| On Claude Code's own parts | Hooks, permission rules, skills, sub-agents, a 300-line lint and render script | Everything; it is configuration | Contracts live in another party's release notes | The first implementation of every contract, not the architecture |
| One event log, folded | All writes appended; state and gauges are folds | History, gauges | The fold must be right before anything is readable | Reject, but make the evidence class append-only |
| No tools | A handover file, `/compact`, git, an oracle script | Everything | Lint, mechanical consent | Run it first, as the baseline |

**Changes I would make to the table in §3:**

1. **C is not a module; ownership is a rule over paths.** Consent (C), protected expected values
   (§6.6) and a pack's write scopes (F) are one mechanism written three times: a refusal that only
   a ruling lifts. Stated once, it needs no store and can start as a permission rule (C1).
2. **Split D.** Running a check exists (stellwerk). Owning what it compares against (goldens, the
   normaliser, the ruling on each divergence) is new and has an owner and a life cycle. Call it
   **expectations**. It is useful alone, from a plain session, this week.
3. **Split B.** Items with lint is one thing; `render` for a cold reader (9 of 9 wrong in round 1)
   is another. It changes with the flow and needs what the store lacks (work in flight, P3.8). It
   will need a rethink first: outside the store tool that costs nothing; inside, it drags the format.
4. **Call a flow pack a skill and allow it scripts.** "A step table. No code" will leak: the table
   is read by the model, which makes it prose, or by code, which makes that code a driver.
5. **Gauges are views, never fields:** confidence is computed from the evidence records citing an
   item, as version 1 ruled for fidelity (node 16/33, "computed on read").
6. **Say who pulls the trigger.** A's verbs do not say who decides when to rewind; a context
   threshold is a trigger, and triggers are G's.

## The scheduler

- **On version 1's own store (31 open nodes), the formula alone decided 3 of 31 picks.** 23 were
  ties broken by node number; 21 nodes had priority zero before any work. The two nodes with a real
  priority came 28th and 29th, held back by leaves-first readiness (A1).
- **At the start of a port the formula is centrality alone,** since everything is on the bottom
  rung. Over sampleTidy's R files that ranks four small helpers first, units 8th and the legacy
  `.xls` adapter 20th of 28 (A2). So §4's "the risky parts would surface first" does not follow.
  Centrality measures how far an error spreads, not how likely it is before evidence exists.
- **A model unaided does what the formula does.** Five haiku runs named `.xls` as a top risk and
  placed it 7th, 8th or not at all; three said to do it last. With one added paragraph (skeleton,
  then least proven and most costly first, cheapest check first), units moved to 2nd in 5 of 5,
  `.xls` came forward in 4 of 5, and 4 of 5 proposed spikes (A3; n = 5 an arm, a plan on paper).
- **In sampleTidy's history the rework sat in reconcile and commit** (14 and 10 fix-like
  commits), which centrality ranks 12th and 19th; file size predicted it better (A4).
- **Prior art.** Risk-first ordering is forty years old (Boehm, S-1); no comparison with another
  order was found, for people or agents. Practice kept a short list of top risks reviewed each
  cycle, not a score on every item. Multiplying ordinal scales is the risk-matrix error (Cox,
  S-11). Test prioritisation and active learning find simple rules re-applied each step hard to
  beat (S-9, S-14). Assurance practice moved from a confidence number to a list of open reasons a
  claim could be false (S-19). Agents predicted 77% success where they achieved 22% (S-25).

**Strength I would adopt: habit, plus a risk list as a kind of item.** At most ten entries, each
naming the doubt, what is wasted if it is wrong, the cheapest check, and the evidence record that
closed it. The rules card says: after the skeleton, close the top of the list before building on
it. No gauges on ordinary items, no `next`. If a ranking is ever wanted: lexicographic (lowest
rung, then dependents), ties shown, with the missing cost term.

## Tests and gates

**The alternative §6 misses: put the gates on the database.** DuckDB is the one artefact that is
the same before and after the port, in any language. A check is a SQL query returning offending
rows; zero rows is exit 0. The oracle gate attaches two database files and runs a keyed diff.

**Belongs in §6 and is not there:**

1. **The oracle gate reports a ladder, not a verdict:** row counts, columns that differ, rows
   classified (P1.1); each divergence is ruled old bug kept, old bug fixed or new bug (P2.1).
2. **The normaliser is the weak point and gets its own proof:** each rule has a pair it must
   equate and a pair it must not; each run counts hits per rule and fails on a rule that never
   fires or fires too widely; what R leaves undefined is an explicit list (P2.7, P2.8).
3. **Relations that need no oracle,** because the oracle retires: re-ingest changes nothing;
   shuffled rows or a split batch give the same tables; one work order as ESdat, ENMRG and XTAB
   gives the same rows (already a sampleTidy corpus gate); row accounting per stage.
4. **A check for accepted-but-unused input** (uutils in Ubuntu: an option parsed and never wired,
   P2.2): every source column and config key is read or on a declared ignore list.
5. **Port with R's structure; refactor after green** (fish, TypeScript; P2.1, P2.3).
6. **A shadow run as the trust answer (question 32):** both versions on each real monthly batch,
   mismatches filed (P2.4). Later, one adversary scored only on finding a divergence (P2.5).

**Theatre, or likely to grow:**

- **§6.5 as written** ("every gate proves itself on a seeded defect, and again when it changes")
  is werkbank's canaries as a standing duty. Keep it for the normaliser (item 2) and let diff
  mutation (§6.4) be the seeded defect for tests. Drop it as a rule over every gate.
- **§6.1's lint** proves a test of the owed kind exists, not that it tests. Do not count it as trust.
- **§6.7 will grow.** Selecting "the affected slice" is code. sampleTidy's committed fixtures are
  632 KB; run the whole comparison on them every time and the 265-file corpus at a release.
- Also tempting: blanket `not_null` tests, a validation framework, a requirements tool (part D).

## Open questions

- **2.** A week without route F: `/rewind` already offers "Summarize from here" with typed
  guidance; a `SessionStart` hook can inject a file after clear, compact or resume; `PreCompact`
  can block (P3.1, P3.2; fetched docs, not tried here).
- **3, 12.** Render state, not a summary: one study found model-written summaries cost 24 to 94%
  more with no gain, and masking old tool output won (P3.9, one benchmark). Add the pending action.
- **6.** Fixed kinds: item, question, note, risk. **13.** Git for state; evidence is append-only.
- **19.** As built the rule is dependency order: it neither fights nor completes the skeleton.
- **21.** No step table. **29.** Diff mutation plus the adversary's finds. **37.** Run both spikes
  now; at least nine of ten model runs named `.xls` a top risk.

**Cheapest experiment for question 20** (an hour, under $5, no build): A3 on the model that will
orchestrate, twenty runs an arm: unaided, the paragraph, the paragraph plus a ranked list. Score
each plan by how early it reaches what later proved costly (sampleTidy's fix history, A4, and the
two spike results). Whether the habit holds at the fortieth step needs rung 4.

**Questions I would add:** Who owns a golden once R is retired? What restores the database on a
rewind, given `/rewind` does not track changes made through Bash? When does the shadow run stop?
**The three that matter most:** 33 (the baseline), 32 (trust), 39 (the seams).

## Rung 1

Not rewind alone: native `/rewind` and a hook cover most of it by hand. I would make rung 1 **the
skeleton of the whole kit on one sampleTidy slice**, every module at its thinnest:

- expectations: R's IR and tables for the ESdat fixture as goldens, a 30-line keyed diff, a
  first normaliser with its rule tests (real code, about a day);
- ownership: a permission rule denying writes to the goldens and the signed items;
- rewind by hand, with a hook that re-plants the rules card and one state file; store: four
  markdown files and a lint script; chooser: the paragraph and a risk list headed by the two
  spikes (`.xls`, units).

Useful within a week: it yields the baseline number (question 33), the first slice of the job
Robin wants, and a list of which thin part hurt, which decides what gets code next.

## MUST-fix

1. **§3, §6: name expectations as a module and state ownership once** (changes 1 and 2).
2. **§8: reorder the ladder:** baseline and a thin skeleton of every module first, code where it
   hurt. Rung 1 as written largely duplicates a native feature.
3. **§4: correct "risky parts would surface first"** and offer the risk list as the habit's form.
4. **§6: add the normaliser's proof and the oracle-free relations; narrow §6.5; drop the selector.**

## What must survive

- A lower module never names a higher one; a deletable module breaks only what is above it.
- Render is a pure function of files; the rules card rides in every rewound context.
- Oracle gate, diff mutation, findings not stops, rationed review, confidence from provenance.

## What I checked

Myself: `ctx_schedule.py` and nodes 16/32, 16/33 read in full; A1 on `store/` in memory; A2 and A4
by script over sampleTidy's `R/` and git log (approximate matching); A3 ten haiku runs, $0.30,
scored by eye. Not verified: every outside source (two sonnet sub-agents, marked in the appendix);
hook and `/rewind` behaviour on the installed version; any figure in §2 of the synthesis.
