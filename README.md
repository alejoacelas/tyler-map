<!--ai-->
# Tyler Cowen Atlas

Search a place, then read Tyler Cowen’s writing about it. Countries and cities are resolved before articles are ranked, so `Georgia`, `Paris`, and `Turkey` have stable geographic meanings.

## What is here

- `app/`: the search-first website and public evaluation endpoint.
- `public/data/`: the derived place index served by the site.
- `data/`: manual overrides and review data.
- `reproduce/`: the classification method, scripts, source lineage, checks, and gaps.

The canonical article corpus remains in `../2026-07-tyler-cowen-search/corpus/unified/tyler-cowen-posts.jsonl`. This project derives links from it; it does not fork or rewrite it.

## Reproduce

```sh
python3 reproduce/build-place-index.py
npm test
```

The first command combines a deterministic high-precision pass with validated direct-place candidates from the recorded OpenRouter run. Indirect relations such as a person’s origin remain review candidates until they have a source.
<!--/ai-->
