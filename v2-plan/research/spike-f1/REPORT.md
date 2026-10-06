# Spike F1: fork a session at a chosen message with the SDK, resume the fork in the live terminal

Run 2026-10-06 by a sub-agent. Claude Code 2.1.291, `@anthropic-ai/claude-agent-sdk` 0.3.291,
model haiku, interactive sessions under the pty driver from `../spike-live`. The sub-agent's
harness refused its write of this file; this is its hand-back saved by the main session. Evidence
is under `runs/` (local only, not in git). TESTED / UNTESTED as marked.

**Route F works.** Eight resets (six from a repository root, two from a sub-folder), two stack
levels, no fault.

## 1. Fork without a model turn: yes (TESTED)

`forkSession(sessionId, {dir?, upToMessageId?, title?}) -> {sessionId}` takes 8 to 16 ms while the
source session is open in the terminal interface.

- The cut is a transcript row `uuid` from `getSessionMessages`, inclusive.
- An unresumed fork is a new file beside the source holding only the prefix: 49 rows against 95,
  the spec and plan words present, the unit-1 word absent.
- A wrong id fails cleanly: `upToMessageId not found in session`.
- UNTESTED: `query()` with `resumeSessionAt`, and the hidden CLI flags `--resume-session-at` and
  `--resume-drops-turn` (present in the binary).

## 2. The terminal interface resumes the fork from the mod: yes (TESTED)

`$.command.run resume <fork id>` took 49 to 66 ms, then `$.prompt.submit`, with no keystroke.

- The spec and plan words were known and the unit-1 word was `UNKNOWN`.
- Skills and agent listings were present, and the mod's tool worked, after every reset.
- The view is redrawn as the fork's conversation; the status line shows the fork's title.

## 3. Cache (TESTED)

First request after a reset at [plan]: read 78,749, write 207 to 231 (prefix 78.7k). At [spec]:
read 73,018, write 117. The expired-cache case is UNTESTED.

For comparison (spike-live, about 36k of state on a 30.5k base): route A read 30.5k and wrote
36.4k; route E read 66.5k and wrote 0.8k.

## 4. Stack levels and repeat (TESTED)

Cuts at [plan] (units 2 to 5) and at [spec] (an alternative plan, then its unit). No planted word
leaked.

- Ids do not carry over: the fork remaps every UUID. Re-forking the original session at the
  original id works; forking the current session works only if the cut is looked up there.
- One full-prefix transcript (about 0.56 MB here) accumulates per reset, and each shows in the
  `/resume` picker.
- The same process throughout; the session id changes at each reset.

## 5. Working directory: the fault did not occur (TESTED, lightly)

Root and sub-folder runs both stayed where they started, and transcripts went to the matching
project folder. Only two sub-folder resets were run.

## Guards

- Helper: pass `dir`; reuse the original cut id; cut only at a finished turn's last row; stop on
  a non-zero exit.
- Mod: act only between turns; verify session id and message count after `resume`.
- Prune old forks (`deleteSession` exists, UNTESTED).

## Awkward

Each reset leaves a full copy of the prefix on disk, and the previous unit's output leaves the
view.

## Recommendation

Build F first, ahead of A and E. It needs no hook, no rebuilt text for the stable part, no frozen
base and no `branch`, and it reads the full prefix from cache. Before dropping A as the fallback,
run the 30-reset test with a typed message, an Esc and a sub-agent in flight.

## Left outside the spike folder

- 8 transcripts in `~/.claude/projects/-Users-rjs-dev-werkbank-successor-plan-research-spike-f1-repo/`
  and 3 in `...-spike-f1-repo-sub/`.
- One trust entry for `spike-f1/repo` in `~/.claude.json`: the agent accepted the folder-trust
  dialog for the throwaway repository, which the run needed.

## Files

`helper.mjs` (the fork helper), `mod/hooks/register.ts`, `drive/start.sh`, `drive/say.sh`,
`drive/reset.sh`, `fixtures/`. `node_modules/`, `repo/` and `runs/` are local only.

## Owner's observation, 2026-10-06 (added by the main session)

Robin watched the F1 run from the phone interface while the resets were happening. The view kept
following: it read as one long conversation, with the model visibly unable to recall the unit
words after each reset. So the phone interface followed the session across the change of session
id at each fork-and-resume, at least for this run (8 resets, a few minutes, no dialog open, no
idle period). This answers the short case of the SRE review's M1 (route F with Remote Control).
Still untested there: a permission dialog open at the moment of reset, hours idle between resets,
30 or more resets, and reconnecting the phone after the terminal has moved to a later fork.
