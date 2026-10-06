# Architect, round 2: the modules of V2-SYNTHESIS.md

**Verdict.** The cut between a base (rewind, store, gates) and a swappable flow is right, and rung 1 is
buildable this week. The eight-row table is not yet the real shape: C is a rule inside B, H is half B and
half a 40-line function, A, E and G are each two things, and two pieces are missing (a wiring file and
machine-local run state). The rule "a lower module never names a higher one" fails four of seven real cases.

**Checked:** `ctx_schedule.py`, `ctx_store.py`, `ctx_mcp/server.py` in full; `ctx_core.py` outline and I14;
nodes 16/32, 16/33, 16/60/64; `spike-f1` report, helper and mod; `spike-live` mod and report §1; `mods.md`
§3, §8. v1's `ctx` tests run: 361 passed, 1 skipped, 19 s. **Not verified:** whether a mod can start a
process (none in the API list at `mods.md:30`). Nothing was spiked; no sub-agent. Interfaces, diagram,
schema, rung 1 and **the split I would propose instead of A to H** (§7) are in the appendix.

## The modules

| Case | Under the table as written | Ruling |
|---|---|---|
| Rules card | Lives in F, must ride in every rewound context (A). A cannot name it | `--then` is a wiring string: `cat card; store render <scope>`. Holds |
| Who plants a mark | "The flow decides", but a cut is valid only at a finished turn (F1 guards) and ids remap on every fork (F1 §4) | The mod plants at turn end; marks are run state owned by A, found by marker text. The model or Robin asks for one |
| Who knows a "step" | F's step table. But a pack has no code, so something must read the table | Only the model reads it, so it is prose and belongs in the card. No tool knows a step |
| Write scopes with a generic store | "Belong to the pack", enforced nowhere | Two things share the name. Item scopes are B's owner rule. File scopes are a gate: the diff since the task's base touches only allowed paths |
| Heartbeat | G, "reads only" | Mod events write a timestamp to run state. The watchdog must be a separate process, since a dead session cannot watch itself |
| Context threshold | "At a threshold the mod asks" is written under A | A must not know it. The mod reads `$.session.usage().context.percent` at turn end (G's half) and calls A |
| Diff for a worker | "A diff we compute"; no "we" exists | Two verbs, `work begin` (records the base tree) and `work end` (diff, scope gate, gates, immutable record). The runner is whatever |

The order is not a line: A, B and D are independent bases. Restate the rule as: **no module imports or
names another; they meet only in one wiring file, as command strings and exit codes.** It is testable: each
module's tests run with the other tools absent, and a grep of each tool's source for the others' names is
empty.

1. **C is a rule in B's write path, not a module.** It cannot be used or deleted alone, and as drafted it
   reaches into three places: a refusal (B), a `question` item (so B must know one kind, against "kinds
   are data"), and parking dependent work (a readiness query). Make it an `owner` field, one
   `policy(old, new, actor)` function on `put`, a fixed `question` kind, and parked work derived as
   "blocked by an open question". Its limit: the agent calls the same command Robin does, so the refusal
   is a tripwire. The only authentication on offer is the mod, which can tell typed input from its own
   (`origin.kind === 'composer'`, spike-live mod line 364). Robin signs with a mod command; the store keeps
   a digest of what was signed; lint reports any signed item whose digest moved.
2. **H is two functions.** `ready(store)` (edges, states, open questions) is needed by every pack and by
   consent, and belongs in B. `rank(ready)` is opinion and stays optional.
3. **A is a mechanism plus a host.** The mod is a session adapter that also hosts G's status line, hold
   rule, kept messages and trigger: one process, two contracts, no decisions (round 1, M2). The spike mod
   lost `hold, pending, kept, resets` on reload (spike-live mod line 300), so that state goes to disk.
4. **E is a kernel plus runners.** The kernel (`work begin`, `work end`, the record they write) is the only
   part to build, and it is what makes the worker's account never the record.
5. **F holds no control flow, and may ship gates.** "No code" breaks the first time a pack needs a check
   the tools lack. Keep the protection this way: the check is a gate, a script obeying D's contract with a
   seeded-defect fixture, shipped in the pack folder. A new refusal in the store is a kernel change and
   needs a recorded miss. Drop the step table as a machine input; keep lookups only (gate per class, skill
   per task kind, path globs) and lint that the file has no ordering or condition keys.
6. **Two pieces are missing:** the wiring file (the one place names cross) and run state (marks, session
   ids, hold, heartbeat, work bases; machine-local, never in git).

**Kinds: fixed in the tool, classes as data** (question 6). v1's 17 kinds were markers parsed out of
prose, and v1 had begun the retreat: node 64 merges five marker kinds into log entries with a `kind:`
qualifier. Follow that to its end. Four kinds carry behaviour and are fixed: `item` (anything decided:
spec, interface, decision), `task` (has states), `question` (has an owner and an answer), `note`. Records
are a fifth shape, immutable. A pack adds **classes**: a value of one field plus a lint row saying which
fields and links that class owes ("a `property` spec item owes a `tested-by` link"). A class cannot add
behaviour, so seventeen of them cost seventeen rows, not a parser. The rule that matters more than the
count: **the tool never parses a body.** v1's move to schema 2 became "a per-node LLM pass, not a
mechanical script" (node 64, q2) because structure lived in prose.

**Shape and code (questions 7 to 10).** One file per item: a TOML header, a markdown body. Flat ids
allocated by the tool (`T-012`), with `parent` as a link, not a directory: v1's nesting makes every id
lookup a walk of the tree (`ctx_store.py:81-94`), and one convention flip cost eight hand edits (node 64,
q5). Reuse of v1: copy the shape, port the tests, take `ctx_schedule.py` as code (appendix §5). Leave
`ctx_core.py`, the marker parser, behind, and the header reader, which drops unknown keys silently
(`ctx_store.py:173`). Language: Python 3.11 or later, standard library only, for B, the gate wrappers and
`rank`; TypeScript for the mod and the fork helper, which the SDK forces. Rust buys nothing in a few
thousand lines of file handling. The store is its own git repository in an ignored folder, as in v1, so a
commit per write does not move the product's tree keys; records carry the product commit they speak of.

**Keeping the format changeable.** Six rules, cheap now and dear later. (1) `format = N` in one file; the
tool refuses to write a store at another N. (2) Each change ships `migrate(N -> N+1)`, a pure function over
files with a golden store as its test, applied as one commit. (3) Unknown header fields survive a read and
write, and pack fields live under one open table, so a pack change never bumps N. (4) Only the tool reads
the files; the mod, gates and packs see `get --json` and `render`. (5) `put(get(x))` is byte-identical, as
a property test. (6) Bodies are never parsed.

**The contract that will not stay narrow is `render`.** Every pack presses on it, and the 9-of-9
cold-reader failure says its content is the hard problem. Fix its sections in the tool (focus item,
ancestor path, open questions, ready tasks, notes in scope, last few records); a pack chooses only scope
and caps. A pack that wants a template wants code.

## The scheduler

**What the code is.** 275 pure lines. Confidence in code is three labels: the share of resolved questions,
else a **declared marker**, else low (`ctx_schedule.py:114-125`). The seven-rung evidence ladder exists
only in node 32's text; requiring a cited reference for `high` is still a declared future (`#32.fut2`),
and 16 design nodes were found stamped `high` on assertion (node 32, I14). Centrality is a plain sum
flagged "tune empirically". Subtree size puts the root on top, so a hard bottom-up readiness gate was
added, and after the floor pass the formula only breaks ties among ready leaves. Node 32 says the formula
"systematically starves confidently-wrong nodes".
**By strength.** Habit: free and unobservable; put the two lines in the card. Advisor: sound only if no
gauge is ever a stored field; on a 12-slice linear port the ready set is one to three items, so ranking
adds little and the gauges and `ready` carry the value. Driver: no.

**Can the gauges be kept true mechanically?** Yes, on one condition: they are derived on read from records
and never written. An item's confidence is the highest rung among fresh records linked to it; a record is
fresh while its fingerprint of the item and its tree key still match (the doorstop suspect link, v1's
"staleness" made mechanical). `work end` and the gates write gate records; Robin's sign writes the top
rung; a spike or prior-art record is model-made and counts only with an artefact path and hash. That is
four honest rungs, not seven: asserted, probed (a receipt, still self-report), gated, owner-tested.
Fidelity for a port derives the same way: none, compiles, oracle partial, oracle match.

**Is "advisor" stable?** Not next to a rewind. After one, the rendered scope is the model's whole world,
so whoever picks the scope picks the work: `rewind --then "render $(next | head -1)"` is a driver in one
line of wiring. Tripwires: `next` has no side effects and prints at least three items with both factors;
no tool or wiring string calls it (a grep test); the model writes its focus to the store before rewinding.
**Adopt:** derived gauges and `ready` in B at rung 2; the habit line; `rank` at rung 5, as
`ctx_schedule.py` behind a 30-line adapter, if rung 4 shows order mattered.

## Tests and gates

Right in kind. Four structural points. (1) "A test kind is owed by the spec item" is a class row in lint.
(2) What stops gates growing (question 30): a gate cannot be registered without a seeded-defect fixture and
a time cost; each tier has a wall-clock budget; a gate over budget displaces another. That is a lint on the
wiring file. (3) Item 8 is wrong for exit 2: a tool fault handed to a worker as a failing check is how
werkbank looped. Deviation goes to the worker; a tool fault stops. (4) Protected expected values need no
new mechanism: hashes checked by a gate, paths excluded by the scope gate.

## Open questions

**Answers.** 3: the prefix at the mark, the note, and what Robin typed since; not the last turns. 4: at a
threshold on rung 1; step boundaries later use the same path. 6 to 10: above. 13: records are needed;
gauges derive from them and git log is not queryable. 16: park, since 8 of 8 stopped anyway. 21: no step
table. 39: C and `ready` into B; A, E and G each split. 40: `render`. 41: A's route first, at no cost to
the rest if the wiring rule holds; B's header second, hence the six rules. 42: realistic, see below.
**To add.** By what channel does Robin sign? Which state is machine-local? What makes a mark stale, and
who notices? What if a second session opens the same store? How is a pack versioned against the tools?
**The three that matter most:** 12 (what `render` and the note must hold), 1 (residency), 33 (baseline).

## Rung 1

Rewind alone on route F; route A and a typed `/clear` sit behind the same verb. Detail in appendix §4.
- **The mod** (about 200 lines, cut from the spike-live mod) reads context percent at each main turn end.
  At a threshold (default 60%), with no sub-agent running and no hold, it asks for a handover note.
- **The note** is a file with nine fixed headings and a word cap. It is checked mechanically (fresh,
  all headings, every listed path exists) before anything is discarded: one nudge, then hold.
- **The reset:** the model runs the helper, which forks the original session at the mark (default: the end
  of the first turn, so Robin's opening brief stays word for word); the mod resumes the fork at turn end,
  verifies the session id, and submits the note plus anything Robin typed.
- **Robin sees** a status line (`ctx 61% | resets 3 | HOLD`), a toast when the note is asked for, and the
  note as the first message of the new context. He has `/handover`, `/mark`, `/hold`, `/go`.
- **Useful within a week** on his own scoping sessions, with three counts kept: resets, times he re-told
  something, tokens written per reset. Spike first (an hour): the helper run from the session's own Bash.

## MUST-fix

1. **Restate the rule:** no imports; modules meet only in the wiring file by command and exit code; run
   state is machine-local; a deletion test per module; a pack holds no control flow and may ship gates.
2. **Fold C into B** (a policy on `put`, a fixed `question` kind, a `ready` query) and name Robin's channel.
3. **Before the first item is written:** fixed kinds, classes as lint rows, unparsed bodies, format rules.
4. **Gauges are derived from records, never stored;** `next` is called only by the model and Robin; the
   focus after a rewind is chosen by the model before it.

**What must survive.** Rewind as two verbs with the route behind them. `render` as a pure function. One
writer, validated, one commit per write. Immutable per-dispatch records. The ancestor path, never the whole
tree. The exit-code grammar. Rung 3, the baseline, before any pack. The pack built last and cheapest.
