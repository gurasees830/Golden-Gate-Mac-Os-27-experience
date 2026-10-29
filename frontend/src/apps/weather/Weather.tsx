import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Sun, Cloud, CloudSun, CloudRain, CloudSnow, CloudLightning, CloudFog, CloudDrizzle, Moon, CloudMoon, Wind, Droplets, Eye, Gauge, Thermometer, Sunrise, Sunset, X, AlertTriangle, MapPin } from 'lucide-react';
import type { AppProps } from '../../types';
import { TitleBar, useMenus } from '../../shell/windowContext';
import { idb, registerHydration } from '../../lib/persist';
import { useOffline } from '../../lib/network';
import { useSettings } from '../../stores/settings';
import { SearchField } from '../../components/ui';
import { loadCities, countryName, type City } from '../maps/Maps';

interface SavedCity { name: string; country: string; lat: number; lon: number }
const useWx = create<{ cities: SavedCity[]; set: (p: { cities: SavedCity[] }) => void }>()(persist((set) => ({ cities: [{ name: 'San Francisco', country: 'US', lat: 37.7749, lon: -122.4194 }, { name: 'Mumbai', country: 'IN', lat: 19.0728, lon: 72.8826 }], set: (p) => set(p) }), idb('app.weather')));
registerHydration(useWx);

interface Wx {
  live: boolean;
  current: { temp: number; feels: number; humidity: number; code: number; wind: number; windDir: number; pressure: number; isDay: boolean; visibility: number; uv: number };
  hourly: { time: number; temp: number; code: number; pop: number }[];
  daily: { date: number; code: number; max: number; min: number; sunrise: number; sunset: number; pop: number }[];
  tzOffsetSec: number;
}

const CODES: Record<number, [string, 'sun' | 'partly' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm']> = {
  0: ['Clear', 'sun'], 1: ['Mostly Clear', 'partly'], 2: ['Partly Cloudy', 'partly'], 3: ['Cloudy', 'cloud'], 45: ['Foggy', 'fog'], 48: ['Freezing Fog', 'fog'],
  51: ['Light Drizzle', 'drizzle'], 53: ['Drizzle', 'drizzle'], 55: ['Heavy Drizzle', 'drizzle'], 61: ['Light Rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy Rain', 'rain'], 66: ['Freezing Rain', 'rain'], 67: ['Freezing Rain', 'rain'],
  71: ['Light Snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy Snow', 'snow'], 77: ['Snow Grains', 'snow'], 80: ['Showers', 'rain'], 81: ['Showers', 'rain'], 82: ['Heavy Showers', 'rain'], 85: ['Snow Showers', 'snow'], 86: ['Snow Showers', 'snow'], 95: ['Thunderstorms', 'storm'], 96: ['Thunderstorms', 'storm'], 99: ['Thunderstorms', 'storm'],
};
const kindOf = (c: number) => CODES[c]?.[1] ?? 'cloud';
const label = (c: number) => CODES[c]?.[0] ?? 'Cloudy';

function WxIcon({ code, day = true, size = 22 }: { code: number; day?: boolean; size?: number }) {
  const k = kindOf(code);
  const p = { size, strokeWidth: 1.8 };
  if (k === 'sun') return day ? <Sun {...p} color="#ffd60a" /> : <Moon {...p} color="#e5e5ea" />;
  if (k === 'partly') return day ? <CloudSun {...p} color="#ffd60a" /> : <CloudMoon {...p} color="#e5e5ea" />;
  if (k === 'fog') return <CloudFog {...p} />;
  if (k === 'drizzle') return <CloudDrizzle {...p} color="#64d2ff" />;
  if (k === 'rain') return <CloudRain {...p} color="#64d2ff" />;
  if (k === 'snow') return <CloudSnow {...p} />;
  if (k === 'storm') return <CloudLightning {...p} color="#ffd60a" />;
  return <Cloud {...p} />;
}

/** NOAA sunrise/sunset approximation (UTC ms) for demo mode. */
function sunTimes(date: Date, lat: number, lon: number): { rise: number; set: number } {
  const rad = Math.PI / 180;
  const day = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / 86400000);
  const g = ((2 * Math.PI) / 365) * (day - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = Math.acos(Math.min(1, Math.max(-1, Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl)))) / rad;
  const base = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return { rise: base + (720 - 4 * (lon + ha) - eq) * 60000, set: base + (720 - 4 * (lon - ha) - eq) * 60000 };
}

