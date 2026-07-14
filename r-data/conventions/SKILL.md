---
name: conventions
description: >
  Coding conventions for data-engineering R projects — automated ingestion,
  tidying, and pipelines where data integrity is the product. Functional by
  default, contract-validated at every boundary, idempotent, reproducible from
  raw. Use when writing, refactoring, or reviewing R code in a data project,
  or when setting up a new one. Other r-data workflow skills reference this
  for the house style.
---

# Conventions for data-engineering R projects

These conventions serve projects built around **data** — automated ingestion,
cleaning, tidying, and delivery, where the product is a dataset someone else
will trust. They are the house style the other r-data skills (`plan`, `tests`,
`implement`, `verify`, `review`) assume.

A concise, always-on version lives in `templates/CLAUDE.md` — drop it into a
project root so it auto-loads every session. This skill is the fuller
reference: the *why*, the edge cases, and the commands.

## Data integrity first

This is the prime directive. **NEVER trade data integrity for performance,
terseness, or convenience.** A pipeline that silently drops, duplicates,
coerces, or mangles rows is broken no matter how fast it runs. When a
tidying choice is likely to cause a significant performance problem, **flag
it; do not silently "fix" it** by trading away integrity. Surface the
trade-off to the user instead (the `implement` skill collects these).

The canonical failure modes — treat every one as a bug to design against, not
an edge case to hope past:

- **Silent type coercion** — a numeric column arriving as character (one
  stray `"N/A"`), factors from strings, integer overflow, dates parsed in the
  wrong order (`dmy` vs `mdy`).
- **Join fan-out and fall-out** — an unexpected many-to-many join multiplying
  rows; an inner join silently dropping unmatched keys. Account for every row:
  after a join, the row count is either proven or explained.
- **Missingness conflation** — `NA` vs `""` vs `"NULL"` vs `"N/A"` vs 0 are
  five different facts. Decide and document which means what at ingestion.
- **Timezone and DST shifts** — a timestamp without an explicit timezone is a
  bug. Store UTC, convert at the edges, never rely on the session locale.
- **Encoding and locale** — declare encodings on read; never let the locale
  decide decimal separators or date order.
- **Duplicate and late deliveries** — the same source file arriving twice, or
  last month's correction arriving today, must not corrupt the output.

Comment every non-obvious cleaning or business rule with its justification
and source (the data dictionary, the provider's spec, the email where the
rule was agreed). A reader must be able to trace a transformation back to the
requirement it implements.

## Contracts at every boundary

Data crossing a boundary — into the pipeline, between stages, out to
consumers — is **validated against an explicit contract**, not assumed:

- Declare each table's schema (column names, types, units, keys, allowed
  ranges/sets, nullability) in code — `pointblank` validation steps or a
  Frictionless Table Schema. The contract lives with the pipeline and fails
  loudly on drift.
