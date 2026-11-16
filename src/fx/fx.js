// Particles (instanced billboards, one alpha layer + one additive layer), a flash light, and the effect recipes
// the game calls: muzzle blast, impacts, explosions, track dust, burning wrecks.
import * as THREE from 'three';
import { particleAtlas } from '../gfx/textures.js';
import { rand, TAU } from '../core/util.js';

const VERT = `
attribute vec3 iPos; attribute vec4 iData; attribute vec4 iCol;
varying vec2 vUv; varying vec4 vCol; varying float vFog;
uniform float uFogD;
void main(){
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  float c = cos(iData.y), s = sin(iData.y); vec2 p = position.xy * iData.x; mv.xy += vec2(p.x*c - p.y*s, p.x*s + p.y*c);
  gl_Position = projectionMatrix * mv;
  float f = iData.z; vUv = uv * 0.5 + vec2(mod(f, 2.0), floor(f * 0.5)) * 0.5;
  vCol = iCol; float d = length(mv.xyz) * uFogD; vFog = 1.0 - exp(-d*d);
}`;
const FRAG_A = `uniform sampler2D uMap; uniform vec3 uFogC; varying vec2 vUv; varying vec4 vCol; varying float vFog;
void main(){ vec4 t = texture2D(uMap, vUv); float a = t.a * vCol.a; if (a < 0.004) discard; gl_FragColor = vec4(mix(vCol.rgb * t.rgb * 0.62, uFogC, vFog * 0.8), a); }`;
const FRAG_B = `uniform sampler2D uMap; varying vec2 vUv; varying vec4 vCol; varying float vFog;
void main(){ vec4 t = texture2D(uMap, vUv); gl_FragColor = vec4(vCol.rgb * t.a * vCol.a * (1.0 - vFog), 1.0); }`;

class Layer {
  constructor(scene, max, additive, atlas, fog) {
    this.max = max; this.n = 0;
    const F = (k) => new Float32Array(max * k);
    this.p = F(3); this.v = F(3); this.life = F(1); this.maxLife = F(1); this.s0 = F(1); this.s1 = F(1); this.rot = F(1); this.rv = F(1); this.frame = F(1);
    this.c = F(3); this.a = F(1); this.drag = F(1); this.grav = F(1); this.fadeIn = F(1);
    const base = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry(); g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
    this.bPos = new THREE.InstancedBufferAttribute(F(3), 3); this.bData = new THREE.InstancedBufferAttribute(F(4), 4); this.bCol = new THREE.InstancedBufferAttribute(F(4), 4);
    for (const b of [this.bPos, this.bData, this.bCol]) b.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.bPos); g.setAttribute('iData', this.bData); g.setAttribute('iCol', this.bCol);
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: additive ? FRAG_B : FRAG_A, uniforms: { uMap: { value: atlas }, uFogC: { value: fog.color }, uFogD: { value: fog.density } }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.userData.noAO = true; this.mesh.renderOrder = additive ? 6 : 5; this.geo = g; scene.add(this.mesh);
  }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, frame, r, g, b, a, drag = 1, grav = 0, fadeIn = 0.08) {
    let i = this.n; if (i >= this.max) i = (Math.random() * this.max) | 0; else this.n++;
    const i3 = i * 3; this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z; this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.life[i] = 0; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.rot[i] = Math.random() * TAU; this.rv[i] = rand(-0.6, 0.6); this.frame[i] = frame;
    this.c[i3] = r; this.c[i3 + 1] = g; this.c[i3 + 2] = b; this.a[i] = a; this.drag[i] = drag; this.grav[i] = grav; this.fadeIn[i] = fadeIn;
  }
  update(dt) {
    const P = this.bPos.array, D = this.bData.array, C = this.bCol.array;
    for (let i = 0; i < this.n; i++) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) { // swap-remove
        const l = --this.n;
        if (i !== l) { for (const k of ['p', 'v', 'c']) { const A = this[k]; A[i * 3] = A[l * 3]; A[i * 3 + 1] = A[l * 3 + 1]; A[i * 3 + 2] = A[l * 3 + 2]; } for (const k of ['life', 'maxLife', 's0', 's1', 'rot', 'rv', 'frame', 'a', 'drag', 'grav', 'fadeIn']) this[k][i] = this[k][l]; }
        i--; continue;
      }
      const i3 = i * 3, k = this.life[i] / this.maxLife[i], dr = Math.exp(-this.drag[i] * dt);
      this.v[i3] *= dr; this.v[i3 + 1] = this.v[i3 + 1] * dr - this.grav[i] * dt; this.v[i3 + 2] *= dr;
      this.p[i3] += this.v[i3] * dt; this.p[i3 + 1] += this.v[i3 + 1] * dt; this.p[i3 + 2] += this.v[i3 + 2] * dt;
      if (this.grav[i] > 4 && this.p[i3 + 1] < 0.05) { this.p[i3 + 1] = 0.05; this.v[i3 + 1] *= -0.3; this.v[i3] *= 0.6; this.v[i3 + 2] *= 0.6; }
      this.rot[i] += this.rv[i] * dt;
      P[i3] = this.p[i3]; P[i3 + 1] = this.p[i3 + 1]; P[i3 + 2] = this.p[i3 + 2];
      const i4 = i * 4, e = 1 - (1 - k) * (1 - k);
      D[i4] = this.s0[i] + (this.s1[i] - this.s0[i]) * e; D[i4 + 1] = this.rot[i]; D[i4 + 2] = this.frame[i];
      C[i4] = this.c[i3]; C[i4 + 1] = this.c[i3 + 1]; C[i4 + 2] = this.c[i3 + 2];
      C[i4 + 3] = this.a[i] * Math.min(1, this.life[i] / this.fadeIn[i]) * (1 - k) * (1 - k * 0.5);
    }
    this.geo.instanceCount = this.n; this.bPos.needsUpdate = true; this.bData.needsUpdate = true; this.bCol.needsUpdate = true;
  }
}

