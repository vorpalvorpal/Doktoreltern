"""ctx_run — the store-backed runner shell around ctx_driver (MVP)."""
import json
import sys
from pathlib import Path

import pytest

import ctx_driver
import ctx_run
import ctx_source
import ctx_store


# --- verdict / difficulty parsing --------------------------------------------
class TestParseVerdict:
    def test_ok(self):
        ok, fault, note = ctx_run.parse_verdict("did things\nVERDICT: ok - built it")
        assert ok is True and fault is None

    def test_fail_with_fault(self):
        ok, fault, _ = ctx_run.parse_verdict("VERDICT: fail fault=plan - spec wrong")
        assert ok is False and fault == "plan"

    def test_fail_without_fault(self):
        ok, fault, _ = ctx_run.parse_verdict("VERDICT: fail - suite red")
        assert ok is False and fault is None

    def test_last_verdict_wins(self):
        text = "VERDICT: fail fault=design - draft\n...more work...\nVERDICT: ok"
        ok, fault, _ = ctx_run.parse_verdict(text)
        assert ok is True

    def test_missing_verdict_is_failed_retry(self):
        ok, fault, note = ctx_run.parse_verdict("I did some work and stopped.")
        assert ok is False and fault is None and "no verdict" in note

    def test_difficulty(self):
        assert ctx_run.parse_difficulty("DIFFICULTY: 7\nVERDICT: ok") == 7
        assert ctx_run.parse_difficulty("no rating") is None


# --- store → world -----------------------------------------------------------
@pytest.fixture
def store(tmp_path):
    s = tmp_path / "store"
    ctx_store.init_store(s)
    root = ctx_store.create_node(
        s, "root", "🧭 Confidence: low\n📊 Fidelity: stub\n\nRoot epic.\n")
    leaf = ctx_store.create_node(
        s, "leaf", "🧭 Confidence: low\n📊 Fidelity: stub\n\nA leaf.\n",
        parent=root)
    return s, root, leaf


@pytest.fixture
def unstamped_store(tmp_path):
    """Like `store`, but the parent carries no 📊 marker (#33: derived fidelity)."""
    s = tmp_path / "store"
    ctx_store.init_store(s)
    root = ctx_store.create_node(
        s, "root", "🧭 Confidence: low\n\nUnstamped epic.\n")
    leaf = ctx_store.create_node(
        s, "leaf", "🧭 Confidence: low\n📊 Fidelity: stub\n\nA leaf.\n",
        parent=root)
    return s, root, leaf


class TestLoadWorld:
    def test_states_and_edges_from_store(self, store):
        s, root, leaf = store
        _model, states, edges, _b, _a = ctx_run.load_world(str(s))
        assert set(states) == {root, leaf}
        assert states[leaf].fidelity == "stub"
        assert (root, leaf) in edges

    def test_closed_nodes_excluded(self, store):
        s, root, leaf = store
        ctx_store.set_state(s, leaf, "closed", state_reason="not_planned")
        _model, states, _e, _b, _a = ctx_run.load_world(str(s))
        assert leaf not in states and root in states

    def test_unstamped_parent_loads_as_derived_none(self, unstamped_store):
        s, root, leaf = unstamped_store
        _model, states, *_ = ctx_run.load_world(str(s))
        assert states[root].fidelity is None      # derived (#33), not stub-capped
        assert states[leaf].fidelity == "stub"

    def test_unstamped_leaf_still_defaults_stub(self, tmp_path):
        s = tmp_path / "store"
        ctx_store.init_store(s)
        n = ctx_store.create_node(s, "solo", "🧭 Confidence: low\n\nNo marker.\n")
        _model, states, *_ = ctx_run.load_world(str(s))
        assert states[n].fidelity == "stub"


class TestRunState:
    def test_roundtrip_overlay(self, store):
        s, root, leaf = store
        _m, states, *_ = ctx_run.load_world(str(s))
        states[leaf].cursor = "plan"
        states[leaf].fidelity = "interface"
        ctx_run.save_run_state(str(s), states)

        _m, fresh, *_ = ctx_run.load_world(str(s))
        assert fresh[leaf].cursor is None
        ctx_run.load_run_state(str(s), fresh)
        assert fresh[leaf].cursor == "plan"
        assert fresh[leaf].fidelity == "interface"

    def test_telemetry_dir_self_gitignores(self, store):
        s, *_ = store
        d = ctx_run._telemetry_dir(str(s))
        assert (d / ".gitignore").read_text() == "*\n"

    def test_none_fidelity_survives_run_state_roundtrip(self, unstamped_store):
        # fidelity=None serializes as JSON null; the overlay must restore it as
        # None (unstamped), not coerce it to a string.
        s, root, _leaf = unstamped_store
        _m, states, *_ = ctx_run.load_world(str(s))
        ctx_run.save_run_state(str(s), states)
        _m, fresh, *_ = ctx_run.load_world(str(s))
        ctx_run.load_run_state(str(s), fresh)
        assert fresh[root].fidelity is None


