#!/usr/bin/env python3
"""A tiny tmux stand-in (tmux is not installed here): holds one interactive program under a pty,
keeps a pyte screen of it, and serves a unix socket for typing and reading the screen.

  ptyd.py <name> <cwd> <cols> <rows> -- <argv...>

Files, all under runs/<name>/:
  sock        control socket (see ctl.py)
  tty.raw     every byte the program wrote
  screen.txt  the current screen, rewritten about twice a second
  ptyd.pid    this daemon's pid;  child.pid  the program's pid;  exit  the program's exit status
Extra environment for the child is taken from this process's environment.
"""
import os, pty, sys, time, select, signal, socket, struct, fcntl, termios, json
import pyte

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

def main():
    name, cwd, cols, rows = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    argv = sys.argv[sys.argv.index('--') + 1:]
    run = os.path.join(ROOT, 'runs', name)
    os.makedirs(run, exist_ok=True)
    sockpath = os.path.join(run, 'sock')
    if os.path.exists(sockpath): os.unlink(sockpath)

    # detach
    if os.fork(): return
    os.setsid()
    devnull = os.open(os.devnull, os.O_RDWR)
    for fd in (0, 1, 2): os.dup2(devnull, fd)

    pid, fd = pty.fork()
    if pid == 0:
        os.chdir(cwd)
        env = dict(os.environ, TERM='xterm-256color', COLUMNS=str(cols), LINES=str(rows))
        os.execvpe(argv[0], argv, env)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
    open(os.path.join(run, 'ptyd.pid'), 'w').write(str(os.getpid()))
    open(os.path.join(run, 'child.pid'), 'w').write(str(pid))

    screen = pyte.HistoryScreen(cols, rows, history=20000, ratio=0.5)
    stream = pyte.ByteStream(screen)
    raw = open(os.path.join(run, 'tty.raw'), 'ab')
    idx = open(os.path.join(run, 'tty.idx'), 'a')  # '<epoch ms> <offset> <length>' per read, to line the bytes up with the mod log
    offset = 0
    srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    srv.bind(sockpath); srv.listen(8)
    last_dump = 0.0
    alive = True

    def text():
        return '\n'.join(line.rstrip() for line in screen.display)

    def history():
        out = []
        for line in screen.history.top:
            out.append(''.join(line[x].data for x in range(cols)).rstrip())
        return '\n'.join(out) + '\n' + text()

    while alive:
        r, _, _ = select.select([fd, srv], [], [], 0.25)
        if fd in r:
            try:
                data = os.read(fd, 65536)
            except OSError:
                data = b''
            if not data:
                alive = False
            else:
                raw.write(data); raw.flush()
                idx.write(f'{int(time.time() * 1000)} {offset} {len(data)}\n'); idx.flush(); offset += len(data)
                # answer the terminal queries a TUI may block on
                if b'\x1b[6n' in data:
                    os.write(fd, f'\x1b[{screen.cursor.y + 1};{screen.cursor.x + 1}R'.encode())
                if b'\x1b[c' in data or b'\x1b[0c' in data:
                    os.write(fd, b'\x1b[?62;c')
                try: stream.feed(data)
                except Exception: pass
        if srv in r:
            conn, _ = srv.accept()
            try:
                req = b''
                while not req.endswith(b'\n'):
                    chunk = conn.recv(65536)
                    if not chunk: break
                    req += chunk
                cmd = json.loads(req.decode())
                if cmd['op'] == 'send':
                    os.write(fd, cmd['data'].encode('utf-8', 'surrogateescape'))
                    conn.sendall(b'ok')
                elif cmd['op'] == 'screen':
                    conn.sendall(text().encode())
                elif cmd['op'] == 'history':
                    conn.sendall(history().encode())
                elif cmd['op'] == 'kill':
                    os.kill(pid, signal.SIGTERM); conn.sendall(b'ok')
            except Exception as err:
                try: conn.sendall(f'error: {err}'.encode())
                except Exception: pass
            conn.close()
        now = time.time()
        if now - last_dump > 0.5:
            last_dump = now
            with open(os.path.join(run, 'screen.txt'), 'w') as f: f.write(text())
    try:
        _, status = os.waitpid(pid, 0)
    except ChildProcessError:
        status = -1
    open(os.path.join(run, 'exit'), 'w').write(str(status))
    with open(os.path.join(run, 'screen.txt'), 'w') as f: f.write(text())
    with open(os.path.join(run, 'history.txt'), 'w') as f: f.write(history())
    os.unlink(sockpath)

main()
