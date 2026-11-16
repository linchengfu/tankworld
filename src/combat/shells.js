// Shells in flight: ballistic integration, hit tests against the city, props, ground and tanks, and the tracer meshes.
import * as THREE from 'three';
import { traceTank, resolveImpact, splash } from './damage.js';

const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3(), UP = new THREE.Vector3(0, 0, 1);
const TRACER = { ap: [3.2, 2.6, 1.8], heat: [3.4, 1.5, 0.5], he: [3.4, 1.0, 0.4] };

export class Shells {
  constructor(scene) {
    this.list = []; this.pool = [];
    const geo = new THREE.CylinderGeometry(0.035, 0.11, 1, 6, 1, true); geo.rotateX(Math.PI / 2); geo.translate(0, 0, -0.5);
    this.geo = geo; this.scene = scene;
  }
  mesh(type) {
    let m = this.pool.pop();
    if (!m) { m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); m.frustumCulled = false; this.scene.add(m); }
    const c = TRACER[type]; m.material.color.setRGB(c[0], c[1], c[2]); m.visible = true; return m;
  }
  spawn(owner, pos, dir, shell) {
    this.list.push({ owner, shell, p: pos.clone(), v: dir.clone().multiplyScalar(shell.v), dist: 0, t: 0, mesh: this.mesh(shell.type), start: pos.clone() });
  }
  clear() { for (const s of this.list) { s.mesh.visible = false; this.pool.push(s.mesh); } this.list.length = 0; }

  update(dt, G) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i]; let done = false, left = dt;
      // sub-step so a 1.7 km/s round cannot skip a thin plate
      while (left > 1e-5 && !done) {
        const h = Math.min(left, 0.008); left -= h;
        s.v.y -= 9.81 * h;
        const len = s.v.length() * h; _d.copy(s.v).normalize();
        done = this.step(s, _d, len, G);
        if (!done) { s.p.addScaledVector(_d, len); s.dist += len; s.t += h; if (s.t > 3.5 || s.p.y < -3 || Math.abs(s.p.x) > 900 || Math.abs(s.p.z) > 900) done = true; }
      }
      if (done) { s.mesh.visible = false; this.pool.push(s.mesh); this.list.splice(i, 1); continue; }
      const tl = Math.min(s.dist, 26 + s.shell.v * 0.012); s.mesh.position.copy(s.p); s.mesh.quaternion.setFromUnitVectors(UP, _d.copy(s.v).normalize()); s.mesh.scale.set(1, 1, tl);
    }
  }

  // Advance one segment; returns true when the shell is spent.
  step(s, d, len, G) {
    const W = G.world, o = s.p, he = s.shell.type === 'he';
    let best = len, what = null, data = null;
    const wall = W.col.raycast(o.x, o.y, o.z, d.x, d.y, d.z, len); if (wall && wall.t < best) { best = wall.t; what = 'wall'; data = wall; }
    const pr = W.props.raycast(o.x, o.y, o.z, d.x, d.y, d.z, best); if (pr && pr.t < best) { best = pr.t; what = 'prop'; data = pr; }
    if (d.y < 0) { const gy = W.heightAt(o.x + d.x * best, o.z + d.z * best) + 0.02, t = (gy - o.y) / d.y; if (t >= 0 && t < best) { best = t; what = 'ground'; } }
    for (const tk of G.tanks) {
      if (tk === s.owner) continue;
      const hits = traceTank(tk, o, d, best); if (hits && hits[0].t < best) { best = hits[0].t; what = 'tank'; data = { tk, hits }; }
    }
    if (!what) return false;
    _p.copy(o).addScaledVector(d, best);
    if (what === 'wall') { _n.set(data.nx, data.ny, data.nz); G.fx.impactWall(_p, _n, he); G.audio.impact(_p, he ? 'he' : 'wall'); if (he) this.blast(s, _p, G); }
    else if (what === 'ground') { G.fx.impactGround(_p, he); G.audio.impact(_p, he ? 'he' : 'dirt'); if (he) this.blast(s, _p, G); }
    else if (what === 'prop') {
      const it = data.it; W.props.kill(it, d.x, d.z, true); G.fx.fireball(_p.x, _p.y + 0.5, _p.z, 1.6); G.fx.debris(_p.x, _p.y + 0.5, _p.z, 14, 9, 0.25); G.fx.smoke(_p.x, _p.y + 1, _p.z, 6, { grey: 0.2, size: 1.4, life: 3 });
      G.audio.impact(_p, 'he'); if (he) this.blast(s, _p, G);
      if (s.shell.type === 'ap' && it.kind !== 'bus') return false; // a penetrator goes straight through light cover
    } else {
      const { tk, hits } = data;
      if (!tk.alive || tk.team === s.owner.team) { // wrecks and friends just stop the round
        _n.copy(d).negate(); G.fx.impactTank(_p, _n, d, 'nopen', s.shell.type); G.audio.impact(_p, 'clang');
      } else {
        const res = resolveImpact(tk, s.shell, hits, s.dist + best);
        if (res.normal) { _n.set(res.normal[0], res.normal[1], res.normal[2]).transformDirection(res.part === 'hull' ? tk.hullMat : tk.turretMat); } else _n.copy(d).negate();
        res.point = _p.clone(); res.dir = d.clone(); res.range = s.dist + best; res.by = s.owner;
        G.fx.impactTank(_p, _n, d, res.kind, s.shell.type);
        tk.kick(d.x, d.z, res.kind === 'pen' ? 0.5 : 0.8);
        G.onShellHit(s, res);
      }
    }
    return true;
  }
  blast(s, p, G) { for (const tk of G.tanks) { if (tk === s.owner || !tk.alive || tk.team === s.owner.team) continue; const r = splash(tk, p.x, p.y, p.z, 3.2); if (r) { r.point = p.clone(); r.by = s.owner; r.range = s.dist; G.onShellHit(s, r); } } }
}
