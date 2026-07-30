"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let renderedRoot = null;
function Component() {}
Component.prototype = {};
global.preact = {
  Component,
  h(type, props) { return { type, props }; },
  render(root) { renderedRoot = root; }
};
global.htm = { bind() { return function template() { return null; }; } };
global.document = { getElementById() { return {}; } };
global.window = { innerWidth: 1280, innerHeight: 800 };
const storage = new Map();
global.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); }
};

require(path.join(__dirname, "..", "game.js"));
const Game = renderedRoot.type;
const game = new Game();
game.forceUpdate = function () {};
game.addFloat = function () {};
game.log = function () {};
game.reportDamage = function () {};

const keys = Object.keys(game.LIB);
assert.equal(keys.length, 53, "The runtime library must contain exactly 53 cards");
for (const key of keys) {
  assert.ok(game.LIB[key].summary, `${key} needs a compact summary`);
  assert.ok(fs.existsSync(path.join(__dirname, "..", "assets", "cards", `${key}.png`)), `${key} needs runtime art`);
  assert.ok(fs.existsSync(path.join(__dirname, "..", "assets", "cards", "full", `${key}.png`)), `${key} needs a full card face`);
}
assert.ok(fs.existsSync(path.join(__dirname, "..", "assets", "audio", "boarding_action.wav")),
  "boarding actions need their dedicated sound");
assert.ok(fs.existsSync(path.join(__dirname, "..", "assets", "audio", "ui_click.wav")),
  "page navigation needs its dedicated click sound");
for (const background of ["title-defeat.webp", "map-starfield.webp"]) {
  assert.ok(fs.existsSync(path.join(__dirname, "..", "assets", "backgrounds", background)),
    `${background} must be packaged with the game`);
}
for (const art of ["terrestrial", "barren", "ice", "volcanic", "gas-giant", "station", "shipyard", "anomaly"]) {
  assert.ok(fs.existsSync(path.join(__dirname, "..", "assets", "systems", `${art}.webp`)),
    `${art} needs reusable system intel art`);
}
const gameSource = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
assert.ok(!gameSource.includes("—"), "game copy must not contain em dashes");
assert.ok(gameSource.includes("var WORLD = { w: 3400, h: 2100 }"),
  "the galaxy chart must use the expanded scrollable world");
assert.ok(gameSource.includes("class=\"hf-target-ring\"") && gameSource.includes("class=\"hf-nav-arrow\""),
  "the map must expose a gold target ring and direction arrow");
assert.ok(!gameSource.includes('["▤ CODEX","codex"]'),
  "the bottom map toolbar must not contain a Codex button");
for (const feature of ["shieldImpactPoint", "spawnShieldRipple", "hf-hitstop", "toggleHDAssets",
  "audioPanForPoint", "duckMusic", "recallStrikeCraft", "queueAutosave", "resumeAutosave",
  "manualSave", "setEngineVolume", "mapRouteTo", "renderCombatTutorial",
  "renderCombatHistory", "hf-tactical-label"]) {
  assert.ok(gameSource.includes(feature), `${feature} must be wired into the runtime`);
}
for (const anomaly of ["glassreef", "deadrelay", "echovault"]) {
  assert.ok(gameSource.includes(`id:"${anomaly}"`), `${anomaly} must add a new anomaly encounter`);
}
for (const ship of ["02", "03", "04", "06", "08", "09", "12", "13", "14", "15"]) {
  for (const damaged of ["", "-damaged"]) {
    assert.ok(fs.existsSync(path.join(__dirname, "..", "assets", "ships", "hd", `ship-${ship}${damaged}.webp`)),
      `ship-${ship}${damaged} needs a 2x battle render`);
  }
}

game.view.zoom = 0.55;
const distantEngineGain = game.engineGainForZoom();
game.view.zoom = 3.6;
const closeEngineGain = game.engineGainForZoom();
assert.ok(distantEngineGain > 0 && closeEngineGain > distantEngineGain,
  "engine ambience should remain quiet but rise as the battle camera zooms in");
game.view.zoom = 1;
game.setEngineVolume(0.31);
assert.equal(storage.get("hf_engine_volume"), "0.31",
  "engine ambience must persist independently from music and SFX");

game.setRunSeed("VERGE-TEST");
const seededA = [game.rand(), game.rand(), game.ri(1, 100)];
game.setRunSeed("VERGE-TEST");
const seededB = [game.rand(), game.rand(), game.ri(1, 100)];
assert.deepEqual(seededA, seededB, "the same run seed must reproduce the RNG sequence");

game.enemyImgEls = [{ getBoundingClientRect() {
  return { left: 300, right: 600, top: 120, bottom: 260, width: 300, height: 140 };
} }];
const barrierHit = game.shieldImpactPoint("e", 0, { x: 520, y: 180 });
assert.equal(barrierHit.y, 284, "enemy-bound projectiles must terminate below the hull on its shield barrier");
assert.equal(barrierHit.x, 520, "shield impacts should remain localized near the aimed horizontal point");

