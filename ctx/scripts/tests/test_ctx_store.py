"""Behaviour spec for the local git-backed store (imperative shell).

Maps to dev/01-store-substrate.md (requirements R1-R10, R4b) and
dev/CONTRACT.md ("ctx_store public API"). ctx_store does not exist yet — this
suite is expected to fail at collection/import time (the module-level
``importskip`` below turns that into a clean skip rather than an error, per
the existing suite's convention in test_ctx_fetch.py); every test body is a
real assertion against the pinned contract, not a stub, so once ctx_store
lands the suite goes straight to red-for-real-reasons / green.

Do NOT mock git: the commit-per-write behaviour (R9) and init_store's
git-init/idempotence behaviour (R4b) are correctness criteria in their own
right, so every test that touches git runs the real binary against a
tmp_path store.
"""

import subprocess
from pathlib import Path

import pytest

ctx_core = pytest.importorskip("ctx_core")
ctx_store = pytest.importorskip("ctx_store")


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _git(store, *args):
    """Run git -C <store> <args>, returning CompletedProcess (text, checked)."""
    return subprocess.run(
        ["git", "-C", str(store), *args],
        check=True, capture_output=True, text=True,
    )


def _commit_subjects(store):
    """Ascending-oldest-first list of commit subject lines."""
    out = _git(store, "log", "--reverse", "--format=%s").stdout
    return [line for line in out.splitlines() if line]


def _malformed_body():
    """A body with a marker ctx_core.parse() will flag — reused verbatim from
    test_ctx_fetch.py's TestWritePath (📊 Fidelity: banana) so the same
    known-bad fixture is exercised across both suites."""
    return "📊 Fidelity: banana\n"


def _valid_body(parent=None):
    # The tree is the filesystem now — a node's parent is the `parent=` kwarg to
    # create_node, never a Part-of marker in the body. `parent` is accepted (and
    # ignored) only for call-site compatibility.
    return "Some prose.\n"


# ---------------------------------------------------------------------------
# fixture: a real, git-init'd store
# ---------------------------------------------------------------------------

@pytest.fixture
def store(tmp_path):
    """A tmp_path subdir bootstrapped via ctx_store.init_store (real git init,
    throwaway identity, initial commit, _next=1). Exercises init_store on
    every test as a side benefit (see plan's test-file note)."""
    store_dir = tmp_path / "store"
    ctx_store.init_store(str(store_dir))
    return store_dir


# ---------------------------------------------------------------------------
# R4b — init_store bootstrap
# ---------------------------------------------------------------------------

class TestInitStore:
    def test_init_store_creates_git_repo_and_next(self, tmp_path):
        store_dir = tmp_path / "fresh"
        ctx_store.init_store(str(store_dir))
        assert (store_dir / ".git").is_dir()
        next_val = (store_dir / "_next").read_text()
        assert next_val == "1\n" or next_val.strip() == "1"

    def test_init_store_makes_initial_commit(self, store):
        subjects = _commit_subjects(store)
        assert len(subjects) >= 1

    def test_init_store_idempotent(self, store):
        # store already exists (fixture ran init_store once); calling again
        # must be a silent no-op: no raise, _next untouched.
        before_next = (store / "_next").read_text()
        before_log = _commit_subjects(store)
        ctx_store.init_store(str(store))  # must not raise
        after_next = (store / "_next").read_text()
        after_log = _commit_subjects(store)
        assert before_next == after_next
        assert before_log == after_log

    def test_init_store_result_is_empty_and_allocates_id_one(self, store):
        assert ctx_store.read_nodes(str(store)) == []
        new_id = ctx_store.create_node(str(store), "First", _valid_body())
        assert new_id == 1


# ---------------------------------------------------------------------------
# R1 — layout helpers create no directories as a side effect
# ---------------------------------------------------------------------------

