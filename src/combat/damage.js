// Shell-versus-tank resolution. No hit points: a shell meets a plate, the plate's effective thickness depends on
// the impact angle, and if the round gets through, a penetrator ray plus a cone of spall rays walk the interior
// and damage whatever modules and crew they cross.
import * as THREE from 'three';
import { clamp } from '../core/util.js';
import { CREW_LABEL, MODULE_LABEL } from '../data/tanks.js';

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _o2 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _w = new THREE.Vector3(), _wd = new THREE.Vector3();

// Entering intersection of a ray with a convex solid given as planes (n·p <= d). Returns { t, i } or null.
export function rayConvex(planes, o, d) {
  let tIn = -Infinity, tOut = Infinity, idx = -1;
  for (let i = 0; i < planes.length; i++) {
    const p = planes[i], n = p.n, dn = n[0] * d.x + n[1] * d.y + n[2] * d.z, dist = p.d - (n[0] * o.x + n[1] * o.y + n[2] * o.z);
    if (Math.abs(dn) < 1e-9) { if (dist < 0) return null; continue; }
    const t = dist / dn;
    if (dn < 0) { if (t > tIn) { tIn = t; idx = i; } } else if (t < tOut) tOut = t;
    if (tIn > tOut) return null;
  }
  return tIn >= 0 && idx >= 0 ? { t: tIn, i: idx, out: tOut } : null;
}
export function rayBox(mn, mx, o, d) {
  let t0 = -Infinity, t1 = Infinity;
  const O = [o.x, o.y, o.z], D = [d.x, d.y, d.z];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(D[a]) < 1e-9) { if (O[a] < mn[a] || O[a] > mx[a]) return null; continue; }
    let x = (mn[a] - O[a]) / D[a], y = (mx[a] - O[a]) / D[a]; if (x > y) { const s = x; x = y; y = s; }
    if (x > t0) t0 = x; if (y < t1) t1 = y; if (t0 > t1) return null;
  }
  return t1 < 0 ? null : [t0, t1];
}

// Everything a ray meets on one tank, nearest first. o/d in world space, d normalised.
export function traceTank(tank, o, d, maxT) {
  const S = tank.solids, g = tank.def.geo;
  // sphere reject
  _w.set(tank.x - o.x, tank.y + 1.2 - o.y, tank.z - o.z); const tc = clamp(_w.dot(d), 0, maxT);
  if (_w.addScaledVector(d, -tc).lengthSq() > (S.radius + 3.5) ** 2) return null;
  const hits = [];
  _o.copy(o).applyMatrix4(tank.invHull); _d.copy(d).transformDirection(tank.invHull);
  let h = rayConvex(S.hull, _o, _d);
  if (h && h.t < maxT) hits.push({ t: h.t, part: 'hull', plane: S.hull[h.i], lp: _o.clone().addScaledVector(_d, h.t), ld: _d.clone() });
  for (let k = 0; k < 2; k++) { const r = rayBox(S.tracks[k].min, S.tracks[k].max, _o, _d); if (r && r[0] >= 0 && r[0] < maxT) hits.push({ t: r[0], part: k ? 'trackR' : 'trackL' }); }
  _o.copy(o).applyMatrix4(tank.invTurret); _d.copy(d).transformDirection(tank.invTurret);
  h = rayConvex(S.turret, _o, _d);
  if (h && h.t < maxT) hits.push({ t: h.t, part: 'turret', plane: S.turret[h.i], lp: _o.clone().addScaledVector(_d, h.t), ld: _d.clone() });
  _o.copy(o).applyMatrix4(tank.invGun); _d.copy(d).transformDirection(tank.invGun);
  const br = g.gun.r * 1.5, r = rayBox([-br, -br, 0.95], [br, br, g.gun.len], _o, _d);
  if (r && r[0] >= 0 && r[0] < maxT) hits.push({ t: r[0], part: 'barrel' });
  if (!hits.length) return null;
  hits.sort((a, b) => a.t - b.t);
  return hits;
}

export const penAt = (shell, dist) => (shell.type === 'ap' ? shell.pen * (1 - 0.00009 * dist) : shell.pen);

// Armour the shell actually has to beat at a hit: zone, effective thickness, impact angle.
function plateAt(tank, h, type) {
  const p = h.plane, g = tank.def.geo, cos = -(p.n[0] * h.ld.x + p.n[1] * h.ld.y + p.n[2] * h.ld.z);
  let zone = p.zone, thick = type === 'heat' ? p.ce : p.ke;
  if (h.part === 'turret' && zone === 'tfront' && Math.abs(h.lp.x) < g.mant[0] + 0.06 && Math.abs(h.lp.y - g.gun.y) < g.mant[1] + 0.06) { zone = 'mant'; thick = tank.def.armor.mant[type === 'heat' ? 1 : 0] * p.losK; }
  const c = clamp(cos, 0, 1);
  return { zone, thick, cos: c, angle: Math.acos(c), eff: thick / Math.max(c, 0.08) };
}
const RICO = { ap: [76, 80], heat: [66, 72] };

