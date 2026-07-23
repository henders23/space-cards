// tools/combat-sim.js — headless fleet-combat balance simulator.
//
// Run:  node tools/combat-sim.js
//
// It re-implements the game's combat formulas (ship stats, enemy intent AI,
// screening, strike-craft tokens, flak, the card effects the decks use) so
// thousands of auto-battles can be run in a second and win-rate / turn / hull
// bands measured across matchups and difficulties. A competent-but-not-perfect
// heuristic drives the player fleet.
//
// CAVEAT: this is a *model*, kept in sync with game.js by hand. It intentionally
// omits ship upgrades/refits (so real, upgraded fleets are stronger than the sim
// suggests). Treat the numbers as ratios and directions, not gospel. When you
// change combat numbers in game.js, mirror them in the TUNE block / ENEMIES here
// before trusting a re-run.
//
'use strict';
// Faithful-ish headless simulator of Blackstar Verge fleet combat. Mirrors the
// exact formulas in game.js so we can measure win rates / turn counts and tune.
// All balance knobs live in TUNE so a sweep can perturb them without touching
// the logic; the winning values get ported back into game.js.

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
let RND = Math.random;
const ri=(a,b)=>Math.floor(RND()*(b-a+1))+a;
const pk=a=>a[Math.floor(RND()*a.length)];
const cl=(v,a,b)=>Math.max(a,Math.min(b,v));
const chance=p=>RND()<p;

// ---- TUNE: every balance knob ------------------------------------------------
const TUNE = {
  // enemy fleet composition multipliers (2nd/3rd ship strength)
  eliteBump: 1.15, eliteEscortM: 0.5, bountyEscortM: 0.45,
  bossWingM: 0.82, bossCoreM: 1.15,
  // charged salvo
  chargeAddLo: 3, chargeAddHi: 9, dreadChargeMul: 1.12, salvoSabLo:10, salvoSabHi:18,
  // strike craft
  fighterAtk:2, fighterHp:2, fighterN:2, bomberAtk:5, bomberHp:2, bomberSab:10,
  interSweep:3, flakDmg:2, flakEngReq:60,
  // escorts
  frigateHull:52, frigatePrice:70, carrierHull:46, carrierPrice:85,
  // capture
  captureHullFrac:0.5, captureCrewFrac:0.5,
  // player flagship
  flagHull:80, flagPower:3, flagShield:24,
  // between-battle heal
  healFrac:0.15,
};

// ---- static content (mirrors game.js) ----------------------------------------
const ENEMIES = [
  {name:"Carrion Jackal",ai:"raider", hull:44,shieldCap:12,regen:3,crew:5,atkLo:5,atkHi:9,sab:.15,boardN:2,boardCh:.15,shieldAmt:8,rep:0,fighter:null},
  {name:"Ledger's Edge", ai:"gunline",hull:60,shieldCap:16,regen:4,crew:7,atkLo:8,atkHi:12,sab:.25,boardN:2,boardCh:.2,shieldAmt:10,rep:.15,fighter:null},
  {name:"Iron Verdict",  ai:"dread",  hull:82,shieldCap:22,regen:4,crew:10,atkLo:11,atkHi:15,sab:.28,boardN:3,boardCh:.2,shieldAmt:13,rep:.18,fighter:{atk:3,hp:2}},
  {name:"Rust Psalm",    ai:"raider", hull:50,shieldCap:14,regen:3,crew:6,atkLo:6,atkHi:10,sab:.18,boardN:2,boardCh:.18,shieldAmt:9,rep:0,fighter:null},
  {name:"Tithe Collector",ai:"gunline",hull:56,shieldCap:14,regen:4,crew:6,atkLo:8,atkHi:11,sab:.22,boardN:2,boardCh:.15,shieldAmt:10,rep:.1,fighter:null},
  {name:"Red Augur",     ai:"zealot", hull:52,shieldCap:18,regen:5,crew:5,atkLo:9,atkHi:13,sab:.2,boardN:2,boardCh:.1,shieldAmt:12,rep:.12,fighter:null},
  {name:"Anvil Chorus",  ai:"gunline",hull:70,shieldCap:18,regen:4,crew:8,atkLo:10,atkHi:14,sab:.28,boardN:3,boardCh:.18,shieldAmt:12,rep:.15,fighter:null},
  {name:"Locust Prime",  ai:"carrier",hull:64,shieldCap:12,regen:3,crew:10,atkLo:7,atkHi:11,sab:.2,boardN:3,boardCh:.35,shieldAmt:9,rep:.2,fighter:{atk:2,hp:2}},
  {name:"Whisper Warden",ai:"warden", hull:58,shieldCap:20,regen:6,crew:6,atkLo:8,atkHi:12,sab:.3,boardN:2,boardCh:.12,shieldAmt:13,rep:0,fighter:null},
];
const DIFF = { standard:1, hard:1.2, brutal:1.45 };

