import { useState } from 'react';
import { Monitor, AppWindow, Timer } from 'lucide-react';
import type { AppProps } from '../../types';
import { TitleBar } from '../../shell/windowContext';
import { useWindows } from '../../stores/windows';
import { captureScreenshot } from '../../lib/screenshot';
import { Segmented } from '../../components/ui';
import { formatShortcut } from '../../shell/Menu';

export default function Screenshot({ win }: AppProps) {
  const [mode, setMode] = useState<'screen' | 'window'>('screen');
  const [delay, setDelay] = useState(0);
  const [count, setCount] = useState<number | null>(null);
  const capture = async () => {
    const ws = useWindows.getState();
    ws.minimize(win.id);
    if (delay) {
      for (let i = delay; i > 0; i--) {
        setCount(i);
        await new Promise((r) => setTimeout(r, 1000));
      }
      setCount(null);
    } else await new Promise((r) => setTimeout(r, 450));
    await captureScreenshot(mode);
    ws.restore(win.id);
  };
  return (
    <div className="flex flex-col h-full app-surface">
      <TitleBar className="chrome hairline-b" height={40} />
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-5">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'screen', label: <><Monitor size={13} /> Entire Desktop</> }, { value: 'window', label: <><AppWindow size={13} /> Front Window</> }]} />
        <label className="flex items-center gap-2 text-[12.5px]"><Timer size={14} /> Timer
          <select className="popup" value={delay} onChange={(e) => setDelay(Number(e.target.value))}><option value={0}>None</option><option value={5}>5 seconds</option><option value={10}>10 seconds</option></select>
        </label>
        <button className="btn primary lg" onClick={() => void capture()}>{count ? `Capturing in ${count}…` : 'Capture'}</button>
        <div className="text-[11px] muted text-center">Saved to your Desktop as PNG. Shortcuts: {formatShortcut('mod+shift+3')} desktop, {formatShortcut('mod+shift+4')} front window. Captures the simulator only — not your real screen.</div>
      </div>
    </div>
  );
}