// What would happen if this shell flew along this ray? Used by the gun marker (no state is changed).
export function previewShot(tank, shell, hits, dist) {
  let pen = penAt(shell, dist);
  for (const h of hits) {
    if (h.part === 'trackL' || h.part === 'trackR') { if (shell.type === 'he') return { v: 'maybe', zone: h.part }; pen -= shell.type === 'ap' ? 35 : 140; continue; }
    if (h.part === 'barrel') return { v: 'no', zone: 'barrel' };
    const a = plateAt(tank, h, shell.type);
    if (shell.type === 'he') return { v: a.thick <= shell.pen ? 'yes' : 'no', zone: a.zone, eff: a.eff, pen: shell.pen };
    const deg = (a.angle * 180) / Math.PI;
    if (deg > RICO[shell.type][1]) return { v: 'no', zone: a.zone, eff: a.eff, pen, rico: true };
    const m = pen / a.eff;
    return { v: m > 1.06 ? 'yes' : m > 0.94 ? 'maybe' : 'no', zone: a.zone, eff: a.eff, pen };
  }
  return { v: 'maybe', zone: 'track' };
}

function note(res, id, kind, label, before, after, max) {
  const e = res.dmg.find((x) => x.id === id);
  if (e) e.after = after; else res.dmg.push({ id, kind, label, before, after, max });
}
function hurtExt(tank, name, dmg, res) {
  const e = tank.ext[name], before = e.hp; e.hp = Math.max(0, e.hp - dmg);
  note(res, name, 'ext', MODULE_LABEL[name], before, e.hp, e.hpMax);
}
function hurtModule(tank, m, dmg, res, type, R) {
  if (m.d.kind === 'wall' || m.hp <= 0) return;
  const before = m.hp; m.hp = Math.max(0, m.hp - dmg);
  const k = m.d.kind;
  note(res, m.d.id, k, k === 'crew' ? CREW_LABEL[m.d.role] : MODULE_LABEL[k], before, m.hp, m.d.hpMax);
  if (k === 'crew') { if (m.hp <= 0) tank.onCrewDown(m.d.role); }
  else if (k === 'ammo') { if (R() < (m.hp <= 0 ? 0.82 : clamp(dmg / 200, 0.15, 0.6))) { if (m.d.blowout) { res.blowout = true; m.hp = 0; note(res, m.d.id, k, MODULE_LABEL[k], before, 0, m.d.hpMax); } else res.ammoBoom = true; } }
  else if (k === 'fuel') { if (dmg > 25 && R() < (type === 'ap' ? 0.28 : 0.42)) res.fire = true; }
  else if (k === 'engine') { if (dmg > 40 && R() < 0.2) res.fire = true; }
}

// One damage ray through the interior. `space` is the solid it started in ('hull' | 'turret').
function castRay(tank, res, space, lo, ld, energy, len, main, base, type, R) {
  const fromM = space === 'hull' ? tank.hullMat : tank.turretMat;
  _w.copy(lo).applyMatrix4(fromM); _wd.copy(ld).transformDirection(fromM);
  _o.copy(_w).applyMatrix4(tank.invHull); _d.copy(_wd).transformDirection(tank.invHull);
  _o2.copy(_w).applyMatrix4(tank.invTurret); _d2.copy(_wd).transformDirection(tank.invTurret);
  const list = [];
  for (const m of tank.mods) { const r = m.d.space === 'hull' ? rayBox(m.d.min, m.d.max, _o, _d) : rayBox(m.d.min, m.d.max, _o2, _d2); if (r && r[1] > 0 && r[0] < len) list.push([Math.max(0, r[0]), m]); }
  list.sort((a, b) => a[0] - b[0]);
  let reach = len;
  for (const [t, m] of list) {
    const dmg = main ? base * (0.8 + 0.4 * R()) : energy * 1.5 * (0.7 + 0.6 * R());
    hurtModule(tank, m, dmg, res, type, R);
    energy -= m.d.absorb * (main ? 0.75 : 1.3);
    if (energy <= 0) { reach = t + 0.15; break; }
  }
  res.rays.push({ space, o: [lo.x, lo.y, lo.z], d: [ld.x, ld.y, ld.z], len: reach, main });
}

