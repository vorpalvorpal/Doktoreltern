# Bernstein — prior-art assessment

**Date:** 2026-08-08
**STATUS: COMPLETE**

**Provenance:** Findings derived from a full (unshallowed) clone of
`https://github.com/sipyourdrink-ltd/bernstein` at `main` = `f69e7f9` (2026-08-07),
plus the GitHub API, the HN Algolia API, PyPI, and web search. Findings come from
direct source reading and from running the tool, not from marketing copy. Sections
marked with quotes reproduce the repository's own text verbatim.

**Target under evaluation:** Bernstein — "Deterministic orchestrator for CLI coding
agents (Claude Code, Codex, Gemini CLI, +40 more)". Apache-2.0, Python,
site <https://bernstein.run>, docs <https://bernstein.readthedocs.io/>.

**Why we care:** we are building an orchestration + deterministic-verification layer
over AI coding agents, keeping (a) a tree/DAG decomposition into hypothesis nodes
carrying confidence + fidelity gauges, (b) an OPEN/pluggable inner loop
(plan→execute→verify), (c) a deliberate divergence move against tunnel vision.
Target projects are R packages and R data pipelines. R support is not required up
front — the question is how hard it would be to add.

---

## 0. Hard numbers (verified)

| Fact | Value | How verified |
|---|---|---|
| Stars | 801 | GitHub API `repos/sipyourdrink-ltd/bernstein` |
| Forks | 93 | same |
| Watchers (subscribers) | **9** | same (`subscribers_count`) |
| Open issues | 81 | same |
| Created | 2026-03-22 | same |
| Last push | 2026-08-07 | same |
| Repo size | 65,656 KB (~64 MB) | same |
| License | Apache-2.0 | same |
| **Total commits on main** | **4,217** | `git rev-list --count origin/main` after `--unshallow` |
| **Commits by the single author** | **3,424** (81%) | `git shortlog -sne`: `chernistry <sanderchernitsky@gmail.com>` 1858 + `chernistry <73943355+…>` 1013 + `Alex Chernysh <73943355+…>` 553 — all the same person |
| Bot commits | 254 renovate + 186 `bernstein[bot]` + 85 dependabot + 79 github-actions + 45 `bernstein-orchestrator[bot]` + 6 `auto-heal-fixup` = **655** | same |
| Largest external human contributor | Shane Mattner, **37 commits** | same |
| Next external humans | oldschoola 16, Be My Code 5, Brendan Boyd 5, then a long tail of 1–4 commit drive-bys | same |
| First commit | 2026-03-28 `feat: Bernstein v1.0.0` | `git log --reverse` |
| src/ Python files | **1,844** | `find src -name '*.py' | wc -l` |
| src/ lines of Python | **701,768** | `wc -l` |
| tests/ Python files | **2,513** | same method |
| tests/ lines of Python | **636,349** | same method |

Commits per month: 2026-03: 393 · 04: 1901 · 05: 931 · 06: 81 · 07: 801 · 08: 110.

**Interpretation.** 1,901 commits in a single month (April) by one person is roughly
63/day sustained. Combined with ~1.34 million lines of Python in four and a half
months, this is not human-authored code with AI assistance; it is AI-generated code
with human supervision, at a rate no review process can keep up with. That is not
automatically disqualifying — but it means the *code* is a weak signal and every
claim must be checked against artefacts, not prose.

The project dogfoods itself: `bernstein[bot]`, `bernstein-orchestrator[bot]` and
`auto-heal-fixup@bernstein.local` appear as commit authors, i.e. the orchestrator
commits to its own repo.

**Trap for future readers:** a default `git clone` of this repo returns a *shallow*
history (`.git/shallow` present, 203 commits, apparent first commit 2026-07-26).
You must `git fetch --unshallow` to see the real 4,217. Any assessment based on the
shallow clone will badly misjudge the project's age and authorship.

---

## 1. What it actually does

Self-description from the repo topic/description field:

> Deterministic orchestrator for CLI coding agents (Claude Code, Codex, Gemini CLI,
> +40 more). No model in the coordination loop, so parallel runs in per-task git
> worktrees replay byte-identically. Signed lineage plus an opt-in HMAC audit chain
> a reviewer checks offline, without rerunning it. Cluster mode, air-gap deploy.

README's four-stage model (`README.md`, "how it works"):

> 1. **Decompose**. The manager breaks your goal into tasks with roles, owned files,
>    and completion signals. One LLM call, then plain Python from there.
> 2. **Spawn**. Agents start in isolated git worktrees, one per coding task; an
>    artifact-mode task gets a plain working directory instead. Main branch stays clean.
> 3. **Verify**. The janitor checks concrete signals: tests pass, files exist, lint
>    clean, types correct.
> 4. **Merge**. Verified work lands in main. Failed tasks get retried or routed to a
>    different model.

Everyday CLI surface, quoted from `README.md`:

```bash
cd your-project
bernstein init                    # creates .sdd/ workspace + bernstein.yaml
bernstein -g "Add rate limiting"  # agents spawn, work in parallel, verify, exit
bernstein live                    # watch progress in the TUI dashboard
bernstein run plan.yaml           # multi-stage plan: skip LLM planning, execute directly
bernstein stop                    # graceful shutdown with drain
```

State lives in a `.sdd/` directory in the target project; config in `bernstein.yaml`.

### 1a. Unit of work

The unit is a **`Task`** — a plain mutable `@dataclass` (not pydantic) at
`src/bernstein/core/tasks/models.py:469`, with roughly **85 fields**. The
load-bearing ones:

```python
@dataclass
class Task:
    id: str
    title: str
    description: str
    role: str                     # which specialist role
    priority: int = 2
    scope: Scope = Scope.MEDIUM
    status: TaskStatus = TaskStatus.OPEN
    depends_on: list[str] = field(default_factory=list[str])
    parent_task_id: str | None = None
    completion_signals: list[CompletionSignal] = field(default_factory=list)
    owned_files: list[str] = field(default_factory=list[str])
    model: str | None = None      # manager routing hint: "opus", "sonnet", "haiku"
    effort: str | None = None     # "max", "high", "medium", "low"
    cli: str | None = None        # adapter override, per-step
    metadata: dict[str, Any] = field(default_factory=dict)
    tags: list[str] = field(default_factory=list[str])
    requires: list[str] = field(default_factory=list[str])   # capability addressing
    retry_count: int = 0
    max_retries: int = 3
    version: int = 1              # optimistic locking
```

`TaskStatus` is a wide state machine — `PLANNED, OPEN, CLAIMED, IN_PROGRESS, DONE,
CLOSED, FAILED, BLOCKED, WAITING_FOR_SUBTASKS, CANCELLED, ORPHANED, SUSPENDED,
PENDING_APPROVAL, ABANDONED, BLOCKED_BY_ABANDON, REFUSED` — with a legal-transition
table at `core/tasks/lifecycle.py:157`.

**A task carries free-form user metadata** (`metadata: dict[str, Any]`, plus `tags`
and `requires`) that round-trips through `to_dict`/`from_dict` and survives retries.
That is directly relevant to our "hypothesis nodes carrying gauges" — the field
exists. **But you cannot set it from a plan YAML step**: `_STEP_SCHEMA` in
`core/planning/plan_schema.py` has `"additionalProperties": False` and no
`metadata` key. You can set it from a `.sdd/backlog/*.yaml` ticket or the REST API
only.

### 1b. Concurrency and isolation — git worktrees, one per coding task

Confirmed as described. Each coding task gets its own git worktree under
`.sdd/worktrees/`; artifact-mode tasks (which complete on a signed lineage receipt
rather than a commit) get a plain working directory under `.sdd/workspaces/`.
Containers/microVMs are an **opt-in** sandbox layer on top (12 backends,
`core/sandbox/backends/`), not the default.

Concurrency is a cap, not a fixed pool: `max_agents` from config, dynamically
adjusted per tick by `AdaptiveParallelism.effective_max_agents()` (error rate + CPU),
then further capped by an SLO error budget and a cost dispatch gate.

There is also a **file-ownership conflict check** (`_check_file_ownership_overlap`)
that refuses to hand out a task whose `owned_files` overlap an in-flight task. That
is a nice, cheap, deterministic answer to concurrent-edit conflicts and worth stealing.

### 1c. State — files, not a database

Repo constraint, stated in its own `bernstein.yaml`: *"File-based state in `.sdd/`
only - no databases"*. Layout from `docs/architecture/state-persistence.md`:

