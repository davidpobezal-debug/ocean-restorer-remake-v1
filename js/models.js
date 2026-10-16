// Procedural low-poly models. Each builder returns plain Three objects so a
// GLB from Tripo can later replace any of them (see assets/README in TRIPO.md).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './util.js';

const tmpColor = new THREE.Color();

// Normalise a primitive to (position, normal, color) so many can be merged into one draw call.
export function part(geo, color, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
  g.applyMatrix4(m);
  const n = g.attributes.position.count, col = new Float32Array(n * 3), pos = g.attributes.position;
  for (let i = 0; i < n; i++) {
    if (typeof color === 'function') color(pos.getX(i), pos.getY(i), pos.getZ(i), tmpColor); else tmpColor.set(color);
    col[i * 3] = tmpColor.r; col[i * 3 + 1] = tmpColor.g; col[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
export const merge = parts => { const g = mergeGeometries(parts); g.computeBoundingSphere(); return g; };

export const mats = {};
export function initMaterials() {
  mats.flat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  mats.smooth = new THREE.MeshLambertMaterial({ vertexColors: true });
  mats.glow = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x223355, emissiveIntensity: .6 });
  mats.glass = new THREE.MeshPhongMaterial({ color: 0xbff4ff, transparent: true, opacity: .32, shininess: 120, specular: 0xffffff, depthWrite: false });
  mats.net = new THREE.LineBasicMaterial({ color: 0xc89b62, transparent: true, opacity: .95 });
  mats.jelly = new THREE.MeshLambertMaterial({ color: 0xff8ad8, emissive: 0xb0306f, emissiveIntensity: .7, transparent: true, opacity: .75, depthWrite: false });
  mats.bubble = new THREE.MeshPhongMaterial({ color: 0xc9f7ff, emissive: 0x2b8fb0, transparent: true, opacity: .55, shininess: 140, depthWrite: false });
  mats.shadow = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,10,20,0.55)', 'rgba(0,10,20,0)'), transparent: true, depthWrite: false });
  mats.glowSprite = new THREE.SpriteMaterial({ map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  mats.danger = new THREE.MeshBasicMaterial({ color: 0xff3348, transparent: true, opacity: .35, depthWrite: false });
  mats.ring = new THREE.MeshBasicMaterial({ color: 0x9ffcf0, transparent: true, opacity: .8, depthWrite: false, side: THREE.DoubleSide });
}

export function radialTexture(inner, outer, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); g.addColorStop(0, inner); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, size, size); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function blobShadow(size = 1) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mats.shadow); m.rotation.x = -Math.PI / 2; m.position.y = .02; m.renderOrder = 1; return m;
}

