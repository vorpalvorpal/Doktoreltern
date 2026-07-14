---
name: seal
description: Re-seal a node (reclaim it for human sign-off) inside an unsealed region.
argument-hint: <issue-number>
disable-model-invocation: true
allowed-tools: Bash(python3:*)
---
Seal node #$ARGUMENTS — its design moves become collaborative (propose for sign-off)
and the seal inherits to descendants unless a child re-sets it.

!`python3 ${CLAUDE_SKILL_DIR}/../../scripts/ctx_seal.py $ARGUMENTS sealed`
