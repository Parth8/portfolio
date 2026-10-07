# Portfolio

Parth Aggarwal's portfolio - **https://parth8.github.io/portfolio/**

Plain HTML, CSS and native ES modules. No framework, no build step: GitHub Pages serves the files as they are.

## Layout

```
index.html          the page: every section, in reading order
css/base.css        tokens (colours), reset, grain, cursor, top nav, side-nav, progress bar, focus, reduced motion
css/sections.css    hero, stamps, index, impact, case tabs, principles, journey, toolkit, marquee,
                    recognition, writing, manifesto, contact, footer
css/projects.css    the Built tiles (closed/open states) and every project's looping SVG animation
css/receipt.css     the proof-of-work receipt (docked terminal + full receipt) and the "30 seconds?" button
js/main.js          cursor (mouse/trackpad only), one scroll loop, scroll-in observers, number scramble,
                    case reel, tile open/close, journey "+ more", marquee loop
js/receipt.js       the receipt: prints a line per highlight, totals at "say hi", tears off as a PNG
assets/             favicon, share image (og.png), the polaroid
```

## Page order

Hero → stamps → **on this page** index → 01 Impact → 02 Work (case tabs) → principles → 03 Built (tiles) →
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
python3 -m http.server 8765    # then open http://localhost:8765
```
