import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { geoMercator, geoPath, geoGraticule10, geoInterpolate, geoDistance, type GeoPermissibleObjects } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { Plus, Minus, Navigation, Star, X, Route, LocateFixed, MapPin, Compass } from 'lucide-react';
import type { AppProps } from '../../types';
import { TitleBar, useMenus } from '../../shell/windowContext';
import { idb, registerHydration } from '../../lib/persist';
import { useSettings, resolvedTheme, permission } from '../../stores/settings';
import { SearchField, Segmented } from '../../components/ui';
import { showDialog } from '../../stores/system';
import { pt } from '../../lib/screen';
import { useOffline } from '../../lib/network';
import { GoogleMapView, type GoogleMapType } from './GoogleMapView';
import { autocomplete, computeRoute, formatDistance, formatDuration, getMapsKey, placeDetails, reverseGeocode, type GooglePlace, type RouteResult, type Suggestion, type TravelMode } from './google';

export type City = [string, string, number, number, number]; // name, country, lat, lon, population

let citiesCache: Promise<City[]> | null = null;
export function loadCities(): Promise<City[]> {
  if (!citiesCache) citiesCache = fetch('./data/cities.json').then((r) => r.json() as Promise<City[]>).catch(() => [] as City[]);
  return citiesCache;
}
let worldCache: Promise<GeoPermissibleObjects[]> | null = null;
function loadWorld() {
  if (!worldCache)
    worldCache = fetch('./data/countries-50m.json')
      .then((r) => r.json() as Promise<Topology>)
      .then((t) => (feature(t, t.objects.countries as GeometryCollection) as unknown as { features: GeoPermissibleObjects[] }).features)
      .catch(() => []);
  return worldCache;
}

export function countryName(code: string) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

interface Place {
  name: string;
  country: string;
  lat: number;
  lon: number;
  pop?: number;
  /** Filled in for places that come from Google. */
  address?: string;
  rating?: number;
  ratings?: number;
  phone?: string;
  website?: string;
  open?: boolean;
}
interface GRoute {
  from: Place;
  to: Place;
  mode: TravelMode;
  result: RouteResult | null;
  loading: boolean;
  error: string;
}
const toPlace = (g: GooglePlace): Place => ({ name: g.name, country: '', lat: g.lat, lon: g.lon, address: g.address, rating: g.rating, ratings: g.ratings, phone: g.phone, website: g.website, open: g.open });
interface MapsData {
  source?: 'google' | 'offline';
  guides: Place[];
  view: { lon: number; lat: number; z: number };
  set: (p: Partial<MapsData>) => void;
}
const useMapsData = create<MapsData>()(
  persist((set) => ({ guides: [{ name: 'Golden Gate Bridge', country: 'US', lat: 37.8199, lon: -122.4783 }], view: { lon: -122.45, lat: 37.78, z: 9 }, set: (p) => set(p) }), idb<MapsData>('app.maps')),
);
registerHydration(useMapsData);

