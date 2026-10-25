# What the user should see instead of a table name

The agents name real tables, views and tools — in the live progress line while
they work, and in the "How I got this" note under the answer. Those names leak
the schema and mean nothing to a buyer. This file is the mapping that replaces
them in the interface.

**Edit the right-hand column.** Nothing else reads this file yet; once you hand
it back it becomes `src/config/dataNames.ts` and the UI uses it.

A few things worth knowing before you edit:

- The replacement happens **in the browser, on the text as it is displayed**.
  Nothing is sent to a model, nothing is re-generated, and no number is ever
  touched. It costs nothing and cannot change an answer.
- Longest name wins, so `track.po_line` is replaced before `po_line`.
- A name not in this list **still shows through as-is**. If you spot one in an
  answer, tell me and I will add it.
- Keep them short. These appear mid-sentence: "read **Purchase orders** and
  **Supplier directory**, filtered to Saudi Arabia".
- Sentence case, no underscores, no schema prefix.

---

## Materials AI — the materials database

| Real name | Shown as |
|---|---|
| `core.material_master_data` | Material master |
| `core.material_plant_extension` | Plant extensions |
| `core.mb52` | Stock on hand |
| `core.soh_quantity_per_store` | Stock by location |
| `core.soh_aging_live` | Stock ageing |
| `core.soh_aging_gi_gr_dates_live` | Last movement dates |
| `core.inventory_movement` | Goods movements |
| `core.purchase_requisation` | Purchase requisitions |
| `core.supplychain` | Purchase orders |
| `core.all_plants` | Plant list |
| `core.mat_group_description` | Material groups |
| `core.account_classification_mapping` | Account classifications |
| `ai.material_embedding` | Material description search |

## Track My Request — purchasing documents

| Real name | Shown as |
|---|---|
| `track.request_lifecycle` | Request lifecycle |
| `track.pr_line` | Requisition lines |
| `track.po_line` | Purchase order lines |
| `track.open_pr` | Open requisitions |
| `track.pr_pending_release` | Requisitions not yet submitted |
| `track.po_draft` | Draft purchase orders |
| `track.po_pending_release` | POs awaiting approval |
| `track.po_open` | Open purchase orders |
| `track.pr_waiting_with` | Requisition approval queue |
| `track.po_waiting_with` | PO approval queue |
| `track.goods_receipt` | Goods receipts |
| `track.in_transit` | In transit |
| `track.approval_chain` | Approval chain |
| `track.supplier_directory` | Supplier directory |
| `track.data_freshness` | Data load times |
| `track.column_guide` | Column guide |

## SourceGuide AI — suppliers, spend and contracts

| Real name | Shown as |
|---|---|
| `ai.sourcing` | Approved supplier list |
| `ai.commodity_catalog` | Commodity catalogue |
| `ai.purchase_history` | Purchase history |
| `public.sg_champions` | Procurement champions |
| `pir_catalog` | Contracted prices |
| `supplier_directory` | Supplier contacts |
| `catalog_entry` | Rate catalogue |
| `rate_version` | Rate history |
| `currency` | Currency rates |
| `sns_record` | Sole-source registry |
| `sns_record_node` | Sole-source scope |
| `sns_record_segment` | Sole-source segments |
| `sns_reason` | Sole-source reasons |
| `sns_category_manager` | Category managers |
| `sns_country_manager` | Country managers |
| `sns_supplier` | Registered suppliers |

## The tools the agents call

These are what the live progress line will name while an answer is being
worked out — "Reading **Purchase orders**", "Asking **SourceGuide AI**".

| Real name | Shown as |
|---|---|
| `query_materials_db` | the materials database |
| `search_materials` | material description search |
| `query_track_db` | the tracking database |
| `query_sourceguide_db` | the supplier database |
| `query_sns_registry_db` | the sole-source registry |
| `query_catalog_manager_db` | the contracted price catalogue |
| `search_policy` | the policy documents |
| `calculator` | the calculator |
| `AirAPI` | air shipment tracking |
| `OceanAPI` | sea shipment tracking |
| `ask_material_ai` | Material AI |
| `ask_track_my_request` | Track My Request |
| `ask_sc_policy_ai` | SC Policy AI |
| `ask_sourceguide_ai` | SourceGuide AI |

## Database names

These appear occasionally. Simplest is to drop them entirely rather than
rename them — say so if you would rather they showed something.

| Real name | Shown as |
|---|---|
| `materials_db` | the materials database |
| `sourceguide_db` | the supplier database |
| `catalog_manager_db` | the contracted price catalogue |
| `sns_registry_db` | the sole-source registry |

## Column names — a question for you

The "How I got this" note also quotes columns: `net_order_val_usd`,
`is_deleted`, `df_at_client_level`, `material_type NOT IN ('ZSER','ZAST')`.

There are 319 of them in `core` alone, so mapping every one is a project of its
own. Three options, pick one:

1. **Leave columns as they are.** They read as technical, but they are the part
   that proves the filter was right, and a buyer who opens that note is already
   looking for exactly that.
2. **Map only the dozen that keep appearing** — the ones above plus a handful.
3. **Map all of them**, using the column descriptions already in the database.
   Doable, but it is its own piece of work.

My recommendation is **2**.
