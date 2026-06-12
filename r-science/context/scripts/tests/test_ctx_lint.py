"""Behaviour spec for the linter — invariants I1–I8, exit codes, output format.

Maps to plan §6 "Linter". Each invariant is one named, independently testable
check exposed as ``ctx_core.CHECKS["I3"](model, platform) -> [Finding]``. The
CLI wiring (exit codes, finding format) lives in ``ctx_lint``.

Findings carry a severity: "finding" flips the exit code, "warning"/"info" do
not. I1's best-effort rule (edge unsettable in this environment) and I6's
depth-7 warning are the two places that distinction is load-bearing.

Pending until Stage 4 (linter). The CHECKS themselves are Stage 2 (core).
"""

import pytest

ctx_core = pytest.importorskip("ctx_core")

CORE = "pending — Stage 2 (invariant checks)"
CLI = "pending — Stage 4 (linter CLI)"


def model_and_platform(data):
    """Build (Model, Platform) from the plain-dict fixture shape."""
    nodes = []
    for number, body in data["bodies"].items():
        state, reason = data["states"].get(number, ("open", None))
        nodes.append(ctx_core.Node(number, body, state, reason,
                                   data["labels"].get(number, set())))
    model = ctx_core.collate(nodes)
    platform = ctx_core.Platform(
        subissue_edges=data["subissue_edges"],
        labels=data["labels"],
        settable=data.get("settable", True),
    )
    return model, platform


def severities(findings, level="finding"):
    return [f for f in findings if f.severity == level]


# --------------------------------------------------------------------------
# I1 — Part-of ↔ platform sub-issue edge (best-effort)
# --------------------------------------------------------------------------
class TestI1:
    def test_clean_when_edge_matches_text(self, two_node_tree):
        model, platform = model_and_platform(two_node_tree)
        assert ctx_core.CHECKS["I1"](model, platform) == []

    def test_finding_when_edge_missing_and_settable(self, two_node_tree):
        two_node_tree["subissue_edges"] = set()
        two_node_tree["settable"] = True
        model, platform = model_and_platform(two_node_tree)
        assert severities(ctx_core.CHECKS["I1"](model, platform), "finding")

    def test_info_not_finding_when_edge_unsettable(self, two_node_tree):
        """Missing edge in an environment that can't set one is info, not failure."""
        two_node_tree["subissue_edges"] = set()
        two_node_tree["settable"] = False
        model, platform = model_and_platform(two_node_tree)
        result = ctx_core.CHECKS["I1"](model, platform)
        assert severities(result, "finding") == []
        assert severities(result, "info")


# --------------------------------------------------------------------------
# I2 — aspect marker ↔ aspect:* label, both directions
# --------------------------------------------------------------------------
class TestI2:
    def test_finding_when_text_aspect_has_no_label(self, two_node_tree):
        two_node_tree["labels"][17] = set()          # drop aspect:numerics label
        model, platform = model_and_platform(two_node_tree)
        assert severities(ctx_core.CHECKS["I2"](model, platform))

    def test_finding_when_label_has_no_text_aspect(self, two_node_tree):
        two_node_tree["labels"][17] = {"aspect:numerics", "aspect:io"}  # io unmarked
        model, platform = model_and_platform(two_node_tree)
        assert severities(ctx_core.CHECKS["I2"](model, platform))


# --------------------------------------------------------------------------
# I3 — exactly one tree, no cycles (cycle detection is ours)
# --------------------------------------------------------------------------
class TestI3:
    def test_detects_a_cycle(self):
        data = {
            "bodies": {16: "🧩 Part-of: #17\n", 17: "🧩 Part-of: #16\n"},
            "states": {}, "subissue_edges": set(),
            "labels": {}, "settable": True,
        }
        model, platform = model_and_platform(data)
        assert severities(ctx_core.CHECKS["I3"](model, platform))

    def test_finding_when_node_has_two_parents(self):
        data = {
            "bodies": {17: "🧩 Part-of: #16, #18\n"},
            "states": {}, "subissue_edges": set(), "labels": {}, "settable": True,
        }
        model, platform = model_and_platform(data)
        assert severities(ctx_core.CHECKS["I3"](model, platform))


# --------------------------------------------------------------------------
# I4 — closed-completed parent ⇒ all children closed-completed
# --------------------------------------------------------------------------
class TestI4:
    def test_finding_when_completed_parent_has_open_child(self, two_node_tree):
        two_node_tree["states"][16] = ("closed", "completed")
        two_node_tree["states"][17] = ("open", None)
        model, platform = model_and_platform(two_node_tree)
        assert severities(ctx_core.CHECKS["I4"](model, platform))

    def test_clean_when_completed_parent_has_completed_child(self, two_node_tree):
        two_node_tree["states"][16] = ("closed", "completed")
        two_node_tree["states"][17] = ("closed", "completed")
        model, platform = model_and_platform(two_node_tree)
        assert ctx_core.CHECKS["I4"](model, platform) == []


