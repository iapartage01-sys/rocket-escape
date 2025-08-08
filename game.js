// game.js — Version complète du jeu minimal

// === Initialisation DOM et Canvas ===
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const pauseBtn = document.getElementById('pauseBtn');
const overlay = document.getElementById('overlay');
const finalScoreEl = document.getElementById('finalScore');
const finalBestEl = document.getElementById('finalBest');
const retryBtn = document.getElementById('retryBtn');
const bossBanner = document.getElementById('bossBanner');

let DPR = 1, W = 0, H = 0;
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = Math.floor(window.innerWidth);
  H = Math.floor(window.innerHeight);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
resize();

let holding = false;
function down(e) { holding = true; e.preventDefault(); }
function up(e) { holding = false; e.preventDefault(); }
window.addEventListener('pointerdown', down, { passive: false });
window.addEventListener('pointerup', up, { passive: false });
window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp') holding = true;
});
window.addEventListener('keyup', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp') holding = false;
});

function vibrate(ms) {
  if (navigator.vibrate) {
    try { navigator.vibrate(ms); } catch (e) {}
  }
}

// === Contrôles & Entités ===
let paused = false;
pauseBtn.onclick = () => {
  paused = !paused;
  pauseBtn.textContent = paused ? '▶' : 'II';
};

retryBtn.onclick = () => {
  overlay.classList.add('hidden');
  reset();
};

const R = { x: 0, y: 0, vy: 0, w: 36, h: 72, shieldTime: 0 };
const stars = [], sats = [], shields = [], missiles = [];
let boss = null, nextMissile = 0;

let lastSat = 0, satInterval = 1200;
let lastShield = 0, shieldInterval = 12000;
const SHIELD_DURATION = 3000;
const SAT_SIZES = [
  { r: 22, speed: 2.2 },
  { r: 32, speed: 2.0 },
  { r: 44, speed: 1.8 }
];
const BOSS_SCORE_THRESHOLD = 900;
const BOSS_REPEAT_EVERY = 1400;
const BOSS_DURATION = 12000;
const MISSILE_INTERVAL = 900;

let score = 0, best = parseInt(localStorage.getItem('rocket_best_sf') || '0', 10);
bestEl.textContent = 'BEST: ' + best;
let over = false, t0 = 0;

function initStars() {
  stars.length = 0;
  for (let i = 0; i < 140; i++) {
    stars.push({ x: Math.random() * W, y: Math.random() * H, z: 1 + Math.random() * 3 });
  }
}

function reset() {
  R.x = W * 0.35;
  R.y = H * 0.6;
  R.vy = 0;
  R.shieldTime = 0;
  sats.length = 0;
  shields.length = 0;
  missiles.length = 0;
  score = 0;
  over = false;
  satInterval = 1200;
  lastSat = 0;
  lastShield = 0;
  boss = null;
  nextMissile = 0;
  t0 = performance.now();
  initStars();
}

function spawnSatellite() {
  const k = SAT_SIZES[(Math.random() * SAT_SIZES.length) | 0];
  const y = -k.r * 2 - 10;
  const x = Math.random() * (W - k.r * 4) + k.r * 2;
  sats.push({ x, y, r: k.r, vy: k.speed, rot: Math.random() * Math.PI, vr: (Math.random() * 0.02 - 0.01) });
}

function spawnShield() {
  const r = 24;
  const y = -r * 2 - 10;
  const x = Math.random() * (W - r * 4) + r * 2;
  shields.push({ x, y, r, vy: 2.0 });
}

function maybeSpawnBoss() {
  const gate = BOSS_SCORE_THRESHOLD + Math.floor(score / BOSS_REPEAT_EVERY) * BOSS_REPEAT_EVERY;
  if (!boss && score >= gate) {
    boss = {
      x: W * 0.2 + Math.random() * W * 0.6,
      y: 60,
      vx: (Math.random() < 0.5 ? 1 : -1) * (1.2 + Math.random() * 0.6),
      t: performance.now()
    };
    nextMissile = performance.now() + 600;
    bossBanner.style.display = 'block';
    setTimeout(() => bossBanner.style.display = 'none', 1500);
  }
}

