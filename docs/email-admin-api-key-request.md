# Email draft: requesting the Anthropic Admin API key

Edit anything in **[brackets]** before sending.

---

**To:** Riswan
**Subject:** Request: Anthropic Admin API key for AI cost monitoring

---

Hi Riswan,

Could you create an **Anthropic Admin API key** and share it securely? It is for a cost
monitoring dashboard in the Supply Chain AI admin panel.

On 14 October our Anthropic credits ran out with no warning. Every bot went down at once,
including the HSE bot, and we only found out when users hit errors. The dashboard is built and
tested. Once the key is in, it shows daily spend, spend split per bot, and a burn down that
turns red when we are within a week of running out, so we top up on schedule instead.

**To create it:**

1. Sign in at **https://platform.claude.com** with the account that owns our organisation.
2. Go to **Settings > Admin keys** (organisation level, not the Workspace API keys page).
3. Click **Create Admin key** and name it `NESR usage dashboard`.
4. Copy the key. It starts with **`sk-ant-admin01-`** and is shown only once.

Three things so we get the right key first time:

- It must be an **Admin key**. A Workspace key (`sk-ant-api03-...`) returns 401.
- Creating one usually needs the Organization **Owner** role, so it may need the billing
  account.
- Admin keys can manage organisation resources, not just read usage. I will store it server
  side only, never in the browser or the repository, and the dashboard only calls the read
  endpoints.

**Please do not paste the key into email or Teams.** Either share it through the password
manager, or set it on the server yourself as `ANTHROPIC_ADMIN_KEY=sk-ant-admin01-...` and just
tell me it is done.

**On the HSE bot**, so I can separate its spend:

1. Does it use its **own** Anthropic API key, or share one with the other bots?
2. If its own, is that key **named clearly** in the Console, for example `HSE Bot`? The
   dashboard reads Console key names automatically.

I do not need access to the HSE bot's n8n workflow. The usage data comes from Anthropic, keyed
on which API key made each call.

Thanks,
[Your name]

---

## Notes for you (not part of the email)

- If HSE bot shares a key, its cost cannot be split out. The fix is a second key swapped into
  its n8n Anthropic credential. It will not backfill.
- If the bots sit in separate Workspaces, better still: the "By workspace" table is Anthropic's
  own billed figure with no apportioning.
- Once the key is set, restart the app and the page populates. Nothing else needed.
