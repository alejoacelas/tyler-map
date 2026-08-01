#!/usr/bin/env python3
"""Compare atlas results with an independent literal-title corpus search."""

import json
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT.parent / "2026-07-tyler-cowen-search/corpus/unified/tyler-cowen-posts.jsonl"
QUERIES = ["Brazil", "France", "Tokyo", "Mexico City", "Istanbul", "Vietnam", "Lagos", "Tbilisi", "Buenos Aires", "Reykjavik", "Georgia", "Jordan", "Paris", "San Francisco"]


def norm(value):
    value = unicodedata.normalize("NFKD", value.casefold())
    return "".join(character for character in value if not unicodedata.combining(character))


places = json.loads((ROOT / "public/data/places.json").read_text())
posts = [json.loads(line) for line in CORPUS.open()]
lines = ["# Retrieval comparison", "", "Atlas top results are compared with a separate literal search over corpus titles. A literal miss is a review candidate, not proof of atlas failure; homonyms are expected baseline noise.", ""]

for query in QUERIES:
    matches = [place for place in places if norm(query) == norm(place["name"]) or any(norm(query) == norm(alias) for alias in place["aliases"])]
    matches.sort(key=lambda place: (place["name"] != query, -place["resultCount"], -place["population"]))
    lines.extend([f"## {query}", ""])
    if not matches:
        lines.extend(["No canonical place match.", ""])
        continue
    place = matches[0]
    atlas = []
    if place["resultFile"]:
        atlas = json.loads((ROOT / "public" / place["resultFile"].lstrip("/")).read_text())
    literal = [post for post in posts if norm(query) in norm(post["title"])]
    atlas_ids = {result["article_id"] for result in atlas[:30]}
    missed = [post for post in literal if post["stable_id"] not in atlas_ids]
    lines.extend([
        f"Resolved to `{place['id']}` ({place['name']}, {place['country']}); {len(atlas)} served results; {len(literal)} literal title matches; {len(missed)} literal matches absent from the first 30.",
        "", "Atlas top five:", "",
    ])
    for result in atlas[:5]:
        lines.append(f"- {result['article']['title']} — {result['reason']}")
    if missed:
        lines.extend(["", "Literal review candidates:", ""])
        for post in missed[:5]:
            lines.append(f"- {post['title']}")
    lines.append("")

(ROOT / "reproduce/evaluation-report.md").write_text("\n".join(lines).rstrip() + "\n")
print(f"wrote {ROOT / 'reproduce/evaluation-report.md'}")
