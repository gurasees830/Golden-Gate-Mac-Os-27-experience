/**
 * Browser-detectable device information. Nothing here is guessed: when a
 * browser doesn't expose a value it is reported as unavailable.
 */
export interface SysInfo {
  os: { name: string; version: string; detail: string };
  browser: { name: string; version: string };
  platform: string;
  architecture: string | null;
  bitness: string | null;
  model: string | null;
  mobile: boolean | null;
  cores: number | null;
  memoryGB: number | null;
  gpu: { vendor: string | null; renderer: string | null; webgl2: boolean; webgpu: boolean };
  screen: { width: number; height: number; availWidth: number; availHeight: number; dpr: number; colorDepth: number; orientation: string | null; hdr: boolean; refresh: number | null };
  viewport: { width: number; height: number };
  language: string;
  languages: string[];
  timeZone: string;
  online: boolean;
  connection: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean } | null;
  storage: { quota: number | null; usage: number | null; persisted: boolean | null };
  touchPoints: number;
  cookies: boolean;
  features: Record<string, boolean>;
  userAgent: string;
}

type UAData = {
  brands?: { brand: string; version: string }[];
  mobile?: boolean;
  platform?: string;
  getHighEntropyValues?: (h: string[]) => Promise<Record<string, unknown>>;
};

function parseUA(ua: string) {
  let browser = { name: 'Unknown browser', version: '' };
  const m =
    ua.match(/Edg\/([\d.]+)/) ? { name: 'Microsoft Edge', version: ua.match(/Edg\/([\d.]+)/)![1] } :
    ua.match(/OPR\/([\d.]+)/) ? { name: 'Opera', version: ua.match(/OPR\/([\d.]+)/)![1] } :
    ua.match(/Firefox\/([\d.]+)/) ? { name: 'Firefox', version: ua.match(/Firefox\/([\d.]+)/)![1] } :
    ua.match(/Chrome\/([\d.]+)/) ? { name: 'Chrome', version: ua.match(/Chrome\/([\d.]+)/)![1] } :
    ua.match(/Version\/([\d.]+).*Safari/) ? { name: 'Safari', version: ua.match(/Version\/([\d.]+)/)![1] } : null;
  if (m) browser = m;
  let os = { name: 'Unknown OS', version: '' };
  if (/Windows NT 10/.test(ua)) os = { name: 'Windows', version: '10 or 11' };
  else if (/Windows NT ([\d.]+)/.test(ua)) os = { name: 'Windows', version: ua.match(/Windows NT ([\d.]+)/)![1] };
  else if (/Mac OS X ([\d_]+)/.test(ua)) os = { name: 'macOS', version: ua.match(/Mac OS X ([\d_]+)/)![1].replace(/_/g, '.') };
  else if (/Android ([\d.]+)/.test(ua)) os = { name: 'Android', version: ua.match(/Android ([\d.]+)/)![1] };
  else if (/iPhone OS ([\d_]+)/.test(ua)) os = { name: 'iOS', version: ua.match(/iPhone OS ([\d_]+)/)![1].replace(/_/g, '.') };
  else if (/CrOS/.test(ua)) os = { name: 'ChromeOS', version: '' };
  else if (/Linux/.test(ua)) os = { name: 'Linux', version: '' };
  return { browser, os };
}

function webglInfo() {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') as WebGL2RenderingContext | null) ?? (c.getContext('webgl') as WebGLRenderingContext | null);
    if (!gl) return { vendor: null, renderer: null, webgl2: false };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = ext ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)) : null;
    const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null;
    const isGl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    return { vendor, renderer, webgl2: isGl2 };
  } catch {
    return { vendor: null, renderer: null, webgl2: false };
  }
}

