import { describe, expect, it } from "vitest";
import { etaMinutes, normalizeNearby, normalizeRouteDetails, normalizeRouteSearch } from "../src/normalizers";

describe("BMTC response normalizers", () => {
  it("normalizes nearby stops and converts km to meters", () => expect(normalizeNearby({ data: [{ geofenceid: 22, geofencename: "MG Road", center_lat: 12.975, center_lon: 77.61, distance: 0.43 }] })).toEqual([{ id: "22", name: "MG Road", lat: 12.975, lon: 77.61, distanceM: 430 }]));
  it("drops malformed stops", () => expect(normalizeNearby({ data: [{ geofenceid: 1, geofencename: "Bad", center_lat: "oops" }] })).toEqual([]));
  it("normalizes route ids", () => expect(normalizeRouteSearch({ data: [{ routeparentid: 9, routeno: "V-500" }] })).toEqual([{ id: "9", number: "V-500", from: "", to: "" }]));
  it("deduplicates live vehicles and reads ETA", () => {
    const value = normalizeRouteDetails({ up: { data: [{ stationid: 1, stationname: "A", centerlat: 12.9, centerlong: 77.5, vehicleDetails: [{ vehicleid: 44, routeno: "500", centerlat: 12.91, centerlong: 77.51, eta: "7 mins" }] }] }, down: { data: [] } }, { id: "9", number: "500", from: "", to: "" });
    expect(value.vehicles).toEqual([{ id: "44", routeNumber: "500", routeId: "9", lat: 12.91, lon: 77.51, direction: "up", etaMinutes: 7 }]); expect(etaMinutes("Due 3.5 min")).toBe(3.5);
  });
  it("rejects empty and out-of-region coordinates", () => expect(normalizeNearby({ data: [{ geofenceid: 1, geofencename: "Bad", center_lat: "", center_lon: null }, { geofenceid: 2, geofencename: "Also bad", center_lat: 0, center_lon: 0 }] })).toEqual([]));
  it("does not mistake times or negative values for an ETA", () => { expect(etaMinutes("12:30")).toBeUndefined(); expect(etaMinutes("-5 min")).toBeUndefined(); expect(etaMinutes(4)).toBe(4); });
});
