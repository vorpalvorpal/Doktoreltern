# Why werkbank v3's segmented orchestrator became a driver

Research hand-back, 2026-10-06 (sonnet sub-agent, read-only), saved by the main session.

## 1. Was v3.0's segmented orchestrator run on a real build?

Barely, and the record is partly self-contradictory.

- CHANGELOG.md:4225-4229 (v3.3): "v3.0-v3.2 were built but never run end-to-end." The shakedown
  ran on sampleTidy instead of stellwerk: PLAN-15, 2026-07-23 to 07-29, reaching Phase-9 sign-off
  at 4592 green tests. The record does not say whether segment-runner drove that run.
- CHANGELOG.md:3708-3711 (v5, 2026-08-10): "the segmented runner was never actually used on a real
  build". The stated reason is that it was write-only for the operator: no way to watch it, speak
  to it, or stop it except Ctrl-C mid-segment, which strands a live worker.
- It was later used on stellwerk v4 in September. Segment 2 was SIGKILLed by the 90-minute cap
  (CHANGELOG.md:2793). Segment 14 parked on a TOML typo (CHANGELOG.md:2089). The record gives no
  segment counts, costs or turn numbers against the v2 baseline.
- V3-SCOPING.md:219-225 acceptance criteria (overnight run, no segment over ~150 turns, askability
  spot-check) have no recorded result that the agent found.
- The stellwerk v3 build was closed early by Robin ("v3 is not progressing", 2026-08-09). That
  run's MERI ledger (M-1..M-69) drove V4.

## 2. Stated reasons for moving flow control into the driver

- (a) Context and cost. V3-SCOPING.md:25-30: the 837-turn resident cost about 75% of spend with
  quadratic context growth. V8-SCOPING.md:43 (D1) calls the driver "the endpoint V3-SCOPING.md
  named".
- (b) Plumbing. V3-SCOPING.md:25-27: at least 80% of orchestrator turns were plumbing, 37% of them
  babysitting gates. CHANGELOG.md:3703-3707: segmenting fixed residency but not plumbing, so W8
  (the driver) was needed.
- (c) Protocol non-adherence. V3-SCOPING.md:79-83: the v2 orchestrator edited the skill without
  go-ahead, and prose rules decay across compaction. research/v4-change-set.md:24-26: "prose-only
  rules are presumed dead on arrival". The MERI notes show orchestrator errors that were not
  residency problems (M-2, M-9, M-35; research/stellwerk-v3-meri-notes.md:38, 208, 374).
- (d) Crash, resume and unattended running. CHANGELOG.md:2089-2105: a malformed `run-state.md`
  cursor parked the run and was caught only at read time. CHANGELOG.md:2793-2842: the 90-minute
  segment cap killed a worker. V8-SCOPING.md:70 (D28) and :186 (item 32): segment end kills a live
  worker.
- (e) Other. CHANGELOG.md:4518-4520: `run-state.md` had no slot for gate state, so a segment that
  compacted before adjudicating left findings nothing pointed at.

## 3. Which reasons still bite in the successor design

- (a) and (b) are largely removed by in-session resets and CLI tools.
- (c) still bites. Hooks cover only the invariants enumerated. v4's lesson is that every
  unenforced rule decays, so the set of mechanical checks keeps growing. Judgement errors by the
  orchestrator (M-2, M-9, M-35) are not residency problems, and resets do not fix them.
- (d) is partly removed if tools write the checkpoint (the typo class goes). The runner's other
  jobs remain: crash relaunch, usage-limit parking, halt and notes channels, and not stranding a
  live worker at a reset or cap. V8 D28 shows throttling makes wall-clock caps wrong.
- (e) still applies: any state a reset must preserve needs a slot in the checkpoint.
- The v8 driver also owns worker lifetime and MERI telemetry, which a model orchestrator would
  have to preserve.

## 4. Evidence that a segmented or hydrated model orchestrator worked well

None found. V3-SCOPING.md:58-59 claims v2 "survived twice" on its 3-session cold hydration; that
is a claim about v2, not a measurement. The record is silent on any measured quality or cost win
from segmentation.
