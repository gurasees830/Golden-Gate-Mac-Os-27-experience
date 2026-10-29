import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';
import { useSystem } from '../stores/system';
import { useFs, readText, fileUrl } from '../stores/fs';
import { useSettings } from '../stores/settings';
import { FloatingMenu, formatShortcut } from './Menu';
import { AppIcon } from '../icons/AppIcon';
import { FileIcon } from '../icons/FileIcon';
import { dndState } from '../lib/dnd';
import { formatBytes, kindOf, isTextMime } from '../lib/format';
import { openFile } from './actions';
import type { DialogSpec } from '../types';

export function ContextMenuLayer() {
  const cm = useSystem((s) => s.contextMenu);
  const set = useSystem((s) => s.set);
  useEffect(() => {
    if (!cm) return;
    const close = () => set({ contextMenu: null });
    const t = setTimeout(() => {
      window.addEventListener('pointerdown', close);
      window.addEventListener('blur', close);
    }, 0);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', key);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', key);
    };
  }, [cm, set]);
  if (!cm) return null;
  return (
    <div onPointerDown={(e) => e.stopPropagation()}>
      <FloatingMenu x={cm.x} y={cm.y} items={cm.items} anchor={cm.anchor} onDone={() => set({ contextMenu: null })} />
    </div>
  );
}

function DialogIcon({ icon }: { icon?: DialogSpec['icon'] }) {
  if (!icon) return <AppIcon id="about" size={56} />;
  if (icon === 'warning')
    return (
      <div className="relative">
        <AlertTriangle size={56} fill="#ffcc00" color="#ffcc00" strokeWidth={1.2} />
        <span className="absolute inset-0 grid place-items-center pt-[10px] text-[22px] font-black text-black/80">!</span>
      </div>
    );
  if (icon === 'info') return <Info size={52} className="text-[var(--accent)]" />;
  return <AppIcon id={icon} size={56} />;
}

