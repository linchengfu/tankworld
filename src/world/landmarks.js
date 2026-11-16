// The Lujiazui skyline, built from lofted plan polygons. Each function adds geometry to the shared batches in C
// and registers the footprint a tank or shell can hit.
import * as THREE from 'three';
import { TAU, lerp } from '../core/util.js';
import { rectPts, ngon, scalePts, chamfer } from './batch.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// 上海中心大厦 — 632 m, a soft triangle twisting about 120° as it rises, open slanted crown.
export function shanghaiTower(C, cx, cz) {
  const H = 632, N = 60, M = 30, F = C.fac[6];
  const ring = (t) => { const R = lerp(40, 20, Math.pow(t, 0.85)), tw = t * 2.1 + 0.4; return Array.from({ length: M }, (_, k) => { const a = (k / M) * TAU, r = R * (0.93 + 0.07 * Math.cos(3 * a)); return [cx + Math.cos(a + tw) * r, cz + Math.sin(a + tw) * r]; }); };
  let prev = ring(0), py = 0;
  for (let i = 1; i <= N; i++) {
    const t = i / N, cur = ring(t);
    let y = t * H;
    if (i === N) y = Array.from({ length: M }, (_, k) => H - 34 * (0.5 + 0.5 * Math.cos((k / M) * TAU - 1.2)));
    F.loft(prev, py, cur, y, { uPer: 22 / M });
    prev = cur; py = y;
  }
  C.roof(prev, H - 40, 0.2);
  // the spiral notch reads as a dark seam
  for (let i = 0; i < N; i += 1) { const t = i / N, R = lerp(40, 20, Math.pow(t, 0.85)) * 1.0 + 0.3, a = t * 2.1 + 0.4 + Math.PI; C.conc.box(0.8, H / N + 0.5, 2.4, cx + Math.cos(a) * R, t * H + H / N / 2, cz + Math.sin(a) * R, { ry: -a, c: [0.1, 0.14, 0.2] }); }
  // podium
  C.fac[5].box(cx + 30, cx + 50, cz - 38, cz + 40, 0, 32); C.roof(rectPts(cx + 30, cx + 50, cz - 38, cz + 40), 32, 0.35);
  C.col.addCircle(cx, cz, 41, H, 'tower'); C.col.addBox(cx + 30, cx + 50, cz - 38, cz + 40, 32, 'bldg');
  C.map.circles.push([cx, cz, 41]); C.map.rects.push([cx + 30, cx + 50, cz - 38, cz + 40]);
  C.labels.push({ x: cx, z: cz, name: '上海中心' });
}

// 上海环球金融中心 — 492 m: a square prism carved by two arcs into a blade, with the trapezoid aperture.
export function swfc(C, cx, cz) {
  const H = 492, s = 28, F = C.fac[0];
  const sec = (t) => { const f = Math.min(0.9, Math.pow(t, 1.7)), g = 1 - 0.14 * t; const A = [cx - s * g, cz - s * g], Cc = [cx + s * g, cz + s * g], B = [lerp(cx + s, cx, f), lerp(cz - s, cz, f)], D = [lerp(cx - s, cx, f), lerp(cz + s, cz, f)]; return [A, B, Cc, D]; };
  const N = 16, t0 = 0.86, t1 = 0.955;
  for (let i = 0; i < N; i++) F.loft(sec((i / N) * t0), (i / N) * t0 * H, sec(((i + 1) / N) * t0), ((i + 1) / N) * t0 * H);
  const L2 = (p, q, k) => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  const leg = (t, k, side) => { const [A, B, Cc, D] = sec(t); return side ? [Cc, L2(Cc, B, k), L2(Cc, D, k)] : [A, L2(A, B, k), L2(A, D, k)]; };
  for (const side of [0, 1]) { F.loft(leg(t0, 0.62, side), t0 * H, leg(t1, 0.42, side), t1 * H); }
  F.loft(sec(t1), t1 * H, sec(1), H); C.roof(sec(1), H, 0.25);
  C.roof(sec(t0), t0 * H, 0.2);
  // podium wing
  C.fac[5].box(cx - 44, cx - 28, cz - 26, cz + 30, 0, 26); C.roof(rectPts(cx - 44, cx - 28, cz - 26, cz + 30), 26, 0.35);
  C.col.addBox(cx - 44, cx + s, cz - s, cz + 30, H, 'tower'); C.map.rects.push([cx - 44, cx + s, cz - s, cz + 30]);
  C.labels.push({ x: cx, z: cz, name: '环球金融中心' });
}