// ---------- Diver ----------
export function buildDiver(suit) {
  const root = new THREE.Group(), pivot = new THREE.Group(); root.add(pivot);
  const c = suit.color, a = suit.accent, skin = 0xffd1ae, dark = 0x1d2a3a;
  const body = merge([
    part(new THREE.CapsuleGeometry(.25, .32, 3, 10), c, { p: [0, .72, 0] }),
    part(new THREE.CylinderGeometry(.27, .27, .08, 12), a, { p: [0, .56, 0] }),
    part(new THREE.CylinderGeometry(.1, .1, .5, 8), 0xdfe6ea, { p: [-.11, .78, -.27] }),
    part(new THREE.CylinderGeometry(.1, .1, .5, 8), 0xdfe6ea, { p: [.11, .78, -.27] }),
    part(new THREE.CylinderGeometry(.05, .05, .12, 6), a, { p: [0, 1.06, -.27] }),
    part(new THREE.SphereGeometry(.2, 12, 10), skin, { p: [0, 1.17, .02] }),
    part(new THREE.SphereGeometry(.045, 6, 6), 0x101820, { p: [-.075, 1.2, .18] }),
    part(new THREE.SphereGeometry(.045, 6, 6), 0x101820, { p: [.075, 1.2, .18] }),
    part(new THREE.SphereGeometry(.035, 6, 6), 0xff8f9a, { p: [-.13, 1.12, .15] }),
    part(new THREE.SphereGeometry(.035, 6, 6), 0xff8f9a, { p: [.13, 1.12, .15] }),
    part(new THREE.TorusGeometry(.25, .05, 6, 16), a, { p: [0, .96, .02], r: [Math.PI / 2, 0, 0] }),
    part(new THREE.CylinderGeometry(.05, .06, .1, 8), 0xffe680, { p: [0, 1.47, .05] }),
    part(new THREE.CapsuleGeometry(.07, .26, 2, 6), c, { p: [-.3, .82, .14], r: [1.2, 0, .2] }),
    part(new THREE.CapsuleGeometry(.07, .26, 2, 6), c, { p: [.3, .82, .14], r: [1.2, 0, -.2] }),
  ]);
  const bodyMesh = new THREE.Mesh(body, suit.glow ? mats.glow : mats.flat); pivot.add(bodyMesh);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(.31, 16, 12), mats.glass); helmet.position.set(0, 1.17, .02); pivot.add(helmet);
  const lamp = new THREE.Sprite(mats.glowSprite.clone()); lamp.material.color.set(0xfff2a8); lamp.scale.set(.5, .5, .5); lamp.position.set(0, 1.52, .08); pivot.add(lamp);
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * .12, .45, 0);
    leg.add(new THREE.Mesh(merge([
      part(new THREE.CapsuleGeometry(.09, .28, 2, 6), dark, { p: [0, -.2, 0] }),
      part(new THREE.BoxGeometry(.2, .035, .42), a, { p: [0, -.42, .12] }),
    ]), mats.flat));
    pivot.add(leg); legs.push(leg);
  }
  // Nozzle stays low over the seabed while the body leans – reads clearly from above.
  const nozzle = new THREE.Group();
  nozzle.add(new THREE.Mesh(merge([
    part(new THREE.CylinderGeometry(.09, .16, .34, 10), 0x3fe0c5, { p: [0, 0, 0], r: [Math.PI / 2, 0, 0] }),
    part(new THREE.CylinderGeometry(.05, .05, .5, 6), 0x24414f, { p: [0, .12, -.36], r: [Math.PI / 2 - .4, 0, 0] }),
    part(new THREE.BoxGeometry(.12, .1, .14), 0xffe066, { p: [0, .1, -.08] }),
  ]), mats.flat));
  nozzle.position.set(0, .22, .78); root.add(nozzle);
  const shadow = blobShadow(1.6); root.add(shadow);
  root.userData = { pivot, legs, nozzle, bodyMesh, helmet, lamp, shadow, rainbow: !!suit.rainbow };
  return root;
}

// ---------- Shark ----------
function taper(geo, front, back, fn) {
  const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const z = p.getZ(i); const k = z < 0 ? 1 + z / back : 1 - z / front * .25; const kk = Math.max(.08, k); p.setX(i, p.getX(i) * kk); p.setY(i, p.getY(i) * kk + (fn ? fn(z) : 0)); } return geo;
}
export function buildShark() {
  const root = new THREE.Group(), top = 0x5b7894, belly = 0xe4eef0;
  const bodyGeo = taper(new THREE.SphereGeometry(1, 12, 8).scale(.42, .38, 1.45), 1.45, 1.75);
  const fin = new THREE.Shape(); fin.moveTo(-.35, 0); fin.lineTo(.15, .62); fin.lineTo(.25, 0);
  const finGeo = new THREE.ExtrudeGeometry(fin, { depth: .06, bevelEnabled: false });
  const pect = new THREE.Shape(); pect.moveTo(0, 0); pect.lineTo(.7, -.25); pect.lineTo(.15, .25);
  const pectGeo = new THREE.ExtrudeGeometry(pect, { depth: .04, bevelEnabled: false });
  const body = merge([
    part(bodyGeo, (x, y, z, c) => c.set(y < -.06 ? belly : top)),
    part(finGeo, top, { p: [-.03, .3, 0], r: [0, Math.PI / 2, 0] }),
    part(pectGeo, top, { p: [.3, -.1, .35], r: [Math.PI / 2, 0, -.3] }),
    part(pectGeo.clone(), top, { p: [-.3, -.1, .35], r: [Math.PI / 2, Math.PI, .3] }),
    part(new THREE.SphereGeometry(.07, 6, 6), 0x0a0f14, { p: [.25, .1, 1.0] }),
    part(new THREE.SphereGeometry(.07, 6, 6), 0x0a0f14, { p: [-.25, .1, 1.0] }),
    part(new THREE.BoxGeometry(.26, .03, .1), 0x2a1a22, { p: [0, -.12, 1.25], r: [.2, 0, 0] }),
    part(new THREE.BoxGeometry(.18, .05, .04), 0x1d2633, { p: [.24, .2, 1.0], r: [0, 0, -.5] }),
    part(new THREE.BoxGeometry(.18, .05, .04), 0x1d2633, { p: [-.24, .2, 1.0], r: [0, 0, .5] }),
  ]);
  const bodyMesh = new THREE.Mesh(body, mats.flat); root.add(bodyMesh);
  const tail = new THREE.Group(); tail.position.set(0, 0, -1.3);
  const tf = new THREE.Shape(); tf.moveTo(0, 0); tf.lineTo(-.55, .6); tf.lineTo(-.2, 0); tf.lineTo(-.5, -.4); tf.lineTo(0, 0);
  tail.add(new THREE.Mesh(part(new THREE.ExtrudeGeometry(tf, { depth: .05, bevelEnabled: false }), top, { r: [0, Math.PI / 2, 0] }), mats.flat));
  root.add(tail);
  const shadow = blobShadow(2.6); root.add(shadow);
  const alert = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture('!', '#ff3b4f'), depthTest: false, transparent: true })); alert.scale.set(.8, .8, .8); alert.position.set(0, 1.4, 0); alert.visible = false; root.add(alert);
  const stars = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture('✦✦', '#ffe36e'), depthTest: false, transparent: true })); stars.scale.set(1.1, .55, 1); stars.position.set(0, 1.1, 0); stars.visible = false; root.add(stars);
  root.userData = { tail, body: bodyMesh, alert, stars, shadow };
  return root;
}

