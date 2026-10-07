# Doktoreltern v2: where the thinking stands

2026-10-06. For the review panel. This is a synthesis for discussion and holds few decisions. It
replaces `SCOPING-DRAFT.md` (the "Leitstand" draft) as the thing under review. Robin has chosen to
leave the first panel's open questions open for now, so they are carried here as questions.

Markers: **[R]** Robin said it. **[M]** measured. **[P]** proposed here. **[U]** untested or
unverified. Paths are relative to this folder unless they start with `../`.

## 0. Half a page

Doktoreltern v2 is a complete rewrite. It is a small set of modules for running long pieces of
agent work in one Claude Code session that Robin can watch and step into.

- **The base is useful with no flow at all.** A *rewind* returns a live session to an earlier
  point. A *store* holds structured items in files and renders them to text. Together they
  replace "checkpoint and I'll compact" for any long job.
- **Everything about how a build proceeds is a layer above,** shipped as a *flow pack* that can
  be swapped or thrown away.
- **Modularity is the main requirement [R]:** build parts that are useful on their own, and find
  the parts that need a rethink without destroying the rest.
- **Test quality and mechanical gates still matter [R]:** better tests than unit tests alone, and
  real gates, without the weight that made werkbank unusable.
- **First real job [R]:** sampleTidy (`../../sampleTidy`), an R pipeline from lab files into
  DuckDB; port it and add features. Rust is no longer assumed [R].
- Taken from version 1: the walking-skeleton flow, consent attached to Robin's own decisions,
  the store's shape, and, as a candidate to be assessed, its scheduler.

## 1. What Robin wants

1. A model orchestrator that uses judgement, with its context kept fresh mechanically. The main
   reason for a model here, in Robin's words: it "can make decisions so not every possibility
   needs to be pre specified". Being able to talk to it is the second reason, and the lesser.
   werkbank is the evidence for the first: its driver grew from 10.8k to 49.3k lines, and 52 of
   the 55 patches in one release were ten missing rules. A cost comparison between a resident
   model and a thin driver has to count that.
2. One terminal session showing where things are, in which he can say "stop". Help from him is
   expected on early runs; his attention is the scarce thing.
3. Parts that can be changed in or out: skills from others, the flow, the reset route, the
   language of the software being built.
4. Checkpoints that are machine-readable and lintable; notes that grow with the work; decisions
   written into the spec or plan, with git as the only log.
4a. **No sprawling ruling documents [R, 2026-10-06, a design goal].** tdd-plan, which built
   sampleTidy, left two ruling documents of about 59 KB each. Preventing that was one of the aims
   in evolving tdd-plan into werkbank, and it did not succeed. A ruling should change the thing
   it rules on and then be gone; what survives is the current state.
5. Audits that hand back failing tests; findings grouped by root cause; fixes that do not breed
   new bugs.
6. Gates that test what was edited, with the full suite kept for real releases.
7. The two failures he fears: he does not trust the output, or it is too slow or too dear.

## 2. What is known

**From werkbank** (`research/werkbank-evidence.md`; figures corrected by the first panel's
evidence auditor):

- Judging took 62% of run 3's spend and building 7% [M]. Rulings cost $10 to $45 a round; the
  fixes $0.4 to $3.7 [M].
- 53 stops, 46 hours halted [M]. The suite grew from 10.7 to 85 minutes [M]. Canaries: 0
  of 13 runs passed by their original rule, though they surfaced about 17 defects [M]. The driver grew from 10.8k to 49.3k lines [M].
- 25 of 27 audit finds were reachable earlier [M]. 14 of 24 test-able finds ended in spec or plan
  edits [M]. "Our own remediation became the leading source of new defects" (v3.3).
- A model orchestrator with segmented context was tried in v3 and became a driver
  (`research/v3-segments.md`). No measured win from segmenting was ever recorded.

**From Doktoreltern v1** (`research/doktoreltern-design.md`, `research/doktoreltern-prior-art.md`):

