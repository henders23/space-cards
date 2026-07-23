# Blackstar Verge

A single-player **roguelike deck-builder of card-driven ship combat** — FTL meets
Slay the Spire. You command the battleship **ISV Resolute** across a scrollable,
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

A looping ambient theme ("Drift Beyond Io") starts with the game — browsers
hold it until your first click/keypress — a driving combat track takes over
whenever a battle begins, and victories are capped with a fanfare ("Galactic
Victory Fanfare"). Every hand-off crossfades, and the ambient theme restarts
from the top each time you leave combat.
There's a **♪ MUSIC** toggle on the title screen and in the top bar (the on/off
choice is remembered).

## How it plays

1. **Title, commission & briefing** — pick a difficulty (Standard / Hard /
   Brutal), then choose a **commission** that sets your opening ten-card deck —
   *Gunline* (aggressive weapons), *Bulwark* (shields & boarding), or *Saboteur*
   (subsystem warfare) — read the situation, and launch the sortie. Your bridge
   crew and Fleet Command speak to you at key beats over an in-game **dialogue**
   system driven by the Galactic Navy portrait cast.
2. **The chart** — a free-travel, zone-based sector map (from the
   `design_handoff_sector_map` bundle, scaled up 3×): 36 systems in 10 zones on a
   scrollable chart. Drag to pan, click a system for intel, double-click (or SET
   COURSE / ENGAGE) to travel along charted lanes — revisiting friendly ports is
   allowed. Every system beyond Haven Anchorage starts the run occupied — even
   stations, shipyards, and repair depots have Pact garrisons, and their
   services unlock only after you liberate them in battle. Take every system in
   a zone to **secure** it; sealed zones open with
   key items (won from anomalies and bounties) or by securing enough zones.
   Secure 4 zones to unseal the **Blackstar Gate**, break the Iron Verdict
   guarding it, and jump for the next sector. Dedicated **shipyards** (Forge
   Tether, Hollow Yard) sell the permanent refits — including Extended Fuel
   Racks and the Salvage Rig — while stations keep the card armory.
   - **Fuel**: every lane hop burns one fuel cell (a multi-hop SET COURSE costs
     its full route). Docking at any liberated port — home, station, shipyard, or
     repair depot — refills the racks free. Short on cells? You can still move by
     **burning reserves** at 5 hull per missing cell, but never onto a jump the
     hull can't survive. Extended Fuel Racks adds +2 cells.
   - **Per-zone threat & pay**: each zone has its own enemy roster and a
     difficulty multiplier that scales both enemy strength and salvage payouts —
     the sealed reaches and the sector's far east hit harder and pay better.
3. **Battle** — spend **reactor power** to play cards. A deflector screen soaks
   hits before they reach hull; your **weapons / reactor / engines** subsystems can
   each be crippled. Read the enemy's telegraphed intent and answer it. Win by
   gutting the enemy hull — or boarding and taking the ship.
   - **Line of battle (fleets)**: up to **3 capital ships per side**, each with
     its own deck, hand and reactor — click a ship to command it. Once per turn
     you may **manoeuvre** — swap a capital with the adjacent friendly hull
     (◄►), changing who screens whom. Guns and
     boarders are **screened** to the enemy capital in their own lane until that
     ship is destroyed or struck; strike craft ignore lanes. Buy escorts (Gun
     Frigate, Light Carrier) at shipyard dry docks, or **capture** enemy hulls
     (crew 0 + a free slot) as prizes that join your line with class decks.
     Elites and bounties field a light escort; the Iron Verdict anchors the
     center of a three-ship line. Losing an escort is permanent; losing the
     flagship ends the run.
   - **Enemy behaviour archetypes**: every hull now fights to a personality —
     *raiders* board, *gunlines* telegraph a **charged main-gun salvo** a turn
     before it fires (break their weapons or reactor to spoil it), *carriers*
     scramble **fighters** you must clear, *wardens* turtle and repair, and
     *zealots* hit harder as they die. The flagship does all of it.
   - **Called shots**: click an enemy subsystem to focus your gunners on it —
     every weapon then chips that system's integrity as well as dealing damage.
     Crippling their reactor stops them charging or launching; crippling weapons
     softens every shot they land.
   - **Strike craft**: fighters and bombers are **board tokens** (MtG-style) —
     launched from hangar ships, no decks of their own, persisting between the
     fleets and acting every round. Fighters (2/2 ×2) dogfight enemy craft —
     bombers first — then strafe capitals; bombers (5/2) torpedo capitals
     through shields and chew the focused subsystem. Interceptor Screen sweeps
     3 damage across all enemy craft, and each fleet fires one flak burst per
     round (needs ENGINES ≥ 60). A shipyard **Flight Deck** refit adds a bay.
   - **Manual gunnery**: playing a weapon card raises a **crosshair** — aim with the
     mouse and click where on the enemy hull to fire. Your bolt streaks from the
     Resolute to the point you chose and detonates on impact. Right-click or
     press **Esc** to cancel the shot. Non-weapon cards resolve instantly as before.
   - Player and enemy weapons use distinct projectiles, muzzle flashes, and sounds.
     An "enemy sighted" hail opens every encounter, and your crew calls out over the
     comms whenever one of your three subsystems takes damage.
   - **Camera**: scroll to zoom, hold the middle mouse button and drag to pan,
     double-click to reset. Ships are drawn large so you can read the damage.
   - **Inspect a card**: hover any card — in hand, shops, or reward picks — and
     its full details dock on the right of the screen; click ⓘ for a modal.
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
| `assets/cards/` | Upgraded card art (one PNG per card key) plus complete card faces in `full/`. Strike-craft cards render through a procedural card face (no PNG needed) |
| `assets/crew/` | Galactic Navy portrait cast for the dialogue system, keyed by name, with a `manifest.csv` |
| `assets/backgrounds/` | Parallax combat starfields (`combat-1..4.jpg`) — drop in your own at the same paths to replace them |
| `docs/IMPROVEMENT_PLAN.md` | The five-phase design plan this build implements |
| `assets/ships/` | Chroma-keyed fleet pack: player ship + one hull per enemy class, each with a damaged twin that swaps in below half hull |
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
- **Expanded card library**: the original 19 cards are joined by 31 new cards
  plus 3 strike-craft cards, for 53 total. Painted cards have distinct artwork;
  strike-craft cards render through a procedural card face. Each has a compact
  hand summary, a full detail view, shop/reward availability, and implemented
  combat behaviour.
- **Narrative layer**: a data-driven dialogue engine (`SCENES` / `CAST` /
  `NODE_CAMEO`) plays short character beats — intro, first blood, first dock,
  critical-hull and crippled-system moments mid-battle, zone secured, the Gate
  unsealing, per-zone antagonist cameos (Grey in the Corsair Expanse, the Red
  Augur, Corelli on the Ironwall, Ashford in the Veil, the Locust swarm), and a
  full confrontation with the Iron Verdict's captain at the Gate — using the
  portrait cast in `assets/crew/`.
- **Commissions**: three opening decks chosen at launch (`COMMISSIONS`).
- **Deeper combat**: enemy `ai` archetypes with multi-turn charged shots and
  fighter launches; called-shot subsystem targeting; and a player strike-craft /
  hangar system.
- **Added for this build**: the title/intro screen with story context and an
  in-game difficulty selector, ahead of the original tactical briefing overlay.
- **Motion** respects `prefers-reduced-motion`.
