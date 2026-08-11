# Agent-native task and issue graph trackers

> Research subagent report, 2026-08-08, commissioned for the "lean on existing code" architecture review.
> External research only. Sister reports in this directory.
> Caveat: web-search budget was exhausted during several of these runs — see notes in the body.

Search budget hit its cap (200/200), but I have enough. Report below.

---

# Prior-art report: agent-native task/issue graph trackers

## 1. "Berstein" — identification

**No project named "Berstein" exists.** Two candidates, and I think the answer is unambiguous on spelling but ambiguous on intent:

**Candidate A — Bernstein (confidence: high, ~85%, on spelling)**
- `https://github.com/sipyourdrink-ltd/bernstein` — "Deterministic orchestrator for CLI coding agents (Claude Code, Codex, Gemini CLI, +40 more)."
- 800 stars, 93 forks, Python, **Apache-2.0**, created 2026-03-22, last push 2026-08-07 (yesterday). Site: `https://bernstein.run`.
- "Berstein" is literally "Bernstein" minus one `n`. That's the single most likely typo.

**Candidate B — beads / `bd` (confidence: moderate, ~40% it's what they *meant*)**
- If the user was reaching for "the agent issue-graph thing everyone talks about", beads is it, and "Berstein" could be a garbled recall. But phonetically it's a poor match.

**My read:** they typed Bernstein. But note the mismatch with your task framing — **Bernstein is an orchestrator, not a decomposition store.** It schedules agents across git worktrees; it does not give you a persistent hypothesis tree with gauges. If the user cited it as prior art for "node tree + scheduler", they were probably pointing at the *scheduler/driver* half of your `ctx/` substrate, not the node store. Worth asking them directly.

---

## 2. Candidate survey

### beads / `bd` — Steve Yegge ★ the serious one
| | |
|---|---|
| Repo | `https://github.com/gastownhall/beads` (**moved** from `steveyegge/beads` — old URL 301s) |
| Stars | **26,117** / 1,751 forks / 465 open issues |
| Lang / license | Go / **MIT** |
| Created / last push | 2025-10-12 / 2026-08-07 (hours ago) |
| Releases | v1.1.2 (2026-07-26), v1.1.0 (2026-07-04) |
| Activity | Extreme — PR numbers past **#5411**, multiple merges per hour |

**Data model** (from `docs/core-concepts/`):
- Hash-based IDs `bd-a1b2` (explicitly to survive multi-agent/multi-branch merges — the same design you arrived at independently).
- Hierarchy: `bd-a3f8` (epic) → `bd-a3f8.1` → `bd-a3f8.1.1`.
- **Typed dependency edges**, split into *blocking* and *non-blocking*:
  - Blocking: `blocks` (default), `parent-child`, `conditional-blocks` (B runs only if A **fails**), `waits-for` (B waits for all of A's children — fanout aggregation).
  - Non-blocking graph annotations: `related`, `tracks`, `discovered-from`, `caused-by`, `validates`, `supersedes`.
- **Cycle rejection at write time**: "Beads also rejects cycles at write time — `bd dep add` checks for cycles before committing." Plus `bd dep cycles`.
- **Layered ready-queue**: "Layer 0: No dependencies… Same layer: Can run in parallel." `bd ready` = nodes with no open blocking deps. This *is* your breadth-first scheduler, already built.
- **Gates**: pseudo-issues that block on external conditions (PR merge, CI, timers).
- Cross-repo deps: `bd dep add local-issue external:other-project:remote-issue`.

**Custom fields — this is the money quote for you.** `docs/core-concepts/metadata.md`:
> "The `metadata` field on issues accepts arbitrary JSON. Any valid JSON value is stored as-is. Metadata is the preferred extension point for data that is specific to an integration, orchestrator, team workflow, or experimental automation."

Reserved prefixes: `bd:` (internal), `_` (private). Everything else is yours. **Your confidence + fidelity gauges drop straight into `metadata` with zero forking.** There is even a precedent convention for exactly your use case — advisory execution-routing keys (`execution_agent_type`, `execution_suggested_model`, `execution_reasoning_effort`, `execution_mode`, `execution_parallel_group`) that orchestrators read before spawning subagents:
> "Parent/orchestrator agents must consume these keys before spawning subagents. Model and reasoning effort are normally fixed at launch, so reading metadata after delegation is too late."

**Interfaces**: rich CLI (`bd ready/create/update/claim/close/dep add/show/prime/remember/graph`), `--json` on read commands, `bd graph --dot|--html|--mermaid`, machine-readable JSON Schema emission, and an MCP server (PyPI `beads-mcp`) — *I did not verify the MCP package's maintenance status or whether it is first-party.*

**Inner loop**: fully pluggable. beads tracks *what work exists and what's ready*; it says nothing about how you do it. This is exactly the separation you want — your skills stay the inner loop.

**⚠️ The big caveat — storage is no longer plain text in git.** beads migrated to **Dolt** (versioned SQL DB), embedded in-process by default at `.beads/embeddeddolt/`. From `docs/architecture/dolt.md`: embedded mode is "the default for standalone Beads users"; sync is `bd dolt push`/`bd dolt pull` against `refs/dolt/data`. And critically:
> "`.beads/issues.jsonl` is an export for viewers and interchange, **not the source of truth** or a full database backup."

That is a direct reversal of the original "git IS the database" pitch, and it collides with your portability principle ("keep semantics in plain text with simple greppable syntax"). Reported fallout includes a migration that renames the SQLite DB but imports nothing (issue #2276), stale-JSONL timestamp false positives, and `bd backup restore` silently restoring nothing from Dolt-native incremental archives. There's an open discussion (#2332) literally titled "How to actually commit beads to git history now that JSONL is out of the picture?"

**Verdict**: the closest thing to your node store that exists, and it has solved the parts you'd least enjoy solving (hash IDs, cycle detection, typed edges, ready-queue layering, merge semantics). The Dolt dependency is the real decision point.

---

### Backlog.md
| | |
|---|---|
| Repo | `https://github.com/MrLesk/Backlog.md` |
| Stars | **6,421** / 383 forks / 32 open issues |
| Lang / license | TypeScript / **MIT** |
| Created / last push | 2025-06-04 / 2026-08-07 |

Tasks are **plain Markdown files** in `backlog/`, named `TASK-1 - Task Title.md`, git-native (git optional via `--no-git`). CLI + **MCP server** (`backlog mcp start`, integrates Claude Code, Codex, Gemini CLI, Kiro) + `--json` output + TUI board + browser view.

**Data model — I read the actual TypeScript** (`src/types/index.ts`). The `Task` interface is a **closed struct**:
```ts
dependencies: string[];        // untyped edges — flat ID list, no edge kinds
parentTaskId?: string;
subtasks?: string[];
milestone?: string;
labels: string[];
priority?: string;
type?: string;
acceptanceCriteriaItems?: AcceptanceCriterion[];
definitionOfDoneItems?: AcceptanceCriterion[];
onStatusChange?: string;       // per-task callback command
```
**There is no `metadata`/extra field.** Answering your question directly: it models a DAG only weakly (untyped `dependencies` + parent/child, no edge semantics, no `conditional-blocks`/`waits-for` equivalent), and **it has no custom-field extension point** — you would fork the `Task` interface, the frontmatter parser, and the serializer to add confidence/fidelity, or abuse `labels` as a string bag. Docs explicitly recommend labels for effort estimates (`small`/`medium`/`large`, `sp:13`), which is the shape of a gauge but stringly-typed and afflicted by label inheritance from parents (GH#2100 — epic labels are copied onto children by default, so `-l large` returns the whole tree).

Note it *does* dictate a workflow: a "spec-driven AI development workflow" with three review checkpoints (spec / plan / code). Less inner-loop-neutral than beads.

**Verdict**: cleanest plain-text story, weakest graph, no extension point. Fork cost is real but bounded.

---

### claude-task-master (Task Master AI) — ⚠️ avoid
| | |
|---|---|
| Repo | `https://github.com/eyaltoledano/claude-task-master` |
| Stars | **27,945** / 2,619 forks / 209 open issues |
| License | **NOASSERTION — MIT + Commons Clause** |
| Last commit | **2026-04-23** (~3.5 months stale) |

Two disqualifiers:

1. **Not open source.** I read the LICENSE file. It is MIT with a Commons Clause rider: *"the grant of rights under the License will not include… the right to Sell the Software… 'Sell' means… to provide the Software to third parties, for a fee or other consideration (including without limitation fees for hosting or consulting/support services…)"*. If Doktoreltern ever has a commercial or consulting dimension, building on this is a licensing hazard. It also makes it GPL/Apache-incompatible for redistribution.
2. **Commercialised and drifting.** Homepage is now `tryhamster.com`; recent commits are `chore: update README docs links to tryhamster.com/docs/taskmaster` and `fix: stop aliasing hamster/ham to task-master` and `fix: replace retired task-master.dev URLs`. The OSS repo looks like the on-ramp to a hosted product, and it has not moved in over three months while beads ships hourly.

Star count is a legacy artifact of being early (March 2025), not current health. **Highest lock-in risk of the set.**

---

### GitHub Spec Kit
| | |
|---|---|
| Repo | `https://github.com/github/spec-kit` |
| Stars | **125,770** / 11,226 forks |
| Lang / license | Python / **MIT** |
| Last push | 2026-08-07, release 0.16.1 |

Commands: `/speckit.constitution`, `/speckit.specify`, `/speckit.plan`, `/speckit.tasks`, `/speckit.taskstoissues`, `/speckit.implement`, `/speckit.converge`, plus optional `/speckit.clarify`, `/speckit.analyze`, `/speckit.checklist`. Template stack under `.specify/` with override layering.

**Wrong category for you.** It is a *prompt/template scaffold*, not a store. No dependency graph, no DAG, no task metadata schema, no MCP server, no queryable state — `/speckit.tasks` emits an "actionable task list" as prose. It **does** dictate the inner loop (Constitution → Specify → Plan → Tasks → Implement), which is precisely the layer you already own with your skills. The 125k stars measure GitHub's distribution, not depth. Adopting it would mean giving up your methodology and gaining no store.

---

### OpenSpec
| | |
|---|---|
| Repo | `https://github.com/Fission-AI/OpenSpec` |
| Stars | **64,210** / 4,424 forks |
| Lang / license | TypeScript / **MIT** |
| Last push | 2026-08-07 |

`openspec/` with `specs/`, `changes/` (each change = `proposal.md` + `specs/` + `design.md` + `tasks.md`), `archive/`. CLI via `npm i -g @fission-ai/openspec`; slash commands for 30+ assistants; **no MCP server** found. Prescribes `/opsx:propose` → `/opsx:apply` → `/opsx:archive`.

**No dependency modelling, no DAG, no custom fields.** Same category error as Spec Kit — a documentation discipline, not a work graph. Dismiss.

---

### Amazon Kiro specs
Not a library you can adopt — it is a workflow convention inside Kiro IDE (and a widely-copied prompt pattern). Three files per feature: `requirements.md` (EARS notation: `WHEN [condition] THE SYSTEM SHALL [behavior]`), `design.md`, `tasks.md`. Four phases: Requirements → Design → Implementation Planning → Execution.

**No DAG, no metadata, no store, no CLI/MCP to drive, and it's tied to an Amazon IDE.** The only reusable idea is EARS notation for acceptance criteria — worth stealing for your node bodies, nothing more. Dismiss as a platform.

---

### Anthropic's native Claude Code Tasks — ⚠️ read this one
This is the strategic risk to your whole substrate. Claude Code **v2.1.16 (January 2026)** shipped built-in `TaskCreate` / `TaskUpdate` / `TaskList` / `TaskGet` tools, explicitly inspired by beads, with **dependency tracking** (`addBlockedBy` / `addBlocks`). Storage: session-isolated by default; set `CLAUDE_CODE_TASK_LIST_ID=my-project` to persist to `~/.claude/tasks/<id>/`, and multiple sessions sharing that ID see synchronised state.

Consensus framing is **complementary, not competing** — Tasks is session/short-horizon (`~/.claude/tasks`), beads is project/long-horizon (in-repo, survives weeks). One commentator's analogy: "Tasks is SQLite, Beads/Flux are PostgreSQL."

*Caveats I could not fully verify:* my figures come from secondary sources dated January 2026, and there is an open issue (anthropics/claude-code#23816) reporting these tools referenced in docs but unavailable at runtime in some configurations. **Verify against your installed Claude Code before betting on it.** If it holds up, it's free plumbing for the intra-session layer, but it has no custom-metadata field I could confirm, so your gauges likely can't live there.

---

### Smaller / also-rans

| Project | Repo | Stars | Status | Note |
|---|---|---|---|---|
| **beads_viewer** | `Dicklesworthstone/beads_viewer` | 1,637 | Active (2026-08-05) | Graph-aware TUI **for beads**: PageRank, **critical path**, dependency DAG viz, robot-mode JSON API. License NOASSERTION. *PageRank + critical path over the task graph is close to your "riskiest central nodes" heuristic — worth reading before you write your own centrality code.* |
| **ticket** | `wedow/ticket` | 853 | **Stale** (last push 2026-03-16) | "git-native ticket tracking in a single bash script. Dependency graphs, priority levels, zero setup." MIT. Charming, minimal, but a single bash script and 5 months idle. |
| **beans** | `henriquebastos/beans` | 57 | **Stale** (2026-05-16) | Python, MIT. Nodes in a dependency graph, SQLite as a *materialised view* over an **append-only JSONL journal** committed to git. **This is architecturally the design beads abandoned when it went Dolt** — and arguably the design you want. But 57 stars, 3 forks, one author, dormant. Reference architecture, not a dependency. |
| **beads_rust** | `Dicklesworthstone/beads_rust` | — | Not checked | Rust port of the *SQLite+JSONL-era* beads. Likely diverged. |
| **scry** | `prmichaelsen/scry` | **3** | Dormant (2026-05-22) | beads' own docs cite it as adjacent: "marker-indexed knowledge and recall graph… Files declare identity via inline `@scry.entry` markers". **Eerily close to your ctx marker grammar** — and the beads docs note they "independently arrived at the same hash-based-ID convention (`bd-a1b2`, `~hash`)". 3 stars = validation of your instincts, not a project to depend on. |
| **Flux**, **Trekker** | — | — | Unverified | Surfaced as "MCP-first Kanban" and "fully local with dashboard" in a comparison article. I could not locate repos before hitting the search cap. |

---

## 3. Comparison against your four criteria

| | DAG w/ typed deps | Node custom fields | Git / plain text | CLI + MCP | Inner loop pluggable | Fork needed for gauges? |
|---|---|---|---|---|---|---|
| **beads** | ✅ best in class (10 edge types, cycle rejection, layered ready-queue, gates) | ✅ **arbitrary JSON `metadata`** | ⚠️ git repo, but **Dolt** DB; JSONL is export-only | ✅ CLI + `beads-mcp` | ✅ tracks only | **None** |
| **Backlog.md** | ⚠️ untyped `dependencies[]` + parent/child | ❌ closed TS interface | ✅ Markdown files | ✅ CLI + MCP | ⚠️ prescribes 3-checkpoint flow | **Yes** — type + parser + serializer |
| **task-master** | ⚠️ has deps | ? | JSON files | CLI + MCP | prescriptive | Moot — licence |
| **Spec Kit** | ❌ | ❌ | ✅ | CLI only | ❌ dictates it | N/A — no store |
| **OpenSpec** | ❌ | ❌ | ✅ | CLI only | ❌ dictates it | N/A — no store |
| **Kiro specs** | ❌ | ❌ | ✅ | ❌ | ❌ | N/A — IDE convention |
| **CC Tasks** | ✅ blocks/blockedBy | ❔ unverified | ❌ `~/.claude/tasks` | native tools | ✅ | Unknown |
| **beans** | ✅ | ❔ | ✅ JSONL journal + SQLite view | CLI | ✅ | Dormant |

---

## 4. Honest maturity / lock-in assessment

**Recommend seriously: beads.** It is the only project that has independently converged on your exact model (hypothesis nodes, typed dependency edges, breadth-first ready-queue, hash IDs for merge safety) *and* left you a first-class arbitrary-JSON extension point that fits confidence + fidelity with no fork. 26k stars, MIT, Go single binary, shipping hourly. Its docs even establish the convention that orchestrators read advisory metadata before dispatching subagents — the exact protocol your scheduler/driver needs.

**The one real objection:** Dolt. It contradicts your stated portability principle, the migration path has documented data-loss-shaped bugs (#2276, backup restore silently no-op'ing), and "JSONL is not the source of truth" means you lose greppable plain text and clean git diffs on your node tree. Given your `store/` is already its own git repo of `node.md` files, **swapping a readable Markdown tree for an embedded SQL database is a genuine downgrade on the axis you said you care about most.** Weigh that deliberately rather than being swept along by the star count.

**Fresh risks worth naming:**
- **Governance churn.** beads moved orgs (`steveyegge/` → `gastownhall/`, homepage `beads.gascity.com`). Yegge is commercialising something adjacent. The MIT licence protects you, but expect the roadmap to serve "Gas Town", not you.
- **Velocity as a hazard.** 5,400+ PRs in ten months, with breaking storage changes twice (SQLite → Dolt, JSONL demoted, `bd migrate --to-dolt` *removed* in v0.58.0). Pin a version; do not track `main`.
- **Anthropic is eating the bottom of this market.** Native Tasks with dependency tracking landed in Jan 2026. Expect it to grow. Do not invest in anything whose only value is intra-session task state.

**Flag as vapourware / thin / abandoned:**
- **claude-task-master** — Commons Clause (not OSS), stale 3.5 months, being funnelled into a hosted product. Its 28k stars are a trailing indicator. **Avoid.**
- **Spec Kit, OpenSpec, Kiro specs** — not trackers at all. Prompt scaffolds with enormous star counts and zero data model. They compete with your *skills*, not your *store*. Adopting any means deleting your methodology and still hand-rolling the node tree.
- **Bernstein** — Apache-2.0, genuinely active, but I'd rate it **unproven**. Signals to weigh: created five months ago with **3,425 commits from a single human author** (`chernistry`) and PR numbers past #3470 — a rate that suggests near-total agent authorship; an opaque corporate org name (`sipyourdrink-ltd`); the hosted `api.bernstein.run` service is announced but **"not yet available"**; determinism and "pass^k reliability floor" claims carry **no independent third-party validation and no quantified benchmarks**; test coverage is not stated. It also solves a different problem — parallel agent execution with signed provenance, not project decomposition. **I could not complete a reputation check (search budget exhausted). Treat as unverified.**
- **ticket, beans, scry** — all one-author and dormant. Read them for ideas; don't depend on them.

**Cheapest honest path:** keep your node tree in `store/` as the authored source of truth, and evaluate beads as a *derived index* — project nodes into `bd` issues with gauges in `metadata`, and let `bd ready` / `bd graph` / beads_viewer's PageRank + critical path do the scheduling and centrality work you were about to write. That inverts your risk: you get the scheduler for free without surrendering plain-text authorship to Dolt, and it matches the principle already in your CLAUDE.md — treat platform primitives as derived indices over greppable text, not as the source of truth.

**What I could not verify:** whether `beads-mcp` is first-party or community-maintained and how current it is; Claude Code Tasks' present behaviour and whether it accepts custom metadata (my data is 7 months old and secondary); Bernstein's reputation and code quality; and the existence/repos of "Flux" and "Trekker".

Sources: [gastownhall/beads](https://github.com/gastownhall/beads) · [beads metadata docs](https://github.com/gastownhall/beads/blob/main/docs/core-concepts/metadata.md) · [beads Dolt architecture](https://github.com/gastownhall/beads/blob/main/docs/architecture/dolt.md) · [beads discussion #2332](https://github.com/gastownhall/beads/discussions/2332) · [beads issue #2276](https://github.com/gastownhall/beads/issues/2276) · [sipyourdrink-ltd/bernstein](https://github.com/sipyourdrink-ltd/bernstein) · [bernstein.run](https://bernstein.run/) · [MrLesk/Backlog.md](https://github.com/MrLesk/Backlog.md) · [eyaltoledano/claude-task-master](https://github.com/eyaltoledano/claude-task-master) · [github/spec-kit](https://github.com/github/spec-kit) · [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) · [Kiro specs docs](https://kiro.dev/docs/specs/) · [From Beads to Tasks](https://paddo.dev/blog/from-beads-to-tasks/) · [henriquebastos/beans](https://github.com/henriquebastos/beans) · [wedow/ticket](https://github.com/wedow/ticket) · [Dicklesworthstone/beads_viewer](https://github.com/Dicklesworthstone/beads_viewer) · [prmichaelsen/scry](https://github.com/prmichaelsen/scry) · [anthropics/claude-code#23816](https://github.com/anthropics/claude-code/issues/23816)
