// Visual model of each tank. Hulls and turrets are skinned through cross-sections (flat welded plates, the way the
// real vehicles are built); road wheels are lathed; everything else is dressing placed from public photographs.
// The damage model uses the simpler convex solids in geom.js, which these shapes are drawn around.
import * as THREE from 'three';
import { GeoBuilder, solidsFor } from './geom.js';
import { camoTexture, trackMaps, armorDetail, blobShadow } from '../gfx/textures.js';

const DARK = 0.14, RUBBER = 0.085, STEEL = 0.4, GLASS = [0.04, 0.07, 0.1], CANVAS = [0.5, 0.46, 0.36];
const geoCache = new Map(), matCache = new Map();
const mirror = (half) => [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
// one turret cross-section: bottom edge (wb, yb), widest point (wm, ym), roof edge (wt, yt), roof centre height yr
const tsec = (z, wb, yb, wm, ym, wt, yt, yr) => ({ z, pts: mirror([[0, yb], [wb, yb], [wm, ym], [wt, yt], [0, yr]]) });
const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _p = new THREE.Vector3();

// A grid of tiles (reactive armour, appliqué plates) laid on the parallelogram p0 + s·u + t·v, standing `lift` proud of it.
function tiles(B, p0, u, v, nu, nv, thick, c, o = {}) {
  _x.set(...u); _z.set(...v); const lu = _x.length(), lv = _z.length(); _x.normalize(); _z.normalize(); _y.crossVectors(_z, _x).normalize(); if (o.flip) _y.negate();
  const g = new THREE.BoxGeometry(lu / nu - (o.gap ?? 0.03), thick, lv / nv - (o.gap ?? 0.03));
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    if (o.skip && o.skip(i, j)) continue;
    _p.set(...p0).addScaledVector(_x, (lu * (i + 0.5)) / nu).addScaledVector(_z, (lv * (j + 0.5)) / nv).addScaledVector(_y, thick / 2 + (o.lift || 0));
    _m.makeBasis(_x, _y, _z).setPosition(_p); B.addGeometry(g, _m.clone(), typeof c === 'number' ? c - ((i + j) % 2) * 0.05 : c);
  }
  g.dispose();
}
const both = (fn) => { fn(1); fn(-1); };

// ---------------------------------------------------------------- running gear
function trackPath(g) {
  const zb = g.L / 2 - 1.0, r = 0.34, yc = 0.6, zf = g.L / 2 - 0.42, zr = -g.L / 2 + 0.42, pts = [[-zb, 0], [zb, 0]];
  for (let a = -60; a <= 90; a += 25) pts.push([zf + r * Math.cos((a * Math.PI) / 180), yc + r * Math.sin((a * Math.PI) / 180)]);
  for (let a = 90; a <= 240; a += 25) pts.push([zr + r * Math.cos((a * Math.PI) / 180), yc + r * Math.sin((a * Math.PI) / 180)]);
  return pts;
}
function buildTrackGeo(g) {
  // a band with real thickness: outer face, inner face and both edges
  const pts = trackPath(g), w = g.trackW, T = 0.075, pos = [], uv = [], nor = [], n = pts.length;
  const N = pts.map((_, i) => { const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n], d = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[1] - a[1]) / d, -(b[0] - a[0]) / d]; }); // [nz, ny] outward
  let len = 0;
  const quad = (P, Nn, U) => { for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...P[k]); nor.push(...Nn[k]); uv.push(...U[k]); } };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = pts[i], b = pts[j], d = Math.hypot(b[0] - a[0], b[1] - a[1]), v0 = len / 0.3, v1 = (len + d) / 0.3, na = N[i], nb = N[j];
    const ai = [a[0] - na[0] * T, a[1] - na[1] * T], bi = [b[0] - nb[0] * T, b[1] - nb[1] * T];
    quad([[-w / 2, a[1], a[0]], [w / 2, a[1], a[0]], [w / 2, b[1], b[0]], [-w / 2, b[1], b[0]]], [[0, na[1], na[0]], [0, na[1], na[0]], [0, nb[1], nb[0]], [0, nb[1], nb[0]]], [[0, v0], [1, v0], [1, v1], [0, v1]]);
    quad([[-w / 2, ai[1], ai[0]], [w / 2, ai[1], ai[0]], [w / 2, bi[1], bi[0]], [-w / 2, bi[1], bi[0]]], [[0, -na[1], -na[0]], [0, -na[1], -na[0]], [0, -nb[1], -nb[0]], [0, -nb[1], -nb[0]]], [[0, v0], [1, v0], [1, v1], [0, v1]]);
    for (const s of [1, -1]) quad([[s * w / 2, a[1], a[0]], [s * w / 2, ai[1], ai[0]], [s * w / 2, bi[1], bi[0]], [s * w / 2, b[1], b[0]]], [[s, 0, 0], [s, 0, 0], [s, 0, 0], [s, 0, 0]], [[0.02, v0], [0.08, v0], [0.08, v1], [0.02, v1]]);
    len += d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}
function roadWheel(H, r, w, x, y, z, s, spokes) {
  H.lathe([[r * 0.72, -w / 2], [r, -w / 2], [r, w / 2], [r * 0.74, w / 2]], x, y, z, s, RUBBER, 18);                    // tyre
  H.lathe([[r * 0.74, w / 2], [r * 0.7, w / 2 - 0.035], [r * 0.46, w / 2 - 0.1], [r * 0.3, w / 2 - 0.08], [r * 0.24, w / 2 + 0.01], [0, w / 2 + 0.02]], x, y, z, s, 0.82, 18); // dished disc + hub
  for (let k = 0; k < spokes; k++) { const a = (k / spokes) * Math.PI * 2; H.cyl(0.022, 0.03, x + s * (w / 2 - 0.075), y + Math.sin(a) * r * 0.37, z + Math.cos(a) * r * 0.37, { axis: 'x', seg: 5, c: 0.5 }); }
}
function runningGear(H, def) {
  const g = def.geo, half = g.L / 2, xr = g.W / 2 - g.trackW / 2, zb = half - 1.2, n = g.wheels, w = g.trackW * 0.36;
  both((s) => {
    for (let i = 0; i < n; i++) {
      const z = -zb + (2 * zb * i) / (n - 1);
      roadWheel(H, g.wheelR, w, s * (xr + g.trackW * 0.19), g.wheelR + 0.075, z, s, g.spokes || 8);
      H.cyl(g.wheelR * 0.98, w, s * (xr - g.trackW * 0.2), g.wheelR + 0.075, z, { axis: 'x', seg: 14, c: RUBBER });               // inner wheel of the pair
      H.box(0.1, 0.12, 0.5, s * (xr - g.trackW * 0.55), g.wheelR + 0.16, z - 0.2, { rx: 0.5, c: 0.3 });                           // suspension arm
    }
    for (let i = 0; i < (g.rollers ?? 3); i++) H.cyl(0.11, g.trackW * 0.5, s * xr, g.trackH - 0.2, -zb * 0.7 + (i * zb * 1.4) / Math.max(1, (g.rollers ?? 3) - 1), { axis: 'x', seg: 8, c: 0.3 });
    // drive sprocket (rear) with teeth, idler (front)
    const zs = -half + 0.42, zi = half - 0.42;
    H.lathe([[0.2, -0.12], [0.3, -0.1], [0.3, 0.12], [0.22, 0.14], [0.12, 0.18], [0, 0.18]], s * (xr + 0.05), 0.6, zs, s, 0.6, 14);
    for (let k = 0; k < 11; k++) { const a = (k / 11) * Math.PI * 2; H.box(0.05, 0.07, 0.07, s * (xr + 0.16), 0.6 + Math.sin(a) * 0.32, zs + Math.cos(a) * 0.32, { rx: -a, c: 0.42 }); H.box(0.05, 0.07, 0.07, s * (xr - 0.08), 0.6 + Math.sin(a) * 0.32, zs + Math.cos(a) * 0.32, { rx: -a, c: 0.42 }); }
    H.lathe([[0.3, -0.12], [0.32, -0.1], [0.32, 0.12], [0.26, 0.14], [0.2, 0.08], [0.1, 0.1], [0, 0.12]], s * (xr + 0.05), 0.6, zi, s, 0.7, 14);
  });
}

