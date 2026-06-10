---
name: plan
description: >
  Create an implementation plan for a non-trivial change to a scientific R
  package. Use whenever the user asks for a plan, design, or approach before
  code is written. Produces a correctness-first plan that specifies behaviour
  precisely enough — equations, invariants, references, edge cases — for the
  tests skill to derive the describe()/it() specs from it.
disable-model-invocation: true
---

# Creating an implementation plan

This skill plans changes to **scientific** R packages — where mathematical,
statistical, physical, and biological correctness comes first, performance
second, and the API exists to serve the science. The plan you produce is the
single source of truth that the **tests**, **implement**, and **review**
skills all consume. Write it for a less capable model than yourself.

## 1. Whiteboard first — challenge the request

Do this BEFORE looking at any existing issues, so stale or prior ideas don't
pollute the lateral-thinking stage. Decide whether what you've been asked to
do is the *correct* thing to do:

- Understand the underlying scientific and practical motivation.
- Consider alternative, better ways to reach the same goal.
- Consider whether the motivation itself has inherent problems — a flawed
  model, a statistic that doesn't mean what the user thinks, a quantity that
  isn't identifiable from the data.
- Ask clarifying questions as needed.
- **Push back if you have any concerns at all**, scientific or otherwise.

Do not move past the whiteboard until both you and the user agree this is the
correct thing to do.

## 2. Anchor to GitHub and gather context

Only once the whiteboard is settled:

- If this work isn't already tracked by a GitHub issue, create one
  (`gh issue create`).
- Search existing issues, open and closed, for related work: previous
  attempts, similar efforts, and planned future expansions this should play
  nicely with.
- Read the relevant existing code and its current tests/benchmarks.

## 3. Draft the plan

Before drafting, settle these up front:

- **API stability / backwards compatibility.** Do NOT add backwards
  compatibility unless the user explicitly asks for it. State explicitly in
  the plan whether it is required.
- **Correctness above performance.** Prioritise mathematical, statistical,
  physical, and biological correctness. Note — but do not silently "fix" —
  any modelling choice likely to cause significant performance issues.
- **Functional by default.** Design in a functional style: pure functions,
  no hidden state, composition over mutation. Reach for OOP (S7 preferred,
  then S3) only when a functional approach genuinely doesn't fit, and say so
  explicitly when you do.
- **Reproducibility.** Any stochastic step must take/set a seed so behaviour
  is reproducible. Plan for this.

Write the plan with this structure:

1. **Overview** — one paragraph: what changes and why.
2. **Scientific basis** — the model, method, or standard procedure being
   implemented, with references to the original papers or specifications.
   Cite specific equations/sections the implementation must match.
3. **Requirements** — the observable behaviour the change must deliver.
4. **Affected files** — each file to add or change, and what changes.
5. **Phased stages** — ordered, incremental stages. Each stage names its
   target files, the concrete action, the reasoning, and any prerequisite
   stages. Mark which stages are independent (safe to parallelise) and which
   are strictly sequential — the implement skill uses this.
6. **Behaviour and correctness basis** — see section 4. This is the heart of
   the plan.
7. **Benchmark plan** — see section 5.
8. **Risks, edge cases, GOTCHAs** — be explicit. Enumerate failure modes:
   `NA`/`NaN`/`Inf`, empty/zero-length input, degenerate cases (singular
   matrices, zero variance, n = 1), numerical instability, units, and any
   place the science is subtle.
9. **Documentation impact** — whether vignettes, READMEs, or `NEWS.md` need
   changes. Often the answer is "no", and that is fine.
10. **Success criteria** — how we will know it is done and correct.

Don't leave design decisions deferred unless the user explicitly tells you to.

## 4. Specify the behaviour and its correctness basis

This is the raw material the **tests** skill turns into `describe()/it()`
specs. Give it enough to do that without guessing — *what* the code must do and
*how we will know it is right* — but stop short of writing the tests. The test
author owns the `describe()/it()` structure, the assertions, tolerances, seeds,
and exact expectations. **If this section already contained those, it would
just be the tests.** Your job is to make the science unambiguous; their job is
to encode it.

For each function or component, list:

- **Behaviours** — one bullet per distinct, observable behaviour, phrased as
  behaviour, not implementation.
- **Correctness basis** for each behaviour — enough that the test author can
  build a concrete check without research. Supply the actual material, not a
  pointer to it:
  - **Analytic**: the governing equation and any constants
    (e.g. `k = A·exp(−Ea/RT)`, `R = 8.314462618 J/mol/K`).
  - **Invariant / conservation**: the property that must always hold (mass
    conserved, probabilities sum to 1, monotonicity, symmetry, idempotence).
  - **Reference**: the exact source — paper + DOI + table/figure, standard
    dataset, or trusted reference implementation.
  - **Round-trip**: the relationship that must hold (`decode(encode(x)) == x`).
- **Edge cases** (cross-referenced from section 8) and the *documented*
  behaviour expected for each (propagate `NA`? error? return empty?).
- **Error conditions** and the intended **classed** condition for each.

State the science precisely; leave the encoding to the test author. Do **not**
write `describe()/it()` blocks, assertions, tolerances, or seeds here.

Example (prose and bullets — note: not code):

> **`rate_constant()`**
> - Computes a reaction rate. Correct values follow the Arrhenius equation
>   `k = A·exp(−Ea/RT)`, with `R = 8.314462618 J/mol/K`. *(analytic)*
> - Rate increases with temperature, all else equal. *(invariant)*
> - Must reproduce Smith et al. (2019, doi:10.…) Table 2. *(reference)*
> - Negative activation energy → error, classed `rate_input_error`.
> - `NA` temperature propagates to `NA` output. *(edge case)*

If the change touches an existing function, **note any current test-coverage
gaps** so the test author can fill them, flagged as covering *existing*
behaviour rather than the new work.

## 5. Design the benchmarks

Once the behaviour spec is drafted, plan benchmarks (using `bench`) to surface
performance issues:

- Benchmark each stage that does real computational work, at input sizes that
  reflect realistic scientific use (and at least one large case).
- The implement skill captures a **baseline** before each stage, so name what
  to measure and at what sizes here.
- If the change touches an existing function, check current benchmark coverage
  and fill gaps, **marking gap-filling benchmarks as covering existing
  behaviour**.
- Benchmarks live under `bench/`, outside `R CMD check`.

## 6. Record it

Add the full plan — overview, behaviour specification, and benchmark plan — to
the GitHub issue as a comment. This is the durable record the downstream
skills read.

## Return to the whiteboard

If major issues surface while drafting or editing the plan — especially a
scientific one — go back to the whiteboard rather than doubling down on an
incorrect approach.

## Next step

When the plan is recorded and you're both satisfied, surface the next command
so the user doesn't have to recall it — ask whether to proceed:

> Plan recorded. Run `/tests` to turn it into the behaviour spec?
