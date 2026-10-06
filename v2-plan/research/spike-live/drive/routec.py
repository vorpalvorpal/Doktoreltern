#!/usr/bin/env python3
"""Route C: a wrapper that types /rewind. Runs beside ptyd.py and drives the session through its socket.

  routec.py <name> <steps> [--big-first]

The session must run the leit mod with LEIT_ROUTE=none (the mod then only records step_done and writes its log; it
resets nothing) and LEIT_HOLD=0 (the mod cannot tell this wrapper's typing from the owner's: both are 'composer').

Signal: a new "turn.complete" line with pending set in runs/<name>/mod.jsonl (written from inside by the mod), never
screen idleness. Every keystroke is preceded by a check that the screen is what the wrapper expects; a miss stops the
wrapper with the screen saved to runs/<name>/routec-unexpected-<n>.txt rather than typing blind.
Log: runs/<name>/routec.jsonl
"""
import json, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ctl import call, ROOT

name, steps = sys.argv[1], int(sys.argv[2])
run = os.path.join(ROOT, 'runs', name)
modlog = os.path.join(run, 'mod.jsonl')
out = open(os.path.join(run, 'routec.jsonl'), 'a')

def log(what, **data):
    out.write(json.dumps({'t': int(time.time() * 1000), 'what': what, **data}) + '\n'); out.flush()

def screen(): return call(name, op='screen')
def send(data): call(name, op='send', data=data)

class Unexpected(Exception): pass

def expect(rx, seconds, why):
    """Wait until the screen matches; stop the wrapper if it does not."""
    deadline = time.time() + seconds
    while time.time() < deadline:
        s = screen()
        if re.search(rx, s, re.S): return s
        time.sleep(0.15)
    path = os.path.join(run, f'routec-unexpected-{int(time.time())}.txt')
    open(path, 'w').write(screen())
    log('UNEXPECTED SCREEN', why=why, wanted=rx, saved=path)
    raise Unexpected(f'{why}: screen saved to {path}')

def input_box(s):
    """The text in the prompt box: the lines between the last two horizontal rules."""
    lines = s.split('\n')
    rules = [i for i, l in enumerate(lines) if l.startswith('─' * 20)]
    if len(rules) < 2: return None
    return '\n'.join(lines[rules[-2] + 1:rules[-1]])

def idle_prompt(s):
    box = input_box(s)
    return box is not None and 'Do you want to proceed' not in s and 'Esc to cancel' not in s and 'esc to interrupt' not in s

def turn_completes():
    n, last = 0, None
    try:
        for line in open(modlog):
            if '"what":"turn.complete"' in line: n += 1; last = json.loads(line)
    except FileNotFoundError: pass
    return n, last

def wait_step_done(after, seconds=900):
    deadline = time.time() + seconds
    while time.time() < deadline:
        n, last = turn_completes()
        if n > after: return n, last
        time.sleep(0.3)
    raise Unexpected('no turn.complete from the mod in time')

def clear_box():
    for _ in range(40):
        box = input_box(screen())
        if box is not None and re.fullmatch(r'❯\s*', box.strip() or '❯'): return True
        send('\x15'); time.sleep(0.15)
    raise Unexpected('could not empty the prompt box')

def rewind_to(marker):
    """Open /rewind, walk up to the entry whose text starts with `marker`, restore the conversation only."""
    t0 = time.time()
    s = screen()
    if not idle_prompt(s): raise Unexpected('not at an idle prompt before /rewind')
    clear_box()
    send('/rewind'); time.sleep(0.5); send('\r')
    s = expect(r'Rewind\n.*Restore the code and/or conversation.*\(current\)', 8, 'rewind menu did not open')
    ups = 0
    while True:
        sel = [l for l in s.split('\n') if re.match(r'\s+❯ ', l)]
        if len(sel) == 1 and sel[0].strip()[2:].startswith(marker): break
        if ups > 60: raise Unexpected(f'marker {marker!r} not found in the rewind menu')
        before = sel[0] if sel else ''
        send('\x1b[A'); ups += 1
        for _ in range(20):
            time.sleep(0.1); s = screen()
            now = [l for l in s.split('\n') if re.match(r'\s+❯ ', l)]
            if now and now[0] != before: break
        else: raise Unexpected(f'marker {marker!r} not found: the cursor stopped moving after {ups} ups')
    send('\r')
    s = expect(r'Confirm you want to restore.*' + re.escape(marker) + r'.*Restore conversation', 8, 'confirm page did not show the marked prompt')
    m = re.search(r'(\d)\. Restore conversation\s*$', s, re.M)
    if not m: raise Unexpected('no "Restore conversation" option')
    send(m.group(1))
    deadline = time.time() + 8
    while time.time() < deadline:
        s = screen()
        if 'Confirm you want to restore' not in s and idle_prompt(s): break
        time.sleep(0.15)
    else: raise Unexpected('rewind menu did not close')
    clear_box()
    log('rewound', marker=marker, ups=ups, option=m.group(1), ms=int((time.time() - t0) * 1000))

def paste(text):
    send('\x1b[200~' + text + '\x1b[201~'); time.sleep(0.6 + len(text) / 200000)
    send('\r')

def main():
    work = os.path.join(run, 'work')
    n, _ = turn_completes()
    if '--base' in sys.argv:
        # the stable prefix, pasted once as one large prompt (a paste-size test as well)
        names = sorted(f for f in os.listdir(os.path.join(work, 'checkpoints')) if f != 'unit.md')
        text = '\n\n'.join(f'<checkpoint file="checkpoints/{f}">\n' + open(os.path.join(work, 'checkpoints', f)).read() + '\n</checkpoint>' for f in names)
        t0 = time.time()
        paste(f'[[CP base]] <environment>\nWorking directory (every Bash command starts here; do not cd): {work}\n</environment>\n\n{text}\n\nThis is the stable part of the build state. The unit state follows in the next message. Reply with just: ok')
        time.sleep(1.5)
        open(os.path.join(run, 'routec-after-paste.txt'), 'w').write(screen())
        n, last = wait_step_done(n)
        log('base', chars=len(text), ms=int((time.time() - t0) * 1000), answer=last['data'].get('answer', '')[:100], usage=last['data'].get('usage'), tokens=(last['data'].get('ctx') or {}).get('tokens'))
    for step in range(1, steps + 1):
        unit = open(os.path.join(work, 'checkpoints', 'unit.md')).read()
        if step > 1: rewind_to('[[CP step-')
        t0 = time.time()
        paste(f'[[CP step-{step}]] <checkpoint file="checkpoints/unit.md">\n{unit}\n</checkpoint>\n\ncontinue')
        n, last = wait_step_done(n)
        d = last['data']
        log('step', step=step, turnMs=int((time.time() - t0) * 1000), answer=d.get('answer', '')[:200], usage=d.get('usage'), steps=d.get('steps'), tokens=(d.get('ctx') or {}).get('tokens'), stale=d.get('staleNoncesInLiveWindow'), has=d.get('has'), apiMessages=d.get('apiMessages'), pending=d.get('pending'))
        time.sleep(1.0)
    log('done', steps=steps)

try: main()
except Unexpected as err: print('STOPPED:', err); sys.exit(2)
