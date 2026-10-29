import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { ChevronDown, ChevronRight, Download, FilePlus, Files, FolderOpen, FolderPlus, Globe, Play, Plus, Search, Settings2, Upload, X, AlertTriangle, CircleX, TerminalSquare, RefreshCw } from 'lucide-react';
import type { AppProps, FsNode } from '../../types';
import { TitleBar, useCloseGuard, useMenus, useWindow, useWindowTitle } from '../../shell/windowContext';
import { useFs, readText, HOME } from '../../stores/fs';
import { useSettings, resolvedTheme } from '../../stores/settings';
import { useSystem, confirmDialog, promptDialog, showDialog } from '../../stores/system';
import { isTextMime, mimeFromName } from '../../lib/format';
import { pt } from '../../lib/screen';
import { saveToHost } from '../../lib/download';
import { importFromComputer } from '../../lib/hostAccess';
import { openApp, openFile as openInSystem } from '../../shell/actions';
import { monaco, languageFor, emitJs } from './monaco';
import { TEMPLATES, type Template } from './templates';

type Panel = 'output' | 'problems';
type Side = 'explorer' | 'search';
interface LogLine {
  kind: 'log' | 'error' | 'info' | 'warn';
  text: string;
}
const ROOT_KEY = 'gg.code.root';
const RECENT_KEY = 'gg.code.recent';
const isText = (n: FsNode) => n.kind === 'file' && (isTextMime(n.mime) || languageFor(n.name) !== 'plaintext' || /\.(txt|md|gitignore|env)$/i.test(n.name) || n.size === 0);

/** Every file under a folder, with its path relative to that folder. */
function walk(nodes: Record<string, FsNode>, rootId: string): { node: FsNode; path: string }[] {
  const out: { node: FsNode; path: string }[] = [];
  const kids = (id: string) => Object.values(nodes).filter((n) => n.parentId === id && !n.trashed);
  const go = (id: string, prefix: string) => {
    for (const n of kids(id)) {
      if (n.kind === 'folder') go(n.id, `${prefix}${n.name}/`);
      else out.push({ node: n, path: `${prefix}${n.name}` });
    }
  };
  go(rootId, '');
  return out;
}

