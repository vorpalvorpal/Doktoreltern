---
name: verify
description: >
  Run the quality gates for a data-engineering R project and return a READY /
  NOT READY verdict. Use as the debug-loop backbone during implementation and
  as the pre-commit / pre-PR check. Gates on data integrity (behaviour specs
  and validation contracts pass) and cleanliness, not on a line-coverage
  percentage.
---

# Verifying a data-engineering R project

A staged check that ends in **READY** or **NOT READY**. A failure in any gate
blocks READY. Use it two ways:

**Evidence before verdict — no exceptions.** NEVER declare READY (or "done",
"works", "fixed") from memory or expectation. Run the relevant command *this
turn*, read the full output and exit status, and only then state the verdict
with that evidence. "Looks done" is not evidence; a verdict without a fresh run
is a regression waiting to ship.

- **Quick mode** — inside the `implement` debug loop, on the stage you're
  working: fast feedback on the specs and lints for that file.
- **Full mode** — before committing a stage, and before opening a PR: the
  whole project.

> **Integrity, not coverage.** The gate is *do the behaviour specs and
> validation contracts pass* — the schema, invariant, reconciliation, and
> idempotence checks the `tests` skill wrote. A pipeline can be 100%-covered
> and still mangle rows, or 60%-covered and provably sound on every contract
> that matters. Coverage may be *reported* (below) but is never the gate.

## Quick mode (debug loop)

```r
devtools::load_all()
devtools::test(filter = "^<name>")   # the stage's specs
lintr::lint("R/<name>.R")
```

Pass when the stage's specs pass for the right reason and the file is
lint-clean. Loop here until green, then run full mode before committing.

## Full mode

Run each gate in order.

### Gate 1 — Behaviour specs (the integrity gate)

```r
devtools::test()
```

- Every **implemented** spec passes. Read failures — a spec must pass because
  the behaviour is correct, never because it was weakened to fit the code.
- **Pending** specs are acceptable *during* implementation (they're the
  remaining checklist) but must be listed in the verdict. Before a PR, there
  should be no pending specs for behaviour the PR claims to deliver.

### Gate 2 — Pipeline build (when `targets` is in use)

```r
targets::tar_make()
```

Pass: the pipeline builds end-to-end from a clean state with no errors, and
in-pipeline validation steps (`pointblank` agents, assertion targets) all
pass. A pipeline that only builds from a warm cache is not proven.

### Gate 3 — Build check

```r
devtools::check()
```

Pass: 0 errors, 0 warnings. Triage notes — each remaining note must be
understood and justified, not ignored.

### Gate 4 — Style

```r
styler::style_pkg()
```

Auto-formats; re-inspect the diff for anything style can't fix.

### Gate 5 — Lint

```r
lintr::lint_package()
```

Pass: 0 lints. Fix all flagged issues.

### Gate 6 — Documentation

```r
devtools::document()
```

Pass: re-documents cleanly with no diff churn beyond your changes; every new
exported function has roxygen2; the data dictionary covers any new or changed
delivered fields; `NEWS.md` has a bullet for each user-facing change.

### Gate 7 — Diff review

```bash
git diff --stat HEAD
git diff HEAD
```

Confirm by eye:

- No unintended files changed; **no raw data edited in place** (raw is
  immutable — fixes are scripted transformations downstream).
- No leftover debug code — `print()`, `cat()`, `browser()`, `View()`.
- No hardcoded paths or credentials.
- Every join accounts for its rows (asserted counts or an explained
  divergence); no silent `NA` coercion introduced.
- Timestamps carry explicit timezones; reads declare encodings; nothing
  depends on the session locale.
- Stochastic code sets/accepts a seed (not the global stream as a side
  effect).
- Non-obvious cleaning/business rules carry a justifying comment and source.

### Optional — Coverage report (informational)

```r
covr::package_coverage()
```

Report it if useful for spotting *untested behaviour*, but do not gate on a
percentage. Use it to ask "is there a contract with no spec?", then add the
spec via the `tests` skill — don't chase a number with trivial tests.

## Verdict

```
## Verification Report

| Gate            | Status | Notes                              |
|-----------------|--------|------------------------------------|
| Behaviour specs | PASS   | 42 pass, 0 pending                 |
| Pipeline build  | PASS   | tar_make clean; 6 validations pass |
| Build check     | PASS   | 0 errors, 0 warnings, 1 note (…)   |
| Style           | PASS   | auto-fixed 2 files                 |
| Lint            | PASS   | 0 lints                            |
| Documentation   | PASS   | re-documented; dictionary updated  |
| Diff review     | PASS   | clean                              |

## Verdict: READY
```

Failure case lists each blocking issue by gate, then `Verdict: NOT READY`.
Fix all blockers and re-run. For a deeper pass against the plan (divergences,
design, data soundness), hand off to the `review` skill — `verify` is the
gate, `review` is the judgement.

## Next step

This only applies when `verify` was run on its own — inside the `implement`
loop it simply returns control without prompting. When the verdict is **READY**,
surface the next move:

> READY. Continue — commit this stage, or run the next phase command?

When **NOT READY**, list the blockers and stay put until they're fixed.
