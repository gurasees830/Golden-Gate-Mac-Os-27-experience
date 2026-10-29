import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, onMapsAuthFailure } from './google';

export type GoogleMapType = 'roadmap' | 'satellite' | 'hybrid' | 'terrain';
interface LatLon {
  lat: number;
  lon: number;
}
interface Props {
  start: LatLon & { z: number };
  /** Move the camera here whenever `n` changes. */
  focus: (LatLon & { zoom?: number; n: number }) | null;
  dark: boolean;
  mapType: GoogleMapType;
  selected: LatLon | null;
  routeEnds: { from: LatLon; to: LatLon } | null;
  path: { lat: number; lng: number }[] | null;
  me: (LatLon & { acc: number }) | null;
  onView: (v: LatLon & { z: number }) => void;
  /** A click on the map or on one of Google's points of interest. */
  onPick: (p: LatLon & { placeId?: string }) => void;
  onFailure: (message: string) => void;
}

/** Interactive Google map. Everything the app draws (pins, route, your location) is driven by props. */
export function GoogleMapView(p: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const libs = useRef<{ marker: google.maps.MarkerLibrary; maps: google.maps.MapsLibrary } | null>(null);
  const cb = useRef(p);
  cb.current = p;
  const [ready, setReady] = useState(false);
  const overlays = useRef<{ selected?: google.maps.marker.AdvancedMarkerElement; from?: google.maps.marker.AdvancedMarkerElement; to?: google.maps.marker.AdvancedMarkerElement; me?: google.maps.marker.AdvancedMarkerElement; halo?: google.maps.Circle; line?: google.maps.Polyline }>({});

  useEffect(() => {
    let dead = false;
    const off = onMapsAuthFailure(() => cb.current.onFailure('Google rejected the API key. Make sure “Maps JavaScript API” is enabled for it and that it allows this site’s address.'));
    (async () => {
      try {
        await loadGoogleMaps();
        const [maps, marker] = await Promise.all([google.maps.importLibrary('maps') as Promise<google.maps.MapsLibrary>, google.maps.importLibrary('marker') as Promise<google.maps.MarkerLibrary>]);
        if (dead || !host.current) return;
        libs.current = { maps, marker };
        const s = cb.current.start;
        const m = new maps.Map(host.current, {
          center: { lat: s.lat, lng: s.lon },
          zoom: Math.round(s.z),
          mapId: 'DEMO_MAP_ID', // required for the pin markers; styling comes from colorScheme
          colorScheme: cb.current.dark ? google.maps.ColorScheme.DARK : google.maps.ColorScheme.LIGHT,
          mapTypeId: cb.current.mapType,
          disableDefaultUI: true,
          gestureHandling: 'greedy',
          clickableIcons: true,
        });
        m.addListener('idle', () => {
          const c = m.getCenter();
          if (c) cb.current.onView({ lat: c.lat(), lon: c.lng(), z: m.getZoom() ?? 10 });
        });
        m.addListener('click', (e: google.maps.MapMouseEvent | google.maps.IconMouseEvent) => {
          if (!e.latLng) return;
          const placeId = (e as google.maps.IconMouseEvent).placeId;
          if (placeId) e.stop?.(); // keep Google's own info window closed; the sidebar shows the place
          cb.current.onPick({ lat: e.latLng.lat(), lon: e.latLng.lng(), placeId: placeId ?? undefined });
        });
        map.current = m;
        setReady(true);
      } catch (e) {
        if (!dead) cb.current.onFailure((e as Error).message);
      }
    })();
    return () => {
      dead = true;
      off();
      map.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    if (ready && p.focus) {
      const m = map.current!;
      m.panTo({ lat: p.focus.lat, lng: p.focus.lon });
      if (p.focus.zoom != null) m.setZoom(Math.round(p.focus.zoom));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, p.focus?.n]);

  useEffect(() => {
    if (ready) map.current!.setMapTypeId(p.mapType);
  }, [ready, p.mapType]);

  // pins, route line and the blue dot
  useEffect(() => {
    if (!ready) return;
    const { marker } = libs.current!;
    const m = map.current!;
    const o = overlays.current;
    const pin = (at: LatLon | null, key: 'selected' | 'from' | 'to', color: string) => {
      if (o[key]) o[key]!.map = null;
      o[key] = undefined;
      if (!at) return;
      const el = new marker.PinElement({ background: color, borderColor: '#fff', glyphColor: '#fff' });
      o[key] = new marker.AdvancedMarkerElement({ map: m, position: { lat: at.lat, lng: at.lon }, content: el });
    };
    if (p.routeEnds) {
      pin(null, 'selected', '');
      pin(p.routeEnds.from, 'from', '#34c759');
      pin(p.routeEnds.to, 'to', '#ff3b30');
    } else {
      pin(null, 'from', '');
      pin(null, 'to', '');
      pin(p.selected, 'selected', '#ff3b30');
    }
    o.line?.setMap(null);
    o.line = undefined;
    if (p.path?.length) {
      o.line = new libs.current!.maps.Polyline({ map: m, path: p.path, strokeColor: '#007aff', strokeOpacity: 0.95, strokeWeight: 6 });
      const b = new google.maps.LatLngBounds();
      p.path.forEach((pt) => b.extend(pt));
      m.fitBounds(b, 70);
    }
  }, [ready, p.selected?.lat, p.selected?.lon, p.routeEnds, p.path]);

  useEffect(() => {
    if (!ready) return;
    const { marker, maps } = libs.current!;
    const o = overlays.current;
    if (o.me) o.me.map = null;
    o.halo?.setMap(null);
    o.me = undefined;
    o.halo = undefined;
    if (!p.me) return;
    const dot = document.createElement('div');
    dot.style.cssText = 'width:18px;height:18px;border-radius:50%;background:#007aff;border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.2),0 2px 6px rgba(0,0,0,.35)';
    const at = { lat: p.me.lat, lng: p.me.lon };
    o.me = new marker.AdvancedMarkerElement({ map: map.current!, position: at, content: dot, zIndex: 10 });
    o.halo = new maps.Circle({ map: map.current!, center: at, radius: p.me.acc, strokeWeight: 0, fillColor: '#007aff', fillOpacity: 0.15, clickable: false });
  }, [ready, p.me?.lat, p.me?.lon, p.me?.acc]);

  return <div ref={host} className="absolute inset-0" aria-label="Google map" />;
}
