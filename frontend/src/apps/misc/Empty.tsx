import { useEffect } from 'react';
import type { AppProps } from '../../types';
import { useWindows } from '../../stores/windows';

/** Launchpad is an overlay, not a window; if a window is ever created, close it. */
export default function Empty({ win }: AppProps) {
  useEffect(() => {
    void useWindows.getState().close(win.id, true);
  }, [win.id]);
  return null;
}