// ---------------------------------------------------------------- hull
function hullBody(H, def, S, o = {}) {
  const g = def.geo, L = g.L, W = g.W, half = L / 2, hw = S.hw, spY = g.trackH + 0.04, zG = half - g.glacisLen, zL = half - g.lfpLen, deck = o.deck || 0, zD = -half + (o.deckLen || 2.3), wo = W / 2 - (o.inset || 0);
  const roofAt = (z) => (z <= zD ? g.hullH + deck : z <= zD + 0.22 ? g.hullH + deck * (1 - (z - zD) / 0.22) : z <= zG ? g.hullH : g.hullH - ((z - zG) * (g.hullH - g.noseY)) / g.glacisLen);
  const bellyAt = (z) => (z < -half + 0.4 ? g.belly + 0.32 * (1 - (z + half) / 0.4) : z <= zL ? g.belly : g.belly + ((z - zL) * (g.noseY - 0.03 - g.belly)) / g.lfpLen);
  const zS = Math.min(half - 0.06, zG + ((g.hullH - (spY + 0.09)) * g.glacisLen) / (g.hullH - g.noseY));     // where the glacis drops below the track guards
  const zs = [...new Set([-half, -half + 0.4, zD, zD + 0.22, zG, zS, zS + 0.03, zL, half].map((v) => +v.toFixed(3)))].filter((z) => deck || (z !== +zD.toFixed(3) && z !== +(zD + 0.22).toFixed(3))).sort((a, b) => a - b);
  const secs = zs.map((z) => {
    const r = roofAt(z), b = Math.min(bellyAt(z), r - 0.03), wide = z <= zS + 0.001, sy = Math.min(spY, r - 0.05), ws = wide ? wo : hw;
    return { z, pts: mirror([[0, b], [hw, b], [hw, Math.max(b, sy)], [ws, Math.max(b, sy)], [ws, r - 0.035], [Math.max(hw * 0.9, ws - 0.07), r], [0, r]]) };
  });
  H.sections(secs, 1);
  // track guards run forward past the glacis as thin plates, with rubber flaps front and rear
  both((s) => {
    const x = s * (W / 2 - g.trackW / 2 - 0.02);
    H.box(g.trackW + 0.05, 0.03, half - 0.25 - zS, x, spY + 0.05, (zS + half - 0.25) / 2, { c: 0.95 });
    H.box(g.trackW + 0.05, 0.03, 0.42, x, spY - 0.07, half - 0.07, { rx: 0.62, c: 0.9 });
    H.box(g.trackW + 0.03, 0.34, 0.025, x, spY - 0.24, half + 0.07, { rx: -0.12, c: RUBBER * 1.5 });
    H.box(g.trackW + 0.03, 0.4, 0.025, x, spY - 0.22, -half - 0.02, { c: RUBBER * 1.5 });
  });
  // nose furniture: tow shackles, headlight clusters with guards, tail lights
  both((s) => {
    H.box(0.09, 0.2, 0.12, s * (hw - 0.3), g.noseY - 0.2, half - 0.12, { c: STEEL }); H.cyl(0.05, 0.12, s * (hw - 0.3), g.noseY - 0.27, half - 0.02, { axis: 'x', seg: 6, c: STEEL * 0.8 });
    const hy = roofAt(half - 0.55) + 0.1, hx = s * (hw - 0.18);
    H.cyl(0.085, 0.13, hx, hy, half - 0.55, { axis: 'z', seg: 10, c: 0.6 }); H.cyl(0.07, 0.01, hx, hy, half - 0.48, { axis: 'z', seg: 10, c: [1.5, 1.4, 1.1] });
    H.box(0.24, 0.025, 0.2, hx, hy + 0.11, half - 0.53, { c: 0.8 }); H.box(0.025, 0.2, 0.2, hx + s * 0.12, hy, half - 0.53, { c: 0.8 });
    H.box(0.14, 0.07, 0.03, s * (hw - 0.15), g.hullH + deck - 0.22, -half - 0.02, { c: [0.75, 0.08, 0.06] });
  });
  runningGear(H, def);
  return { roofAt, zG, zS, spY };
}
function skirts(H, def, o) {
  const g = def.geo, L = g.L, x = g.W / 2 + 0.015, top = g.trackH + 0.07, n = o.n, z0 = -L / 2 + (o.rearGap ?? 0.35), z1 = L / 2 - (o.frontGap ?? 0.75), pl = (z1 - z0) / n;
  both((s) => { for (let i = 0; i < n; i++) {
    const heavy = i >= n - (o.heavy || 0), y0 = heavy ? o.y0 - (o.drop ?? 0.05) : o.y0, t = heavy ? o.ht || 0.12 : 0.03, zc = z0 + pl * (i + 0.5);
    H.box(t, top - y0, pl - 0.03, s * (x + t / 2 - 0.02), (top + y0) / 2, zc, { c: heavy ? o.hc ?? 0.97 : o.c ?? 0.88 });
    H.box(0.02, 0.04, pl - 0.1, s * (x + t), top - 0.04, zc, { c: 0.7 });                                                   // hinge rail
    if (heavy && o.tiles) for (let k = 0; k < 2; k++) H.box(0.06, 0.3, pl / 2 - 0.04, s * (x + t + 0.02), top - 0.2 - k * 0.33, zc + (k ? pl / 4 : -pl / 4) * 0, { c: 0.84 - k * 0.05 });
  } });
}
function grille(H, x, y, z, sx, sz, slats = 7) { H.box(sx, 0.025, sz, x, y + 0.01, z, { c: 0.06 }); for (let i = 0; i < slats; i++) H.box(sx - 0.05, 0.03, 0.022, x, y + 0.035, z - sz / 2 + (sz * (i + 0.5)) / slats, { rx: 0.5, c: 0.5 }); H.box(sx + 0.04, 0.04, 0.03, x, y + 0.03, z - sz / 2, { c: 0.8 }); H.box(sx + 0.04, 0.04, 0.03, x, y + 0.03, z + sz / 2, { c: 0.8 }); }
function slat(H, x0, x1, y0, y1, z0, z1, n = 7) { // bar armour panel between two corners (either x or z constant)
  for (let i = 0; i < n; i++) { const y = y0 + ((y1 - y0) * i) / (n - 1); H.box(Math.abs(x1 - x0) + 0.03, 0.022, Math.abs(z1 - z0) + 0.03, (x0 + x1) / 2, y, (z0 + z1) / 2, { c: 0.32 }); }
  const m = Math.max(2, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0)) / 0.6)); for (let i = 0; i <= m; i++) H.box(0.03, y1 - y0, 0.03, x0 + ((x1 - x0) * i) / m, (y0 + y1) / 2, z0 + ((z1 - z0) * i) / m, { c: 0.36 });
}
function driverHatch(H, x, y, z) { H.cyl(0.29, 0.045, x, y + 0.02, z, { seg: 14, c: 0.93 }); H.box(0.3, 0.07, 0.07, x, y + 0.06, z + 0.3, { c: 0.7 }); H.box(0.26, 0.05, 0.012, x, y + 0.065, z + 0.34, { c: GLASS }); for (const s of [1, -1]) H.box(0.16, 0.06, 0.06, x + s * 0.26, y + 0.055, z + 0.22, { ry: s * 0.6, c: 0.7 }); }
function fuelDrums(H, def, y, r = 0.27) { both((s) => { H.cyl(r, 0.92, s * 0.6, y, -def.geo.L / 2 - r - 0.08, { axis: 'x', seg: 14, c: 0.95 }); for (const k of [-0.3, 0.3]) H.cyl(r + 0.012, 0.04, s * 0.6 + k, y, -def.geo.L / 2 - r - 0.08, { axis: 'x', seg: 14, c: 0.6 }); H.box(0.06, 0.05, 0.3, s * 0.6, y - r * 0.6, -def.geo.L / 2 - 0.12, { c: 0.5 }); }); }

