# Letting n8n stream through nginx

**Status: applied 24 Oct 2026** on `vm-sc-n8n-prd-uaenorth-01`.

**Why:** SCAI answers take 9 to 146 seconds and the user watched a spinner for all
of it. n8n can stream an agent's reply as it is written, but nginx held the whole
response and released it at the end, so streaming would have changed nothing.

---

## What was actually done

**Not** the site-wide `proxy_buffering off` that an earlier draft of this file
recommended. n8n.nesr.com carries other teams' webhooks — email automations and
more — and there was no reason to change how any of them are delivered.

Instead, one **exact-match** location in
`/etc/nginx/sites-available/n8n` (symlinked from `sites-enabled/n8n`), inside the
`listen 443` server block, above `location /`:

```nginx
# Streaming webhook - SCAI orchestrator only (exact match).
# Every other /webhook/ path still falls through to location / below
# and keeps the default buffered behaviour.
location = /webhook/1c0f7a9e-7c95-4f71-a043-0c44a4b42bdf {
    proxy_pass http://n8n_backend;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_buffering off;
    proxy_cache off;
    gzip off;

    proxy_read_timeout 300s;
    proxy_connect_timeout 60s;
    proxy_send_timeout 300s;
}
```

`location =` is an exact match, which nginx resolves ahead of every prefix and
regex location. It matches that one URL and nothing else. The host's own MCP
endpoint already used the same pattern, so this is the file's existing idiom
rather than a new one.

Only the orchestrator needs it. The four specialists are called *by* the
orchestrator over their own webhooks and read as plain JSON; they must stay
buffered or that read breaks.

### Why each directive

| Directive | Why |
|---|---|
| `proxy_buffering off` | The actual fix. Otherwise nginx accumulates the upstream response and flushes at the end. |
| `proxy_cache off` | A cached response cannot stream, and caching an agent's answer would be wrong anyway. |
| `gzip off` | nginx's gzip filter has its own buffer and re-introduces the delay even with buffering off. |
| `proxy_read_timeout 300s` | Matches what `location /` already had. The nginx default of 60s would cut a long answer off. |

The `Upgrade`/`Connection` headers from `location /` are deliberately **not**
copied: they are for the editor's WebSocket, and a POST webhook does not use them.

---

## The trap in the one-liner

The config originally circulated for this was:

```nginx
location /webhook/ { proxy_buffering off; proxy_cache off; proxy_read_timeout 300s; }
```

**Do not paste that.** A `location` block inherits nothing from another location —
not `proxy_pass`, not a single `proxy_set_header`. A prefix match on `/webhook/`
is more specific than `/`, so it would win, and with no `proxy_pass` of its own
nginx would stop forwarding webhook requests to n8n and start looking for files
on disk. **Every webhook on the host would 404**, including other teams'.

---

## Measured, before and after

Same probe workflow, same prompt, through the same host:

| | chunks | first byte | last byte | spread |
|---|---|---|---|---|
| Before | 10 | 3,731 ms | 3,732 ms | **1 ms** |
| After, short prompt | 14 | 642 ms | 2,460 ms | **1,818 ms** |
| After, 500-word essay | 265 | 154 ms | 16,695 ms | **16,541 ms** |

Before the change every chunk landed in the same millisecond while n8n's own
in-payload timestamps spanned 5.2 seconds. nginx was generating none of the
delay and all of the buffering.

---

## Rolling it back

The pre-change file is at `/root/n8n.conf.bak.20261024-184545` on the host.

```bash
sudo cp /root/n8n.conf.bak.20261024-184545 /etc/nginx/sites-available/n8n
sudo nginx -t && sudo systemctl reload nginx
```

Rolling back nginx does not break the app. The chat route copes with a buffered
upstream by emitting the whole answer as a single chunk, so an answer still
arrives — it just arrives all at once, as it did before.

To roll back the app instead, set `streaming: false` on the orchestrator in
`src/config/site.ts`. That puts it on the buffered code path, which is the code
that was there before streaming existed.

---

## Loose end

A second, temporary exact-match block for `/webhook/scai-stream-probe` was added
at the same time so the change could be measured. The probe workflow
(`ZZ Streaming Probe (temporary)`, id `AkoZweGVQxpvpqiJ`) is **unpublished**, so
the path 404s and the block is inert. Remove the block when the probe is no
longer wanted:

```bash
sudo nano /etc/nginx/sites-available/n8n   # delete the block marked TEMPORARY
sudo nginx -t && sudo systemctl reload nginx
```

---

## What this does and does not buy

It does not make answers faster. A 146-second orchestrated answer still takes
146 seconds, and n8n does not send the intermediate tool-call steps over a
streamed webhook — so the first stretch of a slow answer is still silent and
then the synthesis streams. A heartbeat keeps the connection alive through that
silence.

What it buys is the tail: instead of a spinner for two minutes and then a wall
of text, text appears and keeps appearing. That is the difference between "it
hung" and "it is working". It also makes a stop button mean something.