// card DB — only the combat-relevant flags used by the decks in play
const LIB = {
  laser:{type:"weapon",cost:1,dmg:7}, flak:{type:"weapon",cost:1,dmg:5,bonusNoShield:5},
  missile:{type:"weapon",cost:2,dmg:9,pierce:true}, broadside:{type:"weapon",cost:2,dmg:5,hits:3},
  torpedo:{type:"weapon",cost:3,dmg:15,pierce:true}, railgun:{type:"weapon",cost:3,dmg:13,sab:30},
  "ion-needle":{type:"weapon",cost:1,dmg:4,sab:15},
  divert:{type:"shield",cost:1,shield:9}, angle:{type:"shield",cost:1,shield:5,draw:1},
  capacitor:{type:"shield",cost:2,shield:14}, brace:{type:"shield",cost:1,shield:4,brace:true},
  patch:{type:"repair",cost:1,heal:9}, "jury-rig":{type:"repair",cost:1,repSub:25},
  overcharge:{type:"power",cost:0,gainP:2,selfSub:8}, reroute:{type:"power",cost:0,gainP:1,draw:1},
  lock:{type:"tactic",cost:1,lock:7}, evasive:{type:"tactic",cost:1,evade:true},
  scavenge:{type:"tactic",cost:0,draw:2}, "combat-scan":{type:"tactic",cost:0,drawType:"weapon",discount:1},
  boarding:{type:"boarding",cost:2,eCrew:3,sCrew:1,sabRand:15,needCrew:2},
  "fighter-wing":{type:"strike",cost:2,strike:{kind:"fighter",n:TUNE.fighterN,atk:TUNE.fighterAtk,hp:TUNE.fighterHp}},
  "bomber-wing":{type:"strike",cost:3,strike:{kind:"bomber",n:1,atk:TUNE.bomberAtk,hp:TUNE.bomberHp,pierce:true,sab:TUNE.bomberSab}},
  interceptors:{type:"strike",cost:1,draw:1,strike:{kind:"defense",sweep:TUNE.interSweep,shield:5}},
};
const COMMISSIONS = {
  gunline:["laser","laser","laser","flak","missile","broadside","lock","divert","divert","patch"],
  bulwark:["laser","laser","broadside","divert","brace","capacitor","angle","boarding","overcharge","patch"],
  saboteur:["laser","laser","ion-needle","flak","divert","angle","overcharge","reroute","combat-scan","patch"],
};
const CAPTURE_DECKS = {
  raider:["laser","laser","evasive","divert","boarding","patch"],
  gunline:["laser","flak","lock","divert","divert","patch"],
  carrier:["fighter-wing","fighter-wing","divert","angle","patch","patch"],
  warden:["divert","capacitor","laser","jury-rig","angle","patch"],
  zealot:["laser","laser","overcharge","divert","lock","patch"],
};

const wm = subs => .5 + .5*subs.subs.weapons/100;
const rp = sh => Math.max(1, Math.round(sh.powerBase*(.4 + .6*sh.subs.reactor/100)));
const worstSub = s => Object.keys(s).sort((a,b)=>s[a]-s[b])[0];
const bestSub  = s => Object.keys(s).sort((a,b)=>s[b]-s[a])[0];
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=ri(0,i);[a[i],a[j]]=[a[j],a[i]];}return a;}

