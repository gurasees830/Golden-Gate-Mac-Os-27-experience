import { create } from 'zustand';
import { toBlob } from 'html-to-image';
import { useFs, DESKTOP, fileUrl } from '../stores/fs';
import { focusedWindow } from '../stores/windows';
import { useSystem } from '../stores/system';
import { playUi } from './sound';
import { pad } from './format';
import { useEffect, useState } from 'react';

export const useShot = create<{ flash: boolean; thumbId: string | null }>(() => ({ flash: false, thumbId: null }));

/**
 * Renders the simulator's own DOM to a PNG (no screen-capture permission
 * needed) and saves it to the virtual Desktop, like ⌘⇧3 on a Mac.
 */
export async function captureScreenshot(mode: 'screen' | 'window' = 'screen', delayMs = 0): Promise<string | null> {
  if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  const sys = useSystem.getState();
  sys.closeOverlays();
  let el: HTMLElement | null = document.querySelector('#root > div > div') as HTMLElement;
  if (mode === 'window') {
    const fw = focusedWindow();
    el = fw ? (document.querySelector(`[data-window-id="${fw.id}"]`) as HTMLElement) : el;
  }
  if (!el) return null;
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  try {
    const blob = await toBlob(el, {
      pixelRatio: Math.min(2, window.devicePixelRatio || 1),
      cacheBust: false,
      skipFonts: false,
      filter: (node) => !(node instanceof HTMLElement && node.dataset?.noCapture !== undefined),
    });
    if (!blob) throw new Error('empty');
    playUi('screenshot');
    useShot.setState({ flash: true });
    setTimeout(() => useShot.setState({ flash: false }), 220);
    const d = new Date();
    const h = d.getHours() % 12 || 12;
    const name = `Screenshot ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} at ${h}.${pad(d.getMinutes())}.${pad(d.getSeconds())} ${d.getHours() < 12 ? 'AM' : 'PM'}.png`;
    const node = await useFs.getState().createFile(DESKTOP, name, new Blob([blob], { type: 'image/png' }), 'image/png');
    useShot.setState({ thumbId: node.id });
    setTimeout(() => {
      if (useShot.getState().thumbId === node.id) useShot.setState({ thumbId: null });
    }, 5000);
    return node.id;
  } catch (e) {
    console.error(e);
    useSystem.getState().showToast('The screenshot couldn’t be created in this browser.');
    return null;
  }
}

export function ScreenshotLayer() {
  const { flash, thumbId } = useShot();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!thumbId) {
      setUrl(null);
      return;
    }
    void fileUrl(thumbId).then(setUrl);
  }, [thumbId]);
  return (
    <>
      {flash && <div data-no-capture className="absolute inset-0 z-[9995] bg-white pointer-events-none" style={{ animation: 'gg-fade-in .2s reverse' }} />}
      {thumbId && url && (
        <button
          data-no-capture
          className="absolute right-5 bottom-5 z-[9990] w-[220px] rounded-[10px] overflow-hidden border-0 p-0 anim-pop"
          style={{ boxShadow: '0 0 0 3px #fff, 0 10px 30px rgba(0,0,0,.4)' }}
          onClick={async () => {
            useShot.setState({ thumbId: null });
            const { openFile } = await import('../shell/actions');
            openFile(thumbId, 'preview');
          }}
          aria-label="Open screenshot"
        >
          <img src={url} alt="Screenshot preview" className="block w-full" />
        </button>
      )}
    </>
  );
}
