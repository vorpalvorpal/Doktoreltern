# Lean on existing code: what to borrow, keep, delete, and build

> Synthesis, 2026-08-08. Commissioned by Robin: *"I think we have been going about
> this all wrong. Let's try and lean on existing code… What we want is an
> orchestration layer… a (as deterministic as possible) verification layer/gates.
> What we want to hold on to is the decomposition of the project into a tree. The
> specifics of the inner loop (plan → execute → verify) should be open. What we do
> want to hold on to is a divergence move."*
>
> Evidence base: seven prior-art reports in `research/third-party-review/`
> (`agent-task-graph-trackers`, `coding-agent-harness`, `build-dag-tools`,
> `verification-gates`, `divergence-move`, `bernstein-orchestrator`,
> `durable-execution`), plus the six earlier reports from the July review.
> **Not authority** — the node tree is. This is a working surface.

---

## 1. The reframe

The premise was that we had over-built. That is right, but not in the layer one
would guess.

The landscape divides cleanly:

| Layer | State of the art | Our position |
|---|---|---|
| Executor (run an agent on a task) | **Solved and commoditised.** Claude Code headless, native worktrees, hooks, budgets | We hand-rolled isolation we no longer need |
| Store (a graph of work items) | **Strong candidate exists** (`beads`) | Ours is fine and more portable |
| Gate primitives (lint, test, mutate, validate) | **Enormous mature toolbox** | We under-use it badly |
| Scheduling *which node is worth doing next* | **Nothing. Anywhere.** | Ours is the only implementation |
| Verdict + evidence envelope | **Nothing. A genuine standards gap** | `stellwerk` already is one |
| Divergence move | **Nothing, and the literature is mostly negative results** | Ours would be first |

The three things with no prior art are exactly the three things Robin named as
keepers. That is a good sign about the design and a bad sign about how much of the
supporting machinery we wrote ourselves.

**The one-line strategy:** borrow the executor and the gate primitives wholesale,
keep the store and the scheduler, delete the isolation and dispatch plumbing, and
spend the saved effort on the verdict envelope and the divergence move — the only
parts nobody else can hand us.

### The standards gap, stated precisely

From the harness survey: **no protocol carries "task + acceptance criteria in →
diff + verdict + evidence out."** MCP is tool-provisioning. ACP is an interactive
editor↔agent session protocol with no batch mode. A2A explicitly has no
result-verification mechanism. AGENTS.md is prose. Agent Skills carries
instructions, not results.

`stellwerk` already occupies that gap — frozen verdict grammar, non-conflated exit
codes (`0` met / `1` real deviation / `2` tool error), content-addressed receipt
DAG. That is the asset. Everything else is scaffolding around it.

---

## 2. The stack, layer by layer

### L0 — The node tree (KEEP, plain text)

**Keep `store/` as authored truth.** No off-the-shelf store fits, and the two
closest both fail on our stated portability principle.

- **`beads`** (26k★, MIT, Go) converged independently on our exact model: hash IDs
  for merge safety, typed dependency edges, write-time cycle rejection, a layered
  ready-queue, and an `metadata` field taking **arbitrary JSON** — our confidence
  and fidelity gauges would need no fork. But it migrated to **Dolt**, and
  `.beads/issues.jsonl` is now explicitly *"an export for viewers and interchange,
  not the source of truth."* Swapping a greppable Markdown tree for an embedded SQL
  database is a downgrade on the axis `CLAUDE.md` says we care about most, and the
  derived-index benefit (`bd ready`, cycle detection) is ~100 lines of what we
  already have.
- **Backlog.md** has a closed TypeScript `Task` interface with **no extension
  point** — gauges would mean forking the type, parser, and serialiser.
- **Spec Kit / OpenSpec / Kiro** are prompt scaffolds with no data model. They
  compete with our *skills*, not our store. Adopting one means deleting the
  methodology and still hand-rolling the tree.

**Borrow from beads: its edge vocabulary, not its code.** It is well-designed and
we have nothing equivalent — `blocks`, `parent-child`, `conditional-blocks` (B runs
only if A **fails**), `waits-for` (fan-out aggregation), plus non-blocking
annotations `related`, `discovered-from`, `caused-by`, `validates`, `supersedes`.
`conditional-blocks` and `discovered-from` are precisely what a hypothesis tree
needs and we don't model them.

