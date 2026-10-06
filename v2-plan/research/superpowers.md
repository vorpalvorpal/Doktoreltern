# Research: obra/superpowers (v6.4.2, HEAD 8ca22db, 2026-09-25, MIT)

Cloned shallow to scratchpad/superpowers. No `agents/` or `commands/` directories exist.

## 1. Inventory

Only ONE hook: `hooks/hooks.json` SessionStart (startup|clear|compact) runs `hooks/session-start`, which injects the full text of using-superpowers/SKILL.md (65 lines) into context every session. No agents, no slash commands. Subagents are dispatched as `general-purpose` with prompt templates (markdown files in skill dirs), model chosen per dispatch.

Skills (lines = SKILL.md; companions listed):
| Skill | Lines | Purpose | Phase |
|---|---|---|---|
| using-superpowers | 65 | "Invoke any skill with >=1% chance of applying"; rationalisation table; loaded by hook | meta/bootstrap |
| brainstorming | 285 (+visual-companion 299, spec-document-reviewer-prompt 49, node server scripts ~1200 lines) | Three paths (spike / bounded / architectural). Intent discovery, 2-3 approaches, sectioned design, writes spec to docs/superpowers/specs/, self-review, user approval, then hands to writing-plans. Optional browser "visual companion" | interview, spec writing |
| writing-plans | 204 | Spec -> plan of bite-sized tasks with Files / Interfaces / steps, Global Constraints, Review Focus; saved to docs/superpowers/plans/ | planning |
| test-driven-development | 330 (+writing-good-tests 198) | RED-GREEN-REFACTOR iron law | test writing/TDD |
| subagent-driven-development (SDD) | 568 (+implementer-prompt 154, task-reviewer-prompt 207, re-review-prompt 115, scripts sdd-workspace/task-brief/review-package) | Controller dispatches fresh implementer per task, reviewer per task, fix loop, whole-branch review | implementation, sub-agent dispatch, review |
| executing-plans | 373 (+scripts task-start/task-done) | Inline ("Native") execution of a plan, same ledger, one final review | implementation |
| requesting-code-review | 95 (+code-reviewer.md 198) | Reviewer template, Critical/Important/Minor, verdict | review/audit |
| receiving-code-review | 205 | Verify feedback technically before applying; no performative agreement | review (fix side) |
| systematic-debugging | 283 (+root-cause-tracing, defense-in-depth, condition-based-waiting, find-polluter.sh, pressure tests) | 4 phases, no fix before root cause | debugging |
| verification-before-completion | 120 | Evidence before claims | verification |
| using-git-worktrees | 167 | Detect isolation, native tool, git fallback | worktrees |
| finishing-a-development-branch | 225 | Present merge/PR/keep/discard options after work | wrap-up |
| dispatching-parallel-agents | 167 | One agent per independent problem domain | sub-agent dispatch |
| writing-skills | 681 (+anthropic-best-practices 1150, testing-skills-with-subagents 384, persuasion-principles 187) | TDD for authoring skills | meta (not a build phase) |
| diagnosing-superpowers | 120 (+10 analyst prompts, templates) | Post-mortem a session from transcripts; build scrubbed bug-report bundle | closest to retrospective, but about superpowers' own behaviour, not the product |

No retrospective or audit-of-test-suite skill; no mutation/coverage tooling.

## 2. Wiring

- Top-level flow (declared in prose, not enforced): using-superpowers -> brainstorming -> (using-git-worktrees) -> writing-plans -> SDD or executing-plans -> requesting-code-review (final) -> finishing-a-development-branch. TDD, verification, debugging are invoked from inside others.
- Skills call each other by name using "REQUIRED SUB-SKILL: Use superpowers:<name>". Reference counts: SDD 8, finishing 8, TDD 7, worktrees 3, debugging 3, requesting-code-review 3, verification 2, executing-plans 2, writing-plans 1, brainstorming 1. Plans embed a header naming superpowers:subagent-driven-development, and the brainstorming terminal state is hard-coded to "invoke writing-plans".
- Disk state, all convention-based:
  - Spec: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` (committed)
  - Plan: `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` with `### Task N:` headings, `- [ ]` checkbox steps, Global Constraints, Review Focus
  - SDD workspace: `<repo>/.superpowers/sdd/<plan-basename>/` (git-ignored): `progress.md` ledger (first line `# SDD ledger — plan: <path>`; lines like `Task N: complete (commits a..b, review clean)`, `Ruling: ...`, `Task N: minor (deferred): ...`), `task-N-brief.md`, `task-N-report.md`, review packages. Workspace deleted at plan end.
  - Helper scripts (bash+awk) do the mechanical bits: `task-brief PLAN N` extracts a task by heading regex; `review-package PLAN BASE HEAD` writes commits+stat+diff to a file and rejects empty/non-descendant ranges (exit 3); `sdd-workspace` resolves the per-plan dir.
