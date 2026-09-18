<p align="center">
  <a href="../README.md"><img alt="繁體中文" src="https://img.shields.io/badge/%E7%B9%81%E9%AB%94%E4%B8%AD%E6%96%87-259fc8?style=for-the-badge&labelColor=231815"></a>
  <a href="#readme"><img alt="English (UK)" src="https://img.shields.io/badge/English_(UK)-eabf29?style=for-the-badge&labelColor=231815"></a>
</p>

<p align="center">
  <img src="assets/hero.svg" alt="AIPAR ETA" width="760">
</p>

<h1 align="center">AIPAR ETA</h1>

<p align="center">
  <strong>Laboratory meals system</strong><br>
  Catalogue menus, open group orders, and settle the ledger on Discord.<br>
  The campus website is read-only. Prices always come from the database — never from the model.
</p>

<p align="center">
  <img alt="release" src="https://img.shields.io/badge/release-0.2.0-eabf29?style=flat-square&labelColor=231815">
  <img alt="unreleased" src="https://img.shields.io/badge/unreleased-revise-259fc8?style=flat-square&labelColor=231815">
  <img alt="node" src="https://img.shields.io/badge/node-%E2%89%A524.12-339933?style=flat-square&logo=nodedotjs&logoColor=white">
  <img alt="postgres" src="https://img.shields.io/badge/postgres-18.6-4169E1?style=flat-square&logo=postgresql&logoColor=white">
  <img alt="discord.js" src="https://img.shields.io/badge/discord.js-14.27-5865F2?style=flat-square&logo=discord&logoColor=white">
  <img alt="locale" src="https://img.shields.io/badge/locale-zh--Hant%20%2F%20en--GB-eabf29?style=flat-square&labelColor=231815">
  <img alt="licence" src="https://img.shields.io/badge/licence-private-6b6b6b?style=flat-square">
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#demo">Demo</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#installation">Installation</a> ·
  <a href="#project-structure">Structure</a> ·
  <a href="#contributing">Contributing</a> ·
  <a href="../DEPLOY.md">Campus deploy</a> ·
  <a href="./README.md">Docs index</a> ·
  <a href="./presentations/README.md">Talk deck</a>
</p>

---

Lunch orders should not live across ten Discord messages. AIPAR ETA keeps restaurants, forum group-buys, and the ledger in one system: **writes go through the Discord bot**, **reads go through the campus website**, and **state lives in PostgreSQL**. Natural language and menu-image recognition use **free LLM APIs only**. Menu-reconciliation OCR (PP-OCRv6 small) is optional and skipped when unset. With no keys at all, buttons and dropdowns still work.

> **Status (0.2.0 + Unreleased).** The three product features shipped in 0.2.0. This round follows `PLAN/AEPARC_EAT_Revise_1.md`: vertical-menu OCR, plain-language cancel and ledger queries, who-owes-whom, and a themed dashboard.
> 53 offline tests and the local website pages have passed. **Live Discord use has not been signed off.** The command table changed — run `npm run register` after deploy.

English in this project is **British English**. Discord users whose client language is Chinese (Traditional or Simplified) see Traditional Chinese; everyone else sees English.

## Features

<table>
<tr>
<td width="33%" valign="top">

### Menus

`/restaurant add` registers a place. `/menu upload` reads a photo, or `/menu input` takes pasted text. Recognition produces a **draft** only; someone must press *Confirm* before it goes live. People can also mention the bot and ask what a restaurant serves.

</td>
<td width="33%" valign="top">

### Group orders

`/groupbuy` opens a forum post (and can ping a role); the bot pins the menu and a running summary. Members press *Order* to pick a quantity and items, or type “one chicken rice and a tea”; “cancel the tea” takes it back off. Once the deadline passes the summary says *Closed* instead of counting down forever.

</td>
<td width="33%" valign="top">

### Ledger

`/settle` writes each person’s subtotal and records who to hand the money to. The same person is never charged twice for the same round. `/ledger who` shows netted debts and the fewest transfers that settle everyone up; `/ledger mine`, `/ledger all` and `/ledger pay` cover balances and payments. Balances are always derived from entries — they are not stored as a column.

</td>
</tr>
</table>

