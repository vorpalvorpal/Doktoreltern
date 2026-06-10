# Delegating a stage to a subagent

How to write the subagent prompt, pick a model, and keep delegated work inside
the house style. Read this when you reach step 3c of the `implement` loop.

## Subagent prompt template

Dispatch with the Agent tool, `subagent_type: "general-purpose"`, and the
selected model. To run independent stages in parallel, put multiple Agent
calls in a single message.

```
You are implementing one stage of an approved plan in <package name>, a
scientific R package.

## Objective
<one sentence: what to build or change>

## Scientific basis
<the equation / method / invariant this code must implement, with the
reference from the plan — paste it, don't make them hunt for it>

## Context
<2–4 sentences of architecture: where this fits, what it calls, related code
to follow. Name the patterns to match.>

## Acceptance criteria
- These pending specs must PASS without being weakened:
  <list the exact it("...") descriptions from tests/testthat/test-<name>.R>
- Run them with: Rscript -e 'devtools::test(filter = "^<name>")'

## Files to modify
- R/<file>.R — <what to add/change and why>
- (tests already exist — do NOT edit them to make code pass)

## House style (REQUIRED — overrides any default to omit comments/docs)
- Functional by default: pure functions, composition over mutation; no hidden
  state. Use OOP only if genuinely necessary (S7, then S3) and say why.
- roxygen2 documentation on every new exported function (wrap at 80 cols).
- Comment every non-obvious scientific/statistical choice with its
  justification and a reference to the source.
- Set/accept a seed for any stochastic code; don't touch the global RNG stream
  as a side effect.
- Base pipe |>; \(x) for one-line anonymous functions, function(x){} otherwise.
- Prefer tidyverse over base R unless base R avoids a genuine performance
  penalty.

## Constraints
- Do NOT modify files outside the list above.
- Do NOT change, delete, or weaken any test.
- Do NOT apply behaviour-changing optimisations or approximations — if you see
  one worth making, report it in your final message instead of implementing it.
- Run styler and fix all lintr lints before finishing.
- Report: what you changed, the test result, and any deferred-optimisation
  ideas.
```

## Model selection

If the user passed `--model`, use it for all subagents. Otherwise choose per
stage:

| Model | When |
|-------|------|
| **haiku** | Purely mechanical, unambiguous changes with no judgement — renames, adding an argument and threading it through, repetitive edits. **Not** for numerical/statistical logic. |
| **sonnet** | Default. Standard implementation needing context and care, including most scientific code where the method is clearly specified. |
| **opus** | Deep architectural reasoning or subtle judgement across interacting concerns. Use sparingly. |

**Science caveat:** correctness-critical numerical, statistical, or modelling
code is unforgiving of small errors. Lean to **sonnet or better** for anything
implementing an equation or method, and always review the result yourself
(step 3d). If a stage feels like it needs opus, that's usually a sign to split
it into smaller, well-specified stages.

## Handling complex or risky stages

For stages that are large, ambiguous, or touch numerically delicate code:

1. **Split** into smaller sub-stages before delegating.
2. Send an **Explore** subagent first (`subagent_type: "Explore"`) to gather
   context, then write a better-informed implementation prompt.
3. **Dispatch alone** (not in parallel) so you can review before continuing.

## Conventions checklist (verify before dispatching)

- [ ] Objective is specific and unambiguous.
- [ ] The scientific basis (equation/method + reference) is pasted in.
- [ ] The exact pending specs to satisfy are listed, with the command to run.
- [ ] All relevant file paths are named (not "find the file").
- [ ] The house-style block and the "do not weaken tests" constraint are
      present.
- [ ] Optimisation/approximation is forbidden and routed to a report instead.
