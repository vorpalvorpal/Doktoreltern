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
                     comments=["c17-a"], purpose="one design slice"),
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
