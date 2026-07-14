"""Behaviour spec for the autonomous move driver (N4).

The loop logic — move state-machine, fault routing, readiness gate, focus/WIP-lock,
budget & escalation — driven deterministically with scripted dispatchers (no LLM).
"""
import pytest

ctx_core = pytest.importorskip("ctx_core")
ctx_schedule = pytest.importorskip("ctx_schedule")
D = pytest.importorskip("ctx_driver")


# --- helpers ----------------------------------------------------------------
def run_at(**fid_conf):
    """NodeRun with an explicit (fidelity, confidence); cursor None."""
    fid, conf = fid_conf.get("fid", "interface"), fid_conf.get("conf", "low")
    return D.NodeRun(fidelity=fid, confidence=conf)


class Script:
    """Dispatcher returning canned verdicts by (node, move); default = ok.

    A rule value may be a `Verdict` or a zero-arg callable (for stateful rules).
    Records every (node, move) dispatched in `.calls`.
    """
    def __init__(self, rules=None):
        self.rules = rules or {}
        self.calls = []

    def __call__(self, decision, model):
        self.calls.append((decision.node, decision.move))
        v = self.rules.get((decision.node, decision.move))
        if callable(v):
            return v()
        return v if v is not None else D.Verdict(ok=True)

    def nodes_seq(self):
        return [n for n, _ in self.calls]


def fault_n_times(n, fault):
    """A stateful rule: fault `n` times, then ok forever."""
    box = {"left": n}
    def rule():
        if box["left"] > 0:
            box["left"] -= 1
            return D.Verdict(ok=False, fault=fault)
        return D.Verdict(ok=True)
    return rule


# --- move state-machine (pure) ----------------------------------------------
class TestNextMove:
    def test_below_interface_gets_the_floor_move(self):
        m = D.build_model({1: D.NodeRun(fidelity="stub")}, set())
        assert D.next_move(D.NodeRun(fidelity="stub"), m, 1) == D.INTERFACE

    def test_fresh_interface_node_starts_at_design(self):
        m = D.build_model({1: run_at(fid="interface")}, set())
        assert D.next_move(run_at(fid="interface"), m, 1) == D.DESIGN

    def test_mid_sequence_returns_the_cursor(self):
        m = D.build_model({1: run_at()}, set())
        run = D.NodeRun(fidelity="interface", cursor=D.TEST)
        assert D.next_move(run, m, 1) == D.TEST

    def test_unstamped_internal_node_skips_the_floor_move(self):
        # fidelity=None on a node with children: derived (#33) — no INTERFACE
        # stamp of its own to raise, so deepening starts at DESIGN directly.
        states = {1: D.NodeRun(fidelity=None), 2: run_at()}
        m = D.build_model(states, {(1, 2)})
        assert D.next_move(states[1], m, 1) == D.DESIGN

    def test_unstamped_leaf_still_takes_the_floor_move(self):
        states = {1: D.NodeRun(fidelity=None)}
        m = D.build_model(states, set())
        assert D.next_move(states[1], m, 1) == D.INTERFACE


class TestRoute:
    def test_deepen_advances_cursor_and_gauges(self):
        run = D.NodeRun(fidelity="interface", cursor=D.DESIGN)
        D.route(run, D.DESIGN, D.Verdict(ok=True))
        assert run.cursor == D.PLAN and run.confidence == "tentative"
        D.route(run, D.PLAN, D.Verdict(ok=True))
        assert run.cursor == D.TEST
        D.route(run, D.TEST, D.Verdict(ok=True))
        assert run.cursor == D.CONSTRUCT and run.fidelity == "mock"
        D.route(run, D.CONSTRUCT, D.Verdict(ok=True))
        assert run.cursor == D.VALIDATE

    def test_validate_ok_marks_correct_and_done(self):
        run = D.NodeRun(fidelity="mock", cursor=D.VALIDATE)
        D.route(run, D.VALIDATE, D.Verdict(ok=True))
        assert run.done and run.fidelity == "correct" and run.confidence == "high"
        assert run.cursor is None

    def test_validate_fault_routes_back_to_named_move(self):
        run = D.NodeRun(fidelity="mock", cursor=D.VALIDATE)
        D.route(run, D.VALIDATE, D.Verdict(ok=False, fault=D.PLAN))
        assert run.cursor == D.PLAN and run.faults == 1 and not run.done

    def test_validate_fault_without_target_defaults_to_plan(self):
        run = D.NodeRun(cursor=D.VALIDATE)
        D.route(run, D.VALIDATE, D.Verdict(ok=False))
        assert run.cursor == D.PLAN


