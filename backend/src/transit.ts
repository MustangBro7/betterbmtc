import { normalizeNearby, normalizeRouteDetails, normalizeRouteSearch, normalizeStopsSearch, normalizeStationTrips, type Route, type Stop, type Vehicle } from "./normalizers";

const BASE = "https://bmtcmobileapi.karnataka.gov.in/WebAPI/";
const headers = { "Content-Type": "application/json", Accept: "application/json, text/plain, */*", lan: "en", deviceType: "WEB", authToken: "N/A", deviceId: "" };
export class UpstreamUnavailable extends Error {}
async function post(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(new URL(endpoint, BASE), { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
    if (!response.ok) throw new UpstreamUnavailable(`BMTC upstream returned ${response.status}`);
    return await response.json() as unknown;
  } catch (error) { throw error instanceof UpstreamUnavailable ? error : new UpstreamUnavailable("BMTC live service is temporarily unavailable"); }
  finally { clearTimeout(timer); }
}
export async function nearby(lat: number, lon: number, radius: number): Promise<Stop[]> { return normalizeNearby(await post("NearbyStations_v2", { latitude: lat, longitude: lon, radiuskm: radius, stationflag: 1, flexiflag: 2 })); }
export async function search(query: string): Promise<{ stops: Stop[]; routes: Route[] }> {
  const [stops, routes] = await Promise.all([post("FindNearByBusStop_v2", { stationname: query, stationflag: 1 }), post("SearchRoute_v2", { routetext: query })]);
  return { stops: normalizeStopsSearch(stops), routes: normalizeRouteSearch(routes) };
}
export async function searchRoutes(query: string): Promise<Route[]> { return normalizeRouteSearch(await post("SearchRoute_v2", { routetext: query })); }
export async function routeDetails(id: string, number = ""): Promise<{ route: Route; stops: Stop[]; vehicles: Vehicle[] }> {
  const route: Route = { id, number: number || id, from: "", to: "" };
  const result = normalizeRouteDetails(await post("SearchByRouteDetails_v4", { routeid: Number(id) }), route);
  return { route, ...result };
}
export async function arrivals(stopId: string): Promise<Vehicle[]> { return normalizeStationTrips(await post("getMobileTripsData", { stationid: Number(stopId), triptype: 1 })); }
export async function plan(from: string, to: string): Promise<unknown> { return post("TripPlannerMSMD", { fromStationId: Number(from), toStationId: Number(to) }); }
