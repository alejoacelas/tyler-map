<!--ai-->
# How the Tyler Cowen Atlas was built

## Summary

The atlas turns 34,345 Tyler Cowen posts into an inspectable place index:

1. Assemble one canonical corpus from MRposts metadata, Common Crawl, the Internet Archive, live-site fallbacks, and the `marginalrevolution` Telegram RSS archive.
2. Preserve source evidence and gaps instead of treating missing bodies as recovered text.
3. Resolve geographic phrases against stable GeoNames IDs for countries, first-level regions, and cities.
4. Use conservative deterministic rules first; run model passes only where they add recall or review high-impact matches.
5. Build country → region → city containment so broader writing appears below exact local results.
6. Rank exact subjects first, then contained and broader context, then mentions. Audit relevance breaks ties.
7. Classify personal visits separately from place relevance, audit every affirmative claim, and propagate visits only up the geographic hierarchy.
8. Publish static place and result payloads. Search runs locally in the browser; the map clusters the same records without a separate geographic database.

| Stage | Input | Output | Main decision |
|---|---:|---:|---|
| Corpus | Several historical and modern archives | 34,345 posts | Preserve provenance and incomplete records |
| Gazetteer | GeoNames countries, regions, and cities | 37,080 searchable places | Resolve locations before ranking articles |
| Deterministic classification | Titles and cleaned bodies | 18,006 classified posts | Prefer precision; keep misses in a ledger |
| Recall pass | 14,562 initially unclassified records | 817 currently model-classified posts | Accept only source-verifiable, GeoNames-resolved evidence |
| Top-place audit | Repeated top-ten edges for 100 high-volume places | 1,968 reviewed edges | Remove homonyms before they reach users |
| Visit classification | Direct article evidence for 2,300 places | 321 audited direct visits; 463 places after upward propagation | Require first-person physical-presence evidence |
| Published index | Accepted and inherited edges | 2,538 places with results; 41,997 article–place edges | Precompute bounded JSON payloads for a fast static site |

The current build, input hashes, costs, thresholds, and output hashes are in [`reproduce/run.json`](reproduce/run.json). Record-level decisions are in [`data/classification-ledger.jsonl`](data/classification-ledger.jsonl) and [`data/article-place-links.jsonl`](data/article-place-links.jsonl).

## 1. Corpus acquisition

The atlas consumes the canonical corpus from the sibling `2026-07-tyler-cowen-search` project. It does not crawl or rewrite Marginal Revolution during an atlas build.

### Historical posts

- Ben Davies’s CC0 MRposts dataset supplied the historical URL, author, title, date, and category manifest.
- Common Crawl supplied most historical bodies. The process cached index responses and capture locations before downloading content.
- The Internet Archive, live pages, and search-index recovery filled gaps and permalink collisions.
- Captures retained source collection, timestamp, author evidence, content hash, links, and parser warnings.

### Modern posts

- Author pages and archived individual pages covered the August 2023–July 2024 gap.
- The `marginalrevolution` Telegram RSS archive supplied July 2024-forward posts, with archived URL recovery where necessary.
- Candidate posts were accepted only with Tyler author evidence. Unresolved candidates remain in audit files.

### Resulting coverage

| Window | Known Tyler identities | Complete text | Partial text | Title only |
|---|---:|---:|---:|---:|
| Historical manifest | 29,882 | 29,783 | 10 | 89 |
| August 2023–July 2024 gap | 1,522 | 1,502 | 19 | 1 |
| July 2024-forward Telegram feed | 2,935 | 2,935 | 0 | 0 |

The unified corpus contains 34,345 records: 34,226 complete captures, 29 partial indexed snippets, and 90 title-only placeholders. Reused historical URLs retain distinct stable records, so 34,345 records correspond to 34,333 canonical URLs.

The upstream acquisition scripts and record-level audits are documented in [`../2026-07-tyler-cowen-search/corpus/README.md`](../2026-07-tyler-cowen-search/corpus/README.md). Its final artifact is `corpus/unified/tyler-cowen-posts.jsonl`.

## 2. Corpus normalization and cleaning

Each unified record has a stable ID, canonical URL, title, publication date, author evidence, plain text, preserved outbound links, source label, content hash, and parser warnings.

The atlas performs a deliberately small second cleaning pass:

- trim whitespace and the known trailing `The post` residue;
- label empty captures and boilerplate-only fragments `empty_or_residue`;
- label bodies under 100 characters `short`;
- label the rest `usable`;
- normalize matching text with Unicode decomposition, diacritic removal, case folding, and word-token extraction;
- retain the original article text and evidence excerpt for display and audit.

