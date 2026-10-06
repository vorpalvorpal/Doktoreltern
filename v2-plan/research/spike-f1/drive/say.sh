#!/bin/zsh
# usage: say.sh <name> <text>   type a prompt into the session and wait for its turn to end (one more turn.complete in the mod log)
D=${0:A:h:h}; name=$1; log=$D/runs/$name/mod.jsonl
C=($D/.venv/bin/python $D/drive/ctl.py $name)
have=$(grep -c '"what":"turn.complete"' $log 2>/dev/null); have=${have:-0}
$C line "$2" >/dev/null
$C waitlog $log '"what":"turn.complete"' $((have + 1)) ${3:-240} || { $C screen | grep -v '^\s*$' | tail -25; exit 1 }
tail -1 $log | python3 -c "import json,sys; d=json.loads(sys.stdin.read())['data']; print('answer:', d['answer'][:300].replace(chr(10),' | ')); print('session', d['sessionId'], 'cwd', d['cwd'], 'n', d['n'], 'has', d['has']); [print('  step', s['index'], {k:v for k,v in (s['usage'] or {}).items() if 'token' in k}) for s in d['steps']]"