class TestLayoutHelpers:
    def test_path_helpers_do_not_create_directories(self, tmp_path):
        store_dir = tmp_path / "untouched"
        ctx_store.init_store(str(store_dir))
        # Reference a node id that has never been created — the helper must
        # compute the path without creating it.
        for helper_name, args in (
            ("_nodes_dir", (str(store_dir),)),
            ("_node_dir", (str(store_dir), 999)),
            ("_next_path", (str(store_dir),)),
            ("_comments_dir", (str(store_dir), 999)),
        ):
            helper = getattr(ctx_store, helper_name)
            path = Path(helper(*args))
            if helper_name != "_next_path":
                assert not path.exists(), f"{helper_name} must not create {path}"

    def test_path_helpers_accept_relative_and_absolute_store(self, tmp_path, monkeypatch):
        store_dir = tmp_path / "relstore"
        ctx_store.init_store(str(store_dir))
        abs_path = ctx_store._nodes_dir(str(store_dir))
        monkeypatch.chdir(tmp_path)
        rel_path = ctx_store._nodes_dir("relstore")
        assert Path(abs_path).resolve() == Path(rel_path).resolve()


# ---------------------------------------------------------------------------
# R2 — node.md (de)serialization
# ---------------------------------------------------------------------------

class TestNodeMdSerialization:
    def test_write_then_read_node_file_roundtrips(self, tmp_path):
        path = tmp_path / "node.md"
        body = "Intro prose.\n\nSome more text.\n"
        ctx_store._write_node_file(
            str(path), title="Combiner for stacked exposures", state="open",
            state_reason=None, labels=["dormant"], body=body,
        )
        frontmatter, read_body = ctx_store._read_node_file(str(path))
        assert frontmatter["title"] == "Combiner for stacked exposures"
        assert frontmatter["state"] == "open"
        assert frontmatter["state_reason"] is None
        assert frontmatter["labels"] == ["dormant"]
        assert read_body == body

    def test_node_md_body_byte_identical_via_unfiltered_diff(self, tmp_path):
        path = tmp_path / "node.md"
        body = "Line one.\nLine two.\n\nA third paragraph.\n"
        ctx_store._write_node_file(
            str(path), title="T", state="open", state_reason=None,
            labels=[], body=body,
        )
        _frontmatter, read_body = ctx_store._read_node_file(str(path))
        # [MEASURE TWICE] confirm identity with an unfiltered diff, not just ==
        expected = tmp_path / "expected_body.txt"
        actual = tmp_path / "actual_body.txt"
        expected.write_text(body)
        actual.write_text(read_body)
        result = subprocess.run(
            ["diff", str(expected), str(actual)], capture_output=True, text=True,
        )
        assert result.returncode == 0, result.stdout

    def test_state_reason_none_serializes_empty_and_parses_none(self, tmp_path):
        path = tmp_path / "node.md"
        ctx_store._write_node_file(
            str(path), title="T", state="open", state_reason=None,
            labels=[], body="body\n",
        )
        text = path.read_text()
        # the raw frontmatter line for state_reason must carry no value
        fm_lines = text.split("---")[1].splitlines()
        reason_lines = [l for l in fm_lines if l.strip().startswith("state_reason:")]
        assert reason_lines, "expected a state_reason: line in frontmatter"
        assert reason_lines[0].strip() == "state_reason:"
        frontmatter, _ = ctx_store._read_node_file(str(path))
        assert frontmatter["state_reason"] is None

    def test_labels_empty_list_serializes_and_parses_as_empty_list(self, tmp_path):
        path = tmp_path / "node.md"
        ctx_store._write_node_file(
            str(path), title="T", state="open", state_reason=None,
            labels=[], body="body\n",
        )
        text = path.read_text()
        fm_lines = text.split("---")[1].splitlines()
        label_lines = [l for l in fm_lines if l.strip().startswith("labels:")]
        assert label_lines
        assert label_lines[0].strip() == "labels: []"
        frontmatter, _ = ctx_store._read_node_file(str(path))
        assert frontmatter["labels"] == []

    def test_body_thematic_break_does_not_confuse_frontmatter_parser(self, tmp_path):
        path = tmp_path / "node.md"
        body = "---\n\nA body that itself starts with a thematic break.\n"
        ctx_store._write_node_file(
            str(path), title="T", state="open", state_reason=None,
            labels=[], body=body,
        )
        frontmatter, read_body = ctx_store._read_node_file(str(path))
        assert frontmatter["title"] == "T"
        assert read_body == body

    def test_malformed_node_file_without_opening_fence_raises_storeerror(self, tmp_path):
        path = tmp_path / "node.md"
        path.write_text("no frontmatter here, just prose\n")
        with pytest.raises(ctx_store.StoreError) as exc:
            ctx_store._read_node_file(str(path))
        assert str(path) in str(exc.value)


