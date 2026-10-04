# n8n workflows

The three workflows behind Materials AI. The database side of the platform is
version-controlled in `../db`; this directory is for the orchestration and the
agent, which currently live only in n8n.

| Workflow | ID | What it does |
| --- | --- | --- |
| Data Loader (Materials AI) | `KcnJZ4NHGnYw56gl` | Pulls 12 tables from the Power BI Inventory Twin model into `materials_db`, then refreshes changed embeddings |
| Vector DB loader (Materials AI) | `ucS0yaV74v4bxRU1` | Embeds material descriptions into `materials_vector_db`; now a daily reconciliation pass |
| Materials AI | `IQJq5ZajOBsscUq2` | The agent: SQL tool, pgvector search, calculator |

## Exporting

Export from the n8n UI — workflow menu → **Download** — and commit the JSON here
as `data-loader.json`, `vector-loader.json` and `materials-ai.json`.

Do it from the UI rather than by hand: these workflows are large (the Data Loader
alone is 25 nodes with substantial JavaScript in Code nodes), and a hand-copied
JSON risks silent transcription errors in exactly the logic you would be
exporting in order to protect.

**Check the export before committing it.** See below — at the time of writing,
an export would contain a live client secret.

## Before you export: the Power BI secret

The token nodes authenticate by POSTing `grant_type=client_credentials` to
Microsoft with the client id and secret supplied as plain body parameters:

- Data Loader → `Get Power BI Token` and `Range Token`
- Materials AI → `Get Power BI Token` (in the previously active version)

The secret is therefore stored in workflow parameters rather than in an n8n
credential. That means it is visible to anyone who can open the workflow, and it
is included in every export, backup and version snapshot.

There is already a credential named **Power BI Service Principal**
(`wsYRC1DNOOBSpmfa`, type `oAuth2Api`), but it sits in a personal project and no
workflow node references it.

Two ways to fix it, in increasing order of tidiness:

1. **Generic credential.** Create an `httpTemplatedCustomAuth` credential holding
   the secret, and have the token nodes reference it instead of inlining it. The
   manual token exchange stays as it is.
2. **Use the OAuth2 credential.** Share `Power BI Service Principal` with the
   project that owns these workflows and point the Power BI API calls at it
   directly with `authentication: predefinedCredentialType`. n8n then handles
   acquiring and refreshing the token, and the two manual token nodes and the
   `Bearer {{ ... }}` headers disappear entirely.

Option 2 is cleaner but changes how production authenticates, and the existing
credential's tenant, scope and grant type have not been verified against what
these workflows need — n8n never returns credential secrets, so it cannot be
checked by inspection. Test it on a manual run before relying on it for the
daily load.

## What is not here

The agent's behaviour lives in the system prompt on the `Materials Agent` node:
the duplicate-check cascade, plant-extension rules, the numeric-token search,
grain warnings and arithmetic rules. The loader's planning logic lives in the
Code nodes: the cost model, cell-based shard packing, DAX construction, the
`chr(36)` escaping, and dispatch pacing.

Both are reviewable only inside n8n until the exports land here. n8n keeps its
own version history, and every change made in this project was published with a
description of what changed and why, so nothing is unrecoverable — it just is
not visible in `git` yet.
