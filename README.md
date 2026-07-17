# Hollow Fleet

A single-player **roguelike deck-builder of card-driven ship combat** — FTL meets
Slay the Spire. You command the corvette **ISV Hollow Verdict** across the branching
sector chart of the Hollow Verge, fighting card-based ship battles, docking at
stations to refit your deck and ship, and running the gauntlet to the dreadnought
**HMS Iron Verdict** at the jump gate.

Built from the `design_handoff_hollow_fleet` specification. The game is a
self-contained static web app — **no build step, no bundler, no runtime CDN** — that
runs by opening `index.html`.

## Play

Open `index.html` directly in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

Everything the game needs is vendored locally, so it works fully offline. (The one
optional network call is Google Fonts for Space Grotesk / IBM Plex Mono; if it's
blocked, the UI falls back to system fonts.)

## How it plays

1. **Title & briefing** — pick a difficulty (Standard / Hard / Brutal), read the
   situation, and launch the sortie.
2. **The chart** — jump between nodes on a one-way branching map: skirmishes,
   elites, stations, an anomaly, and the flagship. Choose your route.
3. **Battle** — spend **reactor power** to play cards. A deflector screen soaks
   hits before they reach hull; your **weapons / reactor / engines** subsystems can
   each be crippled. Read the enemy's telegraphed intent and answer it. Win by
   gutting the enemy hull — or boarding and taking the ship.
4. **Refit** — after a win, salvage a card from the wreck; at stations, buy cards,
   install permanent upgrades, patch hull, hire crew, and scrap dead weight from
   your deck.
5. Reach and break the **Iron Verdict** to open the gate. Lose your hull or your
   crew and the run ends — start a new sortie.

## Project layout

| Path | What it is |
| --- | --- |
| `index.html` | Page shell; loads the vendored libs, styles, and game |
| `game.js` | The whole game — rules engine + UI, one Preact component |
| `styles.css` | Global reset, starfield, keyframes, hover/title styles |
| `assets/cards/` | Card art (one PNG per card key) |
| `assets/ships/` | Player and enemy ship sprites |
| `vendor/` | Preact + htm UMD builds (vendored, no CDN at runtime) |
| `Game layout and features planning.zip` | Original design handoff (reference) |

## Implementation notes

- **Rendering**: [Preact](https://preactjs.com/) + [htm](https://github.com/developit/htm),
  both vendored as UMD globals — no JSX, no transpile. The game is a single class
  component whose imperative state mirrors the design spec's logic class.
- **Authoritative rules**: all balance numbers — the card library, enemy stats, the
  11-node / 16-edge sector graph, shop prices, and upgrade costs — are ported
  verbatim from the design handoff.
- **Added for this build**: the title/intro screen with story context and an
  in-game difficulty selector, ahead of the original tactical briefing overlay.
- **Motion** respects `prefers-reduced-motion`.