function mkPlayer(spec){
  return {name:spec.name, flagship:!!spec.flagship, ai:null,
    hullMax:spec.hull,hull:spec.hull, crew:spec.crew,crewMax:spec.crew,
    powerBase:spec.power, shieldCap:spec.shieldCap, shield:0, power:0,
    regen:spec.regen||2, hangarCap:spec.hangarCap||0, handSize:spec.handSize||3,
    subs:{weapons:100,reactor:100,engines:100}, deckKeys:spec.deck.slice(),
    side:"p", lost:false, hand:[], draw:[], disc:[],
    fx:{lock:0,brace:false,evade:false,armour:0,reflect:0,overwatch:0,flank:0,blind:0,nextPower:0,nextPowerPenalty:0}};
}
function mkEnemy(d,m){
  return {name:d.name, ai:d.ai, side:"e", alive:true, struck:false,
    hullMax:Math.round(d.hull*m),hull:Math.round(d.hull*m),
    shieldCap:d.shieldCap,shield:0,regen:d.regen, crew:d.crew,crewMax:d.crew,
    atkLo:Math.round(d.atkLo*m),atkHi:Math.round(d.atkHi*m), sab:d.sab,boardN:d.boardN,boardCh:d.boardCh,shieldAmt:d.shieldAmt,rep:d.rep,
    fighter:d.fighter, charged:0, focus:null, mines:[], intent:null,
    subs:{weapons:100,reactor:100,engines:100}};
}
function enemyGroup(node){
  const d=ENEMIES[node.enemy], zm=node.zm||1, dm=DIFF[node.diff||"standard"];
  const m=dm*((node.type==="elite"||node.type==="bounty")?TUNE.eliteBump:1)*(node.type==="boss"?1:zm);
  if(node.type==="boss") return [mkEnemy(ENEMIES[6],dm*TUNE.bossWingM), mkEnemy(d,dm*TUNE.bossCoreM), mkEnemy(ENEMIES[8],dm*TUNE.bossWingM)];
  if(node.type==="elite")  return [mkEnemy(d,m), mkEnemy(ENEMIES[0],m*TUNE.eliteEscortM)];
  if(node.type==="bounty") return [mkEnemy(d,m), mkEnemy(ENEMIES[3],m*TUNE.bountyEscortM)];
  return [mkEnemy(d,m)];
}

// ---- battle engine -----------------------------------------------------------
function Battle(pFleet, eShips){
  this.p=pFleet; this.e=eShips; this.tokens=[]; this.turn=1; this.log=[];
  this.p.forEach(s=>{s.draw=shuffle(s.deckKeys.map(k=>Object.assign({key:k},LIB[k]))); s.hand=[]; s.disc=[]; s.shield=0;});
}
Battle.prototype.pAlive=function(i){const s=this.p[i]; return s&&!s.lost&&s.hull>0;};
Battle.prototype.eAlive=function(i){const s=this.e[i]; return s&&s.alive&&!s.struck;};
Battle.prototype.aliveP=function(){const a=[];for(let i=0;i<this.p.length;i++)if(this.pAlive(i))a.push(i);return a;};
Battle.prototype.aliveE=function(){const a=[];for(let i=0;i<this.e.length;i++)if(this.eAlive(i))a.push(i);return a;};
Battle.prototype.tokensOf=function(side){return this.tokens.filter(t=>t.side===side&&t.hp>0);};
Battle.prototype.hangarUsed=function(sh){return this.tokens.filter(t=>t.side==="p"&&t.hp>0&&t.carrier===sh).length;};
Battle.prototype.validTargets=function(pIdx,card,flank){const all=this.aliveE();if((card&&card.strike)||flank)return all;if(this.eAlive(pIdx))return[pIdx];return all;};
Battle.prototype.enemyTargetIdx=function(eIdx){if(this.pAlive(eIdx))return eIdx;const a=this.aliveP();if(!a.length)return 0;let best=a[0];a.forEach(i=>{if(this.p[i].hull<this.p[best].hull)best=i;});return best;};
Battle.prototype.pickStrafe=function(side){const a=side==="e"?this.aliveE():this.aliveP();if(!a.length)return null;let best=a[0];a.forEach(i=>{const h=side==="e"?this.e[i].hull:this.p[i].hull;const hb=side==="e"?this.e[best].hull:this.p[best].hull;if(h<hb)best=i;});return best;};
Battle.prototype.deal=function(side,idx,amt,pierce){
  const t=side==="e"?this.e[idx]:this.p[idx]; let abs=0,arm=0,toHull=amt;
  if(!pierce&&t.shield>0){abs=Math.min(t.shield,amt);t.shield-=abs;toHull=amt-abs;}
  if(side==="p"&&t.fx&&toHull>0&&t.fx.armour>0){arm=Math.min(t.fx.armour,toHull);t.fx.armour-=arm;toHull-=arm;}
  t.hull=cl(t.hull-toHull,0,t.hullMax); return {toHull,abs};
};
Battle.prototype.drawCards=function(s,n){for(let i=0;i<n;i++){if(!s.draw.length){if(!s.disc.length)break;s.draw=shuffle(s.disc);s.disc=[];}s.hand.push(s.draw.pop());}};
Battle.prototype.drawType=function(s,type,disc){let i=-1;const find=a=>{for(let j=a.length-1;j>=0;j--)if(a[j].type===type)return j;return -1;};i=find(s.draw);if(i<0&&s.disc.length){s.draw=shuffle(s.draw.concat(s.disc));s.disc=[];i=find(s.draw);}if(i<0)return;const c=s.draw.splice(i,1)[0];if(disc){c._base=c.cost;c.cost=Math.max(0,c.cost-disc);}s.hand.push(c);};

