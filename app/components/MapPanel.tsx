"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Place = {
  id: string; name: string; type: "country" | "admin1" | "city"; lat: number; lon: number;
  totalResultCount: number; categoryCount: number; topCategory: string | null; resultFile: string | null;
};
type Result = { article_id: string; sourcePlace: Pick<Place, "id" | "name" | "type" | "lat" | "lon"> };

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

export function MapPanel({ place, places, results, activeResult, onSelectResult, onSelectPlace }: {
  place: Place | null; places: Place[]; results: Result[]; activeResult: number;
  onSelectResult: (index: number) => void; onSelectPlace: (place: Place) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const placeById = useRef(new Map<string, Place>());
  const callbacks = useRef({ onSelectResult, onSelectPlace });
  const [ready, setReady] = useState(false);

  useEffect(() => { callbacks.current = { onSelectResult, onSelectPlace }; }, [onSelectResult, onSelectPlace]);
  useEffect(() => { placeById.current = new Map(places.map((item) => [item.id, item])); }, [places]);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({ container: container.current, style, center: [8, 24], zoom: 1.35, minZoom: 1, attributionControl: false });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    map.on("load", () => {
      map.addSource("atlas-places", {
        type: "geojson", data: { type: "FeatureCollection", features: [] }, cluster: true, clusterRadius: 42, clusterMaxZoom: 7,
        clusterProperties: { content: ["+", ["get", "count"]] },
      });
      map.addLayer({ id: "place-clusters", type: "circle", source: "atlas-places", filter: ["has", "point_count"], paint: {
        "circle-color": "#18312b", "circle-opacity": 0.88,
        "circle-radius": ["interpolate", ["linear"], ["coalesce", ["get", "content"], ["get", "point_count"]], 1, 15, 25, 20, 100, 27, 500, 36],
        "circle-stroke-width": 2, "circle-stroke-color": "#f3efe3",
      } });
      map.addLayer({ id: "cluster-label", type: "symbol", source: "atlas-places", filter: ["has", "point_count"], layout: {
        "text-field": ["number-format", ["coalesce", ["get", "content"], ["get", "point_count"]], { "min-fraction-digits": 0, "max-fraction-digits": 0 }], "text-size": 10,
      }, paint: { "text-color": "#f3efe3" } });
      map.addLayer({ id: "place-points", type: "circle", source: "atlas-places", filter: ["!", ["has", "point_count"]], paint: {
        "circle-color": ["step", ["get", "variety"], "#91a596", 2, "#c0894f", 4, "#9f4a32"],
        "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "count"]], 1, 5, 4, 8, 11, 13, 25, 20],
        "circle-opacity": 0.86, "circle-stroke-width": 1.5, "circle-stroke-color": "#f3efe3",
      } });
      map.addLayer({ id: "selected-place", type: "circle", source: "atlas-places", filter: ["==", ["get", "id"], ""], paint: {
        "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "count"]], 1, 10, 25, 25],
        "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 4, "circle-stroke-color": "#18312b",
      } });
      map.addSource("results", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "result-halo", type: "circle", source: "results", paint: { "circle-radius": 15, "circle-color": "#f4f0e5", "circle-stroke-color": "#9f4a32", "circle-stroke-width": 2 } });
      map.addLayer({ id: "result-label", type: "symbol", source: "results", layout: { "text-field": ["get", "rank"], "text-size": 11 }, paint: { "text-color": "#7e3423" } });

      map.on("click", "place-clusters", async (event) => {
        const feature = event.features?.[0];
        const clusterId = Number(feature?.properties?.cluster_id);
        const source = map.getSource("atlas-places") as GeoJSONSource;
        if (!feature || !Number.isFinite(clusterId)) return;
        const zoom = await source.getClusterExpansionZoom(clusterId);
        map.easeTo({ center: (feature.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
      });
      map.on("click", "place-points", (event) => {
        const id = String(event.features?.[0]?.properties?.id || "");
        const next = placeById.current.get(id);
        if (next) callbacks.current.onSelectPlace(next);
      });
      map.on("click", "result-halo", (event) => {
        const index = Number(event.features?.[0]?.properties?.index);
        if (Number.isFinite(index)) callbacks.current.onSelectResult(index);
      });
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
      map.on("mousemove", "place-points", (event) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;
        const { name, count, variety } = feature.properties || {};
        popup.setLngLat(feature.geometry.coordinates as [number, number]).setHTML(`<strong>${name}</strong><br><span>${count} readings · ${variety} ${Number(variety) === 1 ? "kind" : "kinds"}</span>`).addTo(map);
      });
      map.on("mouseleave", "place-points", () => { map.getCanvas().style.cursor = ""; popup.remove(); });
      for (const layer of ["place-clusters", "result-halo"]) {
        map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
      }
      setReady(true);
    });
    mapRef.current = map;
    return () => { mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const features = places.filter((item) => item.resultFile && item.totalResultCount > 0).map((item) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [item.lon, item.lat] },
      properties: { id: item.id, name: item.name, count: item.totalResultCount, variety: item.categoryCount, category: item.topCategory || "places" },
    }));
    (map.getSource("atlas-places") as GeoJSONSource).setData({ type: "FeatureCollection", features });
  }, [places, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const seen = new Set<string>();
    const features = results.flatMap((result, index) => {
      if (result.sourcePlace.type !== "city" || seen.has(result.sourcePlace.id)) return [];
      seen.add(result.sourcePlace.id);
      return [{ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [result.sourcePlace.lon, result.sourcePlace.lat] }, properties: { index, rank: String(index + 1), name: result.sourcePlace.name } }];
    });
    (map.getSource("results") as GeoJSONSource).setData({ type: "FeatureCollection", features });
    map.setFilter("selected-place", ["==", ["get", "id"], place?.id || ""]);
    if (place) map.flyTo({ center: [place.lon, place.lat], zoom: place.type === "country" ? 3.2 : place.type === "admin1" ? 5.5 : 8.5, duration: 900, essential: true });
  }, [place, results, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const result = results[activeResult];
    if (!map || !ready || !result || result.sourcePlace.type !== "city") return;
    map.easeTo({ center: [result.sourcePlace.lon, result.sourcePlace.lat], duration: 500 });
  }, [activeResult, results, ready]);

  return <aside className="map-panel" aria-label="Atlas map">
    <div ref={container} className="map-canvas" />
    <div className="map-caption"><span>{place ? place.name : "The world, according to Tyler"}</span><small>{place ? "Select a place or numbered reading" : "Circle size shows readings"}</small></div>
    <div className="map-legend"><strong>Atlas coverage</strong><span><i className="low" />1 kind</span><span><i className="mid" />2–3 kinds</span><span><i className="high" />4+ kinds</span><small>Circle size = number of readings</small></div>
  </aside>;
}