export function textTexture(text, color, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  x.font = `900 ${size * .7}px system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = size * .08; x.strokeStyle = 'rgba(0,0,0,.6)'; x.strokeText(text, size / 2, size / 2 + 4); x.fillStyle = color; x.fillText(text, size / 2, size / 2 + 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- Small fish (instanced) ----------
export function fishGeometry() {
  const body = new THREE.SphereGeometry(.2, 7, 5).scale(.55, .9, 1.2);
  const tail = new THREE.ConeGeometry(.14, .22, 4).rotateX(-Math.PI / 2).scale(.25, 1, 1);
  return merge([
    part(body, (x, y, z, c) => c.setHSL(0, 0, Math.abs(z - .05) < .05 ? .55 : y < -.05 ? 1 : .88)),
    part(tail, 0xbfc8d0, { p: [0, 0, -.3] }),
    part(new THREE.SphereGeometry(.035, 4, 4), 0x0b0f14, { p: [.08, .05, .14] }),
    part(new THREE.SphereGeometry(.035, 4, 4), 0x0b0f14, { p: [-.08, .05, .14] }),
  ]);
}

// ---------- Corals ----------
export function coralGeometries() {
  const r = rng(7), list = [];
  // branching
  { const parts = []; for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, t = .25 + r() * .35, h = .45 + r() * .5; parts.push(part(new THREE.CylinderGeometry(.04, .08, h, 5), 0xffffff, { p: [Math.cos(a) * .12, h / 2, Math.sin(a) * .12], r: [Math.sin(a) * t, 0, -Math.cos(a) * t] })); parts.push(part(new THREE.SphereGeometry(.06, 5, 4), 0xffffff, { p: [Math.cos(a) * (.12 + h * t * .9), h * .97, Math.sin(a) * (.12 + h * t * .9)] })); } list.push(merge(parts)); }
  // brain
  { const g = new THREE.IcosahedronGeometry(.42, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setY(i, Math.max(-.05, y) * .75 + .05); const k = 1 + Math.sin(p.getX(i) * 18) * .05; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } list.push(merge([part(g, (x, y, z, c) => c.setHSL(0, 0, .8 + y * .4))])); }
  // fan
  { const s = new THREE.Shape(); s.absarc(0, 0, .6, 0, Math.PI, false); s.lineTo(.6, 0); const holes = []; for (let i = 0; i < 5; i++) { const h = new THREE.Path(); const a = .4 + i * .58; h.absarc(Math.cos(a) * .35, Math.sin(a) * .35, .07, 0, Math.PI * 2, true); holes.push(h); } s.holes = holes;
    list.push(merge([part(new THREE.ExtrudeGeometry(s, { depth: .04, bevelEnabled: false, curveSegments: 6 }), 0xffffff, { p: [0, .08, 0] }), part(new THREE.CylinderGeometry(.05, .07, .14, 5), 0xd0d0d0, { p: [0, .07, .02] })])); }
  // tubes
  { const parts = []; for (let i = 0; i < 6; i++) { const a = i * 2.4, d = i ? .14 + r() * .1 : 0, h = .3 + r() * .5; parts.push(part(new THREE.CylinderGeometry(.08, .06, h, 7, 1, true), (x, y, z, c) => c.setHSL(0, 0, .75 + y * .4), { p: [Math.cos(a) * d, h / 2, Math.sin(a) * d] })); parts.push(part(new THREE.TorusGeometry(.08, .025, 4, 8), 0xffffff, { p: [Math.cos(a) * d, h, Math.sin(a) * d], r: [Math.PI / 2, 0, 0] })); } list.push(merge(parts)); }
  // table / mushroom
  { list.push(merge([part(new THREE.CylinderGeometry(.06, .1, .35, 6), 0xd8d8d8, { p: [0, .17, 0] }), part(new THREE.CylinderGeometry(.55, .4, .1, 9), (x, y, z, c) => c.setHSL(0, 0, .85 + y), { p: [0, .38, 0] })])); }
  // starfish
  { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, rr = i % 2 ? .12 : .32; i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(rr, 0); } list.push(merge([part(new THREE.ExtrudeGeometry(s, { depth: .06, bevelEnabled: true, bevelSize: .03, bevelThickness: .03, bevelSegments: 1 }), 0xffffff, { p: [0, .05, 0], r: [-Math.PI / 2, 0, 0] })])); }
  // anemone
  { const parts = [part(new THREE.CylinderGeometry(.16, .2, .18, 8), 0xe0e0e0, { p: [0, .09, 0] })]; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, d = .1 + (i % 2) * .05; parts.push(part(new THREE.ConeGeometry(.035, .32, 4), 0xffffff, { p: [Math.cos(a) * d, .32, Math.sin(a) * d], r: [Math.sin(a) * .5, 0, -Math.cos(a) * .5] })); } list.push(merge(parts)); }
  return list;
}

// Kelp strip: bent ribbon, sways in the vertex shader.
export function kelpGeometry() {
  const parts = []; for (let i = 0; i < 3; i++) { const h = 1.6 + i * .5; parts.push(part(new THREE.BoxGeometry(.12, h, .03, 1, 6, 1), (x, y, z, c) => c.setHSL(.28, .55, .22 + y / h * .25), { p: [(i - 1) * .14, h / 2, (i % 2) * .08], r: [0, i * .9, 0] })); }
  return merge(parts);
}

export function swayMaterial(base, amount = .25) {
  const m = base.clone(); m.userData.time = { value: 0 };
  m.onBeforeCompile = sh => { sh.uniforms.uTime = m.userData.time; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    float ph = float(gl_InstanceID) * 1.7; float k = max(0., position.y) * ${amount.toFixed(3)};
    transformed.x += sin(uTime * 1.6 + ph + position.y * 1.3) * k; transformed.z += cos(uTime * 1.2 + ph * .7 + position.y) * k * .6;`); };
  return m;
}