// 金茂大厦 — 420 m pagoda: thirteen setbacks that get shorter toward the crown, flared eaves, steel spire.
export function jinMao(C, cx, cz) {
  const floors = [16, 14, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1], fh = 3.86, F = C.fac[4];
  let y = 0;
  floors.forEach((n, i) => {
    const h = 27 - i * 1.2, y1 = y + n * fh, k = h * 0.22, base = chamfer(cx, cz, h, h, k), eave = chamfer(cx, cz, h + 1.3, h + 1.3, k + 0.4);
    F.loft(base, y, base, y1); C.roof(eave, y1, 0.36); C.roof(eave, y1 - 0.9, 0.3);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) C.conc.box(1.1, y1 - y, 1.1, cx + sx * (h - k * 0.5 + 0.2), (y + y1) / 2, cz + sz * (h - k * 0.5 + 0.2), { ry: Math.PI / 4, c: 0.62 });
    y = y1;
  });
  C.conc.cyl(6.5, 40, cx, y + 20, cz, { seg: 8, r2: 1.2, c: 0.6 }); C.conc.cyl(0.8, 42, cx, y + 60, cz, { seg: 6, r2: 0.15, c: 0.7 }); C.conc.sphere(2.2, cx, y + 41, cz, { c: 0.7 });
  // six-storey podium to the east
  C.fac[5].box(cx + 24, cx + 50, cz - 34, cz + 36, 0, 26); C.roof(rectPts(cx + 24, cx + 50, cz - 34, cz + 36), 26, 0.35);
  C.col.addBox(cx - 28, cx + 50, cz - 34, cz + 36, 340, 'tower'); C.map.rects.push([cx - 28, cx + 50, cz - 34, cz + 36]);
  C.labels.push({ x: cx, z: cz, name: '金茂大厦' });
}

// 上海国金中心 — twin crystalline towers with slanted crowns and a sky bridge over the alley between them.
export function ifc(C, cz, x1, x2, h = 16) {
  [[x1, 250, 1], [x2, 262, -1]].forEach(([cx, H, dir], i) => {
    const F = C.fac[i ? 6 : 0], base = chamfer(cx, cz, h, h, 3), mid = chamfer(cx, cz, h - 1, h - 1, 4.5), top = chamfer(cx, cz, h - 2.5, h - 2.5, 7);
    F.loft(base, 0, mid, H * 0.7);
    const ys = top.map(([x]) => H - (dir * (x - cx) / h + 1) * 14);
    F.loft(mid, H * 0.7, top, ys); C.roof(top, ys, 0.3);
    C.col.addBox(cx - h - 1, cx + h + 1, cz - h - 1, cz + h + 1, H, 'tower'); C.map.rects.push([cx - h - 1, cx + h + 1, cz - h - 1, cz + h + 1]);
  });
  C.fac[1].box(x1 + 18, x2 - 18, cz - 7, cz + 7, 11, 18); C.roof(rectPts(x1 + 18, x2 - 18, cz - 7, cz + 7), 18, 0.3); C.conc.box(x2 - x1 - 36, 0.4, 14, (x1 + x2) / 2, 10.9, cz, { c: 0.4 });
  // low mall wing along the north edge
  C.shop[0].box(x1 - 18, x2 + 18, cz - 38, cz - 24, 0, 5.2); C.fac[5].box(x1 - 18, x2 + 18, cz - 38, cz - 24, 5.2, 20); C.roof(rectPts(x1 - 18, x2 + 18, cz - 38, cz - 24), 20, 0.35);
  C.col.addBox(x1 - 18, x2 + 18, cz - 38, cz - 24, 20, 'bldg'); C.map.rects.push([x1 - 18, x2 + 18, cz - 38, cz - 24]);
  C.labels.push({ x: (x1 + x2) / 2, z: cz, name: '国金中心' });
}

