import * as THREE from 'three';
import { TANKS } from '../src/data/tanks.js';
import { solidsFor } from '../src/tank/geom.js';
import { traceTank, resolveImpact, previewShot } from '../src/combat/damage.js';
function fake(def) {
  const g = def.geo, t = { def, solids: solidsFor(def), x: 0, y: 0, z: 0, alive: true };
  t.mods = def.modules.map((d) => ({ d, hp: d.hpMax })); t.ext = { trackL: { hp: 200, hpMax: 200 }, trackR: { hp: 200, hpMax: 200 }, barrel: { hp: 170, hpMax: 170 } };
  t.hullMat = new THREE.Matrix4(); t.invHull = new THREE.Matrix4();
  t.turretMat = new THREE.Matrix4().makeTranslation(0, g.hullH, g.turret.z); t.invTurret = t.turretMat.clone().invert();
  t.invGun = new THREE.Matrix4().makeTranslation(0, g.hullH + g.gun.y, g.turret.z + g.gun.z).invert();
  t.crewAlive = () => t.mods.filter((m) => m.d.kind === 'crew' && m.hp > 0).length;
  t.onCrewDown = () => {}; t.onBlowout = () => { t.blow = true; }; t.ignite = () => { t.fire = true; }; t.destroy = (r) => { t.alive = false; t.reason = r; };
  return t;
}
const shooter = TANKS.find((t) => t.id === 'ztz99a').shells;
const cases = { 'front UFP': [[0.3, 1.05, 30], [0, 0, -1]], 'front LFP': [[0.3, 0.62, 30], [0, 0, -1]], 'front cheek': [[0.9, 1.6, 30], [0, 0, -1]], 'front mantlet': [[0.2, 0, 30], [0, 0, -1], 'gun'], 'side hull': [[30, 0.8, -0.5], [-1, 0, 0]], 'side turret': [[30, 1.6, 0], [-1, 0, 0]], 'rear': [[0, 0.9, -30], [0, 0, 1]], '30deg front LFP': [[15, 0.62, 26], [-0.5, 0, -0.866]] };
for (const def of TANKS) {
  console.log('\n== ' + def.name, 'rating', JSON.stringify(def.rating));
  for (const [name, [o, d, flag]] of Object.entries(cases)) {
    const oo = new THREE.Vector3(...o); if (flag === 'gun') oo.y = def.geo.hullH + def.geo.gun.y + 0.2; else if (name.includes('cheek') || name === 'side turret') oo.y = def.geo.hullH + def.geo.turret.h * 0.5; else if (name.includes('UFP')) oo.y = (def.geo.hullH + def.geo.noseY) / 2; else if (name.includes('LFP')) oo.y = (def.geo.noseY + def.geo.belly) / 2;
    if (name === 'front cheek') oo.x = def.geo.turret.prof[1][1] * 0.7;
    const dd = new THREE.Vector3(...d).normalize();
    let line = name.padEnd(18);
    for (const sh of shooter.slice(0, 2)) {
      let kills = 0, pens = 0, kinds = {}, zone, eff;
      for (let i = 0; i < 200; i++) { const t = fake(def), hits = traceTank(t, oo, dd, 100); if (!hits) { kinds.miss = 1; continue; } const r = resolveImpact(t, sh, hits, 30); kinds[r.kind] = (kinds[r.kind] || 0) + 1; zone = r.zone; eff = r.eff; if (r.kind === 'pen') pens++; if (r.killed) kills++; }
      line += ` | ${sh.type} ${String(zone).padEnd(7)} eff ${String(Math.round(eff)).padStart(5)} pen% ${String(pens / 2).padStart(5)} kill% ${String(kills / 2).padStart(5)}`;
    }
    console.log(line);
  }
}
