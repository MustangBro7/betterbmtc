export type Stop = { id: string; name: string; lat: number; lon: number; distanceM?: number };
export type Route = { id: string; number: string; from: string; to: string; type?: string };
export type Vehicle = { id: string; routeNumber: string; routeId?: string; lat: number; lon: number; destination?: string; direction?: "up" | "down"; etaMinutes?: number };

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown): string => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
const numeric = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};
const data = (value: unknown): RecordValue[] => {
  const candidate = record(value).data;
  return Array.isArray(candidate) ? candidate.map(record) : [];
};
const coordinate = (value: unknown, aliases: string[], min: number, max: number): number | null => {
  const item = record(value);
  for (const key of aliases) { const n = numeric(item[key]); if (n !== null && n >= min && n <= max) return n; }
  return null;
};
export const etaMinutes = (value: unknown): number | undefined => {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : undefined;
  const match = text(value).match(/(?:^|[^0-9-])(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes)\b/i);
  const result = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(result) && result >= 0 ? result : undefined;
};

export function normalizeNearby(raw: unknown): Stop[] {
  return data(raw).flatMap((item) => {
    const lat = coordinate(item, ["center_lat", "latitude"], 8, 18); const lon = coordinate(item, ["center_lon", "longitude"], 70, 85);
    const id = text(item.geofenceid ?? item.stationid ?? item.routeid); const name = text(item.geofencename ?? item.stationname ?? item.routename);
    if (!id || !name || lat === null || lon === null) return [];
    const km = numeric(item.distance);
    return [{ id, name, lat, lon, ...(km !== null ? { distanceM: Math.round(km * 1000) } : {}) }];
  });
}
export function normalizeStopsSearch(raw: unknown): Stop[] {
  return data(raw).flatMap((item) => {
    const lat = coordinate(item, ["center_lat", "latitude"], 8, 18); const lon = coordinate(item, ["center_lon", "longitude"], 70, 85);
    const id = text(item.routeid ?? item.stationid); const name = text(item.routename ?? item.stationname);
    return id && name && lat !== null && lon !== null ? [{ id, name, lat, lon }] : [];
  });
}
export function normalizeRouteSearch(raw: unknown): Route[] {
  return data(raw).flatMap((item) => {
    const id = text(item.routeparentid); const number = text(item.routeno);
    return id && number ? [{ id, number, from: "", to: "" }] : [];
  });
}
export function normalizeRouteDetails(raw: unknown, route: Route): { stops: Stop[]; vehicles: Vehicle[]; stopsDirection: "up" | "down" } {
  const root = record(raw); const stopsByDirection: Record<"up" | "down", Stop[]> = { up: [], down: [] }; const allVehicles: Vehicle[] = [];
  for (const direction of ["up", "down"]) {
    const group = record(root[direction]);
    for (const item of data(group)) {
      const lat = coordinate(item, ["centerlat", "center_lat", "latitude"], 8, 18); const lon = coordinate(item, ["centerlong", "center_lon", "longitude"], 70, 85);
      const id = text(item.stationid); const name = text(item.stationname);
      if (id && name && lat !== null && lon !== null) stopsByDirection[direction as "up" | "down"].push({ id, name, lat, lon });
      const details = Array.isArray(item.vehicleDetails) ? item.vehicleDetails.map(record) : [];
      for (const vehicle of details) allVehicles.push(...normalizeVehicle(vehicle, route, direction as "up" | "down"));
    }
    const mapData = Array.isArray(group.mapData) ? group.mapData.map(record) : [];
    for (const vehicle of mapData) allVehicles.push(...normalizeVehicle(vehicle, route, direction as "up" | "down"));
  }
  // BMTC often repeats a vehicle for each stop. Preserve latest distinct record only.
  const stopsDirection = stopsByDirection.up.length ? "up" : "down";
  return { stops: unique(stopsByDirection[stopsDirection], (item) => item.id), vehicles: unique(allVehicles, (item) => item.id), stopsDirection };
}
export function normalizeStationTrips(raw: unknown): Vehicle[] {
  return data(raw).flatMap((item) => {
    const id = text(item.vehicleid); const routeNumber = text(item.routeno); const lat = coordinate(item, ["centerlat", "center_lat"], 8, 18); const lon = coordinate(item, ["centerlong", "center_lon"], 70, 85);
    // Station-trip response has no authoritative position. Do not invent one.
    return id && routeNumber && lat !== null && lon !== null ? [{ id, routeNumber, lat, lon, destination: text(item.tostationname) || undefined, etaMinutes: etaMinutes(item.arrivaltime) }] : [];
  });
}
function normalizeVehicle(item: RecordValue, route: Route, direction: "up" | "down"): Vehicle[] {
  const id = text(item.vehicleid); const lat = coordinate(item, ["centerlat", "center_lat", "latitude"], 8, 18); const lon = coordinate(item, ["centerlong", "center_lon", "longitude"], 70, 85);
  if (!id || lat === null || lon === null) return [];
  return [{ id, routeNumber: text(item.routeno) || route.number, routeId: route.id, lat, lon, destination: text(item.destinationstation ?? item.tostationname) || undefined, direction, etaMinutes: etaMinutes(item.eta) }];
}
function unique<T>(items: T[], key: (item: T) => string): T[] { return [...new Map(items.map((item) => [key(item), item])).values()]; }
