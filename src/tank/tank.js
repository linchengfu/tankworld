// One tank: tracked-vehicle handling, turret and gun laying, reload, module state, fire and field repair.
// Controllers (player or AI) write to `ctl` and call aimAt(); the simulation does the rest.
import * as THREE from 'three';
import { clamp, damp, angDiff, moveAngle, moveToward, DEG, gauss } from '../core/util.js';
import { buildTankModel } from './model.js';
import { solidsFor } from './geom.js';

const _v = new THREE.Vector3(), _p = { x: 0, z: 0 }, _list = [];
const G0 = 9.81;

export class Tank {
  constructor(def, team, o = {}) {
    this.def = def; this.team = team; this.name = o.name || def.name; this.isPlayer = !!o.isPlayer; this.id = o.id ?? 0;
    this.solids = solidsFor(def); this.model = buildTankModel(def);
    this.x = o.x || 0; this.z = o.z || 0; this.y = 0; this.heading = o.h || 0; this.speed = 0; this.yawRate = 0;
    this.pitch = 0; this.roll = 0; this.pitchV = 0; this.rollV = 0; this.prevSpeed = 0;
    this.turretYaw = 0; this.gunPitch = 0; this.aimYaw = this.heading; this.aimPitch = 0; this.turretRate = 0;
    this.ctl = { throttle: 0, steer: 0, brake: false, hold: false };
    this.mods = def.modules.map((d) => ({ d, hp: d.hpMax }));
    this.ext = { trackL: { hp: 200, hpMax: 200 }, trackR: { hp: 200, hpMax: 200 }, barrel: { hp: 170, hpMax: 170 } };
    this.byId = {}; for (const m of this.mods) this.byId[m.d.id] = m;
    this.ammo = def.ammo.slice(); this.loaded = 0; this.reloadT = 0; this.reloadTotal = def.reload;
    this.gunnerOut = 0; this.driverOut = 0; this.loaderDead = false;
    this.fire = null; this.extinguishers = 2; this.repair = null; this.alive = true; this.deadReason = null; this.deadT = 0;
    this.disp = def.disp * 2.5; this.recoil = 0; this.dustT = 0; this.fireTick = 0; this.toss = null;
    this.stats = { shots: 0, hits: 0, pens: 0, kills: 0, taken: 0, bounced: 0, mods: 0 };
    this.seenT = -99; this.lastHitBy = null;
    this.hullMat = this.model.body.matrixWorld; this.turretMat = this.model.turret.matrixWorld; this.gunMat = this.model.gun.matrixWorld;
    this.invHull = new THREE.Matrix4(); this.invTurret = new THREE.Matrix4(); this.invGun = new THREE.Matrix4();
    this.muzzle = new THREE.Vector3(); this.gunDir = new THREE.Vector3(0, 0, 1);
    this.sync();
  }

