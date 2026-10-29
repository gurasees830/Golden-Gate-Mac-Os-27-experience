import { useFs, resolvePath, pathString, HOME, readText, folderSize } from '../stores/fs';
import { useSettings } from '../stores/settings';
import { useWindows } from '../stores/windows';
import { allApps, getApp } from './appRegistry';
import { isInstalled } from '../stores/apps';
import { formatBytes, mimeFromName, isTextMime } from './format';
import { APP_VERSION } from './env';
import { systemNow } from './clock';

/**
 * A small zsh-flavoured command interpreter for the virtual filesystem.
 * It never executes anything on the host computer.
 */
export interface ShellState {
  cwd: string;
  env: Record<string, string>;
  history: string[];
}

export interface ShellIO {
  clear: () => void;
  exit: () => void;
  open: (nodeId: string, appId?: string) => void;
  openApp: (appId: string) => void;
}

const C = {
  dir: (s: string) => `\x1b[1;34m${s}\x1b[0m`,
  err: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  orange: (s: string) => `\x1b[38;5;208m${s}\x1b[0m`,
};

export function tokenize(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q: '"' | "'" | null = null;
  let has = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === q) q = null;
      else if (c === '\\' && q === '"' && i + 1 < line.length) cur += line[++i];
      else cur += c;
    } else if (c === '"' || c === "'") {
      q = c;
      has = true;
    } else if (c === '\\' && i + 1 < line.length) {
      cur += line[++i];
      has = true;
    } else if (/\s/.test(c)) {
      if (cur || has) out.push(cur);
      cur = '';
      has = false;
    } else if (c === ';' || (c === '&' && line[i + 1] === '&')) {
      if (cur || has) out.push(cur);
      cur = '';
      has = false;
      if (c === '&') {
        out.push('&&');
        i++;
      } else out.push(';');
    } else if (c === '|' || c === '>') {
      if (cur || has) out.push(cur);
      cur = '';
      has = false;
      if (c === '>' && line[i + 1] === '>') {
        out.push('>>');
        i++;
      } else out.push(c);
    } else {
      cur += c;
      has = true;
    }
  }
  if (cur || has) out.push(cur);
  return out;
}

function nodes() {
  return useFs.getState().nodes;
}

function resolve(st: ShellState, p: string) {
  return resolvePath(nodes(), p, st.cwd);
}

function displayPath(id: string): string {
  const p = pathString(nodes(), id);
  const home = pathString(nodes(), HOME);
  return p.startsWith(home) ? `~${p.slice(home.length)}` : p;
}

