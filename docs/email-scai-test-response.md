# Email draft: replying to the SCAI test results

Fill in **[brackets]** before sending.

---

**Subject:** RE: SCAI test results, all points fixed

---

Hi [Name],

Thank you for the test document. All three issues are fixed and live.

**Sales and asset materials appearing.** Searches now cover stockable material only. This
was bigger than it looked: 61% of the material master, around 190,000 records, is sales
or asset material. That is why P141228 returned "AlYasat Weekly". Those records stay in
the database for reporting, they are just no longer searched.

**Results differing from SAP.** The assistant was matching your part number against the
SAP material number rather than the manufacturer part number, and could not find a part
number written inside a longer one. Both fixed. P141228 now returns the correct air
filter and recommends material **1100000119109**, matching SAP.

**Deleted codes appearing.** The most important of the three. The assistant was not
reading the deletion flag at all; where it looked right, that was only because the
description happened to say "DEL USE". It now checks the flag every time and follows the
replacement chain to the end. Your AF1797M case runs 1100000016640 to 1100000119276 to
**1100000119109**. That is three steps, so a single lookup would still have been wrong.

I also re-ran your six passing cases and they all still work.

**One more, worth knowing.** While re-testing I asked for "the Fleetguard filters we
have". The assistant returned a tidy six row table and five rows were invented, including
a Magnaloy insert and a butterfly valve listed as filters. The part numbers it quoted were
real Fleetguard catalogue numbers, which is why it read so convincingly. Now fixed, and
the same question returns 58 real materials.

I mention it because reading the answer would never have caught it. Only checking against
SAP would, which is exactly what you did. Worth keeping that approach if you run another
pass, and I would value one.

Thanks again, the document was genuinely useful.

[Your name]

---

## Notes for you, not part of the email

- Figures are measured: 190,049 excluded records, the three step chain, 58 Fleetguard
  results.
- Left out deliberately: the Fleetguard count was 58 where the true figure is 66, because
  the assistant missed the "Fleedgaurd" spelling. An under count rather than invention,
  and it says which spellings it searched. Raise only if they ask about brand listings.
- Their fifth point, deletion status differing from SAP, was partly a refresh lag that has
  since caught up, so it is folded into the deleted codes paragraph rather than argued.
