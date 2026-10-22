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


## Materials AI: what a duplicate check searches

The material master holds 309,207 rows and **61% of them are not stockable
material**. Offering one as a possible duplicate is always wrong. From the
October test round: a search for part number `P141228` returned
"10.7.1.11.2 AlYasat Weekly", a service subscription.

| material_type | Rows | SAP range | Searched |
| --- | --- | --- | --- |
| ZSER sales / service | 183,862 | all `71xxx` | no |
| ZAST asset | 6,187 | all `91xxx` | no |
| ZMS stockable | 112,836 | all `11xxx` | yes |
| ZPR, ZRW, ZADM, ERSA, DIEN | 6,322 | `29/51/61/…` | yes |

Scope is expressed as `material_type`, not as a number range. The two map
**1:1 with zero overlap** - every ZSER is 71xxx, every ZAST is 91xxx, every ZMS
is 11xxx - so they are interchangeable as a filter, but the type is
self-documenting and it keeps ZPR, ZRW, ZADM, ERSA and DIEN, which are real
stockable items (gaskets, bar stock, equipment) and were nearly lost to a
number-range rule.

Applied in two places, because there are two ways into the data:

- **`Build Search SQL`** adds `WHERE material_type NOT IN ('ZSER','ZAST')` to
  the pgvector query, so `search_materials` cannot return them.
- **The agent prompt** carries the same filter on every duplicate-check query.

**This is a search filter, not a deletion.** Every row is still in
`core.material_master_data` and in `ai.material_embedding`, so the data remains
available for analysis - which is the whole reason it was not filtered at the
loader. The prompt tells the agent to drop the filter for analytical questions
and say that it has.

One detail worth keeping: **not one of the 183,862 ZSER rows carries a
manufacturer part number.** A part-number search can therefore never match one
legitimately. When it appeared to, the match had come from the material NUMBER
rather than the part number - a separate defect, still open.

Checked on pgvector 0.8.2 before shipping: the filtered vector query still
returns a full topK with identical top matches, at roughly 3x latency
(129ms -> 424ms on a 10-row probe). If that degrades, iterative index scans are
the lever.

### Three more fixes from the same test round

**The word-boundary step had never run.** Section A step 3 used Postgres `\m`
and `\M` escapes. Through this connection those return **zero rows**, silently:

| | rows |
| --- | --- |
| `material_description ~ '\m1797\M'` | **0** |
| `material_description ~ '(^\|[^0-9])1797([^0-9]\|$)'` | **2**, both correct |

That step exists specifically so "Type 120" does not match "Type 128". It was
dead. Now a hard rule forbids `\m`/`\M` outright, the same bug having already
been found and fixed in Track My Request.

**Part numbers were matched against the wrong column.** The exact step compares
normalised strings for EQUALITY, so `AF1797M/P141228/` (normalising to
`AF1797MP141228`) never matched a search for `P141228`. With no hit the agent
improvised and landed on the material NUMBER `000007100000141228`. There is now
a containment fallback on `manufacturer_part_no`, and an explicit rule that a
user-supplied part number is never matched against `material`.

Containment over-matches, so it is guarded: `870` alone hits 641 part numbers.
Inputs shorter than 5 normalised characters are refused, and more than ~20 rows
is reported as too generic rather than as a duplicate.

**Deletion flags were ignored.** `df_at_client_level` (45,708 rows) and
`successor_code` were not mentioned in the prompt at all, so flagged materials
were recommended. The agent had appeared to handle supersession correctly in
other tests, but only because those descriptions literally read
`DEL USE 1100000025682` - it was reading the description, not the flag.

Chains are not one hop: `1100000016640 -> 1100000119276 -> 1100000119109`, only
the last live. Measured: up to 3 hops, 5,728 multi-hop links. The prompt now
carries a recursive CTE that pads `successor_code` to 18 characters and stops at
5 hops. 23,395 of 23,397 successors resolve to a real material; the rest are
vendor codes like `ID-0087` and are reported raw.

Verified live after publishing:

| Case | Before | After |
| --- | --- | --- |
| `P141228` | returned a weekly service subscription | both MPN variants, flagged one identified, recommends 119109 |
| `AF1797M` | recommended 119276, which is flagged | walks 16640 to 119276 to 119109, recommends 119109, checks plant extension on the live one |
