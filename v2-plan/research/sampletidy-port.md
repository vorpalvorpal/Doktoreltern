# sampleTidy: what a Rust port looks like

Read-only research, 2026-10-06. "Read" = seen in files under /Users/rjs/dev/sampleTidy. "Inferred" and "from knowledge" are marked. Nothing was run.

## 1. What it is

R package, version 0.0.0.9000, 230 commits. README.md still says "greenfield, pre-alpha, skeleton only"; that is stale. dev/STATE.md (last verified 2026-08-09) says the package is built and signed off (plans 01-16 closed 2026-07-28), ten registry migrations are applied, and the first real batch has been ingested. The corpus run (~265 files, 213 ACIRL workbooks) has not happened. The live DB holds ~97k analyses, 97,105 of them legacy data loaded before the pipeline existed.

**Stages** (dev/DESIGN.md section 3): Router (tiered claim of each file) -> Adapter (parse to IR) -> Assemble (per work order, source preference ESdat > ENMRG > XTAB > COA PDF) -> Reconcile against the DB (new / already-present / conflict / review) -> Gate -> Commit (one transaction plus a `change_log` audit trail) -> Archive (copy, re-hash, link in DB, delete the source) -> post-commit hook.

**Adapters:** `esdat` (CSV pair plus Header.XML), `als_enmrg` and `als_xtab` (crosstab), `acirl_field_xlsx` (human-edited workbook; lab columns dropped, field data kept). Adapters emit the **IR**, a pair of tibbles (results, samples) defined in R/ir.R. A `register_adapter()` seam allows more. LLM adapters for scanned ACIRL PDFs and generic PDFs are designed (DESIGN.md section ~10, `backend_claude_code()` / `backend_ellmer()`) but **not built**: `ellmer` is only in Suggests and no R file uses it. So there is no PDF parsing at all today; PDFs are routed, hashed and archived only.

**Registry:** analyte, feature (sampling points), lab_method, project, plus a `feature_alias` table (PLAN-11) because mis-transcribed sampling-point names are the main reason a human is in the loop. Ambiguity goes to `review_queue` (with candidates) and is resolved through `resolve_review()`. "Claude as proposer, never writer."

**DuckDB:** tables sample, analysis, analyte, feature, lab_method, project, asset, ingest_file, ingest_sighting, review_queue, review_queue_candidate, change_log, schema_version (R/db-schema.R). Ten migrations live as R scripts in dev/migrations/ (001-010, some with CSV inputs); dev/MIGRATIONS.md lists them. The live DB is a local file (not SharePoint, because OneDrive ignores DuckDB locks); SharePoint gets one-way snapshots.

**Trigger:** the MVP is a manual call, `ingest_dir(path, db, dry_run)` / `ingest_inbox()`. The design path is Outlook rule -> Power Automate -> SharePoint folder synced to the Mac -> a launchd watcher on a local directory (DESIGN.md section 11, post-MVP). No email API code in the package. "Email handling" is therefore not an R dependency to replace.

**External systems:** SharePoint/OneDrive files (Files-On-Demand; reading wholesale downloads ~1.9 GB), DuckDB, optionally the Claude CLI or an ellmer model (future), launchd.

**Modules (R/, 15,838 lines):**

| file | lines | role |
|---|---|---|
| reconcile.R | 2926 | match to DB, new/present/conflict/review |
| commit.R | 2173 | transactional write, change_log, re-ingest guard |
| feature-alias.R | 1998 | alias resolution, site-aware |
| ingest.R | 1322 | ingest_dir/inbox orchestration, routing rules |
| adapter-acirl-field.R | 1297 | ACIRL workbook geometry |
| db-schema.R | 1101 | DDL, views, ensure_schema |
| mutate.R | 1018 | db_append/update/delete, correct_value |
| adapter-crosstab.R | 681 | XTAB/ENMRG |
| assemble.R | 592 | per-work-order events |
| adapter-esdat.R | 386 | ESdat CSV+XML |
| router.R | 351 | claim tiers |
| units.R | 210 | udunits wrapper plus pH aliases |
| ir.R | 204 | IR constructors/validation |
| config.R, values.R, snapshot.R, archive.R, file-meta.R, text-normalise.R, dates.R, spreadsheet-tools.R, read-encoding.R, db-connect.R, adapter-registry.R, pending.R, hash.R, zzz.R | 23-188 each | support |

