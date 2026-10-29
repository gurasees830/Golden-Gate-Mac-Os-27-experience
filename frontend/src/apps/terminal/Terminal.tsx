import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { AppProps } from '../../types';
import { TitleBar, useMenus, useWindow, useWindowTitle } from '../../shell/windowContext';
import { useWindows } from '../../stores/windows';
import { useSettings } from '../../stores/settings';
import { HOME, pathString, useFs } from '../../stores/fs';
import { complete, prompt, runLine, type ShellState } from '../../lib/shell';
import { openApp, openFile } from '../../shell/actions';

export default function TerminalApp({ win }: AppProps) {
  const host = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const st = useRef<ShellState>({ cwd: HOME, env: { HOME: '/Users', SHELL: '/bin/zsh', TERM: 'xterm-256color', USER: useSettings.getState().user.accountName }, history: [] });
  const { focused } = useWindow();
  const acct = useSettings((s) => s.user.accountName);
  useWindowTitle(`${acct} — -zsh — ${Math.round(win.bounds.w / 8.4)}×${Math.round((win.bounds.h - 52) / 17)}`);

  useEffect(() => {
    const term = new XTerm({
      fontFamily: '"SF Mono", Menlo, "Cascadia Mono", Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      lineHeight: 1.15,
      cursorBlink: true,
      cursorStyle: 'block',
      allowProposedApi: false,
      scrollback: 3000,
      theme: { background: '#1e1e1e', foreground: '#e6e6e6', cursor: '#d0d0d0', selectionBackground: '#3a5a8a', black: '#000000', blue: '#5ea2ff', brightBlue: '#7cb7ff', green: '#5ac46a', red: '#ff6b60' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current!);
    termRef.current = term;
    fitRef.current = fit;
    requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {
        /* not visible yet */
      }
    });

    const s = st.current;
    st.current.env.HOME = pathString(useFs.getState().nodes, HOME);
    let line = '';
    let pos = 0;
    let hIdx = -1;
    let busy = false;
    const lastLogin = localStorage.getItem('gg-last-login');
    term.writeln(`Last login: ${lastLogin ?? new Date().toString().slice(0, 24)} on ttys00${Math.floor(Math.random() * 9)}`);
    try {
      localStorage.setItem('gg-last-login', new Date().toString().slice(0, 24));
    } catch {
      /* ignore */
    }
    term.writeln('\x1b[2mGolden Gate Terminal — type "help" for commands. This shell only touches the simulator\'s virtual disk.\x1b[0m');
    const P = () => prompt(s);
    term.write(P());

    const redraw = () => {
      term.write(`\r\x1b[K${P()}${line}`);
      const back = line.length - pos;
      if (back > 0) term.write(`\x1b[${back}D`);
    };

    const io = {
      clear: () => term.clear(),
      exit: () => void useWindows.getState().close(win.id, true),
      open: (id: string, app?: string) => openFile(id, app),
      openApp: (id: string) => openApp(id),
    };

    const disp = term.onData(async (data) => {
      if (busy) return;
      if (data === '\r') {
        term.write('\r\n');
        const cmd = line;
        line = '';
        pos = 0;
        hIdx = -1;
        busy = true;
        try {
          const out = await runLine(cmd, s, io);
          if (out) term.write(out.replace(/\n/g, '\r\n') + '\r\n');
        } catch (e) {
          term.write(`\x1b[31m${(e as Error).message}\x1b[0m\r\n`);
        }
        busy = false;
        term.write(P());
        return;
      }
      if (data === '\x7f') {
        if (pos > 0) {
          line = line.slice(0, pos - 1) + line.slice(pos);
          pos--;
          redraw();
        }
        return;
      }
      if (data === '\x03') {
        term.write('^C\r\n' + P());
        line = '';
        pos = 0;
        return;
      }
      if (data === '\x0c') {
        term.clear();
        redraw();
        return;
      }
      if (data === '\x01') {
        pos = 0;
        redraw();
        return;
      }
      if (data === '\x05') {
        pos = line.length;
        redraw();
        return;
      }
      if (data === '\x15') {
        line = line.slice(pos);
        pos = 0;
        redraw();
        return;
      }
      if (data === '\t') {
        const r = complete(line, s);
        if (r.options.length > 1) {
          term.write('\r\n' + r.options.join('  ') + '\r\n');
        }
        line = r.line;
        pos = line.length;
        redraw();
        return;
      }
      if (data === '\x1b[A' || data === '\x1b[B') {
        const h = s.history;
        if (!h.length) return;
        if (data === '\x1b[A') hIdx = hIdx === -1 ? h.length - 1 : Math.max(0, hIdx - 1);
        else hIdx = hIdx === -1 ? -1 : hIdx + 1 >= h.length ? -1 : hIdx + 1;
        line = hIdx === -1 ? '' : h[hIdx];
        pos = line.length;
        redraw();
        return;
      }
      if (data === '\x1b[D') {
        if (pos > 0) {
          pos--;
          term.write(data);
        }
        return;
      }
      if (data === '\x1b[C') {
        if (pos < line.length) {
          pos++;
          term.write(data);
        }
        return;
      }
      if (data.startsWith('\x1b')) return;
      const clean = data.replace(/[\r\n]+/g, ' ').replace(/[\x00-\x1f]/g, '');
      line = line.slice(0, pos) + clean + line.slice(pos);
      pos += clean.length;
      redraw();
    });

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
    });
    ro.observe(host.current!);
    return () => {
      disp.dispose();
      ro.disconnect();
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (focused) termRef.current?.focus();
  }, [focused]);

  useMenus(
    [
      { title: 'Shell', items: [{ label: 'New Window', shortcut: 'mod+n', action: () => openApp('terminal', undefined, { forceNew: true }) }, { label: 'Clear Screen', shortcut: 'mod+k', action: () => termRef.current?.clear() }, { separator: true }, { label: 'Close Window', shortcut: 'mod+w', action: () => void useWindows.getState().close(win.id) }] },
      { title: 'View', items: [{ label: 'Bigger', shortcut: 'mod+=', action: () => { const t = termRef.current!; t.options.fontSize = Math.min(28, (t.options.fontSize ?? 13) + 1); fitRef.current?.fit(); } }, { label: 'Smaller', shortcut: 'mod+-', action: () => { const t = termRef.current!; t.options.fontSize = Math.max(9, (t.options.fontSize ?? 13) - 1); fitRef.current?.fit(); } }] },
    ],
    [],
  );

  return (
    <div className="flex flex-col h-full" style={{ background: '#1e1e1e' }}>
      <TitleBar height={30} className="!h-[30px] terminal-tb" style={{ background: '#2b2b2b', borderBottom: '1px solid #111' }} />
      <div className="flex-1 min-h-0 px-[6px] pt-[4px] pb-[2px]" onPointerDown={() => termRef.current?.focus()}>
        <div ref={host} className="w-full h-full" />
      </div>
    </div>
  );
}