# ---------------------------------------------------------------------------
# R3 — read_comments
# ---------------------------------------------------------------------------

class TestReadComments:
    def test_read_comments_returns_seq_from_filename_sorted_ascending(self, store):
        node_id = ctx_store.create_node(str(store), "T", _valid_body())
        ctx_store.add_comment(str(store), node_id, "first comment\n")
        ctx_store.add_comment(str(store), node_id, "second comment\n")
        comments = ctx_store.read_comments(str(store), node_id)
        assert [c.seq for c in comments] == [1, 2]
        assert [c.text for c in comments] == ["first comment", "second comment"]

    def test_read_comments_missing_dir_returns_empty_list(self, store):
        node_id = ctx_store.create_node(str(store), "Body only", _valid_body())
        assert ctx_store.read_comments(str(store), node_id) == []

    def test_read_comments_strips_trailing_newline_once(self, store):
        node_id = ctx_store.create_node(str(store), "T", _valid_body())
        ctx_store.add_comment(str(store), node_id, "line one\nline two\n\n")
        comments = ctx_store.read_comments(str(store), node_id)
        # exactly one trailing newline stripped, not all trailing whitespace
        assert comments[0].text == "line one\nline two\n"


# ---------------------------------------------------------------------------
# v2 (CONTRACT-v2.md Stage 2) — read_components, symmetric with read_comments
# ---------------------------------------------------------------------------

class TestReadComponents:
    def test_present_components_returned_in_fixed_order(self, store):
        node_id = ctx_store.create_node(str(store), "T", _valid_body())
        node_dir = store / "nodes" / str(node_id)
        # write out of _FILE_COMPONENTS order to prove the dict's key order is
        # the fixed order, not insertion/write order.
        (node_dir / "spec.md").write_text("S\n")
        (node_dir / "design.md").write_text("D\n")
        components = ctx_store.read_components(str(store), node_id)
        assert components == {"design.md": "D\n", "spec.md": "S\n"}
        assert list(components) == ["design.md", "spec.md"]

    def test_absent_components_omitted_empty_dict(self, store):
        node_id = ctx_store.create_node(str(store), "Body only", _valid_body())
        assert ctx_store.read_components(str(store), node_id) == {}

    def test_missing_node_dir_returns_empty_dict_never_raises(self, store):
        assert ctx_store.read_components(str(store), 9999) == {}


# ---------------------------------------------------------------------------
# R4 — read_nodes
# ---------------------------------------------------------------------------

