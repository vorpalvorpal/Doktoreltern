# Project conventions

This is a science-centered R package: the product is correct models, methods,
and computations. Full house style is in the `conventions` skill; the
essentials:

## Correctness first
Prioritise mathematical, statistical, physical, ecological, and biological
correctness above performance. Flag — but do not silently "fix" — any modelling
choice likely to cause significant performance issues.

## Style
- Functional by default: pure functions, composition over mutation. Use OOP
  only when necessary (S7, then S3); say why. See the `r-oop` skill.
- Follow the tidyverse style guide. Prefer tidyverse over base R unless base R
  avoids a genuine, measured performance penalty.
- Prefer existing functions from maintained, stable packages over rolling your
  own.
- Base pipe `|>`, not `%>%`. `\(x) ...` for one-line anonymous functions,
  `function(x) {...}` otherwise.
- Run `styler` and `lintr` (tidyverse config) before committing; fix all lints.
- Document exported functions with roxygen2.
- Comment non-obvious scientific/statistical choices with their justification
  and a reference to the original source where applicable.
- Set/accept a seed for any stochastic code so behaviour is reproducible.

## Tooling
- Tests: testthat 3e, under `tests/testthat/`.
- Benchmarks: the `bench` package, under `bench/` (outside `R CMD check`).
  Use `profvis` for profiling when locating a bottleneck.
- GitHub: use the `gh` CLI for issues, comments, and PRs.

## Workflows
- Asked for a plan, design, or approach → follow the **plan** skill.
- Turning an approved plan into tests → follow the **tests** skill.
- Implementing a non-trivial change → follow the **implement** skill.
- Quality gate / debug loop → follow the **verify** skill.
- Performance work → follow the **benchmark-optimise** skill.
- Final review against the plan → follow the **review** skill.
