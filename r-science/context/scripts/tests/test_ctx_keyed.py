"""Behaviour spec for keyed markers — inline form (context-spec.md §2-3).

Keyed markers carry a stable `#<issue>.<prefix><n>` id and an evolving status,
so a later comment can supersede an earlier one by id. This file covers the
inline-text kinds (question/validation/alternative/future/optimisation); the
block-form-with-id extension and keyed dead-end/artefact land in stage 2b.
"""
import pytest

ctx_core = pytest.importorskip("ctx_core")


class TestKeyedParse:
    def test_parses_question_with_status_and_text(self):
        m = ctx_core.parse("❓ Question: #16.q4 open Is foo correct?\n").markers[0]
        assert m.kind == ctx_core.QUESTION
        assert m.value == ctx_core.Keyed("#16.q4", "open", "Is foo correct?")

    def test_status_defaults_when_omitted(self):
        """No recognised status word ⇒ the kind's default status applies."""
        m = ctx_core.parse("❓ Question: #16.q4 Is foo correct?\n").markers[0]
        assert m.value.status == "open"
        assert m.value.text == "Is foo correct?"

    def test_later_status_word_is_recognised(self):
        m = ctx_core.parse("⚖️ Alternative: #16.alt1 rejected censoring breaks it\n").markers[0]
        assert m.kind == ctx_core.ALTERNATIVE
        assert m.value == ctx_core.Keyed("#16.alt1", "rejected", "censoring breaks it")

    def test_unrecognised_second_token_is_text_not_status(self):
        m = ctx_core.parse("🔮 Future: #16.fd1 nonparametric SSD someday\n").markers[0]
        assert m.value.status == "declared"
        assert m.value.text == "nonparametric SSD someday"

    def test_bad_id_is_a_finding(self):
        parsed = ctx_core.parse("❓ Question: 16.q4 missing the hash\n")
        assert parsed.markers == []
        assert len(parsed.findings) == 1
        assert parsed.findings[0].line == 1

    def test_id_prefix_must_match_kind(self):
        """A Question marker carrying an `alt` id is a finding."""
        parsed = ctx_core.parse("❓ Question: #16.alt1 wrong namespace\n")
        assert parsed.markers == []
        assert len(parsed.findings) == 1


class TestKeyedRoundTrip:
    @pytest.mark.parametrize("kind_id, prefix, status", [
        ("QUESTION", "q", "answered"),
        ("VALIDATION", "v", "met"),
        ("ALTERNATIVE", "alt", "viable"),
        ("FUTURE", "fd", "activated"),
        ("OPT", "opt", "done"),
    ])
    def test_round_trips(self, kind_id, prefix, status):
        kind = getattr(ctx_core, kind_id)
        m = ctx_core.Marker(kind, ctx_core.Keyed(f"#16.{prefix}3", status, "some text here"), 1)
        assert ctx_core.parse(ctx_core.render(m)).markers == [m]

    def test_empty_text_round_trips(self):
        m = ctx_core.Marker(ctx_core.OPT, ctx_core.Keyed("#7.opt1", "declared", ""), 1)
        assert ctx_core.parse(ctx_core.render(m)).markers == [m]

    def test_default_status_round_trips_unambiguously(self):
        """render emits the status explicitly, so text starting like a status word survives."""
        m = ctx_core.Marker(ctx_core.QUESTION, ctx_core.Keyed("#16.q1", "open", "answered yet?"), 1)
        assert ctx_core.parse(ctx_core.render(m)).markers == [m]
