import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useSettings, hashPasscode, DEFAULT_NOTIF, type FocusMode } from '../../stores/settings';
import { Group, Row, Toggle, Popup, Slider, Avatar } from '../../components/ui';
import { allApps } from '../../lib/appRegistry';
import { isInstalled, useApps } from '../../stores/apps';
import { AppIcon } from '../../icons/AppIcon';
import { ALERT_SOUNDS, playAlert, playUi } from '../../lib/sound';
import { PaneHeader } from './Settings';
import { notify } from '../../stores/notifications';
import { promptDialog, useSystem } from '../../stores/system';
import { formatShortcut } from '../../shell/Menu';
import { cloud, cloudEnabled, pullPreferences, pushPreferences } from '../../services/cloud';
import { isMacHost } from '../../lib/env';

export function NotificationsPane() {
  const n = useSettings((s) => s.notifications);
  const patch = useSettings((s) => s.patch);
  useApps();
  const [sel, setSel] = useState<string | null>(null);
  const apps = allApps().filter((a) => !a.hidden && isInstalled(a.id) && a.id !== 'launchpad');
  const pref = (id: string) => ({ ...DEFAULT_NOTIF, ...(n.perApp[id] ?? {}) });
  const setPref = (id: string, p: Partial<typeof DEFAULT_NOTIF>) => patch('notifications', { perApp: { ...n.perApp, [id]: { ...pref(id), ...p } } });
  if (sel) {
    const p = pref(sel);
    const def = allApps().find((a) => a.id === sel)!;
    return (
      <>
        <button className="btn ghost mb-3" onClick={() => setSel(null)}>‹ Notifications</button>
        <div className="flex items-center gap-3 mb-4">
          <AppIcon id={sel} size={44} />
          <div className="text-[17px] font-bold">{def.name}</div>
        </div>
        <Group>
          <Row label="Allow notifications">
            <Toggle on={p.allow} onChange={(v) => setPref(sel, { allow: v })} />
          </Row>
          <Row label="Alert style">
            <Popup value={p.style} onChange={(v) => setPref(sel, { style: v })} options={[{ value: 'none', label: 'None' }, { value: 'banners', label: 'Banners' }, { value: 'alerts', label: 'Alerts (stay until dismissed)' }]} />
          </Row>
          <Row label="Play sound for notifications">
            <Toggle on={p.sound} onChange={(v) => setPref(sel, { sound: v })} />
          </Row>
          <Row label="Badge application icon">
            <Toggle on={p.badge} onChange={(v) => setPref(sel, { badge: v })} />
          </Row>
          <Row label="Test">
            <button className="btn" onClick={() => notify({ appId: sel, title: `${def.name} test`, body: 'This is how notifications from this app look.' })}>Send Test Notification</button>
          </Row>
        </Group>
      </>
    );
  }
  return (
    <>
      <PaneHeader id="notifications" title="Notifications" />
      <Group>
        <Row label="Show previews">
          <Popup value={n.previews} onChange={(v) => patch('notifications', { previews: v })} options={[{ value: 'always', label: 'Always' }, { value: 'unlocked', label: 'When Unlocked' }, { value: 'never', label: 'Never' }]} />
        </Row>
      </Group>
      <Group title="Application Notifications">
        {apps.map((a) => (
          <Row key={a.id} label={<span className="flex items-center gap-2"><AppIcon id={a.id} size={22} /> {a.name}</span>} sub={pref(a.id).allow ? pref(a.id).style[0].toUpperCase() + pref(a.id).style.slice(1) : 'Off'}>
            <button className="btn ghost" onClick={() => setSel(a.id)}>›</button>
          </Row>
        ))}
      </Group>
    </>
  );
}

