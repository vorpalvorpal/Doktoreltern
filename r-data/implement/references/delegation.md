# Delegating a stage

The **`implementer`** agent carries the invariant instructions — house style,
constraints (no test weakening, no silent optimisation), and the status
protocol. So your per-stage prompt supplies only the **variable** part. Keeping
the boilerplate in the agent's system prompt (not re-sent every call) is the
point: the expensive orchestrator pays for the variable fields only.

## Per-stage prompt (variable fields only)

Dispatch the `implementer` agent with the selected model. To run independent
stages in parallel, put multiple Agent calls in one message.

```
## Objective
<one sentence: what to build or change>

## Data contract
<the schema / business rule / invariant + the source from the plan — paste it,
don't make them hunt for it>

## Context
<2–4 sentences: where this fits, what it calls, patterns to match>

## Files
- R/<file>.R — <what to change and why>

## Specs to satisfy (must pass, unweakened)
<the exact it("...") descriptions from tests/testthat/test-<name>.R>
Run: Rscript -e 'devtools::test(filter = "^<name>")'
```

No house-style block, no constraints list, no report format — the agent already
has them.

## Model selection

| Model | When |
|-------|------|
| **haiku** | Mechanical, unambiguous, verbose-but-easy — renames, threading an argument, repetitive edits. **Never** for numerical/statistical logic. |
| **sonnet** | Default. Standard work needing context and care, including most pipeline code with a clearly specified contract. |
| **opus** | Deep reasoning or subtle judgement. A genuinely hard sub-task warrants an **opus implementer** — delegating does *not* mean always downshifting. |

On a failed attempt, **bump one tier and retry once, then escalate to the user**
(implement §3e). And only delegate at all when the task's output is much larger
than the instructions needed to specify it — if specifying costs as many tokens
as doing it, just do it yourself.

## Hard or risky stages

1. **Split** into smaller sub-stages first.
2. Send an **Explore** subagent (`subagent_type: "Explore"`) to gather context,
   then write a better-informed prompt.
3. **Dispatch alone** (not in parallel) so you can review before continuing.

## Fallback: general-purpose subagent

If you must use a `general-purpose` subagent instead of `implementer`, paste the
house-style block from the `conventions` skill and the "do not weaken tests / no
silent optimisation" constraints into the prompt yourself.

## Before dispatching, check
- [ ] Objective specific and unambiguous.
- [ ] Data contract (schema/rule + source) pasted in.
- [ ] Exact specs to satisfy listed, with the run command.
- [ ] File paths named (not "find the file").