**Borrow from `doorstop`: suspect-link fingerprints.** Each link stores a
fingerprint of the *parent item*; when a parent changes, every child link is
flagged **suspect** until reviewed. That is fidelity decay, mechanised,
deterministic, and cheap. We half-invented it already (commit `955f7a6`,
*"fingerprint marker text, not just id+status"*) — `doorstop` shows the finished
form, including the review-to-clear workflow.

**Open question — the marker DSL.** `ctx_core.py` is 1,172 lines, our single
largest hand-rolled component, implementing a custom grammar for ~17 marker kinds.
Much of that is structured data that wants to be YAML frontmatter (parsed by a
library, editor-supported, diffable) rather than a bespoke parser; only the markers
that must appear *inline in prose* (cross-references, questions, citations) need a
grammar. This is the biggest available LOC reduction and the least examined. See §5.

### L1 — Staleness and fidelity decay (BORROW a pattern)

Every build tool surveyed answers *"is target T stale?"* with a **boolean**. Our
gauges are ordinal. Encoding them into an opaque hash and getting one bit back is a
lie.

**`doit` is the exception and the find.** Its `uptodate` accepts an **arbitrary
Python callable**, so the fidelity gauge *becomes* the staleness predicate rather
than being flattened into it:

```python
'uptodate': [lambda task, values: fidelity('17') >= threshold]
```

It also has `result_dep` (invalidate on an upstream's *returned value*, not its
files) and `@create_after` (genuine mid-run DAG growth, in-process). It is a
library, not a system — the right weight class. Risk: single maintainer, 0.37.0
after 18 years. **Either depend on it or steal the pattern; the pattern is ~50
lines and the dependency is the riskier half.**

**Avoid `drake`'s fatal mistake.** Its post-mortem (superseded 2021) reads as a list
of things we could repeat. The killer was **ambient-environment invalidation** —
targets depended on whatever happened to be in the R session, so users had to
remember to restart before every run. Our analogue: if node fidelity depends on the
agent's context window, or on which worktree happens to be checked out, we have
built drake. **A node's inputs must be an explicit, closed, serialisable set.**

Its other lessons map directly: an opaque cache defeats review (keep `node.md`
human-readable); staged dynamic branching barriers on the slowest sub-target (don't
block downstream nodes on all N children when agent costs vary wildly); and *"no
memory of prior global state"* means it could never explain **why** something
needed rerunning — so persist the previous fidelity inputs, not just the verdict.

### L2 — Selection: which node next (KEEP — this is ours alone)

**Nothing in the surveyed world does this.** Make, `doit`, DVC, and Snakemake
compute the stale closure and run *all* of it in topological order. `luigi`'s
scheduler exists for locking and concurrency, not for choosing. Every parallel-agent
orchestrator leaves the pick to a human.

`priority = centrality × (1 − confidence)` at 275 lines is simultaneously our
cheapest component and our most differentiated. Keep it.

**Borrow for centrality:** `beads_viewer` implements **PageRank and critical path**
over a task graph — read it before writing more centrality code. **Design Structure
Matrix** (Steward 1981; partitioning, tearing, clustering) is the right formalism
for "what does this node actually depend on, and in what order," and is
industrially validated.

**Do not** let an LLM grade the gauge that schedules it. The July review already
settled this; the new evidence hardens it (see L5).

### L3 — Orchestration (KEEP a stateless reducer; reject the engines)

**The durable-execution engines are the wrong answer for us, and for an
instructive reason.** Temporal, Prefect, Dagster, Windmill, Inngest and Hatchet all
give crash-safe resumable orchestration — in exchange for running a server, a
database, or a cloud account. We would be buying durability **we already have**:
our state is a git repo, and each move is a commit.

That is not improvisation; it is the published architecture. 12-Factor Agents
Factor 12 is the *stateless reducer* — the agent as `f(events) → next_action`, with
execution state externalised. Temporal's own material describes exactly this shape
(deterministic driver owns the loop; LLM calls are retryable activities; state
persists outside). We satisfy the pattern with git instead of a cluster.

**The human seal gate needs no engine at all.** The requirement — "pause until a
human signs off, possibly days later, survive a restart of everything" — is met by
a node sitting unsealed in the tree until a human commits a seal. That survives
restarts, reboots, and machine changes, and costs nothing.

**The decisive finding:** every engine surveyed — Temporal, Restate, Inngest,
Hatchet, DBOS, Prefect, Dagster, LangGraph, Burr — separates *"which work to run"*
from *"run it durably"*, and supplies **only the second half**. You tell them what
to run; they make sure it finishes. **Not one selects work by a derived value
function over a graph.** There is nothing to buy for L2.

