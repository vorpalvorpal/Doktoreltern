# Project conventions

## Tone
Do not praise the user or their ideas ("good idea", "great question",
"you're absolutely right"). Flattery encourages over-confidence and leads to
worse outcomes. Evaluate proposals on their merits: when you agree, say why
in technical terms; when you disagree, push back plainly. The aim is to
improve the work, not to flatter its author.

This is a data-engineering R project: the product is datasets someone else
will trust. Full house style is in the `conventions` skill; the essentials:

## Data integrity first
Never trade data integrity for performance or convenience. Design against the
canonical failures: silent type coercion, join fan-out/fall-out (account for
every row), missingness conflation (`NA` vs `""` vs `"NULL"` vs 0), implicit
timezones (store UTC, convert at edges), locale-dependent parsing, and
duplicate/late deliveries. Flag — but do not silently "fix" — any tidying
choice likely to cause significant performance issues.

## Contracts and reconciliation
- Every boundary (ingestion, between stages, delivery) validates against an
  explicit schema contract (`pointblank` / Frictionless Table Schema); fail
  loudly on drift.
- Keys declared and checked: uniqueness, referential integrity.
- Row counts and control totals carried through and asserted at the end.

## Idempotent, reproducible from raw
- Raw data is immutable (`data-raw/` or landing zone); every fix is a
  scripted transformation downstream.
- Re-running is always safe: same input → identical output; incremental runs
  never duplicate.
- Multi-stage work runs through `targets`, never by-hand ordering.
- Set/accept a seed for any stochastic step.

## Style
- Functional by default: tidying steps are pure data-frame-in, data-frame-out
  functions. OOP only when necessary (S7, then S3); see the `r-oop` skill.
- Tidyverse style guide; tidyverse over base R unless base R avoids a
  measured penalty. `janitor`, `readr`/`arrow`, `dbplyr`, `lubridate`/`clock`
  over hand-rolling.
- Base pipe `|>`, not `%>%`. Run `styler` and `lintr` before committing.
- roxygen2 on every function; internals marked `@noRd`.
- Comment non-obvious cleaning/business rules with justification and source.

## Data formats
Small tabular → CSV in Frictionless Data form; large tabular → Parquet;
relational/queried → DuckDB; non-tabular R objects → `qs2`. Deliverables
carry their schema (data dictionary) with them.

## Tooling
- Tests: testthat 3e under `tests/testthat/`, fixtures exercising ugly
  realities (bad encodings, duplicate keys, schema drift).
- Pipeline: `targets::tar_make()` / `tar_visnetwork()` / `tar_outdated()`.
- Benchmarks: `bench` under `bench/`, at realistic data volumes.
- GitHub: the `gh` CLI. RTK compresses known dev tools but not R; use
  `rtk proxy <command>` for full output from compressed tools.

## Workflows
- Is this even the right thing to do → **whiteboard** skill.
- Plan, design, or approach → **plan** skill.
- Approved plan into tests → **tests** skill.
- Implementing a non-trivial change → **implement** skill.
- Quality gate / debug loop → **verify** skill.
- Performance work → **benchmark-optimise** skill.
- Final review against the plan → **review** skill.
