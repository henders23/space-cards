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
assert.equal(keys.length, 53, "The runtime library must contain exactly 53 cards");
for (const key of keys) {
  assert.ok(game.LIB[key].summary, `${key} needs a compact summary`);
  assert.ok(fs.existsSync(path.join(__dirname, "..", "assets", "cards", `${key}.png`)), `${key} needs runtime art`);
  assert.ok(fs.existsSync(path.join(__dirname, "..", "assets", "cards", "full", `${key}.png`)), `${key} needs a full card face`);
}
assert.ok(fs.existsSync(path.join(__dirname, "..", "assets", "audio", "boarding_action.wav")),
  "boarding actions need their dedicated sound");

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

for (const key of ["fighter-wing", "bomber-wing", "interceptors"]) {
  assert.equal(game.hasArt(game.LIB[key]), true, `${key} should use its full card asset`);
}

console.log(`Verified ${keys.length} integrated cards, strike-craft assets/tokens, and boarding FX.`);
