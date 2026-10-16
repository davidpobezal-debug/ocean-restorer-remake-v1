// Gameplay simulation: diver, cleaning, combo/fever, trash, rescues, sharks, jellyfish, pickups.
import * as THREE from 'three';
import { rng, clamp, damp, angleLerp } from './util.js';
import { mats, buildDiver, buildShark, fishGeometry, trashGeometries, TRASH, buildNet, buildAnimal, ANIMAL_SCALE, buildJelly, buildClam, buildO2 } from './models.js';
import { save, SUITS, ANIMALS } from './save.js';
import { audio } from './audio.js';
import { BIOMES, RINGS } from './world.js';

export const STAR_AT = [.6, .85, 1];
const TIERS = [0, 14, 45, 100, 180]; // combo thresholds in m² cleaned without a pause
const FEVER_TIME = 7;
// Expedition upgrades: bought mid-dive from the always-visible dock, reset every run (fair score chase).
export const RUN_UP = [
  { id: 'range', icon: '◎', name: 'Dosah', base: 40, max: 6 },
  { id: 'power', icon: 'ϟ', name: 'Výkon', base: 45, max: 6 },
  { id: 'speed', icon: '➜', name: 'Plutvy', base: 35, max: 6 },
  { id: 'pulse', icon: '✹', name: 'Pulz', base: 50, max: 5 },
  { id: 'o2', icon: '🫧', name: '+25 s', base: 30, max: 99 },
];
const TRASH_KINDS = ['bottle', 'can', 'bag', 'bottle', 'can', 'bag', 'tire', 'barrel'];

