// Boot, render loop, camera, screens and the glue between game events and the HUD.
import * as THREE from 'three';
import { initMaterials, radialTexture } from './models.js';
import { World, levelConfig, endlessConfig, BIOMES } from './world.js';
import { Game, STAR_AT, RUN_UP } from './game.js';
import { FX } from './fx.js';
import { Input } from './input.js';
import { audio } from './audio.js';
import { save, persist, UPGRADES, SUITS, ANIMALS, totalStars, upCost, suitUnlocked, touchStreak } from './save.js';
import { readChallenge, challengeUrl, snapshot, makeCard, shareResult, resultText, GAME_URL } from './share.js';
import { clamp, damp, fmt, todayKey, dayNumber, smooth } from './util.js';

const $ = id => document.getElementById(id);
const canvas = $('c');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: (devicePixelRatio || 1) < 2.5, powerPreference: 'high-performance' }); }
catch (e) { $('loading').innerHTML = '<b>Tento prehliadač nepodporuje WebGL 😢</b><small>Skús Chrome alebo Safari.</small>'; throw e; }
let pixelRatio = Math.min(devicePixelRatio || 1, 2); renderer.setPixelRatio(pixelRatio);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, 1, .1, 260);
scene.fog = new THREE.FogExp2(0x0c6482, .025); scene.background = new THREE.Color(0x0c6482);
scene.add(new THREE.HemisphereLight(0xd4f7ff, 0x1a4b58, 1.75));
const sun = new THREE.DirectionalLight(0xfff1d6, 1.45); sun.position.set(6, 12, 5); scene.add(sun);
initMaterials();

// God rays + marine snow give depth for almost no cost.
const rays = new THREE.Group(); scene.add(rays);
{ const tex = (() => { const c = document.createElement('canvas'); c.width = 8; c.height = 128; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 8, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6 + Math.random() * 2, 26), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: .12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); m.position.set((i - 3) * 4.5 + Math.random() * 2, 10, -6 + Math.random() * 10); m.rotation.set(0, Math.random() * .6, .35); m.userData.ph = Math.random() * 6; rays.add(m); } }
const snowGeo = new THREE.BufferGeometry(), SNOW = 260, snowPos = new Float32Array(SNOW * 3);
for (let i = 0; i < SNOW; i++) { snowPos[i * 3] = (Math.random() - .5) * 40; snowPos[i * 3 + 1] = Math.random() * 12; snowPos[i * 3 + 2] = (Math.random() - .5) * 40; }
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ size: .09, color: 0xdffaff, transparent: true, opacity: .55, map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), depthWrite: false })); snow.frustumCulled = false; scene.add(snow);

const world = new World(scene), fx = new FX(scene, camera, $('fx')), game = new Game(scene, world, fx);
const input = new Input($('app'), $('joy'), $('knob'));
audio.enabled = save.sound; audio.musicOn = save.music;

// ---------------- state ----------------
let state = 'loading', T = 0, stateT = 0, current = null, before = null, after = null, result = null, captureBefore = false, captureAfter = false, deferredInstall = null;
const challenge = readChallenge(); let activeVs = null, shownCoins = 0, lastHearts = -1, lastStars = -1, bloomSound = 0, frameAvg = 16, lowCheck = 0;
const cam = { pos: new THREE.Vector3(0, 20, 14), look: new THREE.Vector3(), orbit: 0 };
const dailyConfig = day => endlessConfig(day * 7919 + 3, day);
const newSeed = () => (Math.random() * 4294967295) >>> 0;
const fogTarget = new THREE.Color();

function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  fx.setScale(h * renderer.getPixelRatio(), camera.fov);
}
addEventListener('resize', resize); visualViewport?.addEventListener('resize', resize);

function followPose() { const a = camera.aspect, h = a < .8 ? 17 : 12.5, d = a < .8 ? 7 : 6.5; return { h, d }; }
function overviewPose(S, out) {
  const hf = Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect), need = S * (camera.aspect < .8 ? .62 : .5) / Math.tan(Math.min(hf, camera.fov * Math.PI / 360)), D = Math.max(18, need);
  out.pos.set(0, D * .86, D * .5); out.look.set(0, 0, -.5); return out;
}

function updateCamera(dt) {
  const p = game.p, S = world.S || 30; let pos = new THREE.Vector3(), look = new THREE.Vector3();
  if (state === 'home') { cam.orbit += dt * .07; const R = S * .55; pos.set(Math.sin(cam.orbit) * R, S * .42 + 4, Math.cos(cam.orbit) * R); look.set(0, 0, 0); cam.pos.lerp(pos, 1 - Math.exp(-dt * 2)); cam.look.lerp(look, 1 - Math.exp(-dt * 2)); }
  else if (state === 'intro' || state === 'celebrate' || state === 'outro' || (state === 'end' && result?.overview)) {
    const ov = overviewPose(world.viewSize(), { pos: new THREE.Vector3(), look: new THREE.Vector3() }), f = followPose();
    const fp = new THREE.Vector3(p.x, f.h, p.z + f.d), fl = new THREE.Vector3(p.x, 0, p.z - 1);
    if (state === 'intro') { const k = smooth(clamp((stateT - .9) / 1.3, 0, 1)); pos.lerpVectors(ov.pos, fp, k); look.lerpVectors(ov.look, fl, k); cam.pos.copy(pos); cam.look.copy(look); }
    else { cam.orbit += dt * .12; ov.pos.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(cam.orbit) * .25); cam.pos.lerp(ov.pos, 1 - Math.exp(-dt * 2.2)); cam.look.lerp(ov.look, 1 - Math.exp(-dt * 2.2)); }
  } else {
    const f = followPose(); const lx = p.x + p.vx * .35, lz = p.z + p.vz * .3;
    cam.pos.x = damp(cam.pos.x, lx, 5, dt); cam.pos.z = damp(cam.pos.z, lz + f.d, 5, dt); cam.pos.y = damp(cam.pos.y, f.h, 3, dt);
    cam.look.x = damp(cam.look.x, lx, 6, dt); cam.look.z = damp(cam.look.z, lz - 1, 6, dt); cam.look.y = 0;
  }
  camera.position.copy(cam.pos); const s = fx.shakeAmt;
  if (s > 0) camera.position.add(new THREE.Vector3((Math.random() - .5) * s, (Math.random() - .5) * s, (Math.random() - .5) * s));
  camera.lookAt(cam.look);
  scene.fog.density = .5 / Math.max(10, camera.position.distanceTo(cam.look));
  rays.position.set(cam.look.x, 0, cam.look.z); rays.children.forEach(r => { r.userData.ph += dt * .3; r.material.opacity = .07 + Math.sin(r.userData.ph) * .05; });
  snow.position.set(Math.floor(cam.look.x / 40) * 40, 0, Math.floor(cam.look.z / 40) * 40);
}

