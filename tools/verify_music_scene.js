"use strict";
// Verifies the background-music scene logic: ambient theme outside battle,
// combat track during battle, correct response to the mute toggle, and that
// the combat track restarts at each battle. Uses the same stubbing style as
// test_card_integration.js.
const assert = require("node:assert");
const path = require("node:path");

let renderedRoot = null;
function Component() {}
Component.prototype = {};
global.preact = { Component, h(type, props) { return { type, props }; }, render(root) { renderedRoot = root; } };
global.htm = { bind() { return function template() { return null; }; } };
global.document = { getElementById() { return {}; } };

// Record audio behaviour per instance.
const tracks = {};
global.Audio = function (src) {
  const name = path.basename(src);
  const t = { src, name, playing: false, currentTime: 0, loop: false, volume: 1, preload: "",
    play() { this.playing = true; return { catch() {} }; },
    pause() { this.playing = false; } };
  tracks[name] = t;
  return t;
};
const listeners = {};
global.window = { innerWidth: 1280, innerHeight: 800,
  addEventListener(k, fn) { (listeners[k] = listeners[k] || []).push(fn); },
  removeEventListener() {} };
global.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; } };

require(path.join(__dirname, "..", "game.js"));
const Game = renderedRoot.type;
const game = new Game();
game.forceUpdate = function () {};
game.setState = function (s) { Object.assign(game.state, s); };

const ambient = () => tracks["echoes_of_the_void.mp3"];
const combat = () => tracks["combat_music.mp3"];

// Mount: both tracks created, ambient scene active and playing.
game.componentDidMount();
assert.ok(ambient() && combat(), "both music tracks are created");
assert.equal(game._scene, "ambient", "starts in the ambient scene");
assert.ok(ambient().playing && !combat().playing, "ambient plays, combat silent at mount");
assert.equal(combat().loop, true, "combat track loops");

// Enter combat: combat plays from the top, ambient pauses.
combat().currentTime = 42;
game.setMusicScene("combat");
assert.equal(game._scene, "combat");
assert.ok(combat().playing && !ambient().playing, "combat plays, ambient paused in battle");
assert.equal(combat().currentTime, 0, "combat restarts at each battle");

// Mute during combat: everything stops but scene is remembered.
game.toggleMusic();
assert.ok(!combat().playing && !ambient().playing, "mute pauses both tracks");
assert.equal(game._scene, "combat", "scene remembered while muted");

// Unmute during combat: combat resumes (not ambient).
game.toggleMusic();
assert.ok(combat().playing && !ambient().playing, "unmute resumes the combat track");

// Leave combat: ambient resumes, combat stops.
game.setMusicScene("ambient");
assert.ok(ambient().playing && !combat().playing, "ambient resumes after battle");

// startBattle should flip the scene to combat via the real game flow.
// node.enemy is an index into the ENEMIES table (0 = first enemy).
game.setMusicScene("ambient");
game.config.difficulty = "standard";
game.startBattle({ id: "n1", type: "fight", enemy: 0 });
assert.equal(game._scene, "combat", "startBattle switches to combat music");
assert.ok(combat().playing && !ambient().playing, "combat track audible during battle");

// finishBattle should return to ambient.
game.finishBattle();
assert.equal(game._scene, "ambient", "finishBattle returns to ambient music");
assert.ok(ambient().playing && !combat().playing, "ambient track audible after battle");

console.log("Music-scene logic verified: ambient ⇄ combat, mute toggle, and restart-per-battle.");
