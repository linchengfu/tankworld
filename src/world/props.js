// Street dressing a tank can flatten: trees, lamp posts, traffic lights, cars, buses, barriers, sandbags.
// Each kind is one InstancedMesh; an instance keeps a little state so it can fall over or be crushed.
import * as THREE from 'three';
import { GeoBuilder } from '../tank/geom.js';

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

function geoFor(kind) {
  const B = new GeoBuilder();
  if (kind === 'tree') {
    B.cyl(0.2, 4.2, 0, 2.1, 0, { seg: 6, r2: 0.13, c: [0.3, 0.23, 0.16] });
    const g = [0.105, 0.2, 0.075];
    const blob = (r, x, y, z, m) => { const s = new THREE.IcosahedronGeometry(r, 1); s.scale(1, 0.82, 1); s.computeVertexNormals(); B.addGeometry(s, B.xf(x, y, z, { ry: x * 3 + z }), g.map((v) => v * m)); s.dispose(); };
    blob(2.2, 0, 5.5, 0, 1); blob(1.7, 1.3, 4.9, 0.5, 0.8); blob(1.6, -1.1, 5.0, -0.8, 0.9); blob(1.6, 0.2, 6.9, 0.3, 1.25); blob(1.4, -0.6, 4.7, 1.2, 0.74);
    B.cyl(0.07, 1.6, 0.5, 4.2, 0.2, { seg: 4, rz: -0.6, c: [0.3, 0.23, 0.16] }); B.cyl(0.07, 1.6, -0.5, 4.1, -0.2, { seg: 4, rz: 0.6, c: [0.3, 0.23, 0.16] });
  } else if (kind === 'lamp') {
    B.cyl(0.11, 9, 0, 4.5, 0, { seg: 6, r2: 0.07, c: 0.32 });
    B.box(0.08, 0.08, 2.2, 0, 8.9, 1.0, { c: 0.32 }); B.box(0.3, 0.1, 0.7, 0, 8.84, 2.0, { c: 0.4 }); B.box(0.24, 0.03, 0.56, 0, 8.78, 2.0, { c: [2.2, 2.0, 1.5] });
    B.cyl(0.2, 0.5, 0, 0.25, 0, { seg: 6, c: 0.25 });
  } else if (kind === 'tlight') {
    B.cyl(0.12, 6, 0, 3, 0, { seg: 6, c: 0.28 }); B.box(0.1, 0.1, 5.0, 0, 5.8, 2.5, { c: 0.28 });
    for (const z of [2.2, 4.4]) { B.box(0.34, 1.0, 0.3, 0, 5.2, z, { c: 0.06 }); B.box(0.2, 0.2, 0.02, 0, 5.52, z + 0.16, { c: [2.4, 0.2, 0.15] }); B.box(0.2, 0.2, 0.02, 0, 5.2, z + 0.16, { c: [0.3, 0.25, 0.05] }); B.box(0.2, 0.2, 0.02, 0, 4.88, z + 0.16, { c: [0.05, 0.3, 0.1] }); }
  } else if (kind === 'car') {
    B.box(1.78, 0.62, 4.5, 0, 0.62, 0, { c: 1 }); B.box(1.6, 0.56, 2.3, 0, 1.2, -0.2, { c: 0.92 });
    B.box(1.62, 0.42, 0.04, 0, 1.2, 0.97, { rx: -0.5, c: [0.06, 0.09, 0.12] }); B.box(1.62, 0.4, 0.04, 0, 1.2, -1.36, { rx: 0.45, c: [0.06, 0.09, 0.12] });
    for (const s of [1, -1]) { B.box(0.03, 0.34, 1.9, s * 0.81, 1.22, -0.2, { c: [0.06, 0.09, 0.12] }); for (const z of [1.45, -1.45]) B.cyl(0.33, 0.24, s * 0.82, 0.33, z, { axis: 'x', seg: 8, c: [0.05, 0.05, 0.05] }); }
    B.box(1.5, 0.14, 0.04, 0, 0.7, 2.26, { c: [1.9, 1.8, 1.5] }); B.box(1.5, 0.12, 0.04, 0, 0.74, -2.26, { c: [0.8, 0.06, 0.05] });
  } else if (kind === 'bus') {
    B.box(2.5, 2.6, 11.6, 0, 1.75, 0, { c: 1 }); B.box(2.52, 0.9, 11.0, 0, 2.2, 0, { c: [0.06, 0.09, 0.12] }); B.box(2.3, 1.2, 0.04, 0, 2.1, 5.81, { c: [0.06, 0.09, 0.12] });
    B.box(2.52, 0.3, 11.62, 0, 0.75, 0, { c: [0.85, 0.85, 0.85] });
    for (const s of [1, -1]) for (const z of [3.9, -3.4]) B.cyl(0.48, 0.3, s * 1.15, 0.48, z, { axis: 'x', seg: 8, c: [0.05, 0.05, 0.05] });
  } else if (kind === 'barrier') {
    B.box(0.6, 0.3, 3.0, 0, 0.15, 0, { c: 0.46 }); B.box(0.3, 0.65, 3.0, 0, 0.62, 0, { c: 0.5 });
    B.box(0.31, 0.2, 0.6, 0, 0.7, -0.9, { c: [0.7, 0.16, 0.1] }); B.box(0.31, 0.2, 0.6, 0, 0.7, 0.9, { c: [0.7, 0.16, 0.1] });
  } else if (kind === 'sandbag') {
    for (let row = 0; row < 4; row++) for (let i = 0; i < 5; i++) {
      const z = -1.3 + i * 0.65 + (row % 2) * 0.3, s = new THREE.SphereGeometry(0.36, 6, 4); s.scale(1.25, 0.42, 0.95);
      B.addGeometry(s, B.xf(((i * 7 + row * 3) % 5) * 0.03 - 0.06, 0.15 + row * 0.27, z), [0.36 + ((i + row) % 3) * 0.04, 0.32 + ((i + row) % 3) * 0.035, 0.22]); s.dispose();
    }
  }
  return B.build(0.2);
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _ax = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);

export class Props {
  constructor(scene) { this.scene = scene; this.items = []; this.pending = {}; this.cells = new Map(); this.anim = []; this.meshes = {}; }
  add(kind, x, z, rot = 0, o = {}) { (this.pending[kind] ||= []).push({ kind, x, z, y: o.y || 0, rot, scale: o.scale || 1, color: o.color || 0xffffff, alive: true, t: 0, fx: 0, fz: 1, K: KINDS[kind] }); }
  build() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.15, envMapIntensity: 0.5 });
    for (const kind of Object.keys(this.pending)) {
      const list = this.pending[kind], mesh = new THREE.InstancedMesh(geoFor(kind), mat, list.length);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      list.forEach((it, i) => { it.mesh = mesh; it.i = i; this.items.push(it); this.write(it); mesh.setColorAt(i, _c.set(it.color)); this.hash(it); });
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.meshes[kind] = mesh; this.scene.add(mesh);
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
    it.mesh.setMatrixAt(it.i, _m.compose(_p, _q, _s)); it.mesh.instanceMatrix.needsUpdate = true;
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
    if (!it.K.fall || burn) { _c.set(it.color).multiplyScalar(burn ? 0.12 : 0.45); it.mesh.setColorAt(it.i, _c); it.mesh.instanceColor.needsUpdate = true; }
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