// ---------------------------------------------------------------- turret furniture
function smokeBank(B, x, y, z, n, dir, o = {}) {
  B.box(0.09, 0.2, (o.rows ? n / 2 : n) * 0.12 + 0.06, x - dir * 0.05, y + (o.rows ? 0.05 : 0), z - ((o.rows ? n / 2 : n) - 1) * 0.06, { c: 0.7 });
  for (let i = 0; i < n; i++) { const k = o.rows ? Math.floor(i / 2) : i; B.cyl(0.042, 0.26, x + dir * 0.06, y + (o.rows && i % 2 ? 0.11 : 0), z - k * 0.12, { axis: 'x', seg: 8, rz: dir * 0.55, ry: -dir * (0.22 + (o.fan || 0) * k), c: 0.6 }); B.cyl(0.03, 0.01, x + dir * 0.17, y + (o.rows && i % 2 ? 0.11 : 0) + 0.07, z - k * 0.12, { axis: 'x', seg: 6, rz: dir * 0.55, c: 0.05 }); }
}
function rws(B, x, y, z, o = {}) {
  const l = o.len || 1.0;
  B.cyl(0.14, 0.14, x, y + 0.07, z, { seg: 10, c: 0.85 }); B.box(0.07, 0.36, 0.3, x + 0.13, y + 0.3, z, { c: 0.8 }); B.box(0.07, 0.36, 0.3, x - 0.13, y + 0.3, z, { c: 0.8 });
  B.box(0.16, 0.14, 0.5, x, y + 0.36, z + 0.05, { c: 0.5 }); B.cyl(0.02, l, x, y + 0.37, z + 0.3 + l / 2, { axis: 'z', seg: 6, c: DARK }); B.cyl(0.03, 0.12, x, y + 0.37, z + 0.3 + l, { axis: 'z', seg: 6, c: 0.08 });
  B.box(0.2, 0.2, 0.26, x + 0.27, y + 0.32, z + 0.02, { c: 0.75 }); B.box(0.15, 0.14, 0.012, x + 0.27, y + 0.32, z + 0.155, { c: GLASS });
  B.box(0.16, 0.2, 0.3, x - 0.3, y + 0.28, z - 0.02, { c: [0.3, 0.33, 0.24] });
}
function panoSight(B, x, y, z, h = 0.4, r = 0.15) {
  B.cyl(r * 1.25, 0.07, x, y + 0.035, z, { seg: 12, c: 0.85 }); B.cyl(r, h * 0.55, x, y + 0.07 + h * 0.275, z, { seg: 12, c: 0.92 });
  B.box(r * 2.1, h * 0.5, r * 2.0, x, y + 0.07 + h * 0.75, z, { c: 0.9 }); B.box(r * 1.5, h * 0.34, 0.015, x, y + 0.07 + h * 0.75, z + r, { c: GLASS }); B.box(r * 2.2, 0.03, r * 2.2, x, y + 0.08 + h, z, { c: 0.8 });
}
function sightBox(B, x, y, z, sx = 0.4, sy = 0.26, sz = 0.55) {
  B.box(sx, sy, sz, x, y + sy / 2, z, { c: 0.94 }); B.box(sx + 0.03, 0.03, sz * 0.5, x, y + sy + 0.01, z + sz * 0.3, { c: 0.82 });
  B.box(sx * 0.74, sy * 0.62, 0.015, x, y + sy / 2, z + sz / 2 + 0.006, { c: GLASS }); for (const s of [1, -1]) B.box(0.02, sy * 0.8, 0.12, x + s * sx * 0.44, y + sy / 2, z + sz / 2 + 0.06, { c: 0.75 });
}
function hatch(B, x, y, z, r = 0.3, o = {}) {
  B.cyl(r + 0.05, 0.05, x, y + 0.025, z, { seg: 16, c: 0.8 }); B.cyl(r, 0.05, x, y + 0.065, z, { seg: 16, c: 0.92 }); B.box(0.07, 0.03, 0.22, x, y + 0.1, z - r * 0.45, { c: 0.6 });
  if (o.blocks) for (let k = 0; k < o.blocks; k++) { const a = (k / o.blocks) * Math.PI * 2 + 0.3; B.box(0.16, 0.07, 0.06, x + Math.sin(a) * (r + 0.1), y + 0.075, z + Math.cos(a) * (r + 0.1), { ry: a, c: 0.7 }); B.box(0.13, 0.045, 0.012, x + Math.sin(a) * (r + 0.135), y + 0.08, z + Math.cos(a) * (r + 0.135), { ry: a, c: GLASS }); }
}
function antenna(B, x, y, z, h = 1.6) { B.cyl(0.04, 0.14, x, y + 0.07, z, { seg: 8, c: 0.45 }); B.cyl(0.02, 0.1, x, y + 0.19, z, { seg: 6, c: 0.2 }); B.cyl(0.007, h, x, y + 0.24 + h / 2, z, { seg: 4, c: DARK }); }
function windSensor(B, x, y, z) { B.cyl(0.02, 0.55, x, y + 0.28, z, { seg: 6, c: 0.5 }); B.cyl(0.05, 0.12, x, y + 0.6, z, { seg: 8, c: 0.7 }); }
function basket(B, zr, w, y0, h, d, o = {}) {
  B.box(w * 2, 0.025, d, 0, y0, zr - d / 2, { c: 0.45 });
  for (let k = 0; k <= 2; k++) B.box(w * 2, 0.025, 0.025, 0, y0 + (h * k) / 2, zr - d, { c: 0.5 });
  both((s) => { for (let k = 0; k <= 2; k++) B.box(0.025, 0.025, d, s * w, y0 + (h * k) / 2, zr - d / 2, { c: 0.5 }); for (let k = 0; k <= 3; k++) B.box(0.025, h, 0.025, s * w, y0 + h / 2, zr - (d * k) / 3, { c: 0.5 }); });
  for (let k = -3; k <= 3; k++) B.box(0.025, h, 0.025, (k * w) / 3.5, y0 + h / 2, zr - d, { c: 0.5 });
  if (o.kit !== false) { B.box(w * 0.75, h * 0.8, d * 0.72, -w * 0.5, y0 + h * 0.42, zr - d / 2, { c: CANVAS }); B.box(w * 0.55, h * 0.55, d * 0.62, w * 0.55, y0 + h * 0.3, zr - d / 2, { c: [0.36, 0.4, 0.3] }); B.cyl(0.15, w * 0.8, w * 0.05, y0 + h * 0.9, zr - d / 2, { axis: 'x', seg: 10, c: CANVAS.map((v) => v * 0.85) }); }
}
function buildGun(G, def) {
  const g = def.geo.gun, r = g.r, len = g.len, m = def.geo.mant, st = g.style || 'west';
  if (st === 'east') { // cast collar under a canvas dust cover
    G.box(m[0] * 1.7, m[1] * 1.7, 0.4, 0, 0, 0.45, { c: 0.9 }); G.cyl(m[1] * 0.95, 0.5, 0, 0, 0.82, { axis: 'z', seg: 12, r2: r * 1.9, c: CANVAS });
  } else if (st === 'wedge') { // Leopard: arrow-shaped mantlet shield
    G.sections([{ z: 0.3, pts: mirror([[0, -m[1]], [m[0], -m[1]], [m[0], m[1]], [0, m[1]]]) }, { z: 1.05, pts: mirror([[0, -0.2], [0.24, -0.2], [0.24, 0.2], [0, 0.2]]) }], 0.96);
  } else { G.box(m[0] * 2, m[1] * 2, 0.55, 0, 0, 0.42, { c: 0.95 }); G.box(m[0] * 1.2, m[1] * 1.45, 0.34, 0, 0, 0.82, { c: 0.9 }); }
  G.cyl(r * 1.9, 0.75, 0, 0, 1.3, { axis: 'z', seg: 14, r2: r * 1.55, c: 0.82 });
  // thermal sleeve in sections with clamp bands, slightly tapering toward the muzzle
  const z0 = 1.65, segs = 4, sl = (len - z0 - 0.3) / segs;
  for (let i = 0; i < segs; i++) { const ra = r * (1.32 - i * 0.055); G.cyl(ra, sl - 0.03, 0, 0, z0 + sl * (i + 0.5), { axis: 'z', seg: 14, r2: ra - r * 0.04, c: 0.9 - (i % 2) * 0.04 }); G.cyl(ra + 0.012, 0.035, 0, 0, z0 + sl * i, { axis: 'z', seg: 14, c: 0.6 }); }
  if (g.evac) { const k = G.mark(); G.lathe([[r * 1.3, -0.55], [r * 1.85, -0.42], [r * 1.9, 0.38], [r * 1.3, 0.55]], 0, 0, 0, 1, 0.93, 14); G.xform(k, new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(0, 0, len * g.evac + 0.5)); }
  G.cyl(r * 1.28, 0.3, 0, 0, len - 0.15, { axis: 'z', seg: 14, c: 0.72 }); G.cyl(r * 0.84, 0.02, 0, 0, len + 0.006, { axis: 'z', seg: 14, c: 0.015 });
  G.box(0.11, 0.09, 0.14, st === 'east' ? r * 1.6 : 0, st === 'east' ? 0 : r * 1.55, len - 0.2, { c: 0.5 });   // muzzle reference
  G.cyl(0.035, 0.34, -m[0] * 0.62, 0.03, 0.82, { axis: 'z', seg: 6, c: 0.06 });                                   // coaxial MG
}

