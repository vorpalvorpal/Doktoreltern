# Project conventions

## Tone
Do not praise the user or their ideas ("good idea", "great question",
"you're absolutely right"). Flattery encourages over-confidence and leads to
worse outcomes. Evaluate proposals on their merits: when you agree, say why
in technical terms; when you disagree, push back plainly. The aim is to
improve the work, not to flatter its author.

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
- Document every function with roxygen2; mark internal functions `@noRd` so
  only exported functions generate `.Rd` help files. Re-document
  (`devtools::document()`) after changing a roxygen block that produces an `.Rd`.
- Comment non-obvious scientific/statistical choices with their justification
  and a reference to the original source where applicable.
- Set/accept a seed for any stochastic code so behaviour is reproducible.

## Data
- By shape and size: small tabular → CSV in Frictionless Data form; large
  tabular → Parquet; relational/queried → DuckDB; large non-tabular R objects →
  `qs2`.

## Tooling
- Tests: testthat 3e, under `tests/testthat/`.
- Benchmarks: the `bench` package, under `bench/` (outside `R CMD check`).
  Use `profvis` for profiling when locating a bottleneck.
- GitHub: use the `gh` CLI for issues, comments, and PRs.
- RTK compresses output for the tools it knows (git, docker, test runners,
  linters) but NOT R — `Rscript`, `R CMD check`, and `bench` reach you in full.
  For full output from a tool RTK does compress, use `rtk proxy <command>`.

## Workflows
- Exploring whether this is even the right thing to do → **whiteboard** skill.
- Asked for a plan, design, or approach → follow the **plan** skill.
- Turning an approved plan into tests → follow the **tests** skill.
- Implementing a non-trivial change → follow the **implement** skill.
- Quality gate / debug loop → follow the **verify** skill.
- Performance work → follow the **benchmark-optimise** skill.
- Final review against the plan → follow the **review** skill.
