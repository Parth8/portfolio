# The MCP server

`worker.js` is Parth's career as a [Model Context Protocol](https://modelcontextprotocol.io) server: one
Cloudflare Worker, read-only, no keys. It's **generated**, so don't edit it by hand. It's built from
`js/career-engine.js`, `js/mcp-core.js`, `data/career.json` and `tools/worker-shell.js` by:

```
node tools/build-worker.mjs           # also regenerates llms.txt
```

## Deploy (about five minutes, free tier)

**Dashboard, no tools needed**

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Create Worker**
   (start from "Hello World"). Name it `parth-mcp` and press **Deploy**.
2. Press **Edit code**, select everything in the editor, paste the whole of `server/worker.js`, and press **Deploy**.
3. Open `https://parth-mcp.<your-subdomain>.workers.dev/`. You should see a JSON description of the server.
   The MCP endpoint is that URL plus `/mcp`.

**Or from a terminal**

```
npx wrangler deploy server/worker.js --name parth-mcp --compatibility-date 2026-10-01
```

## Switch the site to the live endpoint

Put the `/mcp` URL in `js/config.js`:

```js
export const MCP_ENDPOINT = 'https://parth-mcp.<your-subdomain>.workers.dev/mcp';
```

Push. The MCP page's pill turns green ("Live"), the console talks to the Worker instead of running in the
page, and every "connect" guide shows the real URL.

## Settings (optional)

Under the Worker's **Settings → Variables and Secrets**:

| Variable | Default | What it does |
| --- | --- | --- |
| `DATA_URL` | `https://parth8.github.io/portfolio/data/career.json` | Where the Worker reads the record (cached 10 minutes). Set it to an empty string to use the copy built into `worker.js`. |
| `ALLOWED_ORIGINS` | parth8.github.io, claude.ai, claude.com, chatgpt.com, cursor.com, localhost | Comma-separated browser origins allowed to call it. Clients with no `Origin` header (Claude, ChatGPT and Cursor connect server-side) are always allowed. `*` allows any. |

Because the Worker fetches `career.json` from the site, **editing the record and pushing is enough**. Redeploy the
Worker only when `js/career-engine.js`, `js/mcp-core.js` or `tools/worker-shell.js` change.

## What it speaks

- **MCP 2026-07-28**: stateless. No initialize; every request carries `_meta` (protocol version, client info,
  capabilities). `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` headers must match the body (400 / -32020
  otherwise). Starts with `server/discover`.
- **MCP 2025-11-25, 2025-06-18, 2025-03-26**: the classic `initialize` handshake. No session id is minted, so
  any instance can answer any request.
- Tools: `get_profile`, `list_work`, `get_work`, `search_evidence`, `prove_claim`, `fit_for`, `contact`, all
  annotated read-only and idempotent. Resources: `parth://resume.md`, `parth://profile.json`, `parth://career.json`.
  Prompts: `assess_fit`, `interview`, `tldr`.
- Guard rails: Origin check (403), 64 KB body limit (413), 120 requests a minute per IP (429), `GET`/`DELETE` → 405.
  Nothing a client sends is stored.

## Check it

```
node --test tests/*.test.mjs                 # both protocol eras, errors, CORS, claims, fit, freshness
npx @modelcontextprotocol/inspector          # transport: Streamable HTTP, URL: your /mcp endpoint
```
