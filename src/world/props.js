// Street dressing a tank can flatten: trees, lamp posts, traffic lights, cars, buses, barriers, sandbags.
// Each kind is one InstancedMesh; an instance keeps a little state so it can fall over or be crushed.
import * as THREE from 'three';
import { GeoBuilder } from '../tank/geom.js';
import { leafTexture } from '../gfx/textures.js';
import { makeRng } from '../core/util.js';

const KINDS = {
  //            radius  half-length  height  blocks shells  fall?   slow
  tree:    { r: 0.45, cl: 0,   h: 9,   block: false, fall: true,  slow: 0.02 },
  lamp:    { r: 0.25, cl: 0,   h: 9,   block: false, fall: true,  slow: 0.01 },
  tlight:  { r: 0.25, cl: 0,   h: 6,   block: false, fall: true,  slow: 0.01 },
  car:     { r: 0.95, cl: 1.4, h: 1.5, block: true,  fall: false, slow: 0.1 },
  bus:     { r: 1.3,  cl: 4.6, h: 3.1, block: true,  fall: false, slow: 0.22 },
  barrier: { r: 0.4,  cl: 1.3, h: 0.95, block: true, fall: false, slow: 0.12 },
  sandbag: { r: 0.55, cl: 1.4, h: 1.1, block: true,  fall: false, slow: 0.1 },
};