export default function CodeStudio({ win }: AppProps) {
  const nodes = useFs((s) => s.nodes);
  const theme = useSettings((s) => resolvedTheme(s.appearance));
  const { focused } = useWindow();
  const [rootId, setRootIdState] = useState<string | null>(() => {
    const id = (win.args?.folderId as string) ?? localStorage.getItem(ROOT_KEY);
    return id && useFs.getState().nodes[id] && !useFs.getState().nodes[id].trashed ? id : null;
  });
  const [tabs, setTabs] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [side, setSide] = useState<Side>('explorer');
  const [sideOpen, setSideOpen] = useState(true);
  const [panel, setPanel] = useState<Panel>('output');
  const [panelOpen, setPanelOpen] = useState(true);
  const [log, setLog] = useState<LogLine[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [problems, setProblems] = useState<{ file: string; id: string; line: number; col: number; msg: string; sev: number }[]>([]);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [quick, setQuick] = useState<string | null>(null);
  const [newProject, setNewProject] = useState(false);
  const [settings, setSettings] = useState(() => ({ minimap: true, wrap: false, fontSize: 13, ...(JSON.parse(localStorage.getItem('gg.code.settings') || '{}') as object) }));
  const [showSettings, setShowSettings] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const models = useRef(new Map<string, monaco.editor.ITextModel>());
  const savedVersion = useRef(new Map<string, number>());
  const viewStates = useRef(new Map<string, monaco.editor.ICodeEditorViewState | null>());
  const runFrame = useRef<HTMLIFrameElement | null>(null);

  const root = rootId ? nodes[rootId] : null;
  const activeNode = active ? nodes[active] : null;
  useWindowTitle(activeNode ? `${activeNode.name}${root ? ` — ${root.name}` : ''}` : root ? root.name : 'Code Studio');

  const setRootId = (id: string | null) => {
    setRootIdState(id);
    if (id) {
      localStorage.setItem(ROOT_KEY, id);
      const recent = [id, ...(JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as string[]).filter((x) => x !== id)].slice(0, 8);
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
      setOpen(new Set([id]));
    } else localStorage.removeItem(ROOT_KEY);
  };
  useEffect(() => {
    if (rootId) setOpen((o) => new Set([...o, rootId]));
  }, [rootId]);

  // ---------------------------------------------------------------- editor
  useEffect(() => {
    if (!host.current) return;
    const ed = monaco.editor.create(host.current, {
      model: null,
      theme: theme === 'dark' ? 'gg-dark' : 'gg-light',
      automaticLayout: true,
      fontFamily: "'SF Mono', Menlo, Consolas, 'Cascadia Code', monospace",
      fontSize: settings.fontSize,
      minimap: { enabled: settings.minimap },
      wordWrap: settings.wrap ? 'on' : 'off',
      smoothScrolling: true,
      cursorSmoothCaretAnimation: 'on',
      cursorBlinking: 'smooth',
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      tabSize: 2,
      padding: { top: 10 },
      renderLineHighlight: 'all',
      scrollBeyondLastLine: false,
      fixedOverflowWidgets: true,
    });
    editor.current = ed;
    const sub = ed.onDidChangeCursorPosition((e) => setCursor({ line: e.position.lineNumber, col: e.position.column }));
    return () => {
      sub.dispose();
      ed.dispose();
      models.current.forEach((m) => m.dispose());
      models.current.clear();
      runFrame.current?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => monaco.editor.setTheme(theme === 'dark' ? 'gg-dark' : 'gg-light'), [theme]);
  useEffect(() => {
    editor.current?.updateOptions({ minimap: { enabled: settings.minimap }, wordWrap: settings.wrap ? 'on' : 'off', fontSize: settings.fontSize });
    localStorage.setItem('gg.code.settings', JSON.stringify(settings));
  }, [settings]);

  // problems from every open model
  useEffect(() => {
    const update = () => {
      const list = monaco.editor.getModelMarkers({}).flatMap((m) => {
        const id = [...models.current.entries()].find(([, model]) => model.uri.toString() === m.resource.toString())?.[0];
        return id ? [{ id, file: useFs.getState().nodes[id]?.name ?? '', line: m.startLineNumber, col: m.startColumn, msg: m.message, sev: m.severity }] : [];
      });
      setProblems(list.filter((p) => p.sev >= monaco.MarkerSeverity.Warning));
    };
    const d = monaco.editor.onDidChangeMarkers(update);
    return () => d.dispose();
  }, []);

  const relPath = useCallback(
    (id: string) => {
      const parts: string[] = [];
      let n: FsNode | undefined = useFs.getState().nodes[id];
      while (n && n.id !== rootId) {
        parts.unshift(n.name);
        n = n.parentId ? useFs.getState().nodes[n.parentId] : undefined;
      }
      return parts.join('/');
    },
    [rootId],
  );

  const modelFor = async (id: string) => {
    let m = models.current.get(id);
    if (m && !m.isDisposed()) return m;
    const n = useFs.getState().nodes[id];
    const text = await readText(id);
    // a file:// URI per path lets TypeScript resolve imports between project files
    const uri = monaco.Uri.parse(`file:///${encodeURI(relPath(id) || n.name)}`);
    monaco.editor.getModel(uri)?.dispose();
    m = monaco.editor.createModel(text, languageFor(n.name), uri);
    models.current.set(id, m);
    savedVersion.current.set(id, m.getAlternativeVersionId());
    m.onDidChangeContent(() => {
      setDirty((d) => {
        const isDirty = m!.getAlternativeVersionId() !== savedVersion.current.get(id);
        if (isDirty === d.has(id)) return d;
        const next = new Set(d);
        if (isDirty) next.add(id);
        else next.delete(id);
        return next;
      });
    });
    return m;
  };

  const openFile = async (id: string, line?: number) => {
    const n = useFs.getState().nodes[id];
    if (!n || n.kind !== 'file') return;
    if (!isText(n)) return openInSystem(id); // images, PDFs… open in their own app
    const m = await modelFor(id);
    setTabs((t) => (t.includes(id) ? t : [...t, id]));
    const ed = editor.current!;
    if (active && active !== id) viewStates.current.set(active, ed.saveViewState());
    ed.setModel(m);
    const vs = viewStates.current.get(id);
    if (vs) ed.restoreViewState(vs);
    if (line) {
      ed.revealLineInCenter(line);
      ed.setPosition({ lineNumber: line, column: 1 });
    }
    ed.focus();
    setActive(id);
  };

  const closeTab = async (id: string) => {
    if (dirty.has(id)) {
      const r = await showDialog({ title: `Do you want to save the changes you made to “${nodes[id]?.name}”?`, message: 'Your changes will be lost if you don’t save them.', icon: 'warning', buttons: [{ label: 'Don’t Save', value: 'discard' }, { label: 'Cancel', value: 'cancel' }, { label: 'Save', value: 'save', primary: true }] });
      if (r.value === 'cancel') return;
      if (r.value === 'save') await save(id);
    }
    const i = tabs.indexOf(id);
    const rest = tabs.filter((t) => t !== id);
    setTabs(rest);
    models.current.get(id)?.dispose();
    models.current.delete(id);
    viewStates.current.delete(id);
    setDirty((d) => {
      const n = new Set(d);
      n.delete(id);
      return n;
    });
    if (active === id) {
      const next = rest[Math.min(i, rest.length - 1)];
      if (next) void openFile(next);
      else {
        editor.current?.setModel(null);
        setActive(null);
      }
    }
  };

  const save = async (id = active) => {
    if (!id) return;
    const m = models.current.get(id);
    if (!m) return;
    await useFs.getState().writeFile(id, m.getValue());
    savedVersion.current.set(id, m.getAlternativeVersionId());
    setDirty((d) => {
      const n = new Set(d);
      n.delete(id);
      return n;
    });
    if (preview) void runProject(true);
  };
  const saveAll = async () => {
    for (const id of dirty) await save(id);
  };

  useCloseGuard(dirty.size ? async () => confirmDialog('Close Code Studio with unsaved changes?', `${dirty.size} file(s) have unsaved changes.`, 'Close Anyway') : null);

  // ---------------------------------------------------------------- projects
  const projectsFolder = async () => {
    const fs = useFs.getState();
    const existing = Object.values(fs.nodes).find((n) => n.parentId === HOME && n.name === 'Projects' && n.kind === 'folder' && !n.trashed);
    return existing ?? (await fs.createFolder(HOME, 'Projects'));
  };
  const createProject = async (t: Template) => {
    const name = await promptDialog(`New ${t.name} Project`, 'Project name', t.id === 'web' ? 'my-web-app' : t.id === 'ts' ? 'typescript-playground' : t.id === 'js' ? 'javascript-playground' : 'my-project');
    if (!name) return;
    setNewProject(false);
    const parent = await projectsFolder();
    const fs = useFs.getState();
    const folder = await fs.createFolder(parent.id, name.trim() || 'my-project');
    let toOpen: string | null = null;
    for (const [file, content] of Object.entries(t.files)) {
      const f = await fs.createFile(folder.id, file, content, mimeFromName(file));
      if (file === t.open) toOpen = f.id;
    }
    await closeAll();
    setRootId(folder.id);
    if (toOpen) setTimeout(() => void openFile(toOpen!), 50);
  };
  const closeAll = async () => {
    if (dirty.size && !(await confirmDialog('Save changes before switching projects?', 'Unsaved changes will be saved first.', 'Save All'))) return;
    await saveAll();
    models.current.forEach((m) => m.dispose());
    models.current.clear();
    viewStates.current.clear();
    setTabs([]);
    setActive(null);
    editor.current?.setModel(null);
    setPreview(null);
  };
  const [folderPicker, setFolderPicker] = useState(false);
  const importProject = async () => {
    const parent = await projectsFolder();
    const added = await importFromComputer(parent.id);
    const folder = added.find((n) => n.kind === 'folder');
    if (folder) {
      await closeAll();
      setRootId(folder.id);
    }
  };
  const downloadZip = async () => {
    if (!root) return;
    await saveAll();
    const zip = new JSZip();
    for (const { node, path } of walk(useFs.getState().nodes, root.id)) {
      const data = await readText(node.id).catch(() => '');
      zip.file(`${root.name}/${path}`, data);
    }
    await saveToHost(await zip.generateAsync({ type: 'blob' }), `${root.name}.zip`);
  };

  // ---------------------------------------------------------------- explorer actions
  const newEntry = async (kind: 'file' | 'folder', parentId = rootId) => {
    if (!parentId) return;
    const name = await promptDialog(kind === 'file' ? 'New File' : 'New Folder', 'Name', kind === 'file' ? 'untitled.js' : 'src');
    if (!name?.trim()) return;
    const fs = useFs.getState();
    setOpen((o) => new Set([...o, parentId]));
    if (kind === 'folder') await fs.createFolder(parentId, name.trim());
    else {
      const f = await fs.createFile(parentId, name.trim(), '', mimeFromName(name.trim()));
      void openFile(f.id);
    }
  };
  const renameEntry = async (id: string) => {
    const n = nodes[id];
    const name = await promptDialog('Rename', 'New name', n.name);
    if (!name?.trim() || name === n.name) return;
    await useFs.getState().rename(id, name.trim());
    const m = models.current.get(id);
    if (m) monaco.editor.setModelLanguage(m, languageFor(name.trim()));
  };
  const deleteEntry = async (id: string) => {
    const n = nodes[id];
    if (!(await confirmDialog(`Move “${n.name}” to the Trash?`, 'You can restore it from the Trash in Finder.', 'Move to Trash'))) return;
    for (const t of tabs) {
      let p: FsNode | undefined = nodes[t];
      while (p) {
        if (p.id === id) {
          await closeTab(t);
          break;
        }
        p = p.parentId ? nodes[p.parentId] : undefined;
      }
    }
    await useFs.getState().trash([id]);
    if (id === rootId) setRootId(null);
  };
  const contextMenu = (e: React.MouseEvent, n: FsNode) => {
    e.preventDefault();
    e.stopPropagation();
    const p = pt(e);
    const folderId = n.kind === 'folder' ? n.id : n.parentId!;
    useSystem.getState().set({
      contextMenu: {
        x: p.x,
        y: p.y,
        items: [
          { label: 'New File…', action: () => void newEntry('file', folderId) },
          { label: 'New Folder…', action: () => void newEntry('folder', folderId) },
          { separator: true },
          ...(n.kind === 'file' ? [{ label: 'Open', action: () => void openFile(n.id) }] : []),
          { label: 'Rename…', action: () => void renameEntry(n.id) },
          { label: 'Reveal in Finder', action: () => openApp('finder', { folderId }, { forceNew: true }) },
          { separator: true },
          { label: 'Move to Trash', danger: true, action: () => void deleteEntry(n.id) },
        ],
      },
      activeMenu: null,
    });
  };

  // ---------------------------------------------------------------- run
  const print = (kind: LogLine['kind'], text: string) => setLog((l) => [...l.slice(-400), { kind, text }]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { ggCode?: boolean; kind: LogLine['kind']; text: string };
      if (d?.ggCode) print(d.kind, d.text);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  const CONSOLE_BRIDGE = `<script>(function(){const send=(kind,args)=>parent.postMessage({ggCode:true,kind,text:args.map(a=>{if(a instanceof Error)return a.stack||a.message;try{return typeof a==='string'?a:JSON.stringify(a,null,1)}catch{return String(a)}}).join(' ')},'*');for(const k of ['log','info','warn','error']){const o=console[k];console[k]=(...a)=>{send(k==='info'?'log':k,a);o.apply(console,a)}}window.addEventListener('error',e=>send('error',[e.message+(e.lineno?' (line '+e.lineno+')':'')]));window.addEventListener('unhandledrejection',e=>send('error',['Unhandled promise rejection: '+(e.reason&&e.reason.message||e.reason)]));})();<\/script>`;

  /** Read a project file by a path relative to `fromId`'s folder. */
  const fileAt = (path: string, fromFolder: string): FsNode | undefined => {
    const all = useFs.getState().nodes;
    const parts = path.replace(/^\.\//, '').split('/');
    let folder = path.startsWith('/') ? rootId! : fromFolder;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part || part === '.') continue;
      if (part === '..') {
        folder = all[folder]?.parentId ?? folder;
        continue;
      }
      const hit = Object.values(all).find((n) => n.parentId === folder && n.name === part && !n.trashed);
      if (!hit) return undefined;
      if (i === parts.length - 1) return hit;
      folder = hit.id;
    }
    return undefined;
  };
  const textOf = async (n: FsNode) => models.current.get(n.id)?.getValue() ?? (await readText(n.id));

  const runProject = async (quiet = false) => {
    const cur = active ? nodes[active] : null;
    const html = cur?.name.endsWith('.html') ? cur : rootId ? fileAt('index.html', rootId) : undefined;
    const script = cur && /\.(m?js|ts)$/.test(cur.name) ? cur : undefined;
    if (!quiet) setLog([]);
    if (html && (!script || cur === html)) {
      // inline the page's local stylesheets and scripts so it runs in a sandboxed preview
      let doc = await textOf(html);
      const dir = html.parentId!;
      const links = [...doc.matchAll(/<link\b[^>]*href=["']([^"':]+)["'][^>]*>/gi)];
      for (const m of links) {
        const f = /stylesheet/i.test(m[0]) ? fileAt(m[1], dir) : undefined;
        if (f) doc = doc.replace(m[0], `<style>/* ${m[1]} */\n${await textOf(f)}</style>`);
      }
      const scripts = [...doc.matchAll(/<script\b([^>]*)src=["']([^"':]+)["']([^>]*)><\/script>/gi)];
      for (const m of scripts) {
        const f = fileAt(m[2], dir);
        if (!f) continue;
        let code = await textOf(f);
        if (f.name.endsWith('.ts')) code = await emitJs(await modelFor(f.id));
        doc = doc.replace(m[0], `<script${m[1]}${m[3]}>${code.replace(/<\/script/gi, '<\\/script')}<\/script>`);
      }
      doc = doc.includes('<head>') ? doc.replace('<head>', `<head>${CONSOLE_BRIDGE}`) : CONSOLE_BRIDGE + doc;
      setPreview(doc);
      if (!quiet) print('info', `▶ Previewing ${relPath(html.id)}`);
      return;
    }
    if (!script) {
      print('error', 'Open a .js, .ts or .html file (or add an index.html) to run it.');
      setPanelOpen(true);
      setPanel('output');
      return;
    }
    let code = await textOf(script);
    if (script.name.endsWith('.ts')) {
      print('info', `⚙ Compiling ${script.name}…`);
      code = await emitJs(await modelFor(script.id));
    }
    print('info', `▶ node ${relPath(script.id)}`);
    setPanelOpen(true);
    setPanel('output');
    runFrame.current?.remove();
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts');
    f.style.display = 'none';
    f.srcdoc = `<!doctype html>${CONSOLE_BRIDGE}<script type="module">${code.replace(/<\/script/gi, '<\\/script')}\nparent.postMessage({ggCode:true,kind:'info',text:'✓ Done'},'*');<\/script>`;
    document.body.appendChild(f);
    runFrame.current = f;
  };

  // ---------------------------------------------------------------- search & quick open
  const files = useMemo(() => (root ? walk(nodes, root.id) : []), [nodes, root]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<{ id: string; path: string; line: number; text: string }[]>([]);
  useEffect(() => {
    if (side !== 'search' || query.trim().length < 2) {
      setHits([]);
      return;
    }
    let live = true;
    const t = setTimeout(async () => {
      const q = query.toLowerCase();
      const out: { id: string; path: string; line: number; text: string }[] = [];
      for (const { node, path } of files) {
        if (!isText(node)) continue;
        const text = await textOf(node);
        text.split('\n').forEach((l, i) => {
          if (out.length < 300 && l.toLowerCase().includes(q)) out.push({ id: node.id, path, line: i + 1, text: l.trim().slice(0, 140) });
        });
      }
      if (live) setHits(out);
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, side, files]);

  // ---------------------------------------------------------------- menus & keys
  useMenus(
    [
      {
        title: 'File',
        items: [
          { label: 'New Project…', shortcut: 'mod+shift+n', action: () => setNewProject(true) },
          { label: 'New File…', shortcut: 'mod+alt+n', disabled: !rootId, action: () => void newEntry('file') },
          { label: 'Open Folder…', shortcut: 'mod+o', action: () => setFolderPicker(true) },
          { label: 'Open Folder from Your Computer…', action: () => void importProject() },
          { separator: true },
          { label: 'Save', shortcut: 'mod+s', disabled: !active, action: () => void save() },
          { label: 'Save All', shortcut: 'mod+alt+s', disabled: !dirty.size, action: () => void saveAll() },
          { separator: true },
          { label: 'Download Project as ZIP', disabled: !rootId, action: () => void downloadZip() },
          { label: 'Close Editor', shortcut: 'mod+w', disabled: !active, action: () => active && void closeTab(active) },
          { label: 'Close Folder', disabled: !rootId, action: () => void closeAll().then(() => setRootId(null)) },
        ],
      },
      {
        title: 'View',
        items: [
          { label: 'Quick Open…', shortcut: 'mod+p', disabled: !rootId, action: () => setQuick('') },
          { label: 'Command Palette…', shortcut: 'mod+shift+p', action: () => editor.current?.trigger('menu', 'editor.action.quickCommand', null) },
          { separator: true },
          { label: 'Explorer', shortcut: 'mod+shift+e', action: () => (setSide('explorer'), setSideOpen(true)) },
          { label: 'Search', shortcut: 'mod+shift+f', action: () => (setSide('search'), setSideOpen(true)) },
          { label: sideOpen ? 'Hide Sidebar' : 'Show Sidebar', shortcut: 'mod+b', action: () => setSideOpen(!sideOpen) },
          { label: panelOpen ? 'Hide Panel' : 'Show Panel', shortcut: 'mod+j', action: () => setPanelOpen(!panelOpen) },
          { separator: true },
          { label: settings.minimap ? 'Hide Minimap' : 'Show Minimap', action: () => setSettings((s) => ({ ...s, minimap: !s.minimap })) },
          { label: settings.wrap ? 'Disable Word Wrap' : 'Enable Word Wrap', shortcut: 'alt+z', action: () => setSettings((s) => ({ ...s, wrap: !s.wrap })) },
          { label: 'Zoom In', shortcut: 'mod+=', action: () => setSettings((s) => ({ ...s, fontSize: Math.min(28, s.fontSize + 1) })) },
          { label: 'Zoom Out', shortcut: 'mod+-', action: () => setSettings((s) => ({ ...s, fontSize: Math.max(9, s.fontSize - 1) })) },
        ],
      },
      {
        title: 'Run',
        items: [
          { label: 'Run', shortcut: 'mod+r', action: () => void runProject() },
          { label: 'Run (F5)', shortcut: 'f5', action: () => void runProject() },
          { label: 'Close Preview', disabled: !preview, action: () => setPreview(null) },
          { label: 'Clear Output', action: () => setLog([]) },
        ],
      },
    ],
    [active, rootId, dirty, sideOpen, panelOpen, settings, preview, tabs, nodes],
  );

  // Ctrl+Tab cycles editor tabs while the window is focused
  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && quick !== null) setQuick(null);
      if (e.ctrlKey && e.key === 'Tab' && tabs.length > 1) {
        e.preventDefault();
        e.stopPropagation();
        const i = tabs.indexOf(active ?? '');
        void openFile(tabs[(i + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length]);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // ---------------------------------------------------------------- render
  const dark = theme === 'dark';
  const c = dark
    ? { bg: '#1f1f1f', side: '#181818', bar: '#181818', tab: '#181818', tabOn: '#1f1f1f', border: '#2b2b2b', text: '#cccccc', dim: '#9d9d9d', hover: '#2a2d2e', sel: '#04395e', status: '#0078d4' }
    : { bg: '#ffffff', side: '#f8f8f8', bar: '#f8f8f8', tab: '#ececec', tabOn: '#ffffff', border: '#e5e5e5', text: '#3b3b3b', dim: '#6e6e6e', hover: '#e8e8e8', sel: '#cce4f7', status: '#0078d4' };

  const Tree = ({ id, depth }: { id: string; depth: number }) => {
    const kids = Object.values(nodes)
      .filter((n) => n.parentId === id && !n.trashed)
      .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1));
    return (
      <>
        {kids.map((n) => {
          const isOpen = open.has(n.id);
          return (
            <div key={n.id}>
              <div
                className="flex items-center gap-1 h-[22px] cursor-default truncate text-[13px]"
                style={{ paddingLeft: 8 + depth * 12, background: n.id === active ? c.sel : undefined }}
                onMouseEnter={(e) => n.id !== active && (e.currentTarget.style.background = c.hover)}
                onMouseLeave={(e) => n.id !== active && (e.currentTarget.style.background = '')}
                onClick={() => (n.kind === 'folder' ? setOpen((o) => { const x = new Set(o); if (x.has(n.id)) x.delete(n.id); else x.add(n.id); return x; }) : void openFile(n.id))}
                onContextMenu={(e) => contextMenu(e, n)}
              >
                {n.kind === 'folder' ? isOpen ? <ChevronDown size={14} className="flex-none" /> : <ChevronRight size={14} className="flex-none" /> : <span className="w-[14px] flex-none" />}
                <FileGlyph name={n.name} folder={n.kind === 'folder'} />
                <span className="truncate">{n.name}</span>
                {dirty.has(n.id) && <span className="ml-auto mr-2 w-2 h-2 rounded-full flex-none" style={{ background: c.dim }} />}
              </div>
              {n.kind === 'folder' && isOpen && <Tree id={n.id} depth={depth + 1} />}
            </div>
          );
        })}
      </>
    );
  };

  const recent = (JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as string[]).filter((id) => nodes[id] && !nodes[id].trashed);
  const errors = problems.filter((p) => p.sev === monaco.MarkerSeverity.Error).length;
  const warnings = problems.length - errors;

  return (
    <div className="flex flex-col h-full relative" style={{ background: c.bg, color: c.text }} data-own-keys>
      <TitleBar showTitle className="!gap-2" height={36} style={{ background: c.bar, borderBottom: `1px solid ${c.border}` }} title={<span style={{ color: c.text, fontWeight: 500, fontSize: 12.5 }}>{activeNode ? `${activeNode.name} — ` : ''}{root?.name ?? 'Code Studio'}</span>}>
        <div className="ml-auto flex items-center gap-1" data-no-drag>
          <button className="tb-btn" style={{ color: c.text }} aria-label="Run" title="Run (⌘R / F5)" onClick={() => void runProject()}><Play size={14} fill="currentColor" /></button>
          <button className="tb-btn" style={{ color: c.text }} aria-label="Toggle panel" title="Panel (⌘J)" onClick={() => setPanelOpen(!panelOpen)}><TerminalSquare size={15} /></button>
        </div>
      </TitleBar>
      <div className="flex-1 min-h-0 flex">
        {/* activity bar */}
        <div className="w-[46px] flex-none flex flex-col items-center pt-1 gap-1" style={{ background: c.side, borderRight: `1px solid ${c.border}` }}>
          {([['explorer', Files, 'Explorer (⇧⌘E)'], ['search', Search, 'Search (⇧⌘F)']] as const).map(([k, Icon, label]) => (
            <button key={k} aria-label={label} title={label} className="w-[46px] h-[44px] grid place-items-center border-0 bg-transparent" style={{ color: side === k && sideOpen ? c.text : c.dim, boxShadow: side === k && sideOpen ? `inset 2px 0 0 ${c.status}` : undefined }} onClick={() => (side === k && sideOpen ? setSideOpen(false) : (setSide(k), setSideOpen(true)))}>
              <Icon size={22} strokeWidth={1.5} />
            </button>
          ))}
          <button aria-label="Run and preview" title="Run (F5)" className="w-[46px] h-[44px] grid place-items-center border-0 bg-transparent" style={{ color: preview ? c.text : c.dim }} onClick={() => void runProject()}><Play size={21} strokeWidth={1.5} /></button>
          <div className="flex-1" />
          <button aria-label="Settings" title="Settings" className="w-[46px] h-[44px] grid place-items-center border-0 bg-transparent mb-1" style={{ color: c.dim }} onClick={() => setShowSettings(!showSettings)}><Settings2 size={21} strokeWidth={1.5} /></button>
        </div>

        {/* side bar */}
        {sideOpen && (
          <div className="w-[240px] flex-none flex flex-col min-h-0" style={{ background: c.side, borderRight: `1px solid ${c.border}` }}>
            <div className="h-[35px] flex items-center px-4 text-[11px] tracking-wide flex-none" style={{ color: c.dim }}>{side === 'explorer' ? 'EXPLORER' : 'SEARCH'}</div>
            {side === 'explorer' ? (
              root ? (
                <>
                  <div className="flex items-center h-[22px] px-1 text-[11px] font-bold uppercase flex-none group" style={{ color: c.text }}>
                    <ChevronDown size={14} />
                    <span className="truncate flex-1">{root.name}</span>
                    <span className="flex gap-[2px]">
                      <IconBtn label="New File" onClick={() => void newEntry('file')}><FilePlus size={14} /></IconBtn>
                      <IconBtn label="New Folder" onClick={() => void newEntry('folder')}><FolderPlus size={14} /></IconBtn>
                      <IconBtn label="Download as ZIP" onClick={() => void downloadZip()}><Download size={14} /></IconBtn>
                    </span>
                  </div>
                  <div className="flex-1 overflow-auto pb-4" onContextMenu={(e) => root && contextMenu(e, root)}>
                    <Tree id={root.id} depth={0} />
                    {files.length === 0 && <div className="text-[12px] px-4 py-2" style={{ color: c.dim }}>This folder is empty. Right-click to add a file.</div>}
                  </div>
                </>
              ) : (
                <div className="px-4 text-[12.5px] flex flex-col gap-2" style={{ color: c.dim }}>
                  <div>You have not yet opened a folder.</div>
                  <button className="h-[28px] rounded-[2px] border-0 text-white text-[13px]" style={{ background: c.status }} onClick={() => setFolderPicker(true)}>Open Folder</button>
                  <button className="h-[28px] rounded-[2px] border-0 text-white text-[13px]" style={{ background: c.status }} onClick={() => setNewProject(true)}>New Project</button>
                </div>
              )
            ) : (
              <div className="flex flex-col min-h-0 flex-1">
                <div className="px-3 pb-2">
                  <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search in project" className="w-full h-[26px] px-2 text-[13px] outline-none" style={{ background: dark ? '#313131' : '#fff', color: c.text, border: `1px solid ${dark ? '#3c3c3c' : '#cecece'}`, borderRadius: 2 }} />
                </div>
                <div className="flex-1 overflow-auto text-[12.5px]">
                  {query.trim().length >= 2 && <div className="px-3 pb-1 text-[11.5px]" style={{ color: c.dim }}>{hits.length} result{hits.length === 1 ? '' : 's'}</div>}
                  {hits.map((h, i) => (
                    <div key={i} className="px-3 py-[2px] cursor-default truncate" onMouseEnter={(e) => (e.currentTarget.style.background = c.hover)} onMouseLeave={(e) => (e.currentTarget.style.background = '')} onClick={() => void openFile(h.id, h.line)}>
                      <span style={{ color: c.dim }}>{h.path}:{h.line}</span> {h.text}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* editor + preview + panel */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 min-w-0 flex flex-col">
              {tabs.length > 0 && (
                <div className="h-[35px] flex flex-none overflow-x-auto" style={{ background: c.tab, borderBottom: `1px solid ${c.border}` }}>
                  {tabs.map((id) => {
                    const n = nodes[id];
                    if (!n) return null;
                    const on = id === active;
                    return (
                      <div key={id} className="group h-full flex items-center gap-2 pl-3 pr-2 text-[13px] cursor-default flex-none" style={{ background: on ? c.tabOn : 'transparent', color: on ? c.text : c.dim, borderRight: `1px solid ${c.border}`, boxShadow: on ? `inset 0 1px 0 ${c.status}` : undefined }} onClick={() => void openFile(id)} onAuxClick={(e) => e.button === 1 && void closeTab(id)}>
                        <FileGlyph name={n.name} />
                        <span className="truncate max-w-[180px]">{n.name}</span>
                        <button className={`w-[20px] h-[20px] grid place-items-center rounded border-0 bg-transparent ${dirty.has(id) ? '' : 'opacity-0 group-hover:opacity-100'}`} style={{ color: c.text }} aria-label={`Close ${n.name}`} onClick={(e) => { e.stopPropagation(); void closeTab(id); }}>
                          {dirty.has(id) ? <span className="w-2 h-2 rounded-full group-hover:hidden" style={{ background: c.text }} /> : null}
                          <X size={14} className={dirty.has(id) ? 'hidden group-hover:block' : ''} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {activeNode && root && <div className="h-[22px] flex items-center px-4 text-[12px] flex-none" style={{ color: c.dim }}>{relPath(activeNode.id).split('/').join(' › ')}</div>}
              <div className="flex-1 min-h-0 relative">
                <div ref={host} className="absolute inset-0" style={{ visibility: active ? 'visible' : 'hidden' }} />
                {!active && (
                  <Welcome
                    c={c}
                    recent={recent.map((id) => nodes[id])}
                    onNew={() => setNewProject(true)}
                    onOpen={() => setFolderPicker(true)}
                    onImport={() => void importProject()}
                    onRecent={(id) => void closeAll().then(() => setRootId(id))}
                  />
                )}
              </div>
            </div>
            {preview !== null && (
              <div className="w-[42%] min-w-[260px] flex-none flex flex-col" style={{ borderLeft: `1px solid ${c.border}` }}>
                <div className="h-[35px] flex items-center gap-2 px-3 text-[12.5px] flex-none" style={{ background: c.tab, borderBottom: `1px solid ${c.border}` }}>
                  <Globe size={14} /> Preview
                  <span className="ml-auto flex gap-1">
                    <IconBtn label="Reload preview" onClick={() => void runProject(true)}><RefreshCw size={13} /></IconBtn>
                    <IconBtn label="Close preview" onClick={() => setPreview(null)}><X size={14} /></IconBtn>
                  </span>
                </div>
                <iframe title="Preview" className="flex-1 border-0 bg-white" sandbox="allow-scripts allow-modals allow-forms" srcDoc={preview} />
              </div>
            )}
          </div>
          {panelOpen && (
            <div className="h-[30%] min-h-[110px] flex-none flex flex-col" style={{ borderTop: `1px solid ${c.border}`, background: c.bg }}>
              <div className="h-[35px] flex items-center gap-4 px-4 text-[11px] tracking-wide flex-none">
                {(['problems', 'output'] as const).map((p) => (
                  <button key={p} className="h-full border-0 bg-transparent uppercase" style={{ color: panel === p ? c.text : c.dim, boxShadow: panel === p ? `inset 0 -1px 0 ${c.text}` : undefined }} onClick={() => setPanel(p)}>
                    {p}{p === 'problems' && problems.length ? <span className="ml-1 px-[6px] rounded-full text-[10px]" style={{ background: dark ? '#616161' : '#c4c4c4' }}>{problems.length}</span> : null}
                  </button>
                ))}
                <span className="ml-auto flex gap-1">
                  <IconBtn label="Clear output" onClick={() => setLog([])}><CircleX size={14} /></IconBtn>
                  <IconBtn label="Close panel" onClick={() => setPanelOpen(false)}><X size={14} /></IconBtn>
                </span>
              </div>
              <div className="flex-1 overflow-auto px-4 pb-2 text-[12.5px] selectable" style={{ fontFamily: "'SF Mono', Menlo, Consolas, monospace" }}>
                {panel === 'output' ? (
                  log.length ? log.map((l, i) => <div key={i} className="whitespace-pre-wrap" style={{ color: l.kind === 'error' ? '#f14c4c' : l.kind === 'warn' ? '#cca700' : l.kind === 'info' ? (dark ? '#3794ff' : '#0066b8') : c.text }}>{l.text}</div>) : <div style={{ color: c.dim }}>Run a file (⌘R or F5) to see its output here. JavaScript and TypeScript run in a sandbox; HTML opens in the preview.</div>
                ) : problems.length ? (
                  problems.map((p, i) => (
                    <div key={i} className="flex gap-2 items-start cursor-default py-[1px]" onClick={() => void openFile(p.id, p.line)}>
                      {p.sev === monaco.MarkerSeverity.Error ? <CircleX size={14} className="flex-none mt-[2px]" color="#f14c4c" /> : <AlertTriangle size={14} className="flex-none mt-[2px]" color="#cca700" />}
                      <span>{p.msg} <span style={{ color: c.dim }}>{p.file} [{p.line}, {p.col}]</span></span>
                    </div>
                  ))
                ) : (
                  <div style={{ color: c.dim }}>No problems have been detected in the open files.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {/* status bar */}
      <div className="h-[22px] flex items-center gap-3 px-2 text-[12px] text-white flex-none" style={{ background: root ? c.status : '#68217a' }}>
        <span className="flex items-center gap-1"><FolderOpen size={12} /> {root?.name ?? 'No folder'}</span>
        <button className="flex items-center gap-2 border-0 bg-transparent text-white text-[12px] p-0" onClick={() => (setPanel('problems'), setPanelOpen(true))}><CircleX size={12} /> {errors} <AlertTriangle size={12} /> {warnings}</button>
        <span className="ml-auto">{active ? `Ln ${cursor.line}, Col ${cursor.col}` : ''}</span>
        <span>Spaces: 2</span>
        <span>UTF-8</span>
        {activeNode && <span>{langLabel(languageFor(activeNode.name))}</span>}
      </div>

      {quick !== null && (
        <div className="absolute inset-0 z-30" onClick={() => setQuick(null)}>
          <div className="absolute left-1/2 -translate-x-1/2 top-[42px] w-[min(560px,90%)] rounded-[6px] p-1 shadow-2xl" style={{ background: dark ? '#252526' : '#fff', border: `1px solid ${c.border}` }} onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              placeholder="Search files by name"
              aria-label="Quick open"
              className="w-full h-[28px] px-2 text-[13px] outline-none"
              style={{ background: dark ? '#313131' : '#f3f3f3', color: c.text, border: `1px solid ${c.status}`, borderRadius: 2 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const f = files.find(({ path }) => fuzzy(path, quick));
                  if (f) void openFile(f.node.id);
                  setQuick(null);
                }
              }}
            />
            <div className="max-h-[320px] overflow-auto mt-1">
              {files.filter(({ path }) => fuzzy(path, quick)).slice(0, 40).map(({ node, path }) => (
                <div key={node.id} className="flex items-center gap-2 px-2 h-[24px] text-[13px] cursor-default rounded-[3px]" onMouseEnter={(e) => (e.currentTarget.style.background = c.hover)} onMouseLeave={(e) => (e.currentTarget.style.background = '')} onClick={() => { void openFile(node.id); setQuick(null); }}>
                  <FileGlyph name={node.name} /> {node.name} <span className="truncate" style={{ color: c.dim }}>{path}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {newProject && (
        <Overlay c={c} title="New Project" onClose={() => setNewProject(false)}>
          <div className="grid grid-cols-2 gap-3">
            {TEMPLATES.map((t) => (
              <button key={t.id} className="text-left p-3 rounded-[6px] border-0" style={{ background: dark ? '#2d2d2d' : '#f3f3f3', color: c.text }} onClick={() => void createProject(t)}>
                <div className="font-semibold text-[13.5px]">{t.name}</div>
                <div className="text-[12px] mt-1" style={{ color: c.dim }}>{t.description}</div>
              </button>
            ))}
          </div>
          <div className="text-[11.5px] mt-3" style={{ color: c.dim }}>Projects are created in your Home ▸ Projects folder.</div>
        </Overlay>
      )}

      {folderPicker && (
        <Overlay c={c} title="Open Folder" onClose={() => setFolderPicker(false)}>
          <FolderList c={c} nodes={nodes} onPick={(id) => { setFolderPicker(false); void closeAll().then(() => setRootId(id)); }} />
          <button className="mt-3 flex items-center gap-2 h-[28px] px-3 rounded-[2px] border-0 text-white text-[13px]" style={{ background: c.status }} onClick={() => { setFolderPicker(false); void importProject(); }}><Upload size={13} /> Open a Folder from Your Computer…</button>
        </Overlay>
      )}

      {showSettings && (
        <Overlay c={c} title="Settings" onClose={() => setShowSettings(false)}>
          <div className="flex flex-col gap-3 text-[13px]">
            <label className="flex items-center justify-between">Font size
              <input type="number" min={9} max={28} value={settings.fontSize} onChange={(e) => setSettings((s) => ({ ...s, fontSize: Number(e.target.value) || 13 }))} className="w-[64px] h-[24px] px-2" style={{ background: dark ? '#313131' : '#fff', color: c.text, border: `1px solid ${c.border}` }} />
            </label>
            <label className="flex items-center justify-between">Minimap <input type="checkbox" checked={settings.minimap} onChange={(e) => setSettings((s) => ({ ...s, minimap: e.target.checked }))} /></label>
            <label className="flex items-center justify-between">Word wrap <input type="checkbox" checked={settings.wrap} onChange={(e) => setSettings((s) => ({ ...s, wrap: e.target.checked }))} /></label>
            <div className="text-[11.5px]" style={{ color: c.dim }}>The colour theme follows System Settings ▸ Appearance.</div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

const fuzzy = (path: string, q: string) => {
  const s = path.toLowerCase();
  let i = 0;
  for (const ch of q.toLowerCase()) {
    i = s.indexOf(ch, i);
    if (i < 0) return false;
    i++;
  }
  return true;
};

const LANG_LABEL: Record<string, string> = { javascript: 'JavaScript', typescript: 'TypeScript', html: 'HTML', css: 'CSS', json: 'JSON', markdown: 'Markdown', python: 'Python', plaintext: 'Plain Text' };
const langLabel = (l: string) => LANG_LABEL[l] ?? l[0].toUpperCase() + l.slice(1);

const GLYPH: Record<string, [string, string]> = { js: ['JS', '#cbcb41'], mjs: ['JS', '#cbcb41'], jsx: ['JS', '#519aba'], ts: ['TS', '#3178c6'], tsx: ['TS', '#519aba'], html: ['<>', '#e37933'], css: ['#', '#519aba'], json: ['{}', '#cbcb41'], md: ['M↓', '#519aba'], py: ['py', '#4b8bbe'], java: ['J', '#cc3e44'] };
function FileGlyph({ name, folder }: { name: string; folder?: boolean }) {
  if (folder) return <span className="w-[16px] text-center text-[11px] flex-none" style={{ color: '#dcb67a' }}>▰</span>;
  const g = GLYPH[name.split('.').pop()?.toLowerCase() ?? ''];
  return <span className="w-[16px] text-center text-[9.5px] font-bold flex-none" style={{ color: g?.[1] ?? '#8a8a8a' }}>{g?.[0] ?? '≡'}</span>;
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button aria-label={label} title={label} className="w-[22px] h-[22px] grid place-items-center rounded-[4px] border-0 bg-transparent opacity-80 hover:opacity-100" style={{ color: 'inherit' }} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      {children}
    </button>
  );
}

type Colors = { bg: string; side: string; text: string; dim: string; border: string; hover: string; status: string };

function Overlay({ c, title, onClose, children }: { c: Colors; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center" style={{ background: 'rgba(0,0,0,.35)' }} onClick={onClose}>
      <div className="w-[min(520px,90%)] rounded-[8px] p-4 shadow-2xl anim-pop" style={{ background: c.side, color: c.text, border: `1px solid ${c.border}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center mb-3">
          <div className="font-semibold text-[14px]">{title}</div>
          <button aria-label="Close" className="ml-auto border-0 bg-transparent" style={{ color: c.dim }} onClick={onClose}><X size={15} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FolderList({ c, nodes, onPick }: { c: Colors; nodes: Record<string, FsNode>; onPick: (id: string) => void }) {
  const [at, setAt] = useState(HOME);
  const folders = Object.values(nodes).filter((n) => n.parentId === at && n.kind === 'folder' && !n.trashed).sort((a, b) => a.name.localeCompare(b.name));
  const here = nodes[at];
  return (
    <div>
      <div className="flex items-center gap-2 text-[12.5px] mb-2" style={{ color: c.dim }}>
        {here?.parentId && <button className="border-0 bg-transparent p-0" style={{ color: c.status }} onClick={() => setAt(here.parentId!)}>‹ Back</button>}
        <span className="truncate">{here?.name ?? 'Home'}</span>
        <button className="ml-auto h-[24px] px-3 rounded-[2px] border-0 text-white text-[12px]" style={{ background: c.status }} onClick={() => onPick(at)}>Open “{here?.name ?? 'Home'}”</button>
      </div>
      <div className="max-h-[260px] overflow-auto rounded-[4px]" style={{ border: `1px solid ${c.border}` }}>
        {folders.length === 0 && <div className="p-3 text-[12px]" style={{ color: c.dim }}>No folders here.</div>}
        {folders.map((f) => (
          <div key={f.id} className="flex items-center gap-2 px-3 h-[26px] text-[13px] cursor-default" onMouseEnter={(e) => (e.currentTarget.style.background = c.hover)} onMouseLeave={(e) => (e.currentTarget.style.background = '')} onClick={() => setAt(f.id)} onDoubleClick={() => onPick(f.id)}>
            <FileGlyph name={f.name} folder /> {f.name}
          </div>
        ))}
      </div>
    </div>
  );
}

function Welcome({ c, recent, onNew, onOpen, onImport, onRecent }: { c: Colors; recent: FsNode[]; onNew: () => void; onOpen: () => void; onImport: () => void; onRecent: (id: string) => void }) {
  const link = (label: string, icon: React.ReactNode, fn: () => void) => (
    <button className="flex items-center gap-2 border-0 bg-transparent p-0 text-[13.5px]" style={{ color: c.status === '#0078d4' ? '#3794ff' : c.status }} onClick={fn}>{icon} {label}</button>
  );
  return (
    <div className="absolute inset-0 overflow-auto">
      <div className="max-w-[720px] mx-auto pt-[9%] px-10">
        <div className="text-[34px] font-light">Code Studio</div>
        <div className="text-[15px] mb-10" style={{ color: c.dim }}>Editing evolved — inside Golden Gate</div>
        <div className="grid grid-cols-2 gap-10">
          <div>
            <div className="text-[16px] mb-3">Start</div>
            <div className="flex flex-col gap-2">
              {link('New Project…', <Plus size={15} />, onNew)}
              {link('Open Folder…', <FolderOpen size={15} />, onOpen)}
              {link('Open a Folder from Your Computer…', <Upload size={15} />, onImport)}
            </div>
            <div className="text-[16px] mt-8 mb-3">Recent</div>
            <div className="flex flex-col gap-1">
              {recent.length === 0 && <div className="text-[13px]" style={{ color: c.dim }}>No recent folders.</div>}
              {recent.map((n) => link(n.name, <FolderOpen size={14} />, () => onRecent(n.id)))}
            </div>
          </div>
          <div className="text-[13px] leading-relaxed" style={{ color: c.dim }}>
            <div className="text-[16px] mb-3" style={{ color: c.text }}>Walkthrough</div>
            <p>Powered by Monaco, the editor that runs inside VS Code: IntelliSense, live TypeScript errors, multi-cursor, Find &amp; Replace and the command palette (F1).</p>
            <p className="mt-2"><b>⌘P</b> quick open · <b>⇧⌘F</b> search · <b>⌘B</b> sidebar · <b>⌘J</b> panel · <b>⌘R</b> / <b>F5</b> run</p>
            <p className="mt-2">Web projects open in a live preview that reloads when you save. JavaScript and TypeScript run in a sandbox with output below.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
