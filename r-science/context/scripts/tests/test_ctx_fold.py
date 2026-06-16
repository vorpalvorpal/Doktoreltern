"""Behaviour spec for the comment-fold in collate() (context-spec.md §4).

collate folds [body @ seq 0] + comments latest-wins per kind/key, producing the
registries, gauges, effective seal (with ancestor inheritance), the dormant set,
and the confidence inputs.
"""
import pytest

ctx_core = pytest.importorskip("ctx_core")
C = ctx_core


def _node(number, body, comments=(), state="open", reason=None, labels=()):
    cs = [C.Comment(seq, text) for seq, text in comments]
    return C.Node(number, body, state, reason, set(labels), cs)


class TestKeyedFold:
    def test_later_comment_supersedes_by_id(self):
        node = _node(
            16,
            "⚖️ Alternative: #16.alt1 rejected censoring breaks it\n",
            comments=[(3, "⚖️ Alternative: #16.alt1 viable data is uncensored\n")],
        )
        model = C.collate([node])
        alts = model.registries[C.ALTERNATIVE]
        assert alts == [(16, C.Keyed("#16.alt1", "viable", "data is uncensored"))]

    def test_distinct_ids_both_present(self):
        node = _node(16, "🔮 Future: #16.fd1 declared A\n🔮 Future: #16.fd2 declared B\n")
        model = C.collate([node])
        assert len(model.registries[C.FUTURE]) == 2

    def test_dead_end_registry_and_index(self):
        node = _node(17, "🧩 Part-of: #16\n🪦 Dead-end: #17.de1\n> tried X\n")
        model = C.collate([_node(16, "root\n"), node])
        assert 17 in model.dead_ends
        assert model.registries[C.DEAD_END][0][0] == 17


class TestGaugeFold:
    def test_latest_gauge_wins(self):
        node = _node(16, "🧭 Confidence: low\n📊 Fidelity: stub\n",
                     comments=[(2, "🧭 Confidence: high\n")])
        model = C.collate([node])
        assert model.gauges[16]["confidence"] == "high"
        assert model.gauges[16]["fidelity"] == "stub"


class TestSeal:
    def test_default_is_sealed(self):
        model = C.collate([_node(16, "root\n")])
        assert model.seal[16] == "sealed"

    def test_unseal_inherits_to_children(self):
        parent = _node(16, "🔒 Seal: unsealed @rjs 2026-06-16\n")
        child = _node(17, "🧩 Part-of: #16\n")
        model = C.collate([parent, child])
        assert model.seal[16] == "unsealed"
        assert model.seal[17] == "unsealed"        # inherited

    def test_child_can_reseal_within_unsealed(self):
        parent = _node(16, "🔒 Seal: unsealed @rjs 2026-06-16\n")
        child = _node(17, "🧩 Part-of: #16\n🔒 Seal: sealed @rjs 2026-06-16\n")
        model = C.collate([parent, child])
        assert model.seal[17] == "sealed"


class TestDormant:
    def test_closed_dormant_node_is_dormant(self):
        node = _node(18, "🧩 Part-of: #16\n", state="closed", reason="not_planned",
                     labels=["dormant"])
        model = C.collate([_node(16, "root\n"), node])
        assert 18 in model.dormant

    def test_closed_without_label_is_not_dormant(self):
        node = _node(18, "x\n", state="closed", reason="completed")
        model = C.collate([node])
        assert 18 not in model.dormant


class TestConfidenceInput:
    def test_resolved_fraction(self):
        body = ("❓ Question: #16.q1 answered yes\n"
                "❓ Question: #16.q2 open still unsure\n"
                "✅ Validation: #16.v1 met checked\n")
        model = C.collate([_node(16, body)])
        assert model.confidence_inputs[16] == (2, 3)   # q1 + v1 resolved of 3