# --------------------------------------------------------------------------
# I5 — Boundary markers live only on parents, name only that parent's children
# --------------------------------------------------------------------------
class TestI5:
    def test_finding_when_boundary_on_a_leaf(self):
        data = {
            "bodies": {17: "🧩 Part-of: #16\n🧱 Boundary: #18\n"},  # 17 has no children
            "states": {}, "subissue_edges": set(), "labels": {}, "settable": True,
        }
        model, platform = model_and_platform(data)
        assert severities(ctx_core.CHECKS["I5"](model, platform))

    def test_finding_when_boundary_names_a_non_child(self):
        data = {
            "bodies": {16: "🧱 Boundary: #99\n", 17: "🧩 Part-of: #16\n"},
            "states": {}, "subissue_edges": {(16, 17)}, "labels": {}, "settable": True,
        }
        model, platform = model_and_platform(data)
        assert severities(ctx_core.CHECKS["I5"](model, platform))


# --------------------------------------------------------------------------
# I6 — tree depth ≤ 8, warn at 7
# --------------------------------------------------------------------------
class TestI6:
    def _chain(self, depth):
        """A root + `depth` descendants in a straight Part-of chain."""
        bodies = {1: "root\n"}
        for n in range(2, depth + 2):
            bodies[n] = f"🧩 Part-of: #{n - 1}\n"
        return {"bodies": bodies, "states": {}, "subissue_edges": set(),
                "labels": {}, "settable": True}

    def test_warning_at_depth_seven(self):
        model, platform = model_and_platform(self._chain(7))
        assert severities(ctx_core.CHECKS["I6"](model, platform), "warning")
        assert severities(ctx_core.CHECKS["I6"](model, platform), "finding") == []

    def test_finding_beyond_depth_eight(self):
        model, platform = model_and_platform(self._chain(9))
        assert severities(ctx_core.CHECKS["I6"](model, platform), "finding")


# --------------------------------------------------------------------------
# I7 — Design: #N points at an existing design node
# --------------------------------------------------------------------------
class TestI7:
    def test_finding_when_design_ref_is_dangling(self):
        data = {
            "bodies": {30: "📐 Design: #999\n"},   # #999 absent
            "states": {}, "subissue_edges": set(), "labels": {}, "settable": True,
        }
        model, platform = model_and_platform(data)
        assert severities(ctx_core.CHECKS["I7"](model, platform))


# --------------------------------------------------------------------------
# I8 — line-leading bare keyword without its emoji → finding, no auto-insert
# --------------------------------------------------------------------------
class TestI8:
    def test_flags_a_sigil_less_keyword(self):
        data = {
            "bodies": {17: "Part-of: #16\n"},   # keyword, no emoji
            "states": {}, "subissue_edges": set(), "labels": {}, "settable": True,
        }
        model, platform = model_and_platform(data)
        result = ctx_core.CHECKS["I8"](model, platform)
        assert severities(result)

    def test_does_not_auto_insert_the_emoji(self):
        """The linter flags the repair; it must never invent the marker."""
        data = {
            "bodies": {17: "Part-of: #16\n"},
            "states": {}, "subissue_edges": set(), "labels": {}, "settable": True,
        }
        model, platform = model_and_platform(data)
        # The sigil-less line did not become a tree edge behind our backs.
        assert (16, 17) not in model.tree_edges


# --------------------------------------------------------------------------
# CLI — exit codes and finding format
# --------------------------------------------------------------------------
class TestLinterCLI:
    @pytest.mark.skip(reason=CLI)
    def test_exit_zero_when_clean(self):
        ctx_lint = pytest.importorskip("ctx_lint")
        assert ctx_lint.exit_code([]) == 0

    @pytest.mark.skip(reason=CLI)
    def test_exit_one_on_findings(self):
        ctx_lint = pytest.importorskip("ctx_lint")
        findings = [ctx_core.Finding(17, "I3", "cycle through #16", "finding")]
        assert ctx_lint.exit_code(findings) == 1

    @pytest.mark.skip(reason=CLI)
    def test_info_and_warning_do_not_flip_exit_code(self):
        ctx_lint = pytest.importorskip("ctx_lint")
        findings = [
            ctx_core.Finding(17, "I1", "edge unsettable here", "info"),
            ctx_core.Finding(17, "I6", "depth 7", "warning"),
        ]
        assert ctx_lint.exit_code(findings) == 0

    @pytest.mark.skip(reason=CLI)
    def test_finding_renders_as_issue_key_detail(self):
        f = ctx_core.Finding(17, "I3", "cycle through #16", "finding")
        assert str(f) == "#17:I3:cycle through #16"