export default function Maps(_: AppProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [world, setWorld] = useState<GeoPermissibleObjects[] | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const data = useMapsData();
  const [view, setView] = useState(data.view);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Place | null>(null);
  const [route, setRoute] = useState<{ from: Place; to: Place } | null>(null);
  const [routeMode, setRouteMode] = useState(false);
  const [me, setMe] = useState<{ lat: number; lon: number; acc: number } | null>(null);
  const watchId = useRef<number | null>(null);
  useEffect(() => () => { if (watchId.current != null) navigator.geolocation?.clearWatch(watchId.current); }, []);
  const [style, setStyle] = useState<'explore' | 'transit'>('explore');
  const offline = useOffline();
  const [gFail, setGFail] = useState('');
  const [gErr, setGErr] = useState('');
  const [gType, setGType] = useState<GoogleMapType>('roadmap');
  const [gMode, setGMode] = useState<TravelMode>('DRIVE');
  const [gRoute, setGRoute] = useState<GRoute | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lon: number; zoom?: number; n: number } | null>(null);
  const [sugg, setSugg] = useState<Suggestion[]>([]);
  const focusN = useRef(0);
  const googleOn = data.source !== 'offline' && !!getMapsKey() && !gFail && !offline;
  const theme = useSettings((s) => resolvedTheme(s.appearance));
  const units = useSettings((s) => s.region.measurement);
  const natural = useSettings((s) => s.pointer.naturalScrolling);

  useEffect(() => {
    void loadWorld().then(setWorld);
    void loadCities().then(setCities);
  }, []);
  useEffect(() => {
    if (!googleOn || q.trim().length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      autocomplete(q, { lat: view.lat, lon: view.lon })
        .then((r) => live && setSugg(r))
        .catch((e: Error) => live && setGErr(e.message));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, googleOn]);
  useEffect(() => {
    const t = setTimeout(() => data.set({ view }), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (wrap.current) setSize({ w: wrap.current.clientWidth, h: wrap.current.clientHeight });
    });
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const projection = useMemo(() => {
    const scale = (256 * Math.pow(2, view.z)) / (2 * Math.PI);
    const p = geoMercator().scale(scale).translate([0, 0]);
    const [x, y] = p([view.lon, view.lat])!;
    return p.translate([size.w / 2 - x, size.h / 2 - y]);
  }, [view, size]);

  const draw = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.w * dpr;
    c.height = size.h * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dark = theme === 'dark';
    const col = dark
      ? { water: '#1b2433', land: '#2b2f36', border: '#4a505c', grat: 'rgba(255,255,255,.05)', text: '#e6e6e6', halo: 'rgba(0,0,0,.7)', city: '#c7c7cc' }
      : { water: '#a9d3f2', land: '#f2efe6', border: '#c9bfae', grat: 'rgba(0,0,0,.05)', text: '#3a3a3c', halo: 'rgba(255,255,255,.85)', city: '#6e6e73' };
    ctx.fillStyle = col.water;
    ctx.fillRect(0, 0, size.w, size.h);
    const path = geoPath(projection, ctx);
    ctx.beginPath();
    path(geoGraticule10());
    ctx.strokeStyle = col.grat;
    ctx.lineWidth = 1;
    ctx.stroke();
    if (world) {
      ctx.beginPath();
      for (const f of world) path(f);
      ctx.fillStyle = col.land;
      ctx.fill();
      ctx.strokeStyle = col.border;
      ctx.lineWidth = view.z > 5 ? 1.2 : 0.7;
      ctx.stroke();
      if (style === 'transit') {
        ctx.fillStyle = dark ? 'rgba(10,132,255,.12)' : 'rgba(0,122,255,.06)';
        ctx.fill();
      }
    }
    // route
    if (route) {
      const interp = geoInterpolate([route.from.lon, route.from.lat], [route.to.lon, route.to.lat]);
      ctx.beginPath();
      for (let i = 0; i <= 64; i++) {
        const p = projection(interp(i / 64));
        if (!p) continue;
        if (i === 0) ctx.moveTo(p[0], p[1]);
        else ctx.lineTo(p[0], p[1]);
      }
      ctx.strokeStyle = '#007aff';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.setLineDash([]);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.8)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // cities (more as you zoom)
    const minPop = view.z < 3 ? 8e6 : view.z < 4 ? 4e6 : view.z < 5 ? 1.5e6 : view.z < 6 ? 6e5 : view.z < 7 ? 3e5 : 1.5e5;
    ctx.font = `600 ${view.z > 6 ? 12 : 11}px Inter Variable, system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    const placed: { x: number; y: number; w: number }[] = [];
    for (const c0 of cities) {
      if (c0[4] < minPop) break;
      const p = projection([c0[3], c0[2]]);
      if (!p || p[0] < -50 || p[1] < -20 || p[0] > size.w + 50 || p[1] > size.h + 20) continue;
      const w = ctx.measureText(c0[0]).width;
      if (placed.some((q2) => Math.abs(q2.x - p[0]) < (q2.w + w) / 2 + 6 && Math.abs(q2.y - p[1]) < 14)) continue;
      placed.push({ x: p[0], y: p[1], w });
      ctx.beginPath();
      ctx.arc(p[0], p[1], 3, 0, Math.PI * 2);
      ctx.fillStyle = col.city;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = col.halo;
      ctx.strokeText(c0[0], p[0] + 6, p[1]);
      ctx.fillStyle = col.text;
      ctx.fillText(c0[0], p[0] + 6, p[1]);
    }
    // pins
    const pin = (pl: { lat: number; lon: number }, color: string, r = 9) => {
      const p = projection([pl.lon, pl.lat]);
      if (!p) return;
      ctx.beginPath();
      ctx.arc(p[0], p[1] - r - 4, r, 0, Math.PI * 2);
      ctx.moveTo(p[0] - 4, p[1] - r);
      ctx.lineTo(p[0], p[1]);
      ctx.lineTo(p[0] + 4, p[1] - r);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p[0], p[1] - r - 4, r * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    };
    data.guides.forEach((g) => pin(g, '#ff9500', 7));
    if (route) {
      pin(route.from, '#34c759');
      pin(route.to, '#ff3b30');
    } else if (selected) pin(selected, '#ff3b30');
    if (me) {
      const p = projection([me.lon, me.lat]);
      if (p) {
        ctx.beginPath();
        // the halo is the real accuracy radius reported by the device (metres → pixels)
        const mPerPx = (156543.03 * Math.cos((me.lat * Math.PI) / 180)) / Math.pow(2, view.z);
        ctx.arc(p[0], p[1], Math.max(14, me.acc / mPerPx), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,122,255,.18)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p[0], p[1], 6.5, 0, Math.PI * 2);
        ctx.fillStyle = '#007aff';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
      }
    }
  }, [projection, size, world, cities, theme, view.z, route, selected, me, data.guides, style]);

  useEffect(() => {
    const raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  const flyTo = (lat: number, lon: number, z = Math.max(view.z, 8)) => {
    const start = { ...view };
    const t0 = performance.now();
    const dur = 600;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setView({ lon: start.lon + (lon - start.lon) * e, lat: start.lat + (lat - start.lat) * e, z: start.z + (z - start.z) * e });
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  /** Move the camera on whichever map is showing. */
  const go = (lat: number, lon: number, z?: number) => {
    if (googleOn) setFocus({ lat, lon, zoom: z, n: ++focusN.current });
    else flyTo(lat, lon, z);
  };
  const zoomBy = (d: number) => {
    if (googleOn) setFocus({ lat: view.lat, lon: view.lon, zoom: view.z + d, n: ++focusN.current });
    else setView((v) => ({ ...v, z: Math.max(1.5, Math.min(14, v.z + d)) }));
  };

  const startRoute = async (from: Place, to: Place, mode: TravelMode) => {
    setGRoute({ from, to, mode, result: null, loading: true, error: '' });
    try {
      const result = await computeRoute(from, to, mode, units === 'us');
      setGRoute((g) => (g && g.to === to && g.mode === mode ? { ...g, result, loading: false } : g));
    } catch (e) {
      setGRoute((g) => (g && g.to === to && g.mode === mode ? { ...g, loading: false, error: (e as Error).message } : g));
    }
  };
  /** Select a Google place, or finish a route that was waiting for its destination. */
  const choosePlace = (place: Place, zoom?: number) => {
    if (routeMode && selected) {
      setRouteMode(false);
      void startRoute(selected, place, gMode);
    } else {
      setSelected(place);
      setGRoute(null);
      go(place.lat, place.lon, zoom);
    }
    setQ('');
    setSugg([]);
  };
  const pickSuggestion = (s: Suggestion) => {
    setGErr('');
    placeDetails(s.id).then((g) => choosePlace(toPlace(g), 15)).catch((e: Error) => setGErr(e.message));
  };
  const onMapPick = (p: { lat: number; lon: number; placeId?: string }) => {
    setGErr('');
    (p.placeId ? placeDetails(p.placeId) : reverseGeocode(p.lat, p.lon)).then((g) => choosePlace(toPlace(g))).catch((e: Error) => setGErr(e.message));
  };

  const pick = (c: City) => {
    const place = { name: c[0], country: c[1], lat: c[2], lon: c[3], pop: c[4] };
    if (routeMode && selected) {
      setRoute({ from: selected, to: place });
      setRouteMode(false);
      const mid = geoInterpolate([selected.lon, selected.lat], [place.lon, place.lat])(0.5);
      const d = geoDistance([selected.lon, selected.lat], [place.lon, place.lat]);
      flyTo(mid[1], mid[0], Math.max(2, Math.min(9, 8.5 - Math.log2(d * 6371 / 50))));
    } else {
      setSelected(place);
      setRoute(null);
      flyTo(place.lat, place.lon, Math.max(view.z, 7));
    }
    setQ('');
  };

  const results = useMemo(() => {
    if (!q.trim()) return [];
    const s = q.toLowerCase();
    return cities.filter((c) => c[0].toLowerCase().startsWith(s)).concat(cities.filter((c) => !c[0].toLowerCase().startsWith(s) && (c[0].toLowerCase().includes(s) || countryName(c[1]).toLowerCase().startsWith(s)))).slice(0, 8);
  }, [q, cities]);

  const locate = async () => {
    const allowed = permission('location', 'maps');
    if (allowed === false) {
      await showDialog({ title: 'Location access is off for Maps', message: 'Turn it on in System Settings ▸ Privacy & Security ▸ Location Services.', icon: 'maps', buttons: [{ label: 'OK', value: 'ok', primary: true }] });
      return;
    }
    if (allowed === undefined) {
      const r = await showDialog({ title: '“Maps” would like to use your current location', message: 'Your browser will also ask. The location is only used to show you on this map.', icon: 'maps', buttons: [{ label: 'Don’t Allow', value: 'no' }, { label: 'Allow', value: 'yes', primary: true }] });
      useSettings.getState().set({ privacy: { ...useSettings.getState().privacy, location: { ...useSettings.getState().privacy.location, maps: r.value === 'yes' } } });
      if (r.value !== 'yes') return;
    }
    if (!navigator.geolocation) return void showDialog({ title: 'Location unavailable', message: 'This browser does not support geolocation.', icon: 'warning', buttons: [{ label: 'OK', value: 'ok', primary: true }] });
    // Ask for a precise fix and keep listening briefly: the first reading is often a coarse
    // network/IP estimate that the device refines a few seconds later.
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    let best = Infinity;
    let first = true;
    const stop = () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
    const timer = setTimeout(stop, 15000);
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        if (accuracy > best) return;
        best = accuracy;
        setMe({ lat: latitude, lon: longitude, acc: accuracy });
        if (first) {
          first = false;
          go(latitude, longitude, accuracy > 5000 ? 8 : accuracy > 500 ? 11 : 14);
        }
        if (accuracy <= 50) {
          clearTimeout(timer);
          stop();
        }
      },
      (err) => {
        clearTimeout(timer);
        stop();
        void showDialog({ title: 'Your location couldn’t be determined', message: `${err.message}. Location may be blocked by your browser, your operating system’s location setting, or the page host.`, icon: 'warning', buttons: [{ label: 'OK', value: 'ok', primary: true }] });
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  };

  useMenus([{ title: 'View', items: [{ label: 'Zoom In', shortcut: 'mod+=', action: () => zoomBy(1) }, { label: 'Zoom Out', shortcut: 'mod+-', action: () => zoomBy(-1) }, { label: 'Show World', action: () => go(20, 0, 2) }, { label: 'Go to Current Location', shortcut: 'mod+l', action: () => void locate() }] }], [view, googleOn]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const s0 = pt(e);
    const start = projection.invert!([size.w / 2, size.h / 2])!;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const p = pt(ev);
      const dx = p.x - s0.x;
      const dy = p.y - s0.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      const c = projection([start[0], start[1]])!;
      const ll = projection.invert!([c[0] - dx, c[1] - dy]);
      if (ll) setView((v) => ({ ...v, lon: ((ll[0] + 540) % 360) - 180, lat: Math.max(-80, Math.min(80, ll[1])) }));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) {
        // click: select nearest visible city
        const r = canvas.current!.getBoundingClientRect();
        const sc = r.width / size.w;
        const x = (ev.clientX - r.left) / sc;
        const y = (ev.clientY - r.top) / sc;
        let best: City | null = null;
        let bd = 14;
        for (const c of cities) {
          const p = projection([c[3], c[2]]);
          if (!p) continue;
          const d = Math.hypot(p[0] - x, p[1] - y);
          if (d < bd) {
            bd = d;
            best = c;
          }
        }
        if (best) pick(best);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    const sc = r.width / size.w;
    const mx = (e.clientX - r.left) / sc;
    const my = (e.clientY - r.top) / sc;
    const before = projection.invert!([mx, my])!;
    const dir = (e.deltaY < 0 ? 1 : -1) * (natural || e.ctrlKey ? 1 : -1);
    const nz = Math.max(1.5, Math.min(14, view.z + dir * Math.min(0.5, Math.abs(e.deltaY) / 200 + 0.1)));
    const scale = (256 * Math.pow(2, nz)) / (2 * Math.PI);
    const p = geoMercator().scale(scale).translate([0, 0]);
    const bx = p(before)!;
    const center = p.invert!([bx[0] - (mx - size.w / 2), bx[1] - (my - size.h / 2)])!;
    setView({ lon: center[0], lat: Math.max(-80, Math.min(80, center[1])), z: nz });
  };

  const distance = route ? geoDistance([route.from.lon, route.from.lat], [route.to.lon, route.to.lat]) * 6371 : 0;
  const isGuide = selected && data.guides.some((g) => g.name === selected.name && Math.abs(g.lat - selected.lat) < 0.01);

  return (
    <div className="flex h-full min-h-0">
      <div className="w-[260px] flex-none sidebar hairline-r flex flex-col">
        <TitleBar showTitle={false} />
        <div className="px-3 pb-2 relative">
          <SearchField width="100%" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} placeholder={routeMode ? 'Search destination' : 'Search Maps'} aria-label="Search places" onKeyDown={(e) => e.key === 'Enter' && (googleOn ? sugg[0] && pickSuggestion(sugg[0]) : results[0] && pick(results[0]))} />
          {googleOn && q.trim().length >= 2 && sugg.length > 0 && (
            <div className="absolute left-3 right-3 top-[36px] z-20 menu-panel !p-1">
              {sugg.map((s) => (
                <div key={s.id} className="menu-item enabled !pl-2 !h-[40px]" onClick={() => pickSuggestion(s)}>
                  <MapPin size={14} />
                  <div className="min-w-0 leading-tight">
                    <div className="truncate">{s.main}</div>
                    <div className="text-[10.5px] opacity-70 truncate">{s.secondary}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!googleOn && results.length > 0 && (
            <div className="absolute left-3 right-3 top-[36px] z-20 menu-panel !p-1">
              {results.map((c) => (
                <div key={`${c[0]}${c[2]}`} className="menu-item enabled !pl-2 !h-[34px]" onClick={() => pick(c)}>
                  <MapPin size={14} />
                  <div className="min-w-0 leading-tight">
                    <div className="truncate">{c[0]}</div>
                    <div className="text-[10.5px] opacity-70">{countryName(c[1])}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="scroll flex-1 px-3">
          {selected && !(googleOn ? gRoute : route) && (
            <div className="card p-3 mb-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-[15px]">{selected.name}</div>
                  <div className="text-[12px] muted">{selected.address ?? countryName(selected.country)}</div>
                </div>
                <button className="tb-btn" aria-label="Close" onClick={() => setSelected(null)}><X size={14} /></button>
              </div>
              {selected.pop ? <div className="text-[12px] mt-2">Population ≈ {selected.pop.toLocaleString()}</div> : null}
              {selected.rating != null && <div className="text-[12px] mt-2">★ {selected.rating.toFixed(1)}{selected.ratings ? ` (${selected.ratings.toLocaleString()})` : ''}{selected.open != null ? ` · ${selected.open ? 'Open now' : 'Closed'}` : ''}</div>}
              {selected.phone && <div className="text-[12px] mt-1">{selected.phone}</div>}
              {selected.website && <a className="text-[12px] mt-1 block truncate text-[var(--accent)] no-underline" href={selected.website} target="_blank" rel="noopener noreferrer">{selected.website.replace(/^https?:\/\/(www\.)?/, '')}</a>}
              <div className="text-[11.5px] muted mt-1">{selected.lat.toFixed(4)}°, {selected.lon.toFixed(4)}°</div>
              <div className="flex gap-2 mt-3">
                <button className="btn primary flex-1" onClick={() => (googleOn && me ? void startRoute({ name: 'My Location', country: '', lat: me.lat, lon: me.lon }, selected, gMode) : setRouteMode(true))}><Route size={13} /> Directions</button>
                <button className="btn" aria-label={isGuide ? 'Remove from guides' : 'Save to guides'} onClick={() => data.set({ guides: isGuide ? data.guides.filter((g) => !(g.name === selected.name && Math.abs(g.lat - selected.lat) < 0.01)) : [...data.guides, selected] })}><Star size={13} fill={isGuide ? 'currentColor' : 'none'} /></button>
              </div>
              {routeMode && <div className="text-[11.5px] mt-2" style={{ color: 'var(--accent)' }}>{googleOn ? 'Search for the destination…' : 'Search or click a destination city…'}</div>}
            </div>
          )}
          {googleOn && gRoute && (
            <div className="card p-3 mb-3">
              <div className="flex justify-between"><div className="font-bold">Directions</div><button className="tb-btn" aria-label="Close route" onClick={() => setGRoute(null)}><X size={14} /></button></div>
              <div className="text-[12.5px] mt-1"><span className="text-[#34c759]">●</span> {gRoute.from.name}</div>
              <div className="text-[12.5px]"><span className="text-[#ff3b30]">●</span> {gRoute.to.name}</div>
              <div className="mt-2"><Segmented value={gRoute.mode} onChange={(m) => { setGMode(m); void startRoute(gRoute.from, gRoute.to, m); }} options={[{ value: 'DRIVE', label: 'Drive' }, { value: 'WALK', label: 'Walk' }, { value: 'BICYCLE', label: 'Bike' }, { value: 'TRANSIT', label: 'Transit' }]} /></div>
              {gRoute.loading && <div className="text-[12px] muted mt-3">Finding the best route…</div>}
              {gRoute.error && <div className="text-[12px] mt-3" style={{ color: '#ff3b30' }}>{gRoute.error}</div>}
              {gRoute.result && (
                <>
                  <div className="text-[18px] font-bold mt-3">{formatDuration(gRoute.result.seconds)}</div>
                  <div className="text-[11.5px] muted">{formatDistance(gRoute.result.meters, units === 'us')}{gRoute.mode === 'DRIVE' ? ' · with current traffic' : ''}</div>
                  <ol className="text-[12px] mt-3 pl-4 list-decimal flex flex-col gap-1">
                    {gRoute.result.steps.slice(0, 40).map((st, i) => (
                      <li key={i}>{st.text}{st.meters ? <span className="muted"> · {formatDistance(st.meters, units === 'us')}</span> : null}</li>
                    ))}
                  </ol>
                </>
              )}
            </div>
          )}
          {!googleOn && route && (
            <div className="card p-3 mb-3">
              <div className="flex justify-between"><div className="font-bold">Route</div><button className="tb-btn" aria-label="Close route" onClick={() => setRoute(null)}><X size={14} /></button></div>
              <div className="text-[12.5px] mt-1"><span className="text-[#34c759]">●</span> {route.from.name}</div>
              <div className="text-[12.5px]"><span className="text-[#ff3b30]">●</span> {route.to.name}</div>
              <div className="text-[18px] font-bold mt-2">{units === 'us' ? `${Math.round(distance * 0.621371).toLocaleString()} mi` : `${Math.round(distance).toLocaleString()} km`}</div>
              <div className="text-[11.5px] muted">Straight-line (great-circle) distance · ≈ {Math.max(1, Math.round(distance / 800 + 0.5))} h by air (estimate)</div>
              <div className="text-[11px] muted mt-2">Turn-by-turn road directions need an online routing service and aren’t available in this offline map.</div>
            </div>
          )}
          <div className="sb-heading !px-1">Guides</div>
          {data.guides.map((g) => (
            <div key={`${g.name}${g.lat}`} className="sb-item" onClick={() => { setSelected(g); setRoute(null); setGRoute(null); go(g.lat, g.lon, 11); }}>
              <span className="sb-ico" style={{ color: '#ff9500' }}><Star size={14} fill="currentColor" /></span>
              <span className="truncate">{g.name}</span>
            </div>
          ))}
        </div>
        {(gErr || gFail) && <div className="text-[11.5px] px-3 py-2 hairline-t" style={{ color: '#ff3b30' }}>{gFail || gErr}</div>}
        <div className="text-[10.5px] muted px-3 py-2 hairline-t">
          {googleOn ? 'Map data © Google' : offline && getMapsKey() ? 'Offline: showing the built-in map.' : 'Offline map: Natural Earth borders · GeoNames cities (CC BY 4.0)'}
          {getMapsKey() && !offline && (
            <button className="block border-0 bg-transparent p-0 mt-1 text-[var(--accent)] text-[10.5px]" onClick={() => { setGFail(''); setGErr(''); setSelected(null); setGRoute(null); data.set({ source: googleOn ? 'offline' : 'google' }); }}>
              {googleOn ? 'Use the offline map' : 'Use Google Maps'}
            </button>
          )}
        </div>
      </div>
      <div ref={wrap} className="flex-1 min-w-0 relative overflow-hidden">
        {googleOn ? (
          <GoogleMapView
            key={theme}
            start={view}
            focus={focus}
            dark={theme === 'dark'}
            mapType={gType}
            selected={selected}
            routeEnds={gRoute ? { from: gRoute.from, to: gRoute.to } : null}
            path={gRoute?.result?.path ?? null}
            me={me}
            onView={(v) => setView(v)}
            onPick={onMapPick}
            onFailure={setGFail}
          />
        ) : (
          <>
            <canvas ref={canvas} className="absolute inset-0 w-full h-full" style={{ cursor: 'grab' }} onPointerDown={onPointerDown} onWheel={onWheel} onDoubleClick={() => zoomBy(1)} />
            {!world && <div className="absolute inset-0 grid place-items-center"><div className="spinner" /></div>}
          </>
        )}
        <div className="absolute top-3 left-1/2 -translate-x-1/2">
          {googleOn ? (
            <Segmented value={gType} onChange={setGType} options={[{ value: 'roadmap', label: 'Map' }, { value: 'hybrid', label: 'Satellite' }, { value: 'terrain', label: 'Terrain' }]} />
          ) : (
            <Segmented value={style} onChange={setStyle} options={[{ value: 'explore', label: 'Explore' }, { value: 'transit', label: 'Political' }]} />
          )}
        </div>
        <div className="absolute right-3 top-3 flex flex-col gap-2">
          <div className="tb-group !flex-col !h-auto !py-[3px] !rounded-[14px]">
            <button className="tb-btn" aria-label="Zoom in" onClick={() => zoomBy(1)}><Plus size={15} /></button>
            <button className="tb-btn" aria-label="Zoom out" onClick={() => zoomBy(-1)}><Minus size={15} /></button>
          </div>
          <div className="tb-group !rounded-[14px]"><button className="tb-btn" aria-label="Current location" onClick={() => void locate()}>{me ? <LocateFixed size={15} /> : <Navigation size={15} />}</button></div>
          <div className="tb-group !rounded-[14px]"><button className="tb-btn" aria-label="Reset view" onClick={() => go(20, 0, 2)}><Compass size={15} /></button></div>
        </div>
        {!googleOn && <div className="absolute left-3 bottom-3 glass-strong rounded-[8px] px-2 py-[2px] text-[10.5px] muted">
          {(() => {
            const mPerPx = (40075016 * Math.cos((view.lat * Math.PI) / 180)) / (256 * Math.pow(2, view.z));
            const km = (mPerPx * 100) / 1000;
            return units === 'us' ? `100 px ≈ ${(km * 0.621).toFixed(km < 1 ? 2 : 0)} mi` : `100 px ≈ ${km.toFixed(km < 1 ? 2 : 0)} km`;
          })()}
        </div>}
      </div>
    </div>
  );
}
