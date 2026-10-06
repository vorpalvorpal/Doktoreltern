# Redraft text: guards, operations, cost (SYNTHESIS actions 2, 10, 12, 18, 19)

Replaces §4.3; adds §4.5 and §8.1 (numbers are proposals); then edits for other sections. Marks:
**[E]** estimate, **[M]** measured, **[P]** a lens's unmeasured proposal, **[open]** undecided.

---

### 4.3 How tightly the flow holds the orchestrator

Robin asked for two paths, with a way from the first to the second: **guard rails** (a short list of
actions is refused) and **advice only** (nothing is refused). They stay one design with a switch:
each guard in `flow.toml` is `refuse` or `warn`, and advice-only is every guard on `warn`.

**Every decision lives in `lst`. [decided, from the Architect's M2]** There is one entry point:

```
lst check <action> --agent <id>   →   allow | warn <why> | refuse <why> | refuse-parked <why>
```

`check` is a pure function of the checkpoint and run files and the action; recording the answer is
a separate write at the edge. The mod is an adapter. It relays each tool call, dispatch, commit,
turn end and `step_done` to `lst check` and acts on the answer. It holds no rule and no state. If
`lst check` cannot run, the mod holds the build (table below, H6). One process start per tool call
is assumed cheap [E]; *untested*.

| Guard | `lst check` refuses | Evidence |
|---|---|---|
| G1 write scope | an edit outside the files the acting role may write. The files come from the unit plan; the role's kind (tests or source) from `flow.toml` | 8 violations, 0 false positives |
| G2 attested done | marking a unit or release done without its gate result for that tree | skipped full-suite gate |
| G3 readiness | dispatching an audit of something that does not yet exist | 29 withdrawn findings |
| G4 one committer | a commit by anyone but the orchestrator | silent out-of-target commits |

Whether G3 and G4 start on `warn` is part of the version 1 cut and is Robin's call (§9).

**Homes.** The half-page showed three deterministic parts. There are more; each has one home.

| Part or state | Home | Language | Note |
|---|---|---|---|
| Guards, readiness, `next`, intake, lint, `stable` and `delta`, stop and park kinds, nudge and refusal limits | `lst` | Rust, pure functions | the only reader and writer of the checkpoint |
| Refusal and departure counts | unit state, in git | TOML, via `lst` | permanent (below) |
| Run-time state: cuts, session ids, hold, kept messages, dispatch intents, reset-pending, `claude --version` | `leitstand/run/`, not in git, written by `lst run …` | TOML, via `lst` | survives a mod reload and a crash |
| Usage ledger | `leitstand/run/usage.jsonl`, appended by `lst run usage` | JSON Lines | the mod reports figures; `lst` writes (§8.1) |
| Heartbeat | `leitstand/run/heartbeat.json`, written whole by the mod | JSON | raw facts only; `lst status` turns them into a mode (§4.5) |
| Reset, relay of `lst check`, status line, sending a nudge | the mod | TypeScript | no policy, no state of its own |
| Fork at a message | the helper | JavaScript on Node (Agent SDK) | 46 lines in the spike [M]; a third runtime |
| Running a tool, normalising its result, affected-crate selection, test listing | stellwerk's gate module (the Rust shims) | Python | everything that knows cargo; `lst` names no language |
| Attestations | stellwerk's JSON kept whole at `run/attest/<tree key>/<tier>.json`; unit state holds the key | JSON | the tree key excludes `leitstand/`, or recording a result would change the tree |
| Launch wrapper and watchdog | one script (§4.5) | shell [P] | at most 150 lines [P, SRE] |
| The orchestrator's own instructions | a Leitstand skill, pinned in `flow.toml` | Markdown | not deterministic, but the largest prompt we own; counted in words |
| `flow.toml`, wrapper prompts | Leitstand's own files, apart from the project's checkpoint | TOML, Markdown | a lookup table: no ordering or condition keys |

Where `leitstand/` and `run/` sit relative to the product repository is disputed (SYNTHESIS D5)
and is settled in §4.1, not here.

**Every stop and park, in one table.** A kind that is not in this table cannot stop the build. The
kinds are a closed list in `lst`. A *park* takes one unit or package out of `lst next` while other
work goes on. A *wait* clears itself. A *hold* stops new work for the whole build until Robin acts.

| Id | Kind | Trigger | What stops | Who clears it, and how |
|---|---|---|---|---|
| P1 | Spec question | a ruling needs the spec changed | the packages the question names | Robin answers; the orchestrator files it with `lst decide` |
| P2 | Repeated refusal | the third refusal of the same action (below) | the unit | Robin rules on the issue |
| P3 | Unit budget spent | fix cycles, audit rounds or usage pass the limit in `flow.toml` [P, SRE; limits open] | the unit, with a question | Robin |
| W1 | Usage-limit park | the throttle or a rate limit | the session, until the stated time | nobody; it clears itself. Never an alarm, never a nudge, never a cost |
| W2 | Reset deferred | a sub-agent is still running at `step_done` | the reset only | the hand-back; past a time limit [open] it becomes H5 |
| H1 | Hold | Robin types, interrupts, or creates `run/HALT` | new work; running gates and sub-agents finish | Robin: `/go` (and removing `HALT`) |
| H2 | Permission dialog | a tool call outside the allowlist | the turn | Robin answers; the allowlist is corrected |
| H3 | Gate fault | a harness fault that makes a gate result wrong (§5.3) | the build; affected attestations withdrawn | Robin |
| H4 | Reset fault | mark missing, wrong session or directory, a cut that cannot be rebuilt | the build | Robin (runbook 8) |
| H5 | Step not closed | a turn ends without `step_done` after two nudges | the build | Robin |
| H6 | Checkpoint unreadable | a file fails to load, or `lst` cannot run | the build; `stable` and `delta` refuse | Robin: `lst doctor`, `lst restore`, `lst edit` |
| H7 | Machine | disk under 5 GB [E, SRE]; memory pressure during a gate | the build | Robin (runbook 9) |
| H8 | Session gone | process dead, reboot, or mods switched off (stale heartbeat) | everything | Robin relaunches; a watchdog relaunch is **[open]** (§4.5) |
| H9 | Version changed | `claude --version` differs from the recorded one | no unattended start | Robin (runbook 10) |
| E1 | Nothing ready | every package is parked | the build idles and notifies | Robin clears a park |

Principle 6 named two kinds and §8 said "no stops"; this is the true list. Only P1 is a product
decision. H2 to H9 are faults in Leitstand or the machine. P2 and P3 give up on one unit only.

**One outcome for a repeated refusal.** There are no per-guard rules. `lst` counts refusals per
unit, role and action. The third answer for the same action is `refuse-parked`: the unit becomes
`blocked`, an issue goes on Leitstand's own list, and `lst next` stops offering the unit. The
orchestrator still picks what to do next. So principle 5 holds: **a refusal, never a route.** The
limit is one number in `flow.toml`. In the Red Team's spike (haiku, 8 runs, a toy unit) a refused
model stopped and asked; this gives that stop one fixed shape. *Untested* on the real orchestrator.

**Departures are counted for good.** Every guard hit is counted, in `refuse` and in `warn` form
alike. At `step_done`, `lst check` also compares the step with its contract in `flow.toml` and
counts: no gate result for the tree, an edit to product files by the orchestrator, a dispatch that
names no `flow.toml` role, a step with no intent record, a nudge. Counts live in unit state, are
never reset, and `lst report` prints them per build. This is the evidence for guard rails against
advice only; S0-c's three-unit toy gives a first reading and no more.

**Two limits on growth.** A new guard needs a recorded silent miss from a real run. And one
tripwire covers all deterministic code, replacing the draft's 1,500 lines for the mod alone:
- **The sum:** non-test lines of `lst` (Rust), the mod (TypeScript), the helper (JavaScript), the
  launch and watchdog script (shell) and the Rust roles added to stellwerk's gate module (Python).
- **The line:** 5,000 at the end of S4. Above it, a review against principle 5 before the next
  stage. Above 8,000, no new feature until the review has cut code. Both numbers are the Bar
  Raiser's **[P]**; she did not count the shims, so this is tighter than she proposed. No lens
  estimated the shims' size.
- **Four counts printed beside it** by `lst report`, since growth also hides outside line counts:
  `lst` commands, refusal kinds (4 today), stop and park kinds (15 above), and words in the
  orchestrator's skill.

**The `lst` command list today: 25**, against 9 in the first draft, before a line is written.

| From | Commands | n |
|---|---|---|
| First draft | `next`, `unit done`, `issue add`, `note add`, `decide`, `intake`, `lint`, `gate`, and `hydrate` (now two: `stable`, `delta`) | 10 |
| Implied by §5.6, never named | `question add` | 1 |
| Architect | `check`, `run …` (a family, counted once), `step begin`, `render` | 4 |
| SRE | `preflight`, `doctor`, `edit`, `restore`, `recover`, `step abandon`, `log`, `status`, `report`, `migrate` | 10 |

The Red Team counted 23; the two extra are `question add` and `hydrate`'s halves counted apart.
`migrate` can wait for a schema change. A new command, like a new guard, names the fault it answers.

---

### 4.5 Operations: what runs beside the session

**The launch wrapper and watchdog.** One script, outside the session, that knows nothing about the
flow, units or findings. It does three things, and a fourth that is disputed.

1. **Reads the heartbeat.** The mod writes `run/heartbeat.json` every few seconds with facts only:
   pid, session id, whether a turn is running, time of the last tool event, park marker and its
   end time, last `step_done`, `claude --version`. `lst status` folds those into one mode:
   `running`, `held`, `parked until HH:MM`, `waiting Q-…`, `dialog?`, `reset`, or `stale`. The
   watchdog calls `lst status`; it does no classifying of its own.
2. **Notifies Robin** on: process dead; heartbeat stale 10 minutes with no park marker; `dialog?`;
   a spec question filed; nothing ready (E1); disk under 10 GB [E]; park start and end; run
   finished. At most one notice per kind per 4 hours [P, SRE]. The channel is **[open]**.
3. **Wraps the launch:** tmux, `caffeinate`, a pinned `claude` binary with auto-update off, the mod.
4. **Relaunch: [open], SYNTHESIS D9.**
   - *SRE:* relaunch, but only if Robin set `unattended`, the process vanished or exited non-zero,
     there were fewer than 3 restarts this hour, and the claude version is unchanged. The session
     starts **held** with the output of `lst recover`; the orchestrator rules on the half-done step.
   - *Red Team and Bar Raiser:* notify only until S4 has run once. A relaunch is a resume path, and
     resume took werkbank eight releases. Version 1 restarts by hand.
   - Both contain steps 1 to 3, so those are built first either way. The SRE's "redo, not resume"
     (a killed step is abandoned and rerun from its recorded base commit) narrows the gap.

**What the watchdog may never do:** choose the next unit, retry a step, edit state, clear a hold,
kill a gate, read findings, or classify a fault. What to do after a crash lives in `lst recover`
and the orchestrator, and both can be tested without the watchdog.

**Permissions.** Permission dialogs were the commonest stall in the live spike, and Esc at one
does not report as an interrupt. So:

- `lst preflight` writes a permission allowlist from `flow.toml`, per role, then drives each
  allowed command once, so a missing entry shows as a dialog while Robin is at the keyboard.
- It also checks toolchains, disk, AC power, `lst doctor`, and sends a test notice.
- **The unattended stretch starts only after preflight passes and open questions are answered.**
  The early help Robin expects to give happens before that line.
- Whether an "allow for this session" grant survives a reset is *untested by anyone* (it is in F2).

**Stall detection.** The mode from `lst status` is the signal:

| Sign | Read as |
|---|---|
| a turn running, no tool event for N minutes [open], no park marker | `dialog?`: probably a permission dialog |
| heartbeat stale 10 minutes, pid alive | the mod is gone, or mods were switched off |
| heartbeat stale, pid gone | the session died, or the machine slept or rebooted |
| no `step_done` in three times the median step | slow or looping; look |
| park marker set (how the throttle hook marks a park is *not verified*) | waiting, as intended; parked time never counts toward any sign above |

**Runbook: the ten commonest faults.**

| # | Robin sees | Robin does |
|---|---|---|
| 1 | Nothing yet: starting a build | `lst preflight`; the launch script; `/go` |
| 2 | The build is going wrong | Type anything (hold). Gates and sub-agents finish. `/go` resumes. If the session is wedged, `touch run/HALT` |
| 3 | `waiting Q-003` | Read the question (options and a recommendation), answer in the session |
| 4 | `dialog?` | Answer the dialog; add the command to the allowlist source in `flow.toml`; rerun preflight later |
| 5 | `parked until 14:40` | Nothing. Do not restart. It is the throttle doing its job |
| 6 | Notice: process dead, or stale heartbeat | `lst doctor`, `lst recover`, relaunch held, rule on the half-done step (default: `lst step abandon` and redo) |
| 7 | Hold: a checkpoint file will not load, or was edited by hand | `lst doctor`; `lst restore <file>` or `lst edit <id>`; stale cuts rebuild themselves |
| 8 | Hold: reset fault (mark missing, wrong session, wrong directory) | Read what the mod reports; `/resume` the session `lst` names, or paste `lst stable` and `lst delta` by hand |
| 9 | Notice: disk low, or a gate result of `infra` | Prune forks, build targets, mutation output and old gate logs; check that only one cargo tree is running |
| 10 | A Claude Code update, or mods switched off | Do not upgrade inside a package. At a boundary: run F2 and the acceptance fixture on the new version, then re-pin. With mods off, run manual mode |

---

### 8.1 Cost: a first model, all of it estimate

No comparable build has run. The Economist built this model from werkbank's ledger. **Every figure
is an estimate [E] unless marked [M].** Dollars are the werkbank ledger's dollars, used so measured
fork costs carry over; on a subscription they stand for usage. The orchestrator's turn price is
the least certain input (it spans 3 times) and assumes an opus orchestrator, which nobody has
chosen (§9). The model prices the flow as first drafted, with three code-audit layers.

**The reference build** is the DuckDB pipeline at an assumed size: 3 packages, 12 units, about
2,000 lines of Rust. The size is the Economist's assumption; Robin has not named one (§9).

| Line | Low | Likely | High |
|---|---|---|---|
| Units | 8 × $10.5 = $84 | 12 × $26.1 = $313 | 20 × $67.8 = $1,355 |
| Packages | 2 × $22 = $44 | 3 × $51 = $153 | 5 × $120 = $600 |
| Release audit | $25 | $70 | $150 |
| Spec panel and interview (zero if hand-written, as at S4) | $0 | $25 | $50 |
| Run review and the rest | $5 | $10 | $25 |
| **Build** | **about $160** | **about $570** | **about $2,200** |

The corners need every input at its extreme. The Economist's own 80% band is **$300 to $1,200**.

**Per unit** (dollars; low / likely / high):

| Component | Low | Likely | High | Anchor |
|---|---|---|---|---|
| Test writer | 1.0 | 2.2 | 4.0 | sonnet implement fork, $2.18 mean [M, 13 forks] |
| Test audit before code | 1.2 | 3.4 | 6.0 | about $2.3 a sweep [E from M] |
| Implementer | 1.5 | 3.0 | 5.0 | one fork plus gate retries |
| Mutation on the diff | 0.8 | 1.7 | 3.0 | haiku classify $0.16 a fork [M]; wall time excluded |
| Code audit per unit | 3.0 | 6.0 | 16.0 | 1 to 2.5 sweeps |
| Finding groups ruled, per unit | 0.5 | 1.2 | 3.0 | a count, not dollars; the biggest unknown |
| Cost per group | 3.0 | 4.5 | 6.0 | ruling, fix, fix re-review |
| Orchestrator turns | 1.4 | 4.2 | 15.4 | 20 / 35 / 70 turns at $0.07 / $0.12 / $0.22; the turn count is assumed |
| Resets, 3 a unit | 0.09 | 0.18 | 0.36 | route F |
| **Unit** | **10.5** | **26.1** | **67.8** | a plausible band, not an interval |

**Per package** (likely $51; range $22 to $120): plan $8 ($4 to $15), plan review at two or three
lenses $8 ($3 to $15), gestalt audit $35 ($15 to $90). Lint and the T2 gate cost no tokens.

**Where the spend goes** in the likely build: units 55%, packages 27% (the gestalt audit alone is
$105), release audit 12%, spec 4%. Cut another way: review-type spend (every audit, ruling, panel
and re-review) is $402, **70%**; building (writer, implementer, mutation) is $83, 15%; orchestrator
turns about 16% of a unit. The three code-audit layers together are $247, 43%. No single input
moves the total by more than about 25%; the number of audit layers sets the level.

**Wall time is not in the model.** Compile, T1 and mutation cost minutes no token count shows
(mutation: 10 to 50 minutes a unit [E], nothing run in Rust yet).

**The throttle is intended pacing.** Under it, usage per outcome *is* time, so "usage first, wall
time second" is one target, not two. A park (W1) is never counted as a cost and never an alarm,
and no step is exempt from it. Targets are in usage per unit and minutes of Robin's wait.

**The reset and the cold cache.** At real sizes the prefix is about 47k tokens at unit start [E],
not the spike's 79k.

| Reset | Route F | Route A |
|---|---|---|
| To the unit | $0.03 to $0.10 | $0.14 to $0.42 |
| Stale cut rebuilt (a plan or spec item changed) | $0.08 to $0.30, on change only | as above |
| **Cold cache after a long wait** | **$0.30 to $1.00** | the same |
| Whole build, about 40 resets | $1 to $4, plus $1 to $5 of rebuilds | $6 to $17 |

All [E]. F against A is $4 to $13 a build, 1 to 2%, so the route is chosen on reliability. The
cold-cache case is *untested* (F2). Its rewrite is logged as usage of that reset, not of the park.

**The spike figures are not build costs.** §4.2's "$0.068 a step" and "reads 78.7k" are **[M] on
haiku, with 36k tokens of filler state and a toy step**. They show the mechanism works; they do
not price an opus orchestrator or a real hydrate.

**"Judge less" gets a number. [P, Economist; open]** Target: review-type spend at most **45%** of
build spend, and at most 2 judging points between a unit's code existing and its package closing.
The model above puts the first draft's flow at 70%, so the flow does not yet meet it. The Bar
Raiser would fix the number only after S2's first measurement. Both are in §9.

**A role on every ledger row. [decided]** Each row of `usage.jsonl` carries `unit`, `step`,
`role`, `model`, tokens by class (input, cache read, cache write, output) and seconds by state
(running, parked, held, waiting). It covers sub-agents, not only the main session. Whether a role
counts as judging is read from `flow.toml`, not stored. The share is then read, not inferred;
run 3's $929 had to be rebuilt afterwards and missed four cost lines.
**What the stages owe:** S2 reports cost and orchestrator turns per unit, by role, from the ledger.
S4 has a line fixed before it starts: tokens, wall time per unit, Robin's minutes (values: §9).

**For scale [E]:** one direct Claude Code session for the same pipeline is $10 to $60, or $25 to
$90 with a separate test pass and a fresh review. A Leitstand run costs about $115 to $145 before
a unit is built, so below about 4 units a direct session is cheaper.

---

## Edits other sections need

| Section | Old wording | New wording |
|---|---|---|
| §0, first paragraph | "Three small deterministic parts sit around it." | "Five deterministic parts sit around it: `lst`, the mod, the fork helper, stellwerk's gate module, and a launch script with a watchdog. The orchestrator's own skill is a sixth owned part (§4.3)." Add the helper, gates and watchdog to the diagram. |
| §0, diagram, mod box | "2 refuses a few actions" | "2 relays each action to `lst check`" and, in the `lst` box, "answers every check" |
| §0, third bullet | "refuse a short fixed list of actions (§4.3)" | "refuse a short fixed list of actions, all through `lst check` (§4.3)" |
| §3 pr. 3 | "Judge less. Every finding passes…" | add: "Target: review-type spend at most 45% of a build **[P, open]** (§8.1)." |
| §3 pr. 5 | "…the model does. This is the rule meant to stop the mod becoming the driver." | "…the model does. A repeated refusal has one generic outcome, a parked unit (§4.3). The rule covers all deterministic code, not the mod alone." |
| §3 pr. 6 | "Only spec changes, and faults in Leitstand's own gates, reach Robin." | "The only product decision that reaches Robin is a spec change. The build can also hold for faults in Leitstand or the machine; §4.3's table is the whole list." |
| §4.2, route table | column "Cost per step, haiku" | "Cost per step **[M: haiku, 36k filler state, toy step]**"; add a note pointing to §8.1 for real sizes and the cold cache |
| §4.2, steps 2 and fault rows | "The mod checks that no sub-agent is running…"; "The mod nudges twice, then stops with a fault"; "stored outside the mod's variables" | "The mod asks `lst check step-done`…"; "`lst` answers nudge twice, then hold (H5)"; "stored in `leitstand/run/` by `lst run …`" |
| §4.4 | "The mod's `agent.spawn` hook applies the model and write scope from `flow.toml`" | "The mod's `agent.spawn` hook asks `lst check dispatch`, which gives the model from `flow.toml` and the write scope from the unit plan" |
| §4.1 (other agent) | unit state fields | add refusal and departure counters; run records for heartbeat and `claude --version`; `lst` table to list all 25 commands |
| §5.2 | "Parallel units each get a git worktree." | drop for version 1 (action 5); `lst gate` holds a lock so one cargo tree runs at a time |
| §5.3, harness | "the build holds for Robin" | "the build holds for Robin (H3, §4.3)" |
| §5.4 | "records the attestation, which stellwerk does not hold" | "keeps stellwerk's JSON whole under `run/attest/<tree key>/<tier>.json` and holds the key; a signal exit is classed `infra` and retried once" |
| §5.5 | "writes tokens and time per step and per role to `ledger/usage.jsonl`" | "reports tokens and time to `lst run usage`, which appends a row with unit, step, role and model (§8.1)" |
| §7, S1 | "G1 and G2" in the mod-and-`lst` list | "`lst check` with G1 and G2; preflight and allowlist; heartbeat and `lst status`"; give the launch script and notify-only watchdog a stage |
| §7, S0-c | "the first evidence on path A against path B" | "a first reading; the permanent departure count (§4.3) is the evidence" |
| §8, "Honest gap" | "this draft has no cost estimate for a build…" | "A first cost model is in §8.1. All of it is estimate. S2 and S4 measure against it." |
| §8, last paragraph | "between usage and wall time the draft puts usage first, since under the throttle usage is time" | "under the throttle usage is time, so there is one target; parks are never counted as cost (§8.1)" |
| §8 | "No stops after the spec is signed." | "No stops for product decisions except spec questions; every other stop kind is in §4.3's table." |
| §9, O5 | "Mod size limit of about 1,500 lines…" | "One tripwire over all deterministic code: 5,000 lines at S4, review; 8,000, no new features **[P]** (§4.3)" |
| §9, new rows | none | O8 watchdog relaunch or notify only (D9) **[open]**; O9 the 45% judging target, now or after S2 **[open]**; O10 notification channel **[open]**; O11 limits for P3, W2 and the `dialog?` timer **[open]**; O12 orchestrator model and reference build size, which every figure in §8.1 scales with (Robin); O13 S4's fixed line for tokens, time and Robin's minutes (Robin) |
| §10 | bullets "A watchdog.", "Cost.", "Rate limits and the throttle" | Watchdog: "specified in §4.5; relaunch is open". Cost: "a model exists (§8.1); nothing in it is measured for this design". Throttle: "treated as pacing; a park of hours and the cold cache after it are untested (F2)". |
| §12 | "Guard: a deterministic refusal of one kind of action (§4.3)." | add "answered by `lst check`"; add entries for Departure, Park, Hold, Heartbeat, Watchdog, Helper |
