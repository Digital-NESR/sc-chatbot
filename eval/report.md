# Track My Request — evaluation run, 14 October 2026

32 end-user questions put through the live Track My Request webhook
(`f14be5fd-0243-4594-b0f2-48181a8e2afa`), one fresh session per question,
three at a time. Every answer was then checked against SQL run directly
against `materials_db` — not against my own expectations.

| | |
| --- | --- |
| Questions | 32 |
| Answered | 30 |
| Hard failures | 2 (both "Max iterations (10) reached") |
| Total wall clock | 16m 07s |
| Average | 30s · median 31s · fastest 5s · slowest 83s |

**Score: 21 pass · 5 partial · 6 fail.**

Files: [questions.json](eval/questions.json) · [answers.json](eval/answers.json) ·
[ground_truth.json](eval/ground_truth.json) · [verify.json](eval/verify.json)

---

## Score by tier

| Tier | Pass | Partial | Fail |
| --- | --- | --- | --- |
| 1 · Where is my thing (Q1–5) | 4 | 1 | 0 |
| 2 · Why is it taking so long (Q6–11) | 3 | 2 | 1 |
| 3 · When will I get it (Q12–16) | 4 | 0 | 1 |
| 4 · Has it been paid (Q17–20) | 1 | 2 | 1 |
| 5 · Awkward / trap questions (Q21–26) | **6** | 0 | 0 |
| 6 · Harder, multi-step (Q27–32) | 3 | 0 | 3 |

The headline: **every trap question passed**, and **every failure is
mechanical** — a LIMIT clause reported as a count, or the agent running out
of iterations. Nothing in this run shows the agent misreading the business
data. The six failures are all fixable in the system prompt.

---

## Question-by-question

### Tier 1 — Where is my thing

| Q | Question | Expected | Got | Verdict |
| --- | --- | --- | --- | --- |
| 1 | Where is PR 1005026000? | Fully GRN'ed via PO 5190034063, 2 lines | Fully GRN'ed, PO 5190034063, both lines, GRN 28 Jul 2025 | **pass** |
| 2 | Has my order 5190034063 arrived yet? | Fully GRN'ed, but it's a **service line** — nothing physical arrived | Said GRN posted *and* flagged it as a service entry sheet | **pass** |
| 3 | What's happening with PO 5150009248? | Under Release, 12 lines, AED 589,596.77, with 0064 | Correct on all counts | **partial** |
| 4 | Did my request go through? | Must ask for an identifier | Asked for a PR or PO number | **pass** |
| 5 | Is there a PO for PR 1005026000 yet? | Yes — 5190034063, created 1 Jun 2025 | Correct | **pass** |

**Q3 partial.** The answer included a *Receipt State: PO unapproved* column.
The prompt's own rule says not to show GRN columns on an approval-stage
document. It is not wrong, just noise the prompt says to suppress.

### Tier 2 — Why is it taking so long

| Q | Expected | Got | Verdict |
| --- | --- | --- | --- |
| 6 | Waiting with 0064, 3 days | Right answer, wrong presentation | **partial** |
| 7 | Chase 0064 (Bashar Al Arar is the *buyer*, not the approver) | Right, but see below | **partial** |
| 8 | PR signed 26 May 2025, nobody holding it | Correct — said it is not sitting with anyone | **pass** |
| 9 | **16,191 PR lines** approved with no PO | *"50 PR lines"* | **fail** |
| 10 | 3 days is normal, not stuck | Correct and well-judged | **pass** |
| 11 | 493 PRs / 1,972 lines; 959 POs / 3,187 lines | **493 / 1,972 and 959 / 3,187 — exact** | **pass** |

**Q6.** Printed twelve identical rows — same PO, same approver, same 3 days —
against the prompt's explicit *"when every row of a column is the same value,
say it once"*. It also used raw column names as table headers
(`po_number`, `po_item`, `waiting_with`) instead of readable ones. And it
answered *who* rather than *why*, which is what was asked.

**Q7.** Said the PO was *"created 10 October 2026, but never submitted for
approval"* — while simultaneously saying it is sitting with an approver.
Both statements come from real columns (`submitted_on` is null) but together
they read as a contradiction to anyone chasing the order.

**Q9 — first instance of the biggest problem in this run.** The agent ran a
query with `LIMIT 50`, got 50 rows back, and reported *"50 PR lines"* as if
that were the answer. The true figure is **16,191**. Trap 7 in the prompt
says *"counts come from COUNT(\*)"* — the agent did not apply it.

### Tier 3 — When will I get it

| Q | Expected | Got | Verdict |
| --- | --- | --- | --- |
| 12 | Delivery date for 5190034063 | Correct | **pass** |
| 13 | 4160008900 — part shipped | Correct, and used the in-transit figure | **pass** |
| 14 | 38,400 received, 21,600 in transit of 60,000 | **Exact** | **pass** |
| 15 | Yes — 21,600 on the water | Correct, with supplier name | **pass** |
| 16 | **6,680 lines across 1,905 POs** overdue | *"50 open POs"* | **fail** |