class TestReadNodes:
    def test_read_nodes_empty_store_returns_empty_list(self, store):
        assert ctx_store.read_nodes(str(store)) == []

    def test_read_nodes_one_node_per_dir_number_from_dirname(self, store):
        id1 = ctx_store.create_node(str(store), "First", _valid_body())
        id2 = ctx_store.create_node(str(store), "Second", _valid_body())
        nodes = ctx_store.read_nodes(str(store))
        assert sorted(n.number for n in nodes) == sorted([id1, id2])

    def test_read_nodes_fields_from_frontmatter_and_body(self, store):
        node_id = ctx_store.create_node(
            str(store), "Titled node", "Body prose.\n", labels=["dormant"],
        )
        [node] = ctx_store.read_nodes(str(store))
        assert node.title == "Titled node"
        assert node.state == "open"
        assert node.state_reason is None
        assert node.labels == {"dormant"}
        assert node.body == "Body prose.\n"

    def test_read_nodes_attaches_comments(self, store):
        node_id = ctx_store.create_node(str(store), "T", _valid_body())
        ctx_store.add_comment(str(store), node_id, "c1\n")
        ctx_store.add_comment(str(store), node_id, "c2\n")
        [node] = ctx_store.read_nodes(str(store))
        assert [c.seq for c in node.comments] == [1, 2]

    def test_read_nodes_ordered_ascending_by_id(self, store):
        ids = [ctx_store.create_node(str(store), f"N{i}", _valid_body()) for i in range(5)]
        nodes = ctx_store.read_nodes(str(store))
        assert [n.number for n in nodes] == sorted(ids)

    def test_read_nodes_feeds_collate(self, store):
        parent_id = ctx_store.create_node(str(store), "Parent", _valid_body())
        child_id = ctx_store.create_node(
            str(store), "Child", _valid_body(parent=parent_id), parent=parent_id,
        )
        nodes = ctx_store.read_nodes(str(store))
        model = ctx_core.collate(nodes)
        assert (parent_id, child_id) in model.tree_edges


# ---------------------------------------------------------------------------
# v2 (Stage 1, CONTRACT-v2.md) — component concat via read_nodes
#
# Synthetic v2 fixtures only (no dogfood backfill — the walking-skeleton store
# is retired, CONTRACT-v2.md). Component files (design.md/spec.md/log.md) are
# written directly beside node.md: create_node/add_comment don't know about
# components yet (that's Stage 2/3), so these tests poke the filesystem
# directly to build the tiny v2 worlds this stage's read path must handle.
# ---------------------------------------------------------------------------

class TestV2ComponentConcat:
    def test_c1_1_v1_only_node_body_is_byte_identical(self, store):
        # C1.1 — a node with only node.md (no components present) round-trips
        # its body byte-for-byte, exactly as before v2 landed. [MEASURE TWICE]:
        # confirm with an unfiltered `diff`, not just `==` (an rtk hook can
        # filter shell diff output and misreport "identical").
        body = "Some v1 prose.\n\nA second paragraph.\n"
        ctx_store.create_node(str(store), "V1 node", body)
        [node] = ctx_store.read_nodes(str(store))
        assert node.body == body

        expected = store / "expected_body.txt"
        actual = store / "actual_body.txt"
        expected.write_text(body)
        actual.write_text(node.body)
        result = subprocess.run(
            ["diff", str(expected), str(actual)], capture_output=True, text=True,
        )
        assert result.returncode == 0, result.stdout

    def test_c1_2_full_concat_all_four_pieces(self, store):
        # C1.2 — node.md "A\n" + design "D\n" + spec "S\n" + log "L\n"
        node_id = ctx_store.create_node(str(store), "T", "A\n")
        node_dir = store / "nodes" / str(node_id)
        (node_dir / "design.md").write_text("D\n")
        (node_dir / "spec.md").write_text("S\n")
        (node_dir / "log.md").write_text("L\n")
        [node] = ctx_store.read_nodes(str(store))
        assert node.body == "A\n\n\nD\n\n\nS\n\n\nL\n"

    def test_c1_3_thin_index_two_components_no_leading_blank(self, store):
        # C1.3 — empty node.md body + design "D\n" + spec "S\n"; the empty
        # node_body piece is filtered out, so no leading blank line appears.
        node_id = ctx_store.create_node(str(store), "T", "")
        node_dir = store / "nodes" / str(node_id)
        (node_dir / "design.md").write_text("D\n")
        (node_dir / "spec.md").write_text("S\n")
        [node] = ctx_store.read_nodes(str(store))
        assert node.body == "D\n\n\nS\n"

    def test_c1_4_single_component_is_returned_verbatim(self, store):
        # C1.4 — empty node.md body + only log "L\n" -> "L\n" verbatim (single
        # present piece, no join at all).
        node_id = ctx_store.create_node(str(store), "T", "")
        node_dir = store / "nodes" / str(node_id)
        (node_dir / "log.md").write_text("L\n")
        [node] = ctx_store.read_nodes(str(store))
        assert node.body == "L\n"

    def test_c1_5_markers_gather_across_components_into_collate(self, store):
        # C1.5 — a design.md marker and a spec.md marker on one node both
        # surface in collate(read_nodes(...))'s model (the concat makes them
        # one blob for parse()); a keyed id declared once in design.md and
        # merely referenced as prose in spec.md stays a single registries
        # entry — unique per node, not duplicated by the concatenation.
        node_id = ctx_store.create_node(str(store), "T", "")
        node_dir = store / "nodes" / str(node_id)
        (node_dir / "design.md").write_text(
            "🏷️ aspect: numerics\n"
            f"❓ Question: #{node_id}.q1 open Does the combiner hold?\n"
        )
        (node_dir / "spec.md").write_text(
            "📚 Cites: smith2020\n"
            f"See #{node_id}.q1 above for the open question.\n"
        )
        model = ctx_core.collate(ctx_store.read_nodes(str(store)))
        assert "numerics" in model.aspects[node_id]
        assert node_id in model.registry["smith2020"]
        questions = [
            kv for (nid, kv) in model.registries[ctx_core.QUESTION] if nid == node_id
        ]
        assert len(questions) == 1
        assert questions[0].id == f"#{node_id}.q1"