About 45% of the code (reconcile, commit, feature-alias, mutate, db-schema) is registry/DB logic, not file parsing. The three parsing adapters total only ~2,400 lines. That shapes the port: the hard part is the reconcile/commit semantics, not the readers.

## 2. Seams and test assets

- **Size:** 52 test files, ~36.9k lines in tests/testthat plus helpers (the 44k figure presumably includes other test dirs). ~1,290 `test_that` blocks; dev/STATE.md reports 1,286 tests / 6,077 expectations / 0 fail / 9 skip.
- **Kinds:** mostly unit and integration tests per module (one test file per R file); migration tests 001-010 against DB copies; end-to-end tests (test-e2e-pipeline.R, test-e2e-corpus.R); lint-style tests over the source (test-coverage-map-lint.R, test-mock-scope-lint.R, test-payload-lint.R, helper-source-scan.R). No snapshot (`expect_snapshot`) tests found and no property-based tests found (grep for set.seed / property hit only comments). Speed was not measured; DuckDB in-memory tests are likely seconds to a couple of minutes (inferred).
- **Fixtures:** 632 KB in tests/testthat/fixtures: real anonymised ALS files (ES2617126 ESdat triple, ES2600185 XTAB csv plus SpreadsheetML .XLS twin, ES2537534 ENMRG; latin-1 bytes preserved), synthetic ACIRL xlsx workbooks built by generator scripts (real binary .xls rewritten as .xlsx), registry name CSVs. Details in fixtures/REAL-FIXTURES.md. The EPA data is public, so real values were committed.
- **Real corpus:** ~265 real files outside the repo (SharePoint), gated by env var `SAMPLETIDY_CORPUS` (helper-corpus.R). Four real-corpus gates passed in July (route sweep, parse sweep, cross-format equivalence, dry run against a DB copy). Also dev/ holds EPA xlsx and PDFs.
- **Reference implementation: yes, with caveats.** The R code is the only precise statement of behaviour (the contract A1-A86 in dev/plans/CONTRACT.md and OPERATING-RULES.md are the written rulings). Differential testing is feasible at two levels: (a) adapter level, same files -> compare IR tables (deterministic, no DB); (b) pipeline level, same files plus same starting DB -> compare resulting rows.
- **Determinism:** adapters and reconcile are deterministic functionally. Non-determinism in output: `uuid::UUIDgenerate()` for new row ids (commit.R, archive.R, assemble.R etc.), `Sys.time()` for `first_seen`, `created_at`, change_log `at`. A differential harness must normalise or inject these (map uuids by natural key, ignore timestamps). Row order is probably not guaranteed (inferred). Float noise in sources (`0.0299999999999999`) means numeric comparison needs a stated tolerance or decimal rule; STATE.md says rounding "must be decided rather than inherited".
- **Weakness for porting:** the test suite is R-flavoured (R-level mocks, tibbles, source scans). It cannot be run against Rust. It documents behaviour but is not a portable spec. The portable assets are the fixtures plus recorded R output, which do not yet exist as golden files.

## 3. What a Rust port needs (all from knowledge, not checked)