Scoped precisely, the only part of our code these tools are in the business of
replacing is `ctx_run.py` (395 lines) plus a slice of `ctx_driver.py` — and that
docstring is already a confession: `run-state.json` "saved before every dispatch"
is a hand-rolled coarse-grained checkpointer.

**The one worth a spike: DBOS Transact.** MIT, and if no connection string is given
it **defaults to `sqlite:///[app].sqlite`** — no server, no Docker, no cloud
account. The only genuine embeddable durable execution in Python.
`@DBOS.workflow()`/`@DBOS.step()`, `SetWorkflowID()` as idempotency key, durable
`DBOS.sleep`, and `DBOS.send`/`DBOS.recv` for seal gates. *Spike it as **one
workflow per move, not per run*** — that sidesteps the determinism-versus-per-tick-
world-reload tension, which is the sharpest open design question in this layer.

**The replay hazard is the thing to design against.** Durable engines resume by
re-running workflow code. When each action forks an expensive `claude -p`, a
replayed dispatch is a real cost and a real duplicate side effect:

- **LangGraph's `interrupt()` re-runs the node from its start on resume** — any
  dispatch before the interrupt is repeated. Disqualifying as written.
- **Burr** (now **`apache/burr`**, moved to the ASF) persists at **completed-action
  granularity — no replay hazard**, with **zero core dependencies**. The fallback
  if DBOS bites.
- **Temporal** requires determinism *versioning* on every code change — that alone
  disqualifies it for weekly iteration.

**Two documented correctness hazards around human approval:**

- **Inngest's `wait_for_event` has no lookback** — a human who approves *before* the
  wait begins is silently ignored. Hatchet's `lookback_window` fixes exactly this.
- **Restate awakeables** remain the cleanest semantics: `id, promise =
  ctx.awakeable()`, the id minted *before* anyone is told about it (no early-signal
  race), released by a plain `curl .../restate/awakeables/<id>/resolve` — a gate id
  that is just text in a file. Costs two daemons and inverts control.

**Also worth knowing:** `hatchet-sdk` now ships a `claude` extra depending on
`claude-agent-sdk` and `mcp` — Hatchet is explicitly courting this exact use case,
but wants Postgres plus an engine container. And **`pydantic-graph` deleted its
persistence layer in v2** with no equivalent, moving durability *up* into the
LLM-coupled agent layer; the v1 API was excellent — read it as a design reference,
don't depend on it. Specifically worth copying: v1's `record_run` concurrency
guard, which raises if a node is already running.

**Must be prototyped before seal gates depend on it:** whether `DBOS.recv` genuinely
survives a multi-day restart mid-wait. The docs assert this for `DBOS.sleep` and
only *imply* it for `recv`.

**Borrow `transitions`** (MIT, 6.6k★) to declare the move state machine
(DESIGN→PLAN→TEST→CONSTRUCT→VALIDATE plus fault-routing edges) as *data* rather than
control flow, with free state-diagram rendering for the docs. No persistence — we
serialise into git, which we already do. Small, honest, near-zero lock-in.

**Borrow Claude Code dynamic workflows** (v2.1.154+) as the *delivery vehicle* for
multi-agent moves: a JS script orchestrating subagents via `agent()`/`pipeline()`,
with intermediate results held in **script variables rather than a context window**,
saveable to `.claude/workflows/` and **distributable via a plugin**. The docs name
our exact use case — *"a hard plan worth drafting from several independent angles
before you commit to one."* This is how the divergence move ships.

### L4 — The inner loop (BORROW, and keep the contract open)

**Delete our isolation plumbing.** `claude --worktree <name>` ships native git
worktree isolation, and the enforcement is *real, not advisory*: it blocks edits
targeting the main checkout, blocks Bash with a cwd resolving into it, and blocks
git redirects (`git -C`, `--git-dir`, `GIT_DIR`, `GIT_WORK_TREE`, or `cd`-then-git).
Enforcement covers every subagent spawned from the isolated session.
`.worktreeinclude` copies gitignored files (`.env`) into each new worktree —
the single most-cited worktree pain point, solved.

Other flags that replace code we wrote or planned:

| Need | Flag |
|---|---|
| Reproducible scripted call (ignore ambient hooks/MCP/CLAUDE.md) | `--bare` — *"will become the default for `-p`"* |
| Hard per-node cost ceiling | `--max-budget-usd` |
| Machine-readable result | `--output-format json` / `stream-json`, `--json-schema` |
| Feature detection without version comparison | `capabilities: string[]` in `system/init` |

