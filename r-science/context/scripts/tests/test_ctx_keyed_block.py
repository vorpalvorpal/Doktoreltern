"""Behaviour spec: block-form keyed markers + Artefact + the I8 prose guard.

Stage 2b. A keyed marker may carry its id (and optional status) inline with a
multi-line body in the immediately-following blockquote. Dead-end and Artefact
are keyed block markers. I8 must not flag prose lines that merely begin with a
keyed keyword.
"""
import pytest

ctx_core = pytest.importorskip("ctx_core")


class TestKeyedBlockForm:
    def test_id_inline_body_in_blockquote(self):
        text = ("🪦 Dead-end: #7.de1\n"
                "> Tried FFT convolution; padding dominated at n<512.\n"
                "> Direct loop 3x faster.\n")
        m = ctx_core.parse(text).markers[0]
        assert m.kind == ctx_core.DEAD_END
        assert m.value.id == "#7.de1"
        assert m.value.status == "closed"          # the kind's default
        assert "FFT convolution" in m.value.text
        assert "Direct loop 3x faster." in m.value.text

    def test_inline_status_then_block_body(self):
        text = ("🪦 Dead-end: #7.de1 revived\n"
                "> Worth another look now we vectorised upstream.\n")
        m = ctx_core.parse(text).markers[0]
        assert m.value.status == "revived"
        assert "vectorised upstream" in m.value.text

    def test_block_terminates_at_non_blockquote(self):
        text = ("🪦 Dead-end: #7.de1\n"
                "> body line\n"
                "ordinary prose\n")
        m = ctx_core.parse(text).markers[0]
        assert m.value.text == "body line"

    def test_multiline_block_round_trips(self):
        m = ctx_core.Marker(ctx_core.DEAD_END,
                            ctx_core.Keyed("#7.de1", "closed", "first\nsecond\nthird"), 1)
        assert ctx_core.parse(ctx_core.render(m)).markers == [m]

    def test_missing_id_is_a_finding(self):
        """The old bare block form (no id) is now a finding — keyed needs an id."""
        parsed = ctx_core.parse("🪦 Dead-end:\n> no id here\n")
        assert parsed.markers == []
        assert parsed.findings


class TestArtefact:
    def test_artefact_block_body(self):
        text = ("🗄️ Artefact: #16.art1\n"
                "> what: fitted SSD posterior\n"
                "> how: Rscript scripts/fit_ssd.R --seed 42\n"
                "> cache: tmp/art/abc.rds\n")
        m = ctx_core.parse(text).markers[0]
        assert m.kind == ctx_core.ARTEFACT
        assert m.value.id == "#16.art1"
        assert m.value.status == "live"
        assert "what: fitted SSD posterior" in m.value.text
        assert "cache: tmp/art/abc.rds" in m.value.text

    def test_artefact_round_trips(self):
        m = ctx_core.Marker(ctx_core.ARTEFACT,
                            ctx_core.Keyed("#16.art1", "live", "what: x\nhow: y\ncache: z"), 1)
        assert ctx_core.parse(ctx_core.render(m)).markers == [m]


class TestI8ProseGuard:
    def _i8(self, body):
        model = ctx_core.collate([ctx_core.Node(16, body, "open", None, set())])
        return ctx_core.CHECKS["I8"](model, ctx_core.Platform(set(), {}, True))

    def test_prose_keyword_for_keyed_kind_is_not_flagged(self):
        """`Future: we might…` is prose, not a sigil-less marker."""
        assert self._i8("Future: we might revisit this later\n") == []

    def test_bare_keyed_marker_with_id_is_flagged(self):
        """`Future: #16.fut1 …` without the 🔮 sigil is a missing-sigil finding."""
        assert any(f.key == "I8" for f in self._i8("Future: #16.fut1 expansion\n"))

    def test_non_keyed_bare_keyword_still_flagged(self):
        """Non-keyed bare keywords keep the original I8 behaviour."""
        assert any(f.key == "I8" for f in self._i8("Part-of: #16\n"))
