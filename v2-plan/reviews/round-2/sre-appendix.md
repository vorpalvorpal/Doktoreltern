# SRE round 2: appendix (detail moved out of sre.md)

## Operating A to H separately

| Module | Install / config / remove | Leaves behind | A fault shows as | Off mid-job? | Failure boundary? |
|---|---|---|---|---|---|
| A Rewind | plugin dir + SDK helper; env var per session; remove = delete both | forks in `~/.claude/projects` (0.4 MB each, picker clutter), `rewinds.jsonl` | **Silent** if the mod does not load; loud if a call rejects | Yes: unset the env var, lose nothing but future rewinds | **Yes, and the worst one:** it fails quietly. G is its only detector |
| B Store | one binary or script; config = store path | commits in the store repo; lock file | refused write, lint failure, git error: loud | Yes if reads fall back to files | Partly: files stay readable by hand, so the boundary holds |
| C Consent | a field and a refusal in B | parked work, filed questions | a stop with a question: loud | Switching it off means the agent edits Robin-owned items | **Not a clean boundary:** it is B's behaviour, not a process; off = a policy change |
| D Gates | stellwerk, pinned | result files, full output on disk | exit 2 (tool fault) vs 1 (deviation) | Yes, a gate skipped is recorded as skipped | Yes: a per-command process |
| E Workers | skills pinned and vendored | worktrees, diffs, evidence logs | verdict plus evidence; model hand-back never the record | Yes, between tasks | Yes if the worktree is disposable |
| F Flow pack | a folder of four files | none of its own | step table disagrees with state | Yes (rung-1 mode) | Only if it truly holds no code |
| G Watch | one script + launch wrapper | heartbeat file, log | itself silent if dead: needs its own dead-man check | Yes | Independent by design |
| H (per synthesis §3) | see below | | | | |

(The synthesis names A to G; I treat H as the oracle/port harness of §6 and §5's port-with-oracle pack, since the task
brief lists A to H. If H is something else, this row is unreviewed.)
- **H, oracle harness:** install = R plus (later) cargo plus a comparator script; leaves golden directories (recorded once,
  hashed), normaliser config. A fault shows as a divergence list: the likeliest operator failure is a *normaliser too loose*
  (a false pass), which does not show. Needs the seeded-defect check (§6.5). Off mid-job: yes, but a slice then closes
  without its oracle, which must be recorded as such.

**Which boundaries are failure boundaries.** Genuine: D, E (disposable worktree), G (separate process). Not genuine:
**A to G for liveness** (a dead mod stops A and the heartbeat G reads, so G cannot tell "mod gone" from "session idle"
unless it also checks the process); **B to C** (one writer, one commit path: a hung git or a stale lock stops both
at once); **F and B** share the schema file, so a pack edit can make existing items fail lint. Cheapest fix: every module
logs to one append-only `leitf/events.jsonl` line per action (module, verb, result, session id), so "which module" is a
grep, and `leitf doctor` reports the last event per module.


## The store in daily use (B)

- **Where.** Its own repository, not the product repository. Reasons: a commit per write would otherwise interleave
  with product commits, sub-agents and worktrees check out the product branch (a worktree sees a different store
  state, or none), and a product `git reset` or `clean` could wipe notes. Round-1 M5 stands; for a notes pack on scoping
  work like this the store can simply sit in the folder being worked on and be its own repo.
- **One writer, with sub-agents and worktrees around.** Only the CLI (`put`) writes; sub-agents get `get`/`render`
  read-only, enforced by `tool.check` (D-style: deny writes to the store path). A file lock plus temp, fsync, rename. A sub-agent in a
  worktree finds the store by absolute path, not relative.
- **Commit per write.** Fine for correctness (git is the log, Q13). Cost: a `git commit` is 20 to 50 ms here (est.), thousands of commits over a job make
  `git log` noisy and `git gc` irrelevant; the real risks are (a) interleaved commit while Robin hand-commits in the same
  repo (use a dedicated repo and a dedicated branch), (b) a crash between write and commit leaving a dirty tree
  (`doctor` commits or restores), (c) an OneDrive-synced folder (do not place the store in a hydrated cloud folder:
  git inside Files-On-Demand is a known hazard, est.).
- **Hand-edit and interrupted write.** Lint on read, not only on write: a hand-edited file that fails the schema is
  *reported and still rendered* with a marker, never silently skipped; `lst doctor` lists dirty/invalid files;
  `lst edit <id>` opens the file and validates on close; `lst restore <id>` takes the last good commit. An interrupted
  write leaves a `.tmp` file; `doctor` removes it.
- **Will a store used for notes on scoping work get used?** I doubt it, from the evidence in this very folder: the
  scoping work here lives in markdown files, a store item adds a write step and a schema for something a model reads
  well as prose. It will get used if (a) writing is one command with defaults, (b) `render` is what the *next* session
  actually reads at start, and (c) it holds only **questions and decisions** (the two things that must survive a rewind
  and that Robin answers), not findings. Test cheaply: run the notes pack on one real scoping job for a week with
  three kinds only; if `render` is not read, drop B from rung 2. Do not build C (consent) for this use at all.


## Tests and gates on an 8 GB laptop (§6)

Estimates are marked (est.); nothing was run.
- **R side (testthat, 1,286 tests, ~37k test lines).** Memory: one R process with DuckDB, tibbles and a few fixtures:
  typically 300 to 800 MB (est.), fine. Time: the suite's own record says 0 fail 9 skip but gives no duration in what I read.
  Unknown: that number must be taken once (`Rscript -e 'devtools::test()'`, allowed to the sampleTidy owner, not me).
  Plan on the order of **5 to 15 minutes** for the full suite (est.), with per-file runs of seconds. So the "affected
  slice in minutes, full only at release" tiering is plausible *if* tests map to files (they do: one test file per R file).
