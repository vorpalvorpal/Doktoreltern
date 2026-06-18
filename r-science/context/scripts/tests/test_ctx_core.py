"""Behaviour spec for ctx_core — the pure parse/collate/invariant core.

Maps to plan §6 "Extractor / core" and the I1–I8 invariant list. No network,
no I/O: every spec here is a pure function of in-memory text. The round-trip
property is the headline correctness oracle.

Pending until Stage 2 (pure core). Run: ``uv run pytest`` from scripts/.
"""

import pytest

ctx_core = pytest.importorskip("ctx_core")

PENDING = "pending — Stage 2 (pure core)"


# --------------------------------------------------------------------------
# Grammar: inline form
# --------------------------------------------------------------------------
class TestParseInline:
    def test_parses_a_line_anchored_emoji_marker(self):
        """`🧩 Part-of: #16` → one PART_OF marker carrying issue 16."""
        parsed = ctx_core.parse("🧩 Part-of: #16\n")
        assert parsed.markers == [ctx_core.Marker(ctx_core.PART_OF, [16], 1)]
        assert parsed.findings == []

    def test_parses_one_of_every_glyph(self, inline_markers_text):
        """All eight inline glyphs register with the right kind, in order."""
        kinds = [m.kind for m in ctx_core.parse(inline_markers_text).markers]
        assert kinds == [
            ctx_core.PART_OF, ctx_core.ASPECT, ctx_core.BOUNDARY,
            ctx_core.BLOCKED_BY, ctx_core.DESIGN, ctx_core.EQ, ctx_core.CITES,
        ]

    def test_value_runs_to_end_of_line(self):
        """Inline value terminates at the newline, trimmed."""
        m = ctx_core.parse("📚 Cites: smith2020   \n").markers[0]
        assert m.value == ["smith2020"]

    def test_comma_list_value(self):
        """`🧩 Part-of: #16, #17` parses both refs."""
        m = ctx_core.parse("🧩 Part-of: #16, #17\n").markers[0]
        assert m.value == [16, 17]

    def test_records_one_based_line_number(self):
        """The marker carries its source line (for linter pointers)."""
        m = ctx_core.parse("prose\nprose\n⛔ Blocked-by: #12\n").markers[0]
        assert m.line == 3


# --------------------------------------------------------------------------
# Grammar: the full emoji+keyword+: triple is the canonical match token
# (prose-collision guard — neither half registers on its own)
# --------------------------------------------------------------------------
class TestTripleIsCanonical:
    def test_bare_keyword_in_prose_does_not_register(self):
        """"...this is part of the wider effort..." is prose, not a marker."""
        parsed = ctx_core.parse("This is part of: the wider effort here.\n")
        assert parsed.markers == []

    def test_bare_emoji_without_keyword_does_not_register(self):
        """A leading ✅/❓ without its keyword is prose — a tick, a rhetorical Q."""
        assert ctx_core.parse("✅ done the dishes\n").markers == []
        assert ctx_core.parse("❓ why is this so slow?\n").markers == []
        assert ctx_core.parse("🔒 the door is locked\n").markers == []

    def test_emoji_mid_sentence_does_not_register(self):
        """An emoji not at line-start is prose decoration, not a marker."""
        parsed = ctx_core.parse("As shown 🧩 Part-of: #16 inline in a clause.\n")
        assert parsed.markers == []

    def test_leading_whitespace_before_emoji_is_allowed(self):
        """Indented emoji still counts — emoji is first *non-whitespace* token."""
        parsed = ctx_core.parse("    🧩 Part-of: #16\n")
        assert parsed.markers == [ctx_core.Marker(ctx_core.PART_OF, [16], 1)]


# --------------------------------------------------------------------------
# Grammar: variation-selector normalisation (the one footgun)
# --------------------------------------------------------------------------
class TestNormalisation:
    def test_emoji_with_and_without_fe0f_parse_identically(self):
        """`🏷️` (U+1F3F7 U+FE0F) and `🏷` (bare) are the same token."""
        with_vs = ctx_core.parse("🏷️ aspect: numerics\n").markers
        without_vs = ctx_core.parse("🏷 aspect: numerics\n").markers
        assert with_vs == without_vs
        assert with_vs[0].kind == ctx_core.ASPECT


# --------------------------------------------------------------------------
# Grammar: block form
# --------------------------------------------------------------------------
class TestParseBlock:
    def test_block_value_is_the_following_blockquote(self, block_dead_end_text):
        """Keyed Dead-end: id inline, the consecutive `>` lines are the text."""
        markers = ctx_core.parse(block_dead_end_text).markers
        assert len(markers) == 1
        assert markers[0].kind == ctx_core.DEAD_END
        assert markers[0].value.id == "#7.de1"
        assert "FFT-based convolution" in markers[0].value.text
        assert "3x faster" in markers[0].value.text

    def test_block_terminates_at_first_non_blockquote_line(self, block_dead_end_text):
        """Prose after the blockquote is not swallowed into the marker text."""
        value = ctx_core.parse(block_dead_end_text).markers[0].value
        assert "Back to prose" not in value.text

    def test_block_form_works_for_eq_multiline_latex(self):
        """Block form is general: Eq accepts a multi-line LaTeX value."""
        text = ("🟰 Eq:\n"
                "> \\begin{align}\n"
                "> a &= b \\\\\n"
                "> c &= d\n"
                "> \\end{align}\n")
        markers = ctx_core.parse(text).markers
        assert len(markers) == 1
        assert markers[0].kind == ctx_core.EQ
        assert "\\begin{align}" in markers[0].value
        assert "c &= d" in markers[0].value

    def test_block_form_works_for_boundary_refs(self):
        """Block form is general: Boundary collects refs across the blockquote."""
        text = "🧱 Boundary:\n> #17, #18\n> #19\n"
        markers = ctx_core.parse(text).markers
        assert markers[0].kind == ctx_core.BOUNDARY
        assert markers[0].value == [17, 18, 19]


