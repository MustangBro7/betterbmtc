import { describe, expect, it } from "vitest";
import worker from "../src/index";

async function request(path: string) { return worker.fetch(new Request(`https://api.example${path}`)); }

describe("HTTP validation", () => {
  it("rejects nearby requests missing coordinates", async () => { const response = await request("/api/nearby?lat=12.97"); expect(response.status).toBe(400); });
  it("rejects nearby requests outside configured coordinates and radius", async () => { expect((await request("/api/nearby?lat=0&lon=77.5")).status).toBe(400); expect((await request("/api/nearby?lat=12.97&lon=77.5&radius=99")).status).toBe(400); });
  it("returns HTTP 404 for an unknown static route", async () => expect((await request("/api/routes/static-does-not-exist")).status).toBe(404));
  it("returns HTTP 404 for an unknown nonnumeric stop", async () => expect((await request("/api/stops/not-a-stop/arrivals")).status).toBe(404));
});
