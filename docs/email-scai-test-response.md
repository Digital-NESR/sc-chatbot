# Email draft: replying to the SCAI test results

Fill in **[brackets]** before sending. Written for a business reader, so it avoids
database detail. Attach or reply to their original document.

---

**Subject:** RE: SCAI test results, all points fixed

---

Hi [Name],

Thank you for the test document. Every issue you raised is now fixed and live. Details
below, along with what I found when I re-ran your cases.

**1. Sales and asset materials appearing in results**

Fixed. Searches now cover stockable material only.

This turned out to be bigger than it looked: **61% of the material master, about 190,000
records, is sales or asset material**. That is why your search for P141228 returned
"AlYasat Weekly", a service subscription. Those records are excluded from searching but
remain in the database, so they are still available for reporting and analysis.

**2. Results differing from SAP**

Fixed. The assistant was matching your part number against the SAP material number
instead of the manufacturer part number, which is how P141228 matched a service record
that happened to contain those digits.

It also could not find a part number written inside a longer one, so it missed
AF1797M/P141228/ entirely. Both are corrected. Searching P141228 now returns the correct
air filter and recommends material **1100000119109**, which matches SAP.

**3. Codes flagged for deletion still appearing**

Fixed, and this was the most important of the three. The assistant was not reading the
deletion flag at all. Where it appeared to handle supersession correctly, that was only
because the description happened to spell it out, as in "DEL USE 1100000025682". Where
the description looked normal, it missed it completely.

It now checks the deletion flag on every search and follows the replacement chain to the
end. Your AF1797M example runs 1100000016640 to 1100000119276 to **1100000119109**, and
only the last one is live. That chain is three steps, so a single lookup would still have
given the wrong answer.

**4. Your passing observations**

I re-ran all six and they still work: part numbers with dashes or spaces removed,
partial part numbers, identifying a manufacturer from the description, and the double
part number cases.

**One more issue, which your testing method would have caught**

While re-running your cases I asked for "the Fleetguard filters we have". The assistant
returned a tidy six row table, and five of the rows were **invented**. One was really a
Magnaloy insert, another a butterfly valve, another a record whose description is simply
"Deleted". The part numbers it quoted were genuine Fleetguard catalogue numbers, which is
exactly why the answer read so convincingly.

This is now fixed. The same question returns 58 real materials, all verified against the
database.

I raise it because it is the hardest kind of error to spot. It cannot be caught by
reading the answer, only by checking it against SAP, which is precisely what you did on
the other points. Worth keeping that approach for any future round.

**Where things stand**

Everything in your document is resolved and live. The assistant now:

- searches stockable material only
- matches on the manufacturer part number, including part numbers inside longer ones
- checks the deletion flag and follows the replacement chain to the live material
- reports only what it finds, rather than filling gaps

If you have time for another pass, I would value it. Comparing against SAP as you did
last time is the test that matters.

Thanks again, the document was genuinely useful.

[Your name]

---

## Notes for you, not part of the email

- Numbers quoted are measured, not estimated: 190,049 excluded records, the 16640 to
  119276 to 119109 chain, 58 Fleetguard results.
- Not mentioned deliberately: the Fleetguard count came back 58 where the true figure is
  66, because the assistant searched two spellings and missed "Fleedgaurd". It is an
  under count rather than invention and it discloses which spellings it used. Raise it
  only if they ask about brand listings.
- The fifth point in their document, results differing from SAP on deletion status, was
  partly a refresh lag. The source data has since caught up and now agrees with their
  screenshot, so it is folded into point 3 rather than argued separately.