function setBiomeLook(b) { scene.fog.color.set(b.fog); scene.background.set(b.fog); }

// ---------------- HUD ----------------
const hud = { pct: $('pctFill'), pctT: $('pctText'), o2: $('o2Fill'), o2T: $('o2Text'), o2Box: document.querySelector('.o2'), coins: $('coinText'), coinBox: $('coinBox'), hearts: $('hearts'), combo: $('combo'), mult: $('comboMult'), cbar: $('comboFill'), score: $('scoreText'), stars: document.querySelectorAll('.pstar') };
const TIER_AT = [0, 14, 45, 100, 180];
// Upgrade dock: rebuilt only when affordability or levels change.
let dockSig = '';
function updateDock(force = false) {
  const sig = RUN_UP.map(u => [game.runUp[u.id], game.coins >= game.runCost(u.id) ? 1 : 0].join(':')).join('|');
  if (!force && sig === dockSig) return; dockSig = sig; const d = $('dock');
  d.innerHTML = RUN_UP.map(u => { const lv = game.runUp[u.id], max = lv >= u.max, c = game.runCost(u.id), can = !max && game.coins >= c;
    return `<button data-run="${u.id}" class="${can ? 'can' : ''} ${max ? 'max' : ''}"><span class="di">${u.icon}</span><span class="dn">${u.name}</span><span class="dc">${max ? 'MAX' : `<span class="coin"></span>${fmt(c)}`}</span>${u.max < 20 ? `<span class="dp">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</span>` : ''}</button>`; }).join('');
}
$('dock').addEventListener('click', e => { const b = e.target.closest('[data-run]'); if (!b || state !== 'play') return; if (game.buyRun(b.dataset.run)) { audio.buy(); vibrate(20); updateDock(true); } else { audio.ui(); } });
function updateHud() {
  if (current?.endless) { const all = world.unlocked >= 3, k = all ? world.pct() : Math.min(1, world.regionPct() / .7); hud.pct.style.width = (k * 100).toFixed(1) + '%'; hud.pctT.textContent = (all ? '🪸 ' : '🔓 ') + Math.floor(k * 100) + ' %'; updateDock(); }
  else { const pct = world.pct(); hud.pct.style.width = (pct * 100).toFixed(1) + '%'; hud.pctT.textContent = Math.floor(pct * 100) + ' %'; }
  const o = game.o2 / game.maxO2; hud.o2.style.width = clamp(o * 100, 0, 100) + '%'; hud.o2T.textContent = Math.ceil(game.o2); hud.o2Box.classList.toggle('low', game.o2 < 10);
  $('vignette').classList.toggle('low', game.o2 < 10 && !game.ended);
  if (shownCoins < game.coins) shownCoins = Math.min(game.coins, shownCoins + Math.max(1, (game.coins - shownCoins) * .2)); else shownCoins = game.coins; hud.coins.textContent = fmt(shownCoins);
  if (game.hearts !== lastHearts) { lastHearts = game.hearts; hud.hearts.innerHTML = [0, 1, 2].map(i => `<span class="${i < game.hearts ? '' : 'gone'}">❤️</span>`).join(''); }
  if (game.starsGot !== lastStars) { lastStars = game.starsGot; hud.stars.forEach((s, i) => s.classList.toggle('on', i < game.starsGot)); }
  const on = game.fever > 0 || game.tier > 0; hud.combo.classList.toggle('on', on); hud.combo.classList.toggle('fever', game.fever > 0);
  if (game.fever > 0) { hud.mult.textContent = 'FEVER ×5'; hud.cbar.style.width = (game.fever / 7 * 100) + '%'; }
  else { hud.mult.textContent = '×' + (game.tier + 1); const a = TIER_AT[game.tier], b = TIER_AT[game.tier + 1] || a + 1; hud.cbar.style.width = clamp((game.combo - a) / (b - a), 0, 1) * 100 + '%'; }
  hud.score.textContent = fmt(game.score) + ' b';
}

let bannerTimer = 0;
function banner(html, cls = '') { const b = $('banner'); b.className = ''; void b.offsetWidth; b.innerHTML = html; b.className = 'show ' + cls; clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.className = '', 1900); }
let hintTimer = 0;
function hint(html, ms = 3000) { const h = $('hint'); h.innerHTML = html; h.classList.add('on'); clearTimeout(hintTimer); if (ms) hintTimer = setTimeout(() => h.classList.remove('on'), ms); }
function hideHint() { $('hint').classList.remove('on'); }
let toastTimer = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 2400); }
const vibrate = ms => { if (save.haptics && navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) try { navigator.vibrate(ms); } catch { } };
const tips = save.tips || (save.tips = {});
const tipOnce = (k, html, ms) => { if (tips[k]) return; tips[k] = 1; persist(); hint(html, ms); };

