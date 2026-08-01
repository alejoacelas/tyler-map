<!--ai-->
# Classification specification

## Product rule

Resolve a location first. Rank articles only after the location has a stable ID, type, hierarchy, and coordinates.

## Relation tiers

1. `subject`: the article title names the place, or the article repeatedly discusses it.
2. `contained`: the article is about a city inside the selected country.
3. `indirect`: a work, person, institution, or historical event has a strong place tie.
4. `mention`: one explicit reference with no stronger evidence.

Distance ranks points within a metro area. Containment ranks countries and regions. A fabricated centroid never turns a country-wide relation into a precise pin.

## Conservative exclusion

The deterministic pass excludes an article from place results only when it has no recognized country or supported city phrase. It does not infer that the article has no geographic tie. Each such row remains `unclassified:no_explicit_place` for later model review.

Ambiguous names require one of:

- a title match;
- two body mentions;
- a country or geographic cue in the same article;
- a reviewed override.

Common-word city aliases under four characters are ignored. A single mention in a link roundup stays `mention` and cannot outrank direct writing.

## OpenRouter passes

1. Sample the same 120 records across years, lengths, titles, and deterministic states with Gemini 2.5 Flash Lite, GPT-4.1 Nano, and DeepSeek V3.2.
2. Compare direct-place recall, evidence-span validity, schema contradictions, malformed output, and actual cost.
3. Use the selected high-recall model only on `unclassified` records. Send the title, article text, and outbound-link labels; preserve the response and usage record.
4. Accept a direct place candidate only when its evidence occurs in the supplied text and its name resolves to one GeoNames ID. Deduplicate it and leave it `validated-unreviewed` at tier 3.
5. Preserve person, work, institution, organization, and event candidates for a later search-backed enrichment pass. Do not publish inferred place ties without a source URL and excerpt.
6. Stop the run when the provider omits actual cost or the cumulative cap is reached. Never spend toward a fixed budget merely because it is available.

Every relation records classifier version, model, prompt hash, evidence, confidence, and review state. Every request records input/output tokens and actual provider cost from the OpenRouter usage object.

## Categories

- `food`
- `places`
- `books`
- `people-ideas`
- `economics-history`
- `culture`

Categories describe the article, not the location. They may overlap in the ledger; the interface shows the strongest category first.
<!--/ai-->
