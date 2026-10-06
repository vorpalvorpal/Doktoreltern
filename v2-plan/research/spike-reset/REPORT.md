# Spike: programmatic context reset from a Claude Code mod

Run 2026-10-06 by a sub-agent. `claude --version` printed 2.1.290; the sessions reported
`$.session.version()` = 2.1.291. Every test session used haiku, headless (`claude -p`), with the
mod loaded by `--plugin-dir`. The sub-agent's harness refused its write of this file, so this is
its hand-back saved by the main session, lightly trimmed.

Each claim is TESTED (run name in brackets; evidence in `logs.tar.gz` as `logs/<name>.mod.jsonl`
and `logs/<name>.stream.jsonl`) or UNTESTED.

## Verdict

A mod can do the reset unattended in plain `claude -p`, but not by the route the doc survey named.

- `$.session.compact()` is refused in headless. `$.command.run({command:'compact', args})` works.
- A `session.compact` hook that answers `{messages:[...]}` without calling `next` replaces the
  transcript with what it built, in 4 ms, with no model call.
- `$.command.run({command:'clear'})` works and is a true clear.
- `$.prompt.submit` from inside the `turn.complete` hook keeps a plain `claude -p` process alive
  and starts the next turn. A loop of four model-requested resets ran to completion unattended.

Three things need guarding: a slow hook silently falls back to the engine's summariser and leaks
the old context; the engine's start-of-conversation reminders are not put back; a plain `-p`
process exits at turn end, so a timer set after `turn.complete` never runs.

## Files

- `mod/` — the mod. Behaviour is chosen by `SPIKE_MODE` flags listed at the top of
  `hooks/register.ts`.
- `run.sh` (plain `-p`), `run-stream.sh` (`--input-format stream-json`, stdin held open),
  `run-tty.py` (interactive under a pty), `show.sh` (condensed view), `fresh.sh` (restore fixture).
- `work/checkpoints/{package,unit}.md` — checkpoint fixtures; the session's cwd is `work/`.

Headline run:

```
SPIKE_NEXT="What is the secret word I told you earlier? ..." ./run.sh t2-carry compact,inline,own,cmd,dump,carry \
  "The secret word is ZANZIBAR-42. Reply with just: noted." </dev/null
```

## The eight questions

### 1. `$.session.compact()` with no human, in `-p`: NO (TESTED). `$.command.run compact`: YES (TESTED)

- [t1] From a `$.clock.after` timer after `turn.complete` in plain `-p`: the session had ended;
  the timer ran after `session.end` and failed (`no session is bound in this process`).
- [t1b, t1c] Called inside `turn.complete`, and from a timer in a held-open session: both rejected
  with `$.session.compact: not available in a headless (-p / SDK) session yet: compaction here
  runs inside a turn (a /compact prompt); catch it and carry on`.
- [t2-slash] `$.prompt.submit({text:'/compact ...'})` is rejected by a host check.
- [t2-cmd, t3-core] `$.command.run({command:'compact', args})` works in plain `-p` from inside the
  `turn.complete` hook; the stream shows `compact_boundary` with `trigger: "manual"`. It also works
  from a timer in a held-open session [t4-watch].
- Interactive `$.session.compact()`: UNTESTED. The pty run [t1-tty] stopped at the workspace-trust
  dialog, which was not accepted because it would write to user config.

### 2. Hook replaces the result with its own messages: YES (TESTED)

[t2-cmd, t2-dump] The hook returned one user message (checkpoint files plus an instruction).

- Turn 1 planted `ZANZIBAR-42`. After the reset the model answered `UNKNOWN` and listed
  `PKG-MARKER-ALPHA`, `UNIT-MARKER-BRAVO`, which exist only in the checkpoint files. Control with
  the engine's own summariser [t3-core]: the model answered `ZANZIBAR-42` and saw no markers.
- What the model receives afterwards [t2-dump]: one user message holding three engine reminders
  (user context, date, commit attribution), the hook's text, the `/compact` command record (about
  100 tokens the hook cannot suppress), then the next prompt.
- `usage()`: before, 23,170 tokens (12%). Right after the reset, tokens and percent are absent or
  stale. After the next response, 18,994 (9%). `compact_boundary`: `pre_tokens 23251, post_tokens 102`.
- The drop below the starting size is the missing reminders (Awkward 2). With them carried over
  [t2-carry]: `post_tokens 4239`, next response 23,425 tokens.

### 3. Model asks for the reset through a mod tool and keeps going: YES (TESTED)

[t3-loop] `$.tool.register({name:'checkpoint_reset'})`; the `tool.call` hook only records the
request; `turn.complete` runs the compact and then `$.prompt.submit`. Plain `-p`, one prompt.

