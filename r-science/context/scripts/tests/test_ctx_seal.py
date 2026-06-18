"""Behaviour spec for ctx_seal: the comment it builds must parse as a Seal marker."""
import pytest

ctx_core = pytest.importorskip("ctx_core")
ctx_seal = pytest.importorskip("ctx_seal")


class TestSealComment:
    def test_unsealed_comment_parses_as_seal_marker(self):
        body = ctx_seal.seal_comment("unsealed", "@rjs", "2026-06-17")
        markers = ctx_core.parse(body).markers
        seals = [m for m in markers if m.kind == ctx_core.SEAL]
        assert len(seals) == 1

    def test_sealed_roundtrips_through_collate(self):
        body = ctx_seal.seal_comment("sealed", "@rjs", "2026-06-17")
        node = ctx_core.Node(16, body, "open", None, set())
        model = ctx_core.collate([node])
        assert model.seal[16] == "sealed"

    def test_who_optional(self):
        body = ctx_seal.seal_comment("unsealed")
        assert ctx_core.parse(body).markers[0].kind == ctx_core.SEAL
