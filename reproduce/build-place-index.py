#!/usr/bin/env python3
"""Build an auditable, deterministic article-to-place index."""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT.parent / "2026-07-tyler-cowen-search/corpus/unified/tyler-cowen-posts.jsonl"
CITIES = ROOT / "reproduce/inputs/cities15000.txt"
COUNTRIES = ROOT / "reproduce/inputs/countryInfo.txt"
ADMINS = ROOT / "reproduce/inputs/admin1CodesASCII.txt"
OVERRIDES = ROOT / "data/curated-overrides.json"
MODEL_RUN = ROOT / "data/model-runs/unclassified-flash-lite-v2/decisions.jsonl"
MODEL_MANIFEST = MODEL_RUN.parent / "manifest.json"

SCHEMA_VERSION = "place-index-v1"
MAX_RESULTS_PER_PLACE = 120

COUNTRY_ALIASES = {
    "US": ["United States", "United States of America", "USA", "U.S.", "US", "America"],
    "GB": ["United Kingdom", "UK", "U.K.", "Britain", "Great Britain"],
    "TR": ["Turkey", "Türkiye", "Turkiye"],
    "VN": ["Vietnam", "Viet Nam"],
    "RU": ["Russia", "Russian Federation"],
    "KR": ["South Korea", "Korea, South", "Republic of Korea"],
    "KP": ["North Korea", "Korea, North", "DPRK"],
    "CZ": ["Czechia", "Czech Republic"],
    "CI": ["Côte d’Ivoire", "Cote d'Ivoire", "Ivory Coast"],
    "CD": ["Democratic Republic of the Congo", "DR Congo", "Congo-Kinshasa"],
    "CG": ["Republic of the Congo", "Congo-Brazzaville"],
    "MM": ["Myanmar", "Burma"],
    "MK": ["North Macedonia", "Macedonia"],
    "LA": ["Laos", "Lao People's Democratic Republic"],
    "SY": ["Syria", "Syrian Arab Republic"],
    "TZ": ["Tanzania", "United Republic of Tanzania"],
    "BO": ["Bolivia", "Plurinational State of Bolivia"],
    "VE": ["Venezuela", "Bolivarian Republic of Venezuela"],
    "IR": ["Iran", "Islamic Republic of Iran"],
    "MD": ["Moldova", "Republic of Moldova"],
    "PS": ["Palestine", "Palestinian Territories"],
}

COUNTRY_DEMONYMS = {
    "US": ("American", "Americans"), "GB": ("British", "Briton", "Britons"),
    "CN": ("Chinese",), "JP": ("Japanese",), "DE": ("German", "Germans"),
    "FI": ("Finnish",), "TH": ("Thai",), "IN": ("Indian", "Indians"),
    "FR": ("French",), "AF": ("Afghan", "Afghans"), "LB": ("Lebanese",),
    "IL": ("Israeli", "Israelis"), "MX": ("Mexican", "Mexicans"),
    "IR": ("Iranian", "Iranians"), "NO": ("Norwegian", "Norwegians"),
    "CA": ("Canadian", "Canadians"), "AR": ("Argentine", "Argentinian", "Argentinians"),
    "EC": ("Ecuadorian", "Ecuadorean"), "BG": ("Bulgarian", "Bulgarians"),
    "BR": ("Brazilian", "Brazilians"), "SG": ("Singaporean", "Singaporeans", "Singlish"),
    "CH": ("Swiss",), "ES": ("Spanish", "Spaniard", "Spaniards"),
    "SE": ("Swedish",), "CL": ("Chilean", "Chileans"), "IT": ("Italian", "Italians"),
    "VN": ("Vietnamese",), "MY": ("Malaysian", "Malaysians"),
    "AU": ("Australian", "Australians"), "ID": ("Indonesian", "Indonesians"),
    "RU": ("Russian", "Russians"), "SA": ("Saudi", "Saudis"),
    "MA": ("Moroccan", "Moroccans"), "NP": ("Nepalese", "Nepali"),
    "LK": ("Sri Lankan", "Sri Lankans"), "CU": ("Cuban", "Cubans"),
    "TR": ("Turkish", "Turk", "Turks"), "IQ": ("Iraqi", "Iraqis"),
}

CITY_ALIASES = {
    "Ho Chi Minh City": ["Saigon"],
    "Mumbai": ["Bombay"],
    "Kolkata": ["Calcutta"],
    "Beijing": ["Peking"],
    "Istanbul": ["Constantinople"],
    "Kyiv": ["Kiev"],
    "Chennai": ["Madras"],
    "Yangon": ["Rangoon"],
}