export function SoundPane() {
  const s = useSettings((x) => x.sound);
  const patch = useSettings((x) => x.patch);
  return (
    <>
      <PaneHeader id="sound" title="Sound">All system sounds are synthesized in your browser.</PaneHeader>
      <Group title="Sound Effects">
        <Row label="Alert sound">
          <Popup value={s.alertSound} onChange={(v) => { patch('sound', { alertSound: v }); playAlert(v); }} options={Object.keys(ALERT_SOUNDS).map((k) => ({ value: k, label: k }))} />
        </Row>
        <Row label="Alert volume">
          <div className="w-[200px]">
            <Slider value={s.alertVolume} onChange={(v) => patch('sound', { alertVolume: v })} onCommit={() => playAlert()} ariaLabel="Alert volume" />
          </div>
        </Row>
        <Row label="Play sound on startup">
          <Toggle on={s.startupSound} onChange={(v) => patch('sound', { startupSound: v })} />
        </Row>
        <Row label="Play user interface sound effects">
          <Toggle on={s.uiSounds} onChange={(v) => patch('sound', { uiSounds: v })} />
        </Row>
        <Row label="Play feedback when volume is changed">
          <Toggle on={s.volumeFeedback} onChange={(v) => patch('sound', { volumeFeedback: v })} />
        </Row>
      </Group>
      <Group title="Output" footer="Output goes to your browser’s default audio device.">
        <Row label="Output volume">
          <div className="w-[200px]">
            <Slider value={s.muted ? 0 : s.volume} onChange={(v) => patch('sound', { volume: v, muted: v === 0 })} onCommit={() => s.volumeFeedback && playUi('volume')} ariaLabel="Output volume" />
          </div>
          <label className="flex items-center gap-1 text-[12px]">
            <input type="checkbox" className="check" checked={s.muted} onChange={(e) => patch('sound', { muted: e.target.checked })} /> Mute
          </label>
        </Row>
      </Group>
    </>
  );
}

export function FocusPane() {
  const f = useSettings((s) => s.focus);
  const patch = useSettings((s) => s.patch);
  const modes: { id: FocusMode; label: string; color: string }[] = [
    { id: 'dnd', label: 'Do Not Disturb', color: '#5e5ce6' },
    { id: 'work', label: 'Work', color: '#30b0c7' },
    { id: 'personal', label: 'Personal', color: '#bf5af2' },
    { id: 'sleep', label: 'Sleep', color: '#34c759' },
  ];
  return (
    <>
      <PaneHeader id="focus" title="Focus">While a Focus is on, banners and notification sounds are silenced. Notifications still collect in Notification Center.</PaneHeader>
      <Group>
        {modes.map((m) => (
          <Row key={m.id} label={<span className="flex items-center gap-2"><span className="w-[10px] h-[10px] rounded-full" style={{ background: m.color }} /> {m.label}</span>}>
            <Toggle on={f.active === m.id} onChange={(v) => patch('focus', { active: v ? m.id : null, until: null })} />
          </Row>
        ))}
      </Group>
      {f.active && (
        <Group>
          <Row label="Turn off automatically">
            <Popup value={f.until ? 'timed' : 'never'} onChange={(v) => patch('focus', { until: v === 'timed' ? Date.now() + 3600000 : null })} options={[{ value: 'never', label: 'Until I turn it off' }, { value: 'timed', label: 'In 1 hour' }]} />
          </Row>
        </Group>
      )}
    </>
  );
}

export function LockScreenPane() {
  const l = useSettings((s) => s.lockScreen);
  const hasPass = useSettings((s) => !!s.user.passcodeHash);
  const patch = useSettings((s) => s.patch);
  return (
    <>
      <PaneHeader id="lockscreen" title="Lock Screen" />
      <Group>
        <Row label="Start Screen Saver when inactive">
          <Popup value={l.screensaverAfterMin} onChange={(v) => patch('lockScreen', { screensaverAfterMin: v })} options={[0, 1, 2, 5, 10, 20, 60].map((m) => ({ value: m, label: m === 0 ? 'Never' : `For ${m} minute${m === 1 ? '' : 's'}` }))} />
        </Row>
        <Row label="Require passcode after screen saver begins or display is turned off" sub={hasPass ? undefined : 'Set a passcode in Users & Groups first.'}>
          <Toggle on={l.requirePasswordAfterSleep} disabled={!hasPass} onChange={(v) => patch('lockScreen', { requirePasswordAfterSleep: v })} />
        </Row>
      </Group>
    </>
  );
}

const PERM_APPS: Record<'location' | 'camera' | 'microphone' | 'screen' | 'files', string[]> = {
  location: ['maps', 'weather'],
  camera: ['facetime', 'photobooth'],
  microphone: ['voicememos', 'facetime'],
  screen: ['screenshot'],
  files: ['finder', 'textedit', 'photos', 'music'],
};

