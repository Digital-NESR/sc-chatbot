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
acquire. Those are mostly *birth* dates — created, released, received — so a later
amendment that posts an invoice, sets a deletion flag or changes a quantity moves
no date at all and the row never re-enters the window on its own.

**The window is therefore not a correctness mechanism, and no value of it ever
was.** Measured against currently-open lines — the ones that can still change:

| Window | supplychain: open lines covered | rows | calls | PR: covered | rows | calls |
| --- | --- | --- | --- | --- | --- | --- |
| 14d | 67% | 39,589 | 56 | 62% | 20,232 | 15 |
| 30d | 76% | 48,648 | 67 | 77% | 30,546 | 22 |
| 60d | 81% | 65,279 | 91 | 88% | 48,991 | 35 |
| **90d** | **85%** | **82,451** | **125** | **93%** | **66,668** | **48** |
| 180d | 89% | 127,673 | 200 | 94% | 118,842 | 84 |
| full | 100% | — | — | 100% | — | — |

At 180 days, **2,865 open supplychain lines (11%) and 576 open PR lines (6%) were
already outside the window**. The Saturday full reload was always what made the
data correct; the window only decides how fresh things are between Saturdays.

Both now run on **20 days** (42,651 and 21,973 rows).

### Why the coverage column above overstates the risk

Nothing is ever lost by a short window. The merge is `DELETE` on `key_cols` then
`INSERT`; **rows outside the window are not touched**, so history accumulates and
every past load stays. A narrow window risks rows being *stale*, never missing.

And most changes pull their own row back into the window. Every lifecycle
transition Track My Request reports on moves a tracked date:

| Change | Date it moves | Caught at any window? |
| --- | --- | --- |
| PR converted to PO | `Purchase_Order_Date` | yes |
| PR released | `PR_Release_Date_(Final)` | yes |
| PO released | `PO_RELEASE_DATE` | yes |
| Goods received | `GR_POSTING_DATE` | yes |
| Invoice posted | none | **no** |
| Deletion flag set | none | **no** |
| Quantity or price amended | none | **no** |

So the table above measures the wrong thing for the top half: those rows re-enter
the window by themselves no matter how old they are. It measures the right thing
only for the bottom half — and those are missed at **every** window, 180 included,
which is why the Saturday reload is the real mechanism.

The residual exposure at 20 days is therefore: an invoice posting, deletion or
silent amendment against a document with no tracked activity in 20 days stays
stale until Saturday. That was already true at 180 days for 11% of open POs; it
is a difference of degree, not of kind.

Correctness is unchanged, because it never came from the window.

The weekly full reload also remains the only thing that removes rows deleted
upstream, which an incremental merge cannot do.

### Bucket grouping — why the incremental runs were slow

`bucket_chars` is base **10**: `bucket_chars = 3` means 1,000 buckets, addressed
by the last 3 digits of `bucket_col`, and `Range Plan` historically issued **one
DAX call per bucket**.

That count is sized for the FULL table. On a narrow incremental window each
bucket holds almost nothing, so the run paid 1,000 round trips to fetch ~128
rows each. The time was going into round trips, not data — which is why
shrinking the window barely helped.

The planner now packs buckets back up to a known-safe payload and sends them in
one call with `RIGHT(key, n) IN {...}`:

| Table | Buckets | Rows/bucket (incr) | Group size | Calls before | Calls after |
| --- | --- | --- | --- | --- | --- |
| `supplychain` | 1,000 | 128 | 5 | 1,000 | 200 |
| `purchase_requisation` | 1,000 | 119 | 12 | 1,000 | 84 |
| `material_master_data` | 100 | 21 | 100 | 100 | 1 |
| | | | | **2,100** | **285** |

**On a full reload the group size computes to 1**, so the Saturday path is
byte-for-byte what it has always been. The same default applies when a caller
sends no `groupSize` at all, so a parent mid-run keeps working across a deploy.

`TARGET_CELLS_PER_CALL` is 80,000, and it is the one constant here that must stay
conservative, because Power BI returns **fewer rows without erroring** past 15 MB.
It is not a guess: the Saturday reload of `supplychain` already fetches 735 rows
× 108 columns (79,415 cells) per call intact. Measured directly, a grouped call
of 717 rows × 108 columns returned all 717 rows at **3.4 MB — 22.6% of the cap**,
so the budget holds even if another table's cells are twice as heavy.

Verified before deploy: five buckets counted individually (220 + 134 + 150 + 103
+ 110 = 717) match the grouped filter exactly (717), and a real fetch of that
group returned 717 rows.

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

## Loading from more than one Power BI model

`load_config.dataset_id` names the semantic model each table is extracted from.
It defaults to the Inventory Twin / InventoryShare model
(`3095d467-2a63-4db9-9a67-0cc48a8b6b0f`) that every original table came from.