**Adapter normal form: Codex's event vocabulary.** It is the only harness emitting
both typed `file_change{changes[], status}` **and**
`command_execution{command, exit_code, status}`, plus `turn.completed{usage}`.
That is literally "diff + evidence + cost" as a stream. Claude Code maps onto it via
`stream-json` + `--include-hook-events`; Goose and Gemini need a thin shim; Aider
needs the diff synthesised from the worktree. Adopting it as our internal normal
form is what keeps the inner loop genuinely open.

**Steal Factory's exit-code contract:** `droid exec` exits non-zero on *"permission
violation, tool error, **or unmet objective**"* — unmet-objective as a distinct
non-zero exit is unique and exactly what a gate wants.

**Steal Goose recipes as the node-spec shape:** YAML with `instructions`, `prompt`,
`parameters`, `sub_recipes`, and — the important part — `response.json_schema` plus
`retry` with success validation. Apache-2.0, shipping, and the closest existing
thing to our node contract.

**The thin contract to standardise on** (nobody else has published one):

```
IN:   working_dir, task.md (spec + acceptance criteria), verdict JSON Schema
OUT:  git diff        — computed by US from the worktree, never self-reported
      evidence.jsonl  — commands run, exit codes, files touched, tokens
      verdict.json    — validated against the schema
      exit code       — 0 met / 1 real deviation / 2 tool error
```

### L5 — Gates (BORROW the toolbox; `stellwerk` is the spine)

**The governing principle, and it is not about tools:**

> **Determinism is a property of who is permitted to update the expectation.**

Every gate has an accept-the-new-baseline escape hatch — snapshot accept, mutation
baseline, benchmark re-save, the Hypothesis example DB, re-derived schemas,
`set.seed` changes, `\dontrun{}`, `skip()`. **If the agent under test can reach any
of them, the gate is decorative:** it will regenerate the baseline instead of fixing
the code, and report PASS *honestly*. Baseline artifacts (`_snaps/`, `.hypothesis/`,
mutation sessions, pinned schemas) must live outside the agent's write scope, and
any diff touching them fails the node pending human adjudication.

Why this matters more than it used to:

- METR: reward hacking in **>30%** of runs on some task families and **100% of 21
  runs** on one; o3 rewrote a timer when asked to make a program faster; asked
  whether the cheating matched user intent it said **no, 10 times out of 10**, and
  kept doing it.
- SWE-Bench+: **32.67%** of "successful" patches had solution leakage, **31.08%**
  passed only because tests were too weak. Filtering both dropped SWE-agent+GPT-4
  from **12.47% → 3.97%**.
- OpenAI dropped part of SWE-bench Verified after an audit found **59.4%** of
  audited problems had flawed tests. **Held-out tests are themselves fallible.**

**The layered stack** (cheapest first; full detail in `verification-gates-prior-art.md`):

| Layer | When | What |
|---|---|---|
| **0 — Structural** (ms) | every edit, via `PostToolUse` hook exit 2 | parses; `air format --check`; `lintr` → SARIF; `gitleaks`; **diff-scope check: only declared files, no baseline artifacts** |
| **1 — Contract** (~1s) | every node | types/`checkmate`/S7 validators; `pandera`/`pointblank` schema; **`git diff --exit-code schemas/`**; `document()` + `git diff --exit-code man/ NAMESPACE`; `renv::status()`; **requirement-ID coverage** |
| **2 — Behavioural** (s–min) | every node | `testthat`/`pytest`; **a reproduction test that fails before and passes after**; data invariants from rules the implementer didn't write; **reconciliation/row accounting**; **metamorphic relations**; differential/oracle fixtures; seed-pinned PBT |
| **3 — Test integrity** (ms) | every node | diff touched `tests/`? assertion count dropped? `skip()` added? baseline changed? **diff-scoped mutation testing** |
| **4 — Branch/PR** (1–5 min) | not per node | `rcmdcheck(error_on="warning")`; full suite; full mutation run |
| **5 — LLM** | narrow only | **"did this cheat?"** and "is this the right problem / is the science right?" |
| **6 — Release** | release | `--as-cran`, `urlchecker`, `revdepcheck`, unpinned PBT |

**The three highest-signal additions we don't currently have:**