export class Game {
  constructor(scene, world, fx) {
    this.scene = scene; this.world = world; this.fx = fx; this.listeners = {};
    this.trashGeo = trashGeometries();
    this.fishMesh = new THREE.InstancedMesh(fishGeometry(), mats.flat, 90); this.fishMesh.count = 0; this.fishMesh.frustumCulled = false; scene.add(this.fishMesh);
    this.lanes = []; this.tmp = new THREE.Object3D(); this.col = new THREE.Color();
    this.group = new THREE.Group(); scene.add(this.group);
    // Pulse-charge ring and finishing guide arrow live with the diver.
    this.chargeRing = new THREE.Mesh(new THREE.RingGeometry(.95, 1.08, 40, 1, 0, Math.PI * 2), mats.ring.clone()); this.chargeRing.rotation.x = -Math.PI / 2; this.chargeRing.position.y = .05; scene.add(this.chargeRing);
    const ag = new THREE.ConeGeometry(.32, .7, 3); ag.rotateX(Math.PI / 2); this.arrow = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: .9, depthWrite: false })); this.arrow.visible = false; scene.add(this.arrow);
    this.beacon = new THREE.Sprite(mats.glowSprite.clone()); this.beacon.material.color.set(0xfff27a); this.beacon.visible = false; scene.add(this.beacon);
    this.trail = 0;
  }
  on(t, f) { (this.listeners[t] ||= []).push(f); }
  emit(t, d = {}) { for (const f of this.listeners[t] || []) f(d); }

  runCost(id) { const u = RUN_UP.find(x => x.id === id); return Math.round(u.base * Math.pow(id === 'o2' ? 1.45 : 1.6, this.runUp[id])); }
  buyRun(id) {
    const u = RUN_UP.find(x => x.id === id); if (!u || this.ended || this.runUp[id] >= u.max) return false; const c = this.runCost(id); if (this.coins < c) return false;
    this.coins -= c; this.runUp[id]++; if (id === 'o2') { this.o2 = Math.min(this.maxO2 + 40, this.o2 + 25); this.fx.text(this.p.x, 1.6, this.p.z, '+25 s O₂', 'o2 big'); }
    this.fx.sparkle(this.p.x, 1, this.p.z, 0xffe36e, 14, 3); this.fx.ring(this.p.x, this.p.z, 2.2, 0xffe36e, .45); this.emit('upgrade', { id }); return true;
  }

  stats() {
    const E = this.cfg?.endless, r = this.runUp || {}, u = E ? { range: r.range * 1.3, power: r.power * 1.4, speed: r.speed * 1.3, pulse: r.pulse * 1.4, magnet: r.range * .4 } : save.up, f = this.fever > 0;
    return {
      radius: (1.15 + u.range * .12) * (f ? 1.45 : 1), rate: 4.4 * (1 + u.power * .15) * (f ? 1.4 : 1), speed: 4.4 * (1 + u.speed * .055) * (f ? 1.2 : 1),
      cooldown: Math.max(2.2, 4.6 - u.pulse * .3), pulseR: 4 + u.pulse * .35, pulseClean: 2.1 + u.pulse * .15, suck: 2 + u.range * .1 + u.magnet * .45,
    };
  }

  start(cfg) {
    this.clear(); this.cfg = cfg; const w = this.world; w.build(cfg); const r = this.r = rng(cfg.seed + 99);
    const suit = SUITS.find(s => s.id === save.suit) || SUITS[0];
    this.diver = buildDiver(suit); this.group.add(this.diver);
    const area = w.validCount * w.cell * w.cell;
    this.maxO2 = cfg.endless ? 80 : clamp(Math.round(18 + area / 5.2 * (1.1 + Math.min(.5, cfg.oil + cfg.crust))), 45, 160) + save.up.o2 * 6; this.o2 = this.maxO2;
    this.runUp = { range: 0, power: 0, speed: 0, pulse: 0, o2: 0 }; this.nextTrash = 5; this.nextSpill = 38; this.spill = null; this.trickle = 0; this.coinAcc = 0; this.perfect = false; this.pendingFish = [];
    this.animalQueue = ANIMALS.map(a => a.id).sort(() => r() - .5);
    Object.assign(this, { p: { x: 0, z: 0, vx: 0, vz: 0, yaw: Math.PI, lean: 0 }, hearts: 3, invuln: 0, charge: 1, score: 0, coins: 0, pearls: 0, combo: 0, comboT: 0, tier: 0, fever: 0, plinkStep: 0, plinkAcc: 0,
      time: 0, ended: false, sucking: false, starsGot: 0, milestone: 0, trashCombo: 0, trashT: 0, rescued: [], sharksScared: 0, trashCount: 0, nextO2: 9, lowWarned: false, guideT: 0, guideTarget: null, sweepT: 0, continued: false, freeCleanT: 0, paused: false, kills: 0, pctShown: 0 });
    const avoid = [{ x: 0, z: 0, r: 3.5 }, w.centerpiece];
    // Trash on the dirty seabed.
    for (let i = 0; i < cfg.trash; i++) {
      const type = cfg.n > 0 && cfg.n < 3 && i % 4 === 3 ? 'tire' : TRASH_KINDS[Math.min(7, Math.floor(r() * (cfg.n > 0 && cfg.n < 3 ? 6 : cfg.endless ? 7 : 8)))];
      const p = w.randomPoint(r, { avoid, clearance: .4 }); this.addTrash(type, p.x, p.z); avoid.push({ x: p.x, z: p.z, r: 1 });
    }
    // Rescue: an animal trapped in a ghost net.
    if (cfg.animal) { const p = w.randomPoint(r, { minR: w.S * .22, clearance: 1.2, avoid }); this.makeCage(cfg.animal, p); avoid.push({ x: p.x, z: p.z, r: 2.5 }); }
    if (save.buddy && save.animals[save.buddy]) this.addFollower(save.buddy, 0, 1.5, true);
    for (let i = 0; i < cfg.clams; i++) { const p = w.randomPoint(r, { minR: 4, avoid, clearance: .4 }); const m = buildClam(); m.position.set(p.x, -.4, p.z); m.visible = false; this.group.add(m); this.clams.push({ m, x: p.x, z: p.z, state: 'hidden', t: 0 }); avoid.push({ ...p, r: 1.5 }); }
    for (let i = 0; i < cfg.sharks; i++) this.spawnShark(i, 10 + i * 9);
    for (let i = 0; i < cfg.jellies; i++) { const p = w.randomPoint(r, { minR: 8, avoid }); const m = buildJelly(); m.position.set(p.x, 0, p.z); this.group.add(m); this.jellies.push({ m, x: p.x, z: p.z, ox: p.x, oz: p.z, ph: r() * 6, vx: 0, vz: 0 }); }
    for (let i = 0; i < 3; i++) this.addFish(0, 0, true);
    this.emit('start', { maxO2: this.maxO2 });
  }

  addTrash(type, x, z, fall = false) {
    const mesh = new THREE.Mesh(this.trashGeo[type], mats.flat); mesh.position.set(x, fall ? 7 : .12, z); mesh.rotation.y = Math.random() * 6; mesh.scale.setScalar(1.5); this.group.add(mesh);
    const t = { type, mesh, x, z, state: fall ? 'fall' : 'idle', hold: 0, t: Math.random() * 6, vx: 0, vy: 0, vz: 0 }; this.trash.push(t); return t;
  }

  makeCage(id, p) {
    const g = new THREE.Group(); const a = buildAnimal(id); a.scale.setScalar(ANIMAL_SCALE[id]); a.position.y = .5; g.add(a);
    const net = buildNet(); g.add(net); g.position.set(p.x, 0, p.z); this.group.add(g);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.45, 40, 1, 0, .001), new THREE.MeshBasicMaterial({ color: 0xffe36e, transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = .06; g.add(ring);
    this.cage = { id, g, a, net, ring, x: p.x, z: p.z, hold: 0, freed: false, t: 0 };
  }

  // Expedition: a new ring opens – fill it with trash, pearls, a trapped animal and (deeper) jellyfish.
  populateRegion(n) {
    const w = this.world, r = this.r, minR = RINGS[n - 1] + 1, maxR = n >= 3 ? w.S * .46 : RINGS[n] - .8, avoid = [...w.centerpieces];
    for (let i = 0; i < 7 + n * 3; i++) { const p = w.randomPoint(r, { minR, maxR, shape: true, clearance: .4, avoid }); this.addTrash(TRASH_KINDS[Math.floor(r() * 8)], p.x, p.z); }
    for (let i = 0; i < 2; i++) { const p = w.randomPoint(r, { minR, maxR, shape: true, clearance: .4, avoid }); const m = buildClam(); m.position.set(p.x, -.4, p.z); m.visible = false; this.group.add(m); this.clams.push({ m, x: p.x, z: p.z, state: 'hidden', t: 0 }); }
    if (!this.cage && this.animalQueue.length) { const p = w.randomPoint(r, { minR, maxR, shape: true, clearance: 1.2, avoid }); this.makeCage(this.animalQueue.shift(), p); }
    if (n >= 2) for (let i = 0; i < 2; i++) { const p = w.randomPoint(r, { minR, maxR, shape: true }); const m = buildJelly(); m.position.set(p.x, 0, p.z); this.group.add(m); this.jellies.push({ m, x: p.x, z: p.z, ox: p.x, oz: p.z, ph: r() * 6, vx: 0, vz: 0 }); }
  }

  updateEndless(dt) {
    const w = this.world, p = this.p;
    if (w.unlocked < 3 && w.reveal >= w.revealTarget && w.regionPct(w.unlocked) >= .7) {
      w.unlock(); const b = BIOMES[w.biomeOf[w.unlocked]];
      this.o2 = Math.max(this.o2, this.maxO2); this.hearts = Math.min(3, this.hearts + 1); this.score += 1000 * w.unlocked; this.coins += 40;
      audio.fanfare(); this.fx.shake(.3); this.fx.ring(p.x, p.z, 8, b.rim, 1.2); this.emit('haptic', { ms: [30, 40, 60] }); this.emit('region', { n: w.unlocked, name: b.name });
      this.populateRegion(w.unlocked);
    }
    // Trash keeps sinking from the surface…
    this.nextTrash -= dt;
    if (this.nextTrash <= 0) { this.nextTrash = Math.max(2.4, 6 - this.time / 70); if (this.trash.length < 30) { const q = w.pointNear(p.x, p.z, 4, 12); if (q) this.addTrash(TRASH_KINDS[Math.floor(Math.random() * 7)], q.x, q.z, true); } }
    // …and leaking barrels re-pollute the reef until you vacuum them up.
    this.nextSpill -= dt;
    if (this.nextSpill <= 0 && !this.spill) { this.nextSpill = Math.max(15, 34 - this.time / 12); const q = w.pointNear(p.x, p.z, 6, 13); if (q) { const t = this.addTrash('barrel', q.x, q.z, true); t.spill = true; this.spill = { x: q.x, z: q.z, r: .8, t: 0, barrel: t }; this.emit('spill'); audio.sharkWarn(); } }
    const sp = this.spill;
    if (sp) { if (!this.trash.includes(sp.barrel) || sp.barrel.state === 'fly') { this.spill = null; }
      else if (sp.barrel.state === 'idle') { sp.t += dt; if (sp.t > .6 && sp.r < 4.2) { sp.t = 0; sp.r += .3; w.pollute(sp.x, sp.z, sp.r); for (let i = 0; i < 6; i++) this.fx.debris(sp.x + (Math.random() - .5) * sp.r, sp.z + (Math.random() - .5) * sp.r, 0x15111c); } } }
    // Sharks join as the dive goes on.
    const want = this.time < 30 ? 0 : Math.min(4, 1 + Math.floor((this.time - 30) / 55)); if (this.sharks.length < want) this.spawnShark(this.sharks.length, 1);
  }

  clear() {
    for (const o of [...this.group.children]) this.group.remove(o);
    this.trash = []; this.sharks = []; this.jellies = []; this.clams = []; this.pickups = []; this.followers = []; this.fish = []; this.cage = null; this.fishMesh.count = 0;
    for (const l of this.lanes) this.scene.remove(l); this.lanes = []; this.fx?.clear();
  }

  addFollower(id, x, z, buddy = false) {
    const a = buildAnimal(id); a.scale.setScalar(ANIMAL_SCALE[id] * .75); a.position.set(this.p.x + x, .8, this.p.z + z); this.group.add(a);
    const def = ANIMALS.find(q => q.id === id); this.followers.push({ id, m: a, x: a.position.x, z: a.position.z, yaw: 0, slot: this.followers.length, clean: def.clean, buddy });
  }

  spawnShark(i, delay) {
    const m = buildShark(); m.visible = false; this.group.add(m);
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1).translate(0, .5, 0), mats.danger.clone()); lane.rotation.x = -Math.PI / 2; lane.visible = false; this.scene.add(lane); this.lanes.push(lane);
    const lvl = this.cfg.endless ? 4 + this.time / 25 : this.cfg.n;
    this.sharks.push({ m, lane, state: 'wait', t: -delay, x: 0, z: 0, yaw: 0, dir: { x: 0, z: 1 }, ang: i * 2.1, speed: 2.4 + Math.min(1.2, lvl * .05), windup: Math.max(.6, .95 - lvl * .015), roll: 0 });
  }

  addFish(x, z, anywhere = false) {
    if (this.fish.length >= 90) return; const r = this.r; const hue = r();
    const c = new THREE.Color([0xff8a3d, 0x37c8ff, 0xffe14a, 0xff6fb4, 0x7bffb0, 0xa98bff, 0xff5a5a][Math.floor(hue * 7)]);
    const home = anywhere ? { x: (r() - .5) * 6, z: (r() - .5) * 6 } : { x, z };
    this.fish.push({ x: home.x, y: .2, z: home.z, vx: 0, vy: 0, vz: 0, home, tx: home.x, ty: .9, tz: home.z, t: 0, s: .55 + r() * .55, c, ph: r() * 6 });
  }

  pulse() {
    if (this.ended || this.charge < 1) return false;
    const s = this.stats(), p = this.p; this.charge = 0;
    audio.pulse(); this.fx.ring(p.x, p.z, s.pulseR, 0x9ffcf0, .7); this.fx.ring(p.x, p.z, s.pulseClean, 0xffffff, .4); this.fx.shake(.25); this.emit('haptic', { ms: 25 });
    const res = this.world.brush(p.x, p.z, s.pulseClean, 2.2); this.onCleaned(res.done, true);
    for (let i = 0; i < 24; i++) { const a = i / 24 * 6.28; this.fx.debris(p.x + Math.cos(a) * s.pulseClean * .8, p.z + Math.sin(a) * s.pulseClean * .8, this.world.biomeAt(p.x, p.z).rim); }
    for (const sh of this.sharks) if (['patrol', 'stalk', 'windup', 'dash', 'tired'].includes(sh.state) && Math.hypot(sh.x - p.x, sh.z - p.z) < s.pulseR + 1) {
      sh.state = 'stunned'; sh.t = 0; sh.lane.visible = false; this.sharksScared++; this.score += 150; this.coins += 15; audio.stun();
      this.fx.text(sh.x, 1.6, sh.z, 'Odplašený! +15◈', 'gold'); this.fx.sparkle(sh.x, 1, sh.z, 0xffe36e, 14);
    }
    for (const j of this.jellies) { const dx = j.x - p.x, dz = j.z - p.z, d = Math.hypot(dx, dz); if (d < s.pulseR) { j.vx += dx / (d || 1) * 7; j.vz += dz / (d || 1) * 7; } }
    for (const t of this.trash) if (t.state === 'idle' && t.mesh.visible && Math.hypot(t.x - p.x, t.z - p.z) < s.pulseR) { t.state = 'fly'; t.vy = 3; }
    this.emit('pulse'); return true;
  }

  onCleaned(done, burst = false) {
    if (!done) return;
    const before = this.world.doneCount - done;
    const area = done * this.world.cell * this.world.cell;
    this.combo += area; this.comboT = burst ? 1.4 : 1.1; this.score += Math.round(area * 10 * (this.tier + 1));
    this.plinkAcc += area; while (this.plinkAcc >= 1.2) { this.plinkAcc -= 1.2; audio.plink(this.plinkStep++); }
    const tier = TIERS.reduce((a, v, i) => this.combo >= v ? i : a, 0);
    if (tier > this.tier && !this.fever) { this.tier = tier; if (tier === 4) { this.fever = FEVER_TIME; audio.fever(); this.emit('fever', {}); this.fx.shake(.2); } else { this.emit('tier', { tier }); audio.coin(1 + tier * .15); } }
    // Percent milestones: soft currency trickle + star pops.
    if (this.cfg.endless) { this.coinAcc += area; while (this.coinAcc >= 4) { this.coinAcc -= 4; this.coins++; } this.trickle += area; while (this.trickle >= 20) { this.trickle -= 20; this.o2 = Math.min(this.maxO2 + 40, this.o2 + 1); } return; }
    const pct = this.world.pct(), whole = Math.floor(pct * 100);
    if (whole > this.pctShown) { const gained = whole - this.pctShown; this.pctShown = whole; this.coins += gained; }
    while (this.starsGot < 3 && pct >= STAR_AT[this.starsGot] - (this.starsGot === 2 ? .0001 : 0)) { this.starsGot++; audio.star(this.starsGot - 1); this.emit('star', { n: this.starsGot }); this.fx.sparkle(this.p.x, 1.5, this.p.z, 0xffe36e, 20, 4); }
    for (const m of [.25, .5, .75]) if (before / this.world.validCount < m && pct >= m) this.emit('milestone', { pct: m });
  }

  update(dt, input) {
    if (this.ended) { this.animateIdle(dt); return; }
    this.time += dt; const w = this.world, p = this.p, s = this.stats();
    // --- movement
    const inp = input.vector(), mag = Math.min(1, Math.hypot(inp.x, inp.z));
    p.vx = damp(p.vx, inp.x * s.speed, 9, dt); p.vz = damp(p.vz, inp.z * s.speed, 9, dt);
    const nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
    if (w.isValid(nx, nz)) { p.x = nx; p.z = nz; }
    else { // slide along rock walls instead of sticking to them
      const sp0 = Math.hypot(p.vx, p.vz), a0 = Math.atan2(p.vx, p.vz); let moved = false;
      for (const da of [.45, -.45, .9, -.9, 1.35, -1.35]) { const a = a0 + da, k = Math.cos(da), tx = p.x + Math.sin(a) * sp0 * k * dt, tz = p.z + Math.cos(a) * sp0 * k * dt; if (w.isValid(tx, tz) && w.isValid(tx + Math.sin(a) * .2, tz + Math.cos(a) * .2)) { p.x = tx; p.z = tz; p.vx = Math.sin(a) * sp0 * k; p.vz = Math.cos(a) * sp0 * k; moved = true; break; } }
      if (!moved) { p.vx *= -.3; p.vz *= -.3; }
    }
    const sp = Math.hypot(p.vx, p.vz); if (sp > .3) p.yaw = angleLerp(p.yaw, Math.atan2(p.vx, p.vz), 1 - Math.exp(-12 * dt));
    // --- cleaning
    const bx = p.x + Math.sin(p.yaw) * .55, bz = p.z + Math.cos(p.yaw) * .55;
    const res = w.brush(bx, bz, s.radius, s.rate * dt * (mag > .05 ? 1 : .7));
    this.sucking = res.touched > 0; this.onCleaned(res.done);
    if (res.touched && Math.random() < .8) for (let i = 0; i < (res.hardTouched ? 3 : 2); i++) this.fx.debris(bx + (Math.random() - .5) * s.radius * 1.6, bz + (Math.random() - .5) * s.radius * 1.6, res.hardTouched ? w.biomeAt(bx, bz).oil : w.biomeAt(bx, bz).dirt);
    // Followers (rescued animals + buddy) help clean.
    this.followers.forEach((f, i) => {
      const a = this.time * .6 + i * 2.1, tx = p.x - Math.sin(p.yaw) * 1.6 + Math.cos(a) * 1.4, tz = p.z - Math.cos(p.yaw) * 1.6 + Math.sin(a) * 1.4;
      const dx = tx - f.x, dz = tz - f.z; f.x += dx * (1 - Math.exp(-2.5 * dt)); f.z += dz * (1 - Math.exp(-2.5 * dt));
      if (Math.hypot(dx, dz) > .05) f.yaw = angleLerp(f.yaw, Math.atan2(dx, dz), 1 - Math.exp(-6 * dt));
      const r2 = w.brush(f.x, f.z, .75 * f.clean, 3 * dt); this.onCleaned(r2.done);
      f.m.position.set(f.x, .7 + Math.sin(this.time * 2 + i) * .12, f.z); f.m.rotation.y = f.yaw; for (const an of f.m.userData.anim) an(this.time, 1.3); f.m.userData.shadow.position.y = -f.m.position.y / f.m.scale.x + .03;
    });
    // --- combo / fever
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0 && !this.fever) { if (this.tier >= 2) this.emit('comboLost', { tier: this.tier }); this.combo = 0; this.tier = 0; this.plinkStep = 0; } }
    if (this.fever > 0) { this.fever -= dt; this.trail += dt; if (this.trail > .03) { this.trail = 0; this.fx.sparkle(p.x, .6, p.z, new THREE.Color().setHSL((this.time * .8) % 1, 1, .6), 1, .6, .5); } if (this.fever <= 0) { this.fever = 0; this.combo = TIERS[2]; this.tier = 2; this.comboT = 1.5; this.emit('feverEnd'); } }
    // --- pulse charge
    this.charge = Math.min(1, this.charge + dt / s.cooldown);
    // --- oxygen
    this.o2 -= dt; if (this.o2 <= 10 && !this.lowWarned) { this.lowWarned = true; this.emit('lowO2'); }
    if (this.o2 > 12) this.lowWarned = false;
    this.nextO2 -= dt; if (this.nextO2 <= 0) { this.nextO2 = 11; if (this.pickups.length < 2 && this.o2 < this.maxO2 * .8) this.spawnO2(this.o2 < this.maxO2 * .3); }
    this.invuln = Math.max(0, this.invuln - dt);
    // --- entities
    this.updateTrash(dt, s, bx, bz); this.updateCage(dt); this.updateClams(dt); this.updatePickups(dt); this.updateSharks(dt); this.updateJellies(dt);
    if (this.ended) return;
    const E = this.cfg.endless; if (E) this.updateEndless(dt);
    // Finishing help: guide arrow to the nearest leftover dirt (or a leaking barrel), and sweep isolated pixels.
    const pct = E ? w.regionPct(w.unlocked) : w.pct();
    if (this.spill && Math.hypot(this.spill.x - p.x, this.spill.z - p.z) > 3) this.guideTarget = { x: this.spill.x, z: this.spill.z };
    else if (pct > (E ? .55 : .82)) { this.sweepT -= dt; if (this.sweepT <= 0) { this.sweepT = .5; const f = w.sweepStragglers(); if (f) this.onCleaned(f); }
      this.guideT -= dt; if (this.guideT <= 0) { this.guideT = .35; this.guideTarget = w.nearestDirty(p.x, p.z); } } else this.guideTarget = null;
    if (!E && w.remainingDirt() <= w.validCount * .012) { this.finishPerfect(); return; }
    this.animate(dt, mag);
    if (this.o2 <= 0) { this.o2 = 0; this.end(!E && this.starsGot >= 1 ? 'win' : 'o2'); }
  }

  finishPerfect() {
    const w = this.world; for (let k = 0; k < w.clean.length; k++) if (w.valid[k] && w.clean[k] < 1) { if (w.clean[k] < .9) w.doneCount++; w.clean[k] = 1; w.tex[k * 4] = 255; }
    w.dirty = true; this.onCleaned(1); this.perfect = true; this.end('win');
  }

  end(reason) {
    if (this.ended) return; this.ended = true; this.endReason = reason; this.sucking = false; this.arrow.visible = this.beacon.visible = false;
    for (const sh of this.sharks) { if (sh.state !== 'wait') sh.state = 'flee'; sh.lane.visible = false; }
    this.emit('end', { reason, perfect: !!this.perfect });
  }

  // Second chance (offered once): refill and keep going.
  revive() { this.ended = false; this.continued = true; this.o2 = Math.max(this.o2, 20); this.hearts = Math.max(this.hearts, 2); this.invuln = 3; this.endReason = null; for (const sh of this.sharks) if (sh.state === 'flee') { sh.state = 'patrol'; sh.t = 0; } }

  damage(src, x, z) {
    if (this.invuln > 0 || this.ended) return;
    this.hearts--; this.invuln = 1.6; const p = this.p, dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz) || 1; p.vx = dx / d * 9; p.vz = dz / d * 9;
    const lost = Math.min(this.coins, Math.ceil(this.coins * .1)); this.coins -= lost;
    audio.hit(); this.fx.shake(.7); this.emit('haptic', { ms: 120 }); this.emit('hit', { hearts: this.hearts, lost, src });
    this.fx.sparkle(p.x, 1, p.z, 0xff4560, 16, 3); this.combo = 0; this.tier = 0; this.fever = 0;
    if (this.hearts <= 0) this.end(!this.cfg.endless && this.starsGot >= 1 ? 'win' : 'hearts');
  }

  spawnO2(close) {
    const w = this.world, p = this.p; let pt;
    if (this.cfg.endless) pt = w.pointNear(p.x, p.z, 5, close ? 9 : 14);
    else for (let i = 0; i < 30; i++) { const q = w.randomPoint(this.r, { clearance: .6 }); const d = Math.hypot(q.x - p.x, q.z - p.z); if (d > 4 && (!close || d < 10)) { pt = q; break; } }
    if (!pt) return; const m = buildO2(); m.position.set(pt.x, 0, pt.z); this.group.add(m); this.pickups.push({ m, x: pt.x, z: pt.z, t: 0 }); this.emit('o2spawn', pt);
  }

  updateTrash(dt, s, bx, bz) {
    const p = this.p, nozzle = { x: bx, y: .35, z: bz };
    this.trashT -= dt; if (this.trashT <= 0) this.trashCombo = 0;
    for (let i = this.trash.length - 1; i >= 0; i--) {
      const t = this.trash[i], def = TRASH[t.type], m = t.mesh; t.t += dt;
      const d = Math.hypot(t.x - bx, t.z - bz);
      if (t.state === 'fall') { m.position.y -= dt * 4; m.rotation.x += dt * 3; m.rotation.z += dt * 2; if (Math.random() < .3) this.fx.bubble(m.position.x, m.position.y, m.position.z, .15, .5); if (m.position.y <= .12) { m.position.y = .12; m.rotation.x = 0; m.rotation.z = 0; t.state = 'idle'; this.fx.sparkle(t.x, .2, t.z, t.spill ? 0x553366 : 0xd8f6ff, 6, 1.5, .3); if (t.spill) audio.hit(); } continue; }
      if (t.state === 'idle') {
        m.visible = Math.hypot(t.x, t.z) <= this.world.reveal + .5;
        m.position.y = .12 + Math.sin(t.t * 1.5) * .03;
        if (m.visible && d < s.suck * (def.hold ? .8 : 1)) { if (def.hold) { t.hold += dt; m.position.x = t.x + Math.sin(t.t * 50) * .05 * t.hold; m.rotation.z = Math.sin(t.t * 40) * .1; if (t.hold >= def.hold) { t.state = 'fly'; t.vy = 2.5; } } else { t.state = 'fly'; t.vy = 2; } }
        else if (t.hold > 0) t.hold = Math.max(0, t.hold - dt * .4);
      } else {
        const dx = nozzle.x - m.position.x, dy = nozzle.y - m.position.y, dz = nozzle.z - m.position.z, l = Math.hypot(dx, dy, dz);
        const acc = 26; t.vx += dx / l * acc * dt; t.vy += dy / l * acc * dt; t.vz += dz / l * acc * dt; const k = Math.exp(-3 * dt); t.vx *= k; t.vy *= k; t.vz *= k;
        m.position.x += t.vx * dt; m.position.y += t.vy * dt; m.position.z += t.vz * dt; m.rotation.x += dt * 9; m.rotation.y += dt * 7;
        m.scale.setScalar(Math.max(.2, Math.min(1.5, l / 1.2 * 1.5)));
        if (l < .35 || t.t > 30) { this.collectTrash(t); this.group.remove(m); this.trash.splice(i, 1); }
      }
    }
  }

  collectTrash(t) {
    const def = TRASH[t.type], mult = this.tier + 1; this.trashCombo++; this.trashT = 2.5; this.trashCount++;
    const value = def.value; this.coins += value; this.score += value * 10 * mult;
    if (t.spill) { this.score += 500 * mult; this.spill = null; this.fx.text(t.mesh.position.x, 1.8, t.mesh.position.z, 'Únik zastavený! +' + 500 * mult, 'gold big'); this.emit('spillStopped'); }
    audio.pop(1 + Math.min(1.5, this.trashCombo * .12)); this.emit('haptic', { ms: 10 });
    this.fx.sparkle(t.mesh.position.x, .5, t.mesh.position.z, 0xfff3a0, 10, 2.5);
    this.fx.text(t.mesh.position.x, .9, t.mesh.position.z, '+' + value + '◈', 'gold' + (def.hold ? ' big' : ''));
    this.emit('coins', { x: t.mesh.position.x, y: .6, z: t.mesh.position.z, n: Math.min(5, 1 + Math.floor(value / 6)) });
    if (this.trashCombo >= 3 && this.trashCombo % 3 === 0) this.emit('trashCombo', { n: this.trashCombo });
  }

  updateCage(dt) {
    const c = this.cage; if (!c) return; const p = this.p; c.t += dt;
    c.g.visible = Math.hypot(c.x, c.z) <= this.world.reveal + 1;
    if (!c.freed) {
      if (!c.g.visible) return;
      const d = Math.hypot(p.x - c.x, p.z - c.z); c.a.rotation.y = Math.sin(c.t * 2) * .4; c.a.position.y = .5 + Math.sin(c.t * 3) * .05; for (const an of c.a.userData.anim) an(c.t, .4);
      c.net.rotation.y += dt * .3; c.net.scale.setScalar(1 + Math.sin(c.t * 4) * .02);
      if (d < 2) { c.hold = Math.min(1.4, c.hold + dt); c.net.position.x = Math.sin(c.t * 40) * .04 * c.hold; if (Math.random() < .3) this.fx.sparkle(c.x + (Math.random() - .5) * 1.5, .8, c.z + (Math.random() - .5) * 1.5, 0xffe36e, 1, 1, .3); }
      else c.hold = Math.max(0, c.hold - dt * .5);
      c.ring.geometry.dispose(); c.ring.geometry = new THREE.RingGeometry(1.25, 1.45, 40, 1, Math.PI / 2, Math.max(.001, c.hold / 1.4 * Math.PI * 2));
      if (c.hold >= 1.4) {
        c.freed = true; c.t = 0; c.g.remove(c.ring); audio.rescue(); this.fx.shake(.25); this.emit('haptic', { ms: 40 });
        this.fx.confetti(c.x, 1, c.z, [0xff7ab8, 0xffe36e, 0x9ffcf0], 30); this.score += 500; this.coins += 25; this.rescued.push(c.id);
        const first = !save.animals[c.id]; save.animals[c.id] = (save.animals[c.id] || 0) + 1;
        this.emit('rescue', { id: c.id, first }); this.fx.text(c.x, 2, c.z, '+500', 'big');
      }
    } else if (c.t < 1.2) {
      const k = c.t / 1.2; c.net.scale.setScalar(1 + k * 2); c.net.material.opacity = 1 - k; c.a.position.y = .5 + Math.sin(k * Math.PI) * 2; c.a.rotation.y += dt * 12;
      if (Math.random() < .5) this.fx.sparkle(c.x, c.a.position.y + .3, c.z, 0xff8fc8, 1, 1, .5);
    } else if (!c.done) {
      c.done = true; c.g.remove(c.net); c.g.remove(c.a); this.addFollower(c.id, c.x - this.p.x, c.z - this.p.z); this.cage = null;
      if (this.followers.length > 3) { const i = this.followers.findIndex(f => !f.buddy); if (i >= 0) { this.group.remove(this.followers[i].m); this.followers.splice(i, 1); } }
    }
  }

  updateClams(dt) {
    for (const c of this.clams) {
      if (c.state === 'hidden') { if (this.world.cleanAt(c.x, c.z) >= .9) { c.state = 'rise'; c.m.visible = true; c.t = 0; audio.bloom(5); this.fx.sparkle(c.x, .3, c.z, 0xf4d7ff, 12); } continue; }
      c.t += dt; const lid = c.m.userData.lid;
      if (c.state === 'rise') { const k = Math.min(1, c.t / .5); c.m.position.y = -.4 + .4 * k; lid.rotation.x = -k * .9; c.m.userData.glow.visible = true; c.m.userData.glow.material.opacity = .5 + Math.sin(c.t * 5) * .3; c.m.userData.pearl.position.y = .16 + Math.sin(c.t * 3) * .03;
        if (Math.hypot(this.p.x - c.x, this.p.z - c.z) < 1.2) { c.state = 'taken'; c.m.userData.pearl.visible = false; c.m.userData.glow.visible = false; this.pearls++; audio.star(2); this.fx.sparkle(c.x, .5, c.z, 0xf4d7ff, 18, 3); this.fx.text(c.x, 1.2, c.z, '+1 ✦ perla', 'pearl big'); this.emit('pearl'); } }
      else if (c.state === 'taken') { lid.rotation.x = Math.min(0, lid.rotation.x + dt); }
    }
  }

  updatePickups(dt) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const q = this.pickups[i]; q.t += dt; q.m.position.y = Math.sin(q.t * 2) * .15; q.m.rotation.y += dt;
      if (Math.random() < .05) this.fx.bubble(q.x, .8, q.z, .2);
      if (Math.hypot(this.p.x - q.x, this.p.z - q.z) < 1.3) { this.o2 = Math.min(this.maxO2 + 10, this.o2 + 10); audio.bubble(); audio.bubble(); this.fx.text(q.x, 1.4, q.z, '+10 s O₂', 'o2 big'); for (let k = 0; k < 14; k++) this.fx.bubble(q.x, .6, q.z, .35, 2.5); this.group.remove(q.m); this.pickups.splice(i, 1); this.emit('o2'); }
    }
  }

  updateSharks(dt) {
    const p = this.p, S = this.world.S;
    for (const sh of this.sharks) {
      sh.t += dt; const m = sh.m, ud = m.userData, dx = p.x - sh.x, dz = p.z - sh.z, d = Math.hypot(dx, dz);
      let moveSpeed = 0, face = null; ud.alert.visible = false; ud.stars.visible = false; sh.lane.visible = false;
      if (sh.state === 'wait') { if (sh.t >= 0) { const a = this.r() * 6.28, E = this.cfg.endless; sh.x = E ? p.x + Math.cos(a) * 13 : Math.cos(a) * S * .52; sh.z = E ? p.z + Math.sin(a) * 13 : Math.sin(a) * S * .52; sh.state = 'patrol'; sh.t = 0; m.visible = true; audio.sharkWarn(); this.emit('shark', { x: sh.x, z: sh.z }); } else continue; }
      if (sh.state === 'patrol') { sh.ang += dt * .25; const E = this.cfg.endless, R = E ? 7 : S * .3, tx = (E ? p.x : 0) + Math.cos(sh.ang) * R, tz = (E ? p.z : 0) + Math.sin(sh.ang) * R; face = Math.atan2(tx - sh.x, tz - sh.z); moveSpeed = sh.speed * .8; if (d < 8 && sh.t > 1.5 && this.invuln <= 0) { sh.state = 'stalk'; sh.t = 0; } }
      else if (sh.state === 'stalk') { face = Math.atan2(dx, dz); moveSpeed = sh.speed; if (d < 5) { sh.state = 'windup'; sh.t = 0; sh.dir = { x: dx / d, z: dz / d }; sh.dashLen = Math.min(11, d + 4); audio.sharkWarn(); } if (sh.t > 9) { sh.state = 'patrol'; sh.t = 0; } }
      else if (sh.state === 'windup') { face = Math.atan2(sh.dir.x, sh.dir.z); ud.alert.visible = true; ud.alert.scale.setScalar(.8 + Math.sin(sh.t * 20) * .1); sh.lane.visible = true; sh.lane.position.set(sh.x, .06, sh.z); sh.lane.rotation.z = Math.atan2(sh.dir.x, sh.dir.z) + Math.PI; sh.lane.scale.set(1, sh.dashLen * Math.min(1, sh.t / .25), 1); sh.lane.material.opacity = .25 + Math.sin(sh.t * 18) * .15; m.position.x = sh.x + Math.sin(sh.t * 60) * .05;
        if (sh.t >= sh.windup) { sh.state = 'dash'; sh.t = 0; audio.whoosh(); } }
      else if (sh.state === 'dash') { face = Math.atan2(sh.dir.x, sh.dir.z); sh.x += sh.dir.x * 13 * dt; sh.z += sh.dir.z * 13 * dt; if (Math.random() < .6) this.fx.bubble(sh.x, .5, sh.z, .3, .5);
        if (d < 1.1) { this.damage('shark', sh.x, sh.z); sh.state = 'tired'; sh.t = 0; } else if (sh.t > sh.dashLen / 13) { sh.state = 'tired'; sh.t = 0; } }
      else if (sh.state === 'tired') { moveSpeed = .6; face = sh.yaw; if (sh.t > 1.5) { sh.state = d < 8 ? 'stalk' : 'patrol'; sh.t = 0; } }
      else if (sh.state === 'stunned') { ud.stars.visible = true; sh.roll = Math.min(Math.PI, sh.roll + dt * 8); if (sh.t > 1.6) { sh.state = 'flee'; sh.t = 0; } }
      else if (sh.state === 'flee') { sh.roll = Math.max(0, sh.roll - dt * 4); face = Math.atan2(-dx, -dz); moveSpeed = 6; if (this.cfg.endless ? d > 17 : Math.hypot(sh.x, sh.z) > S * .62) { sh.state = 'wait'; sh.t = -12; m.visible = false; } }
      if (face !== null) sh.yaw = angleLerp(sh.yaw, face, 1 - Math.exp(-5 * dt));
      if (moveSpeed) { sh.x += Math.sin(sh.yaw) * moveSpeed * dt; sh.z += Math.cos(sh.yaw) * moveSpeed * dt; }
      sh.x = clamp(sh.x, -S * .65, S * .65); sh.z = clamp(sh.z, -S * .65, S * .65);
      if (sh.state !== 'windup') m.position.x = sh.x; m.position.z = sh.z; m.position.y = .55 + Math.sin(sh.t * 2) * .06; m.rotation.set(0, sh.yaw, sh.roll, 'YXZ');
      ud.tail.rotation.y = Math.sin(this.time * (sh.state === 'dash' ? 22 : 8)) * .45; ud.shadow.position.y = -.53;
    }
  }

  updateJellies(dt) {
    const p = this.p;
    for (const j of this.jellies) {
      j.ph += dt; j.vx *= Math.exp(-1.5 * dt); j.vz *= Math.exp(-1.5 * dt);
      j.ox += j.vx * dt; j.oz += j.vz * dt; j.x = j.ox + Math.sin(j.ph * .4) * 2.5; j.z = j.oz + Math.cos(j.ph * .3) * 2.5;
      const pulse = Math.sin(j.ph * 3); j.m.position.set(j.x, .15 + pulse * .1, j.z); j.m.userData.bell.scale.set(1 + pulse * .12, 1 - pulse * .15, 1 + pulse * .12);
      j.m.userData.tent.forEach((t, i) => { t.rotation.x = Math.sin(j.ph * 2 + i) * .3; });
      if (Math.hypot(p.x - j.x, p.z - j.z) < .95) { if (this.invuln <= 0) audio.sting(); this.damage('jelly', j.x, j.z); }
    }
  }

  animate(dt, mag) {
    const p = this.p, d = this.diver, ud = d.userData, t = this.time;
    d.position.set(p.x, .15 + Math.sin(t * 2.4) * .06, p.z); d.rotation.y = p.yaw;
    p.lean = damp(p.lean, .35 + mag * .75, 6, dt); ud.pivot.rotation.x = p.lean;
    const kick = Math.sin(t * (mag > .1 ? 11 : 3.5)) * (.18 + mag * .45); ud.legs[0].rotation.x = kick; ud.legs[1].rotation.x = -kick;
    ud.nozzle.rotation.y = this.sucking ? Math.sin(t * 7) * .2 : 0; ud.nozzle.position.y = .22 + Math.sin(t * 3) * .03;
    ud.shadow.position.y = -d.position.y + .03;
    d.visible = this.invuln <= 0 || Math.floor(t * 14) % 2 === 0;
    if (ud.rainbow) ud.bodyMesh.material.emissive?.setHSL((t * .3) % 1, 1, .3);
    if (Math.random() < dt * 2.5) this.fx.bubble(p.x - Math.sin(p.yaw) * .3, 1.4, p.z - Math.cos(p.yaw) * .3, .18);
    // Pulse-ready ring
    const cr = this.chargeRing, s = this.stats(); cr.position.set(p.x, .05, p.z); cr.scale.setScalar(s.radius * (this.charge >= 1 ? 1 + Math.sin(t * 6) * .04 : .8 + this.charge * .2)); cr.material.opacity = this.charge >= 1 ? .75 : .18; cr.material.color.set(this.charge >= 1 ? (this.fever ? new THREE.Color().setHSL((t * .8) % 1, 1, .65) : 0x9ffcf0) : 0x4c8c90);
    // Guide arrow
    if (this.guideTarget) { const g = this.guideTarget, a = Math.atan2(g.x - p.x, g.z - p.z), dist = Math.hypot(g.x - p.x, g.z - p.z); this.arrow.visible = dist > 2; this.arrow.position.set(p.x + Math.sin(a) * 2.2, .3, p.z + Math.cos(a) * 2.2); this.arrow.rotation.set(0, a, 0); this.arrow.material.opacity = .6 + Math.sin(t * 8) * .3; this.beacon.visible = true; this.beacon.position.set(g.x, .6 + Math.sin(t * 4) * .2, g.z); this.beacon.scale.setScalar(1.6 + Math.sin(t * 6) * .3); }
    else { this.arrow.visible = false; this.beacon.visible = false; }
    this.animateFish(dt);
  }

  animateIdle(dt) { this.time += dt; const p = this.p; if (!p) return; this.animate(dt, 0); }

  animateFish(dt) {
    const w = this.world, target = 3 + Math.floor(w.pct() * 80), p = this.p;
    while (this.fish.length < Math.min(target, 90) && this.pendingFish?.length) { const c = this.pendingFish.shift(); this.addFish(c.x, c.z); }
    const m = this.fishMesh, tmp = this.tmp; let i = 0;
    for (const f of this.fish) {
      f.t -= dt; if (f.t <= 0) { f.t = 1.5 + Math.random() * 2.5; const follow = Math.random() < .35; const base = follow ? p : f.home; f.tx = base.x + (Math.random() - .5) * 5; f.tz = base.z + (Math.random() - .5) * 5; f.ty = .5 + Math.random() * 1.3; }
      let ax = f.tx - f.x, ay = f.ty - f.y, az = f.tz - f.z;
      for (const sh of this.sharks) if (sh.m.visible) { const dx = f.x - sh.x, dz = f.z - sh.z, d = Math.hypot(dx, dz); if (d < 3) { ax += dx / d * 12; az += dz / d * 12; } }
      const l = Math.hypot(ax, ay, az) || 1, sp = 2.4 * f.s; f.vx = damp(f.vx, ax / l * sp, 2, dt); f.vy = damp(f.vy, ay / l * sp * .5, 2, dt); f.vz = damp(f.vz, az / l * sp, 2, dt);
      f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; f.ph += dt * 10;
      tmp.position.set(f.x, f.y, f.z); tmp.rotation.set(0, Math.atan2(f.vx, f.vz) + Math.sin(f.ph) * .25, 0); tmp.scale.setScalar(f.s); tmp.updateMatrix(); m.setMatrixAt(i, tmp.matrix); m.setColorAt(i, f.c); i++;
    }
    m.count = i; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  queueFish(bloomed) { (this.pendingFish ||= []).push(...bloomed.filter((_, i) => i % 3 === 0)); if (this.pendingFish.length > 40) this.pendingFish.splice(0, this.pendingFish.length - 40); }
}
