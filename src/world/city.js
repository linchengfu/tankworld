// Lujiazui, Pudong, compressed into a 600 m square. Century Avenue runs east-west through the middle (z = 0),
// the Huangpu wraps the west and north edges. +x is east, +z is south.
import * as THREE from 'three';
import { makeRng, TAU } from '../core/util.js';
import { GeoBuilder } from '../tank/geom.js';
import { FacadeBatch, rectPts, ngon } from './batch.js';
import { Colliders } from './collide.js';
import { Props } from './props.js';
import * as TX from '../gfx/textures.js';
import * as LM from './landmarks.js';
import { wetGround } from '../gfx/wet.js';

export const MAP = 300;
export const ROUND = { x: -130, z: 0, r: 50 };
export const CAP = { x: 0, z: 0, r: 22 };
// roads: [centre, width, name, pinyin]
export const RX = [[-240, 16, '滨江大道', 'BINJIANG AVE'], [-130, 20, '陆家嘴西路', 'LUJIAZUI W RD'], [0, 24, '银城中路', 'YINCHENG M RD'], [130, 20, '东泰路', 'DONGTAI RD'], [240, 20, '浦东南路', 'PUDONG S RD']];
export const RZ = [[-220, 16, '丰和路', 'FENGHE RD'], [-110, 20, '陆家嘴环路', 'LUJIAZUI RING RD'], [0, 40, '世纪大道', 'CENTURY AVE'], [110, 20, '花园石桥路', 'HUAYUAN SHIQIAO RD'], [220, 16, '张杨路', 'ZHANGYANG RD']];
const XI = [[-300, -248], [-232, -140], [-120, -12], [12, 120], [140, 230], [250, 300]];
const ZI = [[-300, -228], [-212, -120], [-100, -20], [20, 100], [120, 212], [228, 300]];
const CURB = 0.15;
const CAR_COLORS = [0xe8e8e6, 0x1c1d20, 0x9aa0a6, 0x5c6066, 0x8f1d1d, 0x1d3f7a, 0x1a8f8a, 0xc9a227, 0xf2f2f0, 0x30343a, 0x2e7d4f];
const FIRMS = ['浦江银行', '申城金融', '东海证券', '沪信大厦', '江南保险', '远东国际', '黄浦置业', '华东电力', '长江航运', '海上明珠酒店'];

