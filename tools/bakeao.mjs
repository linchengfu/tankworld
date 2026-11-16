// Bakes ambient occlusion for every tank: each vertex of the hull, turret and gun casts a cosine-weighted fan of
// short rays against the whole vehicle (plus the ground and the track runs) and stores how much of its sky is blocked.
// Output: src/tank/ao.gen.js. Run with `npm run bake` whenever src/tank/{vehicles,parts,geom}.js or the tank sizes change.
import { writeFileSync } from 'node:fs';
import { TANKS } from '../src/data/tanks.js';
import { tankBuilders } from '../src/tank/model.js';
import { SHAPES } from '../src/tank/vehicles.js';
import { trackPath } from '../src/tank/parts.js';

const CELL = 0.2, MAXD = 0.75, RAYS = 18, STRENGTH = 0.92;
// fixed cosine-weighted directions in a +z hemisphere
const DIRS = []; for (let i = 0; i < RAYS; i++) { const u = (i + 0.5) / RAYS, v = (i * 0.61803398875) % 1, r = Math.sqrt(u), a = v * Math.PI * 2; DIRS.push([r * Math.cos(a), r * Math.sin(a), Math.sqrt(1 - u)]); }

function bake(def) {
  const { H, T, G } = tankBuilders(def), g = def.geo, S = SHAPES[def.id];
  const parts = [[H, 0, 0, 0], [T, 0, g.hullH, g.turret.z], [G, 0, g.hullH + g.gun.y, g.turret.z + g.gun.z]];
  // all triangles in hull space
  const tri = [];
  for (const [B, ox, oy, oz] of parts) { const P = B.pos; for (let i = 0; i < P.length; i += 9) tri.push([P[i] + ox, P[i + 1] + oy, P[i + 2] + oz, P[i + 3] + ox, P[i + 4] + oy, P[i + 5] + oz, P[i + 6] + ox, P[i + 7] + oy, P[i + 8] + oz]); }
  // the track runs as slabs (two triangles per face is overkill: one box per side from the path's bounds, top and inner faces)
  const tp = trackPath(S.gear), zs = tp.map((p) => p[0]), ys = tp.map((p) => p[1]), z0 = Math.min(...zs), z1 = Math.max(...zs), yT = Math.max(...ys);
  for (const s of [1, -1]) { const xa = s * (g.W / 2 - g.trackW), xb = s * (g.W / 2); tri.push([xa, yT, z0, xb, yT, z0, xb, yT, z1], [xa, yT, z0, xb, yT, z1, xa, yT, z1], [xa, 0, z0, xa, yT, z0, xa, yT, z1], [xa, 0, z0, xa, yT, z1, xa, 0, z1]); }
  // uniform grid
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const t of tri) for (let k = 0; k < 9; k++) { mn[k % 3] = Math.min(mn[k % 3], t[k]); mx[k % 3] = Math.max(mx[k % 3], t[k]); }
  mn = mn.map((v) => v - 0.01); const nx = Math.ceil((mx[0] - mn[0]) / CELL) + 1, ny = Math.ceil((mx[1] - mn[1]) / CELL) + 1, nz = Math.ceil((mx[2] - mn[2]) / CELL) + 1, cells = new Map();
  const key = (i, j, k) => (i * ny + j) * nz + k;
  tri.forEach((t, id) => {
    const lo = [0, 1, 2].map((a) => Math.floor((Math.min(t[a], t[a + 3], t[a + 6]) - mn[a]) / CELL)), hi = [0, 1, 2].map((a) => Math.floor((Math.max(t[a], t[a + 3], t[a + 6]) - mn[a]) / CELL));
    for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) { const q = key(i, j, k); let c = cells.get(q); if (!c) cells.set(q, (c = [])); c.push(id); }
  });
  const stamp = new Int32Array(tri.length).fill(-1); let rayId = 0;
  function cast(ox, oy, oz, dx, dy, dz) {
    let best = MAXD; rayId++;
    if (dy < -1e-4) { const tg = -oy / dy; if (tg > 0 && tg < best) best = tg; }                                      // the ground
    for (let s = 0; s <= MAXD; s += CELL * 0.5) {
      if (s > best) break;
      const c = cells.get(key(Math.floor((ox + dx * s - mn[0]) / CELL), Math.floor((oy + dy * s - mn[1]) / CELL), Math.floor((oz + dz * s - mn[2]) / CELL))); if (!c) continue;
      for (const id of c) {
        if (stamp[id] === rayId) continue; stamp[id] = rayId; const t = tri[id];
        const e1x = t[3] - t[0], e1y = t[4] - t[1], e1z = t[5] - t[2], e2x = t[6] - t[0], e2y = t[7] - t[1], e2z = t[8] - t[2];
        const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz; if (det > -1e-9 && det < 1e-9) continue;
        const inv = 1 / det, tx = ox - t[0], ty = oy - t[1], tz = oz - t[2], u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (dx * qx + dy * qy + dz * qz) * inv; if (v < 0 || u + v > 1) continue;
        const d = (e2x * qx + e2y * qy + e2z * qz) * inv; if (d > 0.004 && d < best) best = d;
      }
    }
    return best;
  }
  const out = {}, names = ['hull', 'turret', 'gun'];
  parts.forEach(([B, ox, oy, oz], pi) => {
    const P = B.pos, N = B.nor, n = P.length / 3, ao = new Uint8Array(n), memo = new Map();
    for (let i = 0; i < n; i++) {
      const x = P[i * 3] + ox, y = P[i * 3 + 1] + oy, z = P[i * 3 + 2] + oz, nx_ = N[i * 3], ny_ = N[i * 3 + 1], nz_ = N[i * 3 + 2];
      const k = `${Math.round(x * 500)},${Math.round(y * 500)},${Math.round(z * 500)},${Math.round(nx_ * 20)},${Math.round(ny_ * 20)},${Math.round(nz_ * 20)}`;
      let val = memo.get(k);
      if (val === undefined) {
        // tangent frame
        let tx = Math.abs(nx_) > 0.9 ? 0 : 1, ty = Math.abs(nx_) > 0.9 ? 1 : 0, tz = 0; const d = tx * nx_ + ty * ny_; tx -= nx_ * d; ty -= ny_ * d; tz -= nz_ * d; const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
        const bx = ny_ * tz - nz_ * ty, by = nz_ * tx - nx_ * tz, bz = nx_ * ty - ny_ * tx; let occ = 0;
        for (const [a, b, c] of DIRS) { const dx = tx * a + bx * b + nx_ * c, dy = ty * a + by * b + ny_ * c, dz = tz * a + bz * b + nz_ * c, hit = cast(x + nx_ * 0.012, y + ny_ * 0.012, z + nz_ * 0.012, dx, dy, dz); if (hit < MAXD) occ += 1 - hit / MAXD; }
        val = Math.round(255 * Math.max(0.22, 1 - (occ / RAYS) * STRENGTH * 1.6)); memo.set(k, val);
      }
      ao[i] = val;
    }
    out[names[pi]] = Buffer.from(ao).toString('base64');
  });
  return out;
}
const t0 = Date.now(), all = {};
for (const def of TANKS) { all[def.id] = bake(def); console.log(def.id, 'baked', Object.values(all[def.id]).map((s) => Math.round(s.length * 0.75)).join(' / '), 'vertices'); }
writeFileSync(new URL('../src/tank/ao.gen.js', import.meta.url), '// Generated by tools/bakeao.mjs — baked ambient occlusion per vertex (base64 bytes). Do not edit.\nexport const AO = ' + JSON.stringify(all) + ';\n');
console.log('done in', ((Date.now() - t0) / 1000).toFixed(1) + ' s');
