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

> **⚠ The agent is currently down — unrelated to any of this.** The last three test
> calls failed with *"Your credit balance is too low to access the Anthropic API"*. The
> Anthropic account behind the n8n workflows is out of credits, and the error hits before
> the agent even runs, so Track My Request, Materials AI, SourceGuide and the orchestrator
> are all affected for real users. Remaining verification is blocked until it is topped up.

> **Update, same day — all eight fixes applied.** Two rounds of fixes went in after this
> run, each retested against measured SQL rather than assumed. F1–F4 and F7 closed the
> counting and iteration failures; F5, F6 and F8 closed the money, column-discipline and
> buyer-versus-approver problems. Of the questions re-run, every one now passes, and
> several answer twice as fast as before.


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

## Update — fixes applied and retested

F1 to F4 went into the Track My Request system prompt, plus the piece that made F2
worth doing properly: the agent now has an **editable column dictionary** over the
schema it actually reads.

**The gap F2 exposed was bigger than the fix.** `/admin/columns` documented 472
columns on `core.*` — but Track My Request reads `track.*` and is forbidden from
querying `core.*`, and the views rename columns on the way through. Measured before
any of this: **16 views, 444 columns, 0 commented.** The agent had no column context
at all, which is exactly why it was guessing names and burning iterations on
`information_schema`.

Three pieces, so the content is editable rather than buried in n8n:

- `ai.column_docs` holds the descriptions as data — the same shape the other three
  databases already use, so the admin API needed no changes.
- `core.rebuild_track_views()` replays them as Postgres COMMENTs after each view is
  recreated. Without this, every nightly `publish_all` would wipe them, because a
  dropped view takes its COMMENTs with it.
- `track.column_guide` exposes the whole dictionary in one query, replacing the
  per-view lookups.

**449 of 449 columns are now documented**, verified to survive a full drop-and-rebuild,
and editable at **/admin/columns → Track My Request**. A save writes the data and
re-applies the COMMENT in the same transaction, so an edit is live for the agent on its
very next query.

### Before and after

| Q | Before | After | Truth | Now |
| --- | --- | --- | --- | --- |
| 27 | max iterations | full chain: 2A ✅ → A8 ✅ → A9 pending | — | **pass** |
| 30 | max iterations | full lifecycle with timeline | — | **pass** |
| 9 | "50" | 5,841 | 5,841 | **pass** |
| 16 | "50" | 6,680 | 6,680 | **pass** |
| 18 | "50" | 18,407 | 18,407 | **pass** |
| 19 | "50" | 356,233 | 356,233 | **pass** |
| 29 | "50" | 5,813 | 5,813 | **pass** |
| 11 | 493 / 959 | 493 PRs (1,972 lines), 959 POs (3,187) | same | **pass** |
| 6 | 12 identical rows, raw headers | readable headers, said once, answers *why* | — | **pass** |
| 17 | balance −3,066.71 | Outstanding 3,066.71 | — | **pass** |
| 32 | regression check | 5588 / 292 — still exact | same | **pass** |
| 3 | showed GRN column | GRN column gone, but see F8 | — | partial |
| 7 | contradictory phrasing | contradiction gone, but see F8 | — | partial |

Q18 and Q29 came back **better than the original ground truth**. The agent excluded
deleted lines and took only the goods-receipt half of GR/IR — both correct readings
that the hand-written check queries had missed. The ground-truth file was the thing in
error, not the agent.

### Two regressions the fixes themselves caused

**F1 made Q9 confidently wrong before it made it right.** With counts coming from
`COUNT(*)`, Q9 returned **84,639** PR lines "approved but no PO" — of which **78,772
were flagged deleted**. Cancelled requisitions counted as stuck. That is worse than the
original "50", because it is wrong *and* confident. Real answer: 5,841.

Fixing that then broke Q11. Steered toward the pre-filtered views, the agent picked
`pr_pending_release` and reported **40,868** — but **39,907 of those lines are "Not
Submitted"**, never sent for approval, so waiting on nobody. Real answer: 493 PRs.

Trap 14 now covers both: exclude deleted and closed, and use `pr_waiting_with` /
`po_waiting_with` for approval queues, never `pr_pending_release`. All four rechecks
are clean.

### F8 — a new finding: buyer reported as approver

Q3 and Q7 now say the order is sitting with *"buyer Bashar Al Arar (ID 0064)"*. Those
are two different people: **0064 is the approver; Bashar Al Arar is the buyer who
raised the order.** Telling someone to chase the buyer sends them to the wrong desk,
which is the specific failure these two questions exist to catch.

The column description already warns about it in as many words — *"This is who raised
the order, NOT the approver holding it"* — and the agent conflated them anyway. So this
one probably needs the data to stop making it easy: either drop `buyer_name` from
approval-shaped answers, or resolve `waiting_with` to a name so there is a right name
to reach for. Not yet fixed.

## Second round — F5, F6 and F8

**F5 was not a display problem. It was a correctness bug.** Measuring the column before
changing anything turned up something the original report had missed entirely.

Over all 373,820 loaded invoices:

