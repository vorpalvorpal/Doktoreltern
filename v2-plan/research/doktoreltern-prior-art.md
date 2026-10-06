# Prior art in Doktoreltern/research, mapped to the Leitstand layers

Source: /Users/rjs/dev/Doktoreltern/research/ (read-only). Documents dated 2026-07-11 to 2026-08-08.
Marking: "(inferred)" means my reading, not stated in a document. Short names for sources:
SYN = lean-on-existing-code-synthesis.md; OWN = artefact-ownership-prior-art.md; the rest are in
third-party-review/ (RES = orchestration-residency, DUR = durable-execution, TRK = agent-task-graph-trackers,
GIT = git-backed-store, BDM = beads-dolt-migration, HAR = coding-agent-harness, ORC = agent-orchestration,
GATE = verification-gates, DAG = build-dag-tools, MOCK = mock-ladder-decomposition, SPEC = spec-first-discipline,
RAT = rationale-capture, DIV = divergence-move, COOP = cooperative-codegen-failure-modes, BERN = bernstein).

Context warning: the documents were written for Doktoreltern (R packages, a "node tree" with confidence
and fidelity gauges, move ladder DESIGN-PLAN-TEST-CONSTRUCT-VALIDATE, the `stellwerk` verdict tool). None of
them is about resetting a live Claude Code session. L0 has almost no direct prior art in these files.

## 1. Per layer: what could be adopted

"Use" = dependency; "Copy" = copy the pattern or schema; "Learn" = read, do not adopt.

### L0 reset (rewind a live session)
| Item | What it gives | Use | Documents' verdict |
|---|---|---|---|
| RES section 1: OpenHands context condensation | Measured: per-turn cost grows quadratically with a resident session; condensation makes it linear at under half the cost, same solve rate (54% vs 53%) | Learn | Corroborates the problem. Their remedy is summarising inside a resident session, not rewinding. |
| RES: 12-Factor Agents, factors 3 and 12 | Agent as `f(events) -> next action`; "own your context window" (compiled, reviewable) | Learn | Matches the reset-and-render idea. Practitioner, not measured. |
| RES: Manus cache-warmth post | Stable, append-only prefix in a resident session can be about 10x cheaper (cached $0.30 vs $3.00 per MTok) | Learn | The documents' own counter-lever to "remove residency". A reset breaks the cache prefix (inferred). |
| RES: Anthropic multi-agent writeup | Lead agent saves its plan to external memory to survive context truncation; complete briefs from disk | Learn | Strongest source for "durable state on disk, brief rebuilt from it". |
| DUR 4.2: Burr `fork_from_app_id` | "Re-run from a known earlier state" as a first-class command | Copy idea | SYN: take it; git-backed state is well placed. Different thing from forking a session through the Agent SDK. |
| RES "Not found" | No published system uses a zero-token relauncher as its cost fix; no head-to-head of resident vs cold segments | none | The fork-and-resume reset is not covered anywhere in these files. |

### L1 checkpoint store (structured, lintable, CLI as only writer)
| Item | What it gives | Use | Verdict |
|---|---|---|---|
| beads (TRK, BDM; SYN L0) | Hash IDs, typed edges (`blocks`, `parent-child`, `conditional-blocks`, `waits-for`, `discovered-from`, `supersedes`), write-time cycle rejection, ready queue, free-form JSON `metadata`. MIT, Go, about 26k stars (2026-08) | Copy the edge vocabulary only | SYN: vocabulary, not code. It moved to Dolt and `.beads/issues.jsonl` is now export-only. BDM: its real lesson is that having two sources of truth was the expensive mistake. Pin a version; breaking storage changes twice in 10 months. |
| doorstop (GATE 6.1; SYN) | One YAML file per item in git; suspect links store a fingerprint of the parent, so a changed parent flags every child until reviewed. LGPL-3, about 650 stars | Copy pattern, or use | SYN: "fidelity decay, mechanised". Closest match to your "one item per file, lintable". |
| OpenFastTrace (GATE 6.1) | `req~name~1` in spec, `[utest->req~name~1]` in tests; proves every requirement is covered at the current revision. GPL-3, Java | Copy (about 200 lines) | SYN: single most reusable idea for a gate over items. GPL is a constraint on adopting the tool. |
| git-bug / Fossil / Gerrit NoteDb / Radicle (GIT) | Append-only operations folded into a view; the surviving designs all did this | Learn | Mutable per-record files are "the dead lineage" (Bugs Everywhere). Fine single-writer. |
| Backlog.md (TRK) | Markdown tasks, MIT, active | Learn | Closed TypeScript `Task` type with no extension point; gauges would need a fork. |
| Spec Kit, OpenSpec, Kiro (TRK, SYN) | Prompt scaffolds | Learn | "No data model"; they compete with skills, not the store. |
| claude-task-master (TRK) | - | Avoid | Commons Clause, stale 3.5 months. |
| Claude Code native Tasks (TRK) | blocks/blockedBy in `~/.claude/tasks` | Learn | Whether it takes custom metadata unverified; data 7 months old. "Anthropic is eating the bottom of this market." |
| `transitions` (DUR 5, SYN) | State machine as data; MIT, 6.6k stars | Use | "Near-zero lock-in." Only if a unit-state machine is wanted. |
| pydantic-graph v1 `record_run` (DUR 4.4) | Raises if a node is already running | Copy idea | Good guard for unit state. The library's persistence was deleted upstream. |
| DBOS Transact (DUR 1.1) | Durable workflows; SQLite by default, no server; MIT | Spike only | SYN: spike "one workflow per move". Open: does `DBOS.recv` survive a multi-day restart. |