A DAX query cannot reference tables in another model, so `Build Count Query`
emits **one item per dataset** and `Fetch Expected Counts` runs once per item
(its `executeOnce` is off). `Range Plan` reads `dataset_id` from `load_config`
rather than taking it from the parent, so there is one source of truth about
where a table lives.

| Table | Model |
| --- | --- |
| the original 12 | Inventory Twin / InventoryShare |
| `gr_data` | GR Analyser |
| `ub_grir` | GRIR |
| `ap_aging` | Accounts Payable Aging |
| `release_strategy` | NESR Release Strategy |
| `pr_release`, `po_release` | PR & PO Under Release Insights |
| `zmb5oa` | ZMB5OA |

### Filter at the source, not after loading

Unfiltered, the six Track My Request tables are **185M cells — five times the
entire weekday load**. Filtered to what the agent actually needs they are about
26M. Every filter is in `dax_filter` or `dax_source`, so the row never crosses
the API at all:

| Table | Source rows | Loaded | Filter |
| --- | --- | --- | --- |
| `ub_grir` | 2,838,448 | **23,969** | uncleared only — cleared entries are matched and finished |
| `pr_release` | 689,677 | **33,743** | under release only — `with_whom` is meaningless once signed |
| `po_release` | 770,204 | **4,647** | under release only |
| `release_strategy` | 1,035,384 | **510,608** | deduped in `dax_source` |
| `ap_aging` | 774,298 | **373,241** | PO-linked invoices only |
| `zmb5oa` | 20,999 | 20,999 | none needed |

Two of these carry something that exists nowhere else in the platform:
`pr_release.with_whom` and `po_release.with_whom` name **who a document is
sitting with right now**, and `zmb5oa.intransit_quantity` is the only in-transit
figure anywhere. Neither is derivable from `core.*`.

### Source column names that lie

- `PR_RELEASE[PR_Sitting_Release]` sounds like a status. It holds the **PR
  number**, and is the only PR identifier in that table.
- `UB_GRIR[Text]` is renamed `doc_text`, since `text` is a type name.
- `PO_RELEASE[Segement]` and `[Account_Assignement]` are misspelled at source
  and preserved as-is in `src_cols`.


### The expected-count guard counts ROWS, not distinct rows

It used to be `COUNTROWS(SUMMARIZE(src, ...every column...))`, which counts
distinct combinations, while extraction uses `SELECTCOLUMNS`, which does not
deduplicate. Those agree only for a table with no exact duplicate rows — true of
all twelve original tables, which is why it went unnoticed, and provably so,
since each of them publishes successfully today.

`GR_DATA` breaks it. A goods receipt carries no material document number, so two
receipts of the same quantity against the same PO line on the same day are
genuinely identical rows — PO 4250000003 line 00010 has **52** of them. Measured
on the full table: `COUNTROWS` gives **935,619**, `SUMMARIZE` gives **849,175**.
The guard would have expected 86,444 fewer rows than were staged and skipped
`gr_data` as a count mismatch on every run, forever.

Deduplication, where a table wants it, belongs in `dax_source` — which is how
`material_plant_extension` does it, with
`SUMMARIZE('MB52', 'MB52'[Material], 'MB52'[Plant])`.

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

## Geography in the track views

`track.po_line` exposes `country` (the OPERATING country of the document),
`comp_code`, `comp_co_desc`, `opco_country` and `supplier_country`. `pr_line`
and `request_lifecycle` expose `country`, and `request_lifecycle` also carries
`po_countries` for the PO side.

These were missing from the first version of the views, and the omission caused
a real wrong answer. Asked for DHL purchase orders in Iraq, the agent had no
operating-country column and fell back to matching plant DESCRIPTIONS containing
"Iraq", which catches only a fraction.

`supplier_country` is not a substitute: it is the supplier's own country, not
where the order was raised.

Country values are SAP spellings — `Utd.Arab Emir.`, not `UAE` — so a filter
should be checked against `SELECT DISTINCT country` first.

## Bucket skew: when a bucket column cannot partition a table

**Resolved.** See below — the table was never a million rows; the extract was
asking for the wrong grain.

`release_strategy` would not load whole, and the reason generalises.

Bucketing takes `RIGHT(bucket_col, n)`, so the finest partition a table can have
is limited by that column's value distribution — and **`RIGHT(blank, n)` is
always blank**, so every row with an empty bucket column lands in the single
catch-all call, which no `bucket_chars` can split.

On `release_strategy` bucketed by `Plant`, 63,223 rows had a blank plant. That
catch-all was ~695,000 cells, roughly 32 MB, so Power BI truncated it silently
and the extraction stalled near 320,000 rows regardless of configuration — two
different setups landed within 300 rows of each other, which is what gave it
away. Re-bucketing on `Approver` (211 distinct values, 192 distinct 3-digit
endings) took it to 1,013,983 of 1,035,384.