# --- runtime overlay (shared by run-state resume and per-tick refresh) --------
class TestOverlayRuntime:
    def test_runtime_wins_for_shared_nodes(self):
        states = {1: ctx_driver.NodeRun(), 2: ctx_driver.NodeRun()}
        adv = ctx_driver.NodeRun(fidelity="interface", cursor="plan", faults=1)
        ctx_run.overlay_runtime(states, {1: adv})
        assert states[1] is adv                    # driver-owned state wins outright
        assert states[2].cursor is None            # untouched nodes keep the fresh read

    def test_runtime_entries_absent_from_fresh_states_are_dropped(self):
        states = {1: ctx_driver.NodeRun()}
        ctx_run.overlay_runtime(states, {99: ctx_driver.NodeRun(cursor="plan")})
        assert 99 not in states                    # left the working set → dropped

    def test_load_run_state_drops_departed_nodes(self, store):
        # load_run_state goes through overlay_runtime: a saved entry for a node
        # since closed does not resurrect it onto the frontier.
        s, root, leaf = store
        _m, states, *_ = ctx_run.load_world(str(s))
        states[leaf].cursor = "plan"
        ctx_run.save_run_state(str(s), states)
        ctx_store.set_state(s, leaf, "closed", state_reason="not_planned")
        _m, fresh, *_ = ctx_run.load_world(str(s))
        ctx_run.load_run_state(str(s), fresh)
        assert leaf not in fresh
        assert fresh[root].cursor is None


# --- per-tick world reload (make_refresh) --------------------------------------
@pytest.fixture
def refresh_world(store):
    """states/source_nodes seeded from `store`, plus the refresh closure."""
    s, root, leaf = store
    _m, states, *_ = ctx_run.load_world(str(s))
    source_nodes = ctx_source.RepoSource(str(s)).nodes
    refresh = ctx_run.make_refresh(str(s), states, source_nodes)
    return s, root, leaf, states, source_nodes, refresh


class TestMakeRefresh:
    def test_advanced_node_keeps_runtime_state(self, refresh_world):
        s, root, leaf, states, _src, refresh = refresh_world
        states[leaf].fidelity = "interface"
        states[leaf].cursor = "plan"
        states[leaf].faults = 1
        refresh()
        assert states[leaf].fidelity == "interface"   # runtime won over disk stub
        assert states[leaf].cursor == "plan"
        assert states[leaf].faults == 1

    def test_untouched_node_follows_fresh_disk_read(self, store):
        # An unstamped leaf seeds as `stub` (leaf default). Mid-run it gains a
        # child on disk: still exactly as seeded, it must follow the fresh read
        # and flip to derived fidelity (None, the #33 rule) — not stay capped
        # by the stale leaf default and draw a no-op INTERFACE move.
        s, root, leaf = store
        grower = ctx_store.create_node(
            s, "grower", "🧭 Confidence: low\n\nNo stamp.\n", parent=root)
        _m, states, *_ = ctx_run.load_world(str(s))
        assert states[grower].fidelity == "stub"
        source_nodes = ctx_source.RepoSource(str(s)).nodes
        refresh = ctx_run.make_refresh(str(s), states, source_nodes)

        kid = ctx_store.create_node(
            s, "kid", "🧭 Confidence: low\n📊 Fidelity: stub\n\nKid.\n",
            parent=grower)
        _states, edges, _b, _a = refresh()
        assert states[grower].fidelity is None        # derived now, not stub
        assert kid in states and states[kid].fidelity == "stub"
        assert (grower, kid) in edges

    def test_seed_baseline_is_disk_not_states(self, store):
        # A resumed run-state overlay applied to `states` BEFORE make_refresh
        # is built must still count as driver-owned on the first refresh: the
        # seed baseline is read from disk inside make_refresh, not from states.
        s, root, leaf = store
        _m, states, *_ = ctx_run.load_world(str(s))
        states[leaf].fidelity = "interface"
        states[leaf].cursor = "plan"
        ctx_run.save_run_state(str(s), states)

        _m, states, *_ = ctx_run.load_world(str(s))
        ctx_run.load_run_state(str(s), states)        # resume overlay first
        source_nodes = ctx_source.RepoSource(str(s)).nodes
        refresh = ctx_run.make_refresh(str(s), states, source_nodes)
        refresh()
        assert states[leaf].fidelity == "interface"   # not clobbered back to stub
        assert states[leaf].cursor == "plan"

    def test_refresh_mutates_states_and_source_nodes_in_place(self, refresh_world):
        s, root, leaf, states, source_nodes, refresh = refresh_world
        held_states, held_source = states, source_nodes   # what dispatch closes over
        new = ctx_store.create_node(
            s, "newcomer", "🧭 Confidence: low\n📊 Fidelity: stub\n\nNew.\n",
            parent=root)
        ret_states, _edges, _b, _a = refresh()
        assert ret_states is held_states              # same dict object, updated
        assert new in held_states
        assert new in held_source
        assert held_source[new]["title"] == "newcomer"

    def test_new_node_seed_does_not_alias_states(self, refresh_world):
        # The seeds entry for a newly-seen node is a COPY (`replace(run)`):
        # advancing the node after the refresh must still read as advanced on
        # the next refresh, not be clobbered back to the disk state.
        s, root, leaf, states, _src, refresh = refresh_world
        new = ctx_store.create_node(
            s, "newcomer", "🧭 Confidence: low\n📊 Fidelity: stub\n\nNew.\n",
            parent=root)
        refresh()                                     # newcomer seeded
        states[new].fidelity = "interface"            # driver advances it
        states[new].cursor = "design"
        refresh()
        assert states[new].fidelity == "interface"    # advanced state survived
        assert states[new].cursor == "design"


