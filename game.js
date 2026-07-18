/* ============================================================================
 * BLACKSTAR VERGE
 * A single-player roguelike deck-builder of card-driven ship combat.
 *
 * Recreated from the "design_handoff_hollow_fleet" spec. The prototype was
 * authored in a design-tool templating dialect ({{ }} / sc-if / sc-for); this
 * is a real implementation on Preact (vendored locally, no build step). All
 * balance numbers, enemy stats, the map graph and the card library are ported
 * verbatim from the handoff — that logic is the authoritative rules spec.
 *
 * Added for this build: a title/intro screen with story context and an
 * in-game difficulty selector, ahead of the existing tactical briefing.
 * ==========================================================================*/
(function () {
  "use strict";

  var h = preact.h;
  var Component = preact.Component;
  var render = preact.render;
  var html = htm.bind(h);

  // --- small style helpers -------------------------------------------------
  var MONO = "'IBM Plex Mono',monospace";

  function Game(props) {
    Component.call(this, props);
    this.config = { difficulty: "standard", startingSalvage: 40, scanlines: false };
    this.fx = []; this._fxid = 0; this.aimPos = null; this.aimOrigin = null;
    this.view = { zoom: 1, panX: 0, panY: 0 };  // battle camera (mouse zoom/pan)
    this.hoverCard = null;                        // card shown in the dwell panel
    var pref = "on"; try { pref = localStorage.getItem("hf_music") || "on"; } catch (e) {}
    this.music = { on: pref !== "off" };          // looping start/background track
    this.state = this.freshRun();
  }
  Game.prototype = Object.create(Component.prototype);
  Game.prototype.constructor = Game;

  // ---- content data (verbatim from the handoff) ---------------------------
  var LIB = {
    laser:{key:"laser",name:"Laser Volley",cost:1,type:"weapon",text:"Deal 7 damage.",dmg:7},
    flak:{key:"flak",name:"Flak Barrage",cost:1,type:"weapon",text:"Deal 5 damage — 5 more if their shields are down.",dmg:5,bonusNoShield:5},
    missile:{key:"missile",name:"Missile Salvo",cost:2,type:"weapon",text:"Deal 9 damage, ignoring shields.",dmg:9,pierce:true},
    railgun:{key:"railgun",name:"Railgun Slug",cost:3,type:"weapon",text:"Deal 13 damage and smash their REACTOR (-30).",dmg:13,sab:30},
    broadside:{key:"broadside",name:"Full Broadside",cost:2,type:"weapon",text:"Deal 5 damage three times.",dmg:5,hits:3},
    torpedo:{key:"torpedo",name:"Torpedo Spread",cost:3,type:"weapon",text:"Deal 15 damage, ignoring shields.",dmg:15,pierce:true},
    divert:{key:"divert",name:"Divert to Shields",cost:1,type:"shield",text:"Raise 9 shields.",shield:9},
    angle:{key:"angle",name:"Angle Deflectors",cost:1,type:"shield",text:"Raise 5 shields. Draw 1 card.",shield:5,draw:1},
    capacitor:{key:"capacitor",name:"Shield Capacitor",cost:2,type:"shield",text:"Raise 14 shields.",shield:14},
    brace:{key:"brace",name:"Brace for Impact",cost:1,type:"shield",text:"Raise 4 shields. Halve the next hit.",shield:4,brace:true},
    dcontrol:{key:"dcontrol",name:"Damage Control",cost:2,type:"repair",text:"Repair worst subsystem +35, mend 5 hull.",repSub:35,heal:5},
    patch:{key:"patch",name:"Hull Patch",cost:1,type:"repair",text:"Mend 9 hull.",heal:9},
    overcharge:{key:"overcharge",name:"Overcharge",cost:0,type:"power",text:"+2 power now. Your REACTOR takes -8 integrity.",gainP:2,selfSub:8},
    reroute:{key:"reroute",name:"Reroute Power",cost:0,type:"power",text:"+1 power. Draw 1 card.",gainP:1,draw:1},
    boarding:{key:"boarding",name:"Boarding Party",cost:2,type:"boarding",text:"Enemy crew -3, yours -1. Sabotage a random subsystem -15. Needs 2 crew.",eCrew:3,sCrew:1,sabRand:15,needCrew:2},
    breach:{key:"breach",name:"Breaching Pods",cost:3,type:"boarding",text:"Enemy crew -5, yours -2. Needs 3 crew.",eCrew:5,sCrew:2,needCrew:3},
    lock:{key:"lock",name:"Target Lock",cost:1,type:"tactic",text:"Your next weapon this turn deals +7.",lock:7},
    evasive:{key:"evasive",name:"Evasive Burn",cost:1,type:"tactic",text:"Dodge the enemy's next attack this round.",evade:true},
    scavenge:{key:"scavenge",name:"Scavenge",cost:0,type:"tactic",text:"Draw 2 cards.",draw:2}
  };
  Object.assign(LIB, {
    "plasma-lance":{key:"plasma-lance",name:"Plasma Lance",cost:2,type:"weapon",summary:"SHIELD MELT",text:"Strip 6 shields, then deal 8 damage.",stripShield:6,dmg:8},
    "ion-needle":{key:"ion-needle",name:"Ion Needle",cost:1,type:"weapon",summary:"REACTOR -15",text:"Deal 4 damage and reduce enemy REACTOR by 15.",dmg:4,sab:15},
    "chain-cannon":{key:"chain-cannon",name:"Chain Cannon",cost:2,type:"weapon",summary:"RAPID FIRE",text:"Deal 3 damage four times.",dmg:3,hits:4},
    "kinetic-ram":{key:"kinetic-ram",name:"Kinetic Ram",cost:3,type:"weapon",summary:"HULL CRUSH",text:"Deal 18 damage. Lose 4 hull.",dmg:18,selfHull:4},
    "mine-layer":{key:"mine-layer",name:"Mine Layer",cost:1,type:"weapon",summary:"DELAYED 12",text:"Plant a mine that deals 12 damage after the enemy acts.",mine:12},
    "emp-warhead":{key:"emp-warhead",name:"EMP Warhead",cost:2,type:"weapon",summary:"SYSTEM SHOCK",text:"Deal 6 damage and reduce every enemy subsystem by 10.",dmg:6,sabAll:10},
    "point-blank":{key:"point-blank",name:"Point-Blank Salvo",cost:2,type:"weapon",summary:"RISK 18",text:"Deal 18 damage. The enemy deals 5 damage back.",dmg:18,retaliate:5},
    graviton:{key:"graviton",name:"Graviton Torpedo",cost:3,type:"weapon",summary:"ENGINE BREAK",text:"Deal 12 damage and reduce enemy ENGINES by 35.",dmg:12,sabEngine:35},
    "execution-beam":{key:"execution-beam",name:"Execution Beam",cost:3,type:"weapon",summary:"FINISHER",text:"Deal 10 damage; double it if enemy hull is below half.",dmg:10,execute:true},
    "emergency-bubble":{key:"emergency-bubble",name:"Emergency Bubble",cost:0,type:"shield",summary:"SHIELD +4",text:"Raise 4 shields.",shield:4},
    "reflective-screen":{key:"reflective-screen",name:"Reflective Screen",cost:2,type:"shield",summary:"REFLECT 5",text:"Raise 8 shields and reflect 5 damage from the next hit.",shield:8,reflect:5},
    "phase-screen":{key:"phase-screen",name:"Phase Screen",cost:2,type:"shield",summary:"PHASE DODGE",text:"Raise 6 shields and dodge the next attack this round.",shield:6,evade:true},
    "layered-plating":{key:"layered-plating",name:"Layered Plating",cost:1,type:"shield",summary:"ARMOUR +6",text:"Gain 6 armour that blocks hull damage this battle.",armour:6},
    "engine-screen":{key:"engine-screen",name:"Engine Screen",cost:1,type:"shield",summary:"SHIELD + SPEED",text:"Raise 6 shields and restore ENGINES by 10.",shield:6,repEngine:10},
    "bulwark-field":{key:"bulwark-field",name:"Bulwark Field",cost:3,type:"shield",summary:"SHIELDS +20",text:"Raise 20 shields. Lose 1 power next turn.",shield:20,nextPowerPenalty:1},
    "nanite-swarm":{key:"nanite-swarm",name:"Nanite Swarm",cost:2,type:"repair",summary:"REPAIR ALL",text:"Restore 12 integrity to every subsystem.",repAll:12},
    "jury-rig":{key:"jury-rig",name:"Jury-Rig",cost:1,type:"repair",summary:"SYSTEM +25",text:"Restore 25 integrity to the worst subsystem.",repSub:25},
    "seal-bulkheads":{key:"seal-bulkheads",name:"Seal Bulkheads",cost:1,type:"repair",summary:"STOP BREACH",text:"Mend 4 hull and prevent the next crew loss.",heal:4,sealCrew:true},
    "reboot-protocol":{key:"reboot-protocol",name:"Reboot Protocol",cost:1,type:"repair",summary:"RESET SYSTEM",text:"Restore the worst disabled subsystem to 40 integrity.",reboot:40},
    "coolant-flush":{key:"coolant-flush",name:"Coolant Flush",cost:0,type:"power",summary:"REACTOR SAFE",text:"Restore 8 REACTOR integrity and draw 1 card.",repReactor:8,draw:1},
    "reactor-surge":{key:"reactor-surge",name:"Reactor Surge",cost:1,type:"power",summary:"POWER +3",text:"Gain 3 power now, then discard 1 card.",gainP:3,discard:1},
    cannibalise:{key:"cannibalise",name:"Cannibalise Systems",cost:0,type:"power",summary:"POWER +2",text:"Damage your healthiest subsystem by 12 and gain 2 power.",gainP:2,hurtBest:12},
    "aux-battery":{key:"aux-battery",name:"Auxiliary Battery",cost:1,type:"power",summary:"NEXT TURN +2",text:"Gain 2 additional power next turn.",nextPower:2},
    "sensor-ghost":{key:"sensor-ghost",name:"Sensor Ghost",cost:1,type:"tactic",summary:"BLIND",text:"Reduce the enemy's next attack by 8.",blind:8},
    "flanking-burn":{key:"flanking-burn",name:"Flanking Burn",cost:1,type:"tactic",summary:"DOUBLE NEXT",text:"Your next weapon splits into two strikes and gains 3 total damage.",flank:3},
    "decoy-drone":{key:"decoy-drone",name:"Decoy Drone",cost:1,type:"tactic",summary:"NEGATE HIT",text:"Negate the enemy's next attack this round.",evade:true},
    "combat-scan":{key:"combat-scan",name:"Combat Scan",cost:0,type:"tactic",summary:"DRAW WEAPON",text:"Draw a weapon card; it costs 1 less this turn.",drawType:"weapon",discount:1},
    overwatch:{key:"overwatch",name:"Overwatch",cost:1,type:"tactic",summary:"COUNTERFIRE",text:"After the enemy attacks, deal 6 damage back.",overwatch:6},
    "saboteur-team":{key:"saboteur-team",name:"Saboteur Team",cost:2,type:"boarding",summary:"SYSTEM -30",text:"Enemy crew -2 and its worst subsystem -30. Needs 2 crew.",eCrew:2,sabWorst:30,needCrew:2},
    "marine-detachment":{key:"marine-detachment",name:"Marine Detachment",cost:2,type:"boarding",summary:"CREW -4",text:"Enemy crew -4, yours -1. Needs 3 crew.",eCrew:4,sCrew:1,needCrew:3},
    "command-seizure":{key:"command-seizure",name:"Command Seizure",cost:3,type:"boarding",summary:"CAPTURE",text:"Capture if enemy crew is 3 or less; otherwise enemy crew -3. Needs 3 crew.",capture:3,eCrew:3,needCrew:3}
  });
  var SUMMARIES = {laser:"7 DAMAGE",flak:"ANTI-SHIELD",missile:"SHIELD PIERCE",railgun:"REACTOR HIT",broadside:"TRIPLE HIT",torpedo:"15 PIERCE",divert:"SHIELDS +9",angle:"SHIELD + DRAW",capacitor:"SHIELDS +14",brace:"HALVE HIT",dcontrol:"REPAIR + HULL",patch:"HULL +9",overcharge:"POWER +2",reroute:"POWER + DRAW",boarding:"CREW -3",breach:"CREW -5",lock:"NEXT HIT +7",evasive:"DODGE",scavenge:"DRAW 2"};
  Object.keys(SUMMARIES).forEach(function(k){ LIB[k].summary=SUMMARIES[k]; });
  var PRICE = {laser:10,flak:12,missile:20,railgun:26,broadside:22,torpedo:30,divert:10,angle:12,capacitor:18,brace:12,dcontrol:20,patch:10,overcharge:12,reroute:14,boarding:20,breach:26,lock:14,evasive:14,scavenge:14,
    "plasma-lance":20,"ion-needle":14,"chain-cannon":20,"kinetic-ram":30,"mine-layer":16,"emp-warhead":24,"point-blank":22,graviton:28,"execution-beam":30,"emergency-bubble":10,"reflective-screen":20,"phase-screen":22,"layered-plating":16,"engine-screen":16,"bulwark-field":28,"nanite-swarm":24,"jury-rig":14,"seal-bulkheads":14,"reboot-protocol":18,"coolant-flush":12,"reactor-surge":16,cannibalise:12,"aux-battery":14,"sensor-ghost":14,"flanking-burn":16,"decoy-drone":14,"combat-scan":10,overwatch:16,"saboteur-team":22,"marine-detachment":22,"command-seizure":30};
  var SHOP = Object.keys(LIB);
  var REWARDS = Object.keys(LIB);
  // Per-zone enemy roster. Indices 0-2 are the original three; 3-8 were added
  // for the zone rebalance so each region fields its own hulls. The final
  // difficulty of any encounter is stats x difficulty x elite/bounty x zone mult.
  var ENEMIES = [
    {name:"RSV Carrion Jackal",img:"ship-09",role:"CORSAIR RAIDER",hull:44,shieldCap:12,regen:3,crew:5,atkLo:5,atkHi:9,sab:.15,boardN:2,boardCh:.15,shieldAmt:8,rep:0},
    {name:"PCS Ledger's Edge",img:"ship-12",role:"ENFORCEMENT FRIGATE",hull:60,shieldCap:16,regen:4,crew:7,atkLo:8,atkHi:12,sab:.25,boardN:2,boardCh:.2,shieldAmt:10,rep:.15},
    {name:"HMS Iron Verdict",img:"ship-04",role:"DREADNOUGHT · FLAGSHIP",hull:82,shieldCap:22,regen:4,crew:10,atkLo:11,atkHi:15,sab:.28,boardN:3,boardCh:.2,shieldAmt:13,rep:.18},
    {name:"PCV Rust Psalm",img:"ship-13",role:"CORSAIR CUTTER",hull:50,shieldCap:14,regen:3,crew:6,atkLo:6,atkHi:10,sab:.18,boardN:2,boardCh:.18,shieldAmt:9,rep:0},
    {name:"HMS Tithe Collector",img:"ship-06",role:"PACT GUNSHIP",hull:56,shieldCap:14,regen:4,crew:6,atkLo:8,atkHi:11,sab:.22,boardN:2,boardCh:.15,shieldAmt:10,rep:.1},
    {name:"RSV Red Augur",img:"ship-15",role:"SMUGGLER CORSAIR",hull:52,shieldCap:18,regen:5,crew:5,atkLo:9,atkHi:13,sab:.2,boardN:2,boardCh:.1,shieldAmt:12,rep:.12},
    {name:"HMS Anvil Chorus",img:"ship-02",role:"IRONWALL HEAVY FRIGATE",hull:70,shieldCap:18,regen:4,crew:8,atkLo:10,atkHi:14,sab:.28,boardN:3,boardCh:.18,shieldAmt:12,rep:.15},
    {name:"The Locust Prime",img:"ship-14",role:"STRIP-FLEET TENDER",hull:64,shieldCap:12,regen:3,crew:10,atkLo:7,atkHi:11,sab:.2,boardN:3,boardCh:.35,shieldAmt:9,rep:.2},
    {name:"PCS Whisper Warden",img:"ship-03",role:"VEIL PICKET SHIP",hull:58,shieldCap:20,regen:6,crew:6,atkLo:8,atkHi:12,sab:.3,boardN:2,boardCh:.12,shieldAmt:13,rep:0}
  ];
  // ---- sector data: zone-based free-travel galactic map --------------------
  // From the "design_handoff_sector_map" bundle, scaled up 3x: 36 systems in
  // 10 zones on a 2400x1400 scrollable chart. Travel is free along charted
  // lanes; nodes inside a sealed zone are impassable until the zone's
  // requirement (a key item or N zones secured) is met. Securing every system
  // in 4 zones unseals the Blackstar Gate — the road to the next sector.
  var WORLD = { w: 2400, h: 1400 };
  var ZONES = [
    {k:"reach", mult:1.0,    name:"PALEWAKE REACH",      c:"#4fd8ff", lx:2,  ly:55, wx:9,  wy:78, wash:"#10294d66"},
    {k:"shoals", mult:1.0,   name:"THE SHOALS",          c:"#ffc266", lx:19, ly:37, wx:27, wy:57, wash:"#4d360f38"},
    {k:"ember", mult:1.15,    name:"THE EMBER SHELF",     c:"#ffd9a0", lx:5,  ly:3,  wx:15, wy:18, wash:"#4d2a0f40"},
    {k:"corsair", mult:1.3,  name:"CORSAIR EXPANSE",     c:"#ff8aa0", lx:36, ly:3,  wx:45, wy:21, wash:"#4d101e4d",
      req:{key:"corsair", txt:"CORSAIR EXPANSE KEY — RUMORED ABOARD THE DERELICT HULK"}},
    {k:"hallowed", mult:1.3, name:"HALLOWED DRIFT",      c:"#b48aff", lx:38, ly:41, wx:47, wy:57, wash:"#23164d50"},
    {k:"smuggler", mult:1.3, name:"SMUGGLER'S RUN",      c:"#ffc266", lx:30, ly:75, wx:41, wy:87, wash:"#4d3a0f33",
      req:{key:"smuggler", txt:"SMUGGLER'S CIPHER — CARRIED BY THE RED AUGUR"}},
    {k:"ironwall", mult:1.6, name:"THE IRONWALL",        c:"#ff5470", lx:58, ly:9,  wx:65, wy:27, wash:"#4d101e40",
      req:{zones:2, txt:"SECURE 2 ZONES"}},
    {k:"marches", mult:1.45,  name:"THE STARVED MARCHES", c:"#7cf0c0", lx:56, ly:49, wx:65, wy:71, wash:"#0f4d3a26"},
    {k:"veil", mult:1.6,     name:"AUGUR'S VEIL",        c:"#b48aff", lx:79, ly:3,  wx:87, wy:18, wash:"#23164d59",
      req:{key:"veil", txt:"VEIL CHART — HELD IN THE RELIQUARY"}},
    {k:"gate", mult:1.75,     name:"THE BLACKSTAR GATE",  c:"#b48aff", lx:79, ly:53, wx:88, wy:76, wash:"#23164d66",
      req:{zones:4, txt:"SECURE 4 ZONES"}}
  ];
  var GATE_ZONES_REQ = 4;
  var KEY_NAMES = { corsair:"CORSAIR EXPANSE KEY", smuggler:"SMUGGLER'S CIPHER", veil:"VEIL CHART" };
  // Planet disc gradients, verbatim from the handoff's design tokens.
  var DISC = {
    home:    "radial-gradient(circle at 32% 30%, #9ff0d8, #2aa878 45%, #0c3a2c 75%, #06110d)",
    station: "radial-gradient(circle at 35% 30%, #bfe8ff, #2c6a8a 50%, #0a1c28)",
    shipyard:"radial-gradient(circle at 35% 30%, #ffd9a0, #b3672a 50%, #3a1e0c 80%, #140a05)",
    repair:  "radial-gradient(circle at 35% 30%, #c8ffe8, #2aa878 55%, #0c2a20)",
    fight:   "radial-gradient(circle at 35% 30%, #c8d8f0, #40536e 50%, #101828)",
    fight2:  "radial-gradient(circle at 35% 30%, #8593a8, #3a4356 55%, #12161f)",
    elite:   "radial-gradient(circle at 35% 30%, #ffb0c0, #8a2a3e 55%, #240a12)",
    elite2:  "radial-gradient(circle at 35% 30%, #ff9aa8, #7a2436 55%, #1f0810)",
    bounty:  "radial-gradient(circle at 35% 30%, #ffc8b0, #b04a3a 55%, #2a0f0c)",
    anomaly: "radial-gradient(circle at 35% 30%, #d8c8ff, #6a4ab0 50%, #1c1030)",
    gate:    "radial-gradient(circle at 35% 30%, #c0a8ff, #4a3a8a 50%, #100c24)",
    boss:    "radial-gradient(circle at 35% 30%, #ff8a8a, #8a1f2a 45%, #1f060a)"
  };
  var NODE_TY = {
    home:{g:"⌂",c:"#7cf0c0"}, station:{g:"⌂",c:"#7cf0c0"}, shipyard:{g:"⚙",c:"#8deaff"},
    repair:{g:"✚",c:"#7cf0c0"}, fight:{g:"⌖",c:"#5fd8ff"}, elite:{g:"◈",c:"#ff8aa0"},
    bounty:{g:"◎",c:"#ffc266"}, anomaly:{g:"?",c:"#b48aff"}, gate:{g:"⬢",c:"#b48aff"}, boss:{g:"⛧",c:"#ff5470"}
  };
  var TYPE_LABEL = { home:"HOME BASE", station:"STATION", shipyard:"SHIPYARD", repair:"REPAIR DEPOT",
    fight:"SKIRMISH", elite:"ELITE", bounty:"BOUNTY", anomaly:"ANOMALY", gate:"JUMP GATE", boss:"FLAGSHIP" };
  // ---- ship sprite assets ---------------------------------------------------
  // Chroma-keyed fleet pack: the player flies ship-08; each enemy class has
  // its own hull (img on its ENEMIES entry). Every ship has a damaged twin
  // (ship-XX-damaged.png) that swaps in once hull falls below half.
  var PLAYER_SHIP = "ship-08";
  function shipImg(base, damaged) { return "assets/ships/"+base+(damaged?"-damaged":"")+".png"; }

  var NODES = [
    // — PALEWAKE REACH — the home zone
    {id:"haven",x:7,y:76,type:"home",z:"reach",sz:52,label:"HAVEN ANCHORAGE",
     desc:"Your fortified anchorage. Secure the Reach and its lanes stay patrol-free."},
    {id:"picket",x:13,y:62,type:"fight",z:"reach",enemy:0,sz:34,label:"PICKET LINE",
     desc:"A corsair picket watches the anchorage's northern lane. Break it and the Reach breathes easier."},
    {id:"k9",x:15,y:80,type:"station",z:"reach",sz:40,label:"K-9 WAYPOINT",
     desc:"Neutral waystation with a full armory. Revisitable at any time."},
    {id:"debris",x:7,y:92,type:"fight",z:"reach",enemy:0,sz:34,disc:"fight2",label:"DEBRIS FIELD",
     desc:"Raiders hunt salvage teams in the wreck-thick dark south of the anchorage."},
    // — THE SHOALS —
    {id:"forge",x:24,y:68,type:"shipyard",z:"shoals",sz:52,label:"FORGE TETHER",
     stock:["laser","missile","flak"],
     gossip:"“Red Augur came through two cycles back, running hot. Whatever she's hauling, the Pact wants it kept behind the Ironwall.”",
     desc:"An orbital yard wrapped around a gutted moon. Permanent hull refits — plating, emitters, coils, fuel racks."},
    {id:"mercy",x:22,y:50,type:"repair",z:"shoals",sz:34,label:"MERCY DOCK",
     desc:"Hospital hulk. Cheap hull work, no questions asked."},
    {id:"hulk",x:30,y:44,type:"anomaly",z:"shoals",key:"corsair",sz:44,label:"DERELICT HULK",
     desc:"A dead capital ship drifting at the zone's edge. Boarding parties report... movement.",
     evd:"A dead capital ship, spine cracked, holds open to vacuum. Your teams find the Pact's lane cipher still warm in the navigation core. They can also strip the wreck fast — or sweep it for survivors sealed in the aft frames."},
    {id:"shoalconvoy",x:31,y:60,type:"fight",z:"shoals",enemy:3,sz:36,label:"SHOAL CONVOY",
     desc:"A Pact tithe-convoy threads the shallows under light escort."},
    // — THE EMBER SHELF —
    {id:"emberpicket",x:10,y:28,type:"fight",z:"ember",enemy:0,sz:34,disc:"fight2",label:"EMBER PICKET",
     desc:"Corsair lookouts squat in the cinder-glow where the Shelf burns closest to the lanes."},
    {id:"cinder",x:8,y:12,type:"station",z:"ember",sz:40,label:"CINDER YARDS",
     desc:"A soot-black trade ring hanging over the Shelf's furnace clouds. Full armory."},
    {id:"ashconvoy",x:18,y:20,type:"fight",z:"ember",enemy:4,sz:36,label:"ASH CONVOY RAID",
     desc:"An enforcement supply run crosses the Shelf under frigate escort."},
    {id:"furnace",x:24,y:10,type:"anomaly",z:"ember",sz:44,label:"FURNACE ANOMALY",
     desc:"Something is alive inside the Shelf's oldest smelter hulk. Sensors disagree on what.",
     evd:"The smelter hulk still burns after a century adrift. Deep in the slag your crew finds sealed cargo cells — and sealed crew berths."},
    // — CORSAIR EXPANSE — sealed: Corsair Expanse key
    {id:"augur",x:38,y:24,type:"bounty",z:"corsair",enemy:5,key:"smuggler",sz:40,label:"BOUNTY: RED AUGUR",
     desc:"The Pact's best smuggler captain. Her ship carries the cipher that opens Smuggler's Run."},
    {id:"ambush",x:46,y:12,type:"elite",z:"corsair",enemy:3,sz:38,label:"CORSAIR AMBUSH",
     desc:"A corsair pack anchors the Expanse's inner lane."},
    {id:"tollgate",x:46,y:30,type:"fight",z:"corsair",enemy:4,sz:36,disc:"fight2",label:"PACT TOLLGATE",
     desc:"Every hull that crosses the Expanse pays the Pact here. You won't."},
    {id:"anchorage",x:52,y:20,type:"elite",z:"corsair",enemy:3,sz:38,disc:"elite2",label:"PACT ANCHORAGE",
     desc:"The corsairs' forward harbor — break it and the Expanse is yours."},
    // — HALLOWED DRIFT —
    {id:"chapel",x:42,y:50,type:"anomaly",z:"hallowed",sz:44,label:"CHAPEL HULK",
     desc:"A pilgrim ship gone silent mid-hymn. The congregation never disembarked.",
     evd:"The pilgrim ship drifts mid-hymn, reliquary lamps still lit. The hold is heavy with votive metal; the aft frames knock, slowly, from the inside."},
    {id:"hermitage",x:40,y:66,type:"repair",z:"hallowed",sz:34,label:"DRIFT HERMITAGE",
     desc:"Anchorite tenders patch hulls for any crew that keeps the silence."},
    {id:"choir",x:48,y:58,type:"fight",z:"hallowed",enemy:3,sz:36,label:"SILENT CHOIR",
     desc:"Wreckers broadcasting a false distress-hymn to bait salvage crews."},
    {id:"reliquary",x:54,y:48,type:"bounty",z:"hallowed",enemy:4,key:"veil",sz:40,label:"BOUNTY: RELIQUARY",
     desc:"An armored reliquary barge. Its vault holds the only chart through Augur's Veil."},
    // — SMUGGLER'S RUN — sealed: smuggler's cipher
    {id:"harbor",x:34,y:88,type:"station",z:"smuggler",sz:40,label:"QUIET HARBOR",
     desc:"A no-flag freeport sunk in the shadow of the Run. Everything's for sale once."},
    {id:"cache",x:42,y:82,type:"anomaly",z:"smuggler",sz:44,label:"CONTRABAND CACHE",
     desc:"A cold-drifting cargo train, transponders cut. Somebody's rainy-day fortune.",
     evd:"A kilometre of cold-drifting cargo pods, transponders cut. Stencilled on every hatch: PROPERTY OF THE RED AUGUR."},
    {id:"gauntlet",x:48,y:90,type:"fight",z:"smuggler",enemy:3,sz:36,disc:"fight2",label:"RUNNER'S GAUNTLET",
     desc:"The Run's last leg — flown dark, fast, and shot at."},
    // — THE IRONWALL — sealed: secure 2 zones
    {id:"watchline",x:60,y:34,type:"fight",z:"ironwall",enemy:1,sz:36,label:"WATCH LINE",
     desc:"Enforcement pickets strung wire-tight across the Ironwall's approach."},
    {id:"bastion",x:64,y:20,type:"elite",z:"ironwall",enemy:6,sz:38,label:"IRONWALL BASTION",
     desc:"The wall's anchor fortress. Frigates rotate through in pairs."},
    {id:"anvil",x:72,y:28,type:"elite",z:"ironwall",enemy:6,sz:38,disc:"elite2",label:"GUN PLATFORM ANVIL",
     desc:"A dreadnought-calibre gun bolted to an asteroid. It only has to hit you once."},
    // — THE STARVED MARCHES —
    {id:"marchespicket",x:58,y:60,type:"fight",z:"marches",enemy:4,sz:36,label:"MARCHES PICKET",
     desc:"Hungry ships guard hungrier lanes on the sector's long east road."},
    {id:"hollowyard",x:62,y:74,type:"shipyard",z:"marches",sz:52,label:"HOLLOW YARD",
     stock:["railgun","capacitor","scavenge"],
     gossip:"“Ironwall Command doubled the Gate watch. Four zones' worth of trouble, they reckon, before anyone sees that ring light up.”",
     desc:"A half-starved yard drinking power from a cracked reactor barge. The refits are honest; the prices aren't."},
    {id:"famine",x:70,y:62,type:"repair",z:"marches",sz:34,label:"FAMINE RELIEF STATION",
     desc:"A relief hulk that patches hulls in trade for escort work nobody logs."},
    {id:"locust",x:72,y:84,type:"elite",z:"marches",enemy:7,sz:38,label:"LOCUST SWARM",
     desc:"A strip-fleet that eats convoys down to the frame. It has noticed the Palewake."},
    // — AUGUR'S VEIL — sealed: veil chart
    {id:"veilambush",x:82,y:24,type:"elite",z:"veil",enemy:8,sz:38,label:"VEIL AMBUSH",
     desc:"Corsairs hide inside the Veil's sensor shadow — wakes cold, guns warm."},
    {id:"whisper",x:88,y:10,type:"bounty",z:"veil",enemy:8,sz:40,label:"BOUNTY: WHISPER RELAY",
     desc:"The Pact's listening post. Its captain is worth more than the hardware."},
    {id:"veilheart",x:92,y:22,type:"anomaly",z:"veil",sz:44,label:"THE VEIL",
     desc:"The anomaly the zone is named for. Charts refuse to agree on where it is.",
     evd:"Inside the Veil the stars run like wet paint. Your instruments log salvage that isn't there yet — and a lifepod that is."},
    // — THE BLACKSTAR GATE — sealed: secure 4 zones
    {id:"approach",x:82,y:64,type:"fight",z:"gate",enemy:6,sz:36,label:"GATE APPROACH",
     desc:"The last freeway to the ring, held by the Verdict's escort screen."},
    {id:"gate",x:88,y:76,type:"gate",z:"gate",sz:44,label:"BLACKSTAR GATE",
     desc:"The only way out of this sector — and the Iron Verdict is anchored on it."},
    {id:"verdict",x:94,y:88,type:"boss",z:"gate",enemy:2,sz:48,label:"THE IRON VERDICT",
     desc:"The dreadnought. Break it, or the Verge keeps you."}
  ];
  var EDGES = [
    ["haven","picket"],["haven","k9"],["haven","debris"],["picket","k9"],
    ["k9","forge"],["picket","mercy"],["debris","harbor"],
    ["forge","mercy"],["mercy","hulk"],["forge","shoalconvoy"],["shoalconvoy","hulk"],
    ["mercy","emberpicket"],
    ["emberpicket","cinder"],["emberpicket","ashconvoy"],["cinder","ashconvoy"],["ashconvoy","furnace"],
    ["furnace","augur"],["hulk","augur"],
    ["augur","ambush"],["augur","tollgate"],["ambush","anchorage"],["tollgate","anchorage"],
    ["anchorage","bastion"],
    ["shoalconvoy","chapel"],["forge","hermitage"],
    ["chapel","choir"],["hermitage","choir"],["choir","reliquary"],
    ["reliquary","tollgate"],
    ["hermitage","cache"],["forge","harbor"],
    ["cache","harbor"],["cache","gauntlet"],
    ["gauntlet","hollowyard"],
    ["reliquary","marchespicket"],
    ["marchespicket","hollowyard"],["marchespicket","famine"],["hollowyard","locust"],["famine","locust"],
    ["marchespicket","watchline"],
    ["watchline","bastion"],["bastion","anvil"],["watchline","anvil"],
    ["anvil","veilambush"],
    ["veilambush","whisper"],["whisper","veilheart"],["veilambush","veilheart"],
    ["famine","approach"],["locust","approach"],["anvil","approach"],
    ["approach","gate"],["gate","verdict"]
  ];
  var NBYID = {}; NODES.forEach(function(n){ NBYID[n.id]=n; });
  var ZBYK = {}; ZONES.forEach(function(z){ ZBYK[z.k]=z; });
  // One radial wash per zone, centered on the zone's cluster.
  var WASH_BG = ZONES.map(function(z){
    return "radial-gradient(560px 420px at "+z.wx+"% "+z.wy+"%, "+z.wash+", transparent 62%)";
  }).join(",");
  // Permanent refits — sold only at shipyards now (stations keep the armory).
  var YARD_REFITS = [
    {k:"plating", name:"Reinforced Plating",  desc:"+14 max hull, applied immediately", price:40},
    {k:"emitters",name:"Shield Emitters",     desc:"+8 shield capacity",                price:35},
    {k:"reactor", name:"Reactor Coils",       desc:"+1 reactor power every turn",       price:50},
    {k:"racks",   name:"Extended Fuel Racks", desc:"+2 fuel cell capacity, filled on install", price:45, isNew:true},
    {k:"rig",     name:"Salvage Rig",         desc:"+15% salvage from every wreck",     price:55, isNew:true}
  ];
  var DIFFS = {
    standard:{mult:1,  name:"Standard", blurb:"A fair fight. The Verge as intended."},
    hard:    {mult:1.2,name:"Hard",     blurb:"Enemy hull & fire +20%. Bring a plan."},
    brutal:  {mult:1.45,name:"Brutal",  blurb:"Enemy hull & fire +45%. Few return."}
  };

  var _uid = 0, _fid = 0;

  // ---- audio ----------------------------------------------------------------
  // Short SFX from the sounds pack. new/cloned Audio per call so shots overlap.
  var AUDIO_KEYS = ["enemy_sighted_m","enemy_sighted_f","reporting_damage","reporting_damage_1",
    "laser_beam","laser_cannon","blaster","small_explosion","medium_explosion","torpedo_explosion",
    "enemy_destroyed","ship_destroyed"];
  var AUDIO = {};
  function preloadAudio(){
    if (AUDIO._done) return; AUDIO._done = true;
    AUDIO_KEYS.forEach(function(n){ try{ var a=new Audio("assets/audio/"+n+".mp3"); a.preload="auto"; AUDIO[n]=a; }catch(e){} });
  }
  function sfx(name, vol){
    try{
      var base=AUDIO[name];
      var a=base ? base.cloneNode(true) : new Audio("assets/audio/"+name+".mp3");
      a.volume=(vol==null?1:vol); var pr=a.play(); if(pr&&pr.catch) pr.catch(function(){});
    }catch(e){}
  }
  function rndOf(a){ return a[Math.floor(Math.random()*a.length)]; }

  // ---- FX sprite config (from the projectiles / explosions pack) ------------
  var FX = {
    playerBolt:"assets/fx/player_bolt.png", enemyBolt:"assets/fx/enemy_bolt.png",
    muzzlePlayer:"assets/fx/muzzle_player.png", muzzleEnemy:"assets/fx/muzzle_enemy.png",
    impactEnemy:"assets/fx/impact_enemy.png", impactPlayer:"assets/fx/impact_player.png",
    shieldHitEnemy:"assets/fx/shield_hit_enemy.png", shieldHitPlayer:"assets/fx/shield_hit_player.png"
  };
  var EXPL = {
    orange:{sheet:"assets/fx/explosion_orange.png", cols:8, rows:2, frames:16},
    red:   {sheet:"assets/fx/explosion_red.png",    cols:8, rows:2, frames:16},
    capital:{sheet:"assets/fx/explosion_capital.png", cols:8, rows:3, frames:20}
  };

  Game.prototype.LIB = LIB;

  // ---- lifecycle ----------------------------------------------------------
  Game.prototype.componentDidMount = function () {
    var self = this;
    this.fx = [];            // transient projectile / flash / explosion sprites
    this._fxid = 0;
    this.aimPos = null;      // {x,y} client coords while aiming
    this.aimOrigin = null;   // player muzzle in client coords while aiming
    if (!this.view) this.view = { zoom:1, panX:0, panY:0 };
    preloadAudio();
    // Background music — created once, looped. Two tracks: the ambient theme
    // for menus/map/station, and a driving combat track during battles.
    // Browsers block autoplay until the first user gesture, so also arm a
    // one-shot gesture starter.
    this._scene = "ambient";
    try {
      this._music = new Audio("assets/audio/drift_beyond_io.mp3");
      this._music.loop = true; this._music.volume = 0.4; this._music.preload = "auto";
    } catch (e) { this._music = null; }
    try {
      this._combat = new Audio("assets/audio/combat_music.mp3");
      this._combat.loop = true; this._combat.volume = 0.45; this._combat.preload = "auto";
    } catch (e) { this._combat = null; }
    this._startMusic = function () { self.applyMusic(); };
    this._onGesture = function () { self._startMusic(); window.removeEventListener("pointerdown", self._onGesture); window.removeEventListener("keydown", self._onGesture); };
    this._startMusic();  // try immediately (works if the browser allows it)
    window.addEventListener("pointerdown", this._onGesture);
    window.addEventListener("keydown", this._onGesture);
    this._onR = function () { self.forceUpdate(); };
    this._onKey = function (e) {
      if (e.key === "Escape") { var B=self.state.battle; if (B && B.aiming) { self.cancelAim(); } if (self.hoverCard) { self.hoverLeave(); } }
    };
    // Global mouse-up ends any panning even if released outside the battle area.
    this._onUp = function () { self._panning=false; self.mapUp(); };
    window.addEventListener("resize", this._onR);
    window.addEventListener("keydown", this._onKey);
    window.addEventListener("mouseup", this._onUp);
  };
  Game.prototype.componentWillUnmount = function () {
    window.removeEventListener("resize", this._onR);
    window.removeEventListener("keydown", this._onKey);
    window.removeEventListener("mouseup", this._onUp);
    window.removeEventListener("pointerdown", this._onGesture);
    window.removeEventListener("keydown", this._onGesture);
    if (this._music) { try { this._music.pause(); } catch (e) {} }
    if (this._combat) { try { this._combat.pause(); } catch (e) {} }
  };
  // Play the track for the current scene ("ambient" or "combat") when music is
  // on, pausing the other; pause both when muted.
  Game.prototype.applyMusic = function () {
    var combat = this._scene === "combat";
    var want = combat ? this._combat : this._music;
    var other = combat ? this._music : this._combat;
    if (other) { try { other.pause(); } catch (e) {} }
    if (!want) return;
    if (this.music.on) { var p = want.play(); if (p && p.catch) p.catch(function(){}); }
    else { try { want.pause(); } catch (e) {} }
  };
  // Switch the background scene, restarting the combat track at each battle.
  Game.prototype.setMusicScene = function (scene) {
    if (this._scene !== scene) {
      this._scene = scene;
      if (scene === "combat" && this._combat) { try { this._combat.currentTime = 0; } catch (e) {} }
    }
    this.applyMusic();
  };
  Game.prototype.toggleMusic = function () {
    this.music.on = !this.music.on;
    try { localStorage.setItem("hf_music", this.music.on ? "on" : "off"); } catch (e) {}
    this.applyMusic();
    this.forceUpdate();
  };
  Game.prototype.renderMusicBtn = function () {
    var self=this, on=this.music.on;
    return html`<button onClick=${function(e){ if(e&&e.stopPropagation)e.stopPropagation(); self.toggleMusic(); }}
      title=${on?"Music on — click to mute":"Music muted — click to play"}
      style=${"display:inline-flex;align-items:center;gap:6px;font-family:"+MONO+";font-size:11px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;background:#0d1424;border:1px solid "+(on?"#2c4066":"#22345a")+";border-radius:4px;padding:6px 11px;color:"+(on?"#8deaff":"#5f7396")+";white-space:nowrap"}>
      <span style="font-size:13px;line-height:1">${on?"♪":"♪"}</span>${on?"Music":"Muted"}</button>`;
  };

  // ---- a fresh run (starts on the title screen) ---------------------------
  Game.prototype.freshRun = function () {
    return {
      screen: "title", overlay: null,
      salvage: (this.config && this.config.startingSalvage != null) ? this.config.startingSalvage : 40,
      current: "haven", sel: null, taken: { haven: true }, gliding: false,
      zoneKeys: {}, yardBought: {}, stationStock: {},
      player: { hullMax:64, hull:64, crew:8, crewMax:8, powerBase:3, shieldCap:22, shield:0,
                fuel:5, fuelMax:5,
                subs:{ weapons:100, reactor:100, engines:100 }, ups:{} },
      deckKeys: ["laser","laser","laser","laser","divert","divert","divert","patch","missile","overcharge"],
      battle:null, base:null, yard:null, evNode:null, end:null, reward:null, cardDetail:null, shakeP:0, shakeE:0
    };
  };

  // ---- math / rng helpers -------------------------------------------------
  Game.prototype.ri = function (a,b) { return Math.floor(Math.random()*(b-a+1))+a; };
  Game.prototype.pk = function (a) { return a[Math.floor(Math.random()*a.length)]; };
  Game.prototype.cl = function (v,a,b) { return Math.max(a, Math.min(b, v)); };
  Game.prototype.sh = function (a) { for (var i=a.length-1;i>0;i--){ var j=this.ri(0,i); var t=a[i]; a[i]=a[j]; a[j]=t; } return a; };
  Game.prototype.mk = function (k) { return Object.assign({ uid: ++_uid }, LIB[k]); };
  Game.prototype.fid = function () { return ++_fid; };
  Game.prototype.diffMult = function () { var d = this.config.difficulty || "standard"; return (DIFFS[d] || DIFFS.standard).mult; };
  Game.prototype.wm = function (subs) { return .5 + .5*subs.weapons/100; };
  Game.prototype.rp = function () { var p = this.state.player; return Math.max(1, Math.round(p.powerBase*(.4 + .6*p.subs.reactor/100))); };
  Game.prototype.worstSub = function (subs) { return Object.keys(subs).sort(function(a,b){return subs[a]-subs[b];})[0]; };
  Game.prototype.bestSub = function (subs) { return Object.keys(subs).sort(function(a,b){return subs[b]-subs[a];})[0]; };
  Game.prototype.subFx = function (nm,v) {
    if (v>=85) return "nominal";
    if (nm==="weapons") return v<=25 ? "guns failing" : "aim degraded";
    if (nm==="reactor") return v<=25 ? "power crippled" : "power reduced";
    return v<=25 ? "regen offline" : "regen weak";
  };

  // ---- combat log & transient FX -----------------------------------------
  Game.prototype.log = function (color,text,mark) {
    var B = this.state.battle; if (!B) return;
    B.logs.push({ k:this.fid(), color:color, text:text, mark:!!mark });
    if (B.logs.length>40) B.logs.shift();
  };
  Game.prototype.addFloat = function (side,text,color) {
    var B = this.state.battle; if (!B) return; var k = this.fid(); var self = this;
    B.floats.push({ k:k, left:110+this.ri(0,480), top:(side==="e"?"calc(50% - 220px)":"calc(50% + 160px)"), text:text, color:color });
    setTimeout(function(){ var b=self.state.battle; if(!b)return; b.floats=b.floats.filter(function(f){return f.k!==k;}); self.forceUpdate(); },1100);
  };
  Game.prototype.addBeam = function () {
    var B = this.state.battle; if (!B) return; var k = this.fid(); var self = this;
    B.beams.push({ k:k, left:130+this.ri(0,500) });
    setTimeout(function(){ var b=self.state.battle; if(!b)return; b.beams=b.beams.filter(function(f){return f.k!==k;}); self.forceUpdate(); },700);
  };

  // ---- damage resolution --------------------------------------------------
  Game.prototype.dealDamage = function (side,amt,pierce) {
    var S=this.state, B=S.battle, t = side==="e" ? B.enemy : S.player;
    var abs=0, arm=0, toHull=amt;
    if (!pierce && t.shield>0) { abs=Math.min(t.shield,amt); t.shield-=abs; toHull=amt-abs; }
    if (side!=="e" && toHull>0 && B.armour>0) { arm=Math.min(B.armour,toHull); B.armour-=arm; toHull-=arm; }
    t.hull = this.cl(t.hull-toHull,0,t.hullMax);
    if (toHull>0) this.addFloat(side,"-"+toHull,"#ff8aa0");
    else if (arm>0) this.addFloat(side,"-"+arm+" ARM","#b7c5d9");
    else if (abs>0) this.addFloat(side,"-"+abs+" SH","#6fd8ff");
    if (side==="e") S.shakeE++; else S.shakeP++;
    return { toHull:toHull, abs:abs, arm:arm };
  };

  // ---- battle setup / turn structure -------------------------------------
  Game.prototype.startBattle = function (node) {
    var S=this.state, d=ENEMIES[node.enemy];
    var zm=(node.z&&ZBYK[node.z]&&ZBYK[node.z].mult)||1;
    var m=this.diffMult()*((node.type==="elite"||node.type==="bounty")?1.3:1)*(node.type==="boss"?1:zm);
    S.battle = {
      node:node, turn:1, busy:false, over:false, lock:0, brace:false, evade:false, aiming:null,
      armour:0, reflect:0, blind:0, overwatch:0, flank:0, sealCrew:false,
      nextPower:0, nextPowerPenalty:0, mines:[], detailUid:null,
      enemy:{ name:d.name, role:d.role, img:d.img||"ship-09", hullMax:Math.round(d.hull*m), hull:Math.round(d.hull*m),
        shieldCap:d.shieldCap, shield:0, regen:d.regen, crew:d.crew, crewMax:d.crew,
        atkLo:Math.round(d.atkLo*m), atkHi:Math.round(d.atkHi*m), sab:d.sab, boardN:d.boardN,
        boardCh:d.boardCh, shieldAmt:d.shieldAmt, rep:d.rep,
        subs:{ weapons:100, reactor:100, engines:100 }, intent:null },
      draw:this.sh(S.deckKeys.map(this.mk.bind(this))), hand:[], disc:[], logs:[], floats:[], beams:[], played:null
    };
    S.player.shield=0; S.screen="battle"; S.overlay=null;
    this.fx = []; this.aimPos = null;   // clear any stale FX from a prior battle
    this.view = { zoom:1, panX:0, panY:0 }; this.hideHover();   // reset camera & dwell panel
    this.chooseIntent();
    this.setMusicScene("combat");
    this.log("#5a6d8f", d.name+" closes to weapons range.", true);
    preloadAudio();
    sfx(rndOf(["enemy_sighted_m","enemy_sighted_f"]), .95);   // "enemy sighted" hail
    this.startPlayerTurn(); this.forceUpdate();
  };
  Game.prototype.drawCards = function (n) {
    var B=this.state.battle;
    for (var i=0;i<n;i++){
      if (!B.draw.length){ if (!B.disc.length) break; B.draw=this.sh(B.disc); B.disc=[]; this.log("#b3c4de","Deck cycled — discard reshuffled."); }
      B.hand.push(B.draw.pop());
    }
  };
  Game.prototype.drawType = function (type,discount) {
    var B=this.state.battle, i=-1;
    function find(a){ for(var j=a.length-1;j>=0;j--){ if(a[j].type===type) return j; } return -1; }
    i=find(B.draw);
    if (i<0 && B.disc.length) { B.draw=this.sh(B.draw.concat(B.disc)); B.disc=[]; i=find(B.draw); }
    if (i<0) { this.log("#b3c4de","No "+type+" card available to draw."); return; }
    var c=B.draw.splice(i,1)[0];
    if (discount) { c.baseCost=c.cost; c.cost=Math.max(0,c.cost-discount); }
    B.hand.push(c); this.log("#9fdcff","Drew "+c.name+(discount?" at -"+discount+" cost.":"."));
  };
  Game.prototype.restoreCardCost = function (c) {
    if (c && c.baseCost!=null) { c.cost=c.baseCost; delete c.baseCost; }
  };
  Game.prototype.startPlayerTurn = function () {
    var S=this.state, B=S.battle, p=S.player;
    var reg = Math.round(3*p.subs.engines/100);
    if (reg>0) p.shield=this.cl(p.shield+reg,0,p.shieldCap);
    p.power=Math.max(0,this.rp()+(B.nextPower||0)-(B.nextPowerPenalty||0));
    B.nextPower=0; B.nextPowerPenalty=0; B.lock=0; B.brace=false; B.evade=false;
    while (B.hand.length<5 && (B.draw.length||B.disc.length)) this.drawCards(1);
  };
  Game.prototype.endTurn = function () {
    var B=this.state.battle; if (!B||B.busy||B.over||B.aiming) return;
    for (var i=0;i<B.hand.length;i++) this.restoreCardCost(B.hand[i]);
    B.busy=true; B.disc.push.apply(B.disc,B.hand); B.hand=[]; this.forceUpdate();
    var self=this; setTimeout(function(){ self.enemyPhase(); },500);
  };
  Game.prototype.enemyPhase = function () {
    var S=this.state, B=S.battle; if (!B||B.over) return;
    var e=B.enemy, p=S.player, it=e.intent; var self=this;
    this.log("#5a6d8f","— "+e.name+" acts —",true);
    var reg=Math.round(e.regen*e.subs.engines/100);
    if (reg>0) e.shield=this.cl(e.shield+reg,0,e.shieldCap);
    if (it.type==="attack") {
      if (B.evade) { this.log("#9fdcff","Evasive burn — you slip the volley. No damage."); }
      else {
        var d=Math.round(it.value*this.wm(e.subs));
        if (B.blind) { d=Math.max(0,d-B.blind); this.log("#9fdcff","Sensor ghost spoils their aim (-"+B.blind+" damage)."); B.blind=0; }
        if (B.brace) { d=Math.ceil(d/2); this.log("#9fdcff","Brace cuts the hit in half."); }
        // enemy weapon fire — a distinct (red) bolt + sound, impact on the player ship
        this.enemyFire();
        var r=this.dealDamage("p",d,false);
        this.log("#ff8aa0","Fire rakes your ship — "+(r.abs?r.abs+" to shields, ":"")+(r.arm?r.arm+" to armour, ":"")+r.toHull+" to hull.");
        if (it.sab) { var nm=this.pk(["weapons","reactor","engines"]); this.hurtPlayerSub(nm,it.sab); this.log("#ff8aa0","Their gunners smash your "+nm.toUpperCase()+" (-"+it.sab+")."); }
        if (B.reflect) { var ref=B.reflect; B.reflect=0; this.dealDamage("e",ref,true); this.log("#9fdcff","Reflective screen returns "+ref+" damage."); }
        if (B.overwatch) { var ow=B.overwatch; B.overwatch=0; this.dealDamage("e",ow,false); this.log("#9fdcff","Overwatch counterfires for "+ow+"."); }
      }
    } else if (it.type==="shield") { e.shield=this.cl(e.shield+it.value,0,e.shieldCap); this.log("#ff8aa0",e.name+" reinforces its shields (+"+it.value+")."); }
    else if (it.type==="board") {
      if (B.sealCrew) { B.sealCrew=false; this.log("#9fdcff","Sealed bulkheads stop the boarding assault."); }
      else { p.crew=this.cl(p.crew-it.value,0,p.crewMax); var nm2=this.pk(["weapons","reactor","engines"]); this.hurtPlayerSub(nm2,10); S.shakeP++; this.log("#ff8aa0","Boarders storm your decks — "+it.value+" crew lost, "+nm2.toUpperCase()+" sabotaged."); }
    }
    else if (it.type==="repair") { e.hull=this.cl(e.hull+it.value,0,e.hullMax); var w=this.worstSub(e.subs); e.subs[w]=this.cl(e.subs[w]+25,0,100); this.log("#ff8aa0",e.name+" runs damage control (+"+it.value+" hull)."); }
    if (B.mines.length) {
      var mineTotal=B.mines.reduce(function(sum,n){return sum+n;},0); B.mines=[];
      this.dealDamage("e",mineTotal,false); this.log("#9fdcff","Planted mines detonate for "+mineTotal+" damage.");
    }
    this.forceUpdate();
    if (this.checkEnd()) return;
    setTimeout(function(){ var b=self.state.battle; if(!b||b.over)return; self.chooseIntent(); b.turn++; b.busy=false; self.startPlayerTurn(); self.forceUpdate(); },600);
  };
  Game.prototype.chooseIntent = function () {
    var B=this.state.battle, e=B.enemy, p=this.state.player, o=[]; var self=this;
    o.push({ w:5, m:function(){ return { type:"attack", value:self.ri(e.atkLo,e.atkHi), sab:Math.random()<e.sab?self.ri(12,22):0 }; } });
    if (e.shield<e.shieldCap*.4) o.push({ w:2, m:function(){ return { type:"shield", value:e.shieldAmt }; } });
    if (e.boardCh && p.crew>0) o.push({ w:e.boardCh*10, m:function(){ return { type:"board", value:e.boardN }; } });
    if (e.rep && (e.hull<e.hullMax*.55 || Math.min(e.subs.weapons,e.subs.reactor,e.subs.engines)<50)) o.push({ w:e.rep*10, m:function(){ return { type:"repair", value:self.ri(8,14) }; } });
    var tot=o.reduce(function(s,x){return s+x.w;},0); var r=Math.random()*tot, c=o[0];
    for (var i=0;i<o.length;i++){ r-=o[i].w; if (r<=0){ c=o[i]; break; } }
    e.intent=c.m();
  };

  // ---- playing cards ------------------------------------------------------
  Game.prototype.playCard = function (uid) {
    var S=this.state, B=S.battle; if (!B||B.busy||B.over) return;
    this.hideHover();
    var i=-1; for (var j=0;j<B.hand.length;j++){ if (B.hand[j].uid===uid){ i=j; break; } }
    if (i<0) return;
    var c=B.hand[i];
    if (c.cost>S.player.power) return;
    if (c.needCrew && S.player.crew<c.needCrew) { this.log("#b3c4de","Not enough crew to man "+c.name+"."); this.forceUpdate(); return; }
    // Weapons are aimed by hand: enter targeting mode instead of resolving now.
    if (c.type==="weapon") { this.beginAim(c); return; }
    S.player.power-=c.cost; B.hand.splice(i,1); this.restoreCardCost(c); B.disc.push(c);
    B.played=c; var u=c.uid; var self=this;
    setTimeout(function(){ var b=self.state.battle; if (b&&b.played&&b.played.uid===u){ b.played=null; self.forceUpdate(); } },950);
    this.resolveCard(c); this.forceUpdate(); this.checkEnd();
  };
  Game.prototype.resolveCard = function (c) {
    var S=this.state, B=S.battle, p=S.player, e=B.enemy;
    if (c.stripShield) { var stripped=Math.min(e.shield,c.stripShield); e.shield-=stripped; this.log("#9fdcff",c.name+" strips "+stripped+" shields."); }
    if (c.dmg!=null) {
      var hits=c.hits||1, base=c.dmg, tot=0, absTot=0;
      if (c.execute && e.hull<e.hullMax*.5) base*=2;
      if (c._flank) { hits*=2; base=Math.max(1,Math.floor(base/2)); }
      for (var i=0;i<hits;i++){
        var d=base+B.lock+(c._flank&&i===0?(c._flankBonus||0):0); B.lock=0;
        if (c.bonusNoShield && e.shield<=0) d+=c.bonusNoShield;
        d=Math.round(d*this.wm(p.subs));
        var r=this.dealDamage("e",d,!!c.pierce); tot+=r.toHull; absTot+=r.abs;
      }
      this.log("#9fdcff", c.name+" — "+(c.pierce?tot+" straight to hull.":(absTot?absTot+" to shields, "+tot+" to hull.":tot+" to hull.")));
      if (c.sab) { e.subs.reactor=this.cl(e.subs.reactor-c.sab,0,100); this.log("#9fdcff","Their REACTOR loses "+c.sab+" integrity."); }
      if (c.sabEngine) { e.subs.engines=this.cl(e.subs.engines-c.sabEngine,0,100); this.log("#9fdcff","Their ENGINES lose "+c.sabEngine+" integrity."); }
      if (c.sabAll) { Object.keys(e.subs).forEach(function(k){e.subs[k]=Math.max(0,e.subs[k]-c.sabAll);}); this.log("#9fdcff","EMP shocks every enemy subsystem (-"+c.sabAll+")."); }
    }
    if (c.mine) { B.mines.push(c.mine); this.log("#9fdcff","Mine armed — "+c.mine+" damage after the enemy acts."); }
    if (c.selfHull) { p.hull=this.cl(p.hull-c.selfHull,0,p.hullMax); this.addFloat("p","-"+c.selfHull,"#ff8aa0"); S.shakeP++; this.log("#b3c4de","Ramming costs "+c.selfHull+" hull."); }
    if (c.retaliate && e.hull>0) { this.dealDamage("p",c.retaliate,false); this.log("#ff8aa0","Point-blank return fire deals "+c.retaliate+"."); }
    if (c.shield) { p.shield=this.cl(p.shield+c.shield,0,p.shieldCap); this.log("#9fdcff",c.name+" — +"+c.shield+" shields."); }
    if (c.brace) B.brace=true;
    if (c.repSub) { var w=this.worstSub(p.subs); p.subs[w]=this.cl(p.subs[w]+c.repSub,0,100); this.log("#9fdcff","Damage control restores "+w.toUpperCase()+" (+"+c.repSub+")."); }
    if (c.repAll) { Object.keys(p.subs).forEach(function(k){p.subs[k]=Math.min(100,p.subs[k]+c.repAll);}); this.log("#9fdcff","All subsystems restored +"+c.repAll+"."); }
    if (c.repEngine) { p.subs.engines=this.cl(p.subs.engines+c.repEngine,0,100); this.log("#9fdcff","ENGINES restored +"+c.repEngine+"."); }
    if (c.repReactor) { p.subs.reactor=this.cl(p.subs.reactor+c.repReactor,0,100); this.log("#9fdcff","REACTOR restored +"+c.repReactor+"."); }
    if (c.reboot) { var rb=this.worstSub(p.subs); p.subs[rb]=Math.max(p.subs[rb],c.reboot); this.log("#9fdcff",rb.toUpperCase()+" rebooted to "+p.subs[rb]+"."); }
    if (c.heal) { p.hull=this.cl(p.hull+c.heal,0,p.hullMax); this.log("#9fdcff","Hull sealed +"+c.heal+"."); }
    if (c.gainP) { p.power+=c.gainP; this.log("#9fdcff",c.name+" — +"+c.gainP+" power."); }
    if (c.selfSub) { this.hurtPlayerSub("reactor",c.selfSub); this.log("#b3c4de","Reactor strained (-"+c.selfSub+")."); }
    if (c.hurtBest) { var best=this.bestSub(p.subs); this.hurtPlayerSub(best,c.hurtBest); this.log("#b3c4de",best.toUpperCase()+" cannibalised (-"+c.hurtBest+")."); }
    if (c.draw) { this.drawCards(c.draw); this.log("#9fdcff","Drew "+c.draw+"."); }
    if (c.drawType) this.drawType(c.drawType,c.discount||0);
    if (c.discard) { for(var dc=0;dc<c.discard&&B.hand.length;dc++){ var di=this.ri(0,B.hand.length-1), gone=B.hand.splice(di,1)[0]; this.restoreCardCost(gone); B.disc.push(gone); this.log("#b3c4de","Discarded "+gone.name+"."); } }
    if (c.lock) { B.lock+=c.lock; this.log("#9fdcff","Target lock — next weapon +"+c.lock+"."); }
    if (c.evade) { B.evade=true; this.log("#9fdcff","Evasive burn armed."); }
    if (c.armour) { B.armour+=c.armour; this.log("#9fdcff","Ablative armour +"+c.armour+"."); }
    if (c.reflect) { B.reflect=c.reflect; this.log("#9fdcff","Reflective screen armed."); }
    if (c.sealCrew) { B.sealCrew=true; this.log("#9fdcff","Bulkheads sealed against crew loss."); }
    if (c.nextPower) { B.nextPower+=c.nextPower; this.log("#9fdcff","Next turn power +"+c.nextPower+"."); }
    if (c.nextPowerPenalty) B.nextPowerPenalty+=c.nextPowerPenalty;
    if (c.blind) { B.blind=Math.max(B.blind,c.blind); this.log("#9fdcff","Enemy targeting degraded by "+c.blind+"."); }
    if (c.flank) { B.flank=c.flank; this.log("#9fdcff","Flanking solution ready for the next weapon."); }
    if (c.overwatch) { B.overwatch=c.overwatch; this.log("#9fdcff","Overwatch armed for "+c.overwatch+" counter-damage."); }
    if (c.eCrew) {
      if (c.capture && e.crew<=c.capture) e.crew=0; else e.crew=this.cl(e.crew-c.eCrew,0,e.crewMax);
      p.crew=this.cl(p.crew-(c.sCrew||0),0,p.crewMax);
      if (c.sabRand) { var nm=this.pk(["weapons","reactor","engines"]); e.subs[nm]=this.cl(e.subs[nm]-c.sabRand,0,100); }
      if (c.sabWorst) { var ew=this.worstSub(e.subs); e.subs[ew]=this.cl(e.subs[ew]-c.sabWorst,0,100); this.log("#c4d2ea",ew.toUpperCase()+" sabotaged (-"+c.sabWorst+")."); }
      this.log("#c4d2ea", c.name+" — enemy crew -"+c.eCrew+", yours -"+(c.sCrew||0)+".");
    }
    delete c._flank; delete c._flankBonus;
  };

  // ---- manual weapon aiming ----------------------------------------------
  Game.prototype.beginAim = function (c) {
    var B=this.state.battle; if (!B||B.busy||B.over) return;
    B.aiming=c; this.aimPos=null; this.forceUpdate();
  };
  Game.prototype.cancelAim = function () {
    var B=this.state.battle; if (!B) return; B.aiming=null; this.aimPos=null; this.forceUpdate();
  };
  Game.prototype.onAimMove = function (x,y) {
    this.aimPos={ x:x, y:y };
    var self=this; if (this._aimRaf) return;
    this._aimRaf=requestAnimationFrame(function(){ self._aimRaf=0; self.forceUpdate(); });
  };
  Game.prototype.confirmAim = function (x,y) {
    var B=this.state.battle; if (!B||!B.aiming) return; var c=B.aiming; B.aiming=null;
    this.firePlayerWeapon(c, { x:x, y:y });
  };
  Game.prototype.firePlayerWeapon = function (c, target) {
    var S=this.state, B=S.battle, p=S.player; if (!B) return;
    if (c.cost>p.power) { this.forceUpdate(); return; }
    var i=-1; for (var j=0;j<B.hand.length;j++){ if (B.hand[j].uid===c.uid){ i=j; break; } }
    if (i<0) { this.forceUpdate(); return; }
    p.power-=c.cost; B.hand.splice(i,1); this.restoreCardCost(c); B.disc.push(c);
    if (B.flank) { c._flank=true; c._flankBonus=B.flank; B.flank=0; }
    B.busy=true; this.aimPos=null; this.forceUpdate();
    var origin=this.shipMuzzle("p"); var self=this;
    this.spawnFlash(origin, FX.muzzlePlayer, 96);
    sfx(this.playerFireSound(c), .85);
    var hits=(c.hits||1)*(c._flank?2:1), landed=false;
    for (var k=0;k<hits;k++){
      (function(k){
        var tgt={ x:target.x+self.jit(k), y:target.y+self.jit(k+5) };
        setTimeout(function(){
          self.fireProjectile(origin, tgt, "player", function(){
            self.spawnImpactFor(c, tgt, "e");
            if (!landed) { landed=true; self.resolvePlayerWeapon(c, target); }
          });
        }, k*120);
      })(k);
    }
  };
  Game.prototype.resolvePlayerWeapon = function (c, target) {
    var B=this.state.battle; if (!B) return;
    this.resolveCard(c); this.forceUpdate();
    if (!this.checkEnd()) { if (B) B.busy=false; this.forceUpdate(); }
  };
  Game.prototype.enemyFire = function () {
    var self=this, origin=this.shipMuzzle("e"), tgt=this.shipCenter("p");
    this.spawnFlash(origin, FX.muzzleEnemy, 96);
    sfx("laser_cannon", .8);
    this.fireProjectile(origin, tgt, "enemy", function(){
      // damage was applied synchronously; a surviving screen reads as a shield flash
      if (self.state.player.shield>0) { self.spawnFlash(tgt, FX.shieldHitPlayer, 150); sfx("small_explosion", .5); }
      else { self.spawnExplosion(tgt, "red", 140); self.spawnFlash(tgt, FX.impactPlayer, 120); sfx("small_explosion", .7); }
    });
  };

  // ---- ship geometry (client coords, transform-independent) ---------------
  Game.prototype.shipRect = function (side) {
    var el = side==="e" ? this.enemyImgEl : this.playerImgEl;
    return (el && el.getBoundingClientRect) ? el.getBoundingClientRect() : null;
  };
  Game.prototype.shipMuzzle = function (side) {
    var r=this.shipRect(side); if (!r) return this.fallbackPt(side);
    if (side==="e") return { x:r.left+r.width*0.5, y:r.top+r.height*0.72 }; // enemy fires downward
    return { x:r.left+r.width*0.5, y:r.top+r.height*0.28 };                 // player fires upward
  };
  Game.prototype.shipCenter = function (side) {
    var r=this.shipRect(side); if (!r) return this.fallbackPt(side);
    return { x:r.left+r.width*0.5, y:r.top+r.height*0.5 };
  };
  Game.prototype.fallbackPt = function (side) {
    var w=window.innerWidth||1280, h=window.innerHeight||800;
    return { x:w*0.5, y: side==="e"? h*0.30 : h*0.66 };
  };
  Game.prototype.jit = function (k) { return k===0 ? 0 : this.ri(-26,26); };

  // ---- transient FX (projectiles / flashes / spritesheet explosions) ------
  Game.prototype.addFx = function (item) {
    item.id = ++this._fxid; this.fx.push(item); this.forceUpdate();
    if (item.kind==="flash") { var self=this; setTimeout(function(){ self.removeFx(item.id); }, item.dur||300); }
    return item.id;
  };
  Game.prototype.removeFx = function (id) {
    if (!this.fx) return; var n=this.fx.length;
    this.fx=this.fx.filter(function(f){ return f.id!==id; });
    if (this.fx.length!==n) this.forceUpdate();
  };
  Game.prototype.fireProjectile = function (from,to,kind,onImpact) {
    var dx=to.x-from.x, dy=to.y-from.y, dist=Math.sqrt(dx*dx+dy*dy);
    var dur=Math.max(190, Math.min(560, dist*0.85));
    this.addFx({ kind:"proj", img: kind==="player"?FX.playerBolt:FX.enemyBolt,
      x0:from.x, y0:from.y, x1:to.x, y1:to.y, h: kind==="player"?54:62, dur:dur, onImpact:onImpact });
  };
  Game.prototype.spawnFlash = function (pt, img, size) {
    this.addFx({ kind:"flash", img:img, x:pt.x, y:pt.y, size:size||90, dur:300 });
  };
  Game.prototype.spawnImpactFor = function (c, pt, side) {
    // If the target's deflector screen is still up and the shot isn't piercing,
    // it reads as a shield flash; otherwise it's a hull explosion.
    var B=this.state.battle;
    var tgt = side==="e" ? (B&&B.enemy) : this.state.player;
    var onShield = tgt && tgt.shield>0 && !c.pierce;
    if (onShield) {
      this.spawnFlash(pt, side==="e"?FX.shieldHitEnemy:FX.shieldHitPlayer, 150);
      sfx("small_explosion", .5);
    } else {
      this.spawnExplosion(pt, side==="e"?"orange":"red", 150);
      this.spawnFlash(pt, side==="e"?FX.impactEnemy:FX.impactPlayer, 130);
      sfx(this.impactSound(c), .75);
    }
  };
  Game.prototype.spawnExplosion = function (pt, which, size) {
    var cfg=EXPL[which]||EXPL.orange;
    this.addFx({ kind:"explosion", cfg:cfg, x:pt.x, y:pt.y, size:size||150, frameMs:30 });
  };
  Game.prototype.playerFireSound = function (c) {
    if (c.key==="railgun"||c.key==="execution-beam"||c.key==="plasma-lance") return "laser_cannon";
    if (["missile","torpedo","broadside","chain-cannon","kinetic-ram","mine-layer","emp-warhead","point-blank","graviton"].indexOf(c.key)>=0) return "blaster";
    return "laser_beam";
  };
  Game.prototype.impactSound = function (c) {
    if (["missile","torpedo","mine-layer","emp-warhead","graviton"].indexOf(c.key)>=0) return "torpedo_explosion";
    if (["railgun","kinetic-ram","execution-beam","point-blank"].indexOf(c.key)>=0) return "medium_explosion";
    return "small_explosion";
  };
  Game.prototype.hurtPlayerSub = function (nm, amt) {
    var p=this.state.player, before=p.subs[nm];
    p.subs[nm]=this.cl(p.subs[nm]-amt,0,100);
    if (p.subs[nm]<before) this.reportDamage();
    return p.subs[nm];
  };
  Game.prototype.reportDamage = function () {
    var n=(window.performance&&performance.now)?performance.now():(+new Date());
    if (this._lastReport && n-this._lastReport<1400) return;
    this._lastReport=n; sfx(rndOf(["reporting_damage","reporting_damage_1"]), .9);
  };

  // ---- battle camera: mouse-wheel zoom, middle-drag pan -------------------
  Game.prototype.onWheel = function (e) {
    if (this.state.screen!=="battle") return;
    if (e.preventDefault) e.preventDefault();
    var z=this.view.zoom * (e.deltaY<0 ? 1.12 : 0.893);
    this.view.zoom=this.cl(z, 0.55, 3.6);
    this.forceUpdate();
  };
  Game.prototype.onViewDown = function (e) {
    if (e.button===1) {   // middle button held = pan
      if (e.preventDefault) e.preventDefault();
      this._panning=true; this._panSX=e.clientX; this._panSY=e.clientY;
      this._panX0=this.view.panX; this._panY0=this.view.panY;
    }
  };
  Game.prototype.onViewMove = function (e) {
    if (!this._panning) return;
    this.view.panX=this._panX0+(e.clientX-this._panSX);
    this.view.panY=this._panY0+(e.clientY-this._panSY);
    var self=this; if (this._panRaf) return;
    this._panRaf=requestAnimationFrame(function(){ self._panRaf=0; self.forceUpdate(); });
  };
  Game.prototype.resetView = function () { this.view={ zoom:1, panX:0, panY:0 }; this.forceUpdate(); };

  // ---- dwell-to-inspect: hover a card ~2s to dock its detail on the right --
  Game.prototype.hoverEnter = function (card) {
    var self=this; this.clearHoverTimer();
    this._hoverT=setTimeout(function(){ self._hoverT=0; self.hoverCard=card; self.forceUpdate(); }, 150);
  };
  Game.prototype.hoverLeave = function () {
    this.clearHoverTimer();
    if (this.hoverCard){ this.hoverCard=null; this.forceUpdate(); }
  };
  Game.prototype.clearHoverTimer = function () { if (this._hoverT){ clearTimeout(this._hoverT); this._hoverT=0; } };
  Game.prototype.hideHover = function () { this.clearHoverTimer(); this.hoverCard=null; };

  // ---- win / loss ---------------------------------------------------------
  Game.prototype.checkEnd = function () {
    var S=this.state, B=S.battle; if (!B) return true; if (B.over) return true;
    var p=S.player, e=B.enemy; var self=this;
    if (e.hull<=0 || e.crew<=0) {
      B.over=true;
      if (e.hull<=0) { this.spawnExplosion(this.shipCenter("e"), "capital", 300); sfx("enemy_destroyed", 1); }
      var how = e.hull<=0 ? e.name+" breaks apart under your guns." : "Your boarders seize the bridge — "+e.name+" struck and captured.";
      this.forceUpdate(); setTimeout(function(){ self.victory(how); },700); return true;
    }
    if (p.hull<=0 || p.crew<=0) {
      B.over=true;
      if (p.hull<=0) { this.spawnExplosion(this.shipCenter("p"), "red", 300); sfx("ship_destroyed", 1); }
      var why = p.hull<=0 ? "Hull integrity gone. ISV Palewake is lost with all hands." : "Boarders overrun your decks. Your ship is taken.";
      this.setMusicScene("ambient");
      this.forceUpdate(); setTimeout(function(){ S.end={kick:"ENGAGEMENT LOST",title:"SHIP LOST",body:why}; S.overlay="end"; self.forceUpdate(); },700); return true;
    }
    return false;
  };
  Game.prototype.victory = function (how) {
    var S=this.state, B=S.battle; if (!B) return; var node=B.node;
    var lo=20, hi=30;
    if (node.type==="elite") { lo=36; hi=46; }
    if (node.type==="bounty") { lo=40; hi=50; }
    if (node.type==="boss") { lo=60; hi=80; how+=" The Verdict's escorts scatter — the Blackstar Gate is yours to take."; }
    var zm=(node.z&&ZBYK[node.z]&&ZBYK[node.z].mult)||1;
    var salv=Math.round(this.ri(lo,hi)*(node.type==="boss"?1:zm));
    if (S.player.ups.rig) salv=Math.round(salv*1.15);
    S.salvage+=salv;
    if (node.key && !S.zoneKeys[node.key]) { S.zoneKeys[node.key]=true; how+=" Recovered from the wreck: "+KEY_NAMES[node.key]+"."; }
    S.reward={ how:how, salv:salv, cards:this.sh(REWARDS.slice()).slice(0,3).map(this.mk.bind(this)) };
    S.overlay="reward"; this.forceUpdate();
  };
  Game.prototype.claimReward = function (key) { this.hideHover(); this.state.deckKeys.push(key); this.finishBattle(); };
  Game.prototype.skipReward = function () { this.hideHover(); this.finishBattle(); };
  Game.prototype.finishBattle = function () {
    var S=this.state, p=S.player, node=S.battle.node;
    p.hull=this.cl(p.hull+Math.round(p.hullMax*.15),0,p.hullMax);
    p.crew=this.cl(p.crew+1,0,p.crewMax);
    for (var k in p.subs) p.subs[k]=this.cl(p.subs[k]+40,0,100);
    p.shield=0;
    S.taken[node.id]=true; S.battle=null; S.reward=null; S.overlay=null; S.screen="map";
    this.setMusicScene("ambient"); this.forceUpdate();
  };

  // ---- map navigation (free travel over the zone graph) -------------------
  // Threat readout for the intel panel: zone multiplier x elite/bounty bump.
  Game.prototype.threatLabel = function (n) {
    var zm=(ZBYK[n.z]&&ZBYK[n.z].mult)||1;
    var lvl=zm*((n.type==="elite"||n.type==="bounty")?1.3:1);
    var word = lvl<1.15?"LOW": lvl<1.4?"MEDIUM": lvl<1.75?"HIGH":"SEVERE";
    var role = ENEMIES[n.enemy] ? ENEMIES[n.enemy].role : "UNKNOWN";
    return { v: word+" — "+role, c: lvl<1.4?"#ffc266":"#ff8aa0" };
  };
  Game.prototype.zoneUnlocked = function (z) {
    var S=this.state; if (!z.req) return true;
    if (z.req.key) return !!S.zoneKeys[z.req.key];
    if (z.req.zones) return this.zonesSecured() >= z.req.zones;
    return true;
  };
  Game.prototype.zoneSecured = function (z) {
    var S=this.state;
    return NODES.every(function(n){ return n.z!==z.k || !!S.taken[n.id]; });
  };
  Game.prototype.zonesSecured = function () {
    var self=this;
    return ZONES.filter(function(z){ return z.k!=="gate" && self.zoneSecured(z); }).length;
  };
  // BFS jump-distances from the current system over passable lanes. Nodes in
  // sealed zones are impassable; everything else (including uncleared enemy
  // systems in open zones) can be crossed.
  Game.prototype.mapDist = function () {
    var S=this.state, self=this, unlocked={};
    ZONES.forEach(function(z){ unlocked[z.k]=self.zoneUnlocked(z); });
    var adj={};
    EDGES.forEach(function(e){
      if (!unlocked[NBYID[e[0]].z] || !unlocked[NBYID[e[1]].z]) return;
      (adj[e[0]]=adj[e[0]]||[]).push(e[1]);
      (adj[e[1]]=adj[e[1]]||[]).push(e[0]);
    });
    var dist={}; dist[S.current]=0; var q=[S.current];
    while (q.length) {
      var c=q.shift();
      (adj[c]||[]).forEach(function(nx){ if (dist[nx]==null){ dist[nx]=dist[c]+1; q.push(nx); } });
    }
    return dist;
  };
  Game.prototype.selectNode = function (id) {
    if (this._didPan) return;
    this.state.sel=id; this.forceUpdate();
  };
  Game.prototype.setCourse = function (id) {
    var S=this.state, P=S.player, self=this, n=NBYID[id];
    if (!n || S.gliding || id===S.current) return;
    var cost=this.mapDist()[id]; if (cost==null) return;
    // Fuel: one cell per lane hop. Short on cells? Burn reserve mass instead —
    // 5 hull per missing cell — but never onto a jump the hull can't survive.
    var short=Math.max(0, cost-P.fuel);
    if (short>0 && P.hull<=short*5) return;
    P.fuel=Math.max(0, P.fuel-cost);
    if (short>0) P.hull=this.cl(P.hull-short*5, 0, P.hullMax);
    S.current=id; S.sel=id; S.gliding=true; this.forceUpdate();
    this.scrollToNode(id, true);
    // Let the ship sprite glide (1.4s), then resolve the arrival.
    setTimeout(function(){
      var s=self.state; s.gliding=false;
      if (s.screen!=="map") { self.forceUpdate(); return; }
      if (n.type==="home"||n.type==="station"||n.type==="shipyard"||n.type==="repair") {
        s.player.fuel=s.player.fuelMax;   // friendly docks top the tanks off
      }
      if (!s.taken[n.id]) {
        if (n.type==="fight"||n.type==="elite"||n.type==="bounty"||n.type==="boss") { self.startBattle(n); return; }
        if (n.type==="anomaly") { s.evNode=n; s.overlay="ev"; }
        else s.taken[n.id]=true;   // ports (and the gate itself) are yours once you dock
      }
      self.forceUpdate();
    }, 1450);
  };
  Game.prototype.dockCurrent = function () {
    var S=this.state, n=NBYID[S.current]; if (!n||S.gliding) return;
    if (n.type==="shipyard") { S.yard={ node:n }; S.screen="yard"; this.forceUpdate(); }
    else if (n.type==="home"||n.type==="station") this.openBase(n);
    else if (n.type==="repair") { S.overlay="dock"; this.forceUpdate(); }
  };
  Game.prototype.departSector = function () {
    var S=this.state;
    if (S.current!=="gate" || !S.taken.verdict) return;
    S.end={ kick:"SECTOR BROKEN", title:"THE GATE IS OPEN",
      body:"The Iron Verdict is ash and the Blackstar Gate spins up for the first time in a decade. The Verge is yours behind you — anchorages lit, lanes patrolled by crews flying your flag. The Palewake threads the ring and jumps: the first gate on the long road home. New charts are being surveyed — the next sector arrives with the coming update." };
    S.overlay="end"; this.forceUpdate();
  };
  Game.prototype.evResolve = function (mode) {
    var S=this.state, n=S.evNode; if (!n) return;
    if (mode==="take") S.salvage+=18;
    else S.player.crew=this.cl(S.player.crew+2,0,S.player.crewMax);
    S.taken[n.id]=true;
    if (n.key) S.zoneKeys[n.key]=true;
    S.evNode=null; S.overlay=null; this.forceUpdate();
  };
  Game.prototype.scrollToNode = function (id, smooth) {
    var el=this.mapScrollEl, n=NBYID[id]; if (!el||!n) return;
    var x=n.x/100*WORLD.w-el.clientWidth/2, y=n.y/100*WORLD.h-el.clientHeight/2;
    try { el.scrollTo({ left:x, top:y, behavior:smooth?"smooth":"auto" }); }
    catch (e) { el.scrollLeft=x; el.scrollTop=y; }
  };
  // Drag-to-pan on the chart. A real drag (>6px) suppresses the click that
  // fires on mouse-up so nodes aren't selected accidentally.
  Game.prototype.mapDown = function (e) {
    if (e.button!==0 || !this.mapScrollEl) return;
    this._mdrag={ x:e.clientX, y:e.clientY, sl:this.mapScrollEl.scrollLeft, st:this.mapScrollEl.scrollTop };
    this._didPan=false;
  };
  Game.prototype.mapMove = function (e) {
    var d=this._mdrag; if (!d||!this.mapScrollEl) return;
    var dx=e.clientX-d.x, dy=e.clientY-d.y;
    if (Math.abs(dx)+Math.abs(dy)>6) this._didPan=true;
    if (this._didPan) { this.mapScrollEl.scrollLeft=d.sl-dx; this.mapScrollEl.scrollTop=d.st-dy; }
  };
  Game.prototype.mapUp = function () {
    this._mdrag=null; var self=this;
    setTimeout(function(){ self._didPan=false; }, 0);
  };

  // ---- station / shipyard -------------------------------------------------
  Game.prototype.openBase = function (n) {
    var S=this.state;
    // Station shelves persist between visits — no shop-scumming by re-docking.
    if (!S.stationStock[n.id]) S.stationStock[n.id]=this.sh(SHOP.slice()).slice(0,4).map(function(k){ return { key:k, price:PRICE[k]||16 }; });
    S.base={ node:n, stock:S.stationStock[n.id] };
    S.screen="base"; this.forceUpdate();
  };
  Game.prototype.buyCard = function (i) { var S=this.state, o=S.base.stock[i]; if (!o||S.salvage<o.price) return; this.hideHover(); S.salvage-=o.price; S.deckKeys.push(o.key); S.base.stock.splice(i,1); this.forceUpdate(); };
  Game.prototype.buyUp = function (k) {
    var S=this.state, u=null, p=S.player;
    for (var i=0;i<YARD_REFITS.length;i++){ if (YARD_REFITS[i].k===k){ u=YARD_REFITS[i]; break; } }
    if (!u||p.ups[k]||S.salvage<u.price) return; S.salvage-=u.price; p.ups[k]=true;
    if (k==="plating") { p.hullMax+=14; p.hull+=14; }
    if (k==="emitters") p.shieldCap+=8;
    if (k==="reactor") p.powerBase+=1;
    if (k==="racks") { p.fuelMax+=2; p.fuel+=2; }
    // rig lives on the ups record and is applied to salvage in victory()
    this.forceUpdate();
  };
  Game.prototype.buyYardCard = function (key, price) {
    var S=this.state, n=S.yard&&S.yard.node; if (!n) return;
    var b=S.yardBought[n.id]||(S.yardBought[n.id]={});
    if (b[key]||S.salvage<price) return;
    this.hideHover(); S.salvage-=price; S.deckKeys.push(key); b[key]=true; this.forceUpdate();
  };
  Game.prototype.undockYard = function () { var S=this.state; S.yard=null; S.screen="map"; this.forceUpdate(); };
  Game.prototype.repair = function () { var S=this.state, p=S.player; if (S.salvage<10||p.hull>=p.hullMax) return; S.salvage-=10; p.hull=this.cl(p.hull+15,0,p.hullMax); this.forceUpdate(); };
  Game.prototype.hire = function () { var S=this.state, p=S.player; if (S.salvage<8||p.crew>=p.crewMax) return; S.salvage-=8; p.crew++; this.forceUpdate(); };
  Game.prototype.scrap = function (i) { var S=this.state; if (S.salvage<12||S.deckKeys.length<=6) return; S.salvage-=12; S.deckKeys.splice(i,1); this.forceUpdate(); };
  Game.prototype.depart = function () { var S=this.state; S.base=null; S.screen="map"; this.forceUpdate(); };

  // ---- overlays / meta ----------------------------------------------------
  Game.prototype.closeBrief = function () { this.state.overlay=null; this.forceUpdate(); };
  Game.prototype.inspectCard = function (key) { this.state.cardDetail=LIB[key]||null; this.forceUpdate(); };
  Game.prototype.closeCardDetail = function () { this.state.cardDetail=null; this.forceUpdate(); };
  Game.prototype.restart = function () { this.setState(this.freshRun()); };

  // ---- title screen -------------------------------------------------------
  Game.prototype.setDifficulty = function (d) { this.config.difficulty = d; this.forceUpdate(); };
  Game.prototype.toggleScanlines = function () { this.config.scanlines = !this.config.scanlines; this.forceUpdate(); };
  Game.prototype.beginRun = function () {
    // Fresh run seeded with the chosen config, then drop the player onto the
    // sector chart with the tactical briefing raised.
    var run = this.freshRun();
    run.screen = "map"; run.overlay = "brief";
    this.setState(run);
  };

  // ---- view helpers -------------------------------------------------------
  Game.prototype.cardImg = function (key) {
    return html`<img src=${"assets/cards/"+key+".png"} alt="" style="width:100%;height:84px;object-fit:cover;display:block;border-bottom:1px solid #1a2942" />`;
  };
  Game.prototype.shipAnim = function (n) { return n ? (n%2 ? "shakeA .35s" : "shakeB .35s") : "none"; };
  Game.prototype.subsView = function (sh) {
    var self=this;
    return ["weapons","reactor","engines"].map(function(nm){
      var v=sh.subs[nm], st = v<=25?"crit":v<=55?"warn":"ok";
      return {
        lab:nm.toUpperCase(), val:v,
        col: st==="crit"?"#ff8aa0":st==="warn"?"#ffc266":"#7d92b5",
        bd:  st==="crit"?"#ff5470":st==="warn"?"#6b5a33":"#1b2a45",
        bar: st==="crit"?"linear-gradient(90deg,#c23a55,#ff8aa0)":st==="warn"?"linear-gradient(90deg,#b3813a,#ffc266)":"linear-gradient(90deg,#1e6f94,#4fd8ff)",
        fx: self.subFx(nm,v)
      };
    });
  };
  Game.prototype.hullBg = function (pct) {
    return pct<=30 ? "repeating-linear-gradient(45deg,#ff5470 0 6px,#5c1f2c 6px 12px)" : "linear-gradient(180deg,#8df2c8,#2aa878)";
  };

  // ============ card-face fragment (hand / shop / reward / played) ==========
  Game.prototype.cardFace = function (c) {
    var self=this;
    return html`
      <img src=${"assets/cards/full/"+c.key+".png"} alt=${c.name+": "+c.summary} title=${c.text}
        style="width:100%;height:auto;display:block;pointer-events:none" />
      ${c.baseCost!=null ? html`<span style=${"position:absolute;left:8px;top:7px;z-index:4;width:31px;height:31px;border-radius:50%;display:grid;place-items:center;background:#08101d;border:2px solid #65e4ff;color:#fff;font-family:"+MONO+";font-weight:700;box-shadow:0 0 12px #4fd8ffaa"}>${c.cost}</span>` : null}
      <button aria-label=${"View "+c.name+" details"} title="View full card details"
        onClick=${function(e){ e.stopPropagation(); self.inspectCard(c.key); }}
        style=${"position:absolute;right:5px;top:5px;z-index:3;width:24px;height:24px;border-radius:50%;border:1px solid #6b7f9f;background:#07101ddd;color:#dcecff;font-family:"+MONO+";font-size:13px;cursor:pointer;display:grid;place-items:center;padding:0"}>i</button>`;
  };

  Game.prototype.renderCardDetail = function (c) {
    var self=this;
    return html`<div onClick=${function(){self.closeCardDetail();}}
      style="position:absolute;inset:0;z-index:90;background:#000000df;backdrop-filter:blur(5px);display:grid;place-items:center;padding:24px">
      <div onClick=${function(e){e.stopPropagation();}} style="max-width:680px;width:100%;display:flex;gap:24px;align-items:center;border:1px solid #334b70;border-radius:12px;background:linear-gradient(180deg,#111a2b,#070b14);padding:22px;box-shadow:0 28px 90px #000">
        <img src=${"assets/cards/full/"+c.key+".png"} alt=${c.name} style="width:264px;height:336px;object-fit:contain;flex:0 0 auto" />
        <div style="min-width:0;flex:1">
          <div style=${"font-family:"+MONO+";font-size:12px;letter-spacing:.2em;color:#7d92b5;text-transform:uppercase"}>${c.type+" · COST "+c.cost}</div>
          <h2 style="font-size:30px;line-height:1.05;margin:10px 0;color:#fff">${c.name}</h2>
          <div style=${"font-family:"+MONO+";font-size:14px;color:#ffc266;letter-spacing:.12em;margin-bottom:20px"}>${c.summary}</div>
          <p style="font-size:18px;line-height:1.55;color:#b8c7dd;margin:0 0 24px">${c.text}</p>
          <button class="hf-btn" onClick=${function(){self.closeCardDetail();}} style="font-family:'Space Grotesk',sans-serif;font-weight:600;letter-spacing:.14em;font-size:13px;color:#03131c;background:#55d9ff;border:1px solid #8deaff;border-radius:4px;padding:10px 18px;cursor:pointer">CLOSE</button>
        </div>
      </div>
    </div>`;
  };

  // ============================ RENDER =====================================
  Game.prototype.render = function () {
    var S=this.state;
    if (S.screen==="title") return this.renderTitle();

    var v=this.computeVals();
    var self=this;

    return html`
    <div class="hf-root hf-starfield">
      <!-- TOP BAR -->
      <div style="position:absolute;top:0;left:0;right:0;height:58px;display:flex;align-items:center;gap:18px;padding:0 22px;border-bottom:1px solid #1b2a45;background:linear-gradient(180deg,#0d1424,#070b14);z-index:20">
        <div style="font-weight:700;letter-spacing:.2em;font-size:20px;color:#ffffff">BLACKSTAR VERGE</div>
        <div style="width:1px;height:22px;background:#22345a"></div>
        <div style=${"font-family:"+MONO+";font-size:12px;color:#5f7396;letter-spacing:.14em"}>${v.screenTag}</div>
        <div style="flex:1"></div>
        <div style=${"font-family:"+MONO+";font-size:14px;color:#ffc266;letter-spacing:.08em"}>${v.hudRight}</div>
        ${this.renderMusicBtn()}
      </div>

      ${v.isBattle ? this.renderBattle(v) : null}
      ${v.isMap ? this.renderMap(v) : null}
      ${v.isBase ? this.renderBase(v) : null}
      ${v.isYard ? this.renderYard(v) : null}

      ${this.config.scanlines ? html`<div style="position:absolute;inset:0;pointer-events:none;z-index:60;background:repeating-linear-gradient(0deg,transparent 0 2px,#00000022 2px 3px);opacity:.5"></div>` : null}

      ${this.renderFx()}

      ${v.brShow ? this.renderBriefing() : null}
      ${v.rwShow ? this.renderReward(v) : null}
      ${v.evShow ? this.renderAnomaly() : null}
      ${v.endShow ? this.renderEnd(v) : null}
      ${S.overlay==="dock" ? this.renderDock() : null}
      ${S.overlay==="deckview" ? this.renderDeckView() : null}
      ${S.overlay==="shipview" ? this.renderShipView() : null}
      ${S.overlay==="codex" ? this.renderCodex() : null}
      ${this.hoverCard ? this.renderHoverPanel(this.hoverCard) : null}
      ${S.cardDetail ? this.renderCardDetail(S.cardDetail) : null}
    </div>`;
  };

  // ---------------------------- TITLE SCREEN -------------------------------
  Game.prototype.cycleDifficulty = function () {
    var order=["standard","hard","brutal"];
    var i=order.indexOf(this.config.difficulty);
    this.config.difficulty = order[((i<0?0:i)+1)%order.length];
    this.forceUpdate();
  };
  Game.prototype.showHowTo = function () { this.state.overlay="howto"; this.forceUpdate(); };
  Game.prototype.closeHowTo = function () { this.state.overlay=null; this.forceUpdate(); };

  Game.prototype.renderTitle = function () {
    var self=this;
    var diff = DIFFS[this.config.difficulty] || DIFFS.standard;
    var musicOn = this.music.on;
    return html`
    <div class="hf-starfield bv-title">
      <img class="bv-ship" src=${shipImg(PLAYER_SHIP,false)} alt="ISV Palewake" />
      <div class="bv-fade"></div>
      <div class="bv-wrap">
        <div class="bv-kicker">A ROGUELIKE DECK-BUILDER OF VOID COMBAT</div>
        <h1 class="bv-h1">BLACKSTAR VERGE</h1>
        <div class="bv-sub">The last corvette still flying the flag. Take back the dark, sector by sector.</div>
        <div class="bv-menu">
          <button class="bv-primary" onClick=${function(){ self.beginRun(); }}>Begin Sortie ▸</button>
          <button class="bv-ghost" onClick=${function(){ self.cycleDifficulty(); }}>
            <span>Difficulty</span><span class="val">‹ ${diff.name.toUpperCase()} ›</span>
          </button>
          <button class="bv-ghost" onClick=${function(){ self.showHowTo(); }}>
            <span>Briefing</span><span class="val dim">HOW IT PLAYS ▸</span>
          </button>
          <button class="bv-ghost" onClick=${function(){ self.toggleMusic(); }}
            title=${musicOn?"Music on — click to mute":"Music muted — click to play"}>
            <span>♪ Music</span><span class=${"val"+(musicOn?"":" dim")}>${musicOn?"ON":"OFF"}</span>
          </button>
        </div>
      </div>
      <div class="bv-footer">ISV PALEWAKE · CORVETTE · DECK COMMAND — GOOD HUNTING, CAPTAIN</div>
      ${this.state.overlay==="howto" ? this.renderTitleHowTo() : null}
    </div>`;
  };

  Game.prototype.renderTitleHowTo = function () {
    var self=this;
    return html`
    <div class="bv-modal" onClick=${function(){ self.closeHowTo(); }}>
      <div class="bv-modal-panel hf-overlay-panel" onClick=${function(e){ e.stopPropagation(); }}>
        <div class="bv-kicker" style="text-align:left">BRIEFING · HOW IT PLAYS</div>
        <h2 class="bv-modal-h2">Command the ISV Palewake</h2>
        <p class="hf-lore" style="text-align:left;max-width:none;margin:0">
          The war is over, and the navy that fought it is gone. You command the corvette${" "}
          <b>ISV Palewake</b> — the last hull still flying its flag — holding one
          anchorage in the <b>Blackstar Verge</b>, a sector the Corsair Pact now calls
          its own. Their enforcers tax every lane, and <b>Ironwall Command</b> keeps the
          jump gate sealed with the dreadnought <b>HMS Iron Verdict</b> anchored on it.
          So take the Verge back: every system you clear is yours, every zone you secure
          loosens the Pact's grip, and when the <b>Blackstar Gate</b> unseals, the road
          home runs through it — one sector down, the next one waiting.
        </p>
        <div class="hf-primer" style="margin-top:22px">
          <div class="hf-primer-cell">
            <h3 style="color:#5fd8ff">① The Chart</h3>
            <p>Travel freely along charted lanes — each jump burns a fuel cell. Take systems, secure zones, unseal the Gate.</p>
          </div>
          <div class="hf-primer-cell">
            <h3 style="color:#ff8aa0">② The Battle</h3>
            <p>Spend reactor power to play cards. Shields soak hits before hull; weapons, reactor and engines can all be crippled.</p>
          </div>
          <div class="hf-primer-cell">
            <h3 style="color:#7cf0c0">③ The Refit</h3>
            <p>Dock to buy cards, patch hull, hire crew — and refuel, free at any friendly port. Shipyards weld on permanent refits.</p>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:24px">
          <button class="bv-primary" style="padding:13px 32px" onClick=${function(){ self.closeHowTo(); }}>Got it ▸</button>
        </div>
      </div>
    </div>`;
  };

  // ------------------------------ BATTLE -----------------------------------
  Game.prototype.renderBattle = function (v) {
    var self=this;
    return html`
    <div style=${"position:absolute;inset:58px 0 0 0;touch-action:none;cursor:"+(this._panning?"grabbing":"auto")}
      onWheel=${function(e){ self.onWheel(e); }}
      onMouseDown=${function(e){ self.onViewDown(e); }}
      onMouseMove=${function(e){ self.onViewMove(e); }}
      onDblClick=${function(){ self.resetView(); }}>
      <!-- central combat column (mouse-wheel zoom · middle-drag pan) -->
      <div style="position:absolute;left:50%;top:0;bottom:190px;width:760px;margin-left:-380px">
      <div style=${"position:absolute;left:0;top:50%;width:760px;display:flex;flex-direction:column;gap:28px;transform:"+v.combatTransform+";transform-origin:center center;will-change:transform"}>

        <div style="position:absolute;inset:0;pointer-events:none;z-index:3">
          ${v.beams.map(function(b){
            return html`<div key=${b.k} style=${"position:absolute;top:calc(50% - 120px);height:240px;width:3px;left:"+b.left+"px;background:linear-gradient(180deg,transparent,#7ce7ff,transparent);animation:beamfade .55s forwards"}></div>`;
          })}
        </div>

        <!-- ENEMY -->
        <div style=${"animation:"+v.eAnim}>
          <div style="display:flex;justify-content:space-between;gap:16px;margin:0 30px 14px">
            ${v.eSubs.map(function(s){ return self.renderSub(s); })}
          </div>
          <div style="position:relative;height:300px;margin:0 30px;display:flex;justify-content:center">
            <div style="position:relative;height:100%;aspect-ratio:1.82">
              <div style=${"position:absolute;inset:-14px -30px;border:1.5px solid #ff7d95;border-radius:50%;opacity:"+v.eBub+";transition:opacity .4s;box-shadow:0 0 30px #ff547033, inset 0 0 30px #ff547018"}></div>
              <img src=${v.eImg} alt="Hostile ship" ref=${function(el){ self.enemyImgEl=el; }} style="position:relative;width:100%;height:100%;object-fit:contain;display:block;filter:drop-shadow(0 10px 26px #000000cc)" />
            </div>
          </div>
          ${this.renderShieldArc(v.eShPct, v.eShTxt, "#7ce7ff")}
        </div>

        <!-- PLAYER (subsystems above the ship so the hand bar never hides them;
             only the ship's lower hull may tuck behind the cards) -->
        <div style=${"animation:"+v.pAnim}>
          ${this.renderShieldArc(v.pShPct, v.pShTxt, "#7ce7ff")}
          <div style="display:flex;justify-content:space-between;gap:16px;margin:14px 30px 0">
            ${v.pSubs.map(function(s){ return self.renderSub(s); })}
          </div>
          <div style="position:relative;height:300px;margin:14px 30px 0;display:flex;justify-content:center">
            <div style="position:relative;height:100%;aspect-ratio:1.82">
              <div style=${"position:absolute;inset:-14px -30px;border:1.5px solid #6fe0ff;border-radius:50%;opacity:"+v.pBub+";transition:opacity .4s;box-shadow:0 0 30px #4fd8ff33, inset 0 0 30px #4fd8ff18"}></div>
              <img src=${v.pImg} alt="ISV Palewake" ref=${function(el){ self.playerImgEl=el; }} style="position:relative;width:100%;height:100%;object-fit:contain;display:block;filter:drop-shadow(0 10px 26px #000000cc)" />
            </div>
          </div>
        </div>

        <div style="position:absolute;inset:0;pointer-events:none;z-index:6">
          ${v.floats.map(function(f){
            return html`<div key=${f.k} style=${"position:absolute;left:"+f.left+"px;top:"+f.top+";font-weight:700;font-size:30px;color:"+f.color+";text-shadow:0 2px 6px #000;animation:floatup 1s forwards"}>${f.text}</div>`;
          })}
        </div>

        ${v.plShow ? html`
          <div style="position:absolute;left:50%;top:50%;width:176px;animation:cardplay .9s forwards;z-index:8;border:1px solid #3a5580;border-radius:8px;background:#0c1220;box-shadow:0 22px 50px #000d;overflow:hidden;pointer-events:none;display:flex;flex-direction:column">
            ${self.cardFace(v.played)}
          </div>` : null}
      </div>
      </div>

      <!-- combat log -->
      <div style=${"position:absolute;left:16px;top:16px;width:"+v.panelW+";display:"+v.sideBlock+";border:1px solid #1b2a45;border-radius:5px;background:#070b14cc;padding:12px 14px;backdrop-filter:blur(2px);z-index:1"}>
        <div style="letter-spacing:.2em;font-size:11px;font-weight:600;color:#5f7396;text-transform:uppercase;margin-bottom:7px">Combat Log</div>
        <div>
          ${v.logs.map(function(l){
            return html`<div key=${l.k} style=${"font-family:"+MONO+";font-size:12.5px;line-height:1.5;color:"+l.color+";border-top:"+l.bt+";padding-top:"+l.pt+";margin-top:"+l.mt}>${l.text}</div>`;
          })}
        </div>
        <div style=${"font-family:"+MONO+";font-size:10px;letter-spacing:.08em;color:#4d6288;border-top:1px solid #14203a;margin-top:9px;padding-top:8px"}>SCROLL ZOOM · MIDDLE-DRAG PAN · DBL-CLICK RESET</div>
      </div>

      <!-- enemy plate + intent -->
      <div style=${"position:absolute;right:16px;top:16px;width:"+v.panelW+";display:"+v.sideFlex+";flex-direction:column;gap:10px;z-index:1"}>
        <div style="border:1px solid #1b2a45;border-radius:5px;background:#0a101cd9;padding:13px 15px">
          <div style="display:flex;align-items:baseline;gap:9px">
            <span style=${"font-family:"+MONO+";font-size:10px;color:#ff8aa0;border:1px solid #7a3244;border-radius:3px;padding:2px 6px;letter-spacing:.1em"}>HOSTILE</span>
            <span style="font-weight:600;font-size:17px;color:#ffffff">${v.eName}</span>
          </div>
          <div style=${"font-family:"+MONO+";font-size:11px;color:#7d92b5;letter-spacing:.12em;margin:3px 0 10px"}>${v.eRole}</div>
          <div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:11px;font-weight:600;letter-spacing:.18em;color:#7d92b5">HULL</span><span style=${"font-family:"+MONO+";font-size:13px"}>${v.eHullTxt}</span></div>
          <div style="height:12px;border:1px solid #2c4066;border-radius:2px;background:#000000;overflow:hidden;margin:4px 0 9px"><div style=${"height:100%;width:"+v.eHullPct+"%;background:"+v.eHullBg+";transition:width .35s"}></div></div>
          <div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:11px;font-weight:600;letter-spacing:.18em;color:#7d92b5">CREW</span><span style=${"font-family:"+MONO+";font-size:13px;color:#c4d2ea"}>${v.eCrewTxt}</span></div>
        </div>
        ${v.inShow ? html`
          <div style=${"border:1px solid #1b2a45;border-left:3px solid "+v.inBd+";background:#070b14d9;border-radius:4px;padding:10px 12px;display:flex;align-items:center;gap:12px"}>
            <span style=${"font-size:20px;color:"+v.inBd}>${v.inIco}</span>
            <span style="font-size:15px"><b style="font-weight:600;letter-spacing:.03em;color:#ffffff">${v.inTxt}</b><span style=${"display:block;font-family:"+MONO+";font-size:11px;color:#7d92b5;letter-spacing:.05em;margin-top:2px"}>${v.inSub}</span></span>
          </div>` : null}
      </div>

      <!-- player plate -->
      <div style=${"position:absolute;left:16px;bottom:204px;width:"+v.panelW+";display:"+v.sideBlock+";border:1px solid #1b2a45;border-radius:5px;background:#070b14d9;padding:13px 15px;z-index:1"}>
        <div style="display:flex;align-items:baseline;gap:9px">
          <span style=${"font-family:"+MONO+";font-size:10px;color:#5fd8ff;border:1px solid #1e4d66;border-radius:3px;padding:2px 6px;letter-spacing:.1em"}>FRIENDLY</span>
          <span style="font-weight:600;font-size:17px;color:#ffffff">ISV Palewake</span>
        </div>
        <div style=${"font-family:"+MONO+";font-size:11px;color:#7d92b5;letter-spacing:.12em;margin:3px 0 10px"}>CORVETTE · DECK COMMAND</div>
        <div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:11px;font-weight:600;letter-spacing:.18em;color:#7d92b5">HULL</span><span style=${"font-family:"+MONO+";font-size:13px"}>${v.pHullTxt}</span></div>
        <div style="height:12px;border:1px solid #2c4066;border-radius:2px;background:#000000;overflow:hidden;margin:4px 0 9px"><div style=${"height:100%;width:"+v.pHullPct+"%;background:"+v.pHullBg+";transition:width .35s"}></div></div>
        <div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:11px;font-weight:600;letter-spacing:.18em;color:#7d92b5">CREW</span><span style=${"font-family:"+MONO+";font-size:13px;color:#c4d2ea"}>${v.pCrewTxt}</span></div>
      </div>

      <!-- HAND BAR -->
      <div style="position:absolute;left:0;right:0;bottom:0;height:190px;border-top:1px solid #1b2a45;background:linear-gradient(180deg,#0b101df0,#04070ff8);display:grid;grid-template-columns:minmax(170px,230px) minmax(0,1fr) minmax(150px,200px);grid-template-rows:minmax(0,100%);align-items:center;z-index:10">
        <div style="padding:0 20px">
          <div style="letter-spacing:.2em;font-size:12px;font-weight:600;color:#5fd8ff;text-transform:uppercase;margin-bottom:8px">Reactor</div>
          <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap">
            <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap">
              ${v.pips.map(function(p,i){
                return html`<span key=${i} style=${"width:17px;height:26px;border:1px solid #3a5580;border-radius:2px;background:"+p.bg+";box-shadow:"+p.sh+";transition:.2s"}></span>`;
              })}
            </div>
            <span style=${"font-family:"+MONO+";font-size:16px;margin-left:8px"}>${v.powTxt}</span>
          </div>
          <div style=${"font-family:"+MONO+";font-size:12px;color:#7d92b5;letter-spacing:.06em;margin-top:10px"}>DRAW ${v.drawTxt} · DISCARD ${v.discTxt}</div>
        </div>
        <div style="align-self:stretch;height:100%;display:flex;justify-content:center;align-items:flex-end;padding-bottom:14px;min-width:0;overflow:visible">
          ${v.handEmpty ? html`<div style=${"font-family:"+MONO+";font-size:12px;color:#5f7396;align-self:center"}>— no cards in hand —</div>` : null}
          <div style="display:flex;justify-content:center;align-items:flex-end;min-width:0">
            ${v.hand.map(function(c){
              return html`
              <div key=${c.uid} class=${"hf-hand-card"+(c.playable?" playable":"")} onClick=${c.click}
                onMouseEnter=${function(){ self.hoverEnter(c); }} onMouseLeave=${function(){ self.hoverLeave(); }}
                style=${"width:176px;min-height:224px;border:1px solid #22345a;border-radius:8px;background:#0c1220;box-shadow:0 6px 18px #000a;display:flex;flex-direction:column;overflow:hidden;user-select:none;flex:0 0 176px;margin:0 "+v.cardMh+";opacity:"+c.op+";cursor:"+c.cur+";position:relative"}>
                ${self.cardFace(c)}
              </div>`;
            })}
          </div>
        </div>
        <div style="padding:0 20px;display:flex;justify-content:flex-end">
          <button class="hf-btn" onClick=${v.endClick} disabled=${v.endDisabled}
            style=${"font-family:'Space Grotesk',sans-serif;font-weight:600;letter-spacing:.14em;font-size:15px;color:#03131c;background:linear-gradient(180deg,#63e2ff,#2fbfe8);border:1px solid #8deaff;border-radius:4px;padding:13px 26px;cursor:"+v.endCur+";text-transform:uppercase;white-space:nowrap;box-shadow:0 4px 0 #14506b,0 8px 18px #0008;opacity:"+v.endOp}>End Turn ▸</button>
        </div>
      </div>

      ${v.aiming ? this.renderAimOverlay(v) : null}
    </div>`;
  };

  // ---- dwell panel: full card details docked on the right -----------------
  Game.prototype.renderHoverPanel = function (c) {
    return html`
    <div style="position:absolute;right:16px;top:50%;transform:translateY(-50%);width:300px;z-index:55;border:1px solid #334b70;border-radius:10px;background:linear-gradient(180deg,#111a2be8,#070b14f2);box-shadow:0 20px 60px #000c;backdrop-filter:blur(3px);overflow:hidden;pointer-events:none;animation:hoverfade .15s ease-out both">
      <img src=${"assets/cards/full/"+c.key+".png"} alt=${c.name} style="width:100%;height:auto;display:block;border-bottom:1px solid #1b2a45" />
      <div style="padding:13px 16px 16px">
        <div style=${"font-family:"+MONO+";font-size:11px;letter-spacing:.2em;color:#7d92b5;text-transform:uppercase"}>${c.type+" · COST "+c.cost}</div>
        <div style="font-weight:600;font-size:20px;color:#fff;margin:5px 0 3px">${c.name}</div>
        <div style=${"font-family:"+MONO+";font-size:12px;color:#ffc266;letter-spacing:.1em;margin-bottom:11px"}>${c.summary||""}</div>
        <p style="margin:0;font-size:14px;line-height:1.5;color:#b8c7dd">${c.text}</p>
      </div>
    </div>`;
  };

  // ---- targeting overlay (crosshair + firing line) ------------------------
  Game.prototype.renderAimOverlay = function (v) {
    var self=this, pos=this.aimPos, org=this.shipMuzzle("p");
    return html`
    <div onMouseMove=${function(e){ self.onAimMove(e.clientX,e.clientY); }}
         onMouseDown=${function(e){ if (e.button===2){ e.preventDefault(); self.cancelAim(); } }}
         onClick=${function(e){ self.confirmAim(e.clientX,e.clientY); }}
         onContextMenu=${function(e){ e.preventDefault(); self.cancelAim(); }}
         style="position:absolute;left:0;right:0;top:0;bottom:190px;z-index:30;cursor:none">
      ${pos ? html`
        <svg style="position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:31">
          <line x1=${org.x} y1=${org.y} x2=${pos.x} y2=${pos.y} style="stroke:#ff5470;stroke-width:1.3;stroke-dasharray:5 7;opacity:.55"></line>
        </svg>
        <div style=${"position:fixed;left:"+pos.x+"px;top:"+pos.y+"px;transform:translate(-50%,-50%);pointer-events:none;z-index:32"}>
          ${self.crosshairSvg()}
        </div>` : null}
      <div style=${"position:absolute;left:50%;top:16px;transform:translateX(-50%);z-index:33;background:#070b14ee;border:1px solid #ff5470;border-radius:5px;padding:9px 16px;font-family:"+MONO+";font-size:12.5px;letter-spacing:.12em;color:#ff8aa0;white-space:nowrap;box-shadow:0 0 26px #ff547040"}>
        ✜ SELECT IMPACT POINT — <span style="color:#eaf2ff">${v.aiming.name}</span> · CLICK THE ENEMY HULL · <span style="color:#7d92b5">ESC TO CANCEL</span>
      </div>
    </div>`;
  };
  Game.prototype.crosshairSvg = function () {
    return html`<svg width="72" height="72" viewBox="0 0 72 72" style="display:block;filter:drop-shadow(0 0 5px #ff5470aa)">
      <circle cx="36" cy="36" r="23" fill="none" stroke="#ff5470" stroke-width="1.6" opacity="0.9"></circle>
      <circle cx="36" cy="36" r="31" fill="none" stroke="#ff5470" stroke-width="0.8" opacity="0.4"></circle>
      <circle cx="36" cy="36" r="2.4" fill="#ff5470"></circle>
      <line x1="36" y1="3" x2="36" y2="17" stroke="#ff5470" stroke-width="1.6"></line>
      <line x1="36" y1="55" x2="36" y2="69" stroke="#ff5470" stroke-width="1.6"></line>
      <line x1="3" y1="36" x2="17" y2="36" stroke="#ff5470" stroke-width="1.6"></line>
      <line x1="55" y1="36" x2="69" y2="36" stroke="#ff5470" stroke-width="1.6"></line>
    </svg>`;
  };

  // ---- transient FX layer (viewport-fixed, above the battle) --------------
  Game.prototype.renderFx = function () {
    var self=this, items=this.fx||[];
    return html`<div style="position:fixed;inset:0;pointer-events:none;z-index:44;overflow:hidden">
      ${items.map(function(it){ return self.renderFxItem(it); })}
    </div>`;
  };
  Game.prototype.renderFxItem = function (it) {
    var self=this;
    if (it.kind==="proj") {
      var glow = it.img===FX.playerBolt ? "#4fd8ffaa" : "#ff5470aa";
      return html`<img key=${it.id} src=${it.img} alt="" ref=${function(el){ self.runProjectile(el,it); }}
        style=${"position:fixed;left:0;top:0;height:"+it.h+"px;width:auto;will-change:transform;filter:drop-shadow(0 0 6px "+glow+")"} />`;
    }
    if (it.kind==="flash") {
      return html`<img key=${it.id} src=${it.img} alt=""
        style=${"position:fixed;left:"+it.x+"px;top:"+it.y+"px;width:"+it.size+"px;height:"+it.size+"px;transform:translate(-50%,-50%);animation:fxflash "+it.dur+"ms ease-out forwards"} />`;
    }
    if (it.kind==="explosion") {
      return html`<div key=${it.id} ref=${function(el){ self.runExplosion(el,it); }}
        style=${"position:fixed;left:"+it.x+"px;top:"+it.y+"px;width:"+it.size+"px;height:"+it.size+"px;transform:translate(-50%,-50%)"}></div>`;
    }
    return null;
  };
  Game.prototype.runProjectile = function (el, it) {
    if (!el || it._go) return; it._go=true; var self=this;
    var dx=it.x1-it.x0, dy=it.y1-it.y0, ang=Math.atan2(dy,dx)*180/Math.PI+90;
    var a="translate("+it.x0+"px,"+it.y0+"px) translate(-50%,-50%) rotate("+ang+"deg)";
    var b="translate("+it.x1+"px,"+it.y1+"px) translate(-50%,-50%) rotate("+ang+"deg)";
    el.style.transform=a;
    var done=function(){ self.removeFx(it.id); if (it.onImpact) it.onImpact(); };
    try {
      var anim=el.animate([{transform:a},{transform:b}], { duration:it.dur, easing:"cubic-bezier(.35,.02,.6,1)" });
      var fired=false; anim.finished.then(function(){ if(!fired){ fired=true; done(); } }).catch(function(){});
      setTimeout(function(){ if(!fired){ fired=true; done(); } }, it.dur+140);
    } catch(e) { setTimeout(done, it.dur); }
  };
  Game.prototype.runExplosion = function (el, it) {
    if (!el || it._go) return; it._go=true; var self=this, cfg=it.cfg;
    el.style.backgroundImage="url("+cfg.sheet+")";
    el.style.backgroundRepeat="no-repeat";
    el.style.backgroundSize=(cfg.cols*it.size)+"px "+(cfg.rows*it.size)+"px";
    var f=0;
    function step(){
      var col=f%cfg.cols, row=Math.floor(f/cfg.cols);
      el.style.backgroundPosition=(-col*it.size)+"px "+(-row*it.size)+"px";
      f++;
      if (f<cfg.frames) it._t=setTimeout(step, it.frameMs);
      else self.removeFx(it.id);
    }
    step();
  };

  Game.prototype.renderSub = function (s) {
    return html`
    <div style=${"flex:1;border:1px solid "+s.bd+";border-radius:4px;background:#0a101ce6;padding:8px 11px"}>
      <div style=${"display:flex;justify-content:space-between;font-size:12px;letter-spacing:.14em;font-weight:600;text-transform:uppercase;color:"+s.col}><span>${s.lab}</span><span style=${"font-family:"+MONO+";font-weight:400"}>${s.val}</span></div>
      <div style="height:6px;background:#000000;border-radius:2px;margin-top:6px;overflow:hidden"><div style=${"height:100%;width:"+s.val+"%;background:"+s.bar+";transition:width .3s"}></div></div>
      <div style=${"font-family:"+MONO+";font-size:11px;color:#5f7396;margin-top:5px"}>${s.fx}</div>
    </div>`;
  };

  // ---- shield readout: a 270° arc gauge for a ship, with the value beside it.
  // Replaces the old horizontal shield bar; the arc fills clockwise with the
  // deflector screen's charge. r=40 → circumference 251.3, of which 270° = 188.5.
  Game.prototype.renderShieldArc = function (pct, txt, color) {
    var vis = 188.5, len = (vis * this.cl(pct, 0, 100) / 100).toFixed(1);
    return html`
    <div style="display:flex;align-items:center;justify-content:center;gap:13px;margin:14px 30px 0">
      <div style="position:relative;width:52px;height:52px;flex:0 0 auto">
        <svg viewBox="0 0 100 100" style="width:100%;height:100%;transform:rotate(135deg)">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#0d1830" stroke-width="9" stroke-linecap="round" stroke-dasharray="188.5 62.8"></circle>
          <circle cx="50" cy="50" r="40" fill="none" stroke=${color} stroke-width="9" stroke-linecap="round"
            stroke-dasharray=${len+" 251.3"} style=${"transition:stroke-dasharray .35s;filter:drop-shadow(0 0 4px "+color+"aa)"}></circle>
        </svg>
        <div style=${"position:absolute;inset:0;display:grid;place-items:center;font-size:18px;color:"+color+";opacity:.85"}>⛨</div>
      </div>
      <div style="display:flex;flex-direction:column;line-height:1.15">
        <span style=${"font-family:"+MONO+";font-size:10px;letter-spacing:.22em;color:#7d92b5"}>SHIELD</span>
        <span style=${"font-family:"+MONO+";font-size:18px;color:#eaf2ff"}>${txt}</span>
      </div>
    </div>`;
  };

  // ------------------------------- MAP -------------------------------------
  // Zone-based free-travel sector chart (from the sector-map design handoff),
  // scaled up 3x onto a 2400x1400 scrollable field: drag to pan, wheel to
  // scroll, click a system for intel, double-click (or SET COURSE) to travel.
  Game.prototype.renderMap = function (v) {
    var self=this, m=v.map;
    return html`
    <div style="position:absolute;inset:58px 0 0 0">
      <!-- scrollable chart field -->
      <div class="hf-mapscroll"
        ref=${function(el){ var fresh=el&&el!==self.mapScrollEl; self.mapScrollEl=el; if (fresh) self.scrollToNode(self.state.current,false); }}
        onMouseDown=${function(e){ self.mapDown(e); }}
        onMouseMove=${function(e){ self.mapMove(e); }}
        style=${"position:absolute;inset:18px 380px 84px 258px;overflow:auto;cursor:"+(this._mdrag&&this._didPan?"grabbing":"grab")}>
        <div style=${"position:relative;width:"+WORLD.w+"px;height:"+WORLD.h+"px"}>
          <div style=${"position:absolute;inset:0;background:"+WASH_BG}></div>
          ${m.zones.map(function(z){
            return html`
            <div key=${z.name} style=${"position:absolute;left:"+z.x+";top:"+z.y+";z-index:1;pointer-events:none"}>
              <div style=${"font-family:"+MONO+";font-size:13px;letter-spacing:.3em;color:"+z.c+";font-weight:600"}>${z.name}</div>
              <div style=${"font-family:"+MONO+";font-size:10px;letter-spacing:.18em;color:#5f7396;margin-top:4px"}>${z.sub}</div>
            </div>`;
          })}
          <div style="position:absolute;left:36%;top:1%;z-index:1;display:flex;align-items:center;gap:8px;border:1px solid #7a2436;border-radius:4px;background:#1f081088;padding:6px 11px;pointer-events:none">
            <span style="color:#ff5470;font-size:13px">◈</span><span style=${"font-family:"+MONO+";font-size:11px;letter-spacing:.16em;color:#ff8aa0"}>THREAT: CORSAIR PACT</span>
          </div>
          <svg viewBox=${"0 0 "+WORLD.w+" "+WORLD.h} style="position:absolute;inset:0;width:100%;height:100%;overflow:visible">
            ${m.edges.map(function(e,i){
              return html`<line key=${i} x1=${e.x1} y1=${e.y1} x2=${e.x2} y2=${e.y2} style=${"stroke:"+e.col+";stroke-width:1.4;stroke-dasharray:7 7;opacity:"+e.op}></line>`;
            })}
          </svg>
          <div style="position:absolute;inset:0">
            ${m.nodes.map(function(n){
              return html`
              <div key=${n.id} class="hf-planet" onClick=${n.click} onDblClick=${n.dbl}
                style=${"position:absolute;left:"+n.x+"%;top:"+n.y+"%;transform:translate(-50%,-50%);text-align:center;opacity:"+n.op+";cursor:pointer;z-index:2;width:160px"}>
                <div style=${"position:relative;width:"+n.sz+"px;height:"+n.sz+"px;margin:0 auto"}>
                  <div style=${"position:absolute;inset:-9px;border:1px dashed #4fd8ff;border-radius:50%;opacity:"+n.selOp}></div>
                  <div style=${"position:absolute;inset:-6px;border:1px solid "+n.pulseC+";border-radius:50%;animation:ringpulseO 1.7s infinite;display:"+n.pulseDisp}></div>
                  <div style=${"position:absolute;inset:0;border-radius:50%;border:2px solid "+n.ringCol+";background:"+n.disc+";box-shadow:"+n.glow}></div>
                  <div style=${"position:absolute;right:-7px;bottom:-5px;width:20px;height:20px;border-radius:50%;background:#070b14;border:1px solid "+n.ringCol+";display:grid;place-items:center;font-size:11px;color:"+n.gc}>${n.glyph}</div>
                  <div style=${"display:"+n.lockDisp+";position:absolute;inset:0;z-index:3;flex-direction:column;align-items:center;justify-content:center;filter:drop-shadow(0 3px 8px #000000e0)"}>
                    <div style="width:14px;height:12px;border:3px solid #ffc266;border-bottom:none;border-radius:8px 8px 0 0"></div>
                    <div style="width:24px;height:17px;background:#ffc266;border-radius:3px;margin-top:-1px;display:grid;place-items:center"><div style="width:5px;height:7px;background:#140f06;border-radius:2px"></div></div>
                  </div>
                </div>
                <div style=${"font-size:12.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:"+n.lc+";margin-top:10px;line-height:1.25"}>${n.label}</div>
                <div style=${"font-family:"+MONO+";font-size:9.5px;letter-spacing:.16em;color:"+n.tagC+";margin-top:3px"}>${n.tag}</div>
              </div>`;
            })}
          </div>
          <img src=${m.shipSrc} alt="ISV Palewake"
            style=${"position:absolute;left:"+m.shipX+";top:"+m.shipY+";transform:translate(-145%,-75%);width:64px;z-index:4;pointer-events:none;transition:left 1.4s ease-in-out,top 1.4s ease-in-out;filter:drop-shadow(0 8px 16px #000000cc)"} />
        </div>
      </div>
      <div style=${"position:absolute;left:258px;right:380px;top:26px;text-align:center;z-index:6;pointer-events:none"}>
        <span style=${"font-family:"+MONO+";font-size:11px;letter-spacing:.14em;color:#8fa3c4;background:#070b14d0;border:1px solid #1b2a45;border-radius:4px;padding:5px 12px;animation:hintfade 8s ease-out forwards"}>DRAG TO PAN · CLICK FOR INTEL · DOUBLE-CLICK TO TRAVEL</span>
      </div>

      <!-- left rail: home base + sector control -->
      <div style="position:absolute;left:20px;top:18px;bottom:20px;width:216px;display:flex;flex-direction:column;gap:14px;z-index:5">
        <div style="border:1px solid #1b2a45;border-radius:6px;background:#070b14d9;padding:14px 16px">
          <div style=${"font-family:"+MONO+";font-size:10px;letter-spacing:.24em;color:#5f7396"}>HOME BASE</div>
          <div style="font-weight:700;font-size:17px;letter-spacing:.06em;color:#ffffff;margin-top:4px">ISV PALEWAKE</div>
          <img src=${m.shipSrc} alt="ISV Palewake" style="width:100%;height:74px;object-fit:contain;margin:10px 0 6px;filter:drop-shadow(0 8px 16px #000000cc)" />
          <div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:10px;font-weight:600;letter-spacing:.18em;color:#7d92b5">HULL</span><span style=${"font-family:"+MONO+";font-size:12px"}>${m.hullTxt}</span></div>
          <div style="height:9px;border:1px solid #2c4066;border-radius:2px;background:#000000;overflow:hidden;margin:4px 0 8px"><div style=${"height:100%;width:"+m.hullPct+"%;background:linear-gradient(180deg,#8df2c8,#2aa878)"}></div></div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin:0 0 8px">
            <span style="font-size:10px;font-weight:600;letter-spacing:.18em;color:#7d92b5">FUEL</span>
            <span style="display:flex;gap:3px">
              ${Array.apply(null,{length:m.fuelMax}).map(function(_,i){
                return html`<span key=${i} style=${"width:10px;height:14px;border:1px solid #5c4a26;border-radius:2px;background:"+(i<m.fuel?"linear-gradient(180deg,#ffd9a0,#b3672a)":"#070b14")}></span>`;
              })}
            </span>
          </div>
          <div style=${"font-family:"+MONO+";font-size:11px;color:#8fa3c4;line-height:1.7"}>CREW ${m.crewTxt} · DECK ${m.deckTxt} CARDS<br/>SALVAGE ${m.salv} ◈</div>
        </div>
        <div style="border:1px solid #1b2a45;border-radius:6px;background:#070b14d9;padding:14px 16px">
          <div style=${"font-family:"+MONO+";font-size:10px;letter-spacing:.24em;color:#5f7396"}>SECTOR CONTROL</div>
          <div style="display:flex;align-items:baseline;gap:8px;margin-top:6px"><span style="font-weight:700;font-size:24px;color:#ffffff">${m.takenCount}<span style="color:#5f7396;font-size:16px"> / ${m.totalCount}</span></span><span style=${"font-family:"+MONO+";font-size:11px;color:#7cf0c0"}>SECURED</span></div>
          <div style="height:6px;border:1px solid #2c4066;border-radius:2px;background:#000000;overflow:hidden;margin-top:8px"><div style=${"height:100%;width:"+m.ctrlPct+"%;background:linear-gradient(90deg,#1e6f94,#4fd8ff)"}></div></div>
          <div style=${"font-family:"+MONO+";font-size:10px;letter-spacing:.1em;color:#5f7396;margin-top:8px;line-height:1.6"}>${m.ctrlNote}</div>
        </div>
      </div>

      <!-- intel panel -->
      <div style="position:absolute;right:20px;top:18px;bottom:20px;width:340px;border:1px solid #334b70;border-radius:8px;background:linear-gradient(180deg,#111a2bee,#070b14ee);padding:18px 20px;display:flex;flex-direction:column;z-index:5;box-shadow:0 18px 60px #000000aa;overflow:hidden">
        <div style="height:120px;flex:none;border-radius:5px;border:1px solid #1b2a45;background:repeating-linear-gradient(45deg,#0d1424 0 10px,#111a2c 10px 20px);display:grid;place-items:center;margin-bottom:14px">
          <span style=${"font-family:"+MONO+";font-size:11px;letter-spacing:.2em;color:#5f7396"}>· ${m.d.art} ·</span>
        </div>
        <div style=${"font-family:"+MONO+";font-size:11px;letter-spacing:.22em;color:#7d92b5;text-transform:uppercase"}>${m.d.kicker}</div>
        <div style="font-weight:700;font-size:24px;letter-spacing:.04em;color:#ffffff;margin-top:7px;line-height:1.15">${m.d.name}</div>
        <div style=${"font-family:"+MONO+";font-size:11px;letter-spacing:.18em;color:"+m.d.statusCol+";margin-top:6px"}>● ${m.d.status}</div>
        <p style="font-size:13.5px;line-height:1.55;color:#8fa3c4;margin:12px 0 0">${m.d.desc}</p>
        <div style="display:flex;flex-direction:column;gap:9px;margin-top:14px;border-top:1px solid #1b2a45;padding-top:13px">
          ${m.d.lines.map(function(l,i){
            return html`<div key=${i} style="display:flex;justify-content:space-between;gap:12px"><span style="font-size:11px;font-weight:600;letter-spacing:.18em;color:#7d92b5">${l.k}</span><span style=${"font-family:"+MONO+";font-size:11px;letter-spacing:.06em;text-align:right;color:"+l.c}>${l.v}</span></div>`;
          })}
        </div>
        <div style="flex:1"></div>
        ${m.d.req ? html`
        <div style="border:1px solid #40202c;border-radius:5px;background:#140a10;padding:10px 12px;margin-bottom:12px">
          <div style="font-size:11px;font-weight:600;letter-spacing:.18em;color:#ff8aa0">REQUIREMENT</div>
          <div style=${"font-family:"+MONO+";font-size:12px;color:#d6a9b5;margin-top:4px;line-height:1.5"}>${m.d.req}</div>
        </div>` : null}
        <div style="display:flex;gap:10px">
          <button class="hf-ghost-btn" onClick=${function(){ self.state.overlay="codex"; self.forceUpdate(); }}
            style="flex:0 0 auto;font-family:'Space Grotesk',sans-serif;font-weight:600;letter-spacing:.12em;font-size:12px;text-transform:uppercase;color:#d6e2f5;background:#0a101c;border:1px solid #2c4066;border-radius:4px;padding:13px 14px;cursor:pointer">VIEW INTEL</button>
          <button class=${m.d.en?"hf-btn":""} onClick=${m.d.actClick} disabled=${!m.d.en}
            style=${"flex:1;font-family:'Space Grotesk',sans-serif;font-weight:600;letter-spacing:.14em;font-size:13.5px;text-transform:uppercase;color:"+m.d.btnCol+";background:"+m.d.btnBg+";border:1px solid "+m.d.btnBd+";border-radius:4px;padding:13px 0;cursor:"+(m.d.en?"pointer":"default")+";box-shadow:"+m.d.btnSh}>${m.d.act}</button>
        </div>
      </div>

      <!-- bottom bar -->
      <div style="position:absolute;left:258px;right:380px;bottom:20px;display:flex;justify-content:center;gap:12px;z-index:5">
        ${[["◈ DECK","deckview"],["⚙ SHIP","shipview"],["▤ CODEX","codex"]].map(function(b){
          return html`<button key=${b[1]} class="hf-ghost-btn" onClick=${function(){ self.state.overlay=b[1]; self.forceUpdate(); }}
            style="font-family:'Space Grotesk',sans-serif;font-weight:600;letter-spacing:.14em;font-size:12px;text-transform:uppercase;color:#d6e2f5;background:#0a101ccc;border:1px solid #2c4066;border-radius:4px;padding:11px 22px;cursor:pointer">${b[0]}</button>`;
        })}
      </div>
    </div>`;
  };

  // --------------------------- SHIPYARD (yard) ------------------------------
  // Forge Tether Shipyard model from the handoff — the template for every
  // docked shipyard: dry dock, yard services, permanent refits, thin armory.
  Game.prototype.renderYard = function (v) {
    var self=this, y=v.yd;
    return html`
    <div style="position:absolute;inset:58px 0 0 0;overflow:auto">
      <div style="max-width:1360px;margin:0 auto;padding:28px 26px 48px">
        <div style="display:flex;align-items:flex-end;gap:18px;flex-wrap:wrap;border-bottom:1px solid #1b2a45;padding-bottom:16px">
          <div>
            <div style=${"font-family:"+MONO+";font-size:12px;letter-spacing:.3em;color:#5f7396"}>DOCKING CLAMPS ENGAGED · ${y.zone}</div>
            <div style="font-weight:700;letter-spacing:.1em;font-size:34px;margin-top:3px;color:#ffffff">${y.title}</div>
          </div>
          <div style="flex:1"></div>
          <div style=${"font-family:"+MONO+";font-size:16px;color:#ffc266;border:1px solid #5c4a26;border-radius:4px;padding:9px 16px;background:#0d1424"}>${y.salv} ◈ SALVAGE</div>
          <button class="hf-btn" onClick=${function(){ self.undockYard(); }} style="font-family:'Space Grotesk',sans-serif;font-weight:600;letter-spacing:.14em;font-size:14px;color:#03131c;background:linear-gradient(180deg,#63e2ff,#2fbfe8);border:1px solid #8deaff;border-radius:4px;padding:12px 22px;cursor:pointer;text-transform:uppercase;box-shadow:0 4px 0 #14506b">Undock ▸</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1.35fr 1fr;gap:20px;margin-top:22px;align-items:start">
          <div style="display:flex;flex-direction:column;gap:20px">
            <div style="border:1px solid #1b2a45;border-radius:6px;background:#0a0f1ad9;padding:16px 18px">
              <div style="letter-spacing:.2em;font-size:13px;font-weight:600;color:#ffffff;text-transform:uppercase">Dry Dock</div>
              <div style="font-size:13.5px;color:#8fa3c4;margin:3px 0 10px">The Palewake, in the cradle.</div>
              <img src=${y.shipSrc} alt="ISV Palewake in dry dock" style="width:100%;height:130px;object-fit:contain;filter:drop-shadow(0 12px 24px #000000cc)" />
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
                ${y.stats.map(function(s,i){
                  return html`<div key=${i} style="border:1px solid #1b2a45;border-radius:4px;background:#070b14;padding:8px 10px"><div style="font-size:10px;font-weight:600;letter-spacing:.18em;color:#7d92b5">${s.k}</div><div style=${"font-family:"+MONO+";font-size:14px;color:#eaf2ff;margin-top:2px"}>${s.v}</div></div>`;
                })}
              </div>
            </div>
            <div style="border:1px solid #1b2a45;border-radius:6px;background:#0a0f1ad9;padding:16px 18px">
              <div style="letter-spacing:.2em;font-size:13px;font-weight:600;color:#ffffff;text-transform:uppercase">Yard Services</div>
              <div style="display:flex;flex-direction:column;gap:9px;margin-top:12px">
                <button onClick=${v.repClick} style=${"display:flex;justify-content:space-between;align-items:center;font-family:'Space Grotesk',sans-serif;font-weight:600;letter-spacing:.1em;font-size:12.5px;text-transform:uppercase;color:#d6e2f5;background:#0a101c;border:1px solid #2c4066;border-radius:4px;padding:11px 14px;cursor:"+v.repCur+";opacity:"+v.repOp}><span>Patch Hull +15</span><span style=${"font-family:"+MONO+";color:#ffc266"}>10 ◈</span></button>
                <button onClick=${v.crClick} style=${"display:flex;justify-content:space-between;align-items:center;font-family:'Space Grotesk',sans-serif;font-weight:600;letter-spacing:.1em;font-size:12.5px;text-transform:uppercase;color:#d6e2f5;background:#0a101c;border:1px solid #2c4066;border-radius:4px;padding:11px 14px;cursor:"+v.crCur+";opacity:"+v.crOp}><span>Hire Crew +1</span><span style=${"font-family:"+MONO+";color:#ffc266"}>8 ◈</span></button>
              </div>
            </div>
          </div>
          <div style="border:1px solid #1b2a45;border-radius:6px;background:#0a0f1ad9;padding:16px 18px">
            <div style="letter-spacing:.2em;font-size:13px;font-weight:600;color:#ffffff;text-transform:uppercase">Shipyard — Permanent Refits</div>
            <div style="font-size:13.5px;color:#8fa3c4;margin:3px 0 14px">Welded to the frame. Yours for the rest of the run.</div>
            <div style="display:flex;flex-direction:column;gap:10px">
              ${y.refits.map(function(r){
                return html`
                <div key=${r.k} style=${"display:flex;align-items:center;gap:14px;border:1px solid "+r.bd+";border-radius:5px;background:"+r.bg+";padding:12px 14px"}>
                  <div style="min-width:0;flex:1">
                    <div style=${"font-weight:600;font-size:14.5px;color:"+r.nameCol}>${r.name}${r.isNew?html` <span style=${"font-family:"+MONO+";font-size:10px;letter-spacing:.14em;color:#ffc266;border:1px solid #5c4a26;border-radius:3px;padding:2px 5px;margin-left:6px;vertical-align:2px"}>NEW</span>`:null}</div>
                    <div style="font-size:12.5px;color:#8fa3c4;margin-top:2px">${r.desc}</div>
                  </div>
                  <button onClick=${r.click} style=${"font-family:"+MONO+";font-size:12px;letter-spacing:.08em;color:"+r.btnCol+";background:#0a101c;border:1px solid "+r.btnBd+";border-radius:4px;padding:9px 14px;cursor:"+r.cur+";white-space:nowrap;opacity:"+r.op}>${r.btn}</button>
                </div>`;
              })}
            </div>
          </div>
          <div style="border:1px solid #1b2a45;border-radius:6px;background:#0a0f1ad9;padding:16px 18px">
            <div style="letter-spacing:.2em;font-size:13px;font-weight:600;color:#ffffff;text-transform:uppercase">Yard Armory</div>
            <div style="font-size:13.5px;color:#8fa3c4;margin:3px 0 14px">Thin stock — full card shops stay at waystations.</div>
            <div style="display:flex;flex-direction:column;gap:10px">
              ${y.stock.map(function(s){
                return html`
                <div key=${s.key} onMouseEnter=${function(){ self.hoverEnter(LIB[s.key]); }} onMouseLeave=${function(){ self.hoverLeave(); }}
                  style="display:flex;align-items:center;gap:12px;border:1px solid #1b2a45;border-radius:5px;background:#070b14;overflow:hidden">
                  <img src=${"assets/cards/"+s.key+".png"} alt=${s.name+" card art"} style="width:74px;height:56px;object-fit:cover;flex:none;border-right:1px solid #1a2942" />
                  <div style="min-width:0;flex:1"><div style="font-weight:600;font-size:13.5px;color:#eaf2ff">${s.name}</div><div style=${"font-family:"+MONO+";font-size:10px;letter-spacing:.1em;color:#7d92b5;margin-top:2px"}>${s.sub}</div></div>
                  <button onClick=${s.click} style=${"font-family:"+MONO+";font-size:11.5px;letter-spacing:.06em;color:"+s.btnCol+";background:#0a101c;border:1px solid "+s.btnBd+";border-radius:4px;padding:8px 11px;cursor:"+s.cur+";margin-right:10px;white-space:nowrap;opacity:"+s.op}>${s.btn}</button>
                </div>`;
              })}
            </div>
            <div style="border:1px solid #1b2a45;border-radius:5px;background:#070b14;padding:12px 14px;margin-top:14px">
              <div style=${"font-family:"+MONO+";font-size:10px;letter-spacing:.22em;color:#5f7396"}>YARD GOSSIP</div>
              <p style="font-size:12.5px;line-height:1.55;color:#8fa3c4;margin:6px 0 0">${y.gossip}</p>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  };

  // ---- map overlays: repair dock, deck view, ship view, sector codex ------
  Game.prototype.mapOverlayShell = function (kick, title, body) {
    var self=this;
    return html`
    <div style="position:absolute;inset:0;background:#000000d8;backdrop-filter:blur(3px);display:grid;place-items:center;z-index:50;padding:20px"
      onClick=${function(){ self.state.overlay=null; self.forceUpdate(); }}>
      <div class="hf-overlay-panel" onClick=${function(e){ e.stopPropagation(); }}
        style="max-width:640px;width:100%;border:1px solid #2c4066;border-radius:10px;background:linear-gradient(180deg,#101828,#070b14);box-shadow:0 24px 70px #000c;overflow:hidden">
        <div style="padding:18px 26px;border-bottom:1px solid #1b2a45">
          <div style=${"font-family:"+MONO+";font-size:12px;letter-spacing:.26em;color:#5f7396"}>${kick}</div>
          <div style="font-weight:700;letter-spacing:.08em;font-size:28px;margin-top:2px;color:#ffffff">${title}</div>
        </div>
        <div style="padding:20px 26px;max-height:60vh;overflow-y:auto">${body}</div>
      </div>
    </div>`;
  };
  Game.prototype.renderDock = function () {
    var self=this, S=this.state, p=S.player, n=NBYID[S.current];
    var rOk=S.salvage>=10&&p.hull<p.hullMax, cOk=S.salvage>=8&&p.crew<p.crewMax;
    return this.mapOverlayShell("REPAIR DEPOT · DOCKED", n?n.label:"REPAIR DOCK", html`
      <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#8fa3c4">Tenders swarm the hull the moment the clamps bite, and the fuel racks are already topped off. Hull ${Math.round(p.hull)}/${p.hullMax} · Crew ${p.crew}/${p.crewMax} · Fuel ${p.fuel}/${p.fuelMax} · ${S.salvage} ◈</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <button onClick=${rOk?function(){ self.repair(); }:undefined} style=${"font-family:"+MONO+";font-size:13px;color:#d6e2f5;background:#0d1424;border:1px solid #3a5580;border-radius:3px;padding:10px 15px;cursor:"+(rOk?"pointer":"default")+";opacity:"+(rOk?1:.45)+";letter-spacing:.06em"}>PATCH HULL +15 — 10 ◈</button>
        <button onClick=${cOk?function(){ self.hire(); }:undefined} style=${"font-family:"+MONO+";font-size:13px;color:#d6e2f5;background:#0d1424;border:1px solid #3a5580;border-radius:3px;padding:10px 15px;cursor:"+(cOk?"pointer":"default")+";opacity:"+(cOk?1:.45)+";letter-spacing:.06em"}>HIRE CREW +1 — 8 ◈</button>
        <button class="hf-ghost-btn" onClick=${function(){ S.overlay=null; self.forceUpdate(); }} style="font-family:'Space Grotesk',sans-serif;font-weight:600;letter-spacing:.12em;font-size:12px;text-transform:uppercase;color:#d6e2f5;background:#0a101c;border:1px solid #2c4066;border-radius:4px;padding:10px 18px;cursor:pointer">Cast Off ▸</button>
      </div>`);
  };
  Game.prototype.renderDeckView = function () {
    var S=this.state;
    return this.mapOverlayShell("SHIP'S MANIFEST", "Deck — "+S.deckKeys.length+" Cards", html`
      <div style="display:flex;gap:9px;flex-wrap:wrap">
        ${S.deckKeys.map(function(k,i){
          return html`<div key=${i} style="display:flex;align-items:center;gap:9px;border:1px solid #22345a;border-radius:3px;background:#0d1424;padding:6px 11px">
            <span style=${"font-family:"+MONO+";font-size:12px;color:#a9bcda"}>${LIB[k].cost}◈</span>
            <span style="font-size:14px;font-weight:500;letter-spacing:.03em">${LIB[k].name}</span>
          </div>`;
        })}
      </div>
      <div style=${"font-family:"+MONO+";font-size:11px;color:#5f7396;margin-top:14px;letter-spacing:.08em"}>SCRAP AND RESTOCK AT ANY STATION ARMORY.</div>`);
  };
  Game.prototype.renderShipView = function () {
    var S=this.state, p=S.player;
    var rows=[["HULL",Math.round(p.hull)+"/"+p.hullMax],["SHIELD CAP",String(p.shieldCap)],["REACTOR",p.powerBase+" / TURN"],["CREW",p.crew+"/"+p.crewMax],["FUEL",p.fuel+"/"+p.fuelMax+" CELLS"]];
    return this.mapOverlayShell("SHIP STATUS", "ISV Palewake", html`
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${rows.map(function(r,i){
          return html`<div key=${i} style="border:1px solid #1b2a45;border-radius:4px;background:#070b14;padding:8px 10px"><div style="font-size:10px;font-weight:600;letter-spacing:.18em;color:#7d92b5">${r[0]}</div><div style=${"font-family:"+MONO+";font-size:14px;color:#eaf2ff;margin-top:2px"}>${r[1]}</div></div>`;
        })}
      </div>
      <div style="letter-spacing:.18em;font-size:11px;font-weight:600;color:#7d92b5;text-transform:uppercase;margin:16px 0 8px">Installed Refits</div>
      ${YARD_REFITS.filter(function(r){ return p.ups[r.k]; }).map(function(r){
        return html`<div key=${r.k} style="display:flex;justify-content:space-between;border:1px solid #1e4a38;border-radius:4px;background:#07140f;padding:8px 12px;margin-bottom:6px"><span style="font-size:13.5px;font-weight:600;color:#eaf2ff">${r.name}</span><span style=${"font-family:"+MONO+";font-size:11px;color:#7cf0c0;letter-spacing:.08em"}>INSTALLED</span></div>`;
      })}
      ${Object.keys(p.ups).length===0?html`<div style=${"font-family:"+MONO+";font-size:12px;color:#5f7396"}>— none. Shipyards sell permanent refits. —</div>`:null}`);
  };
  Game.prototype.renderCodex = function () {
    var self=this, S=this.state;
    var zsec=this.zonesSecured();
    return this.mapOverlayShell("SECTOR CODEX", "The Blackstar Verge", html`
      <p style="margin:0 0 14px;font-size:14.5px;line-height:1.55;color:#8fa3c4">Ten zones, one way out. Take every system in a zone to secure it — <b style="color:#eaf2ff">${zsec} secured</b>, ${GATE_ZONES_REQ} needed to unseal the Blackstar Gate.</p>
      ${ZONES.map(function(z){
        var secured=self.zoneSecured(z), unlocked=self.zoneUnlocked(z);
        var tot=0, tk=0;
        NODES.forEach(function(n){ if (n.z===z.k){ tot++; if (S.taken[n.id]) tk++; } });
        var st=secured?"SECURED":!unlocked?"SEALED — "+z.req.txt:(z.req?"UNLOCKED":"OPEN");
        var stC=secured?"#7cf0c0":!unlocked?"#ff8aa0":"#8deaff";
        return html`<div key=${z.k} style="display:flex;justify-content:space-between;gap:14px;border:1px solid #1b2a45;border-radius:4px;background:#0a0f1a;padding:9px 13px;margin-bottom:7px">
          <span style=${"font-family:"+MONO+";font-size:12px;letter-spacing:.14em;color:"+z.c}>${z.name} <span style="color:#5f7396">${tk}/${tot}</span></span>
          <span style=${"font-family:"+MONO+";font-size:10.5px;letter-spacing:.1em;text-align:right;color:"+stC}>${st}</span>
        </div>`;
      })}
      <div style="letter-spacing:.18em;font-size:11px;font-weight:600;color:#7d92b5;text-transform:uppercase;margin:14px 0 8px">Key Items</div>
      ${Object.keys(KEY_NAMES).map(function(k){
        var got=!!S.zoneKeys[k];
        return html`<span key=${k} style=${"display:inline-block;font-family:"+MONO+";font-size:11px;letter-spacing:.1em;border:1px solid "+(got?"#5c4a26":"#22345a")+";border-radius:3px;background:"+(got?"#0d0b06":"#0a0f1a")+";color:"+(got?"#ffc266":"#5f7396")+";padding:5px 10px;margin:0 8px 8px 0"}>${got?"◈ ":"· "}${KEY_NAMES[k]}</span>`;
      })}`);
  };

  // ------------------------------- BASE ------------------------------------
  Game.prototype.renderBase = function (v) {
    var self=this;
    return html`
    <div style="position:absolute;inset:58px 0 0 0;overflow:auto">
      <div style="max-width:1260px;margin:0 auto;padding:30px 26px 48px">
        <div style="display:flex;align-items:flex-end;gap:18px;flex-wrap:wrap;border-bottom:1px solid #1b2a45;padding-bottom:16px">
          <div>
            <div style=${"font-family:"+MONO+";font-size:12px;letter-spacing:.3em;color:#5f7396"}>DOCKING CLAMPS ENGAGED</div>
            <div style="font-weight:700;letter-spacing:.1em;font-size:34px;margin-top:3px;color:#ffffff">${v.baTitle}</div>
          </div>
          <div style="flex:1"></div>
          <div style=${"font-family:"+MONO+";font-size:16px;color:#ffc266;border:1px solid #5c4a26;border-radius:4px;padding:9px 16px;background:#0d1424"}>${v.baSalvTxt} ◈ SALVAGE</div>
          <button class="hf-btn" onClick=${v.depClick} style="font-family:'Space Grotesk',sans-serif;font-weight:600;letter-spacing:.14em;font-size:14px;color:#03131c;background:linear-gradient(180deg,#63e2ff,#2fbfe8);border:1px solid #8deaff;border-radius:4px;padding:12px 22px;cursor:pointer;text-transform:uppercase;box-shadow:0 4px 0 #14506b">Undock ▸</button>
        </div>

        <div style="display:grid;grid-template-columns:1.7fr 1fr;gap:20px;margin-top:24px;align-items:start">
          <!-- armory -->
          <div style="border:1px solid #1b2a45;border-radius:6px;background:#0a0f1ad9;padding:16px 18px">
            <div style="letter-spacing:.2em;font-size:13px;font-weight:600;color:#ffffff;text-transform:uppercase">The Armory</div>
            <div style="font-size:14px;color:#8fa3c4;margin:3px 0 14px">Wire new schematics into your deck.</div>
            <div style="display:flex;gap:14px;flex-wrap:wrap">
              ${v.baStock.map(function(c,i){
                return html`
                <div key=${i} style="width:176px;display:flex;flex-direction:column;gap:8px">
                  <div onMouseEnter=${function(){ self.hoverEnter(c); }} onMouseLeave=${function(){ self.hoverLeave(); }}
                    style="position:relative;border:1px solid #22345a;border-radius:8px;background:#0c1220;box-shadow:0 6px 18px #000a;display:flex;flex-direction:column;overflow:hidden;min-height:216px">
                    ${self.cardFace(c)}
                  </div>
                  <button class=${"hf-buy"+(c.affordable?" affordable":"")} onClick=${c.click} style=${"font-family:"+MONO+";font-size:13px;color:#eaf2ff;background:#101828;border:1px solid #2c4066;border-radius:3px;padding:8px 0;cursor:"+c.cur+";opacity:"+c.op+";letter-spacing:.1em"}>BUY ${c.price} ◈</button>
                </div>`;
              })}
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:20px">
            <!-- refit bay (permanent refits now live at dedicated shipyards) -->
            <div style="border:1px solid #1b2a45;border-radius:6px;background:#0a0f1ad9;padding:16px 18px">
              <div style="letter-spacing:.2em;font-size:13px;font-weight:600;color:#ffffff;text-transform:uppercase">Refit Bay</div>
              <div style="font-size:14px;color:#8fa3c4;margin:3px 0 14px">Hull ${v.pHullTxt} · Crew ${v.pCrewTxt}</div>
              <div style="display:flex;gap:12px;flex-wrap:wrap">
                <button onClick=${v.repClick} style=${"font-family:"+MONO+";font-size:13px;color:#d6e2f5;background:#0d1424;border:1px solid #3a5580;border-radius:3px;padding:10px 15px;cursor:"+v.repCur+";opacity:"+v.repOp+";letter-spacing:.06em"}>PATCH HULL +15 — 10 ◈</button>
                <button onClick=${v.crClick} style=${"font-family:"+MONO+";font-size:13px;color:#d6e2f5;background:#0d1424;border:1px solid #3a5580;border-radius:3px;padding:10px 15px;cursor:"+v.crCur+";opacity:"+v.crOp+";letter-spacing:.06em"}>HIRE CREW +1 — 8 ◈</button>
              </div>
              <div style=${"font-family:"+MONO+";font-size:11px;color:#5f7396;margin-top:12px;letter-spacing:.06em"}>PERMANENT REFITS — SEE A SHIPYARD (FORGE TETHER · HOLLOW YARD)</div>
            </div>
          </div>
        </div>

        <!-- deck manifest -->
        <div style="border:1px solid #1b2a45;border-radius:6px;background:#0a0f1ad9;padding:16px 18px;margin-top:20px">
          <div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap">
            <div style="letter-spacing:.2em;font-size:13px;font-weight:600;color:#8fa3c4;text-transform:uppercase">Deck Manifest</div>
            <div style=${"font-family:"+MONO+";font-size:11.5px;color:#5f7396"}>CLICK ✕ TO SCRAP A CARD — 12 ◈ (MIN 6 CARDS)</div>
          </div>
          <div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:13px">
            ${v.deckCards.map(function(d,i){
              return html`
              <div key=${i} style="display:flex;align-items:center;gap:9px;border:1px solid #22345a;border-radius:3px;background:#0d1424;padding:6px 11px">
                <span style=${"font-family:"+MONO+";font-size:12px;color:#a9bcda"}>${d.cost}◈</span>
                <span style="font-size:14px;font-weight:500;letter-spacing:.03em">${d.name}</span>
                <span onClick=${d.click} style=${"font-family:"+MONO+";font-size:12px;color:#eaf2ff;cursor:"+d.cur+";opacity:"+d.op+";padding:0 2px"}>✕</span>
              </div>`;
            })}
          </div>
        </div>
      </div>
    </div>`;
  };

  // ----------------------------- OVERLAYS ----------------------------------
  Game.prototype.renderBriefing = function () {
    var self=this;
    return html`
    <div style="position:absolute;inset:0;background:#000000d8;backdrop-filter:blur(3px);display:grid;place-items:center;z-index:50;padding:20px">
      <div class="hf-overlay-panel" style="max-width:700px;width:100%;border:1px solid #2c4066;border-radius:10px;background:linear-gradient(180deg,#101828,#070b14);box-shadow:0 24px 70px #000c;overflow:hidden">
        <div style="border-bottom:1px solid #1b2a45">
          <div style="height:8px;background-image:repeating-linear-gradient(45deg,#4fd8ff 0 10px,#0d1424 10px 20px)"></div>
          <div style="padding:16px 26px 17px">
            <div style=${"font-family:"+MONO+";font-size:12px;letter-spacing:.26em;color:#5f7396"}>SORTIE BRIEFING</div>
            <div style="font-weight:700;letter-spacing:.1em;font-size:30px;color:#ffffff">BLACKSTAR VERGE</div>
          </div>
        </div>
        <div style="padding:22px 26px">
          <p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#8fa3c4">The fleet is scattered and the <b style="color:#eaf2ff">Corsair Pact</b> runs the Blackstar Verge — its lanes taxed, its jump gate sealed behind <b style="color:#eaf2ff">Ironwall Command</b>. You hold one anchorage and one hull: the corvette <b style="color:#eaf2ff">ISV Palewake</b>. Every system you take is yours. Take enough, and the sector follows.</p>
          <p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#8fa3c4">Travel is free along the charted lanes, but every jump burns a <b style="color:#eaf2ff">fuel cell</b> — friendly docks refill them free; run dry and you burn hull to keep moving. Secure whole zones to pry open the sealed reaches, win keys from bounties and derelicts, and secure <b style="color:#eaf2ff">four zones</b> to unseal the Blackstar Gate.</p>
          <p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#8fa3c4">In battle, cards draw from <b style="color:#eaf2ff">reactor power</b>; a deflector screen soaks hits before hull, and your <b style="color:#eaf2ff">WEAPONS</b>, <b style="color:#eaf2ff">REACTOR</b> and <b style="color:#eaf2ff">ENGINES</b> can each be crippled. Win by gutting hulls — or board and take them. The far zones field heavier ships and pay better salvage.</p>
          <div style=${"display:flex;gap:24px;flex-wrap:wrap;font-family:"+MONO+";font-size:13px;color:#8fa3c4;margin:6px 0 20px"}><span>HULL <b style="color:#ffffff;font-weight:500">64</b></span><span>CREW <b style="color:#ffffff;font-weight:500">8</b></span><span>SHIELD <b style="color:#ffffff;font-weight:500">22</b></span><span>REACTOR <b style="color:#ffffff;font-weight:500">3</b>/TURN</span><span>FUEL <b style="color:#ffffff;font-weight:500">5</b> CELLS</span></div>
          <button class="hf-btn" onClick=${function(){ self.closeBrief(); }} style="font-family:'Space Grotesk',sans-serif;font-weight:600;letter-spacing:.14em;font-size:16px;text-transform:uppercase;color:#03131c;background:linear-gradient(180deg,#63e2ff,#2fbfe8);border:1px solid #8deaff;border-radius:4px;padding:13px 30px;cursor:pointer;box-shadow:0 4px 0 #14506b">Plot the Course ▸</button>
        </div>
      </div>
    </div>`;
  };

  Game.prototype.renderReward = function (v) {
    var self=this;
    return html`
    <div style="position:absolute;inset:0;background:#000000d8;backdrop-filter:blur(3px);display:grid;place-items:center;z-index:50;padding:20px">
      <div class="hf-overlay-panel" style="max-width:700px;width:100%;border:1px solid #2c4066;border-radius:10px;background:linear-gradient(180deg,#101828,#070b14);box-shadow:0 24px 70px #000c;overflow:hidden">
        <div style="padding:18px 26px;border-bottom:1px solid #1b2a45">
          <div style=${"font-family:"+MONO+";font-size:12px;letter-spacing:.26em;color:#5f7396"}>SALVAGE · REFIT</div>
          <div style="font-weight:700;letter-spacing:.08em;font-size:29px;margin-top:2px;color:#ffffff">Ship Secured</div>
        </div>
        <div style="padding:20px 26px">
          <p style="margin:0 0 7px;font-size:15.5px;line-height:1.55;color:#8fa3c4">${v.rwHow}</p>
          <p style=${"margin:0 0 16px;font-family:"+MONO+";font-size:13px;color:#ffc266;letter-spacing:.1em"}>SALVAGE RECOVERED +${v.rwSalvTxt} ◈</p>
          <p style="margin:0 0 14px;font-size:15px;color:#8fa3c4">Pull one schematic from the wreck and wire it into your deck:</p>
          <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap">
            ${v.rwCards.map(function(c){
              return html`
              <div key=${c.uid} class="hf-reward-card" onClick=${c.click}
                onMouseEnter=${function(){ self.hoverEnter(c); }} onMouseLeave=${function(){ self.hoverLeave(); }}
                style="position:relative;width:176px;min-height:216px;border:1px solid #22345a;border-radius:8px;background:#0c1220;box-shadow:0 6px 18px #000a;display:flex;flex-direction:column;overflow:hidden">
                ${self.cardFace(c)}
              </div>`;
            })}
          </div>
          <button class="hf-ghost-btn" onClick=${function(){ self.skipReward(); }} style="display:block;margin:18px auto 0;background:none;border:1px solid #2c4066;color:#8fa3c4;font-family:'Space Grotesk',sans-serif;letter-spacing:.14em;font-size:13px;padding:9px 20px;border-radius:4px;cursor:pointer;text-transform:uppercase">Take nothing — press on</button>
        </div>
      </div>
    </div>`;
  };

  Game.prototype.renderAnomaly = function () {
    var self=this, n=this.state.evNode || {};
    return html`
    <div style="position:absolute;inset:0;background:#000000d8;backdrop-filter:blur(3px);display:grid;place-items:center;z-index:50;padding:20px">
      <div class="hf-overlay-panel" style="max-width:600px;width:100%;border:1px solid #2c4066;border-radius:10px;background:linear-gradient(180deg,#101828,#070b14);box-shadow:0 24px 70px #000c;overflow:hidden">
        <div style="padding:18px 26px;border-bottom:1px solid #1b2a45">
          <div style=${"font-family:"+MONO+";font-size:12px;letter-spacing:.26em;color:#7d92b5"}>ANOMALY CONTACT</div>
          <div style="font-weight:700;letter-spacing:.08em;font-size:29px;margin-top:2px;color:#ffffff">${n.label||"Unknown Contact"}</div>
        </div>
        <div style="padding:20px 26px">
          <p style="margin:0 0 18px;font-size:16px;line-height:1.55;color:#8fa3c4">${n.evd||n.desc||""}</p>
          ${n.key ? html`
          <div style="border:1px solid #5c4a26;border-radius:5px;background:#0d0b06;padding:10px 14px;margin:0 0 18px">
            <span style=${"font-family:"+MONO+";font-size:12px;letter-spacing:.14em;color:#ffc266"}>◈ RECOVERED: ${KEY_NAMES[n.key]}</span>
          </div>` : null}
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <button class="hf-btn" onClick=${function(){ self.evResolve("take"); }} style="font-family:'Space Grotesk',sans-serif;font-weight:600;letter-spacing:.1em;font-size:14px;text-transform:uppercase;color:#03131c;background:linear-gradient(180deg,#63e2ff,#2fbfe8);border:1px solid #8deaff;border-radius:4px;padding:12px 20px;cursor:pointer;box-shadow:0 4px 0 #14506b">Strip the wreck · +18 ◈</button>
            <button class="hf-ghost-btn" onClick=${function(){ self.evResolve("rescue"); }} style="font-family:'Space Grotesk',sans-serif;font-weight:600;letter-spacing:.1em;font-size:14px;text-transform:uppercase;color:#d6e2f5;background:none;border:1px solid #3a5580;border-radius:4px;padding:12px 20px;cursor:pointer">Search for survivors · +2 crew</button>
          </div>
        </div>
      </div>
    </div>`;
  };

  Game.prototype.renderEnd = function (v) {
    var self=this;
    return html`
    <div style="position:absolute;inset:0;background:#000000d8;backdrop-filter:blur(3px);display:grid;place-items:center;z-index:50;padding:20px">
      <div class="hf-overlay-panel" style="max-width:620px;width:100%;border:1px solid #2c4066;border-radius:10px;background:linear-gradient(180deg,#101828,#070b14);box-shadow:0 24px 70px #000c;overflow:hidden">
        <div style="padding:18px 26px;border-bottom:1px solid #1b2a45">
          <div style=${"font-family:"+MONO+";font-size:12px;letter-spacing:.26em;color:#5f7396"}>${v.endKick}</div>
          <div style="font-weight:700;letter-spacing:.08em;font-size:30px;margin-top:2px;color:#ffffff">${v.endTitle}</div>
        </div>
        <div style="padding:20px 26px">
          <p style="margin:0 0 20px;font-size:16px;line-height:1.55;color:#8fa3c4">${v.endBody}</p>
          <button class="hf-btn" onClick=${function(){ self.restart(); }} style="font-family:'Space Grotesk',sans-serif;font-weight:600;letter-spacing:.14em;font-size:16px;text-transform:uppercase;color:#03131c;background:linear-gradient(180deg,#63e2ff,#2fbfe8);border:1px solid #8deaff;border-radius:4px;padding:13px 30px;cursor:pointer;box-shadow:0 4px 0 #14506b">New Sortie ▸</button>
        </div>
      </div>
    </div>`;
  };

  // ========================= COMPUTED VIEW STATE ===========================
  // ---- sector map view state (node states, lanes, intel panel) ------------
  Game.prototype.computeMapVals = function () {
    var S=this.state, P=S.player, self=this;
    var dist=this.mapDist(), zsec=this.zonesSecured();
    var unlocked={}, secured={};
    ZONES.forEach(function(z){ unlocked[z.k]=self.zoneUnlocked(z); secured[z.k]=self.zoneSecured(z); });
    var m={};

    var takenCount=Object.keys(S.taken).length;
    m.takenCount=takenCount; m.totalCount=NODES.length;
    m.ctrlPct=Math.round(takenCount/NODES.length*100);
    m.ctrlNote = zsec>=GATE_ZONES_REQ ? "THE BLACKSTAR GATE IS UNSEALED — GOOD HUNTING"
      : "SECURE "+GATE_ZONES_REQ+" ZONES TO UNSEAL THE BLACKSTAR GATE ("+zsec+"/"+GATE_ZONES_REQ+")";
    m.hullTxt=Math.round(P.hull)+"/"+P.hullMax; m.hullPct=this.cl(P.hull/P.hullMax*100,0,100);
    m.crewTxt=P.crew+"/"+P.crewMax; m.deckTxt=S.deckKeys.length; m.salv=S.salvage;
    m.fuel=P.fuel; m.fuelMax=P.fuelMax;
    m.shipSrc=shipImg(PLAYER_SHIP, P.hull<P.hullMax*.5);

    m.zones=ZONES.map(function(z){
      var sub = secured[z.k] ? "SECURED"
        : !unlocked[z.k] ? "SEALED · "+(z.req.zones ? "SECURE "+z.req.zones+" ZONES" : "KEY REQUIRED")
        : z.req ? "UNLOCKED" : "OPEN";
      return { x:z.lx+"%", y:z.ly+"%", name:z.name, sub:sub, c:z.c };
    });

    var isEnemy=function(n){ return n.type==="fight"||n.type==="elite"||n.type==="bounty"||n.type==="boss"||n.type==="anomaly"; };
    var isAllied=function(n){ return n.type==="home"||n.type==="station"||n.type==="shipyard"||n.type==="repair"||n.type==="gate"; };
    m.nodes=NODES.map(function(n){
      var t=NODE_TY[n.type], cur=n.id===S.current, isSel=n.id===S.sel;
      var taken=!!S.taken[n.id], locked=!unlocked[n.z];
      var accessible=!cur && !locked && dist[n.id]!=null;
      var frontier=locked && EDGES.some(function(e){
        var other = e[0]===n.id ? e[1] : e[1]===n.id ? e[0] : null;
        return other!=null && (dist[other]!=null || other===S.current);
      });
      var hostile=isEnemy(n)&&!taken;
      return {
        id:n.id, x:n.x, y:n.y, sz:n.sz, glyph:t.g, label:n.label,
        disc:DISC[n.disc||n.type],
        ringCol: cur?"#ffffff": taken?"#7cf0c0": locked?"#243350": hostile?"#ff8aa0":"#4fd8ff",
        gc: locked?"#6e5560": t.c,
        lc: locked?"#6e5560":"#d6e2f5",
        glow: cur?"0 0 24px #4fd8ff55": taken?"0 0 16px #7cf0c044": locked?"none": hostile?"0 0 18px #ff547044":"0 0 18px #4fd8ff40",
        op: (locked&&!frontier)?0.75:1,
        // pulse gating uses display, not opacity — the keyframes animate opacity
        pulseDisp: accessible && (isAllied(n)||hostile) ? "block" : "none",
        pulseC: hostile?"#ff5470":"#ffffff",
        selOp: isSel?1:0,
        lockDisp: frontier?"flex":"none",
        tag: cur?"YOU ARE HERE": locked?"SEALED": taken?"": n.type==="shipyard"?"SHIPYARD": n.type==="station"?"STATION": n.type==="repair"?"REPAIR": n.type==="bounty"?"HIGH REWARD": n.type==="anomaly"?"ANOMALY":"",
        tagC: cur?"#4fd8ff": locked?"#ff5470aa": taken?"#7cf0c0":"#a9bcda",
        click:function(){ self.selectNode(n.id); },
        dbl: accessible ? function(){ if (!self._didPan) self.setCourse(n.id); } : undefined
      };
    });

    m.edges=EDGES.map(function(e){
      var a=NBYID[e[0]], b=NBYID[e[1]];
      var aL=!unlocked[a.z], bL=!unlocked[b.z];
      var col="#243350", op=.5;
      if (aL&&bL) { col="#3a2430"; op=.5; }
      else if (aL||bL) { col="#5c4a26"; op=.6; }
      else if (e[0]===S.current||e[1]===S.current) { col="#4fd8ff"; op=.8; }
      return { x1:a.x/100*WORLD.w, y1:a.y/100*WORLD.h, x2:b.x/100*WORLD.w, y2:b.y/100*WORLD.h, col:col, op:op };
    });

    var shipN=NBYID[S.current];
    m.shipX=shipN.x+"%"; m.shipY=shipN.y+"%";

    // intel panel for the selected (or current) system
    var sn=NBYID[S.sel]||shipN;
    var z=ZBYK[sn.z];
    var cur=sn.id===S.current, taken=!!S.taken[sn.id], locked=!unlocked[sn.z];
    var hops=dist[sn.id], reachable=!cur&&hops!=null&&!locked;
    var hostile=isEnemy(sn)&&!taken;
    var fShort=reachable?Math.max(0,hops-P.fuel):0, fLethal=fShort>0&&P.hull<=fShort*5;
    var lines=[];
    if (reachable) {
      lines.push({k:"ROUTE", v:hops+(hops===1?" JUMP":" JUMPS"), c:"#8deaff"});
      lines.push({k:"FUEL", v:hops+(hops===1?" CELL":" CELLS")+(fShort>0?" — SHORT "+fShort+" (−"+(fShort*5)+" HULL)":""), c:fShort>0?"#ff8aa0":"#ffc266"});
    }
    if (sn.type==="home") lines.push({k:"SERVICES", v:"REPAIR · ARMORY · CREW", c:"#7cf0c0"});
    if (sn.type==="station") lines.push({k:"SERVICES", v:"ARMORY · REPAIR · CREW", c:"#7cf0c0"});
    if (sn.type==="shipyard") { lines.push({k:"SERVICES", v:"SHIP UPGRADES · REPAIR", c:"#8deaff"}); lines.push({k:"STOCK", v:YARD_REFITS.length+" REFITS AVAILABLE", c:"#ffc266"}); }
    if (sn.type==="repair") lines.push({k:"SERVICES", v:"HULL +15 PER 10 ◈", c:"#7cf0c0"});
    var zm=(z.mult||1);
    if (sn.type==="fight"||sn.type==="elite"||sn.type==="bounty") {
      var t=this.threatLabel(sn);
      lines.push({k:"THREAT", v:taken?"NONE":t.v, c:taken?"#7d92b5":t.c});
    }
    if (sn.type==="anomaly") lines.push({k:"RISK", v:taken?"NONE":"UNKNOWN", c:taken?"#7d92b5":"#b48aff"});
    if (sn.type==="boss") lines.push({k:"THREAT", v:taken?"NONE":"FLAGSHIP — "+ENEMIES[sn.enemy].role, c:taken?"#7d92b5":"#ff5470"});
    if (sn.type==="gate") lines.push({k:"CONTROL", v:S.taken.verdict?"YOURS":"IRONWALL COMMAND", c:S.taken.verdict?"#7cf0c0":"#ff8aa0"});
    if (!taken) {
      var pay=function(lo,hi){ return Math.round(lo*zm)+"–"+Math.round(hi*zm)+" ◈"; };
      if (sn.type==="fight") lines.push({k:"REWARD", v:pay(20,30)+" + CARD", c:"#ffc266"});
      if (sn.type==="elite") lines.push({k:"REWARD", v:pay(36,46)+" + CARD", c:"#ffc266"});
      if (sn.type==="bounty") lines.push({k:"REWARD", v:pay(40,50)+(sn.key?" + "+KEY_NAMES[sn.key]:""), c:"#ffc266"});
      if (sn.type==="anomaly"&&sn.key) lines.push({k:"REWARD", v:KEY_NAMES[sn.key]+"?", c:"#ffc266"});
    }

    var status, statusCol;
    if (cur) { status="YOU ARE HERE"; statusCol="#4fd8ff"; }
    else if (locked) { status="SEALED"; statusCol="#ff5470"; }
    else if (taken) { status="UNDER YOUR CONTROL"; statusCol="#7cf0c0"; }
    else if (sn.type==="anomaly") { status="UNKNOWN SIGNATURE"; statusCol="#b48aff"; }
    else if (hostile) { status=sn.type==="bounty"?"TARGET TRACKED":"HOSTILE CONTACT"; statusCol=sn.type==="bounty"?"#ffc266":"#ff8aa0"; }
    else { status="DOCK AVAILABLE"; statusCol="#7cf0c0"; }

    var act="SET COURSE ▸", en=true, actClick=null;
    if (S.gliding) { act="UNDERWAY…"; en=false; }
    else if (cur) {
      if (sn.type==="shipyard") { act="ENTER SHIPYARD ▸"; actClick=function(){ self.dockCurrent(); }; }
      else if (sn.type==="home"||sn.type==="station"||sn.type==="repair") { act="DOCK ▸"; actClick=function(){ self.dockCurrent(); }; }
      else if (sn.type==="gate") {
        if (S.taken.verdict) { act="JUMP TO NEXT SECTOR ▸"; actClick=function(){ self.departSector(); }; }
        else { act="GATE BLOCKADED"; en=false; }
      }
      else { act="HOLDING POSITION"; en=false; }
    }
    else if (locked) { act="SEALED"; en=false; }
    else if (!reachable) { act="NO LANE"; en=false; }
    else if (fLethal) { act="RESERVES TOO LOW"; en=false; }
    else {
      act = fShort>0 ? "BURN RESERVES ▸" : hostile ? "ENGAGE ▸" : "SET COURSE ▸";
      actClick=function(){ self.setCourse(sn.id); };
    }

    m.d={
      kicker:TYPE_LABEL[sn.type]+" · "+z.name, name:sn.label, art:sn.label+" ART",
      status:status, statusCol:statusCol, desc:sn.desc, lines:lines,
      req:(locked&&z.req) ? (z.req.zones ? z.req.txt+" ("+zsec+"/"+z.req.zones+")" : z.req.txt)
        : (cur&&sn.type==="gate"&&!S.taken.verdict) ? "DESTROY THE IRON VERDICT" : null,
      act:act, en:en, actClick:actClick,
      btnCol:en?"#03131c":"#5f7396", btnBg:en?"linear-gradient(180deg,#63e2ff,#2fbfe8)":"#0a101c",
      btnBd:en?"#8deaff":"#22345a", btnSh:en?"0 4px 0 #14506b":"none"
    };
    return m;
  };

  // ---- shipyard view state ------------------------------------------------
  Game.prototype.computeYardVals = function () {
    var S=this.state, P=S.player, self=this, n=S.yard.node;
    var y={};
    y.zone=ZBYK[n.z].name;
    y.shipSrc=shipImg(PLAYER_SHIP, P.hull<P.hullMax*.5);
    y.title=n.label.indexOf("YARD")>=0 ? n.label : n.label+" SHIPYARD";
    y.salv=S.salvage;
    y.gossip=n.gossip||"";
    y.stats=[
      {k:"HULL", v:Math.round(P.hull)+"/"+P.hullMax},
      {k:"SHIELD CAP", v:String(P.shieldCap)},
      {k:"REACTOR", v:P.powerBase+" / TURN"},
      {k:"CREW", v:P.crew+"/"+P.crewMax},
      {k:"FUEL", v:P.fuel+"/"+P.fuelMax+" CELLS"}
    ];
    y.refits=YARD_REFITS.map(function(r){
      var got=!!P.ups[r.k], ok=!got&&S.salvage>=r.price;
      return {
        k:r.k, name:r.name, desc:r.desc, isNew:!!r.isNew,
        nameCol:got?"#eaf2ff": r.isNew?"#ffd9a0":"#eaf2ff",
        bd: got?"#1e4a38": r.isNew?"#5c4a26":"#1b2a45",
        bg: got?"#07140f": r.isNew?"#0d0b06":"#070b14",
        btn: got?"INSTALLED":"INSTALL · "+r.price+" ◈",
        btnCol: got?"#7cf0c0": ok?"#8deaff":"#5f7396",
        btnBd: got?"#1e4a38": ok?"#2c4066":"#22345a",
        cur: ok?"pointer":"default", op:(got||ok)?1:.5,
        click: ok?function(){ self.buyUp(r.k); }:undefined
      };
    });
    var bought=S.yardBought[n.id]||{};
    y.stock=(n.stock||[]).map(function(k){
      var c=LIB[k], price=PRICE[k]||16;
      var got=!!bought[k], ok=!got&&S.salvage>=price;
      return {
        key:k, name:c.name, sub:c.type.toUpperCase()+" · COST "+c.cost,
        btn: got?"IN DECK":price+" ◈",
        btnCol: got?"#7cf0c0": ok?"#8deaff":"#5f7396",
        btnBd: got?"#1e4a38": ok?"#2c4066":"#22345a",
        cur: ok?"pointer":"default", op:(got||ok)?1:.5,
        click: ok?function(){ self.buyYardCard(k, price); }:undefined
      };
    });
    return y;
  };

  Game.prototype.computeVals = function () {
    var S=this.state, P=S.player, B=S.battle; var self=this;
    var v={};
    v.isMap=S.screen==="map"; v.isBattle=S.screen==="battle"; v.isBase=S.screen==="base"; v.isYard=S.screen==="yard";
    v.screenTag = v.isMap?"":v.isBattle?"// ENGAGEMENT IN PROGRESS":v.isYard?"// SHIPYARD REFIT":"// STATION REFIT";
    v.hudRight = "◈ "+S.salvage+" SALVAGE · FUEL "+P.fuel+"/"+P.fuelMax+" · HULL "+Math.round(P.hull)+"/"+P.hullMax+" · CREW "+P.crew+"/"+P.crewMax+((v.isBattle&&B)?" · TURN "+B.turn:"");

    if (v.isMap) v.map=this.computeMapVals();
    if (v.isYard && S.yard) v.yd=this.computeYardVals();

    var hp=P.hull/P.hullMax*100;
    v.pHullTxt=Math.round(P.hull)+"/"+P.hullMax; v.pHullPct=this.cl(hp,0,100); v.pHullBg=this.hullBg(hp);
    v.pCrewTxt=P.crew+"/"+P.crewMax;

    // yard services / refit bay (shared by station + shipyard + repair dock)
    var rOk=S.salvage>=10&&P.hull<P.hullMax, cOk=S.salvage>=8&&P.crew<P.crewMax;
    v.repClick=rOk?function(){ self.repair(); }:undefined; v.repOp=rOk?1:.45; v.repCur=rOk?"pointer":"default";
    v.crClick=cOk?function(){ self.hire(); }:undefined; v.crOp=cOk?1:.45; v.crCur=cOk?"pointer":"default";

    var vw=window.innerWidth||1280, vh=window.innerHeight||800;
    if (B) {
      var e=B.enemy;
      // Fit the whole combat column (both subsystem rows + ships + shield arcs)
      // to the space between the top bar and the hand bar, so nothing clips or
      // hides behind the UI. colW/colH are the column's natural size; the height
      // budget is viewport minus the 58px top bar and the 190px hand bar (plus a
      // little breathing room). User zoom (wheel) and pan (middle-drag) ride on
      // top. Clamp keeps ships readable on small screens and sane on big ones.
      var colW=760, colH=900;
      var baseFit=this.cl(Math.min((vw-40)/colW,(vh-292)/colH),0.46,1.2);
      var zoom=baseFit*this.view.zoom;
      v.combatTransform="translate("+Math.round(this.view.panX)+"px, calc(-50% + "+Math.round(this.view.panY)+"px)) scale("+zoom.toFixed(3)+")";
      var sc=zoom;
      v.combatScale="scale("+sc.toFixed(3)+")";
      var pw=Math.floor(vw/2-380*baseFit-40);
      v.panelW=Math.max(0,Math.min(300,pw))+"px";
      v.sideBlock=pw>=150?"block":"none"; v.sideFlex=pw>=150?"flex":"none";
      var n=Math.max(1,B.hand.length); var mid=Math.max(200,vw-470); var mh=Math.min(5,(mid-n*176)/(2*n)); v.cardMh=Math.max(mh,-55).toFixed(1)+"px";
      v.pAnim=this.shipAnim(S.shakeP); v.eAnim=this.shipAnim(S.shakeE);
      v.pImg=shipImg(PLAYER_SHIP, P.hull<P.hullMax*.5); v.eImg=shipImg(e.img, e.hull<e.hullMax*.5);
      v.pSubs=this.subsView(P); v.eSubs=this.subsView(e);
      v.pShTxt=Math.round(P.shield)+"/"+P.shieldCap; v.pShPct=this.cl(P.shield/P.shieldCap*100,0,100);
      v.eShTxt=Math.round(e.shield)+"/"+e.shieldCap; v.eShPct=this.cl(e.shield/e.shieldCap*100,0,100);
      v.pBub=this.cl(P.shield/P.shieldCap*.6,0,.6); v.eBub=this.cl(e.shield/e.shieldCap*.6,0,.6);
      v.eName=e.name; v.eRole=e.role;
      var ehp=e.hull/e.hullMax*100;
      v.eHullTxt=Math.round(e.hull)+"/"+e.hullMax; v.eHullPct=this.cl(ehp,0,100); v.eHullBg=this.hullBg(ehp);
      v.eCrewTxt=e.crew+"/"+e.crewMax;
      var it=e.intent; v.inShow=!!it&&!B.over;
      if (it) {
        var shown=Math.round(it.value*this.wm(e.subs));
        if (it.type==="attack") { v.inBd="#ff5470"; v.inIco="🜂"; v.inTxt="INCOMING FIRE "+shown; v.inSub=it.sab?"targeting your subsystems":"hull / shield volley"; }
        else if (it.type==="shield") { v.inBd="#4fd8ff"; v.inIco="⛨"; v.inTxt="REINFORCING SHIELDS +"+it.value; v.inSub="hardening the deflector screen"; }
        else if (it.type==="board") { v.inBd="#ffc266"; v.inIco="☖"; v.inTxt="BOARDING — "+it.value+" CREW"; v.inSub="prepare to repel boarders"; }
        else { v.inBd="#7cf0c0"; v.inIco="✚"; v.inTxt="DAMAGE CONTROL"; v.inSub="patching hull and systems"; }
      }
      v.aiming=B.aiming||null;
      v.hand=B.hand.map(function(c){
        var ok=!B.busy&&!B.over&&!B.aiming&&c.cost<=P.power&&!(c.needCrew&&P.crew<c.needCrew);
        return Object.assign({}, c, { playable:ok, op:ok?1:.4, cur:ok?"pointer":"default", click:ok?function(){ self.playCard(c.uid); }:undefined });
      });
      v.handEmpty=B.hand.length===0;
      var pmax=Math.max(this.rp(),P.power); var pips=[];
      for (var i=0;i<pmax;i++) pips.push({ bg:i<P.power?"linear-gradient(180deg,#8deaff,#2fbfe8)":"#070b14", sh:i<P.power?"0 0 12px #4fd8ff77":"none" });
      v.pips=pips; v.powTxt=P.power+"/"+this.rp(); v.drawTxt=B.draw.length; v.discTxt=B.disc.length;
      v.logs=B.logs.slice(-(vh<680?3:9)).map(function(l){ return { k:l.k, text:l.text, color:l.color, bt:l.mark?"1px dashed #1b2a45":"0 none transparent", pt:l.mark?"5px":"0", mt:l.mark?"5px":"0" }; });
      v.floats=B.floats; v.beams=B.beams;
      v.plShow=!!B.played; if (B.played) v.played=B.played;
      v.endClick=function(){ self.endTurn(); };
      var lock=B.busy||B.over||B.aiming;
      v.endOp=lock?.45:1; v.endCur=lock?"default":"pointer"; v.endDisabled=!!lock;
    } else {
      v.aiming=null;
      v.pSubs=[]; v.eSubs=[]; v.hand=[]; v.pips=[]; v.logs=[]; v.floats=[]; v.beams=[]; v.inShow=false; v.plShow=false; v.handEmpty=false;
      v.combatTransform="translateY(-50%)";
    }

    if (S.base) {
      v.baTitle=S.base.node.label; v.baSalvTxt=S.salvage;
      v.baStock=S.base.stock.map(function(o,i){
        var ok=S.salvage>=o.price;
        return Object.assign({}, self.cardView(LIB[o.key]), { price:o.price, affordable:ok, op:ok?1:.45, cur:ok?"pointer":"default", click:ok?function(){ self.buyCard(i); }:undefined });
      });
      var sOk=S.salvage>=12&&S.deckKeys.length>6;
      v.deckCards=S.deckKeys.map(function(k,i){
        return { name:LIB[k].name, cost:LIB[k].cost, click:sOk?function(){ self.scrap(i); }:undefined, cur:sOk?"pointer":"default", op:sOk?1:.35 };
      });
      v.depClick=function(){ self.depart(); };
    } else { v.baStock=[]; v.deckCards=[]; }

    v.brShow=S.overlay==="brief";
    v.rwShow=S.overlay==="reward";
    if (S.reward) {
      v.rwHow=S.reward.how; v.rwSalvTxt=S.reward.salv;
      v.rwCards=S.reward.cards.map(function(c){ return Object.assign({}, c, { click:function(){ self.claimReward(c.key); } }); });
    } else v.rwCards=[];
    v.evShow=S.overlay==="ev";
    v.endShow=S.overlay==="end";
    if (S.end) { v.endKick=S.end.kick; v.endTitle=S.end.title; v.endBody=S.end.body; }
    return v;
  };

  // card view for shop entries (from a library template, needs a key + uid)
  Game.prototype.cardView = function (c) {
    return Object.assign({ uid: "shop-"+c.key }, c);
  };

  render(h(Game), document.getElementById("app"));
})();
