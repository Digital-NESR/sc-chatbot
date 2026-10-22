# Email draft: the all_plants table in rfx_officer

Fill in **[brackets]** before sending. The connection host is deliberately left blank,
so you can decide whether to put it in the email or send it separately.

---

**Subject:** Plant reference table now available in rfx_officer

---

Hi [Name],

The plant reference data is now available in our database, refreshed automatically every
morning. Details below.

**Where it is**

| | |
|---|---|
| Database | `rfx_officer` |
| Schema | `public` |
| Table | `all_plants` |
| Server | [same Postgres server as the rfx_officer app, host available on request] |
| Rows | 354, one per plant |
| Refreshed | Daily at 08:00 Gulf time |

**Structure**

| Column | Type | What it holds |
|---|---|---|
| `plant_code` | text | 4-digit SAP plant code. Primary key, unique across all 354 rows. This is the join key. |
| `co_code` | bigint | SAP company code. Numeric, so cast it when joining to a text column. |
| `legal_entity` | text | Full legal entity name, e.g. "National Petroleum Technology Company Limited" |
| `sap_plant_name` | text | Plant name as it appears in SAP, e.g. "Cementing - NPT - KSA" |
| `sap_segment` | text | Segment in SAP terms, e.g. "Cementing", "Coiled-Tubing" |
| `segment_group` | text | Higher grouping, e.g. "Production" |
| `country_of_legal_entity` | text | Full country name, e.g. "Saudi Arabia" |
| `reporting_country_finance` | text | Country as Finance reports it, e.g. "KSA" |
| `reporting_segment_finance` | text | Segment as Finance reports it, e.g. "Cementing Services" |
| `reporting_segment_group_finance` | text | Segment group as Finance reports it |
| `country_segment` | text | Finance country and segment combined, e.g. "KSA-Cementing Services" |
| `loaded_at` | timestamptz | When the row was last refreshed at source |
| `synced_at` | timestamptz | When this copy was last refreshed |

**Three things worth knowing before you use it**

1. **There are two versions of country and segment, and they are not the same.**
   `country_of_legal_entity` gives "Saudi Arabia" while `reporting_country_finance` gives
   "KSA". Likewise `sap_segment` gives "Cementing" while `reporting_segment_finance` gives
   "Cementing Services". Pick whichever matches what you are reporting against, rather than
   whichever you reach first.

2. **The table is read only in practice.** The daily refresh empties and reloads it, so
   anything written directly will be lost the next morning. If you need extra columns,
   join rather than add.

3. **One row is incomplete at source.** Plant `1733` (Stimulation & Pumping, KSA) has no
   `co_code` and no `legal_entity`. That is how it arrives from the source system, not a
   problem with the copy. Worth allowing for if you join on company code.

**Example**

```sql
SELECT p.plant_code, p.sap_plant_name, p.reporting_country_finance, p.sap_segment
FROM public.all_plants p
WHERE p.reporting_country_finance = 'KSA'
ORDER BY p.plant_code;
```

To check how current it is:

```sql
SELECT max(loaded_at) AS source_updated, max(synced_at) AS copy_updated
FROM public.all_plants;
```

**Where it comes from**

The source is the "All Plants" table in Power BI. It lands in our materials database
first, and a scheduled job copies it into `rfx_officer` each morning. Because the copy runs
before the daily source refresh, the data is usually about half a day behind, which is not
an issue for plant reference data that changes a few times a year. The two timestamp
columns let you see both ages.

Three fields that exist in the Power BI table are not available yet: Budget Segment,
Reviewed Country and Reviewed Segment. Let me know if you need any of them and I can have
them added.

Happy to walk through it if useful.

Thanks,
[Your name]

---

## Notes for you, not part of the email

- Host is `[DB_HOST from .env.local]`, port 5432, SSL required. Send it separately from
  any credentials.
- The refresh is the n8n workflow "All Plants Imports to SQL" in SC Agents, folder RFx
  Officer.
- If they ask for the three missing fields, that is a change to `src_cols` and `pg_cols` on
  the `all_plants` row in `core.load_config`, plus three `ALTER TABLE ADD COLUMN` on both
  sides. Half an hour.
