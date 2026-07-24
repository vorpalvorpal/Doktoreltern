"""Behaviour spec for the scheduler analytical core (#32 / D-core).

Pure functions over a collated Model: the four axes (fidelity fold, confidence,
centrality, priority) and the floor-first → best-first node selection.
"""
import pytest

ctx_core = pytest.importorskip("ctx_core")
ctx_schedule = pytest.importorskip("ctx_schedule")
C = ctx_core


def N(num, body, state="open", reason=None, labels=(), parent=None):
    return C.Node(num, body, state, reason, set(labels), parent=parent)


def _model(nodes):
    return C.collate(nodes)


# --- fidelity fold ----------------------------------------------------------
class TestEffectiveFidelity:
    def test_parent_folds_to_min_over_children(self):
        m = _model([
            N(1, "# r\n📊 Fidelity: correct\n"),
            N(2, "📊 Fidelity: mock\n", parent=1),
            N(3, "📊 Fidelity: interface\n", parent=1),
        ])
        eff = ctx_schedule.effective_fidelity(m)
        assert eff[1] == "interface"                 # min(correct, mock, interface)
        assert eff[2] == "mock" and eff[3] == "interface"   # leaves = own

    def test_dormant_child_excluded_from_fold(self):
        m = _model([
            N(1, "# r\n📊 Fidelity: correct\n"),
            N(2, "📊 Fidelity: stub\n", state="closed", labels=("dormant",), parent=1),
        ])
        assert ctx_schedule.effective_fidelity(m)[1] == "correct"   # dormant stub ignored


# --- derived fidelity (#33: unstamped internal nodes) -------------------------
class TestDerivedFidelity:
    def test_unstamped_parent_derives_min_over_children(self):
        # no 📊 marker on the parent: fidelity is the children's fold, not a
        # permanent stub cap — all-correct children read back as correct.
        m = _model([
            N(1, "# r\n"),
            N(2, "📊 Fidelity: correct\n", parent=1),
            N(3, "📊 Fidelity: correct\n", parent=1),
        ])
        assert ctx_schedule.effective_fidelity(m)[1] == "correct"

    def test_unstamped_parent_capped_by_weakest_child(self):
        m = _model([
            N(1, "# r\n"),
            N(2, "📊 Fidelity: correct\n", parent=1),
            N(3, "📊 Fidelity: mock\n", parent=1),
        ])
        assert ctx_schedule.effective_fidelity(m)[1] == "mock"

    def test_unstamped_leaf_defaults_stub(self):
        m = _model([N(1, "# r\n")])
        assert ctx_schedule.effective_fidelity(m)[1] == "stub"

    def test_unstamped_parent_with_only_dormant_children_is_a_leaf(self):
        # "active children" = open, non-dormant: with none, the node is a leaf
        # and defaults to stub rather than deriving from parked work.
        m = _model([
            N(1, "# r\n"),
            N(2, "📊 Fidelity: correct\n", state="closed", labels=("dormant",),
              parent=1),
        ])
        assert ctx_schedule.effective_fidelity(m)[1] == "stub"

    def test_stamped_parent_still_folds_own_glue(self):
        # an explicit stamp is the node's own glue: it stays in the fold even
        # when every child outranks it.
        m = _model([
            N(1, "# r\n📊 Fidelity: interface\n"),
            N(2, "📊 Fidelity: correct\n", parent=1),
        ])
        assert ctx_schedule.effective_fidelity(m)[1] == "interface"


# --- confidence -------------------------------------------------------------
class TestConfidence:
    def test_derived_from_qv_overrides_declared(self):
        m = _model([N(1, "# r\n🧭 Confidence: high\n"
                         "❓ Question: #1.q1 answered\n❓ Question: #1.q2 open\n")])
        assert ctx_schedule.confidence_label(m, 1) == "tentative"   # 1/2 resolved

    def test_falls_back_to_declared_marker_without_qv(self):
        m = _model([N(1, "# r\n🧭 Confidence: high\n")])
        assert ctx_schedule.confidence_label(m, 1) == "high"
        assert ctx_schedule.confidence_value(m, 1) == 1.0

    def test_defaults_low(self):
        assert ctx_schedule.confidence_label(_model([N(1, "# r\n")]), 1) == "low"


# --- centrality / priority --------------------------------------------------
class TestCentrality:
    def test_counts_descendants_boundary_blocked_and_aspects(self):
        m = _model([
            N(1, "# r\n"),
            N(2, "🧱 Boundary: #3\n⛔ Blocked-by: #3\n🏷️ aspect: x\n", parent=1),
            N(3, "leaf\n", parent=2),
        ])
        cen = ctx_schedule.centrality(m)
        assert cen[1] == 2     # 2 descendants (#2, #3)
        assert cen[2] == 2     # 1 descendant (#3) + 1 aspect
        assert cen[3] == 2     # boundary-in 1 + blocked-in 1 from #2

    def test_priority_is_centrality_times_one_minus_confidence(self):
        m = _model([N(1, "# r\n🧭 Confidence: low\n"), N(2, "leaf\n", parent=1)])
        assert ctx_schedule.priority(m)[1] == 1.0     # centrality 1 × (1 − 0)