export function rockGeometry() {
  const g = new THREE.DodecahedronGeometry(1, 0); const p = g.attributes.position, r = rng(3);
  for (let i = 0; i < p.count; i++) { p.setY(i, p.getY(i) * .7); }
  return merge([part(g, (x, y, z, c) => c.setHSL(.55, .12, .26 + y * .1 + r() * .04))]);
}

// ---------- Trash ----------
export const TRASH = {
  bottle: { size: 1, value: 6, hold: 0 },
  can: { size: 1, value: 5, hold: 0 },
  bag: { size: 1, value: 6, hold: 0 },
  tire: { size: 1.4, value: 18, hold: .6 },
  barrel: { size: 1.6, value: 30, hold: 1.1 },
};
export function trashGeometries() {
  return {
    bottle: merge([part(new THREE.CylinderGeometry(.1, .1, .32, 8), 0x49b36a, { p: [0, 0, 0], r: [Math.PI / 2, 0, 0] }), part(new THREE.CylinderGeometry(.04, .08, .14, 8), 0x49b36a, { p: [0, 0, .23], r: [Math.PI / 2, 0, 0] }), part(new THREE.CylinderGeometry(.045, .045, .04, 8), 0xe8e8e8, { p: [0, 0, .31], r: [Math.PI / 2, 0, 0] })]),
    can: merge([part(new THREE.CylinderGeometry(.08, .08, .22, 10), (x, y, z, c) => c.set(Math.abs(y) > .09 ? 0xcfd5da : 0xe2384d), { r: [Math.PI / 2, 0, .3] })]),
    bag: merge([part((() => { const g = new THREE.IcosahedronGeometry(.25, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { p.setY(i, p.getY(i) * .35 + Math.sin(p.getX(i) * 9) * .04); } return g; })(), 0xeaf2f5)]),
    tire: merge([part(new THREE.TorusGeometry(.3, .13, 6, 12), 0x23262b, { r: [Math.PI / 2, 0, 0] })]),
    barrel: merge([part(new THREE.CylinderGeometry(.26, .26, .6, 10), (x, y, z, c) => c.set(Math.abs(y) > .22 ? 0x2a2a2a : Math.abs(y) < .05 ? 0x2a2a2a : 0xf2c12e), { p: [0, .3, 0] }), part(new THREE.CylinderGeometry(.2, .2, .02, 10), 0x6ef04a, { p: [0, .61, 0] })]),
  };
}

export function buildNet() {
  const g = new THREE.IcosahedronGeometry(.85, 1); g.scale(1, .75, 1);
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(g, 1), mats.net.clone()); lines.position.y = .6; return lines;
}

