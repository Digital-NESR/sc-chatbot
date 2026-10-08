# materials_db

Structure and configuration for the Materials AI data platform. The data itself
is reloaded daily from the Power BI Inventory Twin model; what lives here is
everything needed to rebuild the machinery around it.

| File | What it is |
| --- | --- |
| `schema.sql` | Schemas, the 12 business tables, `load_config` / `load_log`, and the four functions. Generated from the live database. |
| `load_config.sql` | The configuration rows that drive the loader — one per table. Apply after `schema.sql`. |
| `column_comments.json` | Human-editable descriptions for all 319 columns. The source of truth; `load_config.col_comments` is loaded from it. |

Rebuild order: `schema.sql` → `load_config.sql` → run the Data Loader.

The loader cannot bootstrap from nothing, because `core.prep_staging` builds its
staging clone with `CREATE TABLE ... LIKE core.<table>` — the live table has to
exist first. That is why the table DDL is committed here rather than treated as
derived.

## How a daily load publishes

1. `core.prep_staging(t)` drops and recreates `core_stg.<t>` as a clone of the live table.
2. The n8n Data Loader fills it in bucket ranges, one sub-workflow per range.
3. `core.publish_all(expected, tables, full)` publishes, guarded by an exact row-count
   match against what Power BI reported. A truncated or half-finished extraction
   publishes nothing and the previous day's data stays live.
   - **full** tables: build indexes and comments on the clone, drop the live table,
     move the clone into `core`.
   - **incremental** tables (`supplychain`, `purchase_requisation`): delete the staged
     keys from the live table, insert the staged rows, re-assert comments.

## The invariant that keeps biting

`CREATE TABLE ... LIKE` copies **neither indexes nor column comments**, and the
publish replaces the live table with that clone. Anything attached to the live
table is therefore destroyed on the next daily load unless it is rebuilt on the
clone first.

This has already caused one production problem: every core table silently lost
its indexes on every swap, and a single `OFFSET 200000` page took 25 seconds
until it was found. `build_indexes` and `apply_comments` exist to close that hole,
driven by `load_config.index_defs` and `load_config.col_comments`.

**If you add an index or a comment by hand, it will vanish within 24 hours.**
Add it to `load_config` instead.

## Column descriptions

Every column carries a `COMMENT`, readable by the Materials AI agent at query
time, so the agent looks meanings up instead of inferring them from names. This
matters because a good number of names mislead:

- `supplychain.comment` holds 2-character codes, not free text
- `purchase_requisation.materiall` is the material number without zero padding
- `soh_aging_gi_gr_dates_live.null_val` is the literal string `"Null"` on every row

Two markers carry meaning and the agent is told to respect both:

- `UNUSED:` — the column is empty or constant; do not filter or report on it
- `UNVERIFIED` — the meaning is inferred from the loaded data, not confirmed
  against SAP or the Power BI model; caveat anything concluded from it

Roughly 20 columns are marked `UNVERIFIED`. They are the ones worth walking
through with someone who knows the source system — `frgke`, `column_2`,
`comment`, `reject_po`, `creation_indicator` and `event` in particular, since
those carry real values that someone might otherwise filter on incorrectly.

To change a description: edit `column_comments.json`, load it into
`load_config.col_comments`, and either wait for the next daily publish or call
`SELECT core.apply_comments('core', '<table>')` to apply immediately.

## Schedules (UTC — the n8n instance runs in UTC)

| Workflow | Cron | Notes |
| --- | --- | --- |
| Data Loader | `0 9-16 * * *` | Plans each run from the day's row counts; uses ~3 hours on a weekday, ~7 on Saturday |
| Vector reconcile | `30 15 * * *` | Re-embeds anything the 3-day refresh missed |

### Load modes

`load_config.load_mode` takes three values:

| Mode | Tables | Behaviour |
| --- | --- | --- |
| `full` | 7 | Extract everything, swap staging into place |
| `incremental` | `material_master_data`, `purchase_requisation`, `supplychain` | Extract a 180-day window, merge on `key_cols`, full reload on Saturday |
| `static` | `mat_group_description`, `account_classification_mapping` | Never extracted at all |

**The window means different things per table, and the difference matters.**

`material_master_data` has a real SAP `Last_Change`, populated on **every one of
its 308,940 rows**, alongside `Created_On` — also 100% populated. Its window is
exact, not a guess, so it needs no margin for a proxy being wrong and runs on
**14 days**:

| Window | Rows | % of table |
| --- | --- | --- |
| 5 days | 997 | 0.3% |
| **14 days** | **2,147** | **0.7%** |
| 30 days | 3,938 | 1.3% |
| 180 days | 59,253 | 19.2% |
| full | 308,942 | 100% |

