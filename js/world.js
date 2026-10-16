// Level layout, the "power-wash" seabed mask and the reef decoration that blooms when cleaned.
// Expedition mode uses one big seabed whose rings (biomes) are revealed one after another.
import * as THREE from 'three';
import { rng, fbm, clamp, easeOutElastic, hash2 } from './util.js';
import { mats, coralGeometries, kelpGeometry, swayMaterial, rockGeometry, buildWreck, buildCrystals, buildArch } from './models.js';
import { ANIMALS } from './save.js';

export const BIOMES = [
  { name: 'Tropický útes', water: 0x0e7391, fog: 0x0c6482, sand: 0xf0d9a4, dirt: 0x3a3424, oil: 0x15111c, rock: 0x2b4752, rim: 0x9ffff0, caust: 0xfff6d8, corals: [0xff5f8f, 0xffa53d, 0x9a6bff, 0x3fe0c5, 0xffe066, 0x4fb3ff, 0xff7a5c], kelp: 8, center: 'arch' },
  { name: 'Jantárové vrakovisko', water: 0x2d6470, fog: 0x285a66, sand: 0xe0bd85, dirt: 0x3b2f1d, oil: 0x16100e, rock: 0x3a3c3f, rim: 0xffe9a8, caust: 0xffe6b0, corals: [0xffb347, 0xff6b5f, 0x5fe0b0, 0xffd36e, 0xe0607e], kelp: 10, center: 'wreck' },
  { name: 'Kelpový les', water: 0x156b56, fog: 0x115c4a, sand: 0xd2d49a, dirt: 0x2b3020, oil: 0x111611, rock: 0x2c443c, rim: 0xd8ffb0, caust: 0xf4ffd0, corals: [0xc6f05a, 0xffd24a, 0xff8a5c, 0x7be0ff, 0xf28bd8], kelp: 70, center: 'kelp' },
  { name: 'Svetielkujúce hlbiny', water: 0x0c1c4d, fog: 0x0a173f, sand: 0x6c6fb3, dirt: 0x1c1b2c, oil: 0x08070f, rock: 0x1d2347, rim: 0x8ff3ff, caust: 0xa8e8ff, corals: [0x55e7ff, 0xc46bff, 0x5cffc9, 0xff7ad1, 0x8f9bff], kelp: 6, center: 'crystals', glow: true },
];
export const RINGS = [10, 15.5, 21, 99];

export function levelConfig(n, daily = 0) {
  const seed = n * 1013 + 7;
  return {
    n, daily: 0, seed, biome: Math.floor((n - 1) / 3) % 4,
    size: Math.min(16 + n * 1.6, 42),
    oil: n >= 3 ? Math.min(.45, (n - 2) * .07) : 0,
    crust: n >= 7 ? Math.min(.25, (n - 6) * .04) : 0,
    sharks: n >= 4 ? Math.min(4, 1 + Math.floor((n - 4) / 3)) : 0,
    jellies: n >= 6 ? Math.min(4, Math.floor((n - 4) / 2)) : 0,
    trash: Math.min(40, 6 + n * 2),
    animal: n >= 2 ? ANIMALS[(n - 2) % ANIMALS.length].id : null,
    clams: n >= 2 ? Math.min(4, 1 + Math.floor(n / 4)) : 0,
  };
}

// Expedition: endless score run. Same seed = same seabed, so challenge links compare fairly.
export function endlessConfig(seed, daily = 0) {
  return { endless: true, n: 0, daily, seed: seed >>> 0, biome: 0, size: 60, oil: .22, crust: .1, sharks: 0, jellies: 0, trash: 10, animal: null, clams: 2 };
}

const HARD_RATE = [1, .55, .32], DONE = .9;

