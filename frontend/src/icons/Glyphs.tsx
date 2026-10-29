/** Small monochrome glyphs for the menu bar (drawn originally; no Apple logo). */

/** Golden Gate system mark: two bridge towers joined by a suspension cable. */
export function SystemMark({ size = 15, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-label="System menu">
      <g fill="currentColor">
        <path d="M5.2 3.2h2.2v18.3H5.2zM16.6 3.2h2.2v18.3h-2.2z" />
        <path d="M4.6 14.2h14.8v1.9H4.6zM4.9 6.4h3v1.2h-3zM16.3 6.4h3v1.2h-3zM4.9 10h3v1.2h-3zM16.3 10h3v1.2h-3z" />
      </g>
      <path d="M1 8.5C3.5 6 6.3 4.2 6.3 4.2 9 11.8 15 11.8 17.7 4.2c0 0 2.8 1.8 5.3 4.3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function BatteryGlyph({ level, charging, size = 26 }: { level: number | null; charging?: boolean; size?: number }) {
  const l = level == null ? 1 : Math.max(0.04, Math.min(1, level));
  const color = level != null && level <= 0.2 && !charging ? '#ff3b30' : 'currentColor';
  return (
    <svg width={size} height={size * 0.5} viewBox="0 0 26 13" aria-hidden="true">
      <rect x="0.6" y="0.6" width="22" height="11.8" rx="3.4" fill="none" stroke="currentColor" strokeOpacity=".45" strokeWidth="1.1" />
      <rect x="23.6" y="4.2" width="1.8" height="4.6" rx="0.9" fill="currentColor" fillOpacity=".45" />
      <rect x="2.2" y="2.2" width={18.8 * l} height="8.6" rx="2" fill={color} />
      {charging && <path d="M12.6 1.6L8.6 7.2h3.2l-1.2 4.6 4.2-5.8h-3.3z" fill="#fff" stroke="#000" strokeOpacity=".25" strokeWidth=".4" />}
    </svg>
  );
}

export function ControlCenterGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="1.2" y="2.4" width="15.6" height="5.4" rx="2.7" />
      <circle cx="13.9" cy="5.1" r="1.6" fill="currentColor" />
      <rect x="1.2" y="10.2" width="15.6" height="5.4" rx="2.7" />
      <circle cx="4.1" cy="12.9" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function WifiGlyph({ on, strength = 3, size = 17 }: { on: boolean; strength?: number; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 16" aria-hidden="true">
      <g fill="currentColor">
        <path d="M10 15.2l2.4-2.9a3.6 3.6 0 0 0-4.8 0z" opacity={on ? 1 : 0.3} />
        <path d="M5.6 9.9l1.3 1.6a4.8 4.8 0 0 1 6.2 0l1.3-1.6a6.9 6.9 0 0 0-8.8 0z" opacity={on && strength >= 2 ? 1 : 0.3} />
        <path d="M3.2 7l1.3 1.6a8.6 8.6 0 0 1 11 0L16.8 7a10.7 10.7 0 0 0-13.6 0z" opacity={on && strength >= 3 ? 1 : 0.3} />
        <path d="M.8 4.1l1.3 1.6a12.4 12.4 0 0 1 15.8 0l1.3-1.6a14.5 14.5 0 0 0-18.4 0z" opacity={on && strength >= 3 ? 1 : 0.3} />
      </g>
      {!on && <path d="M3 1l14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}
