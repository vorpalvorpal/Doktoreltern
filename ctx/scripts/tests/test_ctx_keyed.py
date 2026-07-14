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
        m = ctx_core.parse("🔮 Future: #16.fut1 nicer summary table someday\n").markers[0]
        assert m.value.status == "declared"
        assert m.value.text == "nicer summary table someday"

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
        ("FUTURE", "fut", "activated"),
        ("REFINE", "fd", "activated"),
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


class TestFutureVsRefine:
    """#33: Future = expansion (prefix fut, optional [v<n>]); Refinement = accuracy lever (fd)."""

    def test_future_uses_fut_prefix(self):
        m = ctx_core.parse("🔮 Future: #16.fut1 declared coefficient summary table\n").markers[0]
        assert m.kind == ctx_core.FUTURE
        assert m.value == ctx_core.Keyed("#16.fut1", "declared", "coefficient summary table")

    def test_future_rejects_old_fd_prefix(self):
        """The fd namespace now belongs to Refinement, so 🔮 Future: #16.fd1 is a finding."""
        parsed = ctx_core.parse("🔮 Future: #16.fd1 stale namespace\n")
        assert parsed.markers == []
        assert len(parsed.findings) == 1

    def test_refinement_is_the_fd_accuracy_lever(self):
        m = ctx_core.parse("🎯 Refinement: #16.fd1 declared gaussian -> nonparametric SSD\n").markers[0]
        assert m.kind == ctx_core.REFINE
        assert m.value == ctx_core.Keyed("#16.fd1", "declared", "gaussian -> nonparametric SSD")


class TestVersionTag:
    """#33: a disciplined optional [v<n>] tag, Future-only, a release-gate selector."""

    def test_version_tag_extracted_into_field(self):
        m = ctx_core.parse("🔮 Future: #16.fut1 declared [v1] cli message about warnings\n").markers[0]
        assert m.value.version == "v1"
        assert m.value.text == "cli message about warnings"

    def test_version_tag_works_with_default_status(self):
        m = ctx_core.parse("🔮 Future: #16.fut2 [v2] nicer thing\n").markers[0]
        assert m.value.status == "declared"
        assert m.value.version == "v2"
        assert m.value.text == "nicer thing"

    def test_bare_future_has_no_version(self):
        m = ctx_core.parse("🔮 Future: #16.fut1 declared someday maybe\n").markers[0]
        assert m.value.version is None

    def test_version_tag_round_trips(self):
        m = ctx_core.Marker(ctx_core.FUTURE,
                            ctx_core.Keyed("#16.fut1", "declared", "do the thing", "v3"), 1)
        assert ctx_core.parse(ctx_core.render(m)).markers == [m]

    def test_malformed_version_tag_is_a_finding(self):
        parsed = ctx_core.parse("🔮 Future: #16.fut1 declared [v1.0] dotted\n")
        assert parsed.markers == []
        assert any("version tag" in f.detail for f in parsed.findings)

    def test_version_tag_on_non_future_is_a_finding(self):
        parsed = ctx_core.parse("❓ Question: #16.q1 open [v1] not allowed here\n")
        assert parsed.markers == []
        assert any("only allowed on Future" in f.detail for f in parsed.findings)
