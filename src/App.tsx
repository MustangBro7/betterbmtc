import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownUp, ArrowLeft, ArrowRight, Bookmark, BusFront, Check, ChevronDown, ChevronRight, Clock3, Compass, ExternalLink, Footprints, Heart, LocateFixed, Map, MapPin, Navigation, RefreshCw, Route as RouteIcon, Search, ShieldCheck, Signal, SlidersHorizontal, WifiOff, X } from 'lucide-react';
import type { Arrivals, Nearby, Point, Route, RouteDetail, SavedItem, SearchResult, Stop, Vehicle } from './types';
import { api, distanceLabel, readSaved, walkLabel } from './api';
import BusArt from './components/BusArt';
import JourneyPlanner from './components/JourneyPlanner';
const TransitMap = lazy(() => import('./components/TransitMap'));
const DEFAULT_CENTER: Point = { lat: 12.9774, lon: 77.5708 };
const NO_STOPS: Stop[] = [];
type Tab = 'nearby' | 'plan' | 'routes' | 'saved';
type Selection = { kind: 'stop'; item: Stop } | { kind: 'route'; item: Route };
const TABS = [{ id: 'nearby', label: 'Nearby', icon: Compass }, { id: 'plan', label: 'Plan a trip', icon: RouteIcon }, { id: 'routes', label: 'Routes', icon: BusFront }, { id: 'saved', label: 'Saved', icon: Bookmark }] as const;

