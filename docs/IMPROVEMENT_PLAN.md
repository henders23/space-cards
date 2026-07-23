# Blackstar Verge — Improvement Plan

A staged plan to fix the slow opening, add depth (strike craft, subsystem
warfare), and give the campaign a narrative spine driven by the Galactic Navy
portrait cast. Everything stays inside the no-build single-file architecture
(`game.js` + `styles.css`) — no new dependencies.

## Diagnosis — why the early game feels flat

- **Monotonous starter deck** (`game.js` `freshRun`): `4× laser, 3× divert, 1
  patch, 1 missile, 1 overcharge`. The first fights are "laser, divert" on loop.
- **Mindless enemy AI** (`chooseIntent`): a weighted coin-flip between
  attack / shield / board / repair. Enemies never telegraph a plan, charge up,
  or expose a weak point — there is no puzzle to read.
- **Stat-clone enemies** (`ENEMIES`): early hulls differ only in numbers, not
  behaviour, so zones 1–2 feel identical.
- Subsystem damage exists only as a scattered side effect of a few cards, not a
  system the player targets and exploits.
- No strike-craft layer and no character dialogue exist yet.

## The five pillars

### Phase 1 — Fix the opening
- **Commission choice** at launch: pick one of three distinct 10-card starting
  decks (Gunline / Shield-Boarder / Systems-Saboteur).
- **Rebalanced default deck** so turn 1 always has a decision.
- **Smarter `chooseIntent`**: multi-turn charge-up attacks and per-hull
  behaviour archetypes (Raider / Gunline / Carrier / Warden / Zealot).

### Phase 2 — Narrative & dialogue
- Data-driven dialogue engine: a scene is `[{speaker, mood, line}, …]`; an
  overlay renders portrait + name/rank + text, advance on click/space.
- Cast keyed to `assets/crew/`. Beats: intro/briefing, first blood, zone
  secured, elite taunts, and the Iron Verdict confrontation at the gate.
- The in-battle comms callouts become real, named bridge crew.

### Phase 3 — Subsystem warfare
- **Called shots**: aim at a specific enemy subsystem in manual gunnery.
- **Consequences**: crippled enemy weapons/reactor/engines change what the
  enemy can telegraph and how hard it lands — wired into `chooseIntent`.

### Phase 4 — Strike craft
- New `strike` card type + a hangar tray UI of live squadrons.
- **Fighters**: sustained per-turn damage; can be shot down by enemy
  point-defense. **Bombers**: delayed heavy, shield-piercing subsystem strikes.
- **Enemy carriers** launch fighters as a telegraphed intent you must clear.
- A **Hangar** subsystem caps fielded squadrons.

### Phase 5 — Content pass
- New cards, per-zone enemy archetype assignments, and additional dialogue
  beats to fill out the richer framework.

## Cast (portraits in `assets/crew/`)

| Role | Characters |
| --- | --- |
| Fleet Command | VAdm. Margaret Halloway, VAdm. Peter Novak |
| Bridge crew | Cdr. Mira Solan (XO), Lt.Cdr. Ethan Drake (tactical), Lt. Insu Park (engineering), Lt. Kiara N'Dala (comms), Lt. Sloane Katz (gunnery) |
| Pact antagonists | Capt. Thomas Grey, RAdm. Julian Ashford, RAdm. Isabella Corelli |
| Iron Verdict (final) | RAdm. Alexander Vale |

## Phase 6 — Fleet combat ("Line of Battle" rework)

The Palewake is re-classed from corvette to **battleship**, and combat becomes
**up to 3 capital ships per side**, each with its own deck — the player runs a
squadron, not a lone hull.

### Rules

- **Lanes & screening.** Ships form a line of up to three lanes. A capital's
  weapons and boarding actions are locked to the enemy capital in its own lane
  while that ship still fights; once the opposing lane is broken (destroyed or
  struck), it may target anyone. The same rule binds the enemy AI — escorts
  screen flagships on both sides. *Flanking Burn* lets one weapon ignore the
  screen; **strike craft always ignore lanes** (they fly).
- **Per-ship decks.** Every capital has its own deck, hand and reactor. The
  flagship draws 5, escorts draw 3. Click a ship to command it; its cards spend
  its power and its effects come from / apply to that hull.
- **Strike craft are board tokens** (MtG-style): launched from hangar ships, no
  decks, persist between the fleets and act every round. Fighters (2/2 ×2 per
  card) dogfight enemy craft — bombers first — and strafe capitals when the sky
  is clear. Bombers (5/2) ignore dogfights and torpedo capitals through
  shields, chewing the focused subsystem. Interceptor Screen sweeps 3 damage
  across all enemy craft. Each fleet fires one 2-damage flak shot per round
  (needs a ship with ENGINES ≥ 60). Hangar bays cap fielded tokens per ship.
- **Fleet building.** Escorts are bought at shipyard dry docks (Gun Frigate,
  Light Carrier) or **captured**: reduce an enemy crew to 0 and, with a free
  fleet slot, the prize joins your line after the battle at half hull with a
  deck matching how she fought. Fleet cap: 3. Destroyed escorts are permanent
  losses; losing the flagship ends the run.
- **Enemy fleets.** Skirmishes and garrisons field one ship; elites and
  bounties bring a light escort; the Iron Verdict anchors the center lane of a
  three-ship battle line.

## Sequencing

Phases are built in order (1 → 6) and shipped together. Each phase is
self-contained and leaves the game playable.
