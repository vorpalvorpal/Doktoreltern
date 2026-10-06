# Green Hat appendix: prior art, werkbank's record on the flow, and two alternative flows

Companion to `green-hat.md`. Part A is a prior-art search run by one sonnet sub-agent on 6 Oct 2026
(web search and page reads); part B is my own reading of werkbank's record; part C sets out the
alternative flows in full; part D is prior art on the checkpoint format. Labels: FETCHED = the
sub-agent read the page; SNIPPET = search result only; KNOWLEDGE = from model memory, not
confirmed; LOCAL = already in werkbank's own research files, which I read.

## Part A. Prior art: how others structure agent-run builds, what they measured, what failed

Sub-agent cost: about 103k tokens (sonnet), 37 tool calls. Not reached: OpenAI's harness post itself
(HTTP 403; a third-party summary was read), BMAD, Tessl's docs, Anthropic's context-engineering
post, the Gherkin, MADR, StrictDoc and OpenFastTrace pages. The page reader answers through a
small model, so figures are as it reported them. "No measurement" is itself a finding: most of this
field is company-reported or single cases.

| # | Source | How the work is structured | The evidence | The lesson for Leitstand | Read? |
|---|---|---|---|---|---|
| A1 | Böckeler, "Understanding spec-driven development: Kiro, spec-kit, Tessl", martinfowler.com, 2025. https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html | Kiro: requirements, design, tasks. spec-kit: constitution, specify, plan, tasks. Tessl: one spec per code file, code regenerated | Hands-on trials, not controlled. Kiro produced 4 user stories and 16 acceptance criteria for a small bug fix; spec-kit produced 8 files for one feature, repetitive with each other and the code; reviewing them was harder than reviewing code; the agent ignored the specs and duplicated existing classes | The spec-then-plan-then-tasks cascade is the draft's phases 1 and 2. Its recorded faults are review burden on the human and agents not following the documents. Size the ceremony to the job, and check plan adherence mechanically, not by a later reader. | FETCHED |
| A2 | GitHub spec-kit, `spec-driven.md`, 2025. https://github.com/github/spec-kit/blob/main/spec-driven.md | Constitution of nine articles; `[NEEDS CLARIFICATION: ...]` markers that must be gone before a spec is done; `tasks.md` with T001 ids and a `[P]` parallel mark; tests ordered contract, integration, end to end, unit, then source | Claimed, not measured | Two things worth taking: an explicit marker for "the spec is silent here" (see B1), and tests ordered from the outside in, contract and end-to-end first. | FETCHED |
| A3 | OpenSpec README, 2025-26. https://github.com/Fission-AI/OpenSpec | One folder per change: proposal, delta specs (ADDED / MODIFIED / REMOVED), design, tasks; an archive step folds the delta into the specs | Claimed, not measured. Positions itself against spec-kit as "heavyweight" with "rigid phase gates" | A spec change as a reviewable delta against current state is the shape §5.6 and §4.2's stale-cut rule need: review and re-hydrate the delta, not the document. | FETCHED |
| A4 | AWS Kiro, 2025. https://kiro.dev/blog/general-availability/ | Requirements in EARS sentences ("when X, the system shall Y"); properties extracted from the spec and run as property-based tests | Claimed, not measured | Prose requirements in a fixed sentence pattern are lintable without becoming a language, and spec-to-property is a shipped feature elsewhere. | SNIPPET |
| A5 | Anthropic, "Effective harnesses for long-running agents", 2025. https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents | An initialiser session writes the environment script, a progress file and a JSON feature list (over 200 features in the example); every later session does one feature end to end, commits, updates the file. Verification is by driving the running application | Qualitative. Four named failures: declaring victory early, leaving undocumented broken state, marking features done without testing them, time lost re-orienting. Without the browser tool the agent failed end-to-end checks | The best-documented long-run harness from the model's maker works feature by feature against a running whole, with state in files. It has no package layer, no per-file units and no audit rounds. Its failures are the ones G2 (attested done) targets. | FETCHED |
| A6 | Anthropic, "Harness design for long-running application development", 2026. https://www.anthropic.com/engineering/harness-design-long-running-apps | Planner, generator, evaluator; the evaluator drives the application; a "sprint contract" agreed before each sprint defines done | One case: solo agent 20 min, $9, not working; full harness 6 h, $200, working. The evaluator caught stubbed features and broken tools the generator missed | An evaluator that runs the product beats one that reads it. The cost ratio, 22 times, is the only like-for-like figure found for a harness against a plain agent, and it is one case. (From memory, unconfirmed: the post also reports removing parts of the harness as models improved.) | FETCHED |
| A7 | Carlini, Anthropic, "Building a C compiler with a team of parallel Claudes", 2026. https://www.anthropic.com/engineering/building-c-compiler | 16 parallel sessions, task locks as files in git, specialist roles; test suites as the oracle, and GCC as a known-good oracle to split failures | About $20k, nearly 2,000 sessions, a 100k-line compiler, 99% on compiler test suites. All agents hit the same bug until the GCC oracle let them split it; frequent regressions | A differential oracle (a real tool to compare with) is what made a large autonomous build tractable. For a DuckDB pipeline the oracle is at hand: the same transformation written as SQL in DuckDB. | FETCHED |
| A8 | OpenAI, "Harness engineering", 2026 (summary at https://rywalker.com/research/openai-harness) | Custom linters, structural tests of the layering, documents as the system of record, recurring clean-up agents, agent-to-agent review | Company-reported: about 1M lines, 1,500 merged changes, 3 to 7 engineers, 5 months. The summary notes survivorship bias and no account of what failed | Architecture rules as tests and lints whose messages tell the model how to fix; a standing clean-up pass. Nothing here is test-first per unit. | SNIPPET |
| A9 | Böckeler, "Harness engineering", martinfowler.com, 2026. https://martinfowler.com/articles/exploring-gen-ai/harness-engineering.html | Guides (before) against sensors (after); computational against inferential controls | No data. Concedes "we still have a lot to do to figure out good harnesses for functional behaviour" | Supports gates by hook. Also says the open problem is behaviour, which is where the draft leans on model audits. | FETCHED |
| A10 | Anthropic, "How we built our multi-agent research system", 2025. https://www.anthropic.com/engineering/multi-agent-research-system | Lead with parallel sub-agents | 90.2% better than a single agent on a research evaluation at about 15 times the tokens; the post says most coding tasks have fewer parallel parts | Fan out reading and reviewing, not building. | FETCHED |
| A11 | Cognition, "Don't build multi-agents", 2025. https://cognition.com/blog/dont-build-multi-agents | One linear agent with context compression; share whole traces | Qualitative; an example of parallel sub-agents making decisions that could not be merged | Every hand-over drops the implicit decisions of the previous role. Argues for fewer roles per unit and against splitting one behaviour across workers. | FETCHED |
| A12 | Cemri et al., "Why do multi-agent LLM systems fail?", 2025. https://arxiv.org/abs/2503.13657 | Taxonomy of 14 failure modes | 1,600+ annotated traces, 7 frameworks. Shares from werkbank's own notes: system design 44%, inter-agent misalignment 32%, task verification 24% | Three quarters of failures are in the orchestration and hand-overs, as werkbank found (52 of 55 patches). Count the hand-overs in a flow before adding one. | FETCHED (abstract); shares LOCAL |
| A13 | MetaGPT and ChatDev, 2023-24. https://arxiv.org/abs/2308.00352 | Role-played company pipelines | Rankings between the two contradict across studies; one analysis attributes 44% of MetaGPT failures to code inconsistent with the architect's file structure | A plan that names files is not followed reliably. In Rust the skeleton makes the structure a compiler fact. | SNIPPET |
| A14 | Lahiri et al., TiCoder, 2024. https://arxiv.org/abs/2404.10100 | The system proposes tests; the user accepts or rejects; accepted tests are the intent | Average absolute pass@1 gain of about 46 points within five user interactions; user study with 15 programmers | The highest-yield human touch measured anywhere in this table is a person marking a few concrete tests right or wrong. The draft has Robin sign prose instead. | FETCHED |
| A15 | Konstantinou et al., 2024. https://arxiv.org/html/2410.21136v1 | LLM-written assertions on 24 Java repositories | Accuracy drops 8-9 points when the code is buggy: the model encodes what the code does, not what it should | Supports a test writer who cannot see the body under test. Old model, one language. | FETCHED |
| A16 | Chen et al., "Rethinking the value of agent-generated tests", 2026. https://arxiv.org/abs/2602.07900 | Trajectories of six models on SWE-bench Verified | One model resolves 71.8% while writing tests in 0.6% of tasks, another 74.4% while writing them in 83%; agent tests are mostly print probes | Tests an agent writes for itself change cost more than outcome. The value of test-first is in who writes the tests and from what, which is a claim to measure (rung 2), not assume. | SNIPPET |
| A17 | UTBoost and SWE-ABS, 2025-26. https://arxiv.org/abs/2506.09289 , https://arxiv.org/abs/2603.00520 | Strengthened benchmark tests | 15.7% to 28.4% of "passing" patches were wrong; the top agent fell from 78.8% to 62.2% under stronger tests | A green suite passes a fifth or so of wrong code. Trust needs a signal from outside the suite: an end-to-end run, a differential oracle. | SNIPPET |
| A18 | Meta, mutation-guided test generation, 2025. https://arxiv.org/abs/2501.12862 | Generate targeted mutants, then tests that kill them | Engineers accepted 73% of generated tests | Supports diff mutation with survivors answered by tests, as drafted. | SNIPPET; LOCAL |
| A19 | Anthropic, agentic property-based testing, 2025. https://arxiv.org/abs/2510.09907 | An agent infers properties from code and docs, writes property tests, reflects before reporting | 100 packages: 56% of bug reports valid; 86% for the top-scored 21 | The draft's 56%. Ranking reports by a score raised validity to 86%, which is a cheaper filter than a ruling. | SNIPPET |
| A20 | METR randomised trial, 2025. https://arxiv.org/abs/2507.09089 | 16 experienced developers, 246 tasks | Predicted 24% faster, measured 19% slower | Felt speed is not measured speed. A baseline run is the only way to know whether Leitstand pays. | FETCHED |
| A21 | Huntley's "Ralph" loop, 2025. https://agentpatterns.ai/loop-engineering/ralph-wiggum-loop/ | A fresh process each iteration loads the spec and a plan file, does one task, tests, commits, exits | Claimed, not measured | The reset in its plainest form, in wide use: one task per fresh context, plan file as memory. The draft's reset is this plus a live terminal. | SNIPPET |
| A22 | Beck, "Augmented coding", 2025. https://newsletter.pragmaticengineer.com/p/tdd-ai-agents-and-coding-with-kent | Test-driven work with an agent | One practitioner's account: the agent deletes or edits a failing test to pass | Supports G1 (the implementer cannot write tests). | SNIPPET |
| A23 | ImpossibleBench, 2025. https://arxiv.org/abs/2510.20270 | Tasks whose tests conflict with the spec | werkbank's notes give 54-76% cheating, under 1% with tests out of reach | As A22. | FETCHED (abstract); figures LOCAL |

**Patterns across the table.** (1) Where a long autonomous build worked, a test suite or a real tool
run by machine carried it (A5, A6, A7, A8). (2) The unit of work in every long-run harness found is
one feature end to end against a running whole (A5, A6, A21); none uses per-file units or a package
layer. (3) State is files and git (A5, A7, A21). (4) An evaluator that runs the product beats one
that reads it (A5, A6). (5) Heavy upfront documents are the most criticised part of spec-driven
tools (A1, A3). (6) Nearly nothing is measured: one 22-times cost ratio on one case (A6), and
company totals.

**Where sources disagree.** Parallel teams (A7, A10) against a single line (A11, and A10's own
caveat on coding). Whether agent-written tests help at all (A14 and A15 against A16). How heavy the
plan should be (A2 and A4 against A1 and A3).


## Part B. What werkbank's own record says its flow got wrong

Each row is a fact I read in the primary file named, and what it says about the flow in draft §5.

| # | Fact (source) | What it says about the flow |
|---|---|---|
| B1 | 14 of the 24 test-able real phase-7 finds ended in a spec or plan edit; five cited no criterion that required the behaviour as written; a literal read of the cited clause would have lost find 280 (`v8.3-plan/research/spike-exec-findings.md:12-13, 46-62`) | The spec is not finished when it is signed. More than half of real code finds were the spec being discovered. A flow whose only route for "the spec is silent" is a question that parks a package for Robin will stop often, or the orchestrator will quietly decide and the spec will stop being the reference. |
| B2 | Of 27 real finds: 10 unsampled inputs, 3 disagreements with the real tool the code re-implements, 3 named failure shapes, 3 partial failure or lifecycle, 3 seam or drift (`V8.3-SCOPING.md:69-80`). 8.3 answered with declared criterion classes: `inputs` (owes a property test), `mirrors` (owes a differential test against the real tool), failure shapes, lifecycle, seam (`V8.3-SCOPING.md:281-288`) | 19 or more of 27 finds are predictable from the kind of requirement. The draft's spec item has four kinds (behaviour, interface, numeric, non-functional) and none of these. The lesson was paid for and is not carried over. |
| B3 | Every product seam bug in the record has both sides in one package (`v8.3-plan/reviews/seams/00-evidence.md:14-16`). The seam tests that missed them fed hand-built values the real producer never emits (F-149, F-155, F-156; F-397 escaped to phase 7 at $17-18 because SEAM-40 tested hand-built ids). 6 of 6 real phase-5 seam finds came from a model reading, none from the static check, which was false-clean (F-104) | The draft defines a seam as an edge between units in different packages (§12), which excludes every seam bug werkbank recorded. It has the consumer's writer write the seam test before the producer exists (§5.1), which can only use hand-built values: the recorded failure. 8.3's own answer was "the real-to-real test, red until both sides land". |
| B4 | F-220..223: a seam test owned by a later unit went red on an earlier unit's gate; 3 attempts, 2 escalations (`00-evidence.md` table). The same barrier bug came back three times (8.2.17, 8.2.28a, F-31/32; `V8.3-SCOPING.md:812-814`) | Layered units need ordering rules (barriers, direct edges, readiness). Those rules were 11 of 55 patch releases. The draft keeps the layering and so keeps the rules, now for the orchestrator to follow. |
| B5 | A blind design-review panel on stellwerk's phase-1 design hit 15 of the 26 later defects a design could show (7 direct), about 49% of their priced later cost, for 893k tokens; 0 of 15 that a design could not show (`DECISION-LOG.md:1984-1996`) | Review of the design is the best-measured audit werkbank has. The draft spends its audit rounds on code (per unit, per package, per release) and cuts the plan review to two or three lenses. |
| B6 | Yield by audit step in run 3: phase-5 criteria sweep $10.86 per real find, flat for 6 rounds; phase-7 sonnet series $290 for 17 finds and 18 escalations; phase-6 haiku code audit 3 rounds, $7.31, 0 real; mutation 86 real test gaps under $1 each; self-check changed 9 of 100 outcomes (`werkbank-evidence.md:66`; auditor row 49) | Steps were added on belief and removed on measurement (the sonnet tier, the self-check, the haiku audit). Each removal cost releases. The draft again fixes its steps before any has been measured. |
| B7 | No baseline exists. I searched V8.3-SCOPING, DECISION-LOG, V3-SCOPING and both 8.3 Green Hat and Bar Raiser reviews for a run of the same job with a plain single agent, or with an off-the-shelf workflow, and found none (grep for "baseline", "single agent", "plain Claude", "without werkbank") | "Too slow or too dear" and "not trusted" are both comparisons, and nothing exists to compare with. |
| B8 | Phases 6 to 10 never ran live under 8.3; live canaries passed 0 of 13; the 8.3.9 canary stopped at 6/implement (`werkbank-evidence.md:8, 67`; `DECISION-LOG.md:2886`) | werkbank built eight phases' worth of machinery before any path ran end to end. The draft's build order reaches a real job at S4 of S6, after the audit machinery (S3). |
| B9 | Run 3 took 360 h; 194 h was the driver stopped while werkbank was patched (`V8.3-SCOPING.md:82-84`) | The largest single cost in the record is the tool being developed during the run. A flow that needs fewer rules loses less here; so does one proven on a toy before a real job. |
| B10 | The hand-run 8.3 build (Claude orchestrating sub-agents from a stage plan and an implementer brief) added about 14k source lines in a week at up to four releases a day; units cost 150-320k tokens and 15-60 min. Its 12 test-catchable finds: 9 siblings of tested behaviour, 3 from the orchestrator's own unbriefed fix lane (`werkbank-evidence.md:30, 57, 69`) | This is the only record of a light flow at speed. Its faults were specific (sibling sites, a skipped gate, an unbriefed fix lane) and each has a mechanical answer. It was not shown to need test audits or audit rounds. |
| B11 | "Structure only what is already structure ... Gherkin-style specs tend to become test code in disguise" (`V8.3-SCOPING.md:464-470`). Orphan-clause and id-existence checks adopted; declared lifecycles with a state-machine check planned for 8.4 (find 426) | werkbank already ruled on how far to structure a spec. The draft's lint list (ids, links, producers, cycles) omits the orphan check and the lifecycle check it had settled on. |
| B12 | TiCoder: pass@1 rose from 48% to 70% after one user answer accepting or rejecting a proposed test, and to 85% after five (`v8.3-plan/research/prior-art-tdd.md:60-66`, LOCAL). Its recorded lesson: "the cheapest high-value human touch is to accept or reject a few concrete tests before implementation" | Robin's one sign-off is on spec prose. The record's own prior art says a few concrete examples are the better thing to put in front of him. |
| B13 | Anthropic's multi-agent write-up, as summarised locally: multi-agent designs are "less effective for tightly interdependent tasks such as coding"; MAST: 44% of multi-agent failures are system design, 32% inter-agent misalignment (`prior-art-tdd.md:213-222, 314-322`, LOCAL) | Each hand-over in the per-unit loop (writer, test auditor, implementer, mutation, code auditor, fix implementer, fix reviewer: seven roles) is a place to fail. Fewer, larger units with fewer roles is the direction this evidence points. |
| B14 | Mutation score and coverage "no longer serve as reliable indicators" when the code under test may itself be buggy (`prior-art-tdd.md:350-357`, LOCAL); mutation pointed at 9 of 27 audit finds and could not see the 9 that were missing behaviour (D-032) | Mutation measures whether tests pin the code that exists. Missing behaviour is found from the spec side: examples, input classes, an end-to-end run. |

## Part C. Two alternative flows

### C1. Skeleton, then slices (the one I would build)

```
SPEC      items, each with its class (inputs / mirrors / failure shape / lifecycle / numeric)
          and 1-3 concrete examples as data
          Robin signs the items and marks about ten examples right or wrong        [the one stop]
             │
SKELETON  once per build: the cargo workspace, every crate, the public types, traits and
          signatures with todo!() bodies, and ONE end-to-end test on a tiny real input
          (file in, rows in DuckDB out). cargo check is green; the end-to-end test is red.
          Review: spec + skeleton, three or four lenses. This is the plan review.
             │
SLICE k   a behaviour (a small group of spec items) through every layer it touches
          a. tests: the slice's examples, plus what its item classes owe
             (writer sees the spec items and the signatures, not function bodies)
          b. code until T0 and T1 are green; T1 includes the end-to-end test and every
             earlier slice's tests
          c. mutation on the diff
          d. one fresh reviewer reads the slice's diff against its spec items;
             hand-back is failing tests, through intake
          reset. Only the next two or three slices are planned in detail; the list is
          re-ordered after each slice.
             │
EVERY ~5 SLICES AND AT THE END
          class pass (every-site tests for each find so far), a longer property and
          differential run, one whole-tree review, then the run review
```

Slice 1 is the thinnest path that turns the end-to-end test green. Small jobs (say under ten spec
items) skip the slice list: spec, skeleton, one slice.

**What changes against draft §5.**

| Draft | Here | Why |
|---|---|---|
| Unit = one file or tight group of files | Unit = one behaviour across files | Seam bugs lived inside packages, between files (B3). A slice has no internal seam to forget. |
| Interfaces declared in `plan.toml`, linted by `lst` | Interfaces are Rust signatures, checked by the compiler | The compiler is a stronger and free lint; a signature change shows every affected site. |
| Seam tests written by the consumer before the producer exists | The end-to-end test and each slice's tests drive real producer into real consumer | Hand-built values were the failure (B3). |
| Per-package plan drafts, panels, gestalt review, audit, before any code | One review of spec plus skeleton; detail planned two or three slices ahead | Plans went stale as the spec was discovered (B1); design review is the best-measured audit (B5). |
| Test audit as a separate step on every unit | A mechanical check that the tests cover what the item classes owe; a model test audit only where that check cannot decide | 19 of 27 finds were predictable from item class (B2). |
| Code audit rounds until dry, then package audit, then release audit | One reviewer per slice; one whole-tree review per five slices | Same-vendor rounds plateau in one or two; judging was 62% of spend. |
| Edges, readiness and barriers between units | Slices run one at a time by default | Parallelism was worth about 6% (draft §1.1); two cargo builds on 8 GB is itself unmeasured (S0-b). |

**Cost.** One more step (the skeleton), which I put at one opus session plus a small panel: perhaps
300-500k tokens by analogy with the 893k seven-lens panel. That figure is my estimate, not a
measurement. Slices are larger than file units, so each worker's context is larger and a failed
slice wastes more; the hand-build's units were already 150-320k tokens (B10). Parallel building is
mostly given up. Roles per unit fall from seven to four, and `lst` loses interface declarations,
producer checks and most edge handling.

**Risks specific to it.** A wrong skeleton is expensive: every slice inherits it. The review at the
skeleton is the answer, and a count of signature changes after slice 3 is the measure. The test
writer can no longer be fully blind, because code from earlier slices exists; showing it signatures
and rustdoc only (extracted mechanically) keeps the part of AgentCoder's result that matters, the
writer not seeing the body it is testing. A slice that touches many files needs a wider write scope,
so G1 refuses less.

**Evidence for it.** B1, B3, B4, B5, B13 above; Part A's entries on feature-at-a-time harnesses and
on stale upfront plans (cited by number in `green-hat.md`).

**What would change my mind.** (1) On a seeded-fault fixture, slice-sized workers leave more faults
than file-sized ones at equal tokens. (2) More than about one signature change per slice after
slice 3, which would mean the skeleton cannot be fixed early for this kind of job. (3) The
end-to-end test makes T1 longer than a few minutes even with a prebuilt DuckDB, in which case it
moves to every second or third slice. (4) A job with real independent parts and a machine that can
build two at once; then packages return as the unit of parallelism, each built this way.

### C2. The ladder: the smallest loop first, each further step earning its place

This is a build order as much as a flow, and it combines with C1.

```
rung 0   spec -> per slice: one implementer writes tests and code -> T0/T1 hooks -> diff mutation
rung 1   + a fresh reviewer on the diff, failing tests back through intake
rung 2   + a separate test writer who sees signatures only
rung 3   + item-class obligations checked mechanically
rung 4   + the skeleton review panel
rung 5   + a model test audit; + audit rounds; + package and release audits
```

Each rung is a switch in `flow.toml`. A rung is kept when, on a fixed small project with seeded
faults and seeded spec omissions (S0-d widened), it catches enough more to pay for its tokens. Rung
0 can be run before `lst` or the mod exists, with an off-the-shelf workflow, on a cut-down version
of the DuckDB job: that run is the baseline B7 says is missing.

**Cost.** The fixture and its seeded faults (S0-d already plans twenty), and one fixture run per
rung: with haiku or sonnet workers, hours of throttle each, not days. **Evidence.** B6 and B7; the
Part A entries on harness parts that stopped paying as models improved. **What would change my
mind.** If fixture results do not predict results on the real job (the canary's history, 0 of 13,
is a warning that small live runs can mislead), the ladder gives false comfort and the rungs must
be judged on S4 itself.

### C3. Options I looked at and would not build

| Option | Why not |
|---|---|
| All tests for a package before any code (werkbank's global phases) | 8.3 moved off it for cause: the wave problem and most readiness rules (`V8.3-SCOPING.md:772-776`). In Rust it also needs every signature first, which is the skeleton. |
| No separate test writer ever | AgentCoder's ablation is the strongest figure in the record (test accuracy 61% to 88%). I would test it at rung 2, not drop it. |
| A deterministic script for the inner loop (Claude Code's built-in Workflow tool: a JavaScript script that calls sub-agents with schema-checked returns and resumes from a journal) | Attractive: it would keep sub-agent chatter out of the orchestrator's context and give resume for free. But it is a route, not a refusal, so it breaks principle 5, and I verified only its reference text in my own session, not whether mods' hooks apply inside it or whether Robin's plan has it. Worth one line in §10 and a half-hour look. |
| Buying the state layer (beads or similar) | See Part D. The parts Leitstand needs are small; the dependency would churn like the skills do. Take the ideas. |

## Part D. Prior art on the checkpoint format

The draft's research files do not mention spec-kit, OpenSpec, Kiro, beads or any requirement-tracing
tool (grep of `successor-plan/research/`). What each suggests:

| Source | Shape | What to take | What to avoid | Read? |
|---|---|---|---|---|
| Doorstop, sphinx-needs (A-table sub-agent row 25; https://docs.rtems.org/docs/6.2/eng/req/tooling.html) | One requirement per YAML file in a tree, links between items, a validation command | Confirms one item per file with links is a known, workable shape. From memory, unconfirmed: Doorstop stores a fingerprint of the linked parent with each link, and a changed parent makes the link "suspect" until re-reviewed. | Doorstop is reported as no longer actively developed. Do not depend on it. | SNIPPET; fingerprint KNOWLEDGE |
| OpenSpec (A3) | A change is a folder holding a delta against the spec | Spec and plan changes as deltas: the panel reviews the delta, the reset re-submits only the delta | A second document tree that drifts if the archive step is skipped | FETCHED |
| spec-kit (A2) | `[NEEDS CLARIFICATION]` markers | A field on the item for "silent here", so the three-way read in B1 has somewhere to write | Eight files per feature (A1) | FETCHED |
| Kiro / EARS (A4) | Requirement sentences in a fixed pattern | A lint on the prose field: one trigger, one response, no "and" joining two behaviours | Acceptance criteria multiplying on small jobs (A1) | SNIPPET |
| Gherkin | Given / when / then with a step grammar | Examples as rows of data on the item | The step grammar: werkbank's own ruling is that it "becomes test code in disguise" (B11) | not read; LOCAL ruling |
| Decision records (MADR) | Context, options considered, decision, consequences | Keep "options rejected, one line each" with a decision field, or the same question gets re-decided after a reset | A separate log, which Robin has ruled out | KNOWLEDGE |
| beads (https://github.com/steveyegge/beads) | Issue graph with typed edges (blocks, duplicates, supersedes), `bd ready`, hash ids; Dolt storage with JSONL export | `lst next` is `bd ready`. Ids that do not collide across worktrees. A `duplicates` edge for findings | One writer in embedded mode; schema-mismatch errors; a `supersedes` edge, which werkbank's record warns against (auditor §5) | FETCHED |
| Anthropic long-run harness (A5) | One JSON feature list with a pass flag per feature, plus a progress file | The smallest state that has been shown to work over many sessions. A measure of how far §4.1 goes beyond it. | The agent marking features passed without testing: needs G2 | FETCHED |

**An example of the item I would want to read after a reset** (illustrative; the draft gives the
directory tree but no file, so no reader can yet judge whether the files can be worked from):

```toml
id = "S-012"
status = "signed"                     # draft | signed | amended-by-orchestrator | question
requirement = "When an input file is loaded twice, the target table holds each source row once."
class = ["lifecycle"]                 # owes: a re-run test; see B2
inputs = ["csv-file"]                 # owes: a property test over generated files
mirrors = "duckdb-sql"                # owes: a differential test against the SQL in `reference`
reference = "fixtures/S-012.sql"
silent_on = ["what happens when a source row changes between loads"]
decision = { text = "key is (source_id, loaded_date)", rejected = ["hash of whole row: breaks on column reorder"] }

[[example]]
given = "orders.csv with 3 rows, loaded twice"
then  = "table orders has 3 rows"
accepted_by = "robin"                 # one of the ten he marked
```

Checks this shape allows that §4.1's `lst lint` does not list: every item has an example; every
`inputs` item is cited by a property test and every `mirrors` item by a differential test; no item
is cited by nothing (orphan); a test cites the item's fingerprint, so an amended item makes its
tests and units suspect without anyone remembering to reopen them; `silent_on` entries are counted
and reported to Robin at the end; the output of `lst hydrate` at each level stays under a token
budget.