| Also | Why |
| --- | --- |
| **Vertical menus are readable** | An optional PP-OCRv6 small pass works out the layout and reading order first, then cross-checks the model's draft and flags the lines that did not match. |
| **Read-only campus site** | No public domain; a single write path (Discord) keeps authorisation simple. |
| **Themes and accessibility** | The theme toggle uses a View Transitions circular wipe; with reduce-motion set, there is no animation at all. |
| **Rules first, model second** | If a rule matches, the LLM is skipped. Free quotas last longer and results stay predictable. |
| **Prices from `menu_items` only** | The model maps names and quantities. It must not set prices or rewrite the books. |
| **zh-Hant / en-GB** | Localisation tables always ship both languages; missing one fails the type check. |

## Demo

The website frame is a live capture from this machine on 2026-09-18 (dashboard, brand mark, navigation). The Discord frame is an illustration that follows the current string table and brand colours.

<p align="center">
  <img src="assets/demo-discord.png" alt="Illustrated Discord summary embed with combined order, per-person totals, quantity dropdown and action buttons" width="720">
</p>
<p align="center"><sub>Summary embed in the forum post (gold rule). The order panel picks a quantity from 1–10. Typing “cancel the soya milk” takes a line off. An Ack reaction (👀) and a streaming preview appear while the bot waits on an LLM.</sub></p>

<p align="center">
  <img src="assets/demo-web.png" alt="Campus website dashboard with headline figures, recent group orders and restaurants" width="720">
</p>
<p align="center"><sub>On the campus network: <code>http://&lt;server-LAN-IP&gt;:3000/</code>. CSS is inlined. The theme toggle is stored locally; with reduce-motion set there is no animation.</sub></p>

### One complete path

```text
/setup forum  channel:#orders
/setup role   role:@lunch
        ↓
/restaurant add   Si Hai soya milk
        ↓
/menu upload   (or /menu input) → check the draft (OCR flags, if any) → Confirm
        ↓
/groupbuy   restaurant + minutes + optional payer → forum post (may ping a role)
        ↓
Press Order (quantity + items), or type   “two egg pancakes and a soya milk”
        ↓
“cancel the soya milk” / summary says Closed after the deadline
        ↓
/settle   → /ledger who · /ledger mine · /website
```

Website routes: `/` dashboard, `/restaurants/:id` menu, `/sessions/:id` that round’s summary, `/ledger/:guild-id` who owes whom.

## Architecture

```mermaid
flowchart LR
  D[Discord users] --> B[bot container]
  C[Campus browsers] --> W[web container]
  B --> P[(PostgreSQL 18.6)]
  W --> P
  B --> L[Free LLM APIs<br/>Groq / Gemini / Mistral]
  B -.-> O[PP-OCRv6 small<br/>optional]
  L -.-> B
```

Both entry points share the database and **never write SQL themselves**: `bot` and `web` call `db/` and `domain/` only. The LLM gateway speaks the OpenAI-compatible wire format. Switching provider means changing `base_url`, the key, and the model id — no LLM SDK is imported. OCR is a separate HTTP service; **do not run it inside the bot container**.

| Layer | Directory | May depend on |
| --- | --- | --- |
| Shared | `src/shared/` | nothing |
| Data | `src/db/` | `shared` |
| Domain | `src/domain/` | `shared`, `db` types |
| Models | `src/llm/` | `shared`, `domain` |
| Edges | `src/bot/`, `src/web/` | the layers above; not each other |

Contracts live in [`SPEC/`](../SPEC/README.md). Product intent lives in [`PLAN/plan_initial.md`](../PLAN/plan_initial.md); this round’s revisions are in [`PLAN/AEPARC_EAT_Revise_1.md`](../PLAN/AEPARC_EAT_Revise_1.md). If they disagree: **code > SPEC > PLAN**.

## Installation

You need Docker Engine 28+ (Compose v2 / v5) and a filled-in `.env`. Local scripts also need Node.js ≥ 24.12.

### 1. Environment

```powershell
Copy-Item .env.example .env
```

```bash
cp .env.example .env
```

Set at least `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD`. Discord tokens and LLM keys can wait: without them the bot stays on its health port, and the website plus database still start.
Set `PUBLIC_BASE_URL` (for example `http://10.0.0.12:3000`) if embeds and `/website` should carry a link. Set `OCR_BASE_URL` for menu reconciliation; leave it empty to skip that step entirely.

