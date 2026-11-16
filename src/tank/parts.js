// Shared building blocks for the tank models: running gear, the hull tub, skirts and the fittings that sit on top.
// Everything takes a GeoBuilder (hull, turret or gun space) and plain metric coordinates read off three-view drawings.
import * as THREE from 'three';
import { surf } from './geom.js';

export const RUBBER = surf([0.022, 0.022, 0.024], 1), STEEL = surf(0.34, 2), GUNMETAL = surf(0.15, 2), BARE = surf(0.55, 2), GLASS = surf([0.04, 0.075, 0.1], 3);
export const CANVAS = surf([0.17, 0.155, 0.105], 4), WOOD = surf([0.13, 0.085, 0.045], 4), LAMP = surf([0.3, 0.3, 0.27], 3), RED = surf([0.65, 0.05, 0.04], 4), AMBER = surf([0.9, 0.45, 0.05], 4), BLACK = surf(0.025, 4), OLIVE = surf([0.07, 0.08, 0.05], 4);
export const both = (fn) => { fn(1); fn(-1); };
export const mirror = (half) => [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _p = new THREE.Vector3();
const lerpPoly = (pl, z) => { if (z <= pl[0][0]) return pl[0][1]; for (let i = 1; i < pl.length; i++) if (z <= pl[i][0]) { const a = pl[i - 1], b = pl[i], t = (z - a[0]) / Math.max(1e-6, b[0] - a[0]); return a[1] + (b[1] - a[1]) * t; } return pl[pl.length - 1][1]; };

// ---------------------------------------------------------------- running gear
const TRACK_T = 0.07;
// Outer surface of the track as a closed (z, y) loop: ground run, round the front wheel, top run, round the rear wheel.
export function trackPath(gr) {
  const [zs, ys, rs0] = gr.spr, [zi, yi, ri0] = gr.idl, rs = rs0 + TRACK_T, ri = ri0 + TRACK_T, zf = gr.wz[0], zl = gr.wz[gr.wz.length - 1], pts = [[zl, 0], [zf, 0]];
  const g = Math.atan2(ys + rs - (yi + ri), zs - zi), top = g - Math.PI / 2;
  const fa = Math.atan2(-yi, zf - zi) + Math.acos(Math.min(1, ri / Math.hypot(yi, zf - zi)));
  for (let i = 0; i <= 7; i++) { const a = fa + ((top - fa) * i) / 7; pts.push([zi + ri * Math.cos(a), yi + ri * Math.sin(a)]); }
  const p0 = pts[pts.length - 1], p1 = [zs + rs * Math.cos(top), ys + rs * Math.sin(top)], sag = gr.sag ?? 0.035;
  for (const t of [0.25, 0.5, 0.75]) pts.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t - sag * (1 - Math.abs(t - 0.5) * 1.2)]);
  const ra = Math.atan2(-ys, zl - zs) - Math.acos(Math.min(1, rs / Math.hypot(ys, zl - zs))) + Math.PI * 2;
  for (let i = 0; i <= 7; i++) { const a = top + ((ra - top) * i) / 7; pts.push([zs + rs * Math.cos(a), ys + rs * Math.sin(a)]); }
  return pts;
}
// The same loop resampled for laying links: returns (s) => { z, y, ny, nz } with (ny, nz) the outward normal.
export function trackSampler(gr) {
  const pts = trackPath(gr), n = pts.length, cum = [0]; let cz = 0, cy = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); cz += a[0] / n; cy += a[1] / n; }
  const total = cum[n];
  const at = (s) => {
    s = ((s % total) + total) % total; let i = 0; while (i < n - 1 && cum[i + 1] < s) i++;
    const a = pts[i], b = pts[(i + 1) % n], L = cum[i + 1] - cum[i] || 1e-6, t = (s - cum[i]) / L, z = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
    let nz = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L; if ((z - cz) * nz + (y - cy) * ny < 0) { nz = -nz; ny = -ny; }
    return { z, y, ny, nz };
  };
  return { total, at };
}
// One track link, outer face on y = 0 with the body hanging inward (-y), running along z. style 'pad': rubber road pads; 'bar': steel grousers.
export function trackLink(B, w, pitch, style) {
  const T = TRACK_T, P = pitch * 0.94;
  B.box(w * 0.94, T * 0.5, P, 0, -T * 0.55, 0, { c: surf(0.1, 2) });
  both((s) => {
    if (style === 'pad') B.box(w * 0.36, T * 0.4, P * 0.78, s * w * 0.235, -T * 0.16, 0, { c: RUBBER });
    else { B.box(w * 0.4, T * 0.34, P * 0.3, s * w * 0.24, -T * 0.14, -P * 0.22, { c: surf(0.16, 2) }); B.box(w * 0.4, T * 0.34, P * 0.3, s * w * 0.24, -T * 0.14, P * 0.22, { c: surf(0.16, 2) }); }
    B.box(0.045, T * 0.8, P * 0.62, s * w * 0.485, -T * 0.5, 0, { c: surf(0.14, 2) });                      // end connector
  });
  B.box(w * 0.98, 0.026, 0.026, 0, -T * 0.55, P / 2, { c: surf(0.13, 2) });                                 // hinge pin
  B.box(0.05, 0.085, pitch * 0.42, 0, -T - 0.035, 0, { c: surf(0.16, 2) });                                  // guide horn
}
// One road-wheel station: a pair of rubber-tyred discs. style: 'rib' (stamped ribs, eastern), 'hole' (lightening holes), 'dish' (plain bolted dish).
function roadWheel(H, r, w, x, y, z, s, style, n) {
  const t = r * 0.12, xo = x + s * w * 0.2, xi = x - s * w * 0.2, ww = w * 0.27;
  for (const [xx, outer] of [[xo, true], [xi, false]]) {
    H.lathe([[r - t, -ww / 2], [r - 0.012, -ww / 2], [r, -ww / 2 + 0.012], [r, ww / 2 - 0.012], [r - 0.012, ww / 2], [r - t, ww / 2]], xx, y, z, s, RUBBER, 24);
    if (!outer) { H.cyl(r - t, ww * 0.8, xx, y, z, { axis: 'x', seg: 14, c: 0.6 }); continue; }
    H.lathe([[r - t, ww / 2 - 0.004], [r - t - 0.012, ww / 2 - 0.016], [r * 0.56, ww / 2 - (style === 'dish' ? 0.045 : 0.03)], [r * 0.4, ww / 2 - 0.026], [r * 0.3, ww / 2 + 0.006], [r * 0.2, ww / 2 + 0.024], [r * 0.12, ww / 2 + 0.03], [0, ww / 2 + 0.03]], xx, y, z, s, 0.95, 24);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + 0.2, ca = Math.cos(a), sa = Math.sin(a);
      if (style === 'rib') H.box(0.022, 0.03, r * 0.3, xx + s * (ww / 2 - 0.026), y + sa * r * 0.6, z + ca * r * 0.6, { rx: -a, c: 0.9 });
      else if (style === 'hole') H.cyl(r * 0.075, 0.01, xx + s * (ww / 2 - 0.03), y + sa * r * 0.62, z + ca * r * 0.62, { axis: 'x', seg: 8, c: BLACK });
      H.cyl(0.012, 0.016, xx + s * (ww / 2 + 0.004), y + sa * r * 0.34, z + ca * r * 0.34, { axis: 'x', seg: 5, c: 0.8 });
    }
  }
  H.cyl(r * 0.2, w * 0.5, x, y, z, { axis: 'x', seg: 8, c: GUNMETAL });
}
// gr: { wz: [front..rear], wr, wy?, spr: [z, y, r], idl: [z, y, r], rol?: [z...], rolY?, style, n, teeth? }
export function runningGear(H, gr, xr, tw) {
  const wy = gr.wy ?? gr.wr + TRACK_T + 0.005;
  both((s) => {
    for (const z of gr.wz) {
      roadWheel(H, gr.wr, tw, s * xr, wy, z, s, gr.style || 'dish', gr.n || 8);
      H.box(0.09, 0.11, gr.wr * 1.3, s * (xr - tw * 0.52), wy + gr.wr * 0.42, z - gr.wr * 0.55, { rx: 0.62, c: GUNMETAL });                   // swing arm
    }
    for (const z of gr.rol || []) H.cyl(0.1, tw * 0.55, s * xr, gr.rolY - 0.1 - TRACK_T, z, { axis: 'x', seg: 10, c: RUBBER });
    const [zs, ys, rs] = gr.spr, [zi, yi, ri] = gr.idl, nt = gr.teeth || 12;
    // drive sprocket: two toothed rings on a drum with a bolted hub
    H.cyl(rs * 0.62, tw * 0.6, s * xr, ys, zs, { axis: 'x', seg: 14, c: 0.6 });
    for (const dx of [0.2, -0.2]) { H.cyl(rs * 0.9, 0.035, s * xr + s * dx * tw, ys, zs, { axis: 'x', seg: 20, c: STEEL }); for (let k = 0; k < nt; k++) { const a = (k / nt) * Math.PI * 2; H.box(0.035, 0.085, 0.075, s * xr + s * dx * tw, ys + Math.sin(a) * rs * 0.97, zs + Math.cos(a) * rs * 0.97, { rx: -a, c: BARE }); } }
    H.lathe([[rs * 0.62, 0], [rs * 0.5, 0.06], [rs * 0.3, 0.08], [rs * 0.22, 0.12], [0, 0.13]], s * (xr + tw * 0.3), ys, zs, s, 0.8, 14);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; H.cyl(0.016, 0.02, s * (xr + tw * 0.3 + 0.07), ys + Math.sin(a) * rs * 0.4, zs + Math.cos(a) * rs * 0.4, { axis: 'x', seg: 5, c: STEEL }); }
    // idler: spoked steel wheel
    for (const dx of [0.24, -0.24]) H.lathe([[ri * 0.8, -0.05], [ri, -0.05], [ri, 0.05], [ri * 0.8, 0.05]], s * xr + s * dx * tw, yi, zi, s, STEEL, 18);
    H.lathe([[ri * 0.82, 0.02], [ri * 0.5, 0.0], [ri * 0.3, 0.04], [ri * 0.2, 0.09], [0, 0.1]], s * (xr + tw * 0.26), yi, zi, s, 0.78, 14);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; H.cyl(ri * 0.1, 0.012, s * (xr + tw * 0.26 + 0.012), yi + Math.sin(a) * ri * 0.62, zi + Math.cos(a) * ri * 0.62, { axis: 'x', seg: 7, c: BLACK }); }
    H.cyl(ri * 0.2, tw * 0.6, s * xr, yi, zi, { axis: 'x', seg: 8, c: GUNMETAL });
  });
}

