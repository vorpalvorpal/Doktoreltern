#!/bin/zsh
# usage: run.sh <name> <mode> <prompt> [extra claude args...]   (env SPIKE_NEXT, SPIKE_MAX, SPIKE_PCT, SPIKE_DELAY pass through)
D=${0:A:h}
name=$1; mode=$2; prompt=$3; shift 3
cd $D/work
SPIKE_MODE=$mode SPIKE_LOG=$D/logs/$name.mod.jsonl claude -p "$prompt" --model haiku --plugin-dir $D/mod \
  --output-format stream-json --verbose --allowedTools "mcp__spike-reset__checkpoint_reset" "$@" \
  > $D/logs/$name.stream.jsonl 2> $D/logs/$name.stderr
echo "exit=$?"