- Its `ctx` substrate is about 3,300 lines in all, with 361 tests passing [M]. The store-side part
  is about 2,150 of those. More than half of that is one 1,172-line module (the marker grammar
  for about 17 kinds, plus the invariant checks), which v1's own review named its largest
  liability. The store's validated write and the linter both call it.
- Its flow is skeleton-first: interfaces across the breadth, one tracer path to real, mocks just
  in time. It was exercised only on a retired seven-node toy.
- v1's driver was designed against a measurement taken on werkbank v2: a resident orchestrator of
  837 turns took about 75% of spend, with cost growing with the square of turns [M]. v1 never ran
  a resident orchestrator itself, and its own cost constants are unmeasured.
- Its 8 August review ("lean on existing code") was never acted on.

**From the spikes** (`research/spike-reset/`, `spike-live/`, `spike-f1/`):

- A live session can be rewound: fork the session at a message through the Agent SDK, resume the
  fork in the terminal from a mod ("route F"). 8 resets, nothing leaked; the first request after
  a reset read 73k to 80k tokens from cache and wrote about 0.2k [M, haiku, filler state].
- The phone view followed the session across those resets [R observed]. Not shown: reconnecting
  later, an open dialog at reset, hours idle, 30 or more resets [U].

**From the first panel** (`reviews/`, merged in `reviews/SYNTHESIS.md`):

- The reset and the files are sound; the draft's flow was werkbank's flow with a model driving.
- Five lenses asked for a compiled skeleton first, serial units, and plans written just before
  use. No plain-agent baseline exists anywhere in the record.
- Two hypotheses were bundled: the reset gives autonomy; the flow gives trust.
- Small spikes: 8 of 8 haiku orchestrators stopped for the owner when a test and the spec
  disagreed; a cold haiku reader gave confident wrong answers to the three resume questions in each of
  three runs.
