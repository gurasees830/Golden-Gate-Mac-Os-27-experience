import { useEffect, useRef } from 'react';
import { Download } from 'lucide-react';
import { SystemMark } from '../../icons/Glyphs';

const SECTIONS: { id: string; title: string; body: string[] }[] = [
  { id: 'about', title: 'About Golden Gate', body: ['Golden Gate is an independent, browser-based desktop simulator inspired by macOS 27 Golden Gate. It is not made by, affiliated with, or endorsed by Apple.', 'Everything runs in your browser. Files, settings and app data are stored in IndexedDB on this device. Nothing you do here changes your real computer.'] },
  { id: 'finder', title: 'Finder', body: ['Browse the virtual disk with icon, list and column views. Drag files between folders, onto the Trash, onto app icons in the Dock, or from your computer into any Finder window.', 'Press Return to rename, Space for Quick Look, ⌘⌫ to move to the Trash, ⌘C/⌘V to copy and paste.'] },
  { id: 'settings', title: 'System Settings', body: ['Every switch changes the simulator: appearance, accent colour, Liquid Glass transparency, wallpaper, Dock size and position, hot corners, notifications, Focus, text size, Night Shift and more.'] },
  { id: 'appstore', title: 'App Store', body: ['Install extra apps such as Weather, Chess, Sketchbook and Codepad. Installing enables an app inside the simulator; nothing is downloaded to your computer. Delete apps from Launchpad (long-press), Finder ▸ Applications or the app’s page.'] },
  { id: 'terminal', title: 'Terminal', body: ['A zsh-style shell for the virtual disk. Try: ls -la, cd Documents, mkdir test, echo hello > note.txt, cat note.txt, tree, open -a Notes.', 'It cannot run real commands on your computer.'] },
  { id: 'safari', title: 'Safari', body: ['Use tabs, bookmarks, the reading list and history. Websites that allow embedding open inside the window; most sites forbid this for security, so Safari offers to open them in a new browser tab instead.'] },
  { id: 'about-this-mac', title: 'About This Mac', body: ['Shows information your browser can detect: logical processor count, approximate memory, graphics renderer, screen and host operating system. Browsers cannot reveal your exact CPU model, RAM size or disk capacity, so those are marked unavailable unless you enter them yourself.'] },
  { id: 'shortcuts', title: 'Keyboard shortcuts', body: ['On Windows and Linux use Ctrl wherever you see ⌘, and Alt for ⌥. Because browsers reserve Ctrl+W, Ctrl+N and Ctrl+T, Golden Gate also accepts Alt+W (close window), Alt+N (new) and Alt+Q (quit). Press ⌘/ for the full list.'] },
  { id: 'privacy', title: 'Privacy', body: ['Golden Gate sends no analytics. Camera, microphone and location are only used after you allow them in Privacy & Security and in your browser’s own prompt.'] },
];

export function HelpPage({ anchor, onDownload, onGo }: { anchor?: string; onDownload: (name: string, content: string) => void; onGo: (u: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!anchor) return;
    const el = ref.current?.querySelector(`[data-sec="${anchor}"]`);
    el?.scrollIntoView({ block: 'start' });
  }, [anchor]);
  return (
    <div ref={ref} className="h-full scroll" style={{ background: 'var(--bg)' }}>
      <div className="text-white px-10 py-12" style={{ background: 'linear-gradient(135deg,#c8361f,#ff8a4c 55%,#ffcf8a)' }}>
        <SystemMark size={44} />
        <div className="text-[34px] font-bold mt-3">Golden Gate User Guide</div>
        <div className="text-[14px] opacity-90">Everything you can do in the simulator.</div>
      </div>
      <div className="flex max-w-[980px] mx-auto">
        <nav className="w-[200px] flex-none py-8 pl-6 text-[13px] sticky top-0 self-start">
          {SECTIONS.map((s) => (
            <button key={s.id} className="block w-full text-left py-1 border-0 bg-transparent link" onClick={() => onGo(`golden-gate://help#${s.id}`)}>{s.title}</button>
          ))}
        </nav>
        <div className="flex-1 py-8 px-8 selectable">
          {SECTIONS.map((s) => (
            <section key={s.id} data-sec={s.id} className="mb-8">
              <h2 className="text-[21px] font-bold mb-2">{s.title}</h2>
              {s.body.map((p, i) => <p key={i} className="text-[14px] leading-relaxed mb-2" style={{ color: 'var(--text)' }}>{p}</p>)}
            </section>
          ))}
          <section data-sec="downloads" className="mb-8">
            <h2 className="text-[21px] font-bold mb-2">Sample downloads</h2>
            <p className="text-[14px] mb-3">These files download into the simulator’s Downloads folder (watch the Dock).</p>
            <div className="flex gap-3 flex-wrap">
              {[
                ['Golden Gate Cheatsheet.md', '# Golden Gate cheatsheet\n\n- ⌘Space: Spotlight\n- F4: Launchpad\n- ⇧⌘3: Screenshot\n- ⌃⌘Q: Lock screen\n'],
                ['todo.txt', 'Buy milk\nFinish TeamFlow API\nCall home\n'],
                ['data.json', JSON.stringify({ bridge: 'Golden Gate', opened: 1937, lengthMeters: 2737 }, null, 2)],
              ].map(([n, c]) => (
                <button key={n} className="btn" onClick={() => onDownload(n, c)}><Download size={13} /> {n}</button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
