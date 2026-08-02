"use client";

import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { MapPanel } from "./components/MapPanel";

type Place = {
  id: string;
  name: string;
  ascii: string;
  type: "country" | "admin1" | "city";
  country: string;
  adminName?: string | null;
  lat: number;
  lon: number;
  population: number;
  aliases: string[];
  resultCount: number;
  totalResultCount: number;
  categoryCount: number;
  topCategory: string | null;
  visitStatus: "confirmed" | "discussed" | "unknown";
  visitSource: "direct" | "contained-place" | null;
  parentId: string | null;
  resultFile: string | null;
};

type Result = {
  article_id: string;
  relation: string;
  tier: number;
  confidence: number;
  reason: string;
  category: string;
  evidence: string;
  review_status: string;
  sourcePlace: Pick<Place, "id" | "name" | "lat" | "lon" | "type">;
  article: { id: string; title: string; url: string; date: string; excerpt: string; bodyStatus: string };
};

const CATEGORIES = [
  ["all", "All"], ["food", "Food"], ["places", "Places"], ["books", "Books"],
  ["people-ideas", "People & ideas"], ["economics-history", "Economics & history"], ["culture", "Culture"],
] as const;

const EXAMPLES = ["Brazil", "Tokyo", "Mexico City", "Istanbul"];