| Path | Purpose |
|---|---|
| `.sdd/backlog/{open,claimed,closed,issues}/*.yaml` | task backlog, durable |
| `.sdd/runtime/tasks.jsonl` | the task store — **append-only JSONL with fsync**, replayed on boot |
| `.sdd/runtime/wal/<run-id>.wal.jsonl` | hash-chained WAL of every orchestrator decision |
| `.sdd/metrics/*.jsonl` | cost ledger, cascade reports, file-health scores |
| `.sdd/cas/{xx}/{sha256}` | content-addressed artifact blobs (mirrors git's object layout) |
| `.sdd/audit/merkle/seal-*.json` | tamper-evident audit-log seals |
| `.sdd/evidence/{bundles,blobs}`, `.sdd/quality/ladder`, `.sdd/lineage/<run_id>/` | verification evidence |
| `.sdd/worktrees/`, `.sdd/runtime/` | ephemeral |

The WAL entry is a two-phase intent/confirm record around every side effect, fsync
per entry, SHA-256 chained:

```python
@dataclass(frozen=True)
class WALEntry:
    seq: int; prev_hash: str; entry_hash: str; timestamp: float
    decision_type: str; inputs: dict[str, Any]; output: dict[str, Any]
    actor: str; committed: bool = True
```

**Important operational limit, self-documented** in the task store's docstring:

> Mutations are coordinated by an in-process `asyncio.Lock` and the JSONL append
> path does NOT take an OS-level file lock (no `fcntl.flock`). The store is
> therefore **single-process only** — running the server under
> `uvicorn --workers N` … interleaves appends, produces torn lines that
> `replay_jsonl` silently drops, and lets multiple workers claim the same
> top-priority task.

A boot guard (`preflight_multi_worker_guard`) refuses `workers>1`. Honest, but it
means the "cluster mode" story sits on a single-writer core.

---

## 2. What "deterministic" means here

**The precise claim** is narrow and, to the project's credit, stated narrowly:
*the coordination loop* contains no LLM. From `README.md`:

> Scheduling is plain Python - no LLM in the coordination loop - so runs are
> reproducible end to end.

> **No LLM in the coordination loop.** Scheduling is plain Python, so a run is
> reproducible end to end. Replay yesterday's plan and get yesterday's task graph.

Note the honest hedge buried in the "how it works" section: decomposition is
**"One LLM call, then plain Python from there."** So the *planning* step is not
deterministic; the *scheduling of an already-produced plan* is. The determinism
claim is about the orchestrator, never about the agents it drives.

The mechanism is a **replay journal + lineage spine + optional HMAC audit chain**,
with an Ed25519-signed run receipt. Quoted CLI from `README.md`:

```bash
BERNSTEIN_AUDIT=1 bernstein -g "fix the failing test in tests/test_foo.py"
bernstein replay list                 # run ids recorded on disk
bernstein replay latest --verify      # recompute the journal head, name the first divergent step
bernstein lineage verify <run_id>     # recompute the always-on lineage spine
bernstein audit verify                # HMAC chain + Merkle seal
bernstein verify run <run_id> --signing-key-path key.pem   # sign one portable run receipt
bernstein verify receipt .sdd/runs/<run_id>/run-receipt.json  # verify it offline: file only
```

The receipt binds journal head + lineage-spine head under one Ed25519 signature with
the public key embedded, exit `2` naming the first divergent step on tamper.

### 2a. The `pass^k` reliability floor — what it is and what backs it

Found and read in full at
`/…/bern/docs/eval/reliability.md`, implemented at
`src/bernstein/eval/bench/reliability.py`, tested at
`tests/unit/eval/bench/test_reliability.py`.

The claim, from `README.md`:

> `bernstein bench run <suite> --reliability k` … runs every task `k` times under
> fixed coordination and reports a `pass^k` floor (all `k` attempts must pass)
> alongside the `pass@1` ceiling, sealed in a signed receipt that
> `bernstein bench reliability-verify` recomputes offline — a fabricated floor fails
> verification.

**What it actually is:** a *metric definition plus a tamper-evidence protocol*, not a
measured result. Definitions from `docs/eval/reliability.md`:

| Metric | Definition | Role |
|---|---|---|
| `pass@1` | fraction of tasks where **at least one** of the `k` attempts passed | the ceiling |
| `pass^k` | fraction of tasks where **all** `k` attempts passed | the floor |

The genuinely interesting idea is the **coordination projection**: to claim that a
low `pass^k` measures *model* flakiness rather than *orchestrator* flakiness, they
hash a projection of each run receipt with `run_id`, `journal_head`, `spine_head`
and all timing fields stripped, and with model-output events keeping every field
*except* explicitly declared stochastic payload fields. Crucially it is fail-closed:

> Undeclared fields inside a model event — routing, tool selection, scheduler state —
> default to coordination (fail-closed), so divergence there fails admission instead
> of being silently erased.

Two attempts must have byte-identical projections or the floor is declared
inadmissible (`COORDINATION_DIVERGED`). `bernstein bench reliability-check` re-runs
one attempt and compares. That is a real, well-designed idea and the best thing in
the project.

**Is the number backed by any benchmark?** The docs are *unusually honest* about the
statistics — they explicitly disclaim it as a bound:

> The floor is a **point estimate, not a confidence bound**: with small `k`, a flaky
> task can still show a clean floor by luck. … "Floor" here means *floor relative to
> best-of-N reporting*, which the metric is by construction, not a statistical lower
> bound on `p`.

But the only concrete numbers shown anywhere are an **illustrative walkthrough**
against a `golden-v1` suite:

```
pass^5 floor : 80.0%  (all 5 attempts must pass)
pass@1       : 100.0%  (any attempt passed — the ceiling)
coordination : held fixed
```

and the Python API example uses `MockReplayAdapter` / `StubReliabilitySigner`.

### 2b. The `pass^k` feature cannot measure a real agent — verified empirically

This is the most important finding in the report.

**Every** adapter construction site in the shipped bench CLI hardcodes a mock.
`src/bernstein/eval/bench/bench_cli.py`, all five occurrences, identical:

```python
    # Production: swap MockReplayAdapter for the real scenario_runner adapter.
    adapter = MockReplayAdapter()
```

(lines 122–123, 172–173, 195–196, 287–288, 334–335). There is no CLI flag, no
config key, and no code branch that substitutes a real agent. The "real
`scenario_runner` adapter" the comment defers to exists only in comments and
docstrings; `grep -rn 'scenario_runner' src/` returns the five identical TODO
comments plus two docstrings, and no bench adapter implementation.

And the mock is not a neutral stub — from `src/bernstein/eval/bench/runner.py`:

```python
class MockReplayAdapter:
    """
    Deterministic stub: every task passes with score 1.0.
    """
    ...
    def score_task(self, task, receipt):
        return True, 1.0, {"note": "mock: all assertions satisfied"}
```

**I ran the exact documented command** using the repo's own virtualenv:

```
$ ./.venv/bin/bernstein bench run golden-v1 --reliability 5 --out /tmp/rel.json --stub-signer
Suite       : golden-v1
Suite hash  : 9c553f1f303ede1ef69131f3f9d2645dc7f32ac7b868b7b3108a410ac269fb97
Tasks       : 5

Running tasks x5 attempts (fixed coordination)…

pass^5 floor : 100.0%  (all 5 attempts must pass)
pass@1        : 100.0%  (any attempt passed — the ceiling)
coordination  : held fixed
Receipt hash  : 782d03b062910d89009ad77524beae3d7dcb52c4fa4361781cf0319218a5efd1
Signed by     : 64a774b39e44d119-stub
```

The shipped command **always returns 100%**, by construction, on any input. The
documentation's headline walkthrough output —

```
pass^5 floor : 80.0%  (all 5 attempts must pass)
pass@1       : 100.0%  (any attempt passed — the ceiling)
```

— is **not reproducible from the shipped command**. That 80% can only come from
`StochasticMockReplayAdapter`, a seeded test double used in the unit tests. The
docs present it in a "Walkthrough / 1. Run with a reliability budget" section as
though it were command output.

Also note the suite itself. `golden-v1` is **5 toy tasks**, 98 lines total
(`src/bernstein/eval/bench/golden_suite.py`): `file_io_read_write`,
`refactor_rename_symbol`, `test_generation_happy_path`, `lint_fix_unused_import`,
`doc_update_docstring`. Its own module docstring concedes the point and then
contradicts itself:

```python
"""
These tasks are a representative sample of the real golden task set.
They are intentionally hermetic: no network calls, no real adapters —
the mock adapter in ``runner.py`` can execute them.

In production, ``bernstein bench run golden-v1`` loads this suite,
runs each task via the real ``scenario_runner.py`` adapter, and emits
a signed :class:`SubmissionBundle`.
"""
```

The second paragraph is false as of `main` — that is exactly what the CLI does not do.

**Blunt verdict on `pass^k`:** the metric definition and the coordination-projection
tamper-evidence protocol are genuinely good ideas, carefully specified, and worth
stealing. The *feature* is a demo. It is a signed, offline-verifiable receipt
attesting to the performance of a stub that returns `True, 1.0` unconditionally.
There is **no benchmark, no measurement, and no third-party validation** of any real
coding agent's `pass^k` anywhere in the repo or docs. The cryptographic machinery
around the number is real; the number is vacuous. This is the clearest instance of
a repo-wide pattern: **elaborate verification apparatus wrapped around an
unimplemented core.**

Separately, real SWE-bench code does exist (`src/bernstein/benchmark/swe_bench.py`,
`SWEBenchRunner`, targeting `princeton-nlp/SWE-bench_Lite`, plus
`src/bernstein/evals/driver.py` for `swe-bench-pro` / `terminal-bench-2` /
`swe-rebench`) — but it is a *separate* subsystem from the `pass^k` bench, and I
found **no published results** from it. `src/bernstein/evals/__init__.py` even
concedes the target set is compromised: *"the now-deprecated ``SWE-bench Verified``
set (gold-patch leakage confirmed across all…)"*.

### 2c. Where the project is honest

`docs/reference/KNOWN_LIMITATIONS.md` is unusually candid and is the most useful
document in the repo. Notably:

> **5) Verification quality depends on project quality.** Bernstein's gates and
> janitor checks can only validate what your project exposes (tests, linters,
> static checks, completion signals). **Impact:** Weak test suites reduce confidence
> in "done" outcomes.

> **1) Adapter parity is not perfect.** … Stop/restart behavior, output shape,
> structured output support, and error handling can vary by adapter. …
> Prefer proven adapters (claude, codex, gemini) in production workflows.

> **7) Documentation lag.** Bernstein evolves quickly; some docs may lag short-term
> behind newly shipped features.

That last one is the project's own framing of what I found in §2b. I would call it
something stronger than lag.

### 2d. `WHY_DETERMINISTIC.md` — the best document, with one false claim

`docs/architecture/WHY_DETERMINISTIC.md` (224 lines) is the single most useful thing
in the repo and I recommend reading it in full regardless of what we decide. It
states the tick loop plainly, and — unusually — states the costs:

> **Ambiguity must be resolved before tasks enter the queue.** The scheduler cannot
> reason about whether "add tests for the auth module" means unit tests,
> integration tests, or both.

> **No dynamic re-planning during execution.** If an agent discovers mid-task that
> the original plan was wrong, the orchestrator cannot adapt the plan on its own.