Battle.prototype.startPlayerTurn=function(){
  this.p.forEach((s,i)=>{ if(!this.pAlive(i))return;
    const reg=Math.round((s.regen||2)*s.subs.engines/100); if(reg>0)s.shield=cl(s.shield+reg,0,s.shieldCap);
    s.power=Math.max(0, rp(s)+(s.fx.nextPower||0)-(s.fx.nextPowerPenalty||0));
    s.fx.nextPower=0;s.fx.nextPowerPenalty=0;s.fx.lock=0;s.fx.brace=false;s.fx.evade=false;
    while(s.hand.length<s.handSize&&(s.draw.length||s.disc.length))this.drawCards(s,1);
  });
};
Battle.prototype.applyCard=function(c,s,tIdx){
  const pIdx=this.p.indexOf(s);
  let eIdx=tIdx; if(eIdx==null){const v=this.validTargets(pIdx,c,s.fx.flank>0);eIdx=v.length?v[0]:null;}
  const e=(eIdx!=null)?this.e[eIdx]:null;
  if(c.dmg!=null&&e){let hits=c.hits||1,base=c.dmg,tot=0,absT=0;
    if(c._flank){hits*=2;base=Math.max(1,Math.floor(base/2));}
    for(let i=0;i<hits;i++){let d=base+s.fx.lock+(c._flank&&i===0?(c._flankBonus||0):0);s.fx.lock=0;if(c.bonusNoShield&&e.shield<=0)d+=c.bonusNoShield;d=Math.round(d*wm(s));const r=this.deal("e",eIdx,d,!!c.pierce);tot+=r.toHull;absT+=r.abs;}
    if(c.sab)e.subs.reactor=cl(e.subs.reactor-c.sab,0,100);
    if(e.focus&&c.type==="weapon"&&(tot>0||absT>0)){const cs=cl(Math.round((tot+absT*.5)*.4),3,26);e.subs[e.focus]=cl(e.subs[e.focus]-cs,0,100);}
  }
  if(c.shield)s.shield=cl(s.shield+c.shield,0,s.shieldCap);
  if(c.brace)s.fx.brace=true;
  if(c.heal)s.hull=cl(s.hull+c.heal,0,s.hullMax);
  if(c.repSub){const w=worstSub(s.subs);s.subs[w]=cl(s.subs[w]+c.repSub,0,100);}
  if(c.gainP)s.power+=c.gainP;
  if(c.selfSub)s.subs.reactor=cl(s.subs.reactor-c.selfSub,0,100);
  if(c.draw)this.drawCards(s,c.draw);
  if(c.drawType)this.drawType(s,c.drawType,c.discount||0);
  if(c.lock)s.fx.lock+=c.lock;
  if(c.evade)s.fx.evade=true;
  if(c.flank)s.fx.flank=c.flank;
  if(c.eCrew&&e){if(c.capture&&e.crew<=c.capture)e.crew=0;else e.crew=cl(e.crew-c.eCrew,0,e.crewMax);s.crew=cl(s.crew-(c.sCrew||0),0,s.crewMax);if(c.sabRand){const nm=pk(["weapons","reactor","engines"]);e.subs[nm]=cl(e.subs[nm]-c.sabRand,0,100);}}
  if(c.strike)this.launchStrike(c.strike,s);
  delete c._flank;delete c._flankBonus;
};
Battle.prototype.launchStrike=function(st,s){
  if(st.kind==="fighter"||st.kind==="bomber"){for(let i=0;i<(st.n||1)&&this.hangarUsed(s)<s.hangarCap;i++)this.tokens.push({side:"p",kind:st.kind,atk:st.atk,hp:st.hp,pierce:!!st.pierce,sab:st.sab||0,carrier:s});}
  else if(st.kind==="defense"){if(st.sweep){this.tokensOf("e").forEach(t=>t.hp-=st.sweep);this.tokens=this.tokens.filter(t=>t.hp>0);}if(st.shield)s.shield=cl(s.shield+st.shield,0,s.shieldCap);}
};
Battle.prototype.resolveTokens=function(side){
  const mine=this.tokensOf(side); if(!mine.length)return; const foe=side==="p"?"e":"p";
  mine.slice().forEach(tk=>{ if(tk.hp<=0)return; const host=this.tokensOf(foe);
    if(tk.kind==="fighter"&&host.length){let tgt=host.find(h=>h.kind==="bomber")||host[0];tgt.hp-=tk.atk;if(tgt.hp>0)tk.hp-=tgt.atk;}
    else if(tk.kind==="fighter"){const si=this.pickStrafe(side==="p"?"e":"p");if(si!=null)this.deal(side==="p"?"e":"p",si,tk.atk,false);}
    else if(tk.kind==="bomber"){const bi=this.pickStrafe(side==="p"?"e":"p");if(bi!=null){this.deal(side==="p"?"e":"p",bi,tk.atk,!!tk.pierce);if(side==="p"&&tk.sab){const e=this.e[bi];if(e.focus)e.subs[e.focus]=cl(e.subs[e.focus]-tk.sab,0,100);}}}
  });
  this.tokens=this.tokens.filter(t=>t.hp>0);
};
Battle.prototype.fireFlak=function(side){
  let can=false;const list=side==="p"?this.aliveP():this.aliveE();
  list.forEach(i=>{const sh=side==="p"?this.p[i]:this.e[i];if(sh.subs.engines>=TUNE.flakEngReq)can=true;});
  const foes=this.tokensOf(side==="p"?"e":"p"); if(!can||!foes.length)return;
  let tgt=foes[0];foes.forEach(f=>{if(f.hp<tgt.hp)tgt=f;});tgt.hp-=TUNE.flakDmg;this.tokens=this.tokens.filter(t=>t.hp>0);
};
Battle.prototype.chooseIntent=function(e,idx){
  const o=[]; const tgt=this.enemyTargetIdx(idx);
  if(e.charged>0){const v=e.charged;e.charged=0;e.intent={type:"salvo",value:v,tgt,sab:chance(e.sab)?ri(TUNE.salvoSabLo,TUNE.salvoSabHi):0};return;}
  const ai=e.ai,lowHull=e.hull<e.hullMax*.5,canPower=e.subs.reactor>=35;
  const tCrew=this.p[tgt]?this.p[tgt].crew:0;
  let atkW=ai==="raider"?7:ai==="warden"?3:5; if(ai==="zealot"&&lowHull)atkW+=4;
  o.push({w:atkW,m:()=>{let base=ri(e.atkLo,e.atkHi);if(ai==="zealot"&&lowHull)base=Math.round(base*1.3);return{type:"attack",value:base,tgt,sab:chance(e.sab)?ri(12,22):0};}});
  if((ai==="gunline"||ai==="dread")&&canPower)o.push({w:ai==="dread"?5:4,m:()=>({type:"charge",value:Math.round(ri(e.atkHi+TUNE.chargeAddLo,e.atkHi+TUNE.chargeAddHi)*(ai==="dread"?TUNE.dreadChargeMul:1)),tgt})});
  if((ai==="carrier"||ai==="dread")&&e.fighter&&canPower&&this.tokensOf("e").length<4)o.push({w:ai==="carrier"?6:3,m:()=>({type:"launch",value:ai==="dread"?2:ri(1,2)})});
  if(e.shield<e.shieldCap*.4)o.push({w:ai==="warden"?4:2,m:()=>({type:"shield",value:e.shieldAmt})});
  if(e.boardCh&&tCrew>0)o.push({w:e.boardCh*10*(ai==="raider"?1.5:1),m:()=>({type:"board",value:e.boardN,tgt})});
  if(e.rep&&(lowHull||Math.min(e.subs.weapons,e.subs.reactor,e.subs.engines)<50))o.push({w:e.rep*10*(ai==="warden"?1.6:1),m:()=>({type:"repair",value:ri(8,14)})});
  let totw=o.reduce((s,x)=>s+x.w,0),r=RND()*totw,c=o[0];for(const x of o){r-=x.w;if(r<=0){c=x;break;}}e.intent=c.m();
};
Battle.prototype.chooseIntents=function(){this.e.forEach((e,i)=>{if(this.eAlive(i))this.chooseIntent(e,i);else e.intent=null;});};
Battle.prototype.enemyActs=function(i){
  const e=this.e[i],it=e.intent;if(!it)return;
  const ti=(it.tgt!=null&&this.pAlive(it.tgt))?it.tgt:this.enemyTargetIdx(i);
  const t=this.p[ti];
  const reg=Math.round(e.regen*e.subs.engines/100);if(reg>0)e.shield=cl(e.shield+reg,0,e.shieldCap);
  if(it.type==="attack"||it.type==="salvo"){ if(!t)return;
    if(t.fx.evade){} else { let d=Math.round(it.value*wm(e));
      if(t.fx.blind){d=Math.max(0,d-t.fx.blind);t.fx.blind=0;} if(t.fx.brace){d=Math.ceil(d/2);}
      this.deal("p",ti,d,false);
      if(it.sab){const nm=pk(["weapons","reactor","engines"]);t.subs[nm]=cl(t.subs[nm]-it.sab,0,100);}
      if(t.fx.reflect){this.deal("e",i,t.fx.reflect,true);t.fx.reflect=0;}
      if(t.fx.overwatch){this.deal("e",i,t.fx.overwatch,false);t.fx.overwatch=0;}
    }
  } else if(it.type==="charge"){e.charged=it.value;}
  else if(it.type==="launch"){const fd=e.fighter||{atk:2,hp:2};const n=Math.max(0,Math.min(it.value||2,4-this.tokensOf("e").length));for(let k=0;k<n;k++)this.tokens.push({side:"e",kind:"fighter",atk:fd.atk,hp:fd.hp,carrier:i});}
  else if(it.type==="shield"){e.shield=cl(e.shield+it.value,0,e.shieldCap);}
  else if(it.type==="board"){ if(!t)return; t.crew=cl(t.crew-it.value,0,t.crewMax);const nm=pk(["weapons","reactor","engines"]);t.subs[nm]=cl(t.subs[nm]-10,0,100);}
  else if(it.type==="repair"){e.hull=cl(e.hull+it.value,0,e.hullMax);const w=worstSub(e.subs);e.subs[w]=cl(e.subs[w]+25,0,100);}
};
Battle.prototype.enemyPhase=function(){
  this.resolveTokens("p"); if(this.done())return;
  this.fireFlak("e");
  for(let i=0;i<this.e.length;i++){if(this.eAlive(i)){this.enemyActs(i);if(this.done())return;}}
  this.resolveTokens("e"); if(this.done())return;
  this.fireFlak("p");
  this.e.forEach((e,i)=>{if(e.mines.length&&this.eAlive(i)){const tot=e.mines.reduce((s,n)=>s+n,0);e.mines=[];this.deal("e",i,tot,false);}});
};
Battle.prototype.sweep=function(){
  this.e.forEach((e,i)=>{if(!e.alive||e.struck)return;if(e.hull<=0){e.alive=false;e.intent=null;}else if(e.crew<=0){e.struck=true;e.intent=null;}});
  this.p.forEach((s)=>{if(s.lost||s.flagship)return;if(s.hull<=0||s.crew<=0)s.lost=true;});
};
Battle.prototype.done=function(){
  this.sweep();
  const flag=this.p[0];
  if(flag.hull<=0||flag.crew<=0){this.result={win:false};return true;}
  if(this.aliveE().length===0){this.result={win:true};return true;}
  return false;
};

