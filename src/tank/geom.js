// Procedural geometry helpers. GeoBuilder accumulates flat-shaded triangles with a per-vertex tint
// and writes box-projected UVs at the end, so one camo texture can wrap any shape.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
// A colour argument is a grey scalar, [r, g, b], or { c, m } where m is the surface class the tank shader reads:
// 0 camouflage paint, 1 rubber, 2 bare steel, 3 glass, 4 plain (its own colour, no camouflage).
const col3 = (c) => (c === undefined ? [1, 1, 1, 0] : typeof c === 'number' ? [c, c, c, 0] : Array.isArray(c) ? [c[0], c[1], c[2], c[3] || 0] : [...col3(c.c).slice(0, 3), c.m || 0]);
export const surf = (c, m) => ({ c, m });

export class GeoBuilder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.srf = []; }
  // Append any BufferGeometry, transformed by `matrix`, tinted by `c` (grey scalar or [r,g,b]).
  addGeometry(geo, matrix, c) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position, n = g.attributes.normal, k = col3(c);
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(matrix); this.pos.push(_v.x, _v.y, _v.z);
      _n.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); this.nor.push(_n.x, _n.y, _n.z);
      this.col.push(k[0], k[1], k[2]); this.srf.push(k[3]);
    }
    if (g !== geo) g.dispose();
    return this;
  }
  xf(x, y, z, o = {}) { _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'); _q.setFromEuler(_e); return _m.compose(_v.set(x, y, z), _q, _s).clone(); }
  box(sx, sy, sz, x, y, z, o = {}) { const g = new THREE.BoxGeometry(sx, sy, sz); this.addGeometry(g, this.xf(x, y, z, o), o.c); g.dispose(); return this; }
  // Cylinder along `axis` ('x' | 'y' | 'z'); r2 lets it taper.
  cyl(r, len, x, y, z, o = {}) {
    const g = new THREE.CylinderGeometry(o.r2 ?? r, r, len, o.seg || 12, 1, !!o.open);
    if (o.axis === 'x') g.rotateZ(Math.PI / 2); else if (o.axis === 'z') g.rotateX(Math.PI / 2);
    this.addGeometry(g, this.xf(x, y, z, o), o.c); g.dispose(); return this;
  }
  sphere(r, x, y, z, o = {}) { const g = new THREE.SphereGeometry(r, o.seg || 12, o.rings || 8); this.addGeometry(g, this.xf(x, y, z, o), o.c); g.dispose(); return this; }
  tri(a, b, c, k) {
    _n.subVectors(b, a).cross(_v.subVectors(c, a)).normalize();
    for (const p of [a, b, c]) { this.pos.push(p.x, p.y, p.z); this.nor.push(_n.x, _n.y, _n.z); this.col.push(k[0], k[1], k[2]); this.srf.push(k[3] || 0); }
  }
  // Triangle wound so that its normal points along `out`.
  triOut(a, b, c, k, out) { _n.subVectors(b, a).cross(_v.subVectors(c, a)); if (_n.dot(out) < 0) this.tri(a, c, b, k); else this.tri(a, b, c, k); }
  // A 2-D outline swept along the third axis, with triangulated (possibly concave) end caps.
  //   axis 'y': pts are [x, z] and the slab spans y = a0..a1.   axis 'x': pts are [z, y], spanning x = a0..a1.   axis 'z': pts are [x, y].
  // A point may carry its own span as [u, v, a0, a1], which is how sloping roofs and undercut floors are made.
  slab(pts, a0, a1, axis, c, o = {}) {
    const k = col3(c), ks = col3(o.side ?? c), n = pts.length;
    const P = axis === 'y' ? (u, v, w) => new THREE.Vector3(u, w, v) : axis === 'x' ? (u, v, w) => new THREE.Vector3(w, v, u) : (u, v, w) => new THREE.Vector3(u, v, w);
    const lo = pts.map((p) => P(p[0], p[1], p[2] ?? a0)), hi = pts.map((p) => P(p[0], p[1], p[3] ?? a1));
    let area = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    const sg = area > 0 ? 1 : -1, ax = P(0, 0, 1).sub(P(0, 0, 0)), out = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, du = pts[j][0] - pts[i][0], dv = pts[j][1] - pts[i][1]; if (du * du + dv * dv < 1e-10) continue;
      out.copy(P(dv * sg, -du * sg, 0)).sub(P(0, 0, 0));
      const cs = typeof o.sideColor === 'function' ? col3(o.sideColor(i)) : ks;
      this.triOut(lo[i], lo[j], hi[j], cs, out); this.triOut(lo[i], hi[j], hi[i], cs, out);
    }
    if (o.caps !== false) {
      const tris = THREE.ShapeUtils.triangulateShape(pts.map((p) => new THREE.Vector2(p[0], p[1])), []), neg = ax.clone().negate();
      for (const [a, b, d] of tris) { if (o.caps !== 'hi') this.triOut(lo[a], lo[b], lo[d], col3(o.lo ?? c), neg); if (o.caps !== 'lo') this.triOut(hi[a], hi[b], hi[d], col3(o.hi ?? c), ax); }
    }
    return this;
  }
  // Convex polygon (fan). `outward` is a point the face must look away from.
  poly(pts, c, inside) {
    const k = col3(c);
    let flip = false;
    if (inside) { _a.subVectors(pts[1], pts[0]); _b.subVectors(pts[2], pts[0]); _c.crossVectors(_a, _b); flip = _c.dot(_a.subVectors(pts[0], inside)) < 0; }
    for (let i = 1; i < pts.length - 1; i++) { if (flip) this.tri(pts[0], pts[i + 1], pts[i], k); else this.tri(pts[0], pts[i], pts[i + 1], k); }
    return this;
  }
  // Convex solid between two polygons with the same vertex count (prism / frustum).
  loft(bot, top, c) {
    const n = bot.length, ctr = new THREE.Vector3();
    for (let i = 0; i < n; i++) ctr.add(bot[i]).add(top[i]);
    ctr.multiplyScalar(1 / (2 * n));
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; this.poly([bot[i], bot[j], top[j], top[i]], c, ctr); }
    this.poly(bot, c, ctr); this.poly(top, c, ctr);
    return this;
  }
  // Transform every vertex added since `from` (a value returned by mark()).
  mark() { return this.pos.length / 3; }
  xform(from, m) {
    const nm = new THREE.Matrix3().getNormalMatrix(m), P = this.pos, N = this.nor;
    for (let i = from * 3; i < P.length; i += 3) { _v.set(P[i], P[i + 1], P[i + 2]).applyMatrix4(m); P[i] = _v.x; P[i + 1] = _v.y; P[i + 2] = _v.z; _n.set(N[i], N[i + 1], N[i + 2]).applyMatrix3(nm).normalize(); N[i] = _n.x; N[i + 1] = _n.y; N[i + 2] = _n.z; }
    return this;
  }
  // Triangle fan around a point; `away` is a point the fan must face away from.
  fan(ctr, ring, c, away) {
    const k = col3(c);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length]; if (a.distanceToSquared(b) < 1e-10) continue;
      _a.subVectors(a, ctr); _b.subVectors(b, ctr); _c.crossVectors(_a, _b); if (_c.lengthSq() < 1e-12) continue;
      if (_c.dot(_a.subVectors(ctr, away)) < 0) this.tri(ctr, b, a, k); else this.tri(ctr, a, b, k);
    }
    return this;
  }
  // Skin through cross-sections: secs = [{ z, pts: [[x, y], ...] }], every ring with the same point count and order.
  // Flat-shaded, which is what welded armour plate looks like. o.cap: 0 none, 1 first, 2 last, 3 both (default).
  sections(secs, c, o = {}) {
    const R = secs.map((s) => s.pts.map(([x, y]) => new THREE.Vector3(x, y, s.z))), n = R[0].length, cap = o.cap ?? 3;
    const mid = (ring) => { const m = new THREE.Vector3(); for (const p of ring) m.add(p); return m.multiplyScalar(1 / ring.length); };
    for (let s = 0; s < R.length - 1; s++) {
      const inside = mid(R[s]).add(mid(R[s + 1])).multiplyScalar(0.5);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, q = [R[s][i], R[s][j], R[s + 1][j], R[s + 1][i]].filter((p, k, arr) => p.distanceToSquared(arr[(k + arr.length - 1) % arr.length]) > 1e-10);
        if (q.length >= 3) { const cc = typeof o.color === 'function' ? o.color(s, i) : c; if (cc !== null) this.poly(q, cc, inside); }
      }
    }
    if (cap & 1) this.fan(mid(R[0]), R[0], o.capColor ?? c, mid(R[1]));
    if (cap & 2) this.fan(mid(R[R.length - 1]), R[R.length - 1], o.capColor ?? c, mid(R[R.length - 2]));
    return this;
  }
  // Solid of revolution about the x axis: prof = [[radius, offset], ...] with offset measured outward along `side` (+1 / -1).
  lathe(prof, x, y, z, side, c, seg = 16) {
    const g = new THREE.LatheGeometry(prof.map(([r, o]) => new THREE.Vector2(r, o)), seg); g.rotateZ(side > 0 ? -Math.PI / 2 : Math.PI / 2);
    this.addGeometry(g, this.xf(x, y, z), c); g.dispose(); return this;
  }
  build(uvScale = 0.25) {
    const g = new THREE.BufferGeometry(), n = this.pos.length / 3, uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const x = this.pos[i * 3], y = this.pos[i * 3 + 1], z = this.pos[i * 3 + 2];
      const ax = Math.abs(this.nor[i * 3]), ay = Math.abs(this.nor[i * 3 + 1]), az = Math.abs(this.nor[i * 3 + 2]);
      if (ay >= ax && ay >= az) { uv[i * 2] = x * uvScale; uv[i * 2 + 1] = z * uvScale; }
      else if (ax >= az) { uv[i * 2] = z * uvScale + 0.37; uv[i * 2 + 1] = y * uvScale; }
      else { uv[i * 2] = x * uvScale + 0.71; uv[i * 2 + 1] = y * uvScale; }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aSurf', new THREE.Float32BufferAttribute(this.srf, 1));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

// Planes {n:[x,y,z], d} (n·p <= d inside) for the convex solid lofted between two polygons.
export function loftPlanes(bot, top) {
  const n = bot.length, ctr = new THREE.Vector3(), planes = [];
  for (let i = 0; i < n; i++) ctr.add(bot[i]).add(top[i]);
  ctr.multiplyScalar(1 / (2 * n));
  const face = (p0, p1, p2) => {
    const nn = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0)).normalize();
    if (nn.dot(new THREE.Vector3().subVectors(p0, ctr)) < 0) nn.negate();
    planes.push({ n: [nn.x, nn.y, nn.z], d: nn.dot(p0) });
  };
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; face(bot[i], bot[j], top[j]); }
  face(bot[0], bot[1], bot[2]); face(top[0], top[1], top[2]);
  return planes;
}