Store hazards named by the documents: a `_next` counter and per-node `NNNN.md` names break with two writers
(GIT 2, BDM 7); a write-path index is the thing that killed beads' single source of truth (BDM 7). Cure: hash IDs
or one writer. A CLI that is the only writer is the cure GIT names ("all writers funnel through one process").

### L2 guards (write scope, attested "done", one committer)
| Item | What it gives | Use | Verdict |
|---|---|---|---|
| Claude Code hooks: `PostToolUse`/`PostToolBatch` exit 2, `Stop` with `decision: block`, `TaskCompleted` (HAR 1c, 5) | Native enforcement points | Use | HAR: "cheapest verification hook that exists today". |
| `claude --worktree` (HAR 4; SYN L4) | Edits to the main checkout, `git -C`, `--git-dir` redirects blocked; covers subagents; `.worktreeinclude` | Use | SYN: delete our own isolation plumbing. |
| Baseline-artifact protection (GATE 7; SYN L5) | Snapshot, mutation and hypothesis baselines, pinned schemas live outside the agent's write scope; any diff touching them fails | Copy | "Determinism is a property of who may update the expectation." Defines the write-scope guard. |
| Content-hashed, read-only tests (COOP, SPEC, ORC) | ImpossibleBench: read-only tests plus strict prompt took GPT-5 cheating 54% to 9% | Copy | COOP: the cheap form stays; the elaborate isolation does not pay. |
| Diff computed by us, never self-reported (HAR Q1) | Attestation from evidence | Copy | Basis for an "attested done". |
| Empty-diff guard (BERN) | Refuse "done" with zero attributable changed files | Copy | SYN: steal it. |
| `--max-budget-usd`, `--bare` (HAR 5) | Per-node cost ceiling; reproducible scripted call | Use | SYN table. |
| Claude's "agentic laziness" (HAR Q2) | Anthropic names declaring done after partial progress | Learn | The case for attested "done". |
| One committer | Gerrit funnels all writes through one process (GIT 4) | Learn | Also the cure for store races. |

### L3 gates (lint, types, tests, mutation behind one command)
| Item | What it gives | Use | Verdict |
|---|---|---|---|
| mise tasks + lefthook (GATE 1) | `depends` DAG, `sources`/`outputs` caching, tool pinning; both MIT | Use | "Best cost/benefit." Dagger (Apache-2.0, content-addressed) is the correct but heavy fallback; Earthly is dead. |
| pre-commit (GATE 1) | Hook ecosystem, MIT | Use | Fast tripwire layer; no JSON output. |
| `stellwerk` (SYN) | Frozen verdict grammar, exit 0 met / 1 deviation / 2 tool error, receipt DAG | Own tool | SYN: "the differentiator". Not external. |
| dbt `run_results.json` (GATE 7; SYN) | Per-node status, failures, timing, message | Copy schema | Nothing comparable exists in R; applies to any aggregator (inferred). |
| Mutation testing (GATE 2.2, COOP) | Only check that finds assertion-free tests; diff-scoped only | Use | Mutation score, not coverage. R: `mutator`, `muttest`, "very recent, verify". Python tools are not named in these files. |
| Metamorphic relations, reconciliation (GATE 2.5, 3) | Hard to weaken quietly; about 50 lines for row accounting | Copy | SYN: highest signal per cost. |
| Coverage-percentage thresholds | - | Avoid | GATE "theatre" list: a direct instruction to write assertion-free tests. Also `--as-cran` per node, cyclomatic thresholds, guardrail frameworks. |
| Codex event vocabulary, Factory `droid exec` exit code, Goose recipes (HAR 0, 5) | Typed `file_change` / `command_execution{exit_code}` / usage; "unmet objective" as its own exit code; YAML spec with `response.json_schema` and `retry` | Copy | SYN: adapter normal form and node-spec shape. |
| Bernstein gate plugin (BERN 6b) | 138-line `GatePlugin` ABC; `.bernstein/gates/*.py` drop-ins | Copy idea | The best interface in that project. Do not depend on it. |
| Seeded-defect calibration (SYN, BERN) | Feed the gate a known-bad artefact and assert it fails | Copy | "A gate never seen to fail has not been shown to work." |