# ---------------------------------------------------------------------------
# R5 — id allocation
# ---------------------------------------------------------------------------

class TestIdAllocation:
    def test_create_node_allocates_gapfree_ids(self, store):
        id1 = ctx_store.create_node(str(store), "First", _valid_body())
        id2 = ctx_store.create_node(str(store), "Second", _valid_body())
        assert id1 == 1
        assert id2 == 2

    def test_next_file_bumped_to_k_plus_one_after_allocating_k(self, store):
        node_id = ctx_store.create_node(str(store), "First", _valid_body())
        next_val = (store / "_next").read_text().strip()
        assert int(next_val) == node_id + 1

    def test_alloc_and_write_land_in_one_commit(self, store):
        before = len(_commit_subjects(store))
        ctx_store.create_node(str(store), "First", _valid_body())
        after = _commit_subjects(store)
        assert len(after) == before + 1
        status = _git(store, "status", "--porcelain").stdout
        assert status.strip() == ""


# ---------------------------------------------------------------------------
# R6 — create_node
# ---------------------------------------------------------------------------

class TestCreateNode:
    def test_rejected_body_writes_nothing(self, store):
        before_ids = {n.number for n in ctx_store.read_nodes(str(store))}
        before_next = (store / "_next").read_text()
        before_log = _commit_subjects(store)
        # unfiltered snapshot of the whole store tree for a byte-level check
        before_tracked = _git(store, "ls-files").stdout

        with pytest.raises(ctx_store.ValidationError):
            ctx_store.create_node(str(store), "Bad", _malformed_body())

        after_ids = {n.number for n in ctx_store.read_nodes(str(store))}
        after_next = (store / "_next").read_text()
        after_log = _commit_subjects(store)
        after_tracked = _git(store, "ls-files").stdout
        status = _git(store, "status", "--porcelain").stdout

        assert after_ids == before_ids
        assert after_next == before_next
        assert after_log == before_log
        assert after_tracked == before_tracked
        assert status.strip() == "", "store must be byte-unchanged after a rejected create"

    def test_create_node_writes_open_state_none_reason_given_labels(self, store):
        node_id = ctx_store.create_node(
            str(store), "T", _valid_body(), labels=["dormant"],
        )
        [node] = ctx_store.read_nodes(str(store))
        assert node.state == "open"
        assert node.state_reason is None
        assert node.labels == {"dormant"}

    def test_create_node_defaults_labels_to_empty_list(self, store):
        node_id = ctx_store.create_node(str(store), "T", _valid_body())
        [node] = ctx_store.read_nodes(str(store))
        assert node.labels == set()

    def test_create_node_nests_under_declared_parent(self, store):
        # The tree is the filesystem: parent comes from the kwarg, and read_nodes
        # derives Node.parent from the nesting (no Part-of marker involved).
        parent_id = ctx_store.create_node(str(store), "Parent", _valid_body())
        child_id = ctx_store.create_node(
            str(store), "Child", _valid_body(), parent=parent_id,
        )
        [child] = [n for n in ctx_store.read_nodes(str(store)) if n.number == child_id]
        assert child.parent == parent_id

    def test_create_node_child_dir_nests_inside_parent_dir(self, store):
        parent_id = ctx_store.create_node(str(store), "Parent", _valid_body())
        child_id = ctx_store.create_node(
            str(store), "Child", _valid_body(), parent=parent_id,
        )
        # The child's node.md lives physically under the parent's dir.
        nested = store / "nodes" / str(parent_id) / str(child_id) / "node.md"
        assert nested.exists()

    def test_create_node_rejects_unknown_parent(self, store):
        # A parent id that resolves to no existing node dir is refused, and
        # nothing is written (no id burned, no commit).
        before_next = (store / "_next").read_text()
        before_log = _commit_subjects(store)
        with pytest.raises(ctx_store.StoreError):
            ctx_store.create_node(str(store), "Orphan", _valid_body(), parent=999)
        assert (store / "_next").read_text() == before_next
        assert _commit_subjects(store) == before_log

    def test_create_node_without_parent_is_a_root(self, store):
        # No parent kwarg ⇒ a root dir directly under nodes/, Node.parent is None,
        # and the body is stored verbatim (no marker is ever injected).
        body = "Plain body, no marker.\n"
        child_id = ctx_store.create_node(str(store), "Root", body)
        [child] = [n for n in ctx_store.read_nodes(str(store)) if n.number == child_id]
        assert child.parent is None
        assert child.body == body
        assert (store / "nodes" / str(child_id) / "node.md").exists()

    def test_create_node_returns_new_id(self, store):
        node_id = ctx_store.create_node(str(store), "T", _valid_body())
        assert node_id == 1

    def test_create_node_commit_message(self, store):
        node_id = ctx_store.create_node(str(store), "T", _valid_body())
        subjects = _commit_subjects(store)
        assert subjects[-1] == f"node #{node_id}: create"


