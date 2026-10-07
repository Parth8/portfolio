# Portfolio

Parth Aggarwal's portfolio - **https://parth8.github.io/portfolio/**

Three ways to read one career, all from one file (`data/career.json`):

| Mode | URL | What it is |
| --- | --- | --- |
| 01 Portfolio | `/` | Every visit opens on **the door**: "How do you want to meet me?" with three tilted cards (portfolio, tailored to you, ask your AI). Picking the portfolio lifts the door like a shutter and the hero animates in. Keys 1/2/3, Escape or a scroll also work; any link with a `#hash` (and the mode switch on the other pages) skips it. Then the site for people who scroll: case reel, Built tiles, proof-of-work receipt. |
| 02 For you | `/for/` | A fit machine. Pick who's asking (recruiter, hiring manager, engineer, founder) or paste a job description, and a scoreboard answers: split-flap fit score, a rubber-stamp verdict, the 300-850 dial, and folder tabs for the evidence (each requirement a 10-block meter you open to see the quoted lines and the maths), the gaps, questions to ask him, and how it's scored. Runs in the browser; a pasted JD never leaves it. Share links carry requirement ids, not JD text. |
| 03 MCP | `/mcp/` | The career as a Model Context Protocol server, so a recruiter's AI can interview it (`fit_for`, `prove_claim`, `search_evidence`, ...). The page is one interview room: a real session replays until you ask something, then plain words are routed to the right tool (a claim goes to `prove_claim`, a job post to `fit_for`, a topic to `search_evidence`) and the answer your AI would read comes back on paper with a stamp, plus the raw JSON-RPC behind a `</>` toggle. Below it: plug it in (copy the URL, pick your app, ask away) and the seven tools as cartridges you can try. Deploy notes: [server/README.md](server/README.md). |

Plain HTML, CSS and native ES modules. No framework and no build step for the site: GitHub Pages serves the files as they are.

## Evidence and confidence

Every answer the site or the MCP server gives rests on Parth's own record in `data/career.json` (resume, profile,
portfolio). Much of that work is internal to employers, so nothing is checked against the web; instead every output
quotes the exact lines it rests on and shows how it got from those lines to the number.

For each requirement (from a job description or a reader persona), `js/career-engine.js` scores a **confidence** from 0 to 1:

- Each quoted line is weighed on what you can see in it: relevance (uses your words 1.0, linked by his record 0.7) ×
  ownership (owned or led 1.0, else 0.85) × specificity (carries a number 1.0, else 0.85) × recency (a year 1.0,
  three 0.9, older 0.75) × setting (day job 1.0, side project 0.85).
- Lines from the same role or project count once. Places combine like independent examples:
  `confidence = 1 - Π(1 - 0.75 × place)`, so one strong place reaches 0.75 and "Strong" (0.85+) needs two.
- Parth's self-assessment in `competencies[].strength` can only cap a score (gap 0.15, adjacent 0.45, working 0.70).
- Fit = the confidence average across requirements, weighted by how often each is asked for, × 100. A must-have with
  no evidence caps the fit at 44.

The For-you page shows each requirement's confidence, its reasons, every quoted line with its weights, and the maths;
`fit_for` returns the same to an AI. Tests check that every quoted line really is on the record.

## Layout