# --- frontier / floor / selection -------------------------------------------
class TestSelection:
    def test_frontier_excludes_closed_and_dormant(self):
        m = _model([
            N(1, "# r\n"),
            N(2, "leaf\n", state="closed", reason="completed", parent=1),
            N(3, "leaf\n", state="closed", labels=("dormant",), parent=1),
        ])
        assert ctx_schedule.frontier(m) == {1}

    def test_floor_not_met_with_a_stub(self):
        m = _model([N(1, "# r\n📊 Fidelity: interface\n"),
                    N(2, "📊 Fidelity: stub\n", parent=1)])
        assert ctx_schedule.floor_met(m) is False

    def test_floor_met_when_all_at_least_interface(self):
        m = _model([N(1, "# r\n📊 Fidelity: interface\n"),
                    N(2, "📊 Fidelity: mock\n", parent=1)])
        assert ctx_schedule.floor_met(m) is True

    def test_floor_met_ignores_unstamped_internal_nodes(self):
        # the unstamped parent has no stamp to raise (#33) — its children carry
        # the floor, so it does not hold floor_met false forever.
        m = _model([N(1, "# r\n"),
                    N(2, "📊 Fidelity: interface\n", parent=1)])
        assert ctx_schedule.floor_met(m) is True

    def test_unstamped_leaf_still_blocks_the_floor(self):
        m = _model([N(1, "# r\n📊 Fidelity: interface\n"),
                    N(2, "leaf\n", parent=1)])
        assert ctx_schedule.floor_met(m) is False

    def test_floor_phase_never_picks_an_unstamped_internal_node(self):
        # the root is shallowest but derives its fidelity — the floor move must
        # go to the stamped stub leaf instead.
        m = _model([N(1, "# r\n"),
                    N(2, "📊 Fidelity: stub\n", parent=1)])
        assert ctx_schedule.floor_met(m) is False
        assert ctx_schedule.next_node(m) == 2

    def test_floor_first_picks_shallowest_sub_interface_node(self):
        m = _model([N(1, "# r\n📊 Fidelity: stub\n"),
                    N(2, "📊 Fidelity: stub\n", parent=1)])
        assert ctx_schedule.next_node(m) == 1     # root is shallowest

    def test_best_first_picks_max_priority_when_floor_met(self):
        m = _model([
            N(1, "# r\n📊 Fidelity: interface\n🧭 Confidence: high\n"),
            N(2, "📊 Fidelity: interface\n🧭 Confidence: low\n"
                 "🏷️ aspect: a\n🏷️ aspect: b\n", parent=1),
        ])
        assert ctx_schedule.next_node(m) == 2     # higher centrality, lower confidence

    def test_skips_excluded_and_pins_forced(self):
        m = _model([
            N(1, "# r\n📊 Fidelity: interface\n🧭 Confidence: low\n🏷️ aspect: a\n"),
            N(2, "📊 Fidelity: interface\n🧭 Confidence: low\n", parent=1),
        ])
        assert ctx_schedule.next_node(m, skips=[1]) == 2   # #1 outranks but is skipped
        assert ctx_schedule.next_node(m, pins=[2]) == 2    # pin forces #2

    def test_empty_frontier_returns_none(self):
        m = _model([N(1, "# r\n", state="closed", reason="completed")])
        assert ctx_schedule.next_node(m) is None


# --- readiness honours Blocked-by dependency edges (F3, #32.q5) --------------
class TestReadinessBlockedBy:
    def test_blocked_by_dependency_gates_deepening(self):
        # #2 is a leaf (tree-readiness alone says ready) but depends on sibling #3
        # through a uses-edge; #3 is only `mock`, so #2 is not deepen_ready yet.
        m = _model([
            N(1, "# r\n"),
            N(2, "⛔ Blocked-by: #3\n📊 Fidelity: interface\n", parent=1),
            N(3, "📊 Fidelity: mock\n", parent=1),
        ])
        assert ctx_schedule.deepen_ready(m, 2) is False
        assert ctx_schedule.deepen_ready(m, 3) is True     # leaf, no deps

    def test_ready_once_the_dependency_is_correct(self):
        m = _model([
            N(1, "# r\n"),
            N(2, "⛔ Blocked-by: #3\n📊 Fidelity: interface\n", parent=1),
            N(3, "📊 Fidelity: correct\n", parent=1),
        ])
        assert ctx_schedule.deepen_ready(m, 2) is True

    def test_dangling_or_dormant_dependency_does_not_block_forever(self):
        # a Blocked-by to a node absent from the frontier is skipped (same
        # _active filter as children) — it cannot wedge readiness shut.
        m = _model([
            N(1, "# r\n"),
            N(2, "⛔ Blocked-by: #99\n📊 Fidelity: interface\n", parent=1),
            N(3, "📊 Fidelity: correct\n", labels=("dormant",),
              state="closed", parent=1),
        ])
        assert ctx_schedule.deepen_ready(m, 2) is True

    def test_blocked_by_and_children_both_required(self):
        # #2 has both a child (#4) and a dependency (#3); both must be correct.
        m = _model([
            N(1, "# r\n"),
            N(2, "⛔ Blocked-by: #3\n", parent=1),
            N(3, "📊 Fidelity: correct\n", parent=1),
            N(4, "📊 Fidelity: mock\n", parent=2),
        ])
        assert ctx_schedule.deepen_ready(m, 2) is False    # child #4 not correct
        m2 = _model([
            N(1, "# r\n"),
            N(2, "⛔ Blocked-by: #3\n", parent=1),
            N(3, "📊 Fidelity: mock\n", parent=1),
            N(4, "📊 Fidelity: correct\n", parent=2),
        ])
        assert ctx_schedule.deepen_ready(m2, 2) is False   # dependency #3 not correct
