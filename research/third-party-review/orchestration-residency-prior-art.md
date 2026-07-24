# Prior Art: Orchestration Residency, Disk-Assembled Briefs, Cross-Family Review

**Provenance:** research sub-agent report, 2026-07-22, commissioned for
`research/tdd-plan-dogfood-lessons.md` (17 web calls). Evidence classes: A = measured;
B = vendor/official docs; C = practitioner, unmeasured; D = folklore.

## 1. Orchestrator residency / cold-start orchestration

**Quadratic cost with turn count is externally measured.** OpenHands' context-condensation
post states baseline context management "scales quadratically over time" because all prior
history is reprocessed each turn; their condensation makes per-turn cost "scale linearly"
at "less than half the cost" per turn once triggered, with solve rate unchanged (54% vs
53%). [A] https://www.openhands.dev/blog/openhands-context-condensensation-for-more-efficient-ai-agents
— Note: their remedy is *summarization inside a resident session*, not removing residency.

**Deterministic driver over durable state is established architecture — but
reliability-motivated, not cost-motivated.** Temporal's durable-execution material treats
LLM calls as stateless, retryable activities while a deterministic workflow owns the loop;
state is persisted externally and workers can crash and resume with no lost state. [B]
https://temporal.io/blog/durable-execution-meets-ai-why-temporal-is-the-perfect-foundation-for-ai
and https://temporal.io/blog/build-resilient-agentic-ai-with-temporal

**12-Factor Agents** (HumanLayer) codifies the same shape from the practitioner side:
Factor 12 "stateless reducer" (agent as pure function f(events) → next_action), Factor 3
"own your context window" (context is compiled, curated, reviewable), plus
launch/pause/resume from unified externalized execution state. [C, widely adopted]
https://github.com/humanlayer/12-factor-agents

**Cold CI-driven invocations are an official vendor pattern.** Claude Code headless mode
(`claude -p`) and `anthropics/claude-code-action` run one-shot, non-interactive
invocations in CI — cold segments by construction — but neither is documented as a cost
lever with numbers. [B]

**Counter-position:** Cognition's "Don't Build Multi-Agents" argues for a single
long-running linear agent where "every action is informed by the full record of prior
actions" — a warning that segmenting works only if on-disk state genuinely carries the
full decision-relevant record. [C] https://cognition.com/blog/dont-build-multi-agents

**Cache warmth as the alternative lever:** Manus reports KV-cache hit rate as "the single
most important metric" for a production agent (100:1 input:output ratio; cached vs
uncached Sonnet input $0.30 vs $3.00/MTok) — i.e., a resident, append-only, stable-prefix
session can be ~10x cheaper without killing residency. [C, practitioner with numbers]
https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus

Cost baselines: OpenHands + Claude on SWE-Bench Verified median $1.80–3.50/issue, p90
$12–22; SWE-agent ~$1.05/instance on SWE-Bench Lite. [C, secondary compilation]
https://futureagi.com/blog/best-ai-gateway-openhands-swe-agent-autonomous-workflows-2026/

**Verdict vs our finding:** Corroborates the quadratic diagnosis (OpenHands measured
exactly this) and the driver-owns-the-loop architecture (Temporal, 12-Factor). Refines:
published remedies are condensation and cache warmth *inside* a resident session; no
published system frames *residency removal via zero-token relauncher* as the primary cost
lever. Strongest source: the OpenHands condensation post.

## 2. Complete briefs from disk vs interactive accumulation

**Vague briefs measurably fail; complete self-contained briefs are the published fix.**
Anthropic's multi-agent research system writeup: short instructions like "research the
semiconductor shortage" caused subagents to misinterpret or duplicate work; the fix was
detailed task descriptions with objective, output format, tools, and boundaries; the lead
agent also saves its plan to external memory to survive context truncation. Multi-agent
runs cost ~15x chat tokens; token usage explained 80% of performance variance. [B,
internal measurements] https://www.anthropic.com/engineering/built-multi-agent-research-system

**Deterministic context views exist and work:** Aider's repo map is compiled
deterministically (tree-sitter parse, graph-ranked identifiers, fixed token budget,
default 1k tokens) so the model gets a codebase view without interactive exploration. [B]
https://aider.chat/docs/repomap.html

**Prompt compilation as a discipline:** DSPy compiles declarative modules into optimized
prompts/pipelines — prompts as build artifacts rather than hand-accumulated context.
[A/B] https://arxiv.org/abs/2310.03714

**Filesystem as the durable substrate:** Manus treats the file system as "the ultimate
context: unlimited in size, persistent by nature," with restorable compression. [C]

**Partial counter-position:** Anthropic's context-engineering post recommends a *hybrid*:
lightweight identifiers plus just-in-time loading via tools, conceding "runtime
exploration is slower than retrieving pre-computed data" but arguing agentic retrieval
handles tasks where needed context can't be predicted. [B]
https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