- Cost model: about $570 for a 12-unit build, 80% band $300 to $1,200, about 10x a plain session
  [P, the Economist's estimate].

**From sampleTidy** (`research/sampletidy-port.md`): 15.8k lines of R, 1,286 tests, no property
or snapshot tests; the R version can serve as a reference for a port, though its run over the
full corpus of real files has not happened yet; 86 rulings live in the code and two contract
documents; PDF parsing and the email trigger are not built. A full Rust port is the riskiest language
option (units, legacy `.xls`, and Robin cannot read Rust) [U, from the surveyor's knowledge].

## 3. The modules

Detail and reasoning are in `MODULARITY.md`. The rule: **a lower module never names a higher
one.**

| | Module | Contract | Useful alone |
|---|---|---|---|
| A | **Rewind** | `mark <name>`; `rewind <name> --then <command>` submits what the command prints | Yes |
| B | **Store** | `put`, `get`, `lint`, pure `render(scope) -> text`; one writer; each write validated and committed | Yes |
| C | **Consent** | Each item has an owner. Robin's are refused to the agent; a question is filed and only dependent work parks | With B |
| D | **Gates** | One command per check; exit 0 met, 1 deviation, 2 tool fault; full output on disk (stellwerk) | Yes, exists |
| E | **Workers** | Task and working directory in; a diff we compute, evidence, verdict out | Yes |
| F | **Flow pack** | A schema (at most five item kinds), a rules card, a step table, write scopes. No code | No |
| G | **Watch** | Status line, heartbeat, notify, bounded relaunch. Reads; never chooses work | With A |
| H | **Chooser** (candidate) | `next(store) -> ranked items`, pure and advisory. See section 4 | With B |

**What "modular" must mean in practice [P]:**

1. Each of A, B, D and E is used for real work before the next is built.
2. The reset route can change (route F, a compaction hook, a program on the SDK, Robin typing
   `/compact`) without touching B to H.
3. A flow pack can be replaced without changing any tool.
4. The language of the software being built is configuration in D, nowhere else.
5. A module that turns out wrong can be deleted. The test is that its removal breaks only the
   modules above it.

**What each module costs if it is wrong:** A is small and has substitutes. B is where data
lives, so its file format is the expensive thing to change. C is one field and a refusal. F is
cheap by design. H is unproven.

## 4. The scheduler from version 1, as a candidate

Robin likes it and wants it assessed, without attachment [R].

**What was designed** (v1 nodes 16/32 and 16/33):

- Work is a tree of items with cross-links. Each carries two gauges.
- **Confidence** is provenance, never self-report: asserted < prior art < spiked < mock-validated
  < implemented and tested < implemented and reviewed < user-tested. More drafting never raises
  it.
- **Fidelity** is how built-out a thing is: stub < interface < mock < correct. A parent's
  fidelity is the lowest among the children it rests on.
- **Priority = centrality x (1 - confidence).** Centrality comes from the graph: how much hangs
  off the item.
- **Intensity:** the cheapest check that settles the doubt, from a thought experiment through a
  literature search and a spike to a full build.
- Order: a floor pass first (interfaces across the breadth, one tracer path to real), then
  best-first deepening.

**What was built** (`ctx/scripts/ctx_schedule.py`, 275 lines; checked by the round-2 evidence
auditor) is simpler, and differs in ways that matter:

- Confidence has three levels. It comes from the share of a node's questions that are resolved,
  or else from a declared marker, which is self-report. The evidence ladder is not implemented.
- The floor is "every frontier node at least at interface". The tracer path is not in the code.
- After the floor, only nodes whose children and blockers are already correct may be deepened.
  That is **leaves first**: the most central node comes last. The formula only ranks among nodes
  that are ready at the same moment, and with three confidence values many tie.
- Intensity does not exist in code.

So "work on the least certain, most depended-on thing first" describes the design's intent, and
the code does something else. v1's own research warned that stated confidence is overconfident
and that this "directly misallocates the schedule".

**Why it is attractive:** it is the only idea on the table that says *what to do next* by risk.
It gives the skeleton-first flow a reason and a continuation: after the skeleton, widen where
doubt and dependence are highest. It makes "confidence" an evidence ladder that gates can raise
mechanically, which ties tests to the plan. For a port, the risky parts (legacy `.xls`, units)
would surface first, as spikes.

**Why it is risky:** the weights were never tuned and it ran only on a seven-node toy, where
every step was a leaf on a happy path. As code that picks the next unit it is a second driver, which is the thing
werkbank became. The prior art found tools that rank a
graph (a layered ready queue, PageRank and critical path in beads' viewer) but none that ranks
by doubt times dependence, so there is little to copy and nothing to compare with.

**Three strengths it could be adopted at [P]:**

| Strength | What is built | Risk |
|---|---|---|
| Habit | Two lines in the rules card; the model ranks by judgement | None; no evidence it is followed |
| Advisor | The two gauges as item fields; `next` prints a ranked list; the model chooses and may depart, with the departure counted | Small; gauges must be kept true |
| Driver | `next` decides | werkbank's road |

The gauges are separable from the ranking. Fidelity and an evidence-based confidence are useful
to a store and to a report for Robin even if nothing ever ranks by them.

## 5. Flow packs under discussion

None is chosen. All share: interfaces as real code before tests; one end-to-end path before
breadth; serial work; plans written just before use.

| Pack | For | Shape | Closing check |
|---|---|---|---|
| none | Any long session | Rewind with a handover note | None |
| notes | Research and scoping | Store with questions and findings | Lint |
| port-with-oracle | sampleTidy | Skeleton for one lab format, then a slice at a time | Same files in, same database out as the R version |
| skeleton-then-widen | New work | Interfaces, one real path, then behaviour slices planned two or three ahead | End-to-end test plus per-slice tests |
| risk-first | Either | As above, with the order of slices from the chooser | As above |

## 6. Better tests and real gates, without werkbank's weight

Robin's aim is unchanged: trust comes from mechanical checks more than from model opinion. What
has to change is the cost.

**Where werkbank's weight came from [M]:** every gate ran on everything, so the suite reached 85
minutes; most spend went on models judging findings; each new failure class added driver code;
the canaries meant to prove the gates never passed by their own rule.

**Proposals [P]:**

1. **A test kind is owed by the spec item, at writing time.** An item's class says what it owes:
   examples, a property over an input class, a comparison with a mirrored tool, a failure shape,
   a seam test from real producer into real consumer. Lint checks the debt is paid. The
   Economist's rough proxy: about $1 a defect caught this way against about $17 caught by a late
   audit.
2. **An oracle gate.** Where a reference exists (the R version; later, the last release), "same
   input, same output under a stated normaliser" is the strongest check available and needs no
   model.
3. **One end-to-end run on real files in the cheapest tier,** kept within minutes.
4. **Mutation on the changed lines only,** as the measure of whether tests can fail. Never a
   coverage threshold.
5. **Every gate proves itself on a seeded defect** before it is trusted, and again when it
   changes. A gate never seen to fail has not been shown to work.
6. **Expected values are protected:** outside the agent's write scope, hashed, and changed only
   by a ruling. Tests may not quietly leave.
7. **Tiers by what changed, with time budgets as design limits:** seconds for the edited files,
   minutes for the affected slice, the whole suite only at a real release (Robin's a.b.c scheme,
   even `b`).
8. **A gate result is a finding, never a stop for Robin.** It goes back as a failing check to the
   worker that can fix it.
9. **Model review is rationed:** one fresh reader per slice, capped rounds, a second read only
   where a ruling changes the spec, the plan or an accepted test.
10. **Gates stay a module.** stellwerk owns them; nothing above knows a language.

**Where gates are chosen [R raised, 2026-10-06; open].** A reviewer proposed SQL checks on the
database "since the product is a DuckDB database". Robin's reply: *a* product is a DuckDB; perhaps
the lesson is that gates are chosen project by project as part of writing the spec, or belong to
flows aimed at particular classes of product. One way to hold both [P]:

| Level | Holds | Lives in | Who owns it |
|---|---|---|---|
| Mechanism | How a kind of check runs and reports (oracle, property, mutation, a query against a database, row accounting) | The gates module; knows no project | The tool |
| Profile | The usual set and defaults for a class of product (data pipeline into a database; numerical kernel; command-line tool; R package) | A pack. Version 1 had this shape: its r-science and r-data "advisors" were one spine with different standards | The pack |
| Gate plan | Which checks this project owes, with their parameters, pass marks and time budgets | The spec, as items | Robin, by signing; under the consent rule the agent cannot weaken them |

The proposals above then become a menu, and item 1 (a spec item says what it owes) is where the
choice is made.

**What is not known:** whether this is enough for Robin to trust output he cannot read line by
line, and what it costs. No baseline exists to compare with.

## 6a. Keeping rulings from becoming documents

A design goal [R]. tdd-plan left sampleTidy with two ruling documents of about 59 KB each, and
werkbank was meant to stop that and did not. The evidence is in `research/ruling-sprawl.md`, which
classified all 83 numbered rulings in sampleTidy.

**What the sprawl is made of [M]:**

| Kind of ruling | Count |
|---|---|
| Behaviour now fully encoded in code and tests, so the prose is redundant | 43 (59% of the bytes) |
| Superseded or amended by a later ruling | 14 |
| Rationale or bug history only | 12 |
| A process rule for agents | 6 |
| Prose is the only record of the decision | 5 |
| Near-duplicate | 2 |
| Open question | 1 |

- The contract grew from 25 KB to 114 KB in 25 days, 94% by additions [M]. About a quarter of the
  text is live, and a fresh agent adding a lab adapter needs about 16 KB of the 118 KB [inferred].
- werkbank moved the problem and did not shrink it: its changelog is 394 KB and its decision log
  234 KB after 17 days; stellwerk's contract is 230 KB and its adjudications ledger 2.2 MB [M].
  History went into ledgers, and nothing capped a ledger.

**Why it happens, in order of weight** (the ranking is the surveyor's judgement):

1. Rulings were only ever added. Each audit round appended an entry; nothing forced an edit or a
   deletion, and nobody owned pruning.
2. Rationale and measurements had no other home. Agents were asked to measure and show it, and
   the ruling was the only lasting place for the result (roughly 35 to 45% of the bytes).
3. The thing ruled on was frozen or owned by someone else, so a ruling amended it by reference:
   "A62 refines A11" became a new entry beside A11.
4. Ids locked entries in. The rulings are cited from more than 600 places in code and tests, so a
   dead entry could not be deleted.
5. Deleting felt unsafe, because an audit might reopen the question.

**Proposals [P]:**

1. **A ruling has no entry of its own.** It is an edit to the item it rules on. A signed item
   stays editable through a ruling, with Robin's consent where it is his; nothing is ever amended
   by a note beside it. (Removes causes 1 and 3. It is also a reason not to make signed items
   immutable.)
2. **Ids belong to items only.** Code and tests cite the item, which lives on, and never a
   ruling. (Removes cause 4.)
3. **A ruling that fixes behaviour becomes an example row or a check,** and its prose is deleted
   once the check exists. This is the same move as "Robin signs outcomes; each check ties to one"
   in section 6.
4. **Supersede by deleting.** Git keeps what was there.
5. **Rationale is a sentence or two in the commit message of the edit. Measurements go in the
   record of the piece of work that made them,** which is immutable, may be pointed to from an
   item, and is never loaded into context by default. (Removes cause 2.)
6. **Rules for agents live in one small fixed file,** separate from product decisions, re-planted
   word for word and held under the hook's size limit (`research/hook-context-cap.md`). The limit
   is treated as a useful constraint.
7. **A short, capped list of dead ends,** so a ruled-out mistake stays ruled out without keeping
   the argument. (Answers cause 5.)
8. **Size budgets per item and in total, checked by lint.** Going over is a prompt to prune.
9. **Pruning has an owner and a moment:** the end of each piece of work.

The surveyor's estimate is that this would have taken sampleTidy's 118 KB to about 29 KB
[inferred].

**What this asks of the modules:** items must be editable in place by a ruling; the record of a
piece of work must exist as the home for evidence; and whatever carries rules across a reset
carries a small fixed file, never an accumulating one.

**Not known:** whether deleting a superseded ruling leads audits to raise it again; whether one
or two sentences in a commit message is enough rationale when a decision is questioned months
later, given that agents rarely read commit messages; and where the five prose-only decisions
belong (probably in the statement of the item they concern).

## 7. What to take from others

| For | Take | From |
|---|---|---|
| A | Claude Code's own `/rewind` (an interactive menu) and the SDK's `forkSession` are the parts; nothing lets a program return a live session to a named mark and submit text. One warning, from a single preprint: rules dropped at compaction were then broken 30 to 38% of the time, so the rules card rides in every rewound context | prior art survey; `research/mods.md` |
| B | One file per item; suspect links (a child stores its parent's fingerprint) | doorstop |
| B | A grammar tying a spec item to its tests, proving cover (the pattern; the tool is Java and GPL-3) | OpenFastTrace |
| B | Edge names only: `blocks`, `parent-child`, `discovered-from`, `supersedes` | beads |
| B | Validated write with a commit; immutable per-dispatch records; serving the ancestor path; the askability rule | Doktoreltern v1 |
| C | Consent derived from what the human decided; park only what depends on it. In v1 this was designed as a judgement check and not built; the mechanical refusal is new here | Doktoreltern v1 |
| D | Seeded-defect calibration; protected baselines; a result-file shape; diff-scoped mutation | several |
| D | The verdict grammar and exit codes | stellwerk |
| E | Isolation, budget caps and hooks that Claude Code already has; a diff computed by us | Claude Code; prior art |
| E | TDD, planning, debugging and review skills, pinned | superpowers; compound-engineering; built-ins |
| E | Scripted workflows for a multi-agent step [U] | Claude Code |
| F | Skeleton first; one real path before breadth | Doktoreltern v1; the first panel |
| H | The gauges and the priority rule | Doktoreltern v1 |

Rejected by the surveys: most durable-execution engines (two were left as possible spikes), a
tracker as the source of truth, coverage
thresholds, debate between models, parallel agents on dependent work.

## 8. A possible ladder

Each rung is used before the next is built, and each can be the last.

1. **Rewind alone.** A handover note at a context threshold. Used in ordinary sessions.
2. **Store and consent.** Used first as the notes pack, on scoping work such as this.
3. **Baseline.** One sampleTidy slice done by a plain session with rungs 1 and 2 and the oracle
   gate. This is the number everything later is compared with.
4. **A flow pack.** The same slice, and the next, under a pack. Each step earns its place by
   beating rung 3.
5. **The chooser,** if rung 4 shows that order matters.

## 9. Open questions

**The base**

1. Does a resident orchestrator with rewinds stay cheap over a real job, given v1's own
   measurement against residency? What is the cheapest run that would show it?
2. Is route F stable enough to build on while mods are early access? What does a week without
   it look like?
3. What should `rewind` restore: a rendered state only, or also the last few turns?
4. How often should a rewind happen: per step, per slice, or at a context threshold only?
5. What is the smallest rules card that still holds after 30 rewinds?

**The store**

6. Item kinds as data in the pack, or two or three fixed kinds for everything?
7. TOML items as drafted, or v1's folder of markdown documents per node with a thin index?
8. A tree with cross-links (v1) or flat items with edges?
9. Reuse v1's `ctx` code, or copy its shape into a new small tool? In what language?
10. Where does the store live: in the product repository, or in its own?
11. Notes at one level or three? What stops them growing without bound?
12. What must `render` contain so that a cold reader answers resume questions correctly, given
    the 9-of-9 failure in the first spike?
13. Is "git is the log" enough, or are immutable per-dispatch records needed as well?
47. What stops rulings accumulating into a document? Candidates: a ruling is an edit to an item
    and has no entry of its own; a ruling that fixes behaviour becomes an example or a check, not
    prose; size budgets per item and in total, enforced by lint; superseded text is deleted and
    git keeps it. Section 6a proposes an answer.
48. Does deleting a superseded ruling make audits raise it again? Is a capped list of dead ends
    enough to prevent that?
49. Where do measurements and evidence live, if not in the ruling, and how does an agent find
    them when it needs them?

**Consent**

14. Is "Robin owns what he decided" the right line, or are there items he should own that he
    never ruled on?
15. When the spec is silent and the agent fills it, how does Robin see that without reading
    everything?
16. Should a refusal park the dependent work, or should the agent proceed on a marked assumption?

**The chooser**

17. Is the scheduler worth having at any strength? Which one?
18. Can confidence be raised only by evidence in practice, or will it turn into self-report?
19. Does risk-first ordering fight skeleton-first, or complete it?
20. What would show that risk-first order beats the order a capable model picks unaided?

**Flow**

21. Is a step table needed, or do a rules card and skills suffice for a model orchestrator?
22. Slice or file as the unit of work? What is a slice in a pipeline that is 58% reconcile logic?
23. Who writes interfaces, and how does a signature change after the skeleton?
24. How much planning happens before the skeleton?
25. What does the orchestrator do when a test and the spec disagree, given 8 of 8 stopped?

**Tests and gates**

26. Which test kinds does a data pipeline most need, and which are theatre?
27. What makes a good normaliser for the oracle gate, and who rules on each divergence (R bug,
    kept quirk, port bug)?
28. Are the time budgets realistic on an 8 GB laptop for R, for Rust, for both at once?
29. How is test quality measured without a model's opinion and without coverage?
30. What stops gates from growing the way werkbank's did?
31. What is the least model review that still catches what tests cannot?
45. Are gates chosen per project at spec time, per class of product in a pack, or both? Who
    proposes a project's gate plan, and how does Robin judge one he cannot evaluate technically?
46. If the gate plan is Robin-owned, what happens when a gate turns out wrong or too slow
    mid-build?

**Trust, cost and stopping**

32. What would make Robin trust output he has not read? Is a held-out check set the answer?
33. What does a plain session cost on one sampleTidy slice, and what multiple of that is
    acceptable?
34. What result at which rung means stop?
35. How many stops for Robin per slice are acceptable on early runs, and later?

**sampleTidy and language**

36. Port all, port a typed core, or stay in R and build the features first?
37. If a port: Rust or Python? Are the two spikes (legacy `.xls`, unit strings) worth running now?
38. Can one repository hold two languages behind one gate interface during a port?

**Modularity itself**

39. Are these the right seams? Which module is secretly two, and which two are one?
40. Which contract will be hardest to keep narrow?
41. What is the first module likely to need a rethink, and what would that cost the others?
42. Is a ladder of useful rungs realistic, or will rung 1 be too thin to use?

**The name and the inheritance**

43. What of v1 is kept as code, what as ideas, and what is archived?
44. v1 was a method for risk-first science software. Is v2 still that, or a build tool with a
    method attached?

## 10. What the panel is asked

1. Are the modules and their contracts right (questions 39 to 42)? This matters most.
2. Assess the scheduler at each strength (17 to 20).
3. Is section 6 enough to give tests and gates that earn trust without werkbank's weight?
4. Which open questions matter most, which are missing, and which can be answered cheaply now?
5. What should be on rung 1, and what would make it useful to Robin in a week?

## 11. After the second panel

The second panel reviewed sections 0 to 10 as they stood. Its seven reviews and their merger are
in `reviews/round-2/` (start with `reviews/round-2/SYNTHESIS.md`). Sections 3, 5 and 8 above have
**not** been rewritten to match; this is where the panel landed.

- **The split.** Adopt the Architect's: Session (the reset, behind `handover`, `mark` and
  `rewind`), Store, Gates, Work (`begin`, `end`, one immutable record), Watchdog, Pack, and an
  optional Rank, meeting only in one wiring file. With the Bar Raiser's amendments: a **Carry**
  file of fixed rules re-planted word for word; ownership as a rule over file paths checked by a
  gate; `render` outside the store; the store deferred until plain files have failed twice.
- **A test of modularity that can fail:** delete each piece for real; a second implementation
  behind each contract; three sampleTidy sessions on a piece before the next is started; one
  deliberate rethink drill.
- **The first build is "rung 0", and it is not a module:** a real sampleTidy job in R in a plain
  session, with the Carry file, a handover command, outcomes Robin has signed, and a tally of the
  decisions the model made unaided. Three lenses back this; two kept the rewind first.
- **A handover note written by a model is not a safe carrier.** In a haiku spike, three standing
  rules survived one rewind in 2 of 9 cases and two rewinds in 0 of 9.
- **The scheduler:** habit only, plus a risk list of at most ten entries; keep readiness and
  never self-report confidence. Two replays found the formula decides little and ranks the risky
  work late (legacy `.xls` 20th of 28). An unaided haiku also put the risky work last, and one
  paragraph of advice moved it forward.
- **Gates:** chosen per project. Robin signs outcomes in domain terms; the agent owns the checks,
  each tied to one outcome and shown failing once on a planted fault. No product-class profile
  until two projects share lines.
- **A resident model against a thin driver:** a thin driver is cheaper in tokens by the
  Economist's model. Robin's main reason for a model is that not every possibility has to be
  specified in advance; werkbank's driver growth is the price of specifying. A hybrid was
  proposed and is untested: the session's model calls one tool that runs until a decision is
  needed.
- **Format and language:** TOML stands (`research/file-formats.md`), more so if the tool is in
  Rust, which Robin leans to.
- **sampleTidy:** features in R first; no port slice before the R version has run over the full
  corpus and the benefit of a port is stated.

