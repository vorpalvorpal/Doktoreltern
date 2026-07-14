"""Behaviour spec for the artefact cache (#43): content-addressed store + LRU GC."""
import os
import time

import pytest

ctx_artefact = pytest.importorskip("ctx_artefact")


def _use_tmp(tmp_path, monkeypatch):
    monkeypatch.setenv("CTX_CACHE_DIR", str(tmp_path))


class TestStore:
    def test_same_content_same_sha_and_idempotent(self, tmp_path, monkeypatch):
        _use_tmp(tmp_path, monkeypatch)
        a = ctx_artefact.store(b"hello")
        b = ctx_artefact.store(b"hello")
        assert a == b
        assert ctx_artefact.path_for(a).read_bytes() == b"hello"

    def test_distinct_content_distinct_sha(self, tmp_path, monkeypatch):
        _use_tmp(tmp_path, monkeypatch)
        assert ctx_artefact.store(b"a") != ctx_artefact.store(b"b")

    def test_str_is_encoded(self, tmp_path, monkeypatch):
        _use_tmp(tmp_path, monkeypatch)
        sha = ctx_artefact.store("text")
        assert ctx_artefact.exists(sha)


class TestGC:
    def _seed(self, n, size=100):
        shas = []
        for i in range(n):
            sha = ctx_artefact.store(bytes([i]) * size)
            os.utime(ctx_artefact.path_for(sha), (time.time() + i, time.time() + i))
            shas.append(sha)
        return shas

    def test_evicts_oldest_until_under_bound(self, tmp_path, monkeypatch):
        _use_tmp(tmp_path, monkeypatch)
        shas = self._seed(5)                       # 5 × 100 = 500 bytes
        assert ctx_artefact.total_bytes() == 500
        removed = ctx_artefact.gc(250)
        assert ctx_artefact.total_bytes() <= 250
        assert not ctx_artefact.path_for(shas[0]).exists()   # oldest gone first
        assert ctx_artefact.path_for(shas[-1]).exists()      # newest survives
        assert len(removed) == 3

    def test_noop_when_under_bound(self, tmp_path, monkeypatch):
        _use_tmp(tmp_path, monkeypatch)
        ctx_artefact.store(b"x" * 10)
        assert ctx_artefact.gc(1000) == []
