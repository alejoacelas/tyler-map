# OpenRouter pilot evaluation

The deterministic extractor is a comparison leg, not ground truth. `Direct recall` asks whether a model returned any direct geography for records where the conservative extractor had a tier 1–2 edge. `Evidence validity` checks the normalized claimed span against the supplied article and link labels. `Contradictions` includes mismatches between evidence arrays, `no_evidence`, and `negative_reason`.

`Failed` is the final resumable-run count; historical transient attempts remain in each failure ledger.

| Run | Completed | Failed | Historical failed attempts | Cost | Direct recall | Evidence validity | Contradictions | New candidates |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| pilot-deepseek-v32-120 | 117 | 3 | 3 | $0.0221 | 87.1% | 99.6% | 12 | 49 |
| pilot-flash-lite-120 | 111 | 9 | 9 | $0.0175 | 86.7% | 99.0% | 27 | 55 |
| pilot-gpt-nano-120 | 120 | 0 | 98 | $0.0112 | 75.8% | 92.9% | 13 | 19 |

## Decision

Gemini 2.5 Flash Lite is the full-pass candidate extractor. It surfaced the most new candidates in the shared sample at $0.0175, but nine malformed outputs and 27 schema contradictions make its labels unsuitable as final data. The production gate therefore resolves place names against GeoNames, verifies normalized evidence, requires the place or an accepted demonym inside that evidence, deduplicates edges, rejects incidental or low-centrality claims, and fixes accepted links at tier 3.

DeepSeek V3.2 produced the cleanest evidence spans but three final failures and fewer new candidates. GPT-4.1 Nano completed after retries at the lowest cost, but its evidence validity and direct recall were lowest. Neither improves the product enough to replace the validation gate.
