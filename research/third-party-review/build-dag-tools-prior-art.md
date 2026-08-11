# Build/DAG tools as an orchestration substrate

> Research subagent report, 2026-08-08, commissioned for the "lean on existing code" architecture review.
> External research only. Sister reports in this directory.
> Caveat: web-search budget was exhausted during several of these runs — see notes in the body.

I have enough material. Note upfront: **WebSearch budget was exhausted for this session**, so all findings below come from direct doc-site fetches and the GitHub API (`gh`) — no blog/forum coverage. Where that limits a claim I say so.

---

# Prior art: DVC, Make, just, doit, luigi, ploomber, drake

## Cross-cutting finding (read this first)

Every tool here answers **"is target T stale?"** with a **boolean**. Not one carries a graded state. Doktoreltern's *fidelity* and *confidence* gauges are continuous/ordinal — you would be encoding them into the tool's opaque hash and getting back one bit. Second: none of these has a *scheduler* in your sense. Make/doit/DVC compute the stale closure and run **all** of it in topological order; luigi's scheduler exists for locking and concurrency, not for **selecting the next node worth working on**. "Pick the highest-value node given confidence, fidelity, and cost" has no home in any of them.

Third: all six assume **work is a subprocess that writes files**. That is survivable — `claude -p` is a subprocess — and one project in the wild already does exactly this (see [create-mvp](#prior-art-the-one-real-hit) below).

---

## 1. DVC

**Repo:** `https://github.com/treeverse/dvc` — **note: `iterative/dvc` now redirects to `treeverse/dvc`**. The owning org is `treeverse` ("lakeFS by Treeverse"). This is a real governance change: DVC is no longer an Iterative-owned project. **Docs:** `dvc.org` redirects to `https://doc.dvc.org`.

**Version/license/maturity:** 3.67.1, released **2026-03-31**; Apache-2.0; 15.8k stars; last push 2026-08-07; 195 open issues. Actively committed to, but note the release cadence has thinned (3.66.0 in Jan 2026, 3.67.x in Mar 2026, nothing since) and the project changed corporate homes. For a decade-long dependency, that's a yellow flag, not a red one.

**Solo-dev footprint:** CLI only, no daemon, no server. Python package (`pip install dvc`, requires-python ≥3.9) — but a *fat* one; it pulls a large dependency tree. Requires a **git repo** (DVC is structurally parasitic on git). Remote storage is optional; local-only works fine. State lives in `.dvc/` plus SQLite databases in a site-cache dir for hash/link state ([internal-files](https://doc.dvc.org/user-guide/project-structure/internal-files)). Laptop-friendly, but heavy for what you'd use.

**Invalidation — precise.** Content hashing, not mtime. `dvc.yaml` declares stages; `dvc.lock` records MD5/etag hashes of every dep and out plus the resolved param values and the `cmd`:

```yaml
# dvc.lock
schema: '2.0'
stages:
  features:
    cmd: jupyter nbconvert --execute featurize.ipynb
    deps:
      - path: data/clean
        md5: d8b874c5fa18c32b2d67f73606a1be60
    outs:
      - path: features
        md5: 2119f7661d49546288b73b5730d76485
```

`dvc repro` walks stages and compares live hashes against `dvc.lock` ([repro](https://doc.dvc.org/command-reference/repro)). Notable behaviours:

- **`params`** give *sub-file* granularity — a stage depends on `nn.epochs` in `params.yaml`, not the whole file. This is the single best idea in DVC for your use case: fine-grained upstream dependency without file-splitting.
- **"Stages without dependencies nor outputs are considered always changed, so `dvc repro` always runs them."**
- **`always_changed: true`** — "Treats stage as perpetually changed" ([dvcyaml-files](https://doc.dvc.org/user-guide/project-structure/dvcyaml-files)).
- **`frozen: true`** — pins a stage so `repro` will not run it. This is the closest thing in any of these tools to "a human has adjudicated this node; stop re-deriving it."
- **Run cache** (`.dvc/cache/runs`): every run's signature is logged, so *"Every subsequent time a stage runs under the same conditions, the previous results can be restored instantly"* ([run-cache](https://doc.dvc.org/user-guide/pipelines/run-cache)). Content-addressed memoisation across branches and machines.

**Provenance.** Genuinely the best of the six. `dvc.lock` is a plain YAML file you commit to git, so **lineage is versioned in the VCS** — `git log dvc.lock` is a real provenance query. `dvc dag` emits ASCII, `--dot`, or `--mermaid`, "as defined in the `dvc.yaml` files found in the project" ([dag](https://doc.dvc.org/command-reference/dag)) — i.e. static derivation, no execution. `dvc status` reports per-stage `changed deps` / `changed outs`. There is no "why exactly did this hash change" diff tool, though; you get "modified: baz" and that's it.

**Static vs dynamic DAG — the blocker.** DVC's DAG is **wholly static**, read from `dvc.yaml` before anything runs. `foreach` and `matrix` are *template expansion at parse time*:

```yaml
stages:
  cleanups:
    foreach: [raw1, labels1, raw2]
    do:
      cmd: clean.py "${item}"
      outs:
        - ${item}.cln
```

`dvc.lock` stores the **expanded** stages — "no foreach/matrix constructs preserved". So a stage cannot discover, at run time, that it needs three children. To grow the graph you must have a stage rewrite `dvc.yaml` and then re-invoke `dvc repro`. That works (it's the same trick create-mvp plays with Make) but DVC gives you no support for it, and re-parsing a mutated `dvc.yaml` mid-`repro` is not a thing.

**Human-in-the-loop / non-determinism.** No pause primitive. Two partial escapes: `always_changed: true` (node is never trusted — burns an agent call every time) and `frozen: true` (node is permanently trusted). Both are the wrong shape: you want "trusted until upstream fidelity drops", which is exactly what DVC's hashing gives you *for deterministic commands only*. A non-deterministic stage (an LLM writing code) breaks the contract: DVC assumes same inputs ⇒ same outputs, and the run cache will happily restore a *previous* agent's output for identical inputs. Sometimes that's what you want; sometimes it silently prevents a retry.

**Verdict.** **Reuse the ideas, not the tool.** Steal: content-addressed hashing of deps; `params`-style sub-file granularity; `dvc.lock`-in-git as provenance; `frozen`. Reject: static DAG, git-coupling, boolean staleness, no scheduler. Adopting DVC would mean expressing hypotheses as YAML stages and file artifacts, and you'd still hand-roll the scheduler, the gauges, and the DAG growth. Net negative.

---

## 2. GNU Make

**Docs:** `gnu.org/software/make/manual/` (that host rate-limited me hard; I verified the quotes below against the [MIT mirror of the GNU make manual](https://web.mit.edu/gnu/doc/html/make_4.html), which is an older 3.x edition — the semantics quoted are unchanged, but treat the exact wording as edition-approximate). **Version:** 4.4.1 is current per [repology](https://repology.org/project/make/versions) — released 2023, no newer upstream. GPL-3.0. Maturity: total. Governance: GNU, glacial.

**Solo-dev footprint:** Zero. Already installed. No daemon, no DB, no runtime. The lightest possible option by an enormous margin.

**Invalidation — precise, and precisely limited.** mtime only:

> "A target is out of date if it does not exist or if it is older than any of the dependencies (by comparison of last-modification times)."

Why fragile for you: (a) a touched-but-unchanged file invalidates; (b) an edit that reverts a file to a prior state still invalidates; (c) filesystem timestamp granularity and clock skew produce false negatives; (d) there is **no** notion of "the recipe text changed" — edit the command in the Makefile and Make will not rebuild. That last one is fatal for LLM work, where the *prompt* is the thing that changes most often. Every serious use works around it by hashing the recipe into a dependency file yourself.

`.PHONY`:

> "When it is time to consider such a target, `make` will run its commands unconditionally, regardless of whether a file with that name exists or what its last-modification time is."

Order-only prerequisites (`targets : normal-prereqs | order-only-prereqs`, added in 3.80) mean "must exist/be built first, but its mtime does not invalidate me" — the standard idiom for directories. I could not fetch the modern `Prerequisite-Types.html` page (gnu.org 429'd repeatedly), so I'm stating this from knowledge rather than a verified quote; verify before relying on it.

The **empty/stamp target** idiom is the load-bearing one for agent work:

```makefile
print: foo.c bar.c
        lpr -p $?
        touch print
```

> "The purpose of the empty target file is to record, with its last-modification time, when the rule's commands were last executed."

This is how you represent "a node was worked" when the work produces no single file. `$?` — "only the prerequisites newer than the target" — is a genuinely useful primitive: it tells the recipe *which* upstreams changed, which is the closest thing in Make to a fidelity signal.

**Provenance.** None. Make retains **nothing** between runs except the mtimes on disk. No database, no history, no "why did this rebuild" (`--debug` explains the current decision only, and is not machine-readable). This is a hard no for your provenance requirement.

**Static vs dynamic DAG.** Statically parsed — **but** Make has a genuine self-modification escape hatch that no other tool here matches: `include`d makefiles are themselves targets, and if Make rebuilds any of them, **it re-executes itself from scratch with the new files**. That is exactly "the DAG grows because an executed node emitted new graph":

```makefile
-include build/components.mk        # if this gets (re)built, make restarts

build/components.mk: build/plan.json
	jq -r '...' $< > $@
```

This is real, documented, and battle-tested. It is a restart, not an in-place mutation — every restart re-evaluates the whole graph — which is fine at your scale (tens of nodes) and terrible at thousands.

**Human-in-the-loop / non-determinism.** No pause primitive; a recipe that blocks on stdin blocks the whole build (and deadlocks under `-j`). The workable pattern is: the gate is a **file the human creates** (`approved/node-17.ok`), the downstream target depends on it, and `make` simply stops with "no rule to make target" or you provide a rule that prints instructions and fails. Non-determinism is fine in the sense that Make doesn't care what the recipe does — but `.DELETE_ON_ERROR` is essential so a failed agent never leaves a half-written artifact that counts as done.

**Verdict.** **The strongest reuse candidate on this list, and simultaneously not enough.** What you'd get free: topological ordering, `-j` parallelism, restart-on-regenerated-include (dynamic growth), `.DELETE_ON_ERROR`, `$?`. What you'd still build: all content hashing (mtime is unusable for prompt/code changes), all provenance, all state, both gauges, and the actual scheduler. You'd be using Make as a *dependency-ordered executor* and keeping your Python node store as the brain. That's a defensible architecture — but note you already have the executor part working, so the marginal gain is `-j` and restart semantics.

---

## 3. just

**Repo:** [github.com/casey/just](https://github.com/casey/just) — CC0-1.0, 35.2k stars, **1.58.0 released 2026-08-03**, extremely active. **Docs:** [just.systems/man/en](https://just.systems/man/en/).

**Footprint:** single static Rust binary. Nothing else. Lighter than DVC, heavier than Make only in that it isn't preinstalled.

**Staleness: NONE. Confirmed.** Your suspicion is correct and the manual says so directly:

> "`just` is a command runner, not a build system, so it avoids much of make's complexity and idiosyncrasies. No need for `.PHONY` recipes!"

and, on the idiosyncrasies page, "**all recipes are treated as if they were phony**" — [what-are-the-idiosyncrasies-of-make-that-just-avoids](https://just.systems/man/en/what-are-the-idiosyncrasies-of-make-that-just-avoids.html). No timestamps, no targets, no files tracked at all.

The only execution-graph semantics it has is **dependency ordering with per-invocation dedup**:

> "In a given invocation of `just`, a recipe with the same arguments will only run once, regardless of how many times it appears in the command-line invocation, or how many times it appears as a dependency."

```justfile
build:
  cc main.c

test-foo: build
  ./a.out --test foo

test-bar: build
  ./a.out --test bar
```

`just test-foo test-bar` runs `build` once. That memoisation is **within one process only** — nothing persists.

**Provenance:** none. **Dynamic DAG:** none. **HITL:** recipes are interactive-friendly (it's a command runner, blocking on stdin is normal), which is the one thing it does better than Make.

**Verdict.** **Not a scheduler. Zero reuse as a DAG engine.** It is, however, a perfectly good *front door* — `just plan`, `just work <node>`, `just review` wrapping your Python CLI. That's an ergonomics decision, not an architecture one.

---

## 4. doit

**Repo:** [github.com/pydoit/doit](https://github.com/pydoit/doit) — MIT (copyright line reads "2008-2026 Eduardo Naufel Schettino"), 2.1k stars, last push 2026-02-12, 94 open issues. **Version 0.37.0 on PyPI, uploaded 2026-02-09**, requires-python ≥3.10. **Docs:** [pydoit.org](https://pydoit.org). Maturity: 18 years old, stable, but effectively **single-maintainer** — the key bus-factor risk on this list.

**Footprint:** pure Python library + CLI. No daemon, no server. State in a single `.doit.db` (backends: dbm, json, sqlite3). You already have a Python scheduler, so this is the only tool here that would live *inside* your process rather than beside it. That matters a lot.

**Invalidation — the richest model of the six.** Per [dependencies](https://pydoit.org/dependencies.html):

- **`file_dep`** — "a task is not up-to-date when a file_dep changed since last successful execution." Change detection is configurable via `check_file_uptodate` (md5 by default, timestamp available) — the `reset-dep` docs describe recomputing "(timestamp, md5sum, … depending on the `check_file_uptodate` setting)". So: **content hashing, unlike Make.**
- **`targets`** — "A missing target is enough to determine that a task is not up-to-date."
- **`task_dep`** — ordering only: "task-dependencies are **not** used to determine if a task is up-to-date or not." (This is a genuine footgun; it's Make's order-only, as the default meaning of "depends on".)
- **`result_dep`** — the interesting one. It compares *the return value of another task* between runs, and reruns only if the upstream **result** changed. This is a value-level, not file-level, invalidation edge. It is the closest primitive in any of these six tools to "upstream node's conclusion changed, so my fidelity degrades."
- **`calc_dep`** — a task computes another task's dependency set at run time.
- **`uptodate`** — accepts `True`, `False`, `None`, **arbitrary callables**, or shell commands. `True` = up to date, `False` = not, `None` = ignored. Built-ins: `run_once()`, `timeout(seconds|timedelta)`, `config_changed(str|dict)` (dicts serialised via "json.dumps() with sort_key=True"), `check_timestamp_unchanged(path, cmp_op=operator.eq)`.

**`uptodate` taking a Python callable is the single most relevant fact in this entire report.** You can write:

```python
def task_node_17():
    return {
        'actions': [run_agent_on_node, 'node-17'],
        'file_dep': ['nodes/17/node.md'],
        'targets': ['nodes/17/result.json'],
        'uptodate': [lambda task, values: fidelity('17') >= 0.8],
    }
```

i.e. **your own fidelity gauge becomes the staleness predicate.** No other tool here lets you plug arbitrary Python judgement into the invalidation decision. Everything else demands you encode state into hashes.

**Provenance.** `.doit.db` holds per-task success timestamps, dep hashes, and `save_out`/returned values. Queryable: **`doit info <task>`** shows a task's status *and the reason it is not up to date*; `doit list --status` marks each task R/U/I; **`doit dumpdb`** prints the binary DB as readable text ([cmd-other](https://pydoit.org/cmd-other.html)). Better introspection than Make or luigi; weaker than DVC-in-git (the DB is local state, not versioned lineage). `doit forget` / `doit reset-dep` / `doit ignore` give you manual override of the state — useful for "I've adjudicated this."

**Static vs dynamic DAG — this is where doit earns its place.** Task creators normally all run at load time, but [`@create_after`](https://pydoit.org/task-creation.html) defers a creator until a named task has executed:

```python
import glob
from doit import create_after

@create_after(executed='early', target_regex='.*\.out')
def task_build():
    for inf in glob.glob('*.in'):
        yield {
            'name': inf,
            'actions': ['cp %(dependencies)s %(targets)s'],
            'file_dep': [inf],
            'targets': [inf[:-3] + '.out'],
            'clean': True,
        }

def task_early():
    """a task that create some files..."""
    inter_files = ('a.in', 'b.in', 'c.in')
    return {
        'actions': ['touch %(targets)s'],
        'targets': inter_files,
        'clean': True,
    }
```

Semantics: `task_build`'s body is not evaluated until `early` has run; it can then inspect the filesystem (or your node store) and yield an arbitrary number of new sub-tasks — **in the same process, in the same run**. This is real mid-run graph growth, not a restart.

**Limits, stated in the docs:**
- `target_regex` exists because doit can no longer statically know what the delayed task produces; **"These `task_dep` relations are NOT computed for delayed-task's targets"** — automatic implicit dependency inference is switched off for delayed tasks, for performance reasons. You must wire dependencies explicitly.
- If the delayed creator yields task *names* different from the creator function's own name, you must declare them via `creates=['taskname']`.
- Growth is gated on a **named** predecessor task. You can nest (`@create_after` on a delayed task) but each level needs an explicit trigger, so "arbitrary-depth recursive splitting" needs a fixed recursion scaffold or repeated invocations.

**Human-in-the-loop / non-determinism.** `uptodate=False` forces a rerun; `run_once()` marks "do this exactly once, ever"; `timeout()` expires a result after a wall-clock interval (a crude but real *decay* primitive — "this node's fidelity lapses after 7 days"). Actions are Python callables, so a blocking prompt is trivially supported. Non-determinism is not a violation: doit never assumes same-inputs⇒same-outputs the way DVC's run cache does; it only records that a task succeeded and what its deps hashed to.

**Verdict.** **The one genuine reuse candidate.** It is a Python library, it hashes content, it supports arbitrary Python up-to-date predicates (= your fidelity gauge), it has value-level `result_dep` edges, it has real mid-run DAG growth, and it has an inspectable state DB with a "why is this not up to date" command. What you'd still build: the **scheduler** (doit runs everything stale, in topological order; it has no notion of picking the *most valuable* node), the confidence/fidelity model itself, and the gate semantics. Realistically: **reuse doit's dependency/up-to-date engine, keep your own scheduler on top.** The risk is bus factor — one maintainer, 0.x version number after 18 years.

---

## 5. luigi

**Repo:** [github.com/spotify/luigi](https://github.com/spotify/luigi) — Apache-2.0, 18.8k stars, last push 2026-07-18, 165 open issues. README: "Arash Rouhani was the chief maintainer from 2015 to 2019, and now Spotify's Data Team maintains Luigi." Corporate-maintenance mode; alive but not evolving. **Docs:** [luigi.readthedocs.io](https://luigi.readthedocs.io/en/stable/).

**Footprint — bad for a solo dev.** There is a **central scheduler daemon, `luigid`**, which exists to "Make sure two instances of the same task are not running simultaneously" and "Provide visualization of everything that's going on." It persists to a state file (`state-path`), serves a web UI on :8082, and optionally logs task history to a **relational database**. `--local-scheduler` avoids all of it, but the docs are explicit: *"While the `--local-scheduler` flag is useful for development purposes, it's not recommended for production usage."* And crucially: *"The central scheduler does not execute anything for you or help you with job parallelization"* — triggering is your problem (cron or a long-running process). So you get a daemon that does *not* do the thing you want a scheduler for.

**Invalidation — the weakest model here.** From `luigi/task.py`:

```python
def complete(self):
    """
    If the task has any outputs, return ``True`` if all outputs exist.
    Otherwise, return ``False``.

    However, you may freely override this method with custom logic.
    """
    outputs = flatten(self.output())
    if len(outputs) == 0:
        warnings.warn("Task %r without outputs has no custom complete() method" % self, stacklevel=2)
        return False

    return all(map(lambda output: output.exists(), outputs))
```

And the `output()` docstring: *"The output of the Task determines if the Task needs to be run--the task is considered finished iff the outputs all exist."*

That is **existence only**. No content hashing, no mtime, no parameter tracking beyond the fact that task *identity* includes its parameters (so `MyTask(date=2026-08-08)` and `MyTask(date=2026-08-07)` are different tasks with different outputs). **Change an upstream file's contents and luigi will not notice.** Luigi is a *scheduler for idempotent, parameter-keyed batch jobs*, not an incremental build system. For "fidelity degrades when upstream changes", this is a non-starter — you'd override `complete()` entirely, at which point you've written the invalidation engine yourself.

You *can* override `complete()` with arbitrary Python — same escape hatch as doit's `uptodate` — but you'd be using none of luigi's actual machinery.

**Provenance.** Optional task-history DB behind `/history` endpoints in luigid; event hooks and `luigi.notifications`. Requires the daemon + a database. Heavy, and shallow — execution records, not lineage.

**Static vs dynamic DAG — genuinely dynamic, and this is luigi's one real strength for you.** Two mechanisms:

1. `requires()` can `yield` — dependencies computed at graph-build time:
```python
class AllReports(luigi.WrapperTask):
    date = luigi.DateParameter(default=datetime.date.today())
    def requires(self):
        yield SomeReport(self.date)
        yield SomeOtherReport(self.date)
        yield CropReport(self.date)
```
2. **True dynamic dependencies from `run()`** ([tasks.rst](https://raw.githubusercontent.com/spotify/luigi/master/doc/tasks.rst)): *"Sometimes you might not know exactly what other tasks to depend on until runtime. In that case, Luigi provides a mechanism to specify dynamic dependencies. If you yield another Task in the Task.run method, the current task will be suspended and the other task will be run."*
```python
class MyTask(luigi.Task):
    def run(self):
        other_target = yield OtherTask()
        f = other_target.open('r')
```

This is the cleanest expression of "a running node discovers it must split" in any tool surveyed. The task **suspends**, the new task runs, the task **resumes**. Caveat from the docs: when using dynamic dependencies you should set `cache_task_completion` in the worker config, because resumption re-invokes `complete()` repeatedly. Also, a suspended task's `run()` is re-entered from the top on resume in some worker configurations — a well-known source of surprise; I could not verify the exact current semantics from the docs I fetched, so verify before designing around it.

**HITL.** No pause primitive. A task that blocks holds a worker slot indefinitely and the central scheduler will eventually mark it stale/failed depending on config. Non-determinism is fine (luigi never assumes reproducibility) — which is the flip side of its weak invalidation.

**Verdict.** **Do not reuse.** You'd take on a daemon and a state DB to get a scheduler that doesn't schedule the way you need, plus an invalidation model (existence-only) that is strictly weaker than what you already have. **Steal exactly one idea:** the `yield Task()` suspend/resume protocol for a node that discovers sub-nodes mid-execution. That is worth copying into your Python scheduler.

---

## 6. ploomber

**Dead. Stop here.**

[github.com/ploomber/ploomber](https://github.com/ploomber/ploomber) — **archived by the owner on 2025-07-12, read-only**. Apache-2.0, 3.6k stars, last push 2025-05-29, 110 open issues left hanging. The documentation site **`docs.ploomber.io` no longer resolves** (DNS failure; `ploomber.readthedocs.io` 302s to the dead host). The company pivoted to a hosted product and abandoned the OSS pipeline framework.

For the record, the README claimed: *"Automatically cache your pipeline's previous results and only re-compute tasks that have changed since your last execution"* — source-code-change detection over notebook/script tasks, with metadata in a per-product `.metadata` sidecar. I **cannot verify the mechanism's details** because the docs are gone.

**Verdict.** Not a candidate. Its only residual value is as a cautionary data point: a VC-backed OSS pipeline framework whose docs evaporated within two years of the pivot. That's an argument for depending on Make (GNU, unkillable) or doit (MIT, tiny, vendorable) over anything with a company behind it.

---

## 7. drake (brief — the "what NOT to build" lesson)

[github.com/ropensci/drake](https://github.com/ropensci/drake) — GPL-3.0, 1339 stars, **superseded 2021-01-21**, last push 2024-12-04, 0 open issues (i.e. closed out, not triaged). README: *"drake is superseded. Consider targets instead."*

The [targets book's drake chapter](https://books.ropensci.org/targets/drake.html) is unusually candid, and it is a direct list of design mistakes you are at risk of repeating:

> "Nearly four years of community feedback have exposed major user-side limitations regarding data management, collaboration, dynamic branching, and parallel efficiency. Unfortunately, these limitations are permanent."

...because fixing them "would make the package incompatible with existing projects" and "the internal architecture is too copious, elaborate, and mature for such extreme refactoring."

The specific failures, mapped to your design:

1. **Ambient-environment invalidation.** drake's `make()` "looks for functions and global objects in the parent environment of the calling R session," so a stale session **incorrectly invalidates** targets, and users "must remember to restart the session before calling `make()`." → *Your lesson: a node's inputs must be an explicit, closed, serialisable set. If fidelity depends on anything ambient — the agent's context window, the current git worktree, whatever files happened to be open — you have built drake.*

2. **Opaque cache.** "an intricate file system in a hidden `.drake` folder" with "multiple files for each target" whose "names are not informative", defeating version control, collaboration, corruption recovery, and cleanup. → *Your lesson: the node store must be human-readable and diffable. Your `nodes/<id>/node.md` layout is already the right instinct; do not let a binary/hashed sidecar become the real state.*

3. **Staged dynamic branching.** "all the sub-targets of a dynamic target must complete before the pipeline moves on to downstream targets" — catastrophic when sub-task runtimes vary wildly. → *Directly relevant: when a hypothesis splits into N children with wildly different agent costs, do not barrier on all N before any downstream node can proceed.* Also, drake's branching "can only support one single method of slicing and aggregation."

4. **No memory of prior global state.** drake "loses track of [globals'] previous state from the last run of the pipeline," so it cannot explain *why* a target needs rerunning. → *Your lesson: persist the previous fidelity inputs, not just the current verdict. "Why did this node go stale?" must be answerable. This is what doit's `doit info` gets right and Make gets catastrophically wrong.*

5. **DSL overreach.** `drake_plan()`'s "elaborate domain specific language" was "extremely difficult to understand and error prone" and blocked users' own metaprogramming. → *Your lesson: keep the node grammar plain text and boring.*

---

## Prior art: the one real hit

**GNU Make orchestrating AI coding agents — [qwadratic/create-mvp](https://github.com/qwadratic/create-mvp)** (2 stars, found via GitHub repo search). Tagline: *"Agents write the DAG. `make` runs the agents. A ~120-line Makefile engine: goal file → planning agent → parallel, resumable, gate-checked build swarm."*

This is close enough to your design that you should read its `engine/build.mk` before writing more scheduler code. How it works:

- A **planning agent** decomposes a goal into `build/plan.json`. A single `jq -r` line generates `components.mk` from that plan; Make's `-include` causes **make to restart itself with a DAG shaped exactly like the decomposition**. The LLM never writes Makefile syntax — it emits JSON, and a deterministic transform produces the graph. That separation (LLM proposes, deterministic code compiles to graph) is exactly the "deterministic gates" property you want.
- **Resumability** via `.done` sentinel files per component (`build/life-engine.done`), with `.DELETE_ON_ERROR` so "a failed agent never counts as done, and rerunning `make` resumes where it stopped."
- **Gates** are exit codes: "every eval's exit code is its verdict, so any of them can sit on a recipe line as a gate." Each component must pass `src/<id>/check.sh` before its `.done` is created.
- **Parallelism** is just `make -j`.
- **Recursive growth**: components can be `"kind": "composite"` with a `sub_goal`; "a subtree is planned when its turn comes", bounded by `AGENTMAKE_MAXDEPTH` (default 3) and a fanout cap, with the child's effort tier clamped to the parent's.
- **Explicit cost knob**: `--budget s|m|l` written to `build/effort.json`, selecting model per agent and review depth — "Effort is an explicit knob, not an inference."

Its own README notes the trust boundary: "The system treats LLM outputs as trust boundaries, restricting where prompt results splice into shell recipes and make targets." (Rightly — `jq`-generating Makefile rules from LLM JSON is an injection surface; they validate component IDs against a charset.)

**What it does not have:** graded confidence/fidelity (a `.done` file is a boolean), any provenance beyond mtimes, and any scheduler that *chooses* — Make builds everything stale.

## Prior art: what I looked for and did not find

Searches run via the GitHub repositories API (WebSearch unavailable, so **no blog/forum/conference coverage is represented here** — absence below is weaker evidence than it would otherwise be).

- **pydoit + LLM/agents:** `total_count: 0`. Nothing at all.
- **DVC + LLM:** only tiny (0–15 star) *model-training* pipelines — `alex000kim/ML-Pipeline-With-DVC-SkyPilot-HuggingFace` (15★), `Aziz-Benamira/sentiment-analysis-dvc-pipeline`, `joinhardik/llm-eval-guardrail-engine` ("deterministic DVC pipeline DAG to isolate compute costs and automate regression testing"). These use DVC to version fine-tuning runs. **None orchestrates an LLM *agent* as a graph node.**
- **Make/DAG + Claude Code/coding agents:** `create-mvp` and nothing else.
- **luigi + LLM agents:** nothing relevant surfaced.
- **"Human decision as a pipeline dependency" / manual approval gates:** every hit is a **CI/CD platform** feature — Jenkins `input` steps, GitHub Actions environments with required reviewers, AWS CodePipeline approval actions, GCP Cloud Deploy promotions. **Zero** hits for a manual approval gate in a *build-system DAG engine* (Make/DVC/doit/luigi). The only DAG-engine-with-HITL project found was [onblueroses/pipewright](https://github.com/onblueroses/pipewright) (0★, TypeScript, MIT) — "Lightweight TypeScript DAG workflow engine with typed nodes and human-in-the-loop approval gates". A 0-star repo is not prior art; it's a coincidence.

**Plain statement: the pattern you are building has essentially no prior art in the build-tool space.** One 2-star Makefile project. That's it.

---

## Blunt verdict

| Tool | Reuse? | Why |
|---|---|---|
| **doit** | **Yes — the engine, not the scheduler** | Python library, content hashing, `uptodate=<callable>` accepts your fidelity gauge, `result_dep` value-level edges, `@create_after` real mid-run DAG growth, `doit info` explains staleness. Risk: single maintainer, 0.37.0. |
| **GNU Make** | **Ideas + possibly as executor** | Free topo-sort, `-j`, `.DELETE_ON_ERROR`, `$?`, and the `-include`-triggers-restart trick for growing the DAG. But mtime-only invalidation is unusable (recipe/prompt changes don't invalidate) and it retains zero provenance. |
| **DVC** | **Ideas only** | Steal: content-addressed hashing, `params` sub-file granularity, `dvc.lock`-in-git as provenance, `frozen`. Reject the tool: static DAG, git-parasitic, heavy, and it just changed owning org (`iterative` → `treeverse`/lakeFS). |
| **luigi** | **One idea** | The `yield Task()` suspend/resume protocol for mid-run splitting. Everything else is worse than what you have, and it wants a daemon. Existence-only completion is a non-starter. |
| **just** | **No (as a DAG engine)** | Confirmed: no staleness whatsoever, "all recipes are treated as if they were phony". Fine as a CLI front door. |
| **ploomber** | **No** | Archived 2025-07-12; docs domain dead. |
| **drake** | **No** | Superseded 2021. Read its post-mortem, don't use it. |

**Overkill/mismatch assessment.** DVC and luigi are overkill *and* mismatched — they solve data-versioning and distributed-batch-scheduling respectively, neither of which is your problem. Make and just are undersized but honest. **doit is the only one in the right weight class and the right shape**, because it is a library rather than a system, and because `uptodate` is a Python callable rather than a hash comparison — that single design choice is what lets your continuous fidelity gauge drive a boolean staleness engine without lying to it.

**What you would still build regardless of which you pick:** the scheduler that *selects* the next node (none of these choose; they all just run the whole stale closure), the confidence/fidelity model, the gate semantics, and the human-pause protocol. That's the majority of the value in Doktoreltern, and no surveyed tool contributes to it.

**Concrete recommendation:** do not swap out your hand-rolled scheduler. Consider narrowing your hand-rolled component to *selection + gauges* and delegating *dependency tracking and up-to-date determination* to doit, whose `uptodate` hook is designed for exactly this handoff. Before committing, read `engine/build.mk` in [qwadratic/create-mvp](https://github.com/qwadratic/create-mvp/blob/main/engine/build.mk) — it is the only working example of this architecture anyone has published, and it validates the "LLM emits JSON → deterministic transform compiles the graph → exit codes are gates" pattern that your deterministic-gates requirement implies.

**Caveat repeated:** WebSearch was exhausted, so this survey covers official docs, GitHub API metadata, and GitHub repo search only. Blog posts, mailing lists, and conference talks about Make/doit/DVC-driving-LLM-agents may exist and would not have surfaced here. The order-only-prerequisite semantics for Make are stated from knowledge, not a verified quote (gnu.org rate-limited every attempt).