- **Rust side (est.).** Not installed (M), so the first cost is toolchain setup (rustup about 1 GB, an hour with
  download). Cold build with `duckdb` crate `bundled` compiles DuckDB's C++ amalgamation: commonly 5 to 15 minutes
  and 2 to 4 GB of RAM at peak on a laptop (est.; round-1 M4 already asked for S0-b to measure it). Warm incremental builds of
  a small crate: seconds to a minute, but every test binary that links DuckDB links ~100+ MB. `target/` of 2 to 6 GB.
  Mitigations: one shared `CARGO_TARGET_DIR`, `debug = "line-tables-only"`, one integration test binary, or the
  `duckdb` crate without `bundled` against a Homebrew library (loses reproducibility).
- **Both in one repo during a port.** The oracle gate runs R (about 0.5 GB, Rscript start 1 to 3 s with these
  packages, est.) and the Rust binary on the same files, then compares. Run **serially, never in parallel**: R 0.8 GB + a
  rust build 3 GB + Claude Code (about 0.5 to 1 GB) + node helper + the OS is at the edge of 8 GB (est.). Swap on this
  machine is possible; an OS-killed `rustc` must be a recorded "infra" fault, not a failure of the code (round-1).
- **The oracle goldens are the cheap part**: record R output once (IR dumps, table dumps; fixtures are 632 KB).
  The expensive, slow part is the *corpus* tier (265 files, ~1.9 GB hydrated from SharePoint): never in the gate
  loop; it is a Robin-triggered, once-per-slice, run-overnight tier with its own budget.
- **Budgets as design limits, my version:** T0 edited files: under 30 s; T1 slice: under 5 min for R-only, under
  10 min for R-plus-Rust warm; T2 corpus: unbounded but off the loop; cold Rust build is a one-off cost (est. 15 to 25
  min with setup) the plan should list as a *day-one task*, not hide in "a few minutes".
- **What to measure first (cheap, safe):** `time Rscript -e 'testthat::test_dir(...)'` on three test files, peak RSS
  via `/usr/bin/time -l`; then, if a port is real, a 20-line Rust hello with `duckdb` bundled, to get cold build
  time and peak RSS. Half a day, no model needed.
- **If the port is dropped** (the sampleTidy view leans to staying in R, 65%): the whole Rust budget disappears
  and the oracle becomes "last release", which is far lighter. A decision on language is worth more than any tuning.


## Measured on this machine (M)
- 8 GiB RAM (`hw.memsize` 8589934592), 8 cores, 47 GiB free of 228 GiB, AC power. Claude Code 2.1.291.
- R 4.4.3 with `testthat` 3.3.2, `duckdb` 1.4.1 (prebuilt R binary, so no compile), `units` 1.0.0, `readxl` 1.4.5,
  `covr` 3.6.5. So sampleTidy's R side can run here without installing anything. No mutation tool for R is installed.
- Not installed: `cargo`, `rustc`, `~/.cargo`, `~/.rustup`, the `duckdb` CLI, `tmux`, `ntfy`. Present: `caffeinate`, node, git.
- `~/.claude/projects`: 1.7 GB in 141 folders. The F1 spike's 11 transcripts take 4.6 MB (about 0.4 MB each). Forks are
  cheap on disk; the cost is picker clutter, not space. `spike-f1/node_modules` is 274 MB (the SDK), a real install size.
- sampleTidy folder 1.4 GB, much of it `scratchpad/` DuckDB rehearsal copies and snapshots.


## Watch (G) as a standalone with rewind alone: the smallest useful cut

Round 1's watchdog assumed a build. For a flow-less session it is three states and about 60 lines.
- **Inputs:** the mod writes `~/.claude/leitf/heartbeat-<session>.json` at `turn.start`, `turn.complete`,
  each `tool.call`, and a 15 s timer: `{pid, session id, ts, state: turn|idle, last tool, agents running, pending
  dialog?, context percent}`. The watcher also reads the process table for the pid.
- **Three answers, by rule:**
  - **"waiting for you":** state idle and the last turn ended with the model's text (or a dialog flagged by the
    `tool.check` hook returning `ask`), for more than 2 minutes.
  - **"working":** state turn, heartbeat fresh (under 60 s), a tool event in the last 5 minutes.
  - **"dead":** pid gone, or heartbeat stale over 5 minutes with the pid alive (mod gone or process wedged: say which).
  - A fourth, cheap and necessary: **"probably a dialog"**: state turn, no tool event for N minutes, no sub-agent
    running. This is the commonest unattended stop (spike-live §10.2).
- **Delivery:** `caffeinate`-wrapped launch; macOS `osascript` notification and a status-line string. `ntfy` is not
  installed (M); a phone push needs one choice from Robin (ntfy, Pushover or iMessage to self). Without it, the phone
  sees only what Remote Control shows, and the status line may not appear there (round-1 M1a, still unknown).
- **Never:** relaunch, send keys, clear holds. Rung-1 G is notify-only; relaunch is flow-layer work.
- **Install/remove:** one file; deleting it loses nothing. **Its own failure** needs one line: the heartbeat's mod
  writes a `watch-alive` timestamp a second small cron (launchd every 5 min) checks, so the watcher is not a single
  point of silence.

