"""Autonomous move driver (N4): turn "which node next" into "run the loop".

`ctx_schedule` answers *which node* to work on. This module answers the rest of the
scheduler's job — the part a human was doing by hand:

- **which move** to run on that node (the deepen state-machine: DESIGN→PLAN→TEST→
  CONSTRUCT→VALIDATE, preceded by an INTERFACE floor move);
- **how to route the verdict** (advance the cursor, or fault back to an upstream move);
- **when to stop** (root folds `correct` → success; frontier empties; a global budget
  trips; or one node faults past a cap → escalation).

No network, no LLM. The *content* of a move — writing code, judging correctness — is an
**injected `dispatch` callable**, so unit tests drive the loop with scripted verdicts and
a real run drives it with sub-agent moves. The autonomy this module owns is precisely the
scheduling/routing judgement, not the move content.

Two things this build made explicit that the bare `next_node` priority hid:

1. **Readiness (bottom-up correctness).** `priority = centrality × (1 − confidence)`
   ranks the high-centrality root *first*, but a parent cannot be validated `correct`
   over `mock` children (the fidelity fold caps it). So in the deepen phase the driver
   gates on readiness: a node is only deepenable once its active children are `correct`.
   This forces leaves-first deepening. (Candidate to fold back into `ctx_schedule`.)

2. **Focus / WIP-lock.** DESIGN raises a node's confidence (low→tentative), which *drops*
   its priority mid-sequence — so a pure re-pick-each-tick scheduler thrashes away from a
   half-deepened node. The driver keeps focus: an in-progress node (live cursor) is
   preferred until it validates or faults out. With `focus=False` the thrash is
   observable (see the tests).

State is in-memory: the caller hands in a `states` dict and the static graph; persisting
back to a v2 store is out of scope (that is #42, not N4).
"""
from __future__ import annotations

from dataclasses import dataclass, field

import ctx_core
import ctx_schedule

# Deepen state-machine stages (cursor values) + the floor move.
INTERFACE = "interface"
DESIGN = "design"
PLAN = "plan"
TEST = "test"
CONSTRUCT = "construct"
VALIDATE = "validate"

_DEEPEN_NEXT = {DESIGN: PLAN, PLAN: TEST, TEST: CONSTRUCT, CONSTRUCT: VALIDATE}
_FAULT_TARGETS = {DESIGN, PLAN, CONSTRUCT}


@dataclass
class NodeRun:
    """Mutable per-node runtime the driver owns and advances.

    `fidelity`/`confidence` are the coarse gauges the scheduler reads; `cursor` is
    where the node sits in its deepen sequence (None = not yet started deepening);
    `done` marks a validated-correct node (auto-skipped thereafter).
    """
    fidelity: str = "stub"
    confidence: str = "low"
    cursor: str | None = None
    faults: int = 0
    done: bool = False


@dataclass
class Verdict:
    """A move's outcome, as returned by `dispatch`.

    `ok=True` advances; for VALIDATE it means *validated*. `ok=False` with `fault`
    set (design|plan|construct) routes the cursor back to that move; `ok=False`
    without `fault` is a same-stage retry (counts against the fault cap).
    """
    ok: bool
    fault: str | None = None
    note: str = ""


@dataclass
class Decision:
    """What the loop chose this tick — handed to `dispatch`, and logged."""
    tick: int
    node: int
    move: str


@dataclass
class RunResult:
    outcome: str                       # folded_correct | frontier_empty | budget_tripped | node_escalated
    trajectory: list = field(default_factory=list)   # list[(Decision, Verdict)]
    ticks: int = 0
    escalated: int | None = None       # the node id, when outcome == node_escalated


# --- model synthesis --------------------------------------------------------
def _synth_body(run: NodeRun, boundaries, aspects) -> str:
    lines = [f"📊 Fidelity: {run.fidelity}", f"🧭 Confidence: {run.confidence}"]
    if boundaries:
        # One comma-separated marker: collate overwrites per-marker, so separate
        # lines would keep only the last target (canonical form is the comma list).
        lines.append("🧱 Boundary: " + ", ".join(f"#{b}" for b in boundaries))
    lines += [f"🏷️ aspect: {a}" for a in aspects]
    return "\n".join(lines) + "\n"


def build_model(states, edges, boundaries=None, aspects=None) -> ctx_core.Model:
    """Collate a `ctx_core.Model` from the current runtime state + static graph.

    Rebuilt every tick so fidelity/confidence changes the driver makes are visible
    to the scheduler. `edges` is a set of (parent, child); `boundaries`/`aspects`
    are dict[node -> list].
    """
    boundaries = boundaries or {}
    aspects = aspects or {}
    parent_of = {child: parent for parent, child in edges}
    nodes = []
    for n, run in states.items():
        nodes.append(ctx_core.Node(
            n,
            _synth_body(run, boundaries.get(n, []), aspects.get(n, [])),
            "open", None, set(),
            parent=parent_of.get(n),
        ))
    return ctx_core.collate(nodes)


