// Builds the visual model of a tank from its def. The armoured hull and turret come from the same convex
// solids the damage model uses (geom.buildSolids), so what you see is what a shell hits. Everything else is dressing.
import * as THREE from 'three';
import { GeoBuilder, solidsFor } from './geom.js';
import { camoTexture, trackTexture } from '../gfx/textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DARK = 0.16, RUBBER = 0.1, STEEL = 0.42, GLASS = [0.05, 0.09, 0.12];
const geoCache = new Map(), matCache = new Map();


function trackPath(g) {
  // closed loop in (z, y): ground run, front idler arc, top run, rear sprocket arc
  const zb = g.L / 2 - 1.0, r = 0.34, yc = 0.58, zf = g.L / 2 - 0.42, zr = -g.L / 2 + 0.42, pts = [];
  pts.push([-zb, 0], [zb, 0]);
  for (let a = -60; a <= 90; a += 25) pts.push([zf + r * Math.cos((a * Math.PI) / 180), yc + r * Math.sin((a * Math.PI) / 180)]);
  for (let a = 90; a <= 240; a += 25) pts.push([zr + r * Math.cos((a * Math.PI) / 180), yc + r * Math.sin((a * Math.PI) / 180)]);
  return pts;
}

function buildTrackGeo(g) {
  const pts = trackPath(g), w = g.trackW, pos = [], uv = [], nor = [];
  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nz = (b[1] - a[1]) / d, ny = -(b[0] - a[0]) / d; // outward normal of a CCW loop seen from +x
    const v0 = len / 0.32, v1 = (len + d) / 0.32;
    const q = [[-w / 2, a, v0, 0], [w / 2, a, v0, 1], [w / 2, b, v1, 1], [-w / 2, a, v0, 0], [w / 2, b, v1, 1], [-w / 2, b, v1, 0]];
    for (const [x, p, v, u] of q) { pos.push(x, p[1], p[0]); nor.push(0, ny, nz); uv.push(u, v); }
    len += d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

// ---------------------------------------------------------------- shared hull dressing
function hullCommon(H, def, S) {
  const g = def.geo, L = g.L, W = g.W, hw = S.hw, half = L / 2;
  H.loft(S.hullPts[0], S.hullPts[1], 1);
  // sponsons over the tracks, following the glacis line
  const yb = g.trackH + 0.03, t = (g.hullH - yb) / (g.hullH - g.noseY), zAt = half - g.glacisLen + g.glacisLen * t;
  const sp = [[-half + 0.04, yb], [zAt - 0.04, yb], [half - g.glacisLen, g.hullH - 0.012], [-half + 0.04, g.hullH - 0.012]];
  for (const s of [1, -1]) {
    H.loft(sp.map(([z, y]) => V(s * (hw - 0.02), y, z)), sp.map(([z, y]) => V(s * (W / 2), y, z)), 0.96);
    // front mud guard + rear flap
    H.box(g.trackW + 0.04, 0.03, 0.7, s * (W / 2 - g.trackW / 2), yb + 0.0, zAt + 0.28, { rx: 0.42, c: 0.9 });
    H.box(g.trackW, 0.36, 0.03, s * (W / 2 - g.trackW / 2), yb - 0.2, -half + 0.02, { c: RUBBER * 1.6 });
  }
  // running gear: road wheels, idler, sprocket, return rollers
  const zb = half - 1.15, n = g.wheels, xr = W / 2 - g.trackW / 2;
  for (const s of [1, -1]) {
    for (let i = 0; i < n; i++) {
      const z = -zb + (2 * zb * i) / (n - 1);
      H.cyl(g.wheelR, g.trackW * 0.72, s * xr, g.wheelR + 0.05, z, { axis: 'x', seg: 14, c: RUBBER });
      H.cyl(g.wheelR * 0.62, 0.04, s * (xr + g.trackW * 0.37), g.wheelR + 0.05, z, { axis: 'x', seg: 10, c: 0.7 });
      H.cyl(g.wheelR * 0.2, 0.08, s * (xr + g.trackW * 0.38), g.wheelR + 0.05, z, { axis: 'x', seg: 6, c: 0.4 });
    }
    H.cyl(0.3, g.trackW * 0.7, s * xr, 0.58, half - 0.42, { axis: 'x', seg: 12, c: STEEL * 0.6 });
    H.cyl(0.31, g.trackW * 0.7, s * xr, 0.58, -half + 0.42, { axis: 'x', seg: 12, c: STEEL * 0.5 });
  }
  // tow hooks + headlights on the nose, tail lights
  for (const s of [1, -1]) {
    H.box(0.1, 0.16, 0.14, s * (hw - 0.35), g.noseY - 0.12, half - 0.03, { c: STEEL });
    H.box(0.2, 0.14, 0.16, s * (hw - 0.25), g.noseY + 0.2, half - 0.5, { c: 0.5 });
    H.box(0.15, 0.1, 0.02, s * (hw - 0.25), g.noseY + 0.2, half - 0.415, { c: [1.6, 1.5, 1.2] });
    H.box(0.16, 0.08, 0.04, s * (hw - 0.2), g.hullH - 0.25, -half - 0.02, { c: [0.9, 0.1, 0.08] });
  }
}

function skirts(H, def, o) {
  // segmented side skirts; o.n panels, bottom edge y0, optional heavy front panels (thicker, ERA-like tiles)
  const g = def.geo, L = g.L, x = g.W / 2 + 0.02, top = g.trackH + 0.06, n = o.n, z0 = -L / 2 + (o.rearGap ?? 0.35), z1 = L / 2 - (o.frontGap ?? 0.75), pl = (z1 - z0) / n;
  for (const s of [1, -1]) for (let i = 0; i < n; i++) {
    const heavy = i >= n - (o.heavy || 0), y0 = heavy ? o.y0 - 0.05 : o.y0, t = heavy ? o.ht || 0.12 : 0.035, zc = z0 + pl * (i + 0.5);
    H.box(t, top - y0, pl - 0.035, s * (x + t / 2 - 0.02), (top + y0) / 2, zc, { c: heavy ? 1 : o.c ?? 0.86 });
    if (heavy && o.tiles) for (let k = 0; k < 2; k++) H.box(0.05, 0.3, pl / 2 - 0.05, s * (x + t + 0.01), top - 0.2 - k * 0.34, zc, { c: 0.8, rz: s * 0.05 });
  }
}

function grille(H, x, y, z, sx, sz, slats = 6) {
  H.box(sx, 0.03, sz, x, y + 0.012, z, { c: DARK });
  for (let i = 0; i < slats; i++) H.box(sx - 0.06, 0.025, 0.03, x, y + 0.04, z - sz / 2 + (sz * (i + 0.5)) / slats, { c: 0.55 });
}

function smokeBank(B, x, y, z, n, dir, o = {}) {
  // row of launcher tubes angled outward; dir = +1 left / -1 right
  for (let i = 0; i < n; i++) B.cyl(0.045, 0.24, x, y + (o.rows && i % 2 ? 0.11 : 0), z - i * (o.rows ? 0.06 : 0.115), { axis: 'x', seg: 6, rz: dir * 0.5, ry: -dir * (0.25 + (o.fan || 0) * i), c: 0.55 });
}

function rws(B, x, y, z, o = {}) {
  // remote weapon station / cupola MG
  B.cyl(0.13, 0.16, x, y + 0.08, z, { seg: 8, c: 0.8 });
  B.box(0.2, 0.2, 0.34, x, y + 0.27, z + 0.02, { c: 0.75 });
  B.box(0.12, 0.14, 0.1, x + 0.17, y + 0.27, z + 0.1, { c: GLASS });
  B.cyl(0.022, o.len || 0.95, x - 0.05, y + 0.3, z + 0.2 + (o.len || 0.95) / 2, { axis: 'z', seg: 5, c: DARK });
  B.box(0.14, 0.16, 0.26, x - 0.2, y + 0.24, z + 0.02, { c: 0.5 });
}

function panoSight(B, x, y, z, h = 0.38, r = 0.14) {
  B.cyl(r * 1.15, 0.08, x, y + 0.04, z, { seg: 10, c: 0.8 });
  B.cyl(r, h, x, y + h / 2 + 0.06, z, { seg: 10, c: 0.9 });
  B.box(r * 1.3, h * 0.45, 0.03, x, y + h * 0.6, z + r * 0.9, { c: GLASS });
}

function sightBox(B, x, y, z, sx = 0.4, sy = 0.24, sz = 0.5) {
  B.box(sx, sy, sz, x, y + sy / 2, z, { c: 0.95 });
  B.box(sx * 0.7, sy * 0.6, 0.02, x, y + sy / 2, z + sz / 2 + 0.005, { c: GLASS });
}

function hatch(B, x, y, z, r = 0.3) { B.cyl(r, 0.05, x, y + 0.025, z, { seg: 12, c: 0.9 }); B.box(0.08, 0.04, 0.2, x, y + 0.06, z - r * 0.5, { c: 0.6 }); }
function antenna(B, x, y, z, h = 1.5) { B.cyl(0.035, 0.12, x, y + 0.06, z, { seg: 6, c: 0.5 }); B.cyl(0.008, h, x, y + 0.12 + h / 2, z, { seg: 4, c: DARK }); }

function basket(B, zr, w, y0, h, d) {
  // bustle stowage rack: frame bars + stowed kit
  B.box(w * 2, 0.03, d, 0, y0, zr - d / 2, { c: 0.5 });
  for (const s of [1, -1]) B.box(0.03, h, d, s * w, y0 + h / 2, zr - d / 2, { c: 0.55 });
  B.box(w * 2, 0.03, 0.03, 0, y0 + h, zr - d, { c: 0.55 }); B.box(w * 2, 0.03, 0.03, 0, y0 + h / 2, zr - d, { c: 0.55 });
  B.box(w * 0.8, h * 0.75, d * 0.7, -w * 0.45, y0 + h * 0.4, zr - d / 2, { c: [0.75, 0.72, 0.6] });
  B.box(w * 0.6, h * 0.5, d * 0.6, w * 0.5, y0 + h * 0.28, zr - d / 2, { c: [0.5, 0.55, 0.45] });
  B.cyl(0.16, w * 0.7, w * 0.1, y0 + h * 0.85, zr - d / 2, { axis: 'x', seg: 8, c: [0.6, 0.58, 0.46] });
}

function eraRows(B, pts, y, rows, c = 0.92) {
  // rows of reactive-armour tiles along a polyline in (z, x) on a roughly vertical face
  for (let i = 0; i < pts.length - 1; i++) {
    const [z0, x0] = pts[i], [z1, x1] = pts[i + 1], len = Math.hypot(z1 - z0, x1 - x0), n = Math.max(1, Math.round(len / 0.36)), ang = Math.atan2(x1 - x0, z1 - z0);
    for (let k = 0; k < n; k++) for (let r = 0; r < rows; r++) {
      const t = (k + 0.5) / n;
      for (const s of [1, -1]) B.box(0.1, 0.22, len / n - 0.03, s * (x0 + (x1 - x0) * t), y + r * 0.25, z0 + (z1 - z0) * t, { ry: s * ang, c: c - ((k + r) % 2) * 0.06 });
    }
  }
}

// ---------------------------------------------------------------- per-tank dressing
const DRESS = {
  ztz99a(H, T, G, def) {
    const g = def.geo, L = g.L, th = g.turret.h, hw = g.W / 2;
    skirts(H, def, { n: 7, y0: 0.52, heavy: 3, ht: 0.1, tiles: true });
    grille(H, 0.5, g.hullH, -L / 2 + 1.5, 0.8, 1.3); grille(H, -0.55, g.hullH, -L / 2 + 1.3, 0.7, 0.9, 4);
    H.cyl(0.14, 0.5, -(hw - 0.3), g.hullH + 0.02, -L / 2 + 0.9, { axis: 'z', seg: 8, c: DARK });
    for (let i = 0; i < 5; i++) for (const s of [1, -1]) H.box(0.36, 0.06, 0.26, s * (0.25 + (i % 3) * 0.4) * 1, g.hullH - 0.1 - (i > 2 ? 0.12 : 0.04), L / 2 - g.glacisLen + 0.35 + (i > 2 ? 0.75 : 0.3), { rx: 0.26, c: 0.9 });
    hatch(H, 0, g.hullH, L / 2 - g.glacisLen - 0.45, 0.28);
    H.box(1.6, 0.3, 0.5, 0, g.hullH + 0.02, -L / 2 + 0.28, { c: 0.85 }); // rear stowage
    for (const s of [1, -1]) H.cyl(0.24, 0.9, s * 0.6, g.belly + 0.75, -L / 2 - 0.2, { axis: 'x', seg: 10, c: 0.9 }); // aux fuel drums
    // turret: wedge add-on tiles, sights, laser dazzler, basket
    eraRows(T, [[2.05, 0.42], [1.25, 1.3]], 0.2, 2);
    for (let i = 0; i < 3; i++) for (const s of [1, -1]) T.box(0.42, 0.05, 0.3, s * (0.45 + i * 0.3), th * 0.98, 1.35 - i * 0.28, { rx: 0.1, c: 0.9 });
    sightBox(T, 0.62, th, 0.75, 0.36, 0.2, 0.5);
    panoSight(T, -0.72, th, -0.1, 0.4, 0.15);
    hatch(T, -0.62, th, -0.75, 0.3); hatch(T, 0.62, th, -0.55, 0.28);
    T.box(0.5, 0.42, 0.5, 0.7, th + 0.21, -1.35, { c: 0.95 }); T.box(0.3, 0.24, 0.02, 0.7, th + 0.24, -1.095, { c: GLASS }); // JD-3 laser dazzler
    rws(T, -0.62, th + 0.05, -1.05, { len: 1.1 });
    for (const s of [1, -1]) { smokeBank(T, s * 1.42, 0.5, -0.9, 5, s); T.box(0.5, 0.34, 1.3, s * 1.25, 0.32, -1.2, { c: 0.82 }); }
    basket(T, -2.3, 1.0, 0.1, 0.5, 0.55);
    antenna(T, 0.95, th, -1.9, 1.6); antenna(T, -0.95, th, -1.9, 1.2);
    T.cyl(0.03, 0.5, 0, th + 0.25, -2.0, { seg: 5, c: 0.5 });
  },
  t14(H, T, G, def) {
    const g = def.geo, L = g.L, th = g.turret.h, hw = g.W / 2;
    skirts(H, def, { n: 8, y0: 0.5, heavy: 5, ht: 0.14, tiles: true, c: 0.8 });
    // slat cage over the rear third
    for (const s of [1, -1]) for (let i = 0; i < 7; i++) H.box(0.03, 0.03, 2.3, s * (hw + 0.16), 0.6 + i * 0.09, -L / 2 + 1.35, { c: 0.35 });
    for (let i = 0; i < 7; i++) H.box(g.W - 0.6, 0.03, 0.03, 0, 0.75 + i * 0.08, -L / 2 - 0.14, { c: 0.35 });
    grille(H, 0, g.hullH, -L / 2 + 1.4, 1.9, 1.5, 8);
    for (const s of [1, -1]) H.box(0.5, 0.16, 1.9, s * (hw - 0.3), g.hullH + 0.08, -L / 2 + 1.5, { c: 0.9 });
    // crew hatches side by side on the long glacis roof + ERA carpet
    for (const x of [-0.7, 0, 0.7]) hatch(H, x, g.hullH, L / 2 - g.glacisLen - 0.5, 0.27);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) H.box(0.4, 0.05, 0.4, (c - 2) * 0.44, g.hullH - 0.045 - (r + 0.5) * 0.44 * (g.hullH - g.noseY) / g.glacisLen, L / 2 - g.glacisLen + 0.3 + r * 0.44, { rx: Math.atan2(g.hullH - g.noseY, g.glacisLen), c: 0.92 - ((r + c) % 2) * 0.05 });
    // unmanned turret: faceted shroud, APS tubes, radar panels, tall panoramic sight with RWS
    T.box(1.5, 0.3, 2.6, 0, th + 0.02, -0.5, { c: 0.93 });
    for (const s of [1, -1]) {
      T.box(0.25, 0.5, 2.4, s * 1.18, 0.42, -0.9, { rz: s * 0.25, c: 0.9 });
      for (let i = 0; i < 5; i++) T.cyl(0.075, 0.5, s * (1.02 + i * 0.012), 0.12, 1.15 - i * 0.2, { axis: 'z', seg: 7, ry: s * 0.5, c: 0.5 });
      T.box(0.03, 0.34, 0.5, s * 1.08, 0.62, 0.9, { ry: s * 0.45, rz: s * 0.1, c: 0.6 });
      T.box(0.03, 0.34, 0.5, s * 1.2, 0.62, -1.9, { ry: -s * 0.35, c: 0.6 });
      for (let i = 0; i < 6; i++) T.cyl(0.04, 0.2, s * 0.9, th + 0.2, -1.4 - i * 0.11, { seg: 6, rz: s * 0.6, c: 0.5 });
    }
    panoSight(T, -0.45, th + 0.17, 0.2, 0.55, 0.19);
    rws(T, -0.45, th + 0.75, 0.2, { len: 1.0 });
    sightBox(T, 0.5, th + 0.17, 0.75, 0.36, 0.24, 0.4);
    T.box(1.9, 0.5, 0.5, 0, 0.4, -2.55, { c: 0.85 });
    antenna(T, 0.6, th + 0.17, -1.6, 1.4); T.cyl(0.035, 0.6, 0.2, th + 0.45, -1.5, { seg: 5, c: 0.5 });
  },
  t90m(H, T, G, def) {
    const g = def.geo, L = g.L, th = g.turret.h, hw = g.W / 2;
    skirts(H, def, { n: 6, y0: 0.55, heavy: 3, ht: 0.13, tiles: true, c: RUBBER * 2.2 });
    for (const s of [1, -1]) for (let i = 0; i < 6; i++) H.box(0.03, 0.03, 1.5, s * (hw + 0.14), 0.62 + i * 0.085, -L / 2 + 1.0, { c: 0.35 });
    grille(H, 0, g.hullH, -L / 2 + 1.1, 1.6, 1.1, 6);
    H.box(0.3, 0.2, 0.7, hw - 0.2, g.hullH + 0.02, -L / 2 + 1.6, { c: DARK }); // side exhaust
    // glacis ERA carpet, driver hatch, unditching log, fuel drums
    const sl = Math.atan2(g.hullH - g.noseY, g.glacisLen);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) H.box(0.42, 0.08, 0.42, (c - 2) * 0.46, g.hullH - 0.02 - (r + 0.55) * 0.46 * Math.tan(sl), L / 2 - g.glacisLen + 0.28 + r * 0.46, { rx: sl, c: 0.93 - ((r + c) % 2) * 0.06 });
    hatch(H, 0, g.hullH, L / 2 - g.glacisLen - 0.4, 0.27);
    H.cyl(0.13, 2.6, 0, g.hullH - 0.02, -L / 2 - 0.16, { axis: 'x', seg: 8, c: [0.55, 0.4, 0.26] });
    for (const s of [1, -1]) H.cyl(0.27, 0.95, s * 0.62, g.hullH + 0.02, -L / 2 - 0.5, { axis: 'x', seg: 10, c: 0.92 });
    // turret: Relikt wedges, sights, RWS, rear bustle
    eraRows(T, [[1.7, 0.5], [1.22, 1.22], [0.25, 1.52]], 0.14, 2, 0.95);
    for (let i = 0; i < 4; i++) for (const s of [1, -1]) T.box(0.4, 0.08, 0.34, s * (0.42 + (i % 2) * 0.44), th * 0.97, 1.2 - Math.floor(i / 2) * 0.4, { rx: 0.12, c: 0.9 - (i % 2) * 0.05 });
    sightBox(T, 0.55, th, 0.55, 0.34, 0.24, 0.42);
    panoSight(T, -0.55, th + 0.02, -0.25, 0.36, 0.15);
    rws(T, -0.55, th + 0.42, -0.25, { len: 1.05 });
    hatch(T, 0.6, th, -0.4, 0.28);
    for (const s of [1, -1]) { smokeBank(T, s * 1.4, 0.45, -0.3, 6, s, { rows: true }); for (let i = 0; i < 5; i++) T.box(0.03, 0.03, 1.3, s * (1.36 - i * 0.012), 0.08 + i * 0.09, -1.5, { ry: s * 0.25, c: 0.35 }); }
    T.box(1.86, 0.5, 0.75, 0, 0.42, -1.95, { c: 0.9 });
    antenna(T, 0.8, th, -1.3, 1.5); T.cyl(0.03, 0.45, -0.2, th + 0.22, -1.2, { seg: 5, c: 0.5 });
  },
  m1a2(H, T, G, def) {
    const g = def.geo, L = g.L, th = g.turret.h, hw = g.W / 2;
    skirts(H, def, { n: 7, y0: 0.5, heavy: 0, c: 0.95, frontGap: 0.55, rearGap: 0.9 });
    // turbine exhaust grille across the rear plate + engine deck
    H.box(2.3, 0.5, 0.06, 0, g.hullH - 0.38, -L / 2 - 0.02, { c: DARK });
    for (let i = 0; i < 7; i++) H.box(2.2, 0.03, 0.08, 0, g.hullH - 0.6 + i * 0.07, -L / 2 - 0.05, { c: 0.5 });
    grille(H, 0, g.hullH, -L / 2 + 1.0, 2.2, 1.3, 7); grille(H, 0.9, g.hullH, -L / 2 + 2.2, 0.8, 0.6, 3);
    hatch(H, 0, g.hullH - 0.02, L / 2 - g.glacisLen + 0.25, 0.3);
    for (const s of [1, -1]) H.box(0.34, 0.03, 0.2, s * 0.5, g.hullH + 0.03, L / 2 - g.glacisLen + 0.05, { c: GLASS });
    // turret: flat slab cheeks, doghouse, CITV, CROWS, loader MG, bustle rack
    sightBox(T, -0.75, th, 0.6, 0.5, 0.3, 0.6);
    panoSight(T, 0.75, th, 0.75, 0.36, 0.17);
    hatch(T, -0.68, th, -0.35, 0.34); hatch(T, 0.62, th, -0.45, 0.3);
    T.cyl(0.36, 0.14, -0.68, th + 0.07, -0.35, { seg: 12, c: 0.9, open: false });
    rws(T, -0.1, th + 0.02, 0.2, { len: 1.25 });
    T.cyl(0.02, 0.9, 0.62, th + 0.3, 0.05, { axis: 'z', seg: 5, c: DARK }); T.box(0.12, 0.22, 0.2, 0.62, th + 0.2, -0.3, { c: 0.5 });
    for (const s of [1, -1]) { T.box(0.14, 0.3, 0.42, s * 1.76, 0.5, 0.3, { c: 0.6 }); for (let i = 0; i < 3; i++) T.cyl(0.04, 0.16, s * 1.86, 0.44 + (i % 2) * 0.12, 0.42 - i * 0.12, { axis: 'x', seg: 6, rz: s * 0.4, c: 0.4 }); T.box(0.36, 0.3, 1.5, s * 1.62, 0.36, -1.6, { c: 0.85 }); }
    basket(T, -2.6, 1.35, 0.14, 0.5, 0.65);
    T.box(0.7, 0.3, 0.5, -0.6, th + 0.15, -1.9, { c: 0.9 }); // APU / comms box
    antenna(T, 1.2, th, -2.2, 1.7); antenna(T, -1.2, th, -2.2, 1.7);
    T.cyl(0.03, 0.5, 0, th + 0.25, -2.4, { seg: 5, c: 0.5 });
  },
  leo2a7(H, T, G, def) {
    const g = def.geo, L = g.L, th = g.turret.h, hw = g.W / 2;
    skirts(H, def, { n: 7, y0: 0.5, heavy: 3, ht: 0.2, c: 0.9, frontGap: 0.6 });
    for (const s of [1, -1]) { H.cyl(0.3, 0.06, s * 0.7, g.hullH - 0.38, -L / 2 - 0.01, { axis: 'z', seg: 12, c: DARK }); grille(H, s * 0.75, g.hullH, -L / 2 + 0.9, 0.95, 0.95, 5); }
    H.cyl(0.42, 0.04, 0, g.hullH + 0.02, -L / 2 + 1.0, { seg: 14, c: 0.5 });
    H.box(2.2, 0.1, 0.5, 0, g.hullH - 0.02, L / 2 - g.glacisLen + 0.6, { rx: 0.19, c: 0.92 }); // add-on glacis module
    hatch(H, -0.45, g.hullH, L / 2 - g.glacisLen - 0.4, 0.28);
    // turret: arrow wedges (visual add-on plates), EMES, PERI, MG3, smoke banks, stowage boxes
    for (const s of [1, -1]) T.box(0.07, 0.7, 1.75, s * 1.03, 0.4, 1.76, { ry: s * 0.67, c: 0.96 });
    sightBox(T, -0.8, th, 0.45, 0.5, 0.26, 0.7);
    panoSight(T, 0.55, th, -0.35, 0.42, 0.16);
    hatch(T, -0.6, th, -0.5, 0.32); hatch(T, 0.65, th, -0.95, 0.3);
    T.cyl(0.02, 0.8, 0.65, th + 0.26, -0.5, { axis: 'z', seg: 5, c: DARK }); T.box(0.1, 0.2, 0.18, 0.65, th + 0.16, -0.9, { c: 0.5 });
    for (const s of [1, -1]) { smokeBank(T, s * 1.75, 0.55, -0.9, 4, s, { fan: 0.08 }); smokeBank(T, s * 1.75, 0.38, -0.9, 4, s, { fan: 0.08 }); T.box(0.34, 0.46, 1.3, s * 1.55, 0.42, -1.75, { c: 0.9 }); }
    T.box(2.4, 0.5, 0.45, 0, 0.42, -2.75, { c: 0.9 }); T.box(0.9, 0.3, 0.55, 0.3, th + 0.15, -1.85, { c: 0.94 });
    antenna(T, 1.3, th, -2.3, 1.6); antenna(T, -1.3, th, -2.3, 1.6);
  },
  cr3(H, T, G, def) {
    const g = def.geo, L = g.L, th = g.turret.h, hw = g.W / 2;
    skirts(H, def, { n: 6, y0: 0.42, heavy: 6, ht: 0.16, c: 0.95, frontGap: 0.6 });
    H.box(2.3, 0.14, 0.9, 0, g.hullH - 0.06, L / 2 - g.glacisLen + 0.75, { rx: Math.atan2(g.hullH - g.noseY, g.glacisLen), c: 0.93 }); // glacis applique
    H.box(2.2, 0.36, 0.14, 0, g.noseY - 0.3, L / 2 - 0.26, { rx: -0.6, c: 0.9 });
    grille(H, 0, g.hullH, -L / 2 + 1.3, 2.0, 1.6, 8);
    for (const s of [1, -1]) { H.box(0.34, 0.3, 0.7, s * (hw - 0.3), g.hullH + 0.15, -L / 2 + 0.6, { c: 0.9 }); H.cyl(0.26, 0.9, s * 0.6, g.hullH - 0.2, -L / 2 - 0.28, { axis: 'x', seg: 10, c: 0.92 }); }
    hatch(H, 0, g.hullH, L / 2 - g.glacisLen - 0.45, 0.28);
    sightBox(T, -0.7, th, 0.75, 0.42, 0.24, 0.5);
    panoSight(T, -0.7, th, -0.2, 0.46, 0.17);
    hatch(T, -0.65, th, -0.85, 0.32); hatch(T, 0.62, th, -0.6, 0.3);
    rws(T, 0.62, th + 0.02, -0.05, { len: 0.9 });
    for (const s of [1, -1]) { for (let i = 0; i < 5; i++) T.cyl(0.045, 0.22, s * (0.72 + i * 0.12), 0.56, 1.85 - i * 0.15, { axis: 'z', seg: 6, rx: -0.3, ry: s * 0.5, c: 0.5 }); T.box(0.36, 0.5, 1.6, s * 1.7, 0.42, -1.5, { c: 0.92 }); T.box(0.2, 0.44, 1.2, s * 1.62, 0.42, 0.2, { c: 0.95 }); }
    T.box(2.6, 0.5, 0.5, 0, 0.42, -2.95, { c: 0.9 });
    T.box(0.6, 0.2, 0.6, 0.2, th + 0.1, -2.0, { c: 0.92 });
    antenna(T, 1.2, th, -2.5, 1.7); antenna(T, -1.2, th, -2.5, 1.5);
  },
  leclerc(H, T, G, def) {
    const g = def.geo, L = g.L, th = g.turret.h, hw = g.W / 2;
    skirts(H, def, { n: 6, y0: 0.48, heavy: 3, ht: 0.18, c: 0.92, frontGap: 0.55 });
    for (const s of [1, -1]) { for (let i = 0; i < 6; i++) H.box(0.03, 0.03, 1.7, s * (hw + 0.15), 0.6 + i * 0.085, -L / 2 + 1.1, { c: 0.35 }); H.cyl(0.25, 0.85, s * 0.6, g.hullH - 0.12, -L / 2 - 0.3, { axis: 'x', seg: 10, c: 0.92 }); }
    for (let i = 0; i < 6; i++) H.box(g.W - 0.8, 0.03, 0.03, 0, 0.7 + i * 0.08, -L / 2 - 0.62, { c: 0.35 });
    grille(H, 0, g.hullH, -L / 2 + 1.2, 2.0, 1.5, 8);
    hatch(H, 0.55, g.hullH, L / 2 - g.glacisLen - 0.4, 0.28);
    // long low turret: modular armour boxes, HL sights, T2B RWS, bustle autoloader housing, slat cage
    for (const s of [1, -1]) { T.box(0.3, 0.5, 1.5, s * 1.5, 0.4, 0.2, { c: 0.94 }); T.box(0.24, 0.44, 1.5, s * 1.56, 0.4, -1.5, { c: 0.88 }); for (let i = 0; i < 5; i++) T.box(0.03, 0.03, 1.4, s * 1.78, 0.14 + i * 0.1, -2.2, { c: 0.35 }); smokeBank(T, s * 1.35, th + 0.05, -2.3, 4, s); }
    sightBox(T, -0.75, th, 0.7, 0.44, 0.26, 0.6);
    panoSight(T, 0.6, th, 0.1, 0.4, 0.17);
    hatch(T, 0.6, th, -0.65, 0.3); hatch(T, -0.62, th, -0.5, 0.3);
    rws(T, -0.15, th + 0.02, -1.0, { len: 0.8 });
    T.box(2.5, 0.52, 0.5, 0, 0.42, -3.1, { c: 0.9 }); T.box(1.8, 0.1, 1.2, 0, th + 0.04, -2.2, { c: 0.92 });
    for (let i = 0; i < 5; i++) T.box(2.7, 0.03, 0.03, 0, 0.14 + i * 0.1, -3.42, { c: 0.35 });
    antenna(T, 1.2, th, -2.8, 1.6); antenna(T, -1.2, th, -2.8, 1.3);
  },
};

