"""Behaviour spec for the gauge + seal markers (context-spec.md §5.1-5.2).

Unkeyed, single-valued markers that fit the base grammar exactly. Additive over
ctx_core's original vocabulary; the round-trip property must still hold, and a
value outside the allowed set is a Finding (never a silent drop).
"""
import pytest

ctx_core = pytest.importorskip("ctx_core")


class TestConfidenceGauge:
    def test_parses_confidence(self):
        """`🧭 Confidence: tentative` → one CONFIDENCE marker."""
        markers = ctx_core.parse("🧭 Confidence: tentative\n").markers
        assert markers == [ctx_core.Marker(ctx_core.CONFIDENCE, "tentative", 1)]

    def test_value_outside_set_is_a_finding(self):
        """An unknown level is recorded as a Finding, not registered."""
        parsed = ctx_core.parse("🧭 Confidence: banana\n")
        assert parsed.markers == []
        assert len(parsed.findings) == 1
        assert parsed.findings[0].line == 1

    @pytest.mark.parametrize("v", ["low", "tentative", "high"])
    def test_round_trips(self, v):
        m = ctx_core.Marker(ctx_core.CONFIDENCE, v, 1)
        assert ctx_core.parse(ctx_core.render(m)).markers == [m]


class TestFidelityGauge:
    def test_parses_fidelity(self):
        """`📊 Fidelity: interface` → one FIDELITY marker."""
        markers = ctx_core.parse("📊 Fidelity: interface\n").markers
        assert markers == [ctx_core.Marker(ctx_core.FIDELITY, "interface", 1)]

    def test_value_outside_set_is_a_finding(self):
        parsed = ctx_core.parse("📊 Fidelity: nope\n")
        assert parsed.markers == []
        assert len(parsed.findings) == 1

    @pytest.mark.parametrize("v", ["stub", "interface", "mock", "correct"])
    def test_round_trips(self, v):
        m = ctx_core.Marker(ctx_core.FIDELITY, v, 1)
        assert ctx_core.parse(ctx_core.render(m)).markers == [m]


class TestSeal:
    def test_parses_sealed_with_who_and_when(self):
        """Seal carries a state plus optional who/when, preserved verbatim."""
        m = ctx_core.parse("🔒 Seal: sealed @rjs 2026-06-16\n").markers[0]
        assert m.kind == ctx_core.SEAL
        assert m.value == "sealed @rjs 2026-06-16"

    def test_parses_unsealed(self):
        m = ctx_core.parse("🔒 Seal: unsealed @rjs 2026-06-16\n").markers[0]
        assert m.value.startswith("unsealed")

    def test_invalid_state_is_a_finding(self):
        """The leading token must be sealed|unsealed."""
        parsed = ctx_core.parse("🔒 Seal: ajar\n")
        assert parsed.markers == []
        assert len(parsed.findings) == 1

    def test_round_trips(self):
        m = ctx_core.Marker(ctx_core.SEAL, "sealed @rjs 2026-06-16", 1)
        assert ctx_core.parse(ctx_core.render(m)).markers == [m]
