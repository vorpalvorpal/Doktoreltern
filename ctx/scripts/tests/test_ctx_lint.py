"""Behaviour spec for the linter — invariants I3–I8, exit codes, output format.

Maps to plan §6 "Linter". Each invariant is one named, independently testable
check exposed as ``ctx_core.CHECKS["I3"](model, platform) -> [Finding]``. The
CLI wiring (exit codes, finding format) lives in ``ctx_lint``.

Findings carry a severity: "finding" flips the exit code, "warning"/"info" do
not. I6's depth-7 warning is where that distinction is load-bearing.

I1 (Part-of <-> platform sub-issue edge) and I2 (aspect marker <-> aspect:*
label) were deleted in the store migration (CONTRACT.md A5): both diffed
in-text markers against GitHub platform state, which no longer exists.

Pending until Stage 4 (linter). The CHECKS themselves are Stage 2 (core).
"""

from pathlib import Path

import pytest

ctx_core = pytest.importorskip("ctx_core")

CORE = "pending — Stage 2 (invariant checks)"
CLI = "pending — Stage 4 (linter CLI)"


def model_and_platform(data):
    """Build (Model, Platform) from the plain-dict fixture shape.

    The node tree is the filesystem nesting (Node.parent), so the fixture carries
    an optional ``parents`` dict (child id → parent id) rather than a Part-of
    marker in the body.
    """
    parents = data.get("parents", {})
    nodes = []
    for number, body in data["bodies"].items():
        state, reason = data["states"].get(number, ("open", None))
        nodes.append(ctx_core.Node(number, body, state, reason,
                                   data["labels"].get(number, set()),
                                   parent=parents.get(number)))
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
# I3 — exactly one tree, no cycles (cycle detection is ours)
# --------------------------------------------------------------------------
class TestI3:
    def test_detects_a_cycle(self):
        data = {
            "bodies": {16: "a\n", 17: "b\n"},
            "parents": {16: 17, 17: 16},   # 16↔17 mutual parents = a cycle
            "states": {}, "subissue_edges": set(),
            "labels": {}, "settable": True,
        }
        model, platform = model_and_platform(data)
        assert severities(ctx_core.CHECKS["I3"](model, platform))

    def test_finding_when_node_has_two_parents(self):
        # A node has exactly one parent dir on disk, so two parents can't arise
        # from real nesting; exercise the check directly by adding a second edge.
        model = ctx_core.collate([
            ctx_core.Node(16, "a\n", "open", None, set()),
            ctx_core.Node(18, "b\n", "open", None, set()),
            ctx_core.Node(17, "c\n", "open", None, set(), parent=16),
        ])
        model.tree_edges.add((18, 17))
        platform = ctx_core.Platform(set(), {}, True)
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
            "bodies": {17: "🧱 Boundary: #18\n"},  # 17 has no children
            "states": {}, "subissue_edges": set(), "labels": {}, "settable": True,
        }
        model, platform = model_and_platform(data)
        assert severities(ctx_core.CHECKS["I5"](model, platform))

    def test_finding_when_boundary_names_a_non_child(self):
        data = {
            "bodies": {16: "🧱 Boundary: #99\n", 17: "child\n"},
            "parents": {17: 16},
            "states": {}, "subissue_edges": {(16, 17)}, "labels": {}, "settable": True,
        }
        model, platform = model_and_platform(data)
        assert severities(ctx_core.CHECKS["I5"](model, platform))


# --------------------------------------------------------------------------
# I6 — tree depth ≤ 8, warn at 7
# --------------------------------------------------------------------------
class TestI6:
    def _chain(self, depth):
        """A root + `depth` descendants in a straight nesting chain (Node.parent)."""
        bodies = {1: "root\n"}
        parents = {}
        for n in range(2, depth + 2):
            bodies[n] = "x\n"
            parents[n] = n - 1
        return {"bodies": bodies, "parents": parents, "states": {},
                "subissue_edges": set(), "labels": {}, "settable": True}

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
            "bodies": {17: "Boundary: #16\n"},   # keyword, no emoji
            "states": {}, "subissue_edges": set(), "labels": {}, "settable": True,
        }
        model, platform = model_and_platform(data)
        result = ctx_core.CHECKS["I8"](model, platform)
        assert severities(result)

    def test_does_not_auto_insert_the_emoji(self):
        """The linter flags the repair; it must never invent the marker."""
        data = {
            "bodies": {17: "Boundary: #16\n"},
            "states": {}, "subissue_edges": set(), "labels": {}, "settable": True,
        }
        model, platform = model_and_platform(data)
        # The sigil-less line did not become a Boundary marker behind our backs.
        assert 17 not in model.boundaries