export function PrivacyPane() {
  const p = useSettings((s) => s.privacy);
  const set = useSettings((s) => s.set);
  const kinds: { k: keyof typeof PERM_APPS; label: string }[] = [
    { k: 'location', label: 'Location Services' },
    { k: 'camera', label: 'Camera' },
    { k: 'microphone', label: 'Microphone' },
    { k: 'screen', label: 'Screen & System Audio Recording' },
    { k: 'files', label: 'Files & Folders (your computer)' },
  ];
  return (
    <>
      <PaneHeader id="privacy" title="Privacy & Security">
        Apps in Golden Gate ask here first. If you allow an app, your browser may still ask its own permission. Turning an app off here blocks it in the simulator.
      </PaneHeader>
      <Group>
        <Row label="Location Services">
          <Toggle on={p.locationServices} onChange={(v) => set({ privacy: { ...p, locationServices: v } })} />
        </Row>
      </Group>
      {kinds.map(({ k, label }) => (
        <Group key={k} title={label}>
          {PERM_APPS[k].filter((a) => allApps().some((x) => x.id === a)).map((a) => {
            const val = p[k][a];
            const name = allApps().find((x) => x.id === a)?.name ?? a;
            return (
              <Row key={a} label={<span className="flex items-center gap-2"><AppIcon id={a} size={20} /> {name}</span>} sub={val === undefined ? 'Will ask on first use' : undefined}>
                <Toggle on={val !== false} onChange={(v) => set({ privacy: { ...p, [k]: { ...p[k], [a]: v } } })} />
              </Row>
            );
          })}
        </Group>
      ))}
      <Group footer="Golden Gate never sends analytics. This switch is here to show it’s off.">
        <Row label="Share analytics">
          <Toggle on={false} disabled onChange={() => undefined} />
        </Row>
      </Group>
    </>
  );
}

export function UsersPane() {
  const s = useSettings();
  const [pass, setPass] = useState('');
  const [msg, setMsg] = useState('');
  const colors = ['#ff9f0a', '#ff375f', '#bf5af2', '#5e5ce6', '#0a84ff', '#30d158', '#64d2ff', '#8e8e93'];
  const setPasscode = async () => {
    if (!pass) {
      s.set({ user: { ...s.user, passcodeHash: undefined, passcodeSalt: undefined } });
      setMsg('Passcode removed.');
      return;
    }
    const salt = Math.random().toString(36).slice(2);
    s.set({ user: { ...s.user, passcodeHash: await hashPasscode(pass, salt), passcodeSalt: salt } });
    setPass('');
    setMsg('Passcode updated.');
  };
  const pickPhoto = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = 160;
        const ctx = c.getContext('2d')!;
        const m = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, 160, 160);
        s.set({ user: { ...s.user, avatarImage: c.toDataURL('image/jpeg', 0.85) } });
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(f);
    };
    input.click();
  };
  return (
    <>
      <div className="flex flex-col items-center mb-6">
        <button className="border-0 bg-transparent p-0" onClick={pickPhoto} aria-label="Change picture">
          <Avatar name={s.user.fullName} color={s.user.avatarColor} image={s.user.avatarImage} size={76} />
        </button>
        <div className="text-[19px] font-bold mt-3">{s.user.fullName}</div>
        <div className="text-[12px] muted">Admin · Local account</div>
        <div className="flex gap-2 mt-3">
          {colors.map((c) => (
            <button key={c} aria-label={`Avatar color ${c}`} className="w-[16px] h-[16px] rounded-full border-0 p-0" style={{ background: c, boxShadow: s.user.avatarColor === c && !s.user.avatarImage ? '0 0 0 2px var(--bg), 0 0 0 3.5px var(--accent)' : undefined }} onClick={() => s.set({ user: { ...s.user, avatarColor: c, avatarImage: undefined } })} />
          ))}
        </div>
      </div>
      <Group>
        <Row label="Full name">
          <input className="field !w-[220px]" value={s.user.fullName} onChange={(e) => s.set({ user: { ...s.user, fullName: e.target.value } })} />
        </Row>
        <Row label="Account name" sub="Used for your home folder and Terminal prompt.">
          <span className="muted">{s.user.accountName}</span>
        </Row>
      </Group>
      <Group title="Simulator Passcode" footer="Protects the simulated lock screen in this browser only. Don’t reuse a real password. Leave empty and press Save to remove.">
        <Row label={s.user.passcodeHash ? 'Change passcode' : 'Set passcode'}>
          <input className="field !w-[160px]" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
          <button className="btn" onClick={() => void setPasscode()}>Save</button>
        </Row>
        <Row label="Passcode hint">
          <input className="field !w-[220px]" value={s.user.hint ?? ''} onChange={(e) => s.set({ user: { ...s.user, hint: e.target.value } })} />
        </Row>
        {msg && <div className="px-3 py-2 text-[12px] text-[#34c759]">{msg}</div>}
      </Group>
      <CloudAccount />
    </>
  );
}