180 was inherited from the two proxy-date tables and was badly oversized: a bulk
update 30–60 days ago sits inside it, so every run dragged ~57,000 unchanged
rows along. At 14 days the extract is 2,147 rows — **99.3% less than a full
load**.

The floor is not arbitrary. `Select Changed Materials` re-embeds anything with
`last_change >= now() - interval '3 days'`, so the import window must stay
comfortably above 3 days or the vector DB would be asked to re-embed rows the
import had not refreshed. 14 clears it by 11 days and tolerates a two-week
outage; 5 would also work and costs about one second less.

`supplychain` and `purchase_requisation` have no last-changed column at all, so
"recently active" there is an OR-chain over every activity date the document can
acquire — a proxy, not a guarantee. That is why the weekly full reload exists
(`full_reload_dow = 6`). It is also the only thing that removes rows deleted
upstream, which an incremental merge cannot do, so every incremental table needs
it regardless of how good its date column is.

### `static` is not the same as disabled

Static tables keep `enabled = true` on purpose. Setting `enabled = false` would
also drop them out of the `/admin` column dictionary, which reads
`load_config WHERE enabled`. With `load_mode = 'static'` they keep their column
comments and stay editable, but are skipped by both `Build Count Query` and
`Build Range List` in the loader, so they cost no API call and are never
published.

**Those two skips must stay in step.** If a table appeared in the expected counts
but not in the extraction plan, `publish_all` would be handed a count for rows
no range ever staged.

## The `track` schema (Track My Request)

`track_schema.sql` builds eight views that the Track My Request agent reads
instead of `core.*`. Materials AI keeps `core.*`; the two agents never name the
same object, which is what stops the orchestrator routing on a coin flip.

| View | What it is |
| --- | --- |
| `track.pr_line` | One row per requisition line, conversion and release state resolved |
| `track.po_line` | One row per purchase order line, release and receipt state resolved |
| `track.open_pr` | Requisitions not yet converted to a PO |
| `track.pr_pending_release` | Requisitions still awaiting final approval |
| `track.po_draft` | POs created but never submitted for approval |
| `track.po_pending_release` | POs submitted but not yet fully released |
| `track.po_open` | Released POs with quantity still to deliver |
| `track.request_lifecycle` | PR → PO → receipt, one row per requisition line |

### Why the views live in a table

`core.publish_all()` runs `DROP TABLE IF EXISTS core.<t>` with **no CASCADE**
whenever a table loads in full mode. A view on that table makes the DROP fail,
which fails the whole load. `supplychain` and `purchase_requisation` are
incremental on weekdays but **reload in full every Saturday**, so a hand-made
view over them would have survived six days and then broken the Saturday run.

So the views are registered in `core.view_defs` and rebuilt by
`core.rebuild_track_views()`, which `publish_all` calls after every publish —
the same pattern `index_defs` and `col_comments` already use.

**Edit the views in `track_schema.sql` and re-apply it. A bare `CREATE VIEW`
will be gone by Saturday.** The same goes for the index this adds:
`supplychain (purchase_req)` is registered in `index_defs`, because the
lifecycle join degrades without it.

### Two judgements baked into these views

Both were wrong on the first attempt and are worth keeping straight:

- **Receipt is decided by outstanding quantity, not delivered quantity.**
  338,304 lines are item category 9 — service lines with ordered qty 1,
  delivered qty 0, nothing outstanding, and a GR posting date on 96% of them.
  Receipt there is a service entry sheet. Judging by `delv_qty` labels every
  one of them "awaiting receipt" when they are finished. `po_line` exposes
  `is_service_line` so quantities are not compared across the two kinds.
- **PR approval is `pr_release_date_final`, not `release_date`.** `release_date`
  is populated on every row including never-submitted ones, so it is not an
  approval flag. `pr_release_date_final` is present on 100% of fully approved
  lines and under 1% of lines with no release status.

### PO release states

Three states, grounded in the data rather than assumed:

| `release_state` | Raw | Lines | Meaning |
| --- | --- | --- | --- |
| `Draft` | status blank, `frgke` blank | 7,362 | Never entered a release strategy |
| `Under Release` | `Not Approved` / `frgke` B | 5,166 | In a strategy, not yet approved |
| `Released` | `Approved` / `frgke` G | 721,749 | Released; 99.99% carry a release date |

`Draft` is the state behind the "POs in Draft Status" figure on the
*Procurement Aging Insights* report. Under that report's filters this gives 297
purchase orders against the report's 280 — the gap is refresh lag, since the
core tables trail the semantic model by a day or two.

### Performance note

`request_lifecycle` rolls the PO side up with a grouped subquery and a hash
join. It was first written as a correlated `LATERAL`, which re-probed
`supplychain` once per requisition line: a single PR lookup took 2.9s and a
whole-table aggregate did not finish in 20 minutes. Grouped first, the same
aggregate takes 4s and a point lookup under 1s. Do not reintroduce the LATERAL.
