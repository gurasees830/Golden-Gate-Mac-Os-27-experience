import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Moon, RotateCcw, Power, Check, Lock } from 'lucide-react';
import { useSystem } from '../stores/system';
import { useSettings, hashPasscode, ACCENTS, type Accent } from '../stores/settings';
import { SystemMark } from '../icons/Glyphs';
import { Wallpaper, WALLPAPERS, thumbUrl } from './Wallpaper';
import { useClock } from '../lib/clock';
import { Avatar } from '../components/ui';
import { playStartup } from '../lib/sound';
import { restoreSession, wake } from './actions';
import { notify } from '../stores/notifications';
import { useFs } from '../stores/fs';
import { waitForHydration } from '../lib/persist';

export function BootScreen({ onDone }: { onDone: () => void }) {
  const [p, setP] = useState(0);
  const reason = useSystem((s) => s.bootReason);
  useEffect(() => {
    let alive = true;
    const start = Date.now();
    const min = reason === 'update' ? 4200 : 1900;
    const tick = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / min);
      if (alive) setP((v) => Math.max(v, t * 0.92));
    }, 50);
    void Promise.all([waitForHydration(), useFs.getState().ready ? Promise.resolve() : useFs.getState().init(), new Promise((r) => setTimeout(r, min))]).then(() => {
      if (!alive) return;
      setP(1);
      setTimeout(() => alive && onDone(), 280);
    });
    return () => {
      alive = false;
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="absolute inset-0 bg-black flex flex-col items-center justify-center gap-[56px] text-white" role="progressbar" aria-label="Starting up" aria-valuenow={Math.round(p * 100)}>
      <SystemMark size={88} />
      <div className="w-[200px] h-[5px] rounded-full bg-white/25 overflow-hidden">
        <div className="h-full bg-white rounded-full transition-[width] duration-200" style={{ width: `${p * 100}%` }} />
      </div>
      {reason === 'update' && <div className="text-[12px] text-white/60 -mt-8">Installing update…</div>}
    </div>
  );
}

function BigClock() {
  const now = useClock(1000);
  const locale = useSettings((s) => s.region.locale);
  const h24 = useSettings((s) => s.menubar.clock.use24h);
  const time = now.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: !h24 }).replace(/\s?[AP]M$/i, '');
  return (
    <div className="flex flex-col items-center text-white select-none" style={{ textShadow: '0 2px 20px rgba(0,0,0,.25)' }}>
      <div className="text-[22px] font-semibold opacity-90">{now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <div className="text-[110px] font-bold leading-none tracking-[-0.03em] mt-1" style={{ fontVariationSettings: '"wght" 700', opacity: 0.92 }}>
        {time}
      </div>
    </div>
  );
}

