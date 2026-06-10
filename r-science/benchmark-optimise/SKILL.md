---
name: benchmark-optimise
description: >
  Benchmark and optimise scientific R code without changing its results. Use
  when profiling a bottleneck, writing bench benchmarks, or deciding whether
  and how to speed something up. Optimisations that preserve behaviour are fair
  game; anything that changes results is deferred to the user as a modelling
  decision.
---

# Benchmarking and optimising scientific R code

The prime directive from the `conventions` skill holds here above all:
**correctness first.** A faster wrong answer is still wrong. This skill covers
how to measure honestly and how to speed code up *without changing what it
computes* — and what to do when the only speedups available would change the
results.

## The two kinds of optimisation

- **Behaviour-preserving** — produces bit-for-bit (or within documented
  tolerance) identical output: vectorising a loop, a better algorithm with the
  same result, avoiding repeated work, a compiled inner loop. These are in
  scope; make them, with a benchmark to prove the win and the behaviour specs
  to prove correctness is intact.
- **Behaviour-changing** — an approximation, a coarser tolerance, a different
  estimator, dropping a correction term. These are **modelling decisions, not
  optimisations.** Do **not** apply them silently. Record each on the
  deferred-optimisations list with its expected speedup and its
  correctness/accuracy cost, and let the user decide (the `implement` skill
  collects this list).

## Measure first — never assume

1. **Profile before optimising.** Find the actual bottleneck; don't guess.

   ```r
   profvis::profvis({
     real_data |> your_analysis()   # realistic size, not a toy example
   })
   ```

2. **Benchmark alternatives** with `bench`, and **assert identical output** so
   a "faster" version that quietly changes results is caught immediately:

   ```r
   bench::mark(
     current    = current_approach(x),
     vectorised = vectorised_approach(x),
     check      = TRUE        # FAILS if outputs differ — keep TRUE
   )
   ```

   Only relax `check` to a tolerance-aware comparison when a *documented*
   numerical tolerance genuinely applies, and say why in a comment.

3. **Benchmark realistic sizes**, including at least one large case, with
   enough iterations to be stable (`bench::press()` to sweep sizes):

   ```r
   bench::press(
     n = 10^(3:6),
     bench::mark(f(make_input(n)), min_iterations = 10)
   )
   ```

| Tool | Use for |
|------|---------|
| `profvis` | Locating an unknown bottleneck (time per line, call stack) |
| `bench::mark()` | Comparing alternatives, with memory and `check =` correctness |
| `bench::press()` | How performance scales with input size |
| `system.time()` | A quick one-off sanity check only |

## Where the wins come from (in order)

Reach for these roughly in order of payoff-to-risk. Re-run the behaviour specs
(`verify` skill) after each — the win is only real if the result is unchanged.

1. **Algorithm / complexity.** The biggest, safest wins. An O(n log n) method
   that returns the same answer beats any micro-tuning. Cite the algorithm's
   source as you would any scientific choice.
2. **Vectorise.** Replace accumulating `for`-loops with vectorised ops or
   `purrr::map_*()` / `vapply()`. Measure — "loops are slow" is not always true.
3. **Avoid repeated work.** Hoist invariant computation out of loops; memoise
   pure functions; precompute shared structure.
4. **Better data structures / backends.** `data.table` or matrices for large
   grouped/numeric work where they earn their keep; type-stable `vctrs` ops in
   package APIs (see `r-oop`).
5. **Compiled inner loop.** Push a proven hot path into C++ via Rcpp/cpp11 only
   once profiling shows it dominates and R-level options are exhausted.
6. **Parallelism.** For CPU-bound, embarrassingly parallel work on large
   inputs. Overhead can exceed the benefit on small/fast operations — measure.
   See the `mirai` skill for the how.

## Anti-patterns

- Optimising without profiling ("this looks slow").
- Over-engineering for a 1% gain at the cost of readability or clarity of the
  science.
- Trading correctness for speed, or changing results under the banner of
  "optimisation" — that's a deferred modelling decision, not a free win.
- Reporting a speedup without having asserted the output is unchanged.

## In the workflow

The `plan` skill names what to benchmark and at what sizes; the `implement`
skill captures a baseline before each stage and re-benchmarks after. Use this
skill to write those benchmarks, to investigate any bottleneck implement
surfaces, and to evaluate the deferred-optimisations list with the user once
the behaviour is correct and committed.
