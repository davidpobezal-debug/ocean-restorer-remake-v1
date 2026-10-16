// Juice: pooled particles, shockwaves, floating numbers, coins flying to the HUD.
import * as THREE from 'three';
import { radialTexture } from './models.js';

const pvert = `attribute float aSize; attribute vec4 aColor; varying vec4 vC; uniform float uScale;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / max(.1, -mv.z); vC = aColor; }`;
const pfrag = `uniform sampler2D uMap; varying vec4 vC;
void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vC.rgb * t.rgb, vC.a * t.a); if (gl_FragColor.a < .01) discard;
#include <colorspace_fragment>
}`;

function bubbleTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 18, 32, 32, 31); g.addColorStop(0, 'rgba(255,255,255,0.08)'); g.addColorStop(.8, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.beginPath(); x.arc(32, 32, 31, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.arc(23, 22, 6, 0, 7); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

class PointPool {
  constructor(scene, n, map, blending) {
    this.n = n; this.i = 0; this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 4); this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n); this.base = new Float32Array(n); this.grav = new Float32Array(n); this.drag = new Float32Array(n);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4)); g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({ vertexShader: pvert, fragmentShader: pfrag, uniforms: { uMap: { value: map }, uScale: { value: 500 } }, transparent: true, depthWrite: false, blending });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 5; scene.add(this.points); this.g = g;
  }
  emit(x, y, z, vx, vy, vz, life, size, color, alpha = 1, grav = 0, drag = 1.5) {
    const i = this.i; this.i = (this.i + 1) % this.n;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3); this.life[i] = life; this.max[i] = life; this.base[i] = size; this.grav[i] = grav; this.drag[i] = drag;
    this.col[i * 4] = color.r; this.col[i * 4 + 1] = color.g; this.col[i * 4 + 2] = color.b; this.col[i * 4 + 3] = alpha;
  }
  update(dt, attract) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.life[i] -= dt; const k = i * 3, d = Math.exp(-this.drag[i] * dt);
      if (attract && this.grav[i] < -50) { // particles sucked towards the nozzle
        const dx = attract.x - this.pos[k], dy = attract.y - this.pos[k + 1], dz = attract.z - this.pos[k + 2], l = Math.hypot(dx, dy, dz) || 1;
        this.vel[k] += dx / l * 40 * dt; this.vel[k + 1] += dy / l * 40 * dt; this.vel[k + 2] += dz / l * 40 * dt; if (l < .25) this.life[i] = 0;
      } else this.vel[k + 1] += this.grav[i] * dt;
      this.vel[k] *= d; this.vel[k + 1] *= d; this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const t = this.life[i] / this.max[i]; this.size[i] = this.base[i] * Math.min(1, t * 3) * (this.grav[i] > 0 ? 1 : .6 + .4 * t);
    }
    this.g.attributes.position.needsUpdate = true; this.g.attributes.size?.needsUpdate; this.g.attributes.aSize.needsUpdate = true; this.g.attributes.aColor.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.size.fill(0); }
}

export class FX {
  constructor(scene, camera, layer) {
    this.scene = scene; this.camera = camera; this.layer = layer; this.shakeAmt = 0;
    const soft = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
    this.glow = new PointPool(scene, 500, soft, THREE.AdditiveBlending);
    this.dirt = new PointPool(scene, 400, radialTexture('rgba(255,255,255,.95)', 'rgba(255,255,255,0)'), THREE.NormalBlending);
    this.bubbles = new PointPool(scene, 260, bubbleTexture(), THREE.NormalBlending);
    this.rings = []; for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(.85, 1, 48), new THREE.MeshBasicMaterial({ color: 0x9ffcf0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); this.rings.push({ m, t: 1, dur: 1, max: 1 }); }
    this.texts = []; this.c = new THREE.Color(); this.v = new THREE.Vector3();
  }
  setScale(h, fov) { const s = h / (2 * Math.tan(fov * Math.PI / 360)); for (const p of [this.glow, this.dirt, this.bubbles]) p.mat.uniforms.uScale.value = s; }

