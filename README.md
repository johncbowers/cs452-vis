# CS 452 visualizations

Interactive visualizations for **CS 452: Algorithm Design and Analysis**.

The repository is a build-free static site suitable for GitHub Pages. The root `index.html` is the collection page. Each visualization lives in its own subfolder with its own HTML, CSS, JavaScript, and supporting files.

## Current visualizations

- [`dijkstra-wavefront/`](dijkstra-wavefront/) — Dijkstra’s algorithm as an expanding wavefront

## Adding another visualization

1. Create a descriptive, lowercase folder at the repository root.
2. Put the visualization’s `index.html` and local assets in that folder.
3. Add a card or link to the root `index.html`.
4. Keep relative links so the site works both locally and on GitHub Pages.

No build step or package installation is required.
