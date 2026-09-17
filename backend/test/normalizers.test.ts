import { describe, expect, it } from "vitest";
import { etaMinutes, normalizeRouteDetails, normalizeRouteSearch, normalizeStopsSearch } from "../src/normalizers";

describe("BMTC response normalizers", () => {
  it("normalizes searched stops", () => expect(normalizeStopsSearch({ data: [{ routeid: 22, routename: "MG Road", center_lat: 12.975, center_lon: 77.61 }] })).toEqual([{ id: "22", name: "MG Road", lat: 12.975, lon: 77.61 }]));
  it("drops malformed stops", () => expect(normalizeStopsSearch({ data: [{ routeid: 1, routename: "Bad", center_lat: "oops" }] })).toEqual([]));
  it("rejects empty and out-of-region coordinates", () => expect(normalizeStopsSearch({ data: [{ routeid: 1, routename: "Bad", center_lat: "", center_lon: null }, { routeid: 2, routename: "Also bad", center_lat: 0, center_lon: 0 }] })).toEqual([]));
  it("normalizes route ids", () => expect(normalizeRouteSearch({ data: [{ routeparentid: 9, routeno: "V-500" }] })).toEqual([{ id: "9", number: "V-500", from: "", to: "" }]));
  it("deduplicates live vehicles and reads ETA", () => {
    const value = normalizeRouteDetails({ up: { data: [{ stationid: 1, stationname: "A", centerlat: 12.9, centerlong: 77.5, vehicleDetails: [{ vehicleid: 44, routeno: "500", centerlat: 12.91, centerlong: 77.51, eta: "7 mins" }] }] }, down: { data: [] } }, { id: "9", number: "500", from: "", to: "" });
    expect(value.vehicles).toEqual([{ id: "44", routeNumber: "500", routeId: "9", lat: 12.91, lon: 77.51, direction: "up", etaMinutes: 7 }]); expect(etaMinutes("Due 3.5 min")).toBe(3.5);
  });
  it("does not mistake times or negative values for an ETA", () => { expect(etaMinutes("12:30")).toBeUndefined(); expect(etaMinutes("-5 min")).toBeUndefined(); expect(etaMinutes(4)).toBe(4); });
  it("reads the feed's IST timestamps as minutes from now", () => {
    // 20:15 IST is 14:45 UTC; from 14:30 UTC that is 15 minutes away.
    const now = Date.parse("2026-09-17T14:30:00Z");
    expect(etaMinutes("2026-09-17 20:15:00", now)).toBe(15);
    expect(etaMinutes("17-09-2026 20:15:00", now)).toBe(15);
  });
  it("drops feed timestamps already passed or implausibly far ahead", () => {
    const now = Date.parse("2026-09-17T14:30:00Z");
    expect(etaMinutes("2026-09-17 19:00:00", now)).toBeUndefined();
    expect(etaMinutes("2026-09-18 20:15:00", now)).toBeUndefined();
  });
  it("does not read a local-time ETA as if the worker ran in IST", () => {
    // A worker in UTC must not treat 20:15 IST as 20:15 UTC, which would report 345 minutes.
    expect(etaMinutes("2026-09-17 20:15:00", Date.parse("2026-09-17T14:30:00Z"))).not.toBe(345);
  });
});

describe("route identity from live detail responses", () => {
  it("fills the public route number and terminals from stop records", () => {
    const route = { id: "1066", number: "1066", from: "", to: "" };
    normalizeRouteDetails({ up: { data: [{ stationid: 1, stationname: "Hebbala Bridge", routeno: "500-D", from: "Hebbala Bridge", to: "Central Silk Board", centerlat: 13.03, centerlong: 77.59, vehicleDetails: [{ vehicleid: 7, centerlat: 13.03, centerlong: 77.59 }] }] }, down: { data: [] } }, route);
    expect(route).toEqual({ id: "1066", number: "500-D", from: "Hebbala Bridge", to: "Central Silk Board" });
  });
  it("keeps a route number the caller already knew", () => {
    const route = { id: "1066", number: "500-D", from: "", to: "" };
    normalizeRouteDetails({ up: { data: [{ stationid: 1, stationname: "A", routeno: "WRONG", centerlat: 12.9, centerlong: 77.5 }] }, down: { data: [] } }, route);
    expect(route.number).toBe("500-D");
  });
});
