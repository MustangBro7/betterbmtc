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
// BMTC reports arrival times as IST wall-clock strings ("2026-09-17 20:15:00" or "17-09-2026 20:15:00").
// Workers run in UTC, so the offset has to be applied explicitly rather than letting Date parse it locally.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const absoluteEtaMs = (value: string): number | null => {
  const ymd = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  const dmy = value.match(/^(\d{2})-(\d{2})-(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  const parts = ymd ? [ymd[1], ymd[2], ymd[3], ymd[4], ymd[5], ymd[6]] : dmy ? [dmy[3], dmy[2], dmy[1], dmy[4], dmy[5], dmy[6]] : null;
  if (!parts) return null;
  const [year, month, day, hour, minute, second] = parts.map((part) => Number(part ?? "0"));
  const ms = Date.UTC(year, month - 1, day, hour, minute, second) - IST_OFFSET_MS;
  return Number.isFinite(ms) ? ms : null;
};
/** Absolute feed timestamps become minutes from now; anything already passed or absurdly far ahead is dropped. */
export const etaMinutes = (value: unknown, now = Date.now()): number | undefined => {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : undefined;
  const raw = text(value);
  const absolute = absoluteEtaMs(raw);
  if (absolute !== null) { const minutes = Math.round((absolute - now) / 60_000); return minutes >= 0 && minutes <= 180 ? minutes : undefined; }
  const match = raw.match(/(?:^|[^0-9-])(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes)\b/i);
  const result = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(result) && result >= 0 ? result : undefined;
};

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
      // Callers only know the numeric route id; the stop records carry the public route number and terminals.
      if (!route.number || route.number === route.id) route.number = text(item.routeno) || route.number;
      if (!route.from) route.from = text(item.from);
      if (!route.to) route.to = text(item.to);
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