function demoWeather(c: SavedCity): Wx {
  let seed = Math.abs(Math.round(c.lat * 1000 + c.lon * 7));
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const base = 28 - Math.abs(c.lat) * 0.45 + (rnd() - 0.5) * 6;
  const codes = [0, 1, 2, 3, 45, 61, 80, 2, 1, 0];
  const now = Date.now();
  const tz = Math.round(c.lon / 15) * 3600;
  const daily = Array.from({ length: 10 }, (_, i) => {
    const d = new Date(now + i * 86400000);
    const st = sunTimes(d, c.lat, c.lon);
    const max = base + 4 + (rnd() - 0.5) * 5;
    return { date: d.getTime(), code: codes[Math.floor(rnd() * codes.length)], max, min: max - 6 - rnd() * 4, sunrise: st.rise, sunset: st.set, pop: Math.round(rnd() * 60) };
  });
  const hourly = Array.from({ length: 24 }, (_, i) => {
    const t = now + i * 3600000;
    const localH = (new Date(t).getUTCHours() + tz / 3600 + 24) % 24;
    return { time: t, temp: base + 4 * Math.sin(((localH - 9) / 24) * 2 * Math.PI), code: daily[0].code, pop: Math.round(rnd() * 40) };
  });
  const isDay = now > daily[0].sunrise && now < daily[0].sunset;
  return { live: false, current: { temp: hourly[0].temp, feels: hourly[0].temp - 1, humidity: Math.round(45 + rnd() * 40), code: daily[0].code, wind: Math.round(5 + rnd() * 20), windDir: Math.round(rnd() * 360), pressure: Math.round(1005 + rnd() * 20), isDay, visibility: 10000, uv: Math.round(rnd() * 9) }, hourly, daily, tzOffsetSec: tz };
}