  // ---- state queries
  mod(id) { return this.byId[id]; }
  crewAlive() { let n = 0; for (const m of this.mods) if (m.d.kind === 'crew' && m.hp > 0) n++; return n; }
  engineK() { const e = this.byId.engine; return e.hp <= 0 ? 0 : e.hp < e.d.hpMax * 0.5 ? 0.55 : 1; }
  tracksOk() { return this.ext.trackL.hp > 0 && this.ext.trackR.hp > 0; }
  canDrive() { return this.alive && !this.repair && this.engineK() > 0 && this.byId.trans.hp > 0 && this.tracksOk() && this.driverOut <= 0; }
  gunOk() { return this.alive && !this.repair && this.byId.breech.hp > 0 && this.ext.barrel.hp > 0 && this.gunnerOut <= 0; }
  canFire() { return this.gunOk() && this.reloadT <= 0 && this.ammo[this.loaded] > 0; }
  shell() { return this.def.shells[this.loaded]; }
  reloadTime() {
    let t = this.def.reload; const al = this.byId.autoloader, br = this.byId.breech;
    if (al && al.hp < al.d.hpMax * 0.5) t *= al.hp <= 0 ? 2.6 : 1.5;
    if (!this.def.autoloader && this.loaderDead) t *= 1.8;
    if (br.hp < br.d.hpMax * 0.5) t *= 1.3;
    return t;
  }
  needsRepair() {
    for (const k of ['trackL', 'trackR', 'barrel']) if (this.ext[k].hp < this.ext[k].hpMax * 0.5) return true;
    for (const m of this.mods) { const k = m.d.kind; if ((k === 'engine' || k === 'trans' || k === 'breech' || k === 'tdrive' || k === 'autoloader') && m.hp < m.d.hpMax * 0.5) return true; }
    return false;
  }
  disabled() { return this.alive && (!this.tracksOk() || this.engineK() === 0 || this.byId.trans.hp <= 0 || this.byId.breech.hp <= 0 || this.ext.barrel.hp <= 0); }
  // world position of the turret roof (eyes for line-of-sight)
  eye(out) { return out.set(this.x, this.y + this.def.geo.hullH + this.def.geo.turret.h + 0.3, this.z); }

