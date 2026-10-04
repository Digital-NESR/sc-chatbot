# n8n workflows

The three workflows behind Materials AI. They are **not** committed here by
choice — they live in n8n, which keeps its own version history, and every change
made in this project was published with a description of what changed and why.

This file exists so the repo records where that logic lives.

| Workflow | ID | What it does |
| --- | --- | --- |
| Data Loader (Materials AI) | `KcnJZ4NHGnYw56gl` | Pulls 12 tables from the Power BI Inventory Twin model into `materials_db`, then refreshes changed embeddings. Cron `0 9-16 * * *` UTC |
| Vector DB loader (Materials AI) | `ucS0yaV74v4bxRU1` | Embeds material descriptions into `materials_vector_db`. Daily reconciliation pass, cron `30 15 * * *` UTC |
| Materials AI | `IQJq5ZajOBsscUq2` | The agent: SQL tool, pgvector search, calculator |

The database side of the platform **is** version-controlled, in `../db` —
schema, loader configuration, and descriptions for all 319 columns.

## What lives only in n8n

- **The agent's behaviour**, in the system prompt on the `Materials Agent` node:
  the duplicate-check cascade, plant-extension rules, the numeric-token search,
  grain warnings and arithmetic rules.
- **The loader's planning logic**, in the Code nodes: the cost model, cell-based
  shard packing, DAX construction, the `chr(36)` escaping, and dispatch pacing.

## If you ever do export them

The token nodes (`Get Power BI Token`, `Range Token`) hold the Power BI client
secret as a plain body parameter rather than in a credential, so any export
carries it. Strip it before putting an export anywhere it would be shared.