| R dependency | Rust replacement | maturity / risk |
|---|---|---|
| readr (CSV, encodings) | `csv` + `encoding_rs` | mature; latin-1/MacRoman handling is manual but easy. Low risk |
| xml2 (Header.XML, SpreadsheetML) | `quick-xml` or `roxmltree` | mature. Low |
| readxl (.xlsx and legacy binary .xls) | `calamine` | .xlsx solid; .xls (BIFF) supported but less battle-tested on odd human-edited workbooks. ACIRL files are .xls in the corpus. **Medium-high risk**; needs corpus sweep |
| PDF text/table extraction | `pdf-extract`, `lopdf`, `pdfium-render` (binding to C++ pdfium) | text extraction OK; **table extraction is weak** in Rust. But sampleTidy has no PDF parser today; the plan is an LLM extractor. So the PDF risk is about the not-yet-built feature, and the LLM route is language-neutral. Rust needs only text/page images plus an HTTP/CLI call |
| units (udunits2) | `uom` (compile-time, fixed quantity set), `dimensioned`, or hand-rolled; no udunits2 equivalent that parses arbitrary strings like `mg/L`, `ug/m2/day`. Binding to libudunits2 via FFI is possible | **High risk.** R's code relies on `units::as_units(u)` validity and `ud_are_convertible`. Lab unit strings are free text; a bespoke parser plus an alias table is probably the right answer, and it must be differential-tested against R |
| dplyr/purrr/stringr/tibble reshaping | `polars` (large, fast-moving API) or plain structs plus iterators; `regex` | polars is mature but heavy and API-churning; most of this code is row logic with DB lookups, so plain typed structs are likely cleaner. Medium effort, low risk |
| DuckDB (DBI/duckdb) | `duckdb` crate | mature, bundled build is slow to compile. Low-medium. Concurrency/locking semantics match since same engine. Migrations would be rewritten as SQL files |
| digest (hash) | `sha2` / `md5` | trivial |
| uuid | `uuid` | trivial |
| jsonlite | `serde_json` | mature |
| checkmate/cli/rlang/fs | `serde` validation, `tracing`/`anyhow`/`thiserror`, `std::fs`, `camino` | trivial |
| filelock, processx | `fs2`/`fd-lock`, `std::process` | trivial |
| email | none in package; Power Automate and launchd do it | n/a |
| ellmer (future) | `reqwest` to an API, or shell out to Claude CLI | fine |
| sf (Suggests) | `geo`/`proj` | unknown use; check before deciding |

Risky: legacy .xls, units, DuckDB build time, and (only if the PDF path is ported natively) PDF tables.

## 4. Port order, walking skeleton first

**Skeleton:** ALS ESdat (the "primary" format, UTF-8/latin-1 CSV plus XML, ~130 corpus files, content-identical to the other ALS formats per DESIGN.md 2.1). Slice 0: Rust binary reads the ES2617126 triple, writes IR; compare IR with R's IR dumped to golden JSON. Slice 1: plus reconcile (against an empty DB) and commit into a fresh DuckDB with the same schema; compare tables after normalising uuids and timestamps.

**Widening (rough count, 9-11 slices):**
0. Harness: golden R outputs, comparator, normaliser (before any Rust).
1. IR + ESdat parse.
2. Assemble + reconcile against empty DB + commit + schema (largest slice; split in two if needed).
3. Reconcile against populated DB (already-present, conflict, review_queue).
4. Router, hashing, archive, quarantine, ingest_dir loop.
5. Feature alias resolution (1,998 R lines, intricate).
6. Crosstab (XTAB/ENMRG, encodings, `----` cells).
7. Units engine (can start earlier in parallel).
8. ACIRL workbook (hardest parser; .xls geometry, fill-down, date conflicts).
9. Migrations and the mutation API (db_append/update/delete, correct_value, resolve_review).
10. Snapshots, config, watcher/launchd.
Existing live DB compatibility (migrating or reusing the 97k-row DuckDB file with its ten migrations) is a cross-cutting requirement from slice 2 on. Planned features not yet built in R (ACIRL gas readings, LLM adapters, corpus run, SpreadsheetML XTAB) could be built in Rust directly and not ported.

## 5. Language view

Facts that bear on it: the maintainer is a domain expert working through agents; the deployment is a local Mac job plus a human review loop, not a service; the code is ~45% registry/reconcile logic over a DB, ~15% parsing, the rest orchestration; the R package already works and has a large test suite; ecosystem sits in R (tidyWaste, dashboard, leachatetools) and downstream consumers read the DuckDB.

