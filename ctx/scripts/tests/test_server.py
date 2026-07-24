"""Behaviour spec for the context MCP — the altitude-relative serving contract.

Maps to plan §6 "Context MCP". The headline rule (#17): get_context returns
ancestor *bodies only* and never volunteers comments, siblings, or children —
detail is opt-in, and registry/dead-end queries return scoped entries, never
the whole index (the token rule).

The server lives in ``ctx_mcp/`` (renamed from ``mcp/`` so it never shadows the
``mcp`` SDK package — see #41.q1). We still load it by path here so the suite has
no import-name dependency. Tools are tested against an injected ``FakeSource`` so
no network is touched.

Assumed tool surface (each takes a source provider + the target):

    server.get_context(source, issue)   -> [NodeView(root..issue), bodies + state]
    server.get_thread(source, issue)    -> full comment list
    server.get_siblings(source, issue)  -> [titles + one-line purpose]
    server.get_children(source, issue)  -> [titles + one-line purpose]
    server.query_registry(source, key)  -> single entry
    server.query_deadends(source, scope)-> scoped subset
    server.ContextError                 -> raised naming a broken edge

Pending until Stage 5 (context MCP).
"""

import importlib.util
from pathlib import Path

import pytest

SERVER_PATH = Path(__file__).resolve().parent.parent.parent / "ctx_mcp" / "server.py"
if not SERVER_PATH.exists():
    pytest.skip("server.py not present yet — Stage 5 (context MCP)",
                allow_module_level=True)

# Stage 2 (CONTRACT-v2.md) component-serving tests exercise a real store via
# ctx_source/ctx_store rather than FakeSource for the C2.3/C2.6 gate.
ctx_source = pytest.importorskip("ctx_source")
ctx_store = pytest.importorskip("ctx_store")

_spec = importlib.util.spec_from_file_location("ctx_server_under_test", SERVER_PATH)
server = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(server)

PENDING = "pending — Stage 5 (context MCP)"


class FakeSource:
    """In-memory stand-in for the fetch layer: a small tree + registry."""

    def __init__(self):
        self.nodes = {
            16: dict(title="Epic", body="root body", state="open",
                     state_reason=None, parent=None, children=[17, 20],
                     comments=["c16-a", "c16-b"], purpose="the whole epic"),
            17: dict(title="Design node", body="design body", state="open",
                     state_reason=None, parent=16, children=[],
                     comments=["c17-a"], purpose="one design slice",
                     components={"design.md": "design comp text",
                                 "spec.md": "spec comp text"}),
            20: dict(title="Sibling", body="sib body", state="open",
                     state_reason=None, parent=16, children=[],
                     comments=[], purpose="a sibling slice"),
        }
        self.registry = {
            "smith2020": dict(kind="cite", source="Smith et al. 2020"),
            "smith2020_msPAF": dict(kind="eq", latex="..."),
        }
        self.dead_ends = {17: ["FFT padding too slow"], 20: ["other dead-end"]}


@pytest.fixture
def source():
    return FakeSource()


# --------------------------------------------------------------------------
# get_context — the altitude rule
# --------------------------------------------------------------------------
class TestGetContext:
    def test_returns_ordered_root_to_target_bodies(self, source):
        views = server.get_context(source, 17)
        assert [v.number for v in views] == [16, 17]
        assert [v.body for v in views] == ["root body", "design body"]

    def test_includes_state_and_state_reason(self, source):
        views = server.get_context(source, 17)
        assert all(hasattr(v, "state") and hasattr(v, "state_reason") for v in views)

    def test_never_volunteers_comments_or_siblings_or_children(self, source):
        views = server.get_context(source, 17)
        blob = repr(views)
        assert "c16-a" not in blob and "c17-a" not in blob   # no comments
        assert "sib body" not in blob                         # no sibling #20


# --------------------------------------------------------------------------
# Opt-in detail
# --------------------------------------------------------------------------
class TestOptInDetail:
    def test_get_thread_returns_full_comments(self, source):
        assert server.get_thread(source, 16) == ["c16-a", "c16-b"]

    def test_siblings_are_titles_and_purposes_not_bodies(self, source):
        sibs = server.get_siblings(source, 17)
        blob = repr(sibs)
        assert "Sibling" in blob and "a sibling slice" in blob
        assert "sib body" not in blob

    def test_children_are_titles_and_purposes_not_bodies(self, source):
        kids = server.get_children(source, 16)
        blob = repr(kids)
        assert "Design node" in blob and "one design slice" in blob
        assert "design body" not in blob


