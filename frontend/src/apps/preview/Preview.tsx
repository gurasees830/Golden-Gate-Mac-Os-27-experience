import { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, RotateCw, Info, Maximize2, ChevronUp, ChevronDown, PanelLeft, FolderOpen } from 'lucide-react';
import type { AppProps } from '../../types';
import { TitleBar, useMenus, useWindowTitle } from '../../shell/windowContext';
import { useFs, fileUrl, readFile } from '../../stores/fs';
import { EmptyState } from '../../components/ui';
import { OpenSheet } from '../../components/FileDialogs';
import { formatBytes, kindOf } from '../../lib/format';
import { useApps } from '../../stores/apps';
import { useSettings } from '../../stores/settings';

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy: () => void };
type PdfPage = { getViewport: (o: { scale: number; rotation?: number }) => { width: number; height: number }; render: (o: Record<string, unknown>) => { promise: Promise<void> } };

async function loadPdf(data: ArrayBuffer): Promise<PdfDoc> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return (await pdfjs.getDocument({ data }).promise) as unknown as PdfDoc;
}

function PdfCanvas({ doc, page, scale, rotation }: { doc: PdfDoc; page: number; scale: number; rotation: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    void doc.getPage(page).then(async (p) => {
      if (cancelled || !ref.current) return;
      const dpr = window.devicePixelRatio || 1;
      const vp = p.getViewport({ scale: scale * dpr, rotation });
      const c = ref.current;
      c.width = vp.width;
      c.height = vp.height;
      c.style.width = `${vp.width / dpr}px`;
      c.style.height = `${vp.height / dpr}px`;
      const ctx = c.getContext('2d')!;
      await p.render({ canvasContext: ctx, canvas: c, viewport: vp }).promise.catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [doc, page, scale, rotation]);
  return <canvas ref={ref} className="bg-white shadow-lg" />;
}

export default function Preview({ win }: AppProps) {
  const [fileId, setFileId] = useState<string | null>((win.args?.fileId as string) ?? null);
  const node = useFs((s) => (fileId ? s.nodes[fileId] : undefined));
  const [url, setUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [rot, setRot] = useState(0);
  const [info, setInfo] = useState(false);
  const [thumbs, setThumbs] = useState(true);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [page, setPage] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const isPdf = node?.mime === 'application/pdf';
  const isVideo = node?.mime.startsWith('video/');
  useWindowTitle(node ? `${node.name}${isPdf && pdf ? ` — Page ${page} of ${pdf.numPages}` : ''}` : 'Preview');

  useEffect(() => {
    if (win.args?.fileId) setFileId(win.args.fileId as string);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.args?._nonce]);

  useEffect(() => {
    setUrl(null);
    setPdf(null);
    setErr(null);
    setPage(1);
    setRot(0);
    setZoom('fit');
    if (!node) return;
    useApps.getState().addRecentDoc(node.id);
    if (node.mime === 'application/pdf') {
      void readFile(node.id).then(async (d) => {
        if (!d) return setErr('File not found.');
        try {
          const buf = d instanceof Blob ? await d.arrayBuffer() : new TextEncoder().encode(d).buffer;
          setPdf(await loadPdf(buf as ArrayBuffer));
        } catch (e) {
          setErr(`This PDF couldn’t be opened: ${(e as Error).message}`);
        }
      });
    } else void fileUrl(node.id).then(setUrl);
  }, [node?.id, node?.modifiedAt]);

  const z = zoom === 'fit' ? 1 : zoom;
  const zoomBy = (f: number) => setZoom((cur) => Math.min(8, Math.max(0.1, (cur === 'fit' ? 1 : cur) * f)));

  useMenus(
    [
      { title: 'File', items: [{ label: 'Open…', shortcut: 'mod+o', action: () => setOpen(true) }] },
      { title: 'View', items: [{ label: 'Actual Size', shortcut: 'mod+0', action: () => setZoom(1) }, { label: 'Zoom to Fit', shortcut: 'mod+9', action: () => setZoom('fit') }, { label: 'Zoom In', shortcut: 'mod+=', action: () => zoomBy(1.25) }, { label: 'Zoom Out', shortcut: 'mod+-', action: () => zoomBy(0.8) }, { separator: true }, { label: thumbs ? 'Hide Sidebar' : 'Show Sidebar', action: () => setThumbs(!thumbs) }] },
      { title: 'Tools', items: [{ label: 'Rotate Left', shortcut: 'mod+l', action: () => setRot((r) => (r + 270) % 360) }, { label: 'Rotate Right', shortcut: 'mod+r', action: () => setRot((r) => (r + 90) % 360) }, { label: 'Show Inspector', shortcut: 'mod+i', action: () => setInfo(!info) }, ...(node?.mime.startsWith('image/') ? [{ separator: true }, { label: 'Set as Desktop Picture', action: () => useSettings.getState().patch('wallpaper', { id: `custom:${node.id}`, customName: node.name }) }] : [])] },
      { title: 'Go', items: [{ label: 'Previous Page', shortcut: 'arrowup', disabled: !pdf || page <= 1, action: () => setPage((p) => Math.max(1, p - 1)) }, { label: 'Next Page', shortcut: 'arrowdown', disabled: !pdf || page >= (pdf?.numPages ?? 1), action: () => setPage((p) => Math.min(pdf!.numPages, p + 1)) }] },
    ],
    [zoom, rot, info, thumbs, pdf, page, node?.id],
  );

  return (
    <div className="flex flex-col h-full relative" style={{ background: 'var(--bg-2)' }}>
      <TitleBar className="chrome hairline-b" showTitle>
        <div className="ml-auto flex items-center gap-2" data-no-drag>
          {isPdf && (
            <div className="tb-group">
              <button className={`tb-btn ${thumbs ? 'active' : ''}`} aria-label="Thumbnails" onClick={() => setThumbs(!thumbs)}><PanelLeft size={15} /></button>
              <button className="tb-btn" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronUp size={15} /></button>
              <button className="tb-btn" aria-label="Next page" disabled={!pdf || page >= pdf.numPages} onClick={() => setPage(page + 1)}><ChevronDown size={15} /></button>
            </div>
          )}
          <div className="tb-group">
            <button className="tb-btn" aria-label="Zoom out" onClick={() => zoomBy(0.8)}><ZoomOut size={15} /></button>
            <button className="tb-btn !px-2 text-[11px] tabular-nums" onClick={() => setZoom('fit')} aria-label="Zoom to fit">{zoom === 'fit' ? 'Fit' : `${Math.round(z * 100)}%`}</button>
            <button className="tb-btn" aria-label="Zoom in" onClick={() => zoomBy(1.25)}><ZoomIn size={15} /></button>
          </div>
          <div className="tb-group">
            <button className="tb-btn" aria-label="Rotate left" onClick={() => setRot((r) => (r + 270) % 360)}><RotateCcw size={15} /></button>
            <button className="tb-btn" aria-label="Rotate right" onClick={() => setRot((r) => (r + 90) % 360)}><RotateCw size={15} /></button>
            <button className={`tb-btn ${info ? 'active' : ''}`} aria-label="Inspector" onClick={() => setInfo(!info)}><Info size={15} /></button>
            <button className="tb-btn" aria-label="Open" onClick={() => setOpen(true)}><FolderOpen size={15} /></button>
          </div>
        </div>
      </TitleBar>
      <div className="flex-1 min-h-0 flex">
        {isPdf && thumbs && pdf && (
          <div className="w-[130px] flex-none hairline-r scroll p-2 flex flex-col items-center gap-3" style={{ background: 'var(--sidebar-solid)' }}>
            {Array.from({ length: Math.min(pdf.numPages, 200) }, (_, i) => (
              <button key={i} className="border-0 bg-transparent p-1 rounded-[6px] flex flex-col items-center gap-1" style={{ background: page === i + 1 ? 'var(--press)' : undefined }} onClick={() => setPage(i + 1)}>
                <PdfCanvas doc={pdf} page={i + 1} scale={0.15} rotation={rot} />
                <span className="text-[10.5px]">{i + 1}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex-1 min-w-0 overflow-auto scroll grid place-items-center p-4" onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.1 : 0.9); } }}>
          {!node ? (
            <EmptyState title="No Document" subtitle="Open an image, PDF or video." action={<button className="btn" onClick={() => setOpen(true)}>Open…</button>} />
          ) : err ? (
            <EmptyState title="Can’t Open File" subtitle={err} />
          ) : isPdf ? (
            pdf ? <PdfCanvas doc={pdf} page={page} scale={zoom === 'fit' ? 1.2 : z * 1.2} rotation={rot} /> : <div className="spinner" />
          ) : isVideo && url ? (
            <video src={url} controls className="max-w-full max-h-full" style={{ transform: `rotate(${rot}deg)` }} />
          ) : url ? (
            <img
              src={url}
              alt={node.name}
              draggable={false}
              onLoad={(e) => setDims({ w: (e.target as HTMLImageElement).naturalWidth, h: (e.target as HTMLImageElement).naturalHeight })}
              className="shadow-lg"
              style={zoom === 'fit' ? { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', transform: `rotate(${rot}deg)` } : { width: dims ? dims.w * z : undefined, maxWidth: 'none', transform: `rotate(${rot}deg)` }}
            />
          ) : (
            <div className="spinner" />
          )}
        </div>
        {info && node && (
          <div className="w-[230px] flex-none hairline-l p-4 text-[12px] flex flex-col gap-2" style={{ background: 'var(--chrome-solid)' }}>
            <div className="font-semibold text-[13px] flex items-center gap-1"><Maximize2 size={13} /> Inspector</div>
            <div className="break-all font-medium">{node.name}</div>
            <div>{kindOf(node.mime, node.name)}</div>
            <div>{formatBytes(node.size)}</div>
            {dims && !isPdf && <div>{dims.w} × {dims.h} pixels</div>}
            {pdf && <div>{pdf.numPages} pages</div>}
            <div className="muted">Modified {new Date(node.modifiedAt).toLocaleString()}</div>
          </div>
        )}
      </div>
      {open && <OpenSheet filter={(n) => n.mime.startsWith('image/') || n.mime === 'application/pdf' || n.mime.startsWith('video/')} onCancel={() => setOpen(false)} onOpen={(id) => { setOpen(false); setFileId(id); }} />}
    </div>
  );
}
