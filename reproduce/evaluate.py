#!/usr/bin/env python3
"""Run deterministic place-search regression checks."""

import json
import math
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def norm(value):
    value = unicodedata.normalize("NFKD", value.casefold())
    return "".join(c for c in value if not unicodedata.combining(c))


places = json.loads((ROOT / "public/data/places.json").read_text())
queries = json.loads((ROOT / "reproduce/evaluation-queries.json").read_text())
failures = []

for case in queries:
    if case["type"] == "no-result":
        matches = [place for place in places if norm(case["query"]) in {norm(place["name"]), *(norm(alias) for alias in place["aliases"])}]
        if matches:
            failures.append({"query": case["query"], "error": f"unexpected exact match {matches[0]['name']}"})
        continue
    if case["type"] == "article-association":
        target = next((place for place in places if norm(place["name"]) == norm(case["canonical"])), None)
        results = json.loads((ROOT / "public" / target["resultFile"].lstrip("/")).read_text()) if target and target["resultFile"] else []
        if not any(norm(case["query"]) in norm(result["article"]["title"]) for result in results):
            failures.append({"query": case["query"], "error": f"not associated with {case['canonical']}"})
        continue
    matches = [place for place in places if norm(case["query"]) in {norm(place["name"]), *(norm(alias) for alias in place["aliases"])}]
    matches.sort(key=lambda place: (
        min(place.get("totalResultCount", 0), 100) * 2
        + math.log10(place.get("population", 0) + 10) * 9
        + {"country": 100, "city": 60, "admin1": 20}.get(place["type"], 0)
    ), reverse=True)
    if not matches:
        failures.append({"query": case["query"], "error": "no place match"})
        continue
    expected = case.get("canonical")
    if expected and norm(matches[0]["name"]) != norm(expected):
        failures.append({"query": case["query"], "error": f"resolved to {matches[0]['name']}"})
    if case.get("country") and matches[0]["country"] != case["country"]:
        failures.append({"query": case["query"], "error": f"resolved in {matches[0]['country']}"})
    if case["type"] in {"country", "admin1", "city"} and matches[0]["type"] != case["type"]:
        failures.append({"query": case["query"], "error": f"resolved as {matches[0]['type']}"})
    if case.get("must_have_results") and not matches[0]["resultCount"]:
        failures.append({"query": case["query"], "error": "no article results"})
    if case.get("must_include_title_term") and matches[0]["resultFile"]:
        results = json.loads((ROOT / "public" / matches[0]["resultFile"].lstrip("/")).read_text())
        if not any(norm(case["must_include_title_term"]) in norm(result["article"]["title"]) for result in results[:5]):
            failures.append({"query": case["query"], "error": "top five omit the expected title term"})
    if case.get("must_exclude_title_term") and matches[0]["resultFile"]:
        results = json.loads((ROOT / "public" / matches[0]["resultFile"].lstrip("/")).read_text())
        if any(norm(case["must_exclude_title_term"]) in norm(result["article"]["title"]) for result in results):
            failures.append({"query": case["query"], "error": "contains a known homonym false positive"})
    if case.get("must_include_relation") and matches[0]["resultFile"]:
        results = json.loads((ROOT / "public" / matches[0]["resultFile"].lstrip("/")).read_text())
        if not any(result["relation"] == case["must_include_relation"] for result in results):
            failures.append({"query": case["query"], "error": f"omits {case['must_include_relation']} results"})
    if case.get("must_have_no_direct_results") and matches[0]["resultFile"]:
        results = json.loads((ROOT / "public" / matches[0]["resultFile"].lstrip("/")).read_text())
        if any(result["sourcePlace"]["id"] == matches[0]["id"] for result in results):
            failures.append({"query": case["query"], "error": "has an unsupported direct place result"})

for place in places:
    if not place["resultFile"]:
        continue
    results = json.loads((ROOT / "public" / place["resultFile"].lstrip("/")).read_text())
    inherited_seen = False
    for result in results:
        is_direct = result["sourcePlace"]["id"] == place["id"]
        if is_direct and inherited_seen:
            failures.append({"query": place["name"], "error": "direct result follows inherited context"})
            break
        inherited_seen = inherited_seen or not is_direct
    if failures and failures[-1].get("error") == "direct result follows inherited context":
        break

report = {"queries": len(queries), "checked": len(queries), "failures": failures}
print(json.dumps(report, indent=2, ensure_ascii=False))
sys.exit(bool(failures))