- Coupling / liftability:
  - Easy standalone: test-driven-development, systematic-debugging, verification-before-completion, receiving-code-review, dispatching-parallel-agents, using-git-worktrees (self-contained; worktrees names finishing skill only loosely).
  - Medium: requesting-code-review + code-reviewer.md (just a template with 4 placeholders).
  - Tightly coupled cluster: writing-plans <-> SDD <-> executing-plans <-> task scripts (plan format `### Task N` is parsed by awk; plan header names the executors; ledger format is read by the controller; SDD refers to requesting-code-review/code-reviewer.md by relative path `../requesting-code-review/`; finishing-a-development-branch is the terminal). Lift one and you inherit the format contract.
  - Brainstorming assumes human-in-the-loop approval gates ("HARD-GATE") at each stage, which conflicts with an orchestrator that runs unattended; SDD/executing-plans in contrast say "Rulings, not stalls" (never wait on a human except four named cases).
  - using-superpowers assumes it is injected by hook and tells every agent to invoke skills at 1% likelihood; it has a SUBAGENT-STOP escape. Superpowers-specific skill names appear in prose everywhere, so a swap needs either keeping the name `superpowers:` namespace or editing text.

## 3. Approaches (key quotes)

(a) Context-small / sub-agent-driven (SDD):
- "They should never inherit your session's context or history — you construct exactly what they need. This also preserves your own context for coordination work."
- "Everything you paste into a dispatch prompt — and everything a subagent prints back — stays resident in your context for the rest of the session and is re-read on every later turn. Hand artifacts over as files."
- Implementer writes full report to a file and returns only "status, commits, a one-line test summary, and concerns". Reviewer gets diff via a file ("The output never enters your own context").
- "Do not paste accumulated prior-task summaries ... a real session's dispatch hit 42k chars of which 99% was pasted history."
- Ledger rather than memory: "Conversation memory does not survive compaction ... controllers that lost their place have re-dispatched entire completed task sequences — the single most expensive failure observed."
- "Narration: between tool calls, narrate at most one short line". "Never dispatch multiple implementation subagents in parallel." "Always specify the model explicitly when dispatching" (cheapest tier for transcription tasks, mid-tier floor otherwise, most capable for final review). Opt-in: controller itself can run as a nested sub-agent on a mid-tier model (v6.4.1).
- Implementers and reviewers are forbidden to spawn subagents ("every reviewer a worker spawned duplicated the task review") — note this conflicts with your preference that agents may use sub-agents.

