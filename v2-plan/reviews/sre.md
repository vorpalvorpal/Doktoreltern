# SRE / operator review of SCOPING-DRAFT.md

No spikes run. **Checked:** the draft, evidence-auditor.md, spike-f1 REPORT, spike-live REPORT §§3-6, 10, 11, v3-segments.md, werkbank-evidence.md
§5. **Measured here:** 8 GiB RAM; 46 GiB free of 228; `~/.claude/projects` already 1.7 GB; `cargo`, `sccache`, `cargo-nextest`, `cargo-mutants`
not installed. Rust times and sizes are estimates (est.). **Not verified:** Remote Control behaviour; how the throttle hook marks a park.

## Verdict
1. Observable while it works, but nothing catches the commonest unattended stops: a permission dialog, a dead or sleeping process, a park
   nobody can tell from a hang. 2. Its foundations, route F and a Rust+DuckDB gate loop on 8 GB, have run 8 times and 0 times, never as Robin
   will use them. 3. All five MUSTs are cheap and fit in S0/S1.

## MUST-fix (5)

**M1. Test route F as Robin will use it before building on it (§4.2, §7 F2).** Add: (a) **Remote Control**: F gives a new session id at
every reset (F1 §4); whether an attached phone follows the fork, drops or shows the old one is unknown, and decides whether "from his
phone" exists; (b) a permission dialog open at reset, and one from a sub-agent; (c) 3 to 6 hours idle, then a reset (cache cold); (d) hold,
`/go`, a typed message and Esc on F (tested only on A and B); (e) saving the mod file mid-session (wipes variables, spike-live §10.1).
Cost: a day, a few dollars of haiku. If (a) fails, route A (one session id) becomes primary on operability grounds.

**M2. Specify the watchdog (§10, new §4.5), with a size cap** (below). §2 marks "relaunch after crashes" and "usage-limit parking" as still
applying. Cost: about 100 lines plus a mod heartbeat; a day.

**M3. Permission posture and stall detection are S1 work (§4.2, §10).** Spike-live §10.2: dialogs are the commonest stall; Esc at one
does not report as an interrupt; text typed at one was dropped. Change: an allowlist generated from `flow.toml` per role; `lst preflight`
drives each allowed command once; the heartbeat flags "turn running, no tool event for N minutes, not parked", pushed as "probably a
dialog". Cost: half a day, plus a day finding gaps.