function norm(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function searchPlaces(places: Place[], query: string) {
  const q = norm(query);
  if (!q) return [];
  return places.map((place) => {
    const name = norm(place.name);
    const aliases = place.aliases.map(norm);
    let match = 0;
    if (name === q) match = 1200;
    else if (aliases.includes(q)) match = 1100;
    else if (name.startsWith(q)) match = 900;
    else if (aliases.some((alias) => alias.startsWith(q))) match = 820;
    else if (name.split(" ").some((word) => word.startsWith(q))) match = 700;
    else if (name.includes(q) || aliases.some((alias) => alias.includes(q))) match = 520;
    else if (q.length > 5 && name.length >= 4 && ` ${q} `.includes(` ${name} `)) match = 460;
    if (!match) return null;
    // Exact country/city names outrank same-named administrative areas; all remain visible as suggestions.
    const typePriority = place.type === "country" ? 100 : place.type === "city" ? 60 : 20;
    const score = match + Math.min(place.totalResultCount, 100) * 2 + Math.log10(place.population + 10) * 9 + typePriority;
    return { place, score };
  }).filter((item): item is { place: Place; score: number } => Boolean(item))
    .sort((a, b) => b.score - a.score).slice(0, 8).map((item) => item.place);
}

function distanceKm(a: Place, b: Place) {
  const radius = 6371;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export default function Home() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [query, setQuery] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [place, setPlace] = useState<Place | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("all");
  const [activeResult, setActiveResult] = useState(0);
  const [fallback, setFallback] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapExploring, setMapExploring] = useState(false);
  const [visitedOnly, setVisitedOnly] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/data/places.json").then((response) => {
      if (!response.ok) throw new Error("Place index unavailable");
      return response.json();
    }).then((data: Place[]) => {
      setPlaces(data);
      const id = new URLSearchParams(window.location.search).get("place");
      const initial = id ? data.find((candidate) => candidate.id === id) : null;
      if (initial) void choosePlace(initial, data);
    }).catch(() => setFallback("The place index could not load. Try again in a moment."));
    // choosePlace is intentionally stable for this one-time bootstrap; adding it would refetch the index after state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const countries = useMemo(() => new Map(places.filter((item) => item.type === "country").map((item) => [item.country, item])), [places]);
  const eligiblePlaces = useMemo(() => visitedOnly ? places.filter((item) => item.visitStatus === "confirmed") : places, [places, visitedOnly]);
  const visitedCount = useMemo(() => places.filter((item) => item.visitStatus === "confirmed").length, [places]);
  const suggestions = useMemo(() => suggestionsOpen ? searchPlaces(eligiblePlaces, query).filter((candidate) => candidate.id !== place?.id) : [], [eligiblePlaces, query, place?.id, suggestionsOpen]);
  const visibleResults = useMemo(() => category === "all" ? results : results.filter((result) => result.category === category), [results, category]);

  async function choosePlace(next: Place, source = places) {
    setPlace(next); setQuery(next.name); setSuggestionsOpen(false); setCategory("all"); setActiveResult(0); setLoading(true); setFallback(null); setMapOpen(false); setMapExploring(false);
    window.history.replaceState(null, "", `?place=${encodeURIComponent(next.id)}`);
    try {
      async function fetchFile(file: string) {
        const response = await fetch(file);
        if (!response.ok) throw new Error("Results unavailable");
        return response.json() as Promise<Result[]>;
      }
      let combined = next.resultFile ? await fetchFile(next.resultFile) : [];
      if (next.type === "city" && combined.length < 12) {
        const nearby = source.filter((candidate) => candidate.type === "city" && candidate.id !== next.id && candidate.resultFile)
          .map((candidate) => ({ candidate, distance: distanceKm(next, candidate) }))
          .filter((item) => item.distance <= 250)
          .sort((a, b) => a.distance - b.distance).slice(0, 6);
        const nearbyResults = await Promise.all(nearby.map(async ({ candidate, distance }) => {
          const items = await fetchFile(candidate.resultFile!);
          return items.slice(0, 8).map((item) => ({ ...item, tier: Math.max(3, item.tier), relation: "nearby", reason: `About ${candidate.name}, ${Math.round(distance)} km from ${next.name}` }));
        }));
        combined = [...combined, ...nearbyResults.flat()];
        if (!next.resultFile && nearbyResults.some((items) => items.length)) setFallback(`No exact ${next.name} match yet. Showing writing within 250 km.`);
      }
      if (!combined.length && next.type === "city") {
        const country = source.find((candidate) => candidate.type === "country" && candidate.country === next.country);
        if (country?.resultFile) {
          combined = await fetchFile(country.resultFile);
          setFallback(`No exact or nearby ${next.name} match yet. Showing writing about ${country.name}.`);
        }
      }
      const seen = new Set<string>();
      setResults(combined.filter((item) => !seen.has(item.article_id) && Boolean(seen.add(item.article_id))).slice(0, 120));
    } catch {
      setResults([]); setFallback("Results could not load. Try the place again.");
    } finally { setLoading(false); }
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!suggestions.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedSuggestion((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length);
    }
    if (event.key === "Enter") { event.preventDefault(); void choosePlace(suggestions[selectedSuggestion]); }
    if (event.key === "Escape") setSuggestionsOpen(false);
  }

  function toggleVisitedOnly() {
    const next = !visitedOnly;
    setVisitedOnly(next);
    setSuggestionsOpen(Boolean(query));
    if (next && place?.visitStatus !== "confirmed") {
      setPlace(null); setResults([]); setQuery(""); setCategory("all"); setFallback(null); setMapOpen(false); setMapExploring(true);
      window.history.replaceState(null, "", "/");
    }
  }

  return (
    <main className={`${place ? "atlas selected" : "atlas landing"}${mapOpen ? " map-open" : ""}${mapExploring ? " map-exploring" : ""}`}>
      <header className="topbar">
        <button className="brand" onClick={() => { setPlace(null); setResults([]); setQuery(""); setSuggestionsOpen(false); setMapOpen(false); setMapExploring(false); window.history.replaceState(null, "", "/"); searchRef.current?.focus(); }}>
          <span className="brand-mark">TC</span><span>Tyler Cowen Atlas</span>
        </button>
        <div className="topbar-meta">
          <span className="edition">34,345 posts · 2003–2026</span>
          <button className={`visit-filter${visitedOnly ? " active" : ""}`} aria-pressed={visitedOnly} onClick={toggleVisitedOnly}>
            <span className="visit-filter-dot" aria-hidden="true"></span><span>Tyler visited</span>{visitedCount > 0 && <strong>{visitedCount}</strong>}
          </button>
        </div>
      </header>

      <section className="search-layer" aria-label="Find a place">
        {!place && !mapExploring && <div className="intro"><p className="overline">A geographic index of Marginal Revolution</p><h1>Where are you<br /><em>going?</em></h1><p>Find Tyler’s guides, meals, books, people, and ideas bound to a place.</p></div>}
        <div className="search-wrap">
          <div className="search-box">
            <span className="search-symbol" aria-hidden="true">⌖</span>
            <input ref={searchRef} value={query} onChange={(event) => { setQuery(event.target.value); setSuggestionsOpen(true); setSelectedSuggestion(0); }} onKeyDown={onSearchKeyDown}
              onFocus={() => setSuggestionsOpen(true)}
              placeholder="City, country, or address" aria-label="Search for a city, country, or address" autoComplete="off" />
            {query && <button className="clear" aria-label="Clear search" onClick={() => { setQuery(""); setSuggestionsOpen(false); searchRef.current?.focus(); }}>×</button>}
          </div>
          {suggestions.length > 0 && <div className="suggestions" role="listbox">
            {suggestions.map((suggestion, index) => {
              const country = countries.get(suggestion.country);
              const location = [suggestion.adminName, country?.name].filter(Boolean).join(", ");
              return <button key={suggestion.id} className={index === selectedSuggestion ? "active" : ""} role="option" aria-selected={index === selectedSuggestion}
                onMouseEnter={() => setSelectedSuggestion(index)} onClick={() => void choosePlace(suggestion)}>
                <span className="suggestion-icon">{suggestion.type === "country" ? "◎" : suggestion.type === "admin1" ? "◉" : "•"}</span>
                <span><strong>{suggestion.name}{suggestion.visitStatus === "confirmed" && <i className="visited-tag">Visited</i>}</strong><small>{suggestion.type !== "country" && location ? `${location} · ` : ""}{suggestion.type === "admin1" ? "state / region" : suggestion.type} · {suggestion.totalResultCount ? `${suggestion.totalResultCount} readings` : "nearby readings"}</small></span>
                <span className="return">↵</span>
              </button>;
            })}
          </div>}
          {visitedOnly && query && suggestionsOpen && suggestions.length === 0 && <div className="filter-empty" role="status" aria-live="polite">No confirmed visit matches this search.</div>}
          {!place && !mapExploring && <div className="examples">{EXAMPLES.map((example) => <button key={example} onClick={() => { setQuery(example); const match = searchPlaces(eligiblePlaces, example)[0]; if (match) void choosePlace(match); }}>{example}</button>)}</div>}
        </div>
      </section>

      {place && <section className="reading-panel">
        <div className="place-heading">
          <p className="overline">{place.type === "admin1" ? "State / region" : place.type} · {countries.get(place.country)?.name ?? place.country}{place.visitStatus === "confirmed" && <span className="place-visited">Tyler visited</span>}</p>
          <h1>{place.name}</h1>
          <p>{loading ? "Reading the atlas…" : `${visibleResults.length} ${visibleResults.length === 1 ? "reading" : "readings"}`}</p>
        </div>
        <nav className="filters" aria-label="Filter readings by category">
          {CATEGORIES.map(([value, label]) => <button key={value} className={category === value ? "active" : ""} onClick={() => { setCategory(value); setActiveResult(0); }}>{label}</button>)}
        </nav>
        {fallback && <div className="notice">{fallback}</div>}
        {!loading && visibleResults.length === 0 && <div className="empty"><span>○</span><h2>No exact readings yet</h2><p>This location remains in the atlas. The unclassified ledger is preserved for the next review pass.</p></div>}
        {visibleResults.map((result, index) => <article key={result.article_id} className={`reading ${activeResult === index ? "active" : ""} ${index === 0 && result.tier === 1 ? "featured" : ""}`}
          onMouseEnter={() => setActiveResult(index)}>
          {index === 0 && result.tier === 1 && <div className="start-here">Start here</div>}
          <div className="reading-top"><span>{String(index + 1).padStart(2, "0")}</span><span>{result.article.date || "Marginal Revolution"}</span><span>{result.category.replace("-", " & ")}</span></div>
          <h2><a href={result.article.url} target="_blank" rel="noreferrer">{result.article.title}<span aria-hidden="true">↗</span></a></h2>
          <p className="excerpt">{result.evidence || result.article.excerpt}</p>
          <div className="relation"><span className={`tier tier-${result.tier}`}></span>{result.reason}</div>
        </article>)}
        <footer><a href="https://marginalrevolution.com" target="_blank" rel="noreferrer">Original writing on Marginal Revolution ↗</a><span>Place data © GeoNames · Map © OpenStreetMap contributors</span></footer>
      </section>}

      {place && <button className="mobile-view-toggle" onClick={() => setMapOpen((open) => !open)}>{mapOpen ? "Readings" : "Map"}</button>}
      <MapPanel place={place} places={places} results={visibleResults} activeResult={activeResult} visitedOnly={visitedOnly} visitedCount={visitedCount} onSelectResult={setActiveResult} onSelectPlace={(next) => void choosePlace(next)} onExploreMap={() => { if (!place) { setMapExploring(true); setSuggestionsOpen(false); } }} />
    </main>
  );
}
