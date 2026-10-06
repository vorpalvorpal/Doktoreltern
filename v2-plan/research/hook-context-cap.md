# The session-start hook's size limit: a Claude Code behaviour, not a haiku one

2026-10-06, main session. Robin questioned the round-2 Bar Raiser's finding that a file re-planted
by a `SessionStart` hook arrives whole up to 10,000 characters and as "about the first 2,000"
above that. This re-runs it on sonnet. Scratch: `reviews/scratch/hook-sonnet/` (not committed).

**Setup.** Claude Code 2.1.291. A project `.claude/settings.json` with one `SessionStart` hook
that prints a generated `CARRY.md` (numbered "Decision" lines with a start and an end marker).
`claude -p --model sonnet --setting-sources project`. Five calls, about $0.27 in all.

| Run | File size | How the hook printed it | What the model received |
|---|---|---|---|
| 1 | 9,872 chars | JSON `additionalContext` | All of it: both markers, decisions 1 to 109, no wrapper |
| 2 | 9,963 chars | JSON `additionalContext` | All of it: both markers, decisions 1 to 110, no wrapper |
| 3 | 12,966 chars | JSON `additionalContext` | Start marker and decisions 1 to 21 only, inside a wrapper (below) |
| 4 | 12,966 chars | Plain standard output | The same wrapper and the same cut |
| 5 | 12,966 chars | JSON, with the Read tool allowed | The model searched the saved file and gave the correct end marker, in 2 turns |

The wrapper the model sees in runs 3 to 5, verbatim:

```
<persisted-output>
Output too large (12.7KB). Full output saved to: /Users/rjs/.claude/projects/<project>/<session>/tool-results/hook-<id>-additionalContext.txt

Preview (first 2KB):
# CARRY
...
</persisted-output>
```

**Findings.**

1. **It is the harness, not the model.** Claude Code caps a hook's injected output. Over the cap
   it saves the full output to a file under the session's folder and puts a 2 KB preview and the
   file's path in the context. Sonnet reports the same cut as haiku did, at the same place, and
   can quote the wrapper. The model is never sent the rest, so no model could repeat it.
2. **The limit is between 9,963 and 12,966 characters,** consistent with the 10,000-character cap
   recorded in `research/mods.md`. The exact edge was not probed.
3. **It is not silent to the model.** The Bar Raiser wrote "no error is raised anywhere". There is
   no error, but the context says plainly that the output was too large, where the full text is,
   and that what follows is a preview. A model with file access can and did go and read it.
4. **It is still unsafe for standing rules.** A rule past the first 2 KB is in a file the model
   may or may not open, which is a pointer and not a re-planted rule. The Red Team's note-chain
   result says pointers and summaries are where rules get lost.

**Consequence for the design.** The file that is re-planted word for word must stay under the
cap, with a size check that fails loudly when it grows past it. Longer material (sampleTidy's
ruling documents are about 59 KB each) is referenced from it by path, and read on need. The cap
may differ in other Claude Code versions, so the size check belongs in the launch check.

**Not tested:** the exact edge; whether the cap counts characters or bytes; the hook under
`/clear`, under a typed `/compact` in the terminal, or under a mod-run resume; other versions.
