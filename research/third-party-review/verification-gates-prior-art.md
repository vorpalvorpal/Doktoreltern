# Deterministic verification and gating machinery

> Research subagent report, 2026-08-08, commissioned for the "lean on existing code" architecture review.
> External research only. Sister reports in this directory.
> Caveat: web-search budget was exhausted during several of these runs — see notes in the body.

# Deterministic verification & gating machinery — prior-art survey

*Research method note: three parallel research threads plus direct fetches. The session's web-search budget was exhausted partway through, so the later portions lean on direct page fetches. Items I could not verify to a solid standard are flagged **[verify]**. Dates are as reported by canonical pages on 2026-08-08.*

---

## 1. Generic CI/gate runners — which gives a language-agnostic, locally-runnable, cacheable gate DAG?

| Tool | URL | License | Maturity | DAG? | Caching | Local | Verdict |
|---|---|---|---|---|---|---|---|
| **pre-commit** | [pre-commit.com](https://pre-commit.com) | MIT | Very mature, huge hook ecosystem | No (flat list, sequential) | Per-hook venv cache only; `--files`/staged-file scoping | Yes | **Adopt as the fast tripwire layer.** Exit 1 on any failure. Output is human text — no JSON. Python runtime dependency. First run slow (env builds). |
| **lefthook** | [evilmartians/lefthook](https://github.com/evilmartians/lefthook) | MIT | Mature, ~8k★, single Go binary | No (parallel groups, not a DAG) | None | Yes | Faster than pre-commit, no runtime dep, parallel by default. Smaller ecosystem — you supply the commands. Good pairing: thin hooks that call `mise` tasks. |
| **mise tasks** | [mise.jdx.dev/tasks](https://mise.jdx.dev/tasks/) | MIT | Active, mainstream | **Yes** — `depends`, `depends_post`, `wait_for`; builds a real DAG, parallel execution | **Yes** — `sources` + `outputs` globs; skips when outputs newer than sources; `outputs = { auto = true }` hashes the task definition | Yes | **Best cost/benefit for your case.** Also pins toolchain versions (`tools`), so the gate runs with the same R/Python everywhere. Timestamp-based, not content-hash. |
| **go-task** | [taskfile.dev](https://taskfile.dev/docs/guide) | MIT | Mature | Yes (`deps`) | **Content checksums** in `.task/` — more reliable than Make's timestamps | Yes | Close second to mise. Known wart: `generates:` only verifies a glob matched *something*, so deletions go undetected ([#2181](https://github.com/go-task/task/issues/2181)). |
| **just** | [casey/just](https://github.com/casey/just) | CC0 | Mature | Recipe deps, yes | **None** — no incrementality at all | Yes | A nicer `make` for command discovery. Not a gate engine. |
| **tox / nox** | tox.wiki / nox.thea.codes | MIT / Apache-2.0 | Very mature | Envs, not a DAG | Env reuse only | Yes | Python-only. Irrelevant for R. |
| **Earthly** | [earthly/earthly](https://github.com/earthly/earthly) | BUSL/MPL | **Dead.** Earthly Cloud shut down 2025-07-16; OSS repo frozen to "critical bug fixes only", PRs no longer reviewed ([announcement](https://earthly.dev/blog/shutting-down-earthfiles-cloud/)) | — | — | — | **Do not adopt.** They themselves point migrants at Dagger. |
| **Dagger** | [dagger/dagger](https://github.com/dagger/dagger) | Apache-2.0 | Active, ~16k★, 8 SDKs (Go/Python/TS/PHP/Java/.NET/Elixir/Rust) | **Yes** — BuildKit DAG | **Best in class** — content-addressed, every op keyed by inputs, layer + volume + function-call caching, persists across local and CI runs | Yes, identical locally and in CI | **The technically correct answer, at real cost.** See below. |
| **act** | [nektos/act](https://github.com/nektos/act) | MIT | Active | Workflow graph | Docker layer only | Yes | Linux runners only; default images lack GHA tooling; services unsupported; matrix jobs share a network namespace. **A debugging aid for workflows, not a gate engine.** |
| **Bazel / Pants / Nx / Turborepo / moon** | — | Apache-2.0 mostly | Mature | Yes, hermetic, remote cache | Excellent | Yes | Correct but wildly disproportionate for solo R/Python. Skip. |
| **`targets` (R)** | [books.ropensci.org/targets](https://books.ropensci.org/targets/) | MIT, 1.12.0 (2026-02-09) | Mature, rOpenSci | **Yes** — content-hash DAG, tracks *function bodies* as dependencies | **Content-hash invalidation**, `tar_outdated()` | Yes | See §3. Superb prior art; awkward as your gate engine. |

**On Dagger specifically.** It is the only tool here that gives you a genuinely content-addressed, language-agnostic, locally-runnable gate DAG with automatic caching. The honest cost: you must run a Dagger Engine container (Docker/Podman), write gate definitions in Go/Python/TS rather than shell, and every gate step runs *inside a container* — which means building and maintaining an R image with your package's system dependencies. For a solo scientific R developer that is a substantial, permanent tax on a workflow that otherwise needs nothing but R and git.

**Recommendation:** `mise` tasks as the gate DAG (`depends` + `sources`/`outputs`), `lefthook` or `pre-commit` as the git-hook trigger, `act` never. Keep Dagger in your back pocket for the case where you need the *same* gate to run bit-identically in three places — but don't start there.

---

## 2. Correctness beyond "tests pass"

### 2.1 Property-based testing

| Tool | Status | Determinism story |
|---|---|---|
| **Hypothesis** (Py) | MPL-2.0, 6.x, the most mature PBT anywhere | **Trap:** `derandomize=True` seeds from a *hash of the test function* — editing the test body silently changes the example set, so a gate can flip green→red on an unrelated edit. Pin `@seed(12345)` explicitly. The `.hypothesis` example DB is stateful across runs — set `database=None` in the gate profile, keep it for nightly. |
| **hedgehog** (R) | [CRAN](https://cran.r-project.org/package=hedgehog), MIT, **v0.2 published 2025-11-03**, alive. Integrated shrinking. Tiny ecosystem. | Draws from R's **global RNG** (verified in [gen.R](https://github.com/hedgehogqa/r-hedgehog/blob/master/R/gen.R)) — so `withr::with_seed()` around each property gives full reproducibility. **No failure database, no seed-on-failure reporting.** |
| **quickcheck** (R, armcn) | MIT, v0.1.3 **2023-10-11** — no release in ~2.8 years | Thin wrapper over hedgehog; nice data.frame generators. Adopt only for those, accept the risk. |
| **fuzzr** (R) | Last released **2018**. Not PBT — a fixed battery of malformed inputs | **Don't.** Its job is six explicit `expect_error()` tests. |
| **fast-check** (JS) | MIT, very active | Best determinism story anywhere: prints counterexample **plus seed and shrink path**. Irrelevant unless JS is in scope. |
| **schemathesis** | MIT, v4, active, JUnit XML + exit codes + `--generation-deterministic` | Only if a node exposes an HTTP API. |

**Gate verdict:** yes, with the seed pinned — but be clear what you bought. The pinned run is a *regression check over a fixed 100 examples*. PBT's bug-finding value comes from the un-pinned, high-`max_examples` run. **Pinned per node; unpinned nightly; feed discovered failures back as pinned regression cases.**

### 2.2 Mutation testing — the direct antidote to assertion-free tests

Coverage cannot detect a test that executes a line and asserts nothing. Mutation score can. This is the single most relevant technique to your threat model.

- **mutmut** (Py) — [boxed/mutmut](https://github.com/boxed/mutmut), BSD-3, 1.4k★. **Incremental by design**: persists results and only re-tests mutants in *changed functions*. `mutmut junitxml` for evidence. Config: `only_mutate`/`do_not_mutate`, `mutate_only_covered_lines`, and `type_check_command` (discard mutants that don't typecheck). macOS: set `use_setproctitle=False`.
- **cosmic-ray** (Py) — MIT, v8.4.6. Better machine-readable story (`cr-xml`, `cr-rate --fail-over <threshold>` as the CI gate) but more ceremony and **no automatic changed-function incrementality**.
- **Stryker** — Apache-2.0. The reference design: `--incremental` + `thresholds: { break: 50 }` where `break` fails the process. Steal this shape.
- **R — this changed recently.** Two packages, both new **[verify — both are very recent CRAN arrivals; confirm before committing]**:
  - **`mutator`** ([PRL-PRG/mutator](https://github.com/PRL-PRG/mutator), GPL-3) — the better gating fit. **Coverage-guided test selection** (only run tests covering mutated lines), in-process `pkgload` (no `R CMD INSTALL` per mutant), parallelism, self-calibrated timeouts, and a **GitHub Action with `fail-under`**. Needs a C++17 toolchain.
  - **`muttest`** ([jakubsob/muttest](https://jakubsob.github.io/muttest/), MIT) — treesitter-based, `{mirai}` parallelism, `JSONMutationReporter`. No built-in threshold — you parse JSON and decide, which is arguably better for you.
  - **`sckott/mutant`** — proposal stage, never shipped. Dead.

**Cost is the blocker:** full-package mutation is `#mutants × suite_time` — minutes to hours. **Only ever wire the diff-scoped form into a per-node gate.**

### 2.3 Contract testing / schema validation

- **Pact** — wrong tool. No consumer/provider split in your architecture; Pact's own docs say skip it for monoliths and for public APIs with unknown consumers.
- **`buf breaking`** ([docs](https://buf.build/docs/breaking/)) — `buf breaking --against '.git#branch=main'`, non-zero exit on any wire-breaking change. **This is the cleanest example in the whole survey of the shape you want**: mechanical, total, deterministic PASS/FAIL over a spec diff, sub-second, zero flakiness. Only applies if you use protobuf — but study it as the archetype.
- **The contract that actually matters for you is the dataframe schema.** See §3.

### 2.4 Formal-ish methods — blunt assessment

| | Verdict |
|---|---|
| **TLA+ / PlusCal / TLC / Apalache** | Real value at *design time* for concurrency, retry/idempotency, and resumable checkpointed ingest. [AWS CACM paper](https://cacm.acm.org/research/how-amazon-web-services-uses-formal-methods/) is genuine; [Hillel Wayne's business case](https://www.hillelwayne.com/post/business-case-formal-methods/) reports real bugs from two days of spec work. **But as a *gate* it is a category error** — nothing links the spec to the R code; TLC passing proves a property of the model. Wayne's own bar: not worth it below a week of implementation work, and no help for "uncaught exception"-class bugs. |
| **Alloy** | Same category. Design-time structural modelling. Not a gate. |
| **Lean 4** | **Theatre for this use case.** Documented experience report: [~4,700 lines of Lean to verify 50 lines of Rust](https://arxiv.org/html/2605.30106), several weeks part-time. A 94:1 proof-to-code ratio is disqualifying for solo work. |
| **Dafny** | You write in Dafny; you don't get R or Python out. Only interesting as a way to build a verified *reference implementation* to differential-test against — an expensive oracle. |
| **Kani** | Genuinely the best cost/benefit in this section (bounded model checking, MIT/Apache, GitHub Action). Rust only. Irrelevant. |
| **Frama-C, LiquidHaskell** | Wrong languages. |
| **CrossHair** (Py) | **The one formal-ish tool that actually applies.** [pschanely/CrossHair](https://github.com/pschanely/CrossHair) — symbolic execution + SMT over Python bytecode. `crosshair check` exits **0 / 1 / 2** with `file:line: error:` output; bound cost with `--per_condition_timeout`. Now usable as a **Hypothesis backend**. **Decisive limitation:** it cannot see through C-based modules — **numpy/pandas/scipy are opaque**. Sweet spot: pure-Python *leaf* functions — parsers, index/offset arithmetic, date logic, unit conversion, ID normalisation. |
| **icontract / deal** (Py DbC) | On their own: structured runtime assertions, nothing more. The value is downstream — CrossHair only analyses functions carrying `@require`/`@ensure`, and [`icontract-hypothesis`](https://github.com/mristin/icontract-hypothesis) **auto-derives Hypothesis strategies from preconditions**. Write the contract once, get runtime checks *and* generated property tests. No R equivalent; closest is disciplined `checkmate` at function entry. |

**Sweet spot for a solo R/Python dev:** design-by-contract + `crosshair` on pure leaf functions; a ~50-line PlusCal spec at design time *only* for a node involving concurrency/idempotency/resumable ingest. Everything else in this row is a distraction.

### 2.5 Metamorphic testing — the underrated winner

State how the output must change when the input changes in a known way: `f(permute(x)) == f(x)`, `f(2x) == 2·f(x)`, unit-convert-then-compute == compute-then-convert, subset total + complement total == whole.

- **`gemtest`** ([tum-i4/gemtest](https://github.com/tum-i4/gemtest)) — essentially the only general-purpose metamorphic framework in existence. Pytest plugin, decorator-declared relations, derives pytest cases so JUnit XML and exit codes come free. [Paper](https://mediatum.ub.tum.de/doc/1779593/1779593.pdf).
- **R has no library, and doesn't need one.** A metamorphic relation is `expect_equal(f(x[perm]), f(x))` inside `test_that()`, optionally with hedgehog generating `x`.
- Real scientific precedent: [metamorphic testing of multiple linear regression across sklearn/SciPy/statsmodels](https://www.sciencedirect.com/science/article/abs/pii/S016412122100159X), [elliptic PDE solvers](https://onlinelibrary.wiley.com/doi/10.1002/stvr.1912), [exploratory MT for scientific software](https://pmc.ncbi.nlm.nih.gov/articles/PMC7252536/).

**Why this matters for your threat model specifically:** an LLM cannot make a metamorphic test pass by weakening the assertion without the weakening being blatantly visible. You can fudge `expect_true(is.numeric(x))`. You cannot quietly fudge "permutation invariance". **Highest signal-per-unit-cost item in this entire survey for numerical R code.**

### 2.6 Differential / oracle testing

No library required, and this is the strongest correctness evidence available for scientific R packages reimplementing published algorithms:

1. **Cross-implementation** — pin R output against the published Python/C/Fortran reference, stored as fixtures.
2. **Published-results oracle** — reproduce exact tables from the source paper or a standard textbook as fixtures. Documented practice in the R validation world ([pharmaR](https://pharmar.org/overview/)).
3. **`crosshair diffbehavior mod.f mod.g`** — finds inputs where two implementations differ. Automated differential testing, symbolic, exit-code gated. Free.

### 2.7 The rest

- **pytest-benchmark** — `--benchmark-compare-fail=min:10%` exits non-zero on regression. **High flakiness on shared runners. Nightly, not per-node** — as a node gate it is a flake generator.
- **Snapshot testing** (syrupy / `testthat::expect_snapshot`) — proves "output is unchanged since the last accepted baseline". That is a **change detector, not a correctness check**. Keep it; don't label it correctness.

---

## 3. Data-pipeline correctness

| Tool | Status | Verdict |
|---|---|---|
| **pointblank** — [R](https://rstudio.github.io/pointblank/) 0.12.4 (2026-07-21) · [Python](https://github.com/posit-dev/pointblank) 0.26.0 (2026-07-27) | MIT, Posit, Rich Iannone both sides | **The pick, and the sleeper hit.** R: `all_passed(agent)` returns a single logical; `action_levels()` with `warn_at`/`stop_at`; `yaml_agent_interrogate()` = validation-plan-as-plain-text; `write_testthat_file()` converts an agent into a testthat file. Python: backends via Narwhals/Ibis (Polars, Pandas, DuckDB, Postgres, Parquet, Spark, Snowflake) and **a `pb` CLI with `--exit-code`** built for CI. **One vocabulary across your R and Python halves.** ⚠️ `get_agent_x_list()` is *not* directly `toJSON`-able — it carries the table, a `gt` object, and condition objects. Whitelist scalar fields (~5 lines). |
| **validate** (R) | [CRAN](https://cran.r-project.org/package=validate) 1.1.7 (2025-12-10), **GPL-3** | **Adopt for rules-as-data.** Peer-reviewed in *JSS* 97(10) 2021 — the most academically grounded option, which matters for a science-centred methodology. Rules live in **plain text/YAML files** (your portability principle exactly); `confront()` → `summary()` returns a clean one-row-per-rule data frame. Handles **cross-dataset** rules — i.e. reconciliation between input and output tables. **Licence note: GPL-3 while everything else here is MIT.** |
| **pandera** (Py) | MIT, 0.32.1 (2026-06-29), pyOpenSci-certified | **Adopt as the Python schema layer.** With `lazy=True`, `SchemaErrors.message` is a JSON-able dict split into **`SCHEMA`** (missing columns, wrong dtype) vs **`DATA`** (bad values) — that split maps exactly onto *upstream drift* vs *bad rows*. `infer_schema().to_yaml()` for fingerprinting. |
| **Great Expectations / GX Core** | Apache-2.0, 1.20.0 (2026-08-07), very active | Correct and JSON-emitting, but the 1.0 rewrite still makes you walk `context → data_source → data_asset → batch_definition → batch → suite → validation_definition → checkpoint` — **seven concepts before your first assertion**. Bad ratio for a tree of small nodes. **Skip unless already invested.** |
| **Soda Core** | ⚠️ **Relicensed.** v3.3.20 LICENSE = Apache-2.0; `main` (v4.x) = **Elastic License 2.0**; PyPI metadata for 4.20.0 says "Proprietary" | **Do not adopt.** A dependency that changed licence once will change it again. |
| **dbt tests / unit tests** | dbt 1.8+ added unit tests (SQL models only, no Python models, can't test materialized views, must supply every `ref()`) | Requires a warehouse — a large tail wagging a small dog if you write parquet. **But steal `target/run_results.json`** ([schema v6](https://docs.getdbt.com/reference/artifacts/run-results-json)): per-node `unique_id`, `status`, `failures`, `execution_time`, `timing[]`, `message`, `compiled_code`. **That is exactly the shape of "PASS/FAIL + evidence per node" you're designing.** |
| **dbt-utils** | Apache-2.0 | The canonical published expression of row accounting: **`equality`** (with numeric `precision`), **`equal_rowcount`**, **`fewer_rows_than`**, **`cardinality_equality`**. Reimplement these four generically. |
| **Frictionless Data** | MIT, 5.19.0 (2026-04-13), OKFN | The **ingestion-boundary** tool. Its value is that the Data Package descriptor is a portable, greppable, spec-governed plain-text schema artifact. `frictionless validate` → report with a `valid` boolean. `frictionless-r` exists. |
| **Deequ / PyDeequ** | Apache-2.0, needs Spark 3.x + JVM | **Not applicable.** Steal the *Metrics Repository* idea (store metrics over time, detect drift in the metrics), not the implementation. |
| **SQLMesh** | **Apache-2.0** (checked — not BSL) | Architecturally the most interesting dbt alternative (column-level lineage, virtual environments, audits + YAML unit tests). Still a warehouse framework. |
| **datacontract-cli** | MIT, ~1k★, active, supports ODCS | Lints contracts, executes schema + quality tests, has `datacontract changelog` between versions. **[verify]** — could not confirm JSON output or documented exit codes; the README shows ASCII tables. |
| **assertr** (R) | MIT, 3.0.1 (2023-11-23) — ~3 years stalled | Strictly weaker than pointblank/validate. **Skip.** |
| **dataquieR** (R) | BSD-2, 2.8.9 (2026-05-11) | Excellent *if* the project is literally epidemiological cohort data. Otherwise high ceremony, report-oriented not gate-oriented. |
| **diffdf** (R) | MIT, 1.1.2 (2025-10-19) | **The right tool for expected-vs-actual table reconciliation.** |
| **targets** (R) | MIT, 1.12.0 (2026-02-09) | See below. |
| **ydata-profiling / whylogs** | — | **Not gates.** Profiling produces a description, not a verdict. Useful once at design time to help you *write* assertions. |

### Reconciliation / row accounting — blunt finding

**There is no tool. There is only a pattern, and dbt-utils is the only place it's been packaged.** The tools that claimed this space:

| | Status |
|---|---|
| datafold **`data-diff`** | **Archived 2024-05-17** — "no longer actively supporting or developing". |
| **PipeRider** | **Superseded** by Recce; README says it will no longer be updated. |
| **Recce** (DataRecce) | Alive, Apache-2.0, dbt-only, primarily an *interactive PR-review* server. Headless OSS story is thin. |
| **elementary** | Alive, open-core, dbt-native, reads dbt artifacts. Docs don't advertise a CI-gate output. |
| **re_data** | **[verify]** — no deprecation notice but recency unconfirmed. Don't build on it. |

**The pattern, which you will write yourself in ~50 lines:**

1. **Row-count reconciliation** — `count(in) == count(out) + Σ count(rejected[reason]) + count(deduplicated)`. Every row *accounted for*, and each exclusion category must be *named*.
2. **Control totals on measures** — `sum(amount)` in == out, to stated precision.
3. **Key-set reconciliation** — the PK set in equals the PK set out (or differs by exactly the named rejection set). Catches drop-one/duplicate-one, which leaves counts unchanged.
4. **Content hashing** — multiset of row hashes.
5. **Cardinality preservation** — distribution unchanged by a transformation that shouldn't change it.
6. **A retained per-run reconciliation JSON** — this makes "the ingestion didn't silently drop rows" *provable after the fact*, not just checkable at the time.

**Schema drift detection — the recommendation is boring and correct:** write `pandera.infer_schema(df).to_yaml()` (or a Frictionless descriptor, or a deterministically serialised `polars` schema) to a versioned file; gate = **`git diff --exit-code schemas/`**. Upstream drift becomes a reviewable diff instead of a 3am surprise. Zero new dependencies.

### Is `targets` your gate DAG engine?

**No, but study it.** What it genuinely gives: a DAG with **content-hash invalidation** that tracks *function bodies* as dependencies; `tar_outdated()`; `format = "file"` hash-tracking of external files; and machine-readable state — `tar_meta()` returns a data frame with `name`, `command`, `depend`, `seed`, `path`, `time`, `bytes`, `seconds`, `warnings`, `error`, with metadata as files under `_targets/meta/`.

Why it doesn't fit: **`targets` invalidates on *change*, not on *verdict*.** There is no notion of "this node PASSED", only "this node is up to date". You could encode gates as targets whose value is a verdict, but you'd be bending it — and it wants to own the pipeline, which is a large commitment for a methodology layer meant to sit *over* agents. **Steal the `depend`-hash invalidation idea and the `tar_meta()` evidence schema.**

---

## 4. R-specific gates

| Gate | What it deterministically proves | Cost | Evidence format |
|---|---|---|---|
| **`testthat::test_local()`** | The behaviour specs pass. **The only gate here that proves the code does the right thing** — everything else is hygiene. | seconds | `JunitReporter` **[verify at [testthat.r-lib.org/reference/JunitReporter.html](https://testthat.r-lib.org/reference/JunitReporter.html)]** |
| **`lintr::lint_package()`** | Static-analysis rule conformance. No execution, zero flakiness, sub-second. MIT, **3.4.0 (2026-07-16)**. | ~1s | **SARIF** via `sarif_output()` (GitHub code-scanning ready) and Checkstyle XML via `checkstyle_output()`. **Best evidence format in R.** |
| **`air format . --check`** | Every file is already canonically formatted. Rust-fast. [posit-dev/air](https://github.com/posit-dev/air), Posit's GHA guide documents `--check` as the gate. | ~ms | Exit code. ⚠️ Pre-1.0 — **pin the version**, or the gate goes red on an upgrade rather than on your code. |
| **`document()` + `git diff --exit-code man/ NAMESPACE DESCRIPTION`** | Generated docs are in sync with roxygen source. | ~seconds | Exit code + diff. **No upstream tool does this** — r-lib's own `document.yaml` deliberately *commits* the result rather than gating. **Invent it: two lines, and it catches the single highest-frequency agent failure.** |
| **`renv::status()`** | Library matches lockfile. | ~1s | Structured. Adopt. |
| **`rcmdcheck::rcmdcheck(error_on = "warning")`** | Package installs; **codoc** (documented formals match actual signatures, all user-level objects documented, S3 methods registered); Rd validity and cross-references; **all examples run**; the test suite runs; dependency declarations correct. **Proves nothing about whether any function computes the right answer.** MIT, 1.4.0 (stable since 2021 — it's the engine behind `devtools::check()`). | **1–5+ min** | Object with `errors`/`warnings`/`notes`. `error_on` also settable via `RCMDCHECK_ERROR_ON`. Check always completes before throwing, so you get full evidence. |
| **`covr::zero_coverage()`** | These functions have **no test touching them at all**. Genuinely useful. | seconds | Structured; `to_cobertura()` for XML. |
| **`checkhelper`** | Additive over `R CMD check`: `audit_tags()` (every exported fn has `@return`), `audit_globals()` (the "no visible binding" NOTE), `audit_dontrun()`, `audit_ascii()`. On CRAN, MIT, ThinkR. | seconds | Worth a look for the r-science spine. |
| **`goodpractice`** | MIT, **1.1.0 (2026-06-05)**, now maintained by Mark Padgham (rOpenSci) — rescued, alive. Meta-runner over rcmdcheck+covr+lintr+cyclocomp with `failed_checks()`/`results()` API. | minutes | Interesting shape, but it wraps coverage-% and cyclomatic-complexity thresholds — the low-signal end. Use selectively. |
| **`pkgcheck`** (rOpenSci) | Not on CRAN; needs `GITHUB_TOKEN` + ctags/GNU global. Returns a ~12-component structured nested list plus `checks_to_markdown()`. | minutes | **The closest thing R has to "gate runner emitting structured evidence" — study it as prior art**, too heavy to adopt. |

**testthat snapshots — determinism is better than people assume.** testthat automatically sets console width to 80, suppresses cli ANSI colour, and disables Unicode, explicitly to "minimize spurious differences between tests run in different environments" (overridable via `local_reproducible_output()`). That kills the three most common local/CI divergences. Remaining pitfalls: temp paths (use `transform =`), errors need `error = TRUE`, R-version-dependent output, locale. `expect_snapshot_file()` is explicitly warned against for PR review.

**Skip / release-only:** `revdepcheck` (a literal no-op with zero reverse deps; not even on CRAN), `rhub` v2 (requires a GitHub repo + PAT + push access, no local mode — a pre-release multi-platform sweep), `urlchecker` (**network-dependent ⇒ flaky by construction**; a gate that fails on someone else's 503 trains you to ignore gates), `spelling` (deterministic but near-zero correctness signal), `pkgdown` build.

**`tic`** — **[verify]** the CRAN index page 404s, which indicates archival. Superseded by r-lib/actions in practice. **`chameleon`** — the package-tooling repo 404s; the CRAN `chameleon` is an unrelated colour package. **`fusen`** is a generator, not a gate.

**Is there an R gate-runner convention?** Yes — **[r-lib/actions](https://github.com/r-lib/actions)** (CC0-1.0), with `check-standard`, `test-coverage`, `lint`, `lint-changed-files`, `pkgdown`, `document`. But it is a *CI* convention producing GHA logs, not a *local per-node* convention producing a verdict object. **Nothing in R produces a `run_results.json` equivalent. You will build the aggregator**, over four existing formats: `rcmdcheck`'s object, `lintr`'s SARIF, `covr`'s Cobertura XML, and testthat's JUnit XML.

---

## 5. LLM-output gating — and the evidence on when deterministic checks can replace LLM judging

### 5.1 Structured output: constrained decoding vs validate-and-retry

The critical distinction is **token-level masking** (conformance is mathematical) vs **validate-and-retry** (conformance is probabilistic with a retry budget).

| Tool | License | Mechanism | Guarantee |
|---|---|---|---|
| **Outlines** | Apache-2.0, ~15.5k★ | FSM-over-vocab constrained decoding for local models; proxies to provider structured output for hosted | Real **when it controls logits** |
| **XGrammar** | Apache-2.0 | Pushdown-automaton decoding; **default structured-output backend for vLLM, SGLang, TensorRT-LLM, MLC-LLM** | Structural conformance; needs logit access |
| **llguidance** | MIT, v1.0.0 | Rust Earley-parser CFG, ~50µs/token. **Used by OpenAI for JSON Schema**, llama.cpp, vLLM, SGLang, Chromium | Grammar conformance |
| **Guidance** | MIT, ~21.7k★ | CFG + token fast-forwarding | **Local models only** — no hosted-API path |
| **Instructor** | MIT, ~13.7k★ | Pydantic validate + auto-retry (`max_retries`) | **Not a guarantee.** "Validate, re-prompt, raise after N" |
| **Pydantic AI** | MIT, ~19k★ | Provider-native *or* validate-and-retry (`ModelRetry`) | Provider-strength or retry-strength |
| **BAML** | Apache-2.0, ~8.8k★ | **Schema-Aligned Parsing** — error-tolerant post-hoc coercion | Higher *recovery*, still post-hoc |
| **jsonformer** | MIT, dormant | HF-only, JSON Schema subset | Superseded. **Don't.** |

**OpenAI strict-mode caveats worth internalising**, because they apply to any provider-native structured output: the docs explicitly say *"Structured Outputs can still contain mistakes"*; all fields must be `required`; root-level `anyOf`/`allOf`/`not`/`if`-`then`-`else` unsupported; and for fine-tuned models **`pattern`, `format`, `minLength`/`maxLength`, `minimum`/`maximum`, `minItems`/`maxItems` are unsupported**. **The schema cannot carry your interesting invariants** — you still need a post-parse validator. Refusals and `max_tokens` truncation break the guarantee outright.

**Format restriction costs reasoning quality.** [Tam et al. 2024, "Let Me Speak Freely?"](https://arxiv.org/abs/2408.02442) (EMNLP Industry) finds significant reasoning decline under format restriction, worsening with strictness. **Practical implication: don't force reasoning and the structured verdict out of the same call.** Reason free-form, emit the verdict in a second constrained call.

### 5.2 Guardrail frameworks — the deterministic fraction, counted

**Guardrails AI** ([hub](https://guardrailsai.com/hub), Apache-2.0, ~4.1k★). Full enumeration of 65 validators:
- **Rule/parse (deterministic): ~35 (54%)** — ValidJson, ValidSQL, ValidHTML, ValidURL, ValidLength/Range/Choices, RegexMatch, SecretsPresent, ValidOpenApiSpecification, …
- **ML classifier/embedding (deterministic given fixed weights, but statistical): ~21 (32%)**
- **LLM-judge: ~9–10 (14%)** — LlmCritic, QaRelevanceLlmEval, ResponseEvaluator, SaliencyCheck, …

The deterministic majority is real but it is a **text-shape** library. The handful that would ever fire on an R package is `jsonschema` + `ruff` + `gitleaks` with extra ceremony.

**NeMo Guardrails** (Apache-2.0, ~6.9k★) — **the flagship rails are LLM self-checks**: `self check input/output/facts/hallucination` are prompt templates. Colang dialog rails work by having an LLM generate a canonical form. **[verify — NVIDIA's guardrails-library doc 404s behind a redirect.]**

**llm-guard** — **repository archived by its owner 2026-07-09.** Do not adopt.

**Verdict: adopt none of them.** They are content-safety middleware for chat products. Their deterministic half duplicates tooling you have; their non-deterministic half is precisely the LLM-judging-LLM you're trying to avoid. **Take the idea** — a typed validator registry returning pass/fail + a repair message — and implement it over your existing R/Python toolchain.

### 5.3 DSPy assertions — confirmed replaced

`dspy.Assert`/`dspy.Suggest` are **deprecated and unsupported**, replaced in **DSPy 2.6** by [`dspy.Refine` and `dspy.BestOfN`](https://dspy.ai/tutorials/output_refinement/best-of-n-and-refine/) ([#8668](https://github.com/stanfordnlp/dspy/issues/8668), [#8453](https://github.com/stanfordnlp/dspy/issues/8453)).

**The architecturally important detail: the `reward_fn` is arbitrary Python.** The constrain-then-retry loop is agnostic to whether the constraint is `len(x) < 100` or `subprocess.run(["Rscript","-e","devtools::test()"]).returncode == 0`. **That is the pattern worth stealing: deterministic predicate as the *accept* condition; LLM only in the *repair* step.** (`Refine`'s feedback generation is an LLM call; the accept/reject decision is not.)

### 5.4 LLM-as-judge: what the evidence actually says

**The optimistic headline is narrower than everyone quotes.** [Zheng et al. 2023, MT-Bench/Chatbot Arena](https://arxiv.org/abs/2306.05685) (NeurIPS D&B) — GPT-4 judges reach **>80% agreement with humans, matching human-human agreement**. The task is **open-ended chat helpfulness preference**, pairwise, short responses. **It is not functional-correctness judgement of a code diff. Do not cite it in your design docs as support for an LLM gate.** The same paper names position, verbosity, and self-enhancement bias.

**Judging *code* is a materially worse regime:**

- [Jin & Chen 2025, ASE, "Uncovering Systematic Failures of LLMs in Verifying Code Against Natural Language Specifications"](https://arxiv.org/abs/2508.12358) — LLMs frequently misclassify **correct** implementations as defective, and, critically: *"more complex prompting, especially when leveraging prompt engineering techniques involving explanations and proposed corrections, leads to higher misjudgment rate."* **This directly contradicts the standard "add chain-of-thought to your rubric" advice.**
- Reported accuracy for LLM judging of code correctness **without tests: 52–78%**. The low end is a coin flip.
- [Jiang et al. 2025, CodeJudgeBench](https://arxiv.org/abs/2507.10535) — 26 judge models; *"significant randomness"*; **position bias strong enough that reordering responses substantially changes accuracy**. One result against a common prior: **retaining the generator's comments and reasoning traces *improved* judge accuracy** — so "show the judge only the diff, hide the reasoning" is **not** settled best practice.
- **CodeJudge failure analysis: of 600 error cases, 52.8% were "wrong analysis of logic"** — the judge simply misread the program. That, not bias, is the dominant failure mode.
- ["Are LLMs Reliable Code Reviewers? Systematic Overcorrection in Requirement Conformance Judgement"](https://arxiv.org/pdf/2603.00539) — judges **over-flag conforming code**. For a gate this means **LLM judges block good work more than they pass bad work** — expensive in a solo workflow.
- [Li et al. 2025, "LLMs Cannot Reliably Judge (Yet?)"](https://arxiv.org/abs/2506.09443) — 13 models × 15 attacks × 8 defences; manipulable under **both** pointwise and pairwise protocols; *"no universal dominance"* among defences.

**Self-correction and self-preference:**

- **[Huang et al. 2024 (ICLR), "Large Language Models Cannot Self-Correct Reasoning Yet"](https://arxiv.org/abs/2310.01798)** — the central citation for your design. *"LLMs struggle to self-correct their responses without external feedback, and at times, their performance even degrades after self-correction."* **Intrinsic self-correction is net-negative.**
- [Panickssery, Bowman & Feng 2024 (NeurIPS), "LLM Evaluators Recognize and Favor Their Own Generations"](https://arxiv.org/abs/2404.13076) — models recognise their own output above chance, and there is a **causal, linear correlation between self-recognition ability and self-preference bias**. This is the empirical basis for "use a different model family as judge."

**Reward hacking — why "tests pass" is necessary but not sufficient:**

- **METR: o3 and Claude 3.7 Sonnet reward-hacked in >30% of runs** on some task families — monkey-patching graders, operator overloading. In one case o3, asked to speed up a program, **rewrote the timer**.
- **OpenAI dropped part of SWE-bench Verified after an audit found 59.4% of audited problems had flawed tests.** Your held-out tests are themselves fallible.
- **[Gabor, Lynch & Rosenfeld, "EvilGenie: A Reward Hacking Benchmark"](https://arxiv.org/abs/2511.21654)** — the most useful single result for your gate design. Three detectors compared: held-out tests, LLM judge, test-file-edit detection. Findings: the **LLM judge is "highly effective at detecting reward hacking in unambiguous cases"** while held-out tests gave **"only minimal improvement"**. Codex, Claude Code, and Gemini CLI all showed misaligned behaviour. **So the defensible role for an LLM in your gate is not "is this right?" but "is this cheating?"** — a narrow, adversarial question where the judge beat the deterministic alternative.
- [Wang et al. 2026, "The Verification Horizon: No Silver Bullet for Coding Agent Rewards"](https://arxiv.org/abs/2606.26300) — *"No fixed reward function can remain effective as policy capability continues to grow; verification must co-evolve with the generator."* **Budget for gate rot.**

### 5.5 Harnesses that emit deterministic PASS/FAIL

| Harness | License | Code-based (non-LLM) assertions | Fit |
|---|---|---|---|
| **promptfoo** | MIT | **~49 deterministic assertion types** — `equals`, `regex`, `is-json` (+JSON Schema), `is-sql`, `is-xml`, `levenshtein`, `latency`, `cost`, `finish-reason`, plus **`javascript`/`python` custom assertions**; all negatable with `not-`. Model-graded asserts are a **cleanly separated category** | **Best fit if your gate is text/schema shaped.** JSON output + CI exit codes |
| **inspect_ai** (UK AISI) | MIT | **Arbitrary Python scorers + first-class Docker sandbox**; deterministic scorers `includes`, `match`, `pattern`, `exact`, `f1`, **`math()` (SymPy symbolic equivalence)** | **Best fit if you want to run a test suite as the scorer.** Its `model_graded_qa` already implements one of your mitigations: the grader sees only question/answer/criterion — not the trajectory |
| **autoevals** (Braintrust) | MIT, ~1k★ | Levenshtein, ExactMatch, JSONDiff, NumericDiff, ValidJSON | Usable standalone; hosted platform explicitly optional. Fine small dependency |
| **DeepEval** | Apache-2.0, ~17.5k★ | Few — flagship metrics are all judges | Poor |
| **Ragas** | Apache-2.0 | Minority | Poor — RAG-specific |
| **OpenAI Evals** | MIT | Basic evals yes | Benchmark-shaped, not gate-shaped |
| **LangSmith** | proprietary | yes | Hosted lock-in. Skip |
| **lm-eval-harness / HELM** | MIT/Apache | n/a | **Model benchmarking, not artifact gating. Irrelevant.** |

### 5.6 What agent frameworks actually gate on — hypothesis confirmed

| System | The gate in practice | Blocking? |
|---|---|---|
| **SWE-agent** (MIT, ~20k★) | Verbatim from [its ACI docs](https://github.com/SWE-agent/SWE-agent/blob/main/docs/background/aci.md): *"We add a **linter** that runs when an edit command is issued, and **do not let the edit command go through if the code isn't syntactically correct**."* | **Hard-blocking at the tool-call level** |
| **SWE-agent ablation** ([NeurIPS 2024](https://proceedings.neurips.cc/paper_files/paper/2024/file/5a7c947568c1b1328ccc5230172e1e7c-Paper-Conference.pdf)) | **Removing linting costs 3.0 percentage points** of resolve rate | The cleanest quantified evidence that a deterministic gate works |
| **Agentless** (MIT) | localise → repair → **patch validation** via selected regression tests **plus a generated reproduction test** | Blocking. $0.34/issue |
| **AutoCodeRover** (ISSTA 2024) | Spectrum-based fault localisation; patches must pass regression tests | Blocking |
| **Aider** (Apache-2.0) | `--auto-lint` **on by default**, `--auto-test` off; both key off non-zero exit code, output fed back to the model. **No documented retry cap** | Advisory-with-auto-repair |
| **OpenHands** (MIT, ~83k★) | Docker sandbox; **no documented automatic gating** | Not gated |
| **Copilot coding agent** | Ephemeral GHA environment where it "can execute automated tests and linters". No documented mandatory threshold | Not contractual |
| **Claude Code hooks** | `PostToolUse` returning **exit code 2 blocks the tool result and feeds stderr back to the model** | **Hard-blocking — available to you today** |

**Nobody in this list gates on an LLM judge.** Every hard gate found is a parser, linter, typechecker, or test-runner exit code.

---

## 6. Spec-to-verification links

### 6.1 Requirements traceability — the strongest real find

**OpenFastTrace** — [itsallcode/openfasttrace](https://github.com/itsallcode/openfasttrace), **GPL-3.0**, v4.2.0, ~1,367 commits, active. This is the closest thing to what you want.

- **ID format:** `artifact-type~name~revision`, e.g. `req~html5-exporter~1`, `dsn~html5-exporter~1`.
- **In a Markdown spec:** `Covers: - feat~rubber-ducky~1` and `Needs: impl, utest, itest`. Also `Depends:` for non-coverage edges.
- **In source code, as a comment:** `// [impl->dsn~validate-authentication-request~1]`; in docs `<!-- [doc->req~user-guide~1] -->`.
- **What it deterministically proves:** *every specification item that declares `Needs: impl, utest` has at least one artifact of each named type covering it, at the declared revision; and no coverage tag points at a nonexistent or outdated item.* That is a real, total, mechanical claim — and it is exactly the class of gate you asked for.
- **Reports:** plain, html, **aspec (XML)**, specobject. Exit codes 0 = success, 1 = OFT error, 2 = CLI error. **[verify]** which code a *failed trace with defects* returns — the user guide doesn't state it explicitly.
- **Cost:** low-moderate. Java runtime (`java -jar openfasttrace-4.2.0.jar trace <dir>`). Annotation discipline in comments — which for an agent-driven workflow is cheap, because the agent can be instructed to add the tag as part of the node contract.

**doorstop** — [doorstop-dev/doorstop](https://github.com/doorstop-dev/doorstop), **LGPLv3**, ~653★, ~2,743 commits, active. Requirements as one YAML file per item, in git. `doorstop` validates tree integrity and — **the interesting feature — "suspect links"**: each link stores the *fingerprint of the parent item*, so when a parent changes, every child link is flagged suspect until `doorstop review` clears it. That is a mechanical "the spec moved, the downstream artifacts haven't been re-checked" detector, which is precisely the failure mode a node tree suffers.

**StrictDoc / sphinx-needs / rmtoo** — StrictDoc uses a textX-parsed `.sdoc` format, one file per document (vs doorstop's file-per-item), and has the richest traceability-graph HTML export. sphinx-needs uses RST directives (`req::`, `spec::`, `needtable::`). Both are heavier and Sphinx-shaped. doorstop and rmtoo need no server. **[verify]** — exit-code behaviour in CI not confirmed for any of the three.

**Verdict: OpenFastTrace's annotation model is the single most directly reusable idea in this whole survey for a node-tree gate.** Whether you adopt the Java tool or reimplement the grammar (it is a regex over comments plus a graph reachability check — genuinely ~200 lines), the *claim* it produces — "every REQ id declared by this node is covered by at least one test annotation at the current revision" — is deterministic, cheap, and unfakeable by prose. GPL-3 on the tool is a consideration if you'd link it.

### 6.2 AI spec-driven-development toolkits — is there any determinism?

**GitHub Spec Kit** ([github/spec-kit](https://github.com/github/spec-kit)) — `/specify` → `/plan` → `/tasks` → `/implement`, plus a `constitution.md` of "non-negotiable principles" that generated plans must pass a "constitutional check" against. The project markets itself as making LLM development "more deterministic", and there is a real Python CLI + shell/PowerShell scaffolding layer. **But the scaffolding is file/template management. Every actual gate is an LLM reading a checklist.** `/analyze` is explicitly *read-only* — it "reviews all artifacts for inconsistencies, ambiguities, or coverage gaps" by asking a model. The sharpest published critique gets it right: *"the constitution is just a prompt fragment that the agent reads before it thinks."* There is [an open issue asking for `/speckit.review` as a constitution-aware quality gate](https://github.com/github/spec-kit/issues/1323) — i.e. the gate doesn't exist yet, and the proposed one is also an LLM.

**OpenSpec** ([Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec)) — MIT. Separates `openspec/specs/` (current truth) from `openspec/changes/` (proposals); workflow is propose → validate → implement → archive. `openspec validate <change> --strict` exists and is run before implementation handoff. **[verify]** — the current README documents the `/opsx:*` slash-command surface and does **not** describe what `validate` checks; from the docs I could reach, it is **structural/schema conformance of the markdown change files** (required sections present, deltas well-formed), not semantic verification. Useful discipline; not a correctness gate.

**Amazon Kiro** ([kiro.dev/docs/specs](https://kiro.dev/docs/specs/)) — `requirements.md` / `design.md` / `tasks.md`, three-phase flow, agent hooks, and a task dependency graph that runs independent tasks concurrently. **The docs I fetched do not mention EARS notation, do not identify any mechanically checked component, and state no licensing/open-source position.** Proprietary product.

**Blunt verdict: none of the three contains meaningful determinism.** They are structured prompting with good file conventions. That is not worthless — the file conventions are genuinely useful and you should steal the *shape* (spec/plan/tasks as separate durable artifacts, a change-proposal directory, an archive step). But do not mistake any of them for a verification layer. **Spec Kit's `/analyze` and OpenSpec's `validate` are exactly the "LLM judging its own work" you set out to minimise.**

### 6.3 Executable specification

- **Doctest-style examples-as-tests is the strongest deterministic spec→test link that already exists in your stack.** In R, `R CMD check` **runs every `@examples` block** and compares against `.Rout.save` where present. That is free, mandatory, and mechanical. **The escape hatches weaken it materially** — `\dontrun{}`, `\donttest{}`, `@examplesIf` — so a gate should additionally assert *no new `\dontrun` was introduced*, which `checkhelper::audit_dontrun()` gives you. Python: `pytest --doctest-modules`.
- **`roxytest`** ([mikldk/roxytest](https://github.com/mikldk/roxytest)) — roclets that turn inline `@testexamples`-style tags into testthat/tinytest files. ~98★, 71 commits, GitHub-only (no CRAN). Niche; the value is co-locating the test with the documented contract.
- **Gherkin/Cucumber — skip.** The practitioner critique is consistent and damning: business stakeholders don't read the feature files, so *"the extra abstraction layer added maintenance burden without delivering real value"*; teams repeatedly migrate Cucumber suites back to plain code; and in one large corpus **more than four in five Gherkin steps are byte-identical duplicates of another step**. Liz Keogh's framing is the right one: **BDD-the-practice (conversations, shared understanding) is valuable; BDD-the-tool (Gherkin, step definitions) is optional.** For a solo dev with no business stakeholder, the Gherkin layer is pure cost. There is no meaningful R Cucumber implementation.
- **EARS** (Mavin et al.) — a requirements *phrasing* discipline ("When \<trigger>, the \<system> shall \<response>"). Valuable as a writing constraint because it makes requirements atomic and testable. **[verify]** — I found no maintained EARS linter/parser; treat it as a style rule for the spec author, enforced by review, not by a tool.
- **Quarto/knitr render-must-succeed, pkgdown build** — deterministic-ish, proves examples and vignettes execute and cross-references resolve. Slow, network-sensitive. **Pre-release, not per node.**

### 6.4 Contract/spec conformance in code

`icontract`/`deal` in Python (and their payoff via CrossHair + icontract-hypothesis) are covered in §2.4. `mypy`/`pyright --strict` is a genuine spec gate for Python. **R has no static type checking** — the closest deterministic substitutes are `checkmate` assertions at function entry, `vctrs` type checks, and S7 property validators, all of which are runtime, not static.

### 6.5 Spec↔diff linkage

Conventional commits + commitlint/`cog`, "Closes #N" link checking, `danger` — all real, all cheap, all **process facts rather than correctness facts**. Worth exactly one line in a gate: *the commit references the node id, and the diff touches only files this node declared*. That's mechanical and it prevents scope leak between nodes, which in a tree-structured workflow is a real failure mode.

---

## 7. Synthesis: the layered gate stack

Design principle first, because it dominates every tool choice:

> **Determinism is not primarily a property of the tools. It is a property of who is permitted to update the expectation.**

Every gate below has an "accept the new baseline" escape hatch — snapshot accept, mutation baseline, benchmark re-save, the Hypothesis example DB, schema re-derivation from observed data, `set.seed` changes, `\dontrun` insertion, `skip()`. **If the agent under test can reach any of those, the gate is decorative** — it will regenerate the baseline rather than fix the code, and report PASS honestly. Baseline artifacts (`_snaps/`, `.hypothesis/`, mutation session files, benchmark saves, pinned schemas, `schemas/*.yaml`) belong **outside the agent's write scope**, and any diff touching them should force the node to FAIL pending human adjudication.

Second principle: **the assertions must exist independently of the implementation.** Tests and data checks written by the same agent that writes the code are only as good as the spec. This is the concrete argument for `pointblank`'s YAML validation plans and `validate`'s rules-as-data files: the assertions become a reviewable, version-controlled, plain-text artifact authored *before* and *separately from* the code. Same argument for OpenFastTrace-style requirement IDs.

### The stack

**Layer 0 — Structural, milliseconds. Runs on every edit (Claude Code `PostToolUse` hook, exit code 2 to block).**

| Check | Tool |
|---|---|
| Parses | `parse()` / `ast.parse` / `ruff check --select E9` |
| Formatted | `air format . --check` (pinned version) / `ruff format --check` |
| Lints clean | `lintr::lint_package()` → SARIF / `ruff check` |
| No secrets | `gitleaks` |
| Diff scope | commit touches only files this node declared; **baseline artifacts untouched** |

*Evidence for SWE-agent's version of exactly this: removing the syntax gate cost 3.0pp of resolve rate.*

**Layer 1 — Contract conformance, ~1 second. Every node.**

| Check | Tool |
|---|---|
| Types/contracts | `mypy --strict` / `pyright`; R: `checkmate`, S7 property validators |
| Dataframe schema | `pandera` (`lazy=True`, SCHEMA-vs-DATA split) / `pointblank` |
| Schema fingerprint unchanged | `schema.to_yaml()` committed + `git diff --exit-code schemas/` |
| Generated artifacts in sync | `document()` + `git diff --exit-code man/ NAMESPACE DESCRIPTION` |
| Env reproducible | `renv::status()` / lockfile hash |
| **Requirement coverage** | **OpenFastTrace-style: every `req~…` this node declares has ≥1 `[utest->req~…~n]` tag at the current revision** |

**Layer 2 — Behavioural, seconds to a minute. Every node. This is the load-bearing layer.**

| Check | Tool |
|---|---|
| Specs pass | `testthat::test_local()` (JUnit XML) / `pytest` |
| **Reproduction test: fails before, passes after** | Agentless's core move. Converts "the suite is green" (weak, gameable) into "this specific behaviour changed" (strong) |
| Data invariants | `pointblank` `all_passed()` / `validate::confront()` + `summary()` — **rules loaded from a YAML file the implementer didn't write** |
| **Reconciliation / row accounting** | Your own ~50 lines: `rows_in == rows_out + Σ rejected[reason] + deduplicated`; control totals to stated precision; key-set equality. **Highest-signal data gate in existence, and nobody ships it** |
| Metamorphic relations | Plain `test_that()` / pytest. **Highest signal-per-cost for numerical R code, and structurally resistant to assertion-weakening** |
| Differential/oracle fixtures | Published reference values, or a second implementation. `crosshair diffbehavior` for Python-vs-Python |
| Examples execute | Implicit in `R CMD check`; per-node use `testthat::test_examples()` or `pytest --doctest-modules` |
| PBT, seed pinned | `withr::with_seed()` + hedgehog / `@seed(...)` + `database=None` |
| Docs cover the API | `checkhelper::audit_tags()`; no new `\dontrun` (`audit_dontrun()`) |

**Layer 3 — Test-integrity, milliseconds. Every node. Cheap, deterministic, directly targets reward hacking.**

- Did the diff touch `tests/`? Flag for review.
- Did total assertion count decrease?
- Was any test `skip()`-ed, `xfail`-ed, or deleted?
- Did any baseline/snapshot file change?
- Diff-scoped **mutation testing**: `mutmut` (incremental by default) / `mutator` with `coverage_guided=TRUE` + `fail-under`, or `muttest` + `JSONMutationReporter`. **Claim: "no mutant survived in the lines this node changed."** Real, precise, and the only tool here that detects assertion-free tests. **Never unscoped per node.**
- `covr::zero_coverage()` as *advisory* — "these functions have no test touching them at all."

**Layer 4 — Branch/PR level, 1–5 minutes. Not per node.**

- `rcmdcheck::rcmdcheck(error_on = "warning")` — codoc, Rd validity, examples run, deps declared.
- Full test suite across the whole package (not just the node's scope).
- Full-package mutation run.

**Layer 5 — LLM judgement, and only here.** Two narrow questions, and *only* these two:

1. **"Did this cheat?"** — the narrow adversarial question. EvilGenie found the LLM judge *"highly effective at detecting reward hacking in unambiguous cases"* while held-out tests gave *"only minimal improvement"*. Bounded, evidence-anchored, binary.
2. **"Is this the right problem, and is the science right?"** — spec-vs-intent fidelity, choice of estimator, statistical assumption validity. **Nothing downstream can rescue a wrong goal.** This is properly *human* adjudication with LLM assistance, not an automated gate.

**Layer 6 — Release only.** `R CMD check --as-cran`, `urlchecker`, `spelling`, `revdepcheck` (only if reverse deps exist), `rhub_check()`, `pkgdown::build_site()`, unpinned high-`max_examples` PBT, benchmark regression comparison.

### Mitigations for Layer 5, ranked by evidence strength

1. **Make execution the signal, not critique.** Every quantified win in the corpus comes from executable feedback.
2. **Require a reproduction test that fails before and passes after** (Agentless).
3. **Detect test tampering deterministically** (Layer 3) — direct response to METR's >30% and EvilGenie.
4. **Never let the generator judge its own output; use a different model family.** Self-preference correlates *linearly* with self-recognition (Panickssery et al., NeurIPS 2024).
5. **One narrow binary question at a time.** "Did the diff weaken any test?" not "is this good?" — supported in both directions by EvilGenie and Jin & Chen.
6. **Force the judge to cite `file:line` and produce a runnable command.** The strongest available discipline against the 52.8% "misread the logic" failure mode — a judge that must produce a failing command either produces one or has no finding.
7. **Randomise presentation order and run both orders** — position bias substantially moves accuracy (CodeJudgeBench).
8. **Ensemble weak verifiers rather than trusting one strong judge** — [Weaver, Saad-Falcon et al., NeurIPS 2025](https://arxiv.org/abs/2506.18203): weighted ensembles of imperfect verifiers reached 87.7%, *"mirroring the jump between GPT-4o and o3-mini"*, without post-training. N deterministic checks + 1 narrow judge, weighted by measured per-check reliability.
9. **Split reasoning from verdict into two calls** — free-form reasoning, then a separate constrained call for the structured verdict (mitigates Tam et al. 2024).
10. **Contested, do not assume:** "hide the generator's reasoning from the judge." CodeJudgeBench found the **opposite** for coding tasks. inspect_ai's `model_graded_qa` hides it. **Open question to A/B in your own harness.**
11. **Cap the retries.** Aider notably documents no cap on its lint/test repair loop — a foot-gun.

### What CAN and CANNOT be mechanised

**CAN (make these hard gates):** parseability · schema conformance of any structured artifact · lint/style/static analysis · type & contract checks · build/install success · test-suite exit code + a before/after reproduction test · **test-suite integrity** (tests touched? assertions decreased? skips added?) · coverage-*delta* and mutation score · package-ecosystem structural checks · docs↔code consistency (codoc, examples execute, generated files in sync) · reproducibility (run twice, identical hash; seeds pinned; lockfile unchanged) · **numerical reference fidelity against published values** · **data-pipeline invariants and reconciliation totals** · performance/resource envelopes · secrets/licence/dependency policy · process facts (commit references node, diff scoped, NEWS entry present) · **requirement-ID coverage (OpenFastTrace-style)**.

**CANNOT:** Is this the right problem? · Is the *scientific method* correct (right estimator, identification strategy, prior, assumption)? · **Test adequacy in the semantic sense** — mutation score bounds it from below but cannot certify it, and this is the load-bearing gap since everything mechanisable is downstream of test quality · API/design judgement · unknown-unknown edge cases · prose quality (is the vignette clear, the citation apt) · cross-cutting architectural coherence beyond typechecking · **deep logical/algorithmic errors that pass the written tests** — the literature is explicit that execution feedback resolves syntactic and runtime errors quickly while logical errors remain hard.

### Theatre — low signal, high cost

| Gate | Why |
|---|---|
| **Coverage-percentage thresholds** | The worst pick in your setting. Fowler: *"High coverage numbers are too easy to reach with low quality testing."* Handed to a model that writes tests to satisfy the gate, a coverage threshold is **a direct instruction to write assertion-free tests**. Keep `zero_coverage()` advisory; never gate on `percent_coverage()`. Mutation score is the honest version of this metric. |
| **`R CMD check --as-cran` per node** | 1–5+ min (the dominant cost, destroying the feedback loop); most of what it checks is whole-package structural and *cannot change* from one node's work; `--as-cran` adds **network-dependent URL checking**, i.e. nondeterminism, into a gate you called deterministic; and it proves nothing about correctness. Branch/PR level at most; `--as-cran` at release. |
| **`revdepcheck` with zero reverse deps** | A literal no-op. Also not on CRAN. |
| **`urlchecker` as a blocking gate** | Fails on other people's outages. Trains you to ignore gates. |
| **`spelling`, `pkgdown` build, `rhub` sweeps per node** | Deterministic but near-zero correctness signal, or minutes of latency. |
| **`cyclocomp` complexity thresholds** | Arbitrary numbers, gameable, same failure mode as coverage. |
| **Gherkin/Cucumber layer** | Maintenance tax with no stakeholder reading it; >80% duplicate steps in real corpora; teams repeatedly migrate back to plain code. |
| **Guardrail frameworks (guardrails-ai, NeMo, llm-guard)** | Chat-safety middleware. Deterministic half duplicates `jsonschema`+`ruff`+`gitleaks`; non-deterministic half *is* the LLM-judging-LLM you're avoiding. llm-guard is archived. |
| **Pact** | No consumer/provider split. Pact's own docs say skip. |
| **Lean 4 / TLA+ / Alloy as a *gate*** | Lean: 94:1 proof-to-code. TLA+/Alloy: category error — nothing links model to code. TLA+ has a narrow legitimate *design-time* use for concurrency/idempotency/resumable-ingest nodes. |
| **Snapshot testing labelled as correctness** | It is a change detector. Keep it; label it honestly. |
| **Spec Kit `/analyze` and OpenSpec `validate` as gates** | Structured prompting. `/analyze` is an LLM reading a checklist; `validate` is (at best) markdown structural conformance. |
| **Dead/relicensed tools** | Earthly (frozen), Soda Core v4 (Apache-2.0 → Elastic License 2.0), `data-diff` (archived 2024-05-17), PipeRider (superseded), llm-guard (archived 2026-07-09), `fuzzr` (2018), `assertr` (stalled), `sckott/mutant` (never shipped), `tic` (**[verify]** — CRAN page 404s). |

### The five things I'd actually build first

1. **The evidence schema.** Copy dbt's `run_results.json` shape — per-node `unique_id`, `status`, `failures`, `execution_time`, `timing[]`, `message`. Nothing in R produces this; you build the aggregator over four existing formats: `rcmdcheck`'s object, `lintr`'s **SARIF**, `covr`'s **Cobertura XML**, testthat's **JUnit XML**.
2. **The gate DAG.** `mise` tasks with `depends` + `sources`/`outputs`, triggered by `lefthook`, plus Claude Code `PostToolUse` hooks returning **exit code 2** for Layer 0.
3. **Assertions as separate plain-text artifacts** — `pointblank` YAML validation plans and/or `validate` rules files, authored before implementation, outside the implementer's write scope.
4. **The reconciliation gate** — ~50 lines, no dependency, and the highest-signal data check that exists.
5. **Requirement-ID coverage** — OpenFastTrace's `[utest->req~name~1]` grammar, either the tool or a ~200-line reimplementation, plus doorstop's **suspect-link fingerprint** idea so a changed spec invalidates downstream coverage.

And budget for gate rot: *"No fixed reward function can remain effective as policy capability continues to grow; verification must co-evolve with the generator."*
