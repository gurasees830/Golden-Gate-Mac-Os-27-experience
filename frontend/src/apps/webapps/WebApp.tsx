import { useEffect, useRef, useState } from 'react';
import { ExternalLink, RotateCw } from 'lucide-react';
import type { AppProps } from '../../types';
import { TitleBar } from '../../shell/windowContext';
import { AppIcon } from '../../icons/AppIcon';
import { openApp } from '../../shell/actions';
import { useWindows } from '../../stores/windows';
import { webApp } from './catalog';

/** Opens a web app: in Safari when the site allows embedding, otherwise in its own browser window. */
export default function WebAppLauncher({ win }: AppProps) {
  const app = webApp(win.appId)!;
  const [state, setState] = useState<'opening' | 'open' | 'blocked'>('opening');
  const popup = useRef<Window | null>(null);

  const launch = () => {
    if (app.mode === 'safari') {
      openApp('safari', { url: app.url }, { forceNew: true });
      void useWindows.getState().close(win.id);
      return;
    }
    const w = Math.min(1280, screen.availWidth - 80);
    const h = Math.min(860, screen.availHeight - 80);
    const left = Math.round((screen.availWidth - w) / 2);
    const top = Math.round((screen.availHeight - h) / 2);
    // a named window: launching again focuses the same one, like reopening an app
    popup.current = window.open(app.url, `gg-${app.id}`, `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
    if (popup.current) {
      popup.current.focus();
      setState('open');
    } else setState('blocked');
  };

  useEffect(() => {
    launch(); // the Dock / Launchpad click that opened us still counts as the user's gesture
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.args?._nonce]);

  return (
    <div className="flex flex-col h-full app-surface">
      <TitleBar showTitle={false} height={38} />
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 pb-6 gap-3">
        <AppIcon id={app.id} size={84} />
        <div className="text-[17px] font-bold">{app.name}</div>
        {state === 'open' ? (
          <div className="text-[12.5px] muted max-w-[320px]">{app.name} is open in its own window. Sign in there with your own account — it’s the real {new URL(app.url).hostname}.</div>
        ) : state === 'blocked' ? (
          <div className="text-[12.5px] muted max-w-[320px]">{app.name} opens in its own browser window. If nothing appeared, your browser may have blocked the pop-up.</div>
        ) : (
          <div className="text-[12.5px] muted">Opening…</div>
        )}
        <div className="flex gap-2 mt-1">
          <button className="btn primary" onClick={launch}>{state === 'open' ? <><RotateCw size={13} /> Bring to Front</> : <><ExternalLink size={13} /> Open {app.name}</>}</button>
          <a className="btn no-underline" href={app.url} target="_blank" rel="noopener noreferrer">Open in New Tab</a>
        </div>
      </div>
    </div>
  );
}