const SMOKE = 0, FIRE = 1, GLOW = 2, CHIP = 3;

export class FX {
  constructor(scene) {
    const atlas = particleAtlas();
    this.A = new Layer(scene, 3500, false, atlas, scene.fog); this.B = new Layer(scene, 2500, true, atlas, scene.fog);
    this.light = new THREE.PointLight(0xffb060, 0, 60, 1.6); scene.add(this.light); this.lightT = 0;
    this.cam = new THREE.Vector3(); this.shake = 0;
  }
  update(dt, camPos) {
    this.cam.copy(camPos); this.A.update(dt); this.B.update(dt);
    if (this.lightT > 0) { this.lightT -= dt; this.light.intensity = Math.max(0, this.lightT) * this.lightK; }
    this.shake = Math.max(0, this.shake - dt * 2.4);
  }
  flash(x, y, z, power, color = 0xffb060) { this.light.position.set(x, y, z); this.light.color.set(color); this.lightK = power * 900; this.lightT = 0.12; this.light.intensity = this.lightK * 0.12; this.light.distance = 40 + power * 30; }
  addShake(x, y, z, k) { const d = this.cam.distanceTo(new THREE.Vector3(x, y, z)); this.shake = Math.min(1.2, this.shake + k / (1 + d * d * 0.004)); }

  smoke(x, y, z, n, o = {}) {
    const g = o.grey ?? 0.5;
    for (let i = 0; i < n; i++) { const s = o.spread ?? 1, k = g * rand(0.75, 1.15); this.A.spawn(x + rand(-s, s), y + rand(-s, s) * 0.5, z + rand(-s, s), (o.vx || 0) + rand(-1, 1) * (o.speed ?? 1.5), (o.vy ?? 1.6) + rand(0, 1.2), (o.vz || 0) + rand(-1, 1) * (o.speed ?? 1.5), (o.life ?? 3) * rand(0.7, 1.3), (o.size ?? 1.5) * rand(0.7, 1.2), (o.size ?? 1.5) * (o.grow ?? 3.2), SMOKE, k * (o.warm ? 1.08 : 1), k, k * (o.warm ? 0.9 : 1), o.alpha ?? 0.55, o.drag ?? 0.9, o.grav ?? -0.25, o.fadeIn ?? 0.15); }
  }
  sparks(x, y, z, n, dx = 0, dy = 1, dz = 0, speed = 14, col = [3.2, 1.9, 0.7]) {
    for (let i = 0; i < n; i++) this.B.spawn(x, y, z, dx * speed * rand(0.2, 1) + rand(-1, 1) * speed * 0.45, dy * speed * rand(0.2, 1) + rand(-0.3, 1) * speed * 0.45, dz * speed * rand(0.2, 1) + rand(-1, 1) * speed * 0.45, rand(0.25, 0.9), rand(0.09, 0.22), 0.02, GLOW, col[0], col[1], col[2], 1, 1.2, 16, 0.01);
  }
  fireball(x, y, z, size, n = 8) {
    for (let i = 0; i < n; i++) { const s = size * 0.45; this.B.spawn(x + rand(-s, s), y + rand(-s, s), z + rand(-s, s), rand(-1, 1) * size, rand(0.2, 1.6) * size, rand(-1, 1) * size, rand(0.25, 0.6), size * rand(0.5, 0.9), size * rand(1.5, 2.3), FIRE, 3.4, 1.5, 0.45, 0.95, 2.2, -1.5, 0.03); }
    this.B.spawn(x, y, z, 0, 0, 0, 0.14, size * 2.5, size * 5, GLOW, 2.6, 1.8, 1.0, 0.9, 0, 0, 0.01);
  }
  debris(x, y, z, n, speed = 8, grey = 0.3) {
    for (let i = 0; i < n; i++) { const k = grey * rand(0.6, 1.3); this.A.spawn(x, y, z, rand(-1, 1) * speed, rand(0.3, 1.2) * speed, rand(-1, 1) * speed, rand(0.8, 1.8), rand(0.08, 0.3), rand(0.06, 0.2), CHIP, k, k, k, 1, 0.4, 18, 0.01); }
  }