// ---------------- game events ----------------
game.on('tier', ({ tier }) => { banner(`KOMBO ×${tier + 1}`, 'gold'); hud.combo.classList.remove('pop'); void hud.combo.offsetWidth; hud.combo.classList.add('pop'); vibrate(15); });
game.on('fever', () => { banner('🌈 FEVER!<small>obrovský dosah · ×5 body</small>', 'gold'); $('vignette').classList.add('fever'); vibrate([20, 40, 20]); });
game.on('feverEnd', () => $('vignette').classList.remove('fever'));
game.on('star', ({ n }) => { banner(`${'★'.repeat(n)}<small>${n === 3 ? 'perfektný útes!' : n === 1 ? 'útes zachránený · pokračuj na ★★' : 'ešte kúsok do ★★★'}</small>`, 'gold'); vibrate(30); });
game.on('milestone', ({ pct }) => { if (pct !== .75) banner(`Útes ožíva · ${pct * 100} %`); });
game.on('rescue', ({ id, first }) => { const a = ANIMALS.find(x => x.id === id); banner(`${a.emoji} Zachránené!<small>${a.name} ti teraz pomáha čistiť</small>`, 'pink'); vibrate([30, 30, 60]); if (first) setTimeout(() => toast(`Nový kamarát v zbierke: ${a.emoji} ${a.name}`), 1600); persist(); });
game.on('shark', () => { banner('🦈 Žralok!', 'red'); tipOnce('shark', '💥 Pusť palec = sonar pulz odplaší žraloka', 4500); });
game.on('hit', ({ hearts, lost }) => { $('vignette').classList.add('hurt'); setTimeout(() => $('vignette').classList.remove('hurt'), 350); hud.hearts.classList.remove('hit'); void hud.hearts.offsetWidth; hud.hearts.classList.add('hit'); if (lost) fx.text(game.p.x, 1.5, game.p.z, `-${lost}◈`, 'big'); if (hearts === 1) hint('❤️ Posledný život! Červený pás = uhni.', 3000); });
game.on('lowO2', () => { banner('Málo kyslíka!', 'red'); hint('🫧 Chyť bublinu O₂', 2500); vibrate([50, 50, 50]); });
game.on('coins', ({ x, y, z, n }) => fx.coinsFly(x, y, z, n, hud.coinBox, () => { audio.tally(); hud.coinBox.classList.remove('bump'); void hud.coinBox.offsetWidth; hud.coinBox.classList.add('bump'); }));
game.on('trashCombo', ({ n }) => fx.text(game.p.x, 2, game.p.z, `ODPAD ×${n}!`, 'gold big'));
game.on('haptic', ({ ms }) => vibrate(ms));
game.on('o2', () => vibrate(20));
game.on('end', d => onEnd(d));
game.on('region', ({ name }) => { banner(`🔓 Nová oblasť!<small>${name} · plný kyslík · +1 ❤️</small>`, 'gold'); vibrate([30, 40, 60]); });
game.on('spill', () => { banner('⚠️ Únik ropy!<small>vysaj sud, kým sa ropa rozleje</small>', 'red'); tipOnce('spill', '🛢️ Sud podrž chvíľu pod hubicou', 3500); });
game.on('spillStopped', () => vibrate([20, 30, 20]));

// ---------------- flow ----------------
function show(id, on = true) { $(id).hidden = !on; }
function hideScreens() { for (const id of ['home', 'panel', 'end', 'pause', 'intro']) show(id, false); }

function goHome() {
  hideScreens(); show('hud', false); input.enabled = false; input.reset(); state = 'home'; stateT = 0; activeVs = null;
  const cfg = { ...levelConfig(Math.max(1, save.level)), trash: 0, sharks: 0, jellies: 0, animal: null, clams: 0 };
  game.start(cfg); world.showcase(); world.update(0, 0, 0); world.tickBloomAll(5); game.ended = true; game.sucking = false;
  for (let i = 0; i < 28; i++) { const q = world.randomPoint(game.r, {}); game.addFish(q.x, q.z); }
  setBiomeLook(world.biome); renderHome(); show('home'); $('vignette').className = '';
}

