"""Pro/Con keyed sub-markers under an option (the pros/cons grammar).

Ids carry an extra option segment: #<issue>.<opt><n>.p<n> / .c<n>, so pros and
cons fold latest-wins individually and can be superseded (standing → refuted/moot)
or removed as the calculus changes. Optional [dimension] tags are free text in the
body (not parsed) for future MCP grouping.
"""
import pytest

ctx_core = pytest.importorskip("ctx_core")
C = ctx_core


class TestParse:
    def test_pro_parses_with_option_subkey(self):
        m = C.parse("➕ Pro: #37.alt1.p1 standing one FSM owner\n").markers
        assert len(m) == 1 and m[0].kind == C.PRO
        assert m[0].value.id == "#37.alt1.p1"
        assert m[0].value.status == "standing"
        assert m[0].value.text == "one FSM owner"

    def test_con_default_status_is_standing(self):
        m = C.parse("➖ Con: #37.alt1.c1 prompt bloat\n").markers
        assert m[0].kind == C.CON
        assert m[0].value.status == "standing"
        assert m[0].value.text == "prompt bloat"

    def test_refuted_status(self):
        m = C.parse("➖ Con: #37.alt1.c1 refuted no longer true\n").markers
        assert m[0].value.status == "refuted"

    def test_optional_dimension_stays_in_text(self):
        m = C.parse("➕ Pro: #37.alt1.p1 standing [maintainability] one FSM owner\n").markers
        assert m[0].value.text == "[maintainability] one FSM owner"

    def test_id_without_option_segment_is_a_finding(self):
        p = C.parse("➕ Pro: #37.p1 missing option segment\n")
        assert p.markers == [] and p.findings

    def test_roundtrip(self):
        for txt in ("➕ Pro: #37.alt1.p1 standing one FSM owner\n",
                    "➖ Con: #37.alt1.c1 refuted stale\n"):
            m = C.parse(txt).markers[0]
            assert C.parse(C.render(m)).markers == [m]


class TestFold:
    def test_latest_supersedes_by_id(self):
        node = C.Node(37, "➖ Con: #37.alt1.c1 standing bloat\n", "open", None, set(),
                      [C.Comment(2, "➖ Con: #37.alt1.c1 refuted bloat fixed\n")])
        model = C.collate([node])
        assert model.registries[C.CON] == [
            (37, C.Keyed("#37.alt1.c1", "refuted", "bloat fixed"))]

    def test_pros_and_cons_in_separate_registries(self):
        body = "➕ Pro: #37.alt1.p1 standing a\n➖ Con: #37.alt1.c1 standing b\n"
        model = C.collate([C.Node(37, body, "open", None, set())])
        assert len(model.registries[C.PRO]) == 1
        assert len(model.registries[C.CON]) == 1


class TestChecks:
    def test_i9_flags_issue_part_mismatch(self):
        node = C.Node(99, "➕ Pro: #37.alt1.p1 standing x\n", "open", None, set())
        model = C.collate([node])
        fs = C.CHECKS["I9"](model, C.Platform(set(), {}, True))
        assert any(f.key == "I9" for f in fs)
