#!/bin/zsh
# Ten-minute demo for a real terminal: a loop of resets with the status line, hold and message keeping on.
#   drive/demo.sh [compact|branch|clear]      (default compact)
# Then type the first prompt shown below, and /go when its turn ends (the first prompt is yours, so the loop holds).
# Try: type a message while a step runs; press Esc mid-step; /hold; /go. Ctrl-C twice to leave.
D=${0:A:h:h}; route=${1:-compact}; run=$D/runs/demo
rm -rf $run; mkdir -p $run; cp -R $D/fixtures/big $run/work; cp $D/drive/step.py $run/work/
cd $run/work
print "First prompt to type:\n  Read ./checkpoints/c-package.md (it is in your working directory) and follow its procedure as if I had said: continue\n"
LEIT_ROUTE=$route LEIT_LOG=$run/mod.jsonl LEIT_NONCES=$run/nonces.txt LEIT_STEP_SLEEP=6 exec claude --model haiku --plugin-dir $D/mod \
  --allowedTools "Bash(python3 step.py)" "Read" "mcp__leit__step_done"
