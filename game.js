/* ============================================================================
 * HOLLOW FLEET
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
  var PRICE = {railgun:26,torpedo:30,broadside:22,missile:20,capacitor:18,dcontrol:20,boarding:20,breach:26,lock:14,evasive:14,flak:12,angle:12,scavenge:14,reroute:14,brace:12,patch:10};
  var SHOP = ["railgun","torpedo","broadside","missile","capacitor","dcontrol","boarding","breach","lock","evasive","flak","angle","scavenge","reroute"];
  var REWARDS = ["railgun","missile","capacitor","dcontrol","boarding","breach","lock","evasive","flak","broadside","reroute","scavenge","brace","patch","angle"];
  var ENEMIES = [
    {name:"RSV Carrion Jackal",role:"CORSAIR RAIDER",hull:44,shieldCap:12,regen:3,crew:5,atkLo:5,atkHi:9,sab:.15,boardN:2,boardCh:.15,shieldAmt:8,rep:0},
    {name:"PCS Ledger's Edge",role:"ENFORCEMENT FRIGATE",hull:60,shieldCap:16,regen:4,crew:7,atkLo:8,atkHi:12,sab:.25,boardN:2,boardCh:.2,shieldAmt:10,rep:.15},
    {name:"HMS Iron Verdict",role:"DREADNOUGHT · FLAGSHIP",hull:82,shieldCap:22,regen:4,crew:10,atkLo:11,atkHi:15,sab:.28,boardN:3,boardCh:.2,shieldAmt:13,rep:.18}
  ];
  var NODES = [
    {id:"start",x:6,y:52,type:"start",label:"FLEET DRYDOCK"},
    {id:"a1",x:22,y:26,type:"fight",enemy:0,label:"PICKET LINE"},
    {id:"a2",x:22,y:74,type:"fight",enemy:0,label:"DEBRIS FIELD"},
    {id:"b1",x:40,y:14,type:"elite",enemy:0,label:"CORSAIR AMBUSH"},
    {id:"b2",x:40,y:50,type:"base",label:"WAYPOINT STATION K-9"},
    {id:"b3",x:40,y:84,type:"fight",enemy:1,label:"CONVOY RAID"},
    {id:"c1",x:60,y:28,type:"anomaly",label:"DERELICT HULK"},
    {id:"c2",x:60,y:70,type:"fight",enemy:1,label:"MINEFIELD RUN"},
    {id:"d1",x:78,y:20,type:"base",label:"LAST LIGHT DEPOT"},
    {id:"d2",x:78,y:64,type:"elite",enemy:1,label:"ENFORCER BLOCKADE"},
    {id:"boss",x:93,y:44,type:"boss",enemy:2,label:"THE IRON VERDICT"}
  ];
  var EDGES = [["start","a1"],["start","a2"],["a1","b1"],["a1","b2"],["a2","b2"],["a2","b3"],["b1","c1"],["b2","c1"],["b2","c2"],["b3","c2"],["c1","d1"],["c1","d2"],["c2","d1"],["c2","d2"],["d1","boss"],["d2","boss"]];
  var UPS = [
    {k:"plating",name:"Reinforced Plating",desc:"+14 max hull, applied immediately",price:40},
    {k:"emitters",name:"Shield Emitters",desc:"+8 shield capacity",price:35},
    {k:"reactor",name:"Reactor Coils",desc:"+1 reactor power every turn",price:50}
  ];
  var DIFFS = {
    standard:{mult:1,  name:"Standard", blurb:"A fair fight. The Verge as intended."},
    hard:    {mult:1.2,name:"Hard",     blurb:"Enemy hull & fire +20%. Bring a plan."},
    brutal:  {mult:1.45,name:"Brutal",  blurb:"Enemy hull & fire +45%. Few return."}
  };

  var _uid = 0, _fid = 0;

  Game.prototype.LIB = LIB;

  // ---- lifecycle ----------------------------------------------------------
  Game.prototype.componentDidMount = function () {
    var self = this;
    this._onR = function () { self.forceUpdate(); };
    window.addEventListener("resize", this._onR);
  };
  Game.prototype.componentWillUnmount = function () {
    window.removeEventListener("resize", this._onR);
  };

  // ---- a fresh run (starts on the title screen) ---------------------------
  Game.prototype.freshRun = function () {
    return {
      screen: "title", overlay: null,
      salvage: (this.config && this.config.startingSalvage != null) ? this.config.startingSalvage : 40,
      current: "start", cleared: { start: true },
      player: { hullMax:64, hull:64, crew:8, crewMax:8, powerBase:3, shieldCap:22, shield:0,
                subs:{ weapons:100, reactor:100, engines:100 }, ups:{} },
      deckKeys: ["laser","laser","laser","laser","divert","divert","divert","patch","missile","overcharge"],
      battle:null, base:null, end:null, reward:null, shakeP:0, shakeE:0
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
    var abs=0, toHull=amt;
    if (!pierce && t.shield>0) { abs=Math.min(t.shield,amt); t.shield-=abs; toHull=amt-abs; }
    t.hull = this.cl(t.hull-toHull,0,t.hullMax);
    this.addBeam();
    if (toHull>0) this.addFloat(side,"-"+toHull,"#ff8aa0");
    else if (abs>0) this.addFloat(side,"-"+abs+" SH","#6fd8ff");
    if (side==="e") S.shakeE++; else S.shakeP++;
    return { toHull:toHull, abs:abs };
  };

  // ---- battle setup / turn structure -------------------------------------
  Game.prototype.startBattle = function (node) {
    var S=this.state, d=ENEMIES[node.enemy], m=this.diffMult()*(node.type==="elite"?1.3:1);
    S.battle = {
      node:node, turn:1, busy:false, over:false, lock:0, brace:false, evade:false,
      enemy:{ name:d.name, role:d.role, hullMax:Math.round(d.hull*m), hull:Math.round(d.hull*m),
        shieldCap:d.shieldCap, shield:0, regen:d.regen, crew:d.crew, crewMax:d.crew,
        atkLo:Math.round(d.atkLo*m), atkHi:Math.round(d.atkHi*m), sab:d.sab, boardN:d.boardN,
        boardCh:d.boardCh, shieldAmt:d.shieldAmt, rep:d.rep,
        subs:{ weapons:100, reactor:100, engines:100 }, intent:null },
      draw:this.sh(S.deckKeys.map(this.mk.bind(this))), hand:[], disc:[], logs:[], floats:[], beams:[], played:null
    };
    S.player.shield=0; S.screen="battle"; S.overlay=null;
    this.chooseIntent();
    this.log("#5a6d8f", d.name+" closes to weapons range.", true);
    this.startPlayerTurn(); this.forceUpdate();
  };
  Game.prototype.drawCards = function (n) {
    var B=this.state.battle;
    for (var i=0;i<n;i++){
      if (!B.draw.length){ if (!B.disc.length) break; B.draw=this.sh(B.disc); B.disc=[]; this.log("#b3c4de","Deck cycled — discard reshuffled."); }
      B.hand.push(B.draw.pop());
    }
  };
  Game.prototype.startPlayerTurn = function () {
    var S=this.state, B=S.battle, p=S.player;
    var reg = Math.round(3*p.subs.engines/100);
    if (reg>0) p.shield=this.cl(p.shield+reg,0,p.shieldCap);
    p.power=this.rp(); B.lock=0; B.brace=false; B.evade=false;
    while (B.hand.length<5 && (B.draw.length||B.disc.length)) this.drawCards(1);
  };
  Game.prototype.endTurn = function () {
    var B=this.state.battle; if (!B||B.busy||B.over) return;
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
        if (B.brace) { d=Math.ceil(d/2); this.log("#9fdcff","Brace cuts the hit in half."); }
        var r=this.dealDamage("p",d,false);
        this.log("#ff8aa0","Fire rakes your ship — "+(r.abs?r.abs+" to shields, ":"")+r.toHull+" to hull.");
        if (it.sab) { var nm=this.pk(["weapons","reactor","engines"]); p.subs[nm]=this.cl(p.subs[nm]-it.sab,0,100); this.log("#ff8aa0","Their gunners smash your "+nm.toUpperCase()+" (-"+it.sab+")."); }
      }
    } else if (it.type==="shield") { e.shield=this.cl(e.shield+it.value,0,e.shieldCap); this.log("#ff8aa0",e.name+" reinforces its shields (+"+it.value+")."); }
    else if (it.type==="board") { p.crew=this.cl(p.crew-it.value,0,p.crewMax); var nm2=this.pk(["weapons","reactor","engines"]); p.subs[nm2]=this.cl(p.subs[nm2]-10,0,100); S.shakeP++; this.log("#ff8aa0","Boarders storm your decks — "+it.value+" crew lost, "+nm2.toUpperCase()+" sabotaged."); }
    else if (it.type==="repair") { e.hull=this.cl(e.hull+it.value,0,e.hullMax); var w=this.worstSub(e.subs); e.subs[w]=this.cl(e.subs[w]+25,0,100); this.log("#ff8aa0",e.name+" runs damage control (+"+it.value+" hull)."); }
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
    var i=-1; for (var j=0;j<B.hand.length;j++){ if (B.hand[j].uid===uid){ i=j; break; } }
    if (i<0) return;
    var c=B.hand[i];
    if (c.cost>S.player.power) return;
    if (c.needCrew && S.player.crew<c.needCrew) { this.log("#b3c4de","Not enough crew to man "+c.name+"."); this.forceUpdate(); return; }
    S.player.power-=c.cost; B.hand.splice(i,1); B.disc.push(c);
    B.played=c; var u=c.uid; var self=this;
    setTimeout(function(){ var b=self.state.battle; if (b&&b.played&&b.played.uid===u){ b.played=null; self.forceUpdate(); } },950);
    this.resolveCard(c); this.forceUpdate(); this.checkEnd();
  };
  Game.prototype.resolveCard = function (c) {
    var S=this.state, B=S.battle, p=S.player, e=B.enemy;
    if (c.dmg!=null) {
      var hits=c.hits||1, tot=0, absTot=0;
      for (var i=0;i<hits;i++){
        var d=c.dmg+B.lock; B.lock=0;
        if (c.bonusNoShield && e.shield<=0) d+=c.bonusNoShield;
        d=Math.round(d*this.wm(p.subs));
        var r=this.dealDamage("e",d,!!c.pierce); tot+=r.toHull; absTot+=r.abs;
      }
      this.log("#9fdcff", c.name+" — "+(c.pierce?tot+" straight to hull.":(absTot?absTot+" to shields, "+tot+" to hull.":tot+" to hull.")));
      if (c.sab) { e.subs.reactor=this.cl(e.subs.reactor-c.sab,0,100); this.log("#9fdcff","Slug guts their REACTOR (-"+c.sab+")."); }
    }
    if (c.shield) { p.shield=this.cl(p.shield+c.shield,0,p.shieldCap); this.log("#9fdcff",c.name+" — +"+c.shield+" shields."); }
    if (c.brace) B.brace=true;
    if (c.repSub) { var w=this.worstSub(p.subs); p.subs[w]=this.cl(p.subs[w]+c.repSub,0,100); this.log("#9fdcff","Damage control restores "+w.toUpperCase()+" (+"+c.repSub+")."); }
    if (c.heal) { p.hull=this.cl(p.hull+c.heal,0,p.hullMax); this.log("#9fdcff","Hull sealed +"+c.heal+"."); }
    if (c.gainP) { p.power+=c.gainP; this.log("#9fdcff",c.name+" — +"+c.gainP+" power."); }
    if (c.selfSub) { p.subs.reactor=this.cl(p.subs.reactor-c.selfSub,0,100); this.log("#b3c4de","Reactor strained (-"+c.selfSub+")."); }
    if (c.draw) { this.drawCards(c.draw); this.log("#9fdcff","Drew "+c.draw+"."); }
    if (c.lock) { B.lock+=c.lock; this.log("#9fdcff","Target lock — next weapon +"+c.lock+"."); }
    if (c.evade) { B.evade=true; this.log("#9fdcff","Evasive burn armed."); }
    if (c.eCrew) {
      e.crew=this.cl(e.crew-c.eCrew,0,e.crewMax); p.crew=this.cl(p.crew-(c.sCrew||0),0,p.crewMax);
      if (c.sabRand) { var nm=this.pk(["weapons","reactor","engines"]); e.subs[nm]=this.cl(e.subs[nm]-c.sabRand,0,100); }
      this.log("#c4d2ea", c.name+" — enemy crew -"+c.eCrew+", yours -"+(c.sCrew||0)+".");
    }
  };

  // ---- win / loss ---------------------------------------------------------
  Game.prototype.checkEnd = function () {
    var S=this.state, B=S.battle; if (!B) return true; if (B.over) return true;
    var p=S.player, e=B.enemy; var self=this;
    if (e.hull<=0 || e.crew<=0) {
      B.over=true;
      var how = e.hull<=0 ? e.name+" breaks apart under your guns." : "Your boarders seize the bridge — "+e.name+" struck and captured.";
      this.forceUpdate(); setTimeout(function(){ self.victory(how); },700); return true;
    }
    if (p.hull<=0 || p.crew<=0) {
      B.over=true;
      var why = p.hull<=0 ? "Hull integrity gone. ISV Hollow Verdict is lost with all hands." : "Boarders overrun your decks. Your ship is taken.";
      this.forceUpdate(); setTimeout(function(){ S.end={kick:"ENGAGEMENT LOST",title:"SHIP LOST",body:why}; S.overlay="end"; self.forceUpdate(); },700); return true;
    }
    return false;
  };
  Game.prototype.victory = function (how) {
    var S=this.state, B=S.battle; if (!B) return; var node=B.node;
    if (node.type==="boss") {
      S.end={ kick:"CORRIDOR CLEARED", title:"THE GATE IS OPEN",
        body:how+" The Hollow Verge is broken and the jump gate yawns ahead. You run it — hull scarred, crew thinned, but yours." };
      S.overlay="end"; this.forceUpdate(); return;
    }
    var salv = node.type==="elite" ? this.ri(36,46) : this.ri(20,30); S.salvage+=salv;
    S.reward={ how:how, salv:salv, cards:this.sh(REWARDS.slice()).slice(0,3).map(this.mk.bind(this)) };
    S.overlay="reward"; this.forceUpdate();
  };
  Game.prototype.claimReward = function (key) { this.state.deckKeys.push(key); this.finishBattle(); };
  Game.prototype.skipReward = function () { this.finishBattle(); };
  Game.prototype.finishBattle = function () {
    var S=this.state, p=S.player, node=S.battle.node;
    p.hull=this.cl(p.hull+Math.round(p.hullMax*.15),0,p.hullMax);
    p.crew=this.cl(p.crew+1,0,p.crewMax);
    for (var k in p.subs) p.subs[k]=this.cl(p.subs[k]+40,0,100);
    p.shield=0;
    S.cleared[node.id]=true; S.current=node.id; S.battle=null; S.reward=null; S.overlay=null; S.screen="map"; this.forceUpdate();
  };

  // ---- map navigation -----------------------------------------------------
  Game.prototype.clickNode = function (n) {
    var S=this.state;
    if (S.cleared[n.id]) return;
    if (!EDGES.some(function(e){return e[0]===S.current && e[1]===n.id;})) return;
    if (n.type==="base") { S.current=n.id; S.cleared[n.id]=true; this.openBase(n); }
    else if (n.type==="anomaly") { S.current=n.id; S.cleared[n.id]=true; S.overlay="ev"; this.forceUpdate(); }
    else this.startBattle(n);
  };

  // ---- station ------------------------------------------------------------
  Game.prototype.openBase = function (n) {
    var S=this.state; var self=this;
    S.base={ node:n, stock:this.sh(SHOP.slice()).slice(0,4).map(function(k){ return { key:k, price:PRICE[k]||16 }; }) };
    S.screen="base"; this.forceUpdate();
  };
  Game.prototype.evTake = function () { var S=this.state; S.salvage+=18; S.overlay=null; this.forceUpdate(); };
  Game.prototype.evRescue = function () { var S=this.state; S.player.crew=this.cl(S.player.crew+2,0,S.player.crewMax); S.overlay=null; this.forceUpdate(); };
  Game.prototype.buyCard = function (i) { var S=this.state, o=S.base.stock[i]; if (!o||S.salvage<o.price) return; S.salvage-=o.price; S.deckKeys.push(o.key); S.base.stock.splice(i,1); this.forceUpdate(); };
  Game.prototype.buyUp = function (k) {
    var S=this.state, u=null, p=S.player;
    for (var i=0;i<UPS.length;i++){ if (UPS[i].k===k){ u=UPS[i]; break; } }
    if (p.ups[k]||S.salvage<u.price) return; S.salvage-=u.price; p.ups[k]=true;
    if (k==="plating") { p.hullMax+=14; p.hull+=14; }
    if (k==="emitters") p.shieldCap+=8;
    if (k==="reactor") p.powerBase+=1;
    this.forceUpdate();
  };
  Game.prototype.repair = function () { var S=this.state, p=S.player; if (S.salvage<10||p.hull>=p.hullMax) return; S.salvage-=10; p.hull=this.cl(p.hull+15,0,p.hullMax); this.forceUpdate(); };
  Game.prototype.hire = function () { var S=this.state, p=S.player; if (S.salvage<8||p.crew>=p.crewMax) return; S.salvage-=8; p.crew++; this.forceUpdate(); };
  Game.prototype.scrap = function (i) { var S=this.state; if (S.salvage<12||S.deckKeys.length<=6) return; S.salvage-=12; S.deckKeys.splice(i,1); this.forceUpdate(); };
  Game.prototype.depart = function () { var S=this.state; S.base=null; S.screen="map"; this.forceUpdate(); };

  // ---- overlays / meta ----------------------------------------------------
  Game.prototype.closeBrief = function () { this.state.overlay=null; this.forceUpdate(); };
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
    return html`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-bottom:1px solid #1a2942">
        <span style=${"width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-family:"+MONO+";font-size:14px;font-weight:600;color:#241503;background:#ffc266"}>${c.cost}</span>
        <span style=${"font-family:"+MONO+";font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#7488ab"}>${c.type}</span>
      </div>
      ${this.cardImg(c.key)}
      <div style="font-weight:600;font-size:16px;text-align:center;padding:7px 8px 0;line-height:1.05;color:#eaf2ff">${c.name}</div>
      <div style="font-size:12.5px;color:#8fa3c4;text-align:center;padding:5px 10px 10px;line-height:1.35;flex:1">${c.text}</div>`;
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
        <div style="font-weight:700;letter-spacing:.2em;font-size:20px;color:#ffffff">HOLLOW FLEET</div>
        <div style="width:1px;height:22px;background:#22345a"></div>
        <div style=${"font-family:"+MONO+";font-size:12px;color:#5f7396;letter-spacing:.14em"}>${v.screenTag}</div>
        <div style="flex:1"></div>
        <div style=${"font-family:"+MONO+";font-size:14px;color:#ffc266;letter-spacing:.08em"}>${v.hudRight}</div>
      </div>

      ${v.isBattle ? this.renderBattle(v) : null}
      ${v.isMap ? this.renderMap(v) : null}
      ${v.isBase ? this.renderBase(v) : null}

      ${this.config.scanlines ? html`<div style="position:absolute;inset:0;pointer-events:none;z-index:60;background:repeating-linear-gradient(0deg,transparent 0 2px,#00000022 2px 3px);opacity:.5"></div>` : null}

      ${v.brShow ? this.renderBriefing() : null}
      ${v.rwShow ? this.renderReward(v) : null}
      ${v.evShow ? this.renderAnomaly() : null}
      ${v.endShow ? this.renderEnd(v) : null}
    </div>`;
  };

  // ---------------------------- TITLE SCREEN -------------------------------
  Game.prototype.renderTitle = function () {
    var self=this;
    var diffKeys=["standard","hard","brutal"];
    return html`
    <div class="hf-starfield hf-title-scroll">
      <div class="hf-title-wrap">
        <div class="hf-title-card">
          <div class="hf-kicker">ROGUELIKE · DECK-BUILDER · VOID COMBAT</div>
          <h1 class="hf-title-h1">HOLLOW FLEET</h1>
          <div class="hf-title-sub">One corvette. One jump gate. A whole Verge in the way.</div>

          <p class="hf-lore">
            The war is over — you just haven't been told. You command the corvette${" "}
            <b>ISV Hollow Verdict</b>, cut off in the dead reach called the${" "}
            <b>Hollow Verge</b>. Between you and the jump gate home lie pirate pickets,
            enforcement blockades, and the dreadnought <b>HMS Iron Verdict</b> waiting at
            the corridor's end. Chart a course, fight your way through card by card,
            scavenge the wrecks, and refit at the stations still holding a light.
            Every jump is one-way. There is no going back.
          </p>

          <div class="hf-primer">
            <div class="hf-primer-cell">
              <h3 style="color:#5fd8ff">① The Chart</h3>
              <p>Jump between nodes on a branching sector map. Pick your fights, your stations, and your route to the flagship.</p>
            </div>
            <div class="hf-primer-cell">
              <h3 style="color:#ff8aa0">② The Battle</h3>
              <p>Spend reactor power to play cards. Shields soak hits before hull; weapons, reactor and engines can all be crippled.</p>
            </div>
            <div class="hf-primer-cell">
              <h3 style="color:#7cf0c0">③ The Refit</h3>
              <p>Dock to buy new cards, install upgrades, patch hull and hire crew. Then jump again — deadlier than before.</p>
            </div>
          </div>

          <div class="hf-diffrow">
            ${diffKeys.map(function(k){
              var d=DIFFS[k];
              return html`<div class=${"hf-diff"+(self.config.difficulty===k?" sel":"")} onClick=${function(){ self.setDifficulty(k); }}>
                <div class="dn">${d.name}</div>
                <div class="dd">${d.blurb}</div>
              </div>`;
            })}
          </div>

          <div class="hf-launch-row">
            <button class="hf-btn" onClick=${function(){ self.beginRun(); }}
              style="font-family:'Space Grotesk',sans-serif;font-weight:600;letter-spacing:.16em;font-size:18px;text-transform:uppercase;color:#03131c;background:linear-gradient(180deg,#63e2ff,#2fbfe8);border:1px solid #8deaff;border-radius:5px;padding:16px 44px;cursor:pointer;box-shadow:0 4px 0 #14506b,0 10px 26px #0009">
              Begin Sortie ▸
            </button>
            <label class="hf-toggle">
              <input type="checkbox" checked=${this.config.scanlines} onChange=${function(){ self.toggleScanlines(); }} />
              CRT SCANLINES
            </label>
          </div>

          <div class="hf-footer">ISV HOLLOW VERDICT · CORVETTE · DECK COMMAND — GOOD HUNTING, CAPTAIN</div>
        </div>
      </div>
    </div>`;
  };

  // ------------------------------ BATTLE -----------------------------------
  Game.prototype.renderBattle = function (v) {
    var self=this;
    return html`
    <div style="position:absolute;inset:58px 0 0 0">
      <!-- central combat column -->
      <div style="position:absolute;left:50%;top:0;bottom:190px;width:760px;margin-left:-380px">
      <div style=${"position:absolute;left:0;top:50%;width:760px;display:flex;flex-direction:column;gap:44px;transform:translateY(-50%) "+v.combatScale+";transform-origin:center center"}>

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
          <div style="position:relative;height:200px;margin:0 30px;display:flex;justify-content:center">
            <div style="position:relative;height:100%;aspect-ratio:2.685">
              <div style=${"position:absolute;inset:-14px -30px;border:1.5px solid #ff7d95;border-radius:50%;opacity:"+v.eBub+";transition:opacity .4s;box-shadow:0 0 30px #ff547033, inset 0 0 30px #ff547018"}></div>
              <img src="assets/ships/enemy.png" alt="Hostile ship" style="position:relative;width:100%;height:100%;object-fit:contain;display:block;filter:drop-shadow(0 10px 26px #000000cc)" />
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:16px;margin:14px 30px 0">
            <span style=${"font-family:"+MONO+";font-size:13px;letter-spacing:.2em;color:#7d92b5"}>SHIELD</span>
            <div style="flex:1;height:13px;border:1px solid #2c4066;border-radius:3px;background:#000000;overflow:hidden"><div style=${"height:100%;width:"+v.eShPct+"%;background:linear-gradient(90deg,#c23a55,#ff8aa0);transition:width .3s"}></div></div>
            <span style=${"font-family:"+MONO+";font-size:15px;color:#eaf2ff"}>${v.eShTxt}</span>
          </div>
        </div>

        <!-- PLAYER -->
        <div style=${"animation:"+v.pAnim}>
          <div style="display:flex;align-items:center;gap:16px;margin:0 30px 14px">
            <span style=${"font-family:"+MONO+";font-size:13px;letter-spacing:.2em;color:#7d92b5"}>SHIELD</span>
            <div style="flex:1;height:13px;border:1px solid #2c4066;border-radius:3px;background:#000000;overflow:hidden"><div style=${"height:100%;width:"+v.pShPct+"%;background:linear-gradient(90deg,#1e8fc4,#7ce7ff);transition:width .3s"}></div></div>
            <span style=${"font-family:"+MONO+";font-size:15px;color:#eaf2ff"}>${v.pShTxt}</span>
          </div>
          <div style="position:relative;height:200px;margin:0 30px;display:flex;justify-content:center">
            <div style="position:relative;height:100%;aspect-ratio:2.434">
              <div style=${"position:absolute;inset:-14px -30px;border:1.5px solid #6fe0ff;border-radius:50%;opacity:"+v.pBub+";transition:opacity .4s;box-shadow:0 0 30px #4fd8ff33, inset 0 0 30px #4fd8ff18"}></div>
              <img src="assets/ships/player.png" alt="ISV Hollow Verdict" style="position:relative;width:100%;height:100%;object-fit:contain;display:block;filter:drop-shadow(0 10px 26px #000000cc)" />
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;gap:16px;margin:14px 30px 0">
            ${v.pSubs.map(function(s){ return self.renderSub(s); })}
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
          <span style="font-weight:600;font-size:17px;color:#ffffff">ISV Hollow Verdict</span>
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
    </div>`;
  };

  Game.prototype.renderSub = function (s) {
    return html`
    <div style=${"flex:1;border:1px solid "+s.bd+";border-radius:4px;background:#0a101ce6;padding:8px 11px"}>
      <div style=${"display:flex;justify-content:space-between;font-size:12px;letter-spacing:.14em;font-weight:600;text-transform:uppercase;color:"+s.col}><span>${s.lab}</span><span style=${"font-family:"+MONO+";font-weight:400"}>${s.val}</span></div>
      <div style="height:6px;background:#000000;border-radius:2px;margin-top:6px;overflow:hidden"><div style=${"height:100%;width:"+s.val+"%;background:"+s.bar+";transition:width .3s"}></div></div>
      <div style=${"font-family:"+MONO+";font-size:11px;color:#5f7396;margin-top:5px"}>${s.fx}</div>
    </div>`;
  };

  // ------------------------------- MAP -------------------------------------
  Game.prototype.renderMap = function (v) {
    return html`
    <div style="position:absolute;inset:58px 0 0 0">
      <div style="position:absolute;top:24px;left:0;right:0;text-align:center;z-index:2;pointer-events:none">
        <div style=${"font-family:"+MONO+";font-size:12px;letter-spacing:.3em;color:#5f7396"}>GALACTIC SECTOR CHART</div>
        <div style="font-weight:700;letter-spacing:.12em;font-size:36px;margin-top:3px;color:#ffffff">THE HOLLOW VERGE</div>
        <div style="font-size:15px;color:#8fa3c4;margin-top:4px">Plot a course to the Iron Verdict. Jumps are one-way — choose your route.</div>
      </div>
      <div style="position:absolute;inset:110px 50px 120px 50px">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible">
          ${v.edges.map(function(e,i){
            return html`<line key=${i} x1=${e.x1} y1=${e.y1} x2=${e.x2} y2=${e.y2} style=${"stroke:"+e.col+";stroke-width:0.22;stroke-dasharray:1.1 1.1;opacity:"+e.op}></line>`;
          })}
        </svg>
        <div style="position:absolute;inset:0">
          ${v.nodes.map(function(n){
            return html`
            <div key=${n.id} class=${"hf-node"+(n.reach?" reachable":"")} onClick=${n.click}
              style=${"position:absolute;left:"+n.x+"%;top:"+n.y+"%;transform:translate(-50%,-50%);text-align:center;opacity:"+n.op+";cursor:"+n.cur+";z-index:2;width:150px"}>
              <div style="position:relative;width:40px;height:40px;margin:0 auto">
                <div style=${"position:absolute;inset:-8px;border:1px solid #4fd8ff;transform:rotate(45deg);animation:ringpulse 1.7s infinite;opacity:"+n.ringOp}></div>
                <div style=${"position:absolute;inset:0;transform:rotate(45deg);border:1.5px solid "+n.bd+";background:"+n.bg+";box-shadow:"+n.glow}></div>
                <div style=${"position:absolute;inset:0;display:grid;place-items:center;font-size:18px;color:"+n.gc}>${n.glyph}</div>
              </div>
              <div style=${"font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:"+n.lc+";margin-top:11px;line-height:1.25"}>${n.label}</div>
              <div style=${"font-family:"+MONO+";font-size:10px;letter-spacing:.18em;color:"+n.tagC+";margin-top:3px"}>${n.tag}</div>
            </div>`;
          })}
        </div>
      </div>
      <div style=${"position:absolute;left:18px;bottom:18px;border:1px solid #1b2a45;border-radius:5px;background:#070b14cc;padding:12px 16px;display:flex;gap:22px;font-family:"+MONO+";font-size:12px;color:#8fa3c4;letter-spacing:.06em"}>
        <span><span style="color:#5fd8ff">⌖</span> SKIRMISH</span>
        <span><span style="color:#ff8aa0">◈</span> ELITE</span>
        <span><span style="color:#7cf0c0">⌂</span> STATION</span>
        <span><span style="color:#b48aff">?</span> ANOMALY</span>
        <span><span style="color:#ff5470">⛧</span> FLAGSHIP</span>
      </div>
      <div style="position:absolute;right:18px;bottom:18px;width:300px;border:1px solid #1b2a45;border-radius:5px;background:#070b14cc;padding:12px 16px">
        <div style="font-weight:600;font-size:15px;letter-spacing:.08em;margin-bottom:8px;color:#ffffff">ISV HOLLOW VERDICT</div>
        <div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:11px;font-weight:600;letter-spacing:.18em;color:#7d92b5">HULL</span><span style=${"font-family:"+MONO+";font-size:13px"}>${v.stHullTxt}</span></div>
        <div style="height:11px;border:1px solid #2c4066;border-radius:2px;background:#000000;overflow:hidden;margin:4px 0 9px"><div style=${"height:100%;width:"+v.stHullPct+"%;background:"+v.stHullBg}></div></div>
        <div style=${"font-family:"+MONO+";font-size:12px;color:#8fa3c4;line-height:1.7"}>CREW ${v.stCrewTxt} · DECK ${v.stDeckTxt} CARDS<br/>SALVAGE ${v.stSalvTxt} ◈</div>
      </div>
    </div>`;
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
                  <div style="border:1px solid #22345a;border-radius:8px;background:#0c1220;box-shadow:0 6px 18px #000a;display:flex;flex-direction:column;overflow:hidden;min-height:216px">
                    ${self.cardFace(c)}
                  </div>
                  <button class=${"hf-buy"+(c.affordable?" affordable":"")} onClick=${c.click} style=${"font-family:"+MONO+";font-size:13px;color:#eaf2ff;background:#101828;border:1px solid #2c4066;border-radius:3px;padding:8px 0;cursor:"+c.cur+";opacity:"+c.op+";letter-spacing:.1em"}>BUY ${c.price} ◈</button>
                </div>`;
              })}
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:20px">
            <!-- shipyard -->
            <div style="border:1px solid #1b2a45;border-radius:6px;background:#0a0f1ad9;padding:16px 18px">
              <div style="letter-spacing:.2em;font-size:13px;font-weight:600;color:#ffffff;text-transform:uppercase">Shipyard</div>
              <div style="font-size:14px;color:#8fa3c4;margin:3px 0 14px">One-time refits, permanent for the run.</div>
              <div style="display:flex;flex-direction:column;gap:10px">
                ${v.baUps.map(function(u,i){
                  return html`
                  <div key=${i} style=${"border:1px solid "+u.bd+";border-radius:4px;background:#070b14;padding:11px 13px;display:flex;align-items:center;gap:14px"}>
                    <div style="flex:1">
                      <div style="font-weight:600;font-size:15px;letter-spacing:.03em;color:#eaf2ff">${u.name}</div>
                      <div style="font-size:13px;color:#8fa3c4;line-height:1.35">${u.desc}</div>
                    </div>
                    <button onClick=${u.click} style=${"font-family:"+MONO+";font-size:12px;color:"+u.tc+";background:#101828;border:1px solid "+u.tb+";border-radius:3px;padding:7px 12px;cursor:"+u.cur+";opacity:"+u.op+";letter-spacing:.06em;white-space:nowrap"}>${u.tag}</button>
                  </div>`;
                })}
              </div>
            </div>
            <!-- refit bay -->
            <div style="border:1px solid #1b2a45;border-radius:6px;background:#0a0f1ad9;padding:16px 18px">
              <div style="letter-spacing:.2em;font-size:13px;font-weight:600;color:#ffffff;text-transform:uppercase">Refit Bay</div>
              <div style="font-size:14px;color:#8fa3c4;margin:3px 0 14px">Hull ${v.pHullTxt} · Crew ${v.pCrewTxt}</div>
              <div style="display:flex;gap:12px;flex-wrap:wrap">
                <button onClick=${v.repClick} style=${"font-family:"+MONO+";font-size:13px;color:#d6e2f5;background:#0d1424;border:1px solid #3a5580;border-radius:3px;padding:10px 15px;cursor:"+v.repCur+";opacity:"+v.repOp+";letter-spacing:.06em"}>PATCH HULL +15 — 10 ◈</button>
                <button onClick=${v.crClick} style=${"font-family:"+MONO+";font-size:13px;color:#d6e2f5;background:#0d1424;border:1px solid #3a5580;border-radius:3px;padding:10px 15px;cursor:"+v.crCur+";opacity:"+v.crOp+";letter-spacing:.06em"}>HIRE CREW +1 — 8 ◈</button>
              </div>
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
            <div style="font-weight:700;letter-spacing:.1em;font-size:30px;color:#ffffff">HOLLOW FLEET</div>
          </div>
        </div>
        <div style="padding:22px 26px">
          <p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#8fa3c4">You command the corvette <b style="color:#eaf2ff">ISV Hollow Verdict</b>, alone in the Hollow Verge. Between you and the jump gate: pirate pickets, blockades, and the dreadnought <b style="color:#eaf2ff">Iron Verdict</b>. Plot your course on the sector chart — every jump is one-way.</p>
          <p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#8fa3c4">In battle, cards draw from <b style="color:#eaf2ff">reactor power</b>. A single deflector screen wraps the whole ship — while it holds, hits bleed into it before touching hull. Beneath it, three subsystems keep you alive: <b style="color:#eaf2ff">WEAPONS</b> drive your damage, the <b style="color:#eaf2ff">REACTOR</b> feeds power, and <b style="color:#eaf2ff">ENGINES</b> regenerate the screen.</p>
          <p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#8fa3c4">Dock at stations to repair, hire crew, refit your deck and upgrade the ship. Win by <b style="color:#eaf2ff">gutting hulls</b> — or board and take them.</p>
          <div style=${"display:flex;gap:24px;flex-wrap:wrap;font-family:"+MONO+";font-size:13px;color:#8fa3c4;margin:6px 0 20px"}><span>HULL <b style="color:#ffffff;font-weight:500">64</b></span><span>CREW <b style="color:#ffffff;font-weight:500">8</b></span><span>SHIELD <b style="color:#ffffff;font-weight:500">22</b></span><span>REACTOR <b style="color:#ffffff;font-weight:500">3</b>/TURN</span></div>
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
                style="width:176px;min-height:216px;border:1px solid #22345a;border-radius:8px;background:#0c1220;box-shadow:0 6px 18px #000a;display:flex;flex-direction:column;overflow:hidden">
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
    var self=this;
    return html`
    <div style="position:absolute;inset:0;background:#000000d8;backdrop-filter:blur(3px);display:grid;place-items:center;z-index:50;padding:20px">
      <div class="hf-overlay-panel" style="max-width:600px;width:100%;border:1px solid #2c4066;border-radius:10px;background:linear-gradient(180deg,#101828,#070b14);box-shadow:0 24px 70px #000c;overflow:hidden">
        <div style="padding:18px 26px;border-bottom:1px solid #1b2a45">
          <div style=${"font-family:"+MONO+";font-size:12px;letter-spacing:.26em;color:#7d92b5"}>ANOMALY CONTACT</div>
          <div style="font-weight:700;letter-spacing:.08em;font-size:29px;margin-top:2px;color:#ffffff">Derelict Hulk</div>
        </div>
        <div style="padding:20px 26px">
          <p style="margin:0 0 18px;font-size:16px;line-height:1.55;color:#8fa3c4">A dead freighter drifts across the lane, spine cracked, holds open to vacuum. Your crew can strip it fast — or sweep it for survivors sealed in the aft frames.</p>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <button class="hf-btn" onClick=${function(){ self.evTake(); }} style="font-family:'Space Grotesk',sans-serif;font-weight:600;letter-spacing:.1em;font-size:14px;text-transform:uppercase;color:#03131c;background:linear-gradient(180deg,#63e2ff,#2fbfe8);border:1px solid #8deaff;border-radius:4px;padding:12px 20px;cursor:pointer;box-shadow:0 4px 0 #14506b">Strip the wreck · +18 ◈</button>
            <button class="hf-ghost-btn" onClick=${function(){ self.evRescue(); }} style="font-family:'Space Grotesk',sans-serif;font-weight:600;letter-spacing:.1em;font-size:14px;text-transform:uppercase;color:#d6e2f5;background:none;border:1px solid #3a5580;border-radius:4px;padding:12px 20px;cursor:pointer">Search for survivors · +2 crew</button>
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
  Game.prototype.computeVals = function () {
    var S=this.state, P=S.player, B=S.battle; var self=this;
    var v={};
    v.isMap=S.screen==="map"; v.isBattle=S.screen==="battle"; v.isBase=S.screen==="base";
    v.screenTag = v.isMap?"// GALACTIC SECTOR CHART":v.isBattle?"// ENGAGEMENT IN PROGRESS":"// STATION REFIT";
    v.hudRight = "◈ "+S.salvage+" SALVAGE · HULL "+Math.round(P.hull)+"/"+P.hullMax+((v.isBattle&&B)?" · TURN "+B.turn:"");

    var reach=function(id){ return !S.cleared[id] && EDGES.some(function(e){return e[0]===S.current && e[1]===id;}); };
    var TY={ start:{g:"▣",c:"#7d92b5"}, fight:{g:"⌖",c:"#5fd8ff"}, elite:{g:"◈",c:"#ff8aa0"}, base:{g:"⌂",c:"#7cf0c0"}, anomaly:{g:"?",c:"#b48aff"}, boss:{g:"⛧",c:"#ff5470"} };
    v.nodes = NODES.map(function(n){
      var t=TY[n.type], cur=n.id===S.current, ok=reach(n.id), done=!!S.cleared[n.id]&&!cur;
      return { id:n.id, x:n.x, y:n.y, glyph:t.g, label:n.label, reach:ok,
        bd:cur?"#ffffff":ok?t.c:"#243350", bg:cur?"#182338":ok?"#101828":"#0a0f1a",
        gc:cur?"#ffffff":ok?t.c:"#4d6288", lc:(ok||cur)?"#d6e2f5":"#4d6288",
        glow:ok?"0 0 18px #4fd8ff55":"none", op:done?0.3:1, cur:ok?"pointer":"default",
        ringOp:cur?1:0, tag:cur?"YOU ARE HERE":ok?"JUMP READY":"", tagC:cur?"#4fd8ff":"#a9bcda",
        click:ok?function(){ self.clickNode(n); }:undefined };
    });
    var pos=function(id){ return NODES.find(function(n){return n.id===id;}); };
    v.edges = EDGES.map(function(e){
      var A=pos(e[0]), Bn=pos(e[1]), act=(e[0]===S.current&&reach(e[1]));
      return { x1:A.x, y1:A.y, x2:Bn.x, y2:Bn.y, col:act?"#4fd8ff":"#243350", op:act?.95:.45 };
    });

    var hp=P.hull/P.hullMax*100;
    v.stHullTxt=Math.round(P.hull)+"/"+P.hullMax; v.stHullPct=this.cl(hp,0,100); v.stHullBg=this.hullBg(hp);
    v.stCrewTxt=P.crew+"/"+P.crewMax; v.stDeckTxt=S.deckKeys.length; v.stSalvTxt=S.salvage;
    v.pHullTxt=v.stHullTxt; v.pHullPct=v.stHullPct; v.pHullBg=v.stHullBg; v.pCrewTxt=v.stCrewTxt;

    var vw=window.innerWidth||1280, vh=window.innerHeight||800;
    if (B) {
      var e=B.enemy;
      var sc=Math.min(1,(vh-274)/700,(vw-24)/760);
      v.combatScale="scale("+sc.toFixed(3)+")";
      var pw=Math.floor(vw/2-380*sc-40);
      v.panelW=Math.max(0,Math.min(300,pw))+"px";
      v.sideBlock=pw>=150?"block":"none"; v.sideFlex=pw>=150?"flex":"none";
      var n=Math.max(1,B.hand.length); var mid=Math.max(200,vw-470); var mh=Math.min(5,(mid-n*176)/(2*n)); v.cardMh=Math.max(mh,-55).toFixed(1)+"px";
      v.pAnim=this.shipAnim(S.shakeP); v.eAnim=this.shipAnim(S.shakeE);
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
      v.hand=B.hand.map(function(c){
        var ok=!B.busy&&!B.over&&c.cost<=P.power&&!(c.needCrew&&P.crew<c.needCrew);
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
      v.endOp=(B.busy||B.over)?.45:1; v.endCur=(B.busy||B.over)?"default":"pointer"; v.endDisabled=!!(B.busy||B.over);
    } else {
      v.pSubs=[]; v.eSubs=[]; v.hand=[]; v.pips=[]; v.logs=[]; v.floats=[]; v.beams=[]; v.inShow=false; v.plShow=false; v.handEmpty=false;
    }

    if (S.base) {
      v.baTitle=S.base.node.label; v.baSalvTxt=S.salvage;
      v.baStock=S.base.stock.map(function(o,i){
        var ok=S.salvage>=o.price;
        return Object.assign({}, self.cardView(LIB[o.key]), { price:o.price, affordable:ok, op:ok?1:.45, cur:ok?"pointer":"default", click:ok?function(){ self.buyCard(i); }:undefined });
      });
      v.baUps=UPS.map(function(u){
        var owned=!!P.ups[u.k], ok=!owned&&S.salvage>=u.price;
        return { name:u.name, desc:u.desc, bd:owned?"#4d6288":"#22345a", tag:owned?"INSTALLED":u.price+" ◈",
          tc:owned?"#7d92b5":"#eaf2ff", tb:owned?"#4d6288":"#3a5580", cur:ok?"pointer":"default", op:owned?1:ok?1:.45,
          click:ok?function(){ self.buyUp(u.k); }:undefined };
      });
      var rOk=S.salvage>=10&&P.hull<P.hullMax, cOk=S.salvage>=8&&P.crew<P.crewMax, sOk=S.salvage>=12&&S.deckKeys.length>6;
      v.repClick=rOk?function(){ self.repair(); }:undefined; v.repOp=rOk?1:.45; v.repCur=rOk?"pointer":"default";
      v.crClick=cOk?function(){ self.hire(); }:undefined; v.crOp=cOk?1:.45; v.crCur=cOk?"pointer":"default";
      v.deckCards=S.deckKeys.map(function(k,i){
        return { name:LIB[k].name, cost:LIB[k].cost, click:sOk?function(){ self.scrap(i); }:undefined, cur:sOk?"pointer":"default", op:sOk?1:.35 };
      });
      v.depClick=function(){ self.depart(); };
    } else { v.baStock=[]; v.baUps=[]; v.deckCards=[]; }

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