function resetBattle() {
  const ship = {
    id: "test-flag", name: "Test Flagship", hullMax: 64, hull: 64, crew: 8, crewMax: 8,
    powerBase: 3, shieldCap: 22, shield: 0, hangarCap: 3,
    subs: { weapons: 100, reactor: 50, engines: 50 }, ups: {}, power: 3
  };
  const player = {
    ship, lost: false, draw: [], hand: [], disc: [],
    fx: { lock: 0, brace: false, evade: false, armour: 0, reflect: 0, overwatch: 0,
      flank: 0, sealCrew: false, blind: 0, nextPower: 0, nextPowerPenalty: 0 }
  };
  const enemy = {
    name: "Test Enemy", hullMax: 60, hull: 60, shieldCap: 20, shield: 10,
    crew: 3, crewMax: 7, alive: true, struck: false, focus: null, mines: [],
    subs: { weapons: 100, reactor: 100, engines: 100 }
  };
  game.state.player = ship;
  game.state.fleet = [ship];
  game.state.battle = {
    pShips: [player], eShips: [enemy], tokens: [], active: 0,
    logs: [], floats: [], beams: [], busy: false, over: false
  };
  return { player, enemy };
}

let battle = resetBattle();
game.resolveCard(game.LIB["plasma-lance"], battle.player);
assert.equal(battle.enemy.shield, 0, "Plasma Lance should strip then damage shields");
assert.equal(battle.enemy.hull, 56, "Plasma Lance overflow should reach hull");

battle = resetBattle();
battle.player.ship.subs = { weapons: 20, reactor: 30, engines: 40 };
game.resolveCard(game.LIB["nanite-swarm"], battle.player);
assert.deepEqual(battle.player.ship.subs, { weapons: 32, reactor: 42, engines: 52 });

battle = resetBattle();
game.resolveCard(game.LIB["layered-plating"], battle.player);
game.dealDamage("p", 0, 10, true);
assert.equal(battle.player.ship.hull, 60, "Armour should absorb six hull damage");

battle = resetBattle();
game.resolveCard(game.LIB["aux-battery"], battle.player);
assert.equal(battle.player.fx.nextPower, 2, "Auxiliary Battery should queue next-turn power");

battle = resetBattle();
let boardingFx = 0;
game.spawnBoardingAction = function () { boardingFx++; };
game.resolveCard(game.LIB["command-seizure"], battle.player);
assert.equal(battle.enemy.crew, 0, "Command Seizure should capture low-crew enemies");
assert.equal(boardingFx, 1, "Boarding cards should trigger the boarding-action visual and sound path");

battle = resetBattle();
game.resolveCard(game.LIB["mine-layer"], battle.player);
assert.deepEqual(battle.enemy.mines, [12], "Mine Layer should queue delayed damage");

battle = resetBattle();
game.resolveCard(game.LIB["fighter-wing"], battle.player);
assert.equal(game.state.battle.tokens.length, 2, "Fighter Wing should launch two persistent board tokens");
assert.ok(game.state.battle.tokens.every((token) => token.side === "p" && token.kind === "fighter"),
  "launched fighters should live in the player battle-space token row");
game.state.battle.recallUsed = false;
game.recallStrikeCraft();
assert.ok(game.state.battle.tokens.every((token) => token.recalled && token.rearm === 1),
  "recall should return every friendly craft to its bay for one rearm cycle");
assert.ok(game.state.battle.tokens.every((token) => token.hp === token.hpMax),
  "recalled strike craft should be repaired before redeployment");

for (const key of ["fighter-wing", "bomber-wing", "interceptors"]) {
  assert.equal(game.hasArt(game.LIB[key]), true, `${key} should use its full card asset`);
}

game.state.screen = "map";
game.state.seed = "VERGE-TEST";
assert.deepEqual(game.mapRouteTo("k9"), ["haven", "k9"],
  "route previews must expose the actual lane path to the selected system");
game.saveRun();
const autosave = JSON.parse(storage.get("hf_autosave_v1"));
assert.equal(autosave.version, 1, "autosave format should be versioned");
assert.equal(autosave.state.seed, "VERGE-TEST", "autosave must retain the visible run seed");
assert.ok(Number.isInteger(autosave.state.rngState), "autosave must retain the deterministic RNG position");

game.state.evNode = { id: "echovault" };
game.state.salvage = 0;
game.state.player.hull = 40;
game.evResolve("breach");
assert.equal(game.state.salvage, 38, "high-risk anomaly choices should grant their stated salvage");
assert.equal(game.state.player.hull, 30, "high-risk anomaly choices should apply their stated hull cost");
assert.equal(game.state.taken.echovault, true, "resolved anomaly encounters must secure their map system");

game.state.seen = {};
game.state.tutorial = { step: 0 };
for (let i = 0; i < 4; i++) game.advanceCombatTutorial();
assert.equal(game.state.tutorial, null, "the first-battle tutorial must complete after four concise steps");
assert.equal(game.state.seen.combatTutorial, true, "completed combat guidance should not repeat");

console.log(`Verified ${keys.length} cards, shield geometry, audiovisual settings, seeded autosave, map guidance, strike-craft recall, boarding FX, and engine ambience.`);