export function prompt(st: ShellState) {
  const s = useSettings.getState();
  const host = s.computerName.replace(/[’']/g, '').replace(/\s+/g, '-');
  const dir = st.cwd === HOME ? '~' : nodes()[st.cwd]?.name ?? '/';
  return `${s.user.accountName}@${host} ${dir} % `;
}

function splitParentName(st: ShellState, p: string): { parent: string | null; name: string } {
  const clean = p.replace(/\/+$/, '');
  const i = clean.lastIndexOf('/');
  if (i === -1) return { parent: st.cwd, name: clean };
  const dir = clean.slice(0, i) || '/';
  return { parent: resolve(st, dir), name: clean.slice(i + 1) };
}

const HELP = `Golden Gate Terminal — commands operate on the simulator's virtual disk.

  ls [-la] [path]      list files            cd [path]          change directory
  pwd                  print directory       mkdir [-p] dir     create folders
  touch file           create/update file    cat file           show file contents
  echo text [> file]   print or write        rm [-r] path       delete (permanently)
  mv src dst           move/rename           cp [-r] src dst    copy
  open [-a App] [path] open file or app      apps               list installed apps
  tree [path]          folder tree           find name          search by name
  head/tail [-n N]     first/last lines      grep text [file]   search text
  wc [file]            count lines/words     du [path]          disk usage
  date  cal  uptime  whoami  hostname  uname [-a]  sw_vers  systeminfo
  history  clear  say text  env  export K=V  which cmd  exit

Pipes (|) and redirection (> >>) are supported. This is not a real Unix shell
and cannot run commands on your computer.`;

export async function runLine(line: string, st: ShellState, io: ShellIO): Promise<string> {
  const trimmed = line.trim();
  if (!trimmed) return '';
  st.history.push(trimmed);
  const groups: { toks: string[]; op: string }[] = [{ toks: [], op: ';' }];
  for (const t of tokenize(trimmed)) {
    if (t === '&&' || t === ';') groups.push({ toks: [], op: t });
    else groups[groups.length - 1].toks.push(t);
  }
  const outputs: string[] = [];
  let lastFailed = false;
  for (const g of groups) {
    if (!g.toks.length) continue;
    if (g.op === '&&' && lastFailed) break;
    const out = await runTokens(g.toks, st, io);
    lastFailed = out.startsWith('\x1b[31m');
    if (out) outputs.push(out);
  }
  return outputs.join('\n');
}

async function runTokens(rawToks: string[], st: ShellState, io: ShellIO): Promise<string> {
  const toks = rawToks.map((t) => t.replace(/\$(\w+)/g, (_, k: string) => st.env[k] ?? ''));
  // redirection
  let redirect: { mode: '>' | '>>'; file: string } | null = null;
  const ri = toks.findIndex((t) => t === '>' || t === '>>');
  if (ri !== -1) {
    redirect = { mode: toks[ri] as '>' | '>>', file: toks[ri + 1] ?? '' };
    toks.splice(ri, 2);
    if (!redirect.file) return C.err('zsh: parse error near `\\n`');
  }
  // pipeline
  const stages: string[][] = [[]];
  for (const t of toks) {
    if (t === '|') stages.push([]);
    else stages[stages.length - 1].push(t);
  }
  let stdin: string | null = null;
  let out = '';
  for (const argv of stages) {
    if (!argv.length) return C.err('zsh: parse error near `|`');
    out = await exec(argv, st, io, stdin);
    stdin = out.replace(/\x1b\[[0-9;]*m/g, '');
  }
  if (redirect) {
    const plain = out.replace(/\x1b\[[0-9;]*m/g, '');
    const { parent, name } = splitParentName(st, redirect.file);
    if (!parent) return C.err(`zsh: no such file or directory: ${redirect.file}`);
    const existing = Object.values(nodes()).find((n) => n.parentId === parent && !n.trashed && n.name === name);
    if (existing?.kind === 'folder') return C.err(`zsh: is a directory: ${redirect.file}`);
    if (existing) {
      const prev = redirect.mode === '>>' ? await readText(existing.id) : '';
      await useFs.getState().writeFile(existing.id, prev + plain + (plain.endsWith('\n') || !plain ? '' : '\n'));
    } else await useFs.getState().createFile(parent, name, plain + (plain && !plain.endsWith('\n') ? '\n' : ''), mimeFromName(name).startsWith('application/octet') ? 'text/plain' : mimeFromName(name));
    return '';
  }
  return out;
}

async function readInput(st: ShellState, file: string | undefined, stdin: string | null, cmd: string): Promise<string | { error: string }> {
  if (!file) return stdin ?? '';
  const id = resolve(st, file);
  if (!id) return { error: `${cmd}: ${file}: No such file or directory` };
  const n = nodes()[id];
  if (n.kind === 'folder') return { error: `${cmd}: ${file}: Is a directory` };
  if (!isTextMime(n.mime)) return { error: `${cmd}: ${file}: binary file (${n.mime})` };
  return readText(id);
}

async function exec(argv: string[], st: ShellState, io: ShellIO, stdin: string | null): Promise<string> {
  const [cmd, ...rest] = argv;
  const flags = new Set(rest.filter((a) => /^-[a-zA-Z]+$/.test(a)).flatMap((a) => a.slice(1).split('')));
  const args = rest.filter((a) => !/^-[a-zA-Z]+$/.test(a));
  const fs = useFs.getState();
  const s = useSettings.getState();
  switch (cmd) {
    case 'help':
    case 'man':
      return HELP;
    case 'clear':
      io.clear();
      return '';
    case 'exit':
    case 'logout':
      io.exit();
      return '';
    case 'echo':
      return rest.filter((a) => a !== '-n').join(' ');
    case 'pwd':
      return pathString(nodes(), st.cwd);
    case 'whoami':
      return s.user.accountName;
    case 'hostname':
      return `${s.computerName.replace(/[’']/g, '').replace(/\s+/g, '-')}.local`;
    case 'date':
      return systemNow().toString().replace(/\(.+\)/, '').trim();
    case 'uname':
      if (flags.has('a')) return `GoldenGate ${s.computerName.replace(/\s+/g, '-')}.local 27.0.0 Golden Gate Kernel Version 27.0.0 (browser simulator) web`;
      if (flags.has('r')) return '27.0.0';
      if (flags.has('m')) return 'web';
      return 'GoldenGate';
    case 'sw_vers':
      return `ProductName:\t\tGolden Gate\nProductVersion:\t\t${s.osVersion}\nBuildVersion:\t\tGG${APP_VERSION.replace(/\./g, '')}\nNote:\t\t\tbrowser-based simulator`;
    case 'uptime': {
      const secs = Math.floor(performance.now() / 1000);
      return `${systemNow().toLocaleTimeString()}  up ${Math.floor(secs / 3600)}:${String(Math.floor((secs % 3600) / 60)).padStart(2, '0')}, 1 user, ${useWindows.getState().windows.length} windows`;
    }
    case 'history':
      return st.history.map((h, i) => `${String(i + 1).padStart(5)}  ${h}`).join('\n');
    case 'env':
      return Object.entries(st.env).map(([k, v]) => `${k}=${v}`).join('\n');
    case 'export': {
      for (const a of args) {
        const m = a.match(/^(\w+)=(.*)$/);
        if (m) st.env[m[1]] = m[2];
      }
      return '';
    }
    case 'which':
      return args.map((a) => (COMMANDS.includes(a) ? `${a}: shell built-in command` : C.err(`${a} not found`))).join('\n');
    case 'cd': {
      const target = args[0] ? resolve(st, args[0]) : HOME;
      if (!target) return C.err(`cd: no such file or directory: ${args[0]}`);
      if (nodes()[target].kind !== 'folder') return C.err(`cd: not a directory: ${args[0]}`);
      st.cwd = target;
      st.env.PWD = pathString(nodes(), target);
      return '';
    }
    case 'ls': {
      const target = args[0] ? resolve(st, args[0]) : st.cwd;
      if (!target) return C.err(`ls: ${args[0]}: No such file or directory`);
      const t = nodes()[target];
      if (t.kind === 'file') return flags.has('l') ? longLine(t) : t.name;
      let list = fs.children(target).sort((a, b) => a.name.localeCompare(b.name));
      if (target === 'applications') list = allApps().filter((a) => !a.hidden && isInstalled(a.id)).map((a) => ({ ...t, id: a.id, name: `${a.name}.app`, kind: 'folder' as const, parentId: target }));
      if (!flags.has('a')) list = list.filter((n) => !n.name.startsWith('.'));
      if (flags.has('l')) return [`total ${list.length}`, ...list.map(longLine)].join('\n');
      return list.map((n) => (n.kind === 'folder' ? C.dir(n.name) : n.name)).join('  ');
    }
    case 'mkdir': {
      const out: string[] = [];
      for (const a of args) {
        if (flags.has('p')) {
          let cur = a.startsWith('/') ? 'root' : a.startsWith('~') ? HOME : st.cwd;
          for (const part of a.replace(/^~\/?/, '').split('/').filter(Boolean)) {
            if (part === '..') { cur = nodes()[cur]?.parentId ?? cur; continue; }
            if (part === '.') continue;
            const ex = Object.values(nodes()).find((n) => n.parentId === cur && !n.trashed && n.name === part);
            cur = ex ? ex.id : (await useFs.getState().createFolder(cur, part)).id;
          }
          continue;
        }
        const { parent, name } = splitParentName(st, a);
        if (!parent) { out.push(C.err(`mkdir: ${a}: No such file or directory`)); continue; }
        if (Object.values(nodes()).some((n) => n.parentId === parent && !n.trashed && n.name === name)) { out.push(C.err(`mkdir: ${a}: File exists`)); continue; }
        await fs.createFolder(parent, name);
      }
      return out.join('\n');
    }
    case 'touch': {
      for (const a of args) {
        const id = resolve(st, a);
        if (id) {
          const n = nodes()[id];
          if (n.kind === 'file') await fs.writeFile(id, await readText(id));
          continue;
        }
        const { parent, name } = splitParentName(st, a);
        if (!parent) return C.err(`touch: ${a}: No such file or directory`);
        await fs.createFile(parent, name, '', mimeFromName(name) === 'application/octet-stream' ? 'text/plain' : mimeFromName(name));
      }
      return '';
    }
    case 'cat': {
      if (!args.length) return stdin ?? '';
      const parts: string[] = [];
      for (const a of args) {
        const r = await readInput(st, a, null, 'cat');
        parts.push(typeof r === 'string' ? r.replace(/\n$/, '') : C.err(r.error));
      }
      return parts.join('\n');
    }
    case 'head':
    case 'tail': {
      const nIdx = rest.indexOf('-n');
      const n = nIdx !== -1 ? Number(rest[nIdx + 1]) || 10 : 10;
      const file = args.filter((a) => a !== String(n))[0];
      const r = await readInput(st, file, stdin, cmd);
      if (typeof r !== 'string') return C.err(r.error);
      const lines = r.replace(/\n$/, '').split('\n');
      return (cmd === 'head' ? lines.slice(0, n) : lines.slice(-n)).join('\n');
    }
    case 'wc': {
      const r = await readInput(st, args[0], stdin, 'wc');
      if (typeof r !== 'string') return C.err(r.error);
      const lines = r ? r.split('\n').length - (r.endsWith('\n') ? 1 : 0) : 0;
      return `${String(lines).padStart(8)}${String(r.trim() ? r.trim().split(/\s+/).length : 0).padStart(8)}${String(new Blob([r]).size).padStart(8)}${args[0] ? ` ${args[0]}` : ''}`;
    }
    case 'grep': {
      const [pat, file] = args;
      if (!pat) return C.err('usage: grep pattern [file]');
      const r = await readInput(st, file, stdin, 'grep');
      if (typeof r !== 'string') return C.err(r.error);
      const re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags.has('i') ? 'i' : '');
      return r.split('\n').filter((l) => re.test(l)).map((l) => l.replace(re, (m) => `\x1b[1;31m${m}\x1b[0m`)).join('\n');
    }
    case 'rm':
    case 'rmdir': {
      const out: string[] = [];
      for (const a of args) {
        const id = resolve(st, a);
        if (!id) { if (!flags.has('f')) out.push(C.err(`${cmd}: ${a}: No such file or directory`)); continue; }
        const n = nodes()[id];
        if (n.system) { out.push(C.err(`${cmd}: ${a}: Operation not permitted`)); continue; }
        if (n.kind === 'folder' && cmd === 'rm' && !flags.has('r') && !flags.has('R')) { out.push(C.err(`rm: ${a}: is a directory`)); continue; }
        if (cmd === 'rmdir' && fs.children(id).length) { out.push(C.err(`rmdir: ${a}: Directory not empty`)); continue; }
        if (isDescendantOf(st.cwd, id)) st.cwd = n.parentId ?? HOME;
        await fs.deleteForever([id]);
      }
      return out.join('\n');
    }
    case 'mv':
    case 'cp': {
      if (args.length < 2) return C.err(`usage: ${cmd} source target`);
      const dst = args[args.length - 1];
      const srcs = args.slice(0, -1);
      const dstId = resolve(st, dst);
      for (const a of srcs) {
        const id = resolve(st, a);
        if (!id) return C.err(`${cmd}: ${a}: No such file or directory`);
        if (cmd === 'cp' && nodes()[id].kind === 'folder' && !flags.has('r') && !flags.has('R')) return C.err(`cp: ${a} is a directory (not copied).`);
        if (dstId && nodes()[dstId].kind === 'folder') {
          if (cmd === 'mv') await fs.move([id], dstId);
          else await fs.copy([id], dstId);
        } else {
          const { parent, name } = splitParentName(st, dst);
          if (!parent) return C.err(`${cmd}: ${dst}: No such file or directory`);
          if (cmd === 'mv') {
            if (nodes()[id].parentId !== parent) await fs.move([id], parent);
            await fs.rename(id, name);
          } else {
            const [nid] = await fs.copy([id], parent);
            if (nid) await fs.rename(nid, name);
          }
        }
      }
      return '';
    }
    case 'open': {
      const ai = rest.indexOf('-a');
      if (ai !== -1) {
        const name = rest[ai + 1];
        const app = allApps().find((a) => a.name.toLowerCase() === name?.toLowerCase().replace(/\.app$/, '') || a.id === name?.toLowerCase());
        if (!app) return C.err(`Unable to find application named '${name}'`);
        const file = rest[ai + 2];
        if (file) {
          const id = resolve(st, file);
          if (!id) return C.err(`The file ${file} does not exist.`);
          io.open(id, app.id);
        } else io.openApp(app.id);
        return '';
      }
      const target = args[0] ? resolve(st, args[0]) : null;
      if (!args[0]) return C.err('usage: open [-a application] [file ...]');
      if (!target) return C.err(`The file ${pathString(nodes(), st.cwd)}/${args[0]} does not exist.`);
      io.open(target);
      return '';
    }
    case 'apps':
      return allApps().filter((a) => !a.hidden && isInstalled(a.id)).map((a) => `${C.bold(a.name.padEnd(20))} ${C.dim(a.category)}`).join('\n');
    case 'ps':
    case 'top':
      return [`  PID  APP                  WINDOW`, ...useWindows.getState().windows.map((w, i) => `${String(400 + i).padStart(5)}  ${(getApp(w.appId)?.name ?? w.appId).padEnd(20)} ${w.title}${w.minimized ? ' (minimized)' : ''}`)].join('\n');
    case 'kill': {
      const pid = Number(args[0]) - 400;
      const w = useWindows.getState().windows[pid];
      if (!w) return C.err(`kill: ${args[0]}: no such process`);
      await useWindows.getState().close(w.id, true);
      return '';
    }
    case 'tree': {
      const root = args[0] ? resolve(st, args[0]) : st.cwd;
      if (!root) return C.err(`tree: ${args[0]}: not found`);
      const lines = [C.dir(args[0] ?? '.')];
      let dirs = 0;
      let files = 0;
      const walk = (id: string, prefix: string, depth: number) => {
        const kids = useFs.getState().children(id).sort((a, b) => a.name.localeCompare(b.name));
        kids.forEach((k, i) => {
          const last = i === kids.length - 1;
          lines.push(`${prefix}${last ? '└── ' : '├── '}${k.kind === 'folder' ? C.dir(k.name) : k.name}`);
          if (k.kind === 'folder') {
            dirs++;
            if (depth < 6) walk(k.id, prefix + (last ? '    ' : '│   '), depth + 1);
          } else files++;
        });
      };
      walk(root, '', 0);
      lines.push('', `${dirs} directories, ${files} files`);
      return lines.join('\n');
    }
    case 'find': {
      const q = (args[args.length - 1] ?? '').replace(/\*/g, '').toLowerCase();
      if (!q) return C.err('usage: find name');
      return Object.values(nodes()).filter((n) => !n.trashed && n.parentId && n.name.toLowerCase().includes(q)).map((n) => displayPath(n.id)).join('\n') || '';
    }
    case 'du': {
      const target = args[0] ? resolve(st, args[0]) : st.cwd;
      if (!target) return C.err(`du: ${args[0]}: No such file or directory`);
      const n = nodes()[target];
      return `${formatBytes(n.kind === 'folder' ? folderSize(nodes(), target) : n.size).padEnd(10)} ${args[0] ?? '.'}`;
    }
    case 'df': {
      const e = await navigator.storage?.estimate?.();
      return `Filesystem        Size     Used    Avail\nGolden Gate HD   ${formatBytes(e?.quota ?? 0).padEnd(8)} ${formatBytes(e?.usage ?? 0).padEnd(8)} ${formatBytes((e?.quota ?? 0) - (e?.usage ?? 0))}\n${C.dim('(browser storage quota for this site, not your physical disk)')}`;
    }
    case 'cal': {
      const now = systemNow();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const head = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const lines = [head.padStart(10 + Math.floor(head.length / 2)), 'Su Mo Tu We Th Fr Sa'];
      let row = '   '.repeat(first.getDay());
      for (let d = 1; d <= days; d++) {
        const cell = String(d).padStart(2);
        row += (d === now.getDate() ? `\x1b[7m${cell}\x1b[0m` : cell) + ' ';
        if ((first.getDay() + d) % 7 === 0) {
          lines.push(row.trimEnd());
          row = '';
        }
      }
      if (row) lines.push(row.trimEnd());
      return lines.join('\n');
    }
    case 'say': {
      const text = rest.join(' ') || stdin || '';
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.volume = s.sound.muted ? 0 : s.sound.volume;
        speechSynthesis.speak(u);
      } catch {
        return C.err('say: speech synthesis unavailable');
      }
      return '';
    }
    case 'systeminfo':
    case 'neofetch':
    case 'fastfetch': {
      const art = ['   ▌      ▐   ', ' ~~█~~~~~~█~~ ', '   █ ‿‿‿‿ █   ', ' ══█══════█══ ', '   █      █   ', '  ▀▀▀    ▀▀▀  '];
      const info = [
        `${C.bold(`${s.user.accountName}@${s.computerName}`)}`,
        '─'.repeat(24),
        `${C.orange('OS')}: Golden Gate ${s.osVersion} (simulator)`,
        `${C.orange('Host')}: ${navigator.userAgent.match(/\(([^)]+)\)/)?.[1] ?? 'Unknown'}`,
        `${C.orange('Kernel')}: Browser JavaScript engine`,
        `${C.orange('Shell')}: gg-sh ${APP_VERSION}`,
        `${C.orange('Resolution')}: ${screen.width}x${screen.height} @${devicePixelRatio}x`,
        `${C.orange('CPU')}: ${navigator.hardwareConcurrency ?? '?'} logical cores (model hidden by browser)`,
        `${C.orange('Memory')}: ${(navigator as Navigator & { deviceMemory?: number }).deviceMemory ? `≈ ${(navigator as Navigator & { deviceMemory?: number }).deviceMemory} GB (browser estimate)` : 'unavailable'}`,
        `${C.orange('Windows')}: ${useWindows.getState().windows.length} open`,
      ];
      return info.map((l, i) => `${C.orange(art[i] ?? '              ')}  ${l}`).join('\n');
    }
    case 'sudo':
      return C.err('sudo: this simulator has no superuser. Nothing on your computer can be changed from here.');
    case 'curl':
    case 'wget':
    case 'ping':
    case 'ssh':
    case 'git':
    case 'npm':
    case 'python':
    case 'python3':
    case 'node':
    case 'java':
    case 'brew':
      return C.err(`zsh: ${cmd}: not available in the Golden Gate simulator (no real shell or network access)`);
    default:
      return C.err(`zsh: command not found: ${cmd}`);
  }
}

function isDescendantOf(id: string, ancestor: string) {
  let cur = nodes()[id];
  let g = 0;
  while (cur && g++ < 200) {
    if (cur.id === ancestor) return true;
    cur = cur.parentId ? nodes()[cur.parentId] : (undefined as never);
  }
  return false;
}

function longLine(n: { kind: string; name: string; size: number; modifiedAt: number; id: string }) {
  const d = new Date(n.modifiedAt);
  const size = n.kind === 'folder' ? folderSize(nodes(), n.id) : n.size;
  const date = `${d.toLocaleDateString('en-US', { month: 'short' })} ${String(d.getDate()).padStart(2)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const acct = useSettings.getState().user.accountName;
  return `${n.kind === 'folder' ? 'drwxr-xr-x' : '-rw-r--r--'}  1 ${acct}  staff  ${String(size).padStart(8)} ${date} ${n.kind === 'folder' ? C.dir(n.name) : n.name}`;
}

export const COMMANDS = ['help', 'man', 'clear', 'exit', 'echo', 'pwd', 'whoami', 'hostname', 'date', 'uname', 'sw_vers', 'uptime', 'history', 'env', 'export', 'which', 'cd', 'ls', 'mkdir', 'touch', 'cat', 'head', 'tail', 'wc', 'grep', 'rm', 'rmdir', 'mv', 'cp', 'open', 'apps', 'ps', 'top', 'kill', 'tree', 'find', 'du', 'df', 'cal', 'say', 'systeminfo', 'neofetch'];

export function complete(line: string, st: ShellState): { line: string; options: string[] } {
  const toks = tokenize(line);
  const endsWithSpace = /\s$/.test(line);
  if (toks.length <= 1 && !endsWithSpace) {
    const p = toks[0] ?? '';
    const opts = COMMANDS.filter((c) => c.startsWith(p));
    if (opts.length === 1) return { line: `${opts[0]} `, options: [] };
    return { line, options: opts };
  }
  const word = endsWithSpace ? '' : toks[toks.length - 1];
  const slash = word.lastIndexOf('/');
  const dirPart = slash >= 0 ? word.slice(0, slash + 1) : '';
  const base = slash >= 0 ? word.slice(slash + 1) : word;
  const dirId = dirPart ? resolvePath(nodes(), dirPart, st.cwd) : st.cwd;
  if (!dirId) return { line, options: [] };
  const kids = useFs.getState().children(dirId).filter((n) => n.name.startsWith(base));
  if (kids.length === 1) {
    const k = kids[0];
    const name = k.name.replace(/ /g, '\\ ') + (k.kind === 'folder' ? '/' : ' ');
    return { line: line.slice(0, line.length - word.length) + dirPart + name, options: [] };
  }
  let common = base;
  if (kids.length > 1) {
    const names = kids.map((k) => k.name);
    common = names.reduce((a, b) => {
      let i = 0;
      while (i < a.length && a[i] === b[i]) i++;
      return a.slice(0, i);
    });
  }
  const newLine = common.length > base.length ? line.slice(0, line.length - word.length) + dirPart + common.replace(/ /g, '\\ ') : line;
  return { line: newLine, options: kids.map((k) => (k.kind === 'folder' ? `${k.name}/` : k.name)) };
}