**That second paragraph is the direct architectural clash with our divergence move,
stated by the author as a known cost.** Bernstein buys replayability by forbidding
mid-run re-planning. We want the opposite affordance.

Two things to be sceptical about.

**(i) The foundational evidence is one unpublished anecdote.** The whole design is
justified by a "rag_challenge" story — 12 agents, 737 tasks, 47 hours, "~3 of 12
agents did real work", "MUFFY BULLETIN messages 283 (138 were hunger spam)". The
doc appends, in italics:

> *Anecdote from a personal sprint. No raw data published.*

Credit for the disclaimer. But it means the architecture's stated empirical basis
is a single unreproducible personal story, presented in a metrics table.

**(ii) "The import graph enforces it" is false.** The doc claims:

> The `Orchestrator` class has no import of any LLM client. … This is not just a
> policy. The import graph enforces it.

`.importlinter` exists and **is** wired into CI (`ci.yml:466`, `uv run lint-imports`
— genuinely blocking). But it declares exactly three contracts:
`adapters-no-scheduler`, `core-no-cli`, `adapters-independent`. **None of them
mentions LLM clients**, and `grep -in 'llm' .importlinter` returns only the
adapter module name `bernstein.adapters.openai_agents`.

Meanwhile `src/bernstein/core/orchestration/manager.py:27` — a module *inside* the
orchestration package — does `from bernstein.core.llm import call_llm` and calls it
at 7 sites. The doc names `manager.py` as one of three sanctioned LLM leaf modules,
so the *substance* is defensible. But the enforcement claim is not: it is a
convention checked by grep, which is precisely what the document says it isn't.

And the "exactly three files" claim is loose — **16 files under `src/` call
`call_llm(`**, including `core/quality/janitor.py`, `core/quality/quality_gates.py`,
`core/communication/voting.py`, `core/planning/planner.py`,
`core/security/guardrails.py` and `core/config/upgrade_executor.py`. Most are
plausibly outside the *scheduling* path, but "grep for LLM usage and you find
exactly three files" is not what grep returns.

---

## 3. Task DAG / tree — a real DAG, but scheduled as a ready-set, and there are THREE of them

### 3a. Dependencies are real

`Task.depends_on: list[str]` (task IDs) plus `depends_on_repo` for cross-repo edges.
Cycles are detected by DFS at creation time and rejected with HTTP 422
(`core/tasks/task_store_core.py:1140`). Readiness is a simple predicate
(`:1168`): all `depends_on` IDs must be in `DONE ∪ CLOSED`.

**But there is no runtime topological sort.** The scheduler is a per-`(role, status)`
min-heap over priority, filtered by readiness (`claim_next`, `:1770`):

```python
pq = self._priority_queues.get((role, TaskStatus.OPEN))
while pq:
    priority, task_id = heapq.heappop(pq)
    ...
    if not self._dependencies_satisfied(candidate): blocked_entries.append(...); continue
    overlap_msg = self._check_file_ownership_overlap(candidate)
    if overlap_msg is not None: blocked_entries.append(...); continue
    task = candidate
    break
```

So: **eligible-set → priority heap → fan out to an adaptive concurrency cap.** That
is more than flat parallel fan-out (dependencies genuinely constrain ordering) and
less than DAG scheduling (no global ordering, no critical path, no lookahead).

Retry backoff is implemented by setting `created_at` into the future and letting the
tick filter `t.created_at <= now` do the waiting — a neat trick worth remembering.

### 3b. Hierarchical decomposition exists but is shallow

`parent_task_id`, `parent_context`, `TaskStatus.WAITING_FOR_SUBTASKS`,
`subtask_wait_started_at`, a `_by_parent` index with `count_subtasks()`, and
`_complete_parent_if_ready()`. `core/tasks/task_splitter.py` splits when
`estimated_minutes > 60` or the description exceeds 200 words, via an LLM
`TaskDecomposer.decompose_sync(task, min_subtasks=2, max_subtasks=5)`.

Subtasks are forced down-scope (`Scope.SMALL`, `estimated_minutes ≤ 60`), so the
tree stays shallow. Effective hierarchy: **plan → stage → step/task → subtasks**,
with `story_id` as a rollback grouping above. I found no explicit depth limit.

Note that in this repo's own `bernstein.yaml`, `auto_decompose: false` — the author
has the recursive-decomposition feature turned off on his own project.

### 3c. There are three unreconciled DAG models

This is a genuine architectural smell and a warning for us:

1. **`Task.depends_on`** — what the orchestrator actually schedules.
2. **`core/orchestration/task_dag.py`** — `TaskDag` / `TaskNode(task_id,
   description, parallel_safe, story_id, depends_on)` with a real
   `topological_iter_with_parallel()` yielding `frozenset` batches and a
   `TaskDagCycleError`. Reads markdown checkbox lists
   (`- [ ] [T001] [P] [US1] Add YAML loader … -> T002, T003`) or `tasks:` YAML.
   Powers `bernstein tasks plan --file` — a **preview/planning walker**, not the runtime.
3. **`core/workflows/workflow_spec.py`** — a separate pydantic mini-runner
   (`extra="forbid"`, `frozen=True`):

```python
class WorkflowNode(BaseModel):
    id: str
    depends_on: list[str] = Field(default_factory=list)
    command: str | None = None
    agent: str | None = None
    prompt: str | None = None
    loop: LoopSpec | None = None      # {until: bash predicate, max_iterations}
    fresh_context: bool = False
    interactive: bool = False
    timeout_seconds: int = ...
```

This one *does* run a proper topological DAG with concurrent layers. Its docs
concede: **"`interactive: true` is not implemented"**, "No per-node adapter/model
routing", "Bash-only loop predicates". Plus a **fourth**, legacy
`core/planning/workflow_dsl.py` with `phases:`/`nodes:` and guard conditions.

Four representations of "a graph of work", no shared type. If we take anything from
this, take the warning: pick one node model and make everything project onto it.

### 3d. Plan YAML: dependencies are stage-level only

A real shipped example, `examples/plans/auth-system.yaml`:

```yaml
name: "Authentication System Overhaul"
cli: auto
budget: "$18"
max_agents: 4
constraints:
  - "Passwords hashed with Argon2id (not bcrypt)"

stages:
  - name: "Infrastructure"
    steps:
      - title: "Implement JWT token service"
        role: backend
        scope: medium
        complexity: high
        files: ["src/auth/token_service.py"]
        completion_signals:
          - type: path_exists
            path: "src/auth/token_service.py"

  - name: "OAuth"
    depends_on: ["Infrastructure"]
    steps: ...
```

`depends_on` is on the **stage**, and the loader fans it out to every task in the
stage (`plan_loader.py:274`). **There is no per-step `depends_on`.** Steps within a
stage always run in parallel. For our tree/DAG-of-hypotheses model that is a
significant expressiveness gap — we would be writing a stage per node.

---

## 4. Verification and gates

### 4a. The success ladder — five stages, all must pass

`core/tasks/task_lifecycle.py:2673`:

```python
def _run_verification_gates(orch, task, session, result, janitor_passed):
    if janitor_passed:
        janitor_passed, qg_result = _run_quality_gates(orch, task, session, result)
    if janitor_passed:
        janitor_passed = _run_rule_enforcement(orch, task, session, result)
    if janitor_passed:
        janitor_passed = _run_cross_model_check(orch, task, session, result)
    if janitor_passed:
        janitor_passed = _run_formal_verification_gate(orch, task, session, result)
    return janitor_passed, qg_result
```

Janitor (completion signals) → quality gates → org rules → cross-model check →
formal verification. Only then does work merge. (Modulo issue #3254, where the
result of all of this was computed and then not honoured.)

### 4b. Completion signals — a CLOSED set of 10 types with a single string payload

`core/tasks/models.py:260`:

```python
@dataclass(frozen=True)
class CompletionSignal:
    type: Literal[
        "path_exists", "glob_exists", "test_passes", "file_contains",
        "llm_review", "llm_judge",
        "schema_valid", "criteria_match", "hash_stable",   # artifact-mode
        "figures_grounded",                                 # report bundles
    ]
    value: str  # path, glob, test command, search string, review instruction, …
```

Everything fails closed (`return False, f"unknown signal type: {signal.type}"`).
`verify_task()` returns `tuple[bool, list[str]]` — pass/fail plus failure
descriptions. On failure the janitor **auto-creates fix tasks**.

There is a good **empty-diff guard**: the janitor git-attributes the task's commits
and refuses to pass a non-no-op task with zero attributable changed files — *"catches
both the 0-file manager rubber-stamp and crash-recovery orphan auto-completions with
no diff."* Worth stealing verbatim; it is exactly the failure mode where an agent
claims done and did nothing.

**And here is another instance of the repo-wide pattern.** `type: command` with a
`run:` key is **not a valid signal type** and is silently dropped with a log
warning (`plan_loader.py:93`). It appears **15 times across 8 shipped example
plans** (`auth-system`, `graphql-migration`, `monorepo-feature`,
`cobol-modernization`, `microservice-extraction`, `tech-debt-sprint`,
`testing-overhaul`). **The verification steps in the project's own headline example
plans do nothing.** Including the `auth-system.yaml` I quoted above — its
`pytest tests/test_auth.py -x -q` signal is discarded at load time.

### 4c. Gates — a closed frozenset of 23 names; commands overridable, names not

`core/quality/gate_pipeline.py:16`:

```python
VALID_GATE_NAMES = frozenset({
    "auto_format", "lint", "type_check", "tests", "pii_scan", "dlp_scan",
    "mutation_testing", "intent_verification", "security_scan", "coverage_delta",
    "complexity_check", "dead_code", "comment_quality", "import_cycle",
    "merge_conflict", "benchmark", "dep_audit", "migration_reversibility",
    "large_file", "integration_test_gen", "review_rubric", "test_expansion",
    "incident_evals",
})
VALID_GATE_CONDITIONS = frozenset({"always", "python_changed", "tests_changed", "any_changed", "deps_changed"})
```