- **Validate on ingestion** (the source will change without telling you),
  and **validate the delivered output** (your consumers' contract).
- Keys are declared and checked: uniqueness, referential integrity, and
  completeness against control totals where the source provides them.
- Reconciliation is part of the pipeline, not a manual afterthought: row
  counts and control totals from the source are carried through and asserted
  at the end.

## Idempotent, reproducible from raw

- **Raw data is immutable.** Land source data as received under `data-raw/`
  (or the ingest landing zone) and never edit it — every fix is a scripted
  transformation downstream.
- **Re-running is always safe.** The same input produces identical output;
  incremental runs never duplicate. Design ingestion around natural keys or
  delivery manifests, not "did I run this already?" memory.
- **The pipeline is the documentation.** Use `targets` for anything
  multi-stage — dependencies explicit, stale stages rebuilt, nothing run by
  hand in a particular order that only you know.
- Any stochastic step (sampling for QA, jitter for anonymisation) sets or
  accepts a seed. In tests, seed locally (`withr::local_seed()`).

## Functional by default

- Prefer **pure functions**: a tidying step takes a data frame, returns a
  data frame, touches nothing else. Compose small steps; let `targets` own
  the state.
- Prefer `purrr::map_*()` / `vapply()` over accumulating `for`-loops and over
  `sapply()` (not type-stable). Keep return types stable.
- Use OOP **only when necessary** (S7, then S3) — rare in pipeline code. See
  the `r-oop` skill for the decision framework.

## Style

- Follow the **tidyverse style guide**.
- Prefer tidyverse solutions over base R, **unless** base R avoids a genuine
  measured performance penalty (see `benchmark-optimise`).
- Prefer existing functions from maintained packages over rolling your own:
  `janitor` for cleaning chores, `readr`/`vroom`/`arrow` for IO, `dbplyr` for
  database work, `lubridate`/`clock` for dates.
- Use the base pipe `|>`, not the magrittr `%>%`.
- Anonymous functions: `\(x) ...` single-line, `function(x) { ... }` otherwise.
- Run `styler` and `lintr` (tidyverse config) before committing; fix all lints.

## Data formats

Choose by **shape and size**:

- **Small tabular** → **CSV in Frictionless Data form** — a
  `datapackage.json` (Table Schema) describing fields, types, constraints,
  units, and source. Self-describing and validatable.
- **Large tabular** → **Parquet** — columnar, compressed, schema-bearing,
  read directly by arrow and DuckDB.
- **Large or relational**, or out-of-core queries → **DuckDB**.
- **Non-tabular R objects** (fitted objects, lists) → **`qs2`**.

Deliverables carry their schema with them; a bare CSV with no data
dictionary is half a deliverable.

## Documentation

- Every function — exported or internal — carries roxygen2 documentation;
  internal functions marked `@noRd`. Re-document after changing any roxygen
  block that produces an `.Rd`.
- Every dataset the project delivers has a data dictionary (the Frictionless
  schema or equivalent): field meanings, units, provenance, refresh cadence.
- Every user-facing change earns a `NEWS.md` bullet referencing the issue/PR.

## Tooling and commands

```r
# Load for interactive work
devtools::load_all()

# Tests (see the testing-r-packages skill for patterns)
devtools::test()
devtools::test(filter = "^name")

# Pipeline (when targets is in use)
targets::tar_make()          # build what's stale
targets::tar_visnetwork()    # inspect the dependency graph
targets::tar_outdated()      # what would rebuild

# Validation
pointblank::scan_data(df)    # quick profile of an unfamiliar table

# Document and check
devtools::document()
devtools::check()

# Style and lint (fix all before committing)
styler::style_pkg()
lintr::lint_package()
```

- **Tests**: testthat 3e, under `tests/testthat/`; small fixture files under
  `tests/testthat/fixtures/` exercising the ugly realities (bad encodings,
  duplicate keys, schema drift).
- **Benchmarks**: the `bench` package under `bench/` (outside `R CMD check`),
  at realistic data volumes.
- **GitHub**: use the `gh` CLI for issues, comments, and PRs.

## Working with RTK

RTK compresses the output of the dev tools it recognises (git, docker, npm,
cargo, pytest, jest, linters, …) before you see it. It has **no R filter** —
`Rscript`, `R CMD check`, `targets`, and tests run through R all reach you in
full, so routine R output is safe to trust as-is.

When you need the full output of a tool RTK *does* compress, run it through
`rtk proxy <command>` (raw, still tracked) or `rtk run <command>` (raw, no
tracking). Don't accept a truncated value from a compressed tool when
correctness depends on it.

## Workflows

These conventions plug into the r-data workflow spine:

- Exploring whether this is the right thing to do at all → **`whiteboard`** skill.
- Asked for a plan, design, or approach → **`plan`** skill.
- Turning an approved plan into tests → **`tests`** skill (+
  `testing-r-packages` for mechanics).
- Implementing a non-trivial change → **`implement`** skill.
- Quality gate before committing / a debug loop → **`verify`** skill.
- Performance work → **`benchmark-optimise`** skill.
- Final review against the plan → **`review`** skill.
