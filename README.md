<!--ai-->
# Tyler Cowen Atlas

Search or select a place, then read Tyler Cowen’s writing about it. Countries, first-level regions, and cities are resolved before articles are ranked, so `Georgia`, `Utah`, `Paris`, and `Turkey` have stable geographic meanings. Map dot size encodes reading count.

Live site: [tyler-map.vercel.app](https://tyler-map.vercel.app)

## What is here

- `app/`: the search-first website and public evaluation endpoint.
- `public/data/`: the derived place index served by the site.
- `data/`: manual overrides and review data.
- `reproduce/`: the classification method, scripts, source lineage, checks, and gaps.
- [`technical-decisions.md`](technical-decisions.md): one overview of corpus acquisition, cleaning, place resolution, model audits, hierarchy, ranking, interface, and remaining gaps.

The canonical article corpus remains in `../2026-07-tyler-cowen-search/corpus/unified/tyler-cowen-posts.jsonl`. This project derives links from it; it does not fork or rewrite it.

## Reproduce

```sh
python3 reproduce/build-place-index.py
npm test
```

The first command combines deterministic extraction, validated direct-place candidates, and the recorded top-location audit. Indirect relations such as a person’s origin remain review candidates until they have a source.
<!--/ai-->