# --- end-to-end with a stub executor -----------------------------------------
class TestEndToEnd:
    def test_all_ok_executor_folds_the_tree(self, store, capsys):
        s, root, leaf = store
        rc = ctx_run.main([
            str(s), "--project", str(s), "--dispatch-cmd",
            "printf 'DIFFICULTY: 2\\nVERDICT: ok - stub executor\\n'",
        ])
        assert rc == 0
        out = capsys.readouterr().out
        assert "folded_correct" in out

        # telemetry: one JSON line per dispatch, difficulty captured
        lines = [json.loads(x) for x in
                 (s / ".telemetry" / "usage.jsonl").read_text().splitlines()]
        assert len(lines) >= 2 * 6  # 2 nodes x (interface + 5 deepen moves)
        assert all(rec["difficulty"] == 2 for rec in lines)
        moves = {rec["move"] for rec in lines}
        assert "validate" in moves and "interface" in moves

        # run-state persisted: both nodes done
        state = json.loads((s / ".telemetry" / "run-state.json").read_text())
        assert state[str(root)]["done"] and state[str(leaf)]["done"]

    def test_unstamped_parent_folds_without_a_floor_move(self, unstamped_store,
                                                         capsys):
        # #33 end-to-end: the parent has no 📊 marker, yet the run converges —
        # and the parent is never dispatched an INTERFACE move (it has no stamp
        # to raise; the leaf carries the floor).
        s, root, leaf = unstamped_store
        rc = ctx_run.main([
            str(s), "--project", str(s), "--dispatch-cmd",
            "printf 'DIFFICULTY: 1\\nVERDICT: ok - stub executor\\n'",
        ])
        assert rc == 0
        assert "folded_correct" in capsys.readouterr().out

        lines = [json.loads(x) for x in
                 (s / ".telemetry" / "usage.jsonl").read_text().splitlines()]
        root_moves = [rec["move"] for rec in lines if rec["node"] == root]
        assert "interface" not in root_moves      # no floor move on the parent
        # stronger: no stamp = no glue of its own — the leaf's `correct` is the
        # parent's derived fidelity, so the parent needs no dispatches at all.
        assert root_moves == []
        leaf_moves = [rec["move"] for rec in lines if rec["node"] == leaf]
        assert "interface" in leaf_moves          # stamped stub leaf still floors

    def test_verdictless_executor_escalates(self, store, capsys):
        s, *_ = store
        rc = ctx_run.main([
            str(s), "--project", str(s), "--fresh",
            "--dispatch-cmd", "printf 'no verdict here\\n'",
        ])
        assert rc == 1
        assert "node_escalated" in capsys.readouterr().out

    def test_dry_run_dispatches_nothing(self, store, capsys):
        s, *_ = store
        rc = ctx_run.main([str(s), "--project", str(s), "--fresh", "--dry-run"])
        assert rc == 0
        out = capsys.readouterr().out
        assert "next: INTERFACE on #" in out
        assert "VERDICT" in out                       # the protocol is in the prompt
        assert not (s / ".telemetry" / "usage.jsonl").exists()

    def test_resume_skips_done_nodes(self, store):
        s, root, leaf = store
        ctx_run.main([str(s), "--project", str(s), "--dispatch-cmd",
                      "printf 'VERDICT: ok\\n'"])
        first = len((s / ".telemetry" / "usage.jsonl").read_text().splitlines())
        rc = ctx_run.main([str(s), "--project", str(s), "--dispatch-cmd",
                           "printf 'VERDICT: ok\\n'"])
        assert rc == 0
        second = len((s / ".telemetry" / "usage.jsonl").read_text().splitlines())
        assert second == first        # nothing re-dispatched on resume
