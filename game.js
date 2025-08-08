// game.js — version corrigée + PNG preload + déplacement horizontal + météorites

// === DOM / Canvas ===
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestEl  = document.getElementById('best');
const pauseBtn = document.getElementById('pauseBtn');
const overlay  = document.getElementById('overlay');
const finalScoreEl = document.getElementById('finalScore');
const finalBestEl  = document.getElementById('finalBest');
const retryBtn = document.getElementById('retryBtn');
const bossBanner = document.getElementById('bossBanner');

// (optionnel) intro
const intro   = document.getElementById('intro');
const startBtn= document.getElementById('startBtn');

let DPR=1, W=0, H=0;
function resize(){
  DPR = Math.min(2, window.devicePixelRatio||1);
  W = Math.floor(window.innerWidth);
  H = Math.floor(window.innerHeight);
  canvas.style.width = W+'px';
  canvas.style.height= H+'px';
  canvas.width  = Math.floor(W*DPR);
  canvas.height = Math.floor(H*DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
addEventListener('resize', resize);
resize();

// === Input ===
let holding=false;
const keys = {};
function down(e){ holding=true; e.preventDefault(); }
function up(e){ holding=false; e.preventDefault(); }
addEventListener('pointerdown', down, {passive:false});
addEventListener('pointerup',   up,   {passive:false});
addEventListener('keydown', e=>{ keys[e.code]=true; if(e.code==='Space'||e.code==='ArrowUp') holding=true; });
addEventListener('keyup',   e=>{ keys[e.code]=false; if(e.code==='Space'||e.code==='ArrowUp') holding=false; });

function vibrate(ms){ if(navigator.vibrate){ try{ navigator.vibrate(ms);}catch(e){} } }

// === UI ===
let paused=false, over=false, gameStarted=false;
if (pauseBtn) pauseBtn.onclick = ()=>{ paused=!paused; pauseBtn.textContent = paused ? '▶' : 'II'; };
if (retryBtn) retryBtn.onclick = ()=>{ overlay.classList.add('hidden'); startGame(true); };
if (startBtn) startBtn.onclick = ()=>{ if(intro) intro.style.display='none'; startGame(true); };

// === Entities ===
const R = { x:0, y:0, vx:0, vy:0, w:36, h:72, shieldTime:0 };
const stars=[], sats=[], shields=[], missiles=[], meteors=[]; // + meteors
let boss=null, nextMissile=0;

let lastSat=0,  satInterval=1200;
let lastShield=0, shieldInterval=12000;
let lastMeteor=0, meteorInterval=1600;

const SHIELD_DURATION=3000;
const SAT_SIZES = [{r:22,speed:2.2},{r:32,speed:2.0},{r:44,speed:1.8}];
const BOSS_SCORE_THRESHOLD=900;
const BOSS_REPEAT_EVERY=1400;
const BOSS_DURATION=12000;
const MISSILE_INTERVAL=900;

let score=0, best=parseInt(localStorage.getItem('rocket_best_sf')||'0',10);
bestEl && (bestEl.textContent = 'BEST: '+best);
let lastTime=0;

// === Assets (précharge + fallback) ===
const assets = {
  rocket: new Image(),
  satellite: new Image(),
  boss: new Image()
};
const ready = { rocket:false, satellite:false, boss:false };

assets.rocket.onload = ()=> ready.rocket=true;
assets.rocket.onerror= ()=> ready.rocket=false;
assets.satellite.onload = ()=> ready.satellite=true;
assets.satellite.onerror= ()=> ready.satellite=false;
assets.boss.onload = ()=> ready.boss=true;
assets.boss.onerror= ()=> ready.boss=false;

// IMPORTANT : casse du dossier = 'assets' en MINUSCULE
assets.rocket.src    = 'assets/rocket.png';
assets.satellite.src = 'assets/satellite.png';
assets.boss.src      = 'assets/boss.png';

// === Helpers ===
function initStars(){
  stars.length=0;
  for(let i=0;i<140;i++){
    stars.push({x:Math.random()*W, y:Math.random()*H, z:1+Math.random()*3});
  }
}
function clamp(v,a,b){ return v<a?a : v>b?b : v; }
function dist(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.sqrt(dx*dx+dy*dy); }
function AABB(ax,ay,aw,ah,bx,by,bw,bh){ return ax<bx+bw && ax+aw>bx && ay<by+bh && ay+ah>by; }

function reset(){
  R.x=W*0.35; R.y=H*0.6; R.vx=0; R.vy=0; R.shieldTime=0;
  sats.length=shields.length=missiles.length=meteors.length=0;
  score=0; over=false;
  satInterval=1200; lastSat=0; lastShield=0; lastMeteor=0;
  boss=null; nextMissile=0;
  initStars();
}

function startGame(resetToo=false){
  if (resetToo) reset();
  over=false; paused=false; gameStarted=true;
  if (overlay) overlay.classList.add('hidden');
  if (pauseBtn) pauseBtn.classList.remove('hidden');
  lastTime=0; requestAnimationFrame(loop);
}

// === Spawns ===
function spawnSatellite(){
  const k = SAT_SIZES[(Math.random()*SAT_SIZES.length)|0];
  const y = -k.r*2-10;
  const x = Math.random()*(W - k.r*4) + k.r*2;
  sats.push({x,y,r:k.r, vy:k.speed, rot:Math.random()*Math.PI, vr:(Math.random()*0.02-0.01)});
}
function spawnShield(){
  const r=24, y=-r*2-10, x=Math.random()*(W-r*4)+r*2;
  shields.push({x,y,r,vy:2.0});
}
// NOUVEAU : barres de météorites (AABB)
function spawnMeteor(){
  const width = Math.random()* (W*0.65) + W*0.2; // 20% à 85% de la largeur
  const x = Math.random()*(W - width);
  const y = -30;
  const h = 16 + Math.random()*10;
  meteors.push({x,y,w:width,h,vy:2.2+Math.random()*1});
}

function maybeSpawnBoss(){
  const gate = BOSS_SCORE_THRESHOLD + Math.floor(score/BOSS_REPEAT_EVERY)*BOSS_REPEAT_EVERY;
  if (!boss && score>=gate){
    boss = { x: W*0.2+Math.random()*W*0.6, y: 60, vx:(Math.random()<0.5?1:-1)*(1.2+Math.random()*0.6), t: performance.now() };
    nextMissile = performance.now()+600;
    if (bossBanner){ bossBanner.style.display='block'; setTimeout(()=> bossBanner.style.display='none', 1500); }
  }
}
function shootMissile(){ if(boss){ missiles.push({x:boss.x, y:boss.y+34, vx:(R.x-boss.x)*0.004, vy:3.6}); } }

// === Update ===
function update(dtMs){
  if (over || paused || !gameStarted) return;
  const now = performance.now();

  // Contrôles fusée
  const accelY = holding ? -0.6 : 0.4;
  const accelX = (keys['ArrowLeft']||keys['KeyA'] ? -0.45 : 0) + (keys['ArrowRight']||keys['KeyD'] ? 0.45 : 0);
  R.vy = clamp(R.vy + accelY, -4.5, 4.5);
  R.vx = clamp((R.vx*0.85) + accelX, -4.0, 4.0); // léger amorti
  R.y  = clamp(R.y + R.vy, 0, H - R.h);
  R.x  = clamp(R.x + R.vx, 20, W - 20);

  if (R.shieldTime>0) R.shieldTime -= dtMs;

  // Score
  score += Math.max(1, Math.floor(dtMs*0.02));
  scoreEl && (scoreEl.textContent = score);
  if (score > best){ best=score; bestEl && (bestEl.textContent='BEST: '+best); localStorage.setItem('rocket_best_sf', best); }

  // Spawns
  if (now - lastSat    > satInterval)   { spawnSatellite(); lastSat=now; satInterval = 1000 + Math.random()*600; }
  if (now - lastShield > shieldInterval){ spawnShield();   lastShield=now; }
  if (now - lastMeteor > meteorInterval){ spawnMeteor();   lastMeteor=now; meteorInterval = 1400 + Math.random()*600; }

  // Satellites
  for (let i=sats.length-1;i>=0;i--){
    const s=sats[i]; s.y+=s.vy; s.rot+=s.vr;
    if (s.y - s.r > H) sats.splice(i,1);
    else if (dist(R,s) < s.r + R.w*0.35){
      if (R.shieldTime<=0){ vibrate(200); return gameOver(); }
      else { sats.splice(i,1); R.shieldTime=0; vibrate(40); }
    }
  }

  // Shields
  for (let i=shields.length-1;i>=0;i--){
    const b=shields[i]; b.y+=b.vy;
    if (b.y - b.r > H) shields.splice(i,1);
    else if (dist(R,b) < b.r + R.w*0.4){ shields.splice(i,1); R.shieldTime=SHIELD_DURATION; vibrate(60); }
  }

  // Météorites (barres)
  for (let i=meteors.length-1;i>=0;i--){
    const m=meteors[i]; m.y += 2.2;
    if (m.y > H+40) meteors.splice(i,1);
    else if (AABB(R.x-R.w/2,R.y-R.h/2,R.w,R.h, m.x,m.y,m.w,m.h)){
      if (R.shieldTime<=0){ vibrate(200); return gameOver(); }
      else { meteors.splice(i,1); R.shieldTime=0; vibrate(40); }
    }
  }

  // Boss + missiles
  if (!boss && score > BOSS_SCORE_THRESHOLD) maybeSpawnBoss();
  if (boss){
    boss.x += boss.vx;
    if (boss.x<50 || boss.x>W-50) boss.vx *= -1;
    if (now > nextMissile){ shootMissile(); nextMissile = now + MISSILE_INTERVAL; }
    if (now - boss.t > BOSS_DURATION) boss=null;
  }
  for (let i=missiles.length-1;i>=0;i--){
    const m=missiles[i]; m.x+=m.vx; m.y+=m.vy;
    if (m.y>H || m.x<-40 || m.x>W+40) missiles.splice(i,1);
    else if (dist(R,m) < R.w*0.4){
      if (R.shieldTime<=0){ vibrate(200); return gameOver(); }
      else { missiles.splice(i,1); R.shieldTime=0; vibrate(40); }
    }
  }
}

function gameOver(){
  over=true;
  if (overlay) overlay.classList.remove('hidden');
  if (finalScoreEl) finalScoreEl.textContent = String(score);
  if (finalBestEl)  finalBestEl.textContent  = String(best);
}

// === Draw ===
function draw(){
  ctx.clearRect(0,0,W,H);

  // Fond étoilé
  ctx.fillStyle='#0a0c12'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#ffffff';
  for(const s of stars){
    ctx.globalAlpha = 0.3 + 0.7*(s.z/4);
    ctx.beginPath(); ctx.arc(s.x, s.y, s.z, 0, Math.PI*2); ctx.fill();
    s.y += s.z*0.5; if (s.y>H){ s.y=-10; s.x=Math.random()*W; }
  }
  ctx.globalAlpha=1;

  // Boucliers (bonus)
  for(const b of shields){
    ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2);
    ctx.fillStyle='#00e0ff'; ctx.fill();
  }

  // Satellites
  for(const s of sats){
    ctx.save(); ctx.translate(s.x,s.y); ctx.rotate(s.rot);
    if (ready.satellite) ctx.drawImage(assets.satellite, -s.r, -s.r, s.r*2, s.r*2);
    else { ctx.fillStyle='#e2e5ea'; ctx.fillRect(-s.r*0.35,-s.r*0.35,s.r*0.7,s.r*0.7); }
    ctx.restore();
  }

  // Météorites (barres)
  ctx.fillStyle='#b36b3d';
  for(const m of meteors){ ctx.fillRect(m.x, m.y, m.w, m.h); }

  // Missiles
  ctx.fillStyle='#ff3b30';
  for(const m of missiles){ ctx.beginPath(); ctx.arc(m.x,m.y,6,0,Math.PI*2); ctx.fill(); }

  // Boss
  if (boss){
    if (ready.boss) ctx.drawImage(assets.boss, boss.x-24, boss.y-24, 48, 48);
    else { ctx.fillStyle='#e03b3b'; ctx.fillRect(boss.x-24,boss.y-12,48,24); }
  }

  // Fusée (PNG ou fallback)
  ctx.save(); ctx.translate(R.x, R.y);
  if (ready.rocket) ctx.drawImage(assets.rocket, -R.w/2, -R.h/2, R.w, R.h);
  else {
    ctx.fillStyle = R.shieldTime>0 ? '#00e0ff' : '#ffffff';
    ctx.beginPath(); ctx.moveTo(0,-R.h/2); ctx.lineTo(-R.w/2,R.h/2); ctx.lineTo(R.w/2,R.h/2); ctx.closePath(); ctx.fill();
  }
  // bouclier visuel
  if (R.shieldTime>0){ ctx.globalAlpha=0.45+0.3*Math.sin(performance.now()*0.01); ctx.strokeStyle='rgba(120,210,255,0.8)'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(0,0,36,0,Math.PI*2); ctx.stroke(); ctx.globalAlpha=1; }
  ctx.restore();
}

// === Loop ===
function loop(now=0){
  requestAnimationFrame(loop);
  if (!gameStarted) return; // attend le START si intro présente
  if (!lastTime) lastTime=now;
  const dt = now-lastTime; lastTime=now;
  update(dt);
  draw();
}

// Démarrage : si pas d'intro, on lance direct
if (intro && startBtn){
  // on attend que l'utilisateur clique START
} else {
  startGame(true);
}
