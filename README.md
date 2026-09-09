# SigilRPG Tracker

A small static companion for physical SigilRPG play.

- Multiple character stat/wound tracking
- Editable base attribute dice and one-tier attribute healing
- Deferred damage applied at end of round with changed-values confirmation
- Local browser persistence with `localStorage`
- Mobile horizontal swipe between characters
- Single-page Combat Guide with attack prefixes, damage chains, Impact, weapons, and plating references
- No dice roller, backend, framework, package manager, or build step

## GitHub Pages

Serve the repository root with GitHub Pages. The site consists only of:

- `index.html`
- `styles.css`
- `app.js`

The `#tracker` and `#guide` hashes select the two in-page views; both remain part of the same static page.