// ---- player policy (a competent average player) ------------------------------
function incomingTo(b){
  const inc=b.p.map(()=>0);
  b.e.forEach((e,i)=>{ if(!b.eAlive(i)||!e.intent)return; const it=e.intent;
    const ti=(it.tgt!=null&&b.pAlive(it.tgt))?it.tgt:b.enemyTargetIdx(i);
    if(it.type==="attack"||it.type==="salvo")inc[ti]+=Math.round(it.value*wm(e));
    else if(it.type==="board")inc[ti]+=it.value*3; // treat crew loss as pressure
  });
  // strike-craft strafes hit the weakest hull; add to worst player ship
  const strafe=b.tokensOf("e").reduce((s,t)=>s+t.atk,0);
  if(strafe){let wi=b.aliveP()[0];b.aliveP().forEach(i=>{if(b.p[i].hull<b.p[wi].hull)wi=i;});if(wi!=null)inc[wi]+=strafe;}
  return inc;
}
function playShip(b,s,inc){
  const pIdx=b.p.indexOf(s);
  let guard=40;
  while(guard-->0){
    const hand=s.hand, aff=c=>c.cost<=s.power;
    // 1) free tempo (reroute/overcharge/combat-scan/scavenge) if it helps
    let t=hand.find(c=>(c.key==="reroute"||c.key==="scavenge"||c.key==="combat-scan")&&aff(c));
    if(t){play(b,s,t);continue;}
    // overcharge only if we have a weapon to spend the power on and reactor healthy
    let oc=hand.find(c=>c.key==="overcharge"&&aff(c)&&s.subs.reactor>40&&hand.some(w=>w.type==="weapon"&&w.cost<=s.power+2));
    if(oc){play(b,s,oc);continue;}
    // 2) shield up if a real hit is coming and we can't just kill it
    const threat=inc[pIdx]||0;
    if(threat>=10 && s.shield< threat*0.8){
      const sc=bestShield(hand.filter(aff)); if(sc){play(b,s,sc);continue;}
      const ev=hand.find(c=>c.key==="evasive"&&aff(c)); if(ev&&threat>=14){play(b,s,ev);continue;}
    }
    // 3) launch strike craft (carriers)
    if(s.hangarCap>b.hangarUsed(s)){
      const bw=hand.find(c=>c.strike&&c.strike.kind==="bomber"&&aff(c)); if(bw){play(b,s,bw);continue;}
      const fw=hand.find(c=>c.strike&&c.strike.kind==="fighter"&&aff(c)); if(fw){play(b,s,fw);continue;}
    }
    const inter=hand.find(c=>c.strike&&c.strike.kind==="defense"&&aff(c)&&b.tokensOf("e").length>=2);
    if(inter){play(b,s,inter);continue;}
    // 4) boarding to strip crew (when it can capture-progress and we have crew)
    const brd=hand.find(c=>c.eCrew&&aff(c)&&s.crew>(c.needCrew||0));
    if(brd){const tv=b.validTargets(pIdx,brd,false);if(tv.length&&b.e[tv[0]].crew<=6){play(b,s,brd,tv[0]);continue;}}
    // 5) fire a weapon at the best valid target; lock first for a big shot
    const wpns=hand.filter(c=>c.type==="weapon"&&aff(c));
    if(wpns.length){
      // set focus on primary target's weapons to blunt incoming (called shots)
      const tv=b.validTargets(pIdx,wpns[0],s.fx.flank>0);
      if(tv.length){ const tgt=weakestE(b,tv);
        if(!b.e[tgt].focus)b.e[tgt].focus="weapons";
        const lk=hand.find(c=>c.key==="lock"&&aff(c)); const big=wpns.slice().sort((a,b2)=>(b2.dmg*(b2.hits||1))-(a.dmg*(a.hits||1)))[0];
        if(lk&&s.fx.lock===0&&big.dmg>=9&&s.power>=lk.cost+big.cost){play(b,s,lk);continue;}
        const w=chooseWeapon(wpns,b.e[tgt]); play(b,s,w,tgt); continue;
      }
    }
    // 6) repair a crippled subsystem
    const rs=hand.find(c=>c.repSub&&aff(c)&&Math.min(s.subs.weapons,s.subs.reactor,s.subs.engines)<=40);
    if(rs){play(b,s,rs);continue;}
    // 7) heal if badly hurt and nothing better
    const hp=hand.find(c=>c.heal&&aff(c)&&s.hull<s.hullMax*0.4);
    if(hp){play(b,s,hp);continue;}
    // 8) spend leftover shield/power if idle
    const anyShield=bestShield(hand.filter(aff));
    if(anyShield&&s.power>=2&&s.shield<s.shieldCap*0.6){play(b,s,anyShield);continue;}
    break;
  }
}
function bestShield(cands){const sh=cands.filter(c=>c.type==="shield").sort((a,b)=>(b.shield||0)-(a.shield||0));return sh[0];}
function weakestE(b,idxs){let best=idxs[0];idxs.forEach(i=>{if(effHull(b.e[i])<effHull(b.e[best]))best=i;});return best;}
function effHull(e){return e.hull + (e.shield||0);}
function chooseWeapon(wpns,e){ // prefer pierce if shielded, else highest dmg affordable
  if(e.shield>0){const p=wpns.filter(w=>w.pierce).sort((a,b)=>b.dmg-a.dmg);if(p[0])return p[0];}
  return wpns.slice().sort((a,b)=>(b.dmg*(b.hits||1))-(a.dmg*(a.hits||1)))[0];
}
function play(b,s,c,tIdx){
  const i=s.hand.indexOf(c); if(i<0)return; s.hand.splice(i,1);
  s.power-=c.cost; if(c._base!=null){c.cost=c._base;delete c._base;}
  if(s.fx.flank&&c.type==="weapon"){c._flank=true;c._flankBonus=s.fx.flank;s.fx.flank=0;}
  b.applyCard(c,s,tIdx); s.disc.push(c);
}

