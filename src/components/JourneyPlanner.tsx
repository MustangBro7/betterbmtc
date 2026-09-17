import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRightLeft,
  Bus,
  ChevronRight,
  Clock3,
  Footprints,
  IndianRupee,
  LoaderCircle,
  MapPin,
  Search,
  X,
} from 'lucide-react';
import { api, request, distanceLabel } from '../api';
import type { Route, SearchResult, Stop } from '../types';
import './planner.css';

export interface JourneyPlannerProps {
  onStop?: (stop: Stop) => void;
  onRoute?: (route: Route) => void;
}

type SearchField = 'from' | 'to';
type JourneyLeg = {
  mode?: string;
  type?: string;
  name?: string;
  route?: Route | { id?: string; number?: string; from?: string; to?: string; type?: string };
  routeNumber?: string;
  from?: string | Stop;
  to?: string | Stop;
  durationMinutes?: number;
  duration?: number;
  distanceM?: number;
  distance?: number;
  instructions?: string;
};
type JourneyPlan = {
  legs?: JourneyLeg[];
  segments?: JourneyLeg[];
  routes?: JourneyLeg[];
  totalDurationMinutes?: number;
  durationMinutes?: number;
  totalFare?: number | string;
  fare?: number | string;
  transfers?: number;
  source?: string;
  provenance?: string;
  [key: string]: unknown;
};

function asText(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && 'name' in value && typeof value.name === 'string') return value.name;
  return undefined;
}

function normalizePlan(value: unknown): JourneyPlan {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Record<string, unknown>;
  const legs = raw.legs ?? raw.segments ?? raw.routes;
  return {
    ...raw,
    legs: Array.isArray(legs) ? legs as JourneyLeg[] : undefined,
    totalDurationMinutes: typeof raw.totalDurationMinutes === 'number' ? raw.totalDurationMinutes :
      (typeof raw.durationMinutes === 'number' ? raw.durationMinutes : undefined),
    totalFare: typeof raw.totalFare === 'string' || typeof raw.totalFare === 'number' ? raw.totalFare :
      (typeof raw.fare === 'string' || typeof raw.fare === 'number' ? raw.fare : undefined),
  };
}

function legLabel(leg: JourneyLeg) {
  const mode = String(leg.mode ?? leg.type ?? '').toLowerCase();
  if (mode.includes('walk')) return 'Walk';
  if (mode.includes('bus') || leg.route || leg.routeNumber) return 'Bus';
  return leg.name ?? leg.mode ?? leg.type ?? 'Journey leg';
}

