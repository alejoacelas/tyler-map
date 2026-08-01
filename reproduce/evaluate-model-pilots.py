#!/usr/bin/env python3
"""Measure OpenRouter pilot reliability without treating deterministic labels as ground truth."""

import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT.parent / "2026-07-tyler-cowen-search/corpus/unified/tyler-cowen-posts.jsonl"

posts = {row["stable_id"]: row for row in (json.loads(line) for line in CORPUS.open())}
direct = defaultdict(list)
for line in (ROOT / "data/article-place-links.jsonl").open():
    row = json.loads(line)
    if row["classifier"] == "deterministic-v1" and row["tier"] <= 2:
        direct[row["article_id"]].append(row)
ledger = {row["article_id"]: row for row in (json.loads(line) for line in (ROOT / "data/classification-ledger.jsonl").open())}

rows = []


def normalized(value):
    value = unicodedata.normalize("NFKD", value.casefold())
    value = "".join(character for character in value if not unicodedata.combining(character))
    return " ".join(re.findall(r"[\w]+", value))


for run_dir in sorted((ROOT / "data/model-runs").glob("pilot-*")):
    path = run_dir / "decisions.jsonl"
    if not path.exists():
        continue
    decisions = [json.loads(line) for line in path.open()]
    valid_evidence = 0
    evidence_count = 0
    contradictions = 0
    direct_hits = 0
    direct_total = 0
    new_candidates = 0
    for row in decisions:
        decision = row["decision"]
        post = posts[row["article_id"]]
        haystack = normalized(" ".join([post["title"], post.get("text") or "", *[link.get("text") or "" for link in post.get("links") or []]]))
        outputs = [*decision["geographic_evidence"], *decision["entities"]]
        for output in outputs:
            evidence_count += 1
            if normalized(output["evidence"]) in haystack:
                valid_evidence += 1
        empty = not decision["geographic_evidence"] and not decision["entities"]
        bad_reason = (decision["no_evidence"] and decision["negative_reason"] is None) or (not decision["no_evidence"] and decision["negative_reason"] is not None)
        if decision["no_evidence"] != empty or bad_reason:
            contradictions += 1
        if direct[row["article_id"]]:
            direct_total += 1
            if decision["geographic_evidence"]:
                direct_hits += 1
        if ledger[row["article_id"]]["state"] in {"unclassified", "model_classified"} and outputs:
            new_candidates += 1
    historical_failures = sum(1 for _ in (run_dir / "failures.jsonl").open()) if (run_dir / "failures.jsonl").exists() else 0
    manifest = json.loads((run_dir / "manifest.json").read_text()) if (run_dir / "manifest.json").exists() else {}
    failures = manifest.get("failed", historical_failures)
    rows.append({
        "run": run_dir.name, "model": decisions[0]["model"] if decisions else "unknown", "completed": len(decisions), "failures": failures,
        "cost": sum(item["cost"] for item in decisions),
        "evidence_validity": valid_evidence / evidence_count if evidence_count else 1,
        "direct_candidate_recall": direct_hits / direct_total if direct_total else 1,
        "contradictions": contradictions, "new_candidates": new_candidates, "historical_failures": historical_failures,
    })

output = [
    "# OpenRouter pilot evaluation", "",
    "The deterministic extractor is a comparison leg, not ground truth. `Direct recall` asks whether a model returned any direct geography for records where the conservative extractor had a tier 1–2 edge. `Evidence validity` checks the normalized claimed span against the supplied article and link labels. `Contradictions` includes mismatches between evidence arrays, `no_evidence`, and `negative_reason`.", "",
    "`Failed` is the final resumable-run count; historical transient attempts remain in each failure ledger.", "",
    "| Run | Completed | Failed | Historical failed attempts | Cost | Direct recall | Evidence validity | Contradictions | New candidates |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
]
for row in rows:
    output.append(f"| {row['run']} | {row['completed']} | {row['failures']} | {row['historical_failures']} | ${row['cost']:.4f} | {row['direct_candidate_recall']:.1%} | {row['evidence_validity']:.1%} | {row['contradictions']} | {row['new_candidates']} |")
output.extend([
    "", "## Decision", "",
    "Gemini 2.5 Flash Lite is the full-pass candidate extractor. It surfaced the most new candidates in the shared sample at $0.0175, but nine malformed outputs and 27 schema contradictions make its labels unsuitable as final data. The production gate therefore resolves place names against GeoNames, verifies normalized evidence, requires the place or an accepted demonym inside that evidence, deduplicates edges, rejects incidental or low-centrality claims, and fixes accepted links at tier 3.", "",
    "DeepSeek V3.2 produced the cleanest evidence spans but three final failures and fewer new candidates. GPT-4.1 Nano completed after retries at the lowest cost, but its evidence validity and direct recall were lowest. Neither improves the product enough to replace the validation gate.",
])
(ROOT / "reproduce/model-pilot-report.md").write_text("\n".join(output) + "\n")
print(json.dumps(rows, indent=2))
