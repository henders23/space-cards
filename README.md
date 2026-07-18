# Blackstar Verge

A single-player **roguelike deck-builder of card-driven ship combat** — FTL meets
Slay the Spire. You command the corvette **ISV Palewake** across a scrollable,
zone-based galactic sector chart, fighting card-based ship battles, docking at
stations and shipyards to refit your deck and ship, securing zones to unseal the
**Blackstar Gate** — the road to the next sector — past the dreadnought
**HMS Iron Verdict** anchored on it.

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

A looping ambient theme ("Echoes of the Void") starts with the game — browsers
hold it until your first click/keypress — and a driving combat track takes over
whenever a battle begins, handing back to the ambient theme when the fight ends.
There's a **♪ MUSIC** toggle on the title screen and in the top bar (the on/off
choice is remembered).

## How it plays

1. **Title & briefing** — pick a difficulty (Standard / Hard / Brutal), read the
   situation, and launch the sortie.
2. **The chart** — a free-travel, zone-based sector map (from the
   `design_handoff_sector_map` bundle, scaled up 3×): 36 systems in 10 zones on a
   scrollable chart. Drag to pan, click a system for intel, double-click (or SET
   COURSE / ENGAGE) to travel along charted lanes — revisiting friendly ports is
   allowed. Take every system in a zone to **secure** it; sealed zones open with
   key items (won from anomalies and bounties) or by securing enough zones.
   Secure 4 zones to unseal the **Blackstar Gate**, break the Iron Verdict
   guarding it, and jump for the next sector. Dedicated **shipyards** (Forge
   Tether, Hollow Yard) sell the permanent refits — including the new Extended
   Fuel Racks and Salvage Rig — while stations keep the card armory.
3. **Battle** — spend **reactor power** to play cards. A deflector screen soaks
   hits before they reach hull; your **weapons / reactor / engines** subsystems can
   each be crippled. Read the enemy's telegraphed intent and answer it. Win by
   gutting the enemy hull — or boarding and taking the ship.
   - **Manual gunnery**: playing a weapon card raises a **crosshair** — aim with the
     mouse and click where on the enemy hull to fire. Your bolt streaks from the
     Palewake to the point you chose and detonates on impact. Right-click or
     press **Esc** to cancel the shot. Non-weapon cards resolve instantly as before.
   - Player and enemy weapons use distinct projectiles, muzzle flashes, and sounds.
     An "enemy sighted" hail opens every encounter, and your crew calls out over the
     comms whenever one of your three subsystems takes damage.
   - **Camera**: scroll to zoom, hold the middle mouse button and drag to pan,
     double-click to reset. Ships are drawn large so you can read the damage.
   - **Inspect a card**: click its ⓘ for a modal, or just hover for ~2 seconds and
     the full card details dock on the right of the screen.
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
| `assets/cards/` | Upgraded card art (one PNG per card key) plus complete card faces in `full/` |
| `assets/ships/` | Player and enemy ship sprites |
| `assets/fx/` | Projectiles, muzzle flashes, impact sparks, explosion spritesheets |
| `assets/audio/` | Ambient + combat music, weapon, "enemy sighted", "reporting damage" and destruction SFX |
| `vendor/` | Preact + htm UMD builds (vendored, no CDN at runtime) |
| `Game layout and features planning.zip` | Original design handoff (reference) |

Deploying on Vercel: this is a plain static site with `index.html` at the repo
root, so Vercel serves it as-is with no build configuration.

FX and audio are drawn from the "Premium Space Projectiles & Explosions Pack" and
an accompanying sounds pack (both licensed for use with no attribution required).

## Implementation notes

- **Rendering**: [Preact](https://preactjs.com/) + [htm](https://github.com/developit/htm),
  both vendored as UMD globals — no JSX, no transpile. The game is a single class
  component whose imperative state mirrors the design spec's logic class.
- **Expanded card library**: the original 19 cards are joined by 31 new cards,
  for 50 total. Every card has distinct artwork, a compact hand summary, a full
  detail view, shop/reward availability, and implemented combat behaviour.
- **Added for this build**: the title/intro screen with story context and an
  in-game difficulty selector, ahead of the original tactical briefing overlay.
- **Motion** respects `prefers-reduced-motion`.