# ---------------------------------------------------------------------------
# R7 — add_comment / update_comment / set_state
# ---------------------------------------------------------------------------

class TestAddComment:
    def test_add_comment_rejects_malformed_body_writes_nothing(self, store):
        node_id = ctx_store.create_node(str(store), "T", _valid_body())
        before_log = _commit_subjects(store)
        with pytest.raises(ctx_store.ValidationError):
            ctx_store.add_comment(str(store), node_id, _malformed_body())
        assert ctx_store.read_comments(str(store), node_id) == []
        assert _commit_subjects(store) == before_log

    def test_add_comment_next_seq_is_max_plus_one(self, store):
        node_id = ctx_store.create_node(str(store), "T", _valid_body())
        seq1 = ctx_store.add_comment(str(store), node_id, "c1\n")
        seq2 = ctx_store.add_comment(str(store), node_id, "c2\n")
        assert seq1 == 1
        assert seq2 == 2

    def test_add_comment_creates_comments_dir_if_absent(self, store):
        node_id = ctx_store.create_node(str(store), "T", _valid_body())
        # `.comments` is dot-prefixed so it is never mistaken for a child node.
        assert not (store / "nodes" / str(node_id) / ".comments").exists()
        ctx_store.add_comment(str(store), node_id, "c1\n")
        assert (store / "nodes" / str(node_id) / ".comments").is_dir()

    def test_add_comment_commit_message(self, store):
        node_id = ctx_store.create_node(str(store), "T", _valid_body())
        seq = ctx_store.add_comment(str(store), node_id, "c1\n")
        subjects = _commit_subjects(store)
        assert subjects[-1] == f"node #{node_id}: comment {seq}"

    def test_add_comment_raises_storeerror_for_missing_node(self, store):
        with pytest.raises(ctx_store.StoreError):
            ctx_store.add_comment(str(store), 999, "c1\n")


