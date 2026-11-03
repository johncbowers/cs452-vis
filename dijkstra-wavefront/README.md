# Dijkstra’s algorithm as a wavefront

This is a build-free, standalone visualization for CS 452. It follows the relaxation terminology and best-first structure in Jeff Erickson’s *Algorithms*, Chapter 8.

## Preview locally

From this directory, run a static web server:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000/`.

## Publish with GitHub Pages

1. Put `index.html`, `styles.css`, and `app.js` in a GitHub repository.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the branch and the folder containing these files, then save.

No build step or package installation is required.

## Keyboard controls

- Right arrow: next step
- Left arrow: previous step
- Space: play or pause

Vertices can be dragged anywhere within their current side of the wavefront. Their relative position is preserved when they later move to the processed side.