// ---- run one battle ----------------------------------------------------------
function runBattle(pFleet, node){
  const b=new Battle(pFleet, enemyGroup(node));
  b.chooseIntents(); b.startPlayerTurn();
  for(let turn=1;turn<=40;turn++){
    if(b.done())break;
    const inc=incomingTo(b);
    b.aliveP().forEach(i=>{ // command each ship: active-ish order, flagship last so escorts screen
      playShip(b,b.p[i],inc);
    });
    if(b.done())break;
    b.enemyPhase();
    if(b.done())break;
    b.chooseIntents(); b.turn++; b.startPlayerTurn();
  }
  if(!b.result)b.result={win:false}; // timeout = loss
  const flag=b.p[0];
  return {win:b.result.win, turns:b.turn, pHull:cl(flag.hull/flag.hullMax,0,1),
    lost:b.p.filter(s=>s.lost).length, tokens:b.tokens.length};
}

// ---- fleet specs -------------------------------------------------------------
function flagship(commission){return mkPlayer({name:"Resolute",flagship:true,hull:TUNE.flagHull,crew:10,power:TUNE.flagPower,shieldCap:TUNE.flagShield,hangarCap:2,regen:3,handSize:5,deck:COMMISSIONS[commission]});}
function frigate(){return mkPlayer({name:"Frigate",hull:TUNE.frigateHull,crew:5,power:2,shieldCap:14,hangarCap:0,regen:2,handSize:3,deck:["laser","laser","flak","divert","lock","patch"]});}
function carrier(){return mkPlayer({name:"Carrier",hull:TUNE.carrierHull,crew:5,power:2,shieldCap:12,hangarCap:3,regen:2,handSize:3,deck:["fighter-wing","fighter-wing","interceptors","divert","angle","patch"]});}