function buildGun(G, def) {
  const g = def.geo.gun, r = g.r, len = g.len, m = def.geo.mant;
  G.box(m[0] * 2, m[1] * 2, 0.5, 0, 0, 0.42, { c: 0.94 }); // mantlet block
  G.box(m[0] * 1.3, m[1] * 1.5, 0.3, 0, 0, 0.75, { c: 0.88 });
  G.cyl(r * 1.75, 0.9, 0, 0, 1.25, { axis: 'z', seg: 12, c: 0.8 });
  G.cyl(r * 1.25, len - 1.7, 0, 0, 1.7 + (len - 1.7) / 2, { axis: 'z', seg: 12, r2: r * 1.05, c: 0.86 });
  if (g.evac) G.cyl(r * 1.75, 0.95, 0, 0, len * g.evac + 0.6, { axis: 'z', seg: 12, c: 0.9 });
  for (const f of [0.3, 0.62, 0.8]) G.cyl(r * 1.36, 0.06, 0, 0, len * f, { axis: 'z', seg: 12, c: 0.6 });
  G.cyl(r * 1.3, 0.3, 0, 0, len - 0.15, { axis: 'z', seg: 12, c: 0.7 });
  G.cyl(r * 0.82, 0.02, 0, 0, len + 0.005, { axis: 'z', seg: 12, c: 0.02 });
  G.box(0.1, 0.08, 0.12, 0, r * 1.5, len - 0.12, { c: 0.5 }); // muzzle reference sensor
  G.box(0.12, 0.12, 0.3, -m[0] * 0.7, 0.02, 0.72, { c: 0.1 }); // coax port
}

