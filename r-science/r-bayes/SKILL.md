---
name: r-bayes
description: >
  Bayesian modelling in R with brms and Stan — DAG-based causal identification,
  prior specification, multilevel models, convergence diagnostics, and effect
  interpretation. Use when fitting or reviewing Bayesian models, choosing
  priors, checking convergence, or estimating causal effects.
---

# Bayesian inference in R

Patterns for principled Bayesian analysis with `brms`/Stan. The house style
applies in full: **correctness first** (a model that hasn't converged reports
nothing), **reproducible** (every fit is seeded), and **referenced** (priors
and model structure justified, not defaulted).

## Toolchain

- **brms** — regression models in R formula syntax, compiled to Stan.
- **cmdstanr** — Stan backend; prefer it over rstan for current Stan.
- **dagitty / ggdag** — build and interrogate causal DAGs.
- **marginaleffects** — interpretable effects on the outcome scale.
- **tidybayes** — tidy posterior draws.
- **bayesplot / posterior** — diagnostics and posterior summaries.

## 1. Identify before you estimate (DAGs)

Decide *what to adjust for* from the causal structure, not from what improves
fit. Build the DAG, then let it choose the adjustment set:

```r
library(dagitty)
g <- dagitty("dag { X -> Y ; Z -> X ; Z -> Y }")
adjustmentSets(g, exposure = "X", outcome = "Y", effect = "total")
impliedConditionalIndependencies(g)   # test against data with localTests()
```

Distinguish the **total** from the **direct** effect and adjust accordingly.
Conditioning on a collider or a mediator silently biases the estimate — the DAG
is what protects you, so record it (and its source) alongside the model.

## 2. Specify the model with explicit priors

Never ship default priors silently. State each prior and why it's reasonable on
the scientific scale of the parameter:

```r
model <- brm(
  outcome ~ predictor + (1 | group),
  data    = data,
  family  = bernoulli("logit"),
  prior   = c(
    prior(normal(0, 2), class = "Intercept"),  # weakly informative on logit scale
    prior(normal(0, 1), class = "b")
  ),
  chains = 4, iter = 4000, warmup = 1000,
  backend = "cmdstanr", seed = 123             # seed: fits are reproducible
)
```

- Choose the **family/link** to match the outcome (counts → Poisson/negbin;
  bounded → Beta; binary → Bernoulli; etc.).
- Do a **prior predictive check** before fitting (`sample_prior = "only"`) to
  confirm the priors imply plausible data.
- For longitudinal/multilevel data, separate within- from between-group
  effects (person-mean centering) and use lagged predictors where temporal
  precedence matters.

## 3. Check convergence before reading anything else

Convergence is a gate, not a formality. If it fails, the estimates are not
interpretable — fix the model, don't report the numbers.

- `rhat < 1.01` for every parameter.
- Bulk and tail **ESS** comfortably > 400.
- No divergent transitions (raise `adapt_delta`, reparameterise, or rethink
  priors if they persist).
- Trace plots well-mixed; `pp_check(model)` posterior predictive checks look
  reasonable.

```r
library(bayesplot)
summary(model)            # inspect Rhat, Bulk_ESS, Tail_ESS
mcmc_trace(model)
pp_check(model, ndraws = 100)
```

## 4. Interpret on a meaningful scale

Report effects where they mean something, with uncertainty — not just
coefficient tables.

```r
library(marginaleffects)
avg_slopes(model)                      # marginal effects on the response scale
plot_predictions(model, condition = "predictor")
```

Use `tidybayes` to summarise draws into credible intervals and directional
probabilities; exponentiate log-odds to odds ratios where that aids
interpretation. Quote credible intervals, and a posterior probability of the
effect's direction/magnitude, rather than dichotomising into "significant".

## 5. Sensitivity and reporting

- Compare prior vs posterior to show what the data added.
- Re-run with alternative reasonable priors to check the conclusion is robust.
- Record: the DAG and its source, every prior with its justification, the seed,
  the convergence diagnostics, and the Stan/brms versions — that bundle is what
  makes the analysis reproducible and reviewable.
