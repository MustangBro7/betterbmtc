import { arrivals, routeDetails, search, searchRoutes, UpstreamUnavailable } from "./transit";
import { staticNearby, staticPlan, staticProvenance, staticRoute, staticRouteNumbersAt, staticRoutesAtStop, staticSearch, staticStopExists } from "./static";
import type { Vehicle } from "./normalizers";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const cacheName = "betterbmtc-api-v1";
function json(value: unknown, init: ResponseInit = {}): Response { const headers = new Headers(init.headers); headers.set("Content-Type", "application/json; charset=utf-8"); Object.entries(cors).forEach(([key, value]) => headers.set(key, value)); return new Response(JSON.stringify(value), { ...init, headers }); }
function unavailable(message = "BMTC live service is temporarily unavailable"): Response { return json({ status: "unavailable", updatedAt: new Date().toISOString(), message }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
function validation(message: string): Response { return json({ error: message }, { status: 400 }); }
function numberParam(url: URL, name: string, min: number, max: number): number | null { const value = Number(url.searchParams.get(name)); return Number.isFinite(value) && value >= min && value <= max ? value : null; }
function publishedStopId(value: string | undefined): string | null { return value && /^[A-Za-z0-9_-]{1,64}$/.test(value) && staticStopExists(value) ? value : null; }
function metersBetween(lat: number, lon: number, otherLat: number, otherLon: number): number { const r = Math.PI / 180; const x = (otherLon - lon) * r * Math.cos(((lat + otherLat) / 2) * r); const y = (otherLat - lat) * r; return 6371000 * Math.hypot(x, y); }
async function nearbyVehicles(lat: number, lon: number, radiusKm: number, nearbyStops: Parameters<typeof staticRouteNumbersAt>[0]) {
  const numbers = staticRouteNumbersAt(nearbyStops, 8); const sampled = numbers.slice(0, 4);
  const outcomes = await Promise.allSettled(sampled.map(async (number) => {
    const matches = await searchRoutes(number); const parent = matches.find((route) => route.number.toLocaleUpperCase("en-IN") === number.toLocaleUpperCase("en-IN")) ?? matches[0];
    if (!parent) return { number, checked: false, vehicles: [] as Vehicle[] };
    const detail = await routeDetails(parent.id, parent.number);
    return { number, checked: true, vehicles: detail.vehicles.filter((vehicle) => metersBetween(lat, lon, vehicle.lat, vehicle.lon) <= radiusKm * 1000) };
  }));
  const completed = outcomes.flatMap((outcome) => outcome.status === "fulfilled" ? [outcome.value] : []);
  if (!completed.length && outcomes.some((outcome) => outcome.status === "rejected")) throw new UpstreamUnavailable("BMTC nearby-route discovery is temporarily unavailable");
  const checked = completed.filter((result) => result.checked).map((result) => result.number);
  const vehicles = [...new Map(completed.flatMap((result) => result.vehicles).map((vehicle) => [vehicle.id, vehicle])).values()];
  return { vehicles, coverage: { status: "partial", candidateRoutes: numbers.length, sampledRoutes: sampled.length, checkedRoutes: checked.length, checkedRouteNumbers: checked, failedRoutes: outcomes.filter((outcome) => outcome.status === "rejected").length } };
}
async function cached(request: Request, ttl: number, task: () => Promise<unknown | Response>): Promise<Response> {
  const key = new Request(request.url, { method: "GET" }); const cache = await caches.open(cacheName); const existing = await cache.match(key); if (existing) return existing;
  const data = await task(); if (data instanceof Response) return data; const response = json(data, { headers: { "Cache-Control": `public, max-age=${ttl}, s-maxage=${ttl}` } });
  await cache.put(key, response.clone()); return response;
}
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
    const url = new URL(request.url); const path = url.pathname.replace(/^\/api/, "");
    try {
      if (path === "/health") {
        try { await search("500"); return json({ ok: true, source: { name: "BMTC unofficial public mobile API", status: "available" }, staticFallback: staticProvenance, checkedAt: new Date().toISOString() }); }
        catch (error) { return json({ ok: true, source: { name: "BMTC unofficial public mobile API", status: "unavailable", message: error instanceof Error ? error.message : "Unavailable" }, staticFallback: staticProvenance, checkedAt: new Date().toISOString() }); }
      }
      if (path === "/nearby") {
        const lat = numberParam(url, "lat", 12, 14); const lon = numberParam(url, "lon", 76, 79); const rawRadius = url.searchParams.get("radius"); const radius = rawRadius === null ? 1 : numberParam(url, "radius", 0.1, 5);
        if (lat === null || lon === null || radius === null) return validation("lat, lon, and radius must be valid Bengaluru-area coordinates and a radius from 0.1 to 5 km");
        return await cached(request, 30, async () => {
          // NearbyStations_v2 no longer answers upstream, so stop locations always come from the static GTFS
          // dataset. Vehicle positions are still live whenever the upstream cooperates.
          const stops = staticNearby(lat, lon, radius);
          try {
            const discovery = await nearbyVehicles(lat, lon, radius, stops);
            return { stops, ...discovery, status: "live", stopsSource: "static", updatedAt: new Date().toISOString(), source: "BMTC unofficial public mobile API", message: "Live bus positions. Stop locations come from the static GTFS dataset, and coverage is partial: only routes serving nearby stops are sampled." };
          } catch (error) {
            if (!(error instanceof UpstreamUnavailable)) throw error;
            return { stops, vehicles: [], status: "static", updatedAt: staticProvenance.feedPublishedAt, source: staticProvenance.source, provenance: staticProvenance, message: "Static route and stop data only. Live vehicle positions and arrival times are unavailable." };
          }
        });
      }
      if (path === "/search") { const q = (url.searchParams.get("q") ?? "").trim(); if (q.length < 2 || q.length > 80) return validation("q must be 2–80 characters"); return await cached(request, 300, async () => { const fallback = staticSearch(q); try { const live = await search(q); /* Live stop search returns rows without coordinates, so static stops stay authoritative for map placement. */ return { stops: live.stops.length ? live.stops : fallback.stops, routes: live.routes.length ? live.routes : fallback.routes, status: "live", provenance: staticProvenance }; } catch (error) { if (error instanceof UpstreamUnavailable) return { ...fallback, status: "static", provenance: staticProvenance }; throw error; } }); }
      const routeMatch = path.match(/^\/routes\/([A-Za-z0-9_-]+)$/); if (routeMatch) { const id = routeMatch[1]; if (id.startsWith("static-") && !staticRoute(id)) return json({ error: "Route not found" }, { status: 404 }); if (!id.startsWith("static-") && !/^\d+$/.test(id)) return validation("Live BMTC route IDs must be numeric"); return await cached(request, 20, async () => { if (id.startsWith("static-")) { const data = staticRoute(id)!; return { ...data, vehicles: [], status: "static", updatedAt: staticProvenance.feedPublishedAt, provenance: staticProvenance, message: "Static route pattern; live vehicle positions are unavailable." }; } const data = await routeDetails(id); return data.stops.length ? { ...data, status: "live", updatedAt: new Date().toISOString() } : json({ error: "Route not found" }, { status: 404 }); }); }
      const arrivalsMatch = path.match(/^\/stops\/([A-Za-z0-9_-]+)\/arrivals$/); if (arrivalsMatch) { const stopId = arrivalsMatch[1]; if (!/^\d+$/.test(stopId) && !staticStopExists(stopId)) return json({ error: "Stop not found" }, { status: 404 }); return await cached(request, 20, async () => { if (!/^\d+$/.test(stopId)) return { vehicles: [], routes: staticRoutesAtStop(stopId), status: "static", updatedAt: staticProvenance.feedPublishedAt, provenance: staticProvenance, message: "Static GTFS data does not include live arrivals." }; try { return { vehicles: await arrivals(stopId), routes: staticRoutesAtStop(stopId), status: "live", updatedAt: new Date().toISOString() }; } catch (error) { if (error instanceof UpstreamUnavailable) return { vehicles: [], routes: staticRoutesAtStop(stopId), status: "static", updatedAt: staticProvenance.feedPublishedAt, provenance: staticProvenance, message: "Static GTFS data does not include live arrivals." }; throw error; } }); }
      if (path === "/plan") { const from = publishedStopId(url.searchParams.get("from") ?? undefined); const to = publishedStopId(url.searchParams.get("to") ?? undefined); if (!from || !to || from === to) return validation("from and to must be different published BMTC stop IDs"); return await cached(request, 60, async () => staticPlan(from, to)); }
      return json({ error: "Not found" }, { status: 404 });
    } catch (error) {
      if (error instanceof UpstreamUnavailable) return unavailable(error.message);
      console.error(JSON.stringify({ event: "api_error", message: error instanceof Error ? error.message : "Unknown error" }));
      return unavailable();
    }
  },
} satisfies ExportedHandler<Env>;