# --------------------------------------------------------------------------
# Registry / dead-end queries — scoped, never the whole index (token rule)
# --------------------------------------------------------------------------
class TestScopedQueries:
    def test_query_registry_returns_a_single_entry(self, source):
        entry = server.query_registry(source, "smith2020")
        assert entry["source"] == "Smith et al. 2020"
        assert "smith2020_msPAF" not in repr(entry)   # not the whole index

    def test_query_deadends_returns_only_the_scoped_subset(self, source):
        result = server.query_deadends(source, 17)
        assert result == ["FFT padding too slow"]
        assert "other dead-end" not in repr(result)   # #20's not included


# --------------------------------------------------------------------------
# Broken-edge handling — structured error, not a hang
# --------------------------------------------------------------------------
class TestBrokenEdges:
    def test_missing_parent_raises_structured_error_naming_the_edge(self, source):
        source.nodes[17]["parent"] = 999          # dangling parent
        with pytest.raises(server.ContextError) as exc:
            server.get_context(source, 17)
        assert "999" in str(exc.value)

    def test_cycle_while_walking_raises_rather_than_hangs(self, source):
        source.nodes[16]["parent"] = 17           # 16<->17 cycle
        source.nodes[17]["parent"] = 16
        with pytest.raises(server.ContextError):
            server.get_context(source, 17)


# --------------------------------------------------------------------------
# Stage 2 (CONTRACT-v2.md) — optional `component` param on get_context /
# _context_payload / the `context` MCP tool. component=None is unchanged
# (C2.2); an allowed component serves that node's stored component text,
# "" when a node (e.g. a v1 ancestor) lacks it (C2.5); an unknown component
# name raises ContextError (C2.4).
# --------------------------------------------------------------------------
class TestGetContextComponentParam:
    def test_c2_2_no_component_arg_is_unchanged_regression(self, source):
        # Byte-for-byte the pre-Stage-2 behaviour: whole (concatenated) body.
        views = server.get_context(source, 17)
        assert [v.body for v in views] == ["root body", "design body"]

    def test_c2_5_component_present_on_target_absent_on_v1_ancestor(self, source):
        # node 17 carries a components dict (set up in FakeSource); node 16
        # has no "components" key at all — the defensive .get() path.
        views = server.get_context(source, 17, "spec.md")
        by_number = {v.number: v.body for v in views}
        assert by_number[16] == ""                     # v1 ancestor: absent
        assert by_number[17] == "spec comp text"

    def test_c2_4_unknown_component_raises_context_error(self, source):
        with pytest.raises(server.ContextError) as exc:
            server.get_context(source, 17, "bogus.md")
        assert "bogus.md" in str(exc.value)

    def test_c2_6_context_payload_carries_component_text(self, source):
        payload = server._context_payload(source, 17, "spec.md")
        by_number = {p["number"]: p["body"] for p in payload}
        assert by_number[17] == "spec comp text"
        assert by_number[16] == ""


class TestGetContextComponentOverRealStore:
    """C2.3/C2.6 gate: serve a synthetic v2 node's spec.md end-to-end through
    ctx_store -> ctx_source.RepoSource -> server.get_context/_context_payload
    (not FakeSource) — the real store integration proof the stage gate wants.
    """

    def test_c2_3_serves_real_v2_node_spec_md_through_get_context(self, tmp_path):
        store_dir = tmp_path / "store"
        ctx_store.init_store(str(store_dir))
        parent = ctx_store.create_node(str(store_dir), "Epic", "# Epic\n")
        child = ctx_store.create_node(
            str(store_dir), "Design node", "# Design\n", parent=parent)
        child_dir = store_dir / "nodes" / str(parent) / str(child)
        child_dir.mkdir(parents=True, exist_ok=True)
        (child_dir / "spec.md").write_text("Spec content.\n")

        src = ctx_source.RepoSource(str(store_dir))
        views = server.get_context(src, child, "spec.md")
        by_number = {v.number: v.body for v in views}
        assert by_number[child] == "Spec content.\n"
        assert by_number[parent] == ""   # v1 ancestor, no spec.md

    def test_c2_6_context_payload_over_real_store(self, tmp_path):
        store_dir = tmp_path / "store"
        ctx_store.init_store(str(store_dir))
        node_id = ctx_store.create_node(str(store_dir), "T", "prose\n")
        node_dir = store_dir / "nodes" / str(node_id)
        (node_dir / "spec.md").write_text("Payload spec.\n")

        src = ctx_source.RepoSource(str(store_dir))
        payload = server._context_payload(src, node_id, "spec.md")
        [entry] = payload
        assert entry["number"] == node_id
        assert entry["body"] == "Payload spec.\n"