Two things to take from this:

- **Choose a bucket column with high cardinality and few blanks.** Check before
  configuring: `SELECT count(DISTINCT right(col, n)), count(*) FILTER (WHERE col
  IS NULL OR col = '')`.
- **`TARGET_CELLS_PER_CALL` assumes buckets are evenly sized.** The planner
  divides total cells by bucket count; on a skewed column the hot buckets are
  many times that average and can exceed 15 MB even when the average looks safe.

The guard did its job throughout: every short extraction was refused rather than
published, so nothing incomplete ever reached the agent.

## receipt_state on a PO that was never approved

`po_line.receipt_state` used to fall through to **'Closed, nothing received'**
for any line with nothing received and nothing outstanding — including purchase
orders still awaiting approval, where nothing *could* have been received.
"Closed" reads as an outcome; those have not begun. It affected 2,061 Under
Release and 368 Draft lines.

There is now a `'Not started'` branch, placed **after** the real receipt checks
so a line that genuinely has a receipt keeps its true state even when the PO is
unreleased. That combination is not hypothetical — 6,249 Draft lines show
`Fully Received` — and it is an anomaly worth surfacing, not one to hide.

The agent is also told to match columns to the question: an approval question
shows release state, who is holding it and how long, and **no receipt or
delivery columns at all**, since nothing can be received before approval.

## Expected counts must be merged from EVERY dataset

When the loader became multi-dataset, `Build Range List` was updated to merge
`$('Fetch Expected Counts').all()` — one item per source model — but
`Swap Staging To Live` was left reading `.first()`.

The result was quiet and expensive. Extraction planned correctly for all 19
tables and staged them every day, but the publish step only ever saw the first
dataset's counts, so every table from every other model recorded
**`no expected count`** and was never published. Five tables sat on data from a
one-off manual load for five days while being re-extracted daily and discarded.

Both nodes now merge the same way, and the note on `Swap Staging To Live` says
so. If you add a dataset, check both.

### data_freshness only counts a swap or a merge as a load

It originally accepted any status that was not `SKIPPED%` or
`no staging table`, which let `no expected count` through — so a table that had
been refused was reported as freshly loaded. That is what hid the bug above.

The view now takes the last genuine swap or merge for `last_loaded_at`, and
exposes `last_attempt_status` separately, so a table that is being extracted but
refused is visible as exactly that.

## release_strategy: the fix was the grain, not the bucket

Two bucket columns were tried and both stalled near the same ceiling. The
diagnosis that settled it:

| | |
| --- | --- |
| Total rows | 1,035,928 |
| Distinct approvers | 258 |
| Distinct `RIGHT(Approver,3)` | 232 |
| Distinct `RIGHT(Approver,4)` | 256 |
| **Largest single approver** | **84,825 rows** |

One approver held 84,825 rows, all sharing the same value, so no `bucket_chars`
could ever split them — the same shape as the 63,223 blank plants. Bucketing
cannot partition below the cardinality of its column.

But the matrix was never a million rows. It is exploded across `Plant` and
`Document_Type`:

| Grain | Rows |
| --- | --- |
| everything | 1,035,928 |
| + plant | 128,070 |
| + document type | 75,347 |
| **strategy → step → approver, email, purchasing group, spend band** | **22,494** |
| strategy → step → approver | 9,857 |

A purchase order carries its own `release_strategy`, so plant and document type
are only the determinants of WHICH strategy applies — never needed to answer who
must approve a given document. Dropping them collapses the table 98%, and the
bucketing problem disappears rather than being worked around.

`track.po_line` now exposes `release_strategy`, which is the join. Without it
there was no path from a PO to its approval chain and the agent looped to its
iteration limit. 494 of 498 PO strategies match a chain.

## "GRN'ed", not "received"

"Received" was carrying three different meanings at once: goods physically
arriving, a goods receipt being posted in SAP, and a service entry sheet being
accepted. What the data actually measures is the **posting** — `receipt_state`
is derived from `delv_qty` and `still_delv_qty`, which move when a GRN is posted,
not when anything reaches the requester.

The states now say so:

| Was | Now |
| --- | --- |
| Fully Received | **Fully GRN'ed** |
| Partially Received | **Partially GRN'ed** |
| Awaiting Receipt | **Not GRN'ed** |
| Not started | **PO unapproved** |
| Closed, nothing received | **Closed, no GRN** |

`overall_stage` follows the same vocabulary, and the comparisons inside its
CASE were renamed with the labels they test — they are in the same `create_sql`,
so a partial rename would have silently broken the stage mapping rather than
erroring.

The agent is told to use "GRN'ed" or "a GRN has been posted", and to avoid
"received", "arrived" or "delivered" unless the user says them first, because a
GRN on a service line means a service entry sheet was accepted and nothing
physical arrived at all.
