/** Google Maps Platform access for the Maps app: script loader plus Places (New), Routes and Geocoding REST calls. */

const KEY_STORE = 'gg.googleMapsKey';
const ENV_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || '';

/** A key pasted into Maps wins over a build-time VITE_GOOGLE_MAPS_API_KEY. */
export function getMapsKey(): string {
  try {
    return localStorage.getItem(KEY_STORE) || ENV_KEY;
  } catch {
    return ENV_KEY;
  }
}
export function setMapsKey(key: string) {
  try {
    if (key.trim()) localStorage.setItem(KEY_STORE, key.trim());
    else localStorage.removeItem(KEY_STORE);
  } catch {
    /* storage blocked */
  }
}

let authFailed = false;
const authListeners = new Set<() => void>();
/** Google calls gm_authFailure when the key is invalid, restricted for this address, or the Maps JavaScript API isn't enabled. */
export function onMapsAuthFailure(cb: () => void): () => void {
  if (authFailed) cb();
  authListeners.add(cb);
  return () => authListeners.delete(cb);
}

let loader: Promise<void> | null = null;
export function loadGoogleMaps(): Promise<void> {
  if (loader) return loader;
  const key = getMapsKey();
  if (!key) return Promise.reject(new Error('No Google Maps API key.'));
  loader = new Promise<void>((resolve, reject) => {
    const w = window as unknown as { gm_authFailure?: () => void; __ggMapsReady?: () => void };
    w.gm_authFailure = () => {
      authFailed = true;
      authListeners.forEach((f) => f());
    };
    w.__ggMapsReady = () => resolve();
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__ggMapsReady`;
    s.async = true;
    s.onerror = () => {
      loader = null;
      s.remove();
      reject(new Error('Couldn’t reach Google Maps. Check your internet connection.'));
    };
    document.head.appendChild(s);
  });
  return loader;
}

const headers = (mask?: string): HeadersInit => ({ 'Content-Type': 'application/json', 'X-Goog-Api-Key': getMapsKey(), ...(mask ? { 'X-Goog-FieldMask': mask } : {}) });

async function fail(r: Response): Promise<never> {
  const j = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
  throw new Error(j?.error?.message ?? `Google returned ${r.status}`);
}

export interface Suggestion {
  id: string;
  main: string;
  secondary: string;
}
export async function autocomplete(input: string, near?: { lat: number; lon: number }): Promise<Suggestion[]> {
  const body = { input, ...(near ? { locationBias: { circle: { center: { latitude: near.lat, longitude: near.lon }, radius: 50000 } } } : {}) };
  const r = await fetch('https://places.googleapis.com/v1/places:autocomplete', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  if (!r.ok) return fail(r);
  const j = (await r.json()) as { suggestions?: { placePrediction?: { placeId: string; text?: { text: string }; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } } }[] };
  return (j.suggestions ?? []).flatMap((s) => {
    const p = s.placePrediction;
    return p ? [{ id: p.placeId, main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '', secondary: p.structuredFormat?.secondaryText?.text ?? '' }] : [];
  });
}

export interface GooglePlace {
  name: string;
  address: string;
  lat: number;
  lon: number;
  rating?: number;
  ratings?: number;
  phone?: string;
  website?: string;
  open?: boolean;
}
export async function placeDetails(id: string): Promise<GooglePlace> {
  const mask = 'displayName,formattedAddress,location,rating,userRatingCount,nationalPhoneNumber,websiteUri,currentOpeningHours.openNow';
  const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, { headers: headers(mask) });
  if (!r.ok) return fail(r);
  const j = (await r.json()) as { displayName?: { text: string }; formattedAddress?: string; location: { latitude: number; longitude: number }; rating?: number; userRatingCount?: number; nationalPhoneNumber?: string; websiteUri?: string; currentOpeningHours?: { openNow?: boolean } };
  return { name: j.displayName?.text ?? j.formattedAddress ?? 'Place', address: j.formattedAddress ?? '', lat: j.location.latitude, lon: j.location.longitude, rating: j.rating, ratings: j.userRatingCount, phone: j.nationalPhoneNumber, website: j.websiteUri, open: j.currentOpeningHours?.openNow };
}

/** Name the spot under a map click. */
export async function reverseGeocode(lat: number, lon: number): Promise<GooglePlace> {
  const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${encodeURIComponent(getMapsKey())}`);
  const j = (await r.json()) as { status: string; error_message?: string; results: { formatted_address: string; address_components: { long_name: string }[] }[] };
  if (j.status !== 'OK' && j.status !== 'ZERO_RESULTS') throw new Error(j.error_message ?? j.status);
  const top = j.results[0];
  return { name: top?.address_components[0]?.long_name ?? 'Dropped Pin', address: top?.formatted_address ?? `${lat.toFixed(5)}, ${lon.toFixed(5)}`, lat, lon };
}

export type TravelMode = 'DRIVE' | 'WALK' | 'BICYCLE' | 'TRANSIT';
export interface RouteResult {
  meters: number;
  seconds: number;
  path: { lat: number; lng: number }[];
  steps: { text: string; meters: number }[];
}
export async function computeRoute(from: { lat: number; lon: number }, to: { lat: number; lon: number }, mode: TravelMode, imperial: boolean): Promise<RouteResult> {
  const pt = (p: { lat: number; lon: number }) => ({ location: { latLng: { latitude: p.lat, longitude: p.lon } } });
  const body = { origin: pt(from), destination: pt(to), travelMode: mode, ...(mode === 'DRIVE' ? { routingPreference: 'TRAFFIC_AWARE' } : {}), languageCode: 'en-US', units: imperial ? 'IMPERIAL' : 'METRIC' };
  const mask = 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.navigationInstruction,routes.legs.steps.distanceMeters';
  const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', { method: 'POST', headers: headers(mask), body: JSON.stringify(body) });
  if (!r.ok) return fail(r);
  const j = (await r.json()) as { routes?: { duration: string; distanceMeters: number; polyline: { encodedPolyline: string }; legs?: { steps?: { navigationInstruction?: { instructions?: string }; distanceMeters?: number }[] }[] }[] };
  const route = j.routes?.[0];
  if (!route) throw new Error('No route found between these places for that way of travelling.');
  const steps = (route.legs ?? []).flatMap((l) => l.steps ?? []).flatMap((s) => (s.navigationInstruction?.instructions ? [{ text: s.navigationInstruction.instructions, meters: s.distanceMeters ?? 0 }] : []));
  return { meters: route.distanceMeters, seconds: parseInt(route.duration, 10), path: decodePolyline(route.polyline.encodedPolyline), steps };
}

function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  const out: { lat: number; lng: number }[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let shift = 0;
    let result = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < encoded.length) {
    lat += next();
    lng += next();
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}

export function formatDuration(sec: number): string {
  const m = Math.max(1, Math.round(sec / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
export function formatDistance(meters: number, imperial: boolean): string {
  if (imperial) {
    const mi = meters / 1609.344;
    return mi < 0.1 ? `${Math.round(meters * 3.28084)} ft` : `${mi.toFixed(mi < 10 ? 1 : 0)} mi`;
  }
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}
