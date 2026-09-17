# BetterBMTC

A Bengaluru bus companion in BMTC blue. React + TypeScript + Vite frontend for Vercel; a Cloudflare Worker handles the transit API, cache, normalization, and static route planning. No sign-in required.

## What works

- Explicit, permission-based geolocation; nearby stop discovery with 500 m–5 km radius.
- Interactive map, stop markers, walking directions, and search-this-area.
- Search stop names, route numbers, destinations, and Majestic/KBS aliases.
- Route stop sequences, stop-serving routes, and live vehicle positions when the upstream supplies them.
- Direct and one-transfer static journey planning, including platform stop IDs and direction order.
- Saved stops/routes stored locally; no account, advertising, or tracking SDK.
- Responsive desktop and mobile navigation, keyboard focus handling, location-denied states, and network recovery.
- Installable PWA with cached app assets. The static transit engine loads on demand and can run on-device after loading. Map tiles require connectivity.
- Explicit static/live/partial-coverage states. No simulated vehicles, fabricated ETAs, schedules, prices, or availability claims.

## Current deployment and data status

Both halves are deployed as of 17 September 2026:

- Frontend: <https://betterbmtc.vercel.app>
- Worker API: <https://betterbmtc-api.abhinavmohan12.workers.dev/api>

The frontend is built with `VITE_API_URL` pointing at that Worker, and the deployed app serves real stop data from it.

BMTC's public mobile API is **not reachable from either network tested**. It returns HTTP 403 from the development network, and from Cloudflare's network it does not respond at all: requests hang until the Worker's 8-second abort in `backend/src/transit.ts`. **Production therefore runs in static mode**, and `/api/health` reports the upstream as unavailable. This is not a deployment defect; the upstream is simply refusing us.

One consequence is user-visible: because the Worker waits out that 8-second timeout before falling back, an uncached first request to `/api/nearby` or `/api/search` takes roughly 8.5 seconds in production. Subsequent requests hit the edge cache and are fast. Lowering the abort in `transit.ts` would trade away live-feed responsiveness if BMTC ever starts answering.

Nearby live discovery samples a bounded set of routes serving nearby stops; it cannot promise every bus in the city.

The source dataset contains **9,001 stop records** and **4,416 directional route patterns**. Its published commit is dated **8 September 2026**, imported **17 September 2026**. These are route patterns, not proof that services are operating today. Planning finds a direct or one-transfer path through those patterns; it does not optimize timetables or predict fares/travel time. Walking labels are approximate straight-line estimates at 70 m/min; walking directions open Google Maps.

## Run locally

Use Node 22.12+ (Node 24 also supported):

```sh
npm run setup
npm run dev:api    # terminal 1, Cloudflare local worker at :8787
npm run dev        # terminal 2, app at :3000
```

Open http://localhost:3000. Vite forwards `/api` to the Worker. When the backend is unavailable, the app falls back to its on-device static engine.

```sh
npm run check      # frontend build, backend typecheck and tests
npm run test:e2e   # real browser workflows; starts servers if not already running
```

Local browser tests use installed Chrome. CI installs Playwright Chromium. `CI=1 npm run test:e2e` selects bundled Chromium instead.

## Deploy to your accounts

Authenticate once on this machine:

```sh
cd backend
npx wrangler login
cd ..
npx vercel login
npm run deploy
```

`npm run deploy` checks the application, deploys the Worker, reads its returned URL, checks health, and builds/deploys the Vercel frontend with `VITE_API_URL=https://<your-worker>.workers.dev/api`. No secrets are embedded in the frontend. The generated `.env.production.local` is gitignored. The user must complete provider authentication; automation cannot do that on their behalf.

Alternatively import this repository into Vercel (framework: Vite; build: `npm run build`; output: `dist`) and set `VITE_API_URL` to the deployed Worker `/api` URL. With no API URL configured, a production build intentionally uses on-device static mode; it must not be described as a live tracker.

Deploy the backend independently with `npm --prefix backend run deploy`. Cloudflare API tokens may be provided through the standard `CLOUDFLARE_API_TOKEN` environment variable. Do not commit credentials. The Worker requires no paid storage bindings. CORS is public because this is a public, read-only transit API.

## Data and attribution

Static source: [Vonter/bmtc-gtfs](https://github.com/Vonter/bmtc-gtfs), derived from Namma BMTC data and provided under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The adapted database retains that license and its provenance. It is distributed as `backend/src/static-data.json` and offered at `/data/bmtc-static.json`; `prebuild` synchronizes the public copy.

The public mobile service is an unofficial integration at `bmtcmobileapi.karnataka.gov.in`. Endpoints and response formats can change. We use only public read operations and do not embed app tokens or bypass access controls. Static IDs are namespaced to avoid confusing them with live parent-route IDs. Upstream requests time out and cached API responses carry explicit data-status metadata.

Maps: © OpenStreetMap contributors, using the standard OSM tile server with visible attribution and browser HTTP caching. No tile prefetch or offline tile downloads. A compatible provider can be configured with `VITE_TILE_URL`; update the attribution if switching providers.

BetterBMTC is independent and unaffiliated with BMTC. The visual design takes cues from the clarity and quick actions of Indian consumer apps without reusing their logos or artwork.

## Project layout

- `src/` — responsive React application, map, journey planner and on-device fallback adapter.
- `backend/src/` — Cloudflare Worker, input validation, BMTC adapters and shared pure static transit engine.
- `backend/test/` — parser, route planning and HTTP validation tests.
- `tests/` — browser tests for discovery, bookmarks, search, journey planning, responsive map and geolocation.
- `scripts/deploy.mjs` — repeatable deployment to authenticated Cloudflare + Vercel accounts.
- `.github/workflows/ci.yml` — type/build/test/browser checks.
