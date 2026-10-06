#!/bin/zsh
# usage: soak.sh <name> <route> <resets> [VAR=value ...]
# Starts a session on the big fixture, kicks it, and waits until <resets> resets are done. Stops (leaving the session up)
# when the mod log has not grown for 590 s, or a dialog is on screen for 30 s. Prints one line per 10 resets.
D=${0:A:h:h}; name=$1; route=$2; want=$3; shift 3
C=($D/.venv/bin/python $D/drive/ctl.py $name); L=$D/runs/$name/mod.jsonl
$D/drive/start.sh $name big LEIT_ROUTE=$route LEIT_MAX=$want "$@" >/dev/null
$D/drive/kick.sh $name "Read ./checkpoints/c-package.md (it is in your working directory) and follow its procedure as if I had said: continue" || { echo "kick failed"; $C screen | tail -20; exit 1 }
last=0; lastsize=0; quiet=0; dialog=0
while true; do
  sleep 5
  n=$(grep -c '"what":"reset.end"' $L 2>/dev/null); size=$(stat -f %z $L)
  (( n >= last + 10 )) && { last=$n; echo "$(date +%T) resets=$n" }
  if (( n >= want )); then sleep 25; echo "done: $n resets"; break; fi
  grep -q '"what":"reset.FAULT"' $L && { echo "FAULT logged"; break }
  if [[ $size == $lastsize ]]; then (( quiet += 5 )); else quiet=0; lastsize=$size; fi
  (( quiet >= 590 )) && { echo "STALL: mod log quiet for $quiet s at resets=$n"; $C screen | tail -25; break }
  if $C screen | grep -q "Do you want to proceed"; then (( dialog += 5 )); else dialog=0; fi
  (( dialog >= 30 )) && { echo "STALL: a dialog is on screen at resets=$n"; $C screen | tail -25; break }
done
