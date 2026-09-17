import type { Nearby, SearchResult, RouteDetail, Arrivals, Point } from './types';
const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
async function fallback<T>(path: string, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  const { offlineRequest } = await import('./offline');
  signal?.throwIfAborted();
  return offlineRequest(path) as T;
}
export async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  if ((import.meta.env.PROD && !import.meta.env.VITE_API_URL) || !navigator.onLine) return fallback<T>(path, signal);
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) });
  } catch (error) {
    if (signal?.aborted) throw error;
    return fallback<T>(path, signal);
  }
  if (response.status >= 500) return fallback<T>(path, signal);
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || error?.error || 'The transit service is taking a break. Please try again.');
  }
  if (!response.headers.get('content-type')?.includes('application/json')) return fallback<T>(path, signal);
  return response.json();
}
export const api = {
  nearby: (point: Point, radius: number, signal?: AbortSignal) => request<Nearby>(`/nearby?lat=${point.lat}&lon=${point.lon}&radius=${radius}`, signal),
  search: (q: string, signal?: AbortSignal) => request<SearchResult>(`/search?q=${encodeURIComponent(q)}`, signal),
  route: (id: string, signal?: AbortSignal) => request<RouteDetail>(`/routes/${encodeURIComponent(id)}`, signal),
  arrivals: (id: string, signal?: AbortSignal) => request<Arrivals>(`/stops/${encodeURIComponent(id)}/arrivals`, signal),
};
export function distanceLabel(m?: number) { return m === undefined ? '' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`; }
export function walkLabel(m?: number) { return m === undefined ? '' : `~${Math.max(1, Math.ceil(m / 70))} min walk`; }
export function readSaved(): import('./types').SavedItem[] {
  try { const data = JSON.parse(localStorage.getItem('betterbmtc:saved') || '[]'); return Array.isArray(data) ? data.filter((x) => x && ['stop', 'route'].includes(x.kind) && typeof x.item?.id === 'string').slice(0, 100) : []; } catch { return []; }
}