function shootMissile() {
  if (!boss) return;
  missiles.push({ x: boss.x, y: boss.y + 34, vx: (R.x - boss.x) * 0.004, vy: 3.6 });
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function update(dt) {
  if (over || paused) return;
  const now = performance.now();
  R.vy += holding ? -0.6 : 0.4;
  R.vy = Math.max(-4.5, Math.min(4.5, R.vy));
  R.y += R.vy;
  R.y = Math.max(0, Math.min(H - R.h, R.y));
  if (R.shieldTime > 0) R.shieldTime -= dt;
  score += Math.floor(dt * 0.02);
  scoreEl.textContent = score;
  if (score > best) {
    best = score;
    bestEl.textContent = 'BEST: ' + best;
    localStorage.setItem('rocket_best_sf', best);
  }
  if (now - lastSat > satInterval) { spawnSatellite(); lastSat = now; satInterval = 1000 + Math.random() * 600; }
  if (now - lastShield > shieldInterval) { spawnShield(); lastShield = now; }
  for (let i = sats.length - 1; i >= 0; i--) {
    const s = sats[i]; s.y += s.vy; s.rot += s.vr;
    if (s.y - s.r > H) sats.splice(i, 1);
    else if (dist(R, s) < s.r + R.w * 0.35 && R.shieldTime <= 0) return vibrate(200), gameOver();
  }
  for (let i = shields.length - 1; i >= 0; i--) {
    const b = shields[i]; b.y += b.vy;
    if (b.y - b.r > H) shields.splice(i, 1);
    else if (dist(R, b) < b.r + R.w * 0.4) {
      vibrate(60);
      R.shieldTime = SHIELD_DURATION;
      shields.splice(i, 1);
    }
  }
  if (!boss && score > BOSS_SCORE_THRESHOLD) maybeSpawnBoss();
  if (boss) {
    boss.x += boss.vx;
    if (boss.x < 50 || boss.x > W - 50) boss.vx *= -1;
    if (now > nextMissile) { shootMissile(); nextMissile = now + MISSILE_INTERVAL; }
    if (now - boss.t > BOSS_DURATION) boss = null;
  }
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i]; m.x += m.vx; m.y += m.vy;
    if (m.y > H || m.x < -40 || m.x > W + 40) missiles.splice(i, 1);
    else if (dist(R, m) < R.w * 0.4 && R.shieldTime <= 0) return vibrate(200), gameOver();
  }
}

function gameOver() {
  over = true;
  overlay.classList.remove('hidden');
  finalScoreEl.textContent = score;
  finalBestEl.textContent = best;
}

// Chargement des images PNG
const assets = {
  rocket: new Image(),
  satellite: new Image(),
  boss: new Image()
};
assets.rocket.src = 'assets/rocket.png';
assets.satellite.src = 'assets/satellite.png';
assets.boss.src = 'assets/boss.png';

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0a0c12';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  for (const s of stars) {
    ctx.globalAlpha = 0.3 + 0.7 * (s.z / 4);
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.z, 0, Math.PI * 2);
    ctx.fill();
    s.y += s.z * 0.5;
    if (s.y > H) { s.y = -10; s.x = Math.random() * W; }
  }
  ctx.globalAlpha = 1;
  if (assets.rocket.complete) ctx.drawImage(assets.rocket, R.x - R.w / 2, R.y - R.h / 2, R.w, R.h);
  for (const b of shields) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = '#00e0ff';
    ctx.fill();
  }
  for (const s of sats) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    if (assets.satellite.complete) ctx.drawImage(assets.satellite, -s.r, -s.r, s.r * 2, s.r * 2);
    ctx.restore();
  }
  for (const m of missiles) {
    ctx.beginPath();
    ctx.arc(m.x, m.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ff3b30';
    ctx.fill();
  }
  if (boss && assets.boss.complete) ctx.drawImage(assets.boss, boss.x - 24, boss.y - 24, 48, 48);
}

// Boucle principale
let lastTime = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (!lastTime) lastTime = now;
  const dt = now - lastTime;
  lastTime = now;
  update(dt);
  draw();
}

reset();
loop();