class TestUpdateComment:
    def test_update_comment_overwrites_in_place(self, store):
        node_id = ctx_store.create_node(str(store), "T", _valid_body())
        seq = ctx_store.add_comment(str(store), node_id, "original\n")
        ctx_store.update_comment(str(store), node_id, seq, "amended\n")
        [comment] = ctx_store.read_comments(str(store), node_id)
        assert comment.text == "amended"

    def test_update_comment_missing_file_raises_storeerror(self, store):
        node_id = ctx_store.create_node(str(store), "T", _valid_body())
        with pytest.raises(ctx_store.StoreError):
            ctx_store.update_comment(str(store), node_id, 1, "no such comment\n")

    def test_update_comment_rejects_malformed_body(self, store):
        node_id = ctx_store.create_node(str(store), "T", _valid_body())
        seq = ctx_store.add_comment(str(store), node_id, "original\n")
        with pytest.raises(ctx_store.ValidationError):
            ctx_store.update_comment(str(store), node_id, seq, _malformed_body())
        [comment] = ctx_store.read_comments(str(store), node_id)
        assert comment.text == "original"

    def test_update_comment_commit_message(self, store):
        node_id = ctx_store.create_node(str(store), "T", _valid_body())
        seq = ctx_store.add_comment(str(store), node_id, "original\n")
        ctx_store.update_comment(str(store), node_id, seq, "amended\n")
        subjects = _commit_subjects(store)
        assert subjects[-1] == f"node #{node_id}: update comment {seq}"


class TestSetState:
    def test_set_state_rewrites_state_and_reason(self, store):
        node_id = ctx_store.create_node(str(store), "T", _valid_body())
        ctx_store.set_state(str(store), node_id, "closed", state_reason="completed")
        [node] = ctx_store.read_nodes(str(store))
        assert node.state == "closed"
        assert node.state_reason == "completed"

    def test_set_state_labels_none_leaves_labels_unchanged(self, store):
        node_id = ctx_store.create_node(str(store), "T", _valid_body(), labels=["dormant"])
        ctx_store.set_state(str(store), node_id, "closed", state_reason="completed")
        [node] = ctx_store.read_nodes(str(store))
        assert node.labels == {"dormant"}

    def test_set_state_labels_given_overwrites(self, store):
        node_id = ctx_store.create_node(str(store), "T", _valid_body(), labels=["dormant"])
        ctx_store.set_state(str(store), node_id, "closed", labels=[])
        [node] = ctx_store.read_nodes(str(store))
        assert node.labels == set()

    def test_set_state_invalid_state_raises_storeerror(self, store):
        node_id = ctx_store.create_node(str(store), "T", _valid_body())
        with pytest.raises(ctx_store.StoreError):
            ctx_store.set_state(str(store), node_id, "sideways")

    def test_set_state_preserves_body_byte_identical(self, store):
        parent_id = ctx_store.create_node(str(store), "Parent", _valid_body())
        body = "Prose with detail.\n\nMore detail.\n"
        node_id = ctx_store.create_node(str(store), "T", body, parent=parent_id)
        before = [n for n in ctx_store.read_nodes(str(store)) if n.number == node_id][0].body
        ctx_store.set_state(str(store), node_id, "closed", state_reason="not_planned")
        after = [n for n in ctx_store.read_nodes(str(store)) if n.number == node_id][0].body
        assert after == before

    def test_set_state_commit_message(self, store):
        node_id = ctx_store.create_node(str(store), "T", _valid_body())
        ctx_store.set_state(str(store), node_id, "closed", state_reason="completed")
        subjects = _commit_subjects(store)
        assert subjects[-1] == f"node #{node_id}: state closed"

    def test_set_state_raises_storeerror_for_missing_node(self, store):
        with pytest.raises(ctx_store.StoreError):
            ctx_store.set_state(str(store), 999, "closed")


