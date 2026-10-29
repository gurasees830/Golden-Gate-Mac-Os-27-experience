import { showDialog, useSystem } from '../stores/system';
import { isFramed } from './env';

/**
 * Save a file to the *host* computer. Uses the File System Access API when
 * available, otherwise a download link. Hosted previews may block downloads,
 * so text files also offer a "Copy" fallback.
 */
export async function saveToHost(blob: Blob, filename: string): Promise<boolean> {
  const w = window as Window & { showSaveFilePicker?: (o: unknown) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }> };
  if (w.showSaveFilePicker && !isFramed) {
    try {
      const handle = await w.showSaveFilePicker({ suggestedName: filename });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      useSystem.getState().showToast(`Saved “${filename}” to your computer.`);
      return true;
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  if (isFramed) {
    const isText = blob.type.startsWith('text/') || /\.(txt|md|json|js|ts|java|csv|html|css)$/i.test(filename);
    const r = await showDialog({
      title: `Exporting “${filename}”`,
      message: isText
        ? 'If no download started, this page is running inside a host that blocks downloads. You can copy the contents instead.'
        : 'If no download started, this page is running inside a host that blocks downloads. Open the simulator in its own browser tab to export files.',
      icon: 'info',
      buttons: isText
        ? [
            { label: 'Done', value: 'done' },
            { label: 'Copy Contents', value: 'copy', primary: true },
          ]
        : [{ label: 'OK', value: 'done', primary: true }],
    });
    if (r.value === 'copy') {
      try {
        await navigator.clipboard.writeText(await blob.text());
        useSystem.getState().showToast('Copied to clipboard.');
      } catch {
        useSystem.getState().showToast('Clipboard access was blocked.');
      }
    }
  }
  return true;
}

export async function copyText(text: string, label = 'Copied to clipboard.') {
  try {
    await navigator.clipboard.writeText(text);
    useSystem.getState().showToast(label);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      if (ok) {
        useSystem.getState().showToast(label);
        return true;
      }
    } catch {
      /* ignore */
    }
    useSystem.getState().showToast('Clipboard access was blocked by the browser.');
    return false;
  }
}
