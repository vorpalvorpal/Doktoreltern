"""Behaviour spec for RepoSource (#41) + the serving fns over it + SDK transport."""
import importlib.util
from pathlib import Path

import pytest

ctx_core = pytest.importorskip("ctx_core")
ctx_source = pytest.importorskip("ctx_source")
ctx_store = pytest.importorskip("ctx_store")
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
               "# Design node\nOne design slice.\n"
               "🪦 Dead-end: #17.de1 closed tried FFT\n🟰 Eq: smith2020\n",
               "open", None, set(), parent=16),
    ]


def _source():
    return ctx_source.RepoSource("owner/repo", fetch=lambda r: _nodes())


class TestOverRealStore:
    """RepoSource with no injected fetch reads a real ctx_store-backed store."""

    def test_default_fetch_reads_the_local_store(self, tmp_path):
        store_dir = tmp_path / "store"
        ctx_store.init_store(str(store_dir))
        parent = ctx_store.create_node(str(store_dir), "Epic", "# Epic\nThe whole epic.\n")
        child = ctx_store.create_node(
            str(store_dir), "Design node",
            "# Design node\nOne design slice.\n",
            parent=parent,
        )
        ctx_store.add_comment(str(store_dir), parent, "c16")

        src = ctx_source.RepoSource(str(store_dir))
        assert src.nodes[child]["parent"] == parent
        assert src.nodes[parent]["children"] == [child]
        assert src.nodes[parent]["title"] == "Epic"
        assert src.nodes[parent]["comments"] == ["c16"]


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


class TestPurposeExtraction:
    def _purpose_for(self, body):
        nodes = [C.Node(16, body, "open", None, set())]
        return ctx_source.RepoSource("r", fetch=lambda r: nodes).nodes[16]["purpose"]

    def test_strips_leading_bold_label(self):
        body = ("# X\n"
                "**Stub.** The control layer adds the **axes** and **scheduler**. More.\n")
        assert self._purpose_for(body) == "The control layer adds the axes and scheduler."

    def test_strips_partof_connector_and_emphasis(self):
        body = "# X\nPart of #1. **The foundation** everything consumes.\n"
        assert self._purpose_for(body) == "The foundation everything consumes."

    def test_takes_only_the_first_sentence(self):
        body = "# X\nFirst sentence here. Second sentence.\n"
        assert self._purpose_for(body) == "First sentence here."

    def test_joins_wrapped_lines_no_midsentence_truncation(self):
        # regression for #32-style bodies that previously returned a garbled
        # continuation line beginning "axes** (...".
        body = ("# X\n"
                "**Stub.** The control layer adds the **four\n"
                "axes** (a, b), the **scheduler**.\n")
        p = self._purpose_for(body)
        assert p == "The control layer adds the four axes (a, b), the scheduler."
        assert "**" not in p and not p.startswith("axes")


class TestTitlePreference:
    def test_prefers_github_title_over_body_heading(self):
        nodes = [C.Node(16, "# Body Heading\nThe whole epic.\n", "open", None, set(),
                        title="Real GitHub Title")]
        src = ctx_source.RepoSource("r", fetch=lambda r: nodes)
        assert src.nodes[16]["title"] == "Real GitHub Title"

    def test_falls_back_to_body_heading_then_number(self):
        nodes = [
            C.Node(16, "# Body Heading\nx\n", "open", None, set()),          # no gh title
            C.Node(17, "no heading here\n", "open", None, set(), parent=16),
        ]
        src = ctx_source.RepoSource("r", fetch=lambda r: nodes)
        assert src.nodes[16]["title"] == "Body Heading"   # body-heading fallback
        assert src.nodes[17]["title"] == "#17"            # final fallback


class TestServingOverRepoSource:
    def test_get_context_walks_real_tree(self):
        server = _load_server()
        views = server.get_context(_source(), 17)
        assert [v.number for v in views] == [16, 17]
        assert [v.body.splitlines()[0] for v in views] == ["# Epic", "# Design node"]

    def test_siblings_are_summaries(self):
        server = _load_server()
        # add a second child so 17 has a sibling
        nodes = _nodes() + [C.Node(18, "# Other\nanother slice.\n",
                                   "open", None, set(), parent=16)]
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
