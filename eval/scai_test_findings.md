# SCAI / Materials AI test results — findings and proposed fixes

Source: `SCAI TEST.docx` (11 screenshots, reviewed 21 Oct 2026).
Every claim below was checked against `materials_db` before being written down.

**Nothing has been changed.** This is for approval. Annotate inline and tell me which
items to proceed with.

---

## What passed

Worth recording so we do not "fix" working behaviour.

| # | Test | Result |
| --- | --- | --- |
| P1 | MPN format variants: `LN2INS870` typed, `LN2-INS-870` stored | Found correctly |
| P2 | Spaces and backslashes removed: `435-5142` vs `4355142` | Both matched |
| P3 | Partial MPN: `8200FDN8` typed, `MC8200FDN8Z` stored | Surfaced it and asked the user to verify rather than asserting a match. Correct behaviour. |
| P4 | Manufacturer name not in the manufacturer field | Identified it from the description |
| P5 | Supersession chain `RS3514/AF25137M` → 32915 → 32207 → 117579 | Followed to the live material |
| P6 | Double MPN / customised solution | Triggered correctly |

Part-number normalisation is sound. The defects below are about **scope**, **which column is
searched**, and **deletion status** — not about matching.

---

## D1. Sales and asset materials are in scope

**Your note:** "Need to remove sales 71XXX and asset 91XXX materials from SCAI"

**Measured in `core.material_master_data` (309,193 rows):**

| Range | Rows | Share | In scope? |
| --- | --- | --- | --- |
| Sales `71xxx` | 183,862 | 59.5% | No |
| Stock `11xxx` | 112,822 | 36.5% | Yes |
| Asset `91xxx` | 6,187 | 2.0% | No |
| Other | 6,322 | 2.0% | Undecided |

**61% of the table is material that should never appear in a duplicate check.**

This is what produced the failure in screenshot 1: searching `P141228` returned
`000007100000141228`, description "10.7.1.11.2 AlYasat Weekly", material type ZSER. A weekly
service subscription, offered as a candidate duplicate for an air filter.

### Proposed fix

Exclude at the **loader**, not in each query, so the pgvector index and every table inherit the
same scope. A query-level filter would have to be repeated in the agent prompt, the embedding
build and anywhere else the table is read, and would drift.

**Two decisions needed before I touch anything:**

1. **Exclude by number range (`71*`, `91*`) or by `material_type`?** They may not agree. ZSER
   appears to be the service type, but I have not confirmed the full mapping.
2. **What happens to the 6,322 "other" rows?** They are neither 11, 71 nor 91. They need a
   ruling before I write a filter that silently drops them.

**Risk to weigh:** removing rows at the loader removes them for *every* consumer, including
any join from `supplychain` or `inventory_movement` to the material master. If those need the
full set, the alternative is to keep loading everything and filter in the agent plus the
embedding build. Slightly more surface, no data loss. Say which you prefer.

---

## D2. Part-number search matches the MATERIAL NUMBER, not just the MPN

**Your note:** "Also, results are different than SAP"

**What SAP returns for `P141228`** (screenshot 2): material `1100000004885`,
"FILTER AIR # SANJEL UNIT", MPN `AF1797M/P141228/`.

**What SCAI returned:** `000007100000141228`. It matched the digits `141228` inside the
*material number*, not the MPN.

### Root cause, which is subtler than it looks

Section A step 1 of the Materials AI prompt normalises both sides and compares for
**equality**:

```sql
WHERE upper(regexp_replace(manufacturer_part_no, '[^A-Za-z0-9]', '', 'g'))
    = upper(regexp_replace('P141228', '[^A-Za-z0-9]', '', 'g'))
```

`AF1797M/P141228/` normalises to `AF1797MP141228`, which does not equal `P141228`.

**Verified: this returns 0 rows.** With no exact hit the agent improvises a looser search and
lands on the material number.

### Proposed fix

Add a normalised **containment** step on `manufacturer_part_no`, and state explicitly that a
user-supplied part number is never matched against the `material` column.

```sql
WHERE upper(regexp_replace(coalesce(manufacturer_part_no,''), '[^A-Za-z0-9]', '', 'g'))
      LIKE '%' || upper(regexp_replace('P141228', '[^A-Za-z0-9]', '', 'g')) || '%'
```

**Verified: returns exactly the two correct materials**, `1100000004885` (deletion-flagged,
successor `1100000119109`) and `1100000119109` (live). That is the answer you were expecting.

Prompt-only change. Low risk.

---

## D3. A dead query step: `\m` / `\M` returns zero rows, silently

