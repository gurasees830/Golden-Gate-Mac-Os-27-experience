import { Search, X } from 'lucide-react';
import { forwardRef, type ReactNode, type InputHTMLAttributes } from 'react';

export function Toggle({ on, onChange, disabled, small, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; small?: boolean; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`toggle ${on ? 'on' : ''} ${small ? 'sm' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!on)}
    />
  );
}

export function Segmented<T extends string>({ value, options, onChange, className = '' }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={`segmented ${className}`} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} title={o.title} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Popup<T extends string | number>({ value, options, onChange, className = '', style, ariaLabel }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; className?: string; style?: React.CSSProperties; ariaLabel?: string }) {
  return (
    <select
      aria-label={ariaLabel}
      className={`popup ${className}`}
      style={style}
      value={String(value)}
      onChange={(e) => {
        const o = options.find((x) => String(x.value) === e.target.value);
        if (o) onChange(o.value);
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Slider({ value, min = 0, max = 1, step = 0.01, onChange, onCommit, ariaLabel, className = '' }: { value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void; onCommit?: (v: number) => void; ariaLabel?: string; className?: string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      aria-label={ariaLabel}
      className={`slider ${className}`}
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ ['--pct' as string]: `${pct}%` }}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
    />
  );
}

export const SearchField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { onClear?: () => void; width?: number | string }>(function SearchField(
  { onClear, width = 180, className = '', ...props },
  ref,
) {
  return (
    <div className={`search-field ${className}`} style={{ width }} data-no-drag>
      <Search size={14} className="flex-none" />
      <input ref={ref} spellCheck={false} placeholder="Search" {...props} />
      {props.value ? (
        <button className="flex-none rounded-full bg-[var(--text-3)] text-[var(--bg)] w-[14px] h-[14px] grid place-items-center border-0 p-0" onClick={onClear} aria-label="Clear search">
          <X size={10} strokeWidth={3} />
        </button>
      ) : null}
    </div>
  );
});

export function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={`inline-flex items-center gap-2 ${disabled ? 'opacity-50' : ''}`}>
      <input type="checkbox" className="check" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label && <span>{label}</span>}
    </label>
  );
}

export function EmptyState({ icon, title, subtitle, action }: { icon?: ReactNode; title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-2 p-8 muted">
      {icon && <div className="faint mb-1">{icon}</div>}
      <div className="text-[15px] font-semibold" style={{ color: 'var(--text-2)' }}>
        {title}
      </div>
      {subtitle && <div className="text-[12.5px] max-w-[320px] faint">{subtitle}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Form row used by System Settings and app preference panes. */
export function Row({ label, sub, children, className = '' }: { label: ReactNode; sub?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-4 min-h-[38px] px-3 py-[7px] ${className}`}>
      <div className="flex-1 min-w-0">
        <div className="text-[13px]">{label}</div>
        {sub && <div className="text-[11.5px] muted mt-[1px]">{sub}</div>}
      </div>
      <div className="flex items-center gap-2 flex-none">{children}</div>
    </div>
  );
}

export function Group({ children, title, footer, className = '' }: { children: ReactNode; title?: ReactNode; footer?: ReactNode; className?: string }) {
  return (
    <section className={`mb-5 ${className}`}>
      {title && <h3 className="text-[13px] font-semibold mb-[6px] px-1">{title}</h3>}
      <div className="card divide-y divide-[var(--separator)] overflow-hidden">{children}</div>
      {footer && <div className="text-[11.5px] muted mt-[6px] px-1 leading-snug">{footer}</div>}
    </section>
  );
}

export function Avatar({ name, color, image, size = 32 }: { name: string; color?: string; image?: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  if (image) return <img src={image} alt="" className="rounded-full object-cover flex-none" style={{ width: size, height: size }} />;
  return (
    <div
      className="rounded-full grid place-items-center text-white font-semibold flex-none"
      style={{ width: size, height: size, fontSize: size * 0.4, background: `linear-gradient(${color ?? '#8e8e93'}, color-mix(in srgb, ${color ?? '#8e8e93'} 70%, #000))` }}
      aria-hidden="true"
    >
      {initials || '?'}
    </div>
  );
}

export function ProgressRing({ value, size = 28, stroke = 3 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(128,128,128,.25)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - value)} strokeLinecap="round" />
    </svg>
  );
}
