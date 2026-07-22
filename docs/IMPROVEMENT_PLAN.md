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

## Sequencing

Phases are built in order (1 → 5) and shipped together. Each phase is
self-contained and leaves the game playable.