// ---------- Animals (rescue + buddies) ----------
export function buildAnimal(id) {
  const root = new THREE.Group(), anim = [];
  const add = (geo, mat = mats.flat) => { const m = new THREE.Mesh(geo, mat); root.add(m); return m; };
  const eyes = (x, y, z, r = .05) => [part(new THREE.SphereGeometry(r * 1.4, 6, 6), 0xffffff, { p: [x, y, z] }), part(new THREE.SphereGeometry(r, 6, 6), 0x0b1016, { p: [x * 1.08, y, z + r * .9] }), part(new THREE.SphereGeometry(r * 1.4, 6, 6), 0xffffff, { p: [-x, y, z] }), part(new THREE.SphereGeometry(r, 6, 6), 0x0b1016, { p: [-x * 1.08, y, z + r * .9] })];
  if (id === 'turtle') {
    add(merge([part(new THREE.SphereGeometry(.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, .55, 1.2), (x, y, z, c) => c.set((Math.floor((x + 1) * 5) + Math.floor((z + 1) * 5)) % 2 ? 0x3d8b53 : 0x56a865)),
      part(new THREE.CylinderGeometry(.5, .5, .06, 12).scale(1, 1, 1.2), 0xc9d98a), part(new THREE.SphereGeometry(.19, 8, 6), 0x9fd38a, { p: [0, .08, .72] }), ...eyes(.09, .14, .84, .035)]));
    for (const [x, z, s] of [[.48, .35, 1], [-.48, .35, -1], [.4, -.4, 1], [-.4, -.4, -1]]) { const f = new THREE.Mesh(part(new THREE.SphereGeometry(.18, 6, 4).scale(1.6, .25, .7), 0x9fd38a), mats.flat); f.position.set(x, 0, z); root.add(f); anim.push((t, sp) => { f.rotation.y = s * Math.sin(t * 5 * sp + z) * .5; }); }
  } else if (id === 'seal') {
    add(merge([part(taper(new THREE.SphereGeometry(.5, 10, 8).scale(.85, .75, 1.6), 1.6, 1.9), (x, y, z, c) => c.set(y < -.15 ? 0xd9dde0 : 0x8a949e)), part(new THREE.SphereGeometry(.38, 10, 8), 0x9aa4ae, { p: [0, .12, .85] }), part(new THREE.SphereGeometry(.12, 6, 6), 0xc7cdd2, { p: [0, .02, 1.15] }), part(new THREE.SphereGeometry(.05, 6, 6), 0x1a1a1a, { p: [0, .08, 1.26] }), ...eyes(.15, .25, 1.13, .06)]));
    const tail = new THREE.Mesh(part(new THREE.ConeGeometry(.3, .4, 4).rotateX(-Math.PI / 2).scale(1.4, .3, 1), 0x7b858f), mats.flat); tail.position.z = -1.05; root.add(tail); anim.push((t, sp) => { tail.rotation.y = Math.sin(t * 6 * sp) * .5; });
  } else if (id === 'octopus') {
    add(merge([part(new THREE.SphereGeometry(.45, 10, 8).scale(1, 1.15, 1), 0xd9548c, { p: [0, .55, 0] }), ...eyes(.15, .5, .38, .07)]));
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, arm = new THREE.Mesh(part(new THREE.CapsuleGeometry(.07, .55, 2, 5), 0xc5437a, { p: [0, -.28, 0] }), mats.flat); arm.position.set(Math.cos(a) * .25, .25, Math.sin(a) * .25); root.add(arm); anim.push((t, sp) => { arm.rotation.set(Math.sin(a) * (.9 + Math.sin(t * 4 * sp + i) * .3), 0, -Math.cos(a) * (.9 + Math.sin(t * 4 * sp + i) * .3)); }); }
  } else if (id === 'dolphin') {
    const fin = new THREE.Shape(); fin.moveTo(-.3, 0); fin.quadraticCurveTo(0, .5, .22, .5); fin.lineTo(.15, 0);
    add(merge([part(taper(new THREE.SphereGeometry(.5, 12, 8).scale(.6, .55, 1.7), 1.7, 2), (x, y, z, c) => c.set(y < -.1 ? 0xe6f0f5 : 0x5f9fc7)), part(new THREE.CylinderGeometry(.07, .14, .4, 8).rotateX(Math.PI / 2), 0x6aa8cf, { p: [0, -.05, 1.75] }), part(new THREE.ExtrudeGeometry(fin, { depth: .05, bevelEnabled: false }), 0x4f8fb8, { p: [-.02, .22, 0], r: [0, Math.PI / 2, 0] }), ...eyes(.2, .1, 1.3, .055)]));
    const tail = new THREE.Mesh(part(new THREE.ConeGeometry(.4, .3, 3).rotateX(-Math.PI / 2).scale(1.6, .2, 1), 0x4f8fb8), mats.flat); tail.position.z = -1.6; root.add(tail); anim.push((t, sp) => { tail.rotation.x = Math.sin(t * 6 * sp) * .45; });
  } else {
    add(merge([part(taper(new THREE.SphereGeometry(.7, 12, 9).scale(1, .8, 1.7), 1.7, 2.2), (x, y, z, c) => c.set(y < -.15 ? 0xe9f1f7 : 0x3d6fb8)), ...eyes(.5, .05, .9, .07), part(new THREE.SphereGeometry(.3, 6, 4).scale(1.6, .2, .8), 0x335f9f, { p: [.75, -.2, .3] }), part(new THREE.SphereGeometry(.3, 6, 4).scale(1.6, .2, .8), 0x335f9f, { p: [-.75, -.2, .3] })]));
    const tail = new THREE.Mesh(part(new THREE.ConeGeometry(.6, .4, 3).rotateX(-Math.PI / 2).scale(1.8, .2, 1), 0x335f9f), mats.flat); tail.position.z = -1.8; root.add(tail); anim.push((t, sp) => { tail.rotation.x = Math.sin(t * 3 * sp) * .35; });
  }
  const shadow = blobShadow(1.8); root.add(shadow);
  root.userData = { anim, shadow };
  return root;
}
export const ANIMAL_SCALE = { turtle: .7, seal: .55, octopus: .6, dolphin: .55, whale: .55 };