// 东方明珠 — three columns, three raking legs, eleven spheres. The big ones get the magenta glass.
export function orientalPearl(C, cx, cz) {
  const B = C.conc, P = C.pearl, colR = 9;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5, x = cx + Math.cos(a) * colR, z = cz + Math.sin(a) * colR;
    B.cyl(4.6, 262, x, 131, z, { seg: 12, c: 0.78 });
    for (const y of [136, 168, 200]) P.sphere(6.5, x, y, z, { seg: 12, rings: 8 });
    // raking leg from the ground up to the lower sphere
    const a2 = a + Math.PI / 3, gx = cx + Math.cos(a2) * 36, gz = cz + Math.sin(a2) * 36, tx = cx + Math.cos(a2) * 12, tz = cz + Math.sin(a2) * 12, len = Math.hypot(gx - tx, gz - tz, 78);
    const g = new THREE.CylinderGeometry(3.4, 3.4, len, 10), m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(tx - gx, 78, tz - gz).normalize());
    m.compose(V((gx + tx) / 2, 39, (gz + tz) / 2), q, V(1, 1, 1)); B.addGeometry(g, m, 0.78); g.dispose();
    C.col.addCircle(gx, gz, 4.2, 10, 'leg'); C.map.circles.push([gx, gz, 4]);
  }
  P.sphere(25, cx, 93, cz, { seg: 28, rings: 18 }); B.cyl(27.5, 3, cx, 93, cz, { seg: 28, c: 0.7 });
  P.sphere(22.5, cx, 268, cz, { seg: 28, rings: 18 }); B.cyl(24.5, 2.6, cx, 268, cz, { seg: 28, c: 0.7 });
  B.cyl(6, 60, cx, 310, cz, { seg: 12, r2: 4, c: 0.8 }); P.sphere(8, cx, 342, cz, { seg: 16, rings: 10 });
  B.cyl(3.2, 50, cx, 375, cz, { seg: 8, r2: 1.6, c: 0.82 }); B.cyl(1.4, 70, cx, 433, cz, { seg: 6, r2: 0.3, c: [0.85, 0.3, 0.25] });
  // glass drum at the base
  C.fac[1].prism(ngon(cx, cz, 22, 28), 0, 11, { uPer: 0.4 }); C.roof(ngon(cx, cz, 22, 28), 11, 0.4);
  C.col.addCircle(cx, cz, 22.6, 260, 'tower'); C.map.circles.push([cx, cz, 22.6]);
  C.labels.push({ x: cx, z: cz, name: '东方明珠' });
}

// 明珠环 — the ring footbridge over the Lujiazui roundabout, the planted island and its sculpture.
export function roundabout(C, cx, cz) {
  const B = C.conc, inner = 40.5, outer = 47.5, y = 6.2, N = 48;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * TAU, a1 = ((i + 1) / N) * TAU, am = (a0 + a1) / 2, rm = (inner + outer) / 2, w = (TAU * rm) / N + 0.1;
    B.box(outer - inner, 0.5, w, cx + Math.cos(am) * rm, y, cz + Math.sin(am) * rm, { ry: -am, c: 0.72 });
    for (const r of [inner + 0.1, outer - 0.1]) { B.box(0.06, 1.1, w, cx + Math.cos(am) * r, y + 0.8, cz + Math.sin(am) * r, { ry: -am, c: [0.36, 0.5, 0.56] }); }
    B.box(0.12, 0.06, w, cx + Math.cos(am) * (outer - 0.1), y + 1.38, cz + Math.sin(am) * (outer - 0.1), { ry: -am, c: 0.8 });
  }
  for (let q = 0; q < 4; q++) for (const off of [-0.27, 0.27]) {
    const a = Math.PI / 4 + (q * Math.PI) / 2 + off;
    for (const r of [51.5, 27.5]) { const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; B.cyl(0.75, y, x, y / 2, z, { seg: 10, c: 0.66 }); B.box(Math.abs(r - (inner + outer) / 2) + 3, 0.5, 1.2, cx + Math.cos(a) * (r + (inner + outer) / 2) / 2, y - 0.45, cz + Math.sin(a) * (r + (inner + outer) / 2) / 2, { ry: -a, c: 0.62 }); C.col.addCircle(x, z, 0.95, y, 'col'); C.map.circles.push([x, z, 1]); }
  }
  // stairs out to the four corners
  for (let q = 0; q < 4; q++) { const a = Math.PI / 4 + (q * Math.PI) / 2; for (let s = 0; s < 12; s++) { const r = outer + 0.5 + s * 1.0; B.box(1.0, 0.3, 3.4, cx + Math.cos(a) * r, y - 0.15 - s * 0.5, cz + Math.sin(a) * r, { ry: -a, c: 0.68 }); } }
  // island: lawn, flower ring, stainless sculpture
  C.grass.cyl(26, 0.18, cx, 0.09, cz, { seg: 40, c: 1 });
  C.conc.cyl(11, 0.5, cx, 0.3, cz, { seg: 24, c: [0.75, 0.28, 0.3] }); C.conc.cyl(8.5, 0.7, cx, 0.4, cz, { seg: 24, c: [0.86, 0.72, 0.3] });
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; C.steel.box(0.5, 11 + i * 2, 2.2, cx + Math.cos(a) * 1.6, 6 + i, cz + Math.sin(a) * 1.6, { ry: -a + 0.5, rz: 0.12, c: 1 }); }
  C.steel.sphere(1.6, cx, 15.5, cz, { seg: 14, rings: 10, c: 1 });
  C.col.addCircle(cx, cz, 4.2, 14, 'sculpt'); C.map.circles.push([cx, cz, 4.2]);
  C.raised.discs.push([cx, cz, 26]);
}

