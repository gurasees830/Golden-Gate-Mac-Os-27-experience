import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useFocusedWindowId, useWindows } from '../stores/windows';
import { Window, tilePreviewBus } from './Window';

export function WindowManager() {
  const windows = useWindows((s) => s.windows);
  const [preview, setPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useEffect(() => {
    tilePreviewBus.set = setPreview;
    return () => {
      tilePreviewBus.set = () => {};
    };
  }, []);
  const focusedId = useFocusedWindowId();
  return (
    <>
      {preview && (
        <div
          className="absolute rounded-[18px] pointer-events-none anim-fade"
          style={{ left: preview.x, top: preview.y, width: preview.w, height: preview.h, zIndex: 4000, background: 'rgba(255,255,255,0.18)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.55), 0 10px 40px rgba(0,0,0,.2)', backdropFilter: 'blur(12px)', transition: 'all .18s cubic-bezier(.2,.9,.25,1)' }}
        />
      )}
      <AnimatePresence>
        {windows.map((w) => (
          <Window key={w.id} win={w} focused={w.id === focusedId} />
        ))}
      </AnimatePresence>
    </>
  );
}
