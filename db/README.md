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

`supplychain` and `purchase_requisation` load incrementally on a 180-day
activity window and reload in full every Saturday (`full_reload_dow = 6`).
Neither table has a last-changed column, so the window is an OR-chain over every
activity date the document carries — which is a proxy, not a guarantee, and the
weekly full reload is what makes it safe. It also removes rows deleted upstream,
which an incremental merge cannot do.
