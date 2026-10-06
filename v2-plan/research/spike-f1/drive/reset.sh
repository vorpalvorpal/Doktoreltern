#!/bin/zsh
# usage: reset.sh <name> <sourceSessionId> <dir> <marker> <seq> <prompt>
# helper cuts a fork of <source> at the end of the turn marked <marker>, the mod resumes it and submits <prompt>; waits for the turn.
D=${0:A:h:h}; name=$1; log=$D/runs/$name/mod.jsonl
have=$(grep -c '"what":"turn.complete"' $log 2>/dev/null); have=${have:-0}
node $D/helper.mjs go $2 $3 $4 $D/runs/$name/cmd.json $5 "$6" "f1-$name-$5" | tee -a $D/runs/$name/forks.jsonl
$D/.venv/bin/python $D/drive/ctl.py $name waitlog $log '"what":"turn.complete"' $((have + 1)) 240 || { $D/.venv/bin/python $D/drive/ctl.py $name screen | grep -v '^\s*$' | tail -25; exit 1 }
python3 - $log <<'PY'
import json,sys
rows=[json.loads(l) for l in open(sys.argv[1])]
r=[x for x in rows if x['what']=='resume'][-1]['data']
print('resume:', r['r'], 'ms', r['ms'], 'idOk', r['idOk'], '| before', r['before'], '| after', r['after'])
d=rows[-1]['data']
print('answer:', d['answer'][:400].replace(chr(10),' | ')); print('session', d['sessionId'], 'cwd', d['cwd'], 'n', d['n'], 'has', d['has'])
for s in d['steps']: print('  step', s['index'], {k:v for k,v in (s['usage'] or {}).items() if 'token' in k})
PY