**Cold sub-agent caches corroborated in the wild:** Claude Code issue reports document
sub-agent calls with prompt caching disabled by default, and full cache misses on resume
from non-deterministic tool-description ordering (30–60k-token prefixes rebilled). [B,
vendor repo issues with token traces] https://github.com/anthropics/claude-code/issues/29966
and https://github.com/anthropics/claude-code/issues/44724

**Verdict vs our finding:** Corroborates — strongest source is Anthropic's multi-agent
writeup (dispatches need one complete self-contained brief; durable plans belong on
disk); Aider shows deterministic compiled views beat exploration for repo context.
Refines: Anthropic's later guidance argues the compiled brief should be the default
*skeleton*, leaving the worker just-in-time retrieval tools for the unpredictable residue.

## 3. Cross-model-family review committees

**Mechanism — same-family review is structurally biased:** LLM evaluators recognize
their own generations, and self-recognition is causally linked to self-preference bias
(GPT-4, Llama-2 measured). [A] https://arxiv.org/abs/2404.13076 (NeurIPS 2024)

**Cross-family panels beat single big judges:** PoLL — a panel of three small judges from
disjoint families (Command-R, GPT-3.5, Haiku) outperforms a single GPT-4 judge with less
intra-model bias at over 7x lower cost (QA/arena evals, not code). [A]
https://arxiv.org/abs/2404.18796

**Decorrelation is real but partial:** A failure-independence study (224 problems, 12
models) found same-model N-version ensembles reach <0.3 of the reliability gain expected
under independence (~0.43–0.44 overall); heterogeneous models raise diversity "though
heterogeneous models help partially" — failures remain correlated beyond independence.
[A] https://arxiv.org/abs/2607.02808 (see also Galápagos,
https://arxiv.org/abs/2408.09536)

**Direct practice of your exact pattern:** "Refute-or-Promote" uses stage-gated
adversarial review where "cold-start reviewers reduce anchoring bias and cross-family
models catch correlated blind spots"; killed ~79–83% of defect candidates before
disclosure, yielding 4 CVEs and multiple upstream fixes. Measured caveat: ten reviewers
unanimously endorsed a non-existent Bleichenbacher oracle — only an empirical test caught
it. [A/C] https://arxiv.org/abs/2604.19049

**Finder vs filter separation is established:** G-Research: "The key insight was
splitting recall and precision into separate prompts. The first pass captures everything;
the second filters" (gates: 100% recall on mandatory rules, >85% precision). [C]
https://www.gresearch.com/news/building-a-code-review-tool-the-llm-patterns-that-actually-work/
— Claude Code's review feature ships the same shape: parallel specialized finders plus a
verification step filtering candidates against actual code behavior. [B]
https://code.claude.com/docs/en/code-review — CriticGPT quantifies the tradeoff:
dedicated critics catch more bugs than paid human reviewers (critiques preferred 63% of
the time), but model-alone hallucinates more bugs; human+model minimizes hallucinated
findings. [A] https://openai.com/index/finding-gpt4s-mistakes-with-gpt-4/ — LLM agents as
FP filters over static analysis: FP rate cut from >92% to 6.3% (OWASP), strongly
backbone-dependent. [A] https://arxiv.org/abs/2601.22952

**Verdict vs our finding:** Strongly corroborates: self-preference bias supplies the
mechanism, PoLL and Refute-or-Promote demonstrate cross-family panels working, and
finder/filter separation is standard in serious review tools. Refines: decorrelation is
partial (2607.02808), and even cross-family unanimity can validate a phantom bug — an
empirical-check gate should outrank reviewer consensus. Strongest single source:
Refute-or-Promote (arXiv 2604.19049).

## Not found (looked for, absent)

- Any published cost analysis framing orchestrator cost as O(turns²) **and** prescribing
  cold relaunched segments as the fix; OpenHands measures the quadratic but fixes it by
  condensation.
- Any dev-agent pipeline (OpenHands, SWE-agent, Aider, AutoGen, LangGraph, Devin
  writeups) documenting a *zero-token deterministic relauncher* as its cost architecture;
  Temporal-style designs match structurally but are reliability-motivated.
- Head-to-head numbers: resident orchestrator vs segmented cold reruns on the same
  workload.
- Published recall numbers for "one different-family reviewer on a narrow slice catches
  defects N same-family reviews missed" — Refute-or-Promote asserts it qualitatively; the
  failure-independence paper measures *generation* correlation, not *review* recall.
- Devin/Cognition cost-per-turn data; independent field measurements of sub-agent
  cache-hit rates beyond vendor issue-tracker traces.

## Source classes

A (measured): OpenHands condensation; arXiv 2404.13076, 2404.18796, 2607.02808,
2408.09536, 2601.22952, 2310.03714; CriticGPT; Refute-or-Promote (A/C). B
(vendor/official): Temporal blogs; Anthropic multi-agent + context-engineering posts;
Aider repomap docs; Claude Code review docs; claude-code issues #29966/#44724. C
(practitioner, unmeasured or secondary): 12-Factor Agents; Cognition; Manus; G-Research;
futureagi cost compilation. D: none used.
