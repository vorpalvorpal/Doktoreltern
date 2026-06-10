---
name: verify
description: >
  Run the quality gates for a scientific R package and return a READY / NOT
  READY verdict. Use as the debug-loop backbone during implementation and as
  the pre-commit / pre-PR check. Gates on correctness (behaviour specs pass)
  and cleanliness, not on a line-coverage percentage.
---

# Verifying a scientific R package

A staged check that ends in **READY** or **NOT READY**. A failure in any gate
blocks READY. Use it two ways:

- **Quick mode** — inside the `implement` debug loop, on the stage you're
  working: fast feedback on the specs and lints for that file.
- **Full mode** — before committing a stage, and before opening a PR: the
  whole package.

> **Correctness, not coverage.** The gate is *do the behaviour specs pass* —
> the analytic, invariant, reference, and round-trip checks the `tests` skill
> wrote. A package can be 100%-covered and wrong, or 60%-covered and provably
> correct on every behaviour that matters. Coverage may be *reported* (below)
> but is never the gate.

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

### Gate 1 — Behaviour specs (the correctness gate)

```r
devtools::test()
```

- Every **implemented** spec passes. Read failures — a spec must pass because
  the behaviour is correct, never because it was weakened to fit the code.
- **Pending** specs are acceptable *during* implementation (they're the
  remaining checklist) but must be listed in the verdict. Before a PR, there
  should be no pending specs for behaviour the PR claims to deliver.

### Gate 2 — Build check

```r
devtools::check()
```

Pass: 0 errors, 0 warnings. Triage notes — each remaining note must be
understood and justified, not ignored.

### Gate 3 — Style

```r
styler::style_pkg()
```

Auto-formats; re-inspect the diff for anything style can't fix.

### Gate 4 — Lint

```r
lintr::lint_package()
```

Pass: 0 lints. Fix all flagged issues.

### Gate 5 — Documentation

```r
devtools::document()
```

Pass: re-documents cleanly with no diff churn beyond your changes; every new
exported function has roxygen2; `NEWS.md` has a bullet for each user-facing
change.

### Gate 6 — Diff review

```bash
git diff --stat HEAD
git diff HEAD
```

Confirm by eye:

- No unintended files changed.
- No leftover debug code — `print()`, `cat()`, `browser()`, `View()`.
- No hardcoded paths or credentials.
- Stochastic code sets/accepts a seed (not the global stream as a side effect).
- Scientific/statistical choices carry a justifying comment and reference.

### Optional — Coverage report (informational)

```r
covr::package_coverage()
```

Report it if useful for spotting *untested behaviour*, but do not gate on a
percentage. Use it to ask "is there a behaviour with no spec?", then add the
spec via the `tests` skill — don't chase a number with trivial tests.

## Verdict

```
## Verification Report

| Gate            | Status | Notes                              |
|-----------------|--------|------------------------------------|
| Behaviour specs | PASS   | 42 pass, 0 pending                 |
| Build check     | PASS   | 0 errors, 0 warnings, 1 note (…)   |
| Style           | PASS   | auto-fixed 2 files                 |
| Lint            | PASS   | 0 lints                            |
| Documentation   | PASS   | re-documented; NEWS updated        |
| Diff review     | PASS   | clean                              |

## Verdict: READY
```

Failure case lists each blocking issue by gate, then `Verdict: NOT READY`.
Fix all blockers and re-run. For a deeper pass against the plan (divergences,
design, scientific soundness), hand off to the `review` skill — `verify` is the
gate, `review` is the judgement.

## Next step

This only applies when `verify` was run on its own — inside the `implement`
loop it simply returns control without prompting. When the verdict is **READY**,
surface the next move:

> READY. Continue — commit this stage, or run the next phase command?

When **NOT READY**, list the blockers and stay put until they're fixed.
