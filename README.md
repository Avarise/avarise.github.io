# SigilRPG Stat Tracker

Static browser-only tracker for the SigilRPG stats-as-dice variant.

## GitHub Pages

Put `index.html`, `styles.css`, and `app.js` in a repository, then enable GitHub Pages for the branch/folder containing them. No build step or backend is required.

Character state is stored in browser `localStorage` under `sigilrpg-stat-tracker-v1`.

## Damage timing

Damage is queued per attribute during a round. Current attribute dice are unchanged until `End round` is pressed. This prevents damage suffered earlier in a round from reducing rolls later in that same round.
