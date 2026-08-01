<!--ai-->
# Reproduce the atlas

## Inputs

- Tyler Cowen corpus: `../../2026-07-tyler-cowen-search/corpus/unified/tyler-cowen-posts.jsonl`, SHA-256 recorded in `run.json`.
- GeoNames `cities15000.txt`, `countryInfo.txt`, and `admin1CodesASCII.txt`, downloaded from the [GeoNames dump](https://download.geonames.org/export/dump/) on 2026-08-01. GeoNames is CC BY 4.0.
- `../data/curated-overrides.json`: reviewed indirect relations and hard corrections.

`cities15000.txt` covers cities above 15,000 people plus capitals. This keeps browser suggestions small enough to search locally. Addresses and smaller places fall back to their nearest supported city in a later geocoding pass; they are not silently treated as exact matches.

## Build

```sh
python3 reproduce/build-place-index.py
```

The script writes:

- `public/data/places.json`: compact autocomplete records.
- `public/data/results/*.json`: one ranked result payload per place with evidence and displayed article fields.
- `data/article-place-links.jsonl`: the complete auditable relation ledger.
- `data/classification-ledger.jsonl`: one state and reason per corpus article.
- `reproduce/run.json`: input hashes, counts, thresholds, and output hashes.

## Checks

```sh
python3 reproduce/evaluate.py
npm test
```

The evaluation includes countries, cities, aliases, ambiguous names, indirect relations, one-result places, and no-result places. It reports failures rather than converting them into empty success. [data-gaps.md](data-gaps.md) states what the index still cannot support and the threshold for another pass.

## Model pass

The deterministic pass keeps explicit geographic references. Three OpenRouter pilots establish the cost and failure profile before a bounded model pass reviews only records with no deterministic place. Model output reaches the site only after exact evidence and GeoNames resolution; indirect entity ties remain candidates until a source-backed review. See [classification-spec.md](classification-spec.md) and [model-pilot-report.md](model-pilot-report.md).
<!--/ai-->
