#!/bin/zsh
# Like run.sh but with --input-format stream-json and stdin HELD OPEN, so the headless session outlives its first turn.
# usage: run-stream.sh <name> <mode> <prompt> <main-turns-to-wait-for> <timeout-s> [extra claude args...]
D=${0:A:h}
name=$1; mode=$2; prompt=$3; want=$4; tmo=$5; shift 5
cd $D/work
rm -f $D/logs/$name.mod.jsonl
msg=$(jq -cn --arg t "$prompt" '{type:"user",message:{role:"user",content:[{type:"text",text:$t}]}}')
{ print -r -- "$msg"
  while (( SECONDS < tmo )); do
    n=$(grep -c '"what":"turn.complete"' $D/logs/$name.mod.jsonl 2>/dev/null)
    (( ${n:-0} >= want )) && break
    sleep 1
  done
  sleep ${SPIKE_LINGER:-4}
} | SPIKE_MODE=$mode SPIKE_LOG=$D/logs/$name.mod.jsonl claude -p --input-format stream-json --model haiku --plugin-dir $D/mod \
  --output-format stream-json --verbose --allowedTools "mcp__spike-reset__checkpoint_reset" "$@" \
  > $D/logs/$name.stream.jsonl 2> $D/logs/$name.stderr
echo "exit=$? seconds=$SECONDS"