// Tensile pavilion on the Central Green
export function tentPavilion(C, cx, cz) {
  for (const [dx, dz, r, h] of [[0, 0, 7.5, 9], [8, 3, 5.5, 7], [-6, 6, 5, 6.5]]) {
    const g = new THREE.ConeGeometry(r, h * 0.55, 10, 1, true); C.white.addGeometry(g, C.white.xf(cx + dx, h - h * 0.275, cz + dz), 1); g.dispose();
    C.conc.cyl(0.18, h, cx + dx, h / 2, cz + dz, { seg: 6, c: 0.8 });
  }
  C.col.addCircle(cx, cz, 1.2, 9, 'pole'); C.map.circles.push([cx, cz, 7]);
}

// Low-poly Bund across the river plus a far skyline. Pure backdrop, nothing here collides.
export function backdrop(C, rng) {
  const B = C.far;
  const stone = () => { const k = rng.range(0.5, 0.72); return [k * 1.05, k * 0.96, k * 0.82]; };
  // the Bund: a wall of stone banks west of the river, clock tower and a green pyramid roof
  let z = -520;
  while (z < 620) {
    const w = rng.range(34, 70), h = rng.range(22, 46), c = stone();
    B.box(46, h, w, -770, h / 2, z + w / 2, { c });
    if (rng.chance(0.35)) B.box(14, 12, 14, -770, h + 6, z + w / 2, { c: c.map((v) => v * 0.9) });
    if (rng.chance(0.2)) { const g = new THREE.ConeGeometry(9, 16, 4); B.addGeometry(g, B.xf(-770, h + 12 + 8, z + w / 2, { ry: Math.PI / 4 }), [0.25, 0.42, 0.3]); g.dispose(); }
    z += w + rng.range(2, 8);
  }
  B.box(12, 80, 12, -768, 40, -40, { c: [0.66, 0.6, 0.5] }); B.box(14, 6, 14, -768, 62, -40, { c: [0.9, 0.88, 0.8] });
  // north bank (Hongkou)
  let x = -420;
  while (x < 900) { const w = rng.range(40, 80), h = rng.range(26, 120), k = rng.range(0.3, 0.5); B.box(w, h, 50, x + w / 2, h / 2, -790, { c: [k * 0.9, k, k * 1.12] }); x += w + rng.range(6, 20); }
  // distant towers behind both banks and around the playable district
  const far = (x0, x1, z0, z1, n, hmin, hmax) => { for (let i = 0; i < n; i++) { const w = rng.range(28, 54), d = rng.range(28, 54), h = rng.range(hmin, hmax), k = rng.range(0.26, 0.46); B.box(w, h, d, rng.range(x0, x1), h / 2, rng.range(z0, z1), { c: [k * 0.88, k, k * 1.15] }); } };
  far(-1500, -860, -900, 900, 60, 60, 260); far(-600, 1300, -1500, -860, 50, 60, 240);
  far(380, 1300, -700, 1300, 110, 50, 280); far(-600, 380, 380, 1300, 80, 50, 260);
}