// ---------------------------------------------------------------- hull tub
// hs: { top: [[z, y]...] roof line rear→front, bot: [[z, y]...] belly line, hw: tub half-width, wo: outer half-width,
//       spY: underside of the sponsons, spTop: number | (z) => y, rw: half-width of the raised centre roof, sp: [zRear, zFront] of the sponsons }
export function hullBody(H, hs) {
  const roofAt = (z) => lerpPoly(hs.top, z), bellyAt = (z) => lerpPoly(hs.bot, z), spTop = typeof hs.spTop === 'function' ? hs.spTop : () => hs.spTop;
  const zr = hs.top[0][0], zf = hs.top[hs.top.length - 1][0], set = new Set([zr, zf, hs.sp[0], hs.sp[1], hs.sp[1] + 0.02, ...(hs.cuts || [])]);
  for (const p of [...hs.top, ...hs.bot]) set.add(p[0]);
  const zs = [...set].map((v) => +v.toFixed(3)).filter((z, i, a) => a.indexOf(z) === i && z >= zr - 1e-6 && z <= zf + 1e-6).sort((a, b) => a - b);
  const secs = zs.map((z) => {
    const r = roofAt(z), b = Math.min(bellyAt(z), r - 0.02), wide = z >= hs.sp[0] - 1e-6 && z <= hs.sp[1] + 1e-6, ws = wide ? hs.wo : hs.hw, sy = Math.max(b, Math.min(hs.spY, r - 0.04)), st = Math.max(sy, Math.min(spTop(z), r)), rw = Math.min(hs.rw ?? ws, ws);
    return { z, pts: mirror([[0, b], [hs.hw, b], [hs.hw, sy], [ws, sy], [ws, st], [rw, st], [Math.max(hs.hw * 0.7, rw - (r - st) * 0.35), r], [0, r]]) };
  });
  H.sections(secs, 1, { color: hs.color });
  return { roofAt, bellyAt, spTop };
}
// Track guards ahead of / behind the sponsons, with a turned-down nose and rubber mud flaps.
export function fenders(H, hs, o = {}) {
  const x = (hs.wo + hs.hw) / 2 + 0.01, w = hs.wo - hs.hw + 0.02, y = hs.spY + 0.03, zf = o.zf, zr = o.zr;
  both((s) => {
    if (zf > hs.sp[1] + 0.05) { H.box(w, 0.03, zf - hs.sp[1], s * x, y, (zf + hs.sp[1]) / 2, { c: 0.94 }); H.box(0.03, 0.09, zf - hs.sp[1], s * (hs.wo), y - 0.03, (zf + hs.sp[1]) / 2, { c: 0.9 }); }
    if (o.nose !== false) { H.box(w, 0.03, 0.24, s * x, y - 0.07, zf + 0.1, { rx: 0.6, c: 0.92 }); H.box(w - 0.02, o.flap ?? 0.22, 0.022, s * x, y - 0.14 - (o.flap ?? 0.22) / 2, zf + 0.2, { rx: -0.1, c: RUBBER }); }
    if (zr !== undefined) { if (zr < hs.sp[0] - 0.05) H.box(w, 0.03, hs.sp[0] - zr, s * x, y, (zr + hs.sp[0]) / 2, { c: 0.94 }); H.box(w - 0.02, o.rflap ?? 0.42, 0.022, s * x, y - (o.rflap ?? 0.42) / 2, zr - 0.02, { c: RUBBER }); }
  });
}
// Rounded mudguard wrapping the front (or rear) of a track: an arc of plate about (zc, yc), a0 → a1 in degrees from +z toward +y.
export function mudguard(H, x, w, zc, yc, r, a0, a1, c = 0.95, t = 0.025) {
  const n = 9, o = [], i = [];
  for (let k = 0; k <= n; k++) { const a = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180; o.push([zc + Math.cos(a) * r, yc + Math.sin(a) * r]); i.push([zc + Math.cos(a) * (r - t), yc + Math.sin(a) * (r - t)]); }
  H.slab([...o, ...i.reverse()], x - w / 2, x + w / 2, 'x', c);
  for (const sx of [-1, 1]) { const q = o.map(([z, y]) => [z, y]); H.slab([...q, [zc, yc + r * 0.25]], x + sx * (w / 2) - (sx > 0 ? 0.02 : 0), x + sx * (w / 2) + (sx > 0 ? 0 : 0.02), 'x', typeof c === 'number' ? c - 0.04 : c); }
}
// Side skirts: panels = [[z0, z1, yTop, yBot, thick, colour, opts]]; opts.wave gives the scalloped lower edge of eastern rubber skirts,
// opts.rail a hinge rail along the top, opts.bolts a row of bolt heads, opts.inset pulls the panel in from the hull edge.
export function skirts(H, xo, panels) {
  both((s) => { for (const [z0, z1, yt, yb, t, c, o = {}] of panels) {
    const x0 = s * (xo + (o.dx || 0)), x1 = s * (xo + (o.dx || 0) + t), w = o.wave || 0;
    if (w) H.slab([[z0 + 0.012, yt], [z1 - 0.012, yt], [z1 - 0.012, yb + w], [(z0 + z1) / 2 + (z1 - z0) * (o.flat ?? 0.1), yb], [(z0 + z1) / 2 - (z1 - z0) * (o.flat ?? 0.1), yb], [z0 + 0.012, yb + w]], Math.min(x0, x1), Math.max(x0, x1), 'x', c);
    else H.box(t, yt - yb, z1 - z0 - (o.gap ?? 0.025), (x0 + x1) / 2, (yt + yb) / 2, (z0 + z1) / 2, { c });
    if (o.rail) H.box(0.03, 0.035, z1 - z0 - 0.06, x1 + s * 0.01, yt - 0.04, (z0 + z1) / 2, { c: STEEL });
    if (o.bolts) for (let k = 0; k < o.bolts; k++) for (const yy of [yt - 0.07, yb + 0.07 + w]) H.cyl(0.018, 0.02, x1, yy, z0 + ((z1 - z0) * (k + 0.5)) / o.bolts, { axis: 'x', seg: 5, c: 0.7 });
    if (o.handle) H.box(0.02, 0.025, 0.2, x1 + s * 0.02, (yt + yb) / 2 + 0.05, (z0 + z1) / 2, { c: STEEL });
  } });
}