function measureRefresh(): Promise<number | null> {
  return new Promise((resolve) => {
    let frames = 0;
    let start = 0;
    const step = (t: number) => {
      if (!start) start = t;
      frames++;
      if (t - start >= 500) resolve(Math.round((frames * 1000) / (t - start) / 5) * 5);
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setTimeout(() => resolve(null), 1500);
  });
}

export async function collectSysInfo(): Promise<SysInfo> {
  const nav = navigator as Navigator & { userAgentData?: UAData; deviceMemory?: number; connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean }; gpu?: unknown };
  const ua = nav.userAgent;
  const parsed = parseUA(ua);
  let os = { ...parsed.os, detail: '' };
  let browser = parsed.browser;
  let architecture: string | null = null;
  let bitness: string | null = null;
  let model: string | null = null;
  const uad = nav.userAgentData;
  if (uad?.getHighEntropyValues) {
    try {
      const h = await uad.getHighEntropyValues(['platformVersion', 'architecture', 'bitness', 'model', 'fullVersionList']);
      const pv = String(h.platformVersion ?? '');
      if (uad.platform === 'Windows' && pv) {
        const major = Number(pv.split('.')[0]);
        os = { name: 'Windows', version: major >= 13 ? '11' : major > 0 ? '10' : '7/8', detail: `platform version ${pv}` };
      } else if (uad.platform === 'macOS' && pv) os = { name: 'macOS', version: pv, detail: '' };
      else if (pv) os = { ...os, detail: `platform version ${pv}` };
      architecture = (h.architecture as string) || null;
      bitness = h.bitness ? `${h.bitness}-bit` : null;
      model = (h.model as string) || null;
      const list = h.fullVersionList as { brand: string; version: string }[] | undefined;
      const best = list?.find((b) => /Edge|Opera|Chrome|Brave/.test(b.brand) && !/Not/.test(b.brand) && b.brand !== 'Chromium') ?? list?.find((b) => b.brand === 'Chromium');
      if (best) browser = { name: best.brand === 'Google Chrome' ? 'Chrome' : best.brand, version: best.version };
    } catch {
      /* high-entropy values refused */
    }
  }
  let storage = { quota: null as number | null, usage: null as number | null, persisted: null as boolean | null };
  try {
    const e = await navigator.storage?.estimate?.();
    storage = { quota: e?.quota ?? null, usage: e?.usage ?? null, persisted: (await navigator.storage?.persisted?.()) ?? null };
  } catch {
    /* ignore */
  }
  const gl = webglInfo();
  const refresh = await measureRefresh();
  return {
    os,
    browser,
    platform: uad?.platform || navigator.platform || 'Unknown',
    architecture,
    bitness,
    model,
    mobile: uad?.mobile ?? null,
    cores: navigator.hardwareConcurrency || null,
    memoryGB: nav.deviceMemory ?? null,
    gpu: { ...gl, webgpu: !!nav.gpu },
    screen: {
      width: screen.width,
      height: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
      dpr: window.devicePixelRatio || 1,
      colorDepth: screen.colorDepth,
      orientation: screen.orientation?.type ?? null,
      hdr: window.matchMedia?.('(dynamic-range: high)').matches ?? false,
      refresh,
    },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    language: navigator.language,
    languages: [...(navigator.languages ?? [])],
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    online: navigator.onLine,
    connection: nav.connection ? { effectiveType: nav.connection.effectiveType, downlink: nav.connection.downlink, rtt: nav.connection.rtt, saveData: nav.connection.saveData } : null,
    storage,
    touchPoints: navigator.maxTouchPoints ?? 0,
    cookies: navigator.cookieEnabled,
    features: {
      'IndexedDB': 'indexedDB' in window,
      'Service Workers': 'serviceWorker' in navigator,
      'WebAssembly': typeof WebAssembly === 'object',
      'WebGL 2': gl.webgl2,
      'WebGPU': !!nav.gpu,
      'File System Access': 'showOpenFilePicker' in window,
      'Battery Status': 'getBattery' in navigator,
      'Web Bluetooth': 'bluetooth' in navigator,
      'Local Font Access': 'queryLocalFonts' in window,
      'Media Recorder': 'MediaRecorder' in window,
      'Clipboard API': !!navigator.clipboard,
      'Web Share': 'share' in navigator,
      'Speech Synthesis': 'speechSynthesis' in window,
      'Geolocation': 'geolocation' in navigator,
    },
    userAgent: ua,
  };
}

export function gpuLabel(g: SysInfo['gpu']): string {
  if (!g.renderer) return 'Hardware details unavailable to the browser';
  const m = g.renderer.match(/ANGLE \(([^,]+),\s*([^,(]+?)(?:\s*\(|\s*Direct3D|,|\))/);
  if (m) return `${m[2].trim()}`;
  return g.renderer;
}

export function sysInfoReport(i: SysInfo, manual: Record<string, string>, extra: { computerName: string; osVersion: string; appVersion: string }): string {
  const line = (k: string, v: string) => `${k.padEnd(22)} ${v}`;
  const out = [
    'Golden Gate — System Report',
    `Generated ${new Date().toLocaleString()}`,
    '',
    '— Simulator —',
    line('Computer name', extra.computerName),
    line('Simulated OS', `Golden Gate ${extra.osVersion} (browser simulator)`),
    line('Simulator build', extra.appVersion),
    '',
    '— Detected by your browser —',
    line('Operating system', `${i.os.name} ${i.os.version}${i.os.detail ? ` (${i.os.detail})` : ''}`),
    line('Browser', `${i.browser.name} ${i.browser.version}`),
    line('Platform', i.platform),
    line('Architecture', [i.architecture, i.bitness].filter(Boolean).join(', ') || 'Unavailable'),
    line('Logical processors', i.cores ? String(i.cores) : 'Unavailable'),
    line('Memory (approx.)', i.memoryGB ? `≈ ${i.memoryGB} GB (browser-reported, capped at 8+)` : 'Unavailable in this browser'),
    line('Graphics', i.gpu.renderer ?? 'Unavailable'),
    line('Screen', `${i.screen.width} × ${i.screen.height} @${i.screen.dpr}x (${i.screen.colorDepth}-bit)`),
    line('Available screen', `${i.screen.availWidth} × ${i.screen.availHeight}`),
    line('Refresh rate (meas.)', i.screen.refresh ? `≈ ${i.screen.refresh} Hz` : 'Unavailable'),
    line('Language', i.language),
    line('Time zone', i.timeZone),
    line('Online', i.online ? 'Yes' : 'No'),
    line('Browser storage quota', i.storage.quota ? `${(i.storage.quota / 1e9).toFixed(1)} GB (not the disk size)` : 'Unavailable'),
    '',
    '— Entered manually —',
    ...Object.entries(manual).filter(([, v]) => v).map(([k, v]) => line(k, v)),
    '',
    'Values marked unavailable are not exposed by the browser and were not guessed.',
  ];
  return out.join('\n');
}