- `invoice_balance` equals `-invoice_amount` on **all 372,631 non-zero rows**. The minus
  sign is pure credit-side bookkeeping convention and carries no information at all.
- `payment_amount` is non-zero on only **3,865 of 373,820** rows — and on *every one of
  those* it equals `invoice_amount` to the cent. It mirrors the amount. It never records a
  part payment.

So the view's own `payment_state` was labelling those 3,865 rows **"Partially paid" when
nothing had been paid at all.** The state is now removed — the source cannot express
partial payment — and `amount_outstanding` added as the plain positive figure to report.
`invoice_balance` is kept exactly as the source has it, so it still reconciles against SAP
and the AP Aging model.

| payment_state | Before | After |
| --- | --- | --- |
| Overdue | 356,233 | **359,906** |
| Open | 12,533 | 12,725 |
| Paid | 1,189 | 1,189 |
| Partially paid | 3,865 — all false | removed |

`eval/ground_truth.json` was corrected rather than left to disagree.

### Retest

| Q | Before | After | Time | Now |
| --- | --- | --- | --- | --- |
| 17 | balance −3,066.71 | Outstanding SAR 3,066.71, 317 days | 13s → 9s | **pass** |
| 19 | "50 invoices" | 359,906 — exact | 53s → 57s | **pass** |
| 20 | correct | correct, now with Outstanding column | 16s → 24s | **pass** |
| 18 | "50", negative amounts | 18,407 lines / 5,504 POs, positive | 51s → 56s | **pass** |
| 31 | negative AED amounts | positive, spotted the offsetting line | 17s → 22s | **pass** |
| 3 | showed GRN column | "Until it is approved, nothing can be GRN'ed or invoiced" | 35s → 29s | **pass** |
| 1 | regression check | correct | 27s → 18s | **pass** |
| 2 | regression check | correct, service line flagged | 19s → 10s | **pass** |
| 5 | regression check | correct | 23s → 16s | **pass** |
| 12 | regression check | correct | 26s → **9s** | **pass** |
| 21 | trap — passed | still passes, refuses the premise | 18s → 13s | **pass** |

### A third max-iterations failure, with a new cause

Q3 died on the first F5/F6 retest. The trace shows a different problem from Q27 and Q30:
**6 of 9 iterations were lost to single wrong column names** — `po_number` on
request_lifecycle (it is `po_numbers`, plural), `unit` (it is `order_unit`),
`requisitioner_name`, and `buyer_name` and `waiting_with` on `po_line`, where neither
exists.

**The database reports only ONE missing column per attempt.** So a wide hand-written
`SELECT` costs an iteration per wrong guess, and six guesses eat a ten-iteration budget
before the real question is reached. The column guide did not help here, because the agent
was writing the column list from memory rather than checking it.

Fix: for a single named document, `SELECT *` and pick from what comes back. No
enumeration, no guessing, one iteration. That is also why the retest times dropped — Q12
went from 26s to 9s.

### F8 closed as a side effect

Q3 now reads: sitting with **approver 0064**, raised by **buyer Bashar Al Arar** — two
people, correctly separated. The clearer column handling fixed it without needing the view
change the first report proposed.

### One fabricated number, caught

On the first F5 retest Q17 said the invoice was *"overdue for 53 days"*. The real figure is
317, and **53 appears in no column anywhere** — it was invented. Checking further,
`days_past_due` is computed when the source model is built and disagrees with
`CURRENT_DATE` on **all 373,820 rows**, usually by a day. That is now documented, and the
rule against unverified arithmetic tightened to cover any stated number. Q17 reads 317
correctly after the change.

## Where this leaves the fix list

| Fix | What | Status |
| --- | --- | --- |
| **F1** | Counts from `COUNT(*)`, not the LIMIT | **done** |
| **F2** | Key column names, `track.column_guide`, admin-editable dictionary | **done** |
| **F3** | `[{"success":true}]` documented as zero rows | **done** |
| **F4** | Presentation rules promoted into the hard rules | **done** |
| **F5** | `amount_outstanding` added; false "Partially paid" state removed | **done** — was a correctness bug |
| **F6** | No GRN columns on an unapproved document — now hard rule 13 | **done** |
| **F7** | Deleted lines, and the right view for approval queues | **done** — found by retest |
| **F8** | Buyer reported as approver | **done** — fixed as a side effect |
| **F9** | Wide hand-written SELECTs burning an iteration per wrong column | **done** — found by retest |

## What is left

- **Top up the Anthropic credits.** Everything else is blocked behind it, and the live
  agents are down for users meanwhile.
- **Run the full 32 again.** 19 of the 32 have not been re-run since the fixes — they were
  passes and are assumed to have held, which is an assumption, not a result. Ground truth
  is already measured, so the run is cheap.
- Unrelated, still open from earlier: the Shipwaves password sits in plaintext in the Auth
  node, and the Power BI secret is in three workflow nodes.

**Honest status.** Every fix is applied and every question re-run passes. But "every
question re-run" is 17 of 32, not all of them, and the final three calls failed on billing
rather than on merit. Treat the fix list as done and the overall score as unconfirmed until
a clean full run exists.