function renderHome() {
  $('homeCoins').textContent = fmt(save.coins); $('homePearls').textContent = fmt(save.pearls);
  $('streak').textContent = save.streak.count > 1 ? `🔥 ${save.streak.count} dni` : '';
  $('bestLine').textContent = save.best.endless ? `🏆 Rekord: ${fmt(save.best.endless)} b` : '';
  $('levelsInfo').textContent = `${save.level} · ${totalStars()} ★`;
  $('dailyBadge').hidden = save.daily.day === todayKey();
  $('shopBadge').hidden = !UPGRADES.some(u => save.up[u.id] < u.max && upCost(u.id) <= save.coins);
  const t = save.totals; $('totals').textContent = t.dives ? `Spolu si vyčistil ${fmt(t.cleaned)} m² dna · ${fmt(t.trash)} kusov odpadu · ${fmt(t.animals)} zachránených zvierat` : 'Každý ponor = čistejší oceán 🌊';
  const cc = $('challengeCard');
  if (challenge && !challenge.done) {
    cc.hidden = false; cc.innerHTML = `<div>🏆</div><div><b>${esc(challenge.name)} ťa vyzýva!</b><small>${challenge.daily ? 'Denná výzva' : challenge.endless ? 'Expedícia' : 'Level ' + challenge.level} · ${fmt(challenge.score)} bodov</small></div><button id="acceptBtn">Prijať</button>`;
    $('acceptBtn').onclick = () => { audio.ui(); activeVs = challenge; startLevel(challenge.daily ? dailyConfig(challenge.daily) : challenge.endless ? endlessConfig(challenge.seed) : levelConfig(challenge.level), challenge); };
  } else cc.hidden = true;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function startLevel(cfg, vs = activeVs) {
  audio.unlock(); hideScreens(); activeVs = vs || null; current = cfg; result = null; before = after = null;
  game.start(cfg); setBiomeLook(world.biome); shownCoins = 0; lastHearts = -1; lastStars = -1;
  $('hud').classList.toggle('endless', !!cfg.endless); show('dock', !!cfg.endless); dockSig = ''; if (cfg.endless) updateDock(true);
  overviewPose(world.viewSize(), cam); scene.fog.density = .5 / cam.pos.distanceTo(cam.look); camera.position.copy(cam.pos); camera.lookAt(cam.look);
  state = 'intro'; stateT = 0; captureBefore = true; input.enabled = true; input.reset();
  show('hud'); $('vignette').className = ''; $('banner').className = ''; hideHint();
  const intro = $('intro'); intro.hidden = false; intro.style.animation = 'none'; void intro.offsetWidth; intro.style.animation = '';
  $('introSub').textContent = cfg.daily ? `DENNÁ VÝZVA #${dayNumber()}` : cfg.endless ? 'EXPEDÍCIA' : `LEVEL ${cfg.n}`;
  $('introTitle').textContent = cfg.endless ? 'Zmy čo najviac!' : world.biome.name;
  $('introGoal').textContent = cfg.endless ? (vs ? `Prekonaj ${vs.name}: ${fmt(vs.score)} b` : 'Mince míňaj dole na vylepšenia') : cfg.animal ? 'Zmy špinu a zachráň zvieratko zo siete' : cfg.sharks ? 'Pozor na žraloky · zmy celé dno' : 'Zmy špinu z dna · ★ pri 60 %';
  save.totals.dives++; persist();
  if (!tips.move) { hint('<span class="finger">👆</span> Ťahaj palcom kdekoľvek', 0); }
}

function onEnd({ reason, perfect }) {
  const win = reason === 'win';
  result = { win, reason, perfect, pct: perfect ? 1 : world.pct(), stars: perfect ? 3 : game.starsGot, committed: false, endless: !!current.endless, overview: win || !!current.endless };
  input.enabled = false; input.reset(); $('vignette').classList.remove('low', 'fever'); hideHint();
  if (current.endless) { state = 'outro'; stateT = 0; const best = save.best[current.daily ? 'd' + current.daily : 'endless'] || 0; if (game.score > best && best) { audio.fanfare(); fx.confetti(game.p.x, 1, game.p.z, world.biome.corals, 50); banner('🏆 NOVÝ REKORD!', 'gold'); } else { audio.fail(); banner(reason === 'o2' ? 'Došiel kyslík…' : 'Žralok ťa zahnal…', 'red'); } return; }
  if (win) { state = 'celebrate'; stateT = 0; world.bloomAll(game.p.x, game.p.z); audio.fanfare(); fx.confetti(game.p.x, 1, game.p.z, world.biome.corals, 60); vibrate([40, 60, 40, 60, 120]); for (let i = 0; i < 40; i++) { const q = world.randomPoint(game.r, {}); game.addFish(q.x, q.z); } banner(perfect ? '✨ PERFEKTNÉ! ✨<small>100 % útesu obnovené</small>' : 'ÚTES ZACHRÁNENÝ!', 'gold'); }
  else { state = 'fail'; stateT = 0; audio.fail(); banner(reason === 'o2' ? 'Došiel kyslík…' : 'Žralok ťa zahnal…', 'red'); }
}

function computeRewards() {
  const r = result, cfg = current;
  r.area = Math.round(world.doneCount * world.cell * world.cell);
  r.time = Math.floor(game.time / 60) + ':' + String(Math.floor(game.time % 60)).padStart(2, '0');
  r.animals = game.rescued.map(id => ANIMALS.find(a => a.id === id).emoji);
  if (cfg.endless) {
    r.score = game.score; r.coins = Math.floor(r.score / 150); r.pearls = game.pearls; r.regions = world.unlocked + 1;
    const key = cfg.daily ? 'd' + cfg.daily : 'endless'; r.prevBest = save.best[key] || 0; r.record = r.score > r.prevBest && r.score > 0;
    r.vs = activeVs ? { name: activeVs.name, score: activeVs.score, won: r.score > activeVs.score } : null; if (r.vs?.won) r.coins += 50; return;
  }
  const timeBonus = r.win ? Math.round(game.o2) * 30 : 0, perfectBonus = r.perfect ? 2000 : 0;
  r.timeBonus = timeBonus; r.score = game.score + timeBonus + perfectBonus;
  r.coins = game.coins + (r.win ? r.stars * 15 + (cfg.n || 8) * 3 : 0); r.pearls = game.pearls;
  const key = cfg.daily ? 'd' + cfg.daily : cfg.n; r.prevBest = save.best[key] || 0; r.record = r.score > r.prevBest && r.score > 0;
  r.vs = activeVs ? { name: activeVs.name, score: activeVs.score, won: r.score > activeVs.score } : null;
  if (r.vs?.won) r.coins += 50;
  r.time = Math.floor(game.time / 60) + ':' + String(Math.floor(game.time % 60)).padStart(2, '0');
  r.animals = game.rescued.map(id => ANIMALS.find(a => a.id === id).emoji);
}

function commit() {
  const r = result; if (!r || r.committed) return; r.committed = true; const cfg = current;
  // Deltas: a revived run commits again later without double counting.
  const prev = game.committed || (game.committed = { coins: 0, pearls: 0, area: 0, trash: 0, animals: 0, sharks: 0, time: 0 });
  r.streakBonus = touchStreak(); save.coins += r.coins - prev.coins + r.streakBonus; save.pearls += r.pearls - prev.pearls;
  const key = cfg.daily ? 'd' + cfg.daily : cfg.endless ? 'endless' : cfg.n; if (cfg.endless && !cfg.daily && r.score > (save.best.endless || 0)) save.bestSeed = cfg.seed; save.best[key] = Math.max(save.best[key] || 0, r.score);
  if (r.win && !cfg.daily) { save.stars[cfg.n] = Math.max(save.stars[cfg.n] || 0, r.stars); if (cfg.n >= save.level) save.level = cfg.n + 1; }
  if (cfg.daily) { save.daily.day = todayKey(); save.daily.best = Math.max(save.daily.day === todayKey() ? save.daily.best : 0, r.score); save.daily.played++; }
  const t = save.totals; t.cleaned += r.area - prev.area; t.trash += game.trashCount - prev.trash; t.animals += game.rescued.length - prev.animals; t.sharks += game.sharksScared - prev.sharks; t.playSec += Math.round(game.time) - prev.time;
  Object.assign(prev, { coins: r.coins, pearls: r.pearls, area: r.area, trash: game.trashCount, animals: game.rescued.length, sharks: game.sharksScared, time: Math.round(game.time) });
  if (activeVs && r.vs?.won) activeVs.done = true;
  persist();
}

function showEnd() {
  computeRewards(); const r = result, cfg = current; state = 'end'; stateT = 0;
  hideScreens(); show('hud', false); show('end'); commit();
  $('endStars').hidden = !!cfg.endless; $('endPctLabel').textContent = cfg.endless ? 'bodov' : 'útesu obnovené'; $('endL1').textContent = cfg.endless ? 'VYČISTENÉ' : 'SKÓRE'; $('endL2').textContent = 'ZÍSKAL SI';
  if (cfg.endless) return showEndEndless();
  $('endEyebrow').textContent = cfg.daily ? `DENNÁ VÝZVA #${dayNumber()}` : `LEVEL ${cfg.n} · ${world.biome.name.toUpperCase()}`;
  $('endTitle').textContent = r.win ? (r.perfect ? 'Perfektný útes!' : r.stars >= 2 ? 'Útes rozkvitol!' : 'Útes zachránený!') : r.reason === 'o2' ? 'Došiel kyslík' : 'Žralok ťa zahnal';
  const stars = $('endStars').children; for (const s of stars) s.classList.remove('on');
  for (let i = 0; i < r.stars; i++) setTimeout(() => { stars[i].classList.add('on'); audio.star(i); vibrate(25); }, 450 + i * 380);
  countUp($('endPct'), 0, Math.round(r.pct * 100), 900, v => v + ' %');
  countUp($('endScore'), 0, r.score, 1300, fmt); countUp($('endCoins'), 0, r.coins, 1300, v => '+' + fmt(v) + ' ◈' + (r.pearls ? `  +${r.pearls} ✦` : ''));
  $('endRecord').hidden = !r.record || !r.prevBest;
  const missing = STAR_AT[Math.min(2, r.stars)] - r.pct;
  $('endNear').textContent = r.stars < 3 && missing > 0 && missing < .12 ? `Chýbalo len ${Math.max(1, Math.ceil(missing * 100))} % do ${'★'.repeat(r.stars + 1)}!` : r.win && r.timeBonus ? `Bonus za kyslík +${fmt(r.timeBonus)} b` : '';
  const vs = $('endVs'); if (r.vs) { vs.hidden = false; vs.innerHTML = r.vs.won ? `🏆 Porazil si ${esc(r.vs.name)}! (+50 ◈)` : `${esc(r.vs.name)} vedie o ${fmt(r.vs.score - r.score)} b · skús znova!`; } else vs.hidden = true;
  const rs = $('endRescue'); if (game.rescued.length) { rs.hidden = false; rs.innerHTML = game.rescued.map(id => { const a = ANIMALS.find(x => x.id === id); return `${a.emoji} ${a.name} je v bezpečí!`; }).join('<br>'); } else rs.hidden = true;
  drawShot($('shotBefore'), before); drawShot($('shotAfter'), after || snapshot(canvas));
  const btns = $('endBtns'); btns.innerHTML = '';
  const add = (html, cls, fn) => { const b = document.createElement('button'); b.className = cls; b.innerHTML = html; b.onclick = () => { audio.ui(); fn(b); }; btns.appendChild(b); return b; };
  if (r.win) {
    add(r.vs && !r.vs.won ? '↻ Odveta' : cfg.daily ? '⌂ Domov' : '▶ Ďalší level', 'big primary', () => { if (r.vs && !r.vs.won) startLevel(cfg); else if (cfg.daily) goHome(); else startLevel(levelConfig(cfg.n + 1), null); });
    add('📤 Zdieľať a vyzvať', 'big share', b => doShare(b));
    const row = document.createElement('div'); row.className = 'row'; btns.appendChild(row);
    for (const [h, f] of [['↻ Znova', () => startLevel(cfg)], ['⌂ Domov', goHome]]) { const b = document.createElement('button'); b.className = 'mid'; b.textContent = h; b.onclick = () => { audio.ui(); f(); }; row.appendChild(b); }
    if (deferredInstall && cfg.n >= 2 && !tips.install) { tips.install = 1; persist(); add('📲 Pridať hru na plochu', 'mid', () => promptInstall()); }
  } else {
    if (!game.continued) {
      if (save.pearls + game.pearls >= 3) add('💜 Druhá šanca +20 s · 3 ✦', 'big primary', () => { save.pearls -= 3; if (save.pearls < 0) { game.pearls += save.pearls; save.pearls = 0; } persist(); revive(); });
      add('📤 Zdieľaj a pokračuj', 'big share', async b => { const res = await doShare(b, true); if (res !== 'cancel') revive(); });
    }
    add('↻ Skúsiť znova', game.continued || save.pearls < 3 ? 'big primary' : 'mid', () => startLevel(cfg));
    add('⌂ Domov', 'mid', goHome);
  }
}

function showEndEndless() {
  const r = result, cfg = current;
  $('endEyebrow').textContent = cfg.daily ? `DENNÁ VÝZVA #${dayNumber()}` : 'EXPEDÍCIA';
  $('endTitle').textContent = r.record ? 'Nový rekord! 🏆' : r.reason === 'o2' ? 'Došiel kyslík' : 'Žralok ťa zahnal';
  countUp($('endPct'), 0, r.score, 1300, fmt); countUp($('endScore'), 0, r.area, 1100, v => fmt(v) + ' m²');
  countUp($('endCoins'), 0, r.coins, 1300, v => '+' + fmt(v) + ' ◈' + (r.pearls ? `  +${r.pearls} ✦` : ''));
  $('endRecord').hidden = !r.record || !r.prevBest;
  $('endNear').textContent = !r.record && r.prevBest && r.score > r.prevBest * .8 ? `Chýbalo len ${fmt(r.prevBest - r.score + 1)} b do rekordu!` : `Oblasti ${r.regions}/4 · ${game.trashCount} kusov odpadu · ${r.time}`;
  const vs = $('endVs'); if (r.vs) { vs.hidden = false; vs.innerHTML = r.vs.won ? `🏆 Porazil si ${esc(r.vs.name)}! (+50 ◈)` : `${esc(r.vs.name)} vedie o ${fmt(r.vs.score - r.score)} b · skús znova!`; } else vs.hidden = true;
  const rs = $('endRescue'); if (game.rescued.length) { rs.hidden = false; rs.innerHTML = game.rescued.map(id => { const a = ANIMALS.find(x => x.id === id); return `${a.emoji} ${a.name} je v bezpečí!`; }).join('<br>'); } else rs.hidden = true;
  drawShot($('shotBefore'), before); drawShot($('shotAfter'), after || snapshot(canvas));
  const btns = $('endBtns'); btns.innerHTML = '';
  const add = (html, cls, fn) => { const b = document.createElement('button'); b.className = cls; b.innerHTML = html; b.onclick = () => { audio.ui(); fn(b); }; btns.appendChild(b); return b; };
  if (!game.continued) {
    if (save.pearls >= 3) add('💜 Pokračovať +20 s · 3 ✦', 'big primary', () => { save.pearls -= 3; persist(); revive(); });
    add('📤 Zdieľaj a pokračuj', 'big share', async b => { const res = await doShare(b, true); if (res !== 'cancel') revive(); });
  }
  add('↻ Nový ponor', game.continued ? 'big primary' : 'mid', () => startLevel(cfg.daily || (r.vs && !r.vs.won) ? cfg : endlessConfig(newSeed()), r.vs && !r.vs.won ? activeVs : null));
  if (game.continued) add('📤 Zdieľať a vyzvať', 'big share', b => doShare(b));
  add('⌂ Domov', 'mid', goHome);
}

function revive() { hideScreens(); show('hud'); if (current.endless) { show('dock'); updateDock(true); } result = null; game.revive(); state = 'play'; input.enabled = true; input.reset(); audio.bubble(); banner('Druhá šanca! 💪', 'gold'); }

function drawShot(el, src) { if (!src) { el.width = 4; el.height = 3; return; } el.width = 320; el.height = 240; const x = el.getContext('2d'); const s = Math.max(320 / src.width, 240 / src.height); x.drawImage(src, (320 - src.width * s) / 2, (240 - src.height * s) / 2, src.width * s, src.height * s); }

function countUp(el, a, b, ms, f) { const t0 = performance.now(); const step = now => { const k = Math.min(1, (now - t0) / ms), v = Math.round(a + (b - a) * (1 - Math.pow(1 - k, 3))); el.textContent = f(v); if (k < 1) { if (Math.random() < .4) audio.tally(); requestAnimationFrame(step); } }; requestAnimationFrame(step); }

async function doShare(btn, forContinue = false) {
  if (!result.score && result.score !== 0) computeRewards();
  const r = result, cfg = current, title = cfg.daily ? `Denná výzva #${dayNumber()}` : cfg.endless ? 'Expedícia · nekonečný ponor' : `Level ${cfg.n} · ${world.biome.name}`;
  const card = makeCard({ before, after: after || snapshot(canvas), title, pct: r.pct, stars: r.stars, score: r.score, animals: r.animals, sub: cfg.daily ? 'Zahraj si dnešnú výzvu 👉' : 'Prekonáš moje skóre? 👉', ...(cfg.endless ? { big: fmt(r.score), line: `bodov · ${fmt(r.area)} m² oceánu vyčistené` } : {}) });
  const text = resultText({ level: cfg.n, daily: cfg.daily, pct: r.pct, stars: r.stars, score: r.score, emoji: cfg.daily ? world.emojiGrid(5) : '', animals: r.animals, time: r.time, endless: cfg.endless, area: r.area });
  btn && (btn.disabled = true); const res = await shareResult({ card, text, url: challengeUrl({ level: cfg.n, score: r.score, daily: cfg.daily, seed: cfg.endless ? cfg.seed : undefined }) }); btn && (btn.disabled = false);
  if (res === 'copied') toast('Text a odkaz skopírované · obrázok uložený 📋');
  if (res !== 'cancel') rewardShare();
  return res;
}
function rewardShare() { if (save.shareDay !== todayKey()) { save.shareDay = todayKey(); save.coins += 50; persist(); setTimeout(() => toast('Ďakujeme za zdieľanie! +50 ◈'), 600); } }

// ---------------- panels ----------------
const panels = {
  levels: { title: '⭐ Levely', render: body => {
    const maxShow = Math.max(save.level + 4, 10);
    body.innerHTML = `<p style="margin:0 0 6px;opacity:.85">Krátke útesy na ★★★. Tu platia trvalé vylepšenia z Výbavy.</p><div class="lvgrid">` + Array.from({ length: maxShow }, (_, i) => { const n = i + 1, st = save.stars[n] || 0, open = n <= save.level;
      return `<button class="lv${n === save.level ? ' cur' : ''}${open ? '' : ' lock'}" ${open ? `data-lv="${n}"` : 'disabled'}>${open ? n : '🔒'}<small>${open ? '★'.repeat(st) + `<span style="opacity:.25">${'★'.repeat(3 - st)}</span>` : ''}</small></button>`; }).join('') + `</div><button class="big primary" data-lv="${save.level}">▶ Level ${save.level}</button>`;
    body.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => { audio.ui(); startLevel(levelConfig(+b.dataset.lv), null); });
  } },
  shop: { title: '🛠️ Výbava', render: body => {
    body.innerHTML = `<p class="card"><span class="coin"></span><b style="font-size:20px">${fmt(save.coins)}</b><small style="margin-left:auto;opacity:.8">trvalé · platia v leveloch</small></p>` + UPGRADES.map(u => { const lv = save.up[u.id], max = lv >= u.max, c = upCost(u.id);
      return `<div class="card"><div class="ic">${u.icon}</div><div class="tx"><b>${u.name}</b><small>${u.desc}</small><div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div><button class="buy" data-buy="${u.id}" ${max || c > save.coins ? 'disabled' : ''}>${max ? 'MAX' : `<span class="coin"></span>${fmt(c)}`}</button></div>`; }).join('');
    body.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => { const id = b.dataset.buy, c = upCost(id); if (save.coins < c) return; save.coins -= c; save.up[id]++; persist(); audio.buy(); vibrate(20); panels.shop.render(body); renderHome(); });
  } },
  friends: { title: '🐢 Kamaráti', render: body => {
    body.innerHTML = '<p style="margin:0 0 10px;opacity:.85">Zachránené zvieratká ťa sprevádzajú a pomáhajú čistiť. Vyber si jedného na ďalší ponor.</p>' + ANIMALS.map((a, i) => { const n = save.animals[a.id] || 0, sel = save.buddy === a.id;
      return `<div class="card"><div class="ic">${n ? a.emoji : '❔'}</div><div class="tx"><b>${n ? a.name : '???'}</b><small>${n ? `zachránené ${n}× · čistí ${Math.round(a.clean * 100)} %` : `zachráň zo siete v leveli ${i + 2}`}</small></div>${n ? `<button class="buy ${sel ? 'sel' : ''}" data-buddy="${a.id}">${sel ? '✓ Ide so mnou' : 'Vybrať'}</button>` : ''}</div>`; }).join('');
    body.querySelectorAll('[data-buddy]').forEach(b => b.onclick = () => { save.buddy = save.buddy === b.dataset.buddy ? null : b.dataset.buddy; persist(); audio.ui(); panels.friends.render(body); });
  } },
  suits: { title: '🤿 Obleky', render: body => {
    const owned = save.suitsOwned || (save.suitsOwned = ['classic']);
    body.innerHTML = `<p style="margin:0 0 10px;opacity:.85">Máš ${totalStars()} ★ a ${save.pearls} ✦. Oblek uvidia aj kamaráti na zdieľanom obrázku.</p>` + SUITS.map(s => { const unlocked = s.req.pearls ? owned.includes(s.id) : suitUnlocked(s), sel = save.suit === s.id;
      const sw = s.rainbow ? 'conic-gradient(#ff6fb4,#ffe36e,#6ff2ff,#b88cff,#ff6fb4)' : `#${s.color.toString(16).padStart(6, '0')}`;
      const btn = sel ? '<button class="buy sel" disabled>✓ Oblečený</button>' : unlocked ? `<button class="buy" data-suit="${s.id}">Obliecť</button>` : s.req.pearls ? `<button class="buy" data-pearl="${s.id}" ${save.pearls < s.req.pearls ? 'disabled' : ''}>${s.req.pearls} ✦</button>` : `<button class="buy" disabled>🔒 ${s.req.stars} ★</button>`;
      return `<div class="card"><div class="swatch" style="background:${sw}"></div><div class="tx"><b>${s.name}</b><small>${s.glow ? 'svieti v tme' : s.rainbow ? 'mení farby' : 'klasika'}</small></div>${btn}</div>`; }).join('');
    body.querySelectorAll('[data-suit]').forEach(b => b.onclick = () => { save.suit = b.dataset.suit; persist(); audio.buy(); panels.suits.render(body); goHome(); show('panel'); });
    body.querySelectorAll('[data-pearl]').forEach(b => b.onclick = () => { const s = SUITS.find(x => x.id === b.dataset.pearl); if (save.pearls < s.req.pearls) return; save.pearls -= s.req.pearls; owned.push(s.id); save.suit = s.id; persist(); audio.buy(); panels.suits.render(body); goHome(); show('panel'); });
  } },
  settings: { title: '⚙️ Nastavenia', render: body => {
    const tg = (k, label) => `<button class="mid toggle ${save[k] ? '' : 'off'}" data-tg="${k}">${label} ${save[k] ? 'ZAP' : 'VYP'}</button>`;
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) && !navigator.standalone;
    body.innerHTML = `<label style="font-weight:800">Tvoje meno (vidia ho kamaráti vo výzve)</label><input class="field" id="nameField" maxlength="16" placeholder="Potápač" value="${esc(save.name)}"><div class="row" style="margin-top:12px">${tg('sound', '🔊 Zvuk')}${tg('music', '🎵 Hudba')}</div><div class="row" style="margin-top:10px">${tg('haptics', '📳 Vibrácie')}</div>
      ${deferredInstall ? '<button class="big primary" id="installBtn" style="margin-top:14px">📲 Pridať na plochu</button>' : ios ? '<p class="card">📲 iPhone: ťukni na <b>Zdieľať</b> ⎋ a vyber <b>Pridať na plochu</b>.</p>' : ''}
      <p style="opacity:.7;font-size:13px;margin-top:14px">Ocean Restorer Remake · v1.0 · postup sa ukladá v tomto prehliadači.</p>`;
    $('nameField').oninput = e => { save.name = e.target.value.replace(/[<>&"]/g, '').slice(0, 16); persist(); };
    $('nameField').onpointerdown = e => e.stopPropagation();
    body.querySelectorAll('[data-tg]').forEach(b => b.onclick = () => { const k = b.dataset.tg; save[k] = !save[k]; persist(); audio.unlock(); audio.setEnabled(save.sound); audio.setMusic(save.music); audio.ui(); panels.settings.render(body); });
    if ($('installBtn')) $('installBtn').onclick = promptInstall;
  } },
};
function openPanel(id) { audio.unlock(); audio.ui(); const p = panels[id]; $('panelTitle').textContent = p.title; p.render($('panelBody')); show('panel'); }
document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openPanel(b.dataset.open));
$('panelClose').onclick = () => { audio.ui(); show('panel', false); renderHome(); };
$('panel').onclick = e => { if (e.target.id === 'panel') { show('panel', false); renderHome(); } };