# --------------------------------------------------------------------------
# CLI — exit codes and finding format
# --------------------------------------------------------------------------
class TestLinterCLI:
    def test_exit_zero_when_clean(self):
        ctx_lint = pytest.importorskip("ctx_lint")
        assert ctx_lint.exit_code([]) == 0

    def test_exit_one_on_findings(self):
        ctx_lint = pytest.importorskip("ctx_lint")
        findings = [ctx_core.Finding(17, "I3", "cycle through #16", "finding")]
        assert ctx_lint.exit_code(findings) == 1

    def test_info_and_warning_do_not_flip_exit_code(self):
        ctx_lint = pytest.importorskip("ctx_lint")
        findings = [
            ctx_core.Finding(17, "I1", "edge unsettable here", "info"),
            ctx_core.Finding(17, "I6", "depth 7", "warning"),
        ]
        assert ctx_lint.exit_code(findings) == 0

    def test_finding_renders_as_issue_key_detail(self):
        f = ctx_core.Finding(17, "I3", "cycle through #16", "finding")
        assert str(f) == "#17:I3:cycle through #16"


# ---------------------------------------------------------------------------
# fs_checks — Stage 1 v2 filesystem-level lint pass (CONTRACT-v2.md L1-L4)
#
# Synthetic v2 fixtures only (no dogfood backfill — the walking-skeleton store
# is retired, CONTRACT-v2.md). ``fs_store`` builds a tiny git-init'd store in
# tmp_path and the tests poke component files/dirs directly onto disk — the
# same pattern test_ctx_store.py's TestV2ComponentConcat uses.
# ---------------------------------------------------------------------------

@pytest.fixture
def fs_store(tmp_path):
    ctx_store = pytest.importorskip("ctx_store")
    store_dir = tmp_path / "store"
    ctx_store.init_store(str(store_dir))
    return store_dir


class TestFsChecksL1ComponentParse:
    def test_c1_6_malformed_marker_in_component_file_is_a_finding(self, fs_store):
        ctx_lint = pytest.importorskip("ctx_lint")
        ctx_store = pytest.importorskip("ctx_store")
        node_id = ctx_store.create_node(str(fs_store), "T", "prose\n")
        node_dir = fs_store / "nodes" / str(node_id)
        (node_dir / "spec.md").write_text("📊 Fidelity: banana\n")

        findings = ctx_lint.fs_checks(str(fs_store))

        matches = [f for f in findings if f.key == "spec.md" and f.issue == node_id]
        assert matches
        assert "line 1" in matches[0].detail


class TestFsChecksL2ChildId:
    def test_c1_7_non_integer_child_dir_is_a_finding_and_main_returns_one(self, fs_store):
        ctx_lint = pytest.importorskip("ctx_lint")
        ctx_store = pytest.importorskip("ctx_store")
        node_id = ctx_store.create_node(str(fs_store), "T", "prose\n")
        node_dir = fs_store / "nodes" / str(node_id)
        (node_dir / "notes").mkdir()
        (node_dir / "notes" / "scratch.md").write_text("x\n")

        findings = ctx_lint.fs_checks(str(fs_store))

        matches = [f for f in findings if f.key == "child-id"]
        assert matches
        assert "notes" in matches[0].detail
        # main() must not crash on the malformed dir (it would, at int(name),
        # if it called read_nodes) — it short-circuits on this finding instead.
        assert ctx_lint.main([str(fs_store)]) == 1


class TestFsChecksL3DotDir:
    def test_c1_8_unknown_dot_dir_is_a_finding(self, fs_store):
        ctx_lint = pytest.importorskip("ctx_lint")
        ctx_store = pytest.importorskip("ctx_store")
        node_id = ctx_store.create_node(str(fs_store), "T", "prose\n")
        node_dir = fs_store / "nodes" / str(node_id)
        (node_dir / ".junk").mkdir()

        findings = ctx_lint.fs_checks(str(fs_store))

        matches = [f for f in findings if f.key == "dot-dir"]
        assert matches
        assert ".junk" in matches[0].detail


class TestFsChecksL4NodeMdRequired:
    def test_c1_9_component_without_node_md_is_a_finding(self, fs_store):
        ctx_lint = pytest.importorskip("ctx_lint")
        node_dir = fs_store / "nodes" / "77"
        node_dir.mkdir(parents=True)
        (node_dir / "design.md").write_text("D\n")

        findings = ctx_lint.fs_checks(str(fs_store))

        matches = [f for f in findings if f.key == "node-md" and f.issue == 77]
        assert matches


class TestFsChecksIntegration:
    def test_c1_10_real_store_lints_zero(self):
        # The integration check: the FS pass must not false-positive against
        # the live v1 design store (still all node.md, no components yet).
        # The store is its own nested git repo at the outer-repo root; derive
        # its path from this file rather than hardcoding, and skip cleanly if a
        # checkout doesn't carry it (it is a separate repo).
        ctx_lint = pytest.importorskip("ctx_lint")
        real_store = Path(__file__).resolve().parents[3] / "store"
        if not (real_store / ".git").is_dir():
            pytest.skip("real design store not present in this checkout")
        assert ctx_lint.main([str(real_store)]) == 0

    def test_c1_10_synthetic_clean_v2_fixture_lints_zero(self, fs_store):
        ctx_lint = pytest.importorskip("ctx_lint")
        ctx_store = pytest.importorskip("ctx_store")
        node_id = ctx_store.create_node(str(fs_store), "T", "prose\n")
        node_dir = fs_store / "nodes" / str(node_id)
        (node_dir / "design.md").write_text("More prose.\n")
        (node_dir / "spec.md").write_text("Spec prose.\n")

        assert ctx_lint.main([str(fs_store)]) == 0
