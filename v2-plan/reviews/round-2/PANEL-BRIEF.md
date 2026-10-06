# Review panel, round 2: the Doktoreltern v2 synthesis

Shared brief for the seven lenses. The lens prompts are in
`/Users/rjs/dev/werkbank/v8.3-plan/reviews/panel/LENS-PROMPTS.md`; the process is described in
`/Users/rjs/dev/werkbank/v8.4-plan/SCOPING-PROCESS.md`. Work from `/Users/rjs/dev/Doktoreltern`.
Paths below are relative to `v2-plan/` unless absolute.

## The question

Is `V2-SYNTHESIS.md` the right way to cut this problem into modules, and what should be built
first, changed, or dropped?

## What has happened

A first draft ("Leitstand", `SCOPING-DRAFT.md`) went to this panel earlier today. The reviews are
in `reviews/` and merged in `reviews/SYNTHESIS.md`. Since then Robin, the owner:

- decided the successor is a complete rewrite of Doktoreltern (version 1 is everything in this
  repository outside `v2-plan/`);
- made **modularity the main requirement**: "so we can build bits that are actually useful and
  find the bits that end up needing a rethink without destroying the whole thing";
- said the rewind and checkpoint system is useful with no fixed flow, and the flow is a layer on
  top;
- said he is still attached to "getting better quality tests (not just unit tests) and other
  mechanical gates, without making everything unusable like werkbank has become";
- said he is not wedded to Rust, and that the project he eventually wants to work on is
  sampleTidy (`/Users/rjs/dev/sampleTidy`): port it and build new features;
- asked for version 1's scheduler to be assessed: "I quite liked the Doktoreltern scheduler...
  I'm not attached to it, just want to get it assessed";
- chose to leave the first panel's open questions unanswered for now and "sit with uncertainty".

The synthesis is therefore mostly options and open questions. That is intended. Do not mark it
down for being undecided; help decide, or say what cheap evidence would.

## What Robin asks of you

1. **The modules (synthesis §3, `MODULARITY.md`).** The split into A to H is one proposal. You
   are free, and encouraged, to **propose a different split**: other seams, more or fewer
   modules, a different base. Argue it from your lens and say what it makes easier to build
   alone and easier to rethink. If you keep the proposed split: are these the right seams and
   contracts?
   Which module is secretly two, which two are one, which contract will leak, which module will
   need a rethink first and what that would cost the others? Is each really useful alone?
2. **The scheduler (§4).** Assess it at each of the three strengths. Read version 1's own record:
   store nodes `store/nodes/16/32` and `16/33`, `ctx/scripts/ctx_schedule.py`,
   `research/lean-on-existing-code-synthesis.md` (repository root `research/`).
3. **Tests and gates (§6).** Would this give tests and gates that earn trust without werkbank's
   weight? What is missing, what is theatre, what will grow?
4. **The open questions (§9).** Which matter most, which are missing, which can be answered
   cheaply now? Answer the ones your lens can.
5. **Rung 1 (§8).** What should it be, and what would make it useful to Robin within a week?

You are encouraged, as before, to do real work: a prior-art search by sub-agent, a small spike,
or digging in werkbank's or Doktoreltern v1's record.

## What to read, in order

1. `V2-SYNTHESIS.md`, then `MODULARITY.md`.
2. `reviews/SYNTHESIS.md` (the first panel, merged) and your own lens's first review in
   `reviews/`. Do not repeat it; say what the new framing changes.
3. The research your lens needs: `research/doktoreltern-design.md`,
   `research/doktoreltern-prior-art.md`, `research/sampletidy-port.md`,
   `research/werkbank-evidence.md`, the spike reports under `research/spike-*/REPORT.md`.
4. Version 1 itself and werkbank's record where you need to check a claim.

## Things to know

- Robin runs this on an 8 GB laptop on a subscription. The usage throttle is intended pacing;
  under it, usage per outcome is time. Never count throttle parks as a cost.
- His two feared failures: he does not trust the output, or it is too slow or too dear. His
  scarce resource is his attention.
- He wants one terminal session he can watch and step into. But he names a more important reason
  for a model orchestrator over a deterministic driver: it "can make decisions so not every
  possibility needs to be pre specified". When you weigh a resident model against a thin driver
  (the Economist's round-2 model finds the driver cheaper in tokens), count what pre-specifying
  cost werkbank: a driver that grew from 10.8k to 49.3k lines.
- Robin leans towards writing Doktoreltern itself in Rust, since he is interested in using Rust.
  The file-format survey (`research/file-formats.md`) recommends TOML, and Rust's `toml_edit`
  makes that stronger. The mod and SDK helper must be TypeScript whatever the tools are in.
- The round-2 evidence auditor has reported (`reviews/round-2/evidence-auditor.md`) and its
  corrections are in the synthesis. The largest: version 1's scheduler **as built** is not the
  scheduler as designed (three self-reported confidence levels, leaves-first order, no tracer
  path, no intensity). Read synthesis §4 as it now stands.
- A separate survey of file formats for the structured files (TOML against CUE, Jsonnet, KDL,
  Protobuf and others) is under way: `research/file-formats.md` when it lands.

## Your deliverable

One file, `reviews/round-2/<lens-name>.md`, at most 160 lines:

- a verdict in three lines;
- **the modules:** what you would change, with reasons;
- **the scheduler:** your assessment and the strength you would adopt, if any;
- **tests and gates:** your view;
- **open questions:** your answers to those your lens can answer, the ones you would add, and
  the three you think matter most;
- **rung 1:** what you would build first;
- MUST-fix (at most 4) and what must survive.

Detail from a search or spike goes in `reviews/round-2/<lens-name>-appendix.md`.

## Rules

- Write only your review file, your appendix, and scratch under
  `reviews/scratch/round-2-<lens-name>/`. Edit nothing else, in this repository or any other. No
  commits.
- Do not run werkbank's test suites or drivers. Do not run sampleTidy's tests. You may run
  Doktoreltern v1's `ctx` tests (`pytest` from `ctx/`, about 16 seconds).
- A spike may start real Claude sessions only on haiku, only in your scratch folder, small; say
  what you ran and what it cost; leave nothing running; accept no trust dialogs outside your
  scratch folder.
- You may use sub-agents, one at a time, sized to the job.
- Say which claims you checked. Mark what you did not verify.