The YAML-declarable step:

```python
@dataclass(frozen=True)
class GatePipelineStep:
    name: str
    required: bool
    condition: str = "always"
    command_override: str | None = None
```

and the name is fail-closed against the enum (`seed_parser.py:1744`):

```python
if name not in VALID_GATE_NAMES:
    raise SeedError(f"quality_gates.pipeline[{index}].name is unsupported: {name!r}")
```

**So you cannot declare an arbitrarily-named custom gate in YAML.** Your options are
(a) override the shell command of one of the 23, (b) set a top-level `*_command`
field, or (c) write a Python `GatePlugin` (§6b). For our R work, (a) gets you a long
way and (c) is the clean route — but note `VALID_GATE_CONDITIONS` has no `r_changed`.

### 4d. The gate contract is exit-code, with `shell=True`

`core/quality/quality_gates.py:488`:

```python
def _run_command(command: str, cwd: Path, timeout_s: int) -> tuple[bool, str]:
    # SECURITY: shell=True required because quality gate commands are admin-configured
    # shell strings (e.g. "ruff check src/") that may use pipes or globs; not user input.
    proc = subprocess.run(command, shell=True, cwd=cwd, capture_output=True,
                          text=True, encoding="utf-8", errors="replace", timeout=timeout_s)
    output = (proc.stdout + proc.stderr).strip()
    if len(output) > 2000:
        output = output[:2000] + _TRUNCATED_SUFFIX
    return proc.returncode == 0, output or "(no output)"
```

**Exit 0 = pass, anything else = fail; stdout+stderr merged and truncated at 2,000
characters.** Timeouts become a distinct `status="timeout"`. `required=False` gates
run and report but never block.

Two observations. The 2,000-char truncation is aggressive for anything that needs
real evidence (an `R CMD check` log is far longer). And the `shell=True` /
argv split is **inconsistent** across the codebase — quality gates use a shell
string, while evidence producers correctly use argv:

```python
@dataclass(frozen=True)
class EvidenceProducer:
    name: str
    kind: str                   # tests|coverage|lint|screenshot|recording|generic
    command: tuple[str, ...]    # argv, NOT a shell string
    required: bool = True
```

### 4e. Evidence is genuinely structured, at three levels

1. **`GateResult` / `GateReport`** — status, required, blocked, cached, duration,
   truncated output, free-form `metadata`; persisted per task and fed to a `QualityScorer`.
2. **Evidence bundles** (`core/evidence/bundle.py`) — producer outputs
   content-addressed under `.sdd/evidence/blobs`, bound into an **Ed25519-signed
   `EvidenceBundle`**, anchored in the lineage spine and mirrored to the HMAC chain.
   `ProducerOutcome.passed` is `exit_code == 0`.
3. **Verifier ladder receipts** (`core/quality/verifier_ladder.py`) — per-tier
   `TierRecord` (config hash, inputs hash, evidence hash, verdict) plus a composite
   `LadderReceipt` carrying a `merge_eligible` claim that `derive_ladder_verdict`
   can re-derive. Gate adjudication records bind `inputs_hash`, `rubric_hash`,
   `panel_config`, `per_judge_verdict`, `final_verdict`, `journal_entry_hash`, and
   are checkable via `bernstein gate verify <run_id> --inputs inputs.json`.

**This layered "claim + re-derivable verdict" shape is the single best idea in the
project** and maps almost directly onto what we want for fidelity gauges: a node
asserts a verdict, and the verdict is independently recomputable from hashed inputs.

### 4f. Retry and model escalation — a real ladder

`core/tasks/task_lifecycle.py:353`:

```python
_EFFORT_LADDER = ["low", "medium", "high", "max"]
_MODEL_LADDER = ["haiku", "sonnet", "opus"]

def _choose_retry_escalation(task, next_retry, current_model, current_effort):
    match task.terminal_reason:
        case "error_max_turns":       return current_model, _bump_effort(current_effort)
        case "error_max_budget_usd":  return current_model, "max"
        case "model_error":           return current_model, current_effort
        case "blocking_limit":        return "opus", "max"
    if task.scope == _Scope.LARGE or task.role in ("architect", "security"):
        return "opus", "max"
    if next_retry == 1:
        return current_model, _bump_effort(current_effort)
    return _escalate_model(current_model), "high"
```

Plus exponential backoff capped at 300 s, budget doubling on budget exhaustion,
progressive time estimates, and — importantly — the previous failure injected into
the retry prompt:

```python
new_description = (
    f"{task.description}\n\n"
    "## Previous attempt failed\n"
    f"{failure_context}\n\n"
    "Avoid the same mistakes. If you hit the same error, try a different approach."
)
```

Exhaustion routes to a quarantine store and/or a dead-letter queue at
`.sdd/runtime/dlq.jsonl`. This escalation ladder is cheap, deterministic, and
directly reusable.

### 4g. Config: two divergent schemas

Worth knowing before trusting any config documentation. The **runtime** loader is a
hand-rolled ~2,300-line dataclass parser (`core/config/seed_parser.py`,
`parse_seed() -> SeedConfig`) doing manual `isinstance` checks; unknown top-level
keys produce only a **warning** against a hardcoded allowlist. Separately there is a
pydantic `BernsteinConfig` (`core/config/config_schema.py:770`,
`extra="allow"`) used for JSON-schema export and validation — **which is not what
actually parses your config.** Two schemas that can drift. `schemas/` at the repo
root holds only receipt/manifest schemas, not the config or plan schema.

One good detail: env expansion `${VAR:-default}` with a blocklist —
`_BLOCKED_ENV_VARS = frozenset({"AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "GITHUB_TOKEN", "GH_TOKEN"})`.

---

## 5. Executor pluggability — how "40+ CLI coding agents" is abstracted

### 5a. The adapter interface is thin, and that is a good thing

`src/bernstein/adapters/base.py:389` — an ABC, not a Protocol:

```python
class CLIAdapter(ABC):
    """Interface for launching and monitoring CLI coding agents."""
    external_endpoints: tuple[tuple[str, int], ...] = ()
    rate_limit_provider: str = ""
    supports_session_continuation: bool = False
    supports_session_log_watch: bool = False
    strategy_override: Any = None
```

**Only two abstract methods**: `spawn(...) -> SpawnResult` and `name() -> str`.
Everything else — `resume()`, `continuation_args()`, `stream_signal_parser()`,
`session_log_path_for()`, `detect_tier()`, `is_rate_limited()` — is an
optional hook with a default implementation. So the minimum viable adapter really
is a command template.

Adapters get useful cross-cutting behaviour for free from the base class: a
timeout watchdog (`_start_timeout_watchdog`, SIGTERM then SIGKILL after grace,
default 30 min), an 8-second fast-exit probe, a rate-limit heuristic, and
process-group reaping.

**Bimodal in practice.** `aider.py` is 117 lines — a fixed argv list, a
`_MODEL_MAP` dict, and a `Popen`. `claude.py` is 1,148 lines plus a separate
404-line `claude_stream_parser.py` handling `tool_use` / `tool_result` /
`thinking` blocks and `compact_boundary` mutation subtypes. So "40+ adapters" is
honest about count but not about depth — the README's own
`KNOWN_LIMITATIONS.md` concedes *"Prefer proven adapters (claude, codex, gemini)
in production workflows."*

There is also a **data-driven** path: `AdapterCapabilityProfile` /
`InvocationSpec` frozen dataclasses (`src/bernstein/adapters/capability_profile.py:185,309`)
declare `binary`, `subcommands`, `model_flag`, `prompt_flag`, `extra_args`,
`env_passthrough` plus capability flags (`mcp_client`, `resume`, `sandbox`,
`event_channel`, `max_parallel_workers`, …). But **only 5 profiles ship**, and
only **one** (`pydantic_ai`) is actually built into an adapter by the factory. The
declarative path is mostly aspirational.

### 5b. The spawn contract — fire-and-forget, log-file-based

`src/bernstein/adapters/generic.py:85` is the canonical shape:

```python
env = build_filtered_env()
preexec_fn = self._get_preexec_fn()
with log_path.open("w") as log_file:
    proc = subprocess.Popen(
        wrapped_cmd, cwd=workdir, env=env,
        stdout=log_file, stderr=subprocess.STDOUT,
        start_new_session=True, preexec_fn=preexec_fn,
    )
```

Worth noting for our design:
- Prompt is a **single argv element**; no `shell=True` anywhere in the spawn path. Good.
- Env is **allowlist-only** (`build_filtered_env`), each adapter naming the API keys it needs. Good.
- **`spawn` does not capture the exit code.** It returns `SpawnResult(pid, log_path, proc)` and is fire-and-forget; stdout+stderr are merged into one log file at `workdir/.sdd/runtime/<session_id>.log`. Completion is inferred from log parsing (`BERNSTEIN:<KIND> [json]` signal grammar) and `is_alive(pid)`, **not** from a process exit-code contract. That is a consequential design choice and, I suspect, the root of several of the misdiagnosed-failure bugs in §7b (e.g. the Windows `.cmd` 8191-char argv failure being read as "agent started and died", then proceeding to merge).

### 5c. Adapter count: README is wrong

Measured, not eyeballed: `_ADAPTERS` is a plain
`dict[str, type[CLIAdapter] | CLIAdapter]` (`registry.py:80`) with 46 literal
entries plus 1 factory-built = **`len(_ADAPTERS) == 47`** (executed under the repo's
own venv). The README (line 127) claims `bernstein integrations list` "enumerates
all **48** wired-in adapters". Off by one.

The guard test cannot catch this because it asserts a floor, not equality
(`tests/unit/adapters/test_registry.py:33`):

```python
def test_adapter_count_at_least_44() -> None:
    assert len(_ADAPTERS) >= 44, sorted(_ADAPTERS)
```