export default function JourneyPlanner({ onStop, onRoute }: JourneyPlannerProps) {
  const [from, setFrom] = useState<Stop | null>(null);
  const [to, setTo] = useState<Stop | null>(null);
  const [query, setQuery] = useState<Record<SearchField, string>>({ from: '', to: '' });
  const [results, setResults] = useState<Record<SearchField, Stop[]>>({ from: [], to: [] });
  const [active, setActive] = useState<SearchField | null>(null);
  const [searching, setSearching] = useState<SearchField | null>(null);
  const [searchErrors, setSearchErrors] = useState<Record<SearchField, string | null>>({ from: null, to: null });
  const [plan, setPlan] = useState<JourneyPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchControllers = useRef<Record<SearchField, AbortController | null>>({ from: null, to: null });
  const planController = useRef<AbortController | null>(null);

  useEffect(() => () => {
    searchControllers.current.from?.abort(); searchControllers.current.to?.abort(); planController.current?.abort();
  }, []);

  useEffect(() => {
    if (!active) return;
    const term = query[active].trim();
    if (term.length < 2) { setResults((old) => ({ ...old, [active]: [] })); setSearchErrors((old) => ({ ...old, [active]: null })); setSearching(null); return; }
    searchControllers.current[active]?.abort();
    const controller = new AbortController();
    searchControllers.current[active] = controller;
    const field = active;
    setSearching(field);
    setSearchErrors((old) => ({ ...old, [field]: null }));
    const timer = window.setTimeout(() => {
      void api.search(term, controller.signal).then((data: SearchResult) => {
        setResults((old) => ({ ...old, [field]: data.stops ?? [] }));
      }).catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== 'AbortError') {
          setResults((old) => ({ ...old, [field]: [] }));
          setSearchErrors((old) => ({ ...old, [field]: reason instanceof Error ? reason.message : 'Stop search failed. Try again.' }));
        }
      }).finally(() => { if (!controller.signal.aborted) setSearching(null); });
    }, 280);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [active, query]);

  const choose = (field: SearchField, stop: Stop) => {
    const other = field === 'from' ? to : from;
    if (other?.id === stop.id) { setError('Choose two different stops for your journey.'); return; }
    searchControllers.current[field]?.abort();
    setSearching(null);
    if (field === 'from') setFrom(stop); else setTo(stop);
    setQuery((old) => ({ ...old, [field]: stop.name }));
    setResults((old) => ({ ...old, [field]: [] }));
    setActive(null);
    planController.current?.abort(); setPlanning(false); setPlan(null); setError(null);
  };

  const swap = () => {
    setFrom(to); setTo(from);
    setQuery({ from: to?.name ?? '', to: from?.name ?? '' });
    planController.current?.abort(); setPlanning(false); setPlan(null); setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!from || !to) { setError('Choose both stops to plan your journey.'); return; }
    planController.current?.abort();
    const controller = new AbortController(); planController.current = controller;
    setPlanning(true); setError(null); setPlan(null);
    try { setPlan(normalizePlan(await request<unknown>(`/plan?from=${encodeURIComponent(from.id)}&to=${encodeURIComponent(to.id)}`, controller.signal))); }
    catch (reason) { if ((reason as { name?: string })?.name !== 'AbortError') setError(reason instanceof Error ? reason.message : 'We could not plan that journey.'); }
    finally { if (!controller.signal.aborted) setPlanning(false); }
  };

  const renderField = (field: SearchField, label: string, value: Stop | null) => (
    <div className="planner-field">
      <label className="field-label" htmlFor={`journey-${field}`}>{label}</label>
      <div className="search-field">
        <MapPin size={17} aria-hidden="true" />
        <input id={`journey-${field}`} role="combobox" value={query[field]} placeholder={field === 'from' ? 'Where are you now?' : 'Where are you going?'} autoComplete="off"
          onFocus={() => setActive(field)} onKeyDown={(event) => { if (event.key === 'Escape') setActive(null); if (event.key === 'ArrowDown' && results[field][0]) { event.preventDefault(); (event.currentTarget.parentElement?.querySelector('.result-option') as HTMLButtonElement | null)?.focus(); } }} onChange={(event) => { searchControllers.current[field]?.abort(); setQuery((old) => ({ ...old, [field]: event.target.value })); if (value) field === 'from' ? setFrom(null) : setTo(null); planController.current?.abort(); setPlanning(false); setPlan(null); setError(null); }}
          aria-autocomplete="list" aria-controls={`journey-${field}-options`} aria-expanded={active === field && (results[field].length > 0 || searching === field)} />
        {query[field] && <button type="button" className="text-button" aria-label={`Clear ${label.toLowerCase()}`} onClick={() => { searchControllers.current[field]?.abort(); planController.current?.abort(); setPlanning(false); setQuery((old) => ({ ...old, [field]: '' })); field === 'from' ? setFrom(null) : setTo(null); setResults((old) => ({ ...old, [field]: [] })); setSearchErrors((old) => ({ ...old, [field]: null })); setPlan(null); setError(null); }}><X size={16} /></button>}
        {value && <button type="button" className="text-button stop-view" onClick={() => onStop?.(value)}>View stop</button>}
        {active === field && (results[field].length > 0 || searching === field || searchErrors[field] || (query[field].trim().length >= 2 && !searching)) && <div id={`journey-${field}-options`} className="stop-options" role="listbox">
          {searching === field && <div className="muted">Searching stops…</div>}
          {searchErrors[field] && <div className="muted" role="alert">{searchErrors[field]}</div>}
          {!searching && !searchErrors[field] && query[field].trim().length >= 2 && results[field].length === 0 && <div className="muted">No stops found.</div>}
          {results[field].map((stop) => <button type="button" role="option" className="result-option" key={stop.id} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(field, stop)}><span><strong>{stop.name}</strong>{stop.distanceM !== undefined && <small>{distanceLabel(stop.distanceM)}</small>}</span><ChevronRight size={16} /></button>)}
        </div>}
      </div>
    </div>
  );

  return <section className="planner" aria-labelledby="planner-title">
    <p className="eyebrow">Plan your ride</p><h2 id="planner-title">Find your way across Bengaluru</h2>
    <form onSubmit={submit} className="planner-form">
      {renderField('from', 'From', from)}<button type="button" className="swap-button" onClick={swap} aria-label="Swap origin and destination"><ArrowRightLeft size={18} /></button>{renderField('to', 'To', to)}
      <button className="primary-button" type="submit" disabled={planning}>{planning ? <LoaderCircle className="spin" size={18} /> : <Search size={18} />} {planning ? 'Planning…' : 'Plan journey'}</button>
    </form>
    {error && <p className="empty-state" role="alert">{error}</p>}
    {plan && (!plan.legs || plan.legs.length === 0) && !error && <p className="empty-state">No journey found between these stops. Try nearby stops or another route.</p>}
    {plan?.legs && plan.legs.length > 0 && <div className="journey-card" aria-live="polite">
      <div className="journey-summary"><div><p className="eyebrow">Suggested journey</p><strong>{plan.totalDurationMinutes !== undefined ? `${plan.totalDurationMinutes} min` : 'Journey details'}</strong>{plan.transfers !== undefined && <span className="muted"> · {plan.transfers} transfer{plan.transfers === 1 ? '' : 's'}</span>} {(plan.source ?? plan.provenance) && <small className="muted planner-provenance"> · {plan.source ?? plan.provenance}</small>}</div>{plan.totalFare !== undefined && <span className="pill"><IndianRupee size={14} /> {plan.totalFare}</span>}</div>
      {plan.legs.map((leg, index) => { const route = leg.route && typeof leg.route === 'object' ? leg.route as Route : undefined; const walk = legLabel(leg) === 'Walk'; return <div className="journey-leg" key={`${index}-${leg.routeNumber ?? leg.name ?? leg.mode}`}><span className="leg-icon">{walk ? <Footprints size={17} /> : <Bus size={17} />}</span><div><strong>{legLabel(leg)}{route ? <button type="button" className="text-button" onClick={() => onRoute?.(route)}>{leg.routeNumber ?? route.number}</button> : leg.routeNumber ? ` ${leg.routeNumber}` : ''}</strong><p>{asText(leg.from) ?? 'Origin'} <ChevronRight size={13} /> {asText(leg.to) ?? 'Destination'}</p>{leg.instructions && <small className="muted">{leg.instructions}</small>}</div>{(leg.durationMinutes ?? leg.duration) !== undefined && <span className="muted duration"><Clock3 size={14} /> {leg.durationMinutes ?? leg.duration} min</span>}</div>; })}
    </div>}
  </section>;
}
