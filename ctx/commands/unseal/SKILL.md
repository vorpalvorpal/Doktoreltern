---
name: unseal
description: Unseal a node and its subtree, delegating autonomous moves downward.
argument-hint: <issue-number>
disable-model-invocation: true
allowed-tools: Bash(python3:*)
---
Unseal node #$ARGUMENTS — delegates its subtree for autonomous moves. The effective
seal inherits to descendants unless a child re-seals with `/seal`.

!`python3 ${CLAUDE_SKILL_DIR}/../../scripts/ctx_seal.py $ARGUMENTS unsealed`