### L4 flow (order of steps; which skill does each)
| Item | What it gives | Use | Verdict |
|---|---|---|---|
| Walking skeleton / tracer bullets (MOCK 1; ORC) | One real end-to-end path first | Learn | ORC: "genuinely well-supported". MOCK amendment 2: drive ONE real path first, then breadth-mock. That matches your "walking skeleton, then widen". |
| Claude Code dynamic workflows, v2.1.154+ (SYN L3; DIV V.1) | JS script orchestrates subagents; results in script variables; plugin-distributable | Use | SYN: "delivery vehicle" for multi-agent steps. Experimental surface. |
| Claude Code `permissionMode: plan` (DIV) | Enforced read-only planning step | Use | "Directly usable." No published eval of plan vs no plan. |
| doit (DAG 4; SYN) | `uptodate` is a callable, `result_dep`, `@create_after`; single maintainer, 0.37.0 | Copy pattern (about 50 lines), or use | SYN: copy the pattern; revisit if mid-run DAG growth is needed. |
| create-mvp (DAG, "the one real hit") | LLM emits JSON, a deterministic transform builds the Make graph, exit codes are gates, `.done` sentinels | Learn | 2 stars; "only working example anyone has published". |
| make, DVC, luigi, just, ploomber, drake (DAG) | - | Learn / avoid | All answer "stale?" with a boolean and run the whole stale closure; none picks the next node. drake died of ambient-environment invalidation. |
| Durable engines: Temporal, Restate, Inngest, Hatchet, Prefect, Dagster, Windmill, LangGraph (DUR) | Crash-safe resume | Avoid | SYN: "the wrong answer for us"; they need a server and supply only the "run durably" half. LangGraph `interrupt()` re-runs the node; Inngest `wait_for_event` has no lookback. Only DBOS (SQLite) and Burr (`apache/burr`, zero core deps) are viable. |
| Spec-driven kits, Spec Kit, OpenSpec, Kiro (SPEC 5; MOCK) | Plain-markdown requirements, design, tasks with approval gates | Learn | Re-report waterfall pathologies. The Kiro three-file convention is portable. |
| Aider architect/editor split (DIV V.2) | +3 to +10 points over one model doing both | Learn | The only role split with a published table. |

### L5 review/audit and learning
| Item | What it gives | Use | Verdict |
|---|---|---|---|
| Finder/filter split (RES 3) | G-Research: separate recall and precision prompts; Claude Code review does parallel finders plus a verifier | Copy | Standard in serious review tools. |
| Cross-family panels (RES 3) | PoLL: three small judges from different families beat one GPT-4 judge at over 7x lower cost; Refute-or-Promote killed 79-83% of candidates | Copy | Decorrelation is partial; ten reviewers unanimously endorsed a non-existent bug, so an empirical check outranks consensus. |
| LLM judge for "did this cheat?" only (SYN L5; GATE 5.4) | Judges are good on clear reward hacking, weak on correctness | Copy | Do not cite MT-Bench agreement for code. |
| Audit lottery (ORC Q3) | Sampling arithmetic: about 3/p items for 95% confidence | Copy with changes | Sample confident nodes too; value is measuring the defect base rate, not deterrence. |
| ADR practice (RAT 1) | Short, superseded not edited, written at decision time | Copy | The only rationale form that survived. |
| Governance-decay pinning (RAT 4) | Standing constraints must be pinned through a fold | Copy | Needed for lessons that must survive resets. |
| Bernstein coordination projection, sample-size-gated confidence (BERN; SYN 3) | Fail-closed hashing of receipts; refuse to answer under a sample threshold | Copy ideas | SYN list "worth stealing". |
| Issue #3254 in Bernstein (SYN 3) | Failed required gate recorded "blocked" yet merged | Learn | Signed receipts over a broken control plane give false confidence. |

