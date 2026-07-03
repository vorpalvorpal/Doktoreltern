# docloop skills

Skills registered under the `docloop` plugin are invoked **live**, synchronously,
while a human is composing a comment in the docloop GUI (typing `/skill-name
context…`, via the slash-trigger dropdown) — see `docloop/vite.config.ts`'s
`POST /run-skill`. It reads the skill's own `SKILL.md` body straight off the
working tree (frontmatter stripped) and uses it as the Claude Agent SDK's
`systemPrompt` for a single-turn `query()` call with `tools: []` and
`permissionMode: 'dontAsk'` — **not** the SDK's `skills: [...]` allowlist
option, which resolves against the *installed* plugin registry
(`~/.claude/plugins/...`) rather than this repo's own working tree, and would
go stale the moment this file changes without a separate plugin reinstall.

Because of that, every skill here must be:

- **Quick.** A human is waiting on the result inline while composing a comment.
- **Self-contained: text in, text out.** No filesystem/Bash access is granted
  (`tools: []`) — a skill can only produce a final text response, nothing else.
  Design each skill's prompt to end with exactly the text that should become
  the result (replace the anchored span, or the comment reply) — no free-form
  assistant prose to parse back out.
- **Non-mode-changing.** No `EnterPlanMode`, no spawning subagents, nothing
  that expects a back-and-forth the live-invocation bridge can't provide.
- **Markdown- and directive-safe output.** A skill's result becomes a comment
  body, round-tripped through the same `remark-directive` parser that reads
  `:mark[…]{#id}` anchors — and that parser treats a bare `:name` (no
  brackets needed) as an attempted directive *anywhere* it appears, crashing
  the comment's re-render if `name` isn't a recognised one. Concretely: **never
  emit a colon directly between two word characters** (`word:word` — no
  space) in a skill's output; `docloop:example` broke this, `docloop-example`
  didn't. This isn't unique to skill output — any human-typed comment with
  the same pattern hits the identical crash — but a skill's output is
  templated, so it's cheap to get right once and forget about.

This keeps the roster safe to invoke — including several in one turn, from
several different tagged threads — **by construction**, not by runtime
detection of "is this skill too heavy." Don't add a general-purpose or
bundled-Claude-Code skill (`/code-review`, `/simplify`, etc.) here — those
assume an interactive agent with full tool access and won't behave sensibly
invoked this way; write a narrow, purpose-built skill instead.

`example/` is a placeholder proving the scan (`GET /docloop-skills`) and
invocation (`POST /run-skill`) mechanism end to end — not a real skill.
Designing the actual roster is a separate, later decision.
