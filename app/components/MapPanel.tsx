"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import Supercluster from "supercluster";
import "maplibre-gl/dist/maplibre-gl.css";

type Place = {
  id: string; name: string; ascii: string; type: "country" | "admin1" | "city"; country: string;
  adminName?: string | null; lat: number; lon: number; population: number; aliases: string[];
  resultCount: number; parentId: string | null;
  totalResultCount: number; categoryCount: number; topCategory: string | null; resultFile: string | null;
};
type Result = { article_id: string; sourcePlace: Pick<Place, "id" | "name" | "type" | "lat" | "lon"> };
type PointProperties = { placeId: string; name: string; count: number };
type ClusterProperties = { readings: number };

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

function compactCount(value: number) {
  return value >= 1000 ? `${Math.round(value / 100) / 10}k` : String(value);
}

export function MapPanel({ place, places, results, activeResult, onSelectResult, onSelectPlace, onExploreMap }: {
  place: Place | null; places: Place[]; results: Result[]; activeResult: number;
  onSelectResult: (index: number) => void; onSelectPlace: (place: Place) => void; onExploreMap: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const coverageMarkers = useRef<Marker[]>([]);
  const resultMarkers = useRef<Marker[]>([]);
  const clusterIndex = useRef<Supercluster<PointProperties, ClusterProperties> | null>(null);
  const placeById = useRef(new Map<string, Place>());
  const selectedPlace = useRef(place);
  const callbacks = useRef({ onSelectResult, onSelectPlace, onExploreMap });
  const renderCoverage = useRef<() => void>(() => undefined);

  useEffect(() => { selectedPlace.current = place; }, [place]);
  useEffect(() => { callbacks.current = { onSelectResult, onSelectPlace, onExploreMap }; }, [onSelectResult, onSelectPlace, onExploreMap]);

  useEffect(() => {
    placeById.current = new Map(places.map((item) => [item.id, item]));
    const points: Array<Supercluster.PointFeature<PointProperties>> = places.filter((item) => item.resultFile && item.totalResultCount > 0).map((item) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [item.lon, item.lat] },
      properties: { placeId: item.id, name: item.name, count: item.totalResultCount },
    }));
    clusterIndex.current = new Supercluster<PointProperties, ClusterProperties>({
      radius: 46, maxZoom: 8,
      map: (properties) => ({ readings: properties.count }),
      reduce: (accumulated, properties) => { accumulated.readings += properties.readings; },
    }).load(points);
    renderCoverage.current();
  }, [places]);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({ container: container.current, style, center: [8, 24], zoom: 1.35, minZoom: 1, attributionControl: false });
    mapRef.current = map;
    const mapContainer = container.current;
    const focusMap = () => callbacks.current.onExploreMap();
    for (const eventName of ["pointerdown", "click", "wheel"]) mapContainer.addEventListener(eventName, focusMap, { capture: true });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");

    const drawCoverage = () => {
      const index = clusterIndex.current;
      if (!index) return;
      coverageMarkers.current.forEach((marker) => marker.remove());
      coverageMarkers.current = [];
      const bounds = map.getBounds();
      const south = Math.max(-85, bounds.getSouth());
      const north = Math.min(85, bounds.getNorth());
      const span = bounds.getEast() - bounds.getWest();
      const normalizeLon = (longitude: number) => ((longitude + 180) % 360 + 360) % 360 - 180;
      const west = normalizeLon(bounds.getWest());
      const east = normalizeLon(bounds.getEast());
      const boxes: GeoJSON.BBox[] = span >= 360
        ? [[-180, south, 180, north]]
        : west <= east ? [[west, south, east, north]] : [[west, south, 180, north], [-180, south, east, north]];
      const zoom = Math.max(0, Math.min(16, Math.floor(map.getZoom())));
      const features = boxes.flatMap((bbox) => index.getClusters(bbox, zoom));
      coverageMarkers.current = features.map((feature) => {
        const isCluster = Boolean("cluster" in feature.properties && feature.properties.cluster);
        const clusterProperties = isCluster ? feature.properties as Supercluster.ClusterProperties & ClusterProperties : null;
        const pointProperties = isCluster ? null : feature.properties as PointProperties;
        const readings = clusterProperties?.readings ?? pointProperties!.count;
        const placesCount = clusterProperties?.point_count ?? 1;
        const sizeMetric = isCluster ? placesCount : readings;
        const size = Math.max(13, Math.min(30, 10 + Math.sqrt(sizeMetric) * 0.9));
        const element = document.createElement("button");
        element.type = "button";
        element.className = isCluster ? "atlas-map-marker cluster" : "atlas-map-marker point";
        element.style.setProperty("--marker-size", `${size}px`);
        element.textContent = isCluster ? compactCount(placesCount) : "";
        element.title = isCluster
          ? `${placesCount.toLocaleString()} places · ${readings.toLocaleString()} readings`
          : `${pointProperties!.name} · ${readings.toLocaleString()} readings`;
        element.setAttribute("aria-label", element.title);
        if (pointProperties?.placeId === selectedPlace.current?.id) element.classList.add("selected");
        if (pointProperties) element.dataset.placeId = pointProperties.placeId;
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          if (clusterProperties) {
            map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom: index.getClusterExpansionZoom(clusterProperties.cluster_id) });
          } else {
            const next = placeById.current.get(pointProperties!.placeId);
            if (next) callbacks.current.onSelectPlace(next);
          }
        });
        return new maplibregl.Marker({ element }).setLngLat(feature.geometry.coordinates as [number, number]).addTo(map);
      });
    };

    renderCoverage.current = drawCoverage;
    map.on("load", drawCoverage);
    map.on("moveend", drawCoverage);
    const resizeObserver = new ResizeObserver(() => {
      if (!container.current?.clientWidth || !container.current.clientHeight) return;
      map.resize();
      drawCoverage();
    });
    resizeObserver.observe(container.current);
    return () => {
      for (const eventName of ["pointerdown", "click", "wheel"]) mapContainer.removeEventListener(eventName, focusMap, { capture: true });
      resizeObserver.disconnect();
      coverageMarkers.current.forEach((marker) => marker.remove());
      resultMarkers.current.forEach((marker) => marker.remove());
      renderCoverage.current = () => undefined;
      map.remove();
      if (mapRef.current === map) mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    renderCoverage.current();
    const map = mapRef.current;
    if (map && place) map.flyTo({ center: [place.lon, place.lat], zoom: place.type === "country" ? 3.2 : place.type === "admin1" ? 5.5 : 8.5, duration: 900, essential: true });
  }, [place]);

  useEffect(() => {
    resultMarkers.current.forEach((marker) => marker.remove());
    resultMarkers.current = [];
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    resultMarkers.current = results.flatMap((result, index) => {
      if (result.sourcePlace.type !== "city" || seen.has(result.sourcePlace.id)) return [];
      seen.add(result.sourcePlace.id);
      const element = document.createElement("button");
      element.type = "button";
      element.className = `result-map-marker${index === activeResult ? " active" : ""}`;
      element.textContent = String(index + 1);
      element.title = result.sourcePlace.name;
      element.addEventListener("click", (event) => { event.stopPropagation(); callbacks.current.onSelectResult(index); });
      return [new maplibregl.Marker({ element }).setLngLat([result.sourcePlace.lon, result.sourcePlace.lat]).addTo(map)];
    });
  }, [results, activeResult]);

  useEffect(() => {
    const map = mapRef.current;
    const result = results[activeResult];
    if (!map || !result || result.sourcePlace.type !== "city") return;
    map.easeTo({ center: [result.sourcePlace.lon, result.sourcePlace.lat], duration: 500 });
  }, [activeResult, results]);

  return <aside className="map-panel" aria-label="Atlas map">
    <div ref={container} className="map-canvas" />
    <div className="map-caption"><span>{place ? place.name : "The world, according to Tyler"}</span><small>{place ? "Select a place or numbered reading" : "Dot size shows readings · clusters show places"}</small></div>
    <div className="map-legend"><strong>Atlas coverage</strong><small>Dot size = readings · clusters = locations</small></div>
  </aside>;
}