- Five turns in one process, four resets, then `PACKAGE DONE`, exit 0. Context stayed between
  24.3k and 28k tokens. Each reset took about 20 ms. Session cost $0.16.
- The registered tool is deferred: the model had to call `ToolSearch` before every use, after
  every reset, and knew to only because the deferred-tools reminder was carried over.
- The first turn took 560 s wall for 11 s of API time; cause not in the logs (assumed to be the
  usage-throttle hook).
- A bug in the first `carry` version grew the carried block by about 900 characters per reset
  (it re-copied its own rebuilt message). Fixed: capture once.

### 4. Mod triggers the reset itself: YES for both (TESTED)

- Threshold [t4-threshold]: `usage().context.percent >= N` at `turn.complete` fired on two
  consecutive turns. `percent` is valid at `turn.complete` and absent right after a reset.
- File change [t4-watch]: a 500 ms poll of the checkpoint file's mtime. Needs a session that stays
  alive while idle (`--input-format stream-json`, stdin open). No file-watch event was found.
- UNTESTED: `command.run compact` while a turn is running.

### 5. `$.command.run({command:'clear'})`: a true clear (TESTED)

[t5-clear] `conversation_reset` in the stream; `session.end` with `reason:'clear'`; new session
id; 0 rows; cost ledger zeroed; the mod's module variables survived. Nothing is re-injected
afterwards, so the mod must put the checkpoints into the next prompt. `$.session.append` after a
reset is UNTESTED. No rewind route was found.

### 6. Background sub-agents across a reset (TESTED for compact, UNTESTED for clear)

[t6-agents] The agent showed `running` before and after the reset. Its completion arrived later
as a notification and started a turn; the model got the result but had no memory of why the agent
was launched. So either write every in-flight dispatch into the checkpoint, or do not reset while
`$.agent.list()` shows anything running.

### 7. Cost: a hook-answered reset uses no model tokens (TESTED)

| Variant | Reset itself | Session cost across the reset | Next turn's request |
|---|---|---|---|
| Hook answers, no carry [t2-cmd] | 4 ms | $0.002721, unchanged | cache read 17,916; creation 1,068 |
| Hook answers, reminders carried [t2-carry] | 4 ms | unchanged | cache read 17,916; creation 5,499 |
| Engine summariser [t3-core] | 15.6 s | $0.002706 to $0.01329 | cache read 17,916; creation 3,815 |
| `clear` [t5-clear] | instant | ledger reset to $0 | cache read 17,916; creation 950 |

In every variant the 17.9k system-and-tools prefix is still read from cache; only the rebuilt
conversation layer is written.

### 8. Awkward

1. **Fail-open leaks the old context** (TESTED, [t8-slow]). With a 12 s sleep in the hook, the
   hook was abandoned and the engine's summariser ran: the model answered `ZANZIBAR-42` after the
   "reset", and `command.run` still resolved `{}`. Guard: read the files before calling
   `command.run`, keep the hook free of I/O, and check afterwards (for example, that cost did not
   move); treat a miss as fatal.
2. **Engine reminders are not put back** (TESTED, [t2-dump, t2-nocarry, t5-clear]). After a
   hook-answered compaction or a clear, the reminders listing environment, deferred tools, agent
   types, MCP instructions and skills are gone; the model said `NONE LISTED`. The engine's own
   compaction does re-attach them. The mod can copy them from `messages({as:'api'})[0]` before
   the first reset [t2-carry], which is a fragile pattern match.
3. **Plain `-p` exits at turn end** (TESTED, [t1]). Reset inside the `turn.complete` hook.
4. **`command.run` resolves before the compaction is installed** (TESTED): `messages()` and
   `usage()` are briefly stale. A prompt submitted next still runs after it, in order.
5. **`$.session.messages()` is the whole stored transcript**, not the live window (TESTED).
6. **`$.clock.now()` returns a promise** (TESTED).
7. **Docs versus behaviour.** "`$.session.compact` callable between turns" is false in headless on
   this build. The slash-prefix check on `$.prompt.submit` is undocumented. The API is early access.
8. `claude plugin validate` warns "gating hook without .catch" on these hooks. UNTESTED whether a
   `.catch` handler can still answer with its own messages after a timeout.

## The sub-agent's recommendation

Use a thin outer loop that starts a fresh `claude -p` per step from the checkpoint files: the
context is right by construction with every reminder present, there is no fail-open path, and it
uses only the stable CLI. Keep a small mod inside each step for the "step done" signal, a
context-percent guard and tool gates. Choose the in-session reset only if one long-lived session
is wanted. The outer loop itself was not built (UNTESTED as a loop).

Robin's answer the same day: one live session matters. The scoping draft therefore takes the
in-session reset as primary and keeps the outer loop as the fallback behind the same hydrate step.
