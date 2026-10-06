# Robin's brief, 2026-10-06, and what the interview added

Part 1 is Robin's text as given, unedited. Part 2 records his answers and corrections the same
day. `SCOPING-DRAFT.md` is the response.

## Part 1: the brief

### The problem

- Using a model as an orchestrator works well because it can use its judgement to change course as we go along
	- However the agent's context window quickly explodes.
	- The generic solution I use now is to monitor usage and then when context gets above ~300k say "checkpoint and I'll compact" and then run "/compact". This prevents autonomous builds from being, well, autonomous
- A deterministic driver doesn't have this problem because it has not context to explode. However it also has no judgement and trying to write all the ifs/thens has made werkbank become big, bloated and complex.
- The recently released mods allows much more control of how claude code works.
	- My basic idea is to keep a model orchestrator but to using a deterministic system for rewinding it to past states to keep context fresh (a more advanced form of checkpoint and compact)
	- I want to use skills stolen from superpowers (or similar - don't get fixated on superpowers in particular), or built into claude (eg. `/review`) for doing individual parts of the flow
	- I want to build something *modular* where bits and pieces can be easily changed in or out. Updated superpowers (or whatever) skills can be easily inserted or changed.

### Flow (this is a general idea for discussion - don't treat as fixed)

[x]: a previously created output used as a prompt
{x}: forks, possibly run in parallel

#### Phase 1: Scoping

interview -> draft scope -> review panel -> spec -> /clear

#### Phase 2: Planning

- [spec] -> {package n draft -> package n review panel -> package n review summary} -> /rewind
- [spec] -> [package 1...N draft] + [package 1...N review summary] -> gestalt review -> {package 1...N 2nd draft} -> /rewind
- [spec] -> {[package n 2nd draft] -> audit -> package n plan -> /rewind
?: What about seams?

#### Phase 3: Implementation

{
- [spec] -> [plan n] -> unit m
- [spec] -> [plan n] -> [unit m] -> (write tests <-> gate tests) -> /rewind
- [spec] -> [plan n] -> [unit m] -> audit tests -> /rewind # resume test writer at last point
- [spec] -> [plan n] -> [unit m] -> (write code <-> gate code) -> /rewind # unit m implementation can't be released until the tests for all seam units that depend on m have been written
- [spec] -> [plan n] -> [unit m] -> audit code -> /rewind # resume code writer at last point with audit complaint
- [spec] -> [plan n] -> package gestalt audit -> /rewind
}
- [spec] -> whole release audit

#### Phase 4: MERI
- Review of reports, costs, etc - look at EveryInc/compound-engineering-plugin

### Checkpoints

- Specs, package plans, unit plans, should *not* be plain markdown text. They should be machine readable, lintable, hypothesis checkable, etc. They should be broken into sections in separate files and presented individually so that a single file can be changed without breaking the whole cache.
- They should be stored as JSON/TOML/YAML/something similar
	- It should be human readable
	- It shoudl be easy to machine edit
	- We should have a basic tool that agents call to edit the format (eg. `fn("task1", done = TRUE, datetime = 2026-10-01T19:22:53Z, commit = "abc")` sets task1 to having been completed at time T commited to git as abc.
- They should be split by things that are likely to change frequently and things that are likely to not change. So the core plan won't change frequently, but the list of units that need to be completed will be changed after each unit is done.
- There should be process notes that are grown with the project. So [spec] would have a process notes file, [plan] would have a process notes file and [unit] would have a process notes file. Each cycle within a unit, the unit's notes are updated (if there is anything relevant). When the unit finishes and we rewind to the plan, the relevant bits (and only the relevant bits) of the last units process notes should be combinded into the plan's process notes. When the plan is finished and we rewind to the spec, the spec's process notes should be updated with the relevant bits from the package's process notes.
- If one unit finds issues with another unit, a pointer to the issues are added to that unit's entry in the package's checkpoint and the unit is set to open (if it has already been closed).

### Audits

- We want to use existing well thought out prompts for our audits.
- Audits shouldn't produce prose (unless the problem is with a plan or spec), they should produce a failing test. Ideally specs/plans are written in such a way that there can be something semi-mechanical like a failing test that can be given (I've not used hypothesis, but is this possible?)
- Often audit 'fixes' are the cause of new bugs. How do avoid this needs thought.
- Audit findings should be bundled and they should be checked for where they rhyme (with findings from the same audit, or findings from other audits) and where they are actually symptoms of larger issues. We don't want to catch 10 versions of the same issue 10 times. We want to catch it once and fix it everywhere.

### Gates

- I want to use mechanical gates, canary runs, etc as much as possible. However, prior art searches show that this hasn't really been done, which suggests that there are issues with it. In werkbank, it has been very slow and quite token expensive. We need to think thru how to use gates better.
- We need to work out *what* should run *when*. We want to test what we have actually edited, unless we are doing a real minor release (ie. something people (generally me) are actually going to use)
	- proposed versioning a.b.c. `c` is individual features or fixes. `b` is minor releases. Only even releases are 'real' ie. meant for use. So the full gate suite only runs on the transition of b from odd -> even. In an even release, additional `c` releases are minor fixes. New features trigger a new `b`

### Decisions

- Decisions shouldn't go in a log - git is the log. They should be put directly into the plan/spec so that we only have a single current state.
- Decisions that need the user, should be written as a problem statement, background, a list of alternatives with pros/cons and a recomendation. Where this has a clear best answer, then that should just be logged and taken, rather than waiting on user feedback. Any change that is not part of the spec should be taken by the orchestrator not be put to the user.
- Changes to plans should go thru some sort of review panel.

### Languages

- I'm not sure, but I think it should only target Rust, as performance seems to be equal or better than python and it prevents a lot of bugs. Push back if you want. What we need is some ability to call certain stats libraries that aren't available in Rust. Not sure hwo that is handled. Very simple R/Julia scripts that are directly called by Rust?

## Part 2: answers and corrections, same day

**Interview, round 1**

| Question | Robin's answer |
|---|---|
| Relation to werkbank and stellwerk | New project, reuse parts. |
| How tightly the flow holds the orchestrator | "I think 1 [guard rails], but maybe 3 [advice only]. How much will the rules decay if we are the one's controlling the compaction. If we insert them directly in each compaction? Let's scope out both paths. If 1 looks like it is going to turn into a quagmire, we can revert to 3" |
| One live session, or a fresh session per step | One live session matters. |
| What will be built in the first year | "The first thing I want to target is just a data pipeline, saving data to a duckdb database. Expanding to other languages might be a good later goal." Also: tools and pipelines; numerical kernels. |

**Interview, round 2**

| Question | Robin's answer |
|---|---|
| Pre-mortem: why would you have stopped using it in three months? | Output quality not trusted; too slow or too dear. |
| Where Robin is in the loop | Spec only, then a report. |
| How the tool itself is built | By hand first, then by itself. |
| Priority when speed, attention and usage pull apart | Robin's attention. |

**Corrections Robin made to early research summaries**

- On "auditors should write tests from the spec with the code withheld": "but they are auditing
  the code". The draft applies the withheld-code rule to the test writer and test audit only.
- On Rust: "the gap between python and other major languages (including rust) has narrowed
  recently. By some metrics Rust is better. But this wasn't the point. The point was the major
  python skill advantage has vanished, and the advantages of Rust for correctness are irrespective
  of if it is humans or llms doing it."

**After reading the first draft**

- On audits handing back failing tests: "What if the problem an auditor finds is a problem with
  the plan? Or the harness?" (Draft §5.3 now routes by target.)
- The session need, refined: "What I want is a single terminal session that provides updates about
  what is going on, where the build is up to, and that I can interact with an orchestrating model
  from (say 'stop' if it is going off the rails, etc - on the first few runs while bugs are being
  ironed out, I imagine that running autonomously will end up needing a bit of help from me)."
- "A reviewer from another model isn't currently available, but it should be built so that it is
  possible to use in the future."
- "I would like things to go thru stellwerk, but that significantly increases the size of the
  build. That should probably be a v2 build"
- "Leitstand sounds fine."
- Later the same day, replacing the stellwerk answer above: "actually we added a bunch of very thin
  shims to stellwerk for this version of werkbank. Let's do the same for adding support for rust
  to stellwerk. Then Leitstand keeps the same commands when stellwerk support catches up. This is
  what added mutation, etc testing to stellwerk."

**Background reading Robin supplied** ("interesting background, not gospel")

- https://www.awesome-testing.com/2026/08/mutation-testing-for-agent-written-code
- https://www.martinfowler.com/articles/sensors-for-coding-agents.html
