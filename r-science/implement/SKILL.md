---
name: implement
description: >
  Orchestrate implementation of an approved plan for a scientific R package by
  delegating coding to subagents, stage by stage — capturing benchmark
  baselines, turning the plan's pending behaviour specs green, and deferring
  behaviour-changing optimisations for the user. Use when implementing a
  non-trivial change that already has a plan and tests.
disable-model-invocation: true
---

# Implementing a non-trivial change

You are the **orchestrator**. You read, delegate, benchmark, test, review, and
commit — but you **delegate the feature coding to subagents**. You personally
own the scientific judgement: benchmarks, tests, correctness review, and the
decision to commit each stage.

Follow the `conventions` skill throughout, and require every subagent to do the
same.

## 0. Preconditions

- There must be an **approved plan** (`plan` skill) with ordered stages and,
  per function, the behaviours and their correctness basis.
- There must be a **behaviour spec** in `tests/testthat/` (`tests` skill) — the
  pending `it("...")` specs are your checklist.
- `plan` and `tests` are explicit commands (`/plan`, `/tests`); you cannot
  invoke them yourself. If either artefact is missing, **stop and tell the user
  to run `/plan` and/or `/tests` first**, then resume.

## 1. Verify git state

```bash
git branch --show-current     # if main/master: STOP, ask user to branch
git log --oneline main..HEAD | wc -l
git status --short
```

- On `main`/`master`: stop and ask the user to create a feature branch.
- Fresh branch (zero commits ahead): `git fetch origin main && git rebase
  origin/main`. If it conflicts, stop and tell the user — never auto-resolve.
- Uncommitted changes: ask whether to stash, commit, or proceed.

## 2. Map the plan to stages and specs

Read the plan. For each stage identify:

- the target files and the concrete change;
- the **pending specs** that stage is responsible for turning green;
- the **benchmarks** the plan named for that stage;
- dependencies — which stages must precede it.

**Default to sequential.** Scientific stages usually build on each other.
Parallelise only stages the plan *explicitly marked independent*, and even then
batch conservatively (2–3 at a time) so you can review each before proceeding.
Two stages touching the same file are never parallel.

## 3. The per-stage loop

For each stage, in dependency order:

### 3a. Baseline benchmark

Run the stage's `bench` benchmarks to capture a **pre-implementation
baseline**, and record the numbers. For a brand-new function there's no
baseline — note that. This can run in the background while you prepare the
delegation.

### 3b. Pre-flight the tests

Run the stage's tests (`devtools::test(filter = ...)`).

- The stage's target specs are pending (SKIPPED) — expected.
- Any **gap-filling specs** (characterising existing behaviour) should pass. If
  one fails, you've found a pre-existing bug: surface it to the user. Only fix
  it now if this stage is going to replace that code anyway.

### 3c. Delegate the implementation

Write a subagent prompt and dispatch it. The prompt **must** carry the house
style and the acceptance criteria — see `references/delegation.md` for the
template, the model-selection guidance, and the conventions checklist every
prompt must include. Key points:

- The acceptance criterion is: **the stage's pending specs pass**, without
  weakening them.
- Require functional-by-default code, roxygen2 on new exported functions, and
  in-code comments justifying scientific/statistical choices with references —
  this **overrides** any generic "don't add comments/docs" subagent default.
- Scope is locked to the stage's files; behaviour-changing optimisations are
  forbidden (they get deferred — see 3f).

### 3d. Review the subagent's work

Read the diff yourself. Check: completeness, **scientific correctness** (does
the code actually implement the equation/method the plan cites?), scope (no
stray files), and conflicts with parallel work. Re-dispatch with a sharper
prompt if it's wrong — don't paper over it.

### 3e. Turn the specs green (debug loop)

Run the stage's tests. The previously-pending specs must now pass for the right
reason. If they don't, enter the debug loop backed by the **`verify`** skill:
isolate, fix (delegating if substantial), re-run. Iterate until green. Confirm
roxygen is present and the package re-documents cleanly.

### 3f. Re-benchmark and triage performance

Re-run the stage's benchmarks; compare to the 3a baseline. If there's a
significant bottleneck:

- First seek an alternative algorithm that produces **identical** outputs more
  efficiently. If one exists, it's in scope — implement it.
- If only an **approximation** would help, **do not implement it.** Add it to a
  running *deferred-optimisations* list with enough detail for the user to
  decide later (what it changes, the expected speedup, the correctness/accuracy
  cost). If it would affect later stages, raise it with the user now rather
  than at the end.

### 3g. Gate and commit

Run the **`verify`** skill as the quality gate. Then commit the stage with a
conventional-commit message, staging **specific files** (never `git add -A`).
Update the plan's checkboxes and the tracking doc (`working-on` skill, if in
use). Move to the next stage.

## 4. When the plan needs to change

If issues surface that require changing the plan, **stop and discuss with the
user.** Give them enough to decide: the issue, and the options with their
pros and cons — primarily in terms of correctness, then performance, then
effort. Keep it technically correct but as intuitive as possible. For a
scientific change, go back to the `plan` skill's whiteboard rather than
doubling down.

## 5. Final review, report, merge

When all stages are committed and green:

1. Tell the user to run **`/review`** for a full review against the plan
   (it's an explicit command you can't invoke yourself), and fold its findings
   into the report below.
2. **Report to the user:**
   - Divergences from the plan (list them), or confirmation it matches.
   - Test status: which behaviours are covered; any still pending.
   - Benchmarks: before/after comparison per stage.
   - The deferred-optimisations list (behaviour-changing speedups not applied).
3. **Always ask** whether they're ready to merge and close the issue. List any
   outstanding reasons it shouldn't be merged.
4. Only after an explicit **yes**: open a PR linking the issue (`gh pr
   create`), merge it (`gh pr merge`), add the divergences list as an issue
   comment if there was one, and close the issue.
5. Offer to open GitHub issues for any out-of-scope problems surfaced during
   implementation.

## Orchestration rules

1. Delegate the coding; never hand-write feature code yourself.
2. Read relevant files before writing a subagent prompt — give accurate
   context, not "find the file".
3. Correctness review is yours and is non-negotiable; don't rubber-stamp
   subagent output.
4. Commit per stage, not all at the end. Stage specific files.
5. Never force-push; never amend — new commits for fixes.
6. Keep the plan file and tracking doc updated as you go.

## Next step

After the final report, surface the next command rather than assuming it:

> Implementation complete (all specs green). Run `/benchmark-optimise` to work
> through the deferred-optimisations list and performance, then `/review` for
> the final pass?