# --- the loop: happy path ---------------------------------------------------
class TestHappyPath:
    def _tree(self):
        # root 1 with two leaf children; all wired to interface, low confidence.
        states = {1: run_at(), 2: run_at(), 3: run_at()}
        edges = {(1, 2), (1, 3)}
        aspects = {2: ["a"], 3: ["b"]}   # give leaves nonzero centrality
        return states, edges, aspects

    def test_drives_whole_tree_to_correct(self):
        states, edges, aspects = self._tree()
        disp = Script()
        res = D.run(states, edges, disp, aspects=aspects, budget=100)
        assert res.outcome == "folded_correct"
        assert all(states[n].done for n in (1, 2, 3))
        # each node ran the full 5-move deepen sequence.
        assert len(disp.calls) == 15

    def test_readiness_deepens_leaves_before_the_root(self):
        states, edges, aspects = self._tree()
        disp = Script()
        D.run(states, edges, disp, aspects=aspects, budget=100)
        # the root (#1) has the highest centrality, but no #1 move may appear
        # until both leaves are correct (readiness gate → leaves first).
        seq = disp.nodes_seq()
        first_root = seq.index(1)
        assert set(seq[:first_root]) == {2, 3}       # only leaves before the root
        # and everything before the root is a completed leaf pass (10 moves).
        assert first_root == 10


# --- readiness gate in isolation --------------------------------------------
class TestModelSynth:
    def test_multi_target_boundary_gives_each_target_in_degree(self):
        # a single node pointing at three others via one Boundary marker →
        # each target gets +1 centrality (regression: was overwritten to last only).
        states = {1: run_at(), 2: run_at(), 3: run_at(), 4: run_at()}
        edges = {(1, 2), (1, 3), (1, 4)}
        m = D.build_model(states, edges, boundaries={1: [2, 3, 4]})
        cen = ctx_schedule.centrality(m)
        assert cen[2] >= 1 and cen[3] >= 1 and cen[4] >= 1

    def test_unstamped_run_reaches_the_model_as_marker_absence(self):
        # fidelity=None synthesizes *no* 📊 line — the scheduler must see the
        # node as unstamped, not as an explicit stub.
        m = D.build_model({1: D.NodeRun(fidelity=None)}, set())
        assert ctx_schedule.raw_fidelity(m, 1) is None
        assert ctx_schedule.declared_fidelity(m, 1) == "stub"   # default intact


class TestDerivedFidelityRun:
    def test_unstamped_parent_folds_correct_without_a_floor_move(self):
        # end-to-end: the parent carries no stamp; the leaves take the floor
        # move and deepen, and the parent's derived fidelity folds the tree.
        states = {1: D.NodeRun(fidelity=None),
                  2: D.NodeRun(fidelity="stub"), 3: D.NodeRun(fidelity="stub")}
        edges = {(1, 2), (1, 3)}
        disp = Script()
        res = D.run(states, edges, disp, budget=100)
        assert res.outcome == "folded_correct"
        assert (2, D.INTERFACE) in disp.calls and (3, D.INTERFACE) in disp.calls
        # with no stamp the parent has no glue of its own: its fidelity is read
        # off the children, so once both leaves validate the fold terminates the
        # run — the parent is never dispatched any move (INTERFACE included).
        assert all(nd != 1 for nd, _ in disp.calls)


class TestReadiness:
    def test_high_centrality_root_is_not_touched_first(self):
        # The root outranks the leaf on raw priority, but readiness (now first-class
        # in ctx_schedule.next_node) defers it until the leaf is correct.
        states = {1: run_at(), 2: run_at()}
        edges = {(1, 2)}
        aspects = {1: ["a"], 2: ["b"]}
        disp = Script()
        D.run(states, edges, disp, aspects=aspects, budget=100)
        assert disp.calls[0][0] == 2                 # leaf first, not the root
        # readiness does the work: raw priority prefers #1, next_node still picks #2.
        m = D.build_model({1: run_at(), 2: run_at()}, edges, aspects=aspects)
        assert ctx_schedule.priority(m)[1] > ctx_schedule.priority(m)[2]
        assert ctx_schedule.next_node(m) == 2        # readiness gate overrides priority


