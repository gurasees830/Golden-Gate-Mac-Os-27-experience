import { useSettings, permission } from '../stores/settings';
import { showDialog } from '../stores/system';
import { getApp } from './appRegistry';

type Kind = 'camera' | 'microphone';

/**
 * Ask the simulator's Privacy & Security first, then the browser.
 * Returns a MediaStream or an error message explaining why access failed.
 */
export async function requestMedia(appId: string, kinds: Kind[]): Promise<{ stream: MediaStream } | { error: string }> {
  const name = getApp(appId)?.name ?? appId;
  for (const k of kinds) {
    const allowed = permission(k, appId);
    if (allowed === false) return { error: `${name} isn’t allowed to use the ${k}. Turn it on in System Settings ▸ Privacy & Security.` };
    if (allowed === undefined) {
      const r = await showDialog({
        title: `“${name}” would like to access the ${k}.`,
        message: 'Your browser will ask as well. Nothing is recorded or sent anywhere unless you save it.',
        icon: appId,
        buttons: [
          { label: 'Don’t Allow', value: 'no' },
          { label: 'Allow', value: 'yes', primary: true },
        ],
      });
      const p = useSettings.getState().privacy;
      useSettings.getState().set({ privacy: { ...p, [k]: { ...p[k], [appId]: r.value === 'yes' } } });
      if (r.value !== 'yes') return { error: `You didn’t allow ${name} to use the ${k}.` };
    }
  }
  if (!navigator.mediaDevices?.getUserMedia) return { error: 'This browser doesn’t support camera or microphone access.' };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: kinds.includes('camera') ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false, audio: kinds.includes('microphone') });
    return { stream };
  } catch (e) {
    const n = (e as DOMException).name;
    if (n === 'NotAllowedError' || n === 'SecurityError')
      return { error: 'Your browser or this page’s host blocked access. If Golden Gate is running inside a preview, open it in its own tab or self-host it to use the camera and microphone.' };
    if (n === 'NotFoundError') return { error: `No ${kinds.join(' or ')} was found on this computer.` };
    return { error: (e as Error).message };
  }
}

export function stopStream(s: MediaStream | null | undefined) {
  s?.getTracks().forEach((t) => t.stop());
}
