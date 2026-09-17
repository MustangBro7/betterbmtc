import { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Circle, Marker, Polyline, Tooltip, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Point, Stop, Vehicle } from '../types';
const stopIcon = L.divIcon({ className: 'stop-marker', html: '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 11h14M8 7h8M8 19v2m8-2v2"/><circle cx="8.5" cy="15.5" r=".7"/><circle cx="15.5" cy="15.5" r=".7"/></svg></span>', iconSize: [32, 32], iconAnchor: [16, 16] });
const busIcon = (number: string) => L.divIcon({ className: 'bus-marker', html: `<span>● ${number.replace(/[<>&"']/g, '')}</span>`, iconSize: [68, 30], iconAnchor: [34, 15] });
function Controller({ center, routeStops, onMove }: { center: Point; routeStops: Stop[]; onMove: (point: Point) => void }) {
  const map = useMap();
  useEffect(() => { map.setView([center.lat, center.lon], 15, { animate: false }); }, [center.lat, center.lon, map]);
  useEffect(() => { if (routeStops.length > 1 && map.getSize().x > 0 && map.getSize().y > 0) map.fitBounds(routeStops.map(s => [s.lat, s.lon] as [number, number]), { padding: [55, 55], maxZoom: 15 }); }, [routeStops, map]);
  useEffect(() => { const observer = new ResizeObserver(() => { map.invalidateSize(); if (routeStops.length > 1 && map.getSize().x > 0 && map.getSize().y > 0) map.fitBounds(routeStops.map(s => [s.lat, s.lon] as [number, number]), { padding: [55, 55], maxZoom: 15, animate: false }); }); observer.observe(map.getContainer()); return () => observer.disconnect(); }, [map, routeStops]);
  useMapEvents({ dragend: () => { const p = map.getCenter(); onMove({ lat: p.lat, lon: p.lng }); } });
  return null;
}
export default function TransitMap({ center, stops, vehicles, routeStops, onStop, onVehicle, onMove, radius }: { center: Point; stops: Stop[]; vehicles: Vehicle[]; routeStops: Stop[]; onStop: (stop: Stop) => void; onVehicle: (vehicle: Vehicle) => void; onMove: (point: Point) => void; radius: number }) {
  return <MapContainer center={[center.lat, center.lon]} zoom={15} zoomControl={false} className="map-canvas">
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url={import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'}/>
    <ZoomControl position="bottomright"/>
    <Controller center={center} routeStops={routeStops} onMove={onMove}/>
    <Circle center={[center.lat, center.lon]} radius={radius * 1000} pathOptions={{ color: '#1766df', weight: 1, dashArray: '5 6', fillOpacity: .025 }}/>
    <CircleMarker center={[center.lat, center.lon]} radius={18} pathOptions={{ color: '#0961df', opacity: 0, fillOpacity: .12 }}/>
    <CircleMarker center={[center.lat, center.lon]} radius={7} pathOptions={{ color: 'white', weight: 3, fillColor: '#0860ed', fillOpacity: 1 }}><Tooltip>Search location</Tooltip></CircleMarker>
    {stops.map(stop => <Marker key={stop.id} position={[stop.lat, stop.lon]} icon={stopIcon} eventHandlers={{ click: () => onStop(stop) }}><Tooltip direction="top" offset={[0, -18]}>{stop.name}</Tooltip></Marker>)}
    {vehicles.map(bus => <Marker key={bus.id} position={[bus.lat, bus.lon]} icon={busIcon(bus.routeNumber)} eventHandlers={{ click: () => onVehicle(bus) }}><Tooltip>{bus.routeNumber} · {bus.destination || 'BMTC bus'}</Tooltip></Marker>)}
    {routeStops.length > 1 && <Polyline positions={routeStops.map(s => [s.lat, s.lon])} pathOptions={{ color: '#0755d9', weight: 4, opacity: .7, dashArray: '8 7' }}/>} 
  </MapContainer>;
}
