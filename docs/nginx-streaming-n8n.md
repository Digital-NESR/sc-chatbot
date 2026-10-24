# Letting n8n stream through nginx

**Why:** SCAI answers take 9 to 146 seconds and the user watches a spinner for all
of it. n8n can stream an agent's reply token by token, but right now nginx holds
the whole response and releases it at the end, so streaming would change nothing.

**Proof it is nginx and not n8n.** A streaming webhook was called directly and
every chunk arrived in the same millisecond, while n8n's own timestamps inside
those chunks spanned 5.2 seconds:

```
chunks: 10 | arrival times (ms): 3731, 3731, 3731, 3731, 3731, 3731, 3731, 3731, 3731, 3732
spread first→last: 1 ms      >>> BUFFERED
```

n8n generated it over five seconds. nginx delivered it all at once.

---

## Read this before you paste anything

The one-liner I first sent you was wrong to paste directly:

```nginx
location /webhook/ { proxy_buffering off; proxy_cache off; proxy_read_timeout 300s; }
```

In nginx, a `location` block does **not** inherit `proxy_pass` from another
location. A prefix match on `/webhook/` is more specific than `/`, so it would
win — and with no `proxy_pass` of its own, nginx would stop forwarding webhook
requests to n8n and start looking for files on disk instead. **Every webhook,
including all five SCAI agents, would 404.**

Two safe ways to do it. **Option A is the one to use** unless you have a reason
not to.

---

## Option A — turn buffering off for the whole n8n site (recommended)

One directive in the existing server block. Nothing about routing changes, so
there is nothing to get wrong. n8n's own deployment docs recommend this anyway,
because the editor UI uses push connections that buffering also interferes with.

### A1. Find the file that configures n8n.nesr.com

```bash
sudo nginx -T 2>/dev/null | grep -n "n8n.nesr.com" -B 5
```

`nginx -T` prints the entire *running* configuration with the file each part came
from, so this finds it wherever it lives. You are looking for a line like
`# configuration file /etc/nginx/sites-enabled/n8n.conf:` just above the match.

If that gives nothing, look in the usual places:

```bash
ls -la /etc/nginx/sites-enabled/ /etc/nginx/conf.d/
sudo grep -rl "n8n" /etc/nginx/
```

Set the path once so the rest of the steps copy-paste cleanly:

```bash
NGINX_CONF=/etc/nginx/sites-available/n8n.conf   # ← change to the real path
```

### A2. Back it up

```bash
sudo cp "$NGINX_CONF" "$NGINX_CONF.bak.$(date +%Y%m%d-%H%M%S)"
ls -la "$NGINX_CONF".bak.*
```

### A3. Look at what is there now

```bash
sudo cat "$NGINX_CONF"
```

You are looking for the `server` block that has `server_name n8n.nesr.com;` and
listens on 443. Inside it there will be a `location / { ... }` with a
`proxy_pass` pointing at n8n, usually `http://localhost:5678` or `http://127.0.0.1:5678`.

Note whether `proxy_read_timeout` is already set, and to what. If it is below
`300s`, a long orchestrated answer is being cut off today regardless of streaming.

### A4. Edit it

```bash
sudo nano "$NGINX_CONF"
```

Inside the `location /` block for n8n, **keeping every line that is already
there**, add these four:

```nginx
location / {
    proxy_pass http://localhost:5678;      # ← whatever is already there, leave it

    # ... all your existing proxy_set_header lines stay exactly as they are ...

    # Added for streaming: release each chunk as it arrives instead of
    # holding the whole response until the workflow finishes.
    proxy_buffering off;
    proxy_cache off;
    gzip off;
    proxy_read_timeout 300s;
}
```

What each one is for:

| Directive | Why |
|---|---|
| `proxy_buffering off` | The actual fix. Without it nginx accumulates the upstream response and flushes at the end. |
| `proxy_cache off` | Belt and braces. A cached response cannot stream, and caching an agent's answer would be wrong anyway. |
| `gzip off` | nginx's gzip filter has its own buffer and will re-introduce the delay even with `proxy_buffering off`. |
| `proxy_read_timeout 300s` | SCAI's longest measured answer is 146s and the app's own ceiling is 280s. The nginx default is 60s, which would cut a long answer off. |

Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X`).

### A5. Check the syntax BEFORE reloading

```bash
sudo nginx -t
```

You want exactly:

```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

**If it says anything else, do not reload.** Fix it, or restore the backup
(step A7) and stop.

### A6. Reload

```bash
sudo systemctl reload nginx
```

`reload`, not `restart`. Reload re-reads the config and hands connections to new
workers, so requests in flight finish normally. Restart drops them.

Confirm it came back:

```bash
sudo systemctl status nginx --no-pager
curl -sS -o /dev/null -w '%{http_code}\n' https://n8n.nesr.com/healthz
```