$('playBtn').onclick = () => { audio.unlock(); audio.ui(); startLevel(endlessConfig(newSeed()), null); };
$('levelsBtn').onclick = () => openPanel('levels');
$('dailyBtn').onclick = () => { audio.unlock(); audio.ui(); startLevel(dailyConfig(todayKey()), null); };
$('inviteBtn').onclick = async () => {
  audio.unlock(); audio.ui(); const sc = save.best.endless || 0;
  const text = `Hrám Ocean Restorer 🌊 – zmývam špinu z morského dna a zachraňujem zvieratká.${sc ? ` Môj rekord je ${fmt(sc)} bodov. Prekonáš ma?` : ' Skús to!'}`;
  const res = await shareResult({ text, url: sc && save.bestSeed !== undefined ? challengeUrl({ score: sc, seed: save.bestSeed }) : GAME_URL() }); if (res === 'copied') toast('Pozvánka skopírovaná 📋'); if (res !== 'cancel') { rewardShare(); renderHome(); }
};
$('pauseBtn').onclick = () => pause();
$('resumeBtn').onclick = () => resume();
$('restartBtn').onclick = () => { audio.ui(); startLevel(current); };
$('homeBtn').onclick = () => { audio.ui(); goHome(); };
const syncToggles = () => { $('pSound').classList.toggle('off', !save.sound); $('pMusic').classList.toggle('off', !save.music); };
$('pSound').onclick = () => { save.sound = !save.sound; audio.setEnabled(save.sound); persist(); syncToggles(); };
$('pMusic').onclick = () => { save.music = !save.music; audio.setMusic(save.music); persist(); syncToggles(); };
function pause() { if (state !== 'play' && state !== 'intro') return; audio.ui(); state = 'paused'; input.enabled = false; input.reset(); syncToggles(); show('pause'); }
function resume() { audio.ui(); show('pause', false); state = 'play'; input.enabled = true; }
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (!window.__noAutoPause) pause(); audio.ctx?.suspend(); } else audio.ctx?.resume(); });