### 2. Compose

Migrations run when `web` and `bot` start. There is no separate migrate step.

```powershell
docker compose up --build -d
docker compose ps
```

All three services should be `healthy`. Open <http://127.0.0.1:3000/health> — you should see `ok: true` and the database time.

### 3. Discord (when you want the bot)

1. Developer Portal → Bot → Privileged Gateway Intents → enable **Message Content Intent**. Without it, plain-language orders and pasted menus arrive as empty strings.
2. Invite with: View Channels, Send Messages, Send Messages in Threads, **Create Posts**, Embed Links, Add Reactions.
3. Point the bot at a forum channel so `/groupbuy` has somewhere to post; set a notify role if openings should ping:

```text
/setup forum  channel:#orders
/setup role   role:@lunch
```

**The command table changed this round** (`/order` removed, `/website` added, the deadline is now a number of minutes). After deploy, run `npm run register` (or `docker compose exec bot node src/scripts/register-commands.ts`).

### 4. Everyday commands

| Command | What it does | Needs |
| --- | --- | --- |
| `npm run check` | typecheck + 53 offline tests | — |
| `npm test` | tests only | — |
| `npm run smoke` | restaurant → menu → group buy → order → settle → ledger, then cleans up | database |
| `npm run llm:check` | one live call per provider | keys, network |
| `npm run register` | re-register slash commands | Discord token |

Stop with `docker compose down` (the volume stays). `docker compose down -v` **drops the database** — ask first.

Campus 24/7 hosting, backups, and week-long uptime notes: [`DEPLOY.md`](../DEPLOY.md).

## Project structure

```text
AIPAR-ETA/
├── src/
│   ├── web.ts / bot.ts     process entry points
│   ├── config.ts           env loader (missing required names fail fast)
│   ├── shared/             time, money, text, logging
│   ├── db/                 one module per table; SQL in db/sql/
│   ├── domain/             menu drafts, summaries, settlement, debts, OCR
│   ├── llm/                providers, failover, task prompts, OCR client
│   ├── bot/                commands, components, messages, i18n
│   ├── web/                pages and read-only JSON
│   └── scripts/            smoke, llm-check, register-commands
├── logo/                   brand files for `/assets/` and embed thumbnails
├── test/                   node:test (also a behaviour spec)
├── SPEC/                   architecture and data contracts
├── PLAN/                   product draft, revise list, sample menu photos
├── docs/                   this English README, contributing, artwork
├── compose.yaml            postgres / web / bot
├── DEPLOY.md               campus server
└── CHANGELOG.md            history (Traditional Chinese)
```

The root `requirements.txt` lists no pip packages on purpose. This is not a Python project; runtime dependencies are in `package.json`.

## Technical details

<details>
<summary>Slash commands (Chinese ≤ 6 characters, English ≤ 10 letters)</summary>

| English (default) | Chinese | Role |
| --- | --- | --- |
| `/restaurant` | `/餐廳` | add / list / info |
| `/menu` | `/菜單` | show, upload, input, version |
| `/groupbuy` | `/揪團` | open a forum post; the deadline is a number of minutes |
| `/settle` | `/結算` | settle and write the ledger |
| `/ledger` | `/帳務` | mine / all / who / pay |
| `/help` | `/說明` | how to use |
| `/website` | `/網站` | a link button to the site |
| `/setup` | `/設定` | forum channel and notify role (Manage Server) |

Ordering inside a post is done with the buttons or plain language; `/order` was removed in `Unreleased`.

Restaurant options use autocomplete and return a database id. Full flows: [`SPEC/bot-interactions.md`](../SPEC/bot-interactions.md).

</details>

<details>
<summary>Website pages and read-only API</summary>

| Path | Content |
| --- | --- |
| `GET /` | dashboard: headline figures, recent rounds and restaurants |
| `GET /restaurants` · `/restaurants/:id` | restaurant list and active menu |
| `GET /sessions` · `/sessions/:id` | rounds, combined order and per-person totals |
| `GET /ledger` · `/ledger/:guild-id` | who owes whom, fewest transfers, balances |
| `GET /status` | database, LLM usage and per-server activity |
| `GET /assets/logo.svg` | logo (allowlisted static file; Discord embeds use the same URLs) |
| `GET /health` | service and database time |
| `GET /api/overview` | dashboard figures |
| `GET /api/restaurants` | optional `keyword` |
| `GET /api/sessions` | optional `guild`, last 30 |
| `GET /api/ledger/:guild-id` | balances |
| `GET /api/debts/:guild-id` | netted debts and suggested transfers |
| `GET /api/llm-usage` | `hours` defaults to 24 |