No record is deleted because it lacks geographic evidence. Every post receives a classification-ledger row with its body state, candidate count, classifier, and reason. The current ledger contains 33,404 usable, 794 short, and 147 empty-or-residue bodies.

## 3. Geographic vocabulary

The atlas uses the CC BY 4.0 GeoNames dumps:

- `countryInfo.txt` for countries;
- `admin1CodesASCII.txt` for states, departments, provinces, and equivalent first-level regions;
- `cities15000.txt` for cities above roughly 15,000 people and capitals.

Every place gets a canonical ID:

- `country:tr`
- `admin1:us.ut`
- `geonames:745044`

Countries use capital coordinates. Cities use GeoNames coordinates. Region points are population-weighted centroids of their supported cities; they are navigation points, not claims about exact geographic centers.

Aliases include Unicode and ASCII names, selected historical names such as Saigon, country variants such as Türkiye, and US state abbreviations. An alias resolves to one canonical place before any article ranking happens. Countries win true country-name collisions. National or regional capitals win same-named region collisions such as Tokyo and Mexico City. Otherwise a first-level region beats an unrelated small same-named city, as with Virginia.

## 4. Deterministic article–place classification

The first pass scans title and body phrases of up to six words against the alias index. It assigns one strongest edge per article/place pair:

| Evidence | Relation | Tier | Starting confidence |
|---|---|---:|---:|
| Place in title | `subject` | 1 | 0.98 |
| At least two body mentions | `subject` | 2 | 0.90 |
| One defensible mention | `mention` | 4 | 0.62 |

Travel-series title phrases such as `notes`, `advice`, `guide`, `food in`, and `my favorite things` add strength within a tier.

### Homonym controls

Names are not treated as places merely because they occur in GeoNames:

- one-word city and region aliases must preserve geographic capitalization;
- a one-word match found only inside a longer recognized place name is discarded, so `Beverly Hills` does not also match Beverly, Massachusetts;
- ambiguous words require a geographic title construction or repeated body mentions plus a geographic cue;
- low-population one-word cities need a title-level geographic construction or a country cue;
- a place alias next to another capitalized name is treated as a person unless the title itself supplies the relevant country;
- known country collisions reject phrases such as `Michael Jordan`, `Georgia Tech`, and `New Jersey` from the wrong country;
- an explicit ambiguous-name list covers recurring failures such as `tame`, `reading`, `nice`, `tyler`, `university`, `western`, and `central`.

These rules remove the reported Carlos Ocaña → Ocaña and `tame` → Tame errors before ranking.

## 5. Model-assisted recall

The deterministic pass is the precision baseline, not proof that an unclassified post has no place tie.

Three 120-record OpenRouter pilots compared Gemini 2.5 Flash Lite, GPT-4.1 Nano, and DeepSeek V3.2. Gemini Flash Lite found the most new candidates; DeepSeek produced slightly cleaner evidence; GPT Nano had lower recall and evidence validity. The full recall run therefore used Flash Lite behind a deterministic validation gate.

The full pass processed 14,562 initially unclassified records for $2.35. It extracted direct place evidence and central entities, but only direct place candidates could enter the public index. An edge survived only if:

- its evidence was an exact normalized span of the supplied title, body, or link labels;
- its place name resolved to one GeoNames candidate;
- the evidence named that place or an accepted country demonym;
- centrality was at least 0.55;
- the relation was not incidental;
- low-population and ambiguous-name gates also passed.

Accepted model edges start at tier 3 and cannot outrank title or repeated-body evidence. Person, book, institution, organization, and event associations remain candidate data unless a source-backed curated override exists.

## 6. High-impact model audit

A second pass used Gemini 2.5 Flash to judge the strongest direct edges for the 100 highest-volume places. It returned one of:

- `correct_place`
- `same_name_nonplace`
- `wrong_place`
- `ambiguous`

The audit was iterative: removing a false top-ten edge reveals the next candidate, which was then reviewed. This produced 1,968 unique edge decisions for $0.92. Across those decisions, the model labeled 1,116 correct, 410 wrong-place, 435 non-place homonyms, and 7 ambiguous. The current build applies the subset whose article/place pairs still exist after deterministic cleanup: 1,047 correct, 162 wrong-place, 146 non-place, and 4 ambiguous.