// ---- experiment harness ------------------------------------------------------
function trials(n, seed, mkFleet, node){
  let wins=0,turns=0,hull=0,lost=0;
  for(let i=0;i<n;i++){ RND=mulberry32(seed+i*7919);
    const r=runBattle(mkFleet(), node); if(r.win)wins++; turns+=r.turns; hull+=r.pHull; lost+=r.lost;
  }
  return {wr:wins/n, turns:turns/n, hull:hull/n, lost:lost/n};
}
function fmt(t){return `wr ${(t.wr*100).toFixed(0)}%  turns ${t.turns.toFixed(1)}  hull ${(t.hull*100).toFixed(0)}%  lost ${t.lost.toFixed(2)}`;}

const N=800;
const SCEN = [
  ["Skirmish z1 std (flag only)", ()=>[flagship("gunline")], {enemy:0,type:"fight",zm:1.0,diff:"standard"}],
  ["Skirmish z2 std (flag only)", ()=>[flagship("gunline")], {enemy:3,type:"fight",zm:1.0,diff:"standard"}],
  ["Skirmish z3 std (flag only)", ()=>[flagship("gunline")], {enemy:4,type:"fight",zm:1.15,diff:"standard"}],
  ["Elite mid std (flag only)",   ()=>[flagship("gunline")], {enemy:6,type:"elite",zm:1.3,diff:"standard"}],
  ["Elite mid std (flag+frig)",   ()=>[flagship("gunline"),frigate()], {enemy:6,type:"elite",zm:1.3,diff:"standard"}],
  ["Bounty std (flag+frig)",      ()=>[flagship("saboteur"),frigate()], {enemy:5,type:"bounty",zm:1.3,diff:"standard"}],
  ["Elite far std (full fleet)",  ()=>[flagship("gunline"),frigate(),carrier()], {enemy:6,type:"elite",zm:1.6,diff:"standard"}],
  ["BOSS std (full fleet)",       ()=>[flagship("gunline"),frigate(),carrier()], {enemy:2,type:"boss",diff:"standard"}],
  ["BOSS std (flag+frig)",        ()=>[flagship("gunline"),frigate()], {enemy:2,type:"boss",diff:"standard"}],
  ["BOSS hard (full fleet)",      ()=>[flagship("gunline"),frigate(),carrier()], {enemy:2,type:"boss",diff:"hard"}],
  ["Skirmish z1 brutal (flag)",   ()=>[flagship("gunline")], {enemy:0,type:"fight",zm:1.0,diff:"brutal"}],
  ["Elite mid brutal (full)",     ()=>[flagship("gunline"),frigate(),carrier()], {enemy:6,type:"elite",zm:1.45,diff:"brutal"}],
  ["Bulwark skirmish z2 std",     ()=>[flagship("bulwark")], {enemy:3,type:"fight",zm:1.0,diff:"standard"}],
  ["Saboteur skirmish z2 std",    ()=>[flagship("saboteur")], {enemy:3,type:"fight",zm:1.0,diff:"standard"}],
  ["Carrier-heavy vs Locust std", ()=>[flagship("gunline"),carrier(),carrier()], {enemy:7,type:"elite",zm:1.45,diff:"standard"}],
];
console.log("N="+N+" per scenario\n");
SCEN.forEach(([name,mk,node])=>{ console.log(name.padEnd(34), fmt(trials(N,1234,mk,node))); });
