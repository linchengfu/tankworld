// Battle orchestration: teams, the per-frame simulation order, spotting, the capture point, win conditions,
// the chase / gunner-sight camera, and the glue between tanks, shells, effects, audio and HUD.
import * as THREE from 'three';
import { clamp, damp, rand, randPick, shuffle, TAU } from './core/util.js';
import { TANKS, tankById } from './data/tanks.js';
import { Tank } from './tank/tank.js';
import { buildTankModel } from './tank/model.js';
import { Shells } from './combat/shells.js';
import { traceTank, previewShot } from './combat/damage.js';
import { AI } from './ai/ai.js';
import { Nav } from './ai/nav.js';
import { REASON } from './ui/hud.js';

const ALLY = ['猎鹰', '山猫', '雪豹', '铁锤', '长城', '惊雷', '北风'], ENEMY = ['Viper', 'Hammer', 'Bison', 'Raven', 'Kodiak', 'Mamba', 'Jackal'];
const ROLES_A = ['cap', 'mid', 'west', 'guard', 'east', 'river'], ROLES_E = ['cap', 'mid', 'west', 'guard', 'east', 'river', 'mid'];
const _d = new THREE.Vector3(), _o = new THREE.Vector3(), _a = new THREE.Vector3();

class TankCamera {
  constructor(cam) { this.cam = cam; this.yaw = 0; this.pitch = -0.1; this.dist = 14; this.distT = 14; this.sniper = false; this.zi = 0; this.aim = new THREE.Vector3(); this.dir = new THREE.Vector3(0, 0, 1); }
  zoomX() { return [3, 6, 12][this.zi]; }
  reset(t) { this.yaw = t.heading; this.pitch = -0.08; this.sniper = false; this.distT = 14; }
  look(dx, dy, sens) { const k = sens * 0.0023 * (this.sniper ? this.cam.fov / 60 : 1); this.yaw -= dx * k; this.pitch = clamp(this.pitch - dy * k, this.sniper ? -0.3 : -0.7, this.sniper ? 0.4 : 0.42); }
  wheel(d) {
    if (this.sniper) { if (d > 0) this.zi = Math.min(2, this.zi + 1); else if (this.zi > 0) this.zi--; else this.sniper = false; }
    else if (d > 0) { if (this.distT <= 9.5) { this.sniper = true; this.zi = 0; } else this.distT = Math.max(9, this.distT / 1.3); } else this.distT = Math.min(32, this.distT * 1.3);
  }
  toggle() { this.sniper = !this.sniper; this.zi = 0; }
  update(dt, t, G) {
    const cam = this.cam, cp = Math.cos(this.pitch), dir = this.dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp), g = t.def.geo;
    let fov, start;
    if (this.sniper && t.alive) {
      const ty = t.heading + t.turretYaw; cam.position.set(t.x + Math.sin(ty) * 0.9, t.y + g.hullH + g.turret.h + 0.42, t.z + Math.cos(ty) * 0.9); fov = 60 / this.zoomX(); start = 4;
    } else {
      this.dist = damp(this.dist, this.distT, 8, dt);
      const ph = 2.5 + this.dist * 0.17; _o.set(t.x, t.y + ph, t.z);
      let d = this.dist; const hit = G.world.col.raycast(_o.x, _o.y, _o.z, -dir.x, -dir.y, -dir.z, d + 0.8); if (hit) d = Math.max(2.5, hit.t - 0.8);
      cam.position.copy(_o).addScaledVector(dir, -d); if (cam.position.y < 0.7) cam.position.y = 0.7; fov = 62; start = d + 4.5;
    }
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = damp(cam.fov, fov, 14, dt); cam.updateProjectionMatrix(); }
    _a.copy(cam.position).add(dir); cam.up.set(0, 1, 0); cam.lookAt(_a);
    const sh = G.fx.shake; if (sh > 0.01) { cam.position.x += (Math.random() - 0.5) * sh * 0.35; cam.position.y += (Math.random() - 0.5) * sh * 0.35; cam.rotateZ((Math.random() - 0.5) * sh * 0.02); }
    // what the crosshair is resting on
    _o.copy(cam.position).addScaledVector(dir, start);
    let best = 600; const w = G.world.col.raycast(_o.x, _o.y, _o.z, dir.x, dir.y, dir.z, best); if (w) best = w.t;
    if (dir.y < -1e-4) { const tg = -(_o.y - 0.1) / dir.y; if (tg > 0 && tg < best) best = tg; }
    for (const o of G.tanks) { if (o === t) continue; const h = traceTank(o, _o, dir, best); if (h && h[0].t < best) best = h[0].t; }
    this.aim.copy(_o).addScaledVector(dir, best); G.aimDist = best + start - (this.sniper ? 0 : this.dist);
  }
}