(b) Review:
- Who: fresh reviewer sub-agent per task (one pass returns two verdicts: spec compliance + quality), scoped re-review per fix round, one whole-branch review on the most capable model at the end. Controller never fixes findings itself ("controller fixes skip review").
- Form: task reviewer: spec-compliance Missing / Extra / Misunderstood, plus ⚠️ "cannot verify from diff" items; quality findings with file:line; severities Critical / Important / Minor. Final reviewer template: Strengths, Issues (Critical/Important/Minor with File, Issue, Fix), Recommendations, Assessment "Ready to merge? Yes/No/With fixes". Re-review: each finding ADDRESSED / NOT ADDRESSED, plus new breakage in the fix diff only.
- "Do Not Trust the Report. Treat the implementer's report as unverified claims". Reviewer must not pre-judged: controller may not write "do not flag" into reviewer prompts.
- Fix loop: max 5 rounds; rounds 1-3 resume the original implementer, 4-5 a fresh implementer one model tier up; at round 5 a "breaker": controller adjudicates, parks with `Ruling:` or rules on load-bearing. Fix round must include covering tests, command, output in the fix report before re-review. Minor findings go to ledger, triaged by final review. Final-review findings: ONE fix dispatch, ONE scoped re-review, no second wave. All `Ruling:` lines are listed to the human at the end under "Rulings I made".
- Reviewers do not re-run the suite (trust the implementer's evidence) unless a specific doubt arises.

(c) Plan format/granularity: markdown, header (Goal, Architecture, Tech Stack, Spec path, Global Constraints, Review Focus), then tasks each with Files (Create/Modify/Test), Interfaces (Consumes/Produces, exact signatures), numbered checkbox steps (write failing test; run, expect FAIL; implement signature; run, expect PASS; commit). v6.4.2 deliberately moved away from full code: "A plan records decisions. It's not a transcript of the code"; test steps give name + assertions as code, code steps give signature + file + spec values, body only if not determined. "A plan longer than the code it describes has written the code instead." Task right-sizing: "smallest unit that carries its own test cycle and is worth a fresh reviewer's gate". Self-review checklist (coverage, step scan, type consistency, Review Focus, proportion) is run by the author, no subagent. Plan is reviewed by human before execution (v6.4.1).

(d) TDD / anti-cheating:
- "NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST ... Write code before the test? Delete it. Start over. ... Don't keep it as 'reference'".
- Verify RED is mandatory: test must fail (not error) for the expected reason; "Test passes? You're testing existing behavior."
- Good/Bad examples; "Assert on real behavior, never on mock behavior"; "Real code (no mocks unless unavoidable)"; rationalisation table ("I'll test after", "spirit not ritual"); red-flags list; "Never fix bugs without a test". writing-good-tests.md covers anti-patterns. v6.4.1: the project's whole suite defines green and failures are reported "including ones you didn't cause".
- Test-writer and implementer are the same agent (implementer writes test then code), so there is no separation of test author from code author; the only separation is the reviewer ("Do the new and changed tests verify real behavior, not mocks? ... test output should be pristine"). Nothing prevents editing a test to pass; only reviewer reading the diff. Regression check "revert fix, test must FAIL" exists in verification skill as prose.

(e) Verification before completion: standalone skill, "NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE"; 5-step gate (identify command, run full, read output/exit code, verify, then claim); table of claim vs required evidence; "Agent completed: VCS diff shows changes, not agent reports success"; "Requirements met: line-by-line checklist, not tests passing"; red-flag words ("should", "probably", "Great!"). Prose only. SDD adds a mechanical complement: fix reports must contain the command and output before re-review.

## 4. Packaging

- Claude Code plugin: `.claude-plugin/plugin.json` (name superpowers, version 6.4.2) and a marketplace.json in the repo ("superpowers-dev"). Install: `/plugin install superpowers@claude-plugins-official` (Anthropic's marketplace) or `/plugin marketplace add obra/superpowers-marketplace` then `/plugin install superpowers@superpowers-marketplace`. Same repo supports ~15 other harnesses (Codex, Cursor, Gemini, Copilot CLI, OpenCode, Pi, Hermes, Kimi, Muse, Devin ...), which accounts for much repo bulk (scripts, plugin manifests, tests, 27k+ lines of docs/specs/plans of its own development).
- Version: one version string kept in sync across manifests by `.version-bump.json` + `scripts/bump-version.sh`. Git tags (v6.2.0, v6.3.0, v6.4.1, v6.4.2 seen) and detailed RELEASE-NOTES.md (1475 lines) with breaking-change "Heads up" notes. Note v6.4.0 was "never shipped".
- Activity: very active. Recent releases 2026-07-23 (6.2.0), 08-12 (6.3.0), 09-18 (6.4.1), 09-25 (6.4.2); ~3-4 week cadence with fast follow-ups; behaviour of the central skills (SDD, writing-plans, brainstorming, executing-plans) was substantially rewritten in each of the last three releases. Ongoing eval-driven changes (docs/superpowers/specs contain RED/GREEN eval results). Licence MIT. Single maintainer (Jesse Vincent) plus PR contributors.
- Pin and swap: a plugin install from a marketplace follows marketplace HEAD; to pin you would either (a) vendor the skills dir at a tag (e.g. copy `skills/` at v6.4.2 into your repo/own plugin, record commit sha), or (b) add your own marketplace.json pointing `source` at a git ref/tag of obra/superpowers. Updating = bump the ref, diff `skills/` against the pinned copy, rerun your own acceptance run, because the contracts that matter (plan `### Task N` format, ledger lines, script CLI, report/status contract DONE/DONE_WITH_CONCERNS/NEEDS_CONTEXT/BLOCKED) change between minors. (The `superpowers:` namespace only resolves if installed as that plugin; vendored copies need a rename or wrapper.) The session-start hook force-loads using-superpowers, which would compete with your orchestrator's own skill routing; omit the hook when vendoring.

## 5. Weak spots

- Almost all enforcement is prose: iron laws, rationalisation tables, caps. Mechanical pieces are small: the three SDD bash scripts (brief extraction, review package with range validation), task-start/task-done helpers, and the ledger. Nothing checks that a test was seen failing, that the fix report contains output, that the ledger was updated, that the model parameter was set, or that the reviewer verdict contains both parts. Red-green is attested by the implementer's own report.
- Same agent writes tests and code; no test audit, no mutation testing, no independent adversarial test review. Reviewer instructed not to re-run tests, so verification rests on self-reported evidence.
- Severity/ledger formats are free text; the controller (an LLM) must remember to write them. Resume-after-compaction depends on the model reading `progress.md` correctly; the project's own notes list this as the most expensive observed failure.
- Heavy exhortation and capitals ("EXTREMELY-IMPORTANT", "1% chance") plus hook-injected bootstrap: costs context every session and invites over-triggering; assumes a conversational human partner.
- Skills are long: SDD 568 lines, executing-plans 373, writing-skills 681 (+1150 line best-practices), brainstorming 285 + 299 + visual-companion server; large embedded dot diagrams. Loading SDD SKILL.md alone is several thousand tokens before templates. Visual companion (node server) is irrelevant to an unattended pipeline.
- Rapid churn: core skills rewritten every release; opinions swing (plans with full code in v5 -> decisions only in 6.4.2), so a pinned copy is a snapshot of a moving target.
- Brainstorming is interactive by design (one question per message, approval gates); an orchestrator-driven interview would need to adapt or wrap it. Scope decomposition ("too large -> sub-projects") is mentioned but light.
- "Five rounds / breaker / rulings by controller" puts judgement on the controller model; no independent adjudicator.
- Forbids implementers/reviewers from using sub-agents.
- No explicit retrospective, no cost/time tracking beyond diagnosing-superpowers (transcript analysis for the plugin's own failures).

## 6. Recommendation: what to take

Take (in rough priority):
1. subagent-driven-development (with implementer / task-reviewer / re-review templates and the three scripts): the best-engineered piece; ledger, file-based handoff, review-package, bounded fix loop. Expect to adapt: it needs its plan format and finishing skill.
2. writing-plans (v6.4.2 form): decision-only plans, Interfaces blocks, Global Constraints, Review Focus, proportion check. Pairs with SDD via `### Task N` headings.
3. test-driven-development (+ writing-good-tests.md): self-contained, strongest prose on RED verification and mock avoidance. You would still add mechanical checks (test-writer separate from implementer, run test to see red) yourself.
4. requesting-code-review + code-reviewer.md and receiving-code-review: simple, portable; severity form and "verify before implementing" rule.
5. verification-before-completion: tiny, standalone, quotable; good as a shared preamble for every phase.
6. systematic-debugging: for the audit/fix loop (root cause before fix; includes find-polluter.sh, pressure tests).
Optional: brainstorming for the scoping interview (the intent-write-back step and three-path classification are good; strip the visual companion and the human-approval gates), using-git-worktrees (if you want a standard worktree step; yours may already exist), dispatching-parallel-agents (short).
Leave: using-superpowers + session-start hook (competes with your orchestrator), writing-skills (meta, 2000+ lines with the best-practices copy), diagnosing-superpowers (about the plugin itself, though its transcript-analyst prompts could inspire a retrospective), executing-plans (inline mode; redundant if you always dispatch), finishing-a-development-branch (interactive options menu; your orchestrator owns merge decisions), the visual companion, and all non-Claude harness plumbing.

Overall slotting verdict: individual leaf skills (TDD, verification, debugging, review templates) lift out cleanly. The plan -> SDD -> ledger cluster should be lifted as a unit and pinned at a tag; treat its file formats as the interface your orchestrator speaks, and wrap rather than edit it so updates diff cleanly. Update cost is moderate-high because of churn.