function geometryFor(def) {
  if (geoCache.has(def.id)) return geoCache.get(def.id);
  const S = solidsFor(def), g = def.geo, H = new GeoBuilder(), T = new GeoBuilder(), G = new GeoBuilder();
  hullCommon(H, def, S);
  T.loft(S.turretPts[0], S.turretPts[1], 1);
  T.cyl(1.05, 0.06, 0, -0.01, 0, { seg: 20, c: 0.3 }); // turret ring
  buildGun(G, def);
  DRESS[def.id](H, T, G, def);
  const out = { hull: H.build(), turret: T.build(), gun: G.build(), track: buildTrackGeo(g) };
  geoCache.set(def.id, out);
  return out;
}

function materialFor(def) {
  if (matCache.has(def.id)) return matCache.get(def.id);
  const m = new THREE.MeshStandardMaterial({ map: camoTexture(def.camo), vertexColors: true, roughness: 0.72, metalness: 0.28, envMapIntensity: 0.7 });
  matCache.set(def.id, m);
  return m;
}

const wreckMat = new THREE.MeshStandardMaterial({ color: 0x191715, vertexColors: true, roughness: 0.95, metalness: 0.3, envMapIntensity: 0.25 });

// Returns the scene graph of one tank plus handles the simulation animates.
export function buildTankModel(def) {
  const geo = geometryFor(def), mat = materialFor(def), g = def.geo;
  const root = new THREE.Group(), body = new THREE.Group(), turret = new THREE.Group(), gun = new THREE.Group(), gunRecoil = new THREE.Group();
  const mk = (ge, m) => { const o = new THREE.Mesh(ge, m); o.castShadow = true; o.receiveShadow = true; return o; };
  const hullMesh = mk(geo.hull, mat), turretMesh = mk(geo.turret, mat), gunMesh = mk(geo.gun, mat);
  const tracks = [1, -1].map((s) => {
    const tex = trackTexture().clone(); tex.needsUpdate = true;
    const tm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.5, side: THREE.DoubleSide, envMapIntensity: 0.4 });
    const o = mk(geo.track, tm); o.position.x = s * (g.W / 2 - g.trackW / 2); body.add(o);
    return { mesh: o, tex };
  });
  body.add(hullMesh);
  turret.position.set(0, g.hullH, g.turret.z); turret.add(turretMesh);
  gun.position.set(0, g.gun.y, g.gun.z); gun.add(gunRecoil); gunRecoil.add(gunMesh);
  turret.add(gun); body.add(turret); root.add(body);
  return {
    root, body, turret, gun, gunRecoil, tracks, meshes: [hullMesh, turretMesh, gunMesh],
    setWreck() { for (const m of this.meshes) m.material = wreckMat; for (const t of tracks) { t.mesh.material.color.setScalar(0.25); } },
    dispose() { for (const t of tracks) { t.tex.dispose(); t.mesh.material.dispose(); } },
  };
}
