# Contributing

Languages: [繁體中文](../CONTRIBUTING.md) · [English](CONTRIBUTING.en.md)

This is an internal laboratory meals system. Bug fixes, tests, and documentation are welcome — please match the current tree before you start.

## Before you edit

1. Read [`.cursorrules`](../.cursorrules) and [`AGENTS.md`](../AGENTS.md) §1–2.
2. Use `AGENTS.md` §3 to find the files for this change. Do **not** scan the whole repository first.
3. If the work touches architecture, flows, data contracts, or routes, open the matching file in [`SPEC/`](../SPEC/README.md).

When they disagree, **code wins**, then SPEC is updated to match. Product intent lives in [`PLAN/plan_initial.md`](../PLAN/plan_initial.md); this round’s revisions are in [`PLAN/AEPARC_EAT_Revise_1.md`](../PLAN/AEPARC_EAT_Revise_1.md).

## Conventions

| Topic | Rule |
| --- | --- |
| Comments and maintainer errors | Traditional Chinese; no Simplified phrasing, no mainland-China wording |
| Variables / functions | `snake_case` |
| Classes / types | `PascalCase` |
| Route paths | kebab-case |
| Date / time | `YYYY-MM-DD`, `HH:MM:SS`, Asia/Taipei |
| Money | `*_cents` in the database; yuan in the JSON API |
| File size | split near 300 lines; hard limit 500 |
| Text files | LF (see `.gitattributes`) |

User-visible copy lives in `src/bot/strings.ts`: **Traditional Chinese and English together**. Missing one side fails the type check.

## Please do not

- Hard-code secrets, tokens, passwords, or absolute machine paths
- Commit `.env`, credentials, or database dumps
- Copy code, package layout, or architecture from the neighbouring `AIPAR-ordering-system` (the research repo `AIPAR-ordering-system-sesearch` is fair to read; it is not the product)
- Call an LLM with a guessed model ID
- Drop the human confirm step on menu drafts, or let the model set prices

Ask first for irreversible work (dropping volumes, `compose down -v`, push, global command registration, metered APIs).

## After you change something

1. Contracts changed → update `SPEC/`
2. Record notable changes under `## [Unreleased]` in `CHANGELOG.md` (Keep a Changelog 2.0.0: Added / Changed / Deprecated / Removed / Fixed / Security). At release, rename that section to a dated version; **do not reuse a version number**
3. `npm run check` must be green (no database or keys required)
4. Data-flow changes → `npm run smoke` (needs the database)
5. LLM settings → `npm run llm:check` (needs keys)
6. Slash-command definitions → `npm run register`

The public-facing introduction is [`README.md`](../README.md) / [`README.en.md`](README.en.md). Campus hosting is [`DEPLOY.md`](../DEPLOY.md).

## Licence

**Code and documentation** are MIT-licensed; the full text is in the root [`LICENSE`](../LICENSE). The laboratory name AIPARC and the organisation logos are not licensed; see [`TRADEMARKS.md`](../TRADEMARKS.md). `"private": true` only means do not publish to npm; it is not a copyright statement.