COUNTRY_TITLE_HOMONYMS = {
    "country:jo": ("michael jordan", "jordan peterson", "jordan schneider", "barbara jordan", "jordan ellenberg"),
    "country:ge": ("georgia tech", "sandy springs", "atlanta", "savannah", "university of georgia", "georgia state"),
}

COUNTRY_BODY_CONTEXT = {
    "country:jo": ("amman", "jordanian", "middle east", "kingdom of jordan", "petra", "dead sea", "west bank"),
    "country:ge": ("tbilisi", "georgian", "caucasus", "black sea", "former soviet", "republic of georgia"),
}

# Bare tokens that often mean something other than a place. These need stronger context.
AMBIGUOUS = {
    "america", "china", "chad", "georgia", "guinea", "jordan", "turkey",
    "reading", "nice", "mobile", "orange", "commerce", "union", "victoria",
    "independence", "hope", "enterprise", "normal", "college", "paris",
}

GEOGRAPHIC_CUES = {
    "city", "country", "travel", "trip", "visit", "visited", "hotel", "restaurant",
    "museum", "capital", "province", "state", "region", "border",
    "born", "near", "north", "south", "east", "west",
}

CATEGORY_TERMS = {
    "food": {"food", "eat", "eating", "restaurant", "cuisine", "dish", "meal", "chef", "cafe", "coffee"},
    "books": {"book", "books", "novel", "author", "literature", "read", "reading", "publisher"},
    "people-ideas": {"conversation", "interview", "economist", "writer", "professor", "born", "biography"},
    "economics-history": {"economy", "economic", "economics", "growth", "history", "historical", "war", "politics", "policy"},
    "culture": {"music", "film", "movie", "art", "museum", "culture", "opera", "painting", "architecture"},
    "places": {"travel", "trip", "visit", "hotel", "city", "country", "region", "guide", "advice"},
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalized(value: str) -> str:
    value = unicodedata.normalize("NFKD", value.casefold())
    value = "".join(character for character in value if not unicodedata.combining(character))
    return " ".join(re.findall(r"[\w]+", value, flags=re.UNICODE))


def slug(value: str) -> str:
    return normalized(value).replace(" ", "-")


def clean_body(value: str) -> tuple[str, str]:
    text = (value or "").strip()
    text = re.sub(r"(?:\n|\s)*The post\s*$", "", text, flags=re.I).strip()
    if not text or re.fullmatch(r"(?:\d+\s+comments?|media|image|here is the link)", text, re.I):
        return text, "empty_or_residue"
    if len(text) < 100:
        return text, "short"
    return text, "usable"


def category(title: str, text: str) -> str:
    tokens = set(normalized(f"{title} {text[:2500]}").split())
    scored = [(len(tokens & terms), name) for name, terms in CATEGORY_TERMS.items()]
    score, name = max(scored)
    return name if score else "places"


def excerpt(text: str, alias: str, limit: int = 230) -> str:
    match = re.search(re.escape(alias), text, flags=re.I)
    center = match.start() if match else 0
    start = max(0, center - 70)
    value = re.sub(r"\s+", " ", text[start:start + limit]).strip()
    return f"{'…' if start else ''}{value}{'…' if start + limit < len(text) else ''}"


def parse_gazetteer():
    admin_names = {}
    with ADMINS.open(encoding="utf-8") as handle:
        for line in handle:
            code, name, ascii_name, _ = line.rstrip("\n").split("\t")
            admin_names[code] = ascii_name or name
    countries = {}
    with COUNTRIES.open(encoding="utf-8") as handle:
        for line in handle:
            if not line.strip() or line.startswith("#"):
                continue
            fields = line.rstrip("\n").split("\t")
            code, name, capital, population, geoname_id = fields[0], fields[4], fields[5], int(fields[7] or 0), fields[16]
            countries[code] = {
                "id": f"country:{code.lower()}", "name": name, "type": "country", "country": code,
                "population": population, "geonameId": geoname_id, "capital": capital,
                "aliases": sorted(set([name, *COUNTRY_ALIASES.get(code, [])])),
            }

    cities = []
    capital_coords = {}
    with CITIES.open(encoding="utf-8") as handle:
        for line in handle:
            fields = line.rstrip("\n").split("\t")
            if len(fields) < 19 or fields[8] not in countries:
                continue
            aliases = [fields[1], *CITY_ALIASES.get(fields[1], [])]
            if normalized(fields[2]) != normalized(fields[1]) or len(fields[2]) >= 5:
                aliases.append(fields[2])
            aliases = sorted({a.strip() for a in aliases if 3 <= len(a.strip()) <= 60 and not re.search(r"\d|https?", a)})
            city = {
                "id": f"geonames:{fields[0]}", "name": fields[1], "ascii": fields[2], "type": "city",
                "country": fields[8], "admin1": fields[10], "lat": float(fields[4]), "lon": float(fields[5]),
                "adminName": admin_names.get(f"{fields[8]}.{fields[10]}"),
                "population": int(fields[14] or 0), "featureCode": fields[7], "aliases": aliases[:40],
            }
            cities.append(city)
            if normalized(fields[1]) == normalized(countries[fields[8]]["capital"]):
                previous = capital_coords.get(fields[8])
                if previous is None or city["population"] > previous[2]:
                    capital_coords[fields[8]] = (city["lat"], city["lon"], city["population"])

    for code, country in countries.items():
        lat, lon, _ = capital_coords.get(code, (0.0, 0.0, 0))
        country["lat"], country["lon"] = lat, lon
    return countries, cities


def build_alias_index(countries, cities):
    aliases = defaultdict(list)
    for place in [*countries.values(), *cities]:
        for raw_alias in place["aliases"]:
            alias = normalized(raw_alias)
            if len(alias) < 3 or len(alias.split()) > 6:
                continue
            aliases[alias].append(place)
    for alias in aliases:
        aliases[alias].sort(key=lambda item: (item["type"] == "country", item["population"]), reverse=True)
    return aliases


def load_model_decisions():
    if not MODEL_RUN.exists():
        return {}
    decisions = {}
    with MODEL_RUN.open(encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                row = json.loads(line)
                decisions[row["article_id"]] = row
    return decisions


def model_links(post, body_status, post_category, aliases):
    """Accept model candidates only after exact evidence and gazetteer validation."""
    row = MODEL_DECISIONS.get(post["stable_id"])
    if not row:
        return []
    source = "\n".join([
        post.get("title") or "", post.get("text") or "",
        *[link.get("text") or "" for link in post.get("links") or []],
    ])
    source_normalized = normalized(source)
    accepted = {}
    for candidate in row.get("decision", {}).get("geographic_evidence", []):
        place_name = candidate.get("place_name") or ""
        evidence = candidate.get("evidence") or ""
        alias = normalized(place_name)
        evidence_normalized = normalized(evidence)
        options = aliases.get(alias, [])
        if not options or not evidence_normalized or evidence_normalized not in source_normalized:
            continue
        relation = candidate.get("relation")
        centrality = float(candidate.get("centrality") or 0)
        if centrality < 0.55 or relation == "incidental":
            continue
        place = options[0]
        evidence_names_place = any(
            f" {normalized(raw)} " in f" {evidence_normalized} " for raw in place["aliases"]
        ) or (
            place["type"] == "country" and any(
                f" {normalized(demonym)} " in f" {evidence_normalized} " for demonym in COUNTRY_DEMONYMS.get(place["country"], ())
            )
        )
        if not evidence_names_place:
            continue
        # A low-population one-word city is too ambiguous without a country cue.
        if place["type"] == "city" and " " not in alias and place["population"] < 100_000:
            continue
        if alias in AMBIGUOUS:
            raw_match = any(re.search(rf"(?<!\w){re.escape(raw)}(?!\w)", evidence) for raw in place["aliases"])
            if not raw_match:
                continue
        title_normalized = normalized(post.get("title") or "")
        if place["type"] == "country" and any(term in title_normalized for term in COUNTRY_TITLE_HOMONYMS.get(place["id"], ())):
            continue
        tier = 3
        item = {
            "article_id": post["stable_id"], "place_id": place["id"], "relation": relation,
            "tier": tier, "confidence": round(min(0.89, centrality * 0.9), 3),
            "evidence": re.sub(r"\s+", " ", evidence).strip(), "matched_alias": place_name,
            "reason": f"Model candidate: {relation.replace('_', ' ')} evidence names {place['name']}",
            "strength": 1 + int(centrality * 3), "body_status": body_status, "category": post_category,
            "classifier": f"openrouter:{row.get('model', 'unknown')}:{row.get('prompt_version', 'unknown')}",
            "review_status": "validated-unreviewed",
        }
        previous = accepted.get(place["id"])
        if not previous or item["confidence"] > previous["confidence"]:
            accepted[place["id"]] = item
    return list(accepted.values())


def phrases(value: str, max_words: int = 6, already_normalized: bool = False):
    words = (value if already_normalized else normalized(value)).split()
    for start in range(len(words)):
        for length in range(1, min(max_words, len(words) - start) + 1):
            yield " ".join(words[start:start + length])


def extract(post, aliases):
    title = post["title"] or ""
    body, body_status = clean_body(post.get("text") or "")
    title_normalized = normalized(title)
    body_normalized = normalized(body)
    title_counts = Counter(phrase for phrase in phrases(title_normalized, already_normalized=True) if phrase in aliases)
    body_counts = Counter(phrase for phrase in phrases(body_normalized, already_normalized=True) if phrase in aliases)
    context = set(f"{title_normalized} {body_normalized}".split())
    mentioned_country_codes = {
        option["country"]
        for alias in (title_counts + body_counts)
        for option in aliases[alias]
        if option["type"] == "country"
    }
    candidates = {}

    for alias, count in (title_counts + body_counts).items():
        title_count, body_count = title_counts[alias], body_counts[alias]
        options = aliases[alias]
        # Resolve a shared name to the most populous place unless a country name in the post disambiguates it.
        place = options[0]
        country_cues = {option["country"] for option in options if option["country"] in mentioned_country_codes}
        if len(country_cues) == 1:
            place = next((option for option in options if option["country"] in country_cues), place)

        if place["type"] == "country" and any(term in title_normalized for term in COUNTRY_TITLE_HOMONYMS.get(place["id"], ())):
            continue

        is_ambiguous = alias in AMBIGUOUS or (len(alias) <= 4 and " " not in alias)
        has_geo_cue = bool(context & GEOGRAPHIC_CUES)
        raw_title_match = any(re.search(rf"(?<!\w){re.escape(raw)}(?!\w)", title) for raw in place["aliases"])
        raw_body_match = any(re.search(rf"(?<!\w){re.escape(raw)}(?!\w)", body) for raw in place["aliases"])
        if place["type"] == "city" and " " not in alias and not (raw_title_match or raw_body_match):
            continue
        if place["type"] == "city" and place["population"] < 20_000 and " " not in alias and title_count and place["country"] not in mentioned_country_codes:
            geographic_title = any(
                phrase in title_normalized for phrase in (
                    f"in {alias}", f"from {alias}", f"to {alias}", f"{alias} notes",
                    f"{alias} advice", f"{alias} guide", f"{alias} fact", f"{alias} travel",
                )
            )
            if not geographic_title:
                continue
        if is_ambiguous and not (title_count and raw_title_match) and not (body_count >= 2 and has_geo_cue and raw_body_match):
            continue
        if place["type"] == "country" and place["id"] in COUNTRY_BODY_CONTEXT and not title_count:
            full_normalized = f"{title_normalized} {body_normalized}"
            if not any(term in full_normalized for term in COUNTRY_BODY_CONTEXT[place["id"]]):
                continue
        if place["type"] == "city" and not title_count:
            if place["population"] < 100_000 and place["country"] not in mentioned_country_codes:
                continue
            if is_ambiguous and place["country"] not in mentioned_country_codes:
                continue

        current = candidates.get(place["id"])
        strength = title_count * 4 + min(body_count, 4)
        if any(phrase in title_normalized for phrase in ("my favorite things", "travel notes", " notes", " advice", " guide", "food in", "eating in")):
            strength += 12
        if current and current["strength"] >= strength:
            continue
        if title_count:
            relation, tier, confidence, reason = "subject", 1, 0.98, f"Title names {place['name']}"
        elif body_count >= 2:
            relation, tier, confidence, reason = "subject", 2, 0.9, f"Discusses {place['name']} {body_count} times"
        else:
            relation, tier, confidence, reason = "mention", 4, 0.62, f"Mentions {place['name']}"
        candidates[place["id"]] = {
            "place_id": place["id"], "relation": relation, "tier": tier, "confidence": confidence,
            "evidence": excerpt(f"{title}\n{body}", alias), "matched_alias": alias, "reason": reason,
            "strength": strength, "body_status": body_status,
        }
    return list(candidates.values()), body, body_status


def main():
    global MODEL_DECISIONS
    MODEL_DECISIONS = load_model_decisions()
    countries, cities = parse_gazetteer()
    all_places = {place["id"]: place for place in [*countries.values(), *cities]}
    aliases = build_alias_index(countries, cities)
    overrides = json.loads(OVERRIDES.read_text())
    model_manifest = json.loads(MODEL_MANIFEST.read_text()) if MODEL_MANIFEST.exists() else None
    override_places = {normalized(place["name"]): place for place in all_places.values()}

    articles = {}
    links = []
    ledger = []
    stats = Counter()

    with CORPUS.open(encoding="utf-8") as handle:
        for line in handle:
            post = json.loads(line)
            extracted, body, body_status = extract(post, aliases)
            post_category = category(post["title"], body)
            for item in extracted:
                item.update({
                    "article_id": post["stable_id"], "category": post_category,
                    "classifier": "deterministic-v1", "review_status": "accepted" if item["tier"] <= 2 else "unreviewed",
                })
                links.append(item)

            validated_model_links = model_links(post, body_status, post_category, aliases)
            links.extend(validated_model_links)

            for override in overrides:
                title_matches = (
                    "article_title_equals" in override and normalized(override["article_title_equals"]) == normalized(post["title"])
                ) or (
                    "article_title_contains" in override and normalized(override["article_title_contains"]) in normalized(post["title"])
                )
                if title_matches:
                    place = override_places.get(normalized(override["place"]))
                    if place:
                        links.append({
                            "article_id": post["stable_id"], "place_id": place["id"],
                            "relation": override["relation"], "tier": 3, "confidence": 0.92,
                            "evidence": override["reason"], "matched_alias": override["place"],
                            "reason": f"Indirect tie: {override['reason']}", "strength": 2,
                            "body_status": body_status, "category": override["category"],
                            "classifier": "curated-v1", "review_status": override["review_status"],
                        })

            article_links = [item for item in links[-(len(extracted) + len(overrides)):]
                             if item["article_id"] == post["stable_id"]]
            state = "classified" if extracted else ("model_classified" if validated_model_links else "unclassified")
            reason = "explicit_place_evidence" if extracted else ("validated_model_place_evidence" if validated_model_links else (
                "empty_or_residue_body" if body_status == "empty_or_residue" else "no_explicit_place"
            ))
            ledger.append({
                "article_id": post["stable_id"], "state": state, "reason": reason,
                "body_status": body_status, "candidate_count": len(extracted) + len(validated_model_links),
                "classifier": "deterministic-v1+model-v2" if validated_model_links else "deterministic-v1",
            })
            stats[state] += 1
            stats[f"body:{body_status}"] += 1
            if extracted or validated_model_links or any(item["article_id"] == post["stable_id"] for item in links[-4:]):
                articles[post["stable_id"]] = {
                    "id": post["stable_id"], "title": post["title"], "url": post["canonical_url"],
                    "date": (post["published_at"] or "")[:10], "excerpt": re.sub(r"\s+", " ", body[:360]).strip(),
                    "source": post["corpus_source"], "bodyStatus": body_status,
                }

    # Deduplicate exact article/place links, keeping the stronger relation.
    deduped = {}
    for item in links:
        key = (item["article_id"], item["place_id"])
        if key not in deduped or (item["tier"], -item["confidence"]) < (deduped[key]["tier"], -deduped[key]["confidence"]):
            deduped[key] = item
    links = list(deduped.values())

    direct_by_place = defaultdict(list)
    for item in links:
        direct_by_place[item["place_id"]].append(item)

    city_ids_by_country = defaultdict(list)
    for city in cities:
        city_ids_by_country[city["country"]].append(city["id"])

    results = {}
    for place_id, place in all_places.items():
        items = list(direct_by_place.get(place_id, []))
        if place["type"] == "country":
            for city_id in city_ids_by_country[place["country"]]:
                for item in direct_by_place.get(city_id, []):
                    if item["tier"] <= 2:
                        child = dict(item)
                        child["tier"] = max(2, child["tier"])
                        child["relation"] = "contained"
                        child["reason"] = f"About {all_places[city_id]['name']}, in {place['name']}"
                        child["source_place_id"] = city_id
                        items.append(child)
        items.sort(key=lambda item: (
            item["tier"], -item["confidence"], -item["strength"],
            -int(articles.get(item["article_id"], {}).get("date", "0000-00-00").replace("-", "") or 0),
            item["article_id"],
        ))
        seen_articles = set()
        compact = []
        for item in items:
            if item["article_id"] in seen_articles:
                continue
            seen_articles.add(item["article_id"])
            row = {key: item[key] for key in (
                "article_id", "relation", "tier", "confidence", "reason", "category", "evidence", "review_status"
            )}
            source_place = all_places.get(item.get("source_place_id", place_id), place)
            row["sourcePlace"] = {
                "id": source_place["id"], "name": source_place["name"],
                "lat": source_place["lat"], "lon": source_place["lon"], "type": source_place["type"],
            }
            row["article"] = articles[item["article_id"]]
            compact.append(row)
            if len(compact) >= MAX_RESULTS_PER_PLACE:
                break
        if compact:
            results[place_id] = compact

    compact_places = []
    for place in all_places.values():
        count = len(results.get(place["id"], []))
        compact_places.append({
            "id": place["id"], "name": place["name"], "ascii": place.get("ascii", place["name"]),
            "type": place["type"], "country": place["country"], "lat": place["lat"], "lon": place["lon"],
            "adminName": place.get("adminName"),
            "population": place["population"], "aliases": place["aliases"][:8], "resultCount": count,
            "resultFile": f"/data/results/{place['id'].replace(':', '--')}.json" if count else None,
        })
    compact_places.sort(key=lambda place: (-bool(place["resultCount"]), -place["resultCount"], -place["population"], place["name"]))

    results_dir = ROOT / "public/data/results"
    results_dir.mkdir(parents=True, exist_ok=True)
    for existing in results_dir.glob("*.json"):
        existing.unlink()
    for place_id, value in results.items():
        path = results_dir / f"{place_id.replace(':', '--')}.json"
        path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")))
    outputs = {ROOT / "public/data/places.json": compact_places}
    for path, value in outputs.items():
        path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")))
    with (ROOT / "data/article-place-links.jsonl").open("w", encoding="utf-8") as handle:
        for item in sorted(links, key=lambda row: (row["article_id"], row["place_id"])):
            handle.write(json.dumps(item, ensure_ascii=False) + "\n")
    with (ROOT / "data/classification-ledger.jsonl").open("w", encoding="utf-8") as handle:
        for item in ledger:
            handle.write(json.dumps(item, ensure_ascii=False) + "\n")

    run = {
        "schemaVersion": SCHEMA_VERSION,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "inputs": {
            "corpus": {"path": str(CORPUS), "sha256": sha256(CORPUS)},
            "cities15000": {"sha256": sha256(CITIES), "license": "CC BY 4.0"},
            "countryInfo": {"sha256": sha256(COUNTRIES), "license": "CC BY 4.0"},
            "admin1CodesASCII": {"sha256": sha256(ADMINS), "license": "CC BY 4.0"},
            "curatedOverrides": {"sha256": sha256(OVERRIDES)},
            "modelRun": {
                "path": str(MODEL_RUN), "sha256": sha256(MODEL_RUN),
                "model": model_manifest.get("model") if model_manifest else None,
                "promptVersion": model_manifest.get("prompt_version") if model_manifest else None,
                "completed": model_manifest.get("completed") if model_manifest else len(MODEL_DECISIONS),
                "actualCostUsd": model_manifest.get("actual_cost_usd") if model_manifest else None,
            } if MODEL_RUN.exists() else None,
        },
        "counts": {
            "corpusArticles": len(ledger), "displayArticles": len(articles), "places": len(compact_places),
            "placesWithResults": len(results), "articlePlaceLinks": len(links), **stats,
        },
        "thresholds": {"maxResultsPerPlace": MAX_RESULTS_PER_PLACE, "supportedCities": "GeoNames cities15000"},
        "outputs": {},
        "knownGaps": [
            "Indirect entity-place relations remain candidate data pending a separate reviewed enrichment pass.",
            "Multi-item link roundups are classified at post level, not item level.",
            "Regions, neighborhoods, landmarks, and exact addresses are not yet in the local gazetteer.",
            "The canonical corpus ends 2026-07-12 and needs an incremental refresh.",
        ],
    }
    for path in [*outputs, ROOT / "data/article-place-links.jsonl", ROOT / "data/classification-ledger.jsonl"]:
        run["outputs"][str(path.relative_to(ROOT))] = {"sha256": sha256(path), "bytes": path.stat().st_size}
    run["outputs"]["public/data/results/"] = {
        "files": len(results), "bytes": sum(path.stat().st_size for path in results_dir.glob("*.json"))
    }
    (ROOT / "reproduce/run.json").write_text(json.dumps(run, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(run["counts"], indent=2))


if __name__ == "__main__":
    main()
