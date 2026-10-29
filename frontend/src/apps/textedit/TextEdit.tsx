import { useEffect, useRef, useState } from 'react';
import { Bold, AlignLeft, AlignCenter, AlignRight, AlignJustify, Minus, Plus } from 'lucide-react';
import type { AppProps } from '../../types';
import { TitleBar, useCloseGuard, useMenus, useWindowTitle } from '../../shell/windowContext';
import { useFs, readText, DOCUMENTS } from '../../stores/fs';
import { useWindows } from '../../stores/windows';
import { useApps } from '../../stores/apps';
import { SaveSheet, OpenSheet, ConfirmSheet } from '../../components/FileDialogs';
import { isTextMime } from '../../lib/format';
import { saveToHost } from '../../lib/download';
import { replaceInTextarea } from '../../lib/textReplace';
import { openApp } from '../../shell/actions';
import { Popup } from '../../components/ui';

const FONTS = [
  { value: 'var(--font)', label: 'System' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Georgia' },
  { value: '"Times New Roman", Times, serif', label: 'Times New Roman' },
  { value: 'Helvetica, Arial, sans-serif', label: 'Helvetica / Arial' },
  { value: 'var(--mono)', label: 'Monospace' },
];

export default function TextEdit({ win }: AppProps) {
  const [fileId, setFileId] = useState<string | null>((win.args?.fileId as string) ?? null);
  const node = useFs((s) => (fileId ? s.nodes[fileId] : undefined));
  const [text, setText] = useState('');
  const [saved, setSaved] = useState('');
  const [loaded, setLoaded] = useState(!win.args?.fileId);
  const [sheet, setSheet] = useState<null | 'save' | 'saveas' | 'open' | 'close'>(null);
  const [font, setFont] = useState(FONTS[0].value);
  const [size, setSize] = useState(14);
  const [align, setAlign] = useState<'left' | 'center' | 'right' | 'justify'>('left');
  const [bold, setBold] = useState(false);
  const [wrap, setWrap] = useState(true);
  const ta = useRef<HTMLTextAreaElement>(null);
  const closeResolver = useRef<((ok: boolean) => void) | null>(null);
  const dirty = text !== saved;

  useEffect(() => {
    if (!fileId) return;
    void readText(fileId).then((t) => {
      setText(t);
      setSaved(t);
      setLoaded(true);
      useApps.getState().addRecentDoc(fileId);
    });
  }, [fileId]);

  useEffect(() => {
    useWindows.getState().setDirty(win.id, dirty);
  }, [dirty, win.id]);

  useWindowTitle(`${node?.name ?? 'Untitled'}${dirty ? ' — Edited' : ''}`);

  useCloseGuard(
    dirty
      ? () =>
          new Promise<boolean>((resolve) => {
            closeResolver.current = resolve;
            setSheet('close');
          })
      : null,
  );

  const save = async (): Promise<boolean> => {
    if (!fileId) {
      setSheet('save');
      return false;
    }
    await useFs.getState().writeFile(fileId, text);
    setSaved(text);
    return true;
  };

  const doSaveAs = async (folder: string, name: string) => {
    const n = await useFs.getState().createFile(folder, name, text, name.endsWith('.md') ? 'text/markdown' : 'text/plain');
    setFileId(n.id);
    setSaved(text);
    setSheet(null);
    if (closeResolver.current) {
      closeResolver.current(true);
      closeResolver.current = null;
    }
  };

  useMenus(
    [
      {
        title: 'File',
        items: [
          { label: 'New', shortcut: 'mod+n', action: () => openApp('textedit', undefined, { forceNew: true }) },
          { label: 'Open…', shortcut: 'mod+o', action: () => setSheet('open') },
          { separator: true },
          { label: 'Save', shortcut: 'mod+s', action: () => void save() },
          { label: 'Save As…', shortcut: 'mod+shift+s', action: () => setSheet('saveas') },
          { label: 'Rename…', disabled: !fileId, action: () => setSheet('saveas') },
          { label: 'Revert to Saved', disabled: !dirty || !fileId, action: () => setText(saved) },
          { separator: true },
          { label: 'Export as Plain Text (.txt)…', action: () => void saveToHost(new Blob([text], { type: 'text/plain' }), (node?.name ?? 'Untitled').replace(/\.[^.]+$/, '') + '.txt') },
          { label: 'Export as Markdown (.md)…', action: () => void saveToHost(new Blob([text], { type: 'text/markdown' }), (node?.name ?? 'Untitled').replace(/\.[^.]+$/, '') + '.md') },
        ],
      },
      {
        title: 'Format',
        items: [
          { label: 'Bigger', shortcut: 'mod+=', action: () => setSize((s) => Math.min(48, s + 1)) },
          { label: 'Smaller', shortcut: 'mod+-', action: () => setSize((s) => Math.max(9, s - 1)) },
          { label: 'Bold', shortcut: 'mod+b', checked: bold, action: () => setBold(!bold) },
          { separator: true },
          { label: 'Wrap to Window', checked: wrap, action: () => setWrap(!wrap) },
          { label: 'Font', submenu: FONTS.map((f) => ({ label: f.label, checked: font === f.value, action: () => setFont(f.value) })) },
        ],
      },
    ],
    [text, saved, fileId, bold, wrap, font, node?.name],
  );

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="flex flex-col h-full relative app-surface">
      <TitleBar className="chrome hairline-b" height={52}>
        <div className="ml-auto flex items-center gap-2" data-no-drag>
          <Popup value={font} onChange={setFont} options={FONTS} ariaLabel="Font" style={{ width: 140 }} />
          <div className="tb-group">
            <button className="tb-btn" aria-label="Smaller" onClick={() => setSize((s) => Math.max(9, s - 1))}><Minus size={14} /></button>
            <span className="text-[12px] w-[24px] text-center tabular-nums">{size}</span>
            <button className="tb-btn" aria-label="Bigger" onClick={() => setSize((s) => Math.min(48, s + 1))}><Plus size={14} /></button>
          </div>
          <div className="tb-group">
            <button className={`tb-btn ${bold ? 'active' : ''}`} aria-label="Bold" onClick={() => setBold(!bold)}><Bold size={14} /></button>
          </div>
          <div className="tb-group">
            {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight], ['justify', AlignJustify]] as const).map(([a, Icon]) => (
              <button key={a} className={`tb-btn ${align === a ? 'active' : ''}`} aria-label={`Align ${a}`} onClick={() => setAlign(a)}><Icon size={14} /></button>
            ))}
          </div>
        </div>
      </TitleBar>
      {!loaded ? (
        <div className="flex-1 grid place-items-center"><div className="spinner" /></div>
      ) : (
        <textarea
          ref={ta}
          aria-label="Document"
          className="flex-1 w-full resize-none border-0 outline-none px-10 py-6 scroll selectable"
          style={{ fontFamily: font, fontSize: size, fontWeight: bold ? 700 : 400, textAlign: align, whiteSpace: wrap ? 'pre-wrap' : 'pre', background: 'var(--bg)', color: 'var(--text)', lineHeight: 1.5 }}
          value={text}
          spellCheck
          onChange={(e) => {
            setText(e.target.value);
            const ie = e.nativeEvent as InputEvent;
            if (ie.data && /[\s.,!?;:]/.test(ie.data)) {
              if (replaceInTextarea(e.target)) setText(e.target.value);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              e.currentTarget.setRangeText('\t', e.currentTarget.selectionStart, e.currentTarget.selectionEnd, 'end');
              setText(e.currentTarget.value);
            }
          }}
        />
      )}
      <div className="h-[22px] hairline-t flex items-center px-3 text-[11px] muted gap-4">
        <span>{words.toLocaleString()} words</span>
        <span>{text.length.toLocaleString()} characters</span>
        <span className="ml-auto">{node ? (dirty ? 'Edited' : 'Saved') : 'Not saved'}</span>
      </div>
      {(sheet === 'save' || sheet === 'saveas') && (
        <SaveSheet
          title={sheet === 'saveas' ? 'Save As' : 'Save'}
          defaultName={node?.name.replace(/\.[^.]+$/, '') ?? 'Untitled'}
          defaultFolder={node?.parentId ?? DOCUMENTS}
          formats={[{ ext: 'txt', label: 'Plain Text (.txt)' }, { ext: 'md', label: 'Markdown (.md)' }]}
          onSave={(f, n) => void doSaveAs(f, n)}
          onCancel={() => {
            setSheet(null);
            closeResolver.current?.(false);
            closeResolver.current = null;
          }}
        />
      )}
      {sheet === 'open' && (
        <OpenSheet
          filter={(n) => isTextMime(n.mime)}
          onCancel={() => setSheet(null)}
          onOpen={(id) => {
            setSheet(null);
            if (!fileId && !text) setFileId(id);
            else openApp('textedit', { fileId: id }, { forceNew: true });
          }}
        />
      )}
      {sheet === 'close' && (
        <ConfirmSheet
          title={`Do you want to save the changes made to “${node?.name ?? 'Untitled'}”?`}
          message="Your changes will be lost if you don’t save them."
          buttons={[{ label: 'Don’t Save', value: 'discard' }, { label: 'Cancel', value: 'cancel' }, { label: 'Save', value: 'save', primary: true }]}
          onPick={async (v) => {
            if (v === 'cancel') {
              setSheet(null);
              closeResolver.current?.(false);
              closeResolver.current = null;
            } else if (v === 'discard') {
              setSheet(null);
              closeResolver.current?.(true);
              closeResolver.current = null;
            } else {
              if (fileId) {
                await save();
                setSheet(null);
                closeResolver.current?.(true);
                closeResolver.current = null;
              } else setSheet('save');
            }
          }}
        />
      )}
    </div>
  );
}
