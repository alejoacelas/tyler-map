# Tyler atlas decisions

This archived project retains its implementation and evidence for reuse. Its saved
results do not establish that the deployed services still run.

## Core decisions

### Source integrity

- [Derive from the sibling canonical corpus without rewriting it](#decision-1).

### Geographic meaning

- [Resolve stable places before ranking text](#decision-2).
- [Require source evidence before admitting model or indirect relations](#decision-3).
- [Separate personal visits from discussion of a place](#decision-4).

### Retrieval and publication

- [Prioritize direct results over broader geographic context](#decision-5).
- [Publish derived static payloads with visible coverage limits](#decision-6).

## Details

<a id="decision-1"></a>

### Derive from the sibling canonical corpus without rewriting it

Keep the search and atlas repositories as siblings because the build resolves the corpus there. Input hashes and classification ledgers preserve source lineage; excluded, partial and unclassified articles remain auditable. See [scripts/build-place-index.py](scripts/build-place-index.py).

<a id="decision-2"></a>

### Resolve stable places before ranking text

GeoNames IDs distinguish countries, first-level regions and cities before retrieval. Region points are population-weighted city centroids, not boundary centroids; unsupported addresses and small places must not become exact matches by guesswork. See [docs/classification-spec.md](docs/classification-spec.md).

<a id="decision-3"></a>

### Require source evidence before admitting model or indirect relations

Use deterministic extraction first. Model candidates need exact source evidence and GeoNames resolution; indirect entity ties remain candidates until reviewed with a source. The top-place audit removes false homonym matches before display. See [technical-decisions.md](technical-decisions.md).

<a id="decision-4"></a>

### Separate personal visits from discussion of a place

Affirmative visits require first-person presence evidence and the stricter audit. Propagate confirmed child visits upward only, never from a country to its cities; retain confirmed, discussed and unknown states explicitly. See [scripts/classify-place-visits.mjs](scripts/classify-place-visits.mjs).

<a id="decision-5"></a>

### Prioritize direct results over broader geographic context

Exact subjects lead, then contained and broader context, then mentions; audited relevance breaks ties. This preserves useful local reading instead of allowing high-volume country material to overwhelm a city query. See [technical-decisions.md](technical-decisions.md).

<a id="decision-6"></a>

### Publish derived static payloads with visible coverage limits

The site consumes bounded precomputed JSON, not an independent copy of the corpus. Keep evaluation failures and no-result places visible; do not turn errors into empty success or claim the recorded model pass recovered all geography. See [docs/data-gaps.md](docs/data-gaps.md). History inspected: [d5583d4](https://github.com/alejoacelas/tyler-map/commit/d5583d4).