function CloudAccount() {
  const c = useSettings((s) => s.cloud);
  const patch = useSettings((s) => s.patch);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!cloudEnabled)
    return (
      <Group title="Golden Gate Cloud" footer="This deployment has no backend configured, so everything stays in this browser. Self-host the Spring Boot backend and build with VITE_API_URL to enable accounts and preference sync.">
        <Row label="Cloud account" sub="Not available on this deployment" />
      </Group>
    );
  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      await cloud.csrf();
      const u = mode === 'login' ? await cloud.login(email, password) : await cloud.register(email, password, useSettings.getState().user.fullName);
      patch('cloud', { email: u.email, displayName: u.displayName });
      await pullPreferences().catch(() => pushPreferences());
      setPassword('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (c.email)
    return (
      <Group title="Golden Gate Cloud">
        <Row label={c.email} sub={c.lastSync ? `Last synced ${new Date(c.lastSync).toLocaleString()}` : 'Not synced yet'}>
          <button className="btn" onClick={() => void pushPreferences().then(() => useSystem.getState().showToast('Preferences synced.')).catch((e: Error) => useSystem.getState().showToast(e.message))}>Sync Now</button>
          <button className="btn" onClick={() => void cloud.logout().finally(() => patch('cloud', { email: null, displayName: null }))}>Sign Out</button>
        </Row>
      </Group>
    );
  return (
    <Group title="Golden Gate Cloud" footer="Your simulator account on this deployment’s backend (not an Apple Account). Only preferences are synced.">
      <Row label="Email">
        <input className="field !w-[220px]" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Row>
      <Row label="Password">
        <input className="field !w-[220px]" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Row>
      <Row label={err ? <span className="text-[#ff3b30] text-[12px]">{err}</span> : ''}>
        <button className="btn ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Create account' : 'Have an account?'}</button>
        <button className="btn primary" disabled={busy || !email || password.length < 8} onClick={() => void submit()}>{mode === 'login' ? 'Sign In' : 'Register'}</button>
      </Row>
    </Group>
  );
}

export function InternetPane() {
  const mail = useSettings((s) => s.user.accountName);
  return (
    <>
      <PaneHeader id="internet" title="Internet Accounts">Accounts used by Mail, Contacts and Calendar inside the simulator.</PaneHeader>
      <Group>
        <Row label="Local Mail" sub={`${mail}@golden-gate.local — delivers only within this simulator`} />
        <Row label="On My Mac" sub="Contacts, Calendars and Reminders stored in this browser" />
      </Group>
      <Group footer="Real email, calendar and contact services need a secure server-side integration and aren’t connected in this version.">
        <Row label="Add Account…">
          <button className="btn" onClick={() => useSystem.getState().showToast('External accounts need the backend integration described in the README.')}>Add Account…</button>
        </Row>
      </Group>
    </>
  );
}

const SHORTCUT_LIST: [string, string][] = [
  ['spotlight', 'Show Spotlight search'],
  ['launchpad', 'Show Launchpad (F4)'],
  ['screenshot', 'Screenshot of desktop (⇧⌘3)'],
  ['screenshot-window', 'Screenshot of front window (⇧⌘4)'],
  ['lock', 'Lock Screen (⌃⌘Q)'],
  ['logout', 'Log Out (⇧⌘Q)'],
  ['forcequit', 'Force Quit (⌥⌘Esc)'],
  ['shortcuts', 'Keyboard shortcut list (⌘/)'],
  ['alt-close', 'Close window with Alt+W'],
  ['alt-quit', 'Quit app with Alt+Q'],
];