// ---------- Jellyfish, clam, O2 bubble ----------
export function buildJelly() {
  const root = new THREE.Group();
  const bell = new THREE.Mesh(new THREE.SphereGeometry(.45, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.jelly); bell.position.y = 1.1; root.add(bell);
  const tent = []; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, t = new THREE.Mesh(new THREE.CylinderGeometry(.025, .01, .9, 4), mats.jelly); t.position.set(Math.cos(a) * .25, .65, Math.sin(a) * .25); root.add(t); tent.push(t); }
  const glow = new THREE.Sprite(mats.glowSprite.clone()); glow.material.color.set(0xff6fc8); glow.material.opacity = .45; glow.scale.set(2.2, 2.2, 1); glow.position.y = 1; root.add(glow);
  root.add(blobShadow(1.4));
  root.userData = { bell, tent };
  return root;
}

export function buildClam() {
  const root = new THREE.Group();
  const shell = (top) => new THREE.Mesh(part(new THREE.SphereGeometry(.32, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, .35, .9), (x, y, z, c) => c.setHSL(.07, .45, .55 + Math.sin(Math.atan2(z, x) * 9) * .08)), mats.flat);
  const bottom = shell(); bottom.rotation.x = Math.PI; bottom.position.y = .1; root.add(bottom);
  const lid = new THREE.Group(); lid.position.set(0, .1, -.28); const lm = shell(); lm.position.z = .28; lid.add(lm); root.add(lid);
  const pearl = new THREE.Mesh(new THREE.SphereGeometry(.11, 12, 10), new THREE.MeshPhongMaterial({ color: 0xfff6ff, emissive: 0x7a6a90, shininess: 150 })); pearl.position.y = .16; root.add(pearl);
  const glow = new THREE.Sprite(mats.glowSprite.clone()); glow.material.color.set(0xf4d7ff); glow.scale.set(1.2, 1.2, 1); glow.position.y = .3; glow.visible = false; root.add(glow);
  root.userData = { lid, pearl, glow };
  return root;
}

