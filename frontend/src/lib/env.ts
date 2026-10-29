/** Runtime environment detection. */

export const isMacHost = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** True when we run inside a frame (e.g. a hosted preview); downloads and iframes may be blocked there. */
export const isFramed = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

export const APP_VERSION = '1.0.0';
export const OS_NAME = 'Golden Gate';

/**
 * Optional backend URL for cloud accounts and sync (set VITE_API_URL at build time).
 * Use "same-origin" when a reverse proxy serves the API under /api on the same host.
 */
const rawApi = import.meta.env.VITE_API_URL as string | undefined;
export const API_URL: string | undefined = rawApi === 'same-origin' ? '' : rawApi || undefined;

export function assetUrl(path: string): string {
  // Vite base is './' so relative asset URLs work from any hosting path.
  return `./${path.replace(/^\/+/, '')}`;
}