```
index.html            mode 01: the door, then every section in reading order
for/index.html        mode 02: "Tailored to you"
mcp/index.html        mode 03: "Parth, as an MCP server"
data/career.json      the single source of truth: profile, cases, roles, projects, 27 competencies with
                      evidence refs and honest notes (gaps included). Edit this, then run the build below.
llms.txt              a plain summary for AI readers (generated)

css/base.css          tokens, reset, grain, cursor, top nav + mode switch, side-nav, focus, footer, reduced motion
css/sections.css      portfolio sections: hero, stamps, index (+ the two other ways in), impact, case tabs,
                      principles, journey, toolkit, marquee, recognition, writing, manifesto, contact
css/projects.css      the Built tiles and every project's looping SVG animation
css/receipt.css       the proof-of-work receipt and the "30 seconds?" button (portfolio only)
css/door.css          the door: the choice every visit opens on
css/arcade.css        the language modes 02 and 03 share: ink-bordered panels with hard shadows, buttons that press
                      in, chips, stickers, stamps, split-flap digits, block meters, folder tabs, confetti (light + dark)
css/for.css           mode 02: who's asking, the JD sheet, the scoreboard and dial, the evidence tabs
css/mcp.css           mode 03: the interview room, plug-it-in steps, tool cartridges, stamps

js/main.js            portfolio: scroll loop, observers, number scramble, case reel, tiles, journey, marquee
js/receipt.js         portfolio: the receipt
js/door.js            portfolio: the door (choose, lift, keys, scroll, back-button restore)
js/cursor.js          the custom cursor, shared by all three pages (mouse/trackpad only)
js/career-engine.js   pure functions over career.json: profile, search, claim checking, fit scoring
js/mcp-core.js        the MCP protocol (both eras), tools, resources and prompts; used by the console and the Worker
js/for.js             mode 02 page logic
js/mcp-page.js        mode 03 page logic
js/config.js          MCP_ENDPOINT: empty until the Worker is deployed

server/worker.js      the Cloudflare Worker (generated; see server/README.md)
tools/build-worker.mjs   builds server/worker.js and llms.txt from the sources
tools/worker-shell.js    the Worker's HTTP wrapper: routing, CORS, Origin, rate limit, data loading
tests/                node --test tests/*.test.mjs (protocol, engine, and a stale-build check)
assets/               favicon, share image (og.png), the polaroid
```

## Updating the record

1. Edit `data/career.json`. Every competency's `evidence` must point at a real `case:`, `role:` or `project:`
   id, and a weak area should say so in `note` (the tests check the refs).
2. `node tools/build-worker.mjs` to regenerate `server/worker.js` and `llms.txt`.
3. `node --test tests/*.test.mjs`.
4. Push. The live Worker picks up the new record within 10 minutes; redeploy it only if engine or protocol code changed.

## Portfolio page order

Hero → stamps → **on this page** index (+ links to modes 02 and 03) → 01 Impact → 02 Work (case tabs) → principles → 03 Built (tiles) →
04 Journey → 05 Toolkit → partners marquee → 06 Recognition → 07 Writing → manifesto → 08 Say hi.

## Two ideas that keep people from missing things

- **Case reel - scroll is the click.** On desktop the case studies pin and scrolling flips through all four;
  each tab's underline fills as a progress rail. Phones get a swipe carousel. If a case is too tall for the
  screen, the reel falls back to showing every case stacked. Tabs still work as shortcuts in every mode.
- **Proof-of-work receipt.** Any element with `data-r="GROUP|label|value"` is a receipt line. A card terminal
  docked bottom-left prints the line when the element scrolls into view; at "Say hi" the receipt is stamped
  APPROVED. Open it to read or jump, "Print the rest" for the TL;DR, "Tear it off" for a PNG. Progress is
  remembered per browser (localStorage). Groups: IMPACT, CASES, BUILT, JOURNEY, EXTRAS.

## Adding a project to Built

1. Copy an `<article class="project" id="p-NAME" data-project="NAME">` block in `index.html`.
   Keep the parts the tile relies on: `.project-line` (the one-liner shown on the tile),
   `.project-more` wrapping the story and stack, and the `.project-toggle` button with `aria-controls="more-NAME"`.
2. Draw its art as an inline SVG in `.pr-art` (viewBox `0 0 320 150`, ~6.5 s loop) and add its keyframes to
   `css/projects.css`, plus a still frame in the `prefers-reduced-motion` block.
3. Give it a receipt line: `data-r="BUILT|Name|short value"` on the article.
4. Update the counts in the index (`03 Built`), the Built subtitle and the stamps if they mention it.

## Run locally

```
python3 -m http.server 8765    # then open http://localhost:8765, /for/ and /mcp/
node --test tests/*.test.mjs
```
