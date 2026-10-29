import { useEffect } from 'react';
import { API_URL } from '../lib/env';
import { useSettings } from '../stores/settings';

/**
 * Optional Golden Gate Cloud client (Spring Boot backend).
 * Only active when the app is built with VITE_API_URL. Uses an HttpOnly
 * session cookie set by the server, plus a CSRF token cookie for writes.
 * The desktop keeps working fully offline when the backend is unreachable.
 */
export const cloudEnabled = API_URL !== undefined;

function csrfToken(): string | undefined {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith('XSRF-TOKEN='))
    ?.split('=')[1];
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (API_URL === undefined) throw new Error('Cloud sync is not configured for this deployment.');
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const token = csrfToken();
  if (token) headers.set('X-XSRF-TOKEN', decodeURIComponent(token));
  const res = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'include' });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) msg = body.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export interface CloudUser {
  id: number;
  email: string;
  displayName: string;
}

export const cloud = {
  csrf: () => call<void>('/api/auth/csrf'),
  register: (email: string, password: string, displayName: string) =>
    call<CloudUser>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, displayName }) }),
  login: (email: string, password: string) => call<CloudUser>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => call<void>('/api/auth/logout', { method: 'POST' }),
  me: () => call<CloudUser>('/api/auth/me'),
  getPreferences: () => call<{ data: string; updatedAt: string }>('/api/preferences'),
  putPreferences: (data: string) => call<{ data: string; updatedAt: string }>('/api/preferences', { method: 'PUT', body: JSON.stringify({ data }) }),
};

const SYNC_KEYS = ['appearance', 'accent', 'glassTint', 'wallpaper', 'dock', 'menubar', 'desktop', 'sound', 'display', 'accessibility', 'keyboard', 'region'] as const;

export async function pushPreferences() {
  const s = useSettings.getState();
  const data = Object.fromEntries(SYNC_KEYS.map((k) => [k, s[k]]));
  await cloud.putPreferences(JSON.stringify(data));
  s.patch('cloud', { lastSync: Date.now() });
}

export async function pullPreferences() {
  const r = await cloud.getPreferences();
  if (!r?.data) return;
  const data = JSON.parse(r.data) as Record<string, unknown>;
  const s = useSettings.getState();
  for (const k of SYNC_KEYS) if (k in data) s.patch(k, data[k] as never);
  s.patch('cloud', { lastSync: Date.now() });
}

/** Debounced background sync of preferences for signed-in cloud users. */
export function useCloudSync() {
  useEffect(() => {
    if (!cloudEnabled) return;
    let timer: number | undefined;
    const unsub = useSettings.subscribe((s, prev) => {
      if (!s.cloud.email) return;
      if (SYNC_KEYS.every((k) => s[k] === prev[k])) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void pushPreferences().catch(() => undefined), 2000);
    });
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, []);
}
