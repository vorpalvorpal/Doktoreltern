# SRE / operator review, round 2: V2-SYNTHESIS.md

Built on `reviews/sre.md` (round 1); not repeated. **Checked:** synthesis, MODULARITY, spike-f1 REPORT and
`mod/hooks/register.ts` (99 lines), `helper.mjs`, `drive/reset.sh`, spike-live REPORT §1, mods.md headlines,
sampletidy-port.md. **Measured here (M):** below. **Not verified:** anything about Remote Control beyond Robin's
observation; any R or Rust timing; `deleteSession`; how a mod is switched on per session. No spike run, no Claude
session started, nothing left running.

## Verdict
1. The module cut is good for operations: A, B, D and G can each be installed, switched off and removed alone, and
   most failures stop at a module edge. The exceptions are A (its failure is silent) and C (its failure is a stop).
2. Rung 1 is not yet a thing Robin uses next week: F1 proved the fork-and-resume mechanism, but the trigger, the
   handover turn, the in-flight cases and the undo are unbuilt, and for a plain session the gain over `/compact` is
   smaller than the draft implies.
3. The 8 GB budget for R plus Rust is unmeasured and, on the evidence here (no Rust toolchain at all), a port gate
   is a day-one setup cost, not a "few minutes".

## Measured (M)
8 GiB, 8 cores, 47 GiB free, AC; Claude Code 2.1.291; R 4.4.3 + testthat, duckdb 1.4.1, units, readxl; no cargo/rustc/tmux/ntfy;
`~/.claude/projects` 1.7 GB; F1's 11 forks 4.6 MB; SDK `node_modules` 274 MB. Full list in the appendix.

## Rung 1 as a thing used next week (module A alone)

**What F1 actually shows.** A node helper (SDK `forkSession`, 8 to 16 ms) cuts a copy of the transcript at a chosen
row; a mod then runs `resume <fork id>` and `prompt.submit`. The mod cannot fork by itself (mods.md §2: no fork API);
it polls a command file written by the helper. So rung 1 is **three parts, not one**: a mod, a node helper with a
274 MB SDK install, and a glue protocol (a command file). That is the install story, and it is heavier than "a mod".

**A day with it (proposed; items marked U are unbuilt).**
- *Install:* a plugin folder loaded by `--plugin-dir` (spike) or installed as a plugin (U, how it is enabled per
  session is not in the spike); plus `npm install` for the helper. Per-session switch: an env var read at
  `session.start` (`LEITF_*`), default off. A session started without it behaves as stock. Recommend: a shell alias
  `claude-rw` that sets the variable and the plugin dir; plain `claude` stays untouched.
- *Trigger:* context percent from `$.session.usage()` crossing a threshold (mods.md §3, documented), checked at
  `turn.complete`, never mid-turn. A command `/handover` for Robin to fire it by hand. The model asking is the weakest
  trigger (it forgets) and should not be the only one.
- *The sequence:* (1) at a turn end over threshold, submit a fixed "write the handover note to `HANDOVER.md`" prompt,
  one turn; (2) read the file; (3) helper forks at the mark; (4) mod resumes the fork and submits "read HANDOVER.md
  and continue". The note goes to a file first, so a failure after step 1 leaves the note on disk and nothing lost.
- *What the mark is, with no flow.* This is the open design point. With no flow there is no natural step boundary, so
  the mark is the session's own start (after CLAUDE.md and the first user message) or a user-set `/mark`. Cutting at the
  start keeps the cache prefix small (maybe 30k), so the cache gain over `/compact` is small: spike-live measured
  `/compact` writing 36.4k against rewind writing 0.2k to 0.8k, but on a 36k state. In an ordinary session the saving
  is perhaps one cache write of tens of thousands of tokens per rewind. **The real gain is not cache; it is that the
  summary is a note Robin and the model chose to write, and that it fires without Robin watching usage.** Say so in
  the plan, because it changes what is worth measuring (note quality, not cache bytes).