input.onPress = () => { audio.unlock(); if (!tips.move && state !== 'home') { tips.move = 1; persist(); hint(current?.endless ? 'Zmy čo najviac · mince míňaj dole 👇' : 'Zmy celé dno · ★ pri 60 %', 3000); } };
input.onRelease = () => { if (state === 'play' && game.pulse()) { if (!tips.pulse) { tips.pulse = 1; persist(); } } };
addEventListener('pointerdown', () => audio.unlock(), { once: true });

addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; });
async function promptInstall() { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice.catch(() => { }); deferredInstall = null; }
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => { });

// ---------------- loop ----------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(.05, (now - last) / 1000); last = now; frameAvg = frameAvg * .95 + dt * 1000 * .05;
  T += dt; stateT += dt;
  if (state === 'paused' || state === 'loading') { renderer.render(scene, camera); return; }
  let simDt = dt;
  if (state === 'celebrate' || state === 'outro') simDt = dt * (stateT < .8 ? .35 : 1);
  if (state === 'intro') { if (stateT > 2.2 || (stateT > .5 && ((input.active && Math.hypot(input.x, input.z) > .2) || input.keys.size))) { state = 'play'; $('intro').hidden = true; } game.animateIdle(dt); }
  else if (state === 'play') game.update(dt, input);
  else game.animateIdle(simDt);
  const bloomed = world.update(simDt, T, game.fever > 0 ? 1 : 0, state === 'celebrate' || (state === 'end' && result?.win) || state === 'home');
  if (bloomed.length) { game.queueFish(bloomed); for (const c of bloomed.slice(0, 4)) fx.sparkle(c.x, .5, c.z, c.color, 5, 1.8, .3); bloomSound -= dt; if (bloomSound <= 0) { bloomSound = .18; audio.bloom(Math.floor(Math.random() * 8)); } }
  if (state === 'celebrate') { if (Math.random() < .3) fx.confetti((Math.random() - .5) * world.S * .6, 3, (Math.random() - .5) * world.S * .6, world.biome.corals, 3); if (stateT > 2.6 && !after) captureAfter = true; if (stateT > 3) showEnd(); }
  if (state === 'fail' && stateT > 1.4) showEnd();
  if (state === 'outro') { if (stateT > 1.8 && !after) captureAfter = true; if (stateT > 2.3) showEnd(); }
  if (current?.endless && game.p && state !== 'home') { fogTarget.set(world.biomeAt(game.p.x, game.p.z).fog); scene.fog.color.lerp(fogTarget, 1 - Math.exp(-dt * 1.5)); scene.background.copy(scene.fog.color); }
  const nozzle = game.diver ? game.diver.userData.nozzle.getWorldPosition(new THREE.Vector3()) : null;
  fx.update(dt, nozzle);
  updateCamera(simDt);
  audio.update(dt, { sucking: state === 'play' && game.sucking, combo: game.combo, speed: Math.hypot(game.p?.vx || 0, game.p?.vz || 0) / 5, intensity: state !== 'play' ? 0 : game.fever > 0 ? 3 : game.tier >= 3 ? 2 : game.tier >= 1 ? 1 : 0 });
  if (state === 'play' || state === 'intro') updateHud();
  if (!tips.move && state === 'play' && input.keys.size) { tips.move = 1; persist(); hideHint(); }
  renderer.render(scene, camera);
  if (captureBefore) { captureBefore = false; before = snapshot(canvas); }
  if (captureAfter) { captureAfter = false; after = snapshot(canvas); }
  // Adaptive resolution keeps older phones smooth.
  lowCheck += dt; if (lowCheck > 3) { lowCheck = 0; if (frameAvg > 24 && pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - .5); renderer.setPixelRatio(pixelRatio); resize(); } }
}

resize(); goHome();
setTimeout(() => $('loading').classList.add('done'), 1500);
requestAnimationFrame(t => { last = t; frame(t); setTimeout(() => $('loading').classList.add('done'), 250); });
window.__ocean = { game, world, save, input, startLevel, levelConfig, endlessConfig, goHome, get state() { return state; } };