# ---------------------------------------------------------------------------
# R8 — lint-before-write
# ---------------------------------------------------------------------------

class TestLintBeforeWrite:
    def test_malformed_marker_rejected_with_nonempty_findings(self, store):
        with pytest.raises(ctx_store.ValidationError) as exc:
            ctx_store.create_node(str(store), "Bad", _malformed_body())
        assert exc.value.findings
        assert all(isinstance(f, ctx_core.Finding) for f in exc.value.findings)

    def test_every_write_function_lints_body(self, store):
        node_id = ctx_store.create_node(str(store), "T", _valid_body())
        for call in (
            lambda: ctx_store.create_node(str(store), "Bad", _malformed_body()),
            lambda: ctx_store.add_comment(str(store), node_id, _malformed_body()),
        ):
            with pytest.raises(ctx_store.ValidationError):
                call()
        seq = ctx_store.add_comment(str(store), node_id, "ok\n")
        with pytest.raises(ctx_store.ValidationError):
            ctx_store.update_comment(str(store), node_id, seq, _malformed_body())


# ---------------------------------------------------------------------------
# R9 — git-per-write
# ---------------------------------------------------------------------------

class TestGitPerWrite:
    def test_each_mutating_call_produces_exactly_one_commit(self, store):
        before = len(_commit_subjects(store))
        node_id = ctx_store.create_node(str(store), "T", _valid_body())
        assert len(_commit_subjects(store)) == before + 1
        ctx_store.add_comment(str(store), node_id, "c1\n")
        assert len(_commit_subjects(store)) == before + 2
        ctx_store.set_state(str(store), node_id, "closed")
        assert len(_commit_subjects(store)) == before + 3

    def test_status_clean_after_each_write(self, store):
        node_id = ctx_store.create_node(str(store), "T", _valid_body())
        assert _git(store, "status", "--porcelain").stdout.strip() == ""
        ctx_store.add_comment(str(store), node_id, "c1\n")
        assert _git(store, "status", "--porcelain").stdout.strip() == ""

    def test_missing_git_dir_raises_storeerror_and_does_not_autoinit(self, tmp_path):
        bare_dir = tmp_path / "not_a_store"
        bare_dir.mkdir()
        with pytest.raises(ctx_store.StoreError):
            ctx_store.create_node(str(bare_dir), "T", _valid_body())
        assert not (bare_dir / ".git").exists()

    def test_commit_uses_dash_c_not_global_chdir(self, store, monkeypatch, tmp_path):
        # Run from an unrelated cwd; a correct implementation uses `git -C
        # <store>` and never os.chdir()s, so this must still work and must not
        # leave the process cwd changed.
        other_dir = tmp_path / "elsewhere"
        other_dir.mkdir()
        monkeypatch.chdir(other_dir)
        cwd_before = Path.cwd()
        node_id = ctx_store.create_node(str(store), "T", _valid_body())
        assert Path.cwd() == cwd_before
        assert node_id == 1


# ---------------------------------------------------------------------------
# R10 — errors
# ---------------------------------------------------------------------------

class TestErrors:
    def test_storeerror_is_exception(self):
        assert issubclass(ctx_store.StoreError, Exception)

    def test_validationerror_is_storeerror_with_findings(self):
        assert issubclass(ctx_store.ValidationError, ctx_store.StoreError)
        finding = ctx_core.Finding(issue=16, key="marker", detail="bad value")
        err = ctx_store.ValidationError([finding])
        assert err.findings == [finding]
        assert "bad value" in str(err)

    def test_no_network_error_classes_carried_over(self):
        for name in ("AuthError", "RateLimitError", "OperationalError"):
            assert not hasattr(ctx_store, name), (
                f"ctx_store must not carry over network error class {name}"
            )
