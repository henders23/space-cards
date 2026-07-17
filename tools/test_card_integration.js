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

require(path.join(__dirname, "..", "game.js"));
const Game = renderedRoot.type;
const game = new Game();
game.forceUpdate = function () {};
game.addFloat = function () {};
game.log = function () {};
game.reportDamage = function () {};

const keys = Object.keys(game.LIB);
assert.equal(keys.length, 50, "The runtime library must contain exactly 50 cards");
for (const key of keys) {
  assert.ok(game.LIB[key].summary, `${key} needs a compact summary`);
  assert.ok(fs.existsSync(path.join(__dirname, "..", "assets", "cards", `${key}.png`)), `${key} needs runtime art`);
  assert.ok(fs.existsSync(path.join(__dirname, "..", "assets", "cards", "full", `${key}.png`)), `${key} needs a full card face`);
}

function resetBattle() {
  game.state.player = {
    hullMax: 64, hull: 64, crew: 8, crewMax: 8, powerBase: 3, shieldCap: 22, shield: 0,
    subs: { weapons: 100, reactor: 50, engines: 50 }, ups: {}, power: 3
  };
  game.state.battle = {
    enemy: { hullMax: 60, hull: 60, shieldCap: 20, shield: 10, crew: 3, crewMax: 7,
      subs: { weapons: 100, reactor: 100, engines: 100 } },
    lock: 0, armour: 0, reflect: 0, blind: 0, overwatch: 0, flank: 0,
    sealCrew: false, nextPower: 0, nextPowerPenalty: 0, mines: [],
    draw: [], hand: [], disc: [], logs: [], floats: [], beams: []
  };
}

resetBattle();
game.resolveCard(game.LIB["plasma-lance"]);
assert.equal(game.state.battle.enemy.shield, 0, "Plasma Lance should strip then damage shields");
assert.equal(game.state.battle.enemy.hull, 56, "Plasma Lance overflow should reach hull");

resetBattle();
game.state.player.subs = { weapons: 20, reactor: 30, engines: 40 };
game.resolveCard(game.LIB["nanite-swarm"]);
assert.deepEqual(game.state.player.subs, { weapons: 32, reactor: 42, engines: 52 });

resetBattle();
game.resolveCard(game.LIB["layered-plating"]);
game.dealDamage("p", 10, true);
assert.equal(game.state.player.hull, 60, "Armour should absorb six hull damage");

resetBattle();
game.resolveCard(game.LIB["aux-battery"]);
assert.equal(game.state.battle.nextPower, 2, "Auxiliary Battery should queue next-turn power");

resetBattle();
game.resolveCard(game.LIB["command-seizure"]);
assert.equal(game.state.battle.enemy.crew, 0, "Command Seizure should capture low-crew enemies");

resetBattle();
game.resolveCard(game.LIB["mine-layer"]);
assert.deepEqual(game.state.battle.mines, [12], "Mine Layer should queue delayed damage");

console.log(`Verified ${keys.length} integrated cards and representative mechanics.`);