**M4. Resource plan; S0-b before S1 (§5.4, §6, §7).** One cargo process tree at a time, enforced by a lock in `lst gate`, not by the model;
one shared absolute `CARGO_TARGET_DIR`; parallel worktrees deferred (werkbank's parallel gain was about 6%, §1.1). S0-b records peak
RSS, swap, cold and warm time, target size, DuckDB bundled against prebuilt, and `cargo-mutants --in-diff` (it builds in a scratch copy and
may rebuild DuckDB there, est.). Cost: half a day. Without it "T1: a few minutes" is a guess on a machine that can swap.

**M5. Where the checkpoint lives and who writes it (§4.1).** Keep `leitstand/` out of the product branch and worktrees: its own small git
repo, `lst` committing after each write, found by absolute path. Writes are temp, fsync, rename under a file lock; ids come from `lst`
under that lock; `spec/index.toml` is generated. Ship `lst doctor`, `lst edit`, `lst restore` in S1. Evidence: evidence §5 (a typo parked
run 14; hand-built rows dropped 85 fields; many stale-state bugs). Cost: one to two days in S1.

## SHOULD-fix
- **Per-unit usage budget, not wall caps (§5.2):** after N rounds or X tokens a unit becomes `blocked` with a question and `lst next`
  moves on (v8 D28). Record time by state (running, parked, held, waiting) so "usage is time" is reported.
- **Fork pruning:** keep the last 3 and any from a faulted step; log each fork id first; `deleteSession` is untested. Disk is fine (about
  1-3 MB per fork, est.), the `/resume` picker is not: title forks `leit <pkg>/<unit>/<step> <n>`, have `lst` print the id to resume.
- **Pin and vendor** borrowed skills (copy in, with a hash); bound notes (lint over a hydrate token budget); AC power and
  `caffeinate -dimsu -w <pid>`. Add a per-step intent record (`lst step begin`: unit, step, base commit, worktree, session).

## A build, hour by hour: where it stops

- **H0-1.** The loop starts held; `/go`; it stops at an unlisted tool dialog (M3). First `cargo check` with DuckDB: bundled DuckDB
  compiles C++ for many minutes and gigabytes (est.); a second cargo (worktree, mutants, T3) beside Claude Code, the mod and
  Python on 8 GB means swap, then an OS-killed `rustc`, and the orchestrator may "fix" code for a memory fault. `lst gate` must
  class a signal exit as `infra`, retry once serially. About 6 resets per unit: the previous unit's output leaves the view
  (the fork *is* the conversation), so give Robin `lst log` (one line per step) and one seam line per reset.
- **H3-6.** Mutation on the diff: time is mutants times (rebuild+test), with a DuckDB link per test binary. Likeliest
  "too slow" point. Needs `--jobs 1`, a per-mutant timeout, a cap per unit with the remainder reported; one integration
  test binary per crate; `debug = "line-tables-only"` (est., verify).
- **H6.** Usage limit parks the turn for hours (never simulated; longest seen 286 s). Nudge timers, the no-progress alarm and the
  deferral retry must not count parked time; Robin must see "PARKED until HH:MM". After an hour the cache is cold (about 80k tokens).
- **H7+.** A turn ends with a sub-agent running: `step_done` is refused and retried every 2 s; if the orchestrator forgot the agent
  this is a silent livelock (show "reset deferred for agent X, 40 min", then time it out). Overnight: sleep, a kill, an
  update-then-restart go unnoticed; a spec question parks its package, others continue until all park, then silence unless
  pushed (M2). A hand-edited stellwerk changes the gates under the build: pin it.

## Crash and resume

Killed mid-step: restart **held**; `lst recover` prints step, base commit, dirty files, last gate; default ruling is discard and redo
(`lst step abandon`). Killed between `resume` and `submit` on F: state holds `reset pending {level, cut, fork}` first; on restart finish or
abandon. Sleep: `caffeinate`, a live PID means no restart. Reboot: notify only. Usage limit: nothing to do; heartbeat says `parked`.

**Redo, not resume.** werkbank's resume took 8 or more releases because the driver resumed in the middle of arbitrary steps
(evidence §5). A step here is at most about 45 minutes in a disposable worktree branch from a recorded base commit, so abandoning it
costs one step. Extend S1's random-kill test: between `lst unit done` and the commit, during a fork, during an atomic write.

### Watchdog: the minimum, and what keeps it from becoming a driver

It does four things and knows nothing about flow, units or findings:
1. **Reads** `run/heartbeat.json` (mod writes it every 2 s): pid, session id, mode (`running|held|parked|dialog?|waiting-robin|
   reset-pending`), last `step_done`, claude version. Stale heartbeat with a live pid means the mod is gone (also how a withdrawn mods
   API is seen): **notify, never kill**.
2. **Notifies** Robin (ntfy, Pushover or iMessage to self) on: process dead, heartbeat stale 10 min with no park marker, a spec question
   filed, all packages parked, disk under 10 GB, park start and end, run finished; one per event class per 4 h.
3. **Wraps** the launch: tmux, `caffeinate`, pinned `claude`, auto-update off.
4. **Relaunches** only if: Robin set `unattended`; the process vanished or exited non-zero; under 3 restarts this hour; claude version
   unchanged. It starts the session **held** with the recovery prompt (`lst recover`); the orchestrator rules on the half step; the mod may
   `/go` after that only if `unattended`.

Forbidden (the line between a watchdog and a driver): choosing the next unit, retrying a step, editing state,
clearing a hold, killing a gate, reading findings. One file, tripwire 150 lines. What to do after a crash lives in
`lst recover` and the orchestrator, both testable without the watchdog.

## The reset (§4.2) as an operator

Cut ids are valid only in the session they were read from (F1 §4): record (session id, message uuid) together; re-derive after a restart
from the mod's marker row. Kept messages on F belong to the fork being left: keep them on disk, deliver in the new fork's first prompt. If
the mods API is switched off, resets and guards vanish silently; the heartbeat makes it a push. Cheaper fallbacks than route G: A, or stock
`claude` with `lst hydrate` pasted by hand.

## What Robin looks at, and where
- **Status line**, add to the draft: mode (`RUNNING | HELD by you | PARKED until 14:40 | WAITING Q-003 | DIALOG? |
  RESET`), time since last `step_done`, hydrate tokens, forks kept, disk free, restarts. If Remote Control does not
  show mod status lines (unknown, M1a), the same text is `lst status` and the watchdog push.
- **A spec question from the phone:** the push carries Q id, title, options A/B/C, recommendation; Robin replies `Q-003 B`; the mod keeps
  the message across a park or reset; the orchestrator calls `lst decide`. A question not answerable by a letter and a sentence is badly
  formed. Reminder after 4 h, then daily.
- **Stop:** typing sets hold, which stops new work only; gates and sub-agents keep going. Define `stop` as hold, list what runs,
  offer `kill gates`; for a wedged session `touch run/HALT` over ssh, honoured by mod and watchdog.
- **Stuck six hours:** heartbeat stale 10 min with no park marker; no `step_done` in 3x the median step; all packages parked.
- **End-of-run report:** `lst report` from ledger and state, not the model: units, attestations, rounds, tokens and time by state,
  questions, harness issues, crashes, forks left. The run review (§5.5) adds proposals; this part is arithmetic.

## Resources (8 GB), upgrades, rollback

Debug links with DuckDB are per test binary: many integration files mean many large links and a big target (several GB, est.;
three private target dirs take half the free disk). Skip sccache until measured (no link caching). DuckDB prebuilt library (est.;
verify `DUCKDB_DOWNLOAD_LIB`) against bundled: decide in S0-b. Pin a venv and a stellwerk commit for the Python gates. Watchdog pushes
at 10 GB free, the mod holds at 5 GB; summarise then delete `mutants.out`; keep 20 gate logs. `lst gate` waits on `memory_pressure`.

**Upgrades and rollback.** Auto-update off (verify the setting), a named binary, `claude --version` recorded in state, the old binary kept; the watchdog refuses
an unattended relaunch on a version mismatch. Upgrade, SDK lock (0.3.291 used) and skill re-pins happen only at a package boundary,
acceptance fixture first. Tag both repos per package; files carry `schema = N`; `lst migrate`. Rollback is checkout, `lst doctor`.

## The checkpoint files (§4.1)

- **Hand-edit:** TOML with `toml_edit` is right (comments survive). But werkbank's parked run was a TOML escape typed by a model
  (`worker\'s`), so the claim is "only `lst` writes; hand edits go through `lst edit <id>`" (copy to `$EDITOR`, validate, refuse if invalid,
  write atomically, commit, mark dependent cuts stale). A bare editor save is caught by `doctor` and a hash check at the next reset.
- **Half-written, merges:** atomic rename rules out torn state files; `usage.jsonl` has one writer. One item per file merges cleanly
  for different items, not for the index (generate it), an id counter (lock), notes (one file per note) or `state.toml` (one writer);
  state outside the product branch (M5) removes the merge.
- **`lst doctor`** (read-only unless `--fix`): files load; ids unique; index matches; each `done` unit's commit is an ancestor and its
  attestation names that tree; cut hashes match; `in_progress` steps listed for `recover`; worktrees match state; notes and hydrate within
  budget; claude, sdk, stellwerk and skill pins match; disk and memory. One phone screen. Safe fixes: delete tmp, regenerate index,
  `lst restore <file> [--rev]`. It never invents state.
- **A file fails to load:** `hydrate` refuses, names file and line, holds, pushes; it must never skip a broken file. **Slots nobody
  listed** (evidence §5): intent record, reset-pending record, hold flag, kept messages, unfiled answers; a crash loses them unless
  they are files. Add them to §4.1.
- **Format:** keep TOML; SQLite would suit findings and the ledger past a few hundred rows but is not hand-editable.

## The flow (§5): what stalls or loops, and what would be easier to run

Most likely to stall or loop, in order:
1. **Test audit with the test writer:** an auditor with no code always finds something; cap at two rounds, then one ruling.
2. **Tests before code need code that compiles.** In Rust a test naming a missing type fails to *compile*, not "for the right reason". Add a
   **stub step** (signatures with `todo!()`; tests compile, fail by panic): likeliest first stall in S2; the unit plan carries signatures
   and `lst lint` checks them against the stub. 3. **Fix loop:** fixes cause defects (§1.3); keep the two-cycle rule, add the usage budget.
4. **Mutation on the diff** (unbounded time). 5. **Spec questions parking packages:** add a **question sweep** and go/no-go at the end
   of planning. 6. **T3 "on idle"** collides with one build at a time: run at package ends. 7. **Gestalt and release audits** have the
   biggest contexts; a park and a dialog most likely coincide there.

**Unit size and order.** Unit = at most about 45 minutes, one crate, one worktree branch, one commit, one attestation: the redo granule,
about 6 resets, and what fits on a phone. **Walking skeleton first:** one thin slice through every layer and tool (read input, write one
DuckDB row, T0/T1, mutate, audit) in the first hours, exposing link time, permissions and toolchain faults before 40 units exist; the
cheapest test of "too slow or too dear". **Serial by default** (6% gain; one build at a time). **A pre-flight boundary** between plan and
build: `lst preflight` (toolchains, allowlist dry run, disk, AC, test notification, `lst doctor`), questions answered, then the
unattended stretch starts; the early help Robin expects happens before it.

## Runbook: the ten entries Robin needs first

1. **Start:** `lst preflight`, then the launch script (tmux, caffeinate, pinned claude, mod, watchdog); `/go`.
2. **Hold, stop, go:** what each leaves running; `touch run/HALT` from ssh.
3. **Answer a spec question** from the phone: `Q-003 B`; where open ones are listed.
4. **"Is it stuck?"** read the status mode: parked (wait), dialog (answer it), stale heartbeat (entry 5).
5. **Dead process or reboot:** `lst doctor`, `lst recover`, relaunch held, rule on the half step.
6. **Usage-limit park:** expected; how to read the end time; do not restart.
7. **A checkpoint file is broken or was hand-edited:** `lst doctor`, `lst restore`, `lst edit`, stale cuts.
8. **Reset fault** (mark missing, wrong session, wrong directory): what the mod did; manual `lst hydrate` and `/resume`.
9. **Disk or memory pressure:** prune forks, targets, `mutants.out`, logs; the build lock.
10. **Upgrade and rollback:** pins, boundary rule, mods API withdrawn, tags.

## Questions the draft does not answer
1. Does Remote Control follow a session whose id changes each reset, and show mod status lines? 2. How does the throttle hook mark a park?
3. Does a sub-agent's dialog surface in the main session, answerable from the phone? 4. Is `deleteSession` safe on a non-live fork? 5. What
does the mod do at a reset when `lst` is broken?

## What must survive revision
- One live session Robin can watch, hold and talk to; hold on any typed message; message keeping; a status line independent of the
  conversation; the reset behind one function.
- State rewritten whole, only `lst` writes, loading is the lint; every reset-carried item has a slot.
- Refusal never route; guards switchable to `warn`; gates as attestations per tree hash; quiet output, full log on disk.
- Random-kill testing as the resume test; S4 as the unattended proof; usage first, no wall caps.
