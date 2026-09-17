// The same pure GTFS engine runs on Cloudflare and, when disconnected, on-device.
// Loaded on demand: the transit database is not in the initial JavaScript bundle.
import { staticNearby, staticSearch, staticRoute, staticPlan, staticProvenance, staticRoutesAtStop, staticStopExists } from '../backend/src/static';
export function offlineRequest(path: string): unknown {
  const url = new URL(path, 'https://betterbmtc.local');
  const meta = { status: 'static', source: 'On-device static BMTC data', provenance: staticProvenance, updatedAt: staticProvenance.retrievedAt, message: 'Static route data. Live positions and arrivals are unavailable.' };
  if (url.pathname === '/nearby') {
    const lat = Number(url.searchParams.get('lat')), lon = Number(url.searchParams.get('lon')), radius = Number(url.searchParams.get('radius'));
    if (!url.searchParams.has('lat') || !url.searchParams.has('lon') || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < 12 || lat > 14 || lon < 76 || lon > 79 || radius <= 0 || radius > 5) throw new Error('Choose a location in Bengaluru.');
    return { ...meta, stops: staticNearby(lat, lon, radius), vehicles: [] };
  }
  if (url.pathname === '/search') return { ...meta, ...staticSearch(url.searchParams.get('q') || '') };
  if (url.pathname.startsWith('/routes/')) {
    const route = staticRoute(decodeURIComponent(url.pathname.slice(8)));
    if (!route) throw new Error('This route is not available in the offline dataset. Please reconnect to view it.');
    return { ...meta, ...route, vehicles: [] };
  }
  const arrivals = url.pathname.match(/^\/stops\/([^/]+)\/arrivals$/);
  if (arrivals) return { ...meta, routes: staticRoutesAtStop(decodeURIComponent(arrivals[1])), vehicles: [] };
  if (url.pathname === '/plan') {
    const from = url.searchParams.get('from') || '', to = url.searchParams.get('to') || '';
    if (!staticStopExists(from) || !staticStopExists(to) || from === to) throw new Error('Choose two different stops from the search results.');
    return staticPlan(from, to);
  }
  throw new Error('This feature needs a connection. Please try again.');
}