export class Game {
  constructor(o) {
    Object.assign(this, o); // gfx, world, audio, hud, input, fx, settings, menu
    this.scene = this.gfx.scene; this.tanks = []; this.ais = []; this.shells = new Shells(this.scene); this.nav = null;
    this.cam = new TankCamera(this.gfx.camera); this.state = 'garage'; this.paused = false; this.time = 0; this.timeLeft = 0;
    this.cap = { team: -1, pts: 0, contested: false }; this.gunPoint = new THREE.Vector3(); this.aimDist = 100; this.pen = null; this.penT = 0; this.spotT = 0; this.los = null;
    this.show = null; this.gYaw = 0.6; this.ambT = 0; this.player = null; this.view = null; this.specT = 0; this.overT = 0; this.capTick = 0; this.capWarn = 0;
    // capture ring that glows in the owner's colour
    const rg = new THREE.RingGeometry(this.world.cap.r - 0.5, this.world.cap.r + 0.15, 72); rg.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xf2b33d, transparent: true, opacity: 0.55, depthWrite: false })); this.ring.position.set(this.world.cap.x, 0.06, this.world.cap.z); this.scene.add(this.ring);
    const bg = new THREE.CylinderGeometry(this.world.cap.r, this.world.cap.r, 9, 72, 1, true);
    this.beam = new THREE.Mesh(bg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uC: { value: new THREE.Color(0xf2b33d) } }, vertexShader: 'varying float vy; void main(){ vy = position.y / 9.0 + 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: 'uniform vec3 uC; varying float vy; void main(){ float a = pow(1.0 - vy, 3.0) * 0.06; gl_FragColor = vec4(uC * a, 1.0); }' }));
    this.beam.position.set(this.world.cap.x, 4.5, this.world.cap.z); this.scene.add(this.beam); this.ring.userData.noAO = this.beam.userData.noAO = true;
  }

  // ---------------------------------------------------------------- garage
  showTank(def) {
    if (this.show) { this.scene.remove(this.show.root); this.show.dispose(); }
    const s = this.world.showcase; this.show = buildTankModel(def); this.show.root.position.set(s.x, 0, s.z); this.show.root.rotation.y = s.h; this.show.turret.rotation.y = 0.35; this.show.gun.rotation.x = -0.06; this.scene.add(this.show.root); this.showDef = def;
  }
  toGarage() {
    this.clearBattle(); this.state = 'garage'; this.paused = false; this.hud.show(false); this.input.active = false; this.input.unlock(); this.audio.engine(null, 0);
    this.showTank(tankById(this.settings.tank) || TANKS[0]); this.menu.garage(true); this.gfx.lens.uDead.value = 0; this.gfx.lens.uScope.value = 0; this.ring.visible = this.beam.visible = false;
    if (this.gfx.camera.fov !== 42) { this.gfx.camera.fov = 42; this.gfx.camera.updateProjectionMatrix(); }
  }
  clearBattle() {
    for (const t of this.tanks) { this.scene.remove(t.model.root); if (t.toss) this.scene.remove(t.model.turret); t.model.dispose(); }
    this.tanks = []; this.ais = []; this.shells.clear(); this.player = this.view = null;
  }

  // ---------------------------------------------------------------- battle
  start() {
    const S = this.settings, n = S.size, W = this.world;
    if (this.show) { this.scene.remove(this.show.root); this.show.dispose(); this.show = null; }
    this.clearBattle(); if (!this.nav) this.nav = new Nav(W);
    const pick = () => randPick(TANKS), names = [shuffle(ALLY.slice()), shuffle(ENEMY.slice())];
    let id = 0;
    for (let team = 0; team < 2; team++) for (let i = 0; i < n; i++) {
      const sp = W.spawns[team][i], me = team === 0 && i === 0, def = me ? tankById(S.tank) : pick();
      const t = new Tank(def, team, { id: id++, x: sp.x, z: sp.z, h: sp.h, isPlayer: me, name: me ? '你' : names[team][i] + '-' + (i + 1) });
      t.lastX = t.x; t.lastZ = t.z; this.scene.add(t.model.root); this.tanks.push(t);
      if (me) this.player = t; else this.ais.push(new AI(t, this, team === 0 ? ROLES_A[(i - 1) % ROLES_A.length] : ROLES_E[i % ROLES_E.length], team === 0 ? 'normal' : S.diff));
    }
    this.N = this.tanks.length; this.los = new Uint8Array(this.N * this.N);
    this.view = this.player; this.cam.reset(this.player); this.state = 'battle'; this.paused = false; this.time = 0; this.timeLeft = 480; this.count = 4; this.overT = 0; this.result = null; this.shown = false;
    this.cap = { team: -1, pts: 0, contested: false }; this.ring.visible = this.beam.visible = true;
    this.menu.garage(false); this.menu.modal('m-result', false); this.menu.modal('m-pause', false); this.hud.setup(this); this.hud.show(true); this.input.active = true; this.input.take(); this.input.look();
    this.hud.banner('准备战斗', '占领世纪大道据点，或歼灭全部敌军', 3.6); this.hud.hint(this.input.touch ? '左摇杆行驶 · 右侧滑动瞄准 · 点“开火”射击' : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 行驶 · 鼠标瞄准 · 左键开火 · <kbd>Shift</kbd> 瞄准镜 · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> 换弹', 9); this.gfx.lens.uDead.value = 0;
  }
  pause(on) {
    if (this.state === 'garage' || this.result) return; this.paused = on; this.pauseAt = performance.now(); this.input.take(); this.menu.modal('m-pause', on); this.audio.suspend(on);
    if (on) this.input.unlock(); else if (!this.input.touch) this.input.lock();
    this.input.active = !on; this.input.fire = false;
  }

  // ---- hooks called by tanks / shells / AI
  sees(a, b) { return this.los[a.id * this.N + b.id] === 1; }
  spawnShell(owner, pos, dir, shell) { this.shells.spawn(owner, pos, dir, shell); }
  onFire(t) { this.fx.muzzle(t.muzzle, t.gunDir); this.audio.cannon(t.muzzle, t === this.view); if (t === this.view) this.fx.shake = Math.min(1.2, this.fx.shake + 0.55); t.seenT = this.time; t.lastX = t.x; t.lastZ = t.z; }
  onReloaded(t) { if (t === this.player) this.audio.reloaded(t.def.autoloader); }
  onBump(t, v) { if (t === this.view) { this.audio.crunch(t.muzzle, 'barrier'); this.fx.shake = Math.min(1, this.fx.shake + v * 0.03); } }
  onCrush(t, it) { this.fx.crush(it.x, it.y, it.z, it.kind); this.audio.crunch(it, it.kind); }
  onNote(t, what) { if (t !== this.player) return; if (what === 'fireout') this.hud.hint('火已扑灭', 2.5); else if (what === 'repaired') this.hud.hint('维修完成', 2.5); }
  onTurretLand(t, p) { this.fx.smoke(p.x, p.y, p.z, 8, { grey: 0.3, size: 1.6, speed: 3 }); this.fx.sparks(p.x, p.y, p.z, 20, 0, 1, 0, 9); this.audio.crunch(p, 'car'); this.fx.addShake(p.x, p.y, p.z, 0.5); }
  onShellHit(s, res) {
    const t = res.tank, by = res.by, me = this.player;
    this.audio.armour(res.point, res.kind, t === this.view);
    by.stats.hits++; t.stats.taken++; t.lastHitBy = by;
    if (res.kind === 'pen') by.stats.pens++; else if (res.kind === 'nopen' || res.kind === 'ricochet') t.stats.bounced++;
    by.seenT = this.time; by.lastX = by.x; by.lastZ = by.z;
    if (res.blowout) { const p = new THREE.Vector3(0, t.def.geo.turret.h, t.def.geo.turret.prof[t.def.geo.turret.prof.length - 1][0] + 0.6).applyMatrix4(t.turretMat); this.fx.blowout(p.x, p.y, p.z); this.audio.explosion(p, 0.6); }
    if (res.killed) this.onTankDestroyed(t, t.deadReason, by);
    if (by === me) { this.hud.hitResult(res); if (res.kind !== 'he' || res.dmg.length) this.hud.hitCam(res); if (res.killed) this.audio.ui('kill'); }
    if (t === me) {
      this.gfx.lens.uHit.value = 1; this.fx.shake = Math.min(1.4, this.fx.shake + (res.kind === 'pen' ? 1 : 0.6));
      if (res.dir) this.hud.damageDir(-(Math.atan2(-res.dir.x, -res.dir.z) - this.cam.yaw));
      if (t.alive) { const lost = res.dmg.filter((d) => d.after <= 0 && d.before > 0).map((d) => d.label); if (res.kind === 'pen') this.hud.banner('被击穿', lost.length ? lost.join(' · ') + (res.fire ? ' · 起火' : '') : res.fire ? '起火' : '', 2.2); if (res.fire || lost.length) this.audio.ui('warn'); }
    }
    // being hit while capturing knocks progress back
    if (res.kind === 'pen' && this.cap.team === t.team && this.inCap(t)) this.cap.pts = Math.max(0, this.cap.pts - 18);
    const ai = this.ais.find((a) => a.t === t); if (ai && !ai.target) ai.lastSeen = { x: by.x, z: by.z, t: this.time };
  }
  onTankDestroyed(t, reason, by) {
    const big = reason === 'ammo';
    this.fx.explosion(t.x, t.y + 1.4, t.z, big ? 1.5 : 0.9); this.audio.explosion(t, big ? 1.3 : 0.9);
    if (by) by.stats.kills++;
    const a = by ? `<span class="${by.team === 0 ? 'a' : 'e'}">${by.name}</span> 击毁 ` : '', b = `<span class="${t.team === 0 ? 'a' : 'e'}">${t.name}</span>`;
    this.hud.feed(`${a}${b}<em>${t.def.name} · ${REASON[reason]}</em>`);
    if (t === this.player) { this.hud.dead(reason, by); this.specT = 3; this.cam.sniper = false; this.input.fire = false; }
  }
  inCap(t) { const c = this.world.cap; return t.alive && Math.hypot(t.x - c.x, t.z - c.z) < c.r; }

  // ---------------------------------------------------------------- frame
  update(dt) {
    const fx = this.fx, W = this.world, cam = this.gfx.camera;
    if (this.state === 'garage') { this.updateGarage(dt); }
    else if (this.paused) { for (const [ev] of this.input.take()) if (ev === 'pause' && performance.now() - this.pauseAt > 400 && !this.menu.anyModal()) { this.pause(false); break; } }
    else if (!this.paused) {
      const sim = this.result ? dt * 0.35 : dt;
      this.handleInput(dt);
      this.time += sim; if (this.count > 0) { this.count -= dt; if (this.count <= 0) { this.hud.banner('战斗开始', '', 1.6); this.audio.ui('select'); } }
      const live = this.count <= 0;
      if (live && !this.result) this.timeLeft -= sim;
      if (live) for (const a of this.ais) a.update(sim);
      for (const t of this.tanks) { if (!live) { t.ctl.throttle = 0; t.ctl.steer = 0; t.ctl.brake = true; } t.update(sim, this); }
      this.collideTanks();
      this.shells.update(sim, this);
      if ((this.spotT -= sim) <= 0) { this.spotT = 0.25; this.spot(); }
      if (live && !this.result) { this.updateCap(sim); this.checkEnd(); }
      // effects that follow tanks
      for (const t of this.tanks) {
        fx.trackDust(t, sim);
        if (!t.alive && t.burn > 0) { if ((t.fireTick -= sim) <= 0) { t.fireTick = 0.07; fx.burning(t.x + rand(-1, 1), t.y + 1.3, t.z + rand(-1, 1), 1.25, Math.random() < 0.6); } }
        else if (t.alive && t.fire) { if ((t.fireTick -= sim) <= 0) { t.fireTick = 0.09; const g = t.def.geo; fx.burning(t.x - Math.sin(t.heading) * g.L * 0.3, t.y + g.hullH + 0.2, t.z - Math.cos(t.heading) * g.L * 0.3, 0.8, Math.random() < 0.5); } }
      }
      // camera + aim
      const v = this.view;
      if (v) {
        this.cam.update(dt, v, this);
        const p = this.player;
        if (p.alive && v === p) { p.ctl.hold = this.input.free; if (!this.input.free) p.aimAt(this.cam.aim.x, this.cam.aim.y, this.cam.aim.z); this.gunRay(dt); }
      }
      if (!this.player.alive && (this.specT -= dt) <= 0 && this.view === this.player) this.spectate();
      this.gfx.lens.uHit.value = Math.max(0, this.gfx.lens.uHit.value - dt * 2.2);
      this.gfx.lens.uDead.value = damp(this.gfx.lens.uDead.value, this.player.alive ? 0 : 0.8, 3, dt);
      this.gfx.lens.uScope.value = this.cam.sniper ? 1 : 0;
      if (this.player.alive) this.player.model.root.visible = !(this.cam.sniper && this.view === this.player);
      this.audio.engine(this.view && this.view.alive ? this.view : null, dt);
      this.hud.update(this, dt);
      if (this.result && (this.overT -= dt) <= 0 && !this.shown) { this.shown = true; this.input.active = false; this.input.unlock(); this.menu.result(this.result); this.audio.ui(this.result.outcome === 'win' ? 'win' : 'lose'); this.audio.engine(null, 0); }
    }
    if (this.paused) return;
    // ambient fires and distant smoke
    if ((this.ambT -= dt) <= 0) {
      this.ambT = 0.09;
      for (const f of W.fires) if (Math.hypot(f.x - cam.position.x, f.z - cam.position.z) < 280) fx.burning(f.x, f.y, f.z, 0.9, Math.random() < 0.55);
      if (Math.random() < 0.35) { const p = randPick(W.plumes); fx.plume(p.x, p.y, p.z, p.size); }
    }
    W.update(dt); fx.update(dt, cam.position);
    const L = this.audio.listener; L.x = cam.position.x; L.y = cam.position.y; L.z = cam.position.z; _d.set(1, 0, 0).applyQuaternion(cam.quaternion); L.rx = _d.x; L.rz = _d.z;
    const fwd = this.cam.dir; this.gfx.focus(cam.position.x + fwd.x * 45, cam.position.z + fwd.z * 45);
  }

  updateGarage(dt) {
    const s = this.world.showcase, cam = this.gfx.camera, [dx] = this.input.look();
    this.gYaw += dt * 0.07 + (this.drag ? dx * 0.005 : 0);
    const narrow = window.innerWidth < 760, tall = narrow && window.innerHeight > window.innerWidth, r = tall ? 30 : 15.5;
    cam.position.set(s.x + Math.sin(this.gYaw) * r, tall ? 5 : 3.3, s.z + Math.cos(this.gYaw) * r); cam.up.set(0, 1, 0); cam.lookAt(s.x, tall ? -3.5 : narrow ? 3.2 : 2.3, s.z);
    this.cam.dir.set(-Math.sin(this.gYaw), 0, -Math.cos(this.gYaw));
  }

  handleInput(dt) {
    const I = this.input, p = this.player, S = this.settings, [dx, dy] = I.look();
    this.cam.look(dx, dy, S.sens);
    for (const [ev, arg] of I.take()) {
      if (ev === 'pause') { this.pause(true); return; }
      if (this.result) continue;
      if (ev === 'wheel') { this.cam.wheel(arg); this.audio.ui('zoom'); }
      else if (ev === 'zoom') { if (p.alive) { this.cam.toggle(); this.audio.ui('zoom'); } }
      else if (ev === 'click') { if (!p.alive && this.specT <= 0) this.spectate(); }
      else if (!p.alive) continue;
      else if (ev === 'shell') { const i = arg < 0 ? (p.loaded + 1) % 3 : arg; if (p.selectShell(i)) this.audio.ui('select'); }
      else if (ev === 'repair') { if (p.startRepair()) this.hud.hint('战地维修中，保持停车', 3); else if (p.needsRepair()) this.hud.hint(p.fire ? '先等火扑灭' : '先把车停稳', 2); }
    }
    if (p.alive && this.count <= 0 && !this.result) {
      const a = I.axes(); p.ctl.throttle = a.throttle; p.ctl.steer = a.steer; p.ctl.brake = a.brake;
      if (I.fire && p.canFire()) p.tryFire(this);
    } else if (p.alive) { p.ctl.throttle = 0; p.ctl.steer = 0; p.ctl.brake = true; }
  }

  // where the barrel is actually pointing, and whether the loaded round would go through what it points at
  gunRay(dt) {
    const p = this.player, o = p.muzzle, d = p.gunDir; let best = 600, hitTank = null, hits = null;
    const w = this.world.col.raycast(o.x, o.y, o.z, d.x, d.y, d.z, best); if (w) best = w.t;
    if (d.y < -1e-4) { const tg = -(o.y - 0.1) / d.y; if (tg > 0 && tg < best) best = tg; }
    for (const t of this.tanks) { if (t === p) continue; const h = traceTank(t, o, d, best); if (h && h[0].t < best) { best = h[0].t; hitTank = t; hits = h; } }
    this.gunPoint.copy(o).addScaledVector(d, Math.min(best, Math.max(this.aimDist, 25)));
    this.pen = hitTank && hitTank.alive && hitTank.team !== p.team ? previewShot(hitTank, p.shell(), hits, best) : null;
  }

  spot() {
    const T = this.tanks, N = this.N, col = this.world.col; this.los.fill(0);
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const a = T[i], b = T[j]; if (a.team === b.team || !a.alive || !b.alive) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) < 470 && col.los(a.x, a.z, b.x, b.z)) { this.los[i * N + j] = this.los[j * N + i] = 1; a.seenT = b.seenT = this.time; a.lastX = a.x; a.lastZ = a.z; b.lastX = b.x; b.lastZ = b.z; }
    }
  }
  collideTanks() {
    const T = this.tanks;
    for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
      const a = T[i], b = T[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), R = 5.3; if (d >= R || d < 1e-3) continue;
      const nx = dx / d, nz = dz / d, pen = R - d, ka = a.alive ? (b.alive ? 0.5 : 1) : 0, kb = b.alive ? (a.alive ? 0.5 : 1) : 0;
      a.x -= nx * pen * ka; a.z -= nz * pen * ka; b.x += nx * pen * kb; b.z += nz * pen * kb; a.speed *= 0.9; b.speed *= 0.9;
    }
  }
  updateCap(dt) {
    const c = this.cap; let n0 = 0, n1 = 0;
    for (const t of this.tanks) if (this.inCap(t)) { if (t.team === 0) n0++; else n1++; }
    c.contested = n0 > 0 && n1 > 0;
    if (!c.contested && (n0 || n1)) {
      const team = n0 ? 0 : 1, n = n0 || n1, rate = n === 1 ? 1.25 : n === 2 ? 2.0 : 2.6;
      if (c.team !== team && c.pts > 0) { c.pts -= rate * 2 * dt; if (c.pts <= 0) { c.pts = 0; c.team = team; } } else { c.team = team; c.pts = Math.min(100, c.pts + rate * dt); }
      if ((this.capTick -= dt) <= 0) { this.capTick = 1; if (team === 0) this.audio.ui('cap'); }
      if (team === 1 && c.pts > 30 && this.time - this.capWarn > 20) { this.capWarn = this.time; this.hud.banner('敌方正在占领据点', '回防世纪大道路口', 3); this.audio.ui('warn'); }
    } else if (!n0 && !n1 && c.pts > 0) { c.pts = Math.max(0, c.pts - 1.5 * dt); if (c.pts === 0) c.team = -1; }
    const col = c.pts > 0.5 ? (c.team === 0 ? 0x5fd693 : 0xf0523c) : 0xf2b33d; this.ring.material.color.set(col); this.beam.material.uniforms.uC.value.set(col);
  }
  checkEnd() {
    let a = 0, e = 0; for (const t of this.tanks) if (t.alive) { if (t.team === 0) a++; else e++; }
    let out = null, why = '';
    if (e === 0) { out = 'win'; why = '敌方坦克已被全部击毁'; } else if (a === 0) { out = 'lose'; why = '我方坦克全部被击毁'; }
    else if (this.cap.pts >= 100) { out = this.cap.team === 0 ? 'win' : 'lose'; why = this.cap.team === 0 ? '我方占领了世纪大道据点' : '敌方占领了世纪大道据点'; }
    else if (this.timeLeft <= 0) { out = 'draw'; why = '战斗超时，双方均未达成目标'; }
    if (out) { this.result = { outcome: out, why, me: this.player, tanks: this.tanks.slice() }; this.overT = 3.2; this.shown = false; this.hud.banner(out === 'win' ? '胜利' : out === 'lose' ? '失败' : '平局', why, 4); }
  }
  spectate() {
    const allies = this.tanks.filter((t) => t.team === 0 && t.alive); if (!allies.length) return;
    const i = allies.indexOf(this.view); this.view = allies[(i + 1) % allies.length]; this.cam.yaw = this.view.heading; this.specT = 0; this.hud.t.xray = 0;
  }
}