That single test is a good miniature of the whole test suite's character — present,
plausible-looking, and calibrated not to fail.

**The generic `--prompt` wrapper claim is misleading.** README: *"Anything else with
a `--prompt` flag works through the generic wrapper."* But `get_adapter("generic")`
hardcodes the binary (`registry.py:257`):

```python
return GenericAdapter(cli_command="generic-cli", display_name="Generic CLI")
```

`grep -rn "GenericAdapter("` over `src/` returns exactly two hits: the class
definition and that line. **There is no config knob that feeds `cli_command`.** To
use the generic wrapper with your own binary you must construct it in Python and
call `register_adapter()` yourself.

### 5d. Adding an executor: genuinely cheap

Real entry-point group with a real loader (`registry.py:195`):

```python
for ep in entry_points(group="bernstein.adapters"):
    loaded = ep.load()
    if (inspect.isclass(loaded) and issubclass(loaded, CLIAdapter)) or isinstance(loaded, CLIAdapter):
        _ADAPTERS[name] = loaded
```

Because `selectable_adapter_names()` derives from `iter_adapter_specs()`, a plugin
adapter automatically becomes valid for `--cli`. Documented at
`docs/adapters/ADAPTER_GUIDE.md:872`.

- **Third-party plugin (no fork):** one `CLIAdapter` subclass with `spawn` + `name`
  (~80 lines, copy `aider.py`) + one line in your own `pyproject.toml`. **Zero edits
  to Bernstein.**
- **Upstream in-tree contribution:** materially more — a YAML contract in
  `tests/contract/contracts/` ("Contract drift is a hard fail (exit 2)"), a
  `STRATEGY_MATRIX` row, a `USE_CASES` entry, a unit test, docs, README counts.
  ~5 files.

---

## 5e. R support — currently zero, and the gate layer is hardcoded Python

**R is a first-class nothing in this codebase.** Run over the whole checkout
excluding `.venv/`, `node_modules/`, `__pycache__/`, `.git/`:

```
grep -rIn -E "R CMD|testthat|Rscript|\brenv\b|roxygen2|CRAN" .   → 0 results
```

The only R-adjacent traces are `".r": "#"` in a comment-style table
(`core/security/compliance.py:283`) and `".r"` in a token-estimation extension list.
`devtools` appears once — as a **PyPI keyword** in `pyproject.toml`, not the R
package. `.R`/`.Rmd` are absent from the language-by-extension table, the formatter
registry, and the quickstart templates. No `DESCRIPTION`/`NAMESPACE` awareness
anywhere.

**There is no `LanguageProfile` abstraction to add a row to.** Language knowledge
is scattered across three unrelated, partial tables:

1. `core/quality/auto_formatter.py:70` — `_DEFAULT_REGISTRY`, 4 languages
   (Python/JS-TS/Rust/Go), **formatting only**. And the config override hook accepts
   only three hardcoded keys (`gate_commands.py:89-95`): `"Python"`, `"JS/TS"`,
   `"Rust"` — Go cannot even be overridden.
2. `cli/commands/quickstart_templates.py:33` — 5 scaffolding templates. **Nothing
   reads these back at gate time**; they just emit YAML text.
3. `core/knowledge/repo_analyzer.py:52` — `_LANGUAGE_BY_EXT`, 20 extensions, used
   for **reporting only**, never wired to gate command selection.

There is no `detect_language()` or `detect_toolchain()` in the gate path at all.

**And the gate layer is hard-wired to Python well past the config layer:**

- `core/quality/gate_pipeline.py:9` defines `NO_PYTHON_FILES = "No Python files changed."`,
  and **five gates short-circuit on it** — they would silently skip on an R-only diff.
- `VALID_GATE_CONDITIONS` is a frozenset literal containing `"python_changed"`, with
  `LEGACY_PYTHON_CONDITION = "changed_files.any('.py')"`. There is no `r_changed`
  sibling and no way to add one without patching core.
- `_DEP_FILE_NAMES` is Python-only (`pyproject.toml`, `Pipfile`, `poetry.lock`, `uv.lock`).
- Several gates call `ast.parse` **directly** on changed files (complexity, dead-code,
  comment-quality, migration-reversibility). These are Python-AST-specific and
  cannot generalise to R at all.
- Defaults are Python throughout (`quality_gates.py:180`): `lint_command: "ruff check ."`,
  `type_check_command: "pyright"`, `dead_code_command: "vulture"`,
  `dep_audit_command: "pip-audit"`.

### How hard would adding R actually be?

**Cheap — works today, zero code:** `run_command_sync` executes an arbitrary shell
string, so an operator can already set in `bernstein.yaml`:

```yaml
test_command: Rscript -e 'devtools::test()'
lint_command: Rscript -e 'lintr::lint_package()'
```

`R CMD check` works as a `test_command` right now. That gets you the basic loop.

**Cheap data additions (~25 lines):** an `"r"` entry in `TEMPLATES`, `.R/.r/.Rmd` in
`_LANGUAGE_BY_EXT`, an `R` `FormatterConfig` for `styler::style_file`.

**Requires patching core (the remaining ~40%):**
- a new `auto_format_r_command` config field *and* a new branch in the
  three-way if-chain at `gate_commands.py:89` (a dict that should have been a dict);
- an `r_changed` gate condition — `VALID_GATE_CONDITIONS` is a frozenset literal;
- the five `NO_PYTHON_FILES` short-circuits, which would silently pass R-only diffs;
- `DESCRIPTION`-file awareness in `_DEP_FILE_NAMES` / `dep_audit_files`;
- all `ast.parse`-based gates are simply unavailable for R.

**The clean escape hatch is `GatePlugin` (§6b).** An `RCmdCheckGate` /
`TestthatGate` dropped into `.bernstein/gates/*.py` needs **no core patch**. That is
the route I would take, and it means the honest answer to "how hard is R?" is:
*basic R gates are trivial; a first-class R language profile equal to Python's is a
fork.* Given our targets are R packages and R data pipelines, we would be permanently
in second-class-citizen territory in a codebase whose verification layer assumes
Python at five different levels.

---

---

## 6. Extension surface — the best part of the project

This is where Bernstein is genuinely good, and it is the answer to "could we use it
as a library rather than adopt it wholesale".

### 6a. Ten declared plugin entry-point groups

`pyproject.toml` lines 322–381 declare a full plugin taxonomy via `pluggy`:

```toml
[project.entry-points."bernstein.plugins"]        # lifecycle/event plugins (hookimpl classes)
[project.entry-points."bernstein.adapters"]       # third-party CLI agent adapters (CLIAdapter subclasses)
[project.entry-points."bernstein.gates"]          # custom quality gates (GatePlugin subclasses)
[project.entry-points."bernstein.triggers"]       # custom trigger sources
[project.entry-points."bernstein.reporters"]      # custom reporters
[project.entry-points."bernstein.sandbox_backends"]
[project.entry-points."bernstein.skill_sources"]
[project.entry-points."bernstein.storage_sinks"]
[project.entry-points."bernstein.spec_quality_rules"]
[project.entry-points."bernstein.notification_sinks"]
```

**I verified which of these actually have a loader** (`grep 'entry_points(' src/`):

| Group | Loader | Location |
|---|---|---|
| `bernstein.gates` | ✅ | `src/bernstein/core/quality/gate_plugins.py:109` |
| `bernstein.adapters` | ✅ | `src/bernstein/adapters/registry.py:204`, `adapters/plugin_sdk.py:399` |
| `bernstein.plugins` | ✅ | `src/bernstein/plugins/manager.py:1015` |
| `bernstein.spec_quality_rules` | ✅ | `src/bernstein/core/planning/spec_quality.py:362` |
| `bernstein.storage_sinks` | ✅ | `src/bernstein/core/storage/registry.py:202` |
| `bernstein.skill_sources` | ✅ | `src/bernstein/core/skills/sources/plugin.py:94` |
| `bernstein.sandbox_backends` | ✅ | `src/bernstein/core/sandbox/registry.py:174` |
| `bernstein.notification_sinks` | ✅ | `src/bernstein/core/notifications/registry.py:197` |
| **`bernstein.triggers`** | ❌ **none** | declared, never loaded — dead extension point |
| **`bernstein.reporters`** | ❌ **none** | declared, never loaded — dead extension point |

8/10 real, 2/10 documented-but-unimplemented. That ratio is roughly the project in
miniature.

### 6b. The gate plugin interface — this is what we should steal

`src/bernstein/core/quality/gate_plugins.py` (138 lines, clean):

```python
class GatePlugin(ABC):
    """Base class for user-defined quality gates."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique gate name."""

    @property
    def required(self) -> bool:
        """Whether this gate blocks merge on failure."""
        return True

    @property
    def condition(self) -> str:
        """The default execution condition for the gate."""
        return "always"

    @abstractmethod
    def run(
        self,
        changed_files: list[str],
        run_dir: Path,
        task_title: str,
        task_description: str,
    ) -> GateResult:
        """Execute the gate and return a result."""
```

Two discovery paths, and the first one is the good idea:

```python
    def discover(self) -> None:
        """Load gate plugins from the workdir and Python entry points."""
        self._load_file_plugins(self._workdir / ".bernstein" / "gates")
        self._load_entrypoint_plugins()
```

**Drop a `.py` file in `.bernstein/gates/` in your own repo and it becomes a gate.**
No packaging, no install, no entry point, no fork. Name collisions with built-ins
are rejected explicitly (`"Gate plugin name {name!r} collides with a built-in gate"`).
For our purposes — an R package needing `R CMD check`, `testthat`, `lintr` gates —
this is precisely the right shape, and it means **an R gate is a user-space file,
not a fork of the tool.**

The result object carries structured evidence, not just a boolean
(`src/bernstein/core/quality/gate_pipeline.py:103`):