### Tier 4 — Has it been paid

| Q | Expected | Got | Verdict |
| --- | --- | --- | --- |
| 17 | Not paid — invoice 8600013484, SAR 3,066.71, overdue | Correct | **partial** |
| 18 | **24,228 open GR/IR items, 5,546 POs** | Showed 50 oldest, gave no total | **partial** |
| 19 | **356,233 overdue invoices across 209,878 POs** | *"50 invoices that are overdue"* | **fail** |
| 20 | Explain how to check payment status | Clear, correct walkthrough | **pass** |

**Q17 / Q19 — a data-semantics problem, not an agent problem.** Every unpaid
invoice prints its balance as a **negative** number: invoice amount
`3,066.71`, payment amount `0`, balance `−3,066.71`. That is SAP's credit-side
sign convention, and `payment_state` resolves it correctly, but showing a user
*"balance −3,066.71"* for an invoice that is fully outstanding is confusing.
The agent is reporting the column faithfully; the column needs either a
documented explanation or an `abs()` in the view.

### Tier 5 — Awkward questions (the traps)

**All six passed.** This is the most important result in the run.

| Q | The trap | What the agent said |
| --- | --- | --- |
| 21 | *"0 received on PO 5180004834, so nothing turned up, right?"* — the premise is wrong; these are service lines | *"Actually, GRNs have been posted… these are service lines"* — refused the premise |
| 22 | *"Last thing we ordered from DHL in Iraq"* — `ILIKE '%DHL%'` matches the surname **Alfadhli** | Found supplier `0001100142` first, answered PO 5290004482 line 120 (20 Oct 2025), **and stated the filter it used**. Verified correct. |
| 23 | *"What is the GRN number for PO 5190034063?"* — no material document number exists anywhere | *"I don't have a GRN document number… known limitation"* |
| 24 | *"Where exactly is the shipment right now?"* — there is no location data | *"I cannot tell you the exact physical location"* |
| 25 | *"Which PR line turned into which PO line?"* — links at document level only | *"links at the document level (95.5%), not line by line"* |
| 26 | *"What have I got outstanding?"* — no identity available | Asked for an identifier, and mentioned Materials AI for the stock half |

Q22 is worth calling out. The exact mistake that triggered this whole piece of
work — matching a supplier by text in a description and returning a hotel
booking — did not recur. The agent resolved the supplier number first and
disclosed its method unprompted.

### Tier 6 — Harder, multi-step

| Q | Expected | Got | Verdict |
| --- | --- | --- | --- |
| 27 | Full approval chain for PO 5150009248 (steps 2A/A8/A9) | **Error in workflow** | **fail** |
| 28 | MKHATTAB: 239 lines, 5 POs, oldest 1,876 days | **239 / 5 / 1,876 — exact** | **pass** |
| 29 | **5,923 lines** approved, overdue, not GRN'ed | *"50"* | **fail** |
| 30 | Full history of PR 1005026000 | **Error in workflow** | **fail** |
| 31 | 3 open GR/IR from supplier 0001100142 | Correct, AED 6,485.46, caught a likely already-clearing line | **pass** |
| 32 | PR top: 5588/292 lines. PO top: 16866/276 lines | **Both exact** | **pass** |

**Q32** deserves a note. The headline named 6053 (179 lines, 494-day average)
and MKHATTAB (239 lines, 1,873-day average) rather than the two approvers
holding the most lines. The tables underneath are numerically exact. Reading
"bottleneck" as *who has held things longest* rather than *who holds the most*
is a defensible call, and it showed both.

---

## The six failures, and what causes them

### F1 — `LIMIT 50` reported as a count · Q9, Q16, Q18, Q19, Q29

Five of thirty-two answers. The worst case told the user there are
**50 overdue invoices** when there are **356,233**.

| Q | Said | Actually |
| --- | --- | --- |
| 9 | 50 PR lines | 16,191 |
| 16 | 50 open POs | 6,680 lines / 1,905 POs |
| 18 | 50 (implied) | 24,228 items / 5,546 POs |
| 19 | 50 invoices | **356,233** / 209,878 POs |
| 29 | 50 POs | 5,923 lines |

Hard rule 2 says *"always add LIMIT (50 unless asked for more)"*. Trap 7 says
*"counts come from COUNT(\*)"*. The two rules sit in different sections and the
agent follows the first and forgets the second. Q19's hedge — *"50 invoices
that are overdue (and possibly more)"* — shows it half-knew.

**Proposed fix.** Merge the two rules into one instruction at the point of
use: any question phrased as *which / how many / is there anything* takes
**two** queries — a `COUNT(*)` with no LIMIT for the headline, then a
`LIMIT 50` sample for the table. State the real total in the first sentence
and label the table "showing the oldest 50 of N".

### F2 — Max iterations, caused by guessed column names · Q27, Q30