## 2. Where the seams should be, and what interfaces stay narrow

- Executor vs everything else: HAR Q1 finds nobody has standardised "task in, diff + verdict + evidence out".
  Proposed thin contract (HAR; SYN L4): IN working dir, task file, verdict schema; OUT a diff computed by
  you, a JSONL evidence log, a validated verdict, an exit code of 0/1/2.
- Gate adapter: Bernstein's `GatePlugin` is `name`, `required`, `condition`, `run`; its executor adapter ABC has
  only two required methods, `spawn` and `name` (BERN 5a, 6b). Lesson: a minimum viable adapter is a command
  template. The same document warns the declarative profile path was mostly aspirational.
- "Which work" vs "run it durably" is the cleanest seam in the survey (DUR 5.1). Engines take only the second; value-based
  selection has no prior art, so it is yours.
- Store vs index: any index must be provably disposable, rebuildable from the text with no write path of its own (BDM 7.2).
- Engine details must not leak into core signatures: beads' `RunInTransaction(ctx, commitMsg, fn)` made a swappable
  backend unswappable across 61 files (BDM 7.4).
- Staleness predicate as a callable, not a hash bit (DAG; SYN L1): the one place where a tool (doit) exposes an
  extension point that matters.
- A node's inputs must be an explicit, closed, serialisable set (drake post-mortem; SYN L1). This is a seam rule for
  anything rendered into a post-reset context (inferred).
- Ownership has three classes (OWN A.4, nbdev): leaf-owned, tool-generated, one human-owned metadata file.
- Prefer ordinary files over a bespoke source of truth: Husain quit nbdev because AI tools could not tell writable from
  generated surfaces (OWN A.4).

## 3. Warnings, by layer

- L0: no external number supports resetting. Cognition warns that segmenting only works if on-disk state carries the
  full decision-relevant record (RES 1). Manus shows cache loss is a real cost. Compaction loses standing constraints:
  violations rose from 0% to 30-38% when a constraint was dropped (RAT 4, single-author preprint).
- L1: marker/taxonomy sprawl. Every taxonomy that survived had 3-5 types; the Doktoreltern marker DSL was 1,172 lines for
  about 17 kinds, named the largest liability (SYN 4; RAT 3). Latest-wins folds are unsafe for obligations (RAT 4).
  LLM-written rationale is plausible confabulation (RAT 2); hallucinated references appear in AI-drafted ADRs.
  Round-trip sync between two representations is a graveyard (OWN A, B); hand-kept maps rot in weeks (OWN C).
- L1 store history: git-native trackers mostly died of worktree-file conflicts and no UI (GIT 1); beads cycled through
  three storage designs (BDM); Obsidian-style plain files slow down at low thousands of items, so cache the fold (GIT 3).
- L2: 30% (o3) to 100% (one task) reward hacking when the scorer is visible and writable (HAR; ORC); about 0.7% when it
  is not (COOP). A passing suite is no evidence unless you control and hash it. Cooperative implementers fail mainly by
  coverage gaps (20-33%), not gaming (COOP).
- L3: coverage thresholds and per-node `--as-cran` are theatre (GATE). Gates accumulate rot; "verification must co-evolve
  with the generator" (GATE). Mutation testing must be diff-scoped. Held-out tests are fallible too (59.4% of audited
  SWE-bench Verified problems had flawed tests, SYN).
- L4: whole-tree up-front design repeats 1970s stub-and-integrate failure; static mocks go stale (MOCK). Spec completeness
  up front is rejected by 40 years of evidence (SPEC). Fully autonomous tree walkers (AutoGPT, BabyAGI, Devin) all failed;
  survivors are short, human-gated loops (ORC). Parallel subagents on dependency-heavy work are advised against (DIV;
  Cognition). LangGraph/pydantic-graph/Temporal rejected (DUR). Plan drift: agents rarely recover (ORC).