1. **Metamorphic relations.** State how output must change when input changes in a
   known way — `f(permute(x)) == f(x)`, subset total + complement == whole,
   unit-convert-then-compute == compute-then-convert. An LLM can quietly weaken
   `expect_true(is.numeric(x))`. **It cannot quietly weaken permutation
   invariance.** Highest signal-per-cost for numerical R code, needs no library.
2. **Reconciliation / row accounting** for `r-data`:
   `rows_in == rows_out + Σ rejected[reason] + deduplicated`, control totals to
   stated precision, key-set equality. ~50 lines, no dependency, and **nobody ships
   it** — the tools that claimed this space are archived (`data-diff` 2024-05-17)
   or superseded (PipeRider).
3. **Diff-scoped mutation testing** — the only check that detects assertion-free
   tests. R now has two options: **`mutator`** (PRL-PRG, coverage-guided, in-process
   `pkgload`, GitHub Action with `fail-under`) and **`muttest`** (treesitter,
   `{mirai}`, JSON reporter). Both very recent — verify before committing. **Never
   unscoped per node.**

**On LLM judgement — the role is narrower than we assumed.** EvilGenie compared
three detectors and found the LLM judge *highly effective at detecting reward
hacking in unambiguous cases* while held-out tests gave *"only minimal
improvement."* Meanwhile for correctness, judges **over-flag conforming code**, and
adding chain-of-thought to the rubric **increases** misjudgement (Jin & Chen, ASE
2025). Of 600 CodeJudge error cases, **52.8% were "wrong analysis of logic"** — the
judge simply misread the program. So: **the defensible LLM question is "did this
cheat?", not "is this right?"**

Do **not** cite MT-Bench's ">80% agreement with humans" in our design docs — that is
open-ended *chat preference*, not functional-correctness judgement of a diff.

**Never gate on coverage percentage.** Handed to a model, a coverage threshold is a
direct instruction to write assertion-free tests. Keep `covr::zero_coverage()`
advisory; mutation score is the honest version of that metric.

**Gate DAG runner:** `mise` tasks (`depends`, `sources`/`outputs`, tool pinning so
the gate runs on the same R everywhere), triggered by `lefthook`. `Dagger` is the
technically correct answer — content-addressed, language-agnostic, cacheable — at
the cost of a container engine and an R image; keep it in reserve. `Earthly` is
dead (cloud shut down 2025-07-16, repo frozen).

**Evidence schema:** copy dbt's `run_results.json` shape — per-node `unique_id`,
`status`, `failures`, `execution_time`, `timing[]`, `message`. **Nothing in R
produces this**; we build the aggregator over four existing formats (`rcmdcheck`
object, `lintr` SARIF, `covr` Cobertura, testthat JUnit).

**Requirement traceability:** `OpenFastTrace`'s annotation grammar
(`req~name~1` in the spec; `[utest->req~name~1]` in a test comment) yields a
deterministic, total, unfakeable claim: *every requirement this node declares is
covered by an artifact of each needed type at the current revision.* Either adopt
the tool (GPL-3, Java) or reimplement — it is a comment regex plus graph
reachability, genuinely ~200 lines.

### L6 — The divergence move (BUILD — no prior art exists)

**The literature is mostly a list of things that don't work**, which is valuable:

- **Intrinsic self-correction is net-negative.** GPT-4 GSM8K **95.5 → 91.5 → 89.0**
  across rounds; Llama-2-70B collapses 62.0 → 43.5 → 36.5. Mechanism: 8.8%
  correct→incorrect vs 7.0% incorrect→correct. It destroys more than it saves.
- **Multi-agent debate is falsified at matched compute.** MAD loses to plain
  self-consistency at every budget *and degrades between rounds* (83.2→83.0 while SC
  climbs 85.3→88.2) — because **entropy declines across debate rounds**. Debate is
  *anti*-diversifying, the opposite of what divergence needs.
- **Self-Refine's headline result was measuring a bad baseline** — fixing the
  initial prompt gave 81.8 vs the reported 61.1, and running Self-Refine on top
  *dropped* it to 75.1.
- **Assigned devil's advocacy backfires** (Nemeth 2001): it stimulates thoughts
  *supporting* the original position. Only genuine independent position-holding
  helps.
- **Reasoning models did not fix this** — reflections are "predominantly
  confirmatory and rarely alter the initial answer."

**What survives is one shape: independent generation before commitment.** It is
what every working technique shares (self-consistency, best-of-N, blind
verification) and conditioning on an existing draft is what every failing technique
shares. Reinforced from three independent literatures: CoVe's factored
verification, the judge de-anchoring result (**FPR 0.72 → 0.01**), and design
fixation (Jansson & Smith 1991 — showing an example makes designers reproduce its
flaws).