  // ---- recipes
  muzzle(pos, dir, big = 1) {
    const x = pos.x, y = pos.y, z = pos.z;
    for (let i = 0; i < 7; i++) { const t = i * 0.55; this.B.spawn(x + dir.x * t, y + dir.y * t, z + dir.z * t, dir.x * (22 - i * 2), dir.y * (22 - i * 2) + 0.5, dir.z * (22 - i * 2), 0.09 + i * 0.012, 0.9 + i * 0.25, 2.4 + i * 0.5, FIRE, 3.6, 2.0, 0.8, 1, 5, 0, 0.01); }
    this.B.spawn(x, y, z, 0, 0, 0, 0.1, 5, 9, GLOW, 2.4, 1.6, 0.9, 0.9, 0, 0, 0.01);
    // side blast + forward cloud
    for (let i = 0; i < 10; i++) { const a = rand(0, TAU), sx = Math.cos(a), sy = Math.sin(a) * 0.6, k = rand(0.45, 0.6); this.A.spawn(x + dir.x * 1.5, y, z + dir.z * 1.5, dir.x * rand(6, 22) + sx * 4, sy * 2.5 + 0.6, dir.z * rand(6, 22) + sx * 4, rand(0.9, 1.9), 1.2, rand(4, 7), SMOKE, k * 1.05, k, k * 0.92, 0.26, 2.6, -0.5, 0.05); }
    // dust ring kicked off the road under the muzzle
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; this.A.spawn(x + dir.x * 2, 0.3, z + dir.z * 2, Math.cos(a) * rand(5, 9), 0.5, Math.sin(a) * rand(5, 9), rand(1.5, 2.6), 1.0, rand(3.5, 6), SMOKE, 0.56, 0.5, 0.42, 0.33, 2.4, -0.15, 0.1); }
    this.flash(x + dir.x * 2, y + 0.5, z + dir.z * 2, 1.2 * big); this.addShake(x, y, z, 0.5);
  }
  impactGround(p, he) {
    this.smoke(p.x, p.y + 0.3, p.z, he ? 10 : 6, { grey: 0.42, warm: true, size: he ? 2 : 1.2, speed: he ? 5 : 3, vy: 3, life: 2.4 });
    this.debris(p.x, p.y + 0.2, p.z, he ? 16 : 8, he ? 11 : 7, 0.22); this.sparks(p.x, p.y + 0.1, p.z, he ? 10 : 5, 0, 1, 0, 9);
    if (he) { this.fireball(p.x, p.y + 0.8, p.z, 1.9); this.flash(p.x, p.y + 1, p.z, 1.3); this.addShake(p.x, p.y, p.z, 0.6); }
  }
  impactWall(p, n, he) {
    const x = p.x + n.x * 0.3, y = p.y, z = p.z + n.z * 0.3;
    this.smoke(x, y, z, he ? 12 : 8, { grey: 0.6, size: he ? 2 : 1.3, speed: he ? 4 : 2.5, vx: n.x * 4, vz: n.z * 4, vy: 0.6, life: 2.8 });
    this.debris(x, y, z, he ? 22 : 12, he ? 10 : 7, 0.45); this.sparks(x, y, z, he ? 12 : 8, n.x, 0.3, n.z, 12);
    // shattered glass glitter
    for (let i = 0; i < 10; i++) this.B.spawn(x, y, z, n.x * rand(2, 9) + rand(-3, 3), rand(-1, 4), n.z * rand(2, 9) + rand(-3, 3), rand(0.5, 1.2), 0.07, 0.03, GLOW, 1.2, 1.5, 1.8, 0.9, 0.5, 14, 0.01);
    if (he) { this.fireball(x, y, z, 2); this.flash(x, y, z, 1.3); this.addShake(x, y, z, 0.6); }
  }
  // shell meeting armour: kind = pen | nopen | ricochet | he | track | barrel
  impactTank(p, n, dir, kind, type) {
    const x = p.x, y = p.y, z = p.z;
    if (kind === 'ricochet') { const d = dir.clone().reflect(n).normalize(); this.sparks(x, y, z, 26, d.x, d.y, d.z, 26); this.B.spawn(x, y, z, 0, 0, 0, 0.1, 1.2, 2.4, GLOW, 3, 2.2, 1.2, 1, 0, 0, 0.01); }
    else if (kind === 'nopen' || kind === 'barrel' || kind === 'track') { this.sparks(x, y, z, 30, n.x, n.y + 0.3, n.z, 17); this.smoke(x, y, z, 3, { grey: 0.3, size: 0.7, speed: 1.5, life: 1.2 }); this.B.spawn(x, y, z, 0, 0, 0, 0.12, 1.5, 3, GLOW, 3, 2, 1, 1, 0, 0, 0.01); if (type === 'heat') this.fireball(x, y, z, 1.1, 5); }
    else if (kind === 'he') { this.fireball(x, y, z, 2.2); this.smoke(x, y, z, 8, { grey: 0.35, size: 1.6, speed: 4, life: 2.6 }); this.debris(x, y, z, 14, 10, 0.2); this.addShake(x, y, z, 0.7); }
    else { this.sparks(x, y, z, 40, n.x, n.y + 0.2, n.z, 20); this.fireball(x, y, z, 1.2, 6); this.smoke(x, y, z, 6, { grey: 0.22, size: 1, speed: 2.5, life: 2.2 }); this.debris(x, y, z, 8, 8, 0.15); }
    this.flash(x, y + 0.3, z, kind === 'pen' || kind === 'he' ? 1.0 : 0.6, 0xffc080);
  }
  explosion(x, y, z, size = 1) {
    this.fireball(x, y, z, 2.6 * size, 14); this.fireball(x, y + 1.5 * size, z, 2 * size, 8);
    this.smoke(x, y + 1, z, 18, { grey: 0.16, size: 2.4 * size, grow: 4, speed: 5 * size, vy: 5, life: 5.5, alpha: 0.8 });
    this.debris(x, y + 0.5, z, 36, 15 * size, 0.14); this.sparks(x, y + 0.5, z, 60, 0, 1, 0, 24);
    this.flash(x, y + 2, z, 2.6 * size, 0xff9040); this.addShake(x, y, z, 1.4 * size);
  }
  blowout(x, y, z) { // ammunition venting through blow-off panels: a tall jet of flame
    for (let i = 0; i < 16; i++) this.B.spawn(x + rand(-0.4, 0.4), y, z + rand(-0.4, 0.4), rand(-1, 1), rand(9, 20), rand(-1, 1), rand(0.4, 0.9), 0.9, rand(2, 3.4), FIRE, 3.6, 1.7, 0.5, 1, 1.4, 0, 0.02);
    this.sparks(x, y, z, 30, 0, 1, 0, 22); this.flash(x, y + 2, z, 1.6, 0xff9040);
  }
  crush(x, y, z, kind) {
    if (kind === 'tree') { for (let i = 0; i < 10; i++) this.A.spawn(x + rand(-1, 1), y + rand(2, 5), z + rand(-1, 1), rand(-3, 3), rand(0, 3), rand(-3, 3), rand(0.8, 1.6), rand(0.1, 0.25), 0.08, CHIP, 0.16, 0.3, 0.1, 1, 0.8, 9, 0.01); }
    else if (kind === 'car' || kind === 'bus') { this.sparks(x, y + 0.6, z, 14, 0, 1, 0, 7); this.debris(x, y + 0.6, z, 10, 5, 0.3); for (let i = 0; i < 8; i++) this.B.spawn(x + rand(-1, 1), y + 1, z + rand(-1, 1), rand(-4, 4), rand(1, 5), rand(-4, 4), rand(0.5, 1.1), 0.07, 0.03, GLOW, 1.2, 1.5, 1.8, 0.9, 0.5, 14, 0.01); }
    else if (kind === 'sandbag' || kind === 'barrier') { this.smoke(x, y + 0.5, z, 5, { grey: 0.55, warm: true, size: 1, speed: 2, life: 1.8, alpha: 0.4 }); this.debris(x, y + 0.5, z, 8, 5, 0.4); }
    else this.sparks(x, y + 0.5, z, 6, 0, 1, 0, 5);
  }
  trackDust(t, dt) {
    const sp = Math.abs(t.speed) + Math.abs(t.yawRate) * 3; if (sp < 1.5) return;
    t.dustT -= dt * Math.min(sp, 14); if (t.dustT > 0) return; t.dustT = 1.6;
    const g = t.def.geo, fx = Math.sin(t.heading), fz = Math.cos(t.heading), s = Math.sign(t.speed) || 1, back = -s * (g.L / 2 - 0.3);
    for (const side of [1, -1]) { const x = t.x + fx * back + fz * side * (g.W / 2 - 0.3), z = t.z + fz * back - fx * side * (g.W / 2 - 0.3); this.A.spawn(x, t.y + 0.25, z, -fx * s * 1.5 + rand(-0.6, 0.6), rand(0.4, 1.2), -fz * s * 1.5 + rand(-0.6, 0.6), rand(1.2, 2.2), 0.7, rand(2.2, 3.6), SMOKE, 0.52, 0.47, 0.4, 0.2, 1.2, -0.1, 0.2); }
    if (t.engineK() < 1 && Math.random() < 0.5) this.A.spawn(t.x - fx * g.L * 0.4, t.y + 1.4, t.z - fz * g.L * 0.4, rand(-0.5, 0.5), 2, rand(-0.5, 0.5), 2, 0.6, 2.4, SMOKE, 0.12, 0.12, 0.12, 0.6, 0.6, -0.4, 0.2);
  }
  exhaust(t) { const g = t.def.geo, fx = Math.sin(t.heading), fz = Math.cos(t.heading); this.A.spawn(t.x - fx * g.L * 0.48, t.y + 1.2, t.z - fz * g.L * 0.48, -fx * 2 + rand(-0.5, 0.5), 1.4, -fz * 2 + rand(-0.5, 0.5), 1.4, 0.5, 2.2, SMOKE, 0.2, 0.2, 0.2, 0.4, 1, -0.5, 0.15); }
  burning(x, y, z, size = 1, heavy = true) {
    this.B.spawn(x + rand(-0.7, 0.7) * size, y + rand(0, 0.5), z + rand(-0.7, 0.7) * size, rand(-0.4, 0.4), rand(1.6, 3.4) * size, rand(-0.4, 0.4), rand(0.4, 0.8), 0.9 * size, rand(1.5, 2.4) * size, FIRE, 3.2, 1.35, 0.4, 0.9, 0.6, 0, 0.08);
    if (heavy) { const k = rand(0.07, 0.16); this.A.spawn(x + rand(-0.5, 0.5), y + 1.2 * size, z + rand(-0.5, 0.5), rand(-0.4, 0.4) + 1.2, rand(2.6, 4.2), rand(-0.4, 0.4) - 0.5, rand(5, 8), 1.3 * size, rand(6, 9) * size, SMOKE, k, k, k, 0.7, 0.12, -0.2, 0.5); }
    if (Math.random() < 0.15) this.sparks(x, y + 1, z, 2, 0, 1, 0, 6);
  }
  plume(x, y, z, size) { const k = rand(0.1, 0.18); this.A.spawn(x + rand(-4, 4), y, z + rand(-4, 4), 3 + rand(-1, 1), rand(4, 7), -1.5 + rand(-1, 1), rand(14, 20), 14 * size, 60 * size, SMOKE, k, k, k * 1.05, 0.55, 0.03, -0.1, 2); }
}
