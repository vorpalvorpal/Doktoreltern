# Spike S0-a: in-place context reset in a live terminal session

Run 2026-10-06 by a sub-agent. Claude Code 2.1.291, model haiku, interactive `claude` under a
pseudo-terminal (`drive/ptyd.py`; tmux is not installed), the mod loaded with `--plugin-dir`. The
spike was stopped early at Robin's request, so several items are partly answered or not started;
section 9 lists the state of each. The sub-agent's harness refused its write of this file, so
this is its hand-back saved by the main session.

Every claim is TESTED (run name in brackets; evidence under `runs/<name>/`, mainly `mod.jsonl`)
or UNTESTED. `runs/` is 19 MB and is kept locally, not in git.

No workspace-trust dialog appeared, so no trust was accepted. The sessions were started with the
parent session's `CLAUDE*` variables removed, so they behaved like a terminal the owner opened.

## 1. Verdict

Resetting in place works in an interactive session. Four routes reset the context with no
keypress and start the next turn by themselves. A fifth form does not exist: `/rewind` takes no
argument, from the keyboard or from the mod.

| Route | How | Works unattended | Cache on the first request after a reset (36k-token state) | Engine listings afterwards |
|---|---|---|---|---|
| A | mod: `$.command.run compact`, own hook answers `{messages}` | yes, 19 resets | read 30.5k, **write 36.4k** | working directory missing on the first request; skills listing missing for the whole step |
| B | mod: `$.command.run clear`, then submit the hydrated text | yes, 32 resets | read 30.5k, **write 36.4k** | all present by the end of the step |
| C | wrapper types `/rewind`, picks the marked prompt, pastes the next | yes, 9 rewinds | **read 72.2k**, write 0.7k | the session's original first message is kept |
| D | mod: `$.command.run rewind` with an argument | **does not exist** | | |
| E | mod: `$.command.run resume <frozen base>`, `branch`, submit the unit text | yes, 28 resets, one bad step | **read 66.5k**, write 0.8k | kept when the base is the session's own start [e1]; skills listing missing when the base was built after a clear [soakE, 26 of 28 steps] |

Ranking for "one terminal session Robin watches and can interrupt, reset at every step end,
unattended for hours":

1. **A (compact with own hook)** to build first. Same session id and one transcript for the whole
   build, the in-app scrollback is kept, `claude --resume` finds the build, the reset takes about
   0.1 s, and the hold rule, message keeping and the status line were all tested on it. Its costs:
   the stable state is written to the cache again at every reset, `hydrate` must supply the
   working directory and the skill list, and it has the silent-fallback path, which the rebuild
   check caught when it happened for real.
2. **E (resume a frozen base, branch)** as the cheaper-per-step alternative once one fault is
   settled. It reads the whole stable prefix from cache, with no hook and no keystrokes. But in
   the soak the session's working directory moved to the repository root after `resume`, one step
   in 27 ran there and failed to find its script, and the branch transcripts were written into
   the repository root's project folder. Hold, message keeping and sub-agents were not exercised
   on it.
3. **B (clear, then submit)**: the simplest and has no fallback path, but the visible transcript
   is wiped at every reset, each step becomes its own session file, the cost ledger restarts, and
   it pays the same cache write as A.
4. **C (keystroke `/rewind`)**: it worked every time and has the best cache figures, but it
   depends on the menu's layout and wording, the mod cannot tell the wrapper's typing from the
   owner's, and the collision and dialog cases were not tested.

The per-step wrapper (a fresh session per step) is not needed as the primary design. Keep it as
the fallback behind the same hydrate step.

## 2. Question 1: do the routes work interactively?

- **A, `$.command.run({command:'compact'})` with a `session.compact` hook answering
  `{messages}`: YES (TESTED)** [a2, soakA]. No keypress; `$.prompt.submit({text:'continue',
  asUser:true})` right after starts the next turn.
