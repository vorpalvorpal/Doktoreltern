"""Behaviour spec for RepoSource (#41) + the serving fns over it + SDK transport."""
import importlib.util
from pathlib import Path

import pytest

ctx_core = pytest.importorskip("ctx_core")
ctx_source = pytest.importorskip("ctx_source")
C = ctx_core

SERVER_PATH = Path(__file__).resolve().parent.parent.parent / "ctx_mcp" / "server.py"


def _load_server():
    spec = importlib.util.spec_from_file_location("ctx_server_src_test", SERVER_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _nodes():
    return [
        C.Node(16, "# Epic\nThe whole epic.\n", "open", None, set(), [C.Comment(1, "c16")]),
        C.Node(17,
               "# Design node\n🧩 Part-of: #16\nOne design slice.\n"
               "🪦 Dead-end: #17.de1 closed tried FFT\n🟰 Eq: smith2020\n",
               "open", None, set()),
    ]


def _source():
    return ctx_source.RepoSource("owner/repo", fetch=lambda r: _nodes())


class TestAdapterShape:
    def test_tree_links(self):
        s = _source()
        assert s.nodes[17]["parent"] == 16
        assert s.nodes[16]["children"] == [17]
        assert s.nodes[17]["children"] == []

    def test_title_and_purpose_from_body(self):
        s = _source()
        assert s.nodes[16]["title"] == "Epic"
        assert s.nodes[16]["purpose"] == "The whole epic."
        assert s.nodes[17]["purpose"] == "One design slice."   # marker line skipped

    def test_comments_and_state(self):
        s = _source()
        assert s.nodes[16]["comments"] == ["c16"]
        assert s.nodes[16]["state"] == "open"

    def test_dead_ends_and_registry(self):
        s = _source()
        assert s.dead_ends[17] == ["tried FFT"]
        assert "smith2020" in s.registry


class TestServingOverRepoSource:
    def test_get_context_walks_real_tree(self):
        server = _load_server()
        views = server.get_context(_source(), 17)
        assert [v.number for v in views] == [16, 17]
        assert [v.body.splitlines()[0] for v in views] == ["# Epic", "# Design node"]

    def test_siblings_are_summaries(self):
        server = _load_server()
        # add a second child so 17 has a sibling
        nodes = _nodes() + [C.Node(18, "# Other\n🧩 Part-of: #16\nanother slice.\n",
                                   "open", None, set())]
        src = ctx_source.RepoSource("r", fetch=lambda r: nodes)
        sibs = server.get_siblings(src, 17)
        blob = repr(sibs)
        assert "Other" in blob and "another slice." in blob


class TestTransport:
    def test_build_server_registers_tools(self):
        pytest.importorskip("mcp")
        server = _load_server()
        app = server.build_server(_source())
        assert app is not None
