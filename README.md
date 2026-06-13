# r-science skills

Claude Skills for **science-centered R package development** — where mathematical, statistical, physical, and biological correctness comes first and the code is functional by default.

Claude Skills extend Claude's capabilities with specialized knowledge and workflows. Skills are automatically activated by Claude based on your task and can be used in Claude.ai, Claude Code, or via the Claude API. Learn more at the [Claude Skills documentation](https://support.claude.com/en/articles/12512180-using-skills-in-claude).

> This repository contains only the r-science skills. The general-purpose R, GitHub, and publishing skills it builds on live in the upstream **[Posit Claude Skills](https://github.com/posit-dev/skills)** repository and are pulled in as plugin **dependencies** (see [Installation](#installation)) rather than copied here.

## The r-science workflow

A workflow spine and supporting knowledge skills that chain together: **whiteboard → plan → tests → implement → verify → benchmark/optimise → review**.

- **[conventions](./r-science/conventions/)** — Coding conventions for scientific R packages (correctness-first, functional by default, reproducible, referenced); ships a `CLAUDE.md` template for dropping into a package root
- **[whiteboard](./r-science/whiteboard/)** — Divergent, high-altitude "is this even the right thing to do?" exploration before planning — generates alternatives (including cross-disciplinary ones) and emits a design brief
- **[plan](./r-science/plan/)** — Correctness-first implementation planning that specifies behaviour and its correctness basis (equations, invariants, references, edge cases) precisely enough for tests to be derived from it
- **[tests](./r-science/tests/)** — Turn an approved plan into an executable behaviour specification — describe/it tests with analytic/invariant/reference/round-trip oracles and seeded stochastic tests
- **[implement](./r-science/implement/)** — Orchestrate implementation by delegating coding to subagents stage by stage: baseline benchmark, turn pending specs green, defer behaviour-changing optimisations to the user
- **[verify](./r-science/verify/)** — Staged quality gate returning READY / NOT READY, gating on correctness (behaviour specs pass) and cleanliness rather than a coverage percentage
- **[benchmark-optimise](./r-science/benchmark-optimise/)** — Profile and benchmark with `bench`/`profvis`; behaviour-preserving optimisations only, with behaviour-changing approximations deferred as modelling decisions
- **[review](./r-science/review/)** — Final review against the plan: plan conformance and scientific soundness, delegating general code- and test-quality review to the upstream reviewer skills
- **[r-oop](./r-science/r-oop/)** — Decide whether a problem needs OOP at all, then pick the right system (S7 preferred, then S3; vctrs for vector-like types)
- **[r-bayes](./r-science/r-bayes/)** — Bayesian modelling with brms/Stan: DAG-based identification, justified priors, convergence as a hard gate, seeded reproducible fits

## Upstream dependencies

The `r-science` plugin declares plugin **dependencies** on seven plugins from the Posit `posit-dev-skills` marketplace, so installing it also installs the general-purpose skills the workflow leans on:

| Posit plugin | What it provides |
| ------------ | ---------------- |
| `posit-dev`  | General developer skills — code review, test review, design docs, working-on |
| `github`     | PR creation and review-thread workflows |
| `r-lib`      | R package development with the r-lib ecosystem (testthat, cli, lifecycle, mirai, CRAN checks, alt-text) |
| `open-source`| Release posts and release checklists |
| `ggsql`      | ggsql query writing |
| `shiny`      | Shiny app development (bslib, theming, brand.yml) |
| `quarto`     | Quarto authoring (brand.yml, alt-text) |

These are referenced, not vendored — you always get the upstream version, and this repository is no longer a fork of it.

## Installation

### Claude Code

Because the dependencies live in a separate marketplace, **add the upstream Posit marketplace first**, then this one. Claude Code resolves the dependencies automatically once both are configured; without the Posit marketplace the `r-science` plugin stays disabled.

```
/plugin marketplace add posit-dev/skills
/plugin marketplace add vorpalvorpal/skills
/plugin install r-science@rjs-skills
```

Installing `r-science` pulls in the seven upstream plugins above. To install any of them on their own instead, use `/plugin install <name>@posit-dev-skills`.

### Manual installation

For customization or offline use, clone the repo and copy individual skills into your Claude Code skills directory:

```bash
git clone https://github.com/vorpalvorpal/skills.git
cd skills
cp -r r-science/plan ~/.config/claude-code/skills/
```

Note that manual copies do not pull in the upstream dependencies — install those separately if you need them.

### Claude.ai / Claude API

Skills can be uploaded to Claude.ai following the [Creating Custom Skills guide](https://support.claude.com/en/articles/12512198-creating-custom-skills), or loaded programmatically with the [Skills API](https://docs.claude.com/en/api/skills-guide).

## Using skills

Once installed, Claude automatically activates relevant skills based on your task — you don't need to invoke them explicitly. For the r-science spine you can also drive each stage by name (e.g. `/plan`, `/tests`, `/implement`).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on creating new skills.

## License

This repository is licensed under the MIT License. See [LICENSE](./LICENSE) for details.

## Resources

- [Claude Skills Overview](https://www.anthropic.com/news/skills)
- [Using Skills in Claude](https://support.claude.com/en/articles/12512180-using-skills-in-claude)
- [Creating Custom Skills](https://support.claude.com/en/articles/12512198-creating-custom-skills)
- [Plugin dependencies reference](https://code.claude.com/docs/en/plugin-dependencies)
- [Upstream Posit Claude Skills](https://github.com/posit-dev/skills)