# --- focus / WIP-lock vs thrash ---------------------------------------------
class TestFocus:
    def _siblings(self):
        states = {1: run_at(), 2: run_at(), 3: run_at()}
        edges = {(1, 2), (1, 3)}
        aspects = {2: ["a"], 3: ["b"]}      # nonzero, equal centrality
        return states, edges, aspects

    def test_focus_finishes_a_node_before_starting_another(self):
        states, edges, aspects = self._siblings()
        disp = Script()
        D.run(states, edges, disp, aspects=aspects, budget=100, focus=True)
        # first node touched is fully deepened (5 moves) before the second appears.
        seq = disp.nodes_seq()
        first = seq[0]
        assert seq[:5] == [first] * 5

    def test_without_focus_the_confidence_bump_thrashes(self):
        states, edges, aspects = self._siblings()
        disp = Script()
        D.run(states, edges, disp, aspects=aspects, budget=100, focus=False)
        # DESIGN raises #2's confidence, dropping its priority below #3's → the
        # scheduler switches away mid-sequence. Observable: the 2nd move is on a
        # different node than the 1st.
        seq = disp.nodes_seq()
        assert seq[0] != seq[1]
        # both still eventually complete (thrash is inefficient, not incorrect).
        assert all(states[n].done for n in (1, 2, 3))


# --- fault routing end to end -----------------------------------------------
class TestFaultRouting:
    def test_validate_fault_reruns_from_plan_then_succeeds(self):
        states = {1: run_at()}
        edges = set()
        # #1 validates false→fault(plan) once, then ok.
        disp = Script({(1, D.VALIDATE): fault_n_times(1, D.PLAN)})
        res = D.run(states, edges, disp, roots=[1], budget=100)
        assert res.outcome == "folded_correct" and states[1].done
        moves = [mv for (nd, mv) in disp.calls]
        # design, plan, test, construct, validate(fault), then plan..validate(ok)
        assert moves == [D.DESIGN, D.PLAN, D.TEST, D.CONSTRUCT, D.VALIDATE,
                         D.PLAN, D.TEST, D.CONSTRUCT, D.VALIDATE]


# --- termination: budget & escalation ---------------------------------------
class TestTermination:
    def test_budget_trips(self):
        states = {1: run_at(), 2: run_at()}
        edges = {(1, 2)}
        disp = Script()
        res = D.run(states, edges, disp, budget=3)
        assert res.outcome == "budget_tripped" and res.ticks == 3

    def test_node_escalates_after_fault_cap(self):
        states = {1: run_at()}
        edges = set()
        # #1 keeps faulting validation → never converges → escalate.
        disp = Script({(1, D.VALIDATE): D.Verdict(ok=False, fault=D.PLAN)})
        res = D.run(states, edges, disp, roots=[1], budget=100, fault_cap=2)
        assert res.outcome == "node_escalated" and res.escalated == 1
        assert states[1].faults > 2

    def test_already_correct_children_are_not_redeepened(self):
        # incremental run: two leaves already correct, one still interface.
        states = {
            1: run_at(),
            2: D.NodeRun(fidelity="correct", confidence="high", done=True),
            3: run_at(),
        }
        edges = {(1, 2), (1, 3)}
        disp = Script()
        res = D.run(states, edges, disp, roots=[1], budget=100)
        assert res.outcome == "folded_correct"
        touched = {n for n, _ in disp.calls}
        assert 2 not in touched                      # already done → never re-dispatched
        assert {1, 3} <= touched

    def test_all_correct_terminates_immediately(self):
        states = {1: D.NodeRun(fidelity="correct", confidence="high", done=True)}
        disp = Script()
        res = D.run(states, set(), disp, roots=[1], budget=100)
        assert res.outcome == "folded_correct" and res.ticks == 0
        assert disp.calls == []
