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
js/main.js          cursor (mouse/trackpad only), one scroll loop, scroll-in observers, number scramble,
                    case tabs, tile open/close, journey "+ more", marquee loop
assets/             favicon, share image (og.png), the polaroid
```

## Page order

Hero → stamps → **on this page** index → 01 Impact → 02 Work (case tabs) → principles → 03 Built (tiles) →
04 Journey → 05 Toolkit → partners marquee → 06 Recognition → 07 Writing → manifesto → 08 Say hi.

## Adding a project to Built

1. Copy an `<article class="project" id="p-NAME" data-project="NAME">` block in `index.html`.
   Keep the parts the tile relies on: `.project-line` (the one-liner shown on the tile),
   `.project-more` wrapping the story and stack, and the `.project-toggle` button with `aria-controls="more-NAME"`.
2. Draw its art as an inline SVG in `.pr-art` (viewBox `0 0 320 150`, ~6.5 s loop) and add its keyframes to
   `css/projects.css`, plus a still frame in the `prefers-reduced-motion` block.
3. Update the counts in the index (`03 Built`), the Built subtitle and the stamps if they mention it.

## Run locally

```
python3 -m http.server 8765    # then open http://localhost:8765
```