// Hull side profile (z, y) from the def's parameters, listed bottom-rear → clockwise seen from the left side.
export function hullProfile(g) {
  const h = g.L / 2;
  return [[-h + 0.35, g.belly], [h - g.lfpLen, g.belly], [h, g.noseY], [h - g.glacisLen, g.hullH], [-h, g.hullH], [-h, g.belly + 0.3]];
}
export const HULL_ZONES = ['hbot', 'lfp', 'ufp', 'htop', 'hrear', 'hrear', 'hside', 'hside'];

// Collision solids for a tank def: convex hull + turret with an armour zone per face, track boxes, barrel.
export function buildSolids(def) {
  const g = def.geo, V = THREE.Vector3;
  const hw = g.W / 2 - g.trackW + 0.05; // armoured tub half-width (tracks sit outside it)
  const prof = hullProfile(g);
  const hb = prof.map(([z, y]) => new V(-hw, y, z)), ht = prof.map(([z, y]) => new V(hw, y, z));
  const hull = loftPlanes(hb, ht);
  hull.forEach((p, i) => { p.zone = HULL_ZONES[i]; });
  const T = g.turret, half = T.prof, full = [...half.map(([z, x]) => [z, x]), ...half.slice().reverse().map(([z, x]) => [z, -x])];
  let zc = 0; for (const p of half) zc += p[0]; zc /= half.length;
  const tb = full.map(([z, x]) => new V(x, 0, z)), tt = full.map(([z, x]) => new V(x * T.taper[1], T.h, zc + (z - zc) * T.taper[0]));
  const turret = loftPlanes(tb, tt);
  for (const p of turret) p.zone = p.n[1] > 0.7 || p.n[1] < -0.7 ? 'ttop' : p.n[2] > 0.45 ? 'tfront' : p.n[2] < -0.45 ? 'trear' : 'tside';
  // plate-normal armour: frontal zones are specified as LOS thickness for a level head-on shot
  const A = def.armor, front = { ufp: 1, lfp: 1, tfront: 1 };
  for (const p of [...hull, ...turret]) {
    const a = A[p.zone], k = front[p.zone] ? Math.max(0.12, Math.abs(p.n[2])) : 1;
    p.ke = a[0] * k; p.ce = a[1] * k; p.losK = k;
  }
  const tx = g.W / 2 - g.trackW / 2;
  const tracks = [1, -1].map((s) => ({ min: [s * tx - g.trackW / 2 - 0.02, 0, -g.L / 2 + 0.05], max: [s * tx + g.trackW / 2 + 0.02, g.trackH, g.L / 2 - 0.1] }));
  return { hull, turret, tracks, hw, hullPts: [hb, ht], turretPts: [tb, tt], turretFull: full, radius: Math.hypot(g.L / 2, g.W / 2) + 0.3 };
}

const solidCache = new Map();
export function solidsFor(def) {
  if (!solidCache.has(def.id)) solidCache.set(def.id, buildSolids(def));
  return solidCache.get(def.id);
}
