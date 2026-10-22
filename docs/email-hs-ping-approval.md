# Email draft: approval request for the HS Ping API

Fill in **[brackets]** before sending.

---

**Subject:** Approval request: HS code lookup API, $49 per month

---

Hi [Name],

Asking for approval on a small subscription, roughly $600 a year.

**The gap.** We hold no HS codes anywhere. I checked all 319 data columns we load from SAP
and Power BI and there is no tariff or commodity code field, so classification is done by
hand every time it is needed.

**The proposal.** HS Ping, an API that returns an HS code from a product description.
$49 a month for 50,000 lookups, or $129 for 500,000.

**Sizing against our data.** Classifying the existing catalogue once is 73,504 active
stockable materials. After that we add about 750 a month. So one month on the $129 plan
clears the whole back catalogue, then $49 a month covers the ongoing rate sixty times
over. **About $670 in year one, $588 after.**

**On the vendor, honestly.** The good part: they source from official bodies including the
WCO, USITC, Canadian CBSA and UK DIT, and every response carries a version and a source
reference, so an answer can be audited.

The concerns are real. HS Ping launched in **January 2026**, is a **bootstrapped company of
under ten people** in Malaysia, and has **no independent reviews or press coverage at all**.
Everything published about their data sourcing is their own. Their stated coverage is 32
countries led by the US, EU, UK, Canada and Australia, and I could not confirm it covers
the Gulf states we actually ship to. They also state themselves that results carry no
compliance guarantee and need human review.

At $49 a month the financial risk is negligible. The risk is building on a supplier that
may not exist in two years, so I would keep the integration thin and easy to swap.

**What I am asking for.** Approval to run their free 100 lookup trial, at no cost and no
sales call, and report back with measured accuracy against codes our freight forwarder has
already used. If it holds up, the $49 subscription plus one month at $129.

A wrong HS code affects duty payable, so either way the assistant would suggest a code for
a person to confirm, never file one.

Thanks,
[Your name]

---

## Notes for you, not part of the email

- Our figures, measured 22 Oct: 119,176 stockable materials, 73,504 active and not
  deletion flagged, 8,951 created in the last 12 months.
- Vendor facts are from their own site and Crunchbase. Founder listed as Choong, one
  developer named. No third party has reviewed them.
- Gulf coverage is the one that would actually kill this. Worth asking them directly
  before the trial, since HS is standard to six digits but country specific beyond that.
- Fallback if accuracy is poor: ask the freight forwarder for the codes they already use
  on our shipments. Free, already correct, just narrower.
