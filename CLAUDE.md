# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repository Is

This repository implements **Doktoreltern** — a risk-first methodology for solo and small-scale technical projects (see `README.md` for the vision), delivered as a Claude Code marketplace (`doktoreltern`) of specialist *advisor* plugins. It currently contains three plugins: **`r-science`**, the science-centered R package development workflow spine and its supporting skills; **`r-data`**, the data-engineering variant of the same spine (automated ingestion/tidying projects); and **`docloop`**, a small roster of narrow skills invoked live from inside a docloop review comment (see `docloop/skills/README.md`). Skills are structured markdown files that teach Claude specialized workflows; the primary skill artifacts are Markdown files consumed directly by Claude's skill system. There is also a Python **context substrate** under `ctx/` at the repo root (the marker grammar, linter, node store, scheduler/driver, and MCP server — generic machinery owned by no plugin) with its own pytest suite, run from `ctx/` — that is the one part of the repo with runnable, testable code.

The general-purpose R, GitHub, and publishing skills the workflow builds on are **not** in this repository: they live in the upstream [Posit Claude Skills](https://github.com/posit-dev/skills) marketplace (`posit-dev-skills`) and are pulled in as plugin **dependencies** declared in `.claude-plugin/marketplace.json`. This repository was previously a fork of that one; it no longer is.

## Source of Truth

The **node tree is the source of truth** for the workflow redesign. It lives in the ctx node store at `store/` (repo root) — its **own git repo**, nested inside this one (read `nodes/<id>/node.md`; nesting is the tree). Whiteboards, archived docs, memory files, and session records are not authority. See `MAP.md` at the repo root for where everything lives.

## Utility Script

The only runnable utility is `count-skill-tokens.py`, which reports line and token counts for a skill:

```bash
# Requires uv
./count-skill-tokens.py r-science/plan
# or
uv run count-skill-tokens.py r-science/review
```

Warns when `SKILL.md` exceeds **5,000 tokens / 500 lines**, or when the skill `description` frontmatter exceeds **100 tokens**.

## Directory Structure

```
<category>/
  README.md                   # Category-level notes (optional per skill)
  <skill-name>/
    SKILL.md                  # Required: skill definition with YAML frontmatter
    references/               # Optional: supplementary docs loaded on demand
      *.md
    scripts/                  # Optional: R or shell helpers
    templates/                # Optional: document templates
```

Do **not** create a `README.md` inside individual skill directories — documentation about a skill's design goes in the category README.

## SKILL.md Format

Every skill requires YAML frontmatter at minimum:

```yaml
---
name: your-skill-name        # kebab-case, matches directory name
description: >               # Claude reads this to decide when to activate the skill
  Clear description of what this skill does and when to trigger it.
  Keep under 100 tokens.
---
```

The body is instructions written **for Claude**, not end users — imperative, step-by-step, covering edge cases.

## Registering a New Skill

There are three plugins, `r-science`, `r-data`, and `docloop`. After creating the skill directory under the matching plugin's own directory (`r-science/`, `r-data/`, or `docloop/skills/`), add its path to that plugin's `skills` array in `.claude-plugin/marketplace.json`:

```json
{
  "name": "r-science",
  "skills": [
    "./r-science/review",
    "./r-science/your-new-skill"   ← add here
  ]
}
```

The `source` field is always `"./"` (repo root). When the new skill is part of the workflow spine, update the skill list in the root `README.md` to match.

To rely on a skill from the upstream Posit marketplace, do **not** copy it here — add its plugin to the `dependencies` array of the `r-science` plugin (with `"marketplace": "posit-dev-skills"`), and ensure that marketplace name is present in the top-level `allowCrossMarketplaceDependenciesOn` allowlist.

`docloop` skills follow a different rule, since they're invoked live and unattended (no filesystem/Bash access, no interactive human to approve anything) rather than by Claude's own judgement mid-conversation — read `docloop/skills/README.md` before adding one; it is not a normal `r-science`-style skill.

## Skills

`r-science/` holds the `r-science` plugin's skills: the workflow spine (`conventions`, `whiteboard`, `plan`, `tests`, `implement`, `verify`, `benchmark-optimise`, `review`) plus `r-oop` and `r-bayes`. `r-data/` holds the `r-data` plugin — the same spine adapted for data-engineering work (ingestion, tidying, pipelines), where correctness means schema + invariants + reconciliation rather than scientific-reference fidelity. General developer, GitHub, r-lib, `open-source`, `ggsql`, `shiny`, and `quarto` skills are upstream dependencies, not part of this repository — see [What This Repository Is](#what-this-repository-is).

`docloop/skills/` holds the `docloop` plugin's skills — a narrow, purpose-built roster invoked live from inside a docloop review comment, not general-purpose workflow skills. See `docloop/skills/README.md` for the house rules (quick, text-in/text-out only, no mode changes) before adding to it.

## Dogfooding

When working **on this repository** and one of its skills is invoked (via
slash command or by name), follow the version in the **working tree on the
current branch** — read its `SKILL.md` directly — not any installed copy.
Installed skills may be stale; the branch is the truth.

## Workflow Design Principles

When designing or extending the r-science workflow (skills, agents, MCP tooling, issue conventions):

- **Portability is an aim, not an enforcement.** The workflow currently leans on GitHub (issues, sub-issues, labels, dependencies). Prefer designs that would move to another provider (GitLab, Gitea/Forgejo, local trackers) with minimal difficulty: keep semantics in plain text with simple greppable syntax inside issue bodies/comments; treat platform primitives (sub-issue links, labels, dependency edges) as derived indices over that text, not as the source of truth.
- **Minimise token usage**:
  - Automate boring, deterministic work with simple scripts (extraction, collation, consistency linting) rather than spending LLM calls on it.
  - Farm easy, well-specified tasks out to cheap models; reserve capable models for judgement.
  - Don't pollute context windows: serve summaries by default (e.g. a closed issue's closing summary, not its full thread) and fetch full detail only on explicit request.

## Key Conventions

- **Progressive disclosure**: Put specialized or large reference content in `references/*.md` and instruct Claude to read those files only when needed. This keeps the main `SKILL.md` within token limits.
- **R scripts**: Use a shebang (`#!/usr/bin/env Rscript`), include inline usage docs, check for required packages at startup, and exit non-zero on error.
- **Testing**: Install locally via `cp -r <category>/<skill> ~/.config/claude-code/skills/` and verify Claude activates the skill in Claude Code.
