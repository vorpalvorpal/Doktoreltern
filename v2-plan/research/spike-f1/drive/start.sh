#!/bin/zsh
# usage: start.sh <name> <cwd>
# Starts an interactive `claude` (haiku, the leitf mod) under drive/ptyd.py in <cwd>. Evidence goes to runs/<name>/.
D=${0:A:h:h}
name=$1; cwd=$2
run=$D/runs/$name
if [[ -f $run/ptyd.pid ]]; then old=$(<$run/ptyd.pid); kill $(<$run/child.pid) 2>/dev/null; while kill -0 $old 2>/dev/null; do sleep 0.2; done; fi
rm -rf $run; mkdir -p $run/dumps
# drop what a parent Claude session leaks into its children, so this behaves like a terminal the owner opened
unsets=(); for v in ${(k)parameters[(R)*export*]}; do [[ $v == CLAUDE* || $v == AI_AGENT ]] && unsets+=(-u $v); done
env $unsets LEITF_LOG=$run/mod.jsonl LEITF_CMD=$run/cmd.json LEITF_DUMP=$run/dumps $D/.venv/bin/python $D/drive/ptyd.py $name $cwd 150 50 -- \
  claude --model haiku --plugin-dir $D/mod --allowedTools "Bash(pwd)" "Read" "mcp__leitf__ping"
echo "started $name in $cwd; screen: $run/screen.txt; mod log: $run/mod.jsonl"