const vert = `varying vec2 vW;
#include <fog_pars_vertex>
void main(){ vec4 wp = modelMatrix * vec4(position,1.); vW = wp.xz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`;
const frag = `precision highp float;
uniform sampler2D uMask; uniform float uTime, uSize, uFever, uReveal; uniform vec3 uRings;
uniform vec3 uSand[4]; uniform vec3 uDirt[4]; uniform vec3 uOil[4]; uniform vec3 uRock[4]; uniform vec3 uRim[4]; uniform vec3 uCaust[4];
varying vec2 vW;
#include <fog_pars_fragment>
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
float caust(vec2 p, float t){ vec2 q = p * 1.25; float c = sin(q.x*1.7 + sin(q.y*1.3 + t)*1.2 + t*.8) + sin(q.y*1.9 + sin(q.x*1.1 - t*.7)*1.3 - t*.6) + sin((q.x+q.y)*1.2 + sin(q.x*.7 + t*.5)*1.5 + t*.4); c = abs(c) / 3.; return pow(1. - c, 7.); }
vec3 pick(vec3 a, vec3 b, vec3 c, vec3 d, vec3 w){ return mix(mix(mix(a, b, w.x), c, w.y), d, w.z); }
void main(){
  vec2 uv = vW / uSize + .5; vec4 m = texture2D(uMask, uv);
  float inside = step(0., uv.x) * step(uv.x, 1.) * step(0., uv.y) * step(uv.y, 1.);
  float valid = smoothstep(.35, .65, m.b) * inside;
  float dist = length(vW), wob = (n(vW * .35) - .5) * 2.;
  vec3 w = vec3(smoothstep(uRings.x - 1.5, uRings.x + 1.5, dist + wob), smoothstep(uRings.y - 1.5, uRings.y + 1.5, dist + wob), smoothstep(uRings.z - 1.5, uRings.z + 1.5, dist + wob));
  vec3 cSand = pick(uSand[0], uSand[1], uSand[2], uSand[3], w), cDirt = pick(uDirt[0], uDirt[1], uDirt[2], uDirt[3], w), cOil = pick(uOil[0], uOil[1], uOil[2], uOil[3], w);
  vec3 cRock = pick(uRock[0], uRock[1], uRock[2], uRock[3], w), cRim = pick(uRim[0], uRim[1], uRim[2], uRim[3], w), cCaust = pick(uCaust[0], uCaust[1], uCaust[2], uCaust[3], w);
  float nn = n(vW * 2.3), n2 = n(vW * .55 + 3.), n3 = n(vW * 6.1);
  float c = m.r + (nn - .5) * .22 + (n3 - .5) * .08;
  float cl = smoothstep(.45, .6, c);
  float hard = clamp(m.g * 2.008, 0., 2.);
  vec3 sand = cSand * (.82 + .2 * n2 + .07 * nn) * (.94 + .06 * sin(vW.x * 2.6 + vW.y * .8 + n2 * 6.));
  sand += caust(vW, uTime) * .42 * cCaust;
  vec3 sludge = cDirt * (.65 + .7 * nn) * (.8 + .4 * n3);
  vec3 oil = cOil * (.7 + .5 * n(vW * 4.));
  float isOil = clamp(hard, 0., 1.);
  vec3 dirt = mix(sludge, oil, isOil);
  float sheen = isOil * pow(n(vW * 1.6 + uTime * .08), 2.5);
  dirt += sheen * (.5 + .5 * cos(6.283 * (n2 * 2. + uTime * .05 + vec3(0., .33, .67)))) * .1;
  dirt = mix(dirt, dirt * vec3(.75, .7, .85) + vec3(.03, .02, .05), clamp(hard - 1., 0., 1.));
  dirt *= .88 + .25 * pow(n(vW*.9 - 7.), 2.);
  vec3 col = mix(dirt, sand, cl);
  float rim = smoothstep(.22, .5, c) * (1. - smoothstep(.5, .78, c));
  col += rim * cRim * (.75 + .5 * sin(uTime * 6. + vW.x * 3.)) * valid;
  col += cl * uFever * .12 * (.5 + .5 * cos(6.283 * (vW.x * .05 + uTime * .3 + vec3(0., .33, .67))));
  // Undiscovered seabed sits in murky darkness behind a glowing current.
  float locked = smoothstep(uReveal - .3, uReveal + .9, dist + wob * .4);
  col = mix(col, cDirt * .35 + cRock * .25, locked * .85);
  float front = (1. - smoothstep(0., .55, abs(dist + wob * .4 - uReveal - .25))) * step(uReveal, 900.);
  col += front * cRim * (.55 + .45 * sin(uTime * 4. + atan(vW.y, vW.x) * 9.)) * valid;
  vec3 rock = cRock * (.55 + .55 * n(vW * .7)) * (.8 + .3 * nn);
  col = mix(rock, col, valid);
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class World {
  constructor(scene) { this.scene = scene; this.group = null; this.coralGeos = coralGeometries(); this.kelpGeo = kelpGeometry(); this.rockGeo = rockGeometry(); this.kelpMat = swayMaterial(mats.flat, .14); }

  build(cfg) {
    if (this.group) this.dispose();
    const endless = this.endless = !!cfg.endless, M = this.M = endless ? 192 : 128;
    const S = this.S = cfg.size, r = rng(cfg.seed); this.cfg = cfg;
    this.biomeOf = endless ? [0, 1, 2, 3] : [cfg.biome, cfg.biome, cfg.biome, cfg.biome];
    this.biome = BIOMES[this.biomeOf[0]];
    this.rings = endless ? RINGS : [1e4, 1e4, 1e4, 1e4];
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.cell = S / M; const N = M * M;
    this.clean = new Float32Array(N); this.hard = new Uint8Array(N); this.valid = new Uint8Array(N); this.shape = new Uint8Array(N); this.region = new Uint8Array(N); this.dist = new Float32Array(N);
    this.tex = new Uint8Array(N * 4); this.validCount = 0; this.doneCount = 0; this.dirty = false;
    this.regionValid = [0, 0, 0, 0]; this.regionDone = [0, 0, 0, 0]; this.unlocked = 0;
    const seed = cfg.seed % 1000;
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const x = (i + .5) * this.cell - S / 2, z = (j + .5) * this.cell - S / 2, k = j * M + i, d = Math.hypot(x, z);
      const warp = (fbm(x * .11, z * .11, seed, 3) - .5) * S * (endless ? .22 : .42);
      let ok = d + warp < S * .45;
      if (ok && d > 4 && fbm(x * .22, z * .22, seed + 50, 2) > .74) ok = false; // rock islands
      if (d < 3) ok = true;
      this.shape[k] = ok ? 1 : 0; this.dist[k] = d;
      this.region[k] = d < this.rings[0] ? 0 : d < this.rings[1] ? 1 : d < this.rings[2] ? 2 : 3;
      const hn = fbm(x * .16, z * .16, seed + 90, 3), oil = endless ? cfg.oil * (.4 + this.region[k] * .35) : cfg.oil, crust = endless ? (this.region[k] >= 2 ? cfg.crust * this.region[k] : 0) : cfg.crust;
      this.hard[k] = hn > 1 - crust * 1.3 ? 2 : hn > 1 - oil * 1.3 ? 1 : 0;
      if (d < 4) this.hard[k] = 0;
      this.tex[k * 4] = 0; this.tex[k * 4 + 1] = this.hard[k] * 127; this.tex[k * 4 + 3] = 255;
    }
    // Drop pockets the diver can never reach (enclosed by rock), so 100 % is always possible.
    const seen = new Uint8Array(N), stack = [(M >> 1) * M + (M >> 1)]; seen[stack[0]] = 1;
    while (stack.length) { const k = stack.pop(), i = k % M; for (const o of [i > 0 ? -1 : 0, i < M - 1 ? 1 : 0, -M, M]) { const nk = k + o; if (o && nk >= 0 && nk < N && !seen[nk] && this.shape[nk]) { seen[nk] = 1; stack.push(nk); } } }
    for (let k = 0; k < N; k++) {
      if (this.shape[k] && !seen[k]) this.shape[k] = 0;
      this.tex[k * 4 + 2] = this.shape[k] ? 255 : 0;
      if (!this.shape[k]) continue; this.regionValid[this.region[k]]++;
      if (this.region[k] === 0) { this.valid[k] = 1; this.validCount++; }
    }
    this.reveal = endless ? this.rings[0] : 1e4; this.revealTarget = this.reveal; this.pending = []; this.pendingAt = 0;
    this.texture = new THREE.DataTexture(this.tex, M, M, THREE.RGBAFormat);
    this.texture.magFilter = THREE.LinearFilter; this.texture.minFilter = THREE.LinearFilter; this.texture.needsUpdate = true;
    const arr = key => this.biomeOf.map(b => new THREE.Color(BIOMES[b][key]));
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uSize: { value: S }, uFever: { value: 0 }, uReveal: { value: this.reveal }, uRings: { value: new THREE.Vector3(...this.rings.slice(0, 3).map(v => Math.min(v, 1e4))) } }]);
    for (const [u, key] of [['uSand', 'sand'], ['uDirt', 'dirt'], ['uOil', 'oil'], ['uRock', 'rock'], ['uRim', 'rim'], ['uCaust', 'caust']]) uniforms[u] = { value: arr(key) };
    uniforms.uMask = { value: this.texture };
    this.floorMat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, fog: true });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(S * 5, S * 5), this.floorMat); floor.rotation.x = -Math.PI / 2; this.group.add(floor);
    this.buildDecor(r);
  }

  idx(x, z) { const M = this.M, i = Math.floor((x + this.S / 2) / this.cell), j = Math.floor((z + this.S / 2) / this.cell); return i < 0 || j < 0 || i >= M || j >= M ? -1 : j * M + i; }
  isValid(x, z) { const k = this.idx(x, z); return k >= 0 && this.valid[k] === 1; }
  isShape(x, z) { const k = this.idx(x, z); return k >= 0 && this.shape[k] === 1; }
  cleanAt(x, z) { const k = this.idx(x, z); return k < 0 ? 1 : this.clean[k]; }
  pct() { return this.validCount ? this.doneCount / this.validCount : 0; }
  regionPct(r = this.unlocked) { return this.regionValid[r] ? this.regionDone[r] / this.regionValid[r] : 1; }
  regionAt(x, z) { const d = Math.hypot(x, z); return d < this.rings[0] ? 0 : d < this.rings[1] ? 1 : d < this.rings[2] ? 2 : 3; }
  biomeAt(x, z) { return BIOMES[this.biomeOf[this.regionAt(x, z)]]; }
  viewSize() { return this.endless ? Math.min(this.S, Math.min(this.reveal, this.S * .5) * 2.15) : this.S; }

  // Start revealing the next ring; cells become playable as the glowing current sweeps past them.
  unlock() {
    if (!this.endless || this.unlocked >= 3) return false; this.unlocked++;
    this.revealTarget = this.unlocked >= 3 ? this.S * .55 : this.rings[this.unlocked];
    const list = []; for (let k = 0; k < this.shape.length; k++) if (this.shape[k] && this.region[k] === this.unlocked) list.push(k);
    list.sort((a, b) => this.dist[a] - this.dist[b]); this.pending = list; this.pendingAt = 0; return true;
  }

  randomPoint(r, { minR = 0, maxR = 0, clearance = 1, maxTries = 200, avoid = [], shape = false } = {}) {
    const max = maxR || (this.endless ? Math.min(this.reveal - .8, this.S * .47) : this.S * .47), test = shape ? (x, z) => this.isShape(x, z) : (x, z) => this.isValid(x, z);
    for (let t = 0; t < maxTries; t++) {
      const a = r() * Math.PI * 2, d = minR + Math.sqrt(r()) * Math.max(.1, max - minR), x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!test(x, z)) continue; let ok = true;
      for (const q of [[clearance, 0], [-clearance, 0], [0, clearance], [0, -clearance]]) if (!test(x + q[0], z + q[1])) { ok = false; break; }
      if (ok) for (const p of avoid) if (Math.hypot(p.x - x, p.z - z) < (p.r || 2)) { ok = false; break; }
      if (ok) return { x, z };
    }
    return { x: (r() - .5) * 4, z: (r() - .5) * 4 };
  }
  pointNear(x, z, minD, maxD, r = Math.random) {
    for (let t = 0; t < 40; t++) { const a = r() * 6.283, d = minD + r() * (maxD - minD), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; if (this.isValid(px, pz) && this.isValid(px + .6, pz) && this.isValid(px - .6, pz)) return { x: px, z: pz }; }
    return null;
  }

  // The brush. Returns cells completed and whether dirt was touched (for sound/particles).
  brush(x, z, radius, amount) {
    const M = this.M, c = this.cell, i0 = Math.max(0, Math.floor((x - radius + this.S / 2) / c)), i1 = Math.min(M - 1, Math.floor((x + radius + this.S / 2) / c));
    const j0 = Math.max(0, Math.floor((z - radius + this.S / 2) / c)), j1 = Math.min(M - 1, Math.floor((z + radius + this.S / 2) / c));
    let done = 0, touched = 0, hardTouched = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * M + i; if (!this.valid[k] || this.clean[k] >= 1) continue;
      const cx = (i + .5) * c - this.S / 2, cz = (j + .5) * c - this.S / 2, d = Math.hypot(cx - x, cz - z) / radius; if (d > 1) continue;
      const fall = d < .6 ? 1 : 1 - (d - .6) / .4, before = this.clean[k];
      const v = Math.min(1, before + amount * fall * HARD_RATE[this.hard[k]]); this.clean[k] = v; touched++; if (this.hard[k]) hardTouched++;
      if (before < DONE && v >= DONE) { done++; this.doneCount++; this.regionDone[this.region[k]]++; if (v < 1) this.clean[k] = Math.max(v, DONE); }
      this.tex[k * 4] = Math.round(this.clean[k] * 255);
    }
    if (touched) this.dirty = true;
    return { done, touched, hardTouched };
  }

  // Oil spill: re-dirties clean seabed and bleaches the corals it reaches.
  pollute(x, z, radius) {
    const M = this.M, c = this.cell, i0 = Math.max(0, Math.floor((x - radius + this.S / 2) / c)), i1 = Math.min(M - 1, Math.floor((x + radius + this.S / 2) / c));
    const j0 = Math.max(0, Math.floor((z - radius + this.S / 2) / c)), j1 = Math.min(M - 1, Math.floor((z + radius + this.S / 2) / c));
    let n = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * M + i; if (!this.valid[k]) continue;
      const cx = (i + .5) * c - this.S / 2, cz = (j + .5) * c - this.S / 2, d = Math.hypot(cx - x, cz - z) + (hash2(i, j, 5) - .5) * .8; if (d > radius) continue;
      if (this.clean[k] >= DONE) { this.doneCount--; this.regionDone[this.region[k]]--; }
      this.clean[k] = 0; this.hard[k] = Math.max(1, this.hard[k]); this.tex[k * 4] = 0; this.tex[k * 4 + 1] = this.hard[k] * 127; n++;
    }
    const touched = new Set(), dummy = this._d || (this._d = new THREE.Object3D());
    for (const co of this.corals) if (co.t >= 0 && Math.hypot(co.x - x, co.z - z) < radius) { co.t = -1; this.setCoral(this.coralMeshes[co.type], co, co.slot, 0, dummy); touched.add(co.type); }
    for (const ti of touched) { const m = this.coralMeshes[ti]; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    if (n) this.dirty = true; return n;
  }

  // Finish edge cells that are surrounded by clean area so 100 % never hinges on a hidden pixel.
  sweepStragglers() {
    const M = this.M; let fixed = 0;
    for (let j = 1; j < M - 1; j++) for (let i = 1; i < M - 1; i++) {
      const k = j * M + i; if (!this.valid[k] || this.clean[k] >= DONE) continue;
      let n = 0, v = 0; for (const o of [1, -1, M, -M]) { if (!this.valid[k + o] || this.clean[k + o] >= DONE) n++; v++; }
      if (n === v) { this.clean[k] = 1; this.tex[k * 4] = 255; this.doneCount++; this.regionDone[this.region[k]]++; fixed++; }
    }
    if (fixed) this.dirty = true; return fixed;
  }

  nearestDirty(x, z) {
    const M = this.M; let best = null, bd = Infinity; const c = this.cell;
    for (let j = 0; j < M; j += 2) for (let i = 0; i < M; i += 2) {
      const k = j * M + i; if (!this.valid[k] || this.clean[k] >= DONE) continue;
      const cx = (i + .5) * c - this.S / 2, cz = (j + .5) * c - this.S / 2, d = (cx - x) ** 2 + (cz - z) ** 2; if (d < bd) { bd = d; best = { x: cx, z: cz }; }
    }
    if (!best) for (let k = 0; k < M * M; k++) if (this.valid[k] && this.clean[k] < DONE) { best = { x: (k % M + .5) * c - this.S / 2, z: (Math.floor(k / M) + .5) * c - this.S / 2 }; break; }
    return best;
  }

  remainingDirt() { return this.validCount - this.doneCount; }

  // Wordle-style mini map for the daily share text.
  emojiGrid(n = 6) {
    const M = this.M, rows = []; for (let gy = 0; gy < n; gy++) { let row = ''; for (let gx = 0; gx < n; gx++) {
      let v = 0, t = 0; const s = M / n; for (let j = Math.floor(gy * s); j < (gy + 1) * s; j += 2) for (let i = Math.floor(gx * s); i < (gx + 1) * s; i += 2) { const k = j * M + i; if (this.shape[k]) { t++; v += this.valid[k] && this.clean[k] >= DONE ? 1 : 0; } }
      row += !t ? '⬛' : v / t > .9 ? '🪸' : v / t > .6 ? '🟩' : v / t > .25 ? '🟨' : '🟫';
    } rows.push(row); }
    return rows.join('\n');
  }

  buildDecor(r) {
    const S = this.S, dummy = new THREE.Object3D(), E = this.endless;
    // Centerpieces: one per biome (expedition places them in their own ring).
    this.centerpieces = [];
    const centers = E ? [[0, 4, 9], [1, 11.5, 15], [3, 22, 26]] : [[this.cfg.biome, S * .2, 0]];
    for (const [bi, minR, maxR] of centers) {
      const cp = this.randomPoint(r, { minR, maxR, clearance: 2.5, shape: true }); let m = null; const kind = BIOMES[bi].center;
      if (kind === 'wreck') { m = buildWreck(); m.scale.setScalar(.8); } else if (kind === 'crystals') m = buildCrystals(); else if (kind === 'arch') m = buildArch();
      if (m) { m.position.set(cp.x, 0, cp.z); m.rotation.y = r() * 6; this.group.add(m); this.centerpieces.push({ ...cp, r: 3 }); }
    }
    this.centerpiece = this.centerpieces[0] || { x: 99, z: 99, r: 0 };
    // Corals: start bleached grey, bloom into colour when their cell is cleaned.
    let shapeArea = 0; for (const v of this.regionValid) shapeArea += v; shapeArea *= this.cell * this.cell;
    const n = Math.min(E ? 520 : 300, Math.floor(shapeArea * .34)); this.corals = [];
    const perType = this.coralGeos.map(() => []);
    for (let i = 0; i < n; i++) {
      const p = this.randomPoint(r, { clearance: .3, maxTries: 20, shape: true, maxR: S * .47 }); if (Math.hypot(p.x, p.z) < 2.2) continue;
      const type = r.int(0, this.coralGeos.length - 1), d = Math.hypot(p.x, p.z);
      const c = { x: p.x, z: p.z, k: this.idx(p.x, p.z), d, type, rot: r() * 6.28, s: .65 + r() * .75 * (type === 5 ? .6 : 1), color: new THREE.Color(r.pick(this.biomeAt(p.x, p.z).corals)), t: -1, slot: perType[type].length, hidden: d > this.reveal };
      perType[type].push(c); this.corals.push(c);
    }
    this.coralMeshes = this.coralGeos.map((g, ti) => {
      const list = perType[ti]; const mesh = new THREE.InstancedMesh(g, !E && this.biome.glow ? mats.glow : mats.flat, Math.max(1, list.length)); mesh.count = list.length;
      list.forEach((c, i) => { this.setCoral(mesh, c, i, 0, dummy); }); mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.group.add(mesh); return mesh;
    });
    // Kelp (dense in the kelp forest ring)
    this.kelp = [];
    const kelpPlan = E ? [[0, 0, RINGS[0], 6], [1, RINGS[0], RINGS[1], 8], [2, RINGS[1], RINGS[2], 60], [3, RINGS[2], S * .47, 6]] : [[this.cfg.biome, 0, S * .47, this.biome.kelp]];
    for (const [, minR, maxR, cnt] of kelpPlan) for (let i = 0; i < cnt; i++) { const p = this.randomPoint(r, { minR, maxR, clearance: .4, maxTries: 20, shape: true }); const d = Math.hypot(p.x, p.z); if (d < 3) continue; this.kelp.push({ x: p.x, z: p.z, k: this.idx(p.x, p.z), d, rot: r() * 6.28, s: .7 + r() * .8, t: -1, hidden: d > this.reveal }); }
    this.kelpMesh = new THREE.InstancedMesh(this.kelpGeo, this.kelpMat, Math.max(1, this.kelp.length)); this.kelpMesh.count = this.kelp.length;
    this.kelp.forEach((k, i) => this.setKelp(k, i, 0, dummy)); this.group.add(this.kelpMesh);
    // Rocks frame the seabed and fill the islands.
    const rocks = [], maxRocks = E ? 260 : 140;
    for (let i = 0; i < maxRocks * 5 && rocks.length < maxRocks; i++) {
      const a = r() * Math.PI * 2, d = r() * S * .75, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (this.isShape(x, z)) continue; let near = false; for (const o of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) if (this.isShape(x + o[0], z + o[1])) near = true;
      if (near || r() < .15) rocks.push({ x, z, s: .45 + r() * (near ? .9 : 1.6) });
    }
    this.rockMesh = new THREE.InstancedMesh(this.rockGeo, mats.flat, rocks.length);
    rocks.forEach((p, i) => { dummy.position.set(p.x, -.1, p.z); dummy.rotation.set(r() * .3, r() * 6, r() * .3); dummy.scale.set(p.s * 1.2, p.s * (.35 + r() * .35), p.s * 1.2); dummy.updateMatrix(); this.rockMesh.setMatrixAt(i, dummy.matrix); this.rockMesh.setColorAt(i, new THREE.Color(this.biomeAt(p.x, p.z).rock).multiplyScalar(1.6 + r() * .8)); });
    this.group.add(this.rockMesh);
  }

  setCoral(mesh, c, i, k, dummy) {
    const grow = c.hidden ? 0 : k <= 0 ? .55 : .55 + .45 * easeOutElastic(k), col = k <= 0 ? null : k;
    dummy.position.set(c.x, 0, c.z); dummy.rotation.set(0, c.rot, 0); dummy.scale.setScalar(Math.max(.0001, c.s * grow)); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    const grey = new THREE.Color(.42, .43, .45);
    mesh.setColorAt(i, col === null ? grey.multiplyScalar(.8 + (c.rot % 1) * .3) : grey.lerp(c.color, Math.min(1, k * 1.6)));
  }
  setKelp(kp, i, k, dummy) {
    const grow = kp.hidden ? 0 : k <= 0 ? .3 : .3 + .7 * easeOutElastic(Math.min(1, k));
    dummy.position.set(kp.x, 0, kp.z); dummy.rotation.set(0, kp.rot, 0); dummy.scale.set(kp.s, Math.max(.0001, kp.s * grow), kp.s); dummy.updateMatrix(); this.kelpMesh.setMatrixAt(i, dummy.matrix);
    this.kelpMesh.setColorAt(i, k <= 0 ? new THREE.Color(.35, .3, .22) : new THREE.Color(.35, .3, .22).lerp(new THREE.Color(1, 1, 1), Math.min(1, k * 1.5)));
  }

  // Animate revealing + blooming decor. Returns newly bloomed corals so the game can spawn fish/sparkles.
  update(dt, t, fever, celebrate = false) {
    const u = this.floorMat.uniforms; u.uTime.value = t; u.uFever.value = fever; this.kelpMat.userData.time.value = t;
    const bloomed = [], dummy = this._d || (this._d = new THREE.Object3D()), touchedTypes = new Set(); let kelpTouched = false;
    if (this.reveal < this.revealTarget) {
      this.reveal = Math.min(this.revealTarget, this.reveal + dt * 4.5); u.uReveal.value = this.reveal >= this.S * .55 ? 1e4 : this.reveal;
      while (this.pendingAt < this.pending.length && this.dist[this.pending[this.pendingAt]] <= this.reveal) { this.valid[this.pending[this.pendingAt++]] = 1; this.validCount++; }
      for (const c of this.corals) if (c.hidden && c.d <= this.reveal) { c.hidden = false; this.setCoral(this.coralMeshes[c.type], c, c.slot, 0, dummy); touchedTypes.add(c.type); }
      this.kelp.forEach((k, i) => { if (k.hidden && k.d <= this.reveal) { k.hidden = false; this.setKelp(k, i, 0, dummy); kelpTouched = true; } });
    }
    if (this.dirty) { this.texture.needsUpdate = true; this.dirty = false; }
    if (celebrate) { this.tickBloomAll(dt); return bloomed; }
    for (const c of this.corals) {
      if (c.hidden) continue;
      if (c.t < 0) { if (c.k >= 0 && this.clean[c.k] >= DONE) { c.t = 0; bloomed.push(c); } else continue; }
      if (c.t >= 1) continue; c.t = Math.min(1, c.t + dt / .9); this.setCoral(this.coralMeshes[c.type], c, c.slot, c.t, dummy); touchedTypes.add(c.type);
    }
    for (const ti of touchedTypes) { const m = this.coralMeshes[ti]; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    this.kelp.forEach((kp, i) => { if (kp.hidden) return; if (kp.t < 0) { if (kp.k >= 0 && this.clean[kp.k] >= DONE) kp.t = 0; else return; } if (kp.t >= 1) return; kp.t = Math.min(1, kp.t + dt / 1.2); this.setKelp(kp, i, kp.t, dummy); kelpTouched = true; });
    if (kelpTouched) { this.kelpMesh.instanceMatrix.needsUpdate = true; this.kelpMesh.instanceColor.needsUpdate = true; }
    return bloomed;
  }

  // Home-screen showcase: a finished, living reef.
  showcase() { for (let k = 0; k < this.clean.length; k++) if (this.valid[k]) { this.clean[k] = 1; this.tex[k * 4] = 255; } this.doneCount = this.validCount; this.dirty = true; for (const c of this.corals) c.t = .999; for (const k of this.kelp) k.t = .999; }
  // Celebration: everything still bleached blooms in a wave from the player.
  bloomAll(x, z) { for (const c of this.corals) if (c.t < 0 && !c.hidden) c.t = -Math.hypot(c.x - x, c.z - z) * .04; const d = this._d || (this._d = new THREE.Object3D()); this.kelp.forEach((k, i) => { if (k.hidden) return; k.t = 1; this.setKelp(k, i, 1, d); }); this.kelpMesh.instanceMatrix.needsUpdate = true; if (this.kelpMesh.instanceColor) this.kelpMesh.instanceColor.needsUpdate = true; }
  tickBloomAll(dt) { const dummy = this._d || (this._d = new THREE.Object3D()); const touched = new Set(); for (const c of this.corals) { if (c.t >= 1 || c.hidden) continue; c.t += dt / .9; if (c.t > 0) { this.setCoral(this.coralMeshes[c.type], c, c.slot, Math.min(1, c.t), dummy); touched.add(c.type); } } for (const ti of touched) { const m = this.coralMeshes[ti]; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; } }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => { if (o.isInstancedMesh) o.dispose(); if (o.geometry && !this.coralGeos.includes(o.geometry) && o.geometry !== this.kelpGeo && o.geometry !== this.rockGeo) o.geometry.dispose(); });
    this.texture?.dispose(); this.floorMat?.dispose(); this.group = null;
  }
}
export const CLEAN_DONE = DONE;
export { hash2 };
