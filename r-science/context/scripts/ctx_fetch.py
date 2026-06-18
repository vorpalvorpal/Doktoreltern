"""Fetch adapter — the imperative shell, the one place network I/O lives.

The pure core (`ctx_core`) never imports this and never touches the network; this
module is the only thing that does. Transport: the **gh CLI** when available,
falling back to the **GitHub REST API** with a token. Everything is funnelled
through a handful of monkeypatchable seams so the behaviour can be tested without a
network:

    _has_gh()   -> bool                       # is the gh CLI on PATH?
    _token()    -> str | None                 # a REST token, if any
    _gh_json(args) -> obj                      # `gh <args> --json ...` parsed
    _http_json(url, *, method, body) -> (status, headers, obj)
    _sleep(seconds)                            # backoff seam (no-op in tests)

Errors are classed so callers can distinguish "you're not authenticated" from
"GitHub is rate-limiting us" from "something else broke":

    AuthError         — no usable transport / credentials
    RateLimitError    — a single call was rate-limited (raised by the transport)
    OperationalError  — retries exhausted, or an unexpected HTTP failure

Maps to #42 (substrate: fetch adapter) and the plan's functional-core / imperative
-shell split.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
import urllib.error
import urllib.request

import ctx_core

API = "https://api.github.com"
_MAX_RETRIES = 5


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------
class FetchError(Exception):
    """Base class for all fetch-adapter failures."""


class AuthError(FetchError):
    """No usable transport: neither the gh CLI nor a REST token is available."""


class RateLimitError(FetchError):
    """A single transport call was rate-limited (primary or secondary limit)."""


class OperationalError(FetchError):
    """Retries were exhausted, or an unexpected operational failure occurred."""


# ---------------------------------------------------------------------------
# Seams (monkeypatched in tests)
# ---------------------------------------------------------------------------
def _has_gh() -> bool:
    return shutil.which("gh") is not None


def _token() -> str | None:
    return os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or None


def _gh_json(args: list) -> object:
    """Run `gh <args>` and parse its stdout as JSON."""
    proc = subprocess.run(["gh", *args], capture_output=True, text=True)
    if proc.returncode != 0:
        err = proc.stderr.lower()
        if "auth" in err or "not logged" in err:
            raise AuthError(proc.stderr.strip())
        raise OperationalError(proc.stderr.strip() or "gh failed")
    return json.loads(proc.stdout)


def _http_json(url: str, *, method: str = "GET", body: object | None = None):
    """One REST call → (status, headers, parsed-body). Classes rate limits."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/vnd.github+json")
    tok = _token()
    if tok:
        req.add_header("Authorization", f"Bearer {tok}")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            obj = json.loads(raw) if raw else None
            return resp.status, dict(resp.headers), obj
    except urllib.error.HTTPError as exc:  # pragma: no cover - exercised via seam
        if exc.code in (403, 429):
            raise RateLimitError(f"HTTP {exc.code}") from exc
        raise OperationalError(f"HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:  # pragma: no cover
        raise OperationalError(str(exc)) from exc


def _sleep(seconds: float) -> None:  # pragma: no cover - patched to no-op in tests
    time.sleep(seconds)


# ---------------------------------------------------------------------------
# Shape adapters: GitHub JSON (gh or REST) → ctx_core.Node
# ---------------------------------------------------------------------------
def _labels(raw) -> set:
    out = set()
    for lab in raw or []:
        out.add(lab["name"] if isinstance(lab, dict) else str(lab))
    return out


def _state_reason(d: dict):
    # gh emits camelCase `stateReason`; REST emits snake_case `state_reason`.
    reason = d.get("stateReason", d.get("state_reason"))
    if isinstance(reason, str):
        return reason.lower() or None
    return None


def _node_from_issue(d: dict, comments=None) -> ctx_core.Node:
    raw_comments = comments if comments is not None else d.get("comments", [])
    cs = []
    for i, c in enumerate(raw_comments):
        text = c["body"] if isinstance(c, dict) else str(c)
        cs.append(ctx_core.Comment(i + 1, text))
    return ctx_core.Node(
        d["number"],
        d.get("body") or "",
        (d.get("state") or "open").lower(),
        _state_reason(d),
        _labels(d.get("labels")),
        cs,
    )


def _retrying_http(url: str, **kw):
    """Call _http_json with bounded exponential backoff on RateLimitError."""
    last: Exception | None = None
    for attempt in range(_MAX_RETRIES):
        try:
            return _http_json(url, **kw)
        except RateLimitError as exc:
            last = exc
            _sleep(2 ** attempt)
    raise OperationalError(f"rate-limited after {_MAX_RETRIES} retries") from last


def _next_link(link_header: str | None) -> str | None:
    """Extract the rel=\"next\" URL from a GitHub Link header, if present."""
    if not link_header:
        return None
    for part in link_header.split(","):
        segs = part.split(";")
        if len(segs) >= 2 and 'rel="next"' in segs[1]:
            return segs[0].strip().lstrip("<").rstrip(">")
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def fetch_repo(repo: str) -> list:
    """Return every issue in `repo` as a list of ctx_core.Node.

    gh CLI when present; otherwise REST with a token; otherwise AuthError.
    """
    if _has_gh():
        issues = _gh_json([
            "issue", "list", "--repo", repo, "--state", "all", "--limit", "1000",
            "--json", "number,body,state,stateReason,labels,comments",
        ])
        return [_node_from_issue(d) for d in issues]
    if _token() is None:
        raise AuthError("no gh CLI on PATH and no GITHUB_TOKEN/GH_TOKEN set")
    _status, _headers, obj = _retrying_http(
        f"{API}/repos/{repo}/issues?state=all&per_page=100"
    )
    return [_node_from_issue(d) for d in (obj or [])]


def fetch_comments(repo: str, issue: int) -> list:
    """Return all comments for one issue, following pagination (REST path)."""
    if _has_gh():
        d = _gh_json(["issue", "view", str(issue), "--repo", repo, "--json", "comments"])
        return d.get("comments", [])
    if _token() is None:
        raise AuthError("no gh CLI on PATH and no GITHUB_TOKEN/GH_TOKEN set")
    url = f"{API}/repos/{repo}/issues/{issue}/comments?per_page=100"
    out: list = []
    while url:
        _status, headers, obj = _retrying_http(url)
        out.extend(obj or [])
        url = _next_link(headers.get("Link"))
    return out


def update_comment(repo: str, comment_id: int, body: str):
    """PATCH an existing issue comment's body in place (append-only auto-mirror)."""
    url = f"{API}/repos/{repo}/issues/comments/{comment_id}"
    _status, _headers, obj = _http_json(url, method="PATCH", body={"body": body})
    return obj