Wrong-place and non-place verdicts delete the edge. Ambiguous edges move to tier 4 with confidence capped at 0.5. Correct edges retain a 0–1 audit relevance score that helps order otherwise similar results. All prompts, hashes, response IDs, usage, costs, decisions, and failures remain in [`data/model-runs/top-place-audit-v1/`](data/model-runs/top-place-audit-v1/).

The recorded model cost for pilots, the full recall pass, and the top-place audit is about $3.32.

## 7. Geographic hierarchy

Direct article/place edges are expanded after classification:

- a country inherits tier 1–2 writing about its regions and cities as `contained`;
- a region inherits tier 1–2 writing about its cities as `contained`;
- a region with local results receives up to ten strong country articles as `broader` context;
- a city with local results receives up to ten strong region articles and eight strong country articles as `broader` context.

Broader material is never used to manufacture coverage for an otherwise empty city or region. This is why Bogotá can show Colombia context, while an unsupported city does not appear to have exact articles.

## 8. Categories and ranking

Each article receives one display category from token overlap in its title and first 2,500 body characters:

- food
- places
- books
- people and ideas
- economics and history
- culture

The result order is deterministic:

1. direct evidence for the selected place before inherited regional or national context;
2. relation tier;
3. audited relevance;
4. confidence;
5. evidence strength;
6. publication date;
7. stable article ID.

Results are deduplicated by article and capped at 120 per place. The first tier-1 result is marked “Start here.” Category filters do not rerun ranking; they filter the place’s ordered payload. There is no hidden semantic reranker or diversity penalty in the current product.

## 9. Search, map, and delivery

The browser downloads one compact place index. Autocomplete ranks exact names and aliases before prefixes and substrings, then uses result count, population, and a type preference to settle collisions. Countries and cities outrank same-named administrative regions while all candidates remain visible.

The “Tyler visited” control filters both autocomplete and map coverage. A Gemini 2.5 Flash pass reviewed up to 60 travel-prioritized article excerpts per directly linked place. A separate Gemini 2.5 Pro pass received independently retrieved titles and source context for all 386 proposed positives. It retained 321, rejected 47 insufficient inferences, 13 wrong-speaker or wrong-place cases, and five future plans. Model-returned citations are replaced with the matching source quotation and article ID; an unmatched citation rejects the claim. Confirmed child places propagate upward, producing 463 searchable places. No evidence propagates downward, and `discussed` or `unknown` never means Tyler did not visit.

The map uses MapLibre for the raster basemap and navigation. Coverage markers use Supercluster in the main browser thread and MapLibre DOM markers because the original worker-backed GeoJSON layer received 2,564 features but rendered none in production. At each zoom:

- cluster labels show the number of locations;
- cluster area scales with the number of locations;
- individual dot area scales with reading count;
- clicking a cluster zooms to its children;
- clicking a place loads its ranked readings.

Desktop keeps the article list and map side by side. Mobile opens on the article list and provides a full-screen Map/Readings toggle.

The build writes static JSON rather than requiring a production database:

- [`public/data/places.json`](public/data/places.json): autocomplete, hierarchy, coordinates, counts, and map metadata;
- `public/data/results/*.json`: one bounded ranked payload per place;
- [`data/article-place-links.jsonl`](data/article-place-links.jsonl): accepted edge ledger;
- [`data/classification-ledger.jsonl`](data/classification-ledger.jsonl): one classification state per corpus record.

The site is a standard Next.js application deployed publicly on Vercel. The production site requires no database or runtime secrets.

## 10. Evaluation and remaining gaps

The deterministic regression suite covers countries, regions, cities, aliases, hierarchy, indirect associations, ambiguous names, the Ocaña and Tame failures, and no-result cases. The current 20 cases pass, as do the production build, rendered-page tests, lint, desktop browser checks, and mobile browser checks.

Important gaps remain:

- the corpus ends on 2026-07-12 and needs incremental acquisition;
- link roundups are classified at post level rather than outbound-item level;
- neighborhoods, landmarks, smaller settlements, and exact addresses are not independent search targets;
- entity-to-place associations such as a person’s origin are intentionally sparse because they require source-backed enrichment;
- most lower-volume deterministic edges have not received the top-place model audit;
- categories are lexical and single-label, not a human-reviewed taxonomy.

Run the pipeline with:

```sh
python3 reproduce/build-place-index.py
python3 reproduce/evaluate.py
npm test
npm run lint
```

More detailed method files remain in [`reproduce/`](reproduce/), but this document is the single overview of the system and its main decisions.
<!--/ai-->
