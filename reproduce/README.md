<!--ai-->
# Reproduce the atlas

## Inputs

- Tyler Cowen corpus: `../../2026-07-tyler-cowen-search/corpus/unified/tyler-cowen-posts.jsonl`, SHA-256 recorded in `run.json`.
- GeoNames `cities15000.txt`, `countryInfo.txt`, and `admin1CodesASCII.txt`, downloaded from the [GeoNames dump](https://download.geonames.org/export/dump/) on 2026-08-01. GeoNames is CC BY 4.0.
- `../data/curated-overrides.json`: reviewed indirect relations and hard corrections.

`cities15000.txt` covers cities above 15,000 people plus capitals. `admin1CodesASCII.txt` adds states, departments, provinces, and equivalent first-level regions; their map points are population-weighted city centroids, not boundary centroids. Addresses and smaller places are not silently treated as exact matches.

## Build

```sh
node --env-file=.env reproduce/classify-place-visits.mjs
node --env-file=.env reproduce/audit-place-visits.mjs
node --env-file=.env reproduce/classify-place-visits.mjs
python3 reproduce/build-place-index.py
```

The first visit pass reviews all 2,300 places with direct article evidence, independently classifying genuine discussion and personal presence. The audit rechecks every affirmative visit under a stricter prompt. The second invocation rebuilds `data/place-visits.jsonl` from the completed audit, propagating confirmed child visits upward but never downward. All 37,080 places retain an explicit `confirmed`, `discussed`, or `unknown` state.

The script writes:

- `public/data/places.json`: compact autocomplete records.
- `public/data/results/*.json`: one ranked result payload per place with evidence and displayed article fields.
- `data/article-place-links.jsonl`: the complete auditable relation ledger.
- `data/classification-ledger.jsonl`: one state and reason per corpus article.
- `data/place-visits.jsonl`: one visit state per place with source evidence for affirmative claims.
- `reproduce/run.json`: input hashes, counts, thresholds, and output hashes.

## Checks

```sh
python3 reproduce/evaluate.py
npm test
```

The evaluation includes countries, regions, cities, aliases, ambiguous names, hierarchy, indirect relations, visit-state propagation, one-result places, homonym exclusions, and no-result places. It reports failures rather than converting them into empty success. [data-gaps.md](data-gaps.md) states what the index still cannot support and the threshold for another pass.

## Model pass

The deterministic pass keeps explicit geographic references. Three OpenRouter pilots establish the cost and failure profile before a bounded model pass reviews records with no deterministic place. A second Gemini 2.5 Flash pass audits up to ten direct edges for each of the 100 highest-volume places; its verdict removes false matches and its relevance score breaks ranking ties. Model output reaches the site only after exact evidence and GeoNames resolution; indirect entity ties remain candidates until a source-backed review. See [classification-spec.md](classification-spec.md) and [model-pilot-report.md](model-pilot-report.md).
<!--/ai-->
