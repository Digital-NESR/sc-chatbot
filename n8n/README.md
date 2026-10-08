# n8n workflows

The workflows behind the agents. They are **not** committed here by
choice — they live in n8n, which keeps its own version history, and every change
made in this project was published with a description of what changed and why.

This file exists so the repo records where that logic lives.

| Workflow | ID | What it does |
| --- | --- | --- |
| Data Loader (Materials AI) | `KcnJZ4NHGnYw56gl` | Pulls 12 tables from the Power BI Inventory Twin model into `materials_db`, then refreshes changed embeddings. Cron `0 9-16 * * *` UTC |
| Vector DB loader (Materials AI) | `ucS0yaV74v4bxRU1` | Embeds material descriptions into `materials_vector_db`. Daily reconciliation pass, cron `30 15 * * *` UTC |
| Materials AI | `IQJq5ZajOBsscUq2` | The agent: SQL tool, pgvector search, calculator |
| Orchestrator (SCAI) | `WsxqwYymk8kn50AU` | Routes a question to one of the four specialists and merges the answer |
| Track My Request | `IsIZu5Ob2srIKFxU` | Request lifecycle agent. Reads the `track` schema plus live Shipwaves tracking |
| Data Loader (Track My Request) | `i1SklXpuElEsYz3c` | Exploration only so far. No load logic yet |

The database side of the platform **is** version-controlled, in `../db` —
schema, loader configuration, and descriptions for all 319 columns.

## What lives only in n8n

- **The agent's behaviour**, in the system prompt on the `Materials Agent` node:
  the duplicate-check cascade, plant-extension rules, the numeric-token search,
  grain warnings and arithmetic rules.
- **The loader's planning logic**, in the Code nodes: the cost model, cell-based
  shard packing, DAX construction, the `chr(36)` escaping, and dispatch pacing.
- **Track My Request's scope boundary**, in the system prompt on `AI Agent1`:
  which questions belong to it and which belong to Materials AI, the service-line
  and grain traps, and the explicit list of things the data cannot answer.

## Track My Request

Reads `track.*` in `materials_db` (never `core.*` — see `../db/README.md`), via a
`query_track_db` Postgres tool on the same credential Materials AI uses. It keeps
the live Shipwaves tools for shipment IDs.

Two settings are load-bearing:

- `query_track_db` must keep `queryBatching: transaction`. Without it the node
  returns `{success: true}` instead of rows while still reporting success, and an
  agent handed that will invent a plausible table rather than report an empty
  result. This exact failure already happened once on SourceGuide AI.
- The `Information Extractor1` `shipmentId` attribute must stay **not required**.
  While it was required, every question had to carry a shipment ID, which is why
  the agent could not answer a PR or PO question at all.

Verified after wiring: a PR lookup returns the right lines; a stock question is
declined and handed to Materials AI with no tool call; an unknown PR number
returns "not found" rather than a fabricated one; and a four-line service PO with
`received_qty = 0` is correctly reported as fully received even when the question
asserts the opposite.

## If you ever do export them

The token nodes (`Get Power BI Token`, `Range Token`) hold the Power BI client
secret as a plain body parameter rather than in a credential, so any export
carries it. Strip it before putting an export anywhere it would be shared.

## Routing: Materials AI vs Track My Request

These two are the pair the orchestrator is most likely to confuse, because both
know about requisitions and purchase orders. The split is by what the question is
ABOUT, and it is stated in three places that must agree: the orchestrator's system
prompt, both tool descriptions, and each agent's own prompt.

- A **document** and where it has got to → Track My Request (`track.*`)
- A **material**, stock, or an analytical total → Materials AI (`core.*`)

The orchestrator's `ask_material_ai` description used to claim it covered
“purchase requisitions and purchase orders”, which collided head-on with
Track My Request. If you edit one of the three places, edit all three.

Verified end to end through the orchestrator: “Where has PR 1005026000 got to?”
and “How many POs are in draft?” both route to Track My Request, and the draft
count comes back as 1,882 purchase orders — distinct documents, not the 7,331
underlying lines.

## Empty result vs not-yet-loaded

A `track.*` view with no rows looks identical whether the data is genuinely
empty or the source table has never loaded. Asked which POs were awaiting
approval before `po_release` had loaded, the agent answered **“there are
currently no purchase orders waiting for approval 🎉”** — a false business fact
that reads exactly like a real answer.

`track.data_freshness` exposes `never_loaded` and `last_loaded_at` per source
table. The agent is required to check it before reporting that anything does
not exist, and the orchestrator is required to relay a “not loaded” answer
as-is rather than rewording it into “there are none”.

Verified: the same question now returns “the PO approval data hasn't been loaded
into the system yet”, and the orchestrator passes that through unchanged.