async function fetchWeather(c: SavedCity): Promise<Wx> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl,is_day,visibility,uv_index&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max&timezone=GMT&forecast_days=10`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  const r = await fetch(url, { signal: ctrl.signal });
  clearTimeout(t);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const now = Date.now();
  const hTimes: number[] = j.hourly.time.map((s: string) => Date.parse(`${s}Z`));
  const startIdx = Math.max(0, hTimes.findIndex((t2) => t2 >= now - 3600000));
  return {
    live: true,
    current: { temp: j.current.temperature_2m, feels: j.current.apparent_temperature, humidity: j.current.relative_humidity_2m, code: j.current.weather_code, wind: j.current.wind_speed_10m, windDir: j.current.wind_direction_10m, pressure: j.current.pressure_msl, isDay: !!j.current.is_day, visibility: j.current.visibility, uv: j.current.uv_index },
    hourly: hTimes.slice(startIdx, startIdx + 24).map((time, i) => ({ time, temp: j.hourly.temperature_2m[startIdx + i], code: j.hourly.weather_code[startIdx + i], pop: j.hourly.precipitation_probability?.[startIdx + i] ?? 0 })),
    daily: j.daily.time.map((s: string, i: number) => ({ date: Date.parse(`${s}T12:00:00Z`), code: j.daily.weather_code[i], max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i], sunrise: Date.parse(`${j.daily.sunrise[i]}Z`), sunset: Date.parse(`${j.daily.sunset[i]}Z`), pop: j.daily.precipitation_probability_max?.[i] ?? 0 })),
    tzOffsetSec: Math.round(c.lon / 15) * 3600,
  };
}

export default function Weather(_: AppProps) {
  const { cities, set } = useWx();
  const unit = useSettings((s) => s.region.tempUnit);
  const offline = useOffline();
  const [sel, setSel] = useState(0);
  const [data, setData] = useState<Record<string, Wx>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [all, setAll] = useState<City[]>([]);
  useEffect(() => {
    void loadCities().then(setAll);
  }, []);

  const key = (c: SavedCity) => `${c.lat},${c.lon}`;
  useEffect(() => {
    let alive = true;
    for (const c of cities) {
      if (data[key(c)]) continue;
      if (offline) {
        setErrors((e) => ({ ...e, [key(c)]: 'offline' }));
        setData((d) => ({ ...d, [key(c)]: demoWeather(c) }));
        continue;
      }
      fetchWeather(c)
        .then((w) => alive && setData((d) => ({ ...d, [key(c)]: w })))
        .catch((e: Error) => {
          if (!alive) return;
          setErrors((er) => ({ ...er, [key(c)]: e.message }));
          setData((d) => ({ ...d, [key(c)]: demoWeather(c) }));
        });
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cities, offline]);

  const t = (c: number) => Math.round(unit === 'F' ? c * 1.8 + 32 : c);
  const city = cities[Math.min(sel, cities.length - 1)];
  const wx = city ? data[key(city)] : undefined;
  const results = useMemo(() => (q ? all.filter((c) => c[0].toLowerCase().startsWith(q.toLowerCase())).slice(0, 8) : []), [q, all]);
  const localTime = (ms: number, tz: number) => new Date(ms + tz * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  const grad = !wx ? '#3a8ee6' : !wx.current.isDay ? 'linear-gradient(#0b1530,#26315c)' : ['rain', 'drizzle', 'storm'].includes(kindOf(wx.current.code)) ? 'linear-gradient(#4b5d73,#7a8ca3)' : ['cloud', 'fog'].includes(kindOf(wx.current.code)) ? 'linear-gradient(#5d7ea3,#9db5cf)' : 'linear-gradient(#2f80ed,#6db8ff)';
  useMenus([{ title: 'View', items: [{ label: 'Refresh', shortcut: 'mod+r', action: () => setData({}) }, { label: unit === 'C' ? 'Show Fahrenheit' : 'Show Celsius', action: () => useSettings.getState().patch('region', { tempUnit: unit === 'C' ? 'F' : 'C' }) }] }], [unit]);
  const lo = wx ? Math.min(...wx.daily.map((d) => d.min)) : 0;
  const hi = wx ? Math.max(...wx.daily.map((d) => d.max)) : 1;

  return (
    <div className="flex h-full min-h-0">
      <div className="w-[250px] flex-none sidebar hairline-r flex flex-col">
        <TitleBar showTitle={false} />
        <div className="px-3 pb-2 relative">
          <SearchField width="100%" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} placeholder="Search for a city" aria-label="Search city" />
          {results.length > 0 && (
            <div className="absolute left-3 right-3 top-[36px] z-20 menu-panel !p-1">
              {results.map((c) => (
                <div key={`${c[0]}${c[2]}`} className="menu-item enabled !pl-2" onClick={() => { set({ cities: [...cities, { name: c[0], country: c[1], lat: c[2], lon: c[3] }] }); setSel(cities.length); setQ(''); }}>
                  <MapPin size={13} /> {c[0]}<span className="opacity-60 text-[11px]">{countryName(c[1])}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="scroll flex-1 px-2 flex flex-col gap-2">
          {cities.map((c, i) => {
            const w = data[key(c)];
            return (
              <div key={key(c)} className="group rounded-[12px] p-3 text-white relative cursor-default" style={{ background: i === sel ? 'linear-gradient(#2f80ed,#5aa9ff)' : 'linear-gradient(#5b6d86,#7d8ea6)', boxShadow: i === sel ? '0 0 0 2px var(--accent)' : undefined }} onClick={() => setSel(i)}>
                <div className="flex justify-between">
                  <div className="min-w-0">
                    <div className="font-bold truncate">{c.name}</div>
                    <div className="text-[11px] opacity-80">{w ? localTime(Date.now(), w.tzOffsetSec) : '…'}</div>
                  </div>
                  <div className="text-[26px] font-light">{w ? `${t(w.current.temp)}°` : ''}</div>
                </div>
                <div className="text-[11px] opacity-90 flex justify-between mt-1"><span>{w ? label(w.current.code) : ''}</span><span>{w ? `H:${t(w.daily[0].max)}° L:${t(w.daily[0].min)}°` : ''}</span></div>
                {cities.length > 1 && <button className="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full border-0 hidden group-hover:grid place-items-center bg-black/50 text-white" aria-label={`Remove ${c.name}`} onClick={(e) => { e.stopPropagation(); set({ cities: cities.filter((_, j) => j !== i) }); setSel(0); }}><X size={10} /></button>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex-1 min-w-0 relative overflow-hidden text-white" style={{ background: grad }}>
        <div className="absolute top-0 inset-x-0"><TitleBar showTitle={false} lights={false} /></div>
        {!wx ? (
          <div className="h-full grid place-items-center"><div className="spinner" style={{ borderTopColor: '#fff' }} /></div>
        ) : (
          <div className="h-full scroll px-8 pt-12 pb-6">
            {!wx.live && (
              <div className="mx-auto max-w-[620px] mb-4 rounded-[12px] px-3 py-2 text-[12px] flex gap-2 items-start" style={{ background: 'rgba(0,0,0,.25)' }}>
                <AlertTriangle size={14} className="flex-none mt-[1px]" />
                <span><b>Demo data — not real weather.</b> {errors[key(city)] === 'offline' ? 'Simulated Wi‑Fi is off.' : 'Live forecasts from Open-Meteo couldn’t be reached from this page (the host may block network requests).'} Sunrise and sunset times are calculated and accurate.</span>
              </div>
            )}
            <div className="text-center">
              <div className="text-[30px] font-semibold">{city.name}</div>
              <div className="text-[84px] font-extralight leading-none">{t(wx.current.temp)}°</div>
              <div className="text-[17px] font-medium opacity-90">{label(wx.current.code)}</div>
              <div className="text-[15px] opacity-90">H:{t(wx.daily[0].max)}°  L:{t(wx.daily[0].min)}°</div>
            </div>
            <div className="max-w-[620px] mx-auto mt-6 rounded-[16px] p-4" style={{ background: 'rgba(255,255,255,.14)', backdropFilter: 'blur(20px)' }}>
              <div className="text-[11px] font-semibold uppercase opacity-70 mb-2">Hourly forecast</div>
              <div className="flex gap-5 overflow-x-auto scroll pb-1">
                {wx.hourly.map((h, i) => (
                  <div key={h.time} className="flex flex-col items-center gap-2 flex-none text-[13px]">
                    <span className="opacity-90">{i === 0 ? 'Now' : new Date(h.time + wx.tzOffsetSec * 1000).toLocaleTimeString([], { hour: 'numeric', timeZone: 'UTC' })}</span>
                    <WxIcon code={h.code} day={h.time > wx.daily[0].sunrise && h.time < wx.daily[0].sunset} />
                    {h.pop >= 30 && <span className="text-[10px] text-[#9ad8ff] -mt-1">{h.pop}%</span>}
                    <span className="font-semibold">{t(h.temp)}°</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="max-w-[620px] mx-auto mt-3 rounded-[16px] p-4" style={{ background: 'rgba(255,255,255,.14)', backdropFilter: 'blur(20px)' }}>
              <div className="text-[11px] font-semibold uppercase opacity-70 mb-2">10-day forecast</div>
              {wx.daily.map((d, i) => (
                <div key={d.date} className="flex items-center gap-3 py-[7px] text-[14px]" style={{ borderTop: i ? '1px solid rgba(255,255,255,.15)' : undefined }}>
                  <span className="w-[56px] font-medium">{i === 0 ? 'Today' : new Date(d.date).toLocaleDateString([], { weekday: 'short' })}</span>
                  <span className="w-[40px] flex flex-col items-center"><WxIcon code={d.code} size={20} />{d.pop >= 30 && <span className="text-[10px] text-[#9ad8ff]">{d.pop}%</span>}</span>
                  <span className="w-[36px] text-right opacity-70">{t(d.min)}°</span>
                  <div className="flex-1 h-[5px] rounded-full relative" style={{ background: 'rgba(0,0,0,.2)' }}>
                    <div className="absolute h-full rounded-full" style={{ left: `${((d.min - lo) / (hi - lo || 1)) * 100}%`, right: `${100 - ((d.max - lo) / (hi - lo || 1)) * 100}%`, background: 'linear-gradient(90deg,#5ac8fa,#ffd60a,#ff9500)' }} />
                  </div>
                  <span className="w-[36px]">{t(d.max)}°</span>
                </div>
              ))}
            </div>
            <div className="max-w-[620px] mx-auto mt-3 grid grid-cols-3 gap-3">
              {[
                { icon: <Sun size={13} />, k: 'UV Index', v: String(Math.round(wx.current.uv)), s: wx.current.uv < 3 ? 'Low' : wx.current.uv < 6 ? 'Moderate' : wx.current.uv < 8 ? 'High' : 'Very High' },
                { icon: <Wind size={13} />, k: 'Wind', v: `${Math.round(wx.current.wind)} km/h`, s: `from ${['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(wx.current.windDir / 45) % 8]}` },
                { icon: <Droplets size={13} />, k: 'Humidity', v: `${Math.round(wx.current.humidity)}%`, s: '' },
                { icon: <Thermometer size={13} />, k: 'Feels Like', v: `${t(wx.current.feels)}°`, s: '' },
                { icon: <Eye size={13} />, k: 'Visibility', v: `${Math.round(wx.current.visibility / 1000)} km`, s: '' },
                { icon: <Gauge size={13} />, k: 'Pressure', v: `${Math.round(wx.current.pressure)} hPa`, s: '' },
                { icon: <Sunrise size={13} />, k: 'Sunrise', v: localTime(wx.daily[0].sunrise, wx.tzOffsetSec), s: `Sunset ${localTime(wx.daily[0].sunset, wx.tzOffsetSec)}` },
                { icon: <Sunset size={13} />, k: 'Daylight', v: `${Math.floor((wx.daily[0].sunset - wx.daily[0].sunrise) / 3600000)}h ${Math.round(((wx.daily[0].sunset - wx.daily[0].sunrise) % 3600000) / 60000)}m`, s: '' },
              ].map((x) => (
                <div key={x.k} className="rounded-[16px] p-3" style={{ background: 'rgba(255,255,255,.14)', backdropFilter: 'blur(20px)' }}>
                  <div className="text-[11px] font-semibold uppercase opacity-70 flex items-center gap-1">{x.icon}{x.k}</div>
                  <div className="text-[24px] mt-1">{x.v}</div>
                  {x.s && <div className="text-[12px] opacity-80">{x.s}</div>}
                </div>
              ))}
            </div>
            <div className="text-center text-[11px] opacity-70 mt-5">{wx.live ? 'Weather data by Open-Meteo.com (CC BY 4.0). Local times are approximate by longitude.' : 'Demo mode — values are illustrative only.'}</div>
          </div>
        )}
      </div>
    </div>
  );
}