// ---------------------------------------------------------------- generic fittings
// A grid of tiles (reactive armour, appliqué plates) on the parallelogram p0 + s·u + t·v.
export function tiles(B, p0, u, v, nu, nv, thick, c, o = {}) {
  _x.set(...u); _z.set(...v); const lu = _x.length(), lv = _z.length(); _x.normalize(); _z.normalize(); _y.crossVectors(_z, _x).normalize(); if (o.flip) _y.negate();
  const g = new THREE.BoxGeometry(lu / nu - (o.gap ?? 0.025), thick, lv / nv - (o.gap ?? 0.025));
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    if (o.skip && o.skip(i, j)) continue;
    _p.set(...p0).addScaledVector(_x, (lu * (i + 0.5)) / nu).addScaledVector(_z, (lv * (j + 0.5)) / nv).addScaledVector(_y, thick / 2 + (o.lift || 0));
    _m.makeBasis(_x, _y, _z).setPosition(_p); B.addGeometry(g, _m.clone(), typeof c === 'number' ? c - ((i * 7 + j * 3) % 3) * 0.03 : c);
  }
  g.dispose();
}
export function grille(H, x, y, z, sx, sz, slats = 7, o = {}) {
  H.box(sx, 0.02, sz, x, y + 0.008, z, { c: BLACK });
  if (o.mesh) { for (let i = 0; i <= slats; i++) H.box(sx, 0.014, 0.014, x, y + 0.03, z - sz / 2 + (sz * i) / slats, { c: STEEL }); const m = Math.round((slats * sx) / sz); for (let i = 0; i <= m; i++) H.box(0.014, 0.014, sz, x - sx / 2 + (sx * i) / m, y + 0.032, z, { c: STEEL }); }
  else for (let i = 0; i < slats; i++) H.box(sx - 0.04, 0.03, (sz / slats) * 0.55, x, y + 0.03, z - sz / 2 + (sz * (i + 0.5)) / slats, { rx: 0.45, c: 0.62 });
  for (const k of [-1, 1]) { H.box(sx + 0.04, 0.045, 0.03, x, y + 0.028, z + (k * sz) / 2, { c: 0.85 }); H.box(0.03, 0.045, sz + 0.04, x + (k * sx) / 2, y + 0.028, z, { c: 0.85 }); }
}
export function fanGrille(H, x, y, z, r) { H.cyl(r, 0.02, x, y + 0.01, z, { seg: 24, c: BLACK }); for (let i = 1; i <= 4; i++) { const g = new THREE.TorusGeometry((r * i) / 4.3, 0.012, 4, 24); g.rotateX(Math.PI / 2); H.addGeometry(g, H.xf(x, y + 0.03, z), STEEL); g.dispose(); } for (let k = 0; k < 4; k++) H.box(r * 2, 0.02, 0.02, x, y + 0.035, z, { ry: (k * Math.PI) / 4, c: STEEL }); H.cyl(r + 0.03, 0.03, x, y + 0.012, z, { seg: 24, open: true, c: 0.85 }); }
// Bar ("slat") armour panel between two corners; either x or z is constant.
export function slat(B, x0, x1, y0, y1, z0, z1, n = 7, c = GUNMETAL) {
  for (let i = 0; i < n; i++) { const y = y0 + ((y1 - y0) * i) / (n - 1); B.box(Math.abs(x1 - x0) + 0.02, 0.018, Math.abs(z1 - z0) + 0.02, (x0 + x1) / 2, y, (z0 + z1) / 2, { c }); }
  const m = Math.max(2, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0)) / 0.55)); for (let i = 0; i <= m; i++) B.box(0.028, y1 - y0 + 0.03, 0.028, x0 + ((x1 - x0) * i) / m, (y0 + y1) / 2, z0 + ((z1 - z0) * i) / m, { c: STEEL });
}
export function hatch(B, x, y, z, r = 0.3, o = {}) {
  B.cyl(r + 0.05, 0.045, x, y + 0.022, z, { seg: 18, c: 0.82 }); B.cyl(r, 0.04, x, y + 0.062, z, { seg: 18, c: 0.95 }); B.cyl(r * 0.5, 0.012, x, y + 0.088, z, { seg: 10, c: 0.86 });
  B.box(0.09, 0.035, 0.16, x + (o.hx ?? 0), y + 0.095, z - r * 0.92, { c: STEEL }); B.box(0.03, 0.03, 0.14, x + r * 0.55, y + 0.095, z + r * 0.2, { c: STEEL });
  for (let k = 0; k < (o.blocks || 0); k++) { const a = (k / o.blocks) * Math.PI * 2 + (o.a0 ?? 0.3), sx = Math.sin(a), cz = Math.cos(a); B.box(0.17, 0.085, 0.07, x + sx * (r + 0.11), y + 0.09, z + cz * (r + 0.11), { ry: a, c: 0.78 }); B.box(0.135, 0.05, 0.012, x + sx * (r + 0.148), y + 0.095, z + cz * (r + 0.148), { ry: a, c: GLASS }); }
}
export function driverHatch(H, x, y, z, o = {}) {
  const r = o.r || 0.29;
  if (o.square) { H.box(r * 2, 0.045, r * 1.7, x, y + 0.02, z, { c: 0.95 }); H.box(r * 1.4, 0.02, r * 1.1, x, y + 0.05, z, { c: 0.86 }); } else { H.cyl(r, 0.045, x, y + 0.02, z, { seg: 16, c: 0.95 }); H.cyl(r * 0.55, 0.014, x, y + 0.05, z, { seg: 10, c: 0.86 }); }
  for (const k of o.scopes ?? [-1, 0, 1]) { H.box(0.22, 0.075, 0.08, x + k * 0.25, y + 0.05, z + r + 0.03 - Math.abs(k) * 0.07, { ry: -k * 0.5, c: 0.75 }); H.box(0.18, 0.045, 0.012, x + k * 0.265, y + 0.055, z + r + 0.072 - Math.abs(k) * 0.07, { ry: -k * 0.5, c: GLASS }); }
}
export function headlight(H, x, y, z, s, o = {}) {
  H.cyl(0.08, 0.12, x, y, z, { axis: 'z', seg: 12, c: 0.55 }); H.cyl(0.068, 0.012, x, y, z + 0.062, { axis: 'z', seg: 12, c: LAMP });
  if (o.pair) { H.cyl(0.06, 0.1, x - s * 0.19, y, z, { axis: 'z', seg: 10, c: 0.5 }); H.cyl(0.05, 0.012, x - s * 0.19, y, z + 0.052, { axis: 'z', seg: 10, c: surf([0.25, 0.3, 0.3], 3) }); }
  if (o.guard !== false) { H.box(o.pair ? 0.46 : 0.26, 0.02, 0.2, x - (o.pair ? s * 0.09 : 0), y + 0.115, z, { c: 0.8 }); for (const k of [-1, 1]) H.box(0.02, 0.23, 0.2, x - (o.pair ? s * 0.09 : 0) + k * (o.pair ? 0.23 : 0.13), y + 0.01, z, { c: 0.8 }); }
}
export function towHook(H, x, y, z, dir = 1) { H.box(0.07, 0.2, 0.16, x, y, z, { c: STEEL }); const g = new THREE.TorusGeometry(0.075, 0.022, 5, 10); g.rotateY(Math.PI / 2); H.addGeometry(g, H.xf(x, y - 0.08, z + dir * 0.09), GUNMETAL); g.dispose(); }
export function tailLights(H, x, y, z) { both((s) => { H.box(0.2, 0.09, 0.04, s * x, y, z, { c: 0.5 }); H.box(0.07, 0.055, 0.02, s * x - 0.05, y, z - 0.025, { c: RED }); H.box(0.07, 0.055, 0.02, s * x + 0.05, y, z - 0.025, { c: AMBER }); }); }
// A tow cable draped along a polyline.
export function cable(B, pts, r = 0.018) { for (let i = 0; i < pts.length - 1; i++) { const a = new THREE.Vector3(...pts[i]), b = new THREE.Vector3(...pts[i + 1]), d = b.clone().sub(a), g = new THREE.CylinderGeometry(r, r, d.length(), 5, 1, true); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())); B.addGeometry(g, B.xf((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), GUNMETAL); g.dispose(); } const e = pts[pts.length - 1]; B.box(0.06, 0.05, 0.14, e[0], e[1], e[2], { c: STEEL }); B.box(0.06, 0.05, 0.14, pts[0][0], pts[0][1], pts[0][2], { c: STEEL }); }
export function fuelDrums(H, zr, y, r = 0.3, len = 0.95, o = {}) {
  both((s) => { const x = s * (o.x ?? 0.62), z = zr - r - (o.gap ?? 0.1);
    H.cyl(r, len, x, y, z, { axis: 'x', seg: 18, c: 0.96 }); for (const k of [-0.3, 0, 0.3]) H.cyl(r + 0.012, 0.035, x + k * len, y, z, { axis: 'x', seg: 18, c: 0.8 });
    for (const k of [-0.28, 0.28]) { H.box(0.05, 0.04, r + 0.2, x + k * len, y - r * 0.2, zr - (o.gap ?? 0.1) / 2 - r * 0.4, { c: STEEL }); H.box(0.04, r * 2.1, 0.02, x + k * len, y, z, { c: STEEL }); }
    H.cyl(0.05, 0.05, x, y + r, z, { seg: 8, c: STEEL }); });
}
// A stowage box with a lipped lid, hinges and latches.
export function bin(B, sx, sy, sz, x, y, z, o = {}) {
  B.box(sx, sy, sz, x, y, z, { ...o, c: o.c ?? 0.93 }); const up = new THREE.Vector3(0, sy / 2, 0).applyEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'));
  B.box(sx + 0.025, 0.03, sz + 0.025, x + up.x, y + up.y + 0.012, z + up.z, { ...o, c: (o.c ?? 0.93) - 0.07 });
  if (o.latch !== false && sz > 0.25) for (const k of [-0.3, 0.3]) B.box(0.02, 0.07, 0.035, x + Math.sign(o.face ?? 1) * (sx / 2 + 0.008), y + sy / 2 - 0.05, z + k * sz, { c: STEEL });
}
export function basket(B, zr, w, y0, h, d, o = {}) {
  const c = o.c ?? STEEL, t = 0.022;
  B.box(w * 2, 0.02, d, 0, y0, zr - d / 2, { c: surf(0.2, 2) });
  for (let k = 0; k <= 2; k++) { B.box(w * 2, t, t, 0, y0 + (h * k) / 2, zr - d, { c }); both((s) => B.box(t, t, d, s * w, y0 + (h * k) / 2, zr - d / 2, { c })); }
  both((s) => { for (let k = 1; k <= 3; k++) B.box(t, h, t, s * w, y0 + h / 2, zr - (d * k) / 3, { c }); });
  for (let k = -4; k <= 4; k++) B.box(t, h, t, (k * w) / 4, y0 + h / 2, zr - d, { c });
  if (o.kit !== false) { B.box(w * 0.7, h * 0.78, d * 0.72, -w * 0.52, y0 + h * 0.42, zr - d / 2, { c: CANVAS }); B.box(w * 0.5, h * 0.55, d * 0.62, w * 0.55, y0 + h * 0.3, zr - d / 2, { c: OLIVE }); B.cyl(0.14, w * 0.8, w * 0.05, y0 + h * 0.86, zr - d / 2, { axis: 'x', seg: 10, c: surf([0.13, 0.12, 0.085], 4) }); for (const k of [-0.25, 0.25]) B.cyl(0.146, 0.03, w * 0.05 + k * w, y0 + h * 0.86, zr - d / 2, { axis: 'x', seg: 10, c: BLACK }); }
}
export function antenna(B, x, y, z, h = 1.6) { B.cyl(0.045, 0.1, x, y + 0.05, z, { seg: 8, c: 0.55 }); B.cyl(0.024, 0.14, x, y + 0.17, z, { seg: 6, c: GUNMETAL }); B.cyl(0.006, h, x, y + 0.24 + h / 2, z, { seg: 4, c: BLACK }); }
export function windSensor(B, x, y, z, h = 0.5) { B.cyl(0.018, h, x, y + h / 2, z, { seg: 6, c: 0.6 }); B.cyl(0.045, 0.11, x, y + h + 0.05, z, { seg: 8, c: 0.75 }); }
// Machine gun on a pintle / cradle, barrel along +z. kind: 'hmg' (12.7 mm, long with ammo box) or 'mg' (7.62 mm).
export function mg(B, x, y, z, kind = 'hmg', o = {}) {
  const k = B.mark(), h = kind === 'hmg', L = h ? 1.05 : 0.6;
  B.box(0.09, 0.11, h ? 0.5 : 0.36, 0, 0, 0, { c: GUNMETAL }); B.cyl(h ? 0.019 : 0.014, L, 0, 0.01, (h ? 0.25 : 0.18) + L / 2, { axis: 'z', seg: 6, c: surf(0.09, 2) });
  if (h) { B.cyl(0.03, 0.4, 0, 0.01, 0.45, { axis: 'z', seg: 7, c: GUNMETAL }); B.cyl(0.028, 0.1, 0, 0.01, 0.25 + L, { axis: 'z', seg: 6, c: surf(0.07, 2) }); B.box(0.2, 0.2, 0.3, o.boxSide === -1 ? 0.16 : -0.16, -0.03, 0.02, { c: OLIVE }); B.box(0.03, 0.03, 0.2, 0.05, 0, -0.34, { c: GUNMETAL }); B.box(0.03, 0.03, 0.2, -0.05, 0, -0.34, { c: GUNMETAL }); }
  else { B.box(0.12, 0.13, 0.2, -0.11, -0.02, 0.0, { c: OLIVE }); B.box(0.04, 0.09, 0.2, 0, -0.03, -0.27, { c: GUNMETAL }); }
  B.cyl(0.035, o.post ?? 0.22, 0, -(o.post ?? 0.22) / 2 - 0.04, 0, { seg: 6, c: STEEL }); B.box(0.16, 0.05, 0.1, 0, -0.06, 0, { c: STEEL });
  B.xform(k, new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-(o.pitch ?? 0.06), o.yaw || 0, 0, 'YXZ')).setPosition(x, y + (o.post ?? 0.22) + 0.06, z));
}
// Remote weapon station: pedestal, cradle with sensor head, heavy MG.
export function rws(B, x, y, z, o = {}) {
  B.cyl(0.17, 0.12, x, y + 0.06, z, { seg: 12, c: 0.86 }); B.cyl(0.11, 0.2, x, y + 0.2, z, { seg: 10, c: 0.8 });
  both((s) => B.box(0.05, 0.3, 0.28, x + s * 0.14, y + 0.42, z, { c: 0.82 }));
  B.box(0.2, 0.2, 0.26, x + 0.3, y + 0.42, z + 0.02, { c: 0.78 }); B.box(0.15, 0.13, 0.012, x + 0.3, y + 0.43, z + 0.152, { c: GLASS });
  mg(B, x, y + 0.4, z + 0.02, o.kind || 'hmg', { post: 0.0, boxSide: 1, pitch: o.pitch ?? 0.03 });
}
// Stabilised panoramic sight: armoured drum on a pedestal with a glazed window.
export function panoSight(B, x, y, z, h = 0.42, r = 0.15, o = {}) {
  B.cyl(r * 1.25, 0.06, x, y + 0.03, z, { seg: 14, c: 0.86 }); B.cyl(r * 0.95, h * 0.5, x, y + 0.06 + h * 0.25, z, { seg: 14, c: 0.93 });
  if (o.round) { B.cyl(r, h * 0.5, x, y + 0.06 + h * 0.75, z, { seg: 14, c: 0.9 }); B.box(r * 1.2, h * 0.34, 0.03, x, y + 0.06 + h * 0.75, z + r * 0.94, { c: GLASS }); B.cyl(r * 1.02, 0.03, x, y + 0.07 + h, z, { seg: 14, c: 0.8 }); }
  else { B.box(r * 2.1, h * 0.52, r * 2.0, x, y + 0.06 + h * 0.76, z, { c: 0.9 }); B.box(r * 1.55, h * 0.36, 0.014, x, y + 0.06 + h * 0.76, z + r + 0.004, { c: GLASS }); B.box(r * 2.25, 0.028, r * 2.25, x, y + 0.075 + h * 1.02, z, { c: 0.8 }); both((s) => B.box(0.02, h * 0.5, r * 0.5, x + s * r * 1.06, y + 0.06 + h * 0.76, z + r * 0.9, { ry: s * 0.25, c: 0.78 })); }
}
// Armoured sight housing with a glazed front and open doors.
export function sightBox(B, x, y, z, sx = 0.4, sy = 0.26, sz = 0.55, o = {}) {
  B.box(sx, sy, sz, x, y + sy / 2, z, { c: 0.94 }); B.box(sx + 0.03, 0.03, sz * 0.55, x, y + sy + 0.012, z + sz * 0.26, { c: 0.82 });
  B.box(sx * 0.76, sy * 0.64, 0.014, x, y + sy / 2, z + sz / 2 + 0.006, { c: GLASS }); both((s) => B.box(0.02, sy * 0.86, sz * 0.26, x + s * (sx * 0.5 + 0.05), y + sy / 2, z + sz / 2 + 0.03, { ry: s * 0.7, c: 0.8 }));
  if (o.rear) B.box(sx * 0.8, sy * 0.7, sz * 0.5, x, y + sy * 0.35, z - sz * 0.7, { c: 0.9 });
}
// Smoke-grenade dischargers. kind 'row': a fanned row of tubes on a bracket; 'cluster': 2-row block (eastern 902 / western M250).
export function smoke(B, x, y, z, n, dir, o = {}) {
  const rows = o.rows || 1, per = Math.ceil(n / rows), el = o.el ?? 0.5, r = o.r ?? 0.042, len = o.len ?? 0.26, pitch = o.pitch ?? 0.115;
  B.box(0.06, 0.13 * rows + 0.05, per * pitch + 0.04, x - dir * 0.02, y + (rows - 1) * 0.06, z - (per - 1) * pitch * 0.5, { c: 0.75 });
  for (let i = 0; i < n; i++) { const k = i % per, row = Math.floor(i / per), yy = y + row * 0.125, zz = z - k * pitch, yw = -dir * ((o.yaw0 ?? 0.15) + (o.fan || 0) * k);
    B.cyl(r, len, x + dir * (0.03 + len * 0.42 * Math.cos(el)), yy + len * 0.42 * Math.sin(el), zz + Math.sin(-yw * dir) * 0.0, { axis: 'x', seg: 9, rz: dir * el, ry: yw, c: 0.68 });
    B.cyl(r * 0.8, 0.012, x + dir * (0.03 + len * 0.93 * Math.cos(el)), yy + len * 0.93 * Math.sin(el), zz, { axis: 'x', seg: 8, rz: dir * el, ry: yw, c: o.cap ?? BLACK }); }
}
// Gun barrel built in gun space (trunnion at the origin, bore along +z). g: { len, r, evac?, sleeve?, mrs?, brake?, taper? }
export function barrel(G, g, z0) {
  const r = g.r, len = g.len, n = g.sleeve ?? 4, ev = g.evac ? len * g.evac : 0, c0 = g.c ?? 0.92;
  G.cyl(r * 1.7, 0.5, 0, 0, z0 + 0.25, { axis: 'z', seg: 16, r2: r * 1.45, c: c0 - 0.06 });
  const za = z0 + 0.5, zb = len - 0.28, sl = (zb - za) / n;
  for (let i = 0; i < n; i++) { const ra = r * (1.3 - i * (g.taper ?? 0.05)); G.cyl(ra, sl - 0.02, 0, 0, za + sl * (i + 0.5), { axis: 'z', seg: 16, r2: ra - r * 0.03, c: c0 - (i % 2) * 0.035 }); G.cyl(ra + 0.01, 0.03, 0, 0, za + sl * i, { axis: 'z', seg: 16, c: 0.7 }); if (g.straps) for (const t of [0.33, 0.66]) G.cyl(ra + 0.004, 0.018, 0, 0, za + sl * (i + t), { axis: 'z', seg: 16, c: 0.78 }); }
  if (ev) { const k = G.mark(), el = g.evacLen ?? 0.9; G.lathe([[r * 1.3, -el / 2], [r * 1.9, -el / 2 + 0.1], [r * 1.95, el / 2 - 0.12], [r * 1.3, el / 2]], 0, 0, 0, 1, c0 + 0.02, 16); G.xform(k, new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(0, 0, ev)); }
  G.cyl(r * 1.22, 0.28, 0, 0, len - 0.14, { axis: 'z', seg: 16, c: 0.78 }); G.cyl(r * 1.3, 0.03, 0, 0, len - 0.015, { axis: 'z', seg: 16, c: 0.7 }); G.cyl(r * 0.82, 0.02, 0, 0, len + 0.004, { axis: 'z', seg: 14, c: BLACK });
  if (g.mrs !== false) { const side = g.mrs === 'side'; G.box(0.1, 0.085, 0.13, side ? r * 1.5 : 0, side ? 0 : r * 1.5, len - 0.2, { c: 0.6 }); G.box(0.06, 0.05, 0.012, side ? r * 1.5 : 0, side ? 0 : r * 1.5, len - 0.27, { c: GLASS }); }
}