// ---------------------------------------------------------------- the seven vehicles
const BUILD = {
  ztz99a(H, T, def, S) {
    const g = def.geo, L = g.L, hw = g.W / 2, h = hullBody(H, def, S, { deck: 0.06, deckLen: 2.4 }), sl = Math.atan2(g.hullH - g.noseY, g.glacisLen);
    skirts(H, def, { n: 8, y0: 0.5, heavy: 4, ht: 0.1, tiles: true });
    // FY-series reactive tiles across the glacis, V-shaped splash board, driver in the centre
    tiles(H, [-1.05, g.noseY + 0.03, L / 2 - 0.06], [2.1, 0, 0], [0, g.hullH - g.noseY - 0.05, -g.glacisLen + 0.35], 6, 3, 0.06, 0.93);
    for (const s of [1, -1]) H.box(1.25, 0.14, 0.03, s * 0.58, g.hullH + 0.06, L / 2 - g.glacisLen - 0.02, { ry: s * 0.22, c: 0.9 });
    driverHatch(H, 0, g.hullH, L / 2 - g.glacisLen - 0.5);
    grille(H, 0.5, g.hullH + 0.06, -L / 2 + 1.5, 0.85, 1.25); grille(H, -0.55, g.hullH + 0.06, -L / 2 + 1.25, 0.7, 0.8, 5);
    H.cyl(0.42, 0.03, -0.45, g.hullH + 0.075, -L / 2 + 0.55, { seg: 16, c: 0.5 });
    H.box(0.3, 0.22, 0.55, -(hw - 0.2), g.hullH + 0.1, -L / 2 + 1.3, { c: DARK }); H.box(0.26, 0.16, 0.5, -(hw + 0.06), g.hullH - 0.02, -L / 2 + 1.3, { c: 0.2 }); // exhaust outlet, left rear
    both((s) => { H.box(0.42, 0.2, 1.5, s * (hw - 0.25), g.hullH + 0.1, 0.4, { c: 0.94 }); H.box(0.42, 0.18, 1.1, s * (hw - 0.25), g.hullH + 0.09, -1.2, { c: 0.9 }); }); // fender stowage / fuel cells
    fuelDrums(H, def, g.hullH - 0.12, 0.26);
    H.box(1.9, 0.12, 0.12, 0, g.hullH - 0.5, -L / 2 - 0.08, { c: [0.42, 0.3, 0.2] });
    // turret: welded shell with arrow add-on modules, tiles on cheeks and roof front
    T.sections([tsec(2.15, 0.36, 0.14, 0.4, 0.4, 0.36, 0.62, 0.64), tsec(1.25, 1.16, 0.05, 1.34, 0.4, 1.18, 0.72, 0.78), tsec(0.3, 1.36, 0, 1.5, 0.38, 1.36, 0.78, 0.82), tsec(-0.9, 1.36, 0, 1.48, 0.38, 1.34, 0.78, 0.82), tsec(-1.3, 1.26, 0.26, 1.4, 0.42, 1.28, 0.76, 0.8), tsec(-2.35, 1.0, 0.28, 1.1, 0.45, 1.02, 0.72, 0.74)], 1);
    both((s) => { tiles(T, [s * 0.44, 0.12, 2.06], [s * 0.8, 0, -0.84], [0, 0.5, 0], 3, 2, 0.09, 0.95, { flip: s < 0 }); tiles(T, [s * 0.36, 0.66, 1.95], [s * 0.7, 0.06, -0.62], [0, 0.03, -0.42], 3, 1, 0.05, 0.92, { flip: s > 0 }); });
    tiles(T, [-0.9, 0.8, 1.15], [1.8, 0, 0], [0, 0.03, -0.7], 5, 2, 0.045, 0.92, { skip: (i, j) => (i === 0 || i === 3) && j === 1 });
    sightBox(T, 0.66, 0.8, 0.55, 0.38, 0.22, 0.5); panoSight(T, -0.7, 0.82, -0.25, 0.42, 0.15);
    hatch(T, -0.62, 0.82, -0.85, 0.3, { blocks: 5 }); hatch(T, 0.62, 0.82, -0.6, 0.28);
    T.box(0.5, 0.44, 0.52, 0.72, 1.02, -1.5, { c: 0.95 }); T.box(0.32, 0.26, 0.015, 0.72, 1.06, -1.235, { c: GLASS }); T.cyl(0.1, 0.12, 0.72, 0.84, -1.5, { seg: 8, c: 0.7 }); // laser dazzler
    rws(T, -0.62, 0.9, -1.25, { len: 1.1 });
    both((s) => { smokeBank(T, s * 1.4, 0.48, -0.75, 5, s); T.box(0.34, 0.36, 1.0, s * 1.28, 0.5, -1.75, { c: 0.86 }); });
    basket(T, -2.35, 0.98, 0.3, 0.42, 0.5);
    antenna(T, 0.92, 0.76, -2.2, 1.7); antenna(T, -0.92, 0.76, -2.2, 1.3); windSensor(T, 0.1, 0.78, -2.1);
  },
  t14(H, T, def, S) {
    const g = def.geo, L = g.L, hw = g.W / 2; hullBody(H, def, S, { deck: 0.1, deckLen: 2.6 });
    skirts(H, def, { n: 9, y0: 0.42, heavy: 6, ht: 0.16, hc: 0.95, rearGap: 2.5, frontGap: 0.6, drop: 0.0 });
    both((s) => slat(H, s * (hw + 0.22), s * (hw + 0.22), 0.52, 1.12, -L / 2 + 0.2, -L / 2 + 2.45, 8)); slat(H, -hw + 0.3, hw - 0.3, 0.7, 1.3, -L / 2 - 0.28, -L / 2 - 0.28, 8);
    // long glacis under a carpet of Malachit tiles, three hatches abreast behind it
    tiles(H, [-1.1, g.noseY + 0.03, L / 2 - 0.06], [2.2, 0, 0], [0, g.hullH - g.noseY - 0.04, -g.glacisLen + 0.3], 5, 5, 0.055, 0.93);
    for (const x of [-0.72, 0.72]) driverHatch(H, x, g.hullH, L / 2 - g.glacisLen - 0.45); H.cyl(0.26, 0.04, 0, g.hullH + 0.02, L / 2 - g.glacisLen - 0.6, { seg: 14, c: 0.9 });
    grille(H, 0, g.hullH + 0.1, -L / 2 + 1.35, 1.8, 1.5, 9);
    both((s) => { H.box(0.5, 0.22, 2.3, s * (hw - 0.3), g.hullH + 0.2, -L / 2 + 1.5, { c: 0.93 }); H.box(0.3, 0.18, 0.5, s * (hw - 0.05), g.hullH + 0.02, -L / 2 + 2.9, { c: DARK }); });
    // unmanned turret: faceted shroud around the gun module
    T.sections([tsec(2.0, 0.5, 0.2, 0.55, 0.45, 0.45, 0.68, 0.7), tsec(1.2, 1.0, 0.05, 1.06, 0.4, 0.8, 0.84, 0.9), tsec(-0.4, 1.2, 0, 1.2, 0.4, 0.92, 0.92, 0.98), tsec(-2.0, 1.15, 0, 1.15, 0.4, 0.9, 0.88, 0.94), tsec(-2.55, 0.85, 0.1, 0.9, 0.42, 0.7, 0.8, 0.84)], 1);
    both((s) => {
      for (let i = 0; i < 5; i++) T.cyl(0.078, 0.62, s * (1.0 + i * 0.03), 0.1, 1.0 - i * 0.22, { axis: 'z', seg: 9, ry: s * 0.55, c: 0.5 });         // Afghanit launch tubes
      T.box(0.5, 0.2, 1.3, s * 1.05, 0.03, 0.6, { ry: s * 0.12, c: 0.85 });
      T.box(0.02, 0.36, 0.52, s * 1.02, 0.62, 0.85, { ry: s * 0.42, rz: s * 0.28, c: 0.62 }); T.box(0.02, 0.36, 0.52, s * 1.1, 0.62, -1.75, { ry: -s * 0.2, rz: s * 0.3, c: 0.62 }); // radar panels
      for (let i = 0; i < 6; i++) T.cyl(0.04, 0.22, s * 0.78, 1.02, -1.3 - i * 0.11, { seg: 7, rz: s * 0.5, c: 0.5 });                              // roof launchers
      T.box(0.22, 0.4, 2.0, s * 1.22, 0.3, -1.0, { c: 0.9 });
    });
    T.box(0.9, 0.2, 1.6, 0, 1.04, -0.9, { c: 0.94 });
    panoSight(T, -0.42, 1.14, -0.35, 0.5, 0.2); rws(T, -0.42, 1.72, -0.35, { len: 1.0 });
    sightBox(T, 0.48, 0.94, 0.75, 0.36, 0.24, 0.42); T.box(1.5, 0.46, 0.4, 0, 0.42, -2.7, { c: 0.86 });
    antenna(T, 0.6, 1.0, -2.0, 1.5); windSensor(T, 0.2, 1.14, -1.5);
  },
  t90m(H, T, def, S) {
    const g = def.geo, L = g.L, hw = g.W / 2; hullBody(H, def, S, {});
    skirts(H, def, { n: 6, y0: 0.5, heavy: 3, ht: 0.16, hc: 0.95, c: RUBBER * 2.4 });
    both((s) => { slat(H, s * (hw + 0.2), s * (hw + 0.2), 0.56, 1.1, -L / 2 + 0.25, -L / 2 + 1.9, 7); H.box(0.46, 0.22, 3.4, s * (hw - 0.25), g.hullH + 0.11, -0.4, { c: 0.93 }); for (let k = 0; k < 3; k++) H.box(0.48, 0.03, 0.03, s * (hw - 0.25), g.hullH + 0.225, -1.6 + k * 1.2, { c: 0.6 }); });
    tiles(H, [-1.1, g.noseY + 0.04, L / 2 - 0.05], [2.2, 0, 0], [0, g.hullH - g.noseY - 0.05, -g.glacisLen + 0.22], 5, 2, 0.09, 0.94);
    for (const s of [1, -1]) H.box(1.2, 0.13, 0.03, s * 0.56, g.hullH + 0.06, L / 2 - g.glacisLen - 0.06, { ry: s * 0.2, c: 0.9 });
    driverHatch(H, 0, g.hullH, L / 2 - g.glacisLen - 0.45);
    grille(H, 0, g.hullH, -L / 2 + 1.0, 1.6, 1.0, 7); H.cyl(0.4, 0.03, 0.35, g.hullH + 0.02, -L / 2 + 0.45, { seg: 14, c: 0.5 });
    H.box(0.34, 0.24, 0.62, hw - 0.12, g.hullH + 0.04, -L / 2 + 1.45, { c: 0.2 });
    H.cyl(0.13, 2.7, 0, g.hullH - 0.08, -L / 2 - 0.16, { axis: 'x', seg: 10, c: [0.4, 0.29, 0.19] }); fuelDrums(H, def, g.hullH + 0.02, 0.27);
    // welded turret, Relikt wedges on the cheeks, ammunition box at the back, mesh skirt below
    T.sections([tsec(1.75, 0.45, 0.12, 0.5, 0.36, 0.45, 0.55, 0.58), tsec(1.15, 1.1, 0.04, 1.3, 0.36, 1.1, 0.62, 0.7), tsec(0.2, 1.3, 0, 1.52, 0.34, 1.25, 0.66, 0.76), tsec(-0.9, 1.25, 0, 1.45, 0.34, 1.2, 0.66, 0.76), tsec(-1.5, 1.0, 0.05, 1.15, 0.36, 1.0, 0.64, 0.7)], 1);
    T.sections([tsec(-1.45, 0.92, 0.2, 0.95, 0.42, 0.92, 0.68, 0.7), tsec(-2.35, 0.9, 0.22, 0.93, 0.42, 0.9, 0.66, 0.68)], 0.93);
    both((s) => {
      for (let k = 0; k < 4; k++) { const t = (k + 0.5) / 4, mk = T.mark(); T.sections([{ z: 0, pts: [[-0.12, 0.02], [0.12, 0.02], [0.12, 0.3], [0, 0.4], [-0.12, 0.3]] }, { z: 0.42, pts: [[-0.12, 0.08], [0.12, 0.08], [0.12, 0.26], [0, 0.3], [-0.12, 0.26]] }], 0.96 - (k % 2) * 0.05); T.xform(mk, new THREE.Matrix4().makeRotationY(s * 0.62).setPosition(s * (0.5 + t * 0.78), 0.1, 1.72 - t * 0.55)); }
      tiles(T, [s * 0.4, 0.6, 1.5], [s * 0.7, 0.06, -0.5], [0, 0.05, -0.5], 2, 1, 0.07, 0.93, { flip: s > 0 });
      smokeBank(T, s * 1.42, 0.42, -0.2, 6, s, { rows: true });
      for (let i = 0; i < 6; i++) T.box(0.02, 0.02, 1.5, s * (1.4 - i * 0.012), 0.02 + i * 0.07, -1.25, { ry: s * 0.22, c: 0.3 });
    });
    slat(T, -0.9, 0.9, 0.2, 0.62, -2.5, -2.5, 6);
    sightBox(T, 0.55, 0.72, 0.5, 0.34, 0.24, 0.42); panoSight(T, -0.55, 0.76, -0.3, 0.38, 0.16); rws(T, -0.55, 1.2, -0.3, { len: 1.05 });
    hatch(T, 0.6, 0.76, -0.45, 0.28); T.cyl(0.11, 1.5, -1.05, 0.5, -1.9, { axis: 'z', seg: 10, c: 0.9 });
    antenna(T, 0.8, 0.7, -1.4, 1.6); windSensor(T, -0.15, 0.74, -1.3);
  },
  m1a2(H, T, def, S) {
    const g = def.geo, L = g.L, hw = g.W / 2; hullBody(H, def, S, { deck: 0.05, deckLen: 2.9 });
    skirts(H, def, { n: 7, y0: 0.46, heavy: 0, c: 0.96, frontGap: 0.5, rearGap: 1.0 });
    // rear: three exhaust grille doors, pintle; engine deck louvres
    for (let k = -1; k <= 1; k++) { H.box(0.74, 0.5, 0.05, k * 0.78, g.hullH - 0.32, -L / 2 - 0.02, { c: 0.08 }); for (let i = 0; i < 8; i++) H.box(0.7, 0.025, 0.06, k * 0.78, g.hullH - 0.54 + i * 0.062, -L / 2 - 0.05, { rx: -0.5, c: 0.5 }); }
    grille(H, 0, g.hullH + 0.05, -L / 2 + 1.0, 2.3, 1.2, 9); grille(H, 0.95, g.hullH + 0.05, -L / 2 + 2.2, 0.85, 0.6, 4); grille(H, -0.95, g.hullH + 0.05, -L / 2 + 2.2, 0.85, 0.6, 4);
    driverHatch(H, 0, g.hullH - 0.06, L / 2 - g.glacisLen + 0.3);
    both((s) => { H.box(0.5, 0.05, 1.0, s * (hw - 0.3), g.hullH + 0.02, 0.3, { c: 0.9 }); H.cyl(0.06, 0.1, s * (hw - 0.4), g.hullH + 0.05, 1.3, { seg: 8, c: 0.6 }); });
    // turret: slab cheeks swept back, low undercut bustle with a stowage rack
    T.sections([tsec(2.1, 0.5, 0.08, 0.52, 0.4, 0.5, 0.62, 0.64), tsec(1.5, 1.56, 0.05, 1.72, 0.38, 1.62, 0.72, 0.78), tsec(0.6, 1.6, 0, 1.8, 0.36, 1.66, 0.8, 0.84), tsec(-0.8, 1.6, 0, 1.8, 0.36, 1.66, 0.8, 0.84), tsec(-1.2, 1.55, 0.28, 1.76, 0.42, 1.62, 0.8, 0.84), tsec(-2.75, 1.35, 0.3, 1.45, 0.45, 1.36, 0.76, 0.8)], 1);
    sightBox(T, -0.78, 0.82, 0.55, 0.52, 0.32, 0.62); T.box(0.3, 0.3, 0.4, -0.78, 0.97, 0.05, { c: 0.9 });
    panoSight(T, 0.8, 0.8, 0.75, 0.38, 0.18);
    T.cyl(0.42, 0.2, -0.68, 0.94, -0.4, { seg: 16, c: 0.9 }); hatch(T, -0.68, 1.02, -0.4, 0.32, { blocks: 7 }); hatch(T, 0.62, 0.84, -0.5, 0.3);
    rws(T, -0.05, 0.86, 0.15, { len: 1.3 });
    T.cyl(0.018, 0.95, 0.62, 1.14, 0.05, { axis: 'z', seg: 6, c: DARK }); T.box(0.1, 0.2, 0.28, 0.62, 1.06, -0.3, { c: 0.5 }); T.box(0.5, 0.36, 0.02, 0.62, 1.04, -0.12, { c: 0.85 });
    both((s) => { T.box(0.16, 0.32, 0.46, s * 1.8, 0.48, 0.45, { c: 0.72 }); for (let i = 0; i < 6; i++) T.cyl(0.04, 0.18, s * 1.9, 0.42 + (i % 2) * 0.13, 0.6 - Math.floor(i / 2) * 0.13, { axis: 'x', seg: 7, rz: s * 0.45, c: 0.45 }); T.box(0.3, 0.3, 1.5, s * 1.6, 0.5, -1.9, { c: 0.88 }); });
    basket(T, -2.75, 1.32, 0.3, 0.46, 0.7); T.box(0.75, 0.3, 0.55, -0.55, 0.95, -2.1, { c: 0.92 });
    antenna(T, 1.25, 0.8, -2.5, 1.8); antenna(T, -1.25, 0.8, -2.5, 1.8); windSensor(T, 0, 0.82, -2.6);
  },
  leo2a7(H, T, def, S) {
    const g = def.geo, L = g.L, hw = g.W / 2; hullBody(H, def, S, { deck: 0.12, deckLen: 2.5 });
    skirts(H, def, { n: 7, y0: 0.46, heavy: 3, ht: 0.22, hc: 0.96, c: 0.9, frontGap: 0.55 });
    both((s) => { H.cyl(0.3, 0.07, s * 0.72, g.hullH - 0.26, -L / 2 - 0.02, { axis: 'z', seg: 16, c: 0.07 }); for (let i = 0; i < 5; i++) H.box(0.5 - Math.abs(i - 2) * 0.1, 0.02, 0.04, s * 0.72, g.hullH - 0.46 + i * 0.1, -L / 2 - 0.06, { c: 0.5 }); grille(H, s * 0.78, g.hullH + 0.12, -L / 2 + 0.95, 0.95, 0.95, 6); });
    H.cyl(0.45, 0.04, 0, g.hullH + 0.14, -L / 2 + 1.0, { seg: 18, c: 0.5 });
    H.box(2.3, 0.1, 1.15, 0, g.hullH - 0.1, L / 2 - g.glacisLen + 0.75, { rx: Math.atan2(g.hullH - g.noseY, g.glacisLen), c: 0.95 });               // add-on glacis module
    driverHatch(H, -0.45, g.hullH, L / 2 - g.glacisLen - 0.42);
    both((s) => H.box(0.5, 0.06, 1.6, s * (hw - 0.32), g.hullH + 0.03, 0.2, { c: 0.9 }));
    // slab-sided turret behind the arrow-shaped spaced modules
    T.sections([tsec(2.55, 0.4, 0.2, 0.44, 0.42, 0.4, 0.6, 0.62), tsec(1.1, 1.45, 0.08, 1.66, 0.42, 1.5, 0.76, 0.82), tsec(0.85, 1.56, 0.02, 1.7, 0.4, 1.6, 0.84, 0.86), tsec(-1.0, 1.6, 0, 1.72, 0.4, 1.62, 0.84, 0.86), tsec(-1.3, 1.56, 0.3, 1.7, 0.44, 1.6, 0.84, 0.86), tsec(-2.7, 1.5, 0.32, 1.62, 0.44, 1.55, 0.82, 0.84)], 1);
    both((s) => { T.box(0.03, 0.46, 1.5, s * 1.02, 0.16, 1.75, { ry: s * 0.67, c: 0.9 }); T.box(0.36, 0.5, 1.3, s * 1.58, 0.56, -1.95, { c: 0.92 }); smokeBank(T, s * 1.78, 0.6, -0.7, 4, s, { fan: 0.07 }); smokeBank(T, s * 1.78, 0.42, -0.7, 4, s, { fan: 0.07 }); });
    sightBox(T, -0.82, 0.86, 0.4, 0.52, 0.28, 0.75); panoSight(T, 0.5, 0.88, -0.4, 0.44, 0.17);
    hatch(T, -0.6, 0.88, -0.55, 0.32, { blocks: 6 }); hatch(T, 0.66, 0.88, -1.05, 0.3);
    T.cyl(0.018, 0.85, 0.66, 1.16, -0.6, { axis: 'z', seg: 6, c: DARK }); T.box(0.1, 0.2, 0.2, 0.66, 1.06, -1.0, { c: 0.5 });
    T.box(2.5, 0.48, 0.4, 0, 0.58, -2.9, { c: 0.9 }); T.box(0.95, 0.28, 0.6, 0.35, 1.0, -2.0, { c: 0.95 });
    antenna(T, 1.3, 0.86, -2.5, 1.7); antenna(T, -1.3, 0.86, -2.5, 1.7); windSensor(T, -0.2, 0.88, -2.4);
  },
  cr3(H, T, def, S) {
    const g = def.geo, L = g.L, hw = g.W / 2; hullBody(H, def, S, { deck: 0.08, deckLen: 2.8 });
    skirts(H, def, { n: 6, y0: 0.4, heavy: 6, ht: 0.18, hc: 0.96, frontGap: 0.55, drop: 0 });
    H.box(2.2, 0.16, 1.1, 0, g.hullH - 0.1, L / 2 - g.glacisLen + 0.7, { rx: Math.atan2(g.hullH - g.noseY, g.glacisLen), c: 0.94 });
    H.box(2.2, 0.4, 0.16, 0, g.noseY - 0.34, L / 2 - 0.3, { rx: -0.65, c: 0.92 });                                                              // lower-plate appliqué
    grille(H, 0, g.hullH + 0.08, -L / 2 + 1.3, 2.0, 1.7, 10);
    both((s) => { H.box(0.36, 0.32, 0.75, s * (hw - 0.3), g.hullH + 0.24, -L / 2 + 0.6, { c: 0.92 }); H.box(0.5, 0.05, 1.8, s * (hw - 0.32), g.hullH + 0.03, 0.4, { c: 0.9 }); });
    fuelDrums(H, def, g.hullH - 0.15, 0.27); driverHatch(H, 0, g.hullH, L / 2 - g.glacisLen - 0.48);
    T.sections([tsec(2.2, 0.5, 0.12, 0.55, 0.4, 0.5, 0.58, 0.6), tsec(1.45, 1.36, 0.05, 1.5, 0.4, 1.3, 0.76, 0.82), tsec(0.4, 1.46, 0, 1.62, 0.4, 1.46, 0.84, 0.88), tsec(-1.2, 1.46, 0, 1.62, 0.4, 1.46, 0.84, 0.88), tsec(-1.6, 1.4, 0.28, 1.56, 0.44, 1.42, 0.84, 0.88), tsec(-2.8, 1.25, 0.3, 1.35, 0.45, 1.25, 0.8, 0.82)], 1);
    sightBox(T, -0.7, 0.86, 0.75, 0.44, 0.26, 0.52); panoSight(T, -0.7, 0.9, -0.25, 0.5, 0.18);
    hatch(T, -0.66, 0.9, -0.95, 0.32, { blocks: 6 }); hatch(T, 0.62, 0.9, -0.7, 0.3); rws(T, 0.62, 0.92, -0.1, { len: 0.95 });
    both((s) => { for (let i = 0; i < 5; i++) T.cyl(0.045, 0.24, s * (0.74 + i * 0.13), 0.6, 1.9 - i * 0.14, { axis: 'z', seg: 7, rx: -0.32, ry: s * 0.45, c: 0.5 }); T.box(0.34, 0.5, 1.7, s * 1.72, 0.52, -1.6, { c: 0.93 }); T.box(0.16, 0.44, 1.3, s * 1.66, 0.48, 0.25, { c: 0.96 }); });
    T.box(2.3, 0.46, 0.45, 0, 0.56, -3.0, { c: 0.9 }); T.box(0.6, 0.2, 0.6, 0.2, 0.98, -2.1, { c: 0.93 });
    antenna(T, 1.2, 0.84, -2.6, 1.8); antenna(T, -1.2, 0.84, -2.6, 1.5); windSensor(T, 0.9, 0.88, -1.6);
  },
  leclerc(H, T, def, S) {
    const g = def.geo, L = g.L, hw = g.W / 2; hullBody(H, def, S, { deck: 0.07, deckLen: 2.4 });
    skirts(H, def, { n: 6, y0: 0.44, heavy: 3, ht: 0.2, hc: 0.95, c: 0.92, frontGap: 0.5 });
    both((s) => slat(H, s * (hw + 0.2), s * (hw + 0.2), 0.55, 1.08, -L / 2 + 0.2, -L / 2 + 2.0, 7)); slat(H, -hw + 0.3, hw - 0.3, 0.66, 1.2, -L / 2 - 0.66, -L / 2 - 0.66, 7);
    fuelDrums(H, def, g.hullH - 0.1, 0.25); grille(H, 0, g.hullH + 0.07, -L / 2 + 1.2, 2.0, 1.5, 9);
    driverHatch(H, 0.55, g.hullH, L / 2 - g.glacisLen - 0.42);
    both((s) => H.box(0.5, 0.06, 1.5, s * (hw - 0.32), g.hullH + 0.03, 0.3, { c: 0.9 }));
    // long, low turret boxed in by modular armour; autoloader bustle behind a slat cage
    T.sections([tsec(2.1, 0.55, 0.14, 0.6, 0.38, 0.55, 0.56, 0.58), tsec(1.45, 1.25, 0.05, 1.38, 0.38, 1.25, 0.68, 0.74), tsec(0.2, 1.45, 0, 1.56, 0.36, 1.42, 0.74, 0.8), tsec(-1.4, 1.45, 0, 1.56, 0.36, 1.42, 0.74, 0.8), tsec(-1.8, 1.4, 0.25, 1.5, 0.4, 1.38, 0.74, 0.8), tsec(-3.0, 1.3, 0.28, 1.4, 0.42, 1.3, 0.74, 0.76)], 1);
    both((s) => { T.box(0.14, 0.46, 1.5, s * 1.6, 0.42, 0.2, { c: 0.96 }); T.box(0.14, 0.42, 1.5, s * 1.58, 0.52, -1.5, { c: 0.9 }); slat(T, s * 1.74, s * 1.74, 0.3, 0.72, -3.0, -1.7, 6); smokeBank(T, s * 1.3, 0.82, -2.4, 4, s); });
    slat(T, -1.4, 1.4, 0.3, 0.72, -3.24, -3.24, 6);
    sightBox(T, -0.75, 0.78, 0.65, 0.46, 0.28, 0.62); panoSight(T, 0.6, 0.8, 0.05, 0.42, 0.18);
    hatch(T, 0.6, 0.8, -0.7, 0.3, { blocks: 6 }); hatch(T, -0.62, 0.8, -0.55, 0.3); rws(T, -0.15, 0.82, -1.1, { len: 0.8 });
    T.box(1.8, 0.1, 1.2, 0, 0.82, -2.3, { c: 0.93 });
    antenna(T, 1.2, 0.78, -2.9, 1.7); antenna(T, -1.2, 0.78, -2.9, 1.3); windSensor(T, 0.9, 0.8, -1.7);
  },
};