- L5: debate and self-refine are net-negative or no better than self-consistency (DIV; SYN 6). Free-form "review this plan"
  approves plausible garbage (ORC Q2). Confidence ordering must not be self-reported (ORC).
- Bernstein as a whole: 4,217 commits (81% one author), 700k lines inflated about 46% by docstrings, stub `pass^k` benchmark,
  advisory CI gates, polarity bug in the merge gate. Verdict: design reference and cautionary specimen, not a dependency
  (BERN 8; SYN 3). Four graph models, six `GateResult` classes, two config schemas.
- WHO Surgical Safety Checklist (DIV): a mandated step done in form only produced nothing. Every step should emit an
  artefact that changes a later decision.

## 4. What the synthesis concluded, and was it acted on

SYN (2026-08-08) was written after Robin said "we have been going about this all wrong, let's lean on existing code".
Its one-line strategy: borrow the executor and the gate primitives wholesale, keep the store and the scheduler, delete
isolation and dispatch plumbing, and spend the saved effort on the verdict envelope and the divergence move, the only
parts nobody else can hand over.

- Borrow: executor (`claude -p`, `--worktree`, `--bare`, `--max-budget-usd`, `--output-format`); gate tools (mise,
  lefthook, mutation, OpenFastTrace grammar, doorstop suspect links, dbt result shape); beads edge vocabulary;
  `transitions`; dynamic workflows for multi-agent moves.
- Keep/build: the node store as plain text (beads rejected as source of truth), the selection scheduler, the MCP context
  server, `stellwerk`, the divergence move (no prior art, ship with its own A/B).
- Spike, not adopt: DBOS; fall back to Burr. Open: whether the 1,172-line marker grammar should become YAML frontmatter.
- Acted on? I found no evidence it was. The Doktoreltern git log ends at the research commit (1e32060, "lean on existing
  code" architecture review) and the commit before it; I did not read the code to check dispositions. Treat all of SYN
  section 4 as a proposal. Whether werkbank adopted any of it is outside these files.

## 5. Ideas not in the layer list

- Artefact ownership (OWN): every artefact chunk should have exactly one owning spec leaf. Gate-enforced maps stay true;
  hand-kept ones rot. Use stable IDs, explicit `moved {from,to}` records, a machine-written ownership ledger, and a DO-178C
  disposition for unowned chunks (derived, dead, or waived). Disjoint cover rather than a bijection. Never auto-delete from
  an ownership map.
- Rationale capture and divergence (RAT, DIV): keep alternatives live until a constraint kills them (set-based design);
  independent generation before commitment; de-anchored premise audit; triggers only on mechanical signals (loop and
  stagnation detectors, Luby restarts), never on self-reported confidence. No published eval of any of this helps.
- Spec-first limits (SPEC): treat every brief as v1 of a negotiation; require a "spec-doubt" checklist; judge against
  upstream intent as well as the spec (shared-spec errors correlate even across model families).
- Contracts rather than static mocks (MOCK): sibling mocks must double as contract suites replayed on the real code (Pact style).
- Fidelity decay / suspect links (SYN L1), seeded-defect calibration (BERN), sample-size-gated confidence.
- Cost and residency (RES, HAR): multi-agent is about 15x chat tokens, teams about 7x.
- Acceptance criteria written as file paths are a category error; criteria should be properties, not locations
  (BERN issue #2186; SYN 3).

## 6. Possibly out of date

- Tool versions, star counts and licences are as of 2026-08-08 or earlier (mise, Dagger, beads, Bernstein, Hatchet, DBOS).
- R mutation packages `mutator` and `muttest` flagged "very recent, verify". `beads-mcp` provenance unverified.
- Claude Code features cited (`--worktree`, `--bare`, dynamic workflows v2.1.154+, agent teams, plan mode) are as of those dates; the
  release cadence is fast. The Anthropic Tasks and Agent SDK details are second-hand and 7 months old in TRK.
- Several reports say their web-search budget ran out; absence of a finding there is weak evidence.
- DBOS `recv` durability, DBOS SQLite parity and Burr release cadence were all unverified.
- I read SYN, OWN, ORC, GIT, COOP, MOCK, RAT, SPEC, RES in full; HAR, TRK, BDM, DUR, GATE, DAG, DIV, BERN partly (their
  summary, verdict and synthesis sections, headings and selected tables). Rows from unread parts of those are labelled by
  what SYN says (inferred where I combined them).