  sparkle(x, y, z, color, n = 8, speed = 2.5, size = .35) {
    this.c.set(color); for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, u = Math.random() * 2 - 1, s = speed * (.4 + Math.random() * .8), r = Math.sqrt(1 - u * u);
      this.glow.emit(x, y, z, Math.cos(a) * r * s, Math.abs(u) * s + .5, Math.sin(a) * r * s, .5 + Math.random() * .5, size * (.6 + Math.random() * .8), this.c, 1, -1.5, 2.5); }
  }
  confetti(x, y, z, colors, n = 40) {
    for (let i = 0; i < n; i++) { this.c.set(colors[i % colors.length]); const a = Math.random() * 6.28, s = 3 + Math.random() * 5; this.glow.emit(x, y, z, Math.cos(a) * s, 4 + Math.random() * 6, Math.sin(a) * s, 1.6 + Math.random(), .45, this.c, 1, -6, 1.2); }
  }
  debris(x, z, color, toward) {
    this.c.set(color); const a = Math.random() * 6.28, r = Math.random() * .6;
    this.dirt.emit(x + Math.cos(a) * r, .05, z + Math.sin(a) * r, (Math.random() - .5), .6 + Math.random(), (Math.random() - .5), .6, .22 + Math.random() * .15, this.c, .85, -99, 2);
  }
  bubble(x, y, z, size = .25, vy = 1.5) { this.c.setRGB(1, 1, 1); this.bubbles.emit(x, y, z, (Math.random() - .5) * .3, vy * (.7 + Math.random() * .6), (Math.random() - .5) * .3, 2.5 + Math.random() * 1.5, size * (.6 + Math.random() * .8), this.c, .9, .8, 1.2); }
  ring(x, z, radius, color = 0x9ffcf0, dur = .6) { const r = this.rings.find(q => q.t >= q.dur) || this.rings[0]; r.m.position.set(x, .12, z); r.m.material.color.set(color); r.t = 0; r.dur = dur; r.max = radius; r.m.visible = true; }
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  // DOM floating text that follows a world point.
  text(x, y, z, str, cls = '') {
    // Prefixed so float styles never collide with HUD/button classes (.o2, .big).
    const el = document.createElement('div'); el.className = 'ftext ' + cls.split(' ').filter(Boolean).map(c => 'ft-' + c).join(' '); el.textContent = str; this.layer.appendChild(el);
    this.texts.push({ el, x, y, z, t: 0, dur: cls.includes('big') ? 1.4 : .9 });
    if (this.texts.length > 30) { const o = this.texts.shift(); o.el.remove(); }
  }
  screen(x, y, z) { this.v.set(x, y, z).project(this.camera); return { x: (this.v.x * .5 + .5) * (this.vw || innerWidth), y: (-this.v.y * .5 + .5) * (this.vh || innerHeight) }; }

  // Coins visibly travel to the HUD counter: cheap and very satisfying.
  coinsFly(x, y, z, n, target, onArrive, cls = 'flycoin') {
    const from = this.screen(x, y, z), to = target.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div'); el.className = cls; el.style.left = from.x + 'px'; el.style.top = from.y + 'px'; this.layer.appendChild(el);
      const dx = (Math.random() - .5) * 80, dy = -30 - Math.random() * 50, delay = i * 45;
      el.animate([{ transform: 'translate(-50%,-50%) scale(.4)' }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.1)`, offset: .3 }, { transform: `translate(calc(-50% + ${to.left + to.width / 2 - from.x}px), calc(-50% + ${to.top + to.height / 2 - from.y}px)) scale(.6)` }], { duration: 650 + Math.random() * 150, delay, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' })
        .onfinish = () => { el.remove(); onArrive?.(i); };
    }
  }

  update(dt, attract) {
    this.glow.update(dt); this.dirt.update(dt, attract); this.bubbles.update(dt);
    for (const r of this.rings) { if (r.t >= r.dur) { r.m.visible = false; continue; } r.t += dt; const k = Math.min(1, r.t / r.dur), e = 1 - Math.pow(1 - k, 3); r.m.scale.setScalar(.2 + e * r.max); r.m.material.opacity = (1 - k) * .9; }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const q = this.texts[i]; q.t += dt; const k = q.t / q.dur; if (k >= 1) { q.el.remove(); this.texts.splice(i, 1); continue; }
      const s = this.screen(q.x, q.y + k * 1.2, q.z); q.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%,-50%) scale(${k < .15 ? .5 + k / .15 * .7 : 1.2 - Math.min(.2, (k - .15))})`; q.el.style.opacity = k > .7 ? (1 - k) / .3 : 1;
    }
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.2);
  }
  clear() { this.glow.clear(); this.dirt.clear(); this.bubbles.clear(); for (const q of this.texts) q.el.remove(); this.texts = []; }
}
