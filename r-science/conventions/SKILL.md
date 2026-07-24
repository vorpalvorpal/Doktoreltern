---
name: conventions
description: >
  Coding conventions for science-centered R packages — functional by default,
  correctness above performance, reproducible, well-referenced. Use when
  writing, refactoring, or reviewing R code in a scientific package, or when
  setting up a new one. Other r-science workflow skills reference this for the
  house style.
---

# Conventions for scientific R packages

These conventions serve packages built around **science** — implementations of
models, methods, and computations where mathematical, statistical, physical,
and biological correctness is the product. They are the house style the other
r-science skills (`plan`, `tests`, `implement`, `verify`, `review`) assume.

A concise, always-on version lives in `templates/CLAUDE.md` — drop it into a
package root so it auto-loads every session. This skill is the fuller
reference: the *why*, the edge cases, and the commands.

## Correctness first

This is the prime directive. **NEVER trade correctness for performance,
terseness, or convenience** — mathematical, statistical, physical, ecological,
and biological correctness come first, always. When a modelling or numerical
choice is likely to cause a significant performance problem, **flag it; do not
silently "fix" it** by trading away correctness. Surface the trade-off to the
user instead (the `implement` skill collects these). Correctness traded for
speed is a bug that ships looking like a feature — every time.

Comment every non-obvious scientific or statistical choice with its
justification and a reference to the original source where one exists (paper +
DOI, standard procedure, textbook section). A reader should be able to trace a
line of code back to the equation it implements.

## Functional by default

Write in a functional style and reach for objects only when a functional
approach genuinely doesn't fit.

- Prefer **pure functions**: output determined by input, no hidden state, no
  side effects. Compose small functions rather than mutating shared state.
- Prefer `purrr::map_*()` / `vapply()` over `for`-loops that accumulate, and
  over `sapply()` (not type-stable). Keep return types stable.
- Use OOP **only when necessary** — genuine polymorphism, or stateful objects
  with an invariant to protect. When you do, prefer **S7**, then S3; avoid S4
  and R6 unless there's a concrete reason. State which and why. See the
  `r-oop` skill for the decision framework and patterns.

## Style

- Follow the **tidyverse style guide**.
- Prefer tidyverse solutions over base R, **unless** base R avoids a genuine
  performance penalty (measure before claiming one — see the
  `benchmark-optimise` skill).
- Prefer existing functions from maintained, stable packages over rolling your
  own.
- Use the base pipe `|>`, not the magrittr `%>%`.
- Anonymous functions: `\(x) ...` for single-line, `function(x) { ... }`
  otherwise.
- Run `styler` and `lintr` (tidyverse config) before committing; fix all
  lints.

## Reproducibility

Any stochastic code must set or accept a seed so behaviour is reproducible.
In package code, take an explicit `seed`/RNG argument rather than calling
`set.seed()` as a side effect on the user's global stream. In tests and
examples, seed locally (`withr::local_seed()`).

A seed alone doesn't reproduce a result — pin the **computational environment**
too: use **`renv`** to snapshot/restore package versions, and record the R
version. Where results are quoted (vignettes, reports, papers), capture
`sessionInfo()`. Keep this proportionate — do it for anything whose numbers
you'd publish or cite, not for throwaway scripts.

## Data

Choose the format by **shape and size**:

- **Small tabular** → **CSV in Frictionless Data form** — a `datapackage.json`
  (Table Schema) describing each CSV's fields, types, constraints, units, and
  source. Self-describing, validatable, and it pins down the provenance of any
  reference/known-answer dataset. (See the `frictionless` skill.)
- **Large tabular** (too big for CSV, no relational/query complexity) →
  **Parquet** — columnar, compressed, language-agnostic, schema-bearing, read
  directly by arrow and DuckDB. Frictionless can describe and validate Parquet
  too, so provenance carries over.
- **Large or relational tabular**, or needing out-of-core queries → **DuckDB**
  (a `.duckdb` database).
- **Large non-tabular R objects** (model fits, arrays, lists) → **`qs2`**
  (`qs2::qs_save()` / `qs2::qs_read()`) — fast, compressed serialisation.

A Frictionless Table Schema can *document* a `qs2` object as metadata, but the
Frictionless tooling can't *validate* a `qs2` blob (it parses CSV/Parquet) — so
for anything that needs schema validation, prefer CSV or Parquet.

## Documentation

- Every function — exported or internal — carries roxygen2 documentation; wrap
  comments at 80 characters.
- **Internal (non-exported) functions must be marked `@noRd`** so no `.Rd` help
  file is generated for them. (roxygen generates an `.Rd` for any documented
  object *without* `@noRd`, regardless of export — an undocumented-but-exported
  vs internal distinction it does **not** make for you. Unmarked internals would
  clutter the manual and trip `R CMD check`.) Exported functions get a real
  `.Rd`.
- Re-document (`devtools::document()`) after changing any roxygen block that
  produces an `.Rd` — exported functions, or any internal one not marked
  `@noRd`.
- Every user-facing change earns a `NEWS.md` bullet (skip pure docs/internal
  refactors). Name the affected function early in the bullet and reference the
  issue/PR number before the final period: `(#123).`

## Tooling and commands

```r
# Load the package for interactive work
devtools::load_all()

# Tests (see the testing-r-packages skill for patterns)
devtools::test()
devtools::test(filter = "^name")              # files matching ^name
devtools::test_active_file("R/name.R")

# Document and check
devtools::document()
devtools::check()

# Style and lint (fix all before committing)
styler::style_pkg()
lintr::lint_package()

# Benchmark and profile (see the benchmark-optimise skill)
# bench::mark(...) / bench::press(...) under bench/, outside R CMD check
# profvis::profvis(...) to locate a bottleneck
```

- **Tests**: testthat 3e, under `tests/testthat/`.
- **Benchmarks**: the `bench` package, kept under `bench/` (outside
  `R CMD check`). Use `profvis` to locate bottlenecks before optimising.
- **GitHub**: use the `gh` CLI for issues, comments, and PRs.

## Working with RTK

RTK compresses the output of the dev tools it recognises (git, docker, npm,
cargo, pytest, jest, linters, …) before you see it. It has **no R filter** —
`Rscript`, `R CMD check`, `bench`, `profvis`, and tests run through R all reach
you in full, so routine R correctness output is safe to trust as-is.

When you need the full output of a tool RTK *does* compress, run it through
`rtk proxy <command>` (raw, still tracked) or `rtk run <command>` (raw, no
tracking). Don't accept a truncated value from a compressed tool when
correctness depends on it.

## Workflows

These conventions plug into the r-science workflow spine:

- Exploring whether this is the right thing to do at all → **`whiteboard`** skill.
- Asked for a plan, design, or approach → **`plan`** skill.
- Turning an approved plan into tests → **`tests`** skill (+
  `testing-r-packages` for mechanics).
- Implementing a non-trivial change → **`implement`** skill.
- Quality gate before committing / a debug loop → **`verify`** skill.
- Performance work → **`benchmark-optimise`** skill.
- Final review against the plan → **`review`** skill.