export function buildCity(scene) {
  const rng = makeRng(20261116);
  const C = {
    fac: Array.from({ length: TX.FACADE_COUNT }, () => new FacadeBatch(12, 12)), shop: [new FacadeBatch(24, 5.2), new FacadeBatch(24, 5.2)],
    conc: new GeoBuilder(), pearl: new GeoBuilder(), steel: new GeoBuilder(), white: new GeoBuilder(), grass: new GeoBuilder(), far: new GeoBuilder(),
    pave: new GeoBuilder(), plaza: new GeoBuilder(), wood: new GeoBuilder(), marks: new GeoBuilder(), water: new GeoBuilder(),
    col: new Colliders(MAP - 3), map: { rects: [], circles: [], blocks: [] }, labels: [], raised: { rects: [], discs: [] }, plates: [],
    roof(pts, y, c) {
      const n = pts.length, Y = (i) => (Array.isArray(y) ? y[i] : y); let cx = 0, cz = 0, cy = 0;
      for (let i = 0; i < n; i++) { cx += pts[i][0]; cz += pts[i][1]; cy += Y(i); } cx /= n; cz /= n; cy /= n;
      const ctr = new THREE.Vector3(cx, cy, cz), k = [c, c, c];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, a = new THREE.Vector3(pts[i][0], Y(i), pts[i][1]), b = new THREE.Vector3(pts[j][0], Y(j), pts[j][1]);
        const up = (a.z - ctr.z) * (b.x - ctr.x) - (a.x - ctr.x) * (b.z - ctr.z) > 0;
        if (up) this.conc.tri(ctr, a, b, k); else this.conc.tri(ctr, b, a, k);
      }
    },
  };
  const props = new Props(scene);
  const fires = [], plumes = [];

  // ------------------------------------------------------------ helpers
  const nearRoadX = (x, pad) => RX.some(([c, w]) => Math.abs(x - c) < w / 2 + pad);
  const nearRoadZ = (z, pad) => RZ.some(([c, w]) => Math.abs(z - c) < w / 2 + pad);
  const inRound = (x, z, r = ROUND.r) => Math.hypot(x - ROUND.x, z - ROUND.z) < r;
  const inSpawn = (x, z) => (Math.abs(x + 130) < 16 && z > 196) || (Math.abs(x - 130) < 16 && z < -196);

  // raised slab with an optional bite taken out by the roundabout
  function slab(B, x0, x1, z0, z1, c = 1) {
    let pts = rectPts(x0, x1, z0, z1);
    const k = pts.findIndex(([x, z]) => inRound(x, z));
    if (k >= 0) {
      const edgePt = (a, b) => { let lo = 0, hi = 1; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2, x = a[0] + (b[0] - a[0]) * m, z = a[1] + (b[1] - a[1]) * m; if (inRound(x, z)) lo = m; else hi = m; } return [a[0] + (b[0] - a[0]) * hi, a[1] + (b[1] - a[1]) * hi]; };
      const P = edgePt(pts[k], pts[(k + 3) % 4]), N = edgePt(pts[k], pts[(k + 1) % 4]);
      let a0 = Math.atan2(P[1] - ROUND.z, P[0] - ROUND.x), a1 = Math.atan2(N[1] - ROUND.z, N[0] - ROUND.x), d = a1 - a0; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
      const arc = []; for (let i = 0; i <= 8; i++) { const a = a0 + (d * i) / 8; arc.push([ROUND.x + Math.cos(a) * ROUND.r, ROUND.z + Math.sin(a) * ROUND.r]); }
      pts = [...pts.slice(0, k), ...arc, ...pts.slice(k + 1)];
    }
    const n = pts.length, kk = [c, c, c]; let cx = 0, cz = 0; for (const p of pts) { cx += p[0]; cz += p[1]; } cx /= n; cz /= n;
    const ctr = new THREE.Vector3(cx, CURB, cz);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = new THREE.Vector3(pts[i][0], CURB, pts[i][1]), b = new THREE.Vector3(pts[j][0], CURB, pts[j][1]);
      const up = (a.z - ctr.z) * (b.x - ctr.x) - (a.x - ctr.x) * (b.z - ctr.z) > 0;
      if (up) B.tri(ctr, a, b, kk); else B.tri(ctr, b, a, kk);
      const a0 = new THREE.Vector3(a.x, 0, a.z), b0 = new THREE.Vector3(b.x, 0, b.z);
      C.conc.poly([a0, b0, b, a], 0.55, ctr);
    }
    C.raised.rects.push([x0, x1, z0, z1]);
  }

  function sign(texture, x, y, z, w, h, ry, glow = 0) {
    C.plates.push({ texture, x, y, z, w, h, ry, glow });
  }

  // one building on a lot
  function building(x0, x1, z0, z1, o = {}) {
    const w = x1 - x0, d = z1 - z0, style = o.style ?? rng.int(0, TX.FACADE_COUNT - 1), kind = o.kind || rng.pick(['tower', 'tower', 'tower', 'step', 'round', 'slab']);
    const H = o.h || rng.range(60, 210), podH = Math.min(H - 8, rng.range(11, 22)), pod = rectPts(x0, x1, z0, z1), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    C.shop[rng.int(0, 1)].box(x0, x1, z0, z1, 0, 5.2, { u0: rng.int(0, 3) * 0.25 });
    C.fac[o.podStyle ?? (rng.chance(0.5) ? style : 5)].box(x0, x1, z0, z1, 5.2, podH);
    C.conc.box(w + 0.5, 0.35, d + 0.5, cx, 5.2, cz, { c: 0.5 });
    C.roof(pod, podH, 0.34);
    const ix = Math.min(w * 0.22, rng.range(3, 7)), iz = Math.min(d * 0.22, rng.range(3, 7));
    let tx0 = x0 + ix, tx1 = x1 - ix, tz0 = z0 + iz, tz1 = z1 - iz, top;
    const F = C.fac[style];
    if (kind === 'round') {
      const r = Math.min(tx1 - tx0, tz1 - tz0) / 2, pts = ngon(cx, cz, r, 20);
      F.prism(pts, podH, H, { uPer: (TAU * r) / 20 / 12 }); C.roof(pts, H, 0.3); top = [cx - r * 0.5, cx + r * 0.5, cz - r * 0.5, cz + r * 0.5];
    } else if (kind === 'step') {
      const h1 = podH + (H - podH) * 0.62, h2 = podH + (H - podH) * 0.84;
      F.box(tx0, tx1, tz0, tz1, podH, h1); C.roof(rectPts(tx0, tx1, tz0, tz1), h1, 0.3);
      F.box(tx0 + 3, tx1 - 3, tz0 + 3, tz1 - 3, h1, h2); C.roof(rectPts(tx0 + 3, tx1 - 3, tz0 + 3, tz1 - 3), h2, 0.3);
      F.box(tx0 + 6, tx1 - 6, tz0 + 6, tz1 - 6, h2, H); C.roof(rectPts(tx0 + 6, tx1 - 6, tz0 + 6, tz1 - 6), H, 0.3); top = [tx0 + 6, tx1 - 6, tz0 + 6, tz1 - 6];
    } else {
      if (kind === 'slab') { if (w > d) { tz0 = cz - d * 0.2; tz1 = cz + d * 0.2; tx0 = x0 + 1.5; tx1 = x1 - 1.5; } else { tx0 = cx - w * 0.2; tx1 = cx + w * 0.2; tz0 = z0 + 1.5; tz1 = z1 - 1.5; } }
      F.box(tx0, tx1, tz0, tz1, podH, H); C.roof(rectPts(tx0, tx1, tz0, tz1), H, 0.3); top = [tx0, tx1, tz0, tz1];
      if (rng.chance(0.55)) { const ch = rng.range(6, 14); F.box(tx0 + 2.5, tx1 - 2.5, tz0 + 2.5, tz1 - 2.5, H, H + ch); C.roof(rectPts(tx0 + 2.5, tx1 - 2.5, tz0 + 2.5, tz1 - 2.5), H + ch, 0.3); }
    }
    // roof plant, mast
    C.conc.box((top[1] - top[0]) * 0.4, 3, (top[3] - top[2]) * 0.4, (top[0] + top[1]) / 2, H + 1.5, (top[2] + top[3]) / 2, { c: 0.45 });
    if (rng.chance(0.4)) C.conc.cyl(0.4, rng.range(14, 34), (top[0] + top[1]) / 2, H + 12, (top[2] + top[3]) / 2, { seg: 5, r2: 0.1, c: 0.7 });
    if (o.name || rng.chance(0.45)) {
      const name = o.name || rng.pick(FIRMS), t = TX.signTexture(name, { bg: rng.pick(['#0d2c5e', '#6e1118', '#14301f', '#1b1b1f']), fg: '#f4ead0', border: false, h: 128, w: 512 });
      const sw = Math.min(18, (tz1 - tz0) * 0.8);
      if (kind !== 'round') { sign(t, tx0 - 0.15, H - 7, cz, sw, sw / 4, -Math.PI / 2, 1.3); sign(t, cx, H - 7, tz1 + 0.15, Math.min(18, (tx1 - tx0) * 0.8), Math.min(18, (tx1 - tx0) * 0.8) / 4, 0, 1.3); }
    }
    if (rng.chance(0.3)) { const bi = rng.int(0, 5), t = TX.billboardTexture(bi); if (rng.chance(0.5)) sign(t, cx, 11, z1 + 0.2, Math.min(w * 0.6, 16), Math.min(w * 0.6, 16) / 2, 0, 2.2); else sign(t, x1 + 0.2, 11, cz, Math.min(d * 0.6, 16), Math.min(d * 0.6, 16) / 2, Math.PI / 2, 2.2); }
    C.col.addBox(x0, x1, z0, z1, H, 'bldg'); C.map.rects.push([x0, x1, z0, z1]);
  }

  function genericBlock(x0, x1, z0, z1, o = {}) {
    const inset = o.inset ?? 4.5, alley = o.alley ?? 9.5, nx = o.nx ?? ((x1 - x0) > 74 ? 2 : 1), nz = o.nz ?? ((z1 - z0) > 74 ? 2 : 1);
    const lw = (x1 - x0 - inset * 2 - alley * (nx - 1)) / nx, ld = (z1 - z0 - inset * 2 - alley * (nz - 1)) / nz;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const lx0 = x0 + inset + i * (lw + alley), lz0 = z0 + inset + j * (ld + alley);
      if (inRound(lx0, lz0, 56) || inRound(lx0 + lw, lz0, 56) || inRound(lx0, lz0 + ld, 56) || inRound(lx0 + lw, lz0 + ld, 56)) continue;
      building(lx0, lx0 + lw, lz0, lz0 + ld, o.b || {});
    }
  }

  function streetTrees(x0, x1, z0, z1, o = {}) {
    const step = o.step || 13, ins = 2.0;
    const put = (x, z) => { if (inRound(x, z, 54) || rng.chance(0.14)) return; props.add('tree', x, z, rng.range(0, TAU), { y: CURB, scale: rng.range(0.8, 1.2), color: rng.pick([0xffffff, 0xdfe8c8, 0xc8dcb0, 0xf0e6b0]) }); };
    for (let x = x0 + 9; x < x1 - 8; x += step) { put(x, z0 + ins); put(x, z1 - ins); }
    for (let z = z0 + 9; z < z1 - 8; z += step) { put(x0 + ins, z); put(x1 - ins, z); }
    for (let x = x0 + 16; x < x1 - 10; x += 30) { props.add('lamp', x, z0 + 0.7, Math.PI, { y: CURB }); props.add('lamp', x + 15, z1 - 0.7, 0, { y: CURB }); }
    for (let z = z0 + 16; z < z1 - 10; z += 30) { props.add('lamp', x0 + 0.7, z, -Math.PI / 2, { y: CURB }); props.add('lamp', x1 - 0.7, z + 15, Math.PI / 2, { y: CURB }); }
  }

  // ------------------------------------------------------------ ground, river, quay
  const quay = -MAP;
  C.conc.box(4, 6, 2 * MAP + 4, quay - 2, -2.9, 0, { c: 0.5 }); C.conc.box(2 * MAP + 4, 6, 4, 0, -2.9, quay - 2, { c: 0.5 });
  for (let t = -MAP; t < MAP; t += 3) { C.conc.box(0.12, 1.1, 0.12, quay + 0.6, CURB + 0.55, t, { c: 0.3 }); C.conc.box(0.12, 1.1, 0.12, t, CURB + 0.55, quay + 0.6, { c: 0.3 }); }
  C.conc.box(0.1, 0.08, 2 * MAP, quay + 0.6, CURB + 1.1, 0, { c: 0.3 }); C.conc.box(2 * MAP, 0.08, 0.1, 0, CURB + 1.1, quay + 0.6, { c: 0.3 });
  // far banks
  C.far.box(900, 3, 3200, -1190, -1.5, 0, { c: [0.3, 0.3, 0.3] }); C.far.box(3200, 3, 900, 300, -1.5, -1190, { c: [0.3, 0.3, 0.3] });

  // ------------------------------------------------------------ blocks
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    const [x0, x1] = XI[i], [z0, z1] = ZI[j], key = i + ',' + j;
    let type = 'generic';
    if (i === 0 || j === 0) type = 'promenade'; else if (i === 5 || j === 5) type = 'edge';
    else type = { '1,2': 'pearl', '2,2': 'ifc', '1,3': 'mall', '2,3': 'park', '3,3': 'jinmao', '4,3': 'swfc', '3,4': 'shtower', '1,4': 'aurora' }[key] || 'generic';
    C.map.blocks.push({ x0, x1, z0, z1, type });
    if (type === 'promenade') {
      slab(C.wood, x0, x1, z0, z1);
      const along = i === 0 ? 'z' : 'x';
      for (let t = (along === 'z' ? z0 : x0) + 6; t < (along === 'z' ? z1 : x1) - 4; t += 9) {
        const a = along === 'z' ? [x0 + 14, t] : [t, z0 + 14], b = along === 'z' ? [x1 - 6, t + 4] : [t + 4, z1 - 6];
        if (rng.chance(0.8)) props.add('tree', a[0], a[1], rng.range(0, TAU), { y: CURB, scale: rng.range(0.85, 1.25) });
        if (rng.chance(0.7)) props.add('tree', b[0], b[1], rng.range(0, TAU), { y: CURB, scale: rng.range(0.8, 1.1) });
        if (((t / 9) | 0) % 3 === 0) props.add('lamp', along === 'z' ? x0 + 5 : t, along === 'z' ? t : z0 + 5, along === 'z' ? Math.PI / 2 : 0, { y: CURB });
      }
      // riverside kiosk
      if ((i + j) % 2 === 1) { const kx = along === 'z' ? x0 + 26 : (x0 + x1) / 2, kz = along === 'z' ? (z0 + z1) / 2 : z0 + 26; C.fac[1].box(kx - 4, kx + 4, kz - 3, kz + 3, 0, 4); C.roof(rectPts(kx - 5, kx + 5, kz - 4, kz + 4), 4.1, 0.75); C.col.addBox(kx - 4, kx + 4, kz - 3, kz + 3, 4, 'kiosk'); C.map.rects.push([kx - 4, kx + 4, kz - 3, kz + 3]); }
    } else if (type === 'edge') {
      slab(C.pave, x0, x1, z0, z1);
      const horiz = j === 5 && i !== 5, len = horiz ? x1 - x0 : z1 - z0, n = len > 70 ? 2 : 1, each = len / n;
      for (let k = 0; k < n; k++) {
        const a0 = (horiz ? x0 : z0) + k * each + 3, a1 = (horiz ? x0 : z0) + (k + 1) * each - 3;
        if (horiz) building(a0, a1, z0 + 5, z1 - 4, { h: rng.range(50, 150), kind: rng.pick(['tower', 'step', 'slab']) });
        else building(x0 + 5, x1 - 4, a0, a1, { h: rng.range(50, 150), kind: rng.pick(['tower', 'step', 'slab']) });
      }
      streetTrees(x0, x1, z0, z1);
    } else if (type === 'pearl') {
      slab(C.plaza, x0, x1, z0, z1); LM.orientalPearl(C, -186, -60);
      for (let a = 0; a < 10; a++) { const t = (a / 10) * TAU; props.add('lamp', -186 + Math.cos(t) * 42, -60 + Math.sin(t) * 36, t, { y: CURB, scale: 0.6 }); }
    } else if (type === 'ifc') {
      slab(C.plaza, x0, x1, z0, z1); LM.ifc(C, -60, -82, -34, 16); streetTrees(x0, x1, z0, z1, { step: 15 });
    } else if (type === 'mall') {
      slab(C.pave, x0, x1, z0, z1);
      building(-228, -168, 34, 96, { h: 48, kind: 'tower', style: 3, podStyle: 3 });
      sign(TX.signTexture(['正大广场', 'SUPER BRAND MALL'], { bg: '#a3171f', fg: '#fff', w: 512, h: 160, border: false }), -167.7, 30, 65, 30, 9.4, Math.PI / 2, 2.0);
      sign(TX.billboardTexture(0), -198, 26, 33.7, 30, 15, Math.PI, 2.2);
      streetTrees(x0, x1, z0, z1);
    } else if (type === 'park') {
      slab(C.grass, x0, x1, z0, z1);
      // pond + winding path + trees + tent
      C.plaza.cyl(15.6, 0.05, -44, CURB + 0.005, 64, { seg: 28, c: 0.9 });
      for (let t = 0; t <= 1.001; t += 0.02) { const x = x0 + 8 + (x1 - x0 - 16) * t, z = 60 + Math.sin(t * 5.2) * 26 * (0.4 + 0.6 * t); if (!inRound(x, z, 54) && Math.hypot(x + 44, z - 64) > 15) C.plaza.cyl(2.2, 0.04, x, CURB + 0.02, z, { seg: 8, c: 0.95 }); }
      LM.tentPavilion(C, -84, 80);
      for (let n = 0; n < 60; n++) { const x = rng.range(x0 + 4, x1 - 4), z = rng.range(z0 + 4, z1 - 4); if (inRound(x, z, 56) || Math.hypot(x + 44, z - 64) < 17 || Math.hypot(x + 84, z - 80) < 10) continue; props.add('tree', x, z, rng.range(0, TAU), { y: CURB, scale: rng.range(0.8, 1.45), color: rng.pick([0xffffff, 0xdcecc4, 0xf2e8b0, 0xc8e0b0]) }); }
      for (let n = 0; n < 8; n++) props.add('lamp', rng.range(x0 + 10, x1 - 10), rng.range(z0 + 8, z1 - 8), rng.range(0, TAU), { y: CURB, scale: 0.55 });
    } else if (type === 'jinmao') { slab(C.plaza, x0, x1, z0, z1); LM.jinMao(C, 58, 60); streetTrees(x0, x1, z0, z1, { step: 16 }); }
    else if (type === 'swfc') { slab(C.plaza, x0, x1, z0, z1); LM.swfc(C, 190, 58); streetTrees(x0, x1, z0, z1, { step: 16 }); }
    else if (type === 'shtower') { slab(C.plaza, x0, x1, z0, z1); LM.shanghaiTower(C, 58, 166); streetTrees(x0, x1, z0, z1, { step: 16 }); }
    else if (type === 'aurora') {
      slab(C.pave, x0, x1, z0, z1);
      building(-227, -191, 126, 164, { h: 185, kind: 'tower', style: 7, podStyle: 7, name: '震旦国际' });
      sign(TX.billboardTexture(4), -227.3, 110, 145, 30, 60, -Math.PI / 2, 2.6); sign(TX.billboardTexture(3), -190.7, 60, 145, 24, 48, Math.PI / 2, 2.4);
      building(-181, -145, 126, 164, { h: 180, kind: 'tower', style: 2, name: '花旗集团' });
      building(-227, -191, 174, 207, { h: 120, kind: 'step' }); building(-181, -145, 174, 207, { h: 96, kind: 'slab' });
      streetTrees(x0, x1, z0, z1);
    } else { slab(C.pave, x0, x1, z0, z1); genericBlock(x0, x1, z0, z1); streetTrees(x0, x1, z0, z1); }
  }
  LM.roundabout(C, ROUND.x, ROUND.z);
  LM.backdrop(C, rng);

  // ------------------------------------------------------------ Century Avenue median
  for (const [a, b] of [[-74, -28], [28, 112], [148, 222], [258, 298]]) {
    C.grass.box(b - a, CURB, 4, (a + b) / 2, CURB / 2, 0, { c: 0.95 }); C.conc.box(b - a + 0.3, CURB * 0.9, 4.3, (a + b) / 2, CURB * 0.45, 0, { c: 0.6 });
    C.raised.rects.push([a, b, -2, 2]);
    for (let x = a + 5; x < b - 3; x += 11) props.add('tree', x, 0, rng.range(0, TAU), { y: CURB, scale: rng.range(0.9, 1.2) });
    for (let x = a + 10; x < b - 6; x += 33) { props.add('lamp', x, 1.2, 0, { y: CURB }); props.add('lamp', x, -1.2, Math.PI, { y: CURB }); }
  }

  // ------------------------------------------------------------ road paint
  const M = C.marks, WHITE = [0.82, 0.82, 0.8], YEL = [0.85, 0.66, 0.16], my = 0.012;
  const clearX = (x) => !nearRoadX(x, 8), clearZ = (z) => !nearRoadZ(z, 8);
  for (const [cx, w] of RX) {
    for (let z = -MAP + 4; z < MAP - 4; z += 9) {
      if (!clearZ(z + 1.5) || inRound(cx, z + 1.5, 58)) continue;
      M.box(0.14, 0.02, 9, cx - 0.2, my, z + 4.5, { c: YEL }); M.box(0.14, 0.02, 9, cx + 0.2, my, z + 4.5, { c: YEL });
      if (w >= 20) for (const s of [1, -1]) M.box(0.14, 0.02, 3.2, cx + s * w / 4, my, z + 1.6, { c: WHITE });
    }
    for (const [cz, wz] of RZ) { // crosswalks on the north and south arms
      if (inRound(cx, cz, 60)) continue;
      for (const s of [1, -1]) { const zz = cz + s * (wz / 2 + 3.6); for (let x = cx - w / 2 + 0.7; x < cx + w / 2 - 0.4; x += 1.1) M.box(0.5, 0.02, 3.4, x, my, zz, { c: WHITE }); M.box(w / 2 - 0.6, 0.02, 0.4, cx - s * (w / 4 + 0.1), my, cz + s * (wz / 2 + 6.4), { c: WHITE }); }
    }
  }
  for (const [cz, w] of RZ) {
    const avenue = w >= 40;
    for (let x = -MAP + 4; x < MAP - 4; x += 9) {
      if (!clearX(x + 1.5) || inRound(x + 1.5, cz, 58)) continue;
      if (!avenue) { M.box(9, 0.02, 0.14, x + 4.5, my, cz - 0.2, { c: YEL }); M.box(9, 0.02, 0.14, x + 4.5, my, cz + 0.2, { c: YEL }); if (w >= 20) for (const s of [1, -1]) M.box(3.2, 0.02, 0.14, x + 1.6, my, cz + s * w / 4, { c: WHITE }); }
      else for (const s of [1, -1]) { M.box(9, 0.02, 0.16, x + 4.5, my, cz + s * 2.6, { c: YEL }); for (const l of [8, 13.5]) M.box(3.2, 0.02, 0.14, x + 1.6, my, cz + s * l, { c: WHITE }); }
    }
    for (const [cx, wx] of RX) {
      if (inRound(cx, cz, 60)) continue;
      for (const s of [1, -1]) { const xx = cx + s * (wx / 2 + 3.6); for (let z = cz - w / 2 + 0.7; z < cz + w / 2 - 0.4; z += 1.1) M.box(3.4, 0.02, 0.5, xx, my, z, { c: WHITE }); M.box(0.4, 0.02, w / 2 - 0.6, cx + s * (wx / 2 + 6.4), my, cz + s * (w / 4 + 0.1), { c: WHITE }); }
    }
  }
  // roundabout lanes
  for (const r of [34, 42]) for (let i = 0; i < 40; i += 2) { const a = (i / 40) * TAU; M.box(0.14, 0.02, (TAU * r) / 40, ROUND.x + Math.cos(a) * r, my, ROUND.z + Math.sin(a) * r, { ry: -a, c: WHITE }); }
  // capture plaza ring painted on the road
  for (let i = 0; i < 72; i++) { const a = (i / 72) * TAU; M.box(0.35, 0.02, (TAU * CAP.r) / 72 + 0.05, CAP.x + Math.cos(a) * CAP.r, my + 0.004, CAP.z + Math.sin(a) * CAP.r, { ry: -a, c: i % 6 < 3 ? [0.9, 0.78, 0.2] : [0.1, 0.1, 0.1] }); }

  // ------------------------------------------------------------ street-name plates at every junction
  const nameTex = new Map(), nt = (n, p) => { if (!nameTex.has(n)) nameTex.set(n, TX.signTexture([n, p], { w: 512, h: 128 })); return nameTex.get(n); };
  for (const [cx, wx, nx, px] of RX) for (const [cz, wz, nz, pz] of RZ) {
    if (inRound(cx, cz, 60)) continue;
    const x = cx + wx / 2 + 1.2, z = cz - wz / 2 - 1.2;
    C.conc.cyl(0.07, 3.6, x, 1.8 + CURB, z, { seg: 6, c: 0.4 });
    sign(nt(nz, pz), x, 3.35, z, 2.4, 0.6, 0, 0, true); sign(nt(nx, px), x, 2.7, z, 2.4, 0.6, Math.PI / 2, 0, true);
    props.add('tlight', cx + wx / 2 + 0.9, cz + wz / 2 + 0.9, Math.PI + Math.PI / 2, { y: CURB }); props.add('tlight', cx - wx / 2 - 0.9, cz - wz / 2 - 0.9, Math.PI / 2, { y: CURB });
  }
  // metro entrances by the roundabout
  for (const [mx, mz, ry] of [[-58, -24.4, 0], [-58, 24.4, Math.PI]]) {
    C.fac[1].box(mx - 3.6, mx + 3.6, mz - 1.5, mz + 1.5, 0, 3.2); C.roof(rectPts(mx - 4, mx + 4, mz - 1.9, mz + 1.9), 3.3, 0.7);
    sign(TX.signTexture(['陆家嘴站', 'LUJIAZUI STATION · LINE 2'], { bg: '#74b530', w: 512, h: 128, border: false }), mx, 3.9, mz + (ry ? -1.95 : 1.95), 6, 1.5, ry, 1.2, true);
    C.col.addBox(mx - 3.6, mx + 3.6, mz - 1.5, mz + 1.5, 3.2, 'metro'); C.map.rects.push([mx - 3.6, mx + 3.6, mz - 1.5, mz + 1.5]);
  }

  // ------------------------------------------------------------ vehicles, barricades, wrecks
  const carAt = (x, z, rot, kind = 'car') => { if (inSpawn(x, z) || Math.hypot(x - CAP.x, z - CAP.z) < CAP.r + 6) return; props.add(kind, x, z, rot, { color: kind === 'bus' ? rng.pick([0xb8322a, 0x2a6fb8, 0xe6e6e0, 0x2f8f5a]) : rng.pick(CAR_COLORS) }); };
  for (const [cx, w] of RX) for (let z = -MAP + 8; z < MAP - 8; z += 6.4) {
    if (nearRoadZ(z, 12) || inRound(cx, z, 62)) continue;
    for (const s of [1, -1]) if (rng.chance(0.2)) carAt(cx + s * (w / 2 - 1.35), z, (s > 0 ? Math.PI : 0) + rng.range(-0.05, 0.05));
    if (rng.chance(0.045)) carAt(cx + rng.range(-w / 4, w / 4), z, rng.range(0, TAU));
  }
  for (const [cz, w] of RZ) for (let x = -MAP + 8; x < MAP - 8; x += 6.4) {
    if (nearRoadX(x, 12) || inRound(x, cz, 62)) continue;
    for (const s of [1, -1]) if (rng.chance(0.2)) carAt(x, cz + s * (w / 2 - 1.35), (s > 0 ? Math.PI / 2 : -Math.PI / 2) + rng.range(-0.05, 0.05));
    if (rng.chance(w >= 40 ? 0.1 : 0.045)) carAt(x, cz + rng.range(-w / 3, w / 3) + (w >= 40 ? Math.sign(rng() - 0.5) * 4 : 0), rng.range(0, TAU));
  }
  for (const [x, z, r] of [[-126, -168, 0.08], [4, 62, 3.2], [72, 12, 1.5], [-46, -11, 1.62], [134, 160, 0.3], [196, -108, 1.4], [-236, 60, 0.05], [60, 114, 1.75], [236, -60, 3.0]]) carAt(x, z, r, 'bus');
  // sandbag horseshoes and barrier lines on the approaches to the plaza
  const line = (kind, x, z, rot, n, gap = 3.25) => { for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * gap; props.add(kind, x + Math.sin(rot) * o, z + Math.cos(rot) * o, rot + rng.range(-0.06, 0.06), { color: 0xffffff }); } };
  for (const [a, k] of [[0.62, 'sandbag'], [2.52, 'sandbag'], [3.76, 'sandbag'], [5.66, 'sandbag']]) for (let i = -1; i <= 1; i++) { const t = a + i * 0.125, r = CAP.r + 5; props.add(k, CAP.x + Math.cos(t) * r, CAP.z + Math.sin(t) * r, -t, {}); }
  line('barrier', 58, -9, 0, 5); line('barrier', -58, 9, 0, 5); line('barrier', 6, 58, Math.PI / 2, 3); line('barrier', -6, -58, Math.PI / 2, 3);
  line('barrier', 130, 54, Math.PI / 2, 3); line('barrier', -130, -62, Math.PI / 2, 3); line('sandbag', 96, 110, 0, 3); line('sandbag', -96, -110, 0, 3);
  line('barrier', -76, 110, 0, 3); line('barrier', 76, -110, 0, 3); line('sandbag', 186, 4, 0, 3, 3.4); line('sandbag', -190, 118, Math.PI / 2, 2, 3.4);
  // end-of-map roadblocks
  for (const [cx, w] of RX) { line('barrier', cx, MAP - 5, Math.PI / 2, Math.round(w / 3.3)); }
  for (const [cz, w] of RZ) { line('barrier', MAP - 5, cz, 0, Math.round(w / 3.3)); }
  // burning wrecks (ambient fire + smoke)
  for (const [x, z] of [[-22, 34], [44, -30], [-126, 96], [122, -64], [-70, -112], [176, 112], [8, 176], [-8, -170]]) { fires.push({ x, y: 0.8, z, size: 1 }); props.add('car', x, z, rng.range(0, TAU), { color: 0x16130f }); }
  plumes.push({ x: 150, y: 150, z: -170, size: 1 }, { x: -60, y: 120, z: 180, size: 0.8 }, { x: 420, y: 90, z: 260, size: 1.4 }, { x: -760, y: 40, z: 200, size: 1.2 });

  // ------------------------------------------------------------ meshes
  const add = (geo, mat, o = {}) => { const m = new THREE.Mesh(geo, mat); m.castShadow = o.cast !== false; m.receiveShadow = o.recv !== false; m.matrixAutoUpdate = false; scene.add(m); return m; };
  const std = (p) => new THREE.MeshStandardMaterial(p);
  // asphalt only east/south of the quay lines: build as a box-clipped plane
  const gA = new THREE.PlaneGeometry(1500, 1500); gA.rotateX(-Math.PI / 2); gA.translate(-MAP + 750, 0, -MAP + 750);
  const am = TX.asphaltMaps(); for (const t of [am.map, am.normal, am.rough]) t.repeat.set(250, 250);
  add(gA, wetGround(std({ map: am.map, normalMap: am.normal, roughnessMap: am.rough, normalScale: new THREE.Vector2(0.45, 0.45), roughness: 1, metalness: 0, envMapIntensity: 0.8 }), { pud: 0.55 }), { cast: false });
  const wG = new THREE.PlaneGeometry(5000, 5000); wG.rotateX(-Math.PI / 2); wG.translate(0, -3, 0);
  add(wG, std({ color: 0x2c3a3c, roughness: 0.2, metalness: 0.85, envMapIntensity: 1.0, normalMap: am.normal, normalScale: new THREE.Vector2(0.25, 0.25) }), { cast: false });
  for (let i = 0; i < TX.FACADE_COUNT; i++) {
    if (!C.fac[i].pos.length) continue;
    const t = TX.facadeTextures(i);
    add(C.fac[i].build(), std({ map: t.map, roughnessMap: t.rm, metalnessMap: t.rm, roughness: 1, metalness: 1, emissiveMap: t.em, emissive: 0xffffff, emissiveIntensity: 0.35, envMapIntensity: 1.25, normalMap: t.nm, normalScale: new THREE.Vector2(0.9, 0.9) }));
  }
  C.shop.forEach((b, i) => { if (b.pos.length) add(b.build(), std({ map: TX.shopfrontTexture(i), roughness: 0.5, metalness: 0.2 })); });
  const tp = (tone, rep) => { const t = TX.pavingTexture(tone); return t; };
  add(C.conc.build(0.2), std({ vertexColors: true, roughness: 0.62, metalness: 0.04 }));
  const pv = (tone, rough) => { const t = tp(tone); return wetGround(std({ map: t.map, normalMap: t.normal, vertexColors: true, roughness: rough, envMapIntensity: 0.7 }), { pud: 0.64 }); };
  add(C.pave.build(1 / 4.8), pv(0, 0.88), { cast: false });
  add(C.plaza.build(1 / 6), pv(1, 0.7), { cast: false });
  add(C.wood.build(1 / 5), pv(2, 0.85), { cast: false });
  add(C.grass.build(1 / 7), std({ map: TX.grassTexture(), vertexColors: true, roughness: 0.95 }), { cast: false });
  add(C.marks.build(1), wetGround(std({ vertexColors: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { pud: 0.55 }), { cast: false });
  add(C.pearl.build(1), std({ color: 0xa63a66, roughness: 0.2, metalness: 0.8, envMapIntensity: 1.3 }));
  add(C.steel.build(1), std({ color: 0xe0e4e8, roughness: 0.1, metalness: 1, envMapIntensity: 1.4 }));
  add(C.white.build(1), std({ color: 0xf2efe8, roughness: 0.8, side: THREE.DoubleSide }));
  add(C.far.build(1), new THREE.MeshLambertMaterial({ vertexColors: true }), { cast: false, recv: false });
  // pond
  { const g = new THREE.CircleGeometry(15, 28); g.rotateX(-Math.PI / 2); g.translate(-44, CURB + 0.04, 64); add(g, std({ color: 0x3f5a58, roughness: 0.08, metalness: 0.9 }), { cast: false }); }
  // signs and screens
  const plane = new THREE.PlaneGeometry(1, 1);
  for (const p of C.plates) {
    const mat = p.glow ? new THREE.MeshBasicMaterial({ map: p.texture, color: new THREE.Color(p.glow, p.glow, p.glow), side: THREE.DoubleSide }) : std({ map: p.texture, roughness: 0.6, side: THREE.DoubleSide });
    const m = new THREE.Mesh(plane, mat); m.position.set(p.x, p.y, p.z); m.rotation.y = p.ry; m.scale.set(p.w, p.h, 1); m.updateMatrix(); m.matrixAutoUpdate = false; m.userData.noAO = true; scene.add(m);
  }
  props.build();

  // ------------------------------------------------------------ queries
  function heightAt(x, z) {
    const dr = Math.hypot(x - ROUND.x, z - ROUND.z);
    if (dr < ROUND.r) return dr < 26 ? CURB : 0;
    if (z > -2 && z < 2) { for (const r of C.raised.rects) if (r[2] === -2 && x > r[0] && x < r[1]) return CURB; return 0; }
    let ix = -1, iz = -1;
    for (let i = 0; i < 6; i++) { if (x > XI[i][0] && x < XI[i][1]) ix = i; if (z > ZI[i][0] && z < ZI[i][1]) iz = i; }
    return ix >= 0 && iz >= 0 ? CURB : 0;
  }
  const mk = (x, z, h) => ({ x, z, h });
  const spawns = [
    [mk(-134.5, 236, Math.PI), mk(-125.5, 236, Math.PI), mk(-134.5, 251, Math.PI), mk(-125.5, 251, Math.PI), mk(-134.5, 266, Math.PI), mk(-125.5, 266, Math.PI), mk(-130, 281, Math.PI)],
    [mk(134.5, -236, 0), mk(125.5, -236, 0), mk(134.5, -251, 0), mk(125.5, -251, 0), mk(134.5, -266, 0), mk(125.5, -266, 0), mk(130, -281, 0)],
  ];
  return { col: C.col, props, heightAt, map: C.map, labels: C.labels, cap: CAP, spawns, fires, plumes, size: MAP, showcase: { x: 0, z: 0, h: 2.3 }, update(dt) { props.update(dt); } };
}
