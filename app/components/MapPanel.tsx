"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Place = { id: string; name: string; type: "country" | "city"; lat: number; lon: number };
type Result = { article_id: string; sourcePlace: Place };

const style = {
  version: 8 as const,
  sources: {
    osm: { type: "raster" as const, tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" },
  },
  layers: [
    { id: "paper", type: "background" as const, paint: { "background-color": "#d9d5c7" } },
    { id: "osm", type: "raster" as const, source: "osm", paint: { "raster-saturation": -0.92, "raster-contrast": -0.15, "raster-brightness-min": 0.35, "raster-brightness-max": 0.92, "raster-opacity": 0.73 } },
  ],
};

export function MapPanel({ place, results, activeResult, onSelectResult }: { place: Place | null; results: Result[]; activeResult: number; onSelectResult: (index: number) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({ container: container.current, style, center: [8, 24], zoom: 1.35, minZoom: 1, attributionControl: false });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    map.on("load", () => setReady(true));
    mapRef.current = map;
    return () => { mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const seen = new Set<string>();
    const features = results.flatMap((result, index) => {
      if (result.sourcePlace.type !== "city" || seen.has(result.sourcePlace.id)) return [];
      seen.add(result.sourcePlace.id);
      return [{ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [result.sourcePlace.lon, result.sourcePlace.lat] }, properties: { index, rank: String(index + 1), name: result.sourcePlace.name } }];
    });
    const data = { type: "FeatureCollection" as const, features };
    if (map.getSource("results")) (map.getSource("results") as GeoJSONSource).setData(data);
    else {
      map.addSource("results", { type: "geojson", data });
      map.addLayer({ id: "result-halo", type: "circle", source: "results", paint: { "circle-radius": 15, "circle-color": "#f4f0e5", "circle-stroke-color": "#9f4a32", "circle-stroke-width": 2 } });
      map.addLayer({ id: "result-label", type: "symbol", source: "results", layout: { "text-field": ["get", "rank"], "text-size": 11, "text-font": ["Open Sans Bold"] }, paint: { "text-color": "#7e3423" } });
      map.on("click", "result-halo", (event) => { const index = Number(event.features?.[0]?.properties?.index); if (Number.isFinite(index)) onSelectResult(index); });
      map.on("mouseenter", "result-halo", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "result-halo", () => { map.getCanvas().style.cursor = ""; });
    }
    if (place) map.flyTo({ center: [place.lon, place.lat], zoom: place.type === "country" ? 3.2 : 8.5, duration: 900, essential: true });
  }, [place, results, ready, onSelectResult]);

  useEffect(() => {
    const map = mapRef.current;
    const result = results[activeResult];
    if (!map || !ready || !result || result.sourcePlace.type !== "city") return;
    map.easeTo({ center: [result.sourcePlace.lon, result.sourcePlace.lat], duration: 500 });
  }, [activeResult, results, ready]);

  return <aside className="map-panel" aria-label="Map of selected place"><div ref={container} className="map-canvas" /><div className="map-caption"><span>{place ? place.name : "The world, according to Tyler"}</span><small>{place ? "Select a reading to locate it" : "Search a place to begin"}</small></div></aside>;
}
