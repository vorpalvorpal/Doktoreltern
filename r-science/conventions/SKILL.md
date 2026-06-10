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

Prioritise mathematical, statistical, physical, ecological, and biological
correctness above performance, terseness, and convenience. When a modelling or
numerical choice is likely to cause a significant performance problem, **flag
it — do not silently "fix" it** by trading away correctness. Surface the
trade-off to the user instead (the `implement` skill collects these).

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

## Documentation

- Every user-facing (exported) function has roxygen2 documentation; wrap
  roxygen comments at 80 characters.
- Internal functions get ordinary comments, not roxygen.
- Re-document after changing any roxygen comment (`devtools::document()`).
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

## Workflows

These conventions plug into the r-science workflow spine:

- Asked for a plan, design, or approach → **`plan`** skill.
- Turning an approved plan into tests → **`tests`** skill (+
  `testing-r-packages` for mechanics).
- Implementing a non-trivial change → **`implement`** skill.
- Quality gate before committing / a debug loop → **`verify`** skill.
- Performance work → **`benchmark-optimise`** skill.
- Final review against the plan → **`review`** skill.