```python
@dataclass
class GateResult:
    name: str
    status: GateStatus
    required: bool
    blocked: bool
    cached: bool
    duration_ms: int
    details: str
    metadata: dict[str, Any] = field(default_factory=_empty_metadata)
```

Note `required` + `blocked` as separate fields, `cached` for gate memoisation, and
a free-form `metadata` dict for evidence. Good design. **Caveat:** issue #3254 above
proves the `blocked` flag was, for months, *recorded correctly and then ignored by
the merge path*. The data model was right; the control flow was not.

**Smell:** there are **six** distinct `class GateResult` definitions in the
codebase (`core/quality/gate_pipeline.py`, `core/security/claude_tool_result_injection.py`,
`core/planning/run_summary.py`, `core/integrations/pr_gen.py`, `core/lineage/gate.py`,
`core/orchestration/phase_gates.py`). Parallel, unreconciled abstractions for the
same concept is the classic signature of code generated feature-by-feature without
a unifying pass.

### 6c. Can we use it as a library? Mostly no.

- **`src/bernstein/__init__.py` is 75 lines and exports essentially nothing** — just
  `__version__` and a templates-directory helper. There is no public orchestration
  API. Using it as a library means importing deep internal modules
  (`bernstein.core.orchestration.*`, `bernstein.core.tasks.*`) with no stability
  contract, in a codebase that ships ~1 release per day.
- **The dependency footprint is hostile to library use.** 34 *core* (non-optional)
  dependencies including `fastapi`, `uvicorn`, `starlette` (a whole web server),
  `textual` (a TUI framework), `openai`, `prometheus-client`, three
  `opentelemetry-*` packages, `signxml`, `keyring`, `reportlab` (PDF generation),
  `pillow`, and — as *core* dependencies — `pyfiglet` and `terminaltexteffects`
  (ASCII-art banners and terminal animation). You cannot import the scheduler
  without pulling in a PDF engine and an ASCII-art library.
- There *are* separate thin SDKs at `sdk/python/src/bernstein_sdk/` and
  `sdk/typescript/src/` — but these are **HTTP clients for the run API**
  (`client.py`, `oauth.py`, `models.py`, plus Slack/Jira/Linear/Teams/GitHub-Actions
  adapters), not an embeddable orchestrator.
- MCP server mode is real and trivially wired (`.mcp.json` → `bernstein mcp`,
  `mcp>=1.28.1` is a core dependency).

**Realistic reuse strategy:** take the *ideas* and the *small self-contained
modules* (`gate_plugins.py` is 138 lines and near-copy-pasteable; the reliability
coordination-projection logic is a few hundred), not the package.

---

## 6d. Overlap with our specific design commitments

I checked directly for the three things we said we are keeping.

**(a) Hypothesis nodes with confidence + fidelity gauges — absent as such, but one
module is worth stealing.** There is no hypothesis concept anywhere
(`grep -rln 'hypothes'` over `src/` hits exactly one file, and that is the
`hypothesis` *test library*). "Confidence" appears widely but almost entirely in
cost forecasting and model routing (`core/cost/predictive_cost_model.py`,
`core/routing/cascade_router.py`, `cli/utils/cost_estimate.py`).

The exception is `src/bernstein/core/quality/empirical_confidence.py` (373 lines),
which is a genuinely good idea and close to what we want a confidence gauge to be:

```
"""Empirical confidence from outcome history.

Records per-decision outcomes in an append-only SQLite table and exposes a
sample-size-gated confidence query. The query refuses to return a value when
the sample size is below a documented threshold; callers fall back to a
uniform prior or another signal of their choice.
...
Schema (single table, ``agent_outcomes``):
    agent_type      TEXT    NOT NULL
    decision_key    TEXT    NOT NULL
    outcome         INTEGER NOT NULL   -- 1 = correct, 0 = incorrect
    sampled_at      REAL    NOT NULL
    evidence_uri    TEXT                -- optional reference to a run or artefact
"""
```

Two ideas to take: **confidence is measured from recorded outcomes, not asserted**;
and **the query refuses to answer below a sample-size threshold** rather than
returning a confidently wrong small-n number. That is exactly the discipline our
confidence gauges need, and it is ~370 lines we could reimplement in an afternoon.

**(b) Pluggable inner loop — yes, via `GatePlugin` + `bernstein.adapters`, see §5d/§6b.**
This is the part of Bernstein that most closely matches what we want, and the part
most worth copying at the interface level.

**(c) A deliberate divergence move against tunnel vision — absent.** Grepping
`src/` and `docs/` for `tunnel.vision`, `devil.s.advocate`, `red.team`,
`adversarial`, `counterfactual`, `explore.exploit`, `diversity` finds nothing of
the kind. `counterfactual` in `core/orchestration/schedule_supervisor.py` is about
missed cron windows. `adversarial` hits are about prompt-injection defence and
untrusted chat input.

The nearest relative is `src/bernstein/core/communication/voting.py` (435 lines):

```
"""Agent voting protocol - configurable multi-model consensus for task verification.

VotingProtocol wraps one or more LLM reviewers into a single verdict using
configurable strategies: MAJORITY, QUORUM, WEIGHTED, or UNANIMOUS.
"""
```

That is **model diversity applied to verification** (do several reviewers agree the
work is done?), not diversity applied to *exploration* (are we solving the right
problem at all?). It converges rather than diverges. Our divergence move has no
prior art here — Bernstein's whole philosophy points the other way: it exists to
make one plan replay identically, and it takes exactly **one** LLM call to produce
that plan and then never questions it. Bernstein is, architecturally, a
tunnel-vision machine by design. That is a real and interesting contrast to
document, not a gap to fill by adoption.

---

---

## 7. Health, sceptically

### 7a. External adoption — thin but NOT zero

I was asked to report honestly if there are no external users. **There are a few,
and they are unusually good ones** — but the population is tiny.

| Signal | Finding | Method |
|---|---|---|
| Hacker News | **One** submission ever: "Bernstein: Deterministic orchestrator for 40 CLI AI agents", 2026-05-08, **3 points, 0 comments**. Zero hits for `bernstein.run`. | HN Algolia API, `nbHits` 4 (3 unrelated) |
| GitHub watchers | **9** — against 801 stars and 93 forks | GitHub API `subscribers_count` |
| Total issues | 1,305, of which **213** not authored by the owner | `gh api search/issues` |
| …but most of those 213 are the project's own bots | "auto-release skipped on `<sha>`", "CI weekly digest 2026-W31", "Adapter conformance canary skip streak: droid", "SonarQube findings tracker" | `gh search issues -- -author:chernistry` |
| Last 100 issues by author | chernistry 86, github-actions 8, `bymyforge` 4, `casbrbr-beep` 2 | `gh issue list --limit 100` |
| PRs | 2,114 total, 244 not by owner/renovate/dependabot/bernstein-bot | `gh api search/issues` |
| Independent blog posts / YouTube / Lobsters / Reddit | **None found.** Everything web search surfaced was either the project's own property (bernstein.run, readthedocs, GitHub Marketplace) or an aggregator listing (mcpmarket, skillsllm, awesome-lists) or a listicle (Augment Code's "9 Open-Source Agent Orchestrators"). | WebSearch |

**Genuinely external humans identified (2, possibly 3):**

