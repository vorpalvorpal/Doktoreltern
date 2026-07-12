"""Behaviour spec for the rev-6 invariant checks I9, I12, I13 (context-spec.md §6).

I10 (cross-reference resolution) and I11 (value-set validity) are deferred:
value validity is enforced at parse time, and prose cross-reference scanning is
noisy.
"""
import pytest

ctx_core = pytest.importorskip("ctx_core")
C = ctx_core


def _f(check, nodes):
    return C.CHECKS[check](C.collate(nodes), C.Platform(set(), {}, True))


class TestI9KeyedIdOwnership:
    def test_id_issue_part_must_match_carrying_node(self):
        node = C.Node(17, "❓ Question: #16.q1 open mismatched\n", "open", None, set())
        assert any(x.key == "I9" for x in _f("I9", [node]))

    def test_matching_id_is_clean(self):
        node = C.Node(17, "❓ Question: #17.q1 open fine\n", "open", None, set())
        assert all(x.key != "I9" for x in _f("I9", [node]))


class TestI12Dormant:
    def test_dormant_label_must_be_closed(self):
        node = C.Node(18, "x\n", "open", None, {"dormant"})
        assert any(x.key == "I12" for x in _f("I12", [node]))

    def test_closed_dormant_is_clean(self):
        node = C.Node(18, "x\n", "closed", "not_planned", {"dormant"})
        assert all(x.key != "I12" for x in _f("I12", [node]))


class TestI13FidelityRollUp:
    def _tree(self, child_fid, child_state="open", child_reason=None, child_labels=()):
        parent = C.Node(16, "📊 Fidelity: correct\n", "open", None, set())
        child = C.Node(17, f"📊 Fidelity: {child_fid}\n",
                       child_state, child_reason, set(child_labels), parent=16)
        return [parent, child]

    def test_correct_parent_with_lagging_child_flags(self):
        assert any(x.key == "I13" for x in _f("I13", self._tree("mock")))

    def test_all_correct_is_clean(self):
        assert all(x.key != "I13" for x in _f("I13", self._tree("correct")))

    def test_dormant_child_is_exempt(self):
        nodes = self._tree("stub", child_state="closed", child_reason="not_planned",
                           child_labels=["dormant"])
        assert all(x.key != "I13" for x in _f("I13", nodes))


class TestI14GaugeConsistency:
    def test_high_confidence_on_a_mock_node_flags(self):
        node = C.Node(1, "📊 Fidelity: interface\n🧭 Confidence: high\n", "open", None, set())
        assert any(x.key == "I14" for x in _f("I14", [node]))

    def test_high_confidence_on_a_correct_node_is_clean(self):
        node = C.Node(1, "📊 Fidelity: correct\n🧭 Confidence: high\n", "open", None, set())
        assert all(x.key != "I14" for x in _f("I14", [node]))

    def test_tentative_confidence_on_a_mock_node_is_clean(self):
        node = C.Node(1, "📊 Fidelity: interface\n🧭 Confidence: tentative\n", "open", None, set())
        assert all(x.key != "I14" for x in _f("I14", [node]))

    def test_high_confidence_without_a_fidelity_marker_is_exempt(self):
        # off the fidelity ladder → pure design/discussion node, not flagged.
        node = C.Node(1, "🧭 Confidence: high\n", "open", None, set())
        assert all(x.key != "I14" for x in _f("I14", [node]))
