import rawData from "./static-data.json";
import type { Route, Stop } from "./normalizers";

type StaticRoute = [string, string, string, string, string[]];
type StaticStop = [string, string, number, number];
const data = rawData as { provenance: { source: string; sourceUrl: string; feedCommit: string; feedPublishedAt: string; retrievedAt: string; license: string; note: string }; stops: StaticStop[]; routes: StaticRoute[] };
const stops = new Map(data.stops.map(([id, name, lat, lon]) => [id, { id, name, lat, lon }]));
const routes = data.routes.map(([id, number, from, to, stopIds]) => ({ route: { id: `static-${id}`, number, from, to, type: "BMTC bus" } satisfies Route, stopIds }));
const byStop = new Map<string, typeof routes>();
for (const route of routes) for (const stopId of new Set(route.stopIds)) byStop.set(stopId, [...(byStop.get(stopId) ?? []), route]);
export const staticProvenance = data.provenance;
const fold = (value: string) => value.toLocaleLowerCase("en-IN");
const routeMatches = (route: typeof routes[number], from: string, to: string): boolean => { const a = route.stopIds.indexOf(from); const b = route.stopIds.lastIndexOf(to); return a >= 0 && b > a; };
const publicRoute = (route: typeof routes[number]) => route.route;
const stopFor = (id: string): Stop | undefined => stops.get(id);
function distanceM(a: Stop, lat: number, lon: number): number { const r = Math.PI / 180; const x = (lon - a.lon) * r * Math.cos(((lat + a.lat) / 2) * r); const y = (lat - a.lat) * r; return Math.round(6371000 * Math.hypot(x, y)); }

export function staticSearch(query: string): { stops: Stop[]; routes: Route[] } {
  const term = fold(query); const aliases: Record<string, string[]> = { majestic: ["kempegowda", "kbs"], "silk board": ["central silk board"], kbs: ["kempegowda"] };
  const terms = [term, ...(aliases[term] ?? [])];
  const matchingStops = [...stops.values()].filter((stop) => terms.some((value) => fold(stop.name).includes(value))).slice(0, 12);
  const matchingRoutes = routes.filter((item) => [item.route.number, item.route.from, item.route.to].some((value) => fold(value).includes(term))).slice(0, 12).map(publicRoute);
  return { stops: matchingStops, routes: matchingRoutes };
}
export function staticNearby(lat: number, lon: number, radiusKm: number): Stop[] { const grouped = new Map<string, Stop>(); for (const stop of [...stops.values()].map((item) => ({ ...item, distanceM: distanceM(item, lat, lon) })).filter((item) => item.distanceM <= radiusKm * 1000).sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0))) { const key = fold(stop.name); if (!grouped.has(key)) grouped.set(key, stop); } return [...grouped.values()].slice(0, 20); }
export function staticRoute(id: string): { route: Route; stops: Stop[] } | null { const item = routes.find((entry) => entry.route.id === id); if (!item) return null; return { route: item.route, stops: item.stopIds.map(stopFor).filter((value): value is Stop => Boolean(value)) }; }
/** Candidate route numbers only; GTFS IDs intentionally never cross into live parent-route lookups. */
export function staticRouteNumbersAt(stopsNear: Stop[], limit = 12): string[] { const nearbyIds = new Set(stopsNear.map((stop) => stop.id)); const result: string[] = []; for (const item of routes) { if (!item.stopIds.some((id) => nearbyIds.has(id)) || result.includes(item.route.number)) continue; result.push(item.route.number); if (result.length === limit) break; } return result; }
export function staticStopExists(id: string): boolean { return stops.has(id); }
export function staticRoutesAtStop(id: string): Route[] { return (byStop.get(id) ?? []).slice(0, 24).map(publicRoute); }
function busLeg(entry: typeof routes[number], fromId: string, toId: string) { const from = stopFor(fromId); const to = stopFor(toId); return { type: "bus", route: entry.route, routeNumber: entry.route.number, from: from?.name ?? entry.route.from, to: to?.name ?? entry.route.to, instructions: "Static GTFS route information — live tracking and arrival times are unavailable." }; }
export function staticPlan(from: string, to: string): { legs: unknown[]; transfers: number; source: "static"; provenance: typeof data.provenance } {
  const direct = (byStop.get(from) ?? []).find((entry) => routeMatches(entry, from, to));
  if (direct) return { legs: [busLeg(direct, from, to)], transfers: 0, source: "static", provenance: data.provenance };
  const originRoutes = byStop.get(from) ?? []; const destinationRoutes = byStop.get(to) ?? [];
  for (const first of originRoutes.slice(0, 80)) for (const second of destinationRoutes.slice(0, 80)) {
    const candidate = first.stopIds.find((stopId) => stopId !== from && stopId !== to && routeMatches(first, from, stopId) && routeMatches(second, stopId, to));
    if (candidate) return { legs: [busLeg(first, from, candidate), busLeg(second, candidate, to)], transfers: 1, source: "static", provenance: data.provenance };
  }
  return { legs: [], transfers: 0, source: "static", provenance: data.provenance };
}
