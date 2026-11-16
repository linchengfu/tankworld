// AI crew for one tank: pick a role-based goal, path to it, stop to shoot, back into cover while reloading.
import { clamp, angDiff, gauss, rand } from '../core/util.js';

export const DIFF = {
  easy: { err: 1.3, react: 1.5, weak: 0.15, settle: 2.6, label: '新兵' },
  normal: { err: 0.85, react: 0.95, weak: 0.45, settle: 2.1, label: '老兵' },
  hard: { err: 0.5, react: 0.55, weak: 0.8, settle: 1.7, label: '王牌' },
};
// Waypoint chains per role for the south-west team; the north-east team uses the mirror image.
const ROUTES = {
  cap: [],
  west: [[-130, 62], [-78, 6]],
  east: [[-6, 216], [128, 190], [130, 20]],
  river: [[-240, 150], [-240, -40], [-150, -110], [-20, -110]],
  mid: [[-128, 112], [-6, 104]],
};
const GUARD = [[-64, 8], [6, 66], [-52, 60]];

export class AI {
  constructor(tank, G, role, diff) {
    this.t = tank; this.G = G; this.role = role; this.D = DIFF[diff]; this.s = tank.team === 0 ? 1 : -1;
    this.route = (ROUTES[role] || []).map(([x, z]) => ({ x: x * this.s, z: z * this.s })); this.ri = 0;
    this.goal = null; this.path = null; this.pi = 0; this.repathT = 0; this.mode = 'travel'; this.backT = 0; this.backSteer = 0; this.stuckT = 0;
    this.target = null; this.reactT = 0; this.lastSeen = null; this.errX = 0; this.errY = 0; this.aimH = 1.3; this.thinkT = Math.random() * 0.3; this.holdT = 0; this.after = null; this.blockT = 0; this.pushT = 0; this.why = ''; this.postT = 0;
    this.guard = GUARD[tank.id % GUARD.length].map((v) => v * this.s);
    this.capPt = { x: G.world.cap.x + rand(-9, 9), z: G.world.cap.z + rand(-9, 9) };
  }
  roleGoal() {
    const G = this.G, t = this.t, cap = G.cap;
    // defend the plaza when the other side is taking it
    if (cap.team !== -1 && cap.team !== t.team && cap.pts > 20) return this.capPt;
    if (this.ri < this.route.length) return this.route[this.ri];
    if (this.role === 'guard') { if (Math.hypot(this.guard[0] - t.x, this.guard[1] - t.z) < 9) this.postT += 0.22; if (this.postT < 30) return { x: this.guard[0], z: this.guard[1] }; }
    if (this.role === 'cap') return this.capPt;
    // hunt: nearest known enemy, else the plaza
    let best = null, bd = 1e9;
    for (const e of G.tanks) { if (e.team === t.team || !e.alive || G.time - e.seenT > 25) continue; const d = Math.hypot(e.lastX - t.x, e.lastZ - t.z); if (d < bd) { bd = d; best = e; } }
    return best ? { x: best.lastX, z: best.lastZ } : this.capPt;
  }
  newAim() {
    const t = this.t, e = this.target; if (!e) return;
    const d = Math.hypot(e.x - t.x, e.z - t.z), k = clamp(d / 100, 0.5, 3) * this.D.err * (Math.abs(e.speed) > 3 ? 1.35 : 1);
    this.errX = gauss() * k; this.errY = gauss() * k * 0.45;
    this.aimH = 1.35; if (d < 30) { this.aimH = 1.75; return; }
    if (Math.random() < this.D.weak) { const rel = Math.abs(angDiff(e.heading, Math.atan2(t.x - e.x, t.z - e.z))); this.aimH = rel < 0.7 ? 0.68 : rel < 2.2 ? 0.95 : 1.0; }
  }
  think() {
    const t = this.t, G = this.G;
    if (t.needsRepair() && !t.repair && !t.fire && (t.disabled() || !this.target)) { this.mode = 'halt'; this.holdT = 1; t.startRepair(); }
    // pick a target we can actually see
    let best = null, bs = 1e9;
    for (const e of G.tanks) { if (e.team === t.team || !e.alive || !G.sees(t, e)) continue; const s = Math.hypot(e.x - t.x, e.z - t.z) - (e === this.target ? 45 : 0) - (e === t.lastHitBy ? 30 : 0); if (s < bs) { bs = s; best = e; } }
    if (best !== this.target) { this.target = best; if (best) { this.reactT = this.D.react * rand(0.7, 1.4); this.newAim(); } }
    if (best) this.lastSeen = { x: best.x, z: best.z, t: G.time };
    if (this.mode === 'back') return;
    if (this.target) {
      if (!t.gunOk()) { this.mode = 'back'; this.backT = 2; this.backSteer = 0; return; }
      const d = Math.hypot(this.target.x - t.x, this.target.z - t.z);
      if (d < 11 && t.canDrive()) { this.mode = 'back'; this.backT = 1.2; this.backSteer = rand(-0.5, 0.5); return; }
      if (this.pushT > 0) this.mode = 'travel';
      else if (t.reloadT < 1.2 || this.after === 'hold') this.mode = 'halt';
      else if (this.after === 'push') this.mode = 'travel';
    } else if (this.holdT <= 0) this.mode = 'travel';
    // choose where to go
    let goal = this.roleGoal();
    if (!this.target && this.lastSeen && G.time - this.lastSeen.t < 10 && this.role !== 'cap') goal = this.lastSeen;
    if (this.target && this.role !== 'cap' && this.role !== 'guard') goal = { x: this.target.x, z: this.target.z };
    if (!this.goal || Math.hypot(goal.x - this.goal.x, goal.z - this.goal.z) > 8) { this.goal = goal; this.path = null; }
  }
  update(dt) {
    const t = this.t, G = this.G, c = t.ctl;
    if (!t.alive) return;
    this.thinkT -= dt; this.repathT -= dt; this.reactT -= dt; this.holdT -= dt; this.pushT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.22; this.think(); }
    c.throttle = 0; c.steer = 0; c.brake = false;
    const e = this.target && this.target.alive ? this.target : null;
    // ---- drive
    if (this.mode === 'back') {
      c.throttle = -1; c.steer = this.backSteer; this.backT -= dt;
      if (this.backT <= 0) { this.mode = e ? 'halt' : 'travel'; this.path = null; this.holdT = e ? 0 : rand(0.5, 2); if (!e && this.holdT > 0) this.mode = 'halt'; }
    } else if (this.mode === 'halt' || !this.goal) {
      c.brake = true;
      const face = e ? Math.atan2(e.x - t.x, e.z - t.z) : null;
      if (face !== null) { const er = angDiff(t.heading, face + this.s * 0.2); if (Math.abs(er) > 0.12) c.steer = clamp(er * 2, -1, 1); }
    } else {
      if (!this.path || this.repathT <= 0) { this.path = G.nav.path(t.x, t.z, this.goal.x, this.goal.z); this.pi = 1; this.repathT = rand(3.5, 6); }
      const P = this.path;
      if (P && this.pi < P.length) {
        let wp = P[this.pi], d = Math.hypot(wp.x - t.x, wp.z - t.z);
        if (d < 5.5 && this.pi < P.length - 1) { this.pi++; wp = P[this.pi]; d = Math.hypot(wp.x - t.x, wp.z - t.z); }
        const last = this.pi === P.length - 1;
        if (last && d < 5) { // arrived
          if (this.ri < this.route.length && Math.hypot(this.route[this.ri].x - t.x, this.route[this.ri].z - t.z) < 9) this.ri++;
          c.brake = true; this.path = null; this.goal = null;
        } else {
          const er = angDiff(t.heading, Math.atan2(wp.x - t.x, wp.z - t.z));
          c.steer = clamp(er * 2.4, -1, 1);
          c.throttle = Math.abs(er) > 1.1 ? 0.12 : Math.abs(er) > 0.5 ? 0.55 : 1;
          if (last && d < 14) c.throttle = Math.min(c.throttle, 0.45);
          // traffic: do not ram friends, steer around wrecks
          const fx = Math.sin(t.heading), fz = Math.cos(t.heading);
          for (const o of G.tanks) {
            if (o === t) continue; const rx = o.x - t.x, rz = o.z - t.z, dd = Math.hypot(rx, rz); if (dd > 13) continue;
            const ahead = (rx * fx + rz * fz) / dd, side = rx * fz - rz * fx;
            if (ahead > 0.55) { if (o.alive && o.team === t.team && Math.abs(o.speed) > 1.5 && dd > 7) c.throttle = Math.min(c.throttle, 0.3); else { c.steer = clamp(c.steer + (side > 0 ? -0.9 : 0.9), -1, 1); c.throttle = Math.min(c.throttle, 0.6); } }
          }
          if (c.throttle > 0.3 && Math.abs(t.speed) < 0.7 && t.canDrive()) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
          if (this.stuckT > 1.5) { this.stuckT = 0; this.mode = 'back'; this.backT = rand(1.1, 1.8); this.backSteer = Math.random() < 0.5 ? 0.8 : -0.8; }
        }
      } else if (!P) { this.goal = null; }
    }
    // ---- gun
    if (e) {
      const d = Math.hypot(e.x - t.x, e.z - t.z), ft = d / t.shell().v, ex = e.x + Math.sin(e.heading) * e.speed * ft, ez = e.z + Math.cos(e.heading) * e.speed * ft;
      const px = -(ez - t.z) / (d || 1), pz = (ex - t.x) / (d || 1), ax = ex + px * this.errX, az = ez + pz * this.errX, ay = e.y + this.aimH + this.errY;
      t.aimAt(ax, ay, az);
      this.why = this.reactT > 0 ? 'react' : !t.canFire() ? 'cantfire' : t.disp >= t.def.disp * this.D.settle ? 'disp' : !G.sees(t, e) ? 'nosee' : '';
      if (!this.why) {
        const mx = ax - t.muzzle.x, my = ay - t.muzzle.y, mz = az - t.muzzle.z, ml = Math.hypot(mx, my, mz) || 1, dot = (mx * t.gunDir.x + my * t.gunDir.y + mz * t.gunDir.z) / ml;
        const aligned = dot > Math.cos(Math.max(0.004, 1.0 / ml)), clr = aligned && this.clear(ax, az, ml), open = clr && this.openLine(ml);
        this.why = !aligned ? 'align ' + Math.acos(Math.min(1, dot)).toFixed(4) : !clr ? 'friend' : !open ? 'wall' : '';
        // a wall or a wreck is in the way: stop wasting rounds and go and find an angle
        if (aligned && clr && !open) { this.blockT += dt; if (this.blockT > 2.5 && t.canDrive()) { this.blockT = 0; this.after = 'push'; this.mode = 'travel'; this.pushT = 3; } } else this.blockT = 0;
        if (open && t.tryFire(G)) {
          this.newAim(); this.reactT = rand(0.2, 0.6);
          const r = Math.random(), peek = this.role === 'guard' ? 0.2 : 0.4;
          if (r < peek && t.canDrive()) { this.mode = 'back'; this.backT = rand(1.0, 1.9); this.backSteer = rand(-0.3, 0.3); this.after = null; }
          else this.after = r < 0.75 ? 'hold' : 'push';
        }
      } else this.blockT = 0;
    } else {
      const ls = this.lastSeen && G.time - this.lastSeen.t < 12 ? this.lastSeen : null;
      if (ls) t.aimAt(ls.x, t.y + 1.4, ls.z); else { t.aimYaw = t.heading; t.aimPitch = 0; }
    }
  }
  // nothing solid between the muzzle and the target along the bore
  openLine(len) {
    const t = this.t, G = this.G, o = t.muzzle, d = t.gunDir;
    if (G.world.col.raycast(o.x, o.y, o.z, d.x, d.y, d.z, len - 4)) return false;
    const pr = G.world.props.raycast(o.x, o.y, o.z, d.x, d.y, d.z, len - 4); if (pr && pr.it.kind === 'bus') return false;
    for (const w of G.tanks) { if (w.alive || w === t) continue; const rx = w.x - o.x, rz = w.z - o.z, al = rx * d.x + rz * d.z; if (al > 0 && al < len - 4 && Math.abs(rx * d.z - rz * d.x) < 2.2) return false; }
    return true;
  }
  // no friend standing in the line of fire
  clear(ax, az, len) {
    const t = this.t, dx = (ax - t.muzzle.x) / len, dz = (az - t.muzzle.z) / len;
    for (const o of this.G.tanks) { if (o === t || o.team !== t.team) continue; const rx = o.x - t.muzzle.x, rz = o.z - t.muzzle.z, along = rx * dx + rz * dz; if (along < 0 || along > len) continue; if (Math.abs(rx * dz - rz * dx) < 3.2) return false; }
    return true;
  }
}