export default function App() {
  const [tab, setTab] = useState<Tab>('nearby');
  const [center, setCenter] = useState<Point>(DEFAULT_CENTER);
  const [locationLabel, setLocationLabel] = useState('Majestic, Bengaluru');
  const [locationIsUser, setLocationIsUser] = useState(false);
  const [locating, setLocating] = useState(false);
  const [radius, setRadius] = useState(1);
  const [nearby, setNearby] = useState<Nearby | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [saved, setSaved] = useState<SavedItem[]>(readSaved);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [detail, setDetail] = useState<RouteDetail | null>(null);
  const [arrivals, setArrivals] = useState<Arrivals | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [listMode, setListMode] = useState<'stops' | 'buses'>('stops');
  const [mapVisible, setMapVisible] = useState(false);
  const [mapMoved, setMapMoved] = useState<Point | null>(null);
  const [toast, setToast] = useState('');
  const [about, setAbout] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const notify = useCallback((message: string) => setToast(message), []);

  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 5000); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const install = (e: Event) => { e.preventDefault(); setInstallPrompt(e as Event & { prompt: () => Promise<void> }); };
    window.addEventListener('online', update); window.addEventListener('offline', update); window.addEventListener('beforeinstallprompt', install);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); window.removeEventListener('beforeinstallprompt', install); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setNearby(null);
    void api.nearby(center, radius, controller.signal).then(setNearby).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [center, radius, refresh]);
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine && !selection) setRefresh(x => x + 1); }, 60000);
    return () => clearInterval(timer);
  }, [selection]);
  useEffect(() => {
    if (query.trim().length < 2) { setResults(null); setSearching(false); setSearchError(''); return; }
    const controller = new AbortController(); setSearching(true); setSearchError(''); setResults(null);
    const timer = setTimeout(() => { void api.search(query.trim(), controller.signal).then(setResults).catch(e => { if (!controller.signal.aborted) setSearchError(e.message); }).finally(() => { if (!controller.signal.aborted) setSearching(false); }); }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  useEffect(() => {
    if (!selection) return;
    const controller = new AbortController(); setDetail(null); setArrivals(null); setDetailError(''); setDetailLoading(true);
    const load = async () => {
      try { if (selection.kind === 'route') setDetail(await api.route(selection.item.id, controller.signal)); else setArrivals(await api.arrivals(selection.item.id, controller.signal)); }
      catch (e) { if (!controller.signal.aborted) setDetailError(e instanceof Error ? e.message : 'Could not load transit information.'); }
      finally { if (!controller.signal.aborted) setDetailLoading(false); }
    };
    void load(); const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [selection]);
  useEffect(() => {
    if (!selection && !about) return;
    const previous = document.activeElement as HTMLElement | null;
    const el = document.querySelector<HTMLElement>('[role="dialog"]'); el?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSelection(null); setAbout(false); }
      if (event.key === 'Tab' && el) {
        const nodes = el.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, [tabindex="0"]');
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === el)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', handler); return () => { document.removeEventListener('keydown', handler); previous?.focus(); };
  }, [selection, about]);

  function locate() {
    if (!navigator.geolocation) { notify('Location is not supported here. Search for a stop or move the map.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(p => {
      setLocating(false);
      if (p.coords.latitude < 12.5 || p.coords.latitude > 13.5 || p.coords.longitude < 77 || p.coords.longitude > 78.2) { notify('BetterBMTC covers Bengaluru. Search a stop or explore the map to plan ahead.'); return; }
      setCenter({ lat: p.coords.latitude, lon: p.coords.longitude }); setLocationLabel('Your current location'); setLocationIsUser(true); setMapMoved(null); setTab('nearby');
    }, () => { setLocating(false); notify('Location unavailable. Enable location in your browser, or search for your stop.'); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  }
  function toggleSaved(item: SavedItem) {
    const exists = saved.some(s => s.kind === item.kind && s.item.id === item.item.id);
    const next = exists ? saved.filter(s => !(s.kind === item.kind && s.item.id === item.item.id)) : [...saved, item];
    try { localStorage.setItem('betterbmtc:saved', JSON.stringify(next)); setSaved(next); notify(exists ? 'Removed from saved.' : 'Saved. Your next commute is one tap closer.'); }
    catch { notify('Your browser could not save this. Check your storage settings.'); }
  }
  const isSaved = (kind: string, id: string) => saved.some(s => s.kind === kind && s.item.id === id);
  function openStop(stop: Stop) { setSelection({ kind: 'stop', item: stop }); setCenter({ lat: stop.lat, lon: stop.lon }); setLocationLabel(stop.name); setLocationIsUser(false); }
  function openRoute(route: Route) { setSelection({ kind: 'route', item: route }); }
  function openVehicle(vehicle: Vehicle) { if (vehicle.routeId) openRoute({ id: vehicle.routeId, number: vehicle.routeNumber, from: '', to: vehicle.destination || '' }); else notify(`${vehicle.routeNumber} · ${vehicle.destination || 'BMTC bus'} · GPS position from transit feed`); }
  function changeTab(next: Tab) { setTab(next); setQuery(''); setMapVisible(false); setSelection(null); }
  function focusSearch() { setTab('routes'); setTimeout(() => searchRef.current?.focus(), 50); }
  const stops = nearby?.stops || NO_STOPS;
  const vehicles = detail?.vehicles || nearby?.vehicles || [];
  const filteredStops = stops;
  const currentVehicles = detail?.vehicles || arrivals?.vehicles || [];

  function StopCard({ stop }: { stop: Stop }) {
    return <article className="stop-card"><button className="stop-main" onClick={() => openStop(stop)}><span className="stop-symbol"><BusFront size={21}/></span><span className="stop-copy"><strong>{stop.name}</strong><span><Footprints size={13}/>{walkLabel(stop.distanceM) || 'View stop & arrivals'}{stop.distanceM !== undefined && <><i/> {distanceLabel(stop.distanceM)}</>}</span></span><ChevronRight size={18}/></button><button className={`save-stop ${isSaved('stop', stop.id) ? 'is-saved' : ''}`} aria-label={`${isSaved('stop', stop.id) ? 'Unsave' : 'Save'} ${stop.name}`} onClick={() => toggleSaved({ kind: 'stop', item: stop })}><Bookmark size={17} fill={isSaved('stop', stop.id) ? 'currentColor' : 'none'}/></button></article>;
  }
  function RouteCard({ route }: { route: Route }) { return <button className="route-card" onClick={() => openRoute(route)}><span className="route-number">{route.number}</span><span className="stop-copy"><strong>{route.to || 'View route & live buses'}</strong><span>{route.from ? `From ${route.from}` : 'BMTC route'}{route.type ? ` · ${route.type}` : ''}</span></span><ChevronRight size={18}/></button>; }
  function VehicleCard({ vehicle }: { vehicle: Vehicle }) { return <button className="vehicle-card" onClick={() => openVehicle(vehicle)}><span className="route-number">{vehicle.routeNumber || 'BMTC'}</span><span className="stop-copy"><strong>{vehicle.destination || 'Bus on route'}</strong><span><span className="status-dot"/> {vehicle.updatedAt ? `GPS · ${new Date(vehicle.updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'GPS position available'}</span></span><span className="eta">{vehicle.etaMinutes != null ? <><strong>{vehicle.etaMinutes}</strong><small>min · feed ETA</small></> : <Navigation size={20}/>}</span></button>; }

  return <div className="app-shell">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <header className="site-header"><a className="brand" href="/" aria-label="BetterBMTC home"><span className="brand-icon"><BusFront size={24}/></span><span>better<span className="brand-blue">bmtc</span><small>A LITTLE LESS WAIT. A LOT MORE BENGALURU.</small></span></a><nav className="desktop-nav" aria-label="Main navigation">{TABS.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => changeTab(id)}><Icon size={18}/>{label}{id === 'saved' && saved.length > 0 && <span className="count">{saved.length}</span>}</button>)}</nav><button className="city-badge" onClick={() => setAbout(true)}><span className="city-dot"/> Bengaluru <ChevronDown size={15}/></button></header>
    {!online && <div className="offline-bar" role="status"><WifiOff size={16}/> You're offline. Saved stops and routes are still here; live information needs a connection.</div>}
    <main id="main-content" className="workspace">
      <section className={`explore-panel ${mapVisible ? 'mobile-hidden' : ''}`}>
        <div className="location-row"><span className="location-pin"><MapPin size={18}/></span><button onClick={focusSearch}><span>{locationIsUser ? 'YOU ARE HERE' : 'EXPLORING'}</span><strong>{locationLabel} <ChevronDown size={14}/></strong></button><button className={`icon-button locate-top ${locating ? 'spin' : ''}`} onClick={locate} disabled={locating} aria-label="Use my current location"><LocateFixed size={21}/></button></div>
        {tab === 'nearby' && <>
          <div className="welcome"><div className="welcome-copy"><div className="eyebrow"><span/> NAMMA OORU. NAMMA BUS.</div><h1>Your city.<br/>One bus away<span>.</span></h1><p>Less guessing. More going.</p></div><BusArt/></div>
          <button className="destination-search" onClick={focusSearch}><Search size={21}/><span>Where do you want to go?</span><span className="search-arrow"><ArrowRight size={18}/></span></button>
          <div className="quick-actions"><button onClick={locate} disabled={locating}><LocateFixed size={17}/>{locating ? 'Locating…' : 'Near me'}</button><button onClick={() => changeTab('plan')}><ArrowDownUp size={17}/>Plan a trip</button><button onClick={() => { changeTab('routes'); setQuery('KIA'); }}><span aria-hidden="true">✈</span>Airport</button></div>
          {!locationIsUser && <button className="location-nudge" onClick={locate} disabled={locating}><span><LocateFixed size={19}/></span><div><strong>Start where you are</strong><p>Find stops and buses around your location</p></div><ArrowRight size={17}/></button>}
          <div className="section-title"><div><h2>Around you <span className="tiny-count">{loading ? '…' : stops.length}</span></h2><p>Good journeys start with the right stop.</p></div><button className="icon-button" onClick={() => setRefresh(x => x + 1)} disabled={loading} aria-label="Refresh nearby buses"><RefreshCw size={17} className={loading ? 'spin' : ''}/></button></div>
          <div className="list-controls"><div className="segmented" aria-label="Nearby view"><button className={listMode === 'stops' ? 'selected' : ''} onClick={() => setListMode('stops')}><MapPin size={14}/>Stops</button><button className={listMode === 'buses' ? 'selected' : ''} onClick={() => setListMode('buses')}><BusFront size={14}/>Buses {nearby?.vehicles?.length ? <span>{nearby.vehicles.length}</span> : null}</button></div><label className="radius-select"><SlidersHorizontal size={14}/><select id="search-radius" aria-label="Search radius" value={radius} onChange={e => setRadius(Number(e.target.value))}><option value={0.5}>500 m</option><option value={1}>1 km</option><option value={2}>2 km</option><option value={5}>5 km</option></select></label></div>
          {nearby?.status === 'static' && <StaticNote/>}{nearby?.status === 'live' && <div className="feed-note live"><Signal size={15}/><span>{nearby.message || 'Partial live coverage. Only buses reported by the transit feed appear.'}</span></div>}<div className="nearby-list" aria-live="polite">
            {loading ? <LoadingCards/> : error ? <ErrorState message={error} retry={() => setRefresh(x => x + 1)}/> : listMode === 'stops' ? filteredStops.length > 0 ? filteredStops.map(stop => <StopCard key={stop.id} stop={stop}/>) : <EmptyState icon="stop" title="No stops in this area" description="Try a wider radius, move the map, or search for a stop." action={<button className="text-button" onClick={focusSearch}>Search for a stop <ArrowRight size={16}/></button>}/> : nearby?.vehicles?.length ? nearby.vehicles.map(v => <VehicleCard key={v.id} vehicle={v}/>) : <EmptyState icon="bus" title="No live buses to show" description={nearby?.message || 'The feed has no current bus positions for this area. Try a route search for more information.'} action={<button className="text-button" onClick={focusSearch}>Search a route <ArrowRight size={16}/></button>}/>}
          </div>
          {nearby && <div className={`feed-note ${nearby.status === 'live' ? 'live' : ''}`}><Signal size={15}/><span>{nearby.status === 'live' ? 'Live positions from the transit feed. Coverage may vary.' : nearby.status === 'static' ? 'Static stop data · routes may have changed. Live GPS unavailable.' : 'Live data is currently unavailable. Try a route or refresh.'}</span></div>}
          <div className="little-note"><span className="note-icon"><Heart size={18}/></span><div><strong>A better everyday, together.</strong><p>Made for the people who move Bengaluru.</p></div></div>
        </>}
        {tab === 'routes' && <>
          <div className="page-heading"><div className="eyebrow">FIND YOUR WAY</div><h1>Every route.<br/>More possibilities.</h1><p>Search a bus number, stop, or destination.</p></div>
          <div className="search-field"><Search size={20}/><input id="route-search" ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Try 500D, Majestic, or Silk Board" aria-label="Search routes and stops"/>{query && <button className="icon-button" onClick={() => setQuery('')} aria-label="Clear search"><X size={17}/></button>}</div>
          {query.length < 2 && <><div className="section-title compact"><h2>Where to?</h2></div><div className="suggestions">{['Majestic', 'Silk Board', 'Whitefield', '500D', 'KIA', 'Indiranagar'].map(q => <button key={q} onClick={() => setQuery(q)}>{q}<ArrowRight size={14}/></button>)}</div><div className="search-tip"><RouteIcon size={29}/><h3>A familiar route. An easier ride.</h3><p>Find the stops along your route, check available bus positions, and save it for next time.</p></div></>}
          <div aria-live="polite">{searching && <LoadingCards/>}{searchError && <ErrorState message={searchError} retry={() => { const q = query; setQuery(''); setTimeout(() => setQuery(q), 0); }}/>} {results && <>{results.status === 'static' && <StaticNote/>}<p className="result-summary">{results.routes.length + results.stops.length} results for “{query}”</p>{results.routes.length > 0 && <><h3 className="result-heading">Bus routes</h3>{results.routes.map(route => <RouteCard key={route.id} route={route}/>)}</>}{results.stops.length > 0 && <><h3 className="result-heading">Bus stops</h3>{results.stops.map(stop => <StopCard key={stop.id} stop={stop}/>)}</>}{results.stops.length + results.routes.length === 0 && <EmptyState title="Couldn't find that one" description="Try a route number or a different spelling of the stop."/>}</>}</div>
        </>}
        {tab === 'plan' && <><div className="page-heading"><div className="eyebrow">LET'S GET YOU THERE</div><h1>Big plans.<br/>Simple journeys.</h1><p>Find your way across Bengaluru, stop to stop.</p></div><JourneyPlanner onStop={openStop} onRoute={openRoute}/></>}
        {tab === 'saved' && <><div className="page-heading"><div className="eyebrow">YOUR EVERYDAY, SORTED</div><h1>Same city.<br/>Your shortcuts.</h1><p>Your favorite stops and routes, all in one place.</p></div>{saved.length ? <><p className="result-summary">{saved.length} saved {saved.length === 1 ? 'place or route' : 'places and routes'} · stored on this device</p>{saved.map(s => <div className="saved-row" key={`${s.kind}-${s.item.id}`}>{s.kind === 'stop' ? <StopCard stop={s.item}/> : <><RouteCard route={s.item}/><button className="icon-button is-saved" onClick={() => toggleSaved(s)} aria-label={`Unsave route ${s.item.number}`}><Bookmark size={18} fill="currentColor"/></button></>}</div>)}</> : <EmptyState icon="saved" title="Your daily commute, a tap away" description="Tap the bookmark on any stop or route. We'll keep it here for your next ride." action={<button className="primary-button" onClick={focusSearch}>Find your first route <ArrowRight size={17}/></button>}/>}<div className="privacy-note"><ShieldCheck size={19}/><p>No account needed. Your saved places stay in this browser.</p></div></>}
        <footer className="panel-footer"><span>Built for Bengaluru <Heart size={11}/></span><button onClick={() => setAbout(true)}>About & data <ExternalLink size={11}/></button></footer>
      </section>
      <section className={`map-panel ${mapVisible ? 'mobile-visible' : ''}`} aria-label="Nearby bus map">
        <Suspense fallback={<div className="map-loading"><Map size={36}/><span>Finding our way around Bengaluru…</span></div>}><TransitMap center={center} stops={detail?.stops || stops} vehicles={vehicles} routeStops={detail?.stops || NO_STOPS} onStop={openStop} onVehicle={openVehicle} onMove={setMapMoved} radius={radius}/></Suspense>
        <div className="map-top-card"><span className="map-card-icon"><MapPin size={19}/></span><div><strong>{selection?.kind === 'route' ? `Route ${selection.item.number}` : locationLabel}</strong><span>{detail ? 'Stop sequence · dotted line is schematic' : `${radius < 1 ? '500 m' : radius + ' km'} around your search location`}</span></div><span className="map-tag">EXPLORE</span></div>
        {mapMoved && <button className="search-area" onClick={() => { setCenter(mapMoved); setMapMoved(null); setLocationLabel('Selected map area'); setLocationIsUser(false); setSelection(null); }}><RefreshCw size={15}/>Search this area</button>}
        <button className="map-locate" onClick={locate} disabled={locating} aria-label="Center on my location"><LocateFixed size={21}/></button>
        <div className="map-legend"><span><i className="legend-you"/>Search location</span><span><i className="legend-stop"/>Bus stop</span>{vehicles.length > 0 && <span><i className="legend-bus"/>Bus position</span>}</div>
        <div className="map-bottom-card"><div className="map-bottom-icon"><BusFront size={23}/></div><div><strong>A little closer to your next bus.</strong><span>Tap a stop to see available arrivals and routes.</span></div><span className="map-card-chevron"><ChevronRight size={20}/></span></div>
      </section>
    </main>
    <button className="mobile-map-toggle" onClick={() => setMapVisible(v => !v)}>{mapVisible ? <><BusFront size={17}/> Show list</> : <><Map size={17}/> Show map</>}</button>
    <nav className="mobile-nav" aria-label="Mobile navigation">{TABS.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => changeTab(id)}><Icon size={21}/><span>{label}</span></button>)}</nav>
    {selection && <div className="modal-backdrop" onClick={() => setSelection(null)}><section className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="detail-title" tabIndex={-1} ref={drawerRef} onClick={e => e.stopPropagation()}><div className="drawer-toolbar"><button className="icon-button" onClick={() => setSelection(null)} aria-label="Close details"><ArrowLeft size={21}/></button><span>{selection.kind === 'stop' ? 'BUS STOP' : 'BUS ROUTE'}</span><button className={`icon-button ${isSaved(selection.kind, selection.item.id) ? 'is-saved' : ''}`} onClick={() => toggleSaved(selection)} aria-label={isSaved(selection.kind, selection.item.id) ? 'Unsave' : 'Save'}><Bookmark size={21} fill={isSaved(selection.kind, selection.item.id) ? 'currentColor' : 'none'}/></button></div><div className="drawer-heading"><span className="detail-icon"><BusFront size={29}/></span><h2 id="detail-title">{selection.kind === 'stop' ? selection.item.name : `Route ${selection.item.number}`}</h2><p>{selection.kind === 'stop' ? 'Available arrivals at this stop' : detail?.route ? `${detail.route.from || 'Origin'} → ${detail.route.to || 'Destination'}` : 'Stops and buses along the route'}</p></div>{selection.kind === 'stop' && <a className="walking-link" href={`https://www.google.com/maps/dir/?api=1&destination=${selection.item.lat},${selection.item.lon}&travelmode=walking`} target="_blank" rel="noreferrer"><Footprints size={18}/> Walking directions <ExternalLink size={15}/></a>}<div className="drawer-body">{detailLoading ? <LoadingCards/> : detailError ? <ErrorState message={detailError} retry={() => setSelection({ ...selection })}/> : <>{(detail?.status === 'static' || arrivals?.status === 'static') && <StaticNote/>}<div className="section-title compact"><h3>Available buses</h3><span className="pill">{currentVehicles.length} found</span></div>{currentVehicles.length ? currentVehicles.map(v => <VehicleCard key={v.id} vehicle={v}/>) : <div className="inline-empty"><Clock3 size={22}/><div><strong>No current arrivals available</strong><p>The transit feed hasn't supplied live buses here. This doesn't mean buses aren't running.</p></div></div>}{arrivals?.routes && arrivals.routes.length > 0 && <><div className="section-title"><h3>Routes serving this stop</h3></div>{arrivals.routes.map(route => <RouteCard key={route.id} route={route}/>)}</>}{detail?.stops && detail.stops.length > 0 && <><div className="section-title"><h3>Along the way</h3><span className="muted">{detail.stops.length} stops</span></div><ol className="stop-timeline">{detail.stops.map((stop, i) => <li key={`${stop.id}-${i}`}><span className="timeline-point"/><button onClick={() => openStop(stop)}><strong>{stop.name}</strong><ChevronRight size={16}/></button></li>)}</ol></>}</>}<p className="detail-disclaimer">GPS coverage and arrival estimates depend on the transit feed. Confirm the destination on the bus before boarding.</p></div></section></div>}
    {about && <div className="modal-backdrop" onClick={() => setAbout(false)}><section className="about-modal" role="dialog" aria-modal="true" aria-labelledby="about-title" tabIndex={-1} onClick={e => e.stopPropagation()}><button className="icon-button modal-close" onClick={() => setAbout(false)} aria-label="Close about"><X size={22}/></button><span className="brand-icon"><BusFront size={28}/></span><h2 id="about-title">Namma city. A better commute.</h2><p>BetterBMTC is an independent bus companion for Bengaluru. It is not affiliated with BMTC.</p><h3>Honest information, always.</h3><p>Live information comes from the public BMTC mobile service when available. During outages, stops and routes use the Vonter/bmtc-gtfs database, derived from Namma BMTC and licensed under ODbL 1.0. The bundled feed was published 8 September 2026 and imported 17 September 2026. Static routes can be outdated; they do not confirm a bus is operating. Walking times are approximate, based on straight-line distance. We never generate pretend buses or arrival times.</p><p className="data-links"><a href="https://github.com/Vonter/bmtc-gtfs" target="_blank" rel="noreferrer">Dataset & provenance ↗</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL 1.0 ↗</a> · <a href="/data/bmtc-static.json" download>Download derived data</a></p><h3>A little privacy goes a long way.</h3><p>Location is requested only when you tap “Near me”. It is used to find nearby transit. Favorites stay on this device. No account or advertising trackers.</p><h3>Keep us one tap away.</h3><p>Add BetterBMTC to your home screen from your browser menu for an app-like experience.</p>{installPrompt && <button className="primary-button" onClick={async () => { await installPrompt.prompt(); setInstallPrompt(null); }}>Add to home screen <ArrowRight size={17}/></button>}<div className="about-links"><a href="https://mybmtc.karnataka.gov.in/" target="_blank" rel="noreferrer">Official BMTC <ExternalLink size={14}/></a><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Map credits <ExternalLink size={14}/></a></div><p className="muted">Made with care for Bengaluru. ನೀವೂ ಬನ್ನಿ.</p></section></div>}
    {toast && <div className="toast" role="status"><Check size={18}/><span>{toast}</span><button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={16}/></button></div>}
  </div>;
}
function LoadingCards() { return <div className="skeletons" role="status" aria-label="Loading transit information">{[1, 2, 3].map(i => <div className="skeleton-card" key={i}><i/><div><i/><i/></div></div>)}</div>; }
function EmptyState({ title, description, icon = 'bus', action }: { title: string; description: string; icon?: string; action?: React.ReactNode }) { return <div className="empty-state"><span className="empty-icon">{icon === 'saved' ? <Bookmark size={29}/> : icon === 'stop' ? <MapPin size={29}/> : <BusFront size={29}/>}</span><h3>{title}</h3><p>{description}</p>{action}</div>; }
function ErrorState({ message, retry }: { message: string; retry: () => void }) { return <div className="error-state" role="status"><WifiOff size={24}/><h3>A small stop along the way.</h3><p>{message}</p><button className="text-button" onClick={retry}><RefreshCw size={15}/>Try again</button></div>; }

function StaticNote() { return <div className="static-note"><Clock3 size={15}/><span>Static route data. Services may have changed; live arrivals are unavailable.</span></div>; }
