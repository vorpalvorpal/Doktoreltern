---
name: tests
description: >
  Turn an approved implementation plan into an executable behaviour
  specification for a scientific R package — describe()/it() tests that are
  the plan made verbose. Use after a plan is approved and before (or
  alongside) implementation, when converting planned behaviour into tests.
disable-model-invocation: true
---

# Turning a plan into a behaviour specification

The tests are the plan, expanded. The **plan** skill specified, for each
function, the behaviours it must exhibit and the *correctness basis* for each
(an equation, an invariant, a reference, a round-trip, an edge case). Your job
is to turn that raw material into runnable testthat specs: you own the
`describe()/it()` structure and the concrete assertions; the plan owns the
science. Do not invent behaviour the plan didn't specify — if you find yourself
needing to, the plan is incomplete: stop and revisit it with the user.

This skill covers the **workflow** of going plan → tests. For testthat
mechanics — file layout, expectations, fixtures, snapshots, mocking, withr
cleanup — defer to the **testing-r-packages** skill and only summarise here.

## 1. Construct the skeleton from the plan

- One test file per code file: `R/{name}.R` → `tests/testthat/test-{name}.R`.
- One `describe("fn()", { ... })` per function the plan covers.
- Turn each behaviour bullet in the plan into one `it("...")` whose
  description restates the behaviour in plain language — this is the
  ubiquitous language tying tests back to the plan. Behaviour, not
  implementation.
- Leave each `it("...")` **pending** (no body) at this stage. Pending specs
  report as SKIPPED and become the checklist the implement skill burns down.
- Add an `it()` for every edge case and every error condition the plan listed.
- Where the plan **noted an existing coverage gap**, add those specs too and
  mark them (a comment) as characterising *existing* behaviour, so reviewers
  can tell them from the new work.

## 2. Test observable behaviour, not implementation

Each `it()` asserts what the function *does*, never how. Do not reach into
internal helpers, private state, or intermediate values. If a behaviour can
only be checked by inspecting internals, the API is probably wrong — flag it.

Prefer specific expectations over `expect_true()`/`expect_false()`, which give
poor failure messages. For errors and warnings use
`expect_snapshot(error = TRUE)` / `expect_snapshot()` so the full text is
reviewable, and assert a **classed** condition where the plan specified one.

## 3. Make the correctness oracle concrete

The plan states a correctness basis for each behaviour. Choose the matching
oracle and turn it into a real assertion — picking the encoding, tolerance, and
expected values is your job, not the plan's:

- **Known-answer / analytic** — assert equality to the closed-form result.
  Use `expect_equal()` with an explicit `tolerance` for floating point;
  justify the tolerance in a comment tied to the science (e.g. expected
  numerical precision of the method), not a number picked to make it pass.

  ```r
  it("matches the Arrhenius equation at a known temperature", {
    # k = A * exp(-Ea / (R * T)); analytic value from first principles
    k <- rate_constant(A = 1e13, Ea = 80000, temp = 298.15)
    expect_equal(k, 1e13 * exp(-80000 / (8.314462618 * 298.15)))
  })
  ```

- **Invariant / conservation** — assert the property directly, ideally across
  several inputs.

  ```r
  it("increases monotonically with temperature", {
    k <- rate_constant(A = 1e13, Ea = 80000, temp = c(280, 300, 320))
    expect_true(all(diff(k) > 0))
  })
  ```

- **Published reference values** — encode the source in the test, cite it in a
  comment, and use the precision the source reports.

  ```r
  it("reproduces Table 2 of Smith et al. (2019)", {
    # Smith et al. (2019), doi:..., Table 2, values to 3 sig figs
    expect_equal(round(model_output(ref_inputs), 3), c(0.142, 0.318, 0.557))
  })
  ```

- **Round-trip** — `expect_equal(decode(encode(x)), x)`.

- **Property-based** — generate inputs and assert the property holds. Set a
  seed so failures are reproducible; report the seed in the test.

## 4. Reproducibility and edge cases

- **Seed every stochastic test.** Use `withr::local_seed()` (or
  `set.seed()`); never rely on ambient RNG state. A flaky scientific test is
  worse than no test.
- Give each edge case from the plan its own `it()`: `NA`/`NaN`/`Inf`, empty /
  zero-length input, degenerate cases (singular matrices, zero variance,
  n = 1), and boundary values. Assert the *documented* behaviour (propagate
  `NA`? error? return empty?), not whatever the code happens to do.

## 5. Keep tests self-sufficient

Each `it()` contains its own setup, execution, and assertions; clean up side
effects with `withr::local_*`. Repetition between specs is fine — clarity
beats DRY in tests. (See **testing-r-packages** for fixture and helper
patterns when setup is genuinely shared across a `describe()` block.)

## 6. Confirm the specification fails for the right reason

Before implementation begins, run the suite:

```r
devtools::test()
```

- Pending specs report as SKIPPED — expected.
- Implemented specs that fail should fail because the behaviour is *absent*,
  not because the test is malformed. Read each failure to confirm.
- Gap-filling specs for existing behaviour should **pass** now; if one fails,
  you have found a pre-existing bug — surface it to the user rather than
  silently adjusting the test.

The pending specs are the behaviour checklist the implement step turns green,
stage by stage.

## Next step

Once the behaviour spec is written and failing for the right reasons, offer the
next command:

> Behaviour spec ready (N pending specs). Run `/implement` to start turning
> them green?