- **`shanemmattner`** — 37 commits, and author of the deepest bug reports in the
  tracker (#2179, #2183, #2186, #2187). Clearly ran it on a real monorepo.
- **`casbrbr-beep`** — filed #3254 and #3255 in July 2026, forensic quality,
  reproduced on two fresh repos, read the source to identify root cause.
- `bymyforge`, `oldschoola` (16 commits) — lighter involvement.

So: not vapourware with a bot-inflated star count, but the real user base appears to
be **single digits of serious users**. The 801 stars are aggregator- and
awesome-list-driven. The README's "mentioned in" section lists ~20 directories and
newsletters — that is listing coverage, not adoption.

`api.bernstein.run` — **does not exist**. `host api.bernstein.run` returns nothing
(no DNS record at all); `curl` returns HTTP `000`. `bernstein.run` itself returns
200. To the project's credit the README states this plainly: *"The hosted
`api.bernstein.run` service is not yet available"*. Announced-only, honestly labelled.

PyPI: `bernstein` **3.13.0**, **148 releases** in ~4.5 months (~1/day). Download
stats not retrieved (pypistats returned HTTP 429) — **unverified**.

### 7b. The LOC numbers are inflated by ~46%

Before any judgement about size: of `src/`'s 701,768 lines, **113,984 are blank,
35,341 are comments, and 171,840 are docstring lines** — 45.8% non-code. Real
source is **~380k LOC**. Tests: 636,349 lines → **~430k** real. A quarter of the
source tree is prose.

Concretely, `src/bernstein/core/security/audit_chain.py` is **8,355 lines** but
holds 138 top-level assignments (133 `EVENT_*` string constants) each carrying a
10–20 line `#:` docstring. A representative entry is a 12:1 prose-to-code ratio on
a single string constant. The largest genuine complexity is
`core/orchestration/orchestrator.py` at **6,541 lines** — a real god object.

### 7c. The test suite is better than expected; the enforcement is theatre

**Test count (AST-parsed, not grepped): 38,142** (36,502 sync + 1,640 async) across
2,513 files. Roughly one test per 10 lines of real source. Not inflated by
`parametrize` (only 724 occurrences).

Distribution: `tests/unit/` 2,233 files · `integration/` 160 · `property/` 56
(Hypothesis) · `chaos/` 12 · `stress/` 8 · `pentest/` 6 · `snapshot/` 5 ·
`contract/` 2.

**Mock-tautology rate is genuinely low**: `assert_called*` / `assert_awaited*`
appear 713 times against **74,083 total `assert` statements — under 1%**. Only 11%
of test files use `MagicMock`. House style is `monkeypatch` + `respx` + `tmp_path`
against real objects. This is materially better than typical AI-generated test code
and I want to say so plainly.

Real-subprocess e2e exists and is not fake:
`tests/integration/fake_cli/fake_cli.py` is a stdlib-only fake agent binary with
`success` / `error` / `stream_then_die` / `hang` / `no_output` modes that dumps
argv+environ for assertion; `tests/integration/test_adapter_e2e.py` (931 lines)
prepends a tempdir of fake CLIs onto `PATH` and lets the adapter spawn a real
process. `tests/integration/cluster/test_real_2node.py` races two raw
`subprocess.Popen` workers against a live claim endpoint.

**And then the enforcement layer collapses.** This is the finding that matters:

> **PRs do not run the test suite.**

`ci.yml` (2,109 lines, 33 jobs, one of **61** workflow files) runs
`scripts/run_tests.py … --shard "${SHARD}/${SHARD_COUNT}" --affected "refs/remotes/origin/${BASE_REF}"`.
On PRs the `--affected` impact map selects a subset; on push to `main` the flag is
dropped. Wall-clock confirms it: **PR runs 7m26s–12m11s; push-to-main runs
38m–40m50s.** The PR matrix is further narrowed to Python 3.13 / Linux only (3.12
and macOS run only on push). Windows results are advisory.

The author has already been bitten by exactly this and documented it in the
workflow:

> "`tests/integration/**` (126 files) reached CI only through the `--affected`
> slice … Nothing selected the directory on push to `main`, so a break that arrives
> through a path the map does not model … landed with the gate green."

**Every quality ratchet is advisory:**

| Gate | Config exists | Can it fail a PR? |
|---|---|---|
| Coverage (83.12% measured, 85% target) | `.coverage-baseline.json`, `codecov.yml` | **No.** No `fail_under` in `pyproject.toml`; `fail_ci_if_error: false`; coverage uploads **only on push to main**; `coverage-ratchet.yml:207` — `continue-on-error: true  # ADVISORY: a drop reports red but never blocks` |
| Mutation testing (mutmut) | `mutmut_config.py`, 2 workflows | **No.** `continue-on-error: true  # advisory - score reported, not enforced`, and `uv run mutmut run \|\| true`. Scope: **7 modules.** |
| Fuzzing (ClusterFuzzLite) | `.clusterfuzzlite/`, `cifuzz-pr.yml` | **No** — despite the filename, the trigger is `schedule: 17 5 * * 1` (weekly) for **120 seconds**. |
| mypy strict | `mypy.gate.ini` | **Yes, blocking** — but `files =` names 4 packages with 15 files excluded as "Not yet strict-clean". Repo-wide mypy is advisory. |
| pyright strict | `pyrightconfig.strict.json` | **Yes, blocking** — over **4 files** (`lineage.py`, `lineage_signer.py`, `wal.py`, `v2_store.py`). Repo-wide pyright runs with `\|\| true`. |
| beartype | `tests/_beartype_claw.py` | **Yes, blocking** — over **1 module.** |
| ruff, import-linter, vulture, pip-audit (prod) | — | **Yes, genuinely blocking.** |

**4 files under strict pyright, 1 module under beartype, 7 modules under mutation
testing — out of 1,844 source files.** The strict zone is ~2% of the codebase. The
apparatus is real; the covered surface is tiny; and the badges do not say so.

Trunk is nonetheless green: 37 success / 3 failure / 20 cancelled over 60 `ci.yml`
runs (7.5% failure rate among completed runs; the cancellations are
`cancel-in-progress` concurrency, not flakes).

### 7d. Shipped-but-unwired features

`vulture_whitelist.py` (143 lines) is a blocking gate's suppression list, and it is
a confession. Roughly **60 of 143 entries are whole feature APIs suppressed as
unreachable**, self-labelled:

```python
# Claude Code Routine adapter - public API not yet wired into orchestrator
RoutineCostTracker  # noqa
...
# Canary deployment API - exported for future orchestrator integration (#810)
PromptVersion  # noqa
CanaryState  # noqa
should_route_to_canary  # noqa
promote_canary  # noqa
rollback_canary  # noqa
```

The canary-deployment API (~22 symbols), the Plan-and-Execute planner API (~20),
the eval framework API (~15), agent-checkpoint WAL recovery (~7), and agent
identity cards (~11) are shipped, documented, unit-tested in isolation, and
**called by nothing**.

Otherwise the hygiene is good: TODO 41, FIXME 3, `NotImplementedError` 42 (mostly
*honest capability refusals* like `"SSHSandboxBackend does not declare the SNAPSHOT
capability"`, not stubs). **No vendored third-party code in `src/`.**
`core/grpc_gen/` is a 1-line empty `__init__.py` — absent, not bloat. Duplicate
function bodies: 90 of 9,187 (**1.0%**), which is excellent.

63 subpackages under `core/`, and the tail is thin but real — only `grpc_gen` is a
shell; the smallest genuine packages (`devops` 520 LOC, `substrate` 592,
`sessions` 604) are still 2–4 real modules.

### 7e. README capability claims, checked against code

| Claim | Verdict |
|---|---|
| "40+ CLI agent adapters" | **True** (47 at runtime; README's "48" is off by one — see §5c). 79 modules, 28k LOC, 5 covered by real-subprocess e2e. |
| "MCP server mode" | **Real.** 6,350 LOC; `src/bernstein/mcp/server.py` 2,348 lines; registered at `cli/main.py:1010`. |
| "cluster mode" | **Real, thinner than it sounds.** 3,894 LOC; genuine 2-node e2e — but `cluster-e2e.yml` is path-filtered + nightly cron. |
| "air-gap deploy" | **Real, and unusually honest** — `airgap-e2e.yml` builds a wheelhouse and runs it under `unshare -n --` (real network-namespace isolation), not a mock. Path-filtered + nightly; one step annotated "Non-fatal". |
| "Cloudflare cloud execution (experimental)" | **Real but small** (~2,380 LOC), and correctly hedged in the README. Note `bernstein cloud deploy` was **removed** from the CLI — part of this was walked back. |
| "signed agent cards" | **Real.** Ed25519 via `cryptography`, RFC 9421 HTTP Message Signatures, RFC 8037 OKP JWKs — not hand-rolled. *Caveat:* several identity-card symbols sit in the vulture whitelist, i.e. not called from the main path. |
| "sandbox backends" | **Real.** 5,598 LOC, 12 backends. SaaS ones (e2b/modal/daytona/vercel/blaxel/runloop) are thin 300–400 line HTTP clients, but not fake; unsupported operations raise explicit capability refusals. |

So the capability claims largely hold up. The misleading claims are narrower and
more specific: the `pass^k` feature (§2b), the generic `--prompt` wrapper (§5c),
the adapter count, and the "import graph enforces it" claim (§2d).

### 7f. What the external users found — the most damaging evidence

These four issues matter more than any code metric, because they are independent
observations of the system failing at exactly the thing it is sold for.

**#3254 — "A failed required quality gate does not stop the merge, and the log says
it did"** (P0, filed by `casbrbr-beep` 2026-07-29 against **v3.11.0**, closed 07-31):

> On 3.11.0, a failing required gate is logged as blocking the merge, recorded as
> `result: blocked` in `quality_gates.jsonl`, and then the branch merges anyway
> 301 ms later. The behaviour is serious on its own; the log and metrics both
> reporting a successful block is what makes it hard to notice.

> `task_lifecycle.py:2927`, `_evaluate_approval_gate`. The return value means
> "skip the merge"; on the `not janitor_passed` branch it returns `False`, so a
> failed gate falls through into the merge instead of stopping it. Reads like a
> polarity error rather than a design decision.

Read that again. For a project whose entire pitch is *deterministic,
after-the-fact-checkable verification gates*, the gate did not gate — and the
audit trail actively asserted that it had. A one-line polarity error survived to
**version 3.11.0**, four months and 636,000 lines of test code in. The signed
lineage receipt would have faithfully attested to a merge that the system's own
records described as blocked. **Tamper-evidence over a broken control plane
produces confidently signed nonsense.** This is the single most important data
point in this report for anyone considering betting on it.

**#3255 — "`--plan-only` spawns agents, creates a worktree and reaches the merge
path"** (P1, same reporter, same session):

> `--plan-only` is documented as "Generate and display the execution plan without
> running any agents". On 3.11.0 it starts a task server, watchdog and spawner,
> spawns a live agent, creates a worktree, produces a commit and reaches the merge
> path. Exit code 0. Reproduced twice in two fresh repositories.

Plus, from the same report: `bernstein doctor` — the documented pre-flight check —
crashes with an unhandled `FileNotFoundError` on any machine without `uv` on PATH
(`core/quality/ci_fix.py:361`, unguarded `subprocess.run`).

**#2186 — janitor acceptance checks are exact-path and structurally wrong**
(`shanemmattner`, 2026-07-02). This one is a *design* lesson, not a bug, and it is
the most valuable thing in the tracker for our purposes:

> A run where every worker did real, correct work still cascaded to a sev1
> (`>75% of tasks failing — orchestration pause requested`) because the manager's
> decomposition encoded **exact file paths** in janitor acceptance criteria, and
> workers legitimately placed their output at repo-idiomatic paths instead.

> **Why this is structural, not a bad-prompt one-off:** The manager invents paths at
> planning time, before any code exists; the repo's actual test-layout conventions
> (`src/__tests__/` vs `test/`) are only discoverable at implementation time. Any
> exact-path acceptance check written at decomposition time is a co[in flip]

The verification criteria were `path_exists: packages/db/test/seed-workers.test.ts`
and similar. The worker wrote a correct 327-line test at the repo's actual
convention, and the run cascaded to a severity-1 incident and paused itself.

**#2179 — hardcoded watchdog, dead config, misdiagnosed failure**
(`shanemmattner`, same day):

> `STALL_THRESHOLD_S = 170.0` is a hardcoded module constant. … The intended
> override, `getattr(orch._config, "stalled_manager_threshold_s", STALL_THRESHOLD_S)`
> (~line 258), is **dead code**: `OrchestratorConfig` … has no such field, and the
> construction site … never sets one. No yaml key, env var, or CLI flag can change
> the deadline today.

> Toy repos never hit this because trivial seed goals decompose into child tasks in
> well under 170s. Any goal that legitimately warrants investigation before
> decomposition (larger repo, "find root cause" acceptance criteria, slower model
> TTFT) gets killed regardless of real progress.

And the failure record then blamed authentication:

> we captured the manager's own NDJSON log and confirmed it was **not stalled**:
> ~30 real tool_call/tool_result pairs … The auth-failure diagnosis was wrong.

**The pattern across all four:** the system works on toy repos and fails on real
ones, the failure diagnostics are actively misleading, and configuration surfaces
documented in the docs are not wired to anything. That is the characteristic
failure signature of code written faster than it can be exercised.

To be fair: all four were **closed within 2–3 days** of filing. Responsiveness is
genuinely excellent.

---

## 8. Verdict

### Would I bet a project on it?

**No — not as a dependency, and not as a base to fork.** But it is excellent prior
art and I would not have wanted to design our system without reading it.

The case against betting on it, in order of weight:

1. **The verification layer has already failed silently in production.** Issue
   #3254: a failed required gate did not block the merge, and the audit record said
   it did. In a system whose entire value proposition is *checkable* verification,
   a signed receipt over a broken control plane is worse than no receipt — it
   manufactures unearned confidence. That bug shipped in 3.11.0 and survived 38,142
   tests. The lesson generalises: **tamper-evidence is orthogonal to correctness,
   and this project systematically conflates them.**

2. **The flagship differentiator is a stub.** `pass^k` — the thing the README leads
   with after determinism — runs against `MockReplayAdapter`, which returns
   `True, 1.0` unconditionally. I ran it: 100.0%. The documented 80% example is not
   reproducible. Five hardcoded `# Production: swap MockReplayAdapter for the real
   scenario_runner adapter` comments and no code behind them.

3. **The gates that guard the project itself are advisory.** No coverage gate on
   PRs. Mutation testing `|| true` over 7 modules. Fuzzing weekly for 120 seconds
   in a file called `cifuzz-pr.yml`. Strict typing over 4 files. And PRs run an
   impact-map subset, not the suite (7–12 min vs 38–40 min on main). The
   *appearance* of rigour is maintained at a level the enforcement does not reach.

4. **R is a second-class citizen at five levels.** Zero mentions in 700k lines. No
   `LanguageProfile` abstraction — language knowledge is scattered across three
   unrelated partial tables. `NO_PYTHON_FILES` short-circuits five gates.
   `python_changed` is in a frozenset with no extension point. Several gates call
   `ast.parse` directly. Basic R gates are config-only; a first-class R profile is
   a fork.

5. **Architectural mismatch with our design.** Bernstein buys replayability by
   forbidding mid-run re-planning — its own docs say so: *"If an agent discovers
   mid-task that the original plan was wrong, the orchestrator cannot adapt the plan
   on its own."* It takes **one** LLM call to produce a plan and then never
   questions it. Our divergence move is the opposite affordance. We would be
   fighting the grain of the whole system.

6. **Four unreconciled graph models, six `GateResult` classes, two config schemas,
   ~60 shipped-but-unwired API symbols, a 6,541-line god object.** Adopting this
   means owning ~380k lines of real code written faster than anyone could review it,
   by one author, on a ~1 release/day cadence, with 9 watchers.

7. **The user base is single digits.** Not zero — `shanemmattner` and
   `casbrbr-beep` are real and their bug reports are excellent — but 801 stars are
   awesome-list traffic, HN gave it 3 points and 0 comments, and there is not one
   independent blog post, video, or forum thread I could find.

**In fairness**, this is not vapourware and I want to be precise about that. Every
README *capability* I checked (MCP, cluster, air-gap, sandbox backends, signed agent
cards, 47 adapters) has substantive code behind it. The air-gap e2e really runs under
`unshare -n`. Code duplication is 1%. The mock-tautology rate is under 1%. The
maintainer closes P0s in two days. `KNOWN_LIMITATIONS.md` and `WHY_DETERMINISTIC.md`
are more honest than most commercial documentation. The failure mode here is not
fraud; it is **velocity outrunning verification**, which is exactly the failure mode
our project exists to address — making it a useful cautionary specimen as well as a
source of ideas.

### What is worth stealing

**Ideas (high value):**

1. **The coordination projection** (§2a). To claim a repeated-trial metric measures
   the *model* and not your own orchestrator, hash a projection of the run record
   with run-identity, content heads and timing stripped, and model-output events
   keeping every field *except* declared-stochastic payloads — **fail-closed on
   undeclared fields**, so an unnoticed source of orchestrator non-determinism
   invalidates the measurement instead of silently polluting it. This is the best
   idea in the project and it is directly applicable to our fidelity gauges.

2. **`pass^k` as a reporting discipline** (not their implementation). Report the
   all-of-k floor alongside the any-of-k ceiling, and treat the gap as the flakiness
   signal. Steal the honest estimator caveat too: *"a point estimate, not a
   confidence bound … 'floor' means floor relative to best-of-N reporting, not a
   statistical lower bound."*

3. **Sample-size-gated empirical confidence** (§6d). Confidence measured from
   recorded per-decision outcomes in an append-only table, and a query that
   **refuses to answer below a sample-size threshold** rather than returning a
   confident small-n number. ~370 lines, reimplementable in an afternoon, and
   exactly the discipline our confidence gauges need.

4. **The claim/re-derive receipt shape** (§4e). A verdict is a *claim* plus hashed
   inputs; an independent verifier recomputes it. `LadderReceipt.merge_eligible` +
   `derive_ladder_verdict` is the pattern. Combined with #1, this is the whole
   deterministic-verification story worth having.

5. **The empty-diff guard** (§4b). Refuse to pass a non-no-op node with zero
   attributable changed files. Catches the rubber-stamp and the orphan
   auto-completion. Cheap, deterministic, high-value.

6. **File-ownership conflict checking** (§1b). Refuse to dispatch a node whose owned
   files overlap an in-flight node. Deterministic concurrency safety without locks.

7. **The retry escalation ladder** (§4f) — effort ladder then model ladder, keyed on
   `terminal_reason`, with the previous failure injected into the retry prompt and
   backoff implemented by pushing `created_at` into the future.

8. **The `.bernstein/gates/*.py` drop-in convention** (§6b). Extension without
   packaging: a plain Python file in a conventional directory becomes a gate. This
   is how we should let users add R gates.

**Anti-patterns to steal in the negative — arguably the most valuable output:**

- **#2186 is a design lesson we must not repeat.** Acceptance criteria written at
  *decomposition* time that encode exact file paths are a category error: *"The
  manager invents paths at planning time, before any code exists; the repo's actual
  test-layout conventions … are only discoverable at implementation time."* Our
  node-level fidelity criteria must be expressed as properties (a test covering X
  passes) not locations (`tests/test_x.py` exists). This is directly load-bearing
  for our hypothesis-node design.
- **Do not let signing get ahead of correctness.** #3254 is the whole argument.
- **Do not ship an example whose verification silently does nothing** (§4b: 15
  invalid completion signals across 8 headline example plans).
- **Pick one node model.** Four graph representations is what happens when features
  are added faster than they are reconciled.
- **Make your own quality gates blocking, or do not display them.**

**Code we could lift more or less directly** (all Apache-2.0, attribution required):
`core/quality/gate_plugins.py` (138 lines), the `GateResult`/`GateReport`
dataclasses, `core/quality/empirical_confidence.py` (373 lines), the coordination
projection logic inside `eval/bench/reliability.py`, and the `_EFFORT_LADDER` /
`_MODEL_LADDER` escalation function.

### Recommended posture

Treat Bernstein as a **design reference and a cautionary specimen**, not a
dependency. Read `WHY_DETERMINISTIC.md`, `KNOWN_LIMITATIONS.md`,
`docs/eval/reliability.md`, and issues #2179 / #2186 / #3254 / #3255 in full. Lift
the five or six ideas above at the interface level. Do not fork 380k lines, and do
not build an R workflow on a verification layer that assumes Python in five places
and whose merge gate has already been observed to not gate.

---

## What I could NOT verify

Stated explicitly, as requested:

- **PyPI download counts.** `pypistats.org` returned HTTP 429. I know there are 148
  releases and the current version is 3.13.0, but I have no adoption number from
  package downloads.
- **Branch protection settings.** `gh api repos/.../branches/main/protection`
  returns 404 for an unauthenticated-for-that-repo caller, so I could not confirm
  which CI checks are *required* contexts. My claim that coverage cannot gate PRs
  rests on the coverage job being push-to-main-only and `continue-on-error: true`,
  which is sufficient — but the general branch-protection posture is unknown.
- **Whether `golden-v1` is ever run against a real agent anywhere outside the CLI.**
  I verified the CLI cannot do it and found no such code path, but I did not
  exhaustively audit `eval-nightly.yml`'s runtime behaviour.
- **Star provenance.** I did not sample the 801 stargazers, so "aggregator-driven"
  is an inference from the coverage profile (20+ awesome lists, 9 watchers, 3-point
  HN post), not a measurement.
- **Real-world performance.** I ran only the `bench run --reliability` command and a
  single unit-test file. I did not run an end-to-end orchestration against a real
  coding agent, so I cannot speak to whether it works well in practice on a real
  repo — only to what the code and the external bug reports say.
- **The `rag_challenge` figures** underpinning `WHY_DETERMINISTIC.md`. The author
  states no raw data was published; I could not corroborate any of it.
- **`docs/mentions.md`** — I did not verify each of the ~20 claimed listings
  individually; I spot-checked the coverage profile via search and found only
  aggregators and listicles.

---

**STATUS: COMPLETE**
