import { useEffect, useState } from 'react';
import { Archive, PackageOpen } from 'lucide-react';
import type { AppProps } from '../../types';
import { TitleBar } from '../../shell/windowContext';
import { useFs, DOCUMENTS, importHostFiles, DOWNLOADS } from '../../stores/fs';
import { compress, extract } from '../../lib/archive';
import { OpenSheet } from '../../components/FileDialogs';
import { FileIcon } from '../../icons/FileIcon';
import { openApp } from '../../shell/actions';

export default function ArchiveUtility({ win }: AppProps) {
  const nodes = useFs((s) => s.nodes);
  const [status, setStatus] = useState<string>('Drop files or folders here to compress, or a .zip to expand.');
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(false);
  const [last, setLast] = useState<string | null>(null);

  const doExtract = async (id: string) => {
    setBusy(true);
    setStatus(`Expanding “${nodes[id]?.name}”…`);
    try {
      const f = await extract(id);
      setLast(f.id);
      setStatus(`Expanded into “${f.name}”.`);
    } catch (e) {
      setStatus(`Couldn’t expand: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const id = win.args?.fileId as string | undefined;
    if (id) void doExtract(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.args?._nonce, win.args?.fileId]);

  return (
    <div className="flex flex-col h-full app-surface">
      <TitleBar className="chrome hairline-b" height={40} />
      <div
        className="flex-1 m-4 rounded-[14px] flex flex-col items-center justify-center gap-3 text-center p-6"
        style={{ boxShadow: 'inset 0 0 0 2px var(--separator)', background: 'var(--bg-2)' }}
        data-drop-folder="__archive"
        onDragOver={(e) => e.preventDefault()}
        onDrop={async (e) => {
          e.preventDefault();
          if (!e.dataTransfer.files.length) return;
          setBusy(true);
          const files = await importHostFiles(e.dataTransfer.files, DOWNLOADS);
          const zips = files.filter((f) => f.mime === 'application/zip');
          for (const z of zips) await doExtract(z.id);
          const others = files.filter((f) => f.mime !== 'application/zip');
          if (others.length) {
            const z = await compress(others.map((f) => f.id), DOCUMENTS);
            setLast(z.id);
            setStatus(`Created “${z.name}” in Documents.`);
          }
          setBusy(false);
        }}
      >
        {busy ? <div className="spinner" /> : <Archive size={44} className="opacity-60" />}
        <div className="text-[13px] max-w-[340px]">{status}</div>
        {last && nodes[last] && (
          <button className="btn" onClick={() => openApp('finder', { folderId: nodes[last].parentId, select: last }, { forceNew: true })}>
            <FileIcon node={nodes[last]} size={16} /> Show in Finder
          </button>
        )}
        <div className="flex gap-2 mt-2">
          <button className="btn" onClick={() => setPick(true)}><PackageOpen size={13} /> Expand a .zip…</button>
        </div>
        <div className="text-[11px] muted">Tip: in Finder, right-click files and choose Compress.</div>
      </div>
      {pick && <OpenSheet title="Choose an archive" filter={(n) => n.mime === 'application/zip'} onCancel={() => setPick(false)} onOpen={(id) => { setPick(false); void doExtract(id); }} />}
    </div>
  );
}
