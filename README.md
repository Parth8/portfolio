# Portfolio

Parth Aggarwal's portfolio - **https://parth8.github.io/portfolio/**

Every visit opens on a door: **how would you like to meet me?** Three ways in, one record behind all of them.

| Mode | URL | What it is |
| --- | --- | --- |
| Portfolio | `/` | The door, then the work: four case studies, seven built-and-live projects, the journey, principles, recognition and writing. The proof-of-work receipt lives here. |
| Fit check | `/for/` | Paste a job description (or pick a lens). Every requirement gets a confidence score with its reasons, evidence, proof level and maths; the overall fit comes with an uncertainty range; public sources are re-checked live in the visitor's browser. Nothing is sent anywhere. |
| Ask AI | `/mcp/` | The same record as an MCP server, so a recruiter's AI can interview it. One-step connect guides, one live example, and a console running the server's own code. Deploy notes: [server/README.md](server/README.md). |

Plain HTML, CSS and native ES modules. No framework. GitHub Pages serves the files as they are; a small Node script regenerates the parts that must match the data.

## Proof, not adjectives

Every record in `data/career.json` carries a proof tier, shown everywhere as a shape:

- ● **Verified**: a public artifact you can open (a live app with its public repo and commit history, a published article).
- ◐ **Corroborated**: public sources (company newsroom, product pages, press) confirm the program as described; the role and figures come from the resume.
- ○ **Self-reported**: resume only. Employer figures are confidential, so the site says so and suggests asking for a reference.

`data.sources` lists every public source with the exact quote, what it proves and what it doesn't. Each was opened and checked on the date in `sources_note`.

**How confidence is scored** (`js/career-engine.js`, under 500 lines, deterministic):

- Evidence weight = proof (0.95 / 0.70 / 0.60) × recency × specificity × relevance to the reader's words.
- Witnesses combine like independent checks: `1 - Π(1 - w)`. Each public artifact is its own witness; everything whose claims come from the resume is **one** witness, capped at 0.72 (0.82 when public sources corroborate the programs). So "High" (0.85+) always needs something checkable.
- Parth's own self-assessment can only lower a score (gap 0.15, adjacent 0.45, working 0.70), never raise it.
- Fit = weighted mean × 100, with a range (resume weighted 0.4 → 0.9). A must-have asked for repeatedly with no evidence caps the fit at 44.

## Layout

```
index.html            the door + portfolio (blocks between <!-- gen:x --> markers are generated)
for/index.html        fit check
mcp/index.html        ask AI
data/career.json      the single source of truth: profile, cases, roles, projects, competencies, sources
llms.txt              a plain summary for AI readers (generated)

css/base.css          the design system: tokens, type (Inter, Instrument Serif, DM Mono), bar, buttons, proof chips
css/portfolio.css     the door and the portfolio sections
css/art.css           the seven looping project animations
css/receipt.css       the proof-of-work receipt
css/for.css           fit check
css/mcp.css           ask AI

js/career-engine.js   pure functions over career.json: profile, search, claims, confidence and fit
js/mcp-core.js        the MCP protocol (both eras), tools, resources, prompts
js/live-audit.js      live checks from the visitor's browser (GitHub API, reachability)
js/portfolio.js       the door, case tabs, reveal, receipt wiring, live repo check
js/receipt.js         the receipt
js/for.js             fit check page
js/mcp-page.js        ask AI page
js/config.js          MCP_ENDPOINT: empty until the Worker is deployed

server/worker.js      the Cloudflare Worker (generated; see server/README.md)
tools/build.mjs       regenerates server/worker.js, llms.txt and the generated blocks in index.html
tools/worker-shell.js the Worker's HTTP wrapper: routing, CORS, Origin, rate limit, data loading
tests/                node --test tests/*.test.mjs
```

## Updating the record

1. Edit `data/career.json`. Give every new record a `proof` (tier + source ids); a corroborated tier needs a source with `role: "corroborates"`, a verified one needs a public artifact. Add new public sources to `sources` with the exact quote and what it does and doesn't prove.
2. `node tools/build.mjs` (worker, llms.txt, portfolio proof blocks, stats, journey, awards, writing).
3. `node --test tests/*.test.mjs` (protocol, scoring rules, source integrity, and a stale-build check).
4. Push.

Repo snapshots (commits, dates, authors) in `sources` come from the project repos' git history; the portfolio and fit check re-check them live against the GitHub API in each visitor's browser.

## Run locally

```
python3 -m http.server 8765    # then open http://localhost:8765, /for/ and /mcp/
node --test tests/*.test.mjs
```
