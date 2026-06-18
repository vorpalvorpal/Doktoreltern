"""Behaviour spec for the fetch adapter — the one place network I/O lives.

Maps to plan §6 "Error conditions" + §8 (pagination, comment-PATCH) and the
functional-core/imperative-shell split. The core must never touch the network;
everything that does is here and is mocked in these tests.

Assumed mockable seams (the adapter is written test-first to expose them — this
*is* the "test with the fetch layer mocked" requirement, made concrete):

    ctx_fetch._has_gh() -> bool
    ctx_fetch._token() -> str | None
    ctx_fetch._gh_json(args) -> parsed JSON        # gh CLI path
    ctx_fetch._http_json(url, *, method="GET", body=None) -> (status, headers, obj)
    ctx_fetch._sleep(seconds)                       # backoff seam (patched to no-op)

Pending until Stage 3 (fetch adapter).
"""

import pytest

ctx_core = pytest.importorskip("ctx_core")
ctx_fetch = pytest.importorskip("ctx_fetch")

PENDING = "pending — Stage 3 (fetch adapter)"


# --------------------------------------------------------------------------
# Transport selection: gh primary, REST fallback, classed auth error
# --------------------------------------------------------------------------
class TestTransportSelection:
    def test_uses_gh_cli_when_available(self, monkeypatch):
        monkeypatch.setattr(ctx_fetch, "_has_gh", lambda: True)
        monkeypatch.setattr(ctx_fetch, "_gh_json",
                            lambda args: [{"number": 16, "body": "root\n",
                                           "state": "open", "stateReason": None,
                                           "labels": []}])
        nodes = ctx_fetch.fetch_repo("owner/repo")
        assert [n.number for n in nodes] == [16]

    def test_falls_back_to_rest_with_token(self, monkeypatch):
        monkeypatch.setattr(ctx_fetch, "_has_gh", lambda: False)
        monkeypatch.setattr(ctx_fetch, "_token", lambda: "ghp_xxx")
        monkeypatch.setattr(ctx_fetch, "_http_json",
                            lambda url, **kw: (200, {}, [
                                {"number": 16, "body": "root\n",
                                 "state": "open", "state_reason": None,
                                 "labels": []}]))
        nodes = ctx_fetch.fetch_repo("owner/repo")
        assert [n.number for n in nodes] == [16]

    def test_classed_error_when_no_gh_and_no_token(self, monkeypatch):
        monkeypatch.setattr(ctx_fetch, "_has_gh", lambda: False)
        monkeypatch.setattr(ctx_fetch, "_token", lambda: None)
        with pytest.raises(ctx_fetch.AuthError):
            ctx_fetch.fetch_repo("owner/repo")


# --------------------------------------------------------------------------
# Rate limiting: bounded backoff, then a classed operational error
# --------------------------------------------------------------------------
class TestRateLimiting:
    def test_retries_then_raises_operational_error(self, monkeypatch):
        calls = {"n": 0}

        def always_limited(url, **kw):
            calls["n"] += 1
            raise ctx_fetch.RateLimitError("secondary limit")

        monkeypatch.setattr(ctx_fetch, "_has_gh", lambda: False)
        monkeypatch.setattr(ctx_fetch, "_token", lambda: "ghp_xxx")
        monkeypatch.setattr(ctx_fetch, "_http_json", always_limited)
        monkeypatch.setattr(ctx_fetch, "_sleep", lambda *_: None)

        with pytest.raises(ctx_fetch.OperationalError):
            ctx_fetch.fetch_repo("owner/repo")
        assert calls["n"] > 1, "expected bounded retries before giving up"


# --------------------------------------------------------------------------
# Pagination: comments > 30, sub-issues ≤ 100
# --------------------------------------------------------------------------
class TestPagination:
    def test_follows_all_comment_pages(self, monkeypatch):
        page1 = [{"id": i, "body": f"c{i}"} for i in range(30)]
        page2 = [{"id": 30, "body": "c30"}]
        pages = iter([(200, {"Link": '<...page=2>; rel="next"'}, page1),
                      (200, {}, page2)])
        monkeypatch.setattr(ctx_fetch, "_has_gh", lambda: False)
        monkeypatch.setattr(ctx_fetch, "_token", lambda: "ghp_xxx")
        monkeypatch.setattr(ctx_fetch, "_http_json", lambda url, **kw: next(pages))
        comments = ctx_fetch.fetch_comments("owner/repo", 16)
        assert len(comments) == 31


# --------------------------------------------------------------------------
# Comment update: the PATCH path for in-place plan amendment
# --------------------------------------------------------------------------
class TestUpdateComment:
    def test_issues_a_patch_to_the_comment_endpoint(self, monkeypatch):
        seen = {}

        def capture(url, *, method="GET", body=None):
            seen["url"] = url
            seen["method"] = method
            seen["body"] = body
            return (200, {}, {"id": 4688065241})

        monkeypatch.setattr(ctx_fetch, "_has_gh", lambda: False)
        monkeypatch.setattr(ctx_fetch, "_token", lambda: "ghp_xxx")
        monkeypatch.setattr(ctx_fetch, "_http_json", capture)
        ctx_fetch.update_comment("owner/repo", 4688065241, "amended body")
        assert seen["method"] == "PATCH"
        assert "/comments/4688065241" in seen["url"]
        assert seen["body"]["body"] == "amended body"


# --------------------------------------------------------------------------
# Architectural: the pure core must not import the network
# --------------------------------------------------------------------------
class TestCorePurity:
    def test_core_source_imports_no_network_modules(self):
        """ctx_core stays pure — no urllib/subprocess/requests/http imports."""
        source = pathlib_read(ctx_core.__file__)
        for banned in ("import urllib", "import subprocess", "import requests",
                       "import http", "from urllib", "from http"):
            assert banned not in source, f"core must not {banned!r}"


def pathlib_read(path):
    from pathlib import Path
    return Path(path).read_text(encoding="utf-8")
