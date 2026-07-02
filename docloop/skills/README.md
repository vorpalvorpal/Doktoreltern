# docloop skills

Skills registered under the `docloop` plugin are invoked **live**, synchronously,
while a human is mid-edit in the docloop GUI — see `docloop/vite.config.ts`'s
`POST /run-skill` and the Claude Agent SDK invocation it wraps (`skills:
['docloop:<name>']`, `tools: []`, `permissionMode: 'dontAsk'`).

Because of that, every skill here must be:

- **Quick.** A human is waiting on the result inline while composing a comment.
- **Self-contained: text in, text out.** No filesystem/Bash access is granted
  (`tools: []`) — a skill can only produce a final text response, nothing else.
  Design each skill's prompt to end with exactly the text that should become
  the result (replace the anchored span, or the comment reply) — no free-form
  assistant prose to parse back out.
- **Non-mode-changing.** No `EnterPlanMode`, no spawning subagents, nothing
  that expects a back-and-forth the live-invocation bridge can't provide.

This keeps the roster safe to invoke — including several in one turn, from
several different tagged threads — **by construction**, not by runtime
detection of "is this skill too heavy." Don't add a general-purpose or
bundled-Claude-Code skill (`/code-review`, `/simplify`, etc.) here — those
assume an interactive agent with full tool access and won't behave sensibly
invoked this way; write a narrow, purpose-built skill instead.

`example/` is a placeholder proving the scan (`GET /docloop-skills`) and
invocation (`POST /run-skill`) mechanism end to end — not a real skill.
Designing the actual roster is a separate, later decision.
