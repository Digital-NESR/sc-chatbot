# Email draft: approval request for the HS Ping API

Fill in **[brackets]** before sending.

---

**Subject:** Approval request: HS code lookup API, $49 per month

---

Hi [Name],

I would like approval for a small subscription that would let Supply Chain AI return HS
codes. Roughly $600 a year.

**The gap**

We hold no HS codes anywhere. I checked all 319 data columns across every table we load
from SAP and Power BI, and there is no tariff, commodity or customs code field. So today
nobody can ask the assistant what the HS code for a material is, and classification is
done by hand each time it is needed for an import or export.

**What I am proposing**

HS Ping, a lookup API that returns an HS code from a product description.

| Plan | Cost | Lookups per month |
|---|---|---|
| Professional | $49 | 50,000 |
| Volume | $129 | 500,000 |

**Sizing against our actual data**

- Classifying our existing catalogue once: **73,504 active stockable materials**
- New materials created since: **about 750 a month**, averaged over the last year

So one month on Volume covers the entire back catalogue in a single run, and Professional
covers the ongoing 750 a month roughly sixty times over.

**First year: about $670.** One month at $129 for the backfill, then $49 a month.
Thereafter $588 a year. That works out at around a fifth of a cent per material
classified.

**What I would want to prove before we pay**

The vendor offers 100 free lookups with no card and no sales call. I would use those
first to check two things:

1. **Accuracy.** I would test against materials where our freight forwarder or customs
   broker has already given us a code, and see whether the API agrees. Their published
   accuracy figure is not independently sourced, so I would rather measure it than
   believe it.
2. **Coverage.** HS codes are internationally standard to six digits, but countries add
   their own digits beyond that. I need to confirm it is useful across the countries we
   actually ship to, not just the US.

**Risks worth stating plainly**

A wrong HS code is not a cosmetic error. It affects duty payable and can mean penalties
or held shipments. So I would propose the assistant **suggests** a code with its
confidence and never presents it as final, with a person confirming before anything is
filed. The same applies to any bulk classification run.

We would also be sending material descriptions to a third party. They are not commercially
sensitive in my view, but that is a judgement worth someone else confirming.

**The alternative**

If SAP can hold a commodity code on the material master, that is a better long term
answer, because the code becomes our own data and our own responsibility rather than a
vendor's. It is slower to arrange. The API would be useful either way, as the thing that
proposes a code for a human to approve.

**What I am asking for**

Approval to run the free trial and report back with measured accuracy. If it holds up, a
$49 monthly subscription plus one month at $129 for the backfill.

Happy to walk through any of it.

Thanks,
[Your name]

---

## Notes for you, not part of the email

- Figures are measured from our own data on 22 Oct: 119,176 stockable materials of which
  73,504 are active and not deletion flagged; 8,951 created in the last 12 months, so 746
  a month.
- The 100 free lookups are one time, not per day. An earlier source said per day; the
  pricing page says one time, so the email uses the page.
- Not said in the email: if accuracy comes back poor, the fallback is asking the freight
  forwarder for the codes they already use on our shipments. That is free and already
  correct for the items we actually move, just narrower.