Not in your test document. Found while checking D2, and it undermines a protection you are
relying on.

Section A step 3 of the Materials AI prompt reads:

```sql
AND material_description ~ '\mNUMBER\M'
```

Those are Postgres word-boundary escapes. **Through this connection they always return 0
rows.** Verified side by side:

| Query | Rows |
| --- | --- |
| `material_description ~ '\m1797\M'` (as the prompt has it) | **0** |
| `material_description ~ '(^|[^0-9])1797([^0-9]|$)'` | **2**, both correct |

The step exists specifically to stop "Type 120" matching "Type 128" — the prompt says so. It
has never run. The same bug was found and fixed in Track My Request; this copy was missed.

### Proposed fix

Replace both `\m...\M` usages with explicit character classes. Prompt-only. Lowest risk and
highest value of anything on this list, because the step currently fails silently rather than
erroring.

---

## D4. Deletion-flagged materials recommended, successor not followed

**Your note:** "The codes below are flagged for deletion and appear"

**SAP** (screenshot 6) shows four materials, three flagged at client level:

| Material | Description | MPN | Deletion flag | Successor |
| --- | --- | --- | --- | --- |
| 1100000004885 | FILTER AIR # SANJEL UNIT | `AF1797M/P141228/` | **X** | 1100000119109 |
| 1100000016640 | Fleedgaurd Air Filter AF1797M | `AF1797M` | **X** | 1100000119276 |
| 1100000119109 | FILTER AIR # SANJEL UNIT | `AF1797M P141228` | — | — |
| 1100000119276 | Fleedgaurd Air Filter AF1797M | `AF1797M` | **X** | 1100000119109 |

SCAI recommended `1100000119276` (screenshots 4 and 5) and never mentioned deletion status.

**The data supports doing this properly.** `df_at_client_level` is populated: 45,708 of
309,193 rows carry `X`. `successor_code` is filled on 23,395 of those. **The Materials AI
prompt never mentions either column.**

### The revealing part

SCAI *did* handle supersession correctly in two other tests (screenshots 7 and 12). In both,
the description literally read `DEL USE 1100000025682`. In the AF1797M case the descriptions
look like ordinary descriptions, so it missed it completely.

**It is reading the description text, not the deletion flag.** That is why the behaviour looks
inconsistent: it works only when the master data happens to spell it out.

### Proposed fix

In the duplicate-check section of the prompt:

1. Always select `df_at_client_level` and `successor_code` alongside the identifying columns.
2. Never recommend a material whose flag is set. Say it is flagged and name the successor.
3. Follow `successor_code` to the end of the chain and recommend the live material.
4. Where a flagged material has no successor (22,313 rows), say so rather than recommending it.

Prompt-only change.

---

## D5. Results differ from SAP: partly freshness, not logic

Worth separating from D2, because the fix is different and this one cannot be fully closed.

Your SAP screenshot is dated **20 Oct 2026** and shows `1100000119276` flagged with successor
`1100000119109`. **Our copy shows it active, with no successor.**

| | |
| --- | --- |
| `material_master_data` last loaded | 20 Oct 09:21 |
| Newest `last_change` in our copy | 18 Oct |
| Your SAP report | 20 Oct |

So SAP was changed after our snapshot was taken. We can only ever be as fresh as the Power BI
semantic model we read from, which refreshes on its own schedule.

By that reading, SCAI recommending `119276` was defensible against the data it had. D4 still
stands independently: it did not check the flag at all, and 45,708 materials are flagged
*today*.

### Proposed fix

- State the data age on any duplicate or "safe to create" verdict, so a stale answer is
  visible rather than silent.
- Check the refresh cadence of the source model to establish the real floor on lag.
- If the gap is material, consider whether master data needs a more frequent pull than the
  rest.

I cannot close this one by code alone. It needs a decision about acceptable lag.

---

## Suggested order

| Order | Item | Type | Risk |
| --- | --- | --- | --- |
| 1 | **D3** dead `\m\M` step | Prompt | Lowest. Currently fails silently. |
| 2 | **D2** MPN containment, never match `material` | Prompt | Low. Verified against the failing case. |
| 3 | **D4** deletion flag and successor chain | Prompt | Low. Data already present. |
| 4 | **D1** remove sales and asset materials | Loader | Needs your scope ruling first. |
| 5 | **D5** freshness disclosure | Prompt + investigation | Cannot be fully closed. |

D3, D2 and D4 are one edit to the Materials AI system prompt and fix every wrong result in
your document. D1 is the larger change and is blocked on the two questions above.

After any of these land I would re-run your six test cases plus the AF1797M case, against
measured SQL rather than by eye.
