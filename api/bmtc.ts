// Cloudflare's network cannot reach karnataka.gov.in at all: every request from a Worker times out,
// including BMTC's own public site. Vercel's Mumbai region reaches it in ~200ms, so the Worker relays
// its upstream calls through here. Only the endpoints the app actually uses are accepted, so this
// cannot be repurposed as a general-purpose open proxy.
const UPSTREAM = 'https://bmtcmobileapi.karnataka.gov.in/WebAPI/';
const ALLOWED = new Set(['SearchRoute_v2', 'FindNearByBusStop_v2', 'SearchByRouteDetails_v4', 'getMobileTripsData']);
const USER_AGENT = 'BetterBMTC/1.0 (+https://github.com/MustangBro7/betterbmtc)';

type Res = { status: (code: number) => Res; json: (body: unknown) => void; setHeader: (k: string, v: string) => void };

export default async function handler(req: { method?: string; body?: unknown }, res: Res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}) as { endpoint?: unknown; payload?: unknown };
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
  if (!ALLOWED.has(endpoint)) return res.status(400).json({ error: 'Unsupported endpoint' });
  try {
    const upstream = await fetch(new URL(endpoint, UPSTREAM), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*', lan: 'en', deviceType: 'WEB', authToken: 'N/A', 'User-Agent': USER_AGENT },
      body: JSON.stringify(body.payload ?? {}),
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok) return res.status(upstream.status).json({ error: `BMTC upstream returned ${upstream.status}` });
    res.setHeader('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=60');
    return res.status(200).json(await upstream.json());
  } catch {
    return res.status(504).json({ error: 'BMTC live service is temporarily unavailable' });
  }
}
