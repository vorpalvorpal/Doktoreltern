#!/usr/bin/env python3
"""Run an INTERACTIVE claude session under a pty with no human: usage run-tty.py <name> <mode> <prompt> <seconds>.
Presses Enter once after 6 s (in case a trust dialog is up), then just waits and kills the session."""
import os, pty, sys, time, select, signal
D = os.path.dirname(os.path.abspath(__file__))
name, mode, prompt, secs = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
env = dict(os.environ, SPIKE_MODE=mode, SPIKE_LOG=f"{D}/logs/{name}.mod.jsonl", TERM="xterm-256color")
pid, fd = pty.fork()
if pid == 0:
    os.chdir(f"{D}/work")
    os.execvpe("claude", ["claude", prompt, "--model", "haiku", "--plugin-dir", f"{D}/mod"], env)
start = time.time(); pressed = False
with open(f"{D}/logs/{name}.tty", "wb") as out:
    while time.time() - start < secs:
        r, _, _ = select.select([fd], [], [], 0.5)
        if r:
            try: out.write(os.read(fd, 65536))
            except OSError: break
        if not pressed and time.time() - start > 6:
            pressed = True
            if not os.path.exists(env["SPIKE_LOG"]): os.write(fd, b"\r")
os.kill(pid, signal.SIGTERM)
