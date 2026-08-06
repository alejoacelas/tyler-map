# Classification specification

## Product rule

Resolve a location first. Rank articles only after the location has a stable ID, type, hierarchy, and coordinates.

## Relation tiers

1. `subject`: the article title names the place, or the article repeatedly discusses it.
2. `contained`: the article is about a city or first-level region inside the selected place.
3. `indirect` or `broader`: a sourced place tie, or a country/region article shown beneath a more specific place.
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

One-word city or region aliases next to another capitalized name are treated as people, not places, unless the article supplies a country cue. This excludes matches such as Carlos Ocaña. Ambiguous common words such as “tame” need explicit geographic syntax and repeated geographic context.

## OpenRouter passes

1. Sample the same 120 records across years, lengths, titles, and deterministic states with Gemini 2.5 Flash Lite, GPT-4.1 Nano, and DeepSeek V3.2.
2. Compare direct-place recall, evidence-span validity, schema contradictions, malformed output, and actual cost.
3. Use the selected high-recall model only on `unclassified` records. Send the title, article text, and outbound-link labels; preserve the response and usage record.
4. Accept a direct place candidate only when its evidence occurs in the supplied text and its name resolves to one GeoNames ID. Deduplicate it and leave it `validated-unreviewed` at tier 3.
5. Preserve person, work, institution, organization, and event candidates for a later search-backed enrichment pass. Do not publish inferred place ties without a source URL and excerpt.
6. Stop the run when the provider omits actual cost or the cumulative cap is reached. Never spend toward a fixed budget merely because it is available.

The top-place audit then reviews the ten strongest direct edges for each of the 100 highest-volume places with Gemini 2.5 Flash. `same_name_nonplace` and `wrong_place` verdicts remove an edge; `ambiguous` moves it to tier 4; correct-edge relevance helps order otherwise similar results. The run is resumable and retains its prompt hash, input hashes, response IDs, usage, actual cost, and failures in `data/model-runs/top-place-audit-v1/`.

Every relation records classifier version, model, prompt hash, evidence, confidence, and review state. Every request records input/output tokens and actual provider cost from the OpenRouter usage object.

## Categories

- `food`
- `places`
- `books`
- `people-ideas`
- `economics-history`
- `culture`

Categories describe the article, not the location. They may overlap in the ledger; the interface shows the strongest category first.

## Visit evidence

Visit status is a separate claim from geographic relevance. A place is `confirmed` only when Tyler describes being there in the first person or gives comparably direct autobiographical evidence. A post about a place, an itinerary he recommends, a quotation from someone else, or a bare name match is not visit evidence.

The model reviews direct article-place edges at the smallest resolved geographic unit. Each request contains bounded, article-labeled excerpts around that place's matches. It returns two independent judgments:

- whether the text genuinely discusses the resolved place rather than a homonym;
- whether the supplied text establishes that Tyler personally visited it.

Every affirmative visit retains an exact quotation and article ID. Invalid quotations and unknown article IDs are rejected after the model call. A confirmed city visit propagates to its region and country; a region visit propagates to its country. Evidence never propagates downward. Sparse city evidence is not padded with country writing, because a country visit does not establish a city visit.

The public index distinguishes `confirmed`, `discussed`, and `unknown`. `Discussed` means the place is genuinely discussed but no visit is established by the reviewed evidence. `Unknown` means the pass found neither a defensible discussion nor visit claim. Neither state means Tyler did not visit.
