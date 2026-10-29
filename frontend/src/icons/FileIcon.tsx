import { useEffect, useState } from 'react';
import type { FsNode } from '../types';
import { AppIcon, FolderSvg, TrashIcon, type FolderGlyph } from './AppIcon';
import { fileUrl } from '../stores/fs';

const SPECIAL: Record<string, FolderGlyph> = {
  desktop: 'desktop',
  documents: 'documents',
  downloads: 'downloads',
  pictures: 'pictures',
  music: 'music',
  movies: 'movies',
  applications: 'applications',
  home: 'home',
  library: 'library',
  system: 'system',
  users: 'users',
  public: 'public',
};

const EXT_COLORS: Record<string, string> = {
  txt: '#8e8e93', md: '#5e5ce6', pdf: '#ff3b30', zip: '#a2845e', js: '#f5b800', ts: '#3178c6', java: '#e76f00', json: '#34c759',
  html: '#ff6b2c', css: '#0a84ff', py: '#3776ab', mp3: '#ff2d55', wav: '#ff2d55', m4a: '#ff2d55', mp4: '#5856d6', mov: '#5856d6', webm: '#5856d6',
};

export function DocumentSvg({ size = 64, ext = '', lines = true }: { size?: number; ext?: string; lines?: boolean }) {
  const color = EXT_COLORS[ext] ?? '#8e8e93';
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <path d="M25 7h33l21 21v61a4 4 0 0 1-4 4H25a4 4 0 0 1-4-4V11a4 4 0 0 1 4-4z" fill="#fff" stroke="#c7c7cc" strokeWidth="1.2" />
      <path d="M58 7v17a4 4 0 0 0 4 4h17" fill="#ececf0" stroke="#c7c7cc" strokeWidth="1.2" />
      {lines && [36, 43, 50, 57, 64].map((y, i) => <rect key={y} x="30" y={y} width={i === 4 ? 22 : 40} height="2.4" rx="1.2" fill="#d8d8dd" />)}
      {ext && (
        <>
          <rect x="25" y="72" width="50" height="14" rx="3" fill={color} />
          <text x="50" y="82.5" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#fff" fontFamily="Inter Variable, system-ui, sans-serif">
            {ext.toUpperCase().slice(0, 4)}
          </text>
        </>
      )}
    </svg>
  );
}

function Thumb({ node, size }: { node: FsNode; size: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void fileUrl(node.id).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [node.id, node.modifiedAt]);
  if (!url) return <DocumentSvg size={size} ext={node.name.split('.').pop()} lines={false} />;
  return (
    <div style={{ width: size, height: size }} className="flex items-center justify-center">
      <img
        src={url}
        alt=""
        draggable={false}
        style={{ maxWidth: size * 0.92, maxHeight: size * 0.82, borderRadius: 3, boxShadow: '0 0 0 1.5px #fff, 0 1px 4px rgba(0,0,0,.35)' }}
      />
    </div>
  );
}

export function FileIcon({ node, size = 64 }: { node: FsNode; size?: number }) {
  if (node.id === 'trash') return <TrashIcon size={size} />;
  if (node.kind === 'folder') {
    const tagColor = node.tags?.length ? undefined : undefined;
    return <FolderSvg size={size} glyph={SPECIAL[node.id] ?? null} tint={tagColor} />;
  }
  if (node.mime.startsWith('image/')) return <Thumb node={node} size={size} />;
  if (node.appId) return <AppIcon id={node.appId} size={size} />;
  const ext = node.name.includes('.') ? node.name.split('.').pop()!.toLowerCase() : '';
  return <DocumentSvg size={size} ext={ext} lines={node.mime.startsWith('text/') || ext === 'md'} />;
}
