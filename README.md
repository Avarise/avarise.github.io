# SigilRPG Tracker

A small static companion for physical SigilRPG play.

- Multiple character stat/wound tracking
- Editable base attribute dice and one-tier attribute healing
- Deferred damage applied at end of round with changed-values confirmation
- Local browser persistence with `localStorage`
- Mobile horizontal swipe between characters
- Unified Action Composer for attacks, prefixes, Smite Sources, and Words of Power
- Wiki-style Guide for damage chains, Impact, equipment, and casting rules
- Words of Power browser and spell composer with AP, resource, potential, risk, and charging summaries
- No dice roller, backend, framework, package manager, or build step

## GitHub Pages

Serve the repository root with GitHub Pages. The site consists only of:

- `index.html`
- `styles.css`
- `app.js`

The `#tracker`, `#action`, and `#guide` hashes select the Tracker, Action Composer, and Guide views; all remain part of the same static page.