### A7. If anything is wrong, roll back

```bash
sudo cp "$NGINX_CONF".bak.<the timestamp you made> "$NGINX_CONF"
sudo nginx -t && sudo systemctl reload nginx
```

---

## Option B — a dedicated location, if you do not want it site-wide

Only if Option A is unacceptable. The thing that makes the one-liner dangerous is
that the new block must repeat **everything** the existing `location /` does.

Copy your real `location /` block, change the path, and add the four directives:

```nginx
# Streaming webhooks. Every proxy_* and proxy_set_header line below must match
# the location / block above, because a location inherits none of them.
location /webhook/ {
    proxy_pass http://localhost:5678;          # ← copy from location /
    proxy_http_version 1.1;                    # ← copy from location /
    proxy_set_header Host              $host;  # ← copy from location /
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade           $http_upgrade;
    proxy_set_header Connection        "upgrade";

    proxy_buffering off;
    proxy_cache off;
    gzip off;
    proxy_read_timeout 300s;
}
```

Then do A5, A6, A7 as above.

Note this covers `/webhook/` only. n8n also serves `/webhook-test/` and
`/webhook-waiting/`; if you want those to stream too, repeat the block for each.
That duplication is exactly why Option A is better.

---

## Verify it actually worked

Config that looks right and behaves wrong is the whole problem here, so measure
it rather than trusting it. From anywhere with node and network access to n8n
(your laptop is fine):

```bash
cat > /tmp/stream-probe.mjs <<'PROBE'
import https from 'https';
const agent = new https.Agent({ rejectUnauthorized: false });
const body = JSON.stringify({ message: 'Count from 1 to 60, one number per line, nothing else.' });
const t0 = Date.now(); const times = [];
await new Promise((resolve, reject) => {
  const req = https.request({
    hostname: 'n8n.nesr.com', port: 443,
    path: '/webhook/REPLACE-WITH-PROBE-WEBHOOK-ID',
    method: 'POST', agent,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, res => {
    console.log('status', res.statusCode);
    res.on('data', () => times.push(Date.now() - t0));
    res.on('end', resolve);
  });
  req.on('error', reject);
  req.setTimeout(120000, () => req.destroy(new Error('timeout')));
  req.write(body); req.end();
});
console.log('chunks:', times.length, '| arrivals (ms):', times.join(', '));
const spread = times.at(-1) - times[0];
console.log('spread:', spread, 'ms →', spread > 500 ? 'STREAMS' : 'STILL BUFFERED');
PROBE
node /tmp/stream-probe.mjs
```

I have a probe workflow archived in n8n (`ZZ Streaming Probe (temporary)`) that
this points at — tell me when you have reloaded nginx and I will un-archive it,
run this, and tell you which way it went. Restoring it takes about thirty seconds.

**Reading the result:**

- `spread: 1 ms → STILL BUFFERED` — unchanged. Either the directives are in a
  block that is not handling the request, or something else sits in front of
  nginx (see below).
- `spread: 4000 ms → STREAMS` — done. Phase 3 can be built.

---

## If it is still buffered after all that

Work outwards:

1. **Is the directive actually in force for that path?**
   ```bash
   sudo nginx -T | grep -n -A 30 "server_name n8n.nesr.com" | grep -n "location\|proxy_buffering\|proxy_pass"
   ```
   Confirm `proxy_buffering off` is inside the block that handles `/webhook/`.
   If you used Option B, a more specific `location` elsewhere may be winning.

2. **Is anything in front of nginx?** Cloudflare, an Azure Application Gateway,
   an F5, a corporate proxy — any of them will buffer and nginx cannot help.
   Check what terminates TLS:
   ```bash
   curl -sSI https://n8n.nesr.com/healthz | grep -i "server\|via\|cf-ray\|x-azure"
   ```
   A `cf-ray` header means Cloudflare; `via` or `x-azure-*` means something
   Microsoft-shaped. Today this returns `server: nginx/1.24.0 (Ubuntu)` and
   nothing else, which is why nginx is the right place to start.

3. **Is n8n itself buffering?** It is not, in our test — the chunk timestamps
   inside the payload were 5.2 seconds apart, so n8n emitted them progressively.

---

## What this does and does not buy us

It does not make answers faster. A 146-second orchestrated answer still takes
146 seconds, and n8n does not send the intermediate tool-call steps over a
streamed webhook — so the first part of a slow answer is still silent and then
the synthesis streams.

What it buys is the tail: instead of a spinner for two minutes and then a wall of
text, text appears and keeps appearing. That is the difference between "it hung"
and "it is working". It also lets the app show a stop button that means something.

Nothing in the app changes until this is done, and nothing in the app breaks if it
is never done — streaming is behind a per-agent flag that defaults to off.
