#!/bin/zsh
# usage: kick.sh <name> [first prompt]   types the first prompt, waits for its turn to end, then types /go (the first
# prompt is user-typed, so the hold rule holds the loop until /go)
D=${0:A:h:h}; name=$1
C=($D/.venv/bin/python $D/drive/ctl.py $name)
$C wait '❯' 30
sleep 2
$C line ${2:-"The secret word is ZANZIBAR-42; remember it. Now read ./checkpoints/package.md (it is in your working directory) and follow its procedure as if I had said: continue"} >/dev/null
$C waitlog $D/runs/$name/mod.jsonl '"what":"turn.complete"' 1 100 || exit 1
sleep 1.5
$C line "/go" >/dev/null