function geometryFor(def) {
  if (geoCache.has(def.id)) return geoCache.get(def.id);
  const S = solidsFor(def), g = def.geo, H = new GeoBuilder(), T = new GeoBuilder(), G = new GeoBuilder();
  BUILD[def.id](H, T, def, S);
  T.cyl(1.08, 0.07, 0, -0.01, 0, { seg: 24, c: 0.25 }); // turret ring
  buildGun(G, def);
  const out = { hull: H.build(), turret: T.build(), gun: G.build(), track: buildTrackGeo(g) };
  geoCache.set(def.id, out);
  return out;
}

// Road dust settles on the running gear and lower hull: blended in the fragment shader by height above the ground.
function dusty(m) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vDustY;').replace('#include <project_vertex>', '#include <project_vertex>\nvDustY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vDustY;')
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat dustK = clamp(smoothstep(1.35, 0.2, vDustY) * 0.72 + 0.1, 0.0, 1.0);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.175, 0.14), dustK);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.96, dustK);');
  };
  return m;
}
function materialFor(def) {
  if (matCache.has(def.id)) return matCache.get(def.id);
  const d = armorDetail();
  const m = dusty(new THREE.MeshStandardMaterial({ map: camoTexture(def.camo), normalMap: d.normal, normalScale: new THREE.Vector2(0.55, 0.55), roughnessMap: d.rough, vertexColors: true, roughness: 1, metalness: 0.32, envMapIntensity: 0.8 }));
  matCache.set(def.id, m);
  return m;
}
const wreckMat = new THREE.MeshStandardMaterial({ color: 0x15130f, vertexColors: true, roughness: 0.97, metalness: 0.25, envMapIntensity: 0.2 });
const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
let blobMat;

