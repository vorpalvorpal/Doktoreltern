# Review panel brief: the Leitstand scoping draft

This is the shared brief for the seven lenses in `v8.4-plan/SCOPING-PROCESS.md` ("The reviewer
personalities"); the per-lens prompts are in `v8.3-plan/reviews/panel/LENS-PROMPTS.md`. Paths are
from the werkbank repository root.

## The question

Is `successor-plan/SCOPING-DRAFT.md` a sound basis for building a successor to werkbank, and what
must change before any of it is built?

## What you are reviewing

A first draft, written in one day from Robin's brief (`successor-plan/BRIEF.md`). It proposes a
model orchestrator in one live Claude Code session, with its context rebuilt from structured
checkpoint files at the end of each step, a small command-line tool that edits those files, a
small mod that does the rebuild and refuses a short list of actions, and borrowed skills doing the
individual steps. It is a new project, not a werkbank release. Nothing has been built except
spikes of the reset.

## Two things Robin asks of you in particular

**1. The flow is not settled; propose better ones.** The flow in Robin's brief (scoping, planning
per package, per-unit tests then code then audits, a closing review) is, in his words, his
uninformed thoughts: a starting sketch for discussion. The draft's §5 follows it closely and has
not tested it against alternatives. Do not treat its phases, their order, the unit of work, or
where audits and resets sit as given. If your lens suggests a different flow, say so and argue
for it. You are encouraged to do real work to back that up:

- send a sub-agent to look for prior art (how others structure agent-run builds, what they
  measured, what failed);
- run a small spike of your own;
- dig into what went wrong in werkbank and what that says about the flow. The record is rich:
  `successor-plan/research/werkbank-evidence.md` is an index into it, and behind that are
  `V8.3-SCOPING.md`, `DECISION-LOG.md`, `CHANGELOG.md`, `v8.3-plan/research/` and the run ledgers.

An alternative flow with evidence behind it is worth more to Robin than a list of corrections to
this one.

**2. The structured design of the checkpoint files (draft §4.1).** Robin wants specs, plans and
unit plans to be machine-readable, lintable and checkable, not prose, and wants your view on the
design. Every lens should say something on it from its own angle. Questions to start from:

- Is the split right: one item per file, stable files apart from changing ones, state rewritten
  whole, notes at three levels promoted upward?
- What should a spec item, a plan entry and a unit plan actually contain so that they can be
  linted and linked to tests, and what belongs in prose regardless?
- What properties of the checkpoint set can be checked mechanically (the draft names id links,
  interface producers, edges without cycles), and what is missing?
- Is TOML the right format? Would a database, or typed code, serve better than files?
- What will go wrong with this as a build runs for days: drift between files, stale state, notes
  growing without bound, the cost of the rebuilt context?
- werkbank's own history with ledgers, run-state files and checkpoints: what does it say?

## What to read, in order

1. `successor-plan/BRIEF.md`: what Robin asked for and what he answered in the interview.
2. `successor-plan/SCOPING-DRAFT.md`: the draft. §2 and §10 are where it is weakest by its own
   account.
3. The research file your lens needs (`successor-plan/research/`; §11 of the draft lists them).
   The reset spikes are `research/spike-reset/`, `research/spike-live/` and `research/spike-f1/`.
4. werkbank's own record where you need to check a claim or mine it for the flow question.

## Things to know

- Robin runs this on an 8 GB laptop on a subscription. The usage throttle is intended pacing, not
  a cost; under it, usage per outcome is time.
- Robin named the two failures he thinks most likely: he does not trust the output, or it is too
  slow or too dear. Weigh the draft against those first.
- Robin decided: one terminal session he can watch and step into; new project; spec-only
  sign-off; built by hand first and then by itself; first job a data pipeline writing to DuckDB;
  Rust as the target; gates through stellwerk. Challenge these if the evidence warrants, but say
  that you are doing so.
- The draft has no cost estimate, and says so.

## Order of running

Evidence auditor first, on the draft's figures; then the other six, each given the auditor's
corrections.

## Your deliverable

One file, `successor-plan/reviews/<lens-name>.md`, at most 180 lines:

- a verdict in three lines;
- MUST-fix, at most 5, each naming the section, the change, the evidence and the rough cost;
- SHOULD-fix;
- **the flow:** what you would change or replace, and why;
- **the checkpoint files:** your view of the design;
- questions the draft does not answer;
- what must survive revision.

If you ran a prior-art search or a spike, put its detail in a second file,
`successor-plan/reviews/<lens-name>-appendix.md`, and cite it from the first.

## Rules

- Write only your own review file, your appendix, and scratch under
  `successor-plan/reviews/scratch/<lens-name>/`. Edit nothing else. No commits.
- Do not run werkbank's test suites or drivers.
- A spike may start real Claude sessions only on haiku, only in your scratch folder, and only
  small ones; say what you ran and what it cost. Leave nothing running.
- You may use sub-agents, one at a time, sized to the job.
- Verify against the evidence and the code where your lens needs it, and say which claims you
  checked. Mark anything you did not verify.
