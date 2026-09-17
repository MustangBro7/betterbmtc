import { describe, expect, it } from "vitest";
import { staticPlan, staticProvenance, staticRoute, staticSearch } from "../src/static";

describe("static GTFS fallback", () => {
  it("carries provenance and searches real bundled stops", () => { expect(staticProvenance.license).toBe("ODbL-1.0"); expect(staticSearch("Nagarabhavi").stops.length).toBeGreaterThan(0); });
  it("returns an ordered static route pattern", () => { const route = staticSearch("244-C").routes[0]; expect(route).toBeDefined(); expect(staticRoute(route.id)?.stops.length).toBeGreaterThan(1); });
  it("does not invent a plan for unknown stops", () => expect(staticPlan("not-a-stop", "also-not-a-stop").legs).toEqual([]));
});