# --- move selection (the state-machine) -------------------------------------
def next_move(run: NodeRun, model, n) -> str:
    """The move to run on node `n` given where it is."""
    if ctx_schedule.FIDELITY_RANK.get(ctx_schedule.declared_fidelity(model, n), 0) \
            < ctx_schedule.FIDELITY_RANK[INTERFACE]:
        return INTERFACE
    if run.cursor is None:
        return DESIGN
    return run.cursor


# --- readiness (bottom-up correctness gate) ---------------------------------
def _active_children(model, n):
    return [c for p, c in model.tree_edges
            if p == n and c in model.nodes and c not in model.dormant]


def ready_for_deepen(model, eff, n) -> bool:
    """A node is deepenable only once its active children are all `correct`.

    Leaves are trivially ready. This is what forces leaves-first deepening despite
    the root's higher centrality.
    """
    return all(eff.get(c) == "correct" for c in _active_children(model, n))


# --- selection --------------------------------------------------------------
def select(model, states, done, *, pins=(), skips=(), focus=True):
    """Pick the next node to advance, or None."""
    skipset = set(skips) | set(done)
    if not ctx_schedule.floor_met(model):
        # Floor phase: honour the scheduler's own shallowest-first logic as-is.
        return ctx_schedule.next_node(model, pins=pins, skips=skipset)
    # Deepen phase: readiness gate (+ focus on in-progress work).
    eff = ctx_schedule.effective_fidelity(model)
    frontier = ctx_schedule.frontier(model) - skipset
    ready = {n for n in frontier if ready_for_deepen(model, eff, n)}
    if not ready:
        return None
    inprog = {n for n in ready if states[n].cursor is not None}
    pool = inprog if (focus and inprog) else ready
    return ctx_schedule.next_node(model, pins=tuple(pool), skips=skipset)


# --- routing (verdict → state transition) -----------------------------------
def route(run: NodeRun, move: str, verdict: Verdict) -> None:
    """Advance the node's runtime from a move's verdict. The fault router."""
    if move == INTERFACE:
        if verdict.ok:
            run.fidelity = INTERFACE
        else:
            run.faults += 1
        return
    if move == VALIDATE:
        if verdict.ok:
            run.fidelity = "correct"
            run.confidence = "high"
            run.cursor = None
            run.done = True
        else:
            # Route back to the faulted upstream move (design|plan|construct).
            run.cursor = verdict.fault if verdict.fault in _FAULT_TARGETS else PLAN
            run.faults += 1
        return
    # DESIGN / PLAN / TEST / CONSTRUCT
    if not verdict.ok:
        run.faults += 1
        return
    if move == DESIGN:
        run.confidence = "tentative"     # DESIGN firms up the approach
    if move == TEST:
        run.fidelity = "mock"            # suite exists; artefact still a mock
    run.cursor = _DEEPEN_NEXT[move]


# --- the loop ---------------------------------------------------------------
def run(states, edges, dispatch, *, roots=None, boundaries=None, aspects=None,
        budget=100, fault_cap=3, pins=(), skips=(), focus=True) -> RunResult:
    """Drive the tree to `correct`, or stop with a reason.

    `dispatch(decision, model) -> Verdict` is the injected move executor.
    Returns a `RunResult` with the full trajectory for inspection.
    """
    if roots is None:
        children = {c for _, c in edges}
        roots = sorted({n for n in states} - children) or sorted(states)[:1]
    # Seed the skip set from nodes handed in already validated-correct, so an
    # incremental run does not re-deepen work that is already done.
    done = {n for n, r in states.items() if r.done or r.fidelity == "correct"}
    trajectory = []
    for tick in range(1, budget + 1):
        model = build_model(states, edges, boundaries, aspects)
        eff = ctx_schedule.effective_fidelity(model)
        if all(eff.get(r) == "correct" for r in roots):
            return RunResult("folded_correct", trajectory, tick - 1)
        n = select(model, states, done, pins=pins, skips=skips, focus=focus)
        if n is None:
            return RunResult("frontier_empty", trajectory, tick - 1)
        move = next_move(states[n], model, n)
        decision = Decision(tick, n, move)
        verdict = dispatch(decision, model)
        route(states[n], move, verdict)
        trajectory.append((decision, verdict))
        if states[n].done:
            done.add(n)
        if states[n].faults > fault_cap:
            return RunResult("node_escalated", trajectory, tick, escalated=n)
    return RunResult("budget_tripped", trajectory, budget)