Confirmed from the n8n execution trace (execution 25433). The agent's ten
iterations on Q30 went:

| # | What it did | Result |
| --- | --- | --- |
| 1 | `SELECT pr_num … request_lifecycle` | `column "pr_num" does not exist` |
| 2 | `SELECT pr_num … pr_waiting_with` | same error |
| 3 | `SELECT po_num … po_waiting_with` | `column "po_num" does not exist` |
| 4 | `SELECT po_num … goods_receipt` | same error |
| 5 | `SELECT po_num … invoice` | same error |
| 6 | `information_schema` for `request_lifecycle` | column list |
| 7 | **the actual answer** | correct rows |
| 8 | `information_schema` for `goods_receipt` | column list |
| 9 | GRN query | correct rows |
| 10 | `information_schema` for `invoice` | — **limit reached** |

**Five of ten iterations were spent guessing `pr_num` and `po_num`** when the
columns are `pr_number` and `po_number`. Another four were `information_schema`
round-trips. One iteration out of ten did real work.

The prompt lists all sixteen views and their grain, but not a single column
name — it tells the agent to go and look them up. At ten iterations, that
budget does not survive a question that touches four views.

**Proposed fix, in order of effort:**
1. Put the key columns in the prompt: *every view keys on `pr_number`,
   `pr_item`, `po_number`, `po_item` — never `pr_num` or `po_num`.* One line
   would have saved five iterations.
2. Add a compact column dictionary for the six most-used views, so
   `information_schema` is a fallback rather than the first step.
3. Raise max iterations from 10 to 15.

(1) and (2) are the real fix; (3) alone would just let it waste more.

### F3 — Zero rows arrives as `[{"success":true}]`

Visible in the same trace. `SELECT … FROM track.pr_waiting_with WHERE
pr_number = '1005026000'` correctly matched nothing — the PR is fully
released — and the tool returned `[{"success":true}]`, not an empty array.

Nothing in the prompt says what that means. The agent treated it as an
anomaly and spent a further iteration probing. **An empty result that does not
look empty is exactly the shape of error that produces a confidently wrong
answer** — this is the same class of problem as the `\m`/`\M` escapes, which
also returned zero rows silently.

**Proposed fix.** One line in the Traps section: *`[{"success":true}]` from
`query_track_db` means the query ran and matched zero rows. It is an empty
result, not an error — go to Trap 1.*

### F4 — Presentation · Q6

Twelve identical rows, and raw column names as headers. Both are already
covered by the prompt; the instruction is just buried mid-section. Worth
moving the "say it once" rule into the hard rules and adding *"table headers
are readable English, never raw column names."*

### F5 — Negative invoice balances · Q17, Q19

As above. Either document the sign convention in `col_comments` so the agent
can explain it, or wrap `invoice_balance` in the `track.invoice` view. I lean
towards documenting it — flipping the sign would diverge from what the source
model and SAP both show, and anyone cross-checking would be confused.

### F6 — Receipt column on an unapproved PO · Q3

A single instance, and the mildest finding. The rule exists; the agent applied
it on Q6 and Q7 but not on the general-status question. Probably needs the
rule restated for the *"what's happening with"* case specifically.

---

## What is working

Worth stating plainly, because it is most of the run:

- **All six trap questions passed.** The service-line trap, the DHL supplier
  trap, and three separate "we do not have that data" questions were all
  answered correctly, including volunteering the limitation rather than
  guessing.
- **Every aggregate that used `COUNT(*)` was exact.** Q11, Q28 and Q32 match
  ground truth to the row. The data layer is sound; the failures are in how
  results are summarised, not in what is retrieved.
- **The agent discloses its method.** Q22 stated the filter it used
  unprompted, which is what makes a wrong filter visible instead of hidden.
- **It asks instead of assuming.** Q4 and Q26 both stopped and asked for an
  identifier rather than inventing a scope.
- **Response times are usable.** Median 31s, and the two slowest (83s, 61s)
  were both large unbounded-looking list questions — which F1 would also make
  faster, since a `COUNT(*)` plus 50 rows beats dragging 50 wide rows back for
  the model to reason over.

---

## Recommended order of work

Nothing here has been changed yet — this is the report, as asked.

1. **F1** — the count rule. Five questions, one of them off by a factor of
   7,000. Highest value, lowest risk, prompt-only.
2. **F2** — key column names plus a short column dictionary in the prompt.
   Turns two hard failures into answers.
3. **F3** — one line documenting `[{"success":true}]`. Cheap, and it closes a
   silent-wrong-answer path.
4. **F5** — document the `invoice_balance` sign convention in `col_comments`.
5. **F4 / F6** — presentation rules, promoted into the hard rules.

F1–F4 are all edits to the Track My Request system prompt. F5 is a
`col_comments` edit, which flows through `/admin/columns` and survives every
swap. No schema or view changes are needed for any of this.

Re-running this same 32-question set after the changes gives a direct
before-and-after, since `eval/ground_truth.json` is already measured.
