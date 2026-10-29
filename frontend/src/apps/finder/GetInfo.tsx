import { useState } from 'react';
import type { AppProps } from '../../types';
import { TitleBar, useWindowTitle } from '../../shell/windowContext';
import { useFs, pathString, folderSize } from '../../stores/fs';
import { FileIcon } from '../../icons/FileIcon';
import { formatBytes, kindOf } from '../../lib/format';
import { TAG_COLORS } from '../../shell/fileMenu';
import { appsForMime, appForMime } from '../../lib/appRegistry';
import { isInstalled } from '../../stores/apps';
import { openFile } from '../../shell/actions';
import { ChevronDown, ChevronRight } from 'lucide-react';

function Section({ title, children, open = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  const [o, setO] = useState(open);
  return (
    <div className="hairline-t">
      <button className="w-full flex items-center gap-1 py-[6px] border-0 bg-transparent text-[12px] font-semibold" onClick={() => setO(!o)}>
        {o ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {title}
      </button>
      {o && <div className="pb-2 pl-4 text-[11.5px]">{children}</div>}
    </div>
  );
}

export default function GetInfo({ win }: AppProps) {
  const id = win.args?.id as string;
  const node = useFs((s) => s.nodes[id]);
  const nodes = useFs((s) => s.nodes);
  const fs = useFs.getState();
  const [name, setName] = useState(node?.name ?? '');
  useWindowTitle(node ? `${node.name} Info` : 'Info');
  if (!node) return <div className="p-4">This item no longer exists.</div>;
  const size = node.kind === 'folder' ? folderSize(nodes, node.id) : node.size;
  const kv = (k: string, v: React.ReactNode) => (
    <div className="flex gap-2 py-[2px]">
      <span className="w-[70px] text-right font-medium flex-none">{k}:</span>
      <span className="muted break-all selectable">{v}</span>
    </div>
  );
  return (
    <div className="flex flex-col h-full app-surface" style={{ background: 'var(--chrome-solid)' }}>
      <TitleBar height={38} className="hairline-b" />
      <div className="scroll flex-1 px-3 pb-3">
        <div className="flex items-center gap-3 py-3">
          <FileIcon node={node} size={48} />
          <div className="min-w-0">
            <div className="font-semibold truncate">{node.name}</div>
            <div className="text-[11.5px] muted">{formatBytes(size)}</div>
            <div className="text-[11px] muted">Modified: {new Date(node.modifiedAt).toLocaleString()}</div>
          </div>
        </div>
        <div className="flex gap-1 pb-2">
          {TAG_COLORS.map((t) => (
            <button
              key={t.name}
              aria-label={`Tag ${t.name}`}
              className="w-[16px] h-[16px] rounded-full border-0 p-0"
              style={{ background: t.color, boxShadow: node.tags?.includes(t.name) ? '0 0 0 2px var(--bg), 0 0 0 3.5px var(--text-2)' : undefined }}
              onClick={() => fs.setTags(node.id, node.tags?.includes(t.name) ? node.tags.filter((x) => x !== t.name) : [...(node.tags ?? []), t.name])}
            />
          ))}
        </div>
        <Section title="General">
          {kv('Kind', node.kind === 'folder' ? 'Folder' : kindOf(node.mime, node.name))}
          {kv('Size', `${formatBytes(size)}${node.kind === 'file' ? ` (${size.toLocaleString()} bytes)` : ''}`)}
          {kv('Where', pathString(nodes, node.parentId ?? 'root'))}
          {kv('Created', new Date(node.createdAt).toLocaleString())}
          {kv('Modified', new Date(node.modifiedAt).toLocaleString())}
          {kv('Storage', node.assetUrl ? 'Bundled with the simulator' : 'This browser (IndexedDB)')}
        </Section>
        <Section title="Name & Extension">
          <input
            className="field"
            value={name}
            disabled={node.system}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void fs.rename(node.id, name).then((n) => n && setName(n))}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </Section>
        {node.kind === 'file' && (
          <Section title="Open with">
            <select className="popup w-full" value={appForMime(node.mime, node.name)} onChange={(e) => openFile(node.id, e.target.value)}>
              {appsForMime(node.mime)
                .filter((a) => isInstalled(a.id))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </Section>
        )}
        <Section title="Sharing & Permissions" open={false}>
          {kv('You', node.system ? 'Read only' : 'Read & Write')}
          {kv('Note', 'Files live in the simulator’s virtual disk, separate from your real computer.')}
        </Section>
      </div>
    </div>
  );
}