const mirror = (half) => [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
const GLASS = [0.03, 0.05, 0.07], TYRE = [0.035, 0.035, 0.035];
let _mats;
function mats() {
  if (_mats) return _mats;
  const leaf = leafTexture();
  _mats = {
    prop: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.1, envMapIntensity: 0.5 }),
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.45, envMapIntensity: 1.0 }),
    leaf: new THREE.MeshStandardMaterial({ map: leaf, vertexColors: true, alphaTest: 0.42, roughness: 0.8, metalness: 0, envMapIntensity: 0.35 }),
    leafDepth: new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leaf, alphaTest: 0.42 }),
  };
  return _mats;
}
// Foliage: leaf-clump cards scattered through an ellipsoid crown, each drawn from both sides with a soft outward normal.
function foliage() {
  const r = makeRng(31), pos = [], nor = [], uv = [], col = [], C = new THREE.Vector3(0, 6.3, 0), p = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < 44; i++) {
    const th = r() * 6.283, ph = Math.acos(r.range(-0.75, 1)), rad = 0.5 + 0.5 * Math.pow(r(), 0.5);
    p.set(Math.sin(ph) * Math.cos(th) * 3.1 * rad, Math.cos(ph) * 2.3 * rad, Math.sin(ph) * Math.sin(th) * 3.1 * rad).add(C);
    n.copy(p).sub(C).add(new THREE.Vector3(0, 1.4, 0)).normalize();
    a.set(r() - 0.5, r() - 0.5, r() - 0.5).cross(n).normalize(); b.crossVectors(n, a).normalize(); a.applyAxisAngle(b, r.range(-0.6, 0.6));
    const sz = r.range(1.5, 2.3), k = r.range(0.7, 1.15) * (0.75 + 0.25 * (p.y - 4) / 4.6);
    const q = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]].map(([u, v, s, t]) => [p.x + (a.x * u + b.x * v) * sz, p.y + (a.y * u + b.y * v) * sz, p.z + (a.z * u + b.z * v) * sz, s, t]);
    for (const order of [[0, 1, 2, 0, 2, 3], [0, 2, 1, 0, 3, 2]]) for (const t of order) { pos.push(q[t][0], q[t][1], q[t][2]); uv.push(q[t][3], q[t][4]); nor.push(n.x, n.y, n.z); col.push(k, k, k); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
function wheel(B, r, w, x, y, z, s) { B.lathe([[r * 0.62, -w / 2], [r, -w / 2], [r, w / 2], [r * 0.62, w / 2]], x, y, z, s, TYRE, 12); B.lathe([[r * 0.62, w / 2], [r * 0.55, w / 2 - 0.03], [r * 0.2, w / 2 - 0.01], [0, w / 2 + 0.01]], x, y, z, s, [0.55, 0.56, 0.58], 12); }

// Each kind is a list of parts: { geo, mat, depth? }.
function partsFor(kind) {
  const B = new GeoBuilder(), M = mats();
  if (kind === 'tree') {
    const bark = [0.2, 0.165, 0.125];
    B.cyl(0.24, 4.6, 0, 2.3, 0, { seg: 8, r2: 0.14, c: bark });
    for (const [rz, rx, y] of [[0.55, 0.1, 4.4], [-0.5, 0.3, 4.2], [0.15, -0.6, 4.6], [-0.2, 0.55, 4.9]]) B.cyl(0.1, 2.4, -Math.sin(rz) * 1.0, y + 0.9, Math.sin(rx) * 1.0, { seg: 5, r2: 0.04, rz, rx, c: bark });
    B.cyl(0.42, 0.12, 0, 0.06, 0, { seg: 8, c: [0.16, 0.15, 0.13] });
    return [{ geo: B.build(0.3), mat: M.prop }, { geo: foliage(), mat: M.leaf, depth: M.leafDepth }];
  }
  if (kind === 'lamp') {
    B.cyl(0.1, 9, 0, 4.5, 0, { seg: 8, r2: 0.065, c: 0.3 }); B.cyl(0.17, 0.6, 0, 0.3, 0, { seg: 8, c: 0.24 });
    B.cyl(0.04, 2.3, 0, 8.95, 1.05, { axis: 'z', seg: 6, c: 0.3 }); B.box(0.34, 0.1, 0.8, 0, 8.9, 2.1, { c: 0.36 }); B.box(0.26, 0.02, 0.6, 0, 8.84, 2.1, { c: [2.4, 2.2, 1.7] });
  } else if (kind === 'tlight') {
    B.cyl(0.11, 6.2, 0, 3.1, 0, { seg: 8, c: 0.26 }); B.cyl(0.06, 5.0, 0, 5.9, 2.5, { axis: 'z', seg: 6, c: 0.26 }); B.cyl(0.18, 0.5, 0, 0.25, 0, { seg: 8, c: 0.2 });
    for (const z of [2.2, 4.4]) { B.box(0.36, 1.05, 0.28, 0, 5.25, z, { c: 0.05 }); B.box(0.44, 1.15, 0.02, 0, 5.25, z - 0.15, { c: 0.04 }); for (const [dy, c] of [[0.33, [2.6, 0.15, 0.1]], [0, [0.25, 0.2, 0.04]], [-0.33, [0.04, 0.3, 0.1]]]) B.cyl(0.1, 0.03, 0, 5.25 + dy, z + 0.15, { axis: 'z', seg: 10, c }); }
  } else if (kind === 'car') {
    const body = (z, k, belt, top) => ({ z, pts: mirror([[0, 0.3], [0.8 * k, 0.3], [0.9 * k, 0.48], [0.9 * k, belt], [0.8 * k, top], [0, top + 0.02]]) });
    B.sections([body(2.3, 0.86, 0.6, 0.66), body(2.05, 0.96, 0.72, 0.8), body(0.95, 1, 0.88, 0.94), body(-1.3, 1, 0.9, 0.96), body(-2.1, 0.97, 0.86, 0.92), body(-2.3, 0.88, 0.68, 0.74)], 1);
    const cab = (z, w, wr, yr) => ({ z, pts: mirror([[0, 0.92], [w, 0.92], [wr, yr], [0, yr + 0.01]]) });
    B.sections([cab(1.0, 0.84, 0.82, 0.95), cab(0.3, 0.84, 0.68, 1.43), cab(-1.0, 0.84, 0.68, 1.42), cab(-1.75, 0.84, 0.8, 0.97)], 1, { cap: 0, color: (s, i) => (i === 0 || i === 5 ? null : s === 1 && (i === 2 || i === 3) ? 1 : GLASS) });
    for (const z of [0.3, -1.0]) for (const s of [1, -1]) B.box(0.06, 0.56, 0.07, s * 0.765, 1.18, z, { rz: s * 0.27, c: 1 });
    for (const s of [1, -1]) { for (const z of [1.42, -1.42]) { wheel(B, 0.33, 0.22, s * 0.78, 0.33, z, s); B.cyl(0.4, 0.3, s * 0.72, 0.36, z, { axis: 'x', seg: 12, c: [0.02, 0.02, 0.02] }); } B.box(0.3, 0.1, 0.03, s * 0.56, 0.66, 2.29, { c: [2.0, 1.9, 1.6] }); B.box(0.34, 0.09, 0.03, s * 0.54, 0.78, -2.3, { c: [0.9, 0.05, 0.04] }); B.box(0.05, 0.08, 0.16, s * 0.95, 0.98, 0.85, { c: 0.9 }); }
    B.box(1.5, 0.14, 0.05, 0, 0.42, 2.3, { c: [0.03, 0.03, 0.03] }); B.box(1.5, 0.14, 0.05, 0, 0.42, -2.31, { c: [0.03, 0.03, 0.03] }); B.box(0.5, 0.11, 0.02, 0, 0.5, -2.34, { c: [0.1, 0.2, 0.6] });
    return [{ geo: B.build(0.2), mat: M.paint }];
  } else if (kind === 'bus') {
    const sec = (z, k) => ({ z, pts: mirror([[0, 0.36], [1.22 * k, 0.36], [1.25 * k, 1.45], [1.25 * k, 2.68], [1.08 * k, 3.04], [0, 3.1]]) });
    B.sections([sec(5.8, 0.94), sec(5.6, 1), sec(-5.6, 1), sec(-5.8, 0.96)], 1, { color: (s, i) => (s === 1 && (i === 2 || i === 7) ? GLASS : 1) });
    B.box(2.2, 1.25, 0.03, 0, 2.05, 5.82, { c: GLASS }); B.box(2.0, 0.8, 0.03, 0, 2.2, -5.82, { c: GLASS }); B.box(1.4, 0.26, 0.03, 0, 2.86, 5.83, { c: [1.6, 0.9, 0.2] });
    for (let k = -5; k <= 5; k++) for (const s of [1, -1]) B.box(0.03, 1.25, 0.09, s * 1.26, 2.06, k * 1.02, { c: 1 });
    for (const s of [1, -1]) { for (const z of [3.9, -3.3]) { wheel(B, 0.5, 0.3, s * 1.1, 0.5, z, s); B.cyl(0.58, 0.4, s * 1.02, 0.52, z, { axis: 'x', seg: 12, c: [0.02, 0.02, 0.02] }); } B.box(0.26, 0.14, 0.03, s * 0.9, 0.7, 5.82, { c: [2.0, 1.9, 1.6] }); B.box(0.2, 0.2, 0.03, s * 0.95, 0.8, -5.82, { c: [0.9, 0.05, 0.04] }); }
    return [{ geo: B.build(0.2), mat: M.paint }];
  } else if (kind === 'barrier') {
    B.sections([-1.5, 1.5].map((z) => ({ z, pts: mirror([[0, 0], [0.3, 0], [0.3, 0.1], [0.13, 0.32], [0.08, 0.9], [0, 0.9]]) })), 0.5);
    for (const z of [-0.9, 0.9]) B.box(0.21, 0.26, 0.5, 0, 0.6, z, { c: [0.62, 0.14, 0.09] });
    B.box(0.5, 0.03, 0.06, 0, 0.015, 0, { c: 0.2 });
  } else if (kind === 'sandbag') {
    for (let row = 0; row < 4; row++) for (let i = 0; i < 5; i++) {
      const z = -1.3 + i * 0.65 + (row % 2) * 0.3, g = new THREE.SphereGeometry(0.36, 8, 5); g.scale(1.25, 0.42, 0.95);
      const k = 0.85 + ((i * 3 + row * 5) % 4) * 0.06; B.addGeometry(g, B.xf(((i * 7 + row * 3) % 5) * 0.03 - 0.06, 0.15 + row * 0.27, z, { ry: ((i + row) % 3 - 1) * 0.12 }), [0.34 * k, 0.3 * k, 0.21 * k]); g.dispose();
    }
  }
  return [{ geo: B.build(0.2), mat: M.prop }];
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _ax = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);

export class Props {
  constructor(scene) { this.scene = scene; this.items = []; this.pending = {}; this.cells = new Map(); this.anim = []; this.meshes = {}; }
  add(kind, x, z, rot = 0, o = {}) { (this.pending[kind] ||= []).push({ kind, x, z, y: o.y || 0, rot, scale: o.scale || 1, color: o.color || 0xffffff, alive: true, t: 0, fx: 0, fz: 1, K: KINDS[kind] }); }
  build() {
    for (const kind of Object.keys(this.pending)) {
      const list = this.pending[kind], meshes = partsFor(kind).map((p) => {
        const mesh = new THREE.InstancedMesh(p.geo, p.mat, list.length); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
        if (p.depth) { mesh.customDepthMaterial = p.depth; mesh.userData.noAO = true; }
        this.scene.add(mesh); return mesh;
      });
      list.forEach((it, i) => { it.meshes = meshes; it.i = i; this.items.push(it); this.write(it); _c.set(it.color); for (const m of meshes) m.setColorAt(i, _c); this.hash(it); });
      for (const m of meshes) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
      this.meshes[kind] = meshes;
    }
    this.pending = {};
  }
  hash(it) { const k = (Math.floor(it.x / 16) + 512) * 1024 + Math.floor(it.z / 16) + 512; let a = this.cells.get(k); if (!a) this.cells.set(k, (a = [])); a.push(it); }
  write(it) {
    _q.setFromAxisAngle(Y, it.rot); _s.setScalar(it.scale); _p.set(it.x, it.y, it.z);
    if (!it.alive) {
      const k = Math.min(1, it.t / 0.7), e = 1 - (1 - k) * (1 - k);
      if (it.K.fall) { _ax.set(it.fz, 0, -it.fx).normalize(); _q2.setFromAxisAngle(_ax, e * 1.48 + Math.sin(k * 9) * (1 - k) * 0.08); _q.premultiply(_q2); }
      else { _s.set(it.scale * (1 + e * 0.12), it.scale * (1 - e * (it.kind === 'sandbag' ? 0.6 : 0.68)), it.scale * (1 + e * 0.06)); _q2.setFromAxisAngle(_ax.set(it.fz, 0, -it.fx).normalize(), e * 0.12); _q.premultiply(_q2); }
    }
    _m.compose(_p, _q, _s); for (const m of it.meshes) { m.setMatrixAt(it.i, _m); m.instanceMatrix.needsUpdate = true; }
  }
  near(x, z, rad, fn) {
    const c0 = Math.floor((x - rad) / 16), c1 = Math.floor((x + rad) / 16), d0 = Math.floor((z - rad) / 16), d1 = Math.floor((z + rad) / 16);
    for (let cx = c0; cx <= c1; cx++) for (let cz = d0; cz <= d1; cz++) { const a = this.cells.get((cx + 512) * 1024 + cz + 512); if (a) for (const it of a) fn(it); }
  }
  // distance from point to a prop's capsule axis in plan view
  dist(it, x, z) {
    if (!it.K.cl) return Math.hypot(x - it.x, z - it.z);
    const ax = Math.sin(it.rot), az = Math.cos(it.rot); let t = (x - it.x) * ax + (z - it.z) * az; t = Math.max(-it.K.cl, Math.min(it.K.cl, t));
    return Math.hypot(x - it.x - ax * t, z - it.z - az * t);
  }
  // Flatten whatever the circle touches. Returns the list crushed this call.
  crush(x, z, r, dirx, dirz, out) {
    this.near(x, z, r + 6, (it) => {
      if (!it.alive || this.dist(it, x, z) > r + it.K.r) return;
      this.kill(it, dirx, dirz); out.push(it);
    });
    return out;
  }
  kill(it, dx = 0, dz = 1, burn = false) {
    if (!it.alive) return;
    it.alive = false; it.t = 0; it.fx = dx; it.fz = dz; this.anim.push(it);
    if (!it.K.fall || burn) { _c.set(it.color).multiplyScalar(burn ? 0.1 : 0.45); for (const m of it.meshes) { m.setColorAt(it.i, _c); m.instanceColor.needsUpdate = true; } }
  }
  update(dt) {
    for (let i = this.anim.length - 1; i >= 0; i--) { const it = this.anim[i]; it.t += dt; this.write(it); if (it.t > 0.75) this.anim.splice(i, 1); }
  }
  // Shell vs. props that stop shells. Returns { t, it } for the nearest alive blocker along the segment.
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let best = null, bt = maxT;
    const mx = ox + dx * maxT * 0.5, mz = oz + dz * maxT * 0.5;
    this.near(mx, mz, maxT * 0.5 + 6, (it) => {
      if (!it.alive || !it.K.block) return;
      // closest approach of the ray to the prop centre, then refine against the capsule
      const fx = it.x - ox, fz = it.z - oz, l2 = dx * dx + dz * dz; if (l2 < 1e-9) return;
      const R = it.K.r + it.K.cl; let t = (fx * dx + fz * dz) / l2; if (t < 0 || t > bt + R) return;
      const px = ox + dx * t - it.x, pz = oz + dz * t - it.z; if (px * px + pz * pz > R * R) return;
      for (let s = Math.max(0, t - R); s <= Math.min(bt, t + R); s += 0.25) {
        if (this.dist(it, ox + dx * s, oz + dz * s) <= it.K.r) { const y = oy + dy * s; if (y < it.K.h * it.scale && y > -0.2 && s < bt) { bt = s; best = { t: s, it }; } break; }
      }
    });
    return best;
  }
}