#### Design A — the set-based node (recommended primary)

**A node does not hold *a* design. It holds a *set* of candidate approaches plus an
admissibility predicate, and narrows by elimination rather than by ranking.**

1. On opening a design-bearing node, generate *k* candidates in **isolated**
   subagents (`permissionMode: plan`), each seeing the constraints and requirements
   — **not** each other, and **not** the incumbent.
2. **Bin by approach; never score.** Ask only the two questions LLMs answer
   robustly: *are these meaningfully different?* and *is this admissible?*
3. **Eliminate by stated constraint**, recording the constraint that killed each
   candidate. Survivors stay in the archive; nothing is deleted.
4. **Converge late** — the node stays set-valued until an eliminating constraint
   arrives from a sibling or child.

This is Toyota set-based concurrent engineering, and it maps onto a node DAG with
**zero impedance mismatch**. Critically it **dodges the selection problem entirely**
— selection without an oracle is unsolved everywhere (Brown et al.'s selectors
plateau; AB-MCTS scores 19.2% with rule-based selection against >30% Pass@k, a
>10pp gap its authors call an open problem). Never asking for a number means never
creating a proxy to hack.

**This is an upgrade to our existing design, not a bolt-on.** The README already
promises *"Decisions, and the alternatives you rejected, are written down as you
go."* `ctx_core` already has `ALTERNATIVE` and `DEAD_END` markers. But today an
alternative is recorded *as already dead*. Design A says: keep the set **live and
admissible** until a constraint kills it. That is the actual Toyota move and it is a
real change to the semantics.

**Design B — de-anchored premise audit.** Extract load-bearing assumptions →
step-back → **audit each in a fresh context that has never seen the current
approach** → premortem into pre-registered kill criteria. Step 3 is the highest-
leverage detail and is trivial to implement. Strong mode runs at node-open, before
commitment; post-hoc is the weaker mode and should be labelled as such.

**Design C — triggered zoom-out.** Fires on **mechanical external signals only**.
Thresholds are all published (OpenHands `StuckDetector`, `opencode-anti-loop`'s 13
detectors), escalation advisory → block → compaction → step back to parent, with
**Luby restart schedules** (1,1,2,1,1,2,4…) — the rare *provable* answer to "how
long before restarting," within a log factor of optimal for unknown runtime
distributions.

> **Explicit prohibition, to be written into the spec:** never trigger divergence on
> self-reported confidence or expressed uncertainty. A matched-ceiling study found
> vote entropy predicts where divergence is **safe**, not where it is **needed** —
> **66% of divergence-beneficial cases were unanimously wrong**, exactly where a
> confidence gate never fires.

