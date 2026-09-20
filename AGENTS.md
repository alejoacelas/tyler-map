---
agent_context:
  version: 1
  groups:
  - once
  visibility: public
---
<!-- agent-context:begin sha256=cc3aa932e2bd95352d2ae412c60a17264af80a3adcfd45268b71f3ebdaac0808 -->
<!-- shared group: once -->
# One-off projects

- Name each folder `YYYY-MM-project-name`; separate words with dashes.
- Give every one-off its own Git repository and GitHub remote when creating it.
- Make it public unless it contains employer information, others' private information, or credentials.
- Give its `AGENTS.md` one to three sentences stating its scope or goal and declare the `once` group.
- Make `CLAUDE.md` contain `@AGENTS.md`.
- Follow the current workspace archive rules. Keep consequential archive placement and retention constraints in the archive's `DECISIONS.md`; Git preserves move history.
<!-- agent-context:end -->

<!-- stripe-projects-cli managed:agents-md:start -->
## Stripe Projects CLI

This repository is initialized for the Stripe project "2026-08-tyler-cowen-map".

## Tools used

- [Stripe CLI](https://docs.stripe.com/stripe-cli) with the `projects` plugin to manage third-party services, credentials, and deployments for this project. Use the stripe-projects-cli to manage deploying and access to third party services.
<!-- stripe-projects-cli managed:agents-md:end -->

Build a location-first atlas over the canonical Tyler Cowen corpus. Keep every article-place relation auditable, expose uncertainty, and never discard excluded or unclassified records.

<!-- stripe-projects-cli managed:claude-md:start -->
look at AGENTS.md for your rules
<!-- stripe-projects-cli managed:claude-md:end -->