function DialogView({ d, inSheet }: { d: DialogSpec; inSheet?: boolean }) {
  const [input, setInput] = useState(d.input?.value ?? '');
  const [checked, setChecked] = useState(d.checkbox?.checked ?? false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    } else ref.current?.focus();
  }, []);
  const primary = d.buttons.find((b) => b.primary) ?? d.buttons[d.buttons.length - 1];
  const cancel = d.buttons.find((b) => b.value === 'cancel');
  const vertical = d.buttons.length > 2;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alertdialog"
      aria-label={d.title}
      className={`w-[290px] rounded-[22px] p-5 flex flex-col items-center text-center glass-strong liquid ${inSheet ? '' : 'anim-pop'}`}
      style={{ color: 'var(--text)', background: 'var(--menu-bg)' }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && primary) d.resolve({ value: primary.value, input, checked });
        if (e.key === 'Escape') d.resolve({ value: cancel?.value ?? 'cancel', input, checked });
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <DialogIcon icon={d.icon} />
      <div className="font-bold text-[13px] mt-3 leading-snug">{d.title}</div>
      {d.message && <div className="text-[11.5px] mt-[6px] leading-snug" style={{ color: 'var(--text-2)' }}>{d.message}</div>}
      {d.input && (
        <input ref={inputRef} className="field mt-3" type={d.input.type ?? 'text'} placeholder={d.input.placeholder} value={input} onChange={(e) => setInput(e.target.value)} />
      )}
      {d.checkbox && (
        <label className="flex items-center gap-2 mt-3 text-[12px] text-left">
          <input type="checkbox" className="check" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          {d.checkbox.label}
        </label>
      )}
      <div className={`mt-4 w-full gap-2 ${vertical ? 'flex flex-col-reverse' : 'flex'}`}>
        {d.buttons.map((b) => (
          <button
            key={b.value}
            className={`btn lg flex-1 ${b.primary ? 'primary' : ''}`}
            style={b.danger && !b.primary ? { color: '#ff3b30' } : b.danger && b.primary ? { background: '#ff3b30' } : undefined}
            onClick={() => d.resolve({ value: b.value, input, checked })}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DialogLayer() {
  const dialogs = useSystem((s) => s.dialogs);
  if (!dialogs.length) return null;
  const d = dialogs[dialogs.length - 1];
  return (
    <div className="absolute inset-0 z-[9800] grid place-items-center anim-fade" style={{ background: 'rgba(0,0,0,.08)' }}>
      <DialogView key={d.id} d={d} />
    </div>
  );
}

export function Toast() {
  const toast = useSystem((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="absolute left-1/2 top-[44px] -translate-x-1/2 z-[9850] glass-strong rounded-[14px] px-4 py-2 text-[12.5px] anim-pop max-w-[460px] text-center" style={{ color: 'var(--text)' }} key={toast.id} role="status">
      {toast.text}
    </div>
  );
}

export function DndGhost() {
  const d = dndState();
  const nodes = useFs((s) => s.nodes);
  if (!d.active) return null;
  const first = nodes[d.ids[0]];
  if (!first) return null;
  return (
    <div className="fixed z-[9700] pointer-events-none" style={{ left: d.x - 30, top: d.y - 30, opacity: 0.85 }}>
      <FileIcon node={first} size={60} />
      {d.ids.length > 1 && <div className="badge absolute -top-1 -right-2">{d.ids.length}</div>}
      {d.copy && <div className="absolute -bottom-1 -right-1 w-[18px] h-[18px] rounded-full bg-[#34c759] text-white grid place-items-center text-[14px] font-bold">+</div>}
    </div>
  );
}

export function QuickLook() {
  const id = useSystem((s) => s.quickLook);
  const node = useFs((s) => (id ? s.nodes[id] : undefined));
  const set = useSystem((s) => s.set);
  const [text, setText] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setText(null);
    setUrl(null);
    if (!node || node.kind !== 'file') return;
    if (isTextMime(node.mime)) void readText(node.id).then((t) => setText(t.slice(0, 20000)));
    else void fileUrl(node.id).then(setUrl);
  }, [node]);
  useEffect(() => {
    if (!id) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || (e.key === ' ' && !(e.target as HTMLElement).closest('input,textarea'))) {
        e.preventDefault();
        set({ quickLook: null });
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [id, set]);
  if (!node) return null;
  return (
    <div className="absolute inset-0 z-[9300] grid place-items-center" onPointerDown={() => set({ quickLook: null })}>
      <div className="w-[min(760px,80vw)] h-[min(560px,75vh)] rounded-[18px] overflow-hidden flex flex-col glass-strong liquid anim-pop" onPointerDown={(e) => e.stopPropagation()} style={{ color: 'var(--text)' }}>
        <div className="h-[40px] flex items-center px-3 gap-2 hairline-b">
          <button className="tb-btn" onClick={() => set({ quickLook: null })} aria-label="Close Quick Look">
            <X size={15} />
          </button>
          <div className="flex-1 text-center font-semibold truncate">{node.name}</div>
          <button className="btn" onClick={() => { set({ quickLook: null }); openFile(node.id); }}>
            Open
          </button>
        </div>
        <div className="flex-1 min-h-0 grid place-items-center overflow-hidden" style={{ background: 'var(--bg)' }}>
          {node.kind === 'folder' ? (
            <div className="flex flex-col items-center gap-2">
              <FileIcon node={node} size={128} />
              <div className="muted">Folder</div>
            </div>
          ) : text != null ? (
            <pre className="w-full h-full overflow-auto p-5 text-[12.5px] selectable whitespace-pre-wrap scroll" style={{ fontFamily: node.mime === 'text/plain' ? 'var(--font)' : 'var(--mono)' }}>
              {text}
            </pre>
          ) : url && node.mime.startsWith('image/') ? (
            <img src={url} alt={node.name} className="max-w-full max-h-full object-contain" />
          ) : url && node.mime.startsWith('audio/') ? (
            <audio src={url} controls autoPlay={false} />
          ) : url && node.mime.startsWith('video/') ? (
            <video src={url} controls className="max-w-full max-h-full" />
          ) : (
            <div className="flex flex-col items-center gap-2">
              <FileIcon node={node} size={128} />
              <div className="font-semibold">{node.name}</div>
              <div className="muted">
                {kindOf(node.mime, node.name)} · {formatBytes(node.size)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const SHORTCUTS: [string, string, string?][] = [
  ['mod+space', 'Open Spotlight', 'Ctrl+K also works'],
  ['mod+q', 'Quit the active app', 'Alt+Q if your browser takes the key'],
  ['mod+w', 'Close the active window', 'Alt+W (browsers reserve Ctrl+W)'],
  ['mod+m', 'Minimize the active window'],
  ['mod+n', 'New window / item', 'Alt+N (browsers reserve Ctrl+N)'],
  ['mod+s', 'Save'],
  ['mod+f', 'Find / search in the app'],
  ['mod+,', 'Open settings'],
  ['mod+h', 'Hide the active app'],
  ['alt+tab', 'App Switcher (hold the modifier, Tab to move, Q to quit, H to hide)', 'Option/Alt+` works everywhere; ⌘/Alt+Tab works in full screen'],
  ['mod+`', 'Cycle windows of the active app'],
  ['ctrl+mod+f', 'Enter or exit full screen for the window'],
  ['mod+alt+escape', 'Force Quit Applications'],
  ['mod+shift+3', 'Take a screenshot of the desktop'],
  ['mod+shift+4', 'Screenshot the active window'],
  ['ctrl+mod+q', 'Lock Screen'],
  ['mod+shift+q', 'Log Out'],
  ['ctrl+alt+arrowleft', 'Tile window left'],
  ['ctrl+alt+arrowright', 'Tile window right'],
  ['ctrl+alt+enter', 'Fill the screen'],
  ['f4', 'Launchpad'],
  ['mod+/', 'This shortcut list'],
  ['escape', 'Close menus, Spotlight, Launchpad, dialogs'],
];

export function ShortcutsPanel() {
  const open = useSystem((s) => s.shortcutsPanel);
  const set = useSystem((s) => s.set);
  const symbols = useSettings((s) => s.keyboard.symbols);
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-[9400] grid place-items-center" style={{ background: 'rgba(0,0,0,.2)' }} onPointerDown={() => set({ shortcutsPanel: false })}>
      <div className="w-[560px] max-h-[80vh] rounded-[20px] glass-strong liquid p-5 anim-pop flex flex-col" style={{ color: 'var(--text)' }} onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <div className="text-[17px] font-bold">Keyboard Shortcuts</div>
          <button className="tb-btn" onClick={() => set({ shortcutsPanel: false })} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="text-[12px] muted mb-3">⌘ is Ctrl on Windows and Linux; ⌥ is Alt. Some keys are reserved by your browser, so alternatives are listed.</div>
        <div className="scroll flex-1 min-h-0">
          {SHORTCUTS.map(([k, label, note]) => (
            <div key={k} className="flex items-center py-[7px] hairline-b gap-3">
              <span className="kbd min-w-[90px] text-center">{formatShortcut(k, symbols)}</span>
              <span className="flex-1">{label}</span>
              {note && <span className="text-[11px] faint">{note}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