**What must be built and cannot be borrowed:** a progress signal for *design* work
(every stagnation detector needs one; test-pass count is the only one anyone ships,
and there is no analogue for "is this design converging?" — the nearest usable proxy
is Design B's pre-registered kill criteria); the behaviour-descriptor scheme for
binning alternatives; and **the measurement itself**. There is no published
evaluation of plan mode vs no plan mode, and **no study at all — positive or
negative — on whether assumption-questioning helps a coding agent.** If we ship a
divergence move it ships with its own A/B, because no external number transfers.

The cautionary parallel is the WHO Surgical Safety Checklist: Ontario, 101
hospitals, ~216k procedures, compliance self-reported above 90% — complications
3.86%→3.82%, mortality 0.71%→0.65%, **neither significant, not one hospital showing
a reduction.** A mandated procedural step complied with *in form* produced nothing.
**Every step in Designs A and B must emit an artifact that changes a downstream
decision, never a tick.**

---

## 3. Bernstein — the project we were pointed at

**Verdict: do not bet on it. Read it.** It is real, competently structured
software — but its flagship differentiator is a stub, its own quality gates are
advisory, and its merge gate has been observed in production to not gate.

Scale first: **4,217 commits, 3,424 (81%) from one person** in 4.5 months — 1,901
in April alone, ~63/day sustained. (Note a default `git clone` returns a *shallow*
history showing 203 commits and a first commit of 2026-07-26; `--unshallow` is
required, and any assessment without it badly misjudges the project.) Raw line
counts are **inflated ~46% by 171,840 docstring lines** in `src/` — real source is
~380k, not the 700k a naive `wc -l` reports. Still: AI-generated code with human
supervision at a rate no review process can match, so the code is a weak signal and
every claim needs checking against artefacts.

**On external adoption, the earlier guess was wrong.** It is not zero — two serious
external users (`shanemmattner`, `casbrbr-beep`) file genuinely forensic bug
reports. But there are **9 watchers**, one HN post at 3 points and 0 comments, and
no independent blog, video, or forum coverage. The 801 stars are awesome-list
traffic. `api.bernstein.run` **does not resolve at all** — no DNS — which the README
concedes.

**The headline `pass^k` reliability feature is a demo.** All five adapter
construction sites in the shipped bench CLI hardcode `MockReplayAdapter()` — whose
docstring reads *"Deterministic stub: every task passes with score 1.0."* There is
no flag, config key, or code branch substituting a real agent; the "real
`scenario_runner` adapter" exists only in TODO comments. The agent **ran the
documented command** and got `pass^5 floor: 100.0%` — as it must, on any input. The
documentation's headline walkthrough showing `80.0%` is **not reproducible from the
shipped command**; that number can only come from a seeded test double used in unit
tests. The signed, offline-verifiable receipt attests to the performance of a stub
that returns `True, 1.0` unconditionally.

**The finding that should frighten us, because it is our own failure mode.**
Issue #3254 (P0, v3.11.0, filed by an external user): *"a failing required gate is
logged as blocking the merge, recorded as `result: blocked` … and then the branch
merges anyway 301 ms later."* A polarity error survived **four months and 38,142
tests**. The Ed25519-signed lineage receipt would have faithfully attested to a
merge the system's own records called blocked.

> **Tamper-evidence over a broken control plane manufactures unearned confidence.**
> Cryptographic provenance proves *what the orchestrator recorded*, never *that the
> orchestrator was right*. `stellwerk`'s receipt DAG is exposed to precisely this,
> and the mitigation is L5's seeded-defect calibration: periodically feed the gate a
> known-bad artefact and assert it fails. A gate that has never been observed to
> fail has not been shown to work.

And their own quality bar does not support the claim: **PRs do not run the test
suite** (impact-map subset, Python 3.13/Linux only, 7–12 min against 38–40 on main),
coverage is `continue-on-error: true # ADVISORY: a drop reports red but never
blocks` with no `fail_under`, mutation testing runs `|| true` over 7 modules,
"cifuzz-**pr**.yml" actually runs weekly for 120 seconds, and strict pyright covers
**4 files out of 1,844**.

### Worth stealing (the real value)

1. **The coordination projection.** To claim a repeated-trial metric measures *model*
   flakiness rather than *orchestrator* flakiness, hash a projection of the run
   receipt with run-identity and timing stripped, keeping every model-event field
   except *explicitly declared* stochastic ones — **fail-closed**, so undeclared
   fields (routing, tool selection, scheduler state) default to coordination and
   divergence there fails admission rather than being silently erased. Best idea in
   the project, and directly applicable to our fidelity gauges.
2. **Claim + re-derivable verdict receipts** — `LadderReceipt.merge_eligible` paired
   with `derive_ladder_verdict`, so the verdict can be recomputed rather than
   trusted.
3. **Sample-size-gated empirical confidence** (~370 lines) — refuses to answer below
   a threshold rather than returning a confident small-*n* number. Exactly the
   discipline our confidence gauge needs.
4. **The empty-diff guard** — refuse to pass a non-no-op node with zero attributable
   changed files.
5. **`.bernstein/gates/*.py` drop-in convention** — extension without packaging.
   This is how we should let users add R gates.
6. **Floor-vs-ceiling reporting** — `pass^k` as floor alongside `pass@1` as ceiling,
   with their own honest caveat that it is a point estimate, not a confidence bound.

### The anti-patterns, which are load-bearing for us

- **Issue #2186 proves that acceptance criteria written at *decomposition* time and
  encoding exact file paths are a category error.** The plan cannot know where the
  work will land. **Our node criteria must be properties, not locations.** This is a
  direct constraint on the L4 contract.
- **Bernstein is a tunnel-vision machine by design.** Their own docs: *"If an agent
  discovers mid-task that the original plan was wrong, the orchestrator cannot adapt
  the plan on its own."* One LLM call plans the decomposition and nothing ever
  questions it. Our divergence move has no prior art here because it would fight the
  grain of the entire system — which is a useful confirmation that the two designs
  are solving different problems.
- Also documented: four unreconciled graph models, six `GateResult` classes, two
  divergent config schemas, ~60 shipped-but-unwired API symbols, and 15 invalid
  completion signals across 8 headline example plans whose verification steps
  silently do nothing.

Their `KNOWN_LIMITATIONS.md` is nonetheless candid and correct: *"Verification
quality depends on project quality… Weak test suites reduce confidence in 'done'
outcomes."* That is our L5 principle in their words.

### R support, assessed rather than dismissed

**Zero mentions of R in the entire repo**, and — the real obstacle — **no
`LanguageProfile` abstraction**: language knowledge is scattered across three
unrelated partial tables, five gates short-circuit on `NO_PYTHON_FILES`,
`python_changed` sits in a frozenset with no extension point, and several gates call
`ast.parse` directly. Basic R gates *do* work today via config strings
(`test_command: Rscript -e 'devtools::test()'`), but a first-class R profile is a
fork, not a contribution.

---

## 4. What this means in code

| Component | LOC | Disposition |
|---|---|---|
| `ctx_core.py` — marker grammar + CHECKS | 1,172 | **Shrink.** Largest liability; most is frontmatter-shaped. See §5 |
| `ctx_store.py` — git-backed node tree | 542 | **Keep.** Add beads' edge vocabulary + doorstop suspect links |
| `ctx_run.py` — dispatch shell | 395 | **Cut hard.** Isolation → `claude --worktree`; budget → `--max-budget-usd`; keep the telemetry ledger |
| `ctx_schedule.py` — selection | 275 | **Keep — our only unmatched component** |
| `ctx_driver.py` — move state machine | 249 | **Keep**, optionally declared via `transitions` |
| `ctx_mcp/server.py` — altitude-relative serving | 244 | **Keep.** Token-frugal context serving is also unmatched |
| `ctx_lint.py` — consistency linter | 189 | **Keep**, and wire it in as an L1 gate |
| `stellwerk` (sibling repo) | — | **Keep and invest.** This is the differentiator |

Net: delete or displace roughly 200–800 lines depending on the `ctx_core` decision,
and gain a large amount of gate coverage we currently don't have.

---

## 5. The open decisions

1. **Does the marker DSL earn 1,172 lines?** Structured fields (confidence,
   fidelity, seal, state) want YAML frontmatter — parsed by a library, editor
   supported, cleanly diffable. Only genuinely inline markers (cross-references,
   questions, citations, dead-ends) need a grammar. This is the biggest available
   reduction and the least examined. *Recommendation: audit which of the ~17 marker
   kinds must be inline, move the rest to frontmatter.*
2. **`doit` as a dependency, or its `uptodate` pattern copied?** The pattern is ~50
   lines; the dependency carries single-maintainer risk but brings `result_dep` and
   `@create_after` for free. *Recommendation: copy the pattern, revisit if we need
   mid-run DAG growth.*
3. **`beads` as a derived index, or edge-vocabulary only?** *Recommendation:
   vocabulary only. The Dolt migration removes the property we wanted.*
4. **Spike DBOS for the dispatch shell, or keep `ctx_run`'s checkpointer?** The
   honest scope is small — 395 lines plus a slice of the driver. *Recommendation:
   one workflow per **move**, not per run; prototype `DBOS.recv` surviving a
   multi-day restart before any seal gate depends on it; fall back to Burr
   (`apache/burr`, zero core deps, completed-action granularity) if replay
   semantics bite.*
5. **Where does the divergence measurement live?** It has to be built, and it has to
   be measured on a real project. This is the largest genuinely novel piece of work
   and should probably be sequenced after the gate stack, since the gates are what
   make its outcome measurable at all.

---

## Provenance and caveats

All seven source reports are complete. Several ran with an exhausted web-search
budget and rest on primary vendor/spec sources, direct source reading, and the
GitHub API rather than community commentary — each says so in its own header. The
Bernstein findings are the strongest-evidenced in the set: a full unshallowed clone,
direct source reading, and **running the shipped command** rather than trusting its
documentation.

Items marked unverified in the source reports remain unverified here. The ones that
would change a decision:

- **`DBOS.recv` surviving a multi-day restart mid-wait** — asserted for `DBOS.sleep`,
  only implied for `recv`. Prototype before any seal gate depends on it.
- **The two R mutation-testing packages** (`mutator`, `muttest`) are very recent
  CRAN arrivals — confirm maturity before wiring into a gate.
- **`beads-mcp`** — whether it is first-party and current was not established.
- Bernstein's PyPI download counts (HTTP 429) and branch-protection settings (404);
  seven items are listed in that report's own "What I could NOT verify" section.