**Rust, pros:** type safety exactly at the adapter/IR boundary (the IR contract A-rulings become types; no silent NA coercion); one static binary for launchd, no R install; fast, deterministic; compiler as an agent-proof check, which suits agent-run work and the "trustworthy" aim. **Cons:** the ecosystem gaps in item 3 (units, legacy .xls, tabular reshaping); the owner cannot read Rust, so review rests wholly on tests; a port reproduces R quirks and the 86 rulings (A1-A86) which are encoded in code, not only in specs; the other tidyWaste tools stay in R, so the system becomes two-language anyway; for a monthly batch job on tens of files, speed is irrelevant; compile and DuckDB-bundled build times slow agent loops.

**R (stay), pros:** zero port risk; owner reads R; the tidy ecosystem and udunits fit; fixtures and tests are already there. **Cons:** dynamic typing at boundaries (mitigated by checkmate and the IR validators already present); NA/factor/locale behaviours; agent-written R is less strictly checkable; test suite is slow-ish to run in agent loops (not measured).

**Python:** pros: best-in-class libraries for exactly the weak spots (`pint` units, `xlrd`/`pandas` for .xls, `pdfplumber`/`camelot` for PDF tables, official DuckDB client, `pydantic` for typed IR boundary, polars); agents are very fluent in it; easy to run `mypy --strict`. Cons: weaker static guarantees than Rust; still a port.

**Recommendation:** do not port the whole package for its own sake. Moderate confidence (about 65%) that the best trade is: keep R as the reference and the home of registry/reconcile until the owner states a concrete benefit that R cannot give; if the goal is trustworthy software through types and a single binary, the strongest honest case for Rust is a **bounded** port: IR + adapters + commit as a typed core, with R still reading the DuckDB. If he wants a full rewrite anyway, Python would be lower risk than Rust given units, .xls and PDF, and Rust would be acceptable only if units and .xls are spiked first. Low confidence (about 40%) on Rust versus Python for a full rewrite; the deciding data would be two spikes (calamine on the real ACIRL .xls files; a units parser over all unit strings in the corpus). The owner should also weigh that "port" and "new features" compete; the planned features (gas readings, LLM adapters) would be easier to build first in R than to build in a half-ported system.

## 6. Implications for the build tool

1. **Reference-implementation mode:** a project declares an existing implementation as oracle; the tool generates and stores golden outputs from it (IR dumps, DB table dumps) and treats them as the test spec. Goldens are recorded once, versioned, and re-recordable only on an explicit ruling.
2. **Differential test harness as a first-class gate:** same input files in, compare outputs with a declared normaliser (uuid mapping by natural key, timestamp masking, numeric tolerance, row-order independence). Divergences must be classified (bug, intended R quirk kept, R bug fixed) and recorded, because the A1-A86 rulings show behaviour decisions live in the code.
3. **Real-file fixtures and gated corpus runs:** support fixture sets that are too large or private to commit (env-gated corpus path, as helper-corpus.R does), plus the three-tier idea: committed anonymised fixtures, local corpus sweep, dry run against a copy of the live DB. Never write to the live DB; "explicit instruction" is already a standing rule.
4. **Two languages in one repo during the port:** two toolchains and test runners behind one gate interface (R `testthat`, `cargo test`), a shared `golden/` directory, slice-level tracking of "ported / still R", and no language-specific code in the tool (consistent with the owner's no-hard-coding rule; go via a project config, as stellwerk does).
5. **Slice plans, not a big-bang plan:** plan units = vertical slices with a differential gate each (about 10 slices above); a spike stage before commitment (calamine on .xls, units) with a go/no-go ruling.
6. **Feature work after the port:** the same tool must then work on a single-language repo with no oracle; so the oracle becomes the previous release. Characterisation tests from the port carry over.
7. **Domain-expert owner:** escalations phrased in domain terms (e.g. the dust conflicts in STATE.md); rulings logged like the A-numbers; agent numbers kept distinct from decision numbers.
8. **Long-running, quirky data:** a hydration-safe corpus reader (OneDrive Files-On-Demand), and tolerance for 9 skipped and corpus-gated tests, not green-or-red only.
9. **Existing build records** (dev/tdd-run, dev/plans, 230 commits) show the tool was already used on this package; the successor can mine them for what worked (CONTRACT.md as single source of truth, COVERAGE-MAP.md criterion-to-test map).
