#!/usr/bin/env python3
"""Run deterministic place-search regression checks."""

import json
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
    if case["type"] in {"no-result", "unsupported-region"}:
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
    if not matches:
        failures.append({"query": case["query"], "error": "no place match"})
        continue
    expected = case.get("canonical")
    if expected and norm(matches[0]["name"]) != norm(expected):
        failures.append({"query": case["query"], "error": f"resolved to {matches[0]['name']}"})
    if case.get("country") and matches[0]["country"] != case["country"]:
        failures.append({"query": case["query"], "error": f"resolved in {matches[0]['country']}"})
    if case.get("must_have_results") and not matches[0]["resultCount"]:
        failures.append({"query": case["query"], "error": "no article results"})
    if case.get("must_include_title_term") and matches[0]["resultFile"]:
        results = json.loads((ROOT / "public" / matches[0]["resultFile"].lstrip("/")).read_text())
        if not any(norm(case["must_include_title_term"]) in norm(result["article"]["title"]) for result in results[:5]):
            failures.append({"query": case["query"], "error": "top five omit the expected title term"})

report = {"queries": len(queries), "checked": len(queries), "failures": failures}
print(json.dumps(report, indent=2, ensure_ascii=False))
sys.exit(bool(failures))
