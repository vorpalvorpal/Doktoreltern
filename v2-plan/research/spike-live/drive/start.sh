#!/bin/zsh
# usage: start.sh <name> <small|big> [VAR=value ...] [-- extra claude args]
# Starts an interactive `claude` (haiku, the leit mod) under drive/ptyd.py in a fresh copy of the fixture.
D=${0:A:h:h}
name=$1; fixture=$2; shift 2
envs=(); while (( $# )) && [[ $1 != -- ]]; do envs+=($1); shift; done
(( $# )) && shift
run=$D/runs/$name
if [[ -f $run/ptyd.pid ]]; then old=$(<$run/ptyd.pid); kill $(<$run/child.pid) 2>/dev/null; while kill -0 $old 2>/dev/null; do sleep 0.2; done; fi
rm -rf $run; mkdir -p $run/dumps
cp -R $D/fixtures/$fixture $run/work; cp $D/drive/step.py $run/work/
# drop what a parent Claude session leaks into its children, so this behaves like a terminal the owner opened
unsets=(); for v in ${(k)parameters[(R)*export*]}; do [[ $v == CLAUDE* || $v == AI_AGENT ]] && unsets+=(-u $v); done
env $unsets LEIT_LOG=$run/mod.jsonl LEIT_NONCES=$run/nonces.txt $envs $D/.venv/bin/python $D/drive/ptyd.py $name $run/work 150 50 -- \
  claude --model haiku --plugin-dir ${SPIKE_MOD:-$D/mod} --allowedTools "Bash(python3 step.py)" "Bash(sleep:*)" "Read" "Agent" "mcp__leit__step_done" "$@"
echo "started $name; screen: $run/screen.txt; mod log: $run/mod.jsonl"
