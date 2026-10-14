# Email draft — requesting the Anthropic Admin API key

Edit the greeting and anything in **[brackets]** before sending.

---

**To:** Riswan
**Cc:** [your manager, if the spend sits with them]
**Subject:** Request: Anthropic Admin API key for AI usage and cost monitoring

---

Hi Riswan,

Could you create an **Anthropic Admin API key** for me and share it securely? It is for a
cost-monitoring dashboard I have built into the Supply Chain AI admin panel.

**Why I need it**

On **14 October** the Anthropic credits ran out with no warning. Every bot went down at once —
Supply Chain AI, Materials AI, SourceGuide, and the HSE bot — and the first sign of it was
users getting errors. There is currently no way for us to see spend or remaining runway
without logging into the Anthropic Console directly.

The dashboard is already built and tested. Once the key is in place it will show:

- daily and month-to-date spend, straight from Anthropic's billing figures
- **spend split per bot**, so we can see what HSE bot costs versus Supply Chain AI
- token usage by model
- an estimated burn-down that turns red when we are inside a week of running out

That last point is the one that matters — it should mean we top up on a schedule rather than
finding out from a user that everything is down.

**How to create it**

1. Sign in to the Anthropic Console at **https://platform.claude.com** with the account that
   owns our organisation. Creating admin keys usually requires the Organization **Owner**
   role, so this may need to be done from the primary billing account.
2. Go to **Settings → Admin keys** (organisation level — not the Workspace API keys page).
3. Click **Create Admin key**.
4. Name it something identifiable, for example `NESR – usage dashboard (read only use)`.
5. Copy the key. It begins with **`sk-ant-admin01-`** and is shown **only once**.

A couple of things worth flagging so we get the right key first time:

- It must be an **Admin key**. A normal Workspace API key (`sk-ant-api03-...`) will not work
  for these endpoints — it returns 401.
- The Admin API is only available to **organisation** accounts, not individual ones. If our
  account is an individual one, that would need converting first.
- Admin keys are powerful — they can manage organisation resources, not just read usage. I
  will store it server-side only, in the application's environment file, never in the browser
  or in the repository. The dashboard only calls the read endpoints: usage report, cost
  report, and the API key and workspace lists.

**How to send it**

Please **do not paste the key into email or Teams.** Either:

- add it to our password manager and share the entry with me, or
- put it straight into the server environment file yourself, as
  `ANTHROPIC_ADMIN_KEY=sk-ant-admin01-...`, and just tell me it is done.

**One more thing — HSE bot**

So the dashboard can separate HSE bot's spend from the rest, could you confirm:

1. Does the HSE bot use its **own Anthropic API key**, or does it share one with the other
   bots? If it shares a key, I cannot split its cost out, and it would be worth giving it its
   own.
2. If it does have its own, is the key **named clearly** in the Console (for example
   `HSE Bot`)? The dashboard reads those names automatically, so a clear name is all it takes
   for HSE bot to appear as its own line.

I do not need access to the HSE bot's n8n workflow for any of this — the usage data comes from
Anthropic directly, keyed on which API key made each call.

Happy to walk through any of it if easier.

Thanks,
[Your name]

---

## Notes for you (not part of the email)

- If Riswan says the HSE bot shares a key with the other bots, the fix is to create a second
  key and swap it into the HSE bot's n8n Anthropic credential. Spend then separates from that
  day forward — it will not backfill.
- If the bots are in **separate Workspaces**, that is even better: the "By workspace" table
  shows Anthropic's own billed figures with no apportioning at all.
- Once the key is set, nothing else is needed — restart the app and the page populates.