  // ---- events from the damage model
  onCrewDown(role) { if (role === 'gunner') this.gunnerOut = 8; else if (role === 'driver') this.driverOut = 8; else if (role === 'loader') this.loaderDead = true; }
  onBlowout() { this.ammo = this.ammo.map((a) => Math.floor(a * 0.4)); this.reloadT = Math.max(this.reloadT, 14); this.reloadTotal = 14; this.blowoutT = 4; }
  ignite() { if (!this.fire && this.alive) this.fire = { t: 0, out: this.extinguishers > 0 ? 3.2 : Infinity, tick: 0 }; }
  destroy(reason) {
    if (!this.alive) return;
    this.alive = false; this.deadReason = reason; this.deadT = 0; this.fire = null; this.repair = null; this.burn = reason === 'ammo' ? 70 : 45;
    this.ctl.throttle = 0; this.ctl.steer = 0;
    this.model.setWreck();
    if (reason === 'ammo' && (this.def.layout === 'carousel' || this.def.layout === 'capsule')) {
      this.toss = { v: new THREE.Vector3((Math.random() - 0.5) * 5, 11 + Math.random() * 5, (Math.random() - 0.5) * 5), w: new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4), done: false, pending: true };
    } else { this.model.turret.rotation.z = (Math.random() - 0.5) * 0.12; this.model.gun.rotation.x = 0.1; }
  }

  // ---- control helpers
  selectShell(i) {
    if (!this.alive || i === this.loaded || !(this.ammo[i] > 0)) return false;
    this.loaded = i; this.reloadTotal = this.reloadTime(); this.reloadT = this.reloadTotal; return true;
  }
  startRepair() {
    if (!this.alive || this.repair || this.fire || !this.needsRepair() || Math.abs(this.speed) > 1.5) return false;
    let n = 0; for (const k of ['trackL', 'trackR', 'barrel']) if (this.ext[k].hp <= 0) n++;
    for (const m of this.mods) if (m.d.kind !== 'crew' && m.d.kind !== 'ammo' && m.d.kind !== 'wall' && m.hp <= 0) n++;
    this.repair = { t: 0, total: clamp(7 + n * 3.5, 8, 20) }; return true;
  }
  // Point the gun at a world position (with a little superelevation for shell drop).
  aimAt(px, py, pz) {
    // measured from the trunnion, not the hull centre, so the round lands where the crosshair is
    const g = this.def.geo, e = this.model.gun.matrixWorld.elements, dx = px - e[12], dz = pz - e[14], d = Math.hypot(dx, dz), v = this.shell().v;
    this.aimYaw = Math.atan2(dx, dz); this.aimPitch = Math.atan2(py - e[13], Math.max(d, 0.01)) + (0.5 * G0 * d) / (v * v);
  }

  tryFire(G) {
    if (!this.canFire()) return false;
    const sh = this.shell();
    _v.copy(this.gunDir);
    // dispersion: gaussian inside the aiming circle
    const a = Math.min(Math.abs(gauss()) * 0.42, 1) * this.disp * 0.001, ph = Math.random() * Math.PI * 2;
    const up = new THREE.Vector3(0, 1, 0), rt = new THREE.Vector3().crossVectors(up, _v).normalize(); up.crossVectors(_v, rt);
    _v.addScaledVector(rt, Math.cos(ph) * a).addScaledVector(up, Math.sin(ph) * a).normalize();
    G.spawnShell(this, this.muzzle, _v, sh);
    this.ammo[this.loaded]--; this.stats.shots++;
    if (this.ammo[this.loaded] <= 0) { const n = this.ammo.findIndex((x) => x > 0); if (n >= 0) this.loaded = n; }
    this.reloadTotal = this.reloadTime(); this.reloadT = this.reloadTotal; this.disp = Math.max(this.disp, this.def.disp * 4.5);
    this.recoil = 1; this.pitchV -= 0.55 * Math.cos(this.turretYaw); this.rollV += 0.55 * Math.sin(this.turretYaw);
    G.onFire(this, sh);
    return true;
  }
  kick(dirx, dirz, k = 0.5) { // hull rock from a hit coming along (dirx, dirz) in world space
    const c = Math.cos(this.heading), s = Math.sin(this.heading), fz = dirx * s + dirz * c, fx = dirx * c - dirz * s;
    this.pitchV += fz * k * 0.6; this.rollV -= fx * k * 0.6;
  }

  // ---- simulation
  update(dt, G) {
    const D = this.def, g = D.geo, M = this.model;
    if (!this.alive) { this.updateWreck(dt, G); return; }
    if (this.gunnerOut > 0) this.gunnerOut -= dt; if (this.driverOut > 0) this.driverOut -= dt; if (this.blowoutT > 0) this.blowoutT -= dt;
    // fire
    if (this.fire) {
      const f = this.fire; f.t += dt; f.tick += dt;
      if (f.t >= f.out) { this.extinguishers--; this.fire = null; G.onNote(this, 'fireout'); }
      else if (f.tick >= 1) {
        f.tick = 0; const e = this.byId.engine; e.hp = Math.max(0, e.hp - 14);
        const crew = this.mods.filter((m) => m.d.kind === 'crew' && m.hp > 0);
        if (f.t > 4 && crew.length) { const c = crew[(Math.random() * crew.length) | 0]; c.hp = Math.max(0, c.hp - 22); if (c.hp <= 0) this.onCrewDown(c.d.role); }
        if (this.crewAlive() <= 1 || f.t > 16) { this.destroy('fire'); G.onTankDestroyed(this, 'fire', this.lastHitBy); return; }
      }
    }
    // repair
    if (this.repair) {
      this.repair.t += dt;
      if (this.repair.t >= this.repair.total) {
        for (const m of this.mods) { const k = m.d.kind; if (k !== 'crew' && k !== 'ammo' && k !== 'wall') m.hp = Math.max(m.hp, m.d.hpMax * 0.65); }
        this.ext.trackL.hp = this.ext.trackL.hpMax; this.ext.trackR.hp = this.ext.trackR.hpMax; this.ext.barrel.hp = Math.max(this.ext.barrel.hp, this.ext.barrel.hpMax * 0.8);
        this.repair = null; G.onNote(this, 'repaired');
      }
    }
    // ---- drive
    const drive = this.canDrive(), ek = this.engineK(), maxF = (D.vmax / 3.6) * (ek < 1 ? 0.6 : 1), maxR = D.vrev / 3.6;
    const thr = drive ? clamp(this.ctl.throttle, -1, 1) : 0, st = drive ? clamp(this.ctl.steer, -1, 1) : 0;
    if (this.ctl.brake || !drive) this.speed = moveToward(this.speed, 0, (drive ? 9 : 6) * dt);
    else if (thr > 0) this.speed += (this.speed >= -0.2 ? D.pw * 0.095 * ek * thr * Math.max(0, 1 - this.speed / maxF) : 7.5) * dt;
    else if (thr < 0) this.speed -= (this.speed <= 0.2 ? D.pw * 0.085 * ek * -thr * Math.max(0, 1 + this.speed / maxR) : 8) * dt;
    else this.speed = moveToward(this.speed, 0, 2.0 * dt);
    this.speed = clamp(this.speed, -maxR, maxF * 1.02);
    const sf = Math.min(1, Math.abs(this.speed) / maxF), rev = this.speed < -0.4 || (thr < 0 && this.speed < 0.4) ? -1 : 1;
    const yawT = st * D.hullTurn * DEG * (1 - 0.5 * sf) * (Math.abs(this.speed) < 1 ? 0.9 : 1) * rev * (ek < 1 ? 0.7 : 1);
    this.yawRate = damp(this.yawRate, yawT, 5.5, dt);
    this.heading += this.yawRate * dt;
    this.speed -= this.speed * 0.3 * Math.abs(st) * dt;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    this.x += fx * this.speed * dt; this.z += fz * this.speed * dt;
    // ---- collide: three circles down the hull
    const r = g.W / 2 - 0.12, off = g.L / 2 - r;
    for (const k of [1, -1, 0]) {
      _p.x = this.x + fx * off * k; _p.z = this.z + fz * off * k; const ox = _p.x, oz = _p.z;
      const n = G.world.col.pushOut(_p, r);
      if (n) { this.x += _p.x - ox; this.z += _p.z - oz; const into = (fx * n.x + fz * n.z) * Math.sign(this.speed || 1); if (into < -0.25) { if (Math.abs(this.speed) > 3) G.onBump(this, Math.abs(this.speed)); this.speed *= Math.max(0, 1 - 9 * dt * -into); } }
    }
    // ---- flatten street furniture
    if (Math.abs(this.speed) > 0.6 || Math.abs(this.yawRate) > 0.2) {
      _list.length = 0; const sg = Math.sign(this.speed) || 1;
      G.world.props.crush(this.x + fx * off * sg, this.z + fz * off * sg, r + 0.1, fx * sg, fz * sg, _list);
      G.world.props.crush(this.x, this.z, r, fx * sg, fz * sg, _list);
      for (const it of _list) { this.speed *= 1 - it.K.slow * (55 / D.mass); this.pitchV += (it.K.fall ? 0.05 : 0.5) * -sg; G.onCrush(this, it); }
    }
    this.y = damp(this.y, G.world.heightAt(this.x, this.z), 14, dt);
    // ---- suspension
    const acc = (this.speed - this.prevSpeed) / Math.max(dt, 1e-3); this.prevSpeed = this.speed;
    this.pitchV += ((clamp(-acc * 0.0075, -0.07, 0.07) - this.pitch) * 46 - this.pitchV * 6.5) * dt; this.pitch += this.pitchV * dt;
    this.rollV += ((clamp(this.yawRate * this.speed * 0.0045, -0.05, 0.05) - this.roll) * 46 - this.rollV * 6.5) * dt; this.roll += this.rollV * dt;
    // ---- turret & gun
    const td = this.byId.tdrive, tk = this.gunnerOut > 0 || this.repair ? 0 : td.hp <= 0 ? 0.18 : td.hp < td.d.hpMax * 0.5 ? 0.55 : 1;
    let depr = D.depr * DEG; if (Math.abs(angDiff(0, this.turretYaw)) > 2.3) depr = Math.min(depr, 1.5 * DEG);
    const py = this.turretYaw, pp = this.gunPitch;
    if (!this.ctl.hold) {
      this.turretYaw = moveAngle(this.turretYaw, this.aimYaw - this.heading, D.turretTurn * DEG * tk * dt);
      this.gunPitch = moveToward(this.gunPitch, clamp(this.aimPitch, -depr, D.elev * DEG), D.elevRate * DEG * tk * dt);
    }
    this.gunPitch = clamp(this.gunPitch, -depr, D.elev * DEG);
    this.turretRate = (Math.abs(angDiff(py, this.turretYaw)) + Math.abs(this.gunPitch - pp)) / Math.max(dt, 1e-3);
    // ---- aiming circle (mrad)
    const target = D.disp * (1 + sf * 4.2 + Math.abs(this.yawRate) * 3.2 + Math.min(this.turretRate, 1) * 2.6);
    this.disp = target > this.disp ? damp(this.disp, target, 10, dt) : damp(this.disp, target, 3 / D.aimTime, dt);
    // ---- reload
    if (this.reloadT > 0 && this.gunOk() && !this.blowoutHold) { this.reloadT -= dt; if (this.reloadT <= 0) { this.reloadT = 0; G.onReloaded(this); } }
    this.recoil = Math.max(0, this.recoil - dt * (this.recoil > 0.6 ? 9 : 1.6));
    // ---- tracks + dust
    const vl = this.speed - this.yawRate * g.W * 0.5, vr = this.speed + this.yawRate * g.W * 0.5;
    M.tracks[0].tex.offset.y += (vl * dt) / 0.32; M.tracks[1].tex.offset.y += (vr * dt) / 0.32;
    this.sync();
  }

  updateWreck(dt, G) {
    this.deadT += dt; this.speed = moveToward(this.speed, 0, 8 * dt);
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    this.x += fx * this.speed * dt; this.z += fz * this.speed * dt;
    this.pitchV += (-this.pitch * 46 - this.pitchV * 6.5) * dt; this.pitch += this.pitchV * dt;
    this.rollV += (-this.roll * 46 - this.rollV * 6.5) * dt; this.roll += this.rollV * dt;
    if (this.burn > 0) this.burn -= dt;
    const T = this.toss, tu = this.model.turret;
    if (T && !T.done) {
      if (T.pending) { T.pending = false; G.scene.attach(tu); }
      T.v.y -= 9.8 * 1.6 * dt; tu.position.addScaledVector(T.v, dt);
      tu.rotation.x += T.w.x * dt; tu.rotation.y += T.w.y * dt; tu.rotation.z += T.w.z * dt;
      const gy = G.world.heightAt(tu.position.x, tu.position.z) + 0.55;
      if (tu.position.y < gy && T.v.y < 0) { tu.position.y = gy; T.done = true; tu.rotation.set(Math.PI + (Math.random() - 0.5) * 0.3, tu.rotation.y, (Math.random() - 0.5) * 0.4); G.onTurretLand(this, tu.position); }
    }
    this.sync();
  }

  // push simulation state into the scene graph and refresh the matrices the damage model reads
  sync() {
    const M = this.model, g = this.def.geo;
    M.root.position.set(this.x, this.y, this.z); M.root.rotation.y = this.heading;
    M.body.rotation.set(this.pitch, 0, this.roll);
    if (!this.toss) { M.turret.rotation.y = this.turretYaw; if (this.alive) M.gun.rotation.x = -this.gunPitch; }
    M.gunRecoil.position.z = -Math.sin(Math.min(1, this.recoil) * Math.PI * 0.5) * 0.42;
    M.root.updateMatrixWorld(true);
    this.invHull.copy(M.body.matrixWorld).invert(); this.invTurret.copy(M.turret.matrixWorld).invert(); this.invGun.copy(M.gun.matrixWorld).invert();
    this.muzzle.set(0, 0, g.gun.len + 0.1).applyMatrix4(M.gun.matrixWorld);
    this.gunDir.set(0, 0, 1).transformDirection(M.gun.matrixWorld);
  }
}