JSON amounts are in **New Taiwan dollars**, not cents. Non-GET methods return 405. Contract: [`SPEC/web-api.md`](../SPEC/web-api.md).

</details>

<details>
<summary>Environment variables (names only)</summary>

| Variable | Required | Notes |
| --- | --- | --- |
| `POSTGRES_*` | yes | Inside Compose, `POSTGRES_HOST` is overwritten to `postgres` |
| `APP_HOST` / `APP_PORT` | | website, default `0.0.0.0:3000` |
| `BOT_HEALTH_PORT` | | bot health, default `3001` |
| `TZ` | | default `Asia/Taipei` |
| `DISCORD_BOT_TOKEN` / `DISCORD_CLIENT_ID` | to run the bot | omit = no Discord connection, no command registration |
| `*_API_KEYS` | | comma-separated; blank skips that provider |
| `*_MODEL` / `*_VISION_MODEL` | | a key without a model id is skipped on purpose — never guess |
| `LLM_ALLOW_METERED` | | `true` enables the metered provider (iAI); off by default |
| `PUBLIC_BASE_URL` | | the site's address; used for embed logos and the `/website` button |
| `OCR_BASE_URL` | | menu cross-check OCR (PP-OCRv6 small); leave empty to skip it entirely |
| `LOCAL_LLM_BASE_URL` | | local fallback; do not run a local model inside the container |

See [`.env.example`](../.env.example). Never commit `.env` or bake it into the image.

</details>

<details>
<summary>LLM gateway and two hard rules</summary>

Order of attempt: Groq (text) → Gemini (vision) → Mistral → local. Metered iAI stays off unless `LLM_ALLOW_METERED=true`.

- An **empty reply counts as failure** and the next provider is tried (Gemini’s free tier often spends `max_tokens` on thinking).
- 429 / 5xx: retry the same key once, then fail over. 401 / 403: skip that key immediately.
- Vision and text models are queued separately. `OCR_BASE_URL` turns on a PP-OCRv6 small cross-check; it only flags lines, it never rewrites the draft.

Hard rules: unit prices always come from `menu_items`; a matching rule means the model is not called. Details: [`SPEC/llm-gateway.md`](../SPEC/llm-gateway.md). Run `npm run llm:check` before going live — a name on a price list is not the same as an ID you can actually call.

</details>

<details>
<summary>Runtime (verified 2026-09-18)</summary>

- Node.js 24 Active LTS (Krypton), ≥ 24.12, type stripping, no build step
- PostgreSQL 18.6 (`postgres:18.6-alpine`; 19 was still beta at the time)
- discord.js 14.27, `pg` 8.23
- Image: `node:24-bookworm-slim`, non-root `node`, timezone `Asia/Taipei`; `COPY logo ./logo`
- Compose file: `compose.yaml` (Compose Specification; no obsolete `version` key)
- Postgres port bound to `127.0.0.1` only — not on the campus network
- Brand colours from the mark: gold `#eabf29`, blue `#259fc8` (website and embeds share them)

</details>

## Contributing

This is an internal laboratory project. Please read [`CONTRIBUTING.md`](../CONTRIBUTING.md) ([English (UK)](CONTRIBUTING.en-GB.md)) and [`.cursorrules`](../.cursorrules) before editing.

In short: `snake_case` for variables and functions; maintainer comments in Traditional Chinese; keep `SPEC/` in sync when contracts change; record notable changes under `CHANGELOG.md` `Unreleased` (Keep a Changelog 2.0.0); `npm run check` must stay green. Do not copy code or architecture from the neighbouring `AIPAR-ordering-system` repository.

## Licence

`package.json` sets `"private": true`. **No public licence has been granted.** The tree is for laboratory use. Please do not distribute source, images, or secrets without agreement.

---

<p align="center">
  <sub>AIPAR ETA　·　laboratory meals　·　Asia/Taipei</sub>
</p>
