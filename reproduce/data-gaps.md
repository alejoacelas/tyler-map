<!--ai-->
# Data gaps

The ledgers preserve every decision. `data/classification-ledger.jsonl` has one row per corpus article; `data/article-place-links.jsonl` has every accepted article–place edge with its classifier, evidence, confidence, tier, and review state. The model run directories retain decisions, failures, token use, actual cost, prompt version, and input hashes.

## Known gaps

- The source corpus ends 2026-07-12. New posts need an incremental crawl and the same passes.
- Link roundups are indexed at article level. A city mentioned in one outbound item can inherit the roundup title and date; item-level segmentation remains future work.
- GeoNames covers countries, first-level regions, capitals, and cities above roughly 15,000 people. Region points are population-weighted city centroids. Neighborhoods, landmarks, and smaller settlements are not yet independent search targets.
- Exact addresses are not geocoded. A query containing a supported city resolves to that city; the interface does not claim an exact pin.
- Model-extracted people, books, institutions, organizations, and events remain candidate data. No inferred entity–place edge is published without a source-backed enrichment review.
- Country demonyms are validated from a small explicit list. Unlisted demonyms remain unclassified instead of being guessed.

## Exclusions

- Empty captures and boilerplate stay in the ledger as `empty_or_residue_body`; they are not deleted.
- A deterministic miss is `unclassified:no_explicit_place`, not “not geographic.”
- Ambiguous names need stronger context. `Jordan` attached to a person, `Georgia Tech`, lowercase `turkey`, and short common-word city aliases are rejected.
- Model candidates fail closed when their quoted evidence is absent, their place name cannot resolve to GeoNames, the evidence names neither the place nor an accepted demonym, centrality is below 0.55, or the relation is incidental.
- Validated model edges start at tier 3 and cannot outrank title or repeated-body evidence.
- The top-place audit covers 100 locations and ten direct edges per location. Lower-volume deterministic edges remain unaudited unless a rule or regression case excludes them.

## What to measure next

Review a stratified sample of accepted and rejected model candidates. The next pass is justified when the lower bound of accepted precision remains above 98% and a rejected-sample audit shows recoverable geographic recall above two percentage points. Otherwise, improve the resolver before buying more inference.
<!--/ai-->