const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _dir = new THREE.Vector3();
function spall(tank, res, h, residual, type, R) {
  const lo = h.lp.clone().addScaledVector(h.ld, 0.03), ld = h.ld;
  castRay(tank, res, h.part, lo, ld, residual * 0.6 + (type === 'ap' ? 260 : 170), 7, true, type === 'ap' ? 190 : type === 'heat' ? 150 : 170, type, R);
  const n = type === 'he' ? 18 : type === 'ap' ? Math.round(clamp(5 + residual / 45, 5, 15)) : Math.round(clamp(3 + residual / 90, 3, 7)), cone = type === 'he' ? 1.0 : type === 'ap' ? 0.44 : 0.27;
  _t1.set(0, 1, 0); if (Math.abs(ld.y) > 0.9) _t1.set(1, 0, 0);
  _t1.cross(ld).normalize(); _t2.crossVectors(ld, _t1);
  for (let i = 0; i < n; i++) {
    const a = cone * Math.sqrt(R()), ph = R() * Math.PI * 2, s = Math.sin(a);
    _dir.copy(ld).multiplyScalar(Math.cos(a)).addScaledVector(_t1, s * Math.cos(ph)).addScaledVector(_t2, s * Math.sin(ph)).normalize();
    const e = type === 'he' ? 60 + R() * 60 : (30 + residual * 0.22) * (0.4 + R() * 0.6);
    castRay(tank, res, h.part, lo, _dir.clone(), e, Math.min(3.6, 1.2 + e / 45), false, 0, type, R);
  }
}

// Apply a shell to a tank. `hits` comes from traceTank. Mutates the tank; returns a report for FX, HUD and hit-cam.
export function resolveImpact(tank, shell, hits, dist, R = Math.random) {
  const type = shell.type, res = { tank, type, shell, kind: null, zone: null, eff: 0, pen: 0, angle: 0, t: hits[0].t, dmg: [], rays: [], killed: false, part: null, lp: null, ld: null };
  let pen = penAt(shell, dist) * (0.96 + R() * 0.08);
  const wasAlive = tank.alive;
  for (const h of hits) {
    res.t = h.t;
    if (h.part === 'trackL' || h.part === 'trackR') {
      res.track = h.part;
      if (type === 'he') { hurtExt(tank, h.part, 240, res); res.kind = 'he'; res.zone = h.part; break; }
      hurtExt(tank, h.part, type === 'ap' ? 70 + R() * 60 : 150, res);
      pen -= type === 'ap' ? 35 : 140;
      if (pen <= 0) { res.kind = 'track'; res.zone = h.part; break; }
      continue;
    }
    if (h.part === 'barrel') { hurtExt(tank, 'barrel', type === 'he' ? 200 : 110 + R() * 80, res); res.kind = 'barrel'; res.zone = 'barrel'; break; }
    const a = plateAt(tank, h, type), deg = (a.angle * 180) / Math.PI;
    res.zone = a.zone; res.angle = deg; res.eff = a.eff; res.pen = pen; res.part = h.part; res.lp = h.lp; res.ld = h.ld; res.normal = h.plane.n;
    if (type === 'he') {
      if (a.thick <= shell.pen) { res.kind = 'pen'; spall(tank, res, h, 70, type, R); }
      else {
        res.kind = 'he';
        if (h.part === 'hull' && h.lp.y < 1.3) hurtExt(tank, h.lp.x > 0 ? 'trackL' : 'trackR', 60 + R() * 70, res);
        if (h.part === 'turret' && a.zone !== 'ttop' && h.ld.z < -0.3) hurtExt(tank, 'barrel', 30 + R() * 50, res);
      }
      break;
    }
    const [r0, r1] = RICO[type];
    if (deg > r1 || (deg > r0 && R() < (deg - r0) / (r1 - r0))) { res.kind = 'ricochet'; break; }
    if (pen < a.eff) { res.kind = 'nopen'; break; }
    res.kind = 'pen'; spall(tank, res, h, pen - a.eff, type, R);
    break;
  }
  if (!res.kind) { res.kind = 'track'; res.zone = res.track; }
  if (wasAlive) {
    if (res.ammoBoom) tank.destroy('ammo');
    else if (tank.crewAlive() <= 1) tank.destroy('crew');
    else { if (res.blowout) tank.onBlowout(); if (res.fire) tank.ignite(); }
    res.killed = !tank.alive;
  }
  return res;
}

// HE bursting on the ground or a wall next to a tank: tracks take the blast.
export function splash(tank, px, py, pz, radius, R = Math.random) {
  const dx = tank.x - px, dz = tank.z - pz, d = Math.hypot(dx, dz);
  if (d > radius + 3 || !tank.alive) return null;
  const res = { tank, type: 'he', kind: 'he', dmg: [], rays: [], zone: 'splash' };
  const k = clamp(1 - (d - 2) / (radius + 1), 0, 1); if (k <= 0) return null;
  // which side faces the blast
  _w.set(px, py, pz).applyMatrix4(tank.invHull);
  hurtExt(tank, _w.x > 0 ? 'trackL' : 'trackR', (70 + R() * 80) * k, res);
  return res;
}
