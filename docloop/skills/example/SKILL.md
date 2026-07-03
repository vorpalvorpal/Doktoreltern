---
name: example
description: >
  Placeholder skill proving the docloop plugin's discovery and live-invocation
  mechanism end to end. Not a real review-workflow skill — replace once the
  actual docloop command roster is designed. Echoes back whatever input it's
  given, prefixed to make the round-trip unambiguous to verify.
---

# docloop's example skill — scan/invocation smoke test

This skill exists only to prove that the `docloop` plugin is discoverable (by
`GET /docloop-skills`, which scans this directory's frontmatter) and invocable
(by `POST /run-skill`, which runs exactly this skill with no other tool
access) — not to do real review work.

Given input text, respond with exactly:

    [docloop-example echo] <the input, verbatim>

Nothing else — no preamble, no explanation, no markdown fencing around the
line above. This makes a successful round-trip trivial to assert against
programmatically.
