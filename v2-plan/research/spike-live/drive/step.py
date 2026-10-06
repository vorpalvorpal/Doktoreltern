#!/usr/bin/env python3
"""One fake build step, run by the model from the session's cwd: bumps state.json, rewrites the changing part of
checkpoints/unit.md, and prints a fresh STEP-NONCE that exists nowhere but in this output and in $LEIT_NONCES."""
import json, os, secrets, time
time.sleep(float(os.environ.get('LEIT_STEP_SLEEP', '0')))
st = json.load(open('state.json'))
st['step'] += 1
st['unit'] = f"u{(st['step'] - 1) // 5 + 1}"
json.dump(st, open('state.json', 'w'))
notes = '\n'.join(f"- step {st['step']} note {i}: {secrets.token_hex(12)} touched module m{(st['step'] * 7 + i) % 40}" for i in range(12))
open('checkpoints/unit.md', 'w').write(f"# Unit checkpoint\nstep: {st['step']}\nunit: {st['unit']}\nMarker: UNIT-MARKER-BRAVO.\n\n## Notes from the last step (changes every step)\n{notes}\n")
nonce = 'NONCE-' + secrets.token_hex(6).upper()
with open(os.environ.get('LEIT_NONCES', 'nonces.txt'), 'a') as f: f.write(nonce + '\n')
print(f"step {st['step']} done at {time.strftime('%H:%M:%S')}. STEP-NONCE: {nonce}")