- *What Robin sees.* Terminal: the view is redrawn as the fork (F1 §2), the previous work leaves the screen, the status
  line shows the fork title. Proposed: before the cut, a toast and a one-line status "rewinding at 71%, note in
  HANDOVER.md"; after, the first line of the new turn quotes the note's path and size. Phone: Robin observed the
  Remote view followed 8 resets and read as one conversation (F1, owner's observation). Not shown: a dialog open at
  reset, hours idle, 30+ resets, reconnecting after a later fork.
- *In flight when it fires.* The F1 guard is "act only between turns", which is right but incomplete:
  (a) **typing:** a half-typed message in the input box survives or is lost on `resume` (U; spike-live found text typed
  at a dialog was dropped). Rule: the mod defers while the input is non-empty (`prompt.edit` hook, U) and says so on
  the status line. (b) **sub-agent running:** `turn.complete` fires per agent (`e.agentId`); the F1 mod ignores agent
  turns, so it could rewind with an agent still working. Defer until none is running, with a timeout and a visible
  "rewind waiting for agent". (c) **permission dialog:** a turn is still open, so deferral covers it, but then the
  threshold is never met in a stuck dialog and the session just waits; the heartbeat (G) shows it. (d) **Robin presses
  Esc during the note turn:** note may be partial; the file's existence and a trailing sentinel line decide success.
- *A bad note.* Cost is: the next turns work from a wrong or thin summary and Robin finds out late. Recovery is the
  point of the design: the fork leaves the old session on disk (F1 §4). Make **"undo the rewind" a verb**:
  `rewind --undo` resumes the pre-rewind session id (recorded as `{old id, fork id, cut uuid, time}` in one line of
  `~/.claude/leitf/rewinds.jsonl`) and submits the new note's gap ("you rewound too early, here is what the note
  missed: ..."). Caveat to test (U): resuming the old session continues its transcript, so work done after the
  fork is on the other branch; "undo" means "go back and re-summarise better", not "merge". Keep every pre-rewind
  session until Robin says otherwise; prune only forks older than N days that were never undone.
- *Upgrade breaks the mods API.* The API is early access (mods.md §102; reference "may change"). Failure modes:
  the plugin fails to load (Robin sees nothing: stock Claude, no rewinds, and the threshold is never acted on),
  or an API call rejects (the F1 mod's `settle` wrapper logs it). Defences in order of cost: pin the version and
  turn off auto-update for the rewind alias; the mod writes `rewind-heartbeat` at `session.start` and each turn
  end, and a 20-line check run by the alias (and by G) says "mod not loaded in claude 2.1.29x" at launch; a
  version table in the plugin (`tested: 2.1.287-2.1.291`) logged at session start with a toast on mismatch.
- *Manual fallback.* `claude-rw` unloaded, Robin types `/compact` as today, or runs `leitf handover` (a helper
  command that does steps 1-4 by SDK against a stopped session: `forkSession` plus `claude --resume <fork>` with the
  note as first prompt). The second fallback needs no mod and is the thing to build first, because it is the same
  helper and removes the early-access dependency from the *data* path.

## Operating A to H separately (detail and table in the appendix)
- A fails silently (mod not loaded); it is the worst boundary, and G is its only detector. B and C share one write path, so one hung
  git or stale lock stops both; C is a policy, not a process, so "off" means the agent may edit Robin-owned items. D, E (disposable
  worktree) and G (separate process) are genuine failure boundaries. F shares B's schema file, so a pack edit can break lint.
- Each module leaves: A forks (0.4 MB each, picker clutter) and `rewinds.jsonl`; B store commits; E worktrees; G heartbeat files.
  All can be switched off mid-job except that C off is a policy change. Cheapest fix: one `events.jsonl` line per action and
  `leitf doctor` reporting the last event per module.
## Watch (G), smallest standalone cut (detail in the appendix)
Notify-only, about 60 lines. The mod writes a heartbeat (pid, session, state, last tool, agents running, context %). Rules: "waiting
for you" = idle over 2 min or a flagged dialog; "working" = heartbeat under 60 s and a tool event within 5 min; "dead" = pid gone, or
heartbeat stale over 5 min (say which); plus "probably a dialog" = turn open, no tool event for N min, no agent. Delivery: osascript
and status line; a phone push needs Robin's choice of ntfy/Pushover/iMessage (none installed). Its own dead-man: a launchd check.
Never relaunches or sends keys at this rung.

## The store in daily use (B) (detail in the appendix)
- Its own repository, not the product's: commit-per-write interleaves with product commits, worktrees see other state, a product
  `git clean` could wipe it, and it must not sit in a OneDrive Files-On-Demand folder. One writer (CLI, lock, temp-fsync-rename);
  sub-agents read-only, denied by `tool.check`. Lint on read: a hand-edited bad file is reported and rendered with a marker.
- Will notes get used? I doubt it unless writing is one command, `render` is what the next session reads, and it holds only
  questions and decisions. Test for a week with three kinds; if `render` is not read, drop B from rung 2; do not build C for it.
## Tests and gates on an 8 GB laptop (§6) (figures in the appendix)
- Measured: R 4.4.3 with testthat, duckdb 1.4.1 (prebuilt), units, readxl installed; no cargo, rustc, duckdb CLI, tmux, ntfy.
  The R side can run here today; the Rust side starts with a toolchain install and a bundled-DuckDB cold build (est. 5 to 15 min,
  2 to 4 GB peak). R suite est. 5 to 15 min full, seconds per file. Run R and Rust serially; R + build + Claude Code sits at the
  edge of 8 GB. The corpus tier (265 files, ~1.9 GB hydrated) stays off the loop. Budgets T0 30 s, T1 5 min (R) or 10 min (both,
  warm). Measure first (half a day), then budget. If the port is dropped the Rust budget vanishes: the language decision matters most.
## The scheduler, from the operator's side (§4)

At **Advisor** strength, `next` prints a ranked list; the model may depart.
- *What Robin sees when the model departs.* Nothing, unless it is made visible. Spec: `next` writes
  `{ranked top 3, time}` to the event log; each step record names the item chosen; a departure is one status-line
  token (`off-list x2`) and a line in the end-of-run report. If departures are more than about one in three, the
  gauges or the model are wrong, and that is itself the signal Robin acts on (Q20's cheapest evidence).
- *A stale gauge in operation.* Confidence is an evidence ladder; a stale one is an item whose last evidence is older than
  the code it describes (a slice changed, its "implemented and tested" rating stayed). Operationally this looks like
  `next` repeatedly recommending the thing just finished, or never recommending an untouched risky area. Defence: each gauge
  stores the commit it was raised at; `render` marks "stale (3 commits behind)"; confidence falls one rung when the
  underlying files change (the suspect-link idea from doorstop already in B). Without that, the advisor is a
  recommendation engine reading its own old notes.
- *Cost to run:* a 275-line Python script (v1); runs in milliseconds; the cost is **keeping gauges true**, which is Robin's or
  the model's attention. My view: adopt **Habit** now (two lines in the rules card), count its use in the end-of-run
  report; do not build **Advisor** until the notes/slice runs show the model picking badly. The gauges as store fields are
  worth having for the report regardless (§4's own point).

## Open questions

**Answerable from my lens.**
- Q2 (route F stable on early access): it is as stable as the mods API; so keep the helper-only fallback and a
  version table (above). A week without it looks like stock `claude` with `/compact`, which is today.
- Q4 (how often): at a context threshold only, plus manual `/handover`. Per-step belongs to the flow pack.
- Q10 (store location): its own repository.
- Q11 (notes bounded): lint a render token budget; one note per decision or question, none for findings.
- Q13 (git is the log): enough, if the store has its own repo; immutable per-dispatch records matter only with workers (E).
- Q28 (budgets realistic): R yes; Rust and both-at-once unproven (§ above); serial only.
- Q38 (one repo, two languages): possible for the gate; the memory plan is serial runs and one shared `target/`.
- Q42 (rung 1 too thin?): not thin, but its value is the handover note, not the cache; make that the thing measured.

**Missing, add.**
- Q45. What does Robin do when the rewind note is wrong? (undo verb; see above)
- Q46. How is "the mod did not load" noticed? (version table, launch check)
- Q47. Does the phone follow after an Esc, a dialog, or hours idle? (the rest of F1's untested list)
- Q48. Is the store allowed in a cloud-synced folder? (no)

**The three that matter most:** Q2/Q46 (does early-access fail loudly?), Q45 (recovery from a bad handover), Q28
(does the port gate fit 8 GB?). Q1 (does residency stay cheap) is more important in the large but cannot be answered
before rung 1 has been used.

## Rung 1: what I would build first
1. `leitf handover`: the SDK helper alone, no mod: fork at the session's first user message, print the resume command, note from `HANDOVER.md`. Usable the same day.
2. The mod: `/handover` command, threshold check at turn end (deferred while typing or an agent runs), heartbeat file, version table, `rewinds.jsonl`.
3. `rewind --undo` and the notify-only watcher (three states plus "probably a dialog").
4. Then the 30-reset test with a typed message, an Esc, a sub-agent and a dialog in flight.

## MUST-fix (at most 4)
1. **Add the in-flight cases and the undo verb to rung 1's definition (§8).** Typing, sub-agent, dialog, Esc: defer, never act. Record `{old id, fork id, cut}` so undo exists. Cost: a day.
2. **Make a mods-API failure loud and keep a helper-only path (§9 Q2).** Launch check, version table, `leitf handover` without the mod. Cost: half a day.
3. **Measure before budgeting (§6, Q28).** R suite time and peak RSS on three test files, plus a Rust-with-DuckDB cold build, before the plan states any time budget for a port. Cost: half a day.
4. **Give G a flow-less spec (§3 G):** three states plus "probably a dialog", notify-only, and its own dead-man check. Cost: a day.

## What must survive
The two-verbs contract for A; "lower modules never name higher ones"; the fork leaving the old session on disk (it
is the undo); one writer for B; "a gate result is a finding, not a stop"; the throttle as intended pacing; and
the instinct to leave undecided questions undecided: none of the above needs them settled.
