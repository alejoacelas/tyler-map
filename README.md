# Tyler Cowen Atlas

Search or select a place, then read Tyler Cowen’s writing about it. Countries, first-level regions, and cities are resolved before articles are ranked, so `Georgia`, `Utah`, `Paris`, and `Turkey` have stable geographic meanings. The “Tyler visited” control filters search and the map to places supported by first-person evidence. Map dot size encodes reading count.

Live site: [tyler-map.vercel.app](https://tyler-map.vercel.app)

## What is here

- `app/`: the search-first website and public evaluation endpoint.
- `public/data/`: the derived place index served by the site.
- `data/`: manual overrides and review data.
- `REPLICATE.md`: construction history and source lineage.
- `scripts/`, `docs/`, and `tests/`: rebuild scripts, classification methods, checks, and gaps.
- [`technical-decisions.md`](technical-decisions.md): one overview of corpus acquisition, cleaning, place resolution, model audits, hierarchy, ranking, interface, and remaining gaps.

The canonical article corpus remains in `../2026-07-tyler-cowen-search/corpus/unified/tyler-cowen-posts.jsonl`. This project derives links from it; it does not fork or rewrite it.

## Reproduce

```sh
python3 scripts/build-place-index.py
npm test
```

The first command combines deterministic extraction, validated direct-place candidates, the recorded top-location audit, and the recorded visit ledger. Indirect relations such as a person’s origin remain review candidates until they have a source.