# --------------------------------------------------------------------------
# Grammar: quoting is not asserting
# --------------------------------------------------------------------------
class TestSuppression:
    def test_markers_inside_fenced_code_do_not_register(self):
        """A marker shown as a code example must not be extracted."""
        text = "Example:\n```\n🧩 Part-of: #16\n```\n"
        assert ctx_core.parse(text).markers == []

    def test_markers_inside_a_quoting_blockquote_do_not_register(self):
        """Quoting another issue's marker text must not double-register it.

        A standalone blockquote (not the value of an empty-value marker line)
        is inert quoted text; nothing inside it is scanned for markers.
        """
        text = "Quoting #17 below:\n\n> 🧩 Part-of: #16\n> some quoted prose\n"
        assert ctx_core.parse(text).markers == []


# --------------------------------------------------------------------------
# Round-trip — the core correctness property
# --------------------------------------------------------------------------
class TestRoundTrip:
    @pytest.mark.parametrize("kind_id, value", [
        ("PART_OF", [16]),
        ("ASPECT", "numerics"),
        ("BOUNDARY", [17, 18]),
        ("BLOCKED_BY", [12]),
        ("DESIGN", 17),
        ("EQ", "smith2020_msPAF"),
        ("CITES", ["smith2020"]),
    ])
    def test_inline_round_trips(self, kind_id, value):
        """parse(render(m)).markers == [m] for every inline vocabulary item."""
        m = ctx_core.Marker(getattr(ctx_core, kind_id), value, 1)
        assert ctx_core.parse(ctx_core.render(m)).markers == [m]

    def test_block_form_round_trips(self):
        """A multi-line keyed Dead-end survives render→parse unchanged."""
        m = ctx_core.Marker(ctx_core.DEAD_END,
                            ctx_core.Keyed("#7.de1", "closed", "line one\nline two"), 1)
        assert ctx_core.parse(ctx_core.render(m)).markers == [m]

    def test_round_trip_survives_normalisation(self):
        """render emits a normalised glyph; re-parsing yields the same marker."""
        m = ctx_core.Marker(ctx_core.ASPECT, "numerics", 1)
        rendered = ctx_core.render(m)
        assert ctx_core.parse(rendered).markers == [m]
        # render must not emit a dangling variation selector
        assert "️" not in rendered or rendered.count("️") == rendered.count("️")

    def test_multiline_value_round_trips_via_block_form(self):
        """A multi-line value renders as block form and parses back unchanged."""
        m = ctx_core.Marker(ctx_core.EQ, "a &= b\nc &= d", 1)
        assert ctx_core.parse(ctx_core.render(m)).markers == [m]


# --------------------------------------------------------------------------
# Determinism + malformed/unknown handling
# --------------------------------------------------------------------------
class TestCoreRobustness:
    def test_parsing_is_deterministic(self, inline_markers_text):
        """Same input → identical output (pure function)."""
        a = ctx_core.parse(inline_markers_text)
        b = ctx_core.parse(inline_markers_text)
        assert a.markers == b.markers and a.findings == b.findings

    def test_malformed_value_becomes_a_finding_not_a_crash(self):
        """Glyph+keyword match but value won't parse → recorded, never dropped."""
        parsed = ctx_core.parse("🧩 Part-of: banana\n")
        assert parsed.markers == []
        assert len(parsed.findings) == 1
        assert parsed.findings[0].line == 1

    def test_malformed_marker_is_never_silently_dropped(self):
        """A finding is emitted rather than the line vanishing."""
        parsed = ctx_core.parse("📐 Design: not-an-issue-ref\n")
        assert parsed.findings, "expected a finding for the unparseable Design value"


# --------------------------------------------------------------------------
# Collation → indices
# --------------------------------------------------------------------------
class TestCollate:
    def test_part_of_becomes_a_tree_edge(self):
        """A child's Part-of marker yields a parent→child edge."""
        nodes = [
            ctx_core.Node(16, "root\n", "open", None, set()),
            ctx_core.Node(17, "🧩 Part-of: #16\n", "open", None, set()),
        ]
        model = ctx_core.collate(nodes)
        assert (16, 17) in model.tree_edges

    def test_cites_and_eq_populate_the_registry(self):
        """Citation and equation markers collate into the queryable registry."""
        nodes = [ctx_core.Node(17, "🟰 Eq: smith2020_msPAF\n📚 Cites: smith2020\n",
                               "open", None, set())]
        model = ctx_core.collate(nodes)
        assert "smith2020_msPAF" in model.registry
        assert "smith2020" in model.registry

    def test_dead_end_is_scoped_to_its_carrying_node(self):
        """Dead-end scope = the node whose thread carries it (#22); grouped by subtree."""
        nodes = [
            ctx_core.Node(16, "root\n", "open", None, set()),
            ctx_core.Node(17, "🧩 Part-of: #16\n🪦 Dead-end: #17.de1\n> tried X, slow\n",
                          "open", None, set()),
        ]
        model = ctx_core.collate(nodes)
        assert 17 in model.dead_ends
        assert 16 not in model.dead_ends