export function buildO2() {
  const root = new THREE.Group();
  for (const [x, y, z, r] of [[0, .9, 0, .32], [.28, 1.25, .1, .18], [-.22, 1.35, -.05, .14]]) { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mats.bubble); b.position.set(x, y, z); root.add(b); }
  const glow = new THREE.Sprite(mats.glowSprite.clone()); glow.material.color.set(0x7fe9ff); glow.material.opacity = .7; glow.scale.set(2, 2, 1); glow.position.y = 1; root.add(glow);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture('O₂', '#e9fdff'), transparent: true, depthTest: false })); label.scale.set(.7, .7, 1); label.position.y = .9; root.add(label);
  root.add(blobShadow(1.2));
  return root;
}

// ---------- Centerpieces ----------
export function buildWreck() {
  const wood = 0x6b4325, dark = 0x3e2614;
  const g = merge([
    part(taper(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1.6, 1.1, 4.2), 4.2, 5), (x, y, z, c) => c.set(Math.floor(y * 6) % 2 ? wood : dark), { p: [0, 1, 0] }),
    part(new THREE.BoxGeometry(2.6, .12, 6.5), 0x80562f, { p: [0, .98, -.3] }),
    part(new THREE.CylinderGeometry(.12, .15, 4.5, 6), 0x5a391f, { p: [0, 3, .8], r: [.15, 0, .2] }),
    part(new THREE.BoxGeometry(2.2, .1, .1), 0x5a391f, { p: [.3, 4.2, 1], r: [0, .3, .2] }),
    part(new THREE.CylinderGeometry(.1, .12, 2.6, 6), 0x5a391f, { p: [0, 2.2, -2.2], r: [-.3, 0, -.4] }),
    part(new THREE.BoxGeometry(1.4, 1, 1.6), 0x734a29, { p: [0, 1.4, -2.6] }),
  ]);
  const m = new THREE.Mesh(g, mats.flat); m.rotation.set(.15, .7, .35); return m;
}
export function buildCrystals() {
  const parts = [], r = rng(11); for (let i = 0; i < 9; i++) { const a = r() * Math.PI * 2, d = r() * 1.3, h = 1 + r() * 2.6; parts.push(part(new THREE.ConeGeometry(.25 + r() * .2, h, 5), (x, y, z, c) => c.setHSL(.55 + r() * .25, .9, .55 + y / h * .3), { p: [Math.cos(a) * d, h / 2, Math.sin(a) * d], r: [Math.cos(a) * .3, 0, Math.sin(a) * .3] })); }
  const m = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x4a2ccf, emissiveIntensity: .8 })); return m;
}
export function buildArch() {
  const g = new THREE.TorusGeometry(2.2, .7, 6, 10, Math.PI); const r = rng(5), p = g.attributes.position; for (let i = 0; i < p.count; i++) { p.setX(i, p.getX(i) + (r() - .5) * .25); p.setZ(i, p.getZ(i) + (r() - .5) * .25); }
  return new THREE.Mesh(merge([part(g, (x, y, z, c) => c.setHSL(.55, .12, .2 + y * .04))]), mats.flat);
}