export function KeyboardPane() {
  const k = useSettings((s) => s.keyboard);
  const patch = useSettings((s) => s.patch);
  const toggle = (id: string, on: boolean) => patch('keyboard', { disabled: on ? k.disabled.filter((x) => x !== id) : [...k.disabled, id] });
  return (
    <>
      <PaneHeader id="keyboard" title="Keyboard">{isMacHost ? 'You’re on a Mac: ⌘ is the Command key.' : 'On Windows and Linux, ⌘ maps to Ctrl and ⌥ maps to Alt.'}</PaneHeader>
      <Group>
        <Row label="Keyboard navigation" sub="Use Tab to move focus between controls (shows focus rings).">
          <Toggle on={k.keyboardNavigation} onChange={(v) => patch('keyboard', { keyboardNavigation: v })} />
        </Row>
        <Row label="Show shortcuts in menus as">
          <Popup value={k.symbols} onChange={(v) => patch('keyboard', { symbols: v })} options={[{ value: 'mac', label: 'Mac symbols (⌘⇧)' }, { value: 'pc', label: 'PC keys (Ctrl+Shift)' }]} />
        </Row>
      </Group>
      <Group title="Keyboard Shortcuts">
        <Row label="Enable keyboard shortcuts">
          <Toggle on={k.shortcutsEnabled} onChange={(v) => patch('keyboard', { shortcutsEnabled: v })} />
        </Row>
        {SHORTCUT_LIST.map(([id, label]) => (
          <Row key={id} label={label}>
            <Toggle small on={!k.disabled.includes(id)} disabled={!k.shortcutsEnabled} onChange={(v) => toggle(id, v)} />
          </Row>
        ))}
        <Row label="Spotlight">
          <span className="kbd">{formatShortcut(k.spotlightShortcut, k.symbols)}</span>
        </Row>
      </Group>
      <Group title="Text Replacements" footer="Replacements apply as you type in Notes, TextEdit and Stickies.">
        {k.textReplacements.map((r, i) => (
          <Row key={i} label={<span><span className="kbd">{r.from}</span> → {r.to}</span>}>
            <button className="btn ghost" aria-label="Remove" onClick={() => patch('keyboard', { textReplacements: k.textReplacements.filter((_, j) => j !== i) })}>
              <Trash2 size={13} />
            </button>
          </Row>
        ))}
        <Row label="">
          <button
            className="btn"
            onClick={async () => {
              const from = await promptDialog('Add Replacement', 'Type the shortcut text:', '');
              if (!from) return;
              const to = await promptDialog('Add Replacement', `Replace “${from}” with:`, '');
              if (to == null) return;
              patch('keyboard', { textReplacements: [...k.textReplacements, { from, to }] });
            }}
          >
            Add…
          </button>
        </Row>
      </Group>
    </>
  );
}

export function TrackpadPane() {
  const p = useSettings((s) => s.pointer);
  const patch = useSettings((s) => s.patch);
  return (
    <>
      <PaneHeader id="trackpad" title="Mouse & Trackpad">These settings change how the simulator interprets your mouse; your computer’s settings are unchanged.</PaneHeader>
      <Group>
        <Row label="Natural scrolling" sub="Content tracks finger movement (Launchpad paging, Maps zoom).">
          <Toggle on={p.naturalScrolling} onChange={(v) => patch('pointer', { naturalScrolling: v })} />
        </Row>
        <Row label="Double-click speed">
          <span className="text-[11px] muted">Slow</span>
          <div className="w-[160px]">
            <Slider value={900 - p.doubleClickMs} min={100} max={700} step={10} onChange={(v) => patch('pointer', { doubleClickMs: 900 - v })} ariaLabel="Double-click speed" />
          </div>
          <span className="text-[11px] muted">Fast</span>
        </Row>
        <Row label="Secondary click" sub="Right-click opens context menus.">
          <Toggle on={p.secondaryClick} onChange={(v) => patch('pointer', { secondaryClick: v })} />
        </Row>
      </Group>
      <div className="card p-4 flex items-center gap-3">
        <span className="text-[12px] flex-1">Test your double-click speed:</span>
        <DoubleClickTester />
      </div>
    </>
  );
}

function DoubleClickTester() {
  const [ok, setOk] = useState(false);
  const ms = useSettings((s) => s.pointer.doubleClickMs);
  const [last, setLast] = useState(0);
  return (
    <button
      className="w-[54px] h-[54px] rounded-[12px] border-0 grid place-items-center text-[22px]"
      style={{ background: ok ? '#34c759' : 'var(--field)', color: ok ? '#fff' : 'inherit' }}
      onClick={() => {
        const now = Date.now();
        if (now - last < ms) {
          setOk(true);
          setTimeout(() => setOk(false), 800);
        }
        setLast(now);
      }}
    >
      {ok ? '✓' : '⟡'}
    </button>
  );
}
