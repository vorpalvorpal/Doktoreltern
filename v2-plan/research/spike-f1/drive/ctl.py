#!/usr/bin/env python3
"""Client for ptyd.py.

  ctl.py <name> type <text>      type the text (no Enter)
  ctl.py <name> line <text>      type the text, wait 0.4 s, press Enter
  ctl.py <name> key <esc|enter|ctrl-c|up|down|tab|...>
  ctl.py <name> screen           print the current screen
  ctl.py <name> history          print scrollback + screen
  ctl.py <name> wait <regex> <seconds>   poll the screen until the regex matches (exit 1 on timeout)
  ctl.py <name> waitlog <file> <regex> <count> <seconds>   until the file has >= count matching lines
  ctl.py <name> kill
"""
import os, sys, json, socket, time, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEYS = {'esc': '\x1b', 'enter': '\r', 'ctrl-c': '\x03', 'ctrl-d': '\x04', 'up': '\x1b[A', 'down': '\x1b[B',
        'tab': '\t', 'ctrl-o': '\x0f', 'ctrl-b': '\x02', 'space': ' ', 'backspace': '\x7f', 'pgup': '\x1b[5~', 'pgdn': '\x1b[6~', 'ctrl-x': '\x18', 'shift-tab': '\x1b[Z', 'end': '\x1b[F', 'home': '\x1b[H'}

def call(name, **cmd):
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.connect(os.path.join(ROOT, 'runs', name, 'sock'))
    s.sendall((json.dumps(cmd) + '\n').encode())
    out = b''
    while True:
        chunk = s.recv(65536)
        if not chunk: break
        out += chunk
    return out.decode(errors='replace')

def main():
    name, op = sys.argv[1], sys.argv[2]
    if op == 'type': print(call(name, op='send', data=sys.argv[3]))
    elif op == 'line':
        call(name, op='send', data=sys.argv[3]); time.sleep(0.8); print(call(name, op="send", data="\r"))
    elif op == 'key': print(call(name, op='send', data=KEYS[sys.argv[3]]))
    elif op in ('screen', 'history'): print(call(name, op=op))
    elif op == 'kill': print(call(name, op='kill'))
    elif op == 'wait':
        rx, deadline = re.compile(sys.argv[3]), time.time() + float(sys.argv[4])
        while time.time() < deadline:
            if rx.search(call(name, op='screen')): return 0
            time.sleep(0.5)
        print('timeout'); return 1
    elif op == 'waitlog':
        path, rx, count, deadline = sys.argv[3], re.compile(sys.argv[4]), int(sys.argv[5]), time.time() + float(sys.argv[6])
        while time.time() < deadline:
            try: n = sum(1 for line in open(path) if rx.search(line))
            except FileNotFoundError: n = 0
            if n >= count: return 0
            time.sleep(0.5)
        print(f'timeout (have {n})'); return 1
    return 0

if __name__ == '__main__': sys.exit(main())