- **A, `$.session.compact()`: allowed interactively, but useless for this (TESTED)** [a3]. It
  "runs through every hook but the calling one", so the mod's own hook is skipped and the
  engine's summariser runs: `tokensBefore 41004, tokensAfter 4182`, summariser usage 1,500 in and
  1,809 out, cost up $0.0149. The mod's rebuild check fired: `reset.FAULT ... rebuild mark
  missing from the live window`. Use `command.run`, never `$.session.compact()`, from the plugin
  that owns the hook.
- **B, `$.command.run({command:'clear'})` then `$.prompt.submit` of the hydrated text: YES
  (TESTED)** [b1, soakB]. Only the plain-text hand-over was run. `LEIT_CLEARVIA=append` and
  `=context` are in the mod and UNTESTED.
- **C: YES (TESTED)** [c1, rc1]. Section 7.
- **E: YES (TESTED)** [e1, e2, soakE]. Section 8.

## 3. Question 2: what the model has afterwards, and what the terminal shows

Secret word `ZANZIBAR-42` planted before the reset, asked for afterwards: `UNKNOWN` on A
[a1-compact-first] and on B [b1] (TESTED). Messages dumped at each turn end with
`$.session.messages({as:'api'})` (`runs/*/dumps/`).

| | A (compact) | B (clear) |
|---|---|---|
| First message after the reset | user memory, user context, date, attribution, then the hydrated text, then the `/compact` record | the same four, the `/clear` record, then the hydrated prompt |
| Environment block (working directory) | missing on the first request; re-attached during the step | re-attached during the step |
| Skills listing | **missing in all 20 soak turns** | present in all 32 |
| Agent types, deferred tools, MCP instructions | re-attached during the step (after the first tool result) | present |
| The mod's tool without ToolSearch | yes | yes |

When asked directly after a reset: on A the model answered skills `NONE LISTED`, agent types
`NONE LISTED` [a1-compact-first]; on B it named skills, all agent types and deferred tools [b1].

- **The missing working directory is a real fault (TESTED)** [a1-compact-first]. After the first
  reset the model ran `cd /Users/rjs/dev/werkbank && python3 step.py`, a directory it guessed
  from the memory file's path, and the session stopped at a permission dialog. Adding an
  `<environment>` block with the working directory to the hydrated text fixed it for every later
  run. So `hydrate` must emit the working directory and the skill list itself.
- **The mod's tool is deferred by default; a `tool.describe` hook returning `isDeferred: false`
  puts it in front (TESTED)** [a1-compact-first]. This removes the ToolSearch-per-reset the
  headless spike saw.

Terminal (the session runs in the fullscreen layout on the alternate screen, so "scrollback" is
the app's own transcript view):

| | A | B | C | E |
|---|---|---|---|---|
| Earlier steps visible by scrolling up | yes (TESTED, a2) | **no**, the view starts at `/clear` (TESTED, b1) | the rewound step is removed (TESTED, c1) | UNTESTED by scrolling |
| Visible marker | `/compact leit reset N`, `Compacted` | `/clear` | none | `Branched conversation "step-N"`, branch name on the prompt rule |
| What floods the screen | **the whole hydrated text, in full, at every reset** | the whole hydrated prompt, in full | only the unit prompt | only the unit prompt |
| Session id | unchanged | new at every reset | unchanged | new at every reset |
| Transcript files | one (8.3 MB after 19 resets) | one per reset (34 files, 18.8 MB after 32) | one (0.66 MB after 9 rewinds) | see section 8 |
| `claude --resume <id>` | finds it and resumes the post-reset state (TESTED, a2) | UNTESTED | UNTESTED | UNTESTED |

Printing 36k tokens of state on screen at each reset on A and B is the main readability problem;
a `ui.render` hook on that row might collapse it (UNTESTED).

## 4. Question 3: does the human keep control?

All TESTED on A [a2] and B [b1] unless marked; the logic is the same code for E, where it was not
exercised.

- **(a) A message typed while a turn runs is delivered into that turn**, between tool calls; not
  queued to the end, not lost. `prompt.submit` fires at Enter with `origin.kind 'composer'` and
  the running turn's `turnId`, so the mod sets hold before the turn ends and the reset is held.
- **(b) Esc mid-turn: `turn.complete` carries `reason:'aborted', isAborted:true`**, the mod
  holds, and no "continue" is submitted. **Esc at a permission dialog is different: the turn ends
  with `reason:'answer', isAborted:false`** and an empty answer [a1-compact-first, twice]. The
  signal that covers both is the transcript row `[Request interrupted by user...]` seen in
  `session.append`; the mod holds on that row.
- **Hold rule: works.** After any `composer` prompt or interrupt the mod submits nothing until
  `/go` (a mod-registered command). `/go` with a reset pending does the reset and continues.
  `/hold` is in the mod and UNTESTED. The first prompt of a session is user-typed, so the loop
  starts held and needs `/go`.
- **(c) Message keeping: works.** The mod kept the typed message and put it in the next hydrated
  text; after the reset the model quoted it (A) and answered from it (B).
- **The mod can tell its own prompt from the owner's: yes.** Its own arrives with `origin
  {kind:'plugin', name:'leit', asUser:true}`; a typed one has `{kind:'composer'}`. On route C
  this breaks: the wrapper's typing is `composer` too.
- A kept message saying "just reply ok" made the model do only that after the reset and end the
  turn without a step [b1]. The mod now nudges ("continue", twice) and then stops with a fault;
  one nudge fired and recovered in [soakA].
- Text typed while a permission dialog was up was dropped [a1-compact-first, one observation].

## 5. Question 4: soak

Planned 50 resets per route; stopped at the wrap-up with 19 (A), 32 (B), 28 (E) and 9 (C). Three
soaks ran at once and the usage-throttle hook parked most turns. Hydrated text: 113k characters,
about 36k tokens (`fixtures/big`), about 800 characters changing per step. Figures from
`drive/summary.py` (TESTED):

| | A [soakA] | B [soakB] | E [soakE] | C [rc1] |
|---|---|---|---|---|
| Resets | 19 | 32 | 28 | 9 |
| Reset time, median / max | 94 ms / 148 ms | 44 ms / 130 ms | 385 ms / 1,260 ms | 1,285 ms / 1,313 ms |
| Hydrate time, max | 6 ms | 16 ms | 5 ms | n/a |
| Compact hook time, max (limit 10 s) | 1 ms | n/a | n/a | n/a |
| Context after the step, min to max | 67.0k to 71.3k | 73.2k to 73.7k | 66.5k to 73.9k | 73.2k to 73.6k |
| First request: cache read / creation | 30,546 / 36,444 | 30,546 / 36,417 | 66,512 / 774 | 72,161 / 709 |
| Stale nonce in the live window | 0 | 0 | 0 | 0 |
| Model reported a previous nonce | 0 | 0 | 0 | 0 |
| Rebuild faults | 0 | 0 | 0 | 0 unexpected screens |
| Turns without `step_done` | 1 (nudged, recovered) | 0 | 0 (but see section 8) | 0 |
| Cost per step, haiku prices | $0.068 | $0.074 | $0.032 | $0.026 |

- No growth in context, no leak, and hook time nowhere near the limit, because the files are read
  before the compaction is requested and the hook only returns a string from memory.
- The leak check is mechanical: the step script prints a nonce that exists only in that step's
  conversation, and at every turn end the mod searches the live window for any earlier nonce.
- **The cache result decides cost.** On A and B the whole hydrated text is a new message at each
  reset, so 36k tokens are written to the cache every step; only the 30.5k system-and-tools
  prefix is read. On C and E the stable text stays in the session and is read.
- Total spent on the four soaks' post-reset turns: about $4.70 at haiku list prices.
- Not measured: 50 consecutive resets on any route.

## 6. Questions 5 and 6: faults, status line

- **5(a) slow hook: partly answered.** The detection check exists (a per-reset mark that only a
  correct rebuild contains, searched for in the live window after the compaction, plus the cost
  delta) and was shown firing on a real silent fallback [a3]. The deliberate 12 s sleep
  (`LEIT_SLOW_MS`) and the `.catch` handler that answers from memory (`LEIT_CATCH=1`) are in the
  mod and UNTESTED. The types say a `.catch` handler gets one second of grace after a timeout,
  which would close the fallback instead of only detecting it.
- **5(b) sub-agent in flight: not started.** The deferral ("no reset while `$.agent.list()` shows
  pending, running or waiting", retried every 2 s) is in the mod and UNTESTED, on every route.
- **5(c) idle: not started.** What was seen instead: usage-throttle parks inside turns, the
  longest turn 286 s [soakE], through which every loop resumed. A multi-hour usage-limit park was
  not simulated.
- **6 status line: works (TESTED)** [a2, b1, soakA, soakB]. `$.ui.status(text)` from a 2 s timer
  reading `state.json` and `$.session.usage()` showed package, unit, step, context percent, reset
  count, hold reason and kept-message count. It survived every reset on A and B and updated
  between and during turns. On E it lost the state file once the working directory had moved
  (section 8): read state by absolute path. The band above the prompt is UNTESTED.

## 7. Routes C and D: `/rewind`

- **`/rewind` takes no argument (TESTED)** [c1]. No argument hint appears; `/rewind 1`, `/rewind
  --conversation 1` and `/rewind [[CP plan]]` each opened the same menu with the cursor on
  `(current)`. The docs pages (checkpointing, commands) agree: `/rewind`, aliases `/checkpoint`,
  `/undo`, no parameters.
- **`$.command.run({command:'rewind', args})` opens the same menu and resolves `{}` at once
  (TESTED)** [c1], with or without args. The mod cannot choose an entry. **Route D does not
  exist.** Headless: UNTESTED.
- **Keystrokes work (TESTED)** [c1, rc1]. Sequence: `/rewind` Enter; Up until the highlighted row
  starts with the marker; Enter; the digit beside "Restore conversation". Menu on this version:

  ```
  Rewind
  Restore the code and/or conversation to the point before…
    [[CP spec]] Remember: ...          No code changes
    [[CP plan]] Remember: ...          No code changes
  ❯ [[CP unit-1]] Remember: ...        No code changes
    (current)
  ```
  then a confirmation with options `1. Restore conversation  2. Summarize from here  3. Summarize
  up to here  4. Never mind`. The docs say tracked file edits add two code options, which moves
  the numbers; that case was not run.
- **Finding the entry:** by matching the marker text on the highlighted row, not by counting. A
  rewound prompt leaves the menu, so the menu stayed at base plus the current step. A long menu
  was not tested.
- **After the rewind (TESTED)** [c1]: spec word and plan word known, the word planted after the
  rewind point `UNKNOWN`; skills and agent types listed; the mod's tool callable. Same session
  id, same transcript file.
- **Cache (TESTED)**: in the nested case ([spec][plan] pasted once, then rewind to just after it
  before every unit) each of 9 units read 72,161 and wrote about 709 [rc1]. The docs' claim holds.
- **Signal:** the wrapper waits for the mod's `turn.complete` line in `mod.jsonl`, not for screen
  idleness. Reliable in 10 turns.
- **Fragility seen:** the rewound prompt is put back in the input box and must be removed, and
  Ctrl-U removes one line at a time; one attempt left text behind and the next command was
  appended to it [c1]. A 113k-character bracketed paste was accepted and is printed in full.
- **UNTESTED for C:** the owner typing while the wrapper injects, holding the owner's input, Esc
  under the wrapper, a dialog at the wrong moment, other terminal widths, sub-agents across a
  rewind, more than 9 rewinds, and the wrapper's stop-on-unexpected-screen path.

## 8. Route E: `/branch`, `/fork`, `/resume`

- **`/branch [name]`** branches at the current point only; the argument is a name. It switches
  into the branch (new session id) and leaves the original intact and resumable (TESTED, c1, e1).
  **`/fork [prompt]`** copies the conversation into a new background session; hint and docs
  read, not run (UNTESTED). **`/resume [conversation id or search term]`** takes a session id.
  **None of `/rewind`, `/branch`, `/fork` takes an argument that selects an earlier point.**
- **From the mod, `$.command.run({command:'branch', args:name})` and `$.command.run({command:
  'resume', args:id})` both work, with no picker (TESTED)** [c1, e1]. Headless: UNTESTED.
- **The combination works as a reset (TESTED)** [e1, soakE]: keep a session that is never worked
  in (the base, ending just after the stable text); at each step end `resume <base>`, `branch
  step-N`, submit the unit text. In [e1] the base stayed at 5 messages across three cycles, the
  word planted in the previous branch was `UNKNOWN` each time, skills were listed, and the turn
  read 40,011 from cache and wrote about 600.
- **The base must never have been worked in.** `resume` loads the session's last written leaf,
  not a point rewound to: a base that had been rewound came back with the abandoned messages [c1].
- **Skills listing:** a base the mod built after a clear had no engine listings, and the skills
  listing was absent in 26 of 28 step turns [soakE]. A base that is the session's own start [e1]
  kept it.
- **Stack levels:** the mod rebuilds the base when the stable files change. One level was run. A
  base per level ([spec], then [spec][plan n]) is UNTESTED.
- **Fault found in the soak (TESTED)** [soakE]: the sessions ran in a sub-folder of the
  repository. After `resume`, rows of each branch transcript carry the repository root as working
  directory, and the branch transcripts were written to the repository root's project folder. In
  26 of 27 steps the working directory was back before the step ran; at step 28 it was not, and
  the step failed to find its script. Cause not investigated. Whether it happens when the session
  starts at the repository root, as a real build would, is UNTESTED.
- UNTESTED on E: hold and message keeping in action, sub-agents across `resume`, `claude
  --resume` of a step's branch, the session list after a long build, scrollback.

## 9. State of each item

| Item | State |
|---|---|
| 1. Routes work interactively | answered (TESTED): A, B, C, E |
| 2. What the model has; terminal; session id; resume | answered for A and B; `--resume` tested on A only |
| 3. Human control: typed message, Esc, hold, message keeping | answered on A and B; not exercised on E; `/hold` untested |
| 4. Soak | partly: 19 / 32 / 28 / 9 resets instead of 50; no leak, no growth |
| 5a. Slow hook | partly: detection shown on a real fallback; deliberate slow hook and `.catch` not run |
| 5b. Sub-agent in flight | not started (guard written, UNTESTED) |
| 5c. Idle | not started; throttle parks of up to 286 s per turn survived |
| 6. Status line | answered for `$.ui.status`; band untested |
| Route C keystroke `/rewind` | answered for mechanics, content, cache, signal; human-control and fragility cases not started |
| `/rewind` arguments, `$.command.run rewind`, Route D | answered: no argument, no Route D |
| `/branch`, `/fork`, Route E | answered for `/branch` and `/resume`; `/fork` not run; E has one open fault |

## 10. Awkward

1. **Saving the mod's file while a session runs reloads it and wipes its variables** (hold,
   pending reset, kept messages, reset count) (TESTED). Keep that state in `$.state`, `$.store`
   or a file.
2. **Permission dialogs are the commonest stall.** Haiku is refused auto mode, so every tool call
   outside `--allowedTools` stopped the loop at a dialog.
3. **The usage-throttle hook parks interactive turns too**; the loop waits and resumes.
4. `$.session.usage()` after a clear reports cost 0: the mod must keep its own running cost on B
   and E.
5. `claude plugin validate` refuses a hook passed as a variable declared inside `register`, and
   `$.env.get` with a non-literal name.
6. `$.clock.now()` returns a promise. The new window was readable as soon as `command.run`
   resolved, unlike in the headless spike.
7. A `turn.step` generator hook gave per-request usage; the cache figures come from it.
8. Differences from the headless spike: `$.session.compact()` is callable but skips the caller's
   hook; after a clear the engine listings do come back; the mod tool can be pinned in front; the
   baseline context is 40.7k tokens here (the owner's skills, agents and connectors), not 23k.
9. **Left behind outside the spike folder:** session transcripts under `~/.claude/projects/`, one
   folder per run named `...-spike-live-runs-<name>-work`, and 29 branch transcripts from route E
   inside the werkbank project's own folder, listed in
   `runs/stray-transcripts-in-werkbank-project.txt`. Nothing was deleted there.
10. A local `.venv` with `pyte` was created inside the spike folder for the pty driver. Nothing
    was installed globally.

## 11. What the mod must guard

- Reset only through `$.command.run`, with the files read beforehand and the hook returning from
  memory.
- After every reset on A, check the per-reset mark in the live window; on a miss stop, or fall
  back to clear (UNTESTED).
- Put the working directory, the skill list and the step's tools into the hydrated text; pin the
  mod's tool in front.
- Hold on any `composer` prompt and on the interrupt row, not on `isAborted` alone.
- Nudge, then stop, when a mod-started turn ends without `step_done`.
- Keep hold, pending and kept messages somewhere a reload cannot wipe.
- On E: read state by absolute path, verify session id and message count after `resume`, and
  check the working directory before submitting.

## 12. Tests worth running before a route is chosen

1. **E from the repository root, 30 resets, with one typed message, one Esc and one background
   sub-agent in flight.** Decides whether E replaces A as the primary route. About 30 minutes and
   under $2 at haiku prices.
2. **A with a deliberate 12 s hook, with and without the `.catch` handler.** Decides whether A's
   fallback is closed or only detected. About 10 minutes, under $0.50.

## Files

`README.md` (demo line, layout); `mod/hooks/register.ts` (the mod; `LEIT_*` switches at the top);
`drive/` (pty driver, soak and summary scripts, `demo.sh`); `fixtures/small`, `fixtures/big`;
`runs/` (evidence, local only).
