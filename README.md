# Doktoreltern

> Find out you're wrong early,
> then build the right thing.
>
> A risk-first methodology for solo and small-scale technical projects.

Doktoreltern is a way of building scientific and technical software when you're mostly working on your own, with AI doing much of the legwork. It's aimed at people who have technical domain expertise, rather than project management or software development expertise: you keep the judgement, while the methodology and the tools handle the busywork.

The core idea is simple. Most projects fail not because the implementation was bad, but because a load-bearing decision near the centre turned out to be wrong after everything else had been built on top of it. So instead of planning the whole thing up front, or building one piece to completion before starting the next, Doktoreltern has you tackle the parts you're least sure about — and that everything else depends on — first, so that when an idea doesn't hold up you find out while it's still cheap to change.

## The name

*Doktoreltern* is German for "doctoral parents" — the collective term for the supervisors who see a doctorate through (a *Doktorvater* and a *Doktormutter*). Good advisors don't write your thesis for you. They ask the awkward question early, point you at the paper that already settled it, talk you out of the clever idea that won't survive contact with reality, and refuse to let you pour a year into a foundation that won't hold.

That is the role this system plays, and it is how the plugins are meant to work: each one is an advisor with a speciality, and together they form your committee.

- **r-science** keeps you honest about the maths, the statistics and the methods — correctness before cleverness, claims backed by references, reproducible by default.
- **r-data** keeps you honest about the data — the same workflow spine, adapted for automated ingestion and tidying: contracts validated at every boundary, every row accounted for, idempotent and reproducible from raw.
- Other advisors can join the committee for the parts of a project they know best — visualisation, dashboards, reporting — each bringing its own standards.

The advisors stack rather than compete: a project can sit under several at once, with the most specialised one taking the lead for whatever part of the work is in front of you. You stay the candidate; they steer.

## How it works

- **A tree of hypotheses, not a plan.** Every piece of the project is an issue in a branching tree — strictly a graph, since two branches can come to share a node — each carrying two gauges: *confidence* (how sure you are it's right) and *fidelity* (how fully built-out it is, from a sketch to the finished thing).
- **Breadth first, then depth where it matters.** Get the whole system roughly working end-to-end — mocked wherever that is enough — then return to deepen the riskiest, most central pieces before the routine ones.
- **The cheapest check that settles the question.** A doubt might be resolved by a thought experiment, a literature search, a quick prototype or a full implementation. You spend effort in proportion to the risk, not uniformly across the project.
- **Nothing is forgotten.** Decisions, and the alternatives you rejected, are written down as you go — so the reasoning survives, and a ruled-out mistake stays ruled out.
- **You hold the wheel.** Decisions that matter are sealed for your sign-off by default; you hand a branch over to the advisors to run on their own only when you choose to.

## Status

Doktoreltern is under active development. The methodology layer described above is being built on top of the existing skills — the workflow spine (conventions, whiteboard → plan → tests → implement → verify → benchmark/optimise → review) in two variants, **r-science** (plus R OOP and Bayesian knowledge) and **r-data**. Expect things to move.

## Installation

Doktoreltern installs as a Claude Code plugin. The r-science advisor depends on several general-purpose skills from the upstream [Posit Claude Skills](https://github.com/posit-dev/skills) marketplace, so add that first:

```
/plugin marketplace add posit-dev/skills
/plugin marketplace add vorpalvorpal/Doktoreltern
/plugin install r-science@doktoreltern   # science-centered R packages
/plugin install r-data@doktoreltern      # data ingestion/tidying projects
```

Installing an advisor pulls in the upstream plugins it depends on (general developer, GitHub, r-lib, and — for r-science — publishing skills). To install one of those on its own instead, use `/plugin install <name>@posit-dev-skills`.

For customisation or offline use, clone the repository and copy individual skills into your Claude Code skills directory:

```bash
git clone https://github.com/vorpalvorpal/Doktoreltern.git
cd Doktoreltern
cp -r r-science/plan ~/.config/claude-code/skills/
```

Manual copies do not pull in the upstream dependencies — install those separately if you need them.

## License

MIT — see [LICENSE](./LICENSE).
