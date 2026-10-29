import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Save, FolderOpen, FilePlus, Trash2 } from 'lucide-react';
import type { AppProps } from '../../types';
import { TitleBar, useCloseGuard, useMenus, useWindowTitle } from '../../shell/windowContext';
import { useFs, readText, DOCUMENTS } from '../../stores/fs';
import { useWindows } from '../../stores/windows';
import { SaveSheet, OpenSheet } from '../../components/FileDialogs';
import { isTextMime } from '../../lib/format';
import { confirmDialog } from '../../stores/system';
import { openApp } from '../../shell/actions';

const KEYWORDS = /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|from|export|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|public|private|protected|static|void|int|long|double|float|boolean|char|String|true|false|null|undefined|this|super|package|interface|implements|def|self|None|True|False|elif|lambda|yield|with|as|pass)\b/g;

function highlight(code: string): string {
  const esc = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // tokenise strings and comments first so keywords inside them aren't coloured
  return esc.replace(/(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g, (m, com, str, num, word) => {
    if (com) return `<span class="tk-c">${com}</span>`;
    if (str) return `<span class="tk-s">${str}</span>`;
    if (num) return `<span class="tk-n">${num}</span>`;
    if (word && KEYWORDS.test(word)) {
      KEYWORDS.lastIndex = 0;
      return `<span class="tk-k">${word}</span>`;
    }
    KEYWORDS.lastIndex = 0;
    return m;
  });
}

export default function Codepad({ win }: AppProps) {
  const [fileId, setFileId] = useState<string | null>((win.args?.fileId as string) ?? null);
  const node = useFs((s) => (fileId ? s.nodes[fileId] : undefined));
  const [code, setCode] = useState('// Write JavaScript and press Run (⌘R)\nconst bridge = { name: "Golden Gate", opened: 1937 };\nconsole.log(`${bridge.name} opened in ${bridge.opened}`);\n');
  const [saved, setSaved] = useState(code);
  const [out, setOut] = useState<{ kind: 'log' | 'error' | 'info'; text: string }[]>([]);
  const [sheet, setSheet] = useState<null | 'save' | 'open'>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const pre = useRef<HTMLPreElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const runFrame = useRef<HTMLIFrameElement | null>(null);
  const dirty = code !== saved;
  const lang = node?.name.split('.').pop()?.toLowerCase() ?? 'js';
  useWindowTitle(`${node?.name ?? 'untitled.js'}${dirty ? ' — Edited' : ''}`);
  useEffect(() => useWindows.getState().setDirty(win.id, dirty), [dirty, win.id]);
  useCloseGuard(dirty ? () => confirmDialog('Close without saving?', 'Your changes to this file will be lost.', 'Close') : null);

  useEffect(() => {
    if (!fileId) return;
    void readText(fileId).then((t) => {
      setCode(t);
      setSaved(t);
    });
  }, [fileId]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== runFrame.current?.contentWindow) return;
      const d = e.data as { gg?: boolean; kind: 'log' | 'error' | 'info'; text: string };
      if (d?.gg) setOut((o) => [...o, { kind: d.kind, text: d.text }].slice(-500));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const run = () => {
    setOut([{ kind: 'info', text: `▶ Running ${node?.name ?? 'untitled.js'} in a sandboxed frame…` }]);
    if (lang !== 'js' && lang !== 'mjs') {
      setOut((o) => [...o, { kind: 'error', text: `Only JavaScript can run in the browser. ${lang.toUpperCase()} files can be edited and saved.` }]);
      return;
    }
    runFrame.current?.remove();
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts');
    f.style.display = 'none';
    const userCode = code.replace(/<\/script/gi, '<\\/script');
    f.srcdoc = `<!doctype html><script>
      const __ggSend=(kind,args)=>parent.postMessage({gg:true,kind,text:args.map(a=>{try{return typeof a==='string'?a:JSON.stringify(a,null,1)}catch{return String(a)}}).join(' ')},'*');
      console.log=(...a)=>__ggSend('log',a);console.info=(...a)=>__ggSend('log',a);console.warn=(...a)=>__ggSend('log',a);console.error=(...a)=>__ggSend('error',a);
      window.onerror=(m,s,l)=>{__ggSend('error',[m+' (line '+l+')']);window.__failed=true;};
    <\/script><script>${userCode}\n<\/script><script>if(!window.__failed)__ggSend('info',['✓ Finished']);<\/script>`;
    document.body.appendChild(f);
    runFrame.current = f;
    setTimeout(() => f.remove(), 10000);
  };

  const save = async () => {
    if (!fileId) return setSheet('save');
    await useFs.getState().writeFile(fileId, code);
    setSaved(code);
  };

  useMenus(
    [
      { title: 'File', items: [{ label: 'New', shortcut: 'mod+n', action: () => openApp('codepad', undefined, { forceNew: true }) }, { label: 'Open…', shortcut: 'mod+o', action: () => setSheet('open') }, { label: 'Save', shortcut: 'mod+s', action: () => void save() }, { label: 'Save As…', shortcut: 'mod+shift+s', action: () => setSheet('save') }] },
      { title: 'Run', items: [{ label: 'Run', shortcut: 'mod+r', action: run }, { label: 'Clear Console', shortcut: 'mod+k', action: () => setOut([]) }] },
    ],
    [code, fileId, lang],
  );

  const lines = useMemo(() => code.split('\n').length, [code]);
  const html = useMemo(() => highlight(code) + '\n', [code]);
  const sync = () => {
    if (pre.current && ta.current) {
      pre.current.scrollTop = ta.current.scrollTop;
      pre.current.scrollLeft = ta.current.scrollLeft;
    }
    if (gutter.current && ta.current) gutter.current.scrollTop = ta.current.scrollTop;
  };

  return (
    <div className="flex flex-col h-full relative" style={{ background: '#1e1f24', color: '#d6d6dd' }}>
      <TitleBar className="!gap-2 codepad-tb" style={{ background: '#25262c', borderBottom: '1px solid #111' }}>
        <div className="ml-auto flex gap-2" data-no-drag>
          <div className="tb-group" style={{ background: '#33343b' }}>
            <button className="tb-btn" style={{ color: '#ddd' }} aria-label="New" onClick={() => openApp('codepad', undefined, { forceNew: true })}><FilePlus size={15} /></button>
            <button className="tb-btn" style={{ color: '#ddd' }} aria-label="Open" onClick={() => setSheet('open')}><FolderOpen size={15} /></button>
            <button className="tb-btn" style={{ color: '#ddd' }} aria-label="Save" onClick={() => void save()}><Save size={15} /></button>
          </div>
          <button className="btn primary" onClick={run}><Play size={13} fill="#fff" /> Run</button>
        </div>
      </TitleBar>
      <div className="flex-1 min-h-0 flex">
        <div ref={gutter} className="w-[46px] flex-none overflow-hidden text-right pr-2 pt-3 select-none" style={{ fontFamily: 'var(--mono)', fontSize: 13, lineHeight: '20px', color: '#5c5f6b', background: '#1b1c20' }}>
          {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        <div className="flex-1 min-w-0 relative">
          <pre ref={pre} aria-hidden="true" className="absolute inset-0 m-0 p-3 overflow-hidden whitespace-pre pointer-events-none" style={{ fontFamily: 'var(--mono)', fontSize: 13, lineHeight: '20px' }} dangerouslySetInnerHTML={{ __html: html }} />
          <textarea
            ref={ta}
            aria-label="Code editor"
            spellCheck={false}
            className="absolute inset-0 w-full h-full p-3 resize-none border-0 outline-none bg-transparent whitespace-pre overflow-auto selectable"
            style={{ fontFamily: 'var(--mono)', fontSize: 13, lineHeight: '20px', color: 'transparent', caretColor: '#fff', tabSize: 2 }}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onScroll={sync}
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                e.preventDefault();
                e.currentTarget.setRangeText('  ', e.currentTarget.selectionStart, e.currentTarget.selectionEnd, 'end');
                setCode(e.currentTarget.value);
              }
            }}
          />
        </div>
      </div>
      <div className="h-[150px] flex-none flex flex-col" style={{ borderTop: '1px solid #111', background: '#16171b' }}>
        <div className="h-[26px] flex items-center px-3 text-[11px] uppercase tracking-wide" style={{ color: '#888' }}>
          Console
          <button className="ml-auto border-0 bg-transparent p-0" style={{ color: '#888' }} aria-label="Clear console" onClick={() => setOut([])}><Trash2 size={12} /></button>
        </div>
        <div className="flex-1 scroll px-3 pb-2 selectable" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
          {out.length === 0 && <div style={{ color: '#666' }}>Output from console.log appears here. Code runs in an isolated sandbox with no access to your files.</div>}
          {out.map((o, i) => <div key={i} className="whitespace-pre-wrap" style={{ color: o.kind === 'error' ? '#ff6b60' : o.kind === 'info' ? '#7cb7ff' : '#d6d6dd' }}>{o.text}</div>)}
        </div>
      </div>
      {sheet === 'save' && <SaveSheet title="Save File" defaultName={node?.name ?? 'untitled.js'} defaultFolder={node?.parentId ?? DOCUMENTS} onCancel={() => setSheet(null)} onSave={async (f, n) => { const created = await useFs.getState().createFile(f, n, code, 'text/plain'); setFileId(created.id); setSaved(code); setSheet(null); }} />}
      {sheet === 'open' && <OpenSheet filter={(n) => isTextMime(n.mime)} onCancel={() => setSheet(null)} onOpen={(id) => { setSheet(null); setFileId(id); }} />}
      <style>{`.tk-k{color:#ff7ab2}.tk-s{color:#ff8170}.tk-n{color:#d9c97c}.tk-c{color:#7f8c98;font-style:italic} .codepad-tb .titlebar-title{color:#ddd}`}</style>
    </div>
  );
}