// Returns the scene graph of one tank plus handles the simulation animates.
export function buildTankModel(def) {
  const geo = geometryFor(def), mat = materialFor(def), g = def.geo, style = def.nation === 'ru' || def.nation === 'cn' ? 'bar' : 'pad', tm = trackMaps(style);
  const root = new THREE.Group(), body = new THREE.Group(), turret = new THREE.Group(), gun = new THREE.Group(), gunRecoil = new THREE.Group();
  const mk = (ge, m) => { const o = new THREE.Mesh(ge, m); o.castShadow = true; o.receiveShadow = true; return o; };
  const hullMesh = mk(geo.hull, mat), turretMesh = mk(geo.turret, mat), gunMesh = mk(geo.gun, mat);
  const tracks = [1, -1].map((s) => {
    const tex = tm.map.clone(), nrm = tm.normal.clone(); tex.needsUpdate = true; nrm.needsUpdate = true;
    const m = dusty(new THREE.MeshStandardMaterial({ map: tex, normalMap: nrm, roughness: 0.82, metalness: 0.55, envMapIntensity: 0.45 }));
    const o = mk(geo.track, m); o.position.x = s * (g.W / 2 - g.trackW / 2); body.add(o);
    return { mesh: o, tex, nrm };
  });
  blobMat ||= new THREE.MeshBasicMaterial({ map: blobShadow(), color: 0x000000, transparent: true, depthWrite: false, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const blob = new THREE.Mesh(blobGeo, blobMat); blob.scale.set(g.W + 1.3, 1, g.L + 1.5); blob.position.y = 0.04; blob.renderOrder = 1; blob.userData.noAO = true; root.add(blob);
  body.add(hullMesh);
  turret.position.set(0, g.hullH, g.turret.z); turret.add(turretMesh);
  gun.position.set(0, g.gun.y, g.gun.z); gun.add(gunRecoil); gunRecoil.add(gunMesh);
  turret.add(gun); body.add(turret); root.add(body);
  return {
    root, body, turret, gun, gunRecoil, tracks, meshes: [hullMesh, turretMesh, gunMesh],
    setWreck() { for (const m of this.meshes) m.material = wreckMat; for (const t of tracks) t.mesh.material.color.setScalar(0.22); },
    dispose() { for (const t of tracks) { t.tex.dispose(); t.nrm.dispose(); t.mesh.material.dispose(); } },
  };
}
