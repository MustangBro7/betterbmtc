/** Build a compact, derived fallback from Vonter/bmtc-gtfs (ODbL-1.0). */
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";

const input = process.env.GTFS_DIR ?? "/tmp/vonter-gtfs";
const out = new URL("../src/static-data.json", import.meta.url);
function csv(line) { const result = []; let value = ""; let quoted = false; for (let i = 0; i < line.length; i += 1) { const char = line[i]; if (char === '"') { if (quoted && line[i + 1] === '"') { value += char; i += 1; } else quoted = !quoted; } else if (char === "," && !quoted) { result.push(value); value = ""; } else value += char; } result.push(value); return result; }
async function rows(name, visitor) { const stream = createInterface({ input: createReadStream(`${input}/${name}.txt`) }); let header = []; for await (const line of stream) { if (!header.length) { header = csv(line); continue; } if (!line) continue; const values = csv(line); visitor(Object.fromEntries(header.map((key, i) => [key, values[i] ?? ""]))); } }
const stops = new Map(); const routes = new Map(); const firstTrip = new Map(); const tripRoute = new Map(); const stopSequences = new Map();
await rows("stops", (row) => { const lat = Number(row.stop_lat); const lon = Number(row.stop_lon); if (row.stop_id && row.stop_name && Number.isFinite(lat) && Number.isFinite(lon)) stops.set(row.stop_id, [row.stop_id, row.stop_name, Number(lat.toFixed(6)), Number(lon.toFixed(6))]); });
await rows("routes", (row) => { if (row.route_id && row.route_short_name) routes.set(row.route_id, [row.route_id, row.route_short_name, row.route_long_name || ""]); });
await rows("trips", (row) => { if (routes.has(row.route_id) && !firstTrip.has(row.route_id)) firstTrip.set(row.route_id, row.trip_id); if (routes.has(row.route_id)) tripRoute.set(row.trip_id, row.route_id); });
const selectedTripIds = new Set(firstTrip.values());
await rows("stop_times", (row) => { if (!selectedTripIds.has(row.trip_id) || !stops.has(row.stop_id)) return; const sequence = Number(row.stop_sequence); if (!Number.isFinite(sequence)) return; const list = stopSequences.get(row.trip_id) ?? []; list.push([sequence, row.stop_id]); stopSequences.set(row.trip_id, list); });
const staticRoutes = [];
for (const [id, [routeId, number, longName]] of routes) { const trip = firstTrip.get(id); const sequence = (stopSequences.get(trip) ?? []).sort((a, b) => a[0] - b[0]).map((item) => item[1]); if (sequence.length < 2) continue; const from = stops.get(sequence[0])?.[1] ?? ""; const to = stops.get(sequence.at(-1))?.[1] ?? ""; staticRoutes.push([routeId, number, from, to, sequence]); }
const usedStops = new Set(staticRoutes.flatMap((route) => route[4]));
const payload = { provenance: { source: "Vonter/bmtc-gtfs", sourceUrl: "https://github.com/Vonter/bmtc-gtfs", feedCommit: "ee945dc0c21b29193f88e3e1e9af218dd24ea182", feedPublishedAt: "2026-09-08T03:58:57Z", retrievedAt: new Date().toISOString().slice(0, 10), license: "ODbL-1.0", note: "Unofficial static BMTC GTFS fallback; routes and stop sequences may be historical or incomplete." }, stops: [...stops.values()].filter((item) => usedStops.has(item[0])), routes: staticRoutes };
await mkdir(new URL("../src/", import.meta.url), { recursive: true }); await writeFile(out, JSON.stringify(payload));
console.log(JSON.stringify({ stops: payload.stops.length, routes: payload.routes.length, bytes: Buffer.byteLength(JSON.stringify(payload)) }));