export function LoginScreen({ mode }: { mode: 'login' | 'locked' }) {
  const user = useSettings((s) => s.user);
  const set = useSystem((s) => s.set);
  const [pw, setPw] = useState('');
  const [shake, setShake] = useState(false);
  const [tries, setTries] = useState(0);
  const [active, setActive] = useState(mode === 'login');
  const inputRef = useRef<HTMLInputElement>(null);
  const needsPass = !!user.passcodeHash;

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!active) setActive(true);
      if (e.key === 'Enter' && !needsPass) void submit();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  useEffect(() => {
    if (active) setTimeout(() => inputRef.current?.focus(), 50);
  }, [active]);

  const submit = async () => {
    if (needsPass) {
      const h = await hashPasscode(pw, user.passcodeSalt ?? '');
      if (h !== user.passcodeHash) {
        setShake(true);
        setTries((t) => t + 1);
        setPw('');
        setTimeout(() => setShake(false), 500);
        return;
      }
    }
    const wasLogin = mode === 'login';
    set({ power: 'desktop' });
    if (wasLogin) void restoreSession();
  };

  return (
    <div className="absolute inset-0 overflow-hidden" onPointerDown={() => setActive(true)}>
      <Wallpaper blur={active ? 24 : 0} dim={active ? 0.12 : 0.05} />
      <div className="absolute top-[9%] inset-x-0 flex justify-center transition-transform duration-500" style={{ transform: active ? 'scale(.82) translateY(-30px)' : undefined }}>
        <BigClock />
      </div>
      <div className="absolute bottom-[13%] inset-x-0 flex flex-col items-center gap-3 text-white">
        <button className="border-0 bg-transparent p-0 rounded-full" onClick={() => (needsPass ? setActive(true) : void submit())} aria-label={`Log in as ${user.fullName}`}>
          <div className="rounded-full p-[2px]" style={{ boxShadow: '0 6px 24px rgba(0,0,0,.3)' }}>
            <Avatar name={user.fullName} color={user.avatarColor} image={user.avatarImage} size={active ? 80 : 56} />
          </div>
        </button>
        <div className="text-[15px] font-semibold" style={{ textShadow: '0 1px 6px rgba(0,0,0,.4)' }}>
          {user.fullName}
        </div>
        {active && needsPass && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="relative"
            style={{ animation: shake ? 'gg-shake .45s' : undefined }}
          >
            <input
              ref={inputRef}
              type="password"
              aria-label="Password"
              autoComplete="off"
              className="w-[190px] h-[30px] rounded-full border-0 px-4 pr-9 text-[13px] text-white placeholder:text-white/60 outline-none"
              style={{ background: 'rgba(255,255,255,.22)', backdropFilter: 'blur(20px)', boxShadow: 'inset 0 0 0 .5px rgba(255,255,255,.4)' }}
              placeholder="Enter Password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            {pw && (
              <button type="submit" aria-label="Log in" className="absolute right-[4px] top-[4px] w-[22px] h-[22px] rounded-full border-0 grid place-items-center bg-white/30 text-white">
                <ArrowRight size={13} />
              </button>
            )}
          </form>
        )}
        {active && !needsPass && (
          <button className="h-[30px] px-5 rounded-full border-0 text-[13px] text-white" style={{ background: 'rgba(255,255,255,.22)', backdropFilter: 'blur(20px)' }} onClick={() => void submit()}>
            {mode === 'locked' ? 'Unlock' : 'Log In'} <ArrowRight size={12} className="inline -mt-[2px]" />
          </button>
        )}
        {tries >= 2 && user.hint && <div className="text-[12px] text-white/80">Hint: {user.hint}</div>}
        {tries >= 1 && <div className="text-[11px] text-white/70">This passcode only exists in this browser. Forgot it? Use Settings → Erase from another profile, or clear site data.</div>}
        {!active && <div className="text-[12px] text-white/70">{needsPass ? 'Click or press any key to unlock' : 'Click or press Return to log in'}</div>}
      </div>
      {mode === 'login' && active && (
        <div className="absolute bottom-6 inset-x-0 flex justify-center gap-10 text-white/90 text-[11px]">
          {[
            { label: 'Sleep', icon: <Moon size={18} />, run: () => set({ power: 'sleep' }) },
            { label: 'Restart', icon: <RotateCcw size={18} />, run: () => { set({ power: 'restarting', bootReason: 'restart' }); setTimeout(() => { playStartup(); set({ power: 'booting' }); }, 1200); } },
            { label: 'Shut Down', icon: <Power size={18} />, run: () => { set({ power: 'shuttingdown' }); setTimeout(() => set({ power: 'off' }), 1000); } },
          ].map((b) => (
            <button key={b.label} className="flex flex-col items-center gap-1 border-0 bg-transparent text-white/90" onClick={b.run}>
              <span className="w-[38px] h-[38px] rounded-full grid place-items-center" style={{ background: 'rgba(255,255,255,.2)', backdropFilter: 'blur(20px)' }}>
                {b.icon}
              </span>
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PowerOverlay() {
  const power = useSystem((s) => s.power);
  const set = useSystem((s) => s.set);
  useEffect(() => {
    if (power !== 'sleep') return;
    const wakeUp = () => wake();
    const t = setTimeout(() => {
      window.addEventListener('pointerdown', wakeUp, { once: true });
      window.addEventListener('keydown', wakeUp, { once: true });
    }, 400);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', wakeUp);
      window.removeEventListener('keydown', wakeUp);
    };
  }, [power]);
  if (power === 'sleep')
    return (
      <div className="absolute inset-0 z-[9990] bg-black anim-fade flex items-end justify-center pb-8">
        <div className="text-white/20 text-[11px]">Sleeping — press any key or click to wake</div>
      </div>
    );
  if (power === 'off')
    return (
      <div className="absolute inset-0 z-[9990] bg-black flex flex-col items-center justify-center gap-4">
        <button
          aria-label="Power on"
          className="w-[64px] h-[64px] rounded-full border-0 grid place-items-center text-white/80 hover:text-white"
          style={{ background: 'rgba(255,255,255,.08)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.15)' }}
          onClick={() => {
            playStartup();
            set({ power: 'booting', bootReason: 'cold' });
          }}
        >
          <Power size={28} />
        </button>
        <div className="text-white/40 text-[12px]">Your simulated computer is off. Press the power button to start it.</div>
      </div>
    );
  if (power === 'restarting' || power === 'shuttingdown' || power === 'loggingout')
    return (
      <div className="absolute inset-0 z-[9990] bg-black anim-fade grid place-items-center">
        <div className="spinner" style={{ width: 22, height: 22, borderColor: 'rgba(255,255,255,.2)', borderTopColor: 'rgba(255,255,255,.8)' }} />
      </div>
    );
  return null;
}

export function Screensaver() {
  const on = useSystem((s) => s.screensaver);
  const kind = useSettings((s) => s.lockScreen.screensaver);
  const now = useClock(1000);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setI((x) => x + 1), 12000);
    const stop = () => {
      const s = useSettings.getState();
      useSystem.getState().set({ screensaver: false, power: s.user.passcodeHash && s.lockScreen.requirePasswordAfterSleep ? 'locked' : useSystem.getState().power });
    };
    const arm = setTimeout(() => {
      window.addEventListener('pointermove', stop, { once: true });
      window.addEventListener('pointerdown', stop, { once: true });
      window.addEventListener('keydown', stop, { once: true });
    }, 800);
    return () => {
      clearInterval(t);
      clearTimeout(arm);
      window.removeEventListener('pointermove', stop);
      window.removeEventListener('pointerdown', stop);
      window.removeEventListener('keydown', stop);
    };
  }, [on]);
  if (!on) return null;
  const frames = ['gg-golden', 'gg-day', 'gg-night', 'folds-light', 'folds-dark'];
  const f = frames[i % frames.length];
  return (
    <div className="absolute inset-0 z-[9980] bg-black overflow-hidden anim-fade">
      {kind !== 'clock' && (
        <div
          key={f}
          className="absolute inset-[-8%] anim-fade"
          style={{ backgroundImage: `url(./wallpapers/${kind === 'aerial' ? f : 'gg-golden'}.jpg)`, backgroundSize: 'cover', backgroundPosition: 'center', animation: 'gg-kenburns 24s ease-in-out infinite alternate' }}
        />
      )}
      <div className="absolute bottom-[10%] left-[6%] text-white" style={{ textShadow: '0 2px 20px rgba(0,0,0,.4)' }}>
        <div className="text-[96px] font-bold leading-none tracking-tight">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '')}</div>
        <div className="text-[20px] font-semibold opacity-90 mt-2">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ onboarding */
const HELLOS = ['hello', 'bonjour', 'hola', 'नमस्ते', 'ciao', 'こんにちは', 'olá', 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ', 'hallo', '안녕하세요'];

export function Onboarding({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(-1);
  const [hello, setHello] = useState(0);
  const s = useSettings();
  const [name, setName] = useState('');
  const [computer, setComputer] = useState('');
  const [pass, setPass] = useState('');
  const [hint, setHint] = useState('');

  useEffect(() => {
    if (step !== -1) return;
    const t = setInterval(() => setHello((h) => (h + 1) % HELLOS.length), 1700);
    return () => clearInterval(t);
  }, [step]);

  const finish = async () => {
    const fullName = name.trim() || 'Guest';
    const account = fullName.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'guest';
    let passcodeHash: string | undefined;
    let passcodeSalt: string | undefined;
    if (pass) {
      passcodeSalt = Math.random().toString(36).slice(2);
      passcodeHash = await hashPasscode(pass, passcodeSalt);
    }
    s.set({
      onboarded: true,
      computerName: computer.trim() || `${fullName.split(' ')[0]}’s Golden Gate`,
      user: { ...s.user, fullName, accountName: account, passcodeHash, passcodeSalt, hint: hint || undefined },
    });
    const { useContacts } = await import('../stores/data');
    const me = useContacts.getState().contacts.find((c) => c.isMe);
    if (me) useContacts.getState().upsert({ ...me, first: fullName.split(' ')[0], last: fullName.split(' ').slice(1).join(' '), emails: [{ label: 'home', value: `${account}@golden-gate.local` }] });
    onFinish();
    setTimeout(() => notify({ appId: 'finder', title: 'Welcome to Golden Gate', body: 'Press Ctrl+Space (⌘Space) for Spotlight, or open the Welcome file on your desktop.' }), 1500);
  };

  const panel = (title: string, sub: string, body: React.ReactNode, next: () => void, nextLabel = 'Continue', disabled = false) => (
    <div className="w-[640px] max-w-[92vw] rounded-[28px] glass-strong liquid p-9 anim-pop flex flex-col" style={{ color: 'var(--text)', minHeight: 440 }}>
      <div className="text-[26px] font-bold text-center">{title}</div>
      <div className="text-[13px] muted text-center mt-2 mb-6 max-w-[460px] mx-auto">{sub}</div>
      <div className="flex-1">{body}</div>
      <div className="flex justify-between mt-6">
        <button className="btn lg" onClick={() => setStep((x) => Math.max(-1, x - 1))}>
          Back
        </button>
        <button className="btn lg primary" disabled={disabled} onClick={next}>
          {nextLabel}
        </button>
      </div>
    </div>
  );

  return (
    <div className="absolute inset-0 overflow-hidden">
      <Wallpaper blur={step === -1 ? 0 : 30} dim={step === -1 ? 0.25 : 0.15} />
      <div className="absolute inset-0 grid place-items-center">
        {step === -1 && (
          <div className="flex flex-col items-center gap-10 text-white">
            <div key={hello} className="text-[96px] font-semibold tracking-tight anim-pop" style={{ animationDuration: '.8s', background: 'linear-gradient(90deg,#ffd29a,#ff8a4c,#ffb3c7,#9fd0ff)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 4px 30px rgba(0,0,0,.25))' }}>
              {HELLOS[hello]}
            </div>
            <button className="h-[40px] px-7 rounded-full border-0 text-[15px] font-semibold text-white" style={{ background: 'rgba(255,255,255,.22)', backdropFilter: 'blur(20px)', boxShadow: 'inset 0 0 0 .5px rgba(255,255,255,.5)' }} onClick={() => setStep(0)}>
              Get Started <ArrowRight size={15} className="inline -mt-[2px]" />
            </button>
            <div className="text-[11.5px] text-white/70 max-w-[440px] text-center">
              Golden Gate is an independent, browser-based desktop simulator inspired by macOS. It is not made by or affiliated with Apple.
            </div>
          </div>
        )}
        {step === 0 &&
          panel(
            'Choose Your Look',
            'Select an appearance. You can change it any time in System Settings.',
            <div className="flex justify-center gap-6">
              {(['light', 'dark', 'auto'] as const).map((a) => (
                <button key={a} className="flex flex-col items-center gap-2 border-0 bg-transparent" onClick={() => s.set({ appearance: a })}>
                  <div className="w-[150px] h-[100px] rounded-[12px] overflow-hidden relative" style={{ boxShadow: s.appearance === a ? '0 0 0 3px var(--accent)' : '0 0 0 1px var(--separator)' }}>
                    <div className="absolute inset-0" style={{ background: a === 'light' ? 'linear-gradient(#cfe3f7,#f3e6d6)' : a === 'dark' ? 'linear-gradient(#141a33,#3a2d4a)' : 'linear-gradient(90deg,#cfe3f7 50%,#141a33 50%)' }} />
                    <div className="absolute left-3 top-3 w-[90px] h-[56px] rounded-[7px]" style={{ background: a === 'dark' ? '#2a2a2d' : '#fff', boxShadow: '0 4px 12px rgba(0,0,0,.2)' }} />
                  </div>
                  <span className="text-[13px] font-medium capitalize">{a === 'auto' ? 'Auto' : a}</span>
                </button>
              ))}
            </div>,
            () => setStep(1),
          )}
        {step === 1 &&
          panel(
            'Accent Color',
            'Pick the color used for buttons, selections and highlights.',
            <div className="flex justify-center gap-4 flex-wrap">
              {(Object.keys(ACCENTS) as Accent[]).map((a) => (
                <button key={a} className="flex flex-col items-center gap-2 border-0 bg-transparent w-[64px]" onClick={() => s.set({ accent: a })}>
                  <span className="w-[30px] h-[30px] rounded-full grid place-items-center" style={{ background: a === 'multicolor' ? 'conic-gradient(#ff3b30,#ff9500,#ffcc00,#34c759,#007aff,#af52de,#ff3b30)' : ACCENTS[a].light, boxShadow: s.accent === a ? '0 0 0 3px var(--bg), 0 0 0 5px var(--accent)' : undefined }}>
                    {s.accent === a && <Check size={14} color="#fff" strokeWidth={3} />}
                  </span>
                  <span className="text-[11.5px]">{ACCENTS[a].label}</span>
                </button>
              ))}
            </div>,
            () => setStep(2),
          )}
        {step === 2 &&
          panel(
            'Create a Local Account',
            'This account exists only in this browser. Nothing is sent to Apple or any server.',
            <div className="flex flex-col gap-3 max-w-[360px] mx-auto">
              <label className="text-[12px] muted">
                Full name
                <input className="field mt-1" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
              </label>
              <label className="text-[12px] muted">
                Computer name
                <input className="field mt-1" value={computer} onChange={(e) => setComputer(e.target.value)} placeholder={`${(name.trim() || 'Guest').split(' ')[0]}’s Golden Gate`} />
              </label>
              <label className="text-[12px] muted">
                Simulator passcode (optional)
                <input className="field mt-1" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Leave empty for no passcode" />
              </label>
              {pass && (
                <label className="text-[12px] muted">
                  Hint (optional)
                  <input className="field mt-1" value={hint} onChange={(e) => setHint(e.target.value)} />
                </label>
              )}
              <div className="text-[11px] faint flex gap-2 items-start">
                <Lock size={12} className="mt-[1px] flex-none" /> Don’t reuse a real password. The passcode is hashed and stored locally to protect the simulated lock screen only.
              </div>
            </div>,
            () => setStep(3),
          )}
        {step === 3 &&
          panel(
            'Choose a Wallpaper',
            'The dynamic Golden Gate wallpaper changes with the time of day when Appearance is set to Auto.',
            <div className="grid grid-cols-3 gap-3">
              {WALLPAPERS.slice(0, 6).map((w) => (
                <button key={w.id} className="border-0 bg-transparent p-0 flex flex-col gap-1 items-center" onClick={() => s.patch('wallpaper', { id: w.id })}>
                  <div className="w-full aspect-[16/10] rounded-[10px] bg-cover bg-center" style={{ backgroundImage: `url(${thumbUrl(w.file ?? w.dynamic!.light)})`, boxShadow: s.wallpaper.id === w.id ? '0 0 0 3px var(--accent)' : '0 0 0 1px var(--separator)' }} />
                  <span className="text-[11.5px]">{w.name}</span>
                </button>
              ))}
            </div>,
            () => void finish(),
            'Start Using Golden Gate',
          )}
      </div>
      {step >= 0 && (
        <div className="absolute bottom-6 inset-x-0 flex justify-center gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="w-[7px] h-[7px] rounded-full" style={{ background: i === step ? '#fff' : 'rgba(255,255,255,.4)' }} />
          ))}
        </div>
      )}
      {step === -1 && (
        <button className="absolute bottom-6 right-6 btn pill" style={{ background: 'rgba(255,255,255,.2)', color: '#fff' }} onClick={() => void finish()}>
          Skip — continue as Guest
        </button>
      )}
    </div>
  );
}
